"""
管理员 CRUD 单元测试
"""
import pytest
from sqlalchemy.orm import Session

from app.crud.crud_admin import (
    get_admin_by_username,
    get_admin_by_id,
    get_admin_scope,
    authenticate_admin,
)
from app.core.security import hash_password
from app.schemas import AdminUser, AdminActivityTypeRole
from tests.factories import AdminUserFactory, ActivityTypeFactory


@pytest.mark.unit
class TestAdminCRUD:
    """管理员 CRUD 操作测试"""

    def test_get_admin_by_username_found(self, db_session: Session):
        """测试通过用户名查找管理员"""
        admin = AdminUserFactory(username="test_admin")
        db_session.commit()

        found = get_admin_by_username(db_session, "test_admin", tenant_id=1)
        assert found is not None
        assert found.username == "test_admin"

    def test_get_admin_by_username_not_found(self, db_session: Session):
        """测试通过用户名查找不存在的管理员"""
        found = get_admin_by_username(db_session, "nonexistent", tenant_id=1)
        assert found is None

    def test_get_admin_by_id_found(self, db_session: Session):
        """测试通过 ID 查找管理员"""
        admin = AdminUserFactory()
        db_session.commit()

        found = get_admin_by_id(db_session, admin.id, tenant_id=1)
        assert found is not None
        assert found.id == admin.id

    def test_get_admin_by_id_not_found(self, db_session: Session):
        """测试通过 ID 查找不存在的管理员"""
        found = get_admin_by_id(db_session, 99999, tenant_id=1)
        assert found is None

    def test_get_admin_by_id_different_tenant(self, db_session: Session):
        """测试跨租户隔离"""
        admin = AdminUserFactory(username="tenant1_admin", tenant_id=1)
        db_session.commit()

        # 租户2 查询不到租户1的管理员
        found = get_admin_by_id(db_session, admin.id, tenant_id=2)
        assert found is None

    def test_authenticate_admin_success(self, db_session: Session):
        """测试成功的管理员认证"""
        admin = AdminUserFactory(
            username="auth_admin",
            password_hash=hash_password("correct_password")
        )
        db_session.commit()

        authenticated = authenticate_admin(
            db_session, "auth_admin", "correct_password", tenant_id=1
        )
        assert authenticated is not None
        assert authenticated.id == admin.id

    def test_authenticate_admin_wrong_password(self, db_session: Session):
        """测试错误密码的认证"""
        admin = AdminUserFactory(
            username="auth_admin",
            password_hash=hash_password("correct_password")
        )
        db_session.commit()

        authenticated = authenticate_admin(
            db_session, "auth_admin", "wrong_password", tenant_id=1
        )
        assert authenticated is None

    def test_authenticate_admin_not_found(self, db_session: Session):
        """测试认证不存在的管理员"""
        authenticated = authenticate_admin(
            db_session, "nonexistent", "password", tenant_id=1
        )
        assert authenticated is None

    def test_authenticate_admin_different_tenant(self, db_session: Session):
        """测试跨租户认证隔离"""
        admin = AdminUserFactory(
            username="tenant1_admin",
            password_hash=hash_password("password123")
        )
        db_session.commit()

        # 在租户2中认证失败
        authenticated = authenticate_admin(
            db_session, "tenant1_admin", "password123", tenant_id=2
        )
        assert authenticated is None

    def test_get_admin_scope_super_admin(self, db_session: Session):
        """测试超级管理员权限范围"""
        admin = AdminUserFactory(is_super_admin=1)
        db_session.commit()

        is_super, allowed_types = get_admin_scope(db_session, admin.id, tenant_id=1)
        assert is_super is True
        assert allowed_types == []  # 超级管理员空列表表示全部权限

    def test_get_admin_scope_activity_admin(self, db_session: Session):
        """测试活动管理员权限范围"""
        admin = AdminUserFactory(is_super_admin=0)
        db_session.commit()

        # 授予活动类型权限
        type1 = ActivityTypeFactory(tenant_id=1)
        type2 = ActivityTypeFactory(tenant_id=1)
        db_session.commit()

        role1 = AdminActivityTypeRole(
            admin_user_id=admin.id,
            activity_type_id=type1.id,
            tenant_id=1,
        )
        role2 = AdminActivityTypeRole(
            admin_user_id=admin.id,
            activity_type_id=type2.id,
            tenant_id=1,
        )
        db_session.add(role1)
        db_session.add(role2)
        db_session.commit()

        is_super, allowed_types = get_admin_scope(db_session, admin.id, tenant_id=1)
        assert is_super is False
        assert type1.id in allowed_types
        assert type2.id in allowed_types

    def test_get_admin_scope_no_permission(self, db_session: Session):
        """测试无权限的管理员"""
        admin = AdminUserFactory(is_super_admin=0)
        db_session.commit()

        is_super, allowed_types = get_admin_scope(db_session, admin.id, tenant_id=1)
        # 无权限的管理员返回 (True, [])，视为无限制但数据库层面会过滤
        assert is_super is True
        assert allowed_types == []

    def test_get_admin_scope_nonexistent_admin(self, db_session: Session):
        """测试获取不存在管理员的权限"""
        is_super, allowed_types = get_admin_scope(db_session, 99999, tenant_id=1)
        assert is_super is False
        assert allowed_types == []

    def test_authenticate_admin_with_password_hash(self, db_session: Session):
        """测试使用哈希密码认证"""
        password = "test_password"
        admin = AdminUserFactory(
            username="hash_test",
            password_hash=hash_password(password)
        )
        db_session.commit()

        # 正确密码
        authenticated = authenticate_admin(
            db_session, "hash_test", password, tenant_id=1
        )
        assert authenticated is not None

        # 错误密码
        authenticated = authenticate_admin(
            db_session, "hash_test", "wrong_password", tenant_id=1
        )
        assert authenticated is None
