# 后端开发规范

本目录是 SDM System 的 Python FastAPI 后端。

## 模型分层（铁律）

| 层 | 文件位置 | 职责 | 注意 |
|----|----------|------|------|
| **SQLAlchemy ORM** | `backend/app/schemas.py` | 数据库模型，唯一事实来源 | 严禁在 models/ 中定义 ORM 类 |
| **Pydantic DTO** | `backend/app/models/` | API 请求/响应数据传输 | 禁止引用 schemas.py 的 ORM 类 |

**boundary**: `schemas.py` 里的 ORM 模型绝不能被 `models/` 下的 Pydantic 模型引用，反之亦然。

## 代码组织

```
backend/app/
├── schemas.py          # SQLAlchemy ORM 模型（唯一事实来源）
├── models/             # Pydantic DTO（请求/响应）
│   ├── user.py
│   ├── activity.py
│   └── ...
├── api/v1/endpoints/   # API 路由
├── crud/               # 数据库操作
├── core/                # 核心配置、安全、PII
└── core/config.py       # 环境配置
```

## 敏感数据处理

- 姓名、手机号、身份证、邮箱：**AES-GCM 加密存储**，不得明文落库
- 密码：**不可逆哈希**，不得明文
- 日志输出：统一脱敏过滤器，禁止打印完整证件号、手机号
- API 响应：姓名脱敏为 `*先生`/`*女士`，手机号显示前3后4，证件号显示前4后4

## API 设计准则

- 列表接口：分页、排序、租户过滤
- 创建/更新：事务包裹，失败回滚
- 删除：软删除优先，硬删除需审批
- 错误：HTTP 状态码语义正确，响应体含中文用户友好消息

## 提交前自检

```bash
cd backend && python -m pytest tests/ -v
```

无测试用例的新逻辑不得提交。

## SQL 变更

- 建表语句 → `backend/table.sql`
- 字段变更 → `backend/field.sql`

## 环境变量

开发环境：`backend/.env`，生产配置：根目录 `.env`，不要把本地绝对路径带入生产。