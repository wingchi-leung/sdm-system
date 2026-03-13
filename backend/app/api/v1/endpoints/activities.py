from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_activity, crud_checkin, crud_participant, crud_admin
from app.models import activity, checkin
from app.api import deps

router = APIRouter()


def _allowed_type_ids_for_list(db: Session, admin_id: int | None, tenant_id: int) -> List[int] | None:
    """管理员列表过滤"""
    if admin_id is None:
        return None
    is_super, allowed = crud_admin.get_admin_scope(db, admin_id, tenant_id)
    if is_super or not allowed:
        return None
    return allowed


@router.post("/", response_model=activity.ActivityResponse)
def create_activity(
    body: activity.ActivityCreate,
    db: Session = Depends(deps.get_db),
    scope: dict = Depends(deps.get_admin_scope),
):
    """创建活动"""
    tenant_id = scope["tenant_id"]
    
    if not scope["is_super"]:
        allowed = scope["allowed_activity_type_ids"]
        if not allowed:
            raise HTTPException(status_code=403, detail="当前账号未授权任何活动类型，无法创建活动")
        from app.crud import crud_activity_type
        type_id = body.activity_type_id
        type_name = (body.activity_type_name or "").strip()
        if type_id is not None:
            if type_id not in allowed:
                raise HTTPException(status_code=403, detail="所选活动类型不在授权范围内")
        elif type_name:
            t = crud_activity_type.get_by_name(db, type_name, tenant_id)
            if not t or t.id not in allowed:
                raise HTTPException(status_code=403, detail="所选活动类型不在授权范围内或不存在")
        else:
            raise HTTPException(status_code=400, detail="活动管理员创建活动须指定活动类型")
    
    return crud_activity.create_activity(db=db, activity=body, tenant_id=tenant_id)


@router.get("/", response_model=activity.ActivityListResponse)
def list_activities(
    skip: int = 0,
    limit: int = 100,
    status: int = None,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_admin_optional),
):
    """活动列表"""
    tenant_id = ctx.tenant_id if ctx else 1
    admin_id = ctx.user_id if ctx else None
    
    allowed = _allowed_type_ids_for_list(db, admin_id, tenant_id) if admin_id else None
    activities, total = crud_activity.get_activities(
        db, tenant_id=tenant_id, skip=skip, limit=limit, status=status,
        allowed_activity_type_ids=allowed,
    )
    return {"items": activities, "total": total}


@router.get("/unstarted/", response_model=activity.ActivityListResponse)
def get_unstarted_activities(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_admin_optional),
):
    """未开始活动列表"""
    tenant_id = ctx.tenant_id if ctx else 1
    admin_id = ctx.user_id if ctx else None
    
    allowed = _allowed_type_ids_for_list(db, admin_id, tenant_id) if admin_id else None
    activities, total = crud_activity.get_activities(
        db, tenant_id=tenant_id, status=1, allowed_activity_type_ids=allowed
    )
    return {"items": activities, "total": total}


@router.get("/{activity_id}", response_model=activity.ActivityResponse)
def get_activity(
    activity_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_admin_optional),
):
    """获取活动详情"""
    tenant_id = ctx.tenant_id if ctx else 1
    act = crud_activity.get_activity(db, activity_id, tenant_id)
    if act is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return act


@router.put("/{activity_id}/status")
def update_activity_status(
    activity_id: int,
    status: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """更新活动状态"""
    _ = deps.require_activity_admin(activity_id, db, ctx)
    act = crud_activity.update_activity_status(db, activity_id, status, ctx.tenant_id)
    if act is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return {"status": "success", "message": "Activity status updated"}


@router.get("/{activity_id}/checkins/", response_model=List[checkin.CheckInResponse])
def get_activity_checkins(
    activity_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """查看活动签到"""
    _ = deps.require_activity_admin(activity_id, db, ctx)
    return crud_checkin.get_activity_checkins(db, activity_id, ctx.tenant_id, skip=skip, limit=limit)


@router.get("/{activity_id}/statistics/")
def get_activity_stats(
    activity_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """活动报名统计"""
    _ = deps.require_activity_admin(activity_id, db, ctx)
    return crud_participant.get_activity_statistics(db, activity_id, ctx.tenant_id)


@router.put("/{activity_id}", response_model=activity.ActivityResponse)
def update_activity(
    activity_id: int,
    body: activity.ActivityUpdate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """编辑活动信息"""
    _ = deps.require_activity_admin(activity_id, db, ctx)
    return crud_activity.update_activity(db, activity_id, body, ctx.tenant_id)


@router.delete("/{activity_id}")
def delete_activity(
    activity_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """删除活动"""
    _ = deps.require_activity_admin(activity_id, db, ctx)
    crud_activity.delete_activity(db, activity_id, ctx.tenant_id)
    return {"status": "success", "message": "Activity deleted successfully"}