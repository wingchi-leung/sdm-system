import pytest
from fastapi import status

from app.crud import crud_rbac
from app.schemas import Permission, Role, RolePermission, UserRole
from tests.conftest import auth_headers


def test_ensure_system_rbac_seed_backfills_system_role_permissions(db_session):
    db_session.query(RolePermission).delete()
    db_session.query(Role).filter(Role.id.in_([1, 2, 3])).delete()
    db_session.query(Permission).delete()
    db_session.commit()

    crud_rbac.ensure_system_rbac_seed(db_session)

    permissions = {item.code for item in db_session.query(Permission).all()}
    assert "activity.edit" in permissions
    assert "participant.view" in permissions
    assert "checkin.manage" in permissions

    role = db_session.query(Role).filter(Role.id == 2).first()
    assert role is not None
    bindings = db_session.query(RolePermission).filter(RolePermission.role_id == 2).all()
    bound_permission_ids = {item.permission_id for item in bindings}
    bound_codes = {
        item.code for item in db_session.query(Permission).filter(Permission.id.in_(bound_permission_ids)).all()
    }
    assert "activity.edit" in bound_codes
    assert "participant.view" in bound_codes
    assert "checkin.manage" in bound_codes


@pytest.mark.api
def test_checkin_endpoint_uses_checkin_manage_permission(
    client,
    db_session,
    activity_admin_no_permission,
    activity_admin_no_permission_token,
    active_activity,
):
    role = Role(
        tenant_id=activity_admin_no_permission.tenant_id,
        name="仅签到管理员",
        is_system=0,
        description="只拥有签到权限",
    )
    db_session.add(role)
    db_session.flush()

    permission = db_session.query(Permission).filter(Permission.code == "checkin.manage").first()
    if permission is None:
        crud_rbac.ensure_system_rbac_seed(db_session)
        permission = db_session.query(Permission).filter(Permission.code == "checkin.manage").first()

    db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    db_session.add(
        UserRole(
            user_id=activity_admin_no_permission.id,
            role_id=role.id,
            tenant_id=activity_admin_no_permission.tenant_id,
            scope_type="activity",
            scope_id=active_activity.id,
        )
    )
    db_session.commit()

    response = client.get(
        f"/api/v1/checkins/?activity_id={active_activity.id}",
        headers=auth_headers(activity_admin_no_permission_token),
    )

    assert response.status_code == status.HTTP_200_OK
