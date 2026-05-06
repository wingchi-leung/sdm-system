import pytest
from fastapi import status

from tests.conftest import _create_admin_with_role, auth_headers


@pytest.mark.api
def test_available_activity_types_returns_all_for_super_admin(
    client,
    super_admin,
    sample_activity_type,
    sample_activity_type_2,
):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": super_admin.username,
            "password": "admin123",
            "tenant_code": "default",
        },
    )
    assert response.status_code == status.HTTP_200_OK

    token = response.json()["access_token"]
    available_response = client.get(
        "/api/v1/activity-types/available",
        headers=auth_headers(token),
    )

    assert available_response.status_code == status.HTTP_200_OK
    items = available_response.json()
    assert [item["id"] for item in items] == [sample_activity_type.id, sample_activity_type_2.id]


@pytest.mark.api
def test_available_activity_types_returns_scoped_types_for_activity_admin(
    client,
    activity_admin,
    sample_activity_type,
    sample_activity_type_2,
):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": activity_admin.username,
            "password": "admin123",
            "tenant_code": "default",
        },
    )
    assert response.status_code == status.HTTP_200_OK

    token = response.json()["access_token"]
    available_response = client.get(
        "/api/v1/activity-types/available",
        headers=auth_headers(token),
    )

    assert available_response.status_code == status.HTTP_200_OK
    assert available_response.json() == [
        {
            "id": sample_activity_type.id,
            "tenant_id": sample_activity_type.tenant_id,
            "type_name": sample_activity_type.type_name,
            "code": sample_activity_type.code,
            "create_time": sample_activity_type.create_time.isoformat(),
            "update_time": sample_activity_type.update_time.isoformat(),
        }
    ]


@pytest.mark.api
def test_available_activity_types_rejects_admin_without_create_permission(
    client,
    db_session,
    default_tenant,
    sample_activity_type,
):
    admin = _create_admin_with_role(
        db_session,
        tenant_id=default_tenant.id,
        username="viewer_admin",
        password="admin123",
        user_name="只读管理员",
        phone="13800138066",
        identity_number="110101199001011266",
        permission_codes=["participant.view"],
        scope_type="activity_type",
        scope_id=sample_activity_type.id,
    )

    response = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": admin.username,
            "password": "admin123",
            "tenant_code": "default",
        },
    )
    assert response.status_code == status.HTTP_200_OK

    token = response.json()["access_token"]
    available_response = client.get(
        "/api/v1/activity-types/available",
        headers=auth_headers(token),
    )

    assert available_response.status_code == status.HTTP_403_FORBIDDEN
    assert "没有可发布的活动类型" in available_response.json()["detail"]
