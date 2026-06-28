import pytest

from app.crud import crud_credential
from app.core.security import verify_password
from app.schemas import UserCredential


@pytest.mark.unit
def test_get_or_create_phone_credential_reuses_inactive_record(db_session, sample_user):
    """历史停用凭证应被复用并激活，避免唯一键冲突。"""
    phone = "13043458437"
    inactive = UserCredential(
        user_id=sample_user.id,
        tenant_id=sample_user.tenant_id,
        credential_type="phone_code",
        identifier=phone,
        status=0,
    )
    db_session.add(inactive)
    db_session.commit()

    reused = crud_credential.get_or_create_phone_credential(
        db_session, sample_user.id, sample_user.tenant_id, phone
    )
    db_session.commit()

    assert reused.id == inactive.id
    assert reused.status == 1

    all_rows = db_session.query(UserCredential).filter(
        UserCredential.tenant_id == sample_user.tenant_id,
        UserCredential.credential_type == "phone_code",
        UserCredential.identifier == phone,
    ).all()
    assert len(all_rows) == 1


@pytest.mark.unit
def test_create_password_credential_refreshes_existing_identifier(
    db_session,
    sample_user,
):
    """同名密码凭证应刷新到当前用户和新密码，保证幂等创建可自愈。"""
    identifier = "wechatadmin"
    old_credential = UserCredential(
        user_id=sample_user.id,
        tenant_id=sample_user.tenant_id,
        credential_type="password",
        identifier=identifier,
        credential_hash="old_hash",
        must_reset_password=1,
        status=1,
    )
    db_session.add(old_credential)
    db_session.commit()

    refreshed = crud_credential.create_password_credential(
        db_session,
        user_id=sample_user.id,
        tenant_id=sample_user.tenant_id,
        identifier=identifier,
        password="new_password_123",
        must_reset=False,
    )
    db_session.commit()

    assert refreshed.id == old_credential.id
    assert refreshed.user_id == sample_user.id
    assert refreshed.must_reset_password == 0
    assert verify_password("new_password_123", refreshed.credential_hash)
