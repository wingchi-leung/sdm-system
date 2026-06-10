-- ============================================================
-- 社区 UI 改造 Phase 2 批次 1: community_post 字段扩展
-- 评审依据: docs/handover/社区UI改造-总方案.md §10 决议 2
-- 决策: A 方案(HTML + mp-html),仅扩字段,不删字段
-- ============================================================

-- 1. 加 channel_id(频道帖子归属,与 activity_id 互斥)
ALTER TABLE community_post ADD COLUMN channel_id BIGINT NULL COMMENT '频道ID;与 activity_id 互斥' AFTER activity_id;
ALTER TABLE community_post ADD KEY idx_post_channel_id (channel_id);

-- 2. activity_id 改可空(频道帖子不需要)
ALTER TABLE community_post MODIFY COLUMN activity_id BIGINT NULL COMMENT '活动ID;与 channel_id 互斥';

-- 3. content 升 MEDIUMTEXT(支持富文本)
ALTER TABLE community_post MODIFY COLUMN content MEDIUMTEXT NOT NULL COMMENT '内容主体(纯文本或 HTML,按 content_format 区分)';

-- 4. 新增 content_format(future-proof 格式版本字段)
ALTER TABLE community_post ADD COLUMN content_format VARCHAR(16) NOT NULL DEFAULT 'text' COMMENT 'text/html/blocks' AFTER content;
