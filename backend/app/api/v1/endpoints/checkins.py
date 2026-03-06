from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.crud import crud_checkin, crud_participant
from app.crud.crud_checkin import check_already_checkin
from app.models import checkin
from app.api import deps

router = APIRouter()


@router.get("/", response_model=List[dict])
def list_checkin_records(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    activity_id: Optional[int] = Query(None, description="按活动 ID 筛选"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """签到记录列表（含活动名称）"""
    return crud_checkin.get_recent_checkins(
        db, tenant_id=ctx.tenant_id, skip=skip, limit=limit, activity_id=activity_id
    )


@router.post("/", response_model=checkin.CheckInResponse)
def create_checkin(
    checkin_in: checkin.CheckInCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """签到"""
    tenant_id = ctx.tenant_id if ctx else 1
    
    if not crud_participant.check_participant_exists(
        db, checkin_in.activity_id, checkin_in.identity_number, tenant_id
    ):
        raise HTTPException(status_code=404, detail="未报名活动！")
    
    if check_already_checkin(db, checkin_in.activity_id, checkin_in.identity_number, tenant_id):
        raise HTTPException(status_code=400, detail="已经签到过，不用签到啦")
    
    return crud_checkin.create_checkin(db=db, checkin=checkin_in, tenant_id=tenant_id)