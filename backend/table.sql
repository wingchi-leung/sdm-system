-- ============================================================
-- 后端数据库表结构（唯一 SQL 入口）
-- ============================================================

-- ------------------------------------------------------------
-- 0. 活动类型表（活动大类：参、健康锻炼等）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type_name` varchar(64) NOT NULL COMMENT '类型名称，如：参、健康锻炼',
  `code` varchar(32) DEFAULT NULL COMMENT '可选编码',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activity_type_name` (`type_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 1. 活动表
-- ------------------------------------------------------------
CREATE TABLE `activity` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activity_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '活动名称',
  `activity_type_id` int DEFAULT NULL COMMENT '归属活动类型，外键 activity_type.id',
  `start_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '活动开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '活动结束时间',
  `status` tinyint DEFAULT NULL COMMENT '活动状态：1-未开始，2-进行中，3-已结束',
  `update_time` datetime DEFAULT NULL,
  `create_time` datetime DEFAULT NULL,
  `tag` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_activity_type_id` (`activity_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. 活动报名参与人
-- ------------------------------------------------------------
CREATE TABLE `activity_participants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activity_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `participant_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. 签到记录
-- ------------------------------------------------------------
CREATE TABLE `checkin_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `activity_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `checkin_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `phone` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_number` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '身份证',
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  `has_attend` tinyint(3) unsigned zerofill DEFAULT NULL COMMENT '是否参与 1：是 0：否',
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `user_id` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. 用户表
-- ------------------------------------------------------------
CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱',
  `password_hash` varchar(255) DEFAULT NULL COMMENT '用户密码哈希',
  `sex` varchar(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isblock` tinyint DEFAULT 0 COMMENT '0-正常 1-拉黑',
  `block_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '拉黑原因',
  `wx_openid` varchar(64) DEFAULT NULL COMMENT '微信小程序 openid',
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_phone` (`phone`),
  UNIQUE KEY `uk_user_wx_openid` (`wx_openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. 管理员表（App 内登录；user_id 可选，关联 user 表）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `user_id` int DEFAULT NULL COMMENT '可选：关联 user.id',
  `is_super_admin` tinyint NOT NULL DEFAULT 0 COMMENT '1=超级管理员，0=活动管理员',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5b. 管理员-活动类型授权（活动管理员可管理的类型）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_activity_type_role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_user_id` int NOT NULL,
  `activity_type_id` int NOT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_activity_type` (`admin_user_id`,`activity_type_id`),
  KEY `idx_admin_user_id` (`admin_user_id`),
  KEY `idx_activity_type_id` (`activity_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 已有库升级：若表已存在，可只执行以下 ALTER（按需执行）
-- ============================================================
-- ALTER TABLE `user` ADD COLUMN `password_hash` varchar(255) DEFAULT NULL COMMENT '用户密码哈希' AFTER `email`;
-- ALTER TABLE `user` ADD COLUMN `isblock` tinyint DEFAULT 0 COMMENT '0-正常 1-拉黑' AFTER `sex`;
-- ALTER TABLE `user` ADD COLUMN `block_reason` varchar(255) DEFAULT NULL COMMENT '拉黑原因' AFTER `isblock`;
-- ALTER TABLE `user` ADD UNIQUE INDEX `uk_user_phone` (`phone`);
-- ALTER TABLE `user` ADD COLUMN `wx_openid` varchar(64) DEFAULT NULL COMMENT '微信小程序 openid' AFTER `block_reason`;
-- ALTER TABLE `user` ADD UNIQUE INDEX `uk_user_wx_openid` (`wx_openid`);
-- 管理员分级与活动类型（2.8）
-- ALTER TABLE `admin_user` ADD COLUMN `is_super_admin` tinyint NOT NULL DEFAULT 0 COMMENT '1=超级管理员，0=活动管理员' AFTER `user_id`;
-- ALTER TABLE `activity` ADD COLUMN `activity_type_id` int DEFAULT NULL COMMENT '归属活动类型' AFTER `activity_name`;
-- ALTER TABLE `activity` ADD KEY `idx_activity_type_id` (`activity_type_id`);
-- 可选：将已有管理员设为超级管理员（否则依赖“无授权记录视为超级管理员”的兼容逻辑）
-- UPDATE admin_user SET is_super_admin = 1;

-- ============================================================
-- 可选：初始化活动类型（与 2.8 管理员分级配套）
-- ============================================================
-- INSERT INTO activity_type (type_name, code) VALUES ('参', 'can'), ('健康锻炼', 'health');

-- ============================================================
-- 可选：初始化管理员（密码需用 scripts/hash_admin_password.py 生成后替换）
-- ============================================================
-- 示例：INSERT INTO admin_user (username, password_hash, is_super_admin) VALUES ('admin', '<hash>', 1);
-- 管理员 wingchi-微信，密码 123456（hash 由 hash_admin_password.py 生成）
-- INSERT INTO admin_user (username, password_hash, is_super_admin)
-- VALUES ('wingchi-微信', '$2b$12$wA69xFHp9Ni9w/4uYGwW4OMZ2pSpA1oE4V0SppL.VnJPaBBh8X4De', 1);
