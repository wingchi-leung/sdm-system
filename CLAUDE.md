# AGENTS.md

## 项目概述

SDM System是一个包含后端，web前端，flutter，小程序的一个管理系统

## 项目结构

```
/
├── backend/                    # python后端（fastapi）
├── frontend/             # web前端（nextjs）
├── docs/              #  工程文档
├── event_app                # flutter
└── miniprogram/                 # 小程序
```


# 开发者准则 (Sole Developer Mode)

1. **模型分层规范**:
   - `backend/app/schemas.py`: SQLAlchemy ORM 数据库模型（唯一事实来源）
   - `backend/app/models/`: Pydantic 模型（API 请求/响应数据传输对象）
2. **测试先行**: 修改业务逻辑必须伴随测试用例。
3. **静默失败禁令**: 任何异步调用必须有 try-catch 和用户友好的提示。
4. **代码风格**: 
   - Python: 符合 PEP8, 类型注解必填。
   - Flutter: 遵循官方 Lint 规则。
   - 小程序: 严禁直接操作全局 Data，需使用状态管理。
5. **提交规范**: 提交信息必须包含 [Backend/Flutter/Web/Mini] 前缀。

### 开发指南

- **单一职责**: 每个函数、组件只做一件事
- **DRY**: 重复代码抽取为函数或常量
- **KISS**: 优先简单方案，避免过度设计
- **编写干净、高效的代码** : 单个方法承载单个职责，每个方法不能超过500行

### 注释

- **中文注释**: 使用中文注释和中文 UI
- **必要注释**: 仅在逻辑复杂或不明显处添加注释
- **JSDoc**: 工具函数可添加 JSDoc 说明参数和返回值

### 错误处理

- **函数错误**: 使用 `throw new Error()` 抛出明确错误信息
- **异步操作**: 使用 try-catch 包裹，finally 清理资源
- **类型守卫**: 必要时使用类型守卫确保类型安全


## 任务执行
- 任务执行过程不必确认，每完成一阶段任务自动 commit 并继续下一个任务
- 完成重大调整和改动后，写到`产品规格说明-spec`文档，保证此文档的说明和工程的真实实现符合
- Sql语句：建表语句直接追加到 table.sql ,字段修改语句添加到field.sql中