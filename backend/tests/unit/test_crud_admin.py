"""管理员认证与 RBAC 单元测试。"""
import pytest
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.crud import crud_auth, crud_rbac
from app.schemas import AdminUser, Permission, Role, RolePermission, UserRole
from tests.factories import AdminUserFactory


@pytest.mark.unit
class TestAdminCRUD:
    """管理员认证与权限操作测试"""

    def test_get_admin_by_username_found(self, db_session: Session):
        """测试通过用户名查找管理员"""
        admin = AdminUserFactory(username="test_admin")
        db_session.commit()

        found = crud_auth.get_admin_by_username(db_session, "test_admin", tenant_id=1)
        assert found is not None
        assert found.username == "test_admin"

    def test_get_admin_by_username_not_found(self, db_session: Session):
        """测试通过用户名查找不存在的管理员"""
        found = crud_auth.get_admin_by_username(db_session, "nonexistent", tenant_id=1)
        assert found is None

    def test_create_admin_success(self, db_session: Session):
        """测试创建管理员账号"""
        admin = crud_auth.create_admin(
            db_session,
            user_id=2001,
            username="created_admin",
            password="password123",
            tenant_id=1,
        )
        assert admin.username == "created_admin"
        assert admin.user_id == 2001

    def test_create_admin_password_hashed(self, db_session: Session):
        """测试创建管理员时密码被哈希存储"""
        admin = crud_auth.create_admin(
            db_session,
            user_id=2002,
            username="hashed_admin",
            password="password123",
            tenant_id=1,
        )
        assert admin.password_hash != "password123"

    def test_get_admin_by_primary_key_found(self, db_session: Session):
        """测试通过主键直接查询管理员"""
        admin = AdminUserFactory()
        db_session.commit()

        found = db_session.query(AdminUser).filter(AdminUser.id == admin.id).first()
        assert found is not None
        assert found.id == admin.id

    def test_authenticate_admin_success(self, db_session: Session):
        """测试成功的管理员认证"""
        admin = AdminUserFactory(
            username="auth_admin",
            password_hash=hash_password("correct_password"),
        )
        db_session.commit()

        authenticated = crud_auth.authenticate_admin(
            db_session, "auth_admin", "correct_password", tenant_id=1
        )
        assert authenticated is not None
        assert authenticated.id == admin.id

    def test_authenticate_admin_wrong_password(self, db_session: Session):
        """测试错误密码的认证"""
        AdminUserFactory(
            username="auth_admin",
            password_hash=hash_password("correct_password"),
        )
        db_session.commit()

        authenticated = crud_auth.authenticate_admin(
            db_session, "auth_admin", "wrong_password", tenant_id=1
        )
        assert authenticated is None

    def test_authenticate_admin_not_found(self, db_session: Session):
        """测试认证不存在的管理员"""
        authenticated = crud_auth.authenticate_admin(
            db_session, "nonexistent", "password", tenant_id=1
        )
        assert authenticated is None

    def test_authenticate_admin_different_tenant(self, db_session: Session):
        """测试跨租户认证隔离"""
        AdminUserFactory(
            username="tenant1_admin",
            password_hash=hash_password("password123"),
            tenant_id=1,
        )
        db_session.commit()

        authenticated = crud_auth.authenticate_admin(
            db_session, "tenant1_admin", "password123", tenant_id=2
        )
        assert authenticated is None

    def test_get_user_permissions(self, db_session: Session):
        """测试查询用户权限列表"""
        admin = AdminUserFactory(user_id=3001, tenant_id=1)
        db_session.add(admin)
        db_session.flush()

        permission = Permission(
            code="activity.create",
            name="activity.create",
            resource="activity",
            action="create",
        )
        role = Role(tenant_id=1, name="测试角色", is_system=0)
        db_session.add_all([permission, role])
        db_session.flush()
        db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
        db_session.add(UserRole(user_id=admin.user_id, role_id=role.id, tenant_id=1))
        db_session.commit()

        permissions = crud_rbac.get_user_permissions(db_session, admin.user_id, tenant_id=1)
        assert "activity.create" in permissions

    def test_has_permission_global_role(self, db_session: Session):
        """测试全局角色拥有权限"""
        admin = AdminUserFactory(user_id=3002, tenant_id=1)
        db_session.add(admin)
        db_session.flush()

        permission = Permission(
            code="participant.view",
            name="participant.view",
            resource="participant",
            action="view",
        )
        role = Role(tenant_id=1, name="全局角色", is_system=0)
        db_session.add_all([permission, role])
        db_session.flush()
        db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
        db_session.add(UserRole(user_id=admin.user_id, role_id=role.id, tenant_id=1))
        db_session.commit()

        assert crud_rbac.has_permission(db_session, admin.user_id, "participant.view", tenant_id=1) is True

    def test_has_permission_missing_role(self, db_session: Session):
        """测试没有角色时权限校验失败"""
        admin = AdminUserFactory(user_id=3003, tenant_id=1)
        db_session.add(admin)
        db_session.commit()

        assert crud_rbac.has_permission(db_session, admin.user_id, "participant.view", tenant_id=1) is False

    def test_authenticate_admin_with_password_hash(self, db_session: Session):
        """测试使用哈希密码认证"""
        password = "test_password"
        AdminUserFactory(
            username="hash_test",
            password_hash=hash_password(password),
        )
        db_session.commit()

        authenticated = crud_auth.authenticate_admin(
            db_session, "hash_test", password, tenant_id=1
        )
        assert authenticated is not None

        authenticated = crud_auth.authenticate_admin(
            db_session, "hash_test", "wrong_password", tenant_id=1
        )
        assert authenticated is None
