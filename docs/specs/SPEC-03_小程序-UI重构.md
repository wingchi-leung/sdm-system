# 小程序 - UI 重构 SPEC

## 1. 项目目标

本次任务只做微信小程序内页 UI 重构，不改交互逻辑、不改后端接口、不改页面跳转关系、不改数据结构。

目标是让小程序内页整体视觉统一，尽量贴近已提供的设计稿；如果设计稿没有明确间距标准，则以现有高质量页面的实际视觉节奏作为参考，优先对齐以下页面的间距与排版：

- `pages/activity-list/activity-list`
- `pages/activity-detail/activity-detail`
- `pages/mine/mine`

## 2. 变更边界

### 允许修改

- `*.wxml`
- `*.wxss`
- 必要时补充或替换页面所需的静态图片资源

### 不修改

- 页面跳转关系
- 按钮点击行为
- 接口请求与返回处理
- 后端逻辑
- 数据字段含义
- 登录、报名、管理等业务流程

## 3. 间距与排版原则

由于设计稿由 AI 生成，可能没有统一的间距标注，本次统一采用以下原则：

1. 优先参考 `activity-list`、`activity-detail`、`mine` 三个页面的现有间距节奏。
2. 同一类容器在全项目内尽量保持一致的左右边距、卡片圆角、区块间距和列表项内边距。
3. 如果设计稿和现有参考页存在冲突，优先保证整体视觉统一。
4. 页面需要兼顾常见手机宽度和底部安全区。
5. 视觉风格以简洁、克制、干净为准，不要额外增加黄色底色、大面积色块、突兀装饰卡片或无意义背景强调。
6. 如果设计稿里有强烈的黄底、彩色卡片、厚重块面，但参考页没有这种结构，则以参考页为准，弱化或移除这些装饰性设计。

## 4. 参考页

以下页面不是本次重构的主目标，但它们是本次 UI 间距和视觉节奏的主要参考：

- 活动列表：`pages/activity-list/activity-list`
- 活动详情：`pages/activity-detail/activity-detail`
- 我的页面：`pages/mine/mine`

## 5. 本次内页清单

说明：

- 下表只列出非 tab 页的内页。
- `pages/index/index`、`pages/community/index`、`pages/mine/mine` 是 tab 页，不放入本次内页清单，但仍可作为风格参考。
- 如果后续有对应设计稿，请在“设计稿”列补充图片路径。

### 5.1 认证与资料类

这一类页面必须严格参考 `activity-list`、`activity-detail`、`mine` 三个页面的间距、留白、层级和整体气质，目标不是复刻设计稿里的装饰色块，而是把设计稿内容收敛到和参考页一致的简洁风格。

统一要求：

- 不使用黄色底或大色块作为主要背景
- 不使用突兀的卡片堆叠风格
- 不额外增加装饰性模块来填充版面
- 仅修改视觉呈现，不改交互和业务逻辑
- 优先保持信息层级清晰、留白自然、页面轻量

| 页面 | 路径 | 设计稿 | 备注 |
|---|---|---|---|
| 登录页 | `pages/login/login` | 待补充 | 登录入口，UI 可重做，逻辑不变 |
| 普通注册页 | `pages/register/register` | 待补充 | 用户注册页 |
| 用户信息绑定页 | `pages/bind-user-info/bind-user-info` | 已完成 | 绑定/补全用户信息，UI 已统一为与报名页一致的极简单列风格 |
| 用户资料编辑页 | `pages/profile-edit/profile-edit` | 待补充 | 编辑个人资料 |
| 头像选择页 | `pages/avatar-picker/avatar-picker` | 待补充 | 头像选择与预览 |
| 设置页 | `pages/settings/settings` | 待补充 | 设置入口与账号相关操作 |
| 协议说明页 | `pages/agreement-notes/agreement-notes` | 待补充 | 隐私、协议、说明类内容 |

### 5.2 活动管理类

这一类页面同样必须严格参考 `activity-list`、`activity-detail`、`mine` 三个页面的间距、留白、层级和整体气质，统一收敛为干净、克制的活动管理界面。

统一要求：

- 页面主体保持清爽，不要做大面积黄色背景
- 不要把表单区、信息区、统计区做成过度花哨的彩色卡片
- 尽量采用和参考页一致的区块节奏和轻量分隔方式
- 功能区可以分组，但不要为了视觉效果强行堆砌色块
- 只调整 UI 呈现，不改业务逻辑

| 页面 | 路径 | 设计稿 | 备注 |
|---|---|---|---|
| 创建活动页 | `pages/create-activity/create-activity` | 已完成 | 管理员发布活动，按提供设计稿重做为单列极简表单，保留开始/结束时间 |
| 编辑活动页 | `pages/edit-activity/edit-activity` | 待补充 | 管理员编辑活动 |
| 活动参与人页 | `pages/activity-participants/activity-participants` | 待补充 | 查看报名人员 |
| 活动签到页 | `pages/activity-checkins/activity-checkins` | 待补充 | 查看签到记录 |
| 活动统计页 | `pages/activity-statistics/activity-statistics` | 待补充 | 数据统计展示 |


### 5.3 社区类

| 页面 | 路径 | 设计稿 | 备注 |
|---|---|---|---|
| 社区首页 | `pages/community/index` | sdm-system\docs\design-ui\channel-list.png | tab 页，可按需同步优化 |
| 社区通知页 | `pages/community-notifications/community-notifications` | 待补充 | 社区消息/通知列表 |
| 社区帖子列表页 | `pages/community-post-list/community-post-list` | sdm-system\docs\design-ui\channel-message.png| 帖子流列表 |
| 社区发帖页 | `pages/community-post-create/community-post-create` | sdm-system\docs\design-ui\sendpost.png | 发帖、编辑正文和图片 |
| 社区审核页 | `pages/community-moderation/community-moderation` | 待补充 | 内容审核与管理 |

### 5.4 我的与管理类

| 页面 | 路径 | 设计稿 | 备注 |
|---|---|---|---|
| 我的页面 | `pages/mine/mine` | 参考页 | tab 页，作为间距与信息层级参考 |
| 我的活动页 | `pages/my-activities/my-activities` | 待补充 | 用户报名记录、活动列表 |
| 我的订单页 | `pages/my-orders/my-orders` | 待补充 | 订单与支付状态 |
| 用户列表页 | `pages/user-list/user-list` | 已完成 | 管理员用户列表页，按提供设计稿重做为自定义顶部栏、统计、搜索、紧凑列表和更多菜单 |
| 用户详情页 | `pages/user-detail/user-detail` | 已完成 | 用户详情内页，承接列表页“查看详情”，采用信息卡片式布局与底部操作区 |

 
## 8. 验收标准

- 所有纳入清单的页面都完成 UI 调整
- 页面交互、跳转、接口和数据逻辑保持不变
- 视觉风格在同一小程序内保持统一
- 无明显错位、溢出、重叠、底部遮挡
- 设计稿缺少间距标准时，页面整体仍能维持一致的节奏
