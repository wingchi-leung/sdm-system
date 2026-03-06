"""
测试套件说明

本测试套件为 SDM 后端项目提供全面的自动化测试框架。

## 测试结构

```
tests/
├── conftest.py              # 全局 fixtures 和测试配置
├── factories.py             # 测试数据工厂
├── unit/                    # 单元测试
│   ├── test_crud_user.py    # 用户 CRUD 测试
│   ├── test_crud_activity.py# 活动 CRUD 测试
│   └── test_security.py     # 安全功能测试
├── integration/             # 集成测试
│   ├── test_database.py     # 数据库交互测试
│   └── test_auth_flow.py    # 认证流程测试
├── api/                     # API 测试
│   ├── test_auth.py         # 认证接口
│   ├── test_users.py        # 用户接口
│   ├── test_activities.py   # 活动接口
│   ├── test_participants.py # 参与者接口
│   └── test_checkins.py     # 签到接口
└── e2e/                     # 端到端测试
    ├── test_admin_flow.py   # 管理员完整流程
    └── test_user_flow.py    # 用户完整流程
```

## 运行测试

```bash
# 安装测试依赖
pip install -e ".[dev]"

# 运行所有测试
pytest

# 运行特定类型测试
pytest -m unit          # 单元测试
pytest -m api           # API 测试
pytest -m integration   # 集成测试
pytest -m e2e           # E2E 测试

# 并行运行
pytest -n auto

# 生成覆盖率报告
pytest --cov=app --cov-report=html

# 详细输出
pytest -vv -s
```

## 注意事项

1. **租户隔离**: 所有 CRUD 操作都需要 tenant_id 参数
2. **测试数据**: 使用 SQLite 内存数据库，每个测试独立
3. **Fixtures**: conftest.py 提供了完整的测试 fixtures
4. **API 测试优先**: API 测试可以独立运行，不依赖具体 CRUD 实现

## 测试覆盖目标

- 单元测试: 80%+ 覆盖率
- API 测试: 覆盖所有端点和边界情况
- 集成测试: 覆盖关键业务流程
- E2E 测试: 覆盖核心用户场景

## 待完成

部分单元测试需要根据实际 CRUD 实现进行调整：
- crud_activity.py: 需要适配新的函数签名
- crud_participant.py: 需要查看实际实现
- crud_checkin.py: 需要查看实际实现
- crud_admin.py: 需要适配租户隔离
