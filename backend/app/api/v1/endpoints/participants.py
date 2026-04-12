from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

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
    if not current_user:
        return participant_in.model_copy(update={"user_id": None})

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


@router.post("/", response_model=participant.ParticipantResponse)
def create_participant(
    participant_in: participant.ParticipantCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """报名"""
    tenant_id = ctx.tenant_id if ctx else 1

    if ctx and ctx.role == "admin":
        raise HTTPException(status_code=403, detail="管理员账号不能直接报名")

    activity = db.query(Activity).filter(
        Activity.id == participant_in.activity_id,
        Activity.tenant_id == tenant_id,
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")
    if activity.require_payment == 1:
        max_participants = activity.max_participants
        is_full = (
            max_participants is not None
            and crud_participant.get_enrolled_count(db, activity.id, tenant_id) >= max_participants
        )
        if not is_full:
            raise HTTPException(status_code=400, detail="该活动需要先完成支付后才能报名")

    current_user = crud_user.get_user(db, ctx.user_id, tenant_id) if ctx else None
    normalized_participant = _merge_profile_fields(participant_in, current_user)

    if current_user and current_user.isblock == 1:
        reason = current_user.block_reason or "您已被限制报名"
        raise HTTPException(status_code=403, detail=f"无法报名：{reason}")

    if not current_user and normalized_participant.phone:
        phone_user = crud_user.get_user_by_phone(db, normalized_participant.phone, tenant_id)
        if phone_user and phone_user.isblock == 1:
            reason = phone_user.block_reason or "您已被限制报名"
            raise HTTPException(status_code=403, detail=f"无法报名：{reason}")

    if crud_participant.check_participant_exists(
        db, normalized_participant.activity_id, normalized_participant.identity_number, tenant_id
    ):
        raise HTTPException(status_code=400, detail="已报名，无需重复报名")

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
