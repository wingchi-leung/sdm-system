from sqlalchemy.orm import Session
from app.schemas import AdminUser
from app.core.security import verify_password, get_password_hash
from typing import Optional


def authenticate_admin(db: Session, username: str, password: str, tenant_id: int) -> Optional[AdminUser]:
    """管理员认证"""
    admin = db.query(AdminUser).filter(
        AdminUser.username == username,
        AdminUser.tenant_id == tenant_id
    ).first()

    if not admin:
        return None

    if not verify_password(password, admin.password_hash):
        return None

    return admin


def create_admin(db: Session, user_id: int, username: str, password: str, tenant_id: int) -> AdminUser:
    """创建管理员账号"""
    admin = AdminUser(
        tenant_id=tenant_id,
        user_id=user_id,
        username=username,
        password_hash=get_password_hash(password)
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def get_admin_by_username(db: Session, username: str, tenant_id: int) -> Optional[AdminUser]:
    """根据用户名获取管理员"""
    return db.query(AdminUser).filter(
        AdminUser.username == username,
        AdminUser.tenant_id == tenant_id
    ).first()
