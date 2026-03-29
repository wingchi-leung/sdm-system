from typing import Generator
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import SessionLocal
from app.core.security import decode_access_token
from sqlalchemy.orm import Session
from app.crud import crud_activity, crud_rbac

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
    def __init__(self, user_id: int, role: str, tenant_id: int):
        self.user_id = user_id
        self.role = role
        self.tenant_id = tenant_id


def get_tenant_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
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
    
    return TenantContext(user_id=user_id, role=role, tenant_id=tenant_id)


def get_current_admin(
    ctx: TenantContext = Depends(get_tenant_context),
) -> TenantContext:
    """仅管理员可访问"""
    if ctx.role != "admin":
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    return ctx


def get_current_admin_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> TenantContext | None:
    """可选管理员鉴权"""
    payload = _parse_token(credentials)
    if not payload or payload.get("role") != "admin":
        return None
    try:
        user_id = int(payload["sub"])
        tenant_id = int(payload["tenant_id"])
        return TenantContext(user_id=user_id, role="admin", tenant_id=tenant_id)
    except (KeyError, ValueError):
        return None


def get_current_user(
    ctx: TenantContext = Depends(get_tenant_context),
) -> TenantContext:
    """任意已登录用户可访问"""
    return ctx


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
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
        return TenantContext(user_id=user_id, role=role, tenant_id=tenant_id)
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