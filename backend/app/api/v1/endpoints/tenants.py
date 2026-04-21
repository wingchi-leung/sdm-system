from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api import deps
from app.models.tenant import (
    TenantCreate,
    TenantListResponse,
    TenantResponse,
    TenantSummary,
    TenantUpdate,
)
from app.schemas import AdminUser, Activity, Tenant, User

router = APIRouter()


def _normalize_code(code: str) -> str:
    return code.strip().lower()


def _ensure_tenant_code_available(db: Session, code: str) -> None:
    existing = db.query(Tenant).filter(Tenant.code == code).first()
    if existing:
        raise HTTPException(status_code=400, detail="租户编码已存在")


def _build_summary(db: Session) -> TenantSummary:
    now = datetime.now()
    total = db.query(func.count(Tenant.id)).scalar() or 0
    active = db.query(func.count(Tenant.id)).filter(
        Tenant.status == 1,
        ((Tenant.expire_at.is_(None)) | (Tenant.expire_at >= now)),
    ).scalar() or 0
    disabled = db.query(func.count(Tenant.id)).filter(Tenant.status == 0).scalar() or 0
    expired = db.query(func.count(Tenant.id)).filter(
        Tenant.expire_at.is_not(None),
        Tenant.expire_at < now,
    ).scalar() or 0

    return TenantSummary(
        total=total,
        active=active,
        disabled=disabled,
        expired=expired,
    )


@router.get("", response_model=TenantListResponse)
def list_tenants(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    keyword: str | None = Query(default=None),
    status: int | None = Query(default=None, ge=0, le=1),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_platform_admin),
):
    """平台管理员查看租户列表。"""
    query = db.query(Tenant)
    if keyword:
        normalized = f"%{keyword.strip()}%"
        query = query.filter(
            (Tenant.name.like(normalized))
            | (Tenant.code.like(normalized))
            | (Tenant.contact_name.like(normalized))
            | (Tenant.contact_phone.like(normalized))
        )
    if status is not None:
        query = query.filter(Tenant.status == status)

    total = query.count()
    items = query.order_by(Tenant.id.desc()).offset(skip).limit(limit).all()
    return TenantListResponse(
        items=items,
        total=total,
        summary=_build_summary(db),
    )


@router.post("", response_model=TenantResponse)
def create_tenant(
    body: TenantCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_platform_admin),
):
    """平台管理员创建租户。"""
    code = _normalize_code(body.code)
    _ensure_tenant_code_available(db, code)

    tenant = Tenant(
        name=body.name.strip(),
        code=code,
        status=1,
        plan=body.plan.strip() or "basic",
        max_admins=body.max_admins,
        max_activities=body.max_activities,
        expire_at=body.expire_at,
        contact_name=body.contact_name.strip() if body.contact_name else None,
        contact_phone=body.contact_phone.strip() if body.contact_phone else None,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.get("/{tenant_id}", response_model=TenantResponse)
def get_tenant(
    tenant_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_platform_admin),
):
    """平台管理员查看租户详情。"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="租户不存在")
    return tenant


@router.patch("/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: int,
    body: TenantUpdate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_platform_admin),
):
    """平台管理员更新租户配置与状态。"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="租户不存在")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        if isinstance(value, str):
            value = value.strip() or None
        setattr(tenant, key, value)

    db.commit()
    db.refresh(tenant)
    return tenant


@router.get("/{tenant_id}/stats")
def get_tenant_stats(
    tenant_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_platform_admin),
):
    """平台管理员查看租户容量与规模。"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="租户不存在")

    return {
        "tenant_id": tenant_id,
        "admin_count": db.query(func.count(AdminUser.id)).filter(AdminUser.tenant_id == tenant_id).scalar() or 0,
        "activity_count": db.query(func.count(Activity.id)).filter(Activity.tenant_id == tenant_id).scalar() or 0,
        "user_count": db.query(func.count(User.id)).filter(User.tenant_id == tenant_id).scalar() or 0,
    }
