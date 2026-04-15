from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_activity, crud_checkin, crud_participant, crud_rbac, crud_tenant
from app.models import activity, checkin
from app.api import deps

router = APIRouter()


def _tenant_id_for_public_request(db: Session, tenant_code: str) -> int:
    """未登录访问活动时，根据租户编码解析租户，避免硬编码 1 号租户。"""
    tenant = crud_tenant.get_tenant_by_code(db, tenant_code)
    if not tenant or tenant.status != 1:
        raise HTTPException(status_code=400, detail="租户不存在或已禁用")
    return tenant.id


def _allowed_scopes_for_list(
    db: Session,
    user_id: int | None,
    tenant_id: int,
) -> tuple[List[int] | None, List[int] | None]:
    """管理员列表过滤（基于 RBAC）"""
    if user_id is None:
        return None, None

    user_roles = crud_rbac.get_user_roles(db, user_id, tenant_id)

    # 检查是否有全局权限
    if any(ur.scope_type is None for ur in user_roles):
        return None, None

    # 收集活动类型权限
    type_ids = [ur.scope_id for ur in user_roles if ur.scope_type == 'activity_type' and ur.scope_id]
    activity_ids = [ur.scope_id for ur in user_roles if ur.scope_type == 'activity' and ur.scope_id]

    return type_ids, activity_ids


@router.post("/", response_model=activity.ActivityResponse)
def create_activity(
    body: activity.ActivityCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """创建活动"""
    has_global_permission = crud_rbac.has_permission(
        db,
        ctx.user_id,
        "activity.create",
        ctx.tenant_id,
    )
    has_scoped_permission = False
    if body.activity_type_id:
        has_scoped_permission = crud_rbac.has_permission(
            db,
            ctx.user_id,
            "activity.create",
            ctx.tenant_id,
            resource_id=body.activity_type_id,
            resource_type="activity_type",
        )

    if not has_global_permission and not has_scoped_permission:
        raise HTTPException(status_code=403, detail="缺少权限: activity.create")

    if body.activity_type_id and not has_global_permission:
        user_roles = crud_rbac.get_user_roles(db, ctx.user_id, ctx.tenant_id)
        allowed_types = [ur.scope_id for ur in user_roles if ur.scope_type == 'activity_type']
        if body.activity_type_id not in allowed_types:
            raise HTTPException(status_code=403, detail="所选活动类型不在授权范围内")

    return crud_activity.create_activity(db=db, activity=body, tenant_id=ctx.tenant_id)


@router.get("/", response_model=activity.ActivityListResponse)
def list_activities(
    skip: int = 0,
    limit: int = 100,
    status: int = None,
    tenant_code: str = Query("default", description="未登录访问时使用的租户编码"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """活动列表"""
    tenant_id = ctx.tenant_id if ctx else _tenant_id_for_public_request(db, tenant_code)
    admin_id = ctx.user_id if ctx and ctx.role == "admin" else None
    
    allowed_types, allowed_activities = (
        _allowed_scopes_for_list(db, admin_id, tenant_id) if admin_id else (None, None)
    )
    activities, total = crud_activity.get_activities(
        db, tenant_id=tenant_id, skip=skip, limit=limit, status=status,
        allowed_activity_type_ids=allowed_types,
        allowed_activity_ids=allowed_activities,
    )
    return {"items": activities, "total": total}


@router.get("/unstarted/", response_model=activity.ActivityListResponse)
def get_unstarted_activities(
    tenant_code: str = Query("default", description="未登录访问时使用的租户编码"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """未开始活动列表"""
    tenant_id = ctx.tenant_id if ctx else _tenant_id_for_public_request(db, tenant_code)
    admin_id = ctx.user_id if ctx and ctx.role == "admin" else None
    
    allowed_types, allowed_activities = (
        _allowed_scopes_for_list(db, admin_id, tenant_id) if admin_id else (None, None)
    )
    activities, total = crud_activity.get_activities(
        db,
        tenant_id=tenant_id,
        status=1,
        allowed_activity_type_ids=allowed_types,
        allowed_activity_ids=allowed_activities,
    )
    return {"items": activities, "total": total}


@router.get("/{activity_id}", response_model=activity.ActivityResponse)
def get_activity(
    activity_id: int,
    tenant_code: str = Query("default", description="未登录访问时使用的租户编码"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """获取活动详情"""
    tenant_id = ctx.tenant_id if ctx else _tenant_id_for_public_request(db, tenant_code)
    act = crud_activity.get_activity(db, activity_id, tenant_id)
    if act is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return act


@router.get("/{activity_id}/enrollment-info")
def get_enrollment_info(
    activity_id: int,
    tenant_code: str = Query("default", description="未登录访问时使用的租户编码"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """获取活动报名情况（剩余名额等）"""
    tenant_id = ctx.tenant_id if ctx else _tenant_id_for_public_request(db, tenant_code)
    act = crud_activity.get_activity(db, activity_id, tenant_id)
    if act is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    enrolled_count = crud_participant.get_enrolled_count(db, activity_id, tenant_id)
    waitlist_count = crud_participant.get_waitlist_count(db, activity_id, tenant_id)

    max_participants = act.max_participants
    remaining_quota = None
    is_full = False

    if max_participants is not None:
        remaining_quota = max(0, max_participants - enrolled_count)
        is_full = enrolled_count >= max_participants

    return {
        "max_participants": max_participants,
        "enrolled_count": enrolled_count,
        "waitlist_count": waitlist_count,
        "remaining_quota": remaining_quota,
        "is_full": is_full,
    }


@router.put("/{activity_id}/status")
def update_activity_status(
    activity_id: int,
    status: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """更新活动状态"""
    # 检查编辑权限
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not crud_rbac.has_permission(db, ctx.user_id, "activity.edit", ctx.tenant_id, activity.activity_type_id, "activity_type"):
        raise HTTPException(status_code=403, detail="无权限编辑此活动")

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
    # 检查查看权限
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not crud_rbac.has_permission(db, ctx.user_id, "participant.view", ctx.tenant_id, activity.activity_type_id, "activity_type"):
        raise HTTPException(status_code=403, detail="无权限查看此活动")

    return crud_checkin.get_activity_checkins(db, activity_id, ctx.tenant_id, skip=skip, limit=limit)


@router.get("/{activity_id}/statistics/")
def get_activity_stats(
    activity_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """活动报名统计"""
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not crud_rbac.has_permission(db, ctx.user_id, "participant.view", ctx.tenant_id, activity.activity_type_id, "activity_type"):
        raise HTTPException(status_code=403, detail="无权限查看此活动")

    return crud_participant.get_activity_statistics(db, activity_id, ctx.tenant_id)


@router.put("/{activity_id}", response_model=activity.ActivityResponse)
def update_activity(
    activity_id: int,
    body: activity.ActivityUpdate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """编辑活动信息"""
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not crud_rbac.has_permission(db, ctx.user_id, "activity.edit", ctx.tenant_id, activity.activity_type_id, "activity_type"):
        raise HTTPException(status_code=403, detail="无权限编辑此活动")

    return crud_activity.update_activity(db, activity_id, body, ctx.tenant_id)


@router.delete("/{activity_id}")
def delete_activity(
    activity_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """删除活动"""
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not crud_rbac.has_permission(db, ctx.user_id, "activity.delete", ctx.tenant_id, activity.activity_type_id, "activity_type"):
        raise HTTPException(status_code=403, detail="无权限删除此活动")

    crud_activity.delete_activity(db, activity_id, ctx.tenant_id)
    return {"status": "success", "message": "Activity deleted successfully"}
