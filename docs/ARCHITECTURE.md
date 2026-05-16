# SDM System 技术架构

## 系统概览

SDM System 是一个包含多端的管理系统：

```
├── backend/          # Python FastAPI 后端
├── frontend/         # Next.js Web 管理端
├── event_app/        # Flutter 端
└── miniprogram/      # 微信小程序
```

## 后端架构（Python FastAPI）

### 模型分层

| 层 | 文件 | 职责 |
|----|------|------|
| SQLAlchemy ORM | `backend/app/schemas.py` | 数据库模型，唯一事实来源 |
| Pydantic DTO | `backend/app/models/` | API 请求/响应 DTO |

### 核心模块

```
backend/app/
├── schemas.py          # 所有 SQLAlchemy ORM 模型
├── models/             # Pydantic DTO（user.py, activity.py 等）
├── api/v1/
│   ├── router.py       # API 路由汇总
│   └── endpoints/      # 各功能端点
│       ├── activities.py
│       ├── auth.py
│       ├── participants.py
│       ├── payments.py
│       └── ...
├── crud/               # 数据库操作封装
├── core/
│   ├── config.py       # 环境配置
│   ├── security.py     # JWT / 鉴权
│   └── pii.py          # 敏感信息加解密
└── core/pii.py         # PII 处理（AES-GCM）
```

### 关键设计

**敏感数据加密**：姓名、手机号、身份证、邮箱使用 AES-GCM 加密存储，同时保存盲索引（hash）和掩码用于查询/展示。

**多租户隔离**：所有业务表都有 `tenant_id`，请求时 JWT 携带租户上下文，CRUD 时强制过滤。

**管理员 RBAC**：`admin_user` + `admin_role` + `admin_permission`，支持超级管理员和按活动类型授权的活动管理员。

## 前端架构（Next.js）

```
frontend/src/
├── App.tsx              # 应用入口
├── index.tsx            # 渲染入口
├── components/
│   ├── ui/              # 通用 UI 组件
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── ActivityList.tsx
│   └── ...
└── utils/
    └── api.ts           # API 封装
```

**认证**：HttpOnly Cookie（`sdm_admin_session`），请求时 `credentials: include`。

## 小程序架构

```
miniprogram/
├── config/
│   └── index.js         # API 模式配置（local/remote）
├── pages/
│   ├── index/           # 首页（活动列表）
│   ├── login/           # 登录页
│   ├── activity-detail/
│   └── ...
└── utils/
    ├── api.js           # API 统一封装
    ├── tenant.js        # 租户上下文
    └── store/           # 状态管理（禁止直接操作全局 Data）
```

## 数据库

- **MySQL**：自建，数据按 `tenant_id` 租户隔离
- **建表脚本**：`backend/table.sql`
- **字段变更**：`backend/field.sql`

## 部署

Docker Compose 一键启动：后端 + 前端 + MySQL + Cloudflare Tunnel

详见 `docs/deploy/` 目录下的部署文档。