-- ============================================================
-- 第四阶段性能优化：添加数据库索引
-- 执行前请先备份数据库！
-- 日期：2026-03-23
-- ============================================================

-- ------------------------------------------------------------
-- 1. 活动参与人表索引优化
-- ------------------------------------------------------------

-- activity_id 索引（加速按活动查询参与者）
ALTER TABLE `activity_participants` ADD INDEX IF NOT EXISTS `idx_participant_activity_id` (`activity_id`);

-- identity_number 索引（加速身份证号查询）
ALTER TABLE `activity_participants` ADD INDEX IF NOT EXISTS `idx_participant_identity` (`identity_number`);

-- ------------------------------------------------------------
-- 2. 签到记录表索引优化
-- ------------------------------------------------------------

-- activity_id 索引（加速按活动查询签到记录）
ALTER TABLE `checkin_records` ADD INDEX IF NOT EXISTS `idx_checkin_activity_id` (`activity_id`);

-- identity_number 索引（加速身份证号查询）
ALTER TABLE `checkin_records` ADD INDEX IF NOT EXISTS `idx_checkin_identity` (`identity_number`);

-- ------------------------------------------------------------
-- 3. 支付订单表索引优化（已有索引，此处记录）
-- ------------------------------------------------------------
-- 以下索引已在表结构中存在：
-- payment_order.order_no - UNIQUE INDEX
-- payment_order.tenant_id - INDEX
-- payment_order.activity_id - INDEX
-- payment_order.user_id - INDEX
-- payment_order.status - INDEX
-- payment_order.transaction_id - INDEX
-- payment_order.expire_at - INDEX

-- ============================================================
-- 迁移完成说明：
-- 1. PERF-005: 已添加 activity_participants 和 checkin_records 的索引
-- 2. PERF-007: 已在代码中实现批量插入优化
-- 3. PERF-008: 已添加应用内存缓存（cache.py）
-- ============================================================
