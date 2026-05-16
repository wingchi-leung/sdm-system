# 小程序开发规范

本目录是 SDM System 的微信小程序端。

## 铁律：禁止直接操作全局 Data

小程序全局数据必须通过**状态管理**访问，**严禁**在业务代码中直接 `getApp().data.xxx`。

状态管理工具：`miniprogram/utils/store/`（封装了小程序 Storage 的响应式存储）

## 页面结构

```
miniprogram/pages/
├── index/              # 首页（活动列表）
├── login/              # 登录页
├── activity-detail/    # 活动详情
├── activity-list/      # 活动列表
├── bind-user-info/     # 绑定资料
├── mine/               # 我的
├── my-activities/      # 我的报名
├── my-orders/          # 我的订单
├── create-activity/    # 创建活动
├── edit-activity/      # 编辑活动
├── activity-manage/    # 活动管理
├── activity-participants/  # 报名人员
├── activity-checkins/  # 签到
├── activity-statistics/    # 活动统计
├── user-list/          # 用户列表
├── register/           # 注册页
└── avatar-picker/      # 头像选择
```

## API 调用

- 统一入口：`miniprogram/utils/api.js`
- 租户上下文：`miniprogram/utils/tenant.js`（从运行时读取 `tenant_code`）
- 开发者工具默认直连 `http://127.0.0.1:8000`（本机联调）
- 正式版固定走生产 HTTPS

## 登录拦截

- 未登录用户不能查看活动列表和活动详情
- 登录后 `redirect` 只允许跳转白名单页面
- 租户切换时必须清理旧登录态

## 提交前自检

- 开发者工具控制台无报错
- 无敏感信息（姓名、手机号、身份证）打印
- 页面可正常跳转

## 多语言

小程序无内置 i18n，中文 UI 直接写死。
