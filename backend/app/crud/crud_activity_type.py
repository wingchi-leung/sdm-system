"""活动类型 CRUD（租户隔离）"""
from sqlalchemy.orm import Session
from app.schemas import ActivityType
from fastapi import HTTPException


def get_by_id(db: Session, type_id: int, tenant_id: int) -> ActivityType | None:
    """根据ID获取活动类型（租户隔离）"""
    return db.query(ActivityType).filter(
        ActivityType.id == type_id,
        ActivityType.tenant_id == tenant_id
    ).first()


def get_by_name(db: Session, type_name: str, tenant_id: int) -> ActivityType | None:
    """根据名称获取活动类型（租户隔离）"""
    if not (type_name and str(type_name).strip()):
        return None
    return db.query(ActivityType).filter(
        ActivityType.type_name == str(type_name).strip(),
        ActivityType.tenant_id == tenant_id
    ).first()


def get_or_create_by_name(db: Session, type_name: str, tenant_id: int, code: str | None = None) -> ActivityType:
    """按名称获取活动类型，不存在则创建（租户隔离）"""
    name = (type_name or "").strip()
    if not name:
        raise ValueError("活动类型名称不能为空")
    t = get_by_name(db, name, tenant_id)
    if t:
        return t
    t = ActivityType(
        tenant_id=tenant_id,
        type_name=name,
        code=(code or "").strip() or None
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def list_all(db: Session, tenant_id: int):
    """获取所有活动类型（租户隔离）"""
    return db.query(ActivityType).filter(
        ActivityType.tenant_id == tenant_id
    ).order_by(ActivityType.type_name).all()