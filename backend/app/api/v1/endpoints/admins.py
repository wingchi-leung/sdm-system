from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_admin
from app.models import admin as admin_model
from app.api import deps

router = APIRouter()


def require_super_admin(ctx: deps.TenantContext = Depends(deps.get_current_admin)):
    """仅超级管理员可访问"""
    from app.crud import crud_admin
    from app.api.deps import get_db

    db = next(get_db())
    try:
        admin = crud_admin.get_admin_by_id(db, ctx.user_id, ctx.tenant_id)
        if not admin or admin.is_super_admin != 1:
            raise HTTPException(status_code=403, detail="仅超级管理员可执行此操作")
        return ctx
    finally:
        db.close()


@router.post("/", response_model=admin_model.AdminResponse)
def create_admin(
    body: admin_model.AdminCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(require_super_admin),
):
    """创建管理员账号（仅超级管理员）"""
    from app.crud import crud_user

    user = crud_user.get_user_by_id(db, body.user_id, ctx.tenant_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    existing = crud_admin.get_admin_by_username(db, body.username, ctx.tenant_id)
    if existing:
        raise HTTPException(status_code=400, detail="用户名已存在")

    admin = crud_admin.create_admin(db, body.user_id, body.username, body.password, ctx.tenant_id)
    return admin


@router.get("/", response_model=admin_model.AdminListResponse)
def list_admins(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(require_super_admin),
):
    """获取管理员列表（仅超级管理员）"""
    admins = crud_admin.get_all_admins(db, ctx.tenant_id)
    return {"items": admins, "total": len(admins)}


@router.get("/{admin_id}/roles", response_model=admin_model.AdminRoleResponse)
def get_admin_roles(
    admin_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(require_super_admin),
):
    """获取管理员权限（仅超级管理员）"""
    admin = crud_admin.get_admin_by_id(db, admin_id, ctx.tenant_id)
    if not admin:
        raise HTTPException(status_code=404, detail="管理员不存在")

    activity_type_ids = crud_admin.get_admin_roles(db, admin_id, ctx.tenant_id)

    return {
        "admin_user_id": admin.id,
        "username": admin.username,
        "is_super_admin": admin.is_super_admin,
        "activity_type_ids": activity_type_ids
    }


@router.post("/{admin_id}/roles")
def assign_roles(
    admin_id: int,
    body: admin_model.AdminRoleAssign,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(require_super_admin),
):
    """为管理员分配活动类型权限（仅超级管理员）"""
    admin = crud_admin.get_admin_by_id(db, admin_id, ctx.tenant_id)
    if not admin:
        raise HTTPException(status_code=404, detail="管理员不存在")

    if admin.is_super_admin == 1:
        raise HTTPException(status_code=400, detail="超级管理员无需分配权限")

    crud_admin.assign_admin_roles(db, admin_id, body.activity_type_ids, ctx.tenant_id)

    return {"status": "success", "message": "权限分配成功"}
