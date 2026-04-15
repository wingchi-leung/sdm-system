from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime

from app.crud import crud_participant, crud_user
from app.models import participant
from app.api import deps
from app.schemas import Activity

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
            "phone": current_user.phone or participant_in.phone,
            "identity_number": current_user.identity_number or participant_in.identity_number,
            "identity_type": current_user.identity_type or participant_in.identity_type,
            "sex": current_user.sex or participant_in.sex,
            "age": current_user.age if current_user.age is not None else participant_in.age,
            "occupation": current_user.occupation or participant_in.occupation,
            "email": current_user.email or participant_in.email,
            "industry": current_user.industry or participant_in.industry,
        }
    )


def _ensure_activity_enrollable(activity: Activity) -> None:
    """后端兜底校验活动是否允许报名。"""
    if activity.status not in (1, 2):
        raise HTTPException(status_code=400, detail="活动当前不可报名")
    if activity.end_time and datetime.now() > activity.end_time:
        raise HTTPException(status_code=400, detail="活动已结束，无法报名")


@router.post("/", response_model=participant.ParticipantResponse)
def create_participant(
    participant_in: participant.ParticipantCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """
    免费活动报名接口。付费活动必须通过 /payments/create 下单并支付后才能报名，
    此接口拒绝付费活动的报名请求（无论活动是否满员）。
    """
    tenant_id = ctx.tenant_id

    if ctx.role == "admin":
        raise HTTPException(status_code=403, detail="管理员账号不能直接报名")

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

    # 按证件号去重（防止同一证件多账号报名）
    if crud_participant.check_participant_exists(
        db, normalized_participant.activity_id, normalized_participant.identity_number, tenant_id
    ):
        raise HTTPException(status_code=400, detail="该证件号已报名")

    return crud_participant.create_participant(
        db=db,
        participant=normalized_participant,
        tenant_id=tenant_id,
    )


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
    return {"items": participants, "total": total}
