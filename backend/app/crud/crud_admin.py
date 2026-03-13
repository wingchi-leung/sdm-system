from sqlalchemy.orm import Session
from app.schemas import AdminUser, AdminActivityTypeRole
from app.core.security import verify_password
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