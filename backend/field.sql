
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



-- 删除旧的权限表
DROP TABLE IF EXISTS `admin_activity_type_role`;

-- 支付订单表新增报名信息快照字段
ALTER TABLE payment_order ADD COLUMN participant_snapshot TEXT NULL COMMENT '报名信息快照(JSON)' AFTER phone;


ALTER TABLE user_role ADD COLUMN update_time  datetime NULL COMMENT '更新时间'  ;

ALTER TABLE permission ADD COLUMN update_time  datetime NULL COMMENT '更新时间'  ;


ALTER TABLE role_permission ADD COLUMN update_time  datetime NULL COMMENT '更新时间'  ;

  