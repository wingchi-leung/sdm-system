from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_rbac, crud_auth
from app.models import rbac as rbac_model
from app.schemas import AdminUser
from app.api import deps

router = APIRouter()


@router.get("/permissions", response_model=List[rbac_model.PermissionResponse])
def list_permissions(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """获取所有权限列表"""
    return crud_rbac.get_all_permissions(db)


@router.get("/roles", response_model=List[rbac_model.RoleWithPermissions])
def list_roles(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("role.manage")),
):
    """获取所有角色列表"""
    roles = crud_rbac.get_all_roles(db, ctx.tenant_id)
    result = []
    for role in roles:
        permissions = crud_rbac.get_role_permissions(db, role.id)
        result.append({
            "id": role.id,
            "tenant_id": role.tenant_id,
            "name": role.name,
            "is_system": role.is_system,
            "description": role.description,
            "permissions": permissions,
        })
    return result


@router.post("/user-roles", response_model=rbac_model.UserRoleResponse)
def assign_user_role(
    body: rbac_model.UserRoleAssign,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.require_permission("admin.manage")),
):
    """为用户分配角色，同时自动创建 admin_user 记录（如果不存在）"""
    try:
        user_role = crud_rbac.assign_user_role(
            db, body.user_id, body.role_id, ctx.tenant_id,
            body.scope_type, body.scope_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    role = db.query(crud_rbac.Role).filter(
        crud_rbac.Role.id == body.role_id,
        crud_rbac.Role.tenant_id == ctx.tenant_id,
    ).first()

    # 自动创建 admin_user 记录（如果不存在）
    existing_admin = db.query(AdminUser).filter(
        AdminUser.user_id == body.user_id,
        AdminUser.tenant_id == ctx.tenant_id,
    ).first()
    if not existing_admin:
        user = db.query(crud_rbac.User).filter(
            crud_rbac.User.id == body.user_id,
            crud_rbac.User.tenant_id == ctx.tenant_id,
        ).first()
        if user and user.phone:
            admin_user = AdminUser(
                tenant_id=ctx.tenant_id,
                user_id=body.user_id,
                username=user.phone,  # 用手机号做用户名
                password_hash=crud_auth.hash_password("123456"),
                must_reset_password=1,  # 需要改密
            )
            db.add(admin_user)
            db.commit()

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
    success = crud_rbac.remove_user_role(db, user_role_id, ctx.tenant_id)
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
        role = db.query(crud_rbac.Role).filter(
            crud_rbac.Role.id == ur.role_id,
            crud_rbac.Role.tenant_id == ctx.tenant_id,
        ).first()
        result.append({
            "id": ur.id,
            "user_id": ur.user_id,
            "role_id": ur.role_id,
            "role_name": role.name if role else "",
            "scope_type": ur.scope_type,
            "scope_id": ur.scope_id
        })

    return result
