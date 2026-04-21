from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.crud import crud_checkin, crud_participant, crud_rbac, crud_tenant
from app.crud.crud_checkin import check_already_checkin
from app.models import checkin
from app.api import deps
from app.schemas import Activity

router = APIRouter()


def _tenant_id_from_activity(db: Session, activity_id: int) -> int:
    """未登录签到时通过活动归属解析租户，避免默认租户兜底。"""
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="找不到活动")
    if not crud_tenant.check_tenant_active(db, activity.tenant_id):
        raise HTTPException(status_code=403, detail="租户已禁用或已过期")
    return activity.tenant_id


@router.get("/", response_model=List[dict])
def list_checkin_records(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    activity_id: Optional[int] = Query(None, description="按活动 ID 筛选"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """签到记录列表（含活动名称）"""
    if activity_id is not None:
        if not deps.has_activity_permission(db, ctx, activity_id, "participant.view"):
            raise HTTPException(status_code=403, detail="无权限查看此活动")
        return crud_checkin.get_recent_checkins(
            db, tenant_id=ctx.tenant_id, skip=skip, limit=limit, activity_id=activity_id
        )

    if crud_rbac.has_permission(db, ctx.user_id, "participant.view", ctx.tenant_id):
        return crud_checkin.get_recent_checkins(
            db, tenant_id=ctx.tenant_id, skip=skip, limit=limit
        )

    user_roles = crud_rbac.get_user_roles(db, ctx.user_id, ctx.tenant_id)
    allowed_activity_type_ids = [
        item.scope_id for item in user_roles
        if item.scope_type == "activity_type" and item.scope_id
    ]
    allowed_activity_ids = [
        item.scope_id for item in user_roles
        if item.scope_type == "activity" and item.scope_id
    ]
    return crud_checkin.get_recent_checkins(
        db,
        tenant_id=ctx.tenant_id,
        skip=skip,
        limit=limit,
        allowed_activity_type_ids=allowed_activity_type_ids,
        allowed_activity_ids=allowed_activity_ids,
    )


@router.post("/", response_model=checkin.CheckInResponse)
def create_checkin(
    checkin_in: checkin.CheckInCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """签到"""
    tenant_id = ctx.tenant_id if ctx else _tenant_id_from_activity(db, checkin_in.activity_id)
    
    if not crud_participant.check_participant_exists(
        db, checkin_in.activity_id, checkin_in.identity_number, tenant_id
    ):
        raise HTTPException(status_code=404, detail="未报名活动！")
    
    if check_already_checkin(db, checkin_in.activity_id, checkin_in.identity_number, tenant_id):
        raise HTTPException(status_code=400, detail="已经签到过，不用签到啦")
    
    return crud_checkin.create_checkin(db=db, checkin=checkin_in, tenant_id=tenant_id)
