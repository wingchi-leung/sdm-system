from datetime import datetime, timedelta

from fastapi import status

from app.crud import crud_payment
from app.schemas import ActivityParticipant, PaymentOrder
from tests.conftest import auth_headers


def test_admin_can_reject_paid_participant_and_mark_refund_pending(
    client,
    db_session,
    activity_admin_token,
    sample_activity,
    sample_user,
):
    participant = ActivityParticipant(
        tenant_id=sample_user.tenant_id,
        activity_id=sample_activity.id,
        user_id=sample_user.id,
        participant_name=sample_user.name,
        payment_status=2,
    )
    db_session.add(participant)
    db_session.commit()
    db_session.refresh(participant)

    order = PaymentOrder(
        tenant_id=sample_user.tenant_id,
        order_no="PO_REVIEW_REFUND_001",
        activity_id=sample_activity.id,
        user_id=sample_user.id,
        participant_id=participant.id,
        suggested_fee=1000,
        actual_fee=1000,
        status=crud_payment.PAYMENT_STATUS_SUCCESS,
        openid="openid_review",
        prepay_id="prepay_review",
        expire_at=datetime.now() + timedelta(minutes=30),
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    participant.payment_order_id = order.id
    db_session.commit()

    response = client.post(
        f"/api/v1/participants/{participant.id}/review",
        headers=auth_headers(activity_admin_token),
        json={"action": "reject", "reason": "不符合报名要求"},
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["review_status"] == 2

    db_session.refresh(order)
    assert order.refund_status == crud_payment.REFUND_STATUS_PENDING


def test_admin_reject_requires_reason(
    client,
    db_session,
    activity_admin_token,
    sample_activity,
    sample_user,
):
    participant = ActivityParticipant(
        tenant_id=sample_user.tenant_id,
        activity_id=sample_activity.id,
        user_id=sample_user.id,
        participant_name=sample_user.name,
        payment_status=0,
    )
    db_session.add(participant)
    db_session.commit()
    db_session.refresh(participant)

    response = client.post(
        f"/api/v1/participants/{participant.id}/review",
        headers=auth_headers(activity_admin_token),
        json={"action": "reject"},
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
