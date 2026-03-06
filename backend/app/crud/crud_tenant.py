from sqlalchemy.orm import Session
from app.schemas import Tenant
from fastapi import HTTPException
from datetime import datetime


def get_tenant(db: Session, tenant_id: int) -> Tenant | None:
    """根据 ID 获取租户"""
    return db.query(Tenant).filter(Tenant.id == tenant_id).first()


def get_tenant_by_code(db: Session, code: str) -> Tenant | None:
    """根据 code 获取租户"""
    return db.query(Tenant).filter(Tenant.code == code).first()


def create_tenant(
    db: Session,
    name: str,
    code: str,
    plan: str = "basic",
    contact_name: str | None = None,
    contact_phone: str | None = None,
) -> Tenant:
    """创建租户"""
    existing = get_tenant_by_code(db, code)
    if existing:
        raise HTTPException(status_code=400, detail="租户编码已存在")
    
    db_tenant = Tenant(
        name=name,
        code=code,
        status=1,
        plan=plan,
        contact_name=contact_name,
        contact_phone=contact_phone,
    )
    db.add(db_tenant)
    db.commit()
    db.refresh(db_tenant)
    return db_tenant


def check_tenant_active(db: Session, tenant_id: int) -> bool:
    """检查租户是否有效"""
    tenant = get_tenant(db, tenant_id)
    if not tenant:
        return False
    if tenant.status != 1:
        return False
    if tenant.expire_at and tenant.expire_at < datetime.now():
        return False
    return True