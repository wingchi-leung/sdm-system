from sqlalchemy.orm import Session
from app.schemas import Permission, Role, RolePermission, UserRole
from typing import List, Optional


def has_permission(
    db: Session,
    user_id: int,
    permission_code: str,
    tenant_id: int,
    resource_id: Optional[int] = None,
    resource_type: Optional[str] = None
) -> bool:
    """
    检查用户是否有某个权限

    Args:
        db: 数据库会话
        user_id: 用户ID
        permission_code: 权限代码，如 'activity.edit'
        tenant_id: 租户ID
        resource_id: 资源ID（活动ID等）
        resource_type: 资源类型（activity_type 或 activity）
    """
    # 1. 获取权限ID
    perm = db.query(Permission).filter(Permission.code == permission_code).first()
    if not perm:
        return False

    # 2. 查询用户的所有角色授权
    user_roles = db.query(UserRole, Role, RolePermission).join(
        Role, UserRole.role_id == Role.id
    ).join(
        RolePermission, Role.id == RolePermission.role_id
    ).filter(
        UserRole.user_id == user_id,
        UserRole.tenant_id == tenant_id,
        RolePermission.permission_id == perm.id
    ).all()

    if not user_roles:
        return False

    # 3. 检查权限范围
    for ur, role, rp in user_roles:
        # 全局权限
        if ur.scope_type is None:
            return True

        # 活动类型权限
        if ur.scope_type == 'activity_type' and resource_type == 'activity_type':
            if ur.scope_id == resource_id:
                return True

        # 具体活动权限
        if ur.scope_type == 'activity' and resource_type == 'activity':
            if ur.scope_id == resource_id:
                return True

    return False


def get_user_permissions(db: Session, user_id: int, tenant_id: int) -> List[str]:
    """获取用户的所有权限代码列表"""
    perms = db.query(Permission.code).join(
        RolePermission, Permission.id == RolePermission.permission_id
    ).join(
        Role, RolePermission.role_id == Role.id
    ).join(
        UserRole, Role.id == UserRole.role_id
    ).filter(
        UserRole.user_id == user_id,
        UserRole.tenant_id == tenant_id
    ).distinct().all()

    return [p[0] for p in perms]


def assign_user_role(
    db: Session,
    user_id: int,
    role_id: int,
    tenant_id: int,
    scope_type: Optional[str] = None,
    scope_id: Optional[int] = None
) -> UserRole:
    """为用户分配角色"""
    user_role = UserRole(
        user_id=user_id,
        role_id=role_id,
        tenant_id=tenant_id,
        scope_type=scope_type,
        scope_id=scope_id
    )
    db.add(user_role)
    db.commit()
    db.refresh(user_role)
    return user_role


def remove_user_role(db: Session, user_role_id: int) -> bool:
    """移除用户角色"""
    ur = db.query(UserRole).filter(UserRole.id == user_role_id).first()
    if ur:
        db.delete(ur)
        db.commit()
        return True
    return False


def get_user_roles(db: Session, user_id: int, tenant_id: int) -> List[UserRole]:
    """获取用户的所有角色"""
    return db.query(UserRole).filter(
        UserRole.user_id == user_id,
        UserRole.tenant_id == tenant_id
    ).all()


def get_all_roles(db: Session, tenant_id: int) -> List[Role]:
    """获取所有角色"""
    return db.query(Role).filter(Role.tenant_id == tenant_id).all()


def get_all_permissions(db: Session) -> List[Permission]:
    """获取所有权限"""
    return db.query(Permission).all()
