from sqlalchemy.orm import Session
from app.schemas import AdminUser, AdminActivityTypeRole
from app.core.security import verify_password, get_password_hash
from typing import List


def get_admin_by_username(db: Session, username: str, tenant_id: int =1 ) -> AdminUser | None:
    """根据用户名获取管理员（租户隔离）"""
    return db.query(AdminUser).filter(
        AdminUser.username == username,
        AdminUser.tenant_id == tenant_id
    ).first()


def get_admin_by_id(db: Session, admin_id: int, tenant_id: int) -> AdminUser | None:
    """根据ID获取管理员（租户隔离）"""
    return db.query(AdminUser).filter(
        AdminUser.id == admin_id,
        AdminUser.tenant_id == tenant_id
    ).first()


def get_admin_scope(db: Session, admin_id: int, tenant_id: int) -> tuple[bool, List[int]]:
    """
    返回 (is_super_admin, allowed_activity_type_ids)。
    超级管理员 allowed_activity_type_ids 为空列表表示不按类型过滤（全部）。
    """
    admin = get_admin_by_id(db, admin_id, tenant_id)
    if not admin:
        return False, []
    if getattr(admin, "is_super_admin", 0) == 1:
        return True, []
    rows = (
        db.query(AdminActivityTypeRole.activity_type_id)
        .filter(
            AdminActivityTypeRole.admin_user_id == admin_id,
            AdminActivityTypeRole.tenant_id == tenant_id
        )
        .all()
    )
    allowed = [r[0] for r in rows]
    if not allowed:
        return True, []
    return False, allowed


def authenticate_admin(db: Session, username: str, password: str, tenant_id: int) -> AdminUser | None:
    """管理员认证（租户隔离）"""
    admin = get_admin_by_username(db, username, tenant_id)
    if not admin:
        return None
    if not verify_password(password, admin.password_hash):
        return None
    return admin


def get_all_admins(db: Session, tenant_id: int) -> List[AdminUser]:
    """获取所有管理员列表"""
    return db.query(AdminUser).filter(AdminUser.tenant_id == tenant_id).all()


def assign_admin_roles(db: Session, admin_user_id: int, activity_type_ids: List[int], tenant_id: int) -> None:
    """为管理员分配活动类型权限"""
    db.query(AdminActivityTypeRole).filter(
        AdminActivityTypeRole.admin_user_id == admin_user_id,
        AdminActivityTypeRole.tenant_id == tenant_id
    ).delete()

    for type_id in activity_type_ids:
        role = AdminActivityTypeRole(
            admin_user_id=admin_user_id,
            activity_type_id=type_id,
            tenant_id=tenant_id
        )
        db.add(role)
    db.commit()


def get_admin_roles(db: Session, admin_user_id: int, tenant_id: int) -> List[int]:
    """获取管理员的活动类型权限"""
    rows = db.query(AdminActivityTypeRole.activity_type_id).filter(
        AdminActivityTypeRole.admin_user_id == admin_user_id,
        AdminActivityTypeRole.tenant_id == tenant_id
    ).all()
    return [r[0] for r in rows]


def create_admin(db: Session, user_id: int, username: str, password: str, tenant_id: int) -> AdminUser:
    """创建管理员账号"""
    admin = AdminUser(
        tenant_id=tenant_id,
        username=username,
        password_hash=get_password_hash(password),
        user_id=user_id,
        is_super_admin=0
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin