from sqlalchemy.orm import Session
from app.schemas import AdminUser
from app.core.security import verify_password


def get_admin_by_username(db: Session, username: str) -> AdminUser | None:
    return db.query(AdminUser).filter(AdminUser.username == username).first()


def authenticate_admin(db: Session, username: str, password: str) -> AdminUser | None:
    admin = get_admin_by_username(db, username)
    if not admin or not verify_password(password, admin.password_hash):
        return None
    return admin
