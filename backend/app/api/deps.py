from typing import Generator
from fastapi import Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import SessionLocal
from app.core.security import decode_access_token
from sqlalchemy.orm import Session
from app.crud import crud_activity, crud_rbac, crud_tenant
from app.schemas import PlatformAdmin

security = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _parse_token(credentials: HTTPAuthorizationCredentials | None) -> dict | None:
    """解析 Bearer token，返回 payload 或 None"""
    if not credentials or credentials.scheme != "Bearer":
        return None
    return decode_access_token(credentials.credentials)


class TenantContext:
    """租户上下文"""
    def __init__(
        self,
        user_id: int | None,
        role: str,
        tenant_id: int | None,
        tenant_code: str | None = None,
        is_authenticated: bool = True,
    ):
        self.user_id = user_id
        self.role = role
        self.tenant_id = tenant_id
        self.tenant_code = tenant_code
        self.is_authenticated = is_authenticated

    @property
    def is_platform_admin(self) -> bool:
        return self.role == "platform_admin"


def _ensure_tenant_active(db: Session, tenant_id: int) -> str:
    """确认租户仍然有效，返回租户编码。"""
    tenant = crud_tenant.get_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=401, detail="租户不存在或登录已过期")
    if not crud_tenant.check_tenant_active(db, tenant_id):
        raise HTTPException(status_code=403, detail="租户已禁用或已过期")
    return tenant.code


def _ensure_platform_admin_active(db: Session, admin_id: int) -> None:
    """确认平台管理员仍然有效。"""
    admin = db.query(PlatformAdmin).filter(
        PlatformAdmin.id == admin_id,
        PlatformAdmin.status == 1,
    ).first()
    if not admin:
        raise HTTPException(status_code=401, detail="平台管理员不存在或已禁用")


def get_public_tenant_context(
    tenant_code: str = Query("default", description="未登录访问时使用的租户编码"),
    db: Session = Depends(get_db),
) -> TenantContext:
    """未登录访问时解析租户上下文。"""
    tenant = crud_tenant.get_tenant_by_code(db, tenant_code)
    if not tenant or not crud_tenant.check_tenant_active(db, tenant.id):
        raise HTTPException(status_code=400, detail="租户不存在或已禁用")
    return TenantContext(
        user_id=None,
        role="public",
        tenant_id=tenant.id,
        tenant_code=tenant.code,
        is_authenticated=False,
    )


def get_tenant_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> TenantContext:
    """解析 JWT，返回租户上下文"""
    payload = _parse_token(credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    
    role = payload.get("role")
    if role not in ("admin", "user"):
        raise HTTPException(status_code=401, detail="无效的登录状态")
    
    try:
        user_id = int(payload["sub"])
        tenant_id = int(payload["tenant_id"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="无效的登录状态")
    
    tenant_code = _ensure_tenant_active(db, tenant_id)
    return TenantContext(
        user_id=user_id,
        role=role,
        tenant_id=tenant_id,
        tenant_code=tenant_code,
    )


def get_current_admin(
    ctx: TenantContext = Depends(get_tenant_context),
) -> TenantContext:
    """仅管理员可访问"""
    if ctx.role != "admin":
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    return ctx


def get_current_platform_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> TenantContext:
    """仅平台管理员可访问（不绑定租户）"""
    payload = _parse_token(credentials)
    if not payload or payload.get("role") != "platform_admin":
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="无效的登录状态")
    _ensure_platform_admin_active(db, user_id)
    return TenantContext(
        user_id=user_id,
        role="platform_admin",
        tenant_id=None,
        tenant_code=None,
    )


def get_current_admin_or_platform(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> TenantContext:
    """租户管理员或平台管理员均可访问，由业务层继续判断范围。"""
    payload = _parse_token(credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    role = payload.get("role")
    if role == "platform_admin":
        try:
            user_id = int(payload["sub"])
        except (KeyError, ValueError):
            raise HTTPException(status_code=401, detail="无效的登录状态")
        _ensure_platform_admin_active(db, user_id)
        return TenantContext(
            user_id=user_id,
            role="platform_admin",
            tenant_id=None,
            tenant_code=None,
        )
    if role == "admin":
        try:
            user_id = int(payload["sub"])
            tenant_id = int(payload["tenant_id"])
        except (KeyError, ValueError):
            raise HTTPException(status_code=401, detail="无效的登录状态")
        tenant_code = _ensure_tenant_active(db, tenant_id)
        return TenantContext(
            user_id=user_id,
            role="admin",
            tenant_id=tenant_id,
            tenant_code=tenant_code,
        )
    raise HTTPException(status_code=401, detail="未登录或登录已过期")


def get_current_admin_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> TenantContext | None:
    """可选管理员鉴权"""
    payload = _parse_token(credentials)
    if not payload or payload.get("role") != "admin":
        return None
    try:
        user_id = int(payload["sub"])
        tenant_id = int(payload["tenant_id"])
        tenant_code = _ensure_tenant_active(db, tenant_id)
        return TenantContext(
            user_id=user_id,
            role="admin",
            tenant_id=tenant_id,
            tenant_code=tenant_code,
        )
    except (KeyError, ValueError):
        return None


def get_current_user(
    ctx: TenantContext = Depends(get_tenant_context),
) -> TenantContext:
    """任意已登录用户可访问"""
    return ctx


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> TenantContext | None:
    """可选鉴权"""
    payload = _parse_token(credentials)
    if not payload:
        return None
    role = payload.get("role")
    if role not in ("admin", "user"):
        return None
    try:
        user_id = int(payload["sub"])
        tenant_id = int(payload["tenant_id"])
        tenant_code = _ensure_tenant_active(db, tenant_id)
        return TenantContext(
            user_id=user_id,
            role=role,
            tenant_id=tenant_id,
            tenant_code=tenant_code,
        )
    except (KeyError, ValueError):
        return None


def require_permission(permission_code: str):
    """权限检查装饰器（RBAC）"""
    def checker(
        db: Session = Depends(get_db),
        ctx: TenantContext = Depends(get_current_admin),
    ) -> TenantContext:
        if not crud_rbac.has_permission(db, ctx.user_id, permission_code, ctx.tenant_id):
            raise HTTPException(status_code=403, detail=f"缺少权限: {permission_code}")
        return ctx
    return checker


def require_activity_permission(permission_code: str, activity_id: int):
    """活动级别权限检查（RBAC）"""
    def checker(
        db: Session = Depends(get_db),
        ctx: TenantContext = Depends(get_current_admin),
    ) -> TenantContext:
        activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
        if not activity:
            raise HTTPException(status_code=404, detail="活动不存在")

        # 检查全局权限
        if crud_rbac.has_permission(db, ctx.user_id, permission_code, ctx.tenant_id):
            return ctx

        # 检查活动类型权限
        if activity.activity_type_id:
            if crud_rbac.has_permission(
                db, ctx.user_id, permission_code, ctx.tenant_id,
                resource_id=activity.activity_type_id, resource_type='activity_type'
            ):
                return ctx

        # 检查具体活动权限
        if crud_rbac.has_permission(
            db, ctx.user_id, permission_code, ctx.tenant_id,
            resource_id=activity_id, resource_type='activity'
        ):
            return ctx

        raise HTTPException(status_code=403, detail=f"无该活动的{permission_code}权限")
    return checker


def require_activity_admin(
    activity_id: int,
    db: Session,
    ctx: TenantContext,
) -> TenantContext:
    """兼容旧调用方式的活动管理员校验。"""
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if crud_rbac.has_permission(db, ctx.user_id, "participant.view", ctx.tenant_id):
        return ctx

    if activity.activity_type_id and crud_rbac.has_permission(
        db,
        ctx.user_id,
        "participant.view",
        ctx.tenant_id,
        resource_id=activity.activity_type_id,
        resource_type="activity_type",
    ):
        return ctx

    if crud_rbac.has_permission(
        db,
        ctx.user_id,
        "participant.view",
        ctx.tenant_id,
        resource_id=activity_id,
        resource_type="activity",
    ):
        return ctx

    raise HTTPException(status_code=403, detail="无权限查看此活动")
