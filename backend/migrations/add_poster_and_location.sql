-- 活动表添加海报和地点字段
-- 执行时间: 2024年

-- 添加海报URL字段
ALTER TABLE activity ADD COLUMN poster_url VARCHAR(500) NULL COMMENT '活动海报图片URL' AFTER require_payment;

-- 添加地点字段
ALTER TABLE activity ADD COLUMN location VARCHAR(255) NULL COMMENT '活动地点（为空表示线上活动）' AFTER poster_url;