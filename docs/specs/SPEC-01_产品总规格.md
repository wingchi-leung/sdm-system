# SDM 系统 – 产品规格说明（Spec）

> 本文档是 SDM System 的核心规格追踪文档。按功能模块记录实现状态，重大调整后同步更新。
> 历史归档见 [archive/产品规格历史.md](archive/产品规格历史.md)

---

## 一、产品愿景

**愿景**：打造一款 **All in One** 的平台型应用，承载平台的各类学习活动。

**核心目标**：
- 学习活动的全生命周期管理
- 平台人员与权限的清晰管理
- 支持多种登录方式与微信生态
- 预留社区能力与多租户扩展
- 数据私有化、部署灵活、UI 现代、可上架应用商店

---

## 二、功能规格追踪

### 2.1 活动管理

| 规格项 | 描述 | 状态 | 说明 |
|--------|------|------|------|
| 活动发布 | 管理员可创建并发布活动 | ✅ 已实现 | 后端 `POST /activities`，各端均有入口 |
| 活动报名 | 已登录用户可查看活动并提交报名 | ✅ 已实现 | 后端 `POST /participants`；付费活动的“待支付”不算已报名，需支付成功后才进入正式报名态 |
| 活动签到 | 现场对已报名人员进行签到记录 | ✅ 已实现 | 后端 `POST /checkins` |
| 报名时支付 | 付费活动未满员时必须走微信支付 | ✅ 已实现 | 小程序微信支付主链路已完成 |
| 报名成功微信通知 | 报名成功后可向用户发送微信订阅消息 | ✅ 已实现 | 已接入小程序授权弹窗、报名成功入队，支持租户默认配置 + 活动级覆盖配置 |
| 活动编辑/删除 | 管理员可编辑活动信息、删除活动 | ✅ 已实现 | `PUT/DELETE /activities/{id}` |
| 活动人员查看 | 管理员可查看活动报名人员及信息 | ✅ 已实现 | `GET /participants/{activity_id}/` |
| 活动导出 Excel | 超级管理员可导出活动及报名数据 | ✅ 已实现 | 仅超级管理员可访问导出接口 |

### 2.2 用户与认证

| 规格项 | 描述 | 状态 | 说明 |
|--------|------|------|------|
| 用户注册 | 用户通过手机号注册 | ✅ 已实现 | `POST /users/register` |
| 不注册直接报名 | 未注册用户也可填写信息报名 | ✅ 已实现 | 报名接口支持匿名 |
| 手机号+密码登录 | 用户使用手机号与密码登录 | ✅ 已实现 | 统一到 `POST /auth/login` |
| 微信授权登录 | 小程序微信一键登录/绑定 | ✅ 已实现 | `POST /auth/wechat` |
| 小程序活动访问鉴权 | 未登录用户不能查看活动 | ✅ 已实现 | 前置登录拦截 |
| 登录态失效兜底 | 用户进入受保护页面但本地登录态已失效时，直接跳转登录页 | ✅ 已实现 | 小程序受保护页面统一 `reLaunch` 到登录页，避免停留在已失效页面 |
| 个人信息更正 | 小程序用户可一次性编辑姓名/邮箱/职业/行业/年龄/性别 | ✅ 已实现 | `PUT /users/profile` + 设置二级页完整表单 |
| 个人信息删除 | 小程序用户主动删除资料字段能力 | ⚠️ 下线保留接口 | 前端入口已移除，后端接口保留 |
| 账号注销 | 小程序用户可发起账号注销并停用登录凭证 | ✅ 已实现 | `DELETE /users/me` + 设置二级页入口 |
| 身份证采集与实名校验 | 小程序采集证件号并执行实名核验 | ❌ 已下线 | 前后端均移除小程序证件采集链路 |
| VIP 会员 | 会员身份与权益 | ❌ 未实现 | 需单独设计 |

### 2.3 权限管理

| 规格项 | 描述 | 状态 | 说明 |
|--------|------|------|------|
| 超级管理员 | 拥有系统全部管理权限 | ✅ 已实现 | 全局 RBAC |
| 活动管理员 | 按活动类型授权，可管理该类型下活动 | ✅ 已实现 | RBAC + activity_type scope |
| 黑名单 | 被拉黑用户报名时直接拦截 | ✅ 已实现 | `isblock` + `block_reason` |

### 2.4 多租户

| 规格项 | 描述 | 状态 | 说明 |
|--------|------|------|------|
| 租户数据隔离 | 后端所有核心业务数据按租户隔离 | ✅ 已实现 | `tenant_id` + JWT 租户上下文 |
| 公开活动租户解析 | 未登录访问活动时通过租户编码解析 | ✅ 已实现 | 公开租户上下文 |
| 小程序运行时租户 | 小程序可通过启动参数、分享链接设置租户 | ✅ 已实现 | `utils/tenant.js` |
| 切换团队/租户 | 支持切换当前团队 | ⚠️ 部分实现 | 运行时上下文已支持，UI 待补 |

### 2.5 支付

| 规格项 | 描述 | 状态 | 说明 |
|--------|------|------|------|
| 微信支付下单 | 小程序调起微信支付 | ✅ 已实现 | 已接入微信小程序支付 |
| 支付回调 | 微信支付回调通知处理 | ✅ 已实现 | 成功落库 + 补偿逻辑 |
| 订单查询 | 前端查询订单状态 | ✅ 已实现 | 补偿创建参与记录 |
| 支付取消 | 用户取消支付后删除待支付订单及报名记录 | ✅ 已实现 | 不保留订单号、支付状态和报名状态 |
| 退款/补单 | 退款、补单、财务对账 | 🔄 进行中 | 管理员退款已接入小程序报名管理页并可发起微信退款，补单与财务对账待补充 |
| 支付订单最小化 | 订单只保留交易必要字段 | ✅ 已实现 | 不保存报名资料快照 |

### 2.6 数据安全

| 规格项 | 描述 | 状态 | 说明 |
|--------|------|------|------|
| 密码哈希存储 | 密码不可逆哈希，不明文 | ✅ 已实现 | `user_credential.credential_hash` |
| 敏感字段处理 | 姓名明文存储，手机号、身份证、邮箱 AES-GCM 加密 | ✅ 已实现 | PII 处理模块 |
| 日志脱敏 | 日志中禁止打印完整证件号、手机号、姓名 | ✅ 已实现 | 后端敏感信息过滤器 |
| API 响应脱敏 | 前后端 API 响应脱敏 | ✅ 已实现 | 掩码展示、盲索引查询 |
| Web Cookie 认证 | 管理端 HttpOnly Cookie | ✅ 已实现 | `sdm_admin_session` |

### 2.7 社区能力

| 规格项 | 描述 | 状态 | 说明 |
|--------|------|------|------|
| 社区频道 | 小程序支持频道列表、频道发帖、频道详情、成员管理、删除频道、评论与通知 | ⚠️ 部分实现 | 已完成按设计稿纠偏的发帖页与单列帖子流，并将频道管理内页重做为 iPhone 风格的极简成员页；频道删除会级联清理帖子、评论和成员数据；Flutter 端待补 |
| 频道公告 | 社区频道内独立入口发布公告、与帖子并列独立页展示 | ✅ 已实现 | 公告与帖子是两类独立资源（独立表、独立 API、独立页 + 独立发布入口），仅频道管理员可发，免审；入口以「动态流上方公告栏卡片」形态呈现，不采用 tab 切换；发布人/频道管理员可删除公告；详见 [SPEC-11_社区-频道公告.md](SPEC-11_社区-频道公告.md) |
| 频道日历 | 社区频道内独立日历视图，用于承载活动、提醒和时间安排 | ✅ 已实现 | 已支持按频道查看月历、按日期查看事件、管理员创建/编辑/删除事件；可关联现有活动，详见 [SPEC-12_社区-频道日历.md](SPEC-12_社区-频道日历.md) |
| 角色：老师/学生 | 平台存在老师、学生两种角色 | ❌ 未实现 | 需单独设计 |
| 老师发布学习视频 | 老师可创建教导活动，发布学习视频 | ❌ 未实现 | 需内容模型 |
| 学生跟练与打卡 | 学生跟练并上传打卡 | ❌ 未实现 | 需打卡内容类型 |

### 2.8 视觉与体验

| 规格项 | 描述 | 状态 | 说明 |
|--------|------|------|------|
| 现代 UI | 参考 Teams、即刻、微信风格 | ⚠️ 部分实现 | 小程序首版视觉已完成 |
| 首页活动列表改版 | 小程序首页活动列表采用探索页极简留白风格，活动封面统一为正方形卡片，列表信息改为左图右文 | ✅ 已实现 | `miniprogram/pages/index/index.wxml`, `miniprogram/pages/index/index.wxss`, `miniprogram/pages/index/index.js` |
| 活动详情页改版 | 小程序活动详情页采用极简海报式排版，统一主色 `#2A4D87`，增加自定义顶部返回/更多、主题标题、大图卡片、信息分栏与底部文字式报名入口 | ✅ 已实现 | `miniprogram/pages/activity-detail/activity-detail.wxml`, `miniprogram/pages/activity-detail/activity-detail.wxss`, `miniprogram/pages/activity-detail/activity-detail.js` |
| 活动发布页改版 | 小程序发布活动页采用单列极简表单，补齐自定义顶部栏、开始/结束时间选择、公开活动、报名限额、支付设置、地点与介绍区块 | ✅ 已实现 | `miniprogram/pages/create-activity/create-activity.wxml`, `miniprogram/pages/create-activity/create-activity.wxss`, `miniprogram/pages/create-activity/create-activity.js`, `miniprogram/pages/create-activity/create-activity.json` |
| 社区发帖页改版 | 小程序发布动态页改为“文字区在上、图片区在下”的单列表单，右上角采用圆角发布按钮，图片选择与删除独立管理，提交时自动生成标题 | ✅ 已实现 | `miniprogram/pages/community-post-create/community-post-create.wxml`, `miniprogram/pages/community-post-create/community-post-create.wxss`, `miniprogram/pages/community-post-create/community-post-create.js`, `miniprogram/components/page-header/page-header.wxss` |
| 管理员用户详情页收敛 | 小程序管理员用户详情页收敛为白底轻卡片风格，统一信息概览、基础信息、管理信息与底部操作区的留白节奏 | ✅ 已实现 | `miniprogram/pages/user-detail/user-detail.wxml`, `miniprogram/pages/user-detail/user-detail.wxss` |
| 我的页重设计 | 小程序“我的”页采用白底极简平铺样式，恢复顶部“我的”标题、铃铛入口、头像信息区、三栏统计和极简服务列表 | ✅ 已实现 | `miniprogram/pages/mine/mine.wxml`, `miniprogram/pages/mine/mine.wxss`, `miniprogram/pages/mine/mine.js`, `miniprogram/pages/mine/mine.json` |
| 小程序字体系统统一 | 小程序全局字体统一为 `LorchinSansP0` + `PingFang SC` 回退链，业务正文移除宋体/Georgia/Times 混用，首页品牌主视觉保留衬线展示字 | ✅ 已实现 | `miniprogram/app.wxss`, `docs/specs/SPEC-10_小程序字体规范.md`, `miniprogram/pages/index/index.wxss`, `miniprogram/pages/community/*`, `miniprogram/pages/community-*/*.wxss` |
| 社区频道创建页优化 | 小程序创建社区页按设计稿继续收口为白底极简表单：大标题、蓝色下划线、头像卡片、轻边框输入框与底部文字式主操作 | ✅ 已实现 | `miniprogram/pages/community-channel-create/community-channel-create.wxml`, `miniprogram/pages/community-channel-create/community-channel-create.wxss` |
| 用户头像 | 普通用户可选择默认头像或上传自定义 | ✅ 已实现 | 4 个默认头像 + 自定义上传 |
| 登录页改版 | 小程序登录页海报式视觉 | ✅ 已实现 | 整屏原稿直出 |
| 我的页信息架构 | 一级菜单包含「设置」「协议和说明」 | ✅ 已实现 | 设置承载账号操作，协议页承载文档入口 |
| 报名页极简重排版 | 小程序活动报名页采用克制的高级字体层级与文字入口式提交 | ✅ 已实现 | 保留原版式结构，统一为 PingFang SC / SF Pro 字体系统与极细分隔线 |
| 活动展示页字体升级 | 小程序首页/活动列表/活动详情三页接入落尘无衬 P0 (Lorchin Sans P0) | ✅ 已实现 | 走 `wx.loadFontFace` + 后端 `/uploads/fonts/LorchinSansP0.woff2` 网络字体，当前线上字体为基于小程序实际文案字符集裁切的子集版，原始全量字体保留为 `/uploads/fonts/LorchinSansP0.full.woff2` 备用 |

---

## 三、部署架构

- **Docker Compose**：后端 + 前端 + MySQL + Cloudflare Tunnel 一键启动
- **数据库**：MySQL 自建，表结构 `backend/table.sql`，字段变更 `backend/field.sql`
- **公网入口**：Cloudflare Tunnel，域名 `api.chronono.org` / `web.chronono.org`
- **环境配置**：根目录 `.env` 为正式环境配置入口

详见 `docs/deploy/` 目录。

---

## 四、规格变更记录

| 日期 | 变更内容 | 关联文档 |
|------|----------|----------|
| 2026-07-14 | 新增 Teams 社区内容导出工具：通过已登录 Chrome 会话遍历社区主帖及完整回复，仅保留作者名包含 `Inc` 的内容；支持按社区保存检查点、分批增量跳过未变化帖子、按帖子标题建立独立目录，下载文字和图片，并生成原始归档 JSON、Markdown 与适配小程序社区字段的导入草稿 | `tools/teams-community-crawler/` |
| 2026-07-04 | 后端安全加固：退款流水新增 `(tenant_id, payment_order_id, idempotency_key)` 唯一约束并在接口层兜底并发重复退款；支付失败回调补齐与成功回调一致的业务字段绑定校验；超级管理员初始化脚本改为必须通过 `BOOTSTRAP_ADMIN_PASSWORD` 注入密码；角色分配不再下发可预测默认密码，密码登录会强制拦截 `must_reset_password=1` 的账号 | `backend/app/api/v1/endpoints/payments.py`, `backend/app/api/v1/endpoints/roles.py`, `backend/app/api/v1/endpoints/auth.py`, `backend/app/schemas.py`, `backend/sql/table.sql`, `backend/create_admin.py` |
| 2026-07-11 | 报名页订阅消息授权升级为一次请求两个模板：报名成功与报名失败/审核结果通知同弹窗授权；后端补齐首次报名确认、审核结果通知与租户级通知配置入口，管理员可在小程序“通知配置”页维护模板与 JSON 内容 | `miniprogram/pages/register/register.js`, `miniprogram/pages/notification-config/*`, `backend/app/services/notification_center.py`, `backend/app/api/v1/endpoints/participants.py`, `backend/app/api/v1/endpoints/payments.py`, `backend/app/api/v1/endpoints/notifications.py`, `backend/app/models/notification.py`, `backend/tests/api/test_notifications.py`, `backend/tests/api/test_participants.py`, `miniprogram/tests/register-page.test.js` |
| 2026-07-05 | 新增微信通知场景开发文档，明确“长期人员审核通过直发 Zoom 通知”和“新伙伴报名确认 + 审核结果”两类链路的模板拆分、授权时机与后端触发点 | `docs/specs/SPEC-13_微信通知场景开发文档.md`, `docs/specs/SPEC-04_小程序-订阅消息通知.md`, `backend/app/services/notification_center.py`, `backend/app/api/v1/endpoints/notifications.py`, `miniprogram/pages/register/register.js` |
| 2026-06-21 | 社区频道日历功能落地：新增频道内独立月历组件、日历首页/详情/新建/编辑页面，以及后端事件 API、月汇总和级联删除 | `docs/specs/SPEC-12_社区-频道日历.md`, `backend/app/api/v1/endpoints/community.py`, `backend/app/crud/crud_community_channel.py`, `backend/app/models/community.py`, `backend/app/schemas.py`, `miniprogram/components/community-calendar/`, `miniprogram/pages/community-calendar*/` |
| 2026-07-03 | 小程序订阅消息链路补齐报名成功通知：新增租户级通知场景配置表 `notification_scene_config`，报名页接入 `wx.requestSubscribeMessage` 授权弹窗并上报结果，后端支持报名成功/退款结果/活动提醒统一按配置入队与发送 | `docs/specs/SPEC-04_小程序-订阅消息通知.md`, `docs/specs/SPEC-01_产品总规格.md`, `backend/app/api/v1/endpoints/notifications.py`, `backend/app/api/v1/endpoints/participants.py`, `backend/app/api/v1/endpoints/payments.py`, `backend/app/services/notification_center.py`, `backend/sql/table.sql`, `miniprogram/pages/register/register.js`, `miniprogram/utils/api.js` |
| 2026-07-04 | 报名成功通知支持活动级配置：新增 `activity_notification_config`，活动发布页可直接填写报名成功订阅消息配置，活动编辑页新增通知配置入口与独立管理页，发送时优先活动配置、缺省回退租户默认配置 | `backend/app/api/v1/endpoints/activities.py`, `backend/app/services/notification_center.py`, `backend/sql/table.sql`, `miniprogram/pages/create-activity/*`, `miniprogram/pages/edit-activity/*`, `miniprogram/pages/activity-notification-config/*`, `miniprogram/utils/activity-notification.js`, `docs/specs/SPEC-04_小程序-订阅消息通知.md` |
| 2026-06-21 | 立项社区频道日历能力：为每个社区增加独立日历视图与事件管理能力，先以规格文档固化范围、角色、事件模型与页面形态 | `docs/specs/SPEC-12_社区-频道日历.md` |
| 2026-06-21 | 取消用户姓名加密，`user.name` 改为明文存储；补充历史密文回填脚本 `backend/scripts/migrate_user_names_to_plaintext.py`，并同步修订数据安全规格 | `backend/app/schemas.py`, `backend/scripts/migrate_user_names_to_plaintext.py`, `docs/specs/SPEC-01_产品总规格.md` |
| 2026-06-21 | 小程序社区发布页抽出公共富文本编辑器方法：标题截断、编辑器上下文、富文本快照、图片插入与正文校验统一复用，发布动态/发布公告仅保留各自业务壳与提交接口 | `miniprogram/utils/community-editor.js`, `miniprogram/pages/community-post-create/*`, `miniprogram/pages/community-announcement-create/*`, `miniprogram/tests/community-post-create-page.test.js`, `miniprogram/tests/community-announcement-create-page.test.js` |
| 2026-06-21 | 小程序创建社区页按设计稿优化为白底极简表单：保留大标题与蓝色下划线，补齐头像上传卡片、轻边框输入框和底部文字式创建入口 | `miniprogram/pages/community-channel-create/*` |
| 2026-06-21 | 小程序发布动态页重做为公告同款编辑器布局：标题输入 + 富文本正文 + 工具栏 + 插图按钮 + 底部发布按钮，统一频道/活动两种入口的视觉与交互 | `miniprogram/pages/community-post-create/*`, `miniprogram/tests/community-post-create-page.test.js` |
| 2026-06-17 | 小程序登录态兜底统一收口：我的页、设置页、我的订单页及各类受保护页面在登录态失效时不再停留或 `navigateBack`，统一 `reLaunch` 到登录页；补充登录重定向测试与 `auth.redirectToLogin` 公共方法 | `miniprogram/utils/auth.js`, `miniprogram/pages/mine/*`, `miniprogram/pages/settings/*`, `miniprogram/pages/my-orders/*`, `miniprogram/pages/my-activities/*`, `miniprogram/pages/activity-participants/*`, `miniprogram/pages/activity-statistics/*`, `miniprogram/pages/activity-checkins/*`, `miniprogram/pages/create-activity/*`, `miniprogram/pages/edit-activity/*`, `miniprogram/pages/community-post-create/*`, `miniprogram/pages/community-channel-create/*`, `miniprogram/tests/auth.test.js`, `miniprogram/tests/login-redirect-guards.test.js` |
| 2026-06-15 | 社区频道公告能力完整实现：后端新增独立表 `community_channel_announcement` + 5 个 API（list/create/detail/summary/delete），删频道级联清理；小程序新增 `community-announcement-list/detail/create` 3 个独立页 + `community-post-list` 顶部加「📢 公告」入口卡片与「+ 公告」按钮；19 + 8 = 27 个测试全过 | [SPEC-11_社区-频道公告.md](SPEC-11_社区-频道公告.md), `backend/app/api/v1/endpoints/community.py`, `backend/app/crud/crud_community_channel.py`, `backend/app/schemas.py`, `backend/app/models/community.py`, `backend/sql/table.sql`, `backend/tests/api/test_community_announcements.py`, `miniprogram/pages/community-announcement-list/*`, `miniprogram/pages/community-announcement-detail/*`, `miniprogram/pages/community-announcement-create/*`, `miniprogram/pages/community-post-list/*`, `miniprogram/utils/api.js`, `miniprogram/app.json`, `miniprogram/tests/community-announcement-page.test.js` |
| 2026-06-14 | 立项社区频道公告能力：公告与帖子是独立资源（独立表 `community_channel_announcement`、独立 API `/community/channels/{id}/announcements`、独立页 `community-announcement-list/detail/create` + 频道内 tab 容器 `community-channel-tabs`），仅频道管理员可发、免审、跨租户校验、删频道级联清理 | [SPEC-11_社区-频道公告.md](SPEC-11_社区-频道公告.md) |
| 2026-06-14 | 小程序活动展示页字体子集化：从当前小程序文案提取可用字符生成 `backend/uploads/fonts/LorchinSansP0.woff2` 子集字体，并保留原始全量字体为 `backend/uploads/fonts/LorchinSansP0.full.woff2` 备用，继续由 `wx.loadFontFace` 动态注册 | `backend/uploads/fonts/LorchinSansP0.woff2`, `backend/uploads/fonts/LorchinSansP0.full.woff2`, `backend/scripts/generate_lorchin_subset_font.py`, `miniprogram/app.js` |
| 2026-06-14 | 小程序报名支付取消链路收口：取消微信支付后会同步删除后端待支付订单、对应报名记录与本地订单历史；活动详情页和报名页移除“继续支付”恢复入口，相关状态统一收敛为“报名处理中”提示 | `backend/app/api/v1/endpoints/payments.py`, `backend/tests/api/test_payments.py`, `miniprogram/pages/register/*`, `miniprogram/pages/activity-detail/*`, `miniprogram/pages/index/*`, `miniprogram/pages/my-activities/*`, `miniprogram/utils/api.js`, `miniprogram/utils/payment-order.js`, `miniprogram/utils/mine-data.js` |
| 2026-06-14 | 修复发布动态图片不展示 & 活动动态详情打不开：发布页 onInsertImage 拆分为 imageRelativeUrl/imageDisplayUrl，编辑器插入用完整 URL、字符串快照与后端存储统一以相对路径为准（新增 _normalizeImageSrcsToRelative 反向还原），onEditorInput/onEditorBlur/_captureEditorSnapshot 写入 _editorHtml 前均做 URL 标准化；community-post-detail 双模式化，按 channelId 是否存在识别 channel/activity 模式，分别调 channel 版与 activity 版 API | `miniprogram/pages/community-post-create/community-post-create.js`, `miniprogram/pages/community-post-detail/community-post-detail.js`, `miniprogram/tests/community-post-create-page.test.js` |
| 2026-06-14 | 修复活动详情页"发布动态"报 422：`community-post-create` 页面双模式化，按 query 自动识别 `activity` / `channel` 模式分别调 `POST /community/posts` 与 `POST /community/channels/{id}/posts`；缺参数时 toast + 自动返回，替代原"按钮仍可点"导致 URL 出现 `/channels/null/posts` 的旧行为 | `miniprogram/pages/community-post-create/community-post-create.js`, `miniprogram/pages/community-post-create/community-post-create.wxml` |
| 2026-06-13 | 小程序字体系统统一：全局字体收口为 `LorchinSansP0` + `PingFang SC`，社区内页移除宋体/Georgia/Times 混用，首页品牌主视觉保留衬线展示字，并补充 `SPEC-10_小程序字体规范.md` | `miniprogram/app.wxss`, `miniprogram/pages/index/index.wxss`, `miniprogram/pages/community/*`, `docs/specs/SPEC-10_小程序字体规范.md` |
| 2026-06-13 | 小程序活动展示页（首页/活动列表/活动详情）接入落尘无衬 P0 字体：`backend/uploads/fonts/LorchinSansP0.woff2` + `wx.loadFontFace` 动态注册，并统一收口字体族 | `miniprogram/app.js`, `miniprogram/app.wxss`, `miniprogram/pages/index/index.wxss`, `miniprogram/pages/activity-list/activity-list.wxss`, `miniprogram/pages/activity-detail/activity-detail.wxss`, `backend/uploads/fonts/LorchinSansP0.woff2` |
| 2026-06-13 | 小程序频道管理内页按设计稿重做为 iPhone 风格极简页面：补齐状态栏、手势胶囊、频道标题、成员头图与邀请按钮的视觉层级 | `miniprogram/pages/community-channel-manage/community-channel-manage.wxml`, `miniprogram/pages/community-channel-manage/community-channel-manage.wxss`, `miniprogram/pages/community-channel-manage/community-channel-manage.js` |
| 2026-06-12 | 小程序频道动态页补回评论入口：频道动态列表支持展开评论、上传图片并提交评论，复用后端 `POST /community/channels/{channel_id}/posts/{post_id}/comments` 及评论预览链路 | `miniprogram/pages/community-post-list/*`, `miniprogram/tests/community-post-list-page.test.js`, `backend/app/api/v1/endpoints/community.py` |
| 2026-06-12 | 小程序管理员用户详情页与发布活动页继续收敛到统一留白基线：用户详情页移除渐变与重阴影，发布活动页统一输入/选择控件的线性节奏与底部操作区 | `docs/specs/SPEC-09_小程序UI留白与间距规范.md`, `miniprogram/pages/user-detail/*`, `miniprogram/pages/create-activity/*` |
| 2026-06-10 | 小程序频道管理页新增删除频道入口，后端提供 `DELETE /community/channels/{id}`，删除频道时级联清理帖子、评论、成员、邀请通知与审核任务 | `backend/app/api/v1/endpoints/community.py`, `backend/app/crud/crud_community_channel.py`, `backend/tests/api/test_community_channels.py`, `miniprogram/pages/community-channel-manage/*`, `miniprogram/utils/api.js` |
| 2026-06-10 | 小程序内页自定义顶部栏收口：抽出统一 `page-header` 组件，活动详情、发布活动、报名页、发帖页、用户详情与用户列表统一返回箭头样式与标题布局 | `docs/specs/SPEC-03_小程序-UI重构.md`, `miniprogram/components/page-header/*`, `miniprogram/pages/activity-detail/*`, `miniprogram/pages/create-activity/*`, `miniprogram/pages/register/*`, `miniprogram/pages/community-post-create/*`, `miniprogram/pages/user-detail/*`, `miniprogram/pages/user-list/*` |
| 2026-06-10 | 小程序发布活动页按设计稿重做为单列极简表单：补齐自定义顶部栏、时间选择、公开活动、报名限额、支付设置、地点与介绍区块，视觉与活动详情/我的页统一 | `docs/specs/SPEC-03_小程序-UI重构.md`, `miniprogram/pages/create-activity/*` |
| 2026-06-10 | 社区频道管理员发帖规则收口：管理员发布动态完全免审，文本与图片都不进入审核队列，帖子直接以 `status=1` 展示；补充管理员免审回归测试 | `docs/specs/SPEC-07_社区-频道Phase2-UI大改.md`, `backend/app/api/v1/endpoints/community.py`, `backend/tests/api/test_community_channels.py` |
| 2026-06-10 | 社区频道按设计稿纠偏：社区发帖页重做为编辑器式发布页，补齐自定义头部、图片上传插入、清空确认和编辑器快照同步，频道动态列表回退为单列信息流，后端补充 `content_format`、作者头像和评论预览字段 | `docs/specs/SPEC-07_社区-频道Phase2-UI大改.md`, `miniprogram/pages/community-post-create/*`, `miniprogram/pages/community-post-list/*`, `backend/app/crud/crud_community_channel.py`, `backend/app/models/community.py`, `backend/app/schemas.py`, `backend/sql/table.sql` |
| 2026-06-10 | 小程序“我的”页重设计为白底极简平铺样式：恢复顶部“我的”标题与铃铛入口，保留头像信息区、三栏统计和极简服务列表 | `miniprogram/pages/mine/mine.wxml`, `miniprogram/pages/mine/mine.wxss`, `miniprogram/pages/mine/mine.js`, `miniprogram/pages/mine/mine.json` |
| 2026-06-09 | 小程序活动详情页改版为海报式极简详情页：顶部自定义返回/更多、蓝色主题锚点、海报卡片、信息分栏、底部文字式报名入口 | `miniprogram/pages/activity-detail/activity-detail.wxml`, `miniprogram/pages/activity-detail/activity-detail.wxss`, `miniprogram/pages/activity-detail/activity-detail.js` |
| 2026-05-27 | 新增小程序订阅消息通知能力底座：支持订阅授权上报、通知任务入队去重、失败重试（最多5次）、活动开始前30分钟提醒（仅审核通过且已支付/免支付人群）；新增退款结果通知入队接口 | `docs/specs/SPEC-04_小程序-订阅消息通知.md`, `backend/app/api/v1/endpoints/notifications.py`, `backend/app/tasks/scheduler.py`, `backend/app/services/wechat_subscribe.py` |
| 2026-06-09 | 小程序首页活动列表改版为探索页风格：增加大标题留白区、顶部极简入口、左图右文列表与正方形活动封面 | `miniprogram/pages/index/index.wxml`, `miniprogram/pages/index/index.wxss`, `miniprogram/pages/index/index.js` |
| 2026-06-07 | 统一付费活动报名语义：待支付记录不再视为已报名，小程序活动详情/我的活动/社区可见性同步区分“待支付”与“已报名” | `backend/app/crud/crud_participant.py`, `backend/tests/api/test_community.py`, `backend/tests/unit/test_crud_participant.py`, `miniprogram/pages/activity-detail/*`, `miniprogram/pages/index/*`, `miniprogram/pages/my-activities/*`, `miniprogram/utils/mine-data.js` |
| 2026-05-19 | 小程序活动报名页重做字体系统与信息节奏，底部提交改为极简文字入口样式 | `miniprogram/pages/register/register.wxml`, `miniprogram/pages/register/register.wxss` |
| 2026-05-18 | 新增微信审核合规文档：《微信小程序隐私政策》《微信小程序用户服务协议》 | `docs/compliance/微信小程序隐私政策.md`, `docs/compliance/微信小程序用户服务协议.md` |
| 2026-05-17 | 下线小程序身份证采集、证件展示与实名核验链路；绑定资料改为无证件字段 | `miniprogram/pages/bind-user-info/*`, `miniprogram/utils/api.js`, `backend/app/api/v1/endpoints/users.py` |
| 2026-05-17 | 小程序“我的”页重构：新增设置/协议和说明，个人信息更正改为完整表单，账号注销迁移到设置页，移除前端删除个人信息入口 | `miniprogram/pages/mine/*`, `miniprogram/pages/settings/*`, `miniprogram/pages/profile-edit/*`, `miniprogram/pages/agreement-notes/*` |
| 2026-05-16 | 小程序新增账号注销、个人信息更正/删除（不含身份证） | `backend/app/api/v1/endpoints/users.py` |
| 2026-05-15 | 证件类型收敛、镜像部署策略 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 2026-05-12 | 数据安全全量上线 | `docs/review/支付代码审查报告.md` |
| 2026-05-09 | 小程序视觉重构、配置治理 | `docs/archive/` |
| 2026-05-08 | 部署规格补充 | `docs/deploy/Ubuntu镜像部署-单私有仓库.md` |

---

*文档版本：v2 | 按功能模块动态追踪*
