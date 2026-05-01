
ALTER TABLE activity ADD COLUMN max_participants INT NULL COMMENT '最大参与人数，NULL表示无限制' AFTER location;

ALTER TABLE activity_participants ADD COLUMN enroll_status INT DEFAULT 1 COMMENT '报名状态：1-已报名 2-候补' AFTER phone;

-- 用户信息字段（从用户资料获取）
ALTER TABLE activity_participants ADD COLUMN sex VARCHAR(2) NULL COMMENT '性别：M-男 F-女' AFTER identity_number;
ALTER TABLE activity_participants ADD COLUMN age INT NULL COMMENT '年龄' AFTER sex;
ALTER TABLE activity_participants ADD COLUMN occupation VARCHAR(100) NULL COMMENT '职业' AFTER age;
ALTER TABLE activity_participants ADD COLUMN email VARCHAR(255) NULL COMMENT '邮箱' AFTER occupation;
ALTER TABLE activity_participants ADD COLUMN industry VARCHAR(100) NULL COMMENT '行业' AFTER email;
ALTER TABLE activity_participants ADD COLUMN identity_type VARCHAR(20) NULL COMMENT '证件类型：mainland/hongkong/taiwan/foreign' AFTER industry;

-- 问卷字段
ALTER TABLE activity_participants ADD COLUMN why_join VARCHAR(500) NULL COMMENT '为什么要参与' AFTER identity_type;
ALTER TABLE activity_participants ADD COLUMN channel VARCHAR(255) NULL COMMENT '了解此活动的渠道/推荐人' AFTER why_join;
ALTER TABLE activity_participants ADD COLUMN expectation VARCHAR(500) NULL COMMENT '学习期望' AFTER channel;
ALTER TABLE activity_participants ADD COLUMN activity_understanding VARCHAR(255) NULL COMMENT '对活动的了解（一句话描述）' AFTER expectation;
ALTER TABLE activity_participants ADD COLUMN has_questions VARCHAR(500) NULL COMMENT '是否有问题' AFTER activity_understanding;

-- ============================================================
-- RBAC 数据迁移：从旧权限系统迁移到 RBAC
-- ============================================================

-- 将超级管理员迁移到 user_role
INSERT INTO `user_role` (`user_id`, `role_id`, `tenant_id`, `scope_type`, `scope_id`)
SELECT au.user_id, 1, au.tenant_id, NULL, NULL
FROM `admin_user` au
WHERE au.user_id IS NOT NULL
ON DUPLICATE KEY UPDATE user_id=user_id;

-- 删除旧的权限表
DROP TABLE IF EXISTS `admin_activity_type_role`;

-- 支付订单表新增报名信息快照字段
ALTER TABLE payment_order ADD COLUMN participant_snapshot TEXT NULL COMMENT '报名信息快照(JSON)' AFTER phone;


ALTER TABLE user_role ADD COLUMN update_time  datetime NULL COMMENT '更新时间'  ;

ALTER TABLE permission ADD COLUMN update_time  datetime NULL COMMENT '更新时间'  ;


ALTER TABLE role_permission ADD COLUMN update_time  datetime NULL COMMENT '更新时间'  ;

-- admin_user 表新增是否需要改密标志
ALTER TABLE admin_user ADD COLUMN must_reset_password INT NOT NULL DEFAULT 1 COMMENT '1=需要改密，0=已改密' AFTER password_hash;

-- ============================================================
-- Phase 1 数据迁移：填充 user_credential 表
-- ============================================================

-- 从 admin_user 迁移密码凭证
INSERT INTO `user_credential` (`user_id`, `tenant_id`, `credential_type`, `identifier`, `credential_hash`, `must_reset_password`, `status`)
SELECT
  au.user_id,
  au.tenant_id,
  'password',
  au.username,
  au.password_hash,
  au.must_reset_password,
  1
FROM `admin_user` au
WHERE au.user_id IS NOT NULL
  AND au.password_hash IS NOT NULL
  AND au.password_hash != ''
ON DUPLICATE KEY UPDATE
  credential_hash = VALUES(credential_hash),
  must_reset_password = VALUES(must_reset_password);

-- 从 user 表迁移用户密码凭证（user-login 使用 phone+password）
INSERT INTO `user_credential` (`user_id`, `tenant_id`, `credential_type`, `identifier`, `credential_hash`, `must_reset_password`, `status`)
SELECT
  u.id,
  u.tenant_id,
  'password',
  u.phone,
  u.password_hash,
  0,
  1
FROM `user` u
WHERE u.phone IS NOT NULL
  AND u.password_hash IS NOT NULL
  AND u.password_hash != ''
ON DUPLICATE KEY UPDATE
  credential_hash = VALUES(credential_hash);

-- 从 user 表迁移微信凭证
INSERT INTO `user_credential` (`user_id`, `tenant_id`, `credential_type`, `identifier`, `credential_hash`, `must_reset_password`, `status`)
SELECT
  u.id,
  u.tenant_id,
  'wechat',
  u.wx_openid,
  NULL,
  0,
  1
FROM `user` u
WHERE u.wx_openid IS NOT NULL
  AND u.wx_openid != ''
ON DUPLICATE KEY UPDATE
  user_id = VALUES(user_id);

-- 从 user 表迁移手机号凭证（phone-login 使用手机号授权）
INSERT INTO `user_credential` (`user_id`, `tenant_id`, `credential_type`, `identifier`, `credential_hash`, `must_reset_password`, `status`)
SELECT
  u.id,
  u.tenant_id,
  'phone_code',
  u.phone,
  NULL,
  0,
  1
FROM `user` u
WHERE u.phone IS NOT NULL
  AND u.phone != ''
ON DUPLICATE KEY UPDATE
  user_id = VALUES(user_id);

-- ============================================================
-- Phase 2 数据迁移
-- ============================================================

-- 填充 user_tenant 关联表（从现有 user 表）
INSERT INTO `user_tenant` (`user_id`, `tenant_id`, `status`)
SELECT id, tenant_id, 1 FROM `user` WHERE tenant_id > 0
ON DUPLICATE KEY UPDATE status = 1;

-- 将 platform_admin 迁移为 user + user_credential + user_role
-- 注意：需要逐条执行或用存储过程，这里提供迁移思路
-- 实际迁移由后端脚本完成（因为需要生成 user.id 后再关联）