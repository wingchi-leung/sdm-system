from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.api import deps
from app.models import ActivityTypeResponse

router = APIRouter()


@router.get("", response_model=List[ActivityTypeResponse])
def list_activity_types(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """获取所有活动类型（用于权限分配等场景）"""
    from app.crud import crud_activity_type
    return crud_activity_type.list_all(db, ctx.tenant_id)