"""
角色与权限 API 测试
"""
import pytest
from fastapi import status

from app.schemas import Role, RolePermission, UserRole
from tests.conftest import _create_admin_with_role, _ensure_permission, auth_headers


@pytest.mark.api
class TestRoleEndpoints:
    """角色与权限接口测试"""

    @pytest.fixture
    def role_manager(self, db_session, default_tenant):
        """创建具备 RBAC 管理能力的管理员"""
        return _create_admin_with_role(
            db_session,
            tenant_id=default_tenant.id,
            username="role_manager",
            password="admin123",
            user_name="权限管理员",
            phone="13800138019",
            identity_number="110101199001011219",
            permission_codes=["role.manage", "admin.manage", "user.view"],
        )

    @pytest.fixture
    def role_manager_token(self, role_manager):
        from app.core.security import create_access_token

        return create_access_token(
            sub=str(role_manager.user_id),
            role="admin",
            tenant_id=role_manager.tenant_id,
        )

    def test_list_permissions(self, client, role_manager_token):
        """测试获取权限列表"""
        response = client.get(
            "/api/v1/roles/permissions",
            headers=auth_headers(role_manager_token),
        )
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.json(), list)

    def test_list_roles_includes_permissions(self, client, db_session, default_tenant, role_manager_token):
        """测试角色列表包含权限详情"""
        permission = _ensure_permission(
            db_session,
            "activity.create",
            resource="activity",
            action="create",
        )
        role = Role(
            tenant_id=default_tenant.id,
            name="活动发布员",
            is_system=0,
            description="可创建活动",
        )
        db_session.add(role)
        db_session.flush()
        db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
        db_session.commit()

        response = client.get(
            "/api/v1/roles/roles",
            headers=auth_headers(role_manager_token),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        target = next(item for item in data if item["id"] == role.id)
        assert target["name"] == "活动发布员"
        assert len(target["permissions"]) == 1
        assert target["permissions"][0]["code"] == "activity.create"

    def test_assign_and_remove_user_role(self, client, db_session, default_tenant, sample_user, role_manager_token):
        """测试分配和移除用户角色"""
        permission = _ensure_permission(
            db_session,
            "participant.view",
            resource="participant",
            action="view",
        )
        role = Role(
            tenant_id=default_tenant.id,
            name="名单查看员",
            is_system=0,
            description="可查看报名名单",
        )
        db_session.add(role)
        db_session.flush()
        db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
        db_session.commit()

        assign_response = client.post(
            "/api/v1/roles/user-roles",
            headers=auth_headers(role_manager_token),
            json={
                "user_id": sample_user.id,
                "role_id": role.id,
                "scope_type": "activity_type",
                "scope_id": 99,
            },
        )
        assert assign_response.status_code == status.HTTP_200_OK
        assigned = assign_response.json()
        assert assigned["role_name"] == "名单查看员"
        assert assigned["scope_type"] == "activity_type"
        assert assigned["scope_id"] == 99

        list_response = client.get(
            f"/api/v1/roles/users/{sample_user.id}/roles",
            headers=auth_headers(role_manager_token),
        )
        assert list_response.status_code == status.HTTP_200_OK
        assert len(list_response.json()) == 1

        delete_response = client.delete(
            f"/api/v1/roles/user-roles/{assigned['id']}",
            headers=auth_headers(role_manager_token),
        )
        assert delete_response.status_code == status.HTTP_200_OK
        assert delete_response.json()["status"] == "success"

        assert db_session.query(UserRole).filter(UserRole.id == assigned["id"]).first() is None
