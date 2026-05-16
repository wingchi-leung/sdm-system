# 社区频道功能 规格说明书

## 1. 概述

### 1.1 功能背景
在小程序中新增第3个Tab作为社区入口，参考Teams的频道模式：
- 管理员创建频道并分配用户
- 用户通过站内信邀请确认后加入频道
- 频道内所有成员可以发布图文动态
- 动态按时间倒序排列，所有成员可评论

### 1.2 设计原则
- **频道独立**：频道与活动完全解耦，是独立的社区单元
- **全新表结构**：不改造现有表，新建独立社区表
- **可扩展**：通知系统、内容类型等预留扩展空间
- **静默失败**：所有异步操作必须有try-catch和用户友好提示

---

## 2. 数据库设计

### 2.1 表结构

#### 2.1.1 community_channel（频道表）
```sql
CREATE TABLE IF NOT EXISTS `community_channel` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `name` varchar(64) NOT NULL COMMENT '频道名称',
  `description` varchar(500) DEFAULT NULL COMMENT '频道描述',
  `avatar_url` varchar(500) DEFAULT NULL COMMENT '频道头像',
  `admin_user_id` int NOT NULL COMMENT '创建者/管理员用户ID',
  `invite_code` varchar(32) DEFAULT NULL COMMENT '当前邀请码',
  `invite_code_expire_at` datetime DEFAULT NULL COMMENT '邀请码过期时间',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态：1-正常 0-禁用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_channel_tenant_id` (`tenant_id`),
  KEY `idx_channel_admin_user_id` (`admin_user_id`),
  KEY `idx_channel_invite_code` (`invite_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道表';
```

#### 2.1.2 community_channel_member（频道成员表）
```sql
CREATE TABLE IF NOT EXISTS `community_channel_member` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int NOT NULL COMMENT '频道ID',
  `user_id` int NOT NULL COMMENT '用户ID',
  `role` varchar(20) NOT NULL DEFAULT 'member' COMMENT '角色：admin/member',
  `status` varchar(20) NOT NULL DEFAULT 'active' COMMENT '状态：pending/active/banned/kicked',
  `invited_by` int DEFAULT NULL COMMENT '邀请人用户ID',
  `joined_at` datetime DEFAULT NULL COMMENT '加入时间',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_channel_member` (`channel_id`, `user_id`),
  KEY `idx_member_user_id` (`user_id`),
  KEY `idx_member_channel_id` (`channel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道成员表';
```

#### 2.1.3 community_channel_post（频道动态表）
```sql
CREATE TABLE IF NOT EXISTS `community_channel_post` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int NOT NULL COMMENT '频道ID',
  `author_user_id` int NOT NULL COMMENT '作者用户ID',
  `title` varchar(120) NOT NULL COMMENT '动态标题',
  `content` text NOT NULL COMMENT '动态内容（JSON格式，支持图文）',
  `cover_url` varchar(500) DEFAULT NULL COMMENT '封面图片',
  `images` text DEFAULT NULL COMMENT '图片列表（JSON数组）',
  `is_official` tinyint NOT NULL DEFAULT 0 COMMENT '是否官方发布：0-否 1-是',
  `is_pinned` tinyint NOT NULL DEFAULT 0 COMMENT '是否置顶：0-否 1-是',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态：1-正常 0-已删除',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_post_channel_id` (`channel_id`),
  KEY `idx_post_author_user_id` (`author_user_id`),
  KEY `idx_post_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道动态表';
```

#### 2.1.4 community_channel_comment（频道评论表）
```sql
CREATE TABLE IF NOT EXISTS `community_channel_comment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel_id` int NOT NULL COMMENT '频道ID',
  `post_id` int NOT NULL COMMENT '动态ID',
  `user_id` int NOT NULL COMMENT '评论用户ID',
  `content` text NOT NULL COMMENT '评论内容（JSON格式，支持图文）',
  `images` text DEFAULT NULL COMMENT '图片列表（JSON数组）',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态：1-正常 0-已删除',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_comment_channel_id` (`channel_id`),
  KEY `idx_comment_post_id` (`post_id`),
  KEY `idx_comment_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道评论表';
```

#### 2.1.5 community_notification（通知表）
```sql
CREATE TABLE IF NOT EXISTS `community_notification` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `recipient_user_id` int NOT NULL COMMENT '接收人用户ID',
  `type` varchar(32) NOT NULL COMMENT '通知类型：channel_invite/system/article.official...',
  `title` varchar(120) NOT NULL COMMENT '通知标题',
  `content` varchar(500) DEFAULT NULL COMMENT '通知内容摘要',
  `data` text DEFAULT NULL COMMENT '扩展数据（JSON）：跳转链接等',
  `is_read` tinyint NOT NULL DEFAULT 0 COMMENT '已读状态：0-未读 1-已读',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notification_recipient` (`recipient_user_id`),
  KEY `idx_notification_type` (`type`),
  KEY `idx_notification_is_read` (`is_read`),
  KEY `idx_notification_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区通知表';
```

### 2.2 内容格式

#### 动态/评论内容格式（JSON）
```json
{
  "text": "纯文本内容，用于搜索和摘要",
  "blocks": [
    {"type": "text", "content": "段落文字"},
    {"type": "image", "url": "https://xxx.jpg", "width": 750, "height": 500},
    {"type": "image", "url": "https://yyy.jpg", "width": 750, "height": 500}
  ]
}
```

---

## 3. 后端 API 设计

### 3.1 频道管理

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/v1/community/channels` | GET | 获取用户所属的频道列表 | 用户 |
| `/api/v1/community/channels` | POST | 创建频道 | 管理员 |
| `/api/v1/community/channels/{id}` | GET | 获取频道详情 | 频道成员 |
| `/api/v1/community/channels/{id}` | PUT | 更新频道信息 | 频道管理员 |
| `/api/v1/community/channels/{id}` | DELETE | 删除频道 | 频道管理员 |

### 3.2 成员管理

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/v1/community/channels/{id}/members` | GET | 获取频道成员列表 | 频道成员 |
| `/api/v1/community/channels/{id}/invite` | POST | 邀请用户加入（站内选择） | 频道管理员 |
| `/api/v1/community/channels/{id}/invite-code` | POST | 生成邀请码 | 频道管理员 |
| `/api/v1/community/channels/join-by-code` | POST | 通过邀请码加入 | 用户 |
| `/api/v1/community/channels/{id}/members/{user_id}` | DELETE | 踢出成员 | 频道管理员 |
| `/api/v1/community/channels/{id}/members/{user_id}/ban` | POST | 禁言用户 | 频道管理员 |
| `/api/v1/community/channels/{id}/members/{user_id}/unban` | POST | 解除禁言 | 频道管理员 |
| `/api/v1/community/channels/{id}/transfer-admin` | POST | 转让管理员 | 频道管理员 |

### 3.3 动态管理

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/v1/community/channels/{id}/posts` | GET | 获取频道动态列表 | 频道成员 |
| `/api/v1/community/channels/{id}/posts` | POST | 发布动态 | 频道成员（非禁言） |
| `/api/v1/community/channels/{id}/posts/{post_id}` | GET | 获取动态详情 | 频道成员 |
| `/api/v1/community/channels/{id}/posts/{post_id}` | DELETE | 删除动态 | 作者/频道管理员 |
| `/api/v1/community/channels/{id}/posts/{post_id}/pin` | POST | 置顶/取消置顶 | 频道管理员 |
| `/api/v1/community/channels/{id}/posts/{post_id}/official` | POST | 标记/取消标记官方 | 频道管理员 |

### 3.4 评论管理

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/v1/community/posts/{post_id}/comments` | GET | 获取评论列表 | 频道成员 |
| `/api/v1/community/posts/{post_id}/comments` | POST | 发表评论 | 频道成员（非禁言） |
| `/api/v1/community/comments/{id}` | DELETE | 删除评论 | 作者/频道管理员 |

### 3.5 通知管理

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/v1/community/notifications` | GET | 获取当前用户通知列表 | 用户 |
| `/api/v1/community/notifications/{id}/read` | POST | 标记通知已读 | 用户 |
| `/api/v1/community/notifications/read-all` | POST | 全部标记已读 | 用户 |
| `/api/v1/community/notifications/unread-count` | GET | 获取未读通知数量 | 用户 |

---

## 4. 小程序页面结构

### 4.1 TabBar 配置
在现有两个Tab（首页/我的）中间新增「社区」Tab：
```
├── Tab 0: pages/index/index     （活动列表）
├── Tab 1: pages/community/index（社区 - 新增）
└── Tab 2: pages/mine/mine      （我的）
```

### 4.2 页面清单

#### 4.2.1 community/index（社区首页/我的频道）
- 显示用户已加入的频道列表
- 按最后活跃时间倒序排列
- 右上角通知入口（铃铛图标 + 未读角标）
- 空状态引导（暂无加入的频道）

#### 4.2.2 community/channel-create（创建频道）
- 频道名称（必填，64字符）
- 频道描述（选填，500字符）
- 频道头像（上传）

#### 4.2.3 community/channel-detail（频道动态流）
- 频道信息头部（名称、描述、成员数）
- 动态列表（置顶优先，其余按时间倒序）
- 官方发布标记特殊样式
- 底部发布按钮

#### 4.2.4 community/post-create（发布动态）
- 标题输入（必填）
- 正文编辑（富文本，支持多图）
- 封面图片上传（选填）
- 是否官方发布（仅管理员可见勾选）

#### 4.2.5 community/post-detail（动态详情）
- 动态内容展示（图文混排）
- 评论列表
- 评论输入框（支持多图）

#### 4.2.6 community/channel-manage（频道管理 - 管理员）
- 基本信息编辑
- 成员管理列表
- 邀请成员（站内选择用户）
- 生成邀请码
- 转让管理员

#### 4.2.7 community/notifications（通知列表）
- 邀请通知列表
- 标记已读/全部已读

---

## 5. 业务流程

### 5.1 管理员创建频道
```
1. 管理员进入"创建频道"页面
2. 填写频道名称、描述、上传头像
3. 点击创建 → 后端创建频道，记录admin_user_id
4. 管理员自动成为频道第一个成员（role=admin, status=active）
```

### 5.2 管理员邀请用户
```
方式A - 站内邀请：
1. 管理员进入频道管理 → 邀请成员
2. 选择站内用户（多选）
3. 点击确认 → 后端发送通知给被邀请用户
4. 被邀请用户收到站内信通知

方式B - 邀请码：
1. 管理员点击"生成邀请码"
2. 后端生成临时邀请码（7天有效期）
3. 管理员复制邀请码，通过其他渠道发送给用户
4. 用户进入社区 → 点击"通过邀请码加入"
5. 输入邀请码 → 后端验证 → 加入频道
```

### 5.3 用户接受邀请
```
1. 用户进入通知页面，看到邀请通知
2. 点击通知，查看频道信息
3. 点击"接受" → 后端更新status=active
4. 用户正式成为频道成员，可以查看动态和发布内容
```

### 5.4 管理员踢出/禁言用户
```
踢出：
1. 管理员进入频道管理 → 成员列表
2. 点击成员右侧"踢出"按钮
3. 确认后 → 后端更新status=kicked
4. 用户失去频道访问权限

禁言：
1. 管理员点击成员右侧"禁言"按钮
2. 确认后 → 后端更新status=banned
3. 被禁言用户可以查看频道内容，但不能发布动态和评论
```

### 5.5 发布动态
```
1. 频道成员点击底部"发布"按钮
2. 填写标题和正文（富文本）
3. 可上传多张图片
4. 点击发布 → 后端创建动态记录
5. 动态按时间倒序显示（置顶除外）
```

### 5.6 评论动态
```
1. 用户在动态详情页查看动态
2. 滚动到底部评论输入框
3. 输入文字，可上传图片
4. 点击发送 → 后端创建评论
5. 评论按时间正序显示（先发先看）
```

---

## 6. 权限设计

### 6.1 频道角色
| 角色 | 权限 |
|------|------|
| admin | 创建频道、编辑频道、邀请成员、踢出成员、禁言/解禁、转让管理员、删除任何动态、置顶/标记官方 |
| member | 发布动态、评论、删除自己的内容 |

### 6.2 状态限制
| 状态 | 能否查看 | 能否发布动态 | 能否评论 |
|------|---------|-------------|---------|
| pending（待确认） | 否 | 否 | 否 |
| active（正常） | 是 | 是（除非被禁言） | 是（除非被禁言） |
| banned（禁言） | 是 | 否 | 否 |
| kicked（已踢出） | 否 | 否 | 否 |

---

## 7. 未来扩展预留

### 7.1 通知类型（可扩展）
```python
NOTIFICATION_TYPES = {
    "channel_invite": "邀请加入频道",
    "channel_notice": "频道公告",
    "article.official": "官方发布通知",
    "article.comment": "有新评论（暂不做）",
    "article.reply": "被回复（暂不做）",
    "member.joined": "新成员加入",
    "member.kicked": "被移出频道",
}
```

### 7.2 内容块类型（可扩展）
```json
{
  "blocks": [
    {"type": "text", "content": "段落文字"},
    {"type": "image", "url": "...", "width": 750, "height": 500},
    {"type": "video", "url": "...", "poster": "...", "duration": 120},
    {"type": "mention", "user_id": 123, "name": "张三"}
  ]
}
```

### 7.3 频道扩展字段预留
```sql
-- 后续可扩展字段
ALTER TABLE community_channel ADD COLUMN category VARCHAR(32) DEFAULT NULL COMMENT '频道分类';
ALTER TABLE community_channel ADD COLUMN visibility VARCHAR(20) DEFAULT 'public' COMMENT '可见性：public/private';
ALTER TABLE community_channel ADD COLUMN allow_join tinyint DEFAULT 1 COMMENT '是否允许自行申请加入';
```

---

## 8. 技术实现计划

### 8.1 后端实现
1. 创建新的ORM模型（独立于现有schemas.py）
2. 创建CRUD操作模块
3. 实现所有API端点
4. 编写单元测试

### 8.2 前端实现
1. 配置TabBar新增社区Tab
2. 创建页面文件（7个页面）
3. 实现API调用封装
4. 实现通知角标功能

### 8.3 数据库迁移
将建表语句追加到 `table.sql`，字段修改追加到 `field.sql`

---

## 9. 注意事项

1. 所有异步操作必须包含try-catch和用户友好错误提示
2. 图片上传需要限制大小和格式
3. 邀请码需要唯一且有一定安全性（随机生成）
4. 禁言状态需要在前端和后端同时检查
5. 删除操作应该是软删除（status标记），保留数据可恢复