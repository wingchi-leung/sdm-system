# 社区频道 — 公告功能 规格说明书

> 本文档为「社区频道」新增公告能力的追踪 spec。  
> 配套原文档: [SPEC-05_社区-频道功能.md](SPEC-05_社区-频道功能.md) / [SPEC-07_社区-频道Phase2-UI大改.md](SPEC-07_社区-频道Phase2-UI大改.md)

---

## 一、需求与决议

### 1.1 用户原话

> 小程序社区里要加一个功能：发公告，和发帖子是独立的入口，和查看帖子也是独立页。

### 1.2 关键决议

| # | 议题 | 决议 | 说明 |
|---|------|------|------|
| R1 | 公告 vs 帖子的关系 | **并列独立的两类内容** | 公告与帖子不是同一资源的不同 type；是两类独立资源、各自有独立的发布入口、独立的列表页、独立的详情页、独立的发布页 |
| R2 | 公告的发布权限 | **频道管理员可发** | `community_channel_member.role = 'admin'` 即可；含混合账号场景（管理员同时是普通成员） |
| R3 | 公告的数据归属 | **属于某个社区（频道）** | `/api/v1/community/channels/{channel_id}/announcements` 资源路径；不做跨频道广播 |
| R4 | 公告在社区内的展示 | **社区内部加「公告」栏（顶部置顶入口卡片）** | 进入频道后，动态流上方常驻一张「📢 公告」入口卡片（带条数 N），点进去进入独立公告列表页；**不**采用 tab 切换形态 |
| R5 | 公告与帖子的功能差异 | **公告无评论、无点赞；只读展示；支持删除** | 公告是单向发布-阅读模型；不要复用 `community_channel_post` 加 `is_announcement` 字段做「打补丁」式扩展；删除由发布人或频道管理员触发 |
| R6 | 公告的内容模型 | **不复用 `community_channel_post`，新建独立表** | 新建 `community_channel_announcement`；保留未来扩展富文本、图片、置顶、有效期等字段；不复用是因为功能边界、查询索引、审核链路、评论体系四类差异会让 `is_announcement` 打补丁式扩展难以维护（详见 §10.1 决策权衡） |
| R7 | 视觉与设计稿 | **沿用现有频道视觉系统** | 复用 SPEC-07 的组件（surface-card / state-view / page-hero），不新增视觉规范 |

---

## 二、目标与非目标

### 2.1 目标

1. 频道管理员可独立发布图文公告（含富文本，与现有帖子编辑器一致）。
2. 频道成员可进入「公告」栏，浏览公告列表、进入详情页查看完整公告。
3. 公告与帖子在数据、API、页面三个层面完全分离，避免互相影响。
4. 公告发布后所有成员可见，不需要走与普通帖子一样的审核流（沿用管理员免审规则）。
5. 公告可由发布人或频道管理员删除。

### 2.2 非目标（本期不做）

- 公告评论 / 点赞 / 收藏
- 公告阅读回执 / 已读统计
- 公告置顶 / 排序（按 `create_time DESC` 即可）
- 公告定时发布 / 定时下线
- 公告推送通知（站内信中心）
- Web 端公告管理界面（仅做小程序）
- Flutter 端公告
- 公告被删除后保留 30 天 / 软删除回收站
- 公告编辑（已发布后修改内容）—— 本期不支持；如需修改请删后重发

---

## 三、产品形态

### 3.1 信息架构

```
社区首页（社区频道列表）
└─ 我的社区 / 全部社区
   └─ 点入某频道（社区内部页 = community-post-list）
      ├─ 顶部：「📢 公告（3）」入口卡片（surface-card；点击进入 community-announcement-list）
      │            └─ 公告列表页 (community-announcement-list)
      │                  └─ 公告卡片 → 公告详情页 (community-announcement-detail)
      ├─ 下方：动态流（community-post-list 现有内容）
      │
      └─ 右上角操作区
         ├─ 管理员： [+ 发公告] [+ 发动态] 两个独立按钮
         └─ 成员：   [+ 发动态] 一个按钮
```

**关键决策**：**不**采用顶部 tab 切换形态。公告栏是动态流**上方的一张置顶入口卡片**，点进去才是独立列表页。这样进频道第一眼看到的还是动态（高频），公告是低频但置顶的入口（类似微信群公告/Teams 频道 Pinned Messages 的体验）。

### 3.2 用户视角的页面流程

| 场景 | 路径 | 关键页面 |
|------|------|----------|
| 普通成员看公告 | 进入频道 → 看到顶部公告栏卡片 → 点进去 | `community-announcement-list` |
| 普通成员看动态 | 进入频道 → 看到动态流 | `community-post-list`（已有） |
| 管理员发公告 | 进入频道 → 点「+ 发公告」 | `community-announcement-create` |
| 普通成员发动态 | 进入频道 → 点「+ 发动态」 | `community-post-create`（已有） |
| 看公告详情 | 点公告卡片 | `community-announcement-detail` |
| 看动态详情 | 点动态卡片 | `community-post-detail`（已有） |
| 管理员/发布人删公告 | 公告列表卡片长按/点更多 OR 公告详情页底部「删除」 → 二次确认 | `community-announcement-list` / `community-announcement-detail` |

### 3.3 公告栏入口卡片规则

- **位置**：`community-post-list` 顶部，在 `page-head`（动态标题）之下、动态列表之上。
- **可见性**：所有频道成员可见；条数 `> 0` 时展示，条数 `= 0` 时不展示入口卡片（避免给用户看到空提示位）。
- **展示内容**：
  - 左侧：📢 喇叭图标
  - 中间：「公告」标题
  - 右侧：条数 badge（`N`，超过 99 显示 `99+`）
  - 整张卡片可点击进入 `community-announcement-list`
- **不展示最近一条公告预览**（克制体验，避免占用首屏高度）。
- **不展示发布时间、发布人**（避免与列表页重复）。

### 3.4 不再有"默认 tab"

tab 形态已废弃，因此原本"进入时拉公告数与动态数比对决定默认 tab"的逻辑不需要。`community-post-list` 直接渲染动态流即可，公告栏入口卡片由其自身的 `total > 0` 条件决定是否展示。

---

## 四、数据库设计

### 4.1 新表：`community_channel_announcement`

> 字段规则按全局约定：建表语句 append 到 `backend/sql/table.sql`；新字段走 `backend/sql/field.sql`。

```sql
CREATE TABLE IF NOT EXISTS `community_channel_announcement` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL COMMENT '租户ID',
  `channel_id` int NOT NULL COMMENT '所属频道ID',
  `author_user_id` int NOT NULL COMMENT '发布人用户ID（必为该频道 admin）',
  `title` varchar(120) NOT NULL COMMENT '公告标题',
  `content` mediumtext NOT NULL COMMENT '公告内容（HTML；与帖子一致）',
  `content_format` varchar(16) NOT NULL DEFAULT 'html' COMMENT 'text/html/blocks',
  `images` text DEFAULT NULL COMMENT 'JSON 数组；与帖子一致',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '1-正常 0-已删除',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ann_channel_id` (`channel_id`),
  KEY `idx_ann_author_user_id` (`author_user_id`),
  KEY `idx_ann_create_time` (`create_time`),
  KEY `idx_ann_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社区频道公告表';
```

### 4.2 决策记录

| 决策 | 选项 | 原因 |
|------|------|------|
| 独立表 vs `community_channel_post` 加 `is_announcement` 字段 | **独立表** | R1/R5/R6：避免帖子和公告互相耦合；公告没有评论、不能被审核复用到、清理策略可能不同 |
| 字段命名 | `community_channel_announcement` | 与现有 `community_channel_post/comment/notification` 命名一致 |
| `content_format` 默认 `html` | 与帖子一致 | 复用现有 `<editor>` 链路 |
| `images` 存 JSON 字符串 | 与帖子一致 | 复用现有 `image-grid` 组件与 `parsePostContent` 工具 |
| `status` 走硬删 | 与频道删帖策略一致 | 不需要软删除/回收站（非目标 R7） |
| 不存 `comment_count` 等帖子属性 | 公告无评论 | 减少冗余 |

---

## 五、后端 API 设计

### 5.1 API 列表

| # | 方法 | 路径 | 说明 | 权限 |
|---|------|------|------|------|
| A1 | GET | `/api/v1/community/channels/{channel_id}/announcements` | 公告列表（分页，按 `create_time DESC`） | 频道成员 |
| A2 | POST | `/api/v1/community/channels/{channel_id}/announcements` | 发布公告 | 频道管理员 |
| A3 | GET | `/api/v1/community/channels/{channel_id}/announcements/{ann_id}` | 公告详情 | 频道成员 |
| A4 | DELETE | `/api/v1/community/channels/{channel_id}/announcements/{ann_id}` | 删除公告 | 发布人 / 频道管理员 |
| A5 | GET | `/api/v1/community/channels/{channel_id}/announcements/summary` | 公告数与最近一条（用于默认 tab 判断） | 频道成员 |

### 5.2 请求 / 响应契约

#### A2 发布公告请求体

```json
{
  "title": "本周六活动调整通知",
  "content": "<p>...</p>",
  "content_format": "html",
  "images": ["/uploads/..."]
}
```

字段约束（与 `CommunityChannelPostCreate` 对齐）：

| 字段 | 类型 | 必填 | 限制 |
|------|------|------|------|
| title | string | 是 | 1-120 字符，trim 后非空 |
| content | string | 是 | 1-10000 字符，trim 后非空 |
| content_format | string | 否 | 默认 `html` |
| images | string[] | 否 | 最多 9 张；每张需 `/uploads/...` 或 `http(s)://` 开头；最长 500 字符 |

#### A1 公告列表响应

```json
{
  "items": [
    {
      "id": 12,
      "channel_id": 34,
      "author_user_id": 7,
      "author_name": "王老师",
      "author_avatar_url": "/uploads/...",
      "author_update_time": "2026-06-10T12:00:00",
      "title": "本周六活动调整通知",
      "content": "<p>...</p>",
      "content_format": "html",
      "images": ["/uploads/..."],
      "create_time": "2026-06-13T10:00:00",
      "update_time": "2026-06-13T10:00:00"
    }
  ],
  "total": 3
}
```

#### A3 公告详情响应

同 A1 的 item 字段，单独返回。无 `preview_comments` 字段（公告无评论）。

#### A5 公告概要响应

```json
{
  "total": 3,
  "latest": {
    "id": 12,
    "title": "本周六活动调整通知",
    "create_time": "2026-06-13T10:00:00"
  } | null
}
```

### 5.3 权限与安全

| 场景 | 行为 | 错误码 / 提示 |
|------|------|---------------|
| 非成员访问 A1/A3 | 拒绝 | 403 `你不是该频道成员` |
| 非频道管理员调 A2 | 拒绝 | 403 `仅频道管理员可发布公告` |
| 跨租户访问任意接口 | 拒绝 | 404（避免泄漏存在性） |
| 已删除公告调 A3 | 返回 404 | 404 `公告不存在` |
| 跨频道访问 A3（URL 错配） | 校验 `ann.channel_id == path.channel_id` 后 404 | 404 `公告不存在` |
| 公告删除 A4 | 仅发布人或频道管理员可删 | 403 |
| 管理员免审 | 与现有帖子规则一致（D17）：频道管理员发布的公告直接 `status=1`，不走内容安全 | — |

### 5.4 复用与一致性

| 复用点 | 复用什么 | 不复用什么 |
|--------|----------|------------|
| 字段校验 | `CommunityChannelPostCreate.validate_*` 可抽公共 | — |
| 图片上传 | 现有 `api.uploadCommunityImage` | — |
| 富文本存储 | `content_format='html'` + `content` 存 HTML | 评论/通知 |
| 头像解析 | `resolve_avatar_url`（CRUD 层） | — |
| HTML 渲染 | 小程序 `<rich-text nodes>` 走 `community-post-detail` 同款解析 | — |
| 频道成员守卫 | `_ensure_channel_member` / `_ensure_channel_exists` | — |
| 管理员免审分支 | `member.role == 'admin'` 直接 `status=1` | 复用帖子 D17 规则 |

### 5.5 资源清理

- **删除频道** → 现有 `DELETE /channels/{id}` 逻辑已级联清理帖子/评论/成员/通知。**本次扩展**：同步级联清理 `community_channel_announcement`（按 `channel_id`）。
- **踢出成员** → 公告不属于个人，无需迁移。
- **禁言成员** → 公告只读，不影响禁言语义。

---

## 六、小程序设计

### 6.1 新增页面

| 页面 | 路径 | 角色 | 文件 |
|------|------|------|------|
| 公告列表 | `pages/community-announcement-list/community-announcement-list` | 频道成员 | `.wxml / .wxss / .js / .json` |
| 公告详情 | `pages/community-announcement-detail/community-announcement-detail` | 频道成员 | `.wxml / .wxss / .js / .json` |
| 发布公告 | `pages/community-announcement-create/community-announcement-create` | 频道管理员 | `.wxml / .wxss / .js / .json` |

### 6.2 改造页面

| 页面 | 改动 |
|------|------|
| `pages/community-post-list/community-post-list` | 顶部「page-head（动态标题）」之下、动态列表之上**新增**「📢 公告（N）」入口卡片（仅当 `N > 0` 时渲染）；右上角操作区拆为「+ 发公告」「+ 发动态」两个独立按钮（仅管理员可见发公告）。**该页仍是频道入口页**（`onOpenChannel` 跳它，不新增 tab 容器页） |
| `pages/community-channel-manage/community-channel-manage` | 不变（公告不进入成员管理） |
| `app.json` | 注册 3 个新页面路由 |
| `utils/api.js` | 新增 5 个 API（含 summary）：`getCommunityChannelAnnouncements / createCommunityChannelAnnouncement / getCommunityChannelAnnouncementDetail / deleteCommunityChannelAnnouncement / getCommunityChannelAnnouncementSummary` |
| `utils/auth.js` | 不变（`isAdmin` 仅指 RBAC，频道管理员是另一概念；频道管理员通过后端 `community_channel_member.role='admin'` 判定） |
| `utils/tenant.js` | 不变 |

### 6.3 页面结构

#### 6.3.1 community-post-list（改造点）

- **新增：公告栏入口卡片**
  - 位置：`page-head`（"社区动态"）之下、`<view class="feed-list">` 之上
  - 渲染条件：`announcementCount > 0`（通过 `announcements/summary` 拉 `total` 决定）
  - 结构：`<view class="announcement-entry" bindtap="onOpenAnnouncementList">`
    - 左侧：📢 图标（用文字 `📢` 或 `assets/icons/announcement.png`）
    - 中间：标题 `公告` + 副标题 `共 N 条`
    - 右侧：右箭头 `›`
  - 整张卡为 `surface-card` 样式；点击 `wx.navigateTo` 到 `community-announcement-list`
  - **不**展示最近一条公告预览、**不**展示发布时间、**不**展示发布人
- **新增：右上角「+ 发公告」按钮**
  - 渲染条件：`channelRole === 'admin'`
  - 位置：在现有 `+` 按钮**左侧**新增一个 `+ 公告` 文字按钮（避免和「+」发动态混淆）
  - 事件：`onCreateAnnouncement` → 跳 `community-announcement-create`
- **不变**：动态流渲染、评论展开、底部加载更多等所有现有行为
- **数据流**：进入时并发拉取 `posts?skip=0&limit=N` 和 `announcements/summary`；下拉刷新时也同时重拉

#### 6.3.2 community-announcement-list

- 头部：复用 `page-hero` 或简化为自定义顶部栏，标题「公告」。
- URL 参数：`channelId`、`channelName`、`channelRole`（与 `community-post-list` 一致；通过 `tenant.appendTenantToUrl` 注入）
- 列表：`surface-card` 列表，每条卡片包含：
  - 标题（最多 2 行）
  - 发布时间（相对时间 + 绝对时间）
  - 摘要（首张图缩略图 + 纯文本前 80 字）
  - 发布人头像 + 名称
- 卡片操作：长按/右上角「···」菜单（仅 `isAuthor || channelRole==='admin'` 可见「删除」项）—— 二级确认弹窗
- 空状态：复用 `state-view`，文案「该频道还没有公告」。
- 加载更多：与现有帖子列表一致的分页按钮。
- 右上角：管理员显示「+ 发公告」按钮（与 post-list 同款）。
- **不要**显示评论数、点赞数、加载更多评论等帖子专属元素。

#### 6.3.3 community-announcement-detail

- 与 `community-post-detail` 视觉一致：自定义顶部 + 公告卡片 + 「发布人 · 时间」元信息。
- 渲染层：复用 `<rich-text nodes>` 解析 HTML（与帖子详情同源）。
- **不**显示评论、**不**显示评论输入框、**不**显示评论列表。
- 底部：仅当 `isAuthor || channelRole==='admin'` 时显示「删除」按钮，二次确认后调 A4，成功后 `navigateBack` 到列表页。

#### 6.3.4 community-announcement-create

- 复用 `community-post-create` 的 `<editor>` 编辑器链路，**复制并裁剪**：
  - 保留：自定义顶部栏、标题输入、富文本编辑器、工具栏、图片插入、字数统计、发布按钮。
  - 移除：任何与帖子相关的字段。
  - 不需要 `content_format` 显式选择（默认 `html`）。
- 提交：`api.createCommunityChannelAnnouncement({ title, content, content_format: 'html', images })`。
- 失败：复用现有 toast + 错误条。
- 成功：toast + 1s 后 `navigateBack`；通过 `getCurrentPages()` 找到上一页（`community-post-list`），调用其 `onShow`/`reload` 即可（post-list 的 `onShow` 本来就会重拉 `announcements/summary`，无需额外标记）。

### 6.4 不再使用 tab 容器页

原 §6.4 方案 A（新增 `community-channel-tabs` 容器页）已**撤销**。理由：

- 形态 A（顶部公告栏入口卡片 + 下方动态流）天然只需要在 `community-post-list` 顶部加一张卡片，**不需要**额外的容器页。
- `community-channel-tabs` 容器页会引入 `data.activeTab`、回跳状态、跨页传参等复杂度，但用户根本看不到「切换 tab」这个动作（公告栏是置顶卡片，不是同级 tab），加容器页是过度设计。
- 维持现有 `onOpenChannel → community-post-list` 的入口链路不变，老链路零改动。

### 6.5 公告数获取策略

- `community-post-list` 进入时**并发**调用：
  - `api.getCommunityChannelPosts(channelId, { skip: 0, limit: PAGE_SIZE })`
  - `api.getCommunityChannelAnnouncementSummary(channelId)` ← 新增 A5
- 公告栏入口卡片是否渲染完全由 `summary.total > 0` 决定，不需要后端返回布尔。
- 下拉刷新时也重拉 summary。

---

## 七、交互细节

### 7.1 入口可见性

| 角色 | 频道详情内可见的操作 | 依据 |
|------|----------------------|------|
| 频道管理员 | `[+ 发公告]` `[+ 发动态]` 两个按钮 | `channelMember.role === 'admin'` |
| 普通成员 | `[+ 发动态]` 一个按钮 | `role === 'member'` |
| 平台超级管理员 | 同频道管理员（管理员发布免审规则的延伸） | `ctx.has_any_role(db)`，与现有帖子 D17 一致 |

### 7.2 公告删除（本期暴露）

- **API**：A4 `DELETE /community/channels/{channel_id}/announcements/{ann_id}`，权限校验在后端。
- **入口 1（公告详情页底部）**：
  - 渲染条件：`user_id === announcement.author_user_id || channelRole === 'admin'`
  - 按钮位置：详情卡片底部、整页最下方；样式为「文字式」危险色按钮（参考活动详情页底部「取消报名」样式）
  - 行为：点击 → `wx.showModal` 二次确认 → 调 A4 → 成功后 `navigateBack` 回列表，列表自动重拉（依赖 `onShow`）
- **入口 2（公告列表卡片操作菜单）**：
  - 渲染条件：同上
  - 触发方式：每张卡片右上角 `···` 按钮（`wx.actionSheet`）→「删除」项
  - 行为同上，成功后只刷新当前列表（不 navigateBack）
- **非发布人 + 非管理员**：上述两个入口**不渲染**（不是 disabled，是直接不渲染——避免暴露无效操作）
- **后端兜底**：即使前端绕过，API 也会二次校验权限返回 403

### 7.3 错误提示

| 错误源 | 提示文案 |
|--------|----------|
| 非成员 | `你不是该频道成员，无法查看公告` |
| 非管理员发公告 | `仅频道管理员可发布公告` |
| 非发布人/非管理员删公告 | `你没有删除该公告的权限` |
| 跨租户 | `公告不存在`（避免泄漏） |
| 公告已删除 | `该公告已被删除` |
| 删除失败 | `删除失败，请稍后重试` |
| 网络异常 | `网络异常，请稍后重试` |

### 7.4 公告内容渲染

- HTML 渲染：`<rich-text nodes="{{richTextNodes}}">`。
- 图片懒加载：`lazy-load="{{true}}"`。
- 图片点击预览：`wx.previewImage({ current, urls })`。
- 富文本清洗：后端 `bleach` + BeautifulSoup 提图（D14），与帖子复用。

---

## 八、数据流与回跳

### 8.1 发布公告成功后

1. `wx.navigateBack` 回 `community-post-list`。
2. `community-post-list.onShow` 触发，自动重拉 `announcements/summary`。
3. 若新公告后 `total > 0`，公告栏入口卡片首次出现（或条数 +1），用户可点击进入列表。
4. **不**需要 `app.globalData.channelListDirty`（公告不修改频道元数据）。

### 8.2 删除公告成功后

- **从详情页删除**：`navigateBack` 回列表 → 列表 `onShow` 重拉，条目消失。
- **从列表页删除**：仅移除当前列表中的对应条目，**不**调用 `navigateBack`；同步**重新**调一次 `announcements/summary` 更新 `community-post-list` 上的入口条数（如果有上一页回退的可能）。

> 实现细节：列表页删除成功后，通过 `getCurrentPages()` 找到上一页；若上一页是 `community-post-list`，调用其 `onShow`/暴露的 `reloadAnnouncementEntry()` 即可。

### 8.3 查看公告详情后

- 返回列表页保持原 tab（无 tab，但保持列表已滚位置）。
- 详情页内部不调用 `navigateBack` 触发回跳。

---

## 九、技术决策表

| ID | 决策 | 备注 |
|----|------|------|
| **A-D1** | 公告是独立资源（独立表 + 独立 API + 独立页面） | R1/R5；不复用 post 表的 4 类原因见 §10.1 |
| **A-D2** | 公告无评论，不存 `comment_count` / 评论关联表 | R5 |
| **A-D3** | 管理员发布公告免审（与帖子 D17 一致） | 复用 SPEC-07 D17 |
| **A-D4** | 公告栏采用「动态流上方置顶入口卡片」形态，**不**用 tab 切换 | R4；UX 接近微信群公告/Teams Pinned Messages |
| **A-D5** | 复用 `<rich-text>` 解析 HTML，不引入新组件 | SPEC-07 D6 |
| **A-D6** | 入口在 `community-post-list` 顶部，**不**新增 tab 容器页 | §6.4；避免过度设计 |
| **A-D7** | 公告删除在本期 UI 中正常暴露（详情页底部 + 列表卡片操作菜单），权限由后端兜底 | R5 |
| **A-D8** | 公告不进入社区首页的铃铛未读数（无通知类型） | R5 |
| **A-D9** | 公告与帖子 API 路径并列：`announcements` / `posts` | R1 |
| **A-D10** | 资源清理：删除频道同步级联清理公告 | §5.5 |
| **A-D11** | 公告栏入口卡片仅展示「📢 公告 + 条数」，不展示最近一条预览 | §3.3；克制体验 |

### 9.1 R6 决策权衡（拆表 vs 复用 post 表）

R6 决议为**新建独立表**。若未来需推翻此决议重新评估，可参考以下代价对照：

| 维度 | 独立表（当前） | 复用 post 表 + `is_announcement` 字段 |
|------|----------------|--------------------------------------|
| **初期工程量** | 较高（建表 + 5 个 API + 3 页 + CRUD） | 较低（只加 1 个字段 + 2 个 API + 1 页） |
| **公告评论** | 不存 `comment_count`，零冗余 | 需 nullable 或在 list SQL 中特判 |
| **公告置顶/有效期** | 加字段不影响帖子 | 与帖子的 `is_pinned` 冲突，需新增 `ann_pin_expire_at` 等 |
| **查询索引** | 可针对公告访问模式（频道+时间）独立优化 | 两种访问模式共享索引，索引设计受牵制 |
| **审核链路** | 公告免审、帖子走审核的分支天然分离 | 需 `IF type='announcement' THEN bypass` 特判 |
| **推送通知（未来）** | 公告通知走站内信 `type='channel_announcement'`，不污染帖子通知 | 帖子通知和公告通知混在同一查询流 |
| **回滚/拆表成本** | 0（已是独立表） | 后期拆表要写数据迁移脚本、回填、外键重建 |

---

## 十、文件清单

### 10.1 后端

| 文件 | 改动 |
|------|------|
| `backend/sql/table.sql` | append `community_channel_announcement` CREATE TABLE |
| `backend/app/schemas.py` | 新增 `CommunityChannelAnnouncement` ORM |
| `backend/app/models/community.py` | 新增 `CommunityChannelAnnouncementCreate / Response / ListResponse / SummaryResponse` |
| `backend/app/crud/crud_community_channel.py` | 新增 `list_announcements / create_announcement / get_announcement_detail / delete_announcement / get_announcement_summary` |
| `backend/app/api/v1/endpoints/community.py` | 新增 5 个路由（A1-A5）；删除频道时级联清理 |

### 10.2 小程序

| 文件 | 状态 |
|------|------|
| `miniprogram/pages/community-announcement-list/` | 新建 |
| `miniprogram/pages/community-announcement-detail/` | 新建 |
| `miniprogram/pages/community-announcement-create/` | 新建 |
| `miniprogram/pages/community-post-list/` | 改造：顶部加公告栏入口卡片 + 右上角「+ 发公告」按钮；onLoad/onShow 并发拉取 `announcements/summary` |
| `miniprogram/pages/community/index.js` | 不变（仍跳 `community-post-list`） |
| `miniprogram/app.json` | 注册 3 个新页面路由 |
| `miniprogram/utils/api.js` | 新增 5 个 API（4 个基础 + 1 个 summary） |
| `miniprogram/tests/community-channel-announcement.test.js` | 新建（前端单元测试） |

### 10.3 文档

| 文件 | 状态 |
|------|------|
| `docs/specs/SPEC-11_社区-频道公告.md` | 本文档 |
| `docs/handover/社区-公告.md` | 实施完成后新建（技术交接） |
| `docs/insights/社区-公告.md` | 实施完成后新建（产品思考） |
| `docs/specs/SPEC-01_产品总规格.md` | 「社区能力」表格加一行「频道公告」，实现状态按阶段更新 |
| `docs/specs/SPEC-05_社区-频道功能.md` | 末尾「规格变更记录」追加本次变更 |
| `docs/specs/SPEC-07_社区-频道Phase2-UI大改.md` | 实施看板追加 A-D1 ~ A-D11 |

---

## 十一、风险与回滚

| 风险 | 等级 | 应对 |
|------|------|------|
| 管理员免审公告被恶意刷屏 | 中 | 公告是管理员自主行为，与频道管理员质量等同；后续可加频控 |
| 公告数量过大（1000+）撑爆单页 | 低 | 与帖子分页一致，按 `create_time DESC` 翻页 |
| 跨频道公告 ID 撞库 | 低 | 列表/详情都校验 `channel_id` 一致性 |
| 删除频道未级联清理 | 中 | 必须改 `DELETE /channels/{id}` 的级联逻辑；写测试覆盖 |
| 旧版小程序访问公告 API 报错 | 中 | 新增路径与旧路径无重叠；旧版未升级不会主动调公告 API，安全 |
| 与帖子 ID 混淆（详情页串号） | 低 | API 路径区分，DB ID 自增不区分；前端按 URL 参数路由到对应页 |

---

## 十二、验证清单

### 12.1 后端

- [ ] `pytest backend/tests/api/test_community_announcements.py` 全通过
  - 列表分页、按 `create_time DESC`
  - 发布：管理员成功 / 成员 403
  - 发布免审：管理员直接 `status=1`，无审核流
  - 详情：跨频道 404
  - 详情：跨租户 404
  - 删除：仅发布人或频道管理员可删
  - 删除频道级联清理 `community_channel_announcement`
- [ ] `pytest backend/tests/api/test_community_channels.py` 仍通过（删频道级联）
- [ ] `pytest backend/tests/api/test_community.py` 仍通过（兼容旧接口）

### 12.2 小程序 IDE

- [ ] 管理员进入某频道，动态流顶部能看到「📢 公告（N）」入口卡片（`N > 0` 时）
- [ ] 频道无公告时，**不**显示入口卡片（验证不会留下空位）
- [ ] 管理员点「+ 发公告」进入发布页，输入富文本+图片可正常发布
- [ ] 发布成功后回到 `community-post-list`，公告栏条数 +1
- [ ] 点入口卡片进入 `community-announcement-list`，首条为新公告
- [ ] 公告详情页可正常渲染 HTML 与图片
- [ ] 公告详情页**无**评论区、无评论输入框
- [ ] 公告详情页底部对**发布人本人**显示「删除」按钮；对**其他管理员**显示；对**普通成员**不显示
- [ ] 公告列表卡片右上角 `···` 菜单对**发布人/频道管理员**显示「删除」；对其他人不显示
- [ ] 点击「删除」→ 二次确认 → 删除成功，列表条目消失
- [ ] 删除失败时正确显示错误 toast
- [ ] 公告列表右上角对管理员显示「+ 发公告」按钮；对普通成员不显示
- [ ] 普通成员点不到「+ 发公告」按钮
- [ ] 非成员访问公告列表/详情：API 返回 403，前端正确提示「你不是该频道成员」

### 12.3 权限系统设计原则回归

按 [权限系统设计原则.md §5 检查清单](../handover/权限系统设计原则.md) 逐条核对：

- [ ] 没有新增 `ctx.role == "admin"` 的硬拦截（公告权限走 `community_channel_member.role`，**不是 RBAC**）
- [ ] `scope_type` 判定未受影响
- [ ] 没有在前端新增二次权限过滤
- [ ] 没有在 SQL 中将 `User.name/phone` 当列查询
- [ ] 混合账号场景：管理员同时是某频道成员时，发公告/发动态两个入口均可用

---

## 十三、规格变更记录

| 日期 | 变更 | 关联 |
|------|------|------|
| 2026-06-14 v1 | 立项：基于用户「发公告和发帖子是独立入口」需求，本期落定独立表 + 独立页 + tab 切换的产品形态 | 本文档 |
| 2026-06-14 v1.1 | 推翻 tab 切换形态，改为「动态流上方公告栏入口卡片」（形态 A），理由：tab 形态需要新增 `community-channel-tabs` 容器页，但用户实际看不到切换动作，公告栏卡片是更克制、对现有链路零改动的方案 | R4 / §3.1 / §6.4 / A-D4 |
| 2026-06-14 v1.1 | 公告删除从「本期不上 UI」改为「本期 UI 正常暴露」，入口为详情页底部按钮 + 列表卡片 `···` 菜单，按钮渲染条件 `isAuthor || channelRole==='admin'`；后端 API 二次校验兜底 | R5 / §7.2 / A-D7 |
