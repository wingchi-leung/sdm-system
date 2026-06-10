import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.schemas import PaymentRefund


REFUND_STATUS_PENDING = "pending"
REFUND_STATUS_PROCESSING = "processing"
REFUND_STATUS_SUCCESS = "success"
REFUND_STATUS_FAILED = "failed"
REFUND_STATUS_CLOSED = "closed"


def generate_out_refund_no(*, tenant_id: int, payment_order_id: int, seq: int = 1) -> str:
    return f"RF{tenant_id}{payment_order_id}{seq:03d}"


def get_by_out_refund_no(db: Session, *, tenant_id: int, out_refund_no: str) -> PaymentRefund | None:
    return db.query(PaymentRefund).filter(
        PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.out_refund_no == out_refund_no,
    ).first()


def get_latest_by_order(db: Session, *, tenant_id: int, payment_order_id: int) -> PaymentRefund | None:
    return db.query(PaymentRefund).filter(
        PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.payment_order_id == payment_order_id,
    ).order_by(PaymentRefund.id.desc()).first()


def get_by_idempotency_key(
    db: Session,
    *,
    tenant_id: int,
    payment_order_id: int,
    idempotency_key: str,
) -> PaymentRefund | None:
    return db.query(PaymentRefund).filter(
        PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.payment_order_id == payment_order_id,
        PaymentRefund.idempotency_key == idempotency_key,
    ).first()


def create_refund(
    db: Session,
    *,
    tenant_id: int,
    payment_order_id: int,
    participant_id: int | None,
    out_refund_no: str,
    amount: int,
    idempotency_key: str,
    operator_id: int,
    reason: str,
    request_raw: dict | None,
) -> PaymentRefund:
    refund = PaymentRefund(
        tenant_id=tenant_id,
        payment_order_id=payment_order_id,
        participant_id=participant_id,
        out_refund_no=out_refund_no,
        amount=amount,
        status=REFUND_STATUS_PENDING,
        idempotency_key=idempotency_key,
        operator_id=operator_id,
        reason=reason,
        request_raw=json.dumps(request_raw, ensure_ascii=False) if request_raw else None,
        create_time=datetime.now(),
        update_time=datetime.now(),
    )
    db.add(refund)
    db.flush()
    return refund


def mark_processing(db: Session, refund: PaymentRefund, *, request_raw: dict | None = None) -> PaymentRefund:
    refund.status = REFUND_STATUS_PROCESSING
    if request_raw is not None:
        refund.request_raw = json.dumps(request_raw, ensure_ascii=False)
    refund.update_time = datetime.now()
    db.flush()
    return refund


def mark_success(db: Session, refund: PaymentRefund, *, callback_raw: dict | None = None, wechat_refund_id: str | None = None) -> PaymentRefund:
    refund.status = REFUND_STATUS_SUCCESS
    refund.wechat_refund_id = wechat_refund_id
    if callback_raw is not None:
        refund.callback_raw = json.dumps(callback_raw, ensure_ascii=False)
    refund.fail_reason = None
    refund.update_time = datetime.now()
    db.flush()
    return refund


def mark_failed(db: Session, refund: PaymentRefund, *, fail_reason: str, callback_raw: dict | None = None) -> PaymentRefund:
    refund.status = REFUND_STATUS_FAILED
    refund.fail_reason = fail_reason[:255]
    if callback_raw is not None:
        refund.callback_raw = json.dumps(callback_raw, ensure_ascii=False)
    refund.update_time = datetime.now()
    db.flush()
    return refund
