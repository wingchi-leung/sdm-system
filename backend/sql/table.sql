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
  `avatar_url` varchar(500) DEFAULT NULL COMMENT '头像地址',
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
  `poster_url` varchar(500) DEFAULT NULL COMMENT '活动海报图片URL',
  `location` varchar(255) DEFAULT NULL COMMENT '活动地点（为空表示线上活动）',
  `activity_intro` varchar(1000) DEFAULT NULL COMMENT '活动介绍（最多1000字）',
  `max_participants` int DEFAULT NULL COMMENT '最大参与人数，NULL表示无限制',
  `is_public` int DEFAULT 0 COMMENT '是否公开：0-否 1-是（所有用户可见）',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_tenant_id` (`tenant_id`),
  KEY `idx_tenant_status` (`tenant_id`, `status`),
  KEY `idx_activity_type_id` (`activity_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动表';

-- 
-- 6. 活动参与人表
--
CREATE TABLE IF NOT EXISTS `activity_participants` (
  `id` int NOT NULL AUTO_INCREMENT,
    `tenant_id` int NOT NULL COMMENT '租户ID',
  `activity_id` int NOT NULL COMMENT '活动ID',
  `user_id` int DEFAULT NULL COMMENT '用户ID',
  `participant_name` varchar(255) NOT NULL COMMENT '参与人姓名',
  `enroll_status` int DEFAULT 1 COMMENT '报名状态：1-已报名 2-候补',
  `review_reason` varchar(255) DEFAULT NULL COMMENT '审核拒绝原因',
  `reviewed_by` int DEFAULT NULL COMMENT '审核人ID',
  `reviewed_at` datetime DEFAULT NULL COMMENT '审核时间',
  `payment_status` int DEFAULT 0 COMMENT '支付状态：0-无需支付 1-待支付 2-已支付',
  `payment_order_id` int DEFAULT NULL COMMENT '支付订单ID',
  `paid_amount` int DEFAULT 0 COMMENT '实际支付金额（分）',
  `why_join` varchar(500) DEFAULT NULL COMMENT '为什么要参与',
  `channel` varchar(255) DEFAULT NULL COMMENT '了解此活动的渠道/推荐人',
  `expectation` varchar(500) DEFAULT NULL COMMENT '学习期望',
  `activity_understanding` varchar(255) DEFAULT NULL COMMENT '对活动的了解（一句话描述）',
  `has_questions` varchar(500) DEFAULT NULL COMMENT '是否有问题',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_participant_user_unique` (`activity_id`, `user_id`, `tenant_id`),
  KEY `idx_participants_tenant_id` (`tenant_id`),
  KEY `idx_tenant_activity` (`tenant_id`, `activity_id`),
  KEY `idx_participant_activity_id` (`activity_id`)
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
  `suggested_fee` int NOT NULL COMMENT '建议费用（分）',
  `actual_fee` int NOT NULL COMMENT '实际支付金额（分）',
  `status` int DEFAULT 0 COMMENT '订单状态：0-待支付 1-成功 2-失败 3-关闭',
  `openid` varchar(64) DEFAULT NULL COMMENT '付款用户 openid',
  `prepay_id` varchar(128) DEFAULT NULL COMMENT '预支付ID',
  `paid_at` datetime DEFAULT NULL COMMENT '支付成功时间',
  `refund_status` int NOT NULL DEFAULT 0 COMMENT '退款状态：0-无退款 1-待退款 2-处理中 3-成功 4-失败 5-关闭',
  `refund_amount` int NOT NULL DEFAULT 0 COMMENT '退款金额（分）',
  `refund_apply_by` int DEFAULT NULL COMMENT '退款操作人ID',
  `refund_apply_at` datetime DEFAULT NULL COMMENT '退款申请时间',
  `refund_success_at` datetime DEFAULT NULL COMMENT '退款成功时间',
  `refund_fail_reason` varchar(255) DEFAULT NULL COMMENT '退款失败原因',
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

-- 
-- 9. 退款流水表
-- 
CREATE TABLE IF NOT EXISTS `payment_refund` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `payment_order_id` int NOT NULL COMMENT '支付订单ID',
  `participant_id` int DEFAULT NULL COMMENT '参与人ID',
  `out_refund_no` varchar(64) NOT NULL COMMENT '商户退款单号',
  `wechat_refund_id` varchar(64) DEFAULT NULL COMMENT '微信退款单号',
  `amount` int NOT NULL COMMENT '退款金额（分）',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '退款状态：pending/processing/success/failed/closed',
  `idempotency_key` varchar(128) NOT NULL COMMENT '幂等键',
  `operator_id` int DEFAULT NULL COMMENT '操作人ID',
  `reason` varchar(255) DEFAULT NULL COMMENT '退款原因',
  `request_raw` text DEFAULT NULL COMMENT '退款请求原文',
  `callback_raw` text DEFAULT NULL COMMENT '退款回调原文',
  `fail_reason` varchar(255) DEFAULT NULL COMMENT '失败原因',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_refund_out_refund_no` (`tenant_id`, `out_refund_no`),
  KEY `idx_payment_refund_payment_order_id` (`payment_order_id`),
  KEY `idx_payment_refund_status` (`status`),
  KEY `idx_payment_refund_operator_id` (`operator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='退款流水表';

-- 
-- 10. 通知任务表
-- 
CREATE TABLE IF NOT EXISTS `message_task` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `scene` varchar(64) NOT NULL COMMENT '通知场景',
  `biz_id` int NOT NULL COMMENT '业务ID',
  `user_id` int NOT NULL COMMENT '用户ID',
  `openid` varchar(64) NOT NULL COMMENT '接收者 openid',
  `template_id` varchar(64) NOT NULL COMMENT '订阅消息模板ID',
  `payload_json` text NOT NULL COMMENT '消息体 JSON',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '任务状态：pending/sending/success/failed/dead',
  `retry_count` int NOT NULL DEFAULT 0 COMMENT '重试次数',
  `max_retry` int NOT NULL DEFAULT 5 COMMENT '最大重试次数',
  `next_retry_at` datetime DEFAULT NULL COMMENT '下次重试时间',
  `last_error` varchar(255) DEFAULT NULL COMMENT '最后错误信息',
  `sent_at` datetime DEFAULT NULL COMMENT '发送成功时间',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_message_task_scene_biz_user` (`tenant_id`, `scene`, `biz_id`, `user_id`),
  KEY `idx_message_task_status` (`status`),
  KEY `idx_message_task_next_retry_at` (`next_retry_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知任务表';

-- 
-- 11. 订阅消息授权记录表
-- 
CREATE TABLE IF NOT EXISTS `subscribe_consent` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `user_id` int NOT NULL COMMENT '用户ID',
  `template_id` varchar(64) NOT NULL COMMENT '模板ID',
  `accept_status` varchar(16) NOT NULL COMMENT 'accept/reject/ban',
  `accept_time` datetime DEFAULT NULL COMMENT '授权时间',
  `source_page` varchar(255) DEFAULT NULL COMMENT '来源页面',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_subscribe_consent_user_template` (`tenant_id`, `user_id`, `template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅消息授权记录表';

-- 10. RBAC 权限表

CREATE TABLE IF NOT EXISTS `permission` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '权限代码，如 activity.create',
  `name` varchar(100) NOT NULL COMMENT '权限名称',
  `resource` varchar(32) NOT NULL COMMENT '资源类型：activity, user, participant',
  `action` varchar(32) NOT NULL COMMENT '操作：create, edit, delete, view',
  `description` text COMMENT '权限描述',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

-- 插入角色定义
INSERT INTO `role` (`id`, `tenant_id`, `name`, `is_system`, `description`) VALUES
(1, 0, '超级管理员', 1, '拥有所有权限的超级管理员'),
(2, 0, '活动管理员', 1, '可管理活动类型下的所有活动');

-- 为超级管理员绑定所有权限
INSERT INTO `role_permission` (`role_id`, `permission_id`)
SELECT 1, id FROM `permission`;

-- 为活动管理员绑定活动相关权限
INSERT INTO `role_permission` (`role_id`, `permission_id`)
SELECT 2, id FROM `permission` WHERE `code` LIKE 'activity.%' OR `code` LIKE 'participant.%' OR `code` LIKE 'checkin.%';

--
-- 14. 导入模板配置表
--
CREATE TABLE IF NOT EXISTS `import_template` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `column_mapping` text DEFAULT NULL COMMENT '列映射配置，JSON格式',
  `is_active` tinyint DEFAULT 1 COMMENT '是否启用：1-启用 0-禁用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_import_template_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='导入模板配置表';

--
-- 15. 用户凭证表（统一登录凭证，支持多种登录方式）
--
CREATE TABLE IF NOT EXISTS `user_credential` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '关联 user.id',
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `credential_type` varchar(32) NOT NULL COMMENT '凭证类型：password / wechat / phone_code',
  `identifier` varchar(255) NOT NULL COMMENT '登录标识：用户名 / openid / 手机号',
  `credential_hash` varchar(255) DEFAULT NULL COMMENT '凭证哈希（password 类型存 bcrypt hash）',
  `must_reset_password` tinyint NOT NULL DEFAULT 0 COMMENT '1=需要改密 0=正常（仅 password 类型有意义）',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '1-正常 0-禁用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_credential_lookup` (`tenant_id`, `credential_type`, `identifier`),
  KEY `idx_user_credential_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户凭证表';

--
-- 16. 用户-租户关联表
--
CREATE TABLE IF NOT EXISTS `user_tenant` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '关联 user.id',
  `tenant_id` int NOT NULL COMMENT '关联 tenant.id',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '1-正常 0-禁用',
  `joined_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_tenant` (`user_id`, `tenant_id`),
  KEY `idx_user_tenant_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户-租户关联表';

-- 平台管理员角色（系统预设）
INSERT INTO `role` (`id`, `tenant_id`, `name`, `is_system`, `description`) VALUES
(3, 0, '平台管理员', 1, '跨租户运营管理')
ON DUPLICATE KEY UPDATE `name` = '平台管理员';

-- 为平台管理员绑定所有权限
INSERT INTO `role_permission` (`role_id`, `permission_id`)
SELECT 3, id FROM `permission`
ON DUPLICATE KEY UPDATE `role_id` = 3;

CREATE TABLE IF NOT EXISTS `community_post` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `activity_id` int NOT NULL,
  `author_user_id` int NOT NULL,
  `title` varchar(120) NOT NULL,
  `content` text NOT NULL,
  `cover_url` varchar(500) DEFAULT NULL,
  `status` tinyint NOT NULL DEFAULT 1,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_post_tenant_id` (`tenant_id`),
  KEY `idx_community_post_activity_id` (`activity_id`),
  KEY `idx_community_post_author_user_id` (`author_user_id`),
  KEY `idx_community_post_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区文章表';

CREATE TABLE IF NOT EXISTS `community_comment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `activity_id` int NOT NULL,
  `post_id` int NOT NULL,
  `user_id` int NOT NULL,
  `content` text NOT NULL,
  `status` tinyint NOT NULL DEFAULT 1,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_comment_tenant_id` (`tenant_id`),
  KEY `idx_community_comment_activity_id` (`activity_id`),
  KEY `idx_community_comment_post_id` (`post_id`),
  KEY `idx_community_comment_user_id` (`user_id`),
  KEY `idx_community_comment_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区评论表';

CREATE TABLE IF NOT EXISTS `community_channel` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `name` varchar(64) NOT NULL COMMENT '频道名称',
  `description` varchar(500) DEFAULT NULL COMMENT '频道描述',
  `avatar_url` varchar(500) DEFAULT NULL COMMENT '频道头像',
  `admin_user_id` int NOT NULL COMMENT '管理员用户ID',
  `invite_code` varchar(32) DEFAULT NULL COMMENT '邀请码',
  `invite_code_expire_at` datetime DEFAULT NULL COMMENT '邀请码过期时间',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态：1-正常 0-禁用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_channel_tenant_id` (`tenant_id`),
  KEY `idx_community_channel_admin_user_id` (`admin_user_id`),
  KEY `idx_community_channel_invite_code` (`invite_code`),
  KEY `idx_community_channel_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道表';

CREATE TABLE IF NOT EXISTS `community_channel_member` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int NOT NULL COMMENT '频道ID',
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `user_id` int NOT NULL COMMENT '用户ID',
  `role` varchar(20) NOT NULL DEFAULT 'member' COMMENT '成员角色：member/admin',
  `status` varchar(20) NOT NULL DEFAULT 'active' COMMENT '状态：active/inactive',
  `invited_by` int DEFAULT NULL COMMENT '邀请人ID',
  `joined_at` datetime DEFAULT NULL COMMENT '加入时间',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_channel_member` (`channel_id`, `user_id`),
  KEY `idx_community_channel_member_channel_id` (`channel_id`),
  KEY `idx_community_channel_member_tenant_id` (`tenant_id`),
  KEY `idx_community_channel_member_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道成员表';

CREATE TABLE IF NOT EXISTS `community_media_moderation_task` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `item_type` varchar(32) NOT NULL COMMENT '内容类型',
  `item_id` int NOT NULL COMMENT '内容ID',
  `media_url` varchar(1024) NOT NULL COMMENT '媒体URL',
  `trace_id` varchar(128) DEFAULT NULL COMMENT '追踪ID',
  `status` varchar(32) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/approved/rejected',
  `reason` varchar(255) DEFAULT NULL COMMENT '处理原因',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cmmt_tenant_id` (`tenant_id`),
  KEY `idx_cmmt_item_type` (`item_type`),
  KEY `idx_cmmt_item_id` (`item_id`),
  KEY `idx_cmmt_trace_id` (`trace_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区媒体审核任务表';

-- ============================================================
-- 漂移修复 (Phase 2 批次 1): 补 ORM 已定义但 table.sql 缺失的表
-- 说明: 这 3 张表由 SQLAlchemy create_all 在开发环境自动建过,
--       生产环境通过本文件补齐,消除合规漂移。
-- ============================================================

CREATE TABLE IF NOT EXISTS `community_notification` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `recipient_user_id` int NOT NULL COMMENT '接收用户ID',
  `type` varchar(32) NOT NULL COMMENT '通知类型(channel_invite/system等)',
  `title` varchar(120) NOT NULL COMMENT '通知标题',
  `content` varchar(500) NULL COMMENT '通知内容',
  `data` text NULL COMMENT '附加数据 JSON',
  `is_read` smallint NOT NULL DEFAULT 0 COMMENT '是否已读:0-未读 1-已读',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cn_tenant_id` (`tenant_id`),
  KEY `idx_cn_recipient_user_id` (`recipient_user_id`),
  KEY `idx_cn_type` (`type`),
  KEY `idx_cn_is_read` (`is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区站内通知表';

CREATE TABLE IF NOT EXISTS `community_channel_post` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `channel_id` int NOT NULL COMMENT '频道ID',
  `author_user_id` int NOT NULL COMMENT '发布用户ID',
  `title` varchar(120) NOT NULL COMMENT '标题',
  `content` text NOT NULL COMMENT '内容',
  `images` text NULL COMMENT '图片列表 JSON',
  `is_official` smallint NOT NULL DEFAULT 0 COMMENT '是否官方发布:0-否 1-是',
  `is_pinned` smallint NOT NULL DEFAULT 0 COMMENT '是否置顶:0-否 1-是',
  `status` smallint NOT NULL DEFAULT 1 COMMENT '状态:0-审核中 1-正常 -1-已拒绝',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ccp_tenant_id` (`tenant_id`),
  KEY `idx_ccp_channel_id` (`channel_id`),
  KEY `idx_ccp_author_user_id` (`author_user_id`),
  KEY `idx_ccp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道帖子表(预留,当前复用 community_post)';

CREATE TABLE IF NOT EXISTS `community_channel_comment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `channel_id` int NOT NULL COMMENT '频道ID',
  `post_id` int NOT NULL COMMENT '帖子ID',
  `user_id` int NOT NULL COMMENT '评论用户ID',
  `content` text NOT NULL COMMENT '评论内容',
  `images` text NULL COMMENT '图片列表 JSON',
  `status` smallint NOT NULL DEFAULT 1 COMMENT '状态:0-审核中 1-正常 -1-已拒绝',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ccc_tenant_id` (`tenant_id`),
  KEY `idx_ccc_channel_id` (`channel_id`),
  KEY `idx_ccc_post_id` (`post_id`),
  KEY `idx_ccc_user_id` (`user_id`),
  KEY `idx_ccc_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道评论表(预留,当前复用 community_comment)';

--
-- 用户-活动类型关联表
--
CREATE TABLE IF NOT EXISTS `user_activity_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '用户ID',
  `activity_type_id` int NOT NULL COMMENT '活动类型ID',
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_activity_type` (`user_id`, `activity_type_id`, `tenant_id`),
  KEY `idx_user_activity_type_user_id` (`user_id`),
  KEY `idx_user_activity_type_activity_type_id` (`activity_type_id`),
  KEY `idx_user_activity_type_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户-活动类型关联表';

-- 
-- 17. 旧库升级 SQL
--    用于已存在旧库的数据补字段，避免只跑 CREATE TABLE 后缺少运行时字段。
--    MySQL 版本兼容写法：先查 information_schema，再动态执行 ALTER TABLE。
-- 
SET @schema_name := DATABASE();

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'user' AND column_name = 'phone_hash'
);
SET @sql := IF(@need, 'ALTER TABLE `user` ADD COLUMN `phone_hash` varchar(64) DEFAULT NULL AFTER `phone`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'user' AND column_name = 'phone_masked'
);
SET @sql := IF(@need, 'ALTER TABLE `user` ADD COLUMN `phone_masked` varchar(32) DEFAULT NULL AFTER `phone_hash`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'user' AND column_name = 'email_hash'
);
SET @sql := IF(@need, 'ALTER TABLE `user` ADD COLUMN `email_hash` varchar(64) DEFAULT NULL AFTER `email`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'user' AND column_name = 'identity_number_hash'
);
SET @sql := IF(@need, 'ALTER TABLE `user` ADD COLUMN `identity_number_hash` varchar(64) DEFAULT NULL AFTER `identity_number`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'user' AND column_name = 'identity_last4'
);
SET @sql := IF(@need, 'ALTER TABLE `user` ADD COLUMN `identity_last4` varchar(8) DEFAULT NULL AFTER `identity_number_hash`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'activity_participants' AND column_name = 'email_hash'
);
SET @sql := IF(@need, 'ALTER TABLE `activity_participants` ADD COLUMN `email_hash` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'activity_participants' AND column_name = 'review_status'
);
SET @sql := IF(@need, 'ALTER TABLE `activity_participants` ADD COLUMN `review_status` int NOT NULL DEFAULT 1 AFTER `enroll_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'activity_participants' AND column_name = 'review_reason'
);
SET @sql := IF(@need, 'ALTER TABLE `activity_participants` ADD COLUMN `review_reason` varchar(255) DEFAULT NULL AFTER `review_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'activity_participants' AND column_name = 'reviewed_by'
);
SET @sql := IF(@need, 'ALTER TABLE `activity_participants` ADD COLUMN `reviewed_by` int DEFAULT NULL AFTER `review_reason`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'activity_participants' AND column_name = 'reviewed_at'
);
SET @sql := IF(@need, 'ALTER TABLE `activity_participants` ADD COLUMN `reviewed_at` datetime DEFAULT NULL AFTER `reviewed_by`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'community_post' AND column_name = 'images'
);
SET @sql := IF(@need, 'ALTER TABLE `community_post` ADD COLUMN `images` text DEFAULT NULL AFTER `content`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'community_comment' AND column_name = 'images'
);
SET @sql := IF(@need, 'ALTER TABLE `community_comment` ADD COLUMN `images` text DEFAULT NULL AFTER `content`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'payment_order' AND column_name = 'refund_status'
);
SET @sql := IF(@need, 'ALTER TABLE `payment_order` ADD COLUMN `refund_status` int NOT NULL DEFAULT 0 AFTER `paid_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'payment_order' AND column_name = 'refund_amount'
);
SET @sql := IF(@need, 'ALTER TABLE `payment_order` ADD COLUMN `refund_amount` int NOT NULL DEFAULT 0 AFTER `refund_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'payment_order' AND column_name = 'refund_apply_by'
);
SET @sql := IF(@need, 'ALTER TABLE `payment_order` ADD COLUMN `refund_apply_by` int DEFAULT NULL AFTER `refund_amount`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'payment_order' AND column_name = 'refund_apply_at'
);
SET @sql := IF(@need, 'ALTER TABLE `payment_order` ADD COLUMN `refund_apply_at` datetime DEFAULT NULL AFTER `refund_apply_by`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'payment_order' AND column_name = 'refund_success_at'
);
SET @sql := IF(@need, 'ALTER TABLE `payment_order` ADD COLUMN `refund_success_at` datetime DEFAULT NULL AFTER `refund_apply_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @need := (
  SELECT COUNT(*) = 0
  FROM information_schema.columns
  WHERE table_schema = @schema_name AND table_name = 'payment_order' AND column_name = 'refund_fail_reason'
);
SET @sql := IF(@need, 'ALTER TABLE `payment_order` ADD COLUMN `refund_fail_reason` varchar(255) DEFAULT NULL AFTER `refund_success_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


ALTER TABLE user_role
   ADD COLUMN update_time timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '' AFTER create_time;


-- ============================================================
-- 社区频道公告表 (community_channel_announcement) — SPEC-11
-- ============================================================
-- 公告是社区频道的独立资源（独立于 community_channel_post）：
--   * 无评论、无点赞，只读展示
--   * 仅 community_channel_member.role='admin' 可发
--   * 管理员发布免审（status=1）
--   * 物理删除（无 status=0 软删）
--   * 删除频道时由 DELETE /community/channels/{id} 级联清理

CREATE TABLE IF NOT EXISTS `community_channel_announcement` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `channel_id` int NOT NULL COMMENT '所属频道ID',
  `author_user_id` int NOT NULL COMMENT '发布人用户ID（必为该频道 admin）',
  `title` varchar(120) NOT NULL COMMENT '公告标题',
  `content` mediumtext NOT NULL COMMENT '公告内容（HTML；与帖子一致）',
  `content_format` varchar(16) NOT NULL DEFAULT 'html' COMMENT 'text/html/blocks',
  `images` text DEFAULT NULL COMMENT 'JSON 数组；与帖子一致',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '1-正常 0-已删除',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ann_channel_id` (`channel_id`),
  KEY `idx_ann_author_user_id` (`author_user_id`),
  KEY `idx_ann_create_time` (`create_time`),
  KEY `idx_ann_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道公告表';

-- ============================================================
-- 社区频道日历事件表 (community_channel_calendar_event)
-- ============================================================
CREATE TABLE IF NOT EXISTS `community_channel_calendar_event` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `channel_id` int NOT NULL COMMENT '所属频道ID',
  `activity_id` int DEFAULT NULL COMMENT '关联活动ID',
  `author_user_id` int NOT NULL COMMENT '发布人用户ID',
  `title` varchar(120) NOT NULL COMMENT '事件标题',
  `event_type` varchar(32) NOT NULL DEFAULT 'activity' COMMENT '事件类型：activity/meeting/reminder/deadline/routine',
  `content` mediumtext DEFAULT NULL COMMENT '事件说明',
  `location` varchar(200) DEFAULT NULL COMMENT '地点',
  `cover_url` varchar(500) DEFAULT NULL COMMENT '封面图',
  `start_time` datetime NOT NULL COMMENT '开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '结束时间',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '1-正常 0-已删除',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_calendar_channel_id` (`channel_id`),
  KEY `idx_calendar_tenant_id` (`tenant_id`),
  KEY `idx_calendar_activity_id` (`activity_id`),
  KEY `idx_calendar_start_time` (`start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道日历事件表';

