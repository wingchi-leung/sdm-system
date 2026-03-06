"""活动类型 CRUD：与 2.8 管理员分级配套"""
from sqlalchemy.orm import Session
from app.schemas import ActivityType


def get_by_id(db: Session, type_id: int) -> ActivityType | None:
    return db.query(ActivityType).filter(ActivityType.id == type_id).first()


def get_by_name(db: Session, type_name: str) -> ActivityType | None:
    if not (type_name and str(type_name).strip()):
        return None
    return db.query(ActivityType).filter(ActivityType.type_name == str(type_name).strip()).first()


def get_or_create_by_name(db: Session, type_name: str, code: str | None = None) -> ActivityType:
    """按名称获取活动类型，不存在则创建"""
    name = (type_name or "").strip()
    if not name:
        raise ValueError("活动类型名称不能为空")
    t = get_by_name(db, name)
    if t:
        return t
    t = ActivityType(type_name=name, code=(code or "").strip() or None)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def list_all(db: Session):
    return db.query(ActivityType).order_by(ActivityType.type_name).all()
