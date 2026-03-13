# SDM 活动报名 — 微信小程序

本目录为 **微信小程序** 端，与后端 `backend`、管理端 `frontend`、C 端 Flutter App `event_app` 同属 SDM 系统。小程序实现与 Flutter App 一致的核心能力：活动列表、详情、报名、双角色登录（普通用户/管理员）、用户注册、我的页面三态（未登录/用户/管理员）、管理员发布活动。

## 功能概览

| 功能         | 说明 |
|--------------|------|
| 活动列表     | 展示可报名活动（未开始、进行中），下拉刷新；管理员可进入「发布活动」 |
| 活动详情     | 状态、开始/结束时间、标签；未结束可进入报名 |
| 活动报名     | 姓名、手机号必填，证件号选填；已登录用户会携带 token |
| 登录         | 普通用户（手机号+密码）与管理员（用户名+密码）同一页切换；支持**微信一键登录**（需后端配置） |
| 用户注册     | 姓名、手机、密码必填，邮箱选填；注册成功后自动登录 |
| 我的         | 未登录：引导登录/注册；普通用户：个人信息；管理员：发布活动、查看活动、退出 |
| 发布活动     | 管理员在「我的」或活动页进入，填写活动名、标签、开始时间 |

## 环境与运行

1. **微信开发者工具**  
   安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，用「导入项目」选择本目录（`sdm-system/miniprogram`）。  
   - **要用微信一键登录**：必须使用已注册小程序的 AppID，与 `project.config.json` 中的 `appid` 一致（并确保后端 `.env` 配置了同名的 `WECHAT_APPID`、`WECHAT_SECRET`），**不要选「测试号」**（测试号的 code 与真实 AppID 不匹配会报 invalid code）。  
   - 仅做界面调试且不需微信登录时，可临时选「测试号」；此时请用手机号+密码或管理员账号登录。
2. **后端 API**  
   确保 SDM 后端已启动（见 `backend/README.md`），默认 `http://localhost:8000`。  
   小程序 API 基地址在 **`utils/api.js`** 顶部：

   ```js
   const baseUrl = 'http://localhost:8000/api/v1';
   ```

   真机/体验版需改为实际服务器地址（如 `https://your-domain.com/api/v1`），并在微信公众平台配置 **request 合法域名**。

3. **本地开发不校验域名**  
   在微信开发者工具中：详情 → 本地设置 → 勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」，即可用 `http://localhost` 调试。

## 目录结构

```
miniprogram/
├── app.js
├── app.json          # 全局配置、tabBar（活动 / 我的）
├── app.wxss          # 全局样式、CSS 变量
├── project.config.json
├── sitemap.json
├── assets/
│   └── icons/        # tabBar 图标（可替换为 81×81 图标）
├── utils/
│   ├── api.js        # 后端 API 封装、baseUrl
│   └── auth.js       # 登录态（token/role/userId/userName）
└── pages/
    ├── index/              # 活动列表（Tab）
    ├── activity-detail/    # 活动详情
    ├── register/           # 活动报名
    ├── login/              # 登录
    ├── user-register/      # 用户注册
    ├── mine/               # 我的（Tab）
    └── create-activity/    # 发布活动（管理员）
```

## 与后端接口对应

- 活动列表：`GET /api/v1/activities`（前端筛 status=1,2 为可报名）
- 活动详情：由列表页传入数据，无单独详情接口
- 报名：`POST /api/v1/participants/`（可选带 `Authorization`）
- 管理员登录：`POST /api/v1/auth/login`
- 用户登录：`POST /api/v1/auth/user-login`
- 微信授权登录：`POST /api/v1/auth/wechat-login`（Body: `{ "code": "wx.login() 得到的 code" }`，需后端配置 `WECHAT_APPID`、`WECHAT_SECRET`）
- 用户注册：`POST /api/v1/users/register`
- 当前用户信息：`GET /api/v1/users/me`
- 创建活动：`POST /api/v1/activities/`（需管理员 token）

鉴权与接口说明见：`docs/鉴权技术文档.md`、`docs/工程现状与功能说明.md`。

 
## 微信授权登录

- 登录页在「普通用户」模式下提供「微信一键登录」按钮；点击后调用 `wx.login()` 获取 `code`，请求后端 `POST /api/v1/auth/wechat-login`，后端用 code 向微信换 `openid` 并自动创建/登录为普通用户。
- **后端**需在 `.env` 中配置 `WECHAT_APPID`、`WECHAT_SECRET`（小程序后台「开发 → 开发管理 → 开发设置」中查看），并对 `user` 表执行迁移：增加 `wx_openid` 列及唯一索引（见 `backend/table.sql` 末尾）。

## 注意事项

- **tabBar 图标**：当前 `assets/icons/` 下为占位图，正式发布建议替换为 81×81 的 PNG 图标。
- **生产环境**：请使用 HTTPS、在公众平台配置合法域名，并确保后端鉴权与 CORS 配置正确。
