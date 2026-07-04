import pytest
from sqlalchemy.exc import IntegrityError

from app.schemas import PaymentRefund


@pytest.mark.unit
def test_payment_refund_enforces_unique_order_idempotency_key(db_session, sample_user):
    first = PaymentRefund(
        tenant_id=sample_user.tenant_id,
        payment_order_id=1,
        participant_id=None,
        out_refund_no="RF-UNIQUE-001",
        amount=1000,
        status="pending",
        idempotency_key="idem-unique-001",
        operator_id=sample_user.id,
        reason="首次退款",
    )
    duplicate = PaymentRefund(
        tenant_id=sample_user.tenant_id,
        payment_order_id=1,
        participant_id=None,
        out_refund_no="RF-UNIQUE-002",
        amount=1000,
        status="pending",
        idempotency_key="idem-unique-001",
        operator_id=sample_user.id,
        reason="重复退款",
    )

    db_session.add(first)
    db_session.flush()
    db_session.add(duplicate)

    with pytest.raises(IntegrityError):
        db_session.flush()
