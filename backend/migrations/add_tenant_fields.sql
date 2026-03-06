-- ============================================================
-- 多租户迁移脚本
-- 执行前请先备份数据库！
-- ============================================================

-- ------------------------------------------------------------
-- 1. 创建租户表
-- ------------------------------------------------------------
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

-- 创建默认租户
INSERT INTO `tenant` (`id`, `name`, `code`, `status`, `plan`)
VALUES (1, '默认租户', 'default', 1, 'enterprise')
ON DUPLICATE KEY UPDATE `name` = '默认租户';

-- ------------------------------------------------------------
-- 2. 用户表添加 tenant_id
-- ------------------------------------------------------------
-- 先删除原有唯一索引
ALTER TABLE `user` DROP INDEX IF EXISTS `uk_user_phone`;
ALTER TABLE `user` DROP INDEX IF EXISTS `uk_user_wx_openid`;

-- 添加 tenant_id 字段
ALTER TABLE `user` 
  ADD COLUMN IF NOT EXISTS `tenant_id` int NOT NULL DEFAULT 1 COMMENT '租户ID' AFTER `id`;

-- 创建新唯一索引（租户内唯一）
ALTER TABLE `user` ADD UNIQUE KEY `uk_tenant_phone` (`tenant_id`, `phone`);
ALTER TABLE `user` ADD UNIQUE KEY `uk_tenant_wx_openid` (`tenant_id`, `wx_openid`);
ALTER TABLE `user` ADD INDEX `idx_user_tenant_id` (`tenant_id`);

-- ------------------------------------------------------------
-- 3. 管理员表添加 tenant_id
-- ------------------------------------------------------------
ALTER TABLE `admin_user` DROP INDEX IF EXISTS `username`;

ALTER TABLE `admin_user` 
  ADD COLUMN IF NOT EXISTS `tenant_id` int NOT NULL DEFAULT 1 COMMENT '租户ID' AFTER `id`;

ALTER TABLE `admin_user` ADD UNIQUE KEY `uk_tenant_username` (`tenant_id`, `username`);
ALTER TABLE `admin_user` ADD INDEX `idx_admin_tenant_id` (`tenant_id`);

-- ------------------------------------------------------------
-- 4. 活动类型表添加 tenant_id
-- ------------------------------------------------------------
ALTER TABLE `activity_type` DROP INDEX IF EXISTS `uk_activity_type_name`;

ALTER TABLE `activity_type` 
  ADD COLUMN IF NOT EXISTS `tenant_id` int NOT NULL DEFAULT 1 COMMENT '租户ID' AFTER `id`;

ALTER TABLE `activity_type` ADD UNIQUE KEY `uk_tenant_type_name` (`tenant_id`, `type_name`);
ALTER TABLE `activity_type` ADD INDEX `idx_activity_type_tenant_id` (`tenant_id`);

-- ------------------------------------------------------------
-- 5. 活动表添加 tenant_id
-- ------------------------------------------------------------
ALTER TABLE `activity` 
  ADD COLUMN IF NOT EXISTS `tenant_id` int NOT NULL DEFAULT 1 COMMENT '租户ID' AFTER `id`;

ALTER TABLE `activity` ADD INDEX `idx_activity_tenant_id` (`tenant_id`);
ALTER TABLE `activity` ADD INDEX `idx_tenant_status` (`tenant_id`, `status`);

-- ------------------------------------------------------------
-- 6. 活动参与人表添加 tenant_id
-- ------------------------------------------------------------
ALTER TABLE `activity_participants` 
  ADD COLUMN IF NOT EXISTS `tenant_id` int NOT NULL DEFAULT 1 COMMENT '租户ID' AFTER `id`;

ALTER TABLE `activity_participants` ADD INDEX `idx_participants_tenant_id` (`tenant_id`);
ALTER TABLE `activity_participants` ADD INDEX `idx_tenant_activity` (`tenant_id`, `activity_id`);

-- ------------------------------------------------------------
-- 7. 签到记录表添加 tenant_id
-- ------------------------------------------------------------
ALTER TABLE `checkin_records` 
  ADD COLUMN IF NOT EXISTS `tenant_id` int NOT NULL DEFAULT 1 COMMENT '租户ID' AFTER `id`;

ALTER TABLE `checkin_records` ADD INDEX `idx_checkin_tenant_id` (`tenant_id`);
ALTER TABLE `checkin_records` ADD INDEX `idx_tenant_activity` (`tenant_id`, `activity_id`);

-- ------------------------------------------------------------
-- 8. 管理员-活动类型授权表添加 tenant_id
-- ------------------------------------------------------------
ALTER TABLE `admin_activity_type_role` 
  ADD COLUMN IF NOT EXISTS `tenant_id` int NOT NULL DEFAULT 1 COMMENT '租户ID' AFTER `id`;

ALTER TABLE `admin_activity_type_role` ADD INDEX `idx_admin_role_tenant_id` (`tenant_id`);

-- ============================================================
-- 迁移完成
-- ============================================================