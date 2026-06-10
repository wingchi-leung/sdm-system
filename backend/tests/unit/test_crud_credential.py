import pytest

from app.crud import crud_credential
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
