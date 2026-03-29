-- ============================================================
-- RBAC 权限系统表结构
-- ============================================================

-- ------------------------------------------------------------
-- 1. 权限表（系统预定义）
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2. 角色表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1 COMMENT '租户ID',
  `name` varchar(64) NOT NULL COMMENT '角色名称',
  `is_system` tinyint NOT NULL DEFAULT 0 COMMENT '1=系统预设，0=自定义',
  `description` text COMMENT '角色描述',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_role_name` (`tenant_id`, `name`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

-- ------------------------------------------------------------
-- 3. 角色-权限关联表
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. 用户-角色关联表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '用户ID',
  `role_id` int NOT NULL COMMENT '角色ID',
  `tenant_id` int NOT NULL DEFAULT 1 COMMENT '租户ID',
  `scope_type` varchar(32) DEFAULT NULL COMMENT '范围类型：NULL=全局, activity_type, activity',
  `scope_id` int DEFAULT NULL COMMENT '范围ID：活动类型ID或活动ID',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role_scope` (`user_id`, `role_id`, `tenant_id`, `scope_type`, `scope_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户角色关联表';
