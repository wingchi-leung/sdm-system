from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_participant, crud_user
from app.models import participant
from app.api import deps


router = APIRouter()


@router.post("/", response_model=participant.ParticipantResponse)
def create_participant(
    participant: participant.ParticipantCreate,
    db: Session = Depends(deps.get_db),
    current: dict | None = Depends(deps.get_current_user_optional),
):
    # 黑名单拦截：按手机号查找用户，检查 isblock
    if participant.phone:
        user = crud_user.get_user_by_phone(db, participant.phone)
        if user and user.isblock == 1:
            reason = user.block_reason or "您已被限制报名"
            raise HTTPException(status_code=403, detail=f"无法报名：{reason}")

    if crud_participant.check_participant_exists(db, participant.activity_id, participant.identity_number):
        raise HTTPException(status_code=400, detail="已报名，无需重复报名")
    return crud_participant.create_participant(db=db, participant=participant)


    
@router.get("/{activity_id}/", response_model=participant.ParticipantListResponse)
def get_activity_participants(
    activity_id: int, 
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(deps.get_db),
    _: int = Depends(deps.require_activity_admin)
):
    """
    Get paginated list of participants for a specific activity
    仅超级管理员或该活动所属类型的活动管理员可查看
    Returns both participants data and total count
    """
    try:
        participants, total = crud_participant.get_activity_participants_with_count(
            db, 
            activity_id=activity_id, 
            skip=skip, 
            limit=limit
        )
        return {"items": participants, "total": total}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))