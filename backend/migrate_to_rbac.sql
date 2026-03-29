-- ============================================================
-- 数据迁移脚本：从旧权限系统迁移到 RBAC
-- ============================================================

-- 步骤1：将超级管理员迁移到 user_role
INSERT INTO `user_role` (`user_id`, `role_id`, `tenant_id`, `scope_type`, `scope_id`)
SELECT
    au.user_id,
    1,  -- 超级管理员角色ID
    au.tenant_id,
    NULL,
    NULL
FROM `admin_user` au
WHERE au.is_super_admin = 1 AND au.user_id IS NOT NULL;

-- 步骤2：将活动类型管理员迁移到 user_role
INSERT INTO `user_role` (`user_id`, `role_id`, `tenant_id`, `scope_type`, `scope_id`)
SELECT
    au.user_id,
    2,  -- 活动管理员角色ID
    aatr.tenant_id,
    'activity_type',
    aatr.activity_type_id
FROM `admin_activity_type_role` aatr
JOIN `admin_user` au ON aatr.admin_user_id = au.id
WHERE au.user_id IS NOT NULL;

-- 步骤3：备份旧表（可选）
-- RENAME TABLE `admin_user` TO `admin_user_backup`;
-- RENAME TABLE `admin_activity_type_role` TO `admin_activity_type_role_backup`;
