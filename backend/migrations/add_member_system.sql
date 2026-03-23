-- 会员系统迁移脚本
-- 执行前请确保已创建 member_type 和 member_type_activity_type 表

-- 1. 插入默认会员类型
-- 注意：tenant_id = 1 是默认租户，请根据实际情况调整

INSERT INTO member_type (tenant_id, name, code, description, is_default, sort_order, create_time, update_time)
VALUES 
    (1, '普通会员', 'normal', '新用户默认会员类型', 1, 0, datetime('now'), datetime('now')),
    (1, 'A类会员', 'member_a', 'A类会员，可访问特定类型活动', 0, 1, datetime('now'), datetime('now')),
    (1, 'B类会员', 'member_b', 'B类会员，可访问特定类型活动', 0, 2, datetime('now'), datetime('now')),
    (1, 'VIP会员', 'vip', 'VIP会员，可访问所有活动', 0, 3, datetime('now'), datetime('now'));

-- 2. 获取会员类型ID（SQLite 语法）
-- 普通会员的ID假设为 (SELECT id FROM member_type WHERE code='normal' AND tenant_id=1)
-- 其他会员类型类似

-- 3. 设置会员类型可访问的活动类型（示例）
-- 假设 activity_type 表已有数据，这里需要根据实际情况配置
-- 普通会员只能访问公开活动（假设 activity_type_id = 1 是公开活动）
-- INSERT INTO member_type_activity_type (member_type_id, activity_type_id, create_time)
-- SELECT m.id, 1, datetime('now') FROM member_type m WHERE m.code IN ('normal', 'member_a', 'member_b', 'vip') AND m.tenant_id = 1;

-- 4. 更新现有用户的会员类型为默认会员类型
UPDATE user SET member_type_id = (SELECT id FROM member_type WHERE code='normal' AND tenant_id=1 LIMIT 1)
WHERE member_type_id IS NULL AND tenant_id = 1;

-- 注意事项：
-- 1. 执行前请备份数据库
-- 2. 根据实际的 activity_type 数据配置 member_type_activity_type 关联
-- 3. 多租户环境下需要为每个租户创建对应的会员类型数据