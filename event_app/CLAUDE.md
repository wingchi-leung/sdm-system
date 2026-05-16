# Flutter 开发规范

本目录是 SDM System 的 Flutter 端（event_app）。

## 代码风格

- 遵循官方 Lint 规则（flutter analyze 通过）
- 类型注解必填
- 单个方法不超过 500 行

## 状态管理

使用 Flutter 内置的 `Provider` / `BLoC`，禁止直接操作全局 Data（参照小程序规则）。

## 项目结构

```
event_app/lib/
├── main.dart
├── models/          # 数据模型
├── providers/       # 状态管理
├── screens/         # 页面
├── services/        # API 调用
└── widgets/         # 通用组件
```

## 提交规范

提交信息必须包含 `[Flutter]` 前缀。

## 错误处理

- 异步操作：`try-catch` + 友好提示
- 组件内错误：`ErrorWidget` 降级展示