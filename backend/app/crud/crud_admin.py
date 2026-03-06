from sqlalchemy.orm import Session
from app.schemas import AdminUser, AdminActivityTypeRole
from app.core.security import verify_password


def get_admin_by_username(db: Session, username: str) -> AdminUser | None:
    return db.query(AdminUser).filter(AdminUser.username == username).first()


def get_admin_by_id(db: Session, admin_id: int) -> AdminUser | None:
    return db.query(AdminUser).filter(AdminUser.id == admin_id).first()


def get_admin_scope(db: Session, admin_id: int) -> tuple[bool, list[int]]:
    """
    返回 (is_super_admin, allowed_activity_type_ids)。
    超级管理员 allowed_activity_type_ids 为空列表表示不按类型过滤（全部）。
    兼容旧库：未配置 is_super_admin=1 且无授权记录时，视为超级管理员。
    """
    admin = get_admin_by_id(db, admin_id)
    if not admin:
        return False, []
    if getattr(admin, "is_super_admin", 0) == 1:
        return True, []
    rows = (
        db.query(AdminActivityTypeRole.activity_type_id)
        .filter(AdminActivityTypeRole.admin_user_id == admin_id)
        .all()
    )
    allowed = [r[0] for r in rows]
    # 无授权记录时视为超级管理员，兼容升级前已有管理员
    if not allowed:
        return True, []
    return False, allowed


def authenticate_admin(db: Session, username: str, password: str) -> AdminUser | None:
    admin = get_admin_by_username(db, username)
    if not admin or not verify_password(password, admin.password_hash):
        return None
    return admin
