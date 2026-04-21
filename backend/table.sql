-- ============================================================
-- SDM System 数据库表结构（唯一 SQL 入口）
-- ============================================================

-- 
-- 1. 租户表
-- 
CREATE TABLE IF NOT EXISTS `tenant` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '租户名称',
  `code` varchar(32) NOT NULL COMMENT '租户编码',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态：1-正常 0-禁用',
  `plan` varchar(32) DEFAULT 'basic' COMMENT '套餐',
  `max_admins` int DEFAULT 5 COMMENT '最大管理员数',
  `max_activities` int DEFAULT 100 COMMENT '最大活动数',
  `expire_at` datetime DEFAULT NULL COMMENT '服务到期时间',
  `contact_name` varchar(64) DEFAULT NULL COMMENT '联系人',
  `contact_phone` varchar(32) DEFAULT NULL COMMENT '联系电话',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='租户表';

-- 默认租户
INSERT INTO `tenant` (`id`, `name`, `code`, `status`, `plan`)
VALUES (1, '默认租户', 'default', 1, 'enterprise')
ON DUPLICATE KEY UPDATE `name` = '默认租户';

-- 
-- 2. 活动类型表
-- 
CREATE TABLE IF NOT EXISTS `activity_type` (
  `id` int NOT NULL AUTO_INCREMENT,
    `tenant_id` int NOT NULL COMMENT '租户ID',
  `type_name` varchar(64) NOT NULL COMMENT '类型名称，如：参、健康锻炼',
  `code` varchar(32) DEFAULT NULL COMMENT '可选编码',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_type_name` (`tenant_id`, `type_name`),
  KEY `idx_activity_type_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动类型表';

-- 
-- 3. 用户表
-- 
CREATE TABLE IF NOT EXISTS `user` (
  `id` int NOT NULL AUTO_INCREMENT,
    `tenant_id` int NOT NULL COMMENT '租户ID',
  `name` varchar(255) DEFAULT NULL COMMENT '姓名',
  `identity_number` varchar(255) DEFAULT NULL COMMENT '身份证号',
  `identity_type` varchar(20) DEFAULT NULL COMMENT '身份证类型：mainland-大陆, hongkong-香港, taiwan-台湾, foreign-国外',
  `phone` varchar(255) DEFAULT NULL COMMENT '手机号',
  `email` varchar(255) DEFAULT NULL COMMENT '邮箱',
  `password_hash` varchar(255) DEFAULT NULL COMMENT '用户密码哈希',
  `sex` varchar(10) DEFAULT NULL COMMENT '性别',
  `age` int DEFAULT NULL COMMENT '年龄',
  `occupation` varchar(100) DEFAULT NULL COMMENT '职业',
  `industry` varchar(100) DEFAULT NULL COMMENT '行业',
  `isblock` tinyint DEFAULT 0 COMMENT '0-正常 1-拉黑',
  `block_reason` varchar(255) DEFAULT NULL COMMENT '拉黑原因',
  `wx_openid` varchar(64) DEFAULT NULL COMMENT '微信小程序 openid',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_phone` (`tenant_id`, `phone`),
  UNIQUE KEY `uk_tenant_wx_openid` (`tenant_id`, `wx_openid`),
  KEY `idx_user_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 
-- 4. 管理员认证表（仅用于登录）
-- 
CREATE TABLE IF NOT EXISTS `admin_user` (
  `id` int NOT NULL AUTO_INCREMENT,
    `tenant_id` int NOT NULL COMMENT '租户ID',
  `user_id` int NOT NULL COMMENT '关联 user.id',
  `username` varchar(64) NOT NULL COMMENT '管理员用户名',
  `password_hash` varchar(255) NOT NULL COMMENT '密码哈希',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_username` (`tenant_id`, `username`),
  KEY `idx_admin_tenant_id` (`tenant_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员认证表';

-- 
-- 5. 平台管理员认证表（跨租户运营后台）
-- 
CREATE TABLE IF NOT EXISTS `platform_admin` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL COMMENT '平台管理员用户名',
  `password_hash` varchar(255) NOT NULL COMMENT '密码哈希',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态：1-正常 0-禁用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_platform_admin_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='平台管理员认证表';

-- 
-- 6. 活动表
-- 
CREATE TABLE IF NOT EXISTS `activity` (
  `id` int NOT NULL AUTO_INCREMENT,
    `tenant_id` int NOT NULL COMMENT '租户ID',
  `activity_name` varchar(100) DEFAULT NULL COMMENT '活动名称',
  `activity_type_id` int DEFAULT NULL COMMENT '归属活动类型',
  `start_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '活动开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '活动结束时间',
  `status` tinyint DEFAULT 1 COMMENT '活动状态：1-未开始，2-进行中，3-已结束',
  `tag` varchar(255) DEFAULT NULL COMMENT '标签',
  `suggested_fee` int DEFAULT 0 COMMENT '建议费用（分），0 表示免费',
  `require_payment` int DEFAULT 0 COMMENT '是否需要支付：0-否 1-是',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_tenant_id` (`tenant_id`),
  KEY `idx_tenant_status` (`tenant_id`, `status`),
  KEY `idx_activity_type_id` (`activity_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动表';


-- 添加海报URL字段
ALTER TABLE activity ADD COLUMN poster_url VARCHAR(500) NULL COMMENT '活动海报图片URL' AFTER require_payment;

-- 添加地点字段
ALTER TABLE activity ADD COLUMN location VARCHAR(255) NULL COMMENT '活动地点（为空表示线上活动）' AFTER poster_url;

-- 添加报名限额字段
ALTER TABLE activity ADD COLUMN max_participants INT NULL COMMENT '最大参与人数，NULL表示无限制' AFTER location;

-- 
-- 6. 活动参与人表
-- 
CREATE TABLE IF NOT EXISTS `activity_participants` (
  `id` int NOT NULL AUTO_INCREMENT,
    `tenant_id` int NOT NULL COMMENT '租户ID',
  `activity_id` int NOT NULL COMMENT '活动ID',
  `user_id` int DEFAULT NULL COMMENT '用户ID',
  `participant_name` varchar(255) NOT NULL COMMENT '参与人姓名',
  `phone` varchar(255) DEFAULT NULL COMMENT '手机号',
  `identity_number` varchar(255) DEFAULT NULL COMMENT '身份证号',
  `payment_status` int DEFAULT 0 COMMENT '支付状态：0-无需支付 1-待支付 2-已支付',
  `payment_order_id` int DEFAULT NULL COMMENT '支付订单ID',
  `paid_amount` int DEFAULT 0 COMMENT '实际支付金额（分）',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_participant_unique` (`activity_id`, `identity_number`, `tenant_id`),
  UNIQUE KEY `uk_participant_user_unique` (`activity_id`, `user_id`, `tenant_id`),
  KEY `idx_participants_tenant_id` (`tenant_id`),
  KEY `idx_tenant_activity` (`tenant_id`, `activity_id`),
  KEY `idx_participant_activity_id` (`activity_id`),
  KEY `idx_participant_identity` (`identity_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动参与人表';

-- 
-- 7. 签到记录表
-- 
CREATE TABLE IF NOT EXISTS `checkin_records` (
  `id` int NOT NULL AUTO_INCREMENT,
    `tenant_id` int NOT NULL COMMENT '租户ID',
  `activity_id` int NOT NULL COMMENT '活动ID',
  `user_id` int DEFAULT NULL COMMENT '用户ID',
  `name` varchar(100) NOT NULL COMMENT '签到人姓名',
  `phone` varchar(255) DEFAULT NULL COMMENT '手机号',
  `identity_number` varchar(255) DEFAULT NULL COMMENT '身份证号',
  `checkin_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '签到时间',
  `has_attend` tinyint DEFAULT 0 COMMENT '是否参与：1-是 0-否',
  `note` varchar(255) DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_checkin_unique` (`activity_id`, `identity_number`, `tenant_id`),
  KEY `idx_checkin_tenant_id` (`tenant_id`),
  KEY `idx_tenant_activity` (`tenant_id`, `activity_id`),
  KEY `idx_checkin_activity_id` (`activity_id`),
  KEY `idx_checkin_identity` (`identity_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='签到记录表';

-- 
-- 8. 支付订单表
-- 
CREATE TABLE IF NOT EXISTS `payment_order` (
  `id` int NOT NULL AUTO_INCREMENT,
    `tenant_id` int NOT NULL COMMENT '租户ID',
  `order_no` varchar(64) NOT NULL COMMENT '商户订单号',
  `transaction_id` varchar(64) DEFAULT NULL COMMENT '微信交易号',
  `activity_id` int NOT NULL COMMENT '活动ID',
  `user_id` int DEFAULT NULL COMMENT '用户ID',
  `participant_id` int DEFAULT NULL COMMENT '参与者ID',
  `participant_name` varchar(255) DEFAULT NULL COMMENT '报名人姓名',
  `phone` varchar(255) DEFAULT NULL COMMENT '报名人手机号',
  `participant_snapshot` text DEFAULT NULL COMMENT '报名信息快照(JSON)',
  `suggested_fee` int NOT NULL COMMENT '建议费用（分）',
  `actual_fee` int NOT NULL COMMENT '实际支付金额（分）',
  `status` int DEFAULT 0 COMMENT '订单状态：0-待支付 1-成功 2-失败 3-关闭',
  `openid` varchar(64) DEFAULT NULL COMMENT '付款用户 openid',
  `prepay_id` varchar(128) DEFAULT NULL COMMENT '预支付ID',
  `paid_at` datetime DEFAULT NULL COMMENT '支付成功时间',
  `expire_at` datetime NOT NULL COMMENT '过期时间',
  `callback_raw` varchar(2000) DEFAULT NULL COMMENT '回调原始数据',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_transaction_id` (`transaction_id`),
  KEY `idx_activity_id` (`activity_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_participant_id` (`participant_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付订单表';

-- 报名状态字段（支持候补）
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

-- 10. RBAC 权限表

CREATE TABLE IF NOT EXISTS `permission` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '权限代码，如 activity.create',
  `name` varchar(100) NOT NULL COMMENT '权限名称',
  `resource` varchar(32) NOT NULL COMMENT '资源类型：activity, user, participant',
  `action` varchar(32) NOT NULL COMMENT '操作：create, edit, delete, view',
  `description` text COMMENT '权限描述',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permission_code` (`code`),
  KEY `idx_resource` (`resource`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限表';


-- 11. RBAC 角色表

CREATE TABLE IF NOT EXISTS `role` (
  `id` int NOT NULL AUTO_INCREMENT,
    `tenant_id` int NOT NULL COMMENT '租户ID',
  `name` varchar(64) NOT NULL COMMENT '角色名称',
  `is_system` tinyint NOT NULL DEFAULT 0 COMMENT '1=系统预设，0=自定义',
  `description` text COMMENT '角色描述',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_role_name` (`tenant_id`, `name`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

-- -- 12. RBAC 角色权限关联表

CREATE TABLE IF NOT EXISTS `role_permission` (
  `id` int NOT NULL AUTO_INCREMENT,
  `role_id` int NOT NULL COMMENT '角色ID',
  `permission_id` int NOT NULL COMMENT '权限ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permission` (`role_id`, `permission_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_permission_id` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色权限关联表';


-- 13. RBAC 用户角色关联表

CREATE TABLE IF NOT EXISTS `user_role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '用户ID',
  `role_id` int NOT NULL COMMENT '角色ID',
    `tenant_id` int NOT NULL COMMENT '租户ID',
  `scope_type` varchar(32) DEFAULT NULL COMMENT '范围类型：NULL=全局, activity_type, activity',
  `scope_id` int DEFAULT NULL COMMENT '范围ID：活动类型ID或活动ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role_scope` (`user_id`, `role_id`, `tenant_id`, `scope_type`, `scope_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户角色关联表';


-- RBAC 初始数据


-- 插入权限定义
INSERT INTO `permission` (`code`, `name`, `resource`, `action`, `description`) VALUES
('activity.create', '创建活动', 'activity', 'create', '创建新活动'),
('activity.edit', '编辑活动', 'activity', 'edit', '编辑活动信息'),
('activity.delete', '删除活动', 'activity', 'delete', '删除活动'),
('activity.view', '查看活动', 'activity', 'view', '查看活动详情'),
('activity.publish', '发布活动', 'activity', 'publish', '发布/取消发布活动'),
('participant.view', '查看报名', 'participant', 'view', '查看报名列表'),
('participant.export', '导出报名', 'participant', 'export', '导出报名数据'),
('participant.approve', '审核报名', 'participant', 'approve', '审核报名申请'),
('checkin.manage', '管理签到', 'checkin', 'manage', '签到和查看签到记录'),
('user.view', '查看用户', 'user', 'view', '查看用户列表'),
('user.block', '拉黑用户', 'user', 'block', '拉黑/解除拉黑用户'),
('admin.manage', '管理管理员', 'admin', 'manage', '创建和管理管理员账号'),
('role.manage', '管理角色', 'role', 'manage', '创建和管理角色权限');
