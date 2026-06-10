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
- **站内信复用**：社区频道只负责产出频道邀请消息，消息展示与铃铛入口复用独立站内信中心
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
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态：1-正常 0-禁用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_channel_tenant_id` (`tenant_id`),
  KEY `idx_channel_admin_user_id` (`admin_user_id`),
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

#### 2.1.5 community_notification（社区消息落库表）
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区消息表（由站内信中心消费展示）';
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

### 3.5 通知能力边界（社区频道）

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/v1/community/channels/{id}/invite` | POST | 发送频道邀请并写入站内信消息 | 频道管理员 |
| `/api/v1/community/invites/{notification_id}/accept` | POST | 受邀用户接受邀请并加入频道 | 用户 |
| `/api/v1/community/invites/{notification_id}/reject` | POST | 受邀用户拒绝邀请 | 用户 |
| `/api/v1/community/notifications` | GET | 拉取站内信列表（当前阶段由社区模块提供） | 用户 |
| `/api/v1/community/notifications/{notification_id}/read` | POST | 单条已读 | 用户 |
| `/api/v1/community/notifications/read-all` | POST | 全部已读 | 用户 |
| `/api/v1/community/notifications/unread-count` | GET | 未读数 | 用户 |

说明：
- 目标架构是“站内信中心独立”；当前落地阶段先由社区模块提供通知读写接口，后续再平滑切到独立站内信服务。
- 社区仅负责 `channel_invite` 类型消息生产与邀请动作处理；其他通知类型暂不在本期实现。

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
- 空状态引导（暂无加入的频道）

#### 4.2.2 community/channel-create（创建频道，仅管理员可见）
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
- 是否官方发布（仅管理员可见勾选）

#### 4.2.5 community/post-detail（动态详情）
- 动态内容展示（图文混排）
- 评论列表
- 评论输入框（支持多图）

#### 4.2.6 community/channel-manage（频道管理 - 管理员）
- 基本信息编辑
- 成员管理列表
- 邀请成员（站内选择用户）
- 转让管理员

#### 4.2.7 通知入口说明（复用站内信）
- 铃铛入口常驻在活动页（`pages/index/index`）右上角，不在社区页面常驻
- 点击铃铛统一进入站内信中心页面（独立模块）
- 社区频道相关消息在站内信中心以内嵌卡片样式展示
- 本期不开放邀请码加入，所有成员通过管理员站内邀请进入频道

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
```

### 5.3 用户接受邀请
```
1. 用户在活动页点击右上角铃铛，进入站内信中心
2. 在站内信中心查看"频道邀请"消息卡片
3. 点击"接受" → 后端更新status=active，并写回邀请处理状态
4. 点击消息卡片主体可跳转频道详情页
5. 用户正式成为频道成员，可以查看动态和发布内容
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
3. 频道邀请仅通过站内信完成，不开放邀请码入口
4. 禁言状态需要在前端和后端同时检查
5. 删除操作在当前实现中采用真正删除并级联清理频道帖子、评论、成员、通知与审核任务，删除后不可恢复

---

## 10. 通知中心规范（频道邀请）

### 10.1 范围与边界
- 站内信是独立模块，负责铃铛入口、消息列表、未读数、已读管理。
- 社区频道模块负责：
  - 触发并写入 `channel_invite` 消息；
  - 处理邀请消息上的业务动作（接受/拒绝）；
  - 提供跳转所需业务参数。
- 社区频道模块不负责：
  - 实现站内信富能力（筛选、搜索、聚合、系统公告统一编排等）；
  - 跨业务通知规则编排。

---

## 11. 当前实现状态（2026-05-24）

### 11.1 本轮已完成（1-5）
1. 发帖/评论切换到频道维度  
  - 后端已提供 `channels/{id}/posts` 与 `channels/{id}/posts/{post_id}/comments` 全链路。  
  - 小程序 `community-post-list/create/detail` 已改为按 `channelId` 调用。
2. 频道管理核心动作（当前范围）  
  - 已支持：创建频道、邀请成员、踢出、禁言/解禁。  
  - 暂未做：转让管理员（按排期后置）。
3. 频道成员状态规则  
  - `pending/kicked` 不可访问；`active` 可访问可发言；`banned` 可读不可发帖/评论。  
  - 后端已做强校验（前端仅做体验层提示）。
4. 邀请码入群流程  
  - 本期取消，不再开放邀请码加入。
5. 通知读状态能力  
  - 已支持：通知列表、单条已读、全部已读、未读数接口。  
  - 活动页铃铛角标已改为使用未读数接口。

### 11.2 尚未完成（按你当前排除项）
1. 转让频道管理员。  
2. 频道动态删除/置顶/官方标记接口与页面操作（保留在后续 phase）。

### 10.2 入口与交互规范
- 铃铛位置：`pages/index/index` 右上角常驻。
- 点击行为：进入站内信中心。
- 社区页面（`community/*`）不再提供常驻铃铛。
- 未读角标规则：
  - `0`：不显示角标；
  - `1~99`：显示数字；
  - `>99`：显示 `99+`。

### 10.3 消息类型与数据契约
- 本期社区仅接入一类站内信：`channel_invite`。
- `community_notification` 字段约定：
  - `type`: 固定 `channel_invite`
  - `title`: 例：`邀请你加入频道`
  - `content`: 例：`张三邀请你加入「摄影爱好者」频道`
  - `data`（JSON）最小结构：
```json
{
  "action": "channel_invite",
  "channel_id": 123,
  "channel_name": "摄影爱好者",
  "inviter_user_id": 456,
  "inviter_name": "张三",
  "invite_expire_at": "2026-12-31T23:59:59+08:00"
}
```

### 10.4 站内信卡片样式与动作
- 卡片元素：
  - 标题：邀请你加入频道
  - 摘要：`{邀请人}` 邀请你加入 `「{频道名}」`
  - 状态标签：`待处理` / `已接受` / `已拒绝` / `已过期`
  - 操作按钮：`接受`、`拒绝`（仅待处理时展示）
- 点击卡片主体跳转：
  - `待处理`：跳转频道邀请确认页（可展示频道信息和操作按钮）
  - `已接受`：跳转频道详情页 `community/channel-detail?id={channel_id}`
  - `已拒绝/已过期`：默认跳转频道详情页；若无权限则提示后返回社区首页

### 10.5 状态流转与幂等
- 邀请状态：`pending -> accepted/rejected/expired`。
- 接受邀请：
  - 首次成功：成员状态变更为 `active`，消息状态变更为 `accepted`。
  - 重复点击：返回成功语义（幂等），不重复写成员记录。
- 拒绝邀请：
  - 首次成功：消息状态变更为 `rejected`。
  - 重复点击：返回成功语义（幂等）。
- 过期邀请：
  - 服务端判断过期后拒绝接受操作，返回明确提示：`邀请已过期`。

### 10.6 权限与安全规则
- 只有消息接收人本人可以执行 `accept/reject/read` 动作。
- 所有查询和写操作必须校验 `tenant_id`，禁止跨租户访问。
- 跳转频道详情前必须再次校验频道成员权限，防止通过旧消息越权访问。

### 10.7 异常与用户提示
- 网络异常：提示 `网络异常，请稍后重试`。
- 邀请失效：提示 `邀请已失效`。
- 频道不存在或已禁用：提示 `频道不存在或已停用`。
- 无权限：提示 `你当前无权限访问该频道`。

### 10.8 与站内信模块对接清单
- 社区输出：
  - 频道邀请消息写入能力；
  - 邀请接受/拒绝业务接口；
  - 跳转参数（`channel_id`、`action`）。
- 站内信输入：
  - 铃铛角标与消息列表承载；
  - 已读与未读统计；
  - 消息卡片渲染与路由分发。

---

## 11. 媒体存储规范（Local 先行，支持平滑切 OSS/COS）

### 11.1 目标
- 当前阶段使用 `local` 存储即可上线，不阻塞社区功能。
- 存储接口与数据结构从第一天就按“可迁移”设计，后续切换 `oss/cos` 不改业务表和页面逻辑。
- 保证安全、性能、运维复杂度三者平衡。

### 11.2 存储抽象与切换原则
- 统一走后端存储抽象层（`StorageBase`），业务代码禁止直接依赖本地文件路径。
- 配置驱动切换：
  - `STORAGE_TYPE=local|oss|cos`
  - 切换时仅改环境变量与部署配置，不改社区业务接口契约。
- 动态/评论内容中的媒体字段，统一保存“可访问 URL + 业务元信息”，禁止写死本机绝对路径。

### 11.3 Local 存储目录规则
- 本地上传根目录必须独立于代码目录，建议：
  - Windows：`D:/sdm-uploads`
  - Linux：`/data/sdm-uploads`
- 目录分层（按业务与日期分片）：
```text
{upload_root}/community/
  channels/{yyyy}/{mm}/...
  posts/{yyyy}/{mm}/...
  comments/{yyyy}/{mm}/...
  videos/{yyyy}/{mm}/...   # 视频预留
```
- 单目录文件数控制：通过日期和随机前缀分片，避免单目录堆积导致 IO 退化。

### 11.4 文件命名与路径规则
- 文件名使用随机 ID，禁止保留用户原始文件名：
  - `{yyyymmdd}_{8位随机}.{ext}`（当前）
  - 后续可升级为 `{sha256前缀}_{随机串}.{ext}`
- URL 必须稳定且可缓存，禁止带业务敏感参数。
- 返回给前端的路径格式保持统一（如 `/uploads/community/posts/...` 或 CDN URL），由存储层决定域名。

### 11.5 媒体类型与限制（本期）
- 图片（首期必做）：
  - 格式：`png/jpg/jpeg`
  - 单文件上限：`5MB`（沿用现有配置）
  - 建议增加像素上限校验（防止超大分辨率图片拖垮解码）
- 视频（预留，默认关闭）：
  - 未启用转码前，不对普通用户开放视频上传
  - 若灰度开启，需配置时长和体积双限制（例如 `<=60秒` 且 `<=50MB`）

### 11.6 安全规则
- 上传前后双重校验：扩展名、MIME、文件大小。
- 禁止可执行脚本类型（`php/js/html/svg` 等）进入可直访目录。
- 所有上传接口必须鉴权并做租户隔离校验。
- 上传失败、删除失败必须记录日志，不允许静默吞错。
- 本地静态目录禁止目录浏览。

### 11.7 性能规则
- 上传资源必须返回可长期缓存 URL（已存在 `Cache-Control` 机制，继续沿用）。
- 小程序列表页优先展示文本摘要与小图，详情页再加载大图，避免首屏阻塞。
- 图片展示默认开启懒加载（`lazy-load`），降低滚动卡顿。
- 大体积媒体上传需前端显示进度与失败重试提示。

### 11.8 备份与恢复
- `local` 模式必须将“数据库 + 上传目录”一起备份，缺一不可。
- 最低要求：
  - 每日增量备份上传目录
  - 每周一次恢复演练
- 恢复验收项：历史动态图片可访问、头像可访问。

### 11.9 平滑迁移到 OSS/COS 的约束
- 迁移前提：业务表不存本地绝对路径，只存统一 URL/相对键。
- 迁移步骤：
  1. 离线或后台任务将本地文件同步到 OSS/COS；
  2. 配置 `STORAGE_TYPE` 和 CDN 域名；
  3. 新上传走 OSS/COS，旧 URL 通过回源或重写策略继续可读；
  4. 验证通过后再下线本地直出。
- 迁移期间保证用户无感：帖子内容不改、前端不改、接口不改。
