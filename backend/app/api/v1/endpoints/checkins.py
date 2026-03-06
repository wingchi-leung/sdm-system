from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.crud import crud_checkin
from app.crud.crud_checkin import check_already_checkin
from app.crud import crud_participant
from app.models import checkin
from app.api import deps

router = APIRouter()


@router.get("/", response_model=List[dict])
def list_checkin_records(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    activity_id: Optional[int] = Query(None, description="按活动 ID 筛选"),
    db: Session = Depends(deps.get_db),
):
    """签到记录列表（含活动名称），供统计页使用"""
    return crud_checkin.get_recent_checkins(
        db, skip=skip, limit=limit, activity_id=activity_id
    )


# Check-in endpoints
@router.post("/", response_model=checkin.CheckInResponse)
def create_checkin(checkin: checkin.CheckInCreate, db: Session = Depends(deps.get_db)):
    # Verify participant exists
    if not crud_participant.check_participant_exists(db, checkin.activity_id, checkin.identity_number):
        raise HTTPException(status_code=404, detail="未报名活动！")
    
    # Check if already checked in
    if check_already_checkin(db, checkin.activity_id, checkin.identity_number):
        raise HTTPException(status_code=400, detail="已经签到过，不用签到啦")
    
    return crud_checkin.create_checkin(db=db, checkin=checkin)