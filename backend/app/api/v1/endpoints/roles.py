from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_rbac
from app.models import rbac as rbac_model
from app.api import deps

router = APIRouter()


@router.get("/permissions", response_model=List[rbac_model.PermissionResponse])
def list_permissions(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """获取所有权限列表"""
    return crud_rbac.get_all_permissions(db)


@router.get("/roles", response_model=List[rbac_model.RoleResponse])
def list_roles(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """获取所有角色列表"""
    return crud_rbac.get_all_roles(db, ctx.tenant_id)


@router.post("/user-roles", response_model=rbac_model.UserRoleResponse)
def assign_user_role(
    body: rbac_model.UserRoleAssign,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("admin.manage")),
):
    """为用户分配角色"""
    user_role = crud_rbac.assign_user_role(
        db, body.user_id, body.role_id, ctx.tenant_id,
        body.scope_type, body.scope_id
    )

    role = db.query(crud_rbac.Role).filter(crud_rbac.Role.id == body.role_id).first()

    return {
        "id": user_role.id,
        "user_id": user_role.user_id,
        "role_id": user_role.role_id,
        "role_name": role.name if role else "",
        "scope_type": user_role.scope_type,
        "scope_id": user_role.scope_id
    }


@router.delete("/user-roles/{user_role_id}")
def remove_user_role(
    user_role_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("admin.manage")),
):
    """移除用户角色"""
    success = crud_rbac.remove_user_role(db, user_role_id)
    if not success:
        raise HTTPException(status_code=404, detail="用户角色不存在")
    return {"status": "success", "message": "角色移除成功"}


@router.get("/users/{user_id}/roles", response_model=List[rbac_model.UserRoleResponse])
def get_user_roles(
    user_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("admin.manage")),
):
    """获取用户的所有角色"""
    user_roles = crud_rbac.get_user_roles(db, user_id, ctx.tenant_id)

    result = []
    for ur in user_roles:
        role = db.query(crud_rbac.Role).filter(crud_rbac.Role.id == ur.role_id).first()
        result.append({
            "id": ur.id,
            "user_id": ur.user_id,
            "role_id": ur.role_id,
            "role_name": role.name if role else "",
            "scope_type": ur.scope_type,
            "scope_id": ur.scope_id
        })

    return result
