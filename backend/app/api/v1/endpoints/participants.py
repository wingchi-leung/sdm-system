from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import ValidationError

from app.crud import crud_participant, crud_payment, crud_user
from app.models import participant
from app.api import deps
from app.schemas import Activity, ActivityParticipant, PaymentOrder, PaymentRefund
from app.services import notification_center

router = APIRouter()


def _merge_profile_fields(
    participant_in: participant.ParticipantCreate,
    current_user,
) -> participant.ParticipantCreate:
    """已登录报名时，以当前登录人的资料为准，避免客户端篡改只读字段。"""
    return participant_in.model_copy(
        update={
            "user_id": current_user.id,
            "participant_name": current_user.name or participant_in.participant_name,
        }
    )


def _ensure_activity_enrollable(activity: Activity) -> None:
    """后端兜底校验活动是否允许报名。"""
    if activity.status not in (1, 2):
        raise HTTPException(status_code=400, detail="活动当前不可报名")
    if activity.end_time and datetime.now() > activity.end_time:
        raise HTTPException(status_code=400, detail="活动已结束，无法报名")


def _decrypt_participant_payload(payload: dict) -> dict:
    encrypted_phone = payload.get("phone_encrypted")
    encrypted_identity = payload.get("identity_number_encrypted")
    kid = payload.get("encryption_kid")
    if not encrypted_phone:
        raise SensitiveFieldCryptoError("敏感字段必须使用加密传输")
    payload["phone"] = decrypt_sensitive_field(encrypted_phone, kid)
    payload["identity_number"] = (
        decrypt_sensitive_field(encrypted_identity, kid) if encrypted_identity else None
    )
    return payload


@router.post("/", response_model=participant.ParticipantResponse)
async def create_participant(
    request: Request,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """
    免费活动报名接口。付费活动必须通过 /payments/create 下单并支付后才能报名，
    此接口拒绝付费活动的报名请求（无论活动是否满员）。
    """
    tenant_id = ctx.tenant_id

    # 活动管理员和普通用户一样可以报名
    try:
        payload = dict(await request.json() or {})
        participant_in = participant.ParticipantCreate.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

    activity = db.query(Activity).filter(
        Activity.id == participant_in.activity_id,
        Activity.tenant_id == tenant_id,
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")
    _ensure_activity_enrollable(activity)

    if activity.require_payment == 1:
        enrolled_count = crud_participant.get_enrolled_count(
            db,
            participant_in.activity_id,
            tenant_id,
        )
        is_full = (
            activity.max_participants is not None
            and enrolled_count >= activity.max_participants
        )
        if not is_full:
            raise HTTPException(status_code=400, detail="该活动需要先完成支付后才能报名")

    current_user = crud_user.get_user(db, ctx.user_id, tenant_id)
    if not current_user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if current_user.isblock == 1:
        reason = current_user.block_reason or "您已被限制报名"
        raise HTTPException(status_code=403, detail=f"无法报名：{reason}")

    normalized_participant = _merge_profile_fields(participant_in, current_user)

    # 按 user_id 去重（已登录用户唯一标识）
    if crud_participant.get_participant_by_user(
        db, normalized_participant.activity_id, current_user.id, tenant_id
    ):
        raise HTTPException(status_code=400, detail="已报名，无需重复报名")

    created_participant = crud_participant.create_participant(
        db=db,
        participant=normalized_participant,
        tenant_id=tenant_id,
    )
    notification_center.enqueue_registration_received_message(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        participant=created_participant,
        activity=activity,
    )
    notification_center.enqueue_registration_success_message(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        participant=created_participant,
        activity=activity,
    )
    return created_participant


@router.get("/{activity_id}/", response_model=participant.ParticipantListResponse)
def get_activity_participants(
    activity_id: int,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """获取活动的参与人列表"""
    _ = deps.require_activity_admin(activity_id, db, ctx)
    
    participants, total = crud_participant.get_activity_participants_with_count(
        db,
        activity_id=activity_id,
        tenant_id=ctx.tenant_id,
        skip=skip,
        limit=limit
    )
    payment_order_ids = [item.payment_order_id for item in participants if item.payment_order_id]
    payment_orders = []
    payment_refunds = []
    if payment_order_ids:
        payment_orders = db.query(PaymentOrder).filter(
            PaymentOrder.tenant_id == ctx.tenant_id,
            PaymentOrder.id.in_(payment_order_ids),
        ).all()
        payment_refunds = db.query(PaymentRefund).filter(
            PaymentRefund.tenant_id == ctx.tenant_id,
            PaymentRefund.payment_order_id.in_(payment_order_ids),
        ).order_by(PaymentRefund.id.desc()).all()
    payment_order_map = {order.id: order for order in payment_orders}
    refund_map: dict[int, PaymentRefund] = {}
    for refund in payment_refunds:
        if refund.payment_order_id not in refund_map:
            refund_map[refund.payment_order_id] = refund
    for item in participants:
        payment_order = payment_order_map.get(item.payment_order_id)
        refund = refund_map.get(item.payment_order_id)
        setattr(item, "payment_order_no", payment_order.order_no if payment_order else None)
        setattr(item, "refund_status", payment_order.refund_status if payment_order else None)
        setattr(item, "refund_amount", payment_order.refund_amount if payment_order else None)
        setattr(item, "refund_latest_id", refund.id if refund else None)
        setattr(item, "refund_out_refund_no", refund.out_refund_no if refund else None)
        setattr(item, "refund_apply_at", payment_order.refund_apply_at if payment_order else None)
        setattr(item, "refund_success_at", payment_order.refund_success_at if payment_order else None)
        setattr(item, "refund_fail_reason", payment_order.refund_fail_reason if payment_order else None)
    return {"items": participants, "total": total}


@router.get("/me/activities", response_model=participant.ParticipantActivityListResponse)
def get_my_participant_activities(
    activity_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """获取当前登录用户报名过的活动列表。"""
    # 超级管理员无需报名活动，普通用户和管理员都可以查看已报名的活动

    items, total = crud_participant.get_user_participant_activities(
        db,
        user_id=ctx.user_id,
        tenant_id=ctx.tenant_id,
        activity_id=activity_id,
    )
    return {"items": items, "total": total}


@router.post("/{participant_id}/review", response_model=participant.ParticipantResponse)
def review_participant(
    participant_id: int,
    payload: participant.ParticipantReviewRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """管理员审核报名记录。"""
    record = db.query(ActivityParticipant).filter(
        ActivityParticipant.id == participant_id,
        ActivityParticipant.tenant_id == ctx.tenant_id,
    ).with_for_update().first()
    if not record:
        raise HTTPException(status_code=404, detail="报名记录不存在")

    if payload.action == "reject" and not (payload.reason and payload.reason.strip()):
        raise HTTPException(status_code=400, detail="审核拒绝时必须填写原因")

    if payload.action == "approve":
        record.review_status = 1
        record.review_reason = None
    else:
        record.review_status = 2
        record.review_reason = payload.reason.strip()
        if record.payment_status == 2 and record.payment_order_id:
            order = db.query(PaymentOrder).filter(
                PaymentOrder.id == record.payment_order_id,
                PaymentOrder.tenant_id == ctx.tenant_id,
            ).with_for_update().first()
            if order and order.status == crud_payment.PAYMENT_STATUS_SUCCESS:
                order.refund_status = crud_payment.REFUND_STATUS_PENDING
                order.refund_apply_by = ctx.user_id
                order.refund_apply_at = datetime.now()
                order.refund_amount = order.actual_fee
                order.refund_fail_reason = None

    record.reviewed_by = ctx.user_id
    record.reviewed_at = datetime.now()
    db.commit()
    db.refresh(record)

    activity = db.query(Activity).filter(
        Activity.id == record.activity_id,
        Activity.tenant_id == ctx.tenant_id,
    ).first()
    if activity:
        notification_center.enqueue_review_result_message(
            db,
            tenant_id=ctx.tenant_id,
            user_id=record.user_id,
            participant=record,
            activity=activity,
            approved=payload.action == "approve",
            review_reason=record.review_reason,
        )
    return record
