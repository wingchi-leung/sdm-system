from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.security import create_platform_access_token
from app.schemas import Tenant
from tests.conftest import auth_headers


def test_platform_admin_can_list_tenants(client, db_session: Session, platform_admin):
    db_session.add(
        Tenant(
            name="第二租户",
            code="second",
            status=1,
            plan="pro",
            max_admins=10,
            max_activities=300,
            expire_at=datetime.now() + timedelta(days=30),
            contact_name="张三",
            contact_phone="13800138099",
        )
    )
    db_session.commit()

    token = create_platform_access_token(sub=str(platform_admin.id))
    response = client.get("/api/v1/tenants", headers=auth_headers(token))

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert payload["summary"]["total"] == 2
    assert payload["summary"]["active"] == 2
    assert any(item["code"] == "second" for item in payload["items"])


def test_tenant_admin_cannot_list_tenants(client, super_admin_token):
    response = client.get("/api/v1/tenants", headers=auth_headers(super_admin_token))

    assert response.status_code == 401


def test_platform_admin_can_create_and_disable_tenant(client, platform_admin):
    token = create_platform_access_token(sub=str(platform_admin.id))
    create_response = client.post(
        "/api/v1/tenants",
        headers=auth_headers(token),
        json={
            "name": "华东运营中心",
            "code": "east-center",
            "plan": "pro",
            "max_admins": 8,
            "max_activities": 200,
            "contact_name": "李四",
            "contact_phone": "13800138100",
        },
    )

    assert create_response.status_code == 200
    tenant = create_response.json()
    assert tenant["code"] == "east-center"
    assert tenant["status"] == 1

    update_response = client.patch(
        f"/api/v1/tenants/{tenant['id']}",
        headers=auth_headers(token),
        json={"status": 0},
    )

    assert update_response.status_code == 200
    assert update_response.json()["status"] == 0


def test_create_tenant_rejects_duplicate_code(client, platform_admin):
    token = create_platform_access_token(sub=str(platform_admin.id))
    response = client.post(
        "/api/v1/tenants",
        headers=auth_headers(token),
        json={
            "name": "重复租户",
            "code": "default",
            "plan": "basic",
            "max_admins": 5,
            "max_activities": 100,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "租户编码已存在"
