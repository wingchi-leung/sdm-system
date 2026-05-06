from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.api import deps
from app.models import ActivityTypeResponse

router = APIRouter()


@router.get("/available", response_model=List[ActivityTypeResponse])
def list_available_activity_types(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """获取当前管理员可用于发布活动的活动类型列表。"""
    from app.crud import crud_activity_type, crud_rbac

    activity_types = crud_activity_type.list_all(db, ctx.tenant_id)

    if crud_rbac.has_permission(db, ctx.user_id, "activity.create", ctx.tenant_id):
        return activity_types

    allowed_items = [
        item for item in activity_types
        if crud_rbac.has_permission(
            db,
            ctx.user_id,
            "activity.create",
            ctx.tenant_id,
            resource_id=item.id,
            resource_type="activity_type",
        )
    ]
    if not allowed_items:
        raise HTTPException(status_code=403, detail="当前账号没有可发布的活动类型")
    return allowed_items


@router.get("", response_model=List[ActivityTypeResponse])
def list_activity_types(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """获取所有活动类型（用于权限分配等场景）"""
    from app.crud import crud_activity_type
    return crud_activity_type.list_all(db, ctx.tenant_id)
