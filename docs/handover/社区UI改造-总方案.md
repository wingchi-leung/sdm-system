---
title: 社区UI改造 - 总方案
date: 2026-06-10
author: 总建筑师 agent(综合)
status: 待用户评审 v1
related:
  - 社区UI改造-00-现状摸底.md
  - 社区UI改造-需求基线.md
  - 社区UI改造-01-架构蓝图.md
  - 社区UI改造-02-设计规范基线.md
  - 社区UI改造-03-前端重构方案.md
  - 社区UI改造-04-后端接口方案.md
---

# 社区 UI 改造 — 总方案 v1

> 本文档是「小程序社区模块 UI 大改」项目第一阶段的**总建筑师综合方案**。
> 输入: 4 份子方案(架构 / 设计 / 前端 / 后端) + 现状摸底 + 需求基线。
> 输出: 可执行 TODO 清单(供 Phase 2 工程师 agent 领任务) + 冲突仲裁 + 上线节奏 + 索引。
>
> **重要原则**(来自需求基线,全程执行):
> 1. **以源码为准** —— spec 与代码不一致时,反向改 spec;
> 2. **不依赖 spec 未实现的接口** —— 置顶/官方/转让管理员等本期不做;
> 3. **DB 变更** —— 新表写 `table.sql`、改字段写 `field.sql`,**禁止** 走 `db_migrations.py`;
> 4. **权限改动前置阅读** —— 必读 `权限系统架构文档.md` + `权限系统设计原则.md`;本期已确认不新增 `ctx.role == "admin"` 硬拦截(见 §6.3)。

---

## 1. 改造概览

### 1.1 目标 / 范围 / 节奏

**目标**: 小程序社区模块**视觉 + 交互 + 新功能**的最大力度改造(需求基线已确认)。

**范围**(已与用户确认):
- ✅ 社区首页 / 信息流(需求 1 主战场)
- ✅ 帖子详情页 + 评论交互(详情页角色重新定义: 降级为深链兜底页)
- ✅ 发布/编辑页(需求 2 富文本 + 多图)
- ✅ 频道创建(需求 3 头像)
- ⚪ 顺手扩展(架构师评估后纳入 P1): 审核中心风格统一、通知中心视觉、tabBar 社区专属图标、--green token 修正、铃铛组件化

**节奏**:
- **第一阶段**(已完成): 4 agent 并行调研 → 本总方案评审
- **第二阶段**(等设计稿): 设计师翻译令牌/组件 → 前端 + 后端并行实施 → 每 PR commit + 同步更新 `docs/specs/产品规格说明-spec.md`

### 1.2 新功能子集决策(从架构师方案摘要)

| 决策项 | 决议 | 理由 |
|--------|------|------|
| 详情页 `community-post-detail` 存废 | **保留为"分享/深链兜底页"**,主流交互走瀑布流 | 失去深链落点;UX 扁平化;与"评论原位展开"不冲突 |
| 频道创建交互 | **新建独立页** `pages/community-channel-create`,替换 `wx.showModal` | spec §4.2.2 已规划,后端字段已支持 |
| 频道创建入口 | 顶部 hero 工具按钮(铃铛右侧的 "+"),仅 admin 可见 | 与"管理员才能创建频道"的业务一致 |
| `community_post.channel_id` 字段 | **加字段**,`activity_id` 改为可空(互斥约束应用层) | 消除 spec/code/SQL 三方漂移 |
| 评论富文本化 | **本期不做** | 需求 2 仅约束发布页,评论留 P2 |
| 老 activity 级帖子迁移 | **本期不迁移**,允许 `activity_id` 填充 0/sentinel | 工作量/风险/收益不匹配 |
| 转让管理员 / 置顶 / 官方 / DELETE | **本期不实现** | 需求基线"不依赖 spec 未实现接口" |
| Web 端 / Flutter 端接入 | **本期不动** | API 改造时预留契约 |

### 1.3 关键技术决策汇总

| # | 决策点 | 决议 | 出处 |
|---|--------|------|------|
| D1 | 瀑布流实现 | **自研 2 列 `scroll-view` + JS 调度**(矮列优先) | 架构师 §3.1, 前端 §2.1 |
| D2 | 富文本选型(写入端) | **微信原生 `<editor>` + 自研 `html2blocks` 转换** | 架构师 §3.2, 前端 §3.1 |
| D3 | 富文本存储格式 | **JSON blocks(主存) + Markdown 兜底(老数据)** | 架构师 §3.2, 后端 §4 |
| D4 | `content` 字段升级 | `MEDIUMTEXT`,新增 `content_format` + `content_blocks` | 后端 §4 / §8.3-8.5 |
| D5 | 频道头像上传 | **新增** `POST /community/channels/avatar-upload` 单独通道,走微信 `media_check_async` | 后端 §6.3 |
| D6 | 列表接口带 `top_comments` | **加在 `CommunityChannelPostResponse`**,N=2 条 | 后端 §5.1 |
| D7 | 评论分页 | 沿用 `skip/limit`,**不切换 cursor** | 后端 §5.2 / §9.1 |
| D8 | 跨端策略 | **API 直接暴露 `channel_id` / `content_blocks`**,Web 端未来只写 renderer 即可消费 | 架构师 §5.1 |
| D9 | 详情页角色 | **降级为只读兜底页**;移除评论区 + 输入栏,顶部"返回社区"按钮 | 架构师 §1.2 |
| D10 | 状态管理 | **不引入 store**,使用 `app.globalData.bus` 事件总线 + `wx.setStorage` 持久化 | 前端 §6.2 |
| D11 | 铃铛入口统一 | 抽公共 `<floating-bell>` 组件,首页移除内联 `hero-bell` | 前端 §1.3, 架构师 §1.3 |
| D12 | 组件库抽离优先级 | `state-view` / `image-grid` / `surface-card` / `page-hero` / `comment-composer` / `floating-bell` 6 个 P0 组件 | 前端 §1.3 |
| D13 | 设计令牌收口 | 4 类变更: [新增] / [修正] / [废弃] / [对齐];设计师稿到位后批量改 `app.wxss` | 设计师 §2.7 |
| D14 | 草稿存储 | `wx.setStorageSync('community_post_draft_<channelId>')`,24h 失效 | 前端 §3.2.4 |
| D15 | 上传并发 | 3 并发 + 失败 2 次重试,工具函数 `utils/concurrency.js` | 前端 §3.2.2 |
| D16 | 审核失败提示 | 短期: 前端发布后 5s 轮询 `GET /posts/{pid}` 检查 `status` | 后端 §7.5 |

---

## 2. 信息架构与页面清单

> 出处: 架构师 §1.3(本节图示为 ASCII 重绘,内容与原文等价)

### 2.1 As-Is 信息架构

```
                       custom-tab-bar (Tab 1 = 社区, 复用 activity 图标)
                                    │
                                    ▼
              community/index  社区首页 / 我的频道列表
                            ┌─────┴─────┐
                            ▼           ▼
              community-post-list   community-post-detail
              (频道动态流)          (动态详情 + 评论区)
                            │
                            ▼
              community-post-create (块编辑器)

              community-moderation (管理员审核)
              community-notifications (站内信)
```

**As-Is 痛点**:
- 详情页是"必经路径"(要评论必跳)
- 详情页 ↔ 列表来回跳转,回流成本高
- 频道创建用 `wx.showModal` 只支持名称
- 6 个页面视觉割裂(尤其审核页全硬编码色值)
- tabBar 社区图标复用活动图标,无辨识度
- 铃铛两套视觉(组件 vs 内联)

### 2.2 To-Be 信息架构(本次改造)

```
                       custom-tab-bar (Tab 1 = 社区, 新 channel 图标)
                                    │
                                    ▼
        ┌───────────────────────────────────────────────────┐
        │  community/index  社区首页                          │
        │   - 顶部: 频道 chips(横向滚动)                       │
        │   - 主体: 2 列瀑布流(卡片高度内容驱动)                │
        │   - 卡片交互:                                       │
        │     点击空白 → 原位展开/收起全文                     │
        │     点击"评论 N" → 原位展开评论(分页懒加载)            │
        │     长按 / 右上"..." → 举报/复制链接                  │
        └────────┬────────────┬──────────────┬───────────────┘
                 │ +            │ 分享/扫码/深链 │ 管理员入口
                 ▼              ▼                ▼
        ┌─────────────────┐  ┌─────────────────────┐
        │ community-      │  │ community-post-     │
        │ channel-create  │  │ detail [降级兜底页] │
        │ (名称/描述/头像) │  │ (无评论区/输入栏)    │
        └─────────────────┘  └─────────────────────┘

   ┌────────────────────┐  ┌────────────────────┐
   │ community-post-    │  │ community-         │
   │ create             │  │ moderation         │
   │ (富文本 + 多图)    │  │ (顺手 token 化)     │
   └────────────────────┘  └────────────────────┘

   ┌────────────────────┐
   │ community-         │
   │ notifications      │
   │ (顺手视觉)         │
   └────────────────────┘
```

**To-Be 关键变化**:
1. **新增** `pages/community-channel-create/` 独立页(替换 `wx.showModal`)
2. **保留** 6 个原页面,但 `community-post-detail` 降级为只读兜底页
3. **首页重构** 为"我的频道 chip + 2 列瀑布流"双层结构
4. **tabBar 图标** 拆出 `channel-default.png` / `channel-active.png`
5. **站内信铃铛** 抽公共组件,统一参数

### 2.3 页面清单与角色矩阵

| # | 页面 | To-Be 角色 | 改造类型 | 优先级 |
|---|------|-----------|----------|--------|
| P1 | `community/index` | 社区首页: 频道 chips + 瀑布流 | **重写** | P0 |
| P2 | `community-post-list` | 单频道瀑布流(主战场) | **重写** | P0 |
| P3 | `community-post-detail` | 降级兜底页(分享/深链) | **降级** | P0 |
| P4 | `community-post-create` | 富文本 + 多图 | **重写** | P0 |
| P5 | `community-channel-create` | 新建: 名称/描述/头像 | **新建** | P0 |
| P6 | `community-moderation` | 审核中心 | **顺手改** | P1 |
| P7 | `community-notifications` | 站内信 | **顺手改** | P1 |

### 2.4 路由与 tabBar 变更

- `app.json` 新增路径: `pages/community-channel-create/community-channel-create`
- `app.json:50-52` + `custom-tab-bar/index.js:10-13`: 替换为 `channel-default.png` / `channel-active.png`
- 详情页路由**保留**,但**默认入口不再跳它**(瀑布流卡片自包含);深链分享仍可跳

---

## 3. 设计规范摘要

> 出处: 设计师 §1-2(本节抽取关键决策 + 缺口)

### 3.1 必须修复的令牌缺口(清单)

#### **[修正] token**(语义被破坏或值错误)

| 变量 | 原值 | 修正为 | 理由 | 涉及文件 |
|------|------|--------|------|----------|
| `--green` | `#000000` | **重命名为 `--link`**(或加注释"已废弃");`--link` 用真值(如 `#2F6FE8`) | 链接色 = 黑色 = 不可见 | `community-post-list.wxss:148` 等 |
| `--success` | `#000000` | `#12B76A` 或 `#1F7A45` | "成功" = 黑色,语义错 | 注释/取值修正 |
| `--success-bg` | `rgba(0,0,0,0.08)` | `rgba(18,183,106,0.10)` | 同上 | — |
| `--accent` | `#000000`(注释"优雅金色") | 待设计稿定 | 注释撒谎 | — |
| `--accent-dark` | `#000000` | 待设计稿定 | 同上 | — |
| `--radius-lg` | `16rpx` | `20rpx` 或删除 | 与 `--radius-md` 同值,语义重复 | `app.wxss:93` |
| `--text-soft` / `--text-tertiary` | 同 `#999999` | 合并二选一 | 语义重复 | — |

#### **[新增] token**(Phase 2 设计稿到位后写入 `app.wxss`)

| 类别 | 变量(数量) | 用途 |
|------|------------|------|
| **链接** | `--link`, `--link-hover` | 替代 `--green` |
| **审核** | `--approve`, `--approve-bg`, `--reject`, `--reject-bg`, `--warning`, `--warning-bg` | 审核页 / 通知页通过/驳回/警告 |
| **背景** | `--surface-gradient-hero` | 页面顶部渐变底 |
| **CTA** | `--cta-bg` | 主 CTA 背景(与 `--ink` 区分) |
| **阴影** | `--shadow-hero`, `--shadow-card`, `--shadow-card-unread`, `--shadow-cta` | 4 类硬编码阴影 token 化 |
| **页面间距** | `--page-padding-x`, `--page-padding-y`, `--card-gap` | 页面/卡片间距统一 |
| **动效** | `--duration-fast`, `--duration-standard`, `--duration-slow`, `--ease-emph`, `--ease-std` | 过渡时长/曲线 |
| **字号** | `--font-size-eyebrow`, `--font-size-caption`, `--font-size-body`, `--font-size-title-md`, `--font-size-title-lg` | 6 个字号档位 |

> 完整清单见 `02-设计规范基线.md` §2.7(约 30 个新 token + 7 个修正 + 15 个废弃)。

#### **[废弃] token**(标记 `@deprecated`)

- `--primary-light` / `--primary-glow` / `--accent-light` / `--accent-dark` —— 未消费
- `--status-not-started` / `--status-ongoing` / `--status-ended` —— 偏活动状态,社区不用
- `--form-surface-soft` / `--background-elevated` / `--background-warm` / `--paper` —— 未消费
- `--shadow-xs` / `--shadow-sm` / `--shadow-md` / `--shadow-lg` / `--shadow-elevated` —— 未消费
- `--space-2xl` / `--space-3xl`, `--radius-xs` / `--radius-sm` —— 未消费

### 3.2 必须新建的组件清单

> 出处: 设计师 §3 + 前端 §1.3(两边清单整合去重)

| 组件 | 层级 | 涉及页面 | 优先级 | 设计师必出 |
|------|------|----------|--------|-----------|
| **WaterfallCard** | 组织层 | `community-post-list`, `community-post-detail` | P0 | 7 个状态(默认/按下/展开/有评论/官方/置顶/已读) |
| **CommentInline** | 组织层 | `community-post-list`(原位), `community-post-detail` | P0 | 单条评论布局、嵌套回复 |
| **RichTextEditor** | 组织层 | `community-post-create` | P0 | 工具栏 + 编辑区 + 占位 + 错误态 |
| **AvatarPicker** | 组织层 | `community-channel-create` | P0 | 占位 / 选中 / 上传中 / 错误 |
| **ChannelCard** | 组织层 | `community/index` | P0 | 频道列表项 |
| **NotificationItem** | 组织层 | `community-notifications` | P0 | 未读/已读/接受/拒绝 |
| **AuditCard** | 组织层 | `community-moderation` | P1 | 4 类分组卡片 |
| **state-view** | 分子层 | 6+ 页 | P0 | loading / error / empty 三态 |
| **image-grid** | 分子层 | post-detail / post-create / channel-create / mine | P0 | 1/3/4/9 宫格 |
| **surface-card** | 分子层 | 6+ 页 | P0 | 白卡容器 + 圆角 + 阴影 |
| **page-hero** | 分子层 | community/index, post-list, channel-create | P0 | hero 区 |
| **comment-composer** | 分子层 | post-list(原位), post-detail(底部) | P0 | 输入框 + 图片多选 + 发送 |
| **floating-bell**(重写) | 原子层 | mine, index, community(3 处统一) | P0 | 铃铛 + 未读红点 |
| **icon-button** | 分子层 | community/index, post-list, moderation | P1 | 含 badge |
| **empty-state** | 分子层 | 5+ 页 | P1 | 图标 + 文案 + CTA |
| **pill** / **badge-dot** | 原子层 | 多页 | P1 | 小颗粒 |
| Avatar / Badge / Tag / Icon / Button / Input | 原子层 | 全局 | P0 | 6 个基础原子 |

### 3.3 设计稿到位后的工作流(给用户预期)

```
T+0  用户出设计稿(Figma/Sketch/蓝湖/静态图)
     └─ 必备: 5 个主页面高保真 + 关键弹层 + 令牌面板

T+2d 设计师 agent 翻译
     ├─ 提取色板 → 写入 app.wxss 新增/修正 token
     ├─ 提取字号/间距/圆角/阴影 → 比对更新令牌
     ├─ 切图(头像默认图 / 空状态插画 / 加载占位)
     ├─ 切 Tab 图标(channel-default/active, 2x/3x)
     └─ 输出 "组件 props 规范表" + "Figma → wxss 对照表"

T+3d 设计师交付 → 前端并行实施
     ├─ 前端 PR-1: 组件层脚手架 + token 替换
     ├─ 前端 PR-2: 频道创建独立页(快赢)
     ├─ 前端 PR-3: 富文本编辑器
     ├─ 前端 PR-4~6: 瀑布流骨架 + 展开 + 评论原位
     ├─ 前端 PR-7: 详情页降级
     └─ 前端 PR-8~10: 顺手改(community/index, moderation, notifications)

     同步进行(后端)
     ├─ BE-1: ALTER community_post(channel_id, content_format, content_blocks, MEDIUMTEXT) → field.sql
     ├─ BE-2: ORM + Pydantic 同步(schemas.py + models/community.py)
     ├─ BE-3: API 改造(/channels/{id}/posts 加 top_comments)
     ├─ BE-4: 新增 POST /community/channels/avatar-upload
     ├─ BE-5: 审核分支扩展(item_type=channel_avatar)
     └─ BE-6: CREATE TABLE community_channel_post / community_channel_comment / community_notification(若生产 DB 无)

每 PR commit → 同步更新 docs/specs/产品规格说明-spec.md + 触发权限红线 5 条自检(本期不涉及权限改动)
```

---

## 4. 后端数据模型与接口变更清单

> 出处: 后端 §8(本节汇总所有 SQL 草案与 API 变更;**用户最终确认后,后端 agent 才能写到 `field.sql` / `table.sql`**)

### 4.1 SQL 草案汇总(待用户确认)

| 编号 | 操作 | SQL 概要 | 优先级 | 落库文件 | 风险 |
|------|------|----------|--------|----------|------|
| **C-1** | ALTER | `community_post` ADD `channel_id` BIGINT NULL + KEY | P0 | `field.sql` | 低 |
| **C-2** | ALTER | `community_post` ADD `content_format` VARCHAR(16) DEFAULT 'text' | P0 | `field.sql` | 低 |
| **C-3** | ALTER | `community_post` ADD `content_blocks` JSON NULL | P0 | `field.sql` | 低 |
| **C-4** | ALTER | `community_post` MODIFY `content` MEDIUMTEXT NOT NULL | P0 | `field.sql` | 低 |
| **C-5** | ALTER | (合并到 C-1) 索引 | P0 | `field.sql` | — |
| **C-6** | **CREATE** | `community_channel_post` + `community_channel_comment`(若生产 DB 无) | P0 | `table.sql` | 中(需先核实) |
| **C-7** | **CREATE** | `community_notification`(若生产 DB 无) | P0 | `table.sql` | 中(需先核实) |
| **C-9** | ALTER | `community_media_moderation_task` `status` 注释与代码对齐 | P3 | `field.sql` | 低 |
| C-8 | — | (废弃) `item_subtype` 字段: 直接在 `item_type` 加 `channel_avatar` 枚举 | — | — | — |

**C-1 SQL 全文**:
```sql
ALTER TABLE community_post
  ADD COLUMN channel_id BIGINT NULL COMMENT '频道ID;与 activity_id 互斥,为 NULL 表示非频道动态' AFTER activity_id,
  ADD COLUMN content_format VARCHAR(16) NULL DEFAULT 'text' COMMENT '内容格式:text/markdown/blocks' AFTER content,
  ADD COLUMN content_blocks JSON NULL COMMENT '富文本 JSON blocks' AFTER content_format,
  MODIFY COLUMN content MEDIUMTEXT NOT NULL COMMENT '纯文本兜底(老数据)',
  ADD KEY idx_post_channel_id (channel_id);
```

**C-6 / C-7 必须先核实**: 生产 DB 上是否已手工建过这三张表。若已存在 → 跳过 `CREATE TABLE`;若不存在 → 走 `table.sql` 追加 `CREATE TABLE IF NOT EXISTS`(完整 DDL 见后端 §8.7-8.8)。

### 4.2 ORM 与 Pydantic 同步变更

| 位置 | 变更 |
|------|------|
| `backend/app/schemas.py` `CommunityPost` (370-378) | + `channel_id` / `content_format` / `content_blocks` 3 个 Column |
| `backend/app/schemas.py` `CommunityChannelPostResponse` 同源 DTO | + 上述 3 字段 |
| `backend/app/models/community.py` `CommunityChannelPostCreate` / `Response` | + `content_format` / `content_blocks`(均 Optional) |
| `backend/app/models/community.py` `CommunityChannelPostResponse` | + `top_comments: List[CommunityChannelCommentResponse] = []` |
| `backend/app/api/v1/endpoints/community.py` `POST /channels/{id}/posts` | 入参加 `content_format` / `content_blocks`;老数据兼容(content 默认 text) |
| `backend/app/api/v1/endpoints/community.py` `GET /channels/{id}/posts` | 出参 `items[].top_comments` (N=2) |
| `backend/app/api/v1/endpoints/community.py` `POST /community/channels/avatar-upload` | **新增** endpoint,强制 `mime` 检查 + 压缩 512x512 + 走 `media_check_async` |
| `backend/app/api/v1/endpoints/community.py` `_update_item_status` | **扩展分支** `item_type='channel_avatar'` → 改 `channel.status` |
| `backend/app/crud/crud_community_channel.py` `list_channel_posts` | "两次查询"模式拿 `top_comments`(主查询 + IN 二次查询) |

### 4.3 内容审核扩展(本期新增)

- `community_media_moderation_task.item_type` 枚举新增 `channel_avatar`
- 富文本拆解审核: 遍历 `content_blocks` 内 `paragraph` / `quote` 块累加文本 → 调 `check_text_security`;遍历 `image` 块累加 URL → 调 `media_check_async`
- 头像审核: 频道创建时若 `avatar_url` 非空 → 写 `community_channel.status=0` → 写 `community_media_moderation_task(item_type='channel_avatar', ...)` → 微信回调后改 `status=1/0`

### 4.4 错误码与契约(对前端)

- 沿用 HTTP 状态码 + 中文 `detail`(现成约定,不重构)
- 审核失败 → 后端 `status=0` 仍返回 200,前端在发布后 5s 轮询 `GET /posts/{pid}` 检查 `status`(0=审核中 / -1=已驳回 / 1=通过)
- 富文本块协议草案(待前后端最终对齐):
  ```ts
  type Block =
    | { type: 'paragraph'; text: string }
    | { type: 'heading'; level: 1|2|3; text: string }
    | { type: 'image'; url: string; width?: number; height?: number }
    | { type: 'quote'; text: string }
    | { type: 'code'; language?: string; text: string }
    | { type: 'mention'; user_id: number; text?: string };
  ```

---

## 5. 前端实施 TODO 清单(关键产出)

> 任务 ID 格式: `TODO-FE-NN`(前端) / `TODO-BE-NN`(后端) / `TODO-DS-NN`(设计) / `TODO-INT-NN`(集成)
> 优先级: P0(必做) / P1(顺手) / P2(后续)
> 工时: 人日估算(8h = 1 人日)
> 单 PR < 800 行变更

### 5.1 P0 — 必做(对应 3 项需求 + 详情页降级)

```
- [ ] [P0] TODO-FE-01 抽 state-view 组件(loading/error/empty 三态) [依赖:设计稿 / 设计师令牌输出] [4h] [验收:6+ 页统一接入,空态有图标+CTA+文案]
- [ ] [P0] TODO-FE-02 抽 surface-card 组件(白卡容器+圆角+阴影) [依赖:TODO-FE-01 / 令牌] [2h] [验收:6+ 页统一接入,token 化无硬编码]
- [ ] [P0] TODO-FE-03 抽 page-hero 组件(eyebrow+title+tools slot) [依赖:TODO-FE-01] [3h] [验收:3+ 页复用]
- [ ] [P0] TODO-FE-04 抽 image-grid 组件(1/3/4/9 宫格) [依赖:设计稿] [4h] [验收:5+ 页复用,多选/删除/添加 mode 切换]
- [ ] [P0] TODO-FE-05 抽 comment-composer 组件(输入框+图片多选+发送) [依赖:TODO-FE-04] [4h] [验收:post-list 原位 + post-detail 底部统一]
- [ ] [P0] TODO-FE-06 重写 floating-bell 组件(铃铛+未读红点) [依赖:设计稿] [3h] [验收:mine/index/community 三处视觉一致,props 化 top/right/size/unread-count]
- [ ] [P0] TODO-FE-07 新建 community-channel-create 独立页 [依赖:头像上传接口 BE-4] [6h] [验收:名称/描述/头像三字段,admin 权限拦截,成功后回首页触发 refresh]
- [ ] [P0] TODO-FE-08 删除 community/index.js:62-89 的 wx.showModal [依赖:TODO-FE-07] [1h] [验收:首页入口跳到 channel-create]
- [ ] [P0] TODO-FE-09 抽取 utils/concurrency.js(3 并发上传工具) [依赖:无] [2h] [验收:单元测试 5+ 用例,失败重试 2 次]
- [ ] [P0] TODO-FE-10 升级 utils/community-content.js 支持 HTML → JSON blocks 解析 [依赖:无] [4h] [验收:10+ fixture 覆盖 <p>/<img>/嵌套/特殊字符]
- [ ] [P0] TODO-FE-11 重写 community-post-create(微信原生 <editor> + 工具栏) [依赖:TODO-FE-09 / TODO-FE-10 / 富文本字段 BE-2/3] [16h] [验收:多图 3 并发,草稿 24h 恢复,字数 10000]
- [ ] [P0] TODO-FE-12 实现 WaterfallCard 组件 [依赖:设计稿 / TODO-FE-02] [8h] [验收:2 列错落,按内容自适应,点击展开支持,7 个状态齐全]
- [ ] [P0] TODO-FE-13 瀑布流分列算法 + 高度估算 [依赖:TODO-FE-12] [4h] [验收:单元测试 2 列长度差 ≤ 1,100 条 < 1ms]
- [ ] [P0] TODO-FE-14 重写 community-post-list(2 列瀑布 + 原位展开) [依赖:TODO-FE-12 / TODO-FE-13 / top_comments BE-3] [16h] [验收:首屏 20 条,onReachBottom 追加,展开平滑 240ms]
- [ ] [P0] TODO-FE-15 卡片"查看全部"原位展开 + 高度动画 [依赖:TODO-FE-14] [4h] [验收:全文-摘要差 ≤ 80rpx 不显示按钮,展开收起有过渡]
- [ ] [P0] TODO-FE-16 卡片评论原位展开(全局互斥 + 懒加载) [依赖:TODO-FE-05 / TODO-FE-14] [8h] [验收:前 3 条默认,加载更多分页,同一时刻只 1 卡片展开评论]
- [ ] [P0] TODO-FE-17 抽 utils/community-post-loader.js(详情页与瀑布流同源) [依赖:无] [3h] [验收:loadPostWithComments(channelId, postId) 单接口]
- [ ] [P0] TODO-FE-18 降级 community-post-detail 为只读兜底页 [依赖:TODO-FE-12 / TODO-FE-17] [4h] [验收:无评论区/输入栏,顶部"返回社区"按钮,数据走同源 loader]
- [ ] [P0] TODO-BE-01 ALTER community_post ADD channel_id + content_format + content_blocks + MODIFY MEDIUMTEXT [依赖:用户确认 SQL] [2h] [验收:field.sql 就绪,本地 ALTER 成功]
- [ ] [P0] TODO-BE-02 ORM 同步(schemas.py CommunityPost + 3 Column) [依赖:TODO-BE-01] [1h] [验收:模型字段与 SQL 一致,迁移脚本不报错]
- [ ] [P0] TODO-BE-03 Pydantic DTO 同步(CommunityChannelPostCreate/Response 加 content_format/content_blocks) [依赖:TODO-BE-02] [1h] [验收:前后端 schema 校验通过]
- [ ] [P0] TODO-BE-04 CommunityChannelPostResponse 加 top_comments 字段 [依赖:TODO-BE-03] [1h] [验收:openapi 文档可查]
- [ ] [P0] TODO-BE-05 CRUD list_channel_posts 改造"两次查询"模式拿 top_comments(N=2) [依赖:TODO-BE-04] [4h] [验收:单测覆盖 N=0/1/2/5,响应体大小可控]
- [ ] [P0] TODO-BE-06 核实 community_channel_post / community_channel_comment / community_notification 三表是否存在,若缺则 CREATE TABLE [依赖:无] [2h] [验收:生产 DB 状态确认,table.sql append 就绪]
- [ ] [P0] TODO-BE-07 新增 POST /community/channels/avatar-upload endpoint [依赖:复用 uploads.py:_optimize_avatar_image] [4h] [验收:mime 检查严格,512x512 压缩,trace_id 写入 task 表]
- [ ] [P0] TODO-BE-08 扩展 _update_item_status 处理 item_type='channel_avatar' [依赖:TODO-BE-07] [1h] [验收:微信回调后 channel.status 正确更新]
- [ ] [P0] TODO-BE-09 富文本拆解审核(遍历 content_blocks 文本/图片) [依赖:TODO-BE-02] [2h] [验收:单测覆盖 paragraph/quote/image/mention 块]
- [ ] [P0] TODO-BE-10 ALTER community_media_moderation_task status 注释同步 [依赖:无] [0.5h] [验收:DDL 注释与代码一致]
- [ ] [P0] TODO-BE-11 后端单元/集成测试补充(top_comments / content_blocks / 头像上传) [依赖:TODO-BE-05/6/7] [4h] [验收:pytest 全部通过]
```

### 5.2 P1 — 顺手改(视觉/质量)

```
- [ ] [P1] TODO-FE-19 重写 community/index(频道 chip + 2 列卡片 + 铃铛) [依赖:TODO-FE-03 / TODO-FE-06] [4h] [验收:瀑布热身,未读 badge 同步]
- [ ] [P1] TODO-FE-20 community-moderation 风格 token 化 + audit-card 抽组件 [依赖:TODO-FE-01 / is_official/is_pinned 字段读取] [4h] [验收:无硬编码色值,审核通过/驳回视觉化]
- [ ] [P1] TODO-FE-21 community-notifications 视觉统一 + notification-card 抽组件 [依赖:TODO-FE-01] [3h] [验收:与首页铃铛视觉一致]
- [ ] [P1] TODO-DS-01 切 Tab 图标 channel-default.png / channel-active.png(2x/3x) [依赖:无] [2h] [验收:与活动 Tab 同尺寸同权重]
- [ ] [P1] TODO-DS-02 切空状态插画 / 头像默认图 / 加载占位 [依赖:无] [2h] [验收:3 类资源齐备]
- [ ] [P1] TODO-DS-03 输出"组件 props 规范表"(15+ 组件) [依赖:设计稿] [4h] [验收:每个组件有 props 类型表 + 状态截图]
- [ ] [P1] TODO-INT-01 状态/动画/字号 token 替换 [依赖:TODO-DS-01~03 / app.wxss 新增 token] [3h] [验收:无硬编码 #xxxx,所有 rpx 字面量替换为 token]
```

### 5.3 P2 — 后续(本期不实施)

```
- [ ] [P2] TODO-FE-22 引入 recycle-view 虚拟滚动(>100 条时再评估)
- [ ] [P2] TODO-FE-23 草稿"编辑"模式(目前只支持新建)
- [ ] [P2] TODO-FE-24 评论富文本(目前评论仍走纯文本+图片)
- [ ] [P2] TODO-FE-25 Web 管理端社区模块(frontend/src/components/Community*)
- [ ] [P2] TODO-FE-26 Flutter 端社区模块接入
- [ ] [P2] TODO-BE-12 频道未读数(last_read_post_id + unread_post_count)
- [ ] [P2] TODO-BE-13 转让管理员 / 置顶 / 官方标签 / DELETE 接口
- [ ] [P2] TODO-BE-14 PII 治理(站内信 data 字段 inviter_masked_name)
- [ ] [P2] TODO-BE-15 cursor 分页(OFFSET > 1000 时再评估)
```

### 5.4 工时汇总

| 模块 | 工时(h) | 备注 |
|------|---------|------|
| 组件层(FE-01~06) | 20 | 必须先就绪,所有页面依赖 |
| 频道创建(FE-07/08) | 7 | 需求 3 |
| 工具函数(FE-09/10/17) | 9 | 富文本 / 详情同源依赖 |
| 富文本编辑器(FE-11) | 16 | 需求 2 |
| 瀑布流核心(FE-12~16) | 40 | 需求 1 主战场 |
| 详情页降级(FE-18) | 4 | — |
| 顺手改(FE-19~21 + INT-01) | 14 | P1 |
| 设计师切图/规范(DS-01~03) | 8 | 设计稿到位后 |
| **前端合计** | **118** | **约 2.5-3 人周** |
| 后端 schema+CRUD(BE-01~05) | 9 | — |
| 后端补表(BE-06) | 2 | 需核实 |
| 后端头像上传+审核(BE-07~09) | 7 | 需求 3 |
| 后端测试(BE-11) | 4 | — |
| **后端合计** | **22** | **约 0.5 人周** |
| **总工时** | **140** | **约 3 人周(后端可并行)** |

---

## 6. 风险与缓解

> 整合 4 份子方案的风险点,去重合并。

### 6.1 性能与体验风险

| # | 风险 | 等级 | 影响 | 缓解 | 兜底 |
|---|------|------|------|------|------|
| R1 | **微信原生 `<editor>` 真机/IDE 差异**(iOS 工具栏乱跳 / Android 输入法闪) | 中 | 富文本输入体验差、可能丢字 | 上线前 `iPhone 13/15` + `华为 mate` 真机各 1 轮回归;关键交互 e2e 手测 | 退回到 `textarea + 块` 自研(+12h,不在本期排期) |
| R2 | **瀑布流高度估算误差,首屏抖动** | 中 | 视觉不专业、CLS 评分下降 | skeleton 占位 + `mode="widthFix"` + 图片 `bindload` 后只更新自己;高度过渡 240ms | 退化为单列长流(架构师不接受,本期不考虑) |
| R3 | **评论原位展开导致"长列 vs 短列"高度差被放大** | 中 | 视觉错落失衡 | 同一时刻只允许 1 卡片展开评论(全局互斥);展开后该列加 `min-height` 占位 | 改为"长按卡片 → 弹半屏评论"(类似抖音) |
| R4 | **`<editor>` HTML → JSON blocks 边界 case**(嵌套标签/特殊字符) | 中 | 数据不一致,后端可能报错 | 10+ fixture 覆盖常见 HTML;解析失败降级为 `{ type: 'text', text: html }` | 后端保留原始 HTML,blocks 仅前端辅助 |
| R5 | **多图上传 3 并发 + 弱网下 wx.uploadFile 503** | 中 | 失败率高、用户挫败 | 重试 2 次 + 按张粒度进度条;失败 toast | 退化为单张串行 |
| R6 | **首屏瀑布流 20 条 + 展开评论**首次加载 | 低 | 首屏时间 | skeleton 2 列各 3 卡片;图片懒加载;setData 瘦身 | — |
| R7 | **`top_comments` N=2 在 2 列卡片高度差控制** | 低 | 高度差异 | 单元测试断言;前端可在 `data.top_comments.length < 2` 时降级展示 | 调环境变量 `COMMUNITY_TOP_COMMENT_N` |

### 6.2 数据与迁移风险

| # | 风险 | 等级 | 影响 | 缓解 |
|---|------|------|------|------|
| D1 | **老 `community_post` 数据 `activity_id NOT NULL` 写入频道动态会冲突** | 中 | API 读不到频道动态 | 同步 `activity_id` 改为可空(C-1 SQL 包含),频道动态写 `activity_id=NULL, channel_id=真实值` |
| D2 | **`community_channel_post` / `community_channel_comment` / `community_notification` 三表生产 DB 是否存在** | 中 | 启动后端报 `Table doesn't exist` | 后端实施前**必须**先核实(用户/架构师确认);若缺则 C-6/C-7 CREATE TABLE |
| D3 | **历史帖 `content` 是 HTML / 纯文本,渲染跳变** | 低 | 老"图文混排"按"纯文本"渲染,丢图 | 前端渲染策略:`content_blocks` 非空优先,空则用 `content`(老路径不变),老 content 不解析图 |
| D4 | **DDL 注释与代码不一致** | 低 | 阅读混淆 | C-9 SQL 同步注释(`pending/pass/risky/failed_submit`) |
| D5 | **`content` 长度限制 10000 在富文本下太小** | 中 | 富文本发布失败 | C-4 SQL 升 `MEDIUMTEXT`;同步去掉 Pydantic `max_length=10000` 约束 |
| D6 | **审核未通过用户无感知** | 中 | 用户挫败 | 短期:前端 5s 轮询 `status`;中期:加"我发布的待审核"列表接口 |
| D7 | **审核失败时 `status=0` 仍返回 200,前端读不到驳回信号** | 中 | 用户看不到驳回原因 | 后端在响应体明示 `status` 字段(已有);前端 5s 轮询 |

### 6.3 权限红线(本期自检)

> 出处: 架构师 §0 + 权限系统设计原则 §5

| 红线 | 自检结果 |
|------|----------|
| 红线 1: 不用 `role_id` 推断全局权限 | ✅ 本期不涉及角色判定,仅消费既有 `auth.isAdmin()` / `auth.isUser()` |
| 红线 2: 不在用户能力接口里写 `if ctx.role == "admin": reject` | ✅ 频道创建 / 发帖 / 评论均不限 `admin`,与混合账号兼容 |
| 红线 3: 前端不做二次可见性过滤覆盖后端结果 | ✅ 频道列表 / 帖子列表完全信任后端响应,前端不做二次过滤 |
| 红线 4: 不把 `User.name/phone` 当 SQL 列 `label/group_by` | ✅ 后端在 Python 层 `user.name` 拿(沿用现有模式) |
| 红线 5: 权限改动必须带回归清单 | ✅ 频道可见性/角色本期不动,无回归;后续若改频道权限,提交前补测试 |

### 6.4 跨端一致性风险

| # | 风险 | 等级 | 缓解 |
|---|------|------|------|
| C1 | Web 管理端 / Flutter 端不消费 `content_blocks` | 低 | API 直接暴露 `null | object`,未来两端各写一个 renderer 即可 |
| C2 | Web 管理端无社区模块,审核需在小程序看 | 中(现状) | 本期不动;若产品后续要 Web 端审核,需补 `frontend/src/components/Community*` |

### 6.5 上线节奏建议

| 阶段 | 内容 | 范围 | 回滚 |
|------|------|------|------|
| **Phase 2.0 — 后端字段 + API 灰度** | 落 C-1~C-7 SQL,改 `list_channel_posts` 走 `channel_id` 过滤,新字段双写 | 内部灰度(白名单租户) | `content_blocks` 删列即可,`channel_id` 同 |
| **Phase 2.1 — 小程序"频道创建页"上线** | 独立页 + 后端 `description` / `avatar_url` 字段实际写入 | 全量小程序 | 前端路由可关,后端字段无破坏性 |
| **Phase 2.2 — 富文本编辑器上线** | `<editor>` + JSON blocks 解析,老帖 fallback | 全量小程序 + 灰度租户 | 前端回退到块编辑器,后端 `content_blocks` 不读 |
| **Phase 2.3 — 瀑布流 + 评论原位展开上线** | 首页重构,详情页降级 | 全量小程序 | 前端可回退到旧首页 |
| **Phase 2.4 — 顺手改造(审核页/通知页/tabBar/--green/铃铛)** | 风格统一 | 全量 | 各自独立可回退 |

**不建议 AB**: 瀑布流 / 富文本是"打开就看到"的强视觉,AB 不易得出结论;建议直接灰度租户。

---

## 7. 冲突与决策(重要)

> 仔细比对 4 份子方案,列出彼此冲突或不一致之处,给出仲裁建议。

### 7.1 富文本存储格式: JSON blocks vs HTML

| 出处 | 主张 | 理由 |
|------|------|------|
| 架构师 §3.2 | **JSON blocks** | 与 spec §2.2 一致;可扩展 video/mention;`rich-text` 节点白名单可控;按块审核友好 |
| 后端 §4.3 | **JSON blocks**(主存) + Markdown(老数据) | 同架构师理由,加 "Markdown 兜底" 兼容老帖 |
| 前端 §3.2.3 | **HTML(主存) + JSON blocks(辅助)** | `<editor>` 输出 HTML;前端在 `onInput` 时把 HTML 转 blocks;后端不必解析 |

**仲裁**: **采纳后端 + 架构师(主存 JSON blocks)+ 兼容老数据**。

- 写入端: 前端 `<editor>` → HTML → 自研 `html2blocks` 转换 → 存 `content_blocks`(主)+ `content_format='blocks'`(标记);同时 `content` 留空(或存纯文本)
- 读取端: 优先用 `content_blocks` 渲染;为空时 fallback 到 `content`(老数据,按 Markdown 展示)
- 老数据兼容: `content_format` 默认 `'text'`,UI 按 `text` 路径渲染(现有体验)
- 前端 `html2blocks` 转换失败 → 降级为 `{ type: 'text', text: html }`(前端 R4 兜底)

**为什么不选 HTML 主存**: XSS 风险、生产必须 bleach/sanitize 反而丢失部分富文本能力;图片 URL 散落在 HTML 字符串中,审核需正则提取(不精确)。

### 7.2 富文本编辑器选型: 微信原生 `<editor>` vs 自研

| 出处 | 主张 | 理由 |
|------|------|------|
| 架构师 §3.2 | **微信原生 `<editor>` + 自研 `html2blocks` 转换** | 原生支持图文混排 + 多图插入;官方维护;`getContents` 拿 HTML |
| 前端 §3.1 | **微信原生 `<editor>`** | 维护成本最低;自研 textarea 工作量超预算(光标/选区/图片插入/撤回 redo 远超本期);第三方维护差 |
| 后端 §4.2 | (不直接给选型) | 关注后端存储格式 |

**仲裁**: **三方一致,采纳微信原生 `<editor>`**。无冲突。

### 7.3 详情页 `community-post-detail` 处置

| 出处 | 主张 | 理由 |
|------|------|------|
| 架构师 §1.2 | **方案 B: 降级为只读兜底页**(不删除路由) | 保留分享/深链;不喧宾夺主 |
| 前端 §2.5 | **保留为深链落点**,与瀑布流同源 | 系统消息/分享卡片/扫码/外部链接必须保留 |
| 设计师 §3.4 | `DetailPage(若保留)` — 沿用现有 token,简化布局 | 弱化但不删 |

**仲裁**: **三方一致,采纳方案 B**。无冲突。**重点**: 详情页**不删除路由**,但**移除评论区 + 输入栏**,顶部"返回社区"按钮,数据走同源 loader(前端 TODO-FE-17/18)。

### 7.4 `community_post.channel_id` 字段: 加字段 vs 启用 `community_channel_post` 表

| 出处 | 主张 | 理由 |
|------|------|------|
| 摸底 §5.6 | "频道动态"语义挂在 `community_post` 但缺 `channel_id` 字段 | 实际 CRUD 走 `community_post` |
| 架构师 §4.1 | **加 `channel_id` 字段**,`activity_id` 改可空 | 消除三方漂移;以源码为准 |
| 后端 §3 / §8.1 | **加 `channel_id` 字段**(C-1)+ 备选 C-6 `community_channel_post` 表(若生产 DB 无) | 同架构师 |
| 后端 §1.2 | ORM 已定义 `CommunityChannelPost` / `CommunityChannelComment` | 实际无对应 `CREATE TABLE`,需核实 |

**仲裁**: **采纳架构师 + 后端 C-1**(加 `channel_id` 字段)。

- 优先加字段,不动表结构(以源码为准,改动最小)
- **C-6 / C-7 必须先核实生产 DB**,若 `community_channel_post` 等三表不存在则 `CREATE TABLE IF NOT EXISTS`(与现有 ORM 对齐),以防后端 ORM 类在某些代码路径上被引用(当前未引用,但风险存在)
- C-1 与 C-6 互不冲突(同一项目的两个表,字段独立)

### 7.5 频道头像上传: 复用 `/community-image` vs 新建 `avatar-upload`

| 出处 | 主张 | 理由 |
|------|------|------|
| 后端 §6.3 | **方案 B: 新建 `POST /community/channels/avatar-upload` 单独通道** | mime 严格;强制 512x512 压缩;强制走 `media_check_async` |
| 前端 §4.3 | 复用 `uploads.py:194-223` `POST /api/v1/uploads/community-image` | "后端 0 改动" |

**仲裁**: **采纳后端方案 B**。

- 后端 §6.3 明确指出: 现状 `/community-image` "未走微信 media_check_async" + "压缩 0" — 不满足频道头像的合规要求
- 新增 endpoint 工作量仅 4h(后端 TODO-BE-07),不显著增加工期
- 强制审核 + 压缩对长期 CDN 成本/合规都有益
- 前端实施时按新 endpoint 调,旧 endpoint 保留兼容

### 7.6 状态管理: 引入 store vs 不引入

| 出处 | 主张 | 理由 |
|------|------|------|
| 前端 §6.2 | **不引入 store**,用 `app.globalData.bus` + `wx.setStorage` | `miniprogram/utils/` 无 `store/` 目录;跨页通信需求低;零成本 |
| 架构师 | (无直接表态) | — |

**仲裁**: **采纳前端方案**。本期不引入新 store。若后续评论/通知有高频刷新需求,再评估。

### 7.7 设计令牌命名: `--link` vs 沿用 `--green`

| 出处 | 主张 |
|------|------|
| 设计师 §2.2 | **新增 `--link`** 替代 `--green`,`--green` 标记废弃 |
| 前端 R6 | 统一改成 `var(--link-color)`,全项目替换 |

**仲裁**: **统一命名为 `--link`**(沿用设计师)。前端 R6 提到的 `--link-color` 是前端先期预案,正式落地以设计师令牌为准。命名上 `--link` 简练,避免冗余。

### 7.8 浮铃铛公共组件归属

| 出处 | 主张 |
|------|------|
| 设计师 §2.4 | "在 Phase 2 时**只画一种**铃铛样式,作为 `<bell-badge>` 组件" |
| 前端 §1.3 | "P0: `floating-bell`(重写)" |
| 架构师 §1.3 | "抽公共 `<floating-bell>` 组件,统一参数" |

**仲裁**: **三方一致**,组件命名沿用现有 `floating-bell`(避免破坏现有 import)。**props 化** `size` / `top` / `right` / `unread-count` / `dot-only`(设计师 §2.4 + 前端 TODO-FE-06)。

### 7.9 提交流程: form-type 同步 vs 主动调 EditorContext

| 出处 | 主张 |
|------|------|
| 前端 §3.2.1 | `<editor>` 组件用 `<form>` 包裹 + `<button form-type="submit">`,保证键盘"完成"键同步 |
| 架构师 / 后端 | (无直接表态) |

**仲裁**: **采纳前端方案**(纯前端技术细节,无冲突)。若实施时发现 `form-type` 与自定义工具栏冲突,回退到主动 `EditorContext.getContents` 调取。

### 7.10 富文本协议细节: `mention` 块本期是否实现

| 出处 | 主张 |
|------|------|
| 架构师 §3.2 | "未来要加 `video` / `mention` / `link preview` 块,只需要在 `blocks` schema 里加 type" — **预留,本期不实现** |
| 后端 §4.2 | schema 草案包含 `{ type: 'mention', user_id, text }` — **作为 schema 预留** |
| 前端 §3.2.3 | (无直接表态) |
| 后端 §7.3 | "`mention` 块:`user_id` 字段跳过文本审核;若 mention 块带 `text` 字段也合并到文本审核" — **审核侧已支持** |

**仲裁**: **`mention` 块 schema 预留,本期不实现 UI**(编辑器里没有"@ 某人"按钮)。**审核侧已支持**(后端 §7.3),未来 UI 落地时无需后端改动。

---

## 8. 第二阶段工作流(设计稿到位后)

### 8.1 阶段划分

```
Phase 2.0  设计稿就位 + 令牌定稿      [设计师 agent, 1-2 天]
Phase 2.1  基础组件 + 令牌替换        [前端, 1-2 天, 可与 2.0 串行]
Phase 2.2  后端字段 + 补表            [后端, 1 天]
Phase 2.3  频道创建独立页            [前端 + 后端头像上传并行, 1.5 天]
Phase 2.4  富文本编辑器              [前端, 2-3 天; 后端同步 ORM/Pydantic]
Phase 2.5  瀑布流核心                [前端, 4-5 天; 后端 top_comments 并行]
Phase 2.6  详情页降级                [前端, 0.5 天]
Phase 2.7  顺手改 + 铃铛 + tabBar    [前端 + 设计师, 2-3 天]
Phase 2.8  联调 + 真机回归           [前端 + 后端 + QA, 2-3 天]
─────────────────────────────────────────
合计       约 14-20 天(2-3 人周,后端可 0.5 人周并行)
```

### 8.2 PR 拆分原则

- 单 PR < 800 行变更
- 每个 PR = 1 个 TODO(或 1 组紧密相关 TODO)
- 每 PR 必须:
  - 单元测试通过(若涉及工具函数 / CRUD)
  - 真机 1 轮手动验证
  - 权限红线 5 条自检(本期不涉及权限改动,但留作 checklist)
  - 同步更新 `docs/specs/产品规格说明-spec.md` 实现状态表格
  - 提交信息带 `[Backend]` / `[Web]` / `[Mini]` 前缀

### 8.3 并行策略

- **后端先行**: Phase 2.2 后端字段就位后,前端可在 Phase 2.3-2.6 任意时刻对接
- **设计师 → 前端**: 组件规范表(DS-03)就位后,前端 PR-1 即可开工
- **多前端 agent 并行**: 若 2 个前端 agent 同时工作,按 TODO ID 升序领任务(TODO-FE-01 → 06 → 07 → 11 → 12-16 → 17-18 → 19-21)
- **后端 BE-06 优先级**: 必须 Phase 2.0 用户/架构师确认后,后端 agent 第一时间核实并执行,避免后续 API 报 "Table doesn't exist"

### 8.4 回滚预案

| 阶段 | 回滚成本 | 回滚方式 |
|------|----------|----------|
| 2.0 (字段) | 低 | `ALTER DROP COLUMN` 即可 |
| 2.1 (基础组件) | 低 | 旧页面无引用,组件可独立 git revert |
| 2.3 (频道创建) | 低 | 路由可关,后端字段无破坏性 |
| 2.4 (富文本) | 中 | 前端回退到块编辑器(旧 `community-post-create.wxml` 保留);后端 `content_blocks` 不读 |
| 2.5 (瀑布流) | 中 | 前端回退到旧 `community-post-list`(单列 + 跳详情) |
| 2.6 (详情页降级) | 中 | 回退到原 `community-post-detail` 布局 |
| 2.7 (顺手改) | 低 | 各自独立可 revert |

### 8.5 文档同步 checklist(每 PR)

- [ ] 涉及数据模型 → 更新 `backend/sql/field.sql` 或 `table.sql`
- [ ] 涉及 API 路由 → 更新 `docs/handover/社区频道-后端接口-v2.md`(新建,Phase 2 启动时一并建)
- [ ] 涉及产品思考 → 创建 `docs/insights/社区频道-*.md` 双向链接
- [ ] 涉及权限 → 重新读 `docs/handover/权限系统设计原则.md` §5 自检
- [ ] 涉及 spec 偏差 → 反向更新 `docs/specs/社区频道功能-spec.md`
- [ ] 涉及产品功能 → 同步更新 `docs/specs/产品规格说明-spec.md` 实现状态表格

---

## 9. 索引

### 9.1 项目内相关文档

#### 本期方案链
- **现状摸底**: `docs/handover/社区UI改造-00-现状摸底.md`
- **需求基线**: `docs/handover/社区UI改造-需求基线.md`
- **架构蓝图**: `docs/handover/社区UI改造-01-架构蓝图.md`
- **设计规范基线**: `docs/handover/社区UI改造-02-设计规范基线.md`
- **前端重构方案**: `docs/handover/社区UI改造-03-前端重构方案.md`
- **后端接口方案**: `docs/handover/社区UI改造-04-后端接口方案.md`
- **总方案(本文)**: `docs/handover/社区UI改造-总方案.md`

#### 权限前置阅读(本期已读)
- `docs/handover/权限系统架构文档.md`
- `docs/handover/权限系统设计原则.md`

#### Spec 文档(反向更新)
- `docs/specs/社区频道功能-spec.md` — §2.1 数据模型、§3 API、§4 页面 需反向更新
- `docs/specs/产品规格说明-spec.md` — 实施阶段每 PR 同步更新实现状态表格

#### 实施期需新建/更新的 handover & insights(Phase 2 启动时一并建)
- `docs/handover/社区频道-后端接口-v2.md`(新建,镜像本总方案 §4)
- `docs/insights/社区频道-富文本方案.md`(新建,§3 / §7 决策记录)
- `docs/insights/社区频道-瀑布流评论展开方案.md`(新建,§1 决策记录)
- `docs/handover/社区频道-权限矩阵.md`(新建,权限相关改造的双链文档)

### 9.2 关键源码定位

#### 小程序
- `miniprogram/app.json` — 路由 + tabBar
- `miniprogram/app.wxss` — 设计令牌(1-116 行)
- `miniprogram/custom-tab-bar/index.{js,wxml,wxss}` — TabBar
- `miniprogram/pages/community/index/` — 社区首页
- `miniprogram/pages/community-post-list/` — 频道动态流
- `miniprogram/pages/community-post-detail/` — 详情页
- `miniprogram/pages/community-post-create/` — 发布页
- `miniprogram/pages/community-moderation/` — 审核中心
- `miniprogram/pages/community-notifications/` — 站内信
- `miniprogram/components/floating-bell/` — 铃铛(待重写)
- `miniprogram/utils/api.js` — API 封装
- `miniprogram/utils/community-content.js` — 内容解析(待扩展 HTML → blocks)
- **Phase 2 新建**: `miniprogram/pages/community-channel-create/` — 频道创建
- **Phase 2 新建**: `miniprogram/components/{state-view,surface-card,page-hero,image-grid,comment-composer,icon-button,empty-state,pill,badge-dot}/`

#### 后端
- `backend/app/api/v1/endpoints/community.py` — 28 个 API 端点
- `backend/app/api/v1/endpoints/uploads.py` — 媒体上传(头像复用 + 新增 avatar-upload)
- `backend/app/models/community.py` — Pydantic DTO
- `backend/app/schemas.py` — SQLAlchemy ORM(370-464 行为社区相关)
- `backend/app/crud/crud_community_post.py`
- `backend/app/crud/crud_community_comment.py`
- `backend/app/crud/crud_community_channel.py`
- `backend/app/crud/crud_community_moderation.py`
- `backend/sql/table.sql` — 416-487 行社区表;614-625 行 ALTER
- **Phase 2 改**: `backend/sql/field.sql` — ALTER SQL
- **Phase 2 改**: `backend/sql/table.sql` — 追加 C-6/C-7 CREATE TABLE(若生产 DB 无)

---

## 10. 用户评审关注点(汇总)

> 来自 4 份子方案的"评审关注点"汇总,请用户重点确认。

1. **详情页降级为"只读兜底页"**是否接受?(架构师 §1.2 方案 B)
2. **`community_post.channel_id` 字段补** + `activity_id` 改可空,是否同意?(架构师 §4.1 + 后端 C-1)
3. **JSON blocks 作为富文本存储格式**,是否接受?(架构师 §3.2 + 后端 §4.3)
4. **`content` 升 MEDIUMTEXT**,是否接受?(后端 C-4)
5. **生产 DB 上 `community_channel_post` / `community_channel_comment` / `community_notification` 三表是否存在**?(后端 C-6/C-7 必须先核实)
6. **频道头像上传走新建 `POST /community/channels/avatar-upload`**,是否同意?(后端 §6.3 方案 B)
7. **本期不**做"老 activity 级帖子迁移",是否接受?(架构师 §6.1)
8. **本期不**做"评论富文本",是否接受?(架构师 §4.5)
9. **本期不**做"频道未读数 / 转让管理员 / 置顶 / 官方标签 / DELETE",是否接受?(后端 §9.3 / 需求基线 §2)
10. **`top_comments` N=2**,是否调整?(后端 §5.1)
11. **tabBar 社区专属图标 + --green/--success token 修正**,是否纳入本期?(架构师 §2 P1)
12. **审核中心 / 通知中心 / 铃铛组件化** 顺手改,是否纳入 P1?
13. **总工时 140h(约 3 人周,后端可 0.5 人周并行)**,是否在工期预算内?
14. **上线节奏(灰度租户 → 全量)**,是否同意?

---

## 用户评审意见

> 评审日期: 2026-06-10
> 评审人: 用户
> 状态: **决议生效,Phase 2 等设计稿**

### 决议 1 — 富文本方案选 A(HTML + mp-html)

**用户原话**: 选 A 方案,询问"未来加视频块、预览会很麻烦吗"

**决议**:
- 写入端: 微信原生 `<editor>` 输出 HTML → 直接存 `community_post.content`
- 读取端: 第三方 `mp-html`(jin-yufeng,GitHub 4k+ star,持续维护)渲染
- 后端 XSS 清洗: Python `bleach` 库白名单清洗
- **取消** `html2blocks` 转换层 — A 方案完全不需要
- **取消** `content_blocks` JSON 字段 — A 方案不写
- **保留** `content_format` VARCHAR(16) DEFAULT 'text' 字段 — **关键 future-proof 钩子**:
  - 老数据: `content_format='text'`
  - 新数据: `content_format='html'`
  - 未来切换 blocks: 加 `content_blocks` 字段 + `content_format='blocks'`,无需迁移老数据

**未来加视频/链接预览的工作量**: 不显著更麻烦
- 视频块: 自定义 HTML 标签 `<x-video data-url="...">` + mp-html `process` 钩子渲染 + 后端正则提取审核
- 链接预览: `<a class="link-preview" data-meta='{...}'>` + mp-html 自定义渲染 + 后端 OG 抓取
- 工作量主要在编辑器扩展和后端抓取(无论 A/B 都要做),格式层差异 < 50 行

### 决议 2 — 后端字段最终方案

按"你们决定,不要坑我"原则,后端字段定为:

| 字段 | 操作 | SQL 草案 |
|------|------|----------|
| `community_post.channel_id` | ✅ 新增 BIGINT NULL + 索引 | `ALTER TABLE community_post ADD COLUMN channel_id BIGINT NULL AFTER activity_id, ADD KEY idx_post_channel_id (channel_id);` |
| `community_post.activity_id` | ✅ 改可空 | `ALTER TABLE community_post MODIFY COLUMN activity_id BIGINT NULL;` |
| `community_post.content` | ✅ 升 MEDIUMTEXT | `ALTER TABLE community_post MODIFY COLUMN content MEDIUMTEXT NOT NULL;` |
| `community_post.content_format` | ✅ 新增 VARCHAR(16) DEFAULT 'text' | `ALTER TABLE community_post ADD COLUMN content_format VARCHAR(16) NOT NULL DEFAULT 'text' AFTER content;` |
| `community_post.content_blocks` | ❌ 取消(A 方案不需要) | — |

全部写入 `backend/sql/field.sql`(项目规则:字段修改不进 table.sql)。

### 决议 3 — 发现 table.sql 与 ORM 漂移(重大)

**事实**:
- `backend/app/schemas.py:421/433/446` 定义了 3 个 ORM 类:
  - `CommunityNotification(__tablename__='community_notification')` — **代码在用**(`crud_community_channel.py:241` 写通知)
  - `CommunityChannelPost(__tablename__='community_channel_post')` — 代码**未用**(频道帖子仍走 `community_post`)
  - `CommunityChannelComment(__tablename__='community_channel_comment')` — 代码**未用**(评论仍走 `community_comment`)
- `backend/sql/table.sql` **没有这 3 张表的 CREATE 语句**
- 通知功能在线上运行 → 生产 DB 上这 3 张表实际存在 → **被 SQLAlchemy `Base.metadata.create_all()` 偷偷建过**

**违反规则**: CLAUDE.md 明确要求 "table.sql 是 source of truth, 禁止用 db_migrations.py 补字段"。`create_all()` 偷偷建表本质上是同类违规。

**修复方案(Phase 2.2 后端 agent 第一件事)**:

- **TASK-10**: 把这 3 张表的 `CREATE TABLE IF NOT EXISTS` 补到 `backend/sql/table.sql`,与 ORM 字段完全对齐;`community_channel_post` / `community_channel_comment` 即使为空也建,消除合规漂移
- **TASK-11**: 找到 `Base.metadata.create_all()` 调用并下线生产路径(改为仅 dev/test);如果需要,补 alembic 配置或 conftest fixture 让测试照常通过

**`community_channel_post` / `community_channel_comment` 表的归宿**:
- **不切换数据写入**(代码仍写 `community_post` + `channel_id`,与本期决议 2 一致)
- 这两张表保留**空表**,作为"历史 ORM 定义"留档,table.sql 同步保留以保持 ORM/SQL 一致
- 未来若需要拆分(性能/隔离/审计),已有 ORM + 表结构在手,迁移成本低

### 决议 4 — 总方案 §1.3 关键技术决策修订

| 决策 ID | 原值 | 新值 |
|---------|------|------|
| **D2** | 微信原生 `<editor>` + 自研 `html2blocks` 转换 | **微信原生 `<editor>` + 第三方 `mp-html` 渲染**(不要转换层) |
| **D3** | JSON blocks(主存) + Markdown 兜底 | **HTML(主存) + 老 text 数据 fallback**;`content_format` 字段切换格式 |
| **D4** | 新增 `content_format` + `content_blocks` + MEDIUMTEXT | **新增 `content_format` + MEDIUMTEXT**;取消 `content_blocks` |

§5.1 前端 TODO 同步修订:
- ~~TODO-FE-10~~ 升级 community-content.js 支持 HTML → JSON blocks 解析 → **取消**
- **TODO-FE-10(新)**: 引入 `mp-html` 包(npm/源码),在 `community-post-detail` / `community-post-list` 卡片正文区接入 `<mp-html content="{{content}}" />`,验收: 5+ fixture(纯文本/图文混排/超链接/列表/嵌套引用)渲染无误
- TODO-FE-11 仍保留,但去掉"对接 BE 富文本字段 BE-2/3"的依赖文字,改为"对接 content_format='html' + content 字段"
- §5.2 P1 不变
- §5.4 工时表更新: 前端去掉 4h (FE-10 旧) + 4h (FE-15 高度差影响 — A 方案下不影响, blocks→html 不增 setData),合计前端 ≈ **110h**;后端去掉 BE-09 富文本拆解审核 4h(改成对清洗后的 HTML 整体送 `check_text_security` + 用 BeautifulSoup 提取 `<img>` 送 `media_check_async`,工作量 2h),合计后端 ≈ **20h**;**总工时 ≈ 130h(约 2.5-3 人周)**

§4.1 SQL 草案汇总修订:
- **C-3** ALTER community_post ADD content_blocks JSON → **取消**
- **C-6 / C-7** 改为"补 CREATE TABLE 漂移修复",见决议 3
- 新增 **C-10**: 修复 `Base.metadata.create_all()` 在生产路径上的调用

### 决议 5 — Phase 2 启动条件

- ✅ 决议 1-4 已固化,等 **用户给设计稿**
- 设计稿到位后,设计师 agent 第一时间翻译为 design tokens,前端按 TODO 并行实施,后端按修订后的 SQL 草案改 ORM + ALTER
- **本期 Phase 2 工作量 ≈ 130h ≈ 2.5-3 人周**,后端可 0.5 人周并行

---

## 评审决议历史

| 日期 | 修订 | 决策人 |
|------|------|--------|
| 2026-06-10 v1 | 总方案初稿(架构师+设计师+前端+后端 4 agent 综合) | 总建筑师 agent |
| 2026-06-10 v1.1 | 用户评审固化: A 方案、后端字段、table.sql 漂移修复 | 用户 |
