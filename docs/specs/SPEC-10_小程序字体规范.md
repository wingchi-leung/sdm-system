# 小程序字体规范

## 1. 目标

统一 SDM 小程序的字体系统，避免同一产品里混用宋体、黑体、衬线体和系统默认字体。

本规范适用于小程序所有页面和组件，尤其是社区相关内页。

## 2. 全局字体族

### 2.1 基准字体

- 全局默认字体：`LorchinSansP0`
- 回退字体：`PingFang SC` → `-apple-system` → `BlinkMacSystemFont` → `sans-serif`

### 2.2 使用原则

- 页面正文、标题、按钮、表单、状态文案统一使用同一字体族
- 不再在业务页面中单独切换 `Songti SC`、`SimSun`、`Georgia`、`Times New Roman`
- 如果需要做特殊视觉装饰，优先通过字号、字重、间距和颜色区分，不通过字体族区分

### 2.3 允许的例外

- 图标字符、数字徽标、极少量装饰性大字可以使用同一字体族下的不同字重/字号
- 首页品牌主视觉字和少量海报式 hero 标题可使用衬线体作为“展示字”，但只限装饰性标题，不进入正文、表单和列表内容
- 如确需扩大衬线体使用范围，必须走设计评审，不作为默认方案

## 3. 字号档位

结合现有小程序页面的稳定节奏，统一推荐如下档位：

| 角色 | 推荐字号 | 用途 |
|---|---:|---|
| 微注释 | `20rpx` | badge、辅助标签、时间戳、小角标 |
| 次级说明 | `22rpx` | 按钮辅助文案、字段必填符号、轻提示 |
| 副标题 | `24rpx` | 状态说明、meta、卡片辅助文本 |
| 正文 | `26rpx` | 次级正文、评论正文、输入辅助内容 |
| 常规正文 | `28rpx` | 默认正文、输入框内容、表单正文 |
| 小标题 | `32rpx` | 卡片标题、分组标题、列表主标题 |
| 页面标题 | `34rpx` | 页面主标题、详情标题、状态标题 |
| Hero 标题 | `42rpx` | 首页 hero、大区块主视觉标题 |

## 4. 社区页面落点

社区内页按以下层级收口：

- `pages/community/index`: 主标题 `42rpx`，副标题 `24rpx`
- `pages/community-notifications/community-notifications`: hero `42rpx`，空态标题 `32rpx`，列表主标题 `32rpx`
- `pages/community-post-list/community-post-list`: 页面标题 `42rpx`，帖子标题 `34rpx`，正文/摘要 `26rpx`
- `pages/community-post-detail/community-post-detail`: 帖子标题 `34rpx`，正文 `28rpx`，评论正文 `24rpx ~ 26rpx`
- `pages/community-post-create/community-post-create`: 表单标题 `28rpx`，编辑器正文 `28rpx`，工具栏与提示 `20rpx ~ 22rpx`
- `pages/community-channel-create/community-channel-create`: hero `42rpx`，字段标题 `28rpx`，输入正文 `28rpx`
- `pages/community-channel-manage/community-channel-manage`: hero `42rpx`，频道名 `34rpx`，成员名 `32rpx`
- `pages/community-moderation/community-moderation`: 分组标题 `28rpx`，卡片标题 `26rpx`，说明 `22rpx ~ 24rpx`
- `pages/index/index`: 品牌主视觉字允许使用衬线体作为展示字，其余正文继续使用统一字体

## 5. 页面实现要求

1. 新页面优先使用全局字体，不要额外引入第二套字体族。
2. 需要强调层级时，优先先改字号，再改字重，最后才考虑颜色。
3. 同类页面保持同一层级命名和字号，例如“页面标题”“分组标题”“正文”“辅助说明”。
4. 若业务页面出现 `font-family` 覆盖，必须说明原因，并确保不会引入宋体/衬线体混用。
5. 新增页面前先对照本规范和 `SPEC-09_小程序UI留白与间距规范.md`。

## 6. 验收标准

- 全局字体族统一
- 社区内页不再混用宋体、黑体、衬线体
- 页面标题、正文、辅助文案的字号落在统一档位
- 没有 58rpx、62rpx、74rpx 这类不必要的夸张标题字号出现在普通内页
