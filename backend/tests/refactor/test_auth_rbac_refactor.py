import pytest
from fastapi import status

from app.crud import crud_rbac
from app.schemas import Role, User, UserCredential, UserTenant


@pytest.mark.api
def test_register_creates_password_credential_and_user_tenant(client, db_session, default_tenant):
    response = client.post(
        "/api/v1/users/register",
        json={
            "name": "新用户",
            "phone": "13800138123",
            "password": "user123",
            "tenant_code": default_tenant.code,
        },
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()

    user_id = payload["id"]
    credential = db_session.query(UserCredential).filter(
        UserCredential.user_id == user_id,
        UserCredential.tenant_id == default_tenant.id,
        UserCredential.credential_type == "password",
        UserCredential.identifier == "13800138123",
    ).first()
    membership = db_session.query(UserTenant).filter(
        UserTenant.user_id == user_id,
        UserTenant.tenant_id == default_tenant.id,
    ).first()

    assert credential is not None
    assert credential.must_reset_password == 0
    assert membership is not None
    assert membership.status == 1


@pytest.mark.api
def test_login_reads_password_from_user_credential(client, sample_user):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": sample_user.phone,
            "password": "user123",
            "tenant_code": "default",
        },
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["user"]["id"] == sample_user.id
    assert payload["auth"]["is_admin"] is False


@pytest.mark.api
def test_platform_admin_login_uses_unified_login(client, platform_admin):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": platform_admin.username,
            "password": "platform123",
            "tenant_code": "platform",
        },
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["auth"]["is_platform_admin"] is True
    assert payload["tenant"] is None


@pytest.mark.api
def test_wechat_phone_login_binds_openid_in_user_credential(
    client,
    db_session,
    sample_user,
    monkeypatch,
):
    sample_user.phone = "13800138111"
    db_session.commit()

    monkeypatch.setattr(
        "app.api.v1.endpoints.auth._get_phone_number_from_wechat",
        lambda _code: "13800138111",
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.auth._wechat_code2session",
        lambda _code: {"openid": "wx_openid_refactor", "session_key": "session_key"},
    )

    response = client.post(
        "/api/v1/auth/wechat",
        json={
            "code": "phone_code",
            "tenant_code": "default",
            "mode": "phone",
            "login_code": "login_code",
        },
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    credential = db_session.query(UserCredential).filter(
        UserCredential.user_id == sample_user.id,
        UserCredential.tenant_id == sample_user.tenant_id,
        UserCredential.credential_type == "wechat",
        UserCredential.status == 1,
    ).first()

    assert payload["wechat_payment_ready"] is True
    assert credential is not None
    assert credential.identifier == "wx_openid_refactor"


def test_assign_user_role_accepts_system_role(db_session, default_tenant):
    system_role = Role(
        id=1,
        tenant_id=0,
        name="超级管理员",
        is_system=1,
        description="系统角色",
    )
    user = User(
        tenant_id=default_tenant.id,
        name="待授权用户",
        phone="13800138166",
        identity_number="110101199001011266",
        isblock=0,
    )
    db_session.add(system_role)
    db_session.add(user)
    db_session.flush()

    user_role = crud_rbac.assign_user_role(
        db_session,
        user_id=user.id,
        role_id=system_role.id,
        tenant_id=default_tenant.id,
    )

    assert user_role.role_id == system_role.id
    assert user_role.tenant_id == default_tenant.id
