from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.schemas import Permission, Role, RolePermission, User, UserRole
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

    # 2. 查询用户的所有角色授权（包含系统角色 tenant_id=0）
    user_roles = db.query(UserRole, Role, RolePermission).join(
        Role, UserRole.role_id == Role.id
    ).join(
        RolePermission, Role.id == RolePermission.role_id
    ).filter(
        UserRole.user_id == user_id,
        UserRole.tenant_id == tenant_id,
        or_(Role.tenant_id == tenant_id, Role.tenant_id == 0),
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
        UserRole.tenant_id == tenant_id,
        or_(Role.tenant_id == tenant_id, Role.tenant_id == 0),
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
    valid_scope_types = {None, "activity_type", "activity"}
    if scope_type not in valid_scope_types:
        raise ValueError("无效的权限范围类型")
    if scope_type is None:
        scope_id = None
    elif scope_id is None:
        raise ValueError("scope_id 不能为空")

    role = db.query(Role).filter(
        Role.id == role_id,
        or_(Role.tenant_id == tenant_id, Role.tenant_id == 0),
    ).first()
    if not role:
        raise ValueError("角色不存在或不属于当前租户")

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).first()
    if not user:
        raise ValueError("用户不存在或不属于当前租户")

    existing_query = db.query(UserRole).filter(
        UserRole.user_id == user_id,
        UserRole.role_id == role_id,
        UserRole.tenant_id == tenant_id,
    )
    if scope_type is None:
        existing_query = existing_query.filter(UserRole.scope_type.is_(None))
    else:
        existing_query = existing_query.filter(UserRole.scope_type == scope_type)
    if scope_id is None:
        existing_query = existing_query.filter(UserRole.scope_id.is_(None))
    else:
        existing_query = existing_query.filter(UserRole.scope_id == scope_id)
    existing = existing_query.first()
    if existing:
        raise ValueError("该角色已分配给当前用户")

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


def remove_user_role(db: Session, user_role_id: int, tenant_id: int) -> bool:
    """移除用户角色"""
    ur = db.query(UserRole).filter(
        UserRole.id == user_role_id,
        UserRole.tenant_id == tenant_id,
    ).first()
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
    """获取所有角色（包含系统预设角色 tenant_id=0）"""
    return db.query(Role).filter(
        (Role.tenant_id == tenant_id) | (Role.tenant_id == 0)
    ).all()


def get_all_permissions(db: Session) -> List[Permission]:
    """获取所有权限"""
    return db.query(Permission).all()


def get_role_permissions(db: Session, role_id: int) -> List[Permission]:
    """获取某个角色绑定的权限列表"""
    return db.query(Permission).join(
        RolePermission, Permission.id == RolePermission.permission_id
    ).filter(
        RolePermission.role_id == role_id
    ).all()
