from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.crud import crud_participant, crud_user
from app.models import participant
from app.api import deps

router = APIRouter()


@router.post("/", response_model=participant.ParticipantResponse)
def create_participant(
    participant_in: participant.ParticipantCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """报名"""
    tenant_id = ctx.tenant_id if ctx else 1
    
    if participant_in.phone:
        user = crud_user.get_user_by_phone(db, participant_in.phone, tenant_id)
        if user and user.isblock == 1:
            reason = user.block_reason or "您已被限制报名"
            raise HTTPException(status_code=403, detail=f"无法报名：{reason}")

    if crud_participant.check_participant_exists(
        db, participant_in.activity_id, participant_in.identity_number, tenant_id
    ):
        raise HTTPException(status_code=400, detail="已报名，无需重复报名")
    
    return crud_participant.create_participant(db=db, participant=participant_in, tenant_id=tenant_id)


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