from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional

from app.api import deps
from app.crud import crud_user_activity_type

router = APIRouter()


class UserActivityTypeBindRequest(BaseModel):
    user_id: int
    activity_type_ids: List[int] = Field(..., min_length=1, max_length=100)


class UserActivityTypeBatchDeleteRequest(BaseModel):
    user_id: int
    activity_type_ids: List[int] = Field(..., min_length=1, max_length=100)


class UserActivityTypeItem(BaseModel):
    id: int
    user_id: int
    activity_type_id: int
    tenant_id: int
    create_time: Optional[str] = None

    class Config:
        from_attributes = True


class UserActivityTypeListResponse(BaseModel):
    items: List[UserActivityTypeItem]
    total: int


@router.post("", response_model=List[UserActivityTypeItem])
def bind_user_activity_types(
    request: UserActivityTypeBindRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """绑定用户到活动类型（支持批量）"""
    results = crud_user_activity_type.create_user_activity_types_batch(
        db, request.user_id, request.activity_type_ids, ctx.tenant_id
    )
    return [
        UserActivityTypeItem(
            id=r.id,
            user_id=r.user_id,
            activity_type_id=r.activity_type_id,
            tenant_id=r.tenant_id,
            create_time=r.create_time.isoformat() if r.create_time else None,
        )
        for r in results
    ]


@router.get("/by-user/{user_id}", response_model=UserActivityTypeListResponse)
def get_user_activity_types(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """获取用户关联的活动类型列表"""
    items, total = crud_user_activity_type.get_user_activity_types(
        db, user_id, ctx.tenant_id, skip, limit
    )
    return UserActivityTypeListResponse(
        items=[
            UserActivityTypeItem(
                id=r.id,
                user_id=r.user_id,
                activity_type_id=r.activity_type_id,
                tenant_id=r.tenant_id,
                create_time=r.create_time.isoformat() if r.create_time else None,
            )
            for r in items
        ],
        total=total,
    )


@router.delete("/by-user/{user_id}/{activity_type_id}")
def unbind_user_activity_type(
    user_id: int,
    activity_type_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """解除用户与活动类型的绑定"""
    success = crud_user_activity_type.delete_user_activity_type(
        db, user_id, activity_type_id, ctx.tenant_id
    )
    if not success:
        raise HTTPException(status_code=404, detail="关联不存在")
    return {"message": "解除绑定成功"}


@router.delete("/batch")
def unbind_user_activity_types_batch(
    request: UserActivityTypeBatchDeleteRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """批量解除用户与活动类型的绑定"""
    count = crud_user_activity_type.delete_user_activity_types_batch(
        db, request.user_id, request.activity_type_ids, ctx.tenant_id
    )
    return {"message": f"已解除 {count} 条关联"}


@router.get("/by-type/{activity_type_id}", response_model=UserActivityTypeListResponse)
def get_users_by_activity_type(
    activity_type_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """获取某活动类型关联的所有用户"""
    items, total = crud_user_activity_type.get_users_by_activity_type(
        db, activity_type_id, ctx.tenant_id, skip, limit
    )
    return UserActivityTypeListResponse(
        items=[
            UserActivityTypeItem(
                id=r.id,
                user_id=r.user_id,
                activity_type_id=r.activity_type_id,
                tenant_id=r.tenant_id,
                create_time=r.create_time.isoformat() if r.create_time else None,
            )
            for r in items
        ],
        total=total,
    )