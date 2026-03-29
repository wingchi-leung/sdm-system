-- ============================================================
-- RBAC 初始权限和角色数据
-- ============================================================

-- ------------------------------------------------------------
-- 1. 插入权限定义
-- ------------------------------------------------------------

-- 活动相关权限
INSERT INTO `permission` (`code`, `name`, `resource`, `action`, `description`) VALUES
('activity.create', '创建活动', 'activity', 'create', '创建新活动'),
('activity.edit', '编辑活动', 'activity', 'edit', '编辑活动信息'),
('activity.delete', '删除活动', 'activity', 'delete', '删除活动'),
('activity.view', '查看活动', 'activity', 'view', '查看活动详情'),
('activity.publish', '发布活动', 'activity', 'publish', '发布/取消发布活动');

-- 报名相关权限
INSERT INTO `permission` (`code`, `name`, `resource`, `action`, `description`) VALUES
('participant.view', '查看报名', 'participant', 'view', '查看报名列表'),
('participant.export', '导出报名', 'participant', 'export', '导出报名数据'),
('participant.approve', '审核报名', 'participant', 'approve', '审核报名申请');

-- 签到相关权限
INSERT INTO `permission` (`code`, `name`, `resource`, `action`, `description`) VALUES
('checkin.manage', '管理签到', 'checkin', 'manage', '签到和查看签到记录');

-- 用户管理权限
INSERT INTO `permission` (`code`, `name`, `resource`, `action`, `description`) VALUES
('user.view', '查看用户', 'user', 'view', '查看用户列表'),
('user.block', '拉黑用户', 'user', 'block', '拉黑/解除拉黑用户');

-- 系统管理权限
INSERT INTO `permission` (`code`, `name`, `resource`, `action`, `description`) VALUES
('admin.manage', '管理管理员', 'admin', 'manage', '创建和管理管理员账号'),
('role.manage', '管理角色', 'role', 'manage', '创建和管理角色权限');

-- ------------------------------------------------------------
-- 2. 插入预设角色
-- ------------------------------------------------------------

-- 超级管理员
INSERT INTO `role` (`tenant_id`, `name`, `is_system`, `description`) VALUES
(1, '超级管理员', 1, '拥有所有权限的系统管理员');

-- 活动管理员
INSERT INTO `role` (`tenant_id`, `name`, `is_system`, `description`) VALUES
(1, '活动管理员', 1, '可以创建和管理活动、查看报名、管理签到');

-- 签到员
INSERT INTO `role` (`tenant_id`, `name`, `is_system`, `description`) VALUES
(1, '签到员', 1, '仅负责活动签到');

-- 财务
INSERT INTO `role` (`tenant_id`, `name`, `is_system`, `description`) VALUES
(1, '财务', 1, '查看和导出报名数据');

-- ------------------------------------------------------------
-- 3. 为角色分配权限
-- ------------------------------------------------------------

-- 超级管理员：所有权限
INSERT INTO `role_permission` (`role_id`, `permission_id`)
SELECT 1, id FROM `permission`;

-- 活动管理员：活动和报名管理权限
INSERT INTO `role_permission` (`role_id`, `permission_id`)
SELECT 2, id FROM `permission` WHERE code IN (
  'activity.create', 'activity.edit', 'activity.delete', 'activity.view', 'activity.publish',
  'participant.view', 'participant.export', 'checkin.manage'
);

-- 签到员：仅签到权限
INSERT INTO `role_permission` (`role_id`, `permission_id`)
SELECT 3, id FROM `permission` WHERE code IN ('checkin.manage', 'participant.view');

-- 财务：查看和导出权限
INSERT INTO `role_permission` (`role_id`, `permission_id`)
SELECT 4, id FROM `permission` WHERE code IN ('participant.view', 'participant.export');
