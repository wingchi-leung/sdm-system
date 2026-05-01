from typing import Generator, Optional
from fastapi import Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import SessionLocal
from app.core.security import decode_access_token
from sqlalchemy.orm import Session
from app.crud import crud_activity, crud_rbac, crud_tenant
from app.schemas import User, UserRole

security = HTTPBearer(auto_error=False)

PLATFORM_ADMIN_ROLE_ID = 3


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _parse_token(credentials: HTTPAuthorizationCredentials | None) -> dict | None:
    if not credentials or credentials.scheme != "Bearer":
        return None
    return decode_access_token(credentials.credentials)


def _extract_identity(payload: dict) -> tuple[int, int]:
    """从 JWT payload 提取 (user_id, tenant_id)，兼容新旧格式"""
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="无效的登录状态")
    tid = payload.get("tid")
    if tid is None:
        tid = payload.get("tenant_id")
    if tid is None:
        raise HTTPException(status_code=401, detail="无效的登录状态")
    return user_id, int(tid)


class AuthContext:
    """认证上下文，替代旧的 TenantContext"""
    def __init__(
        self,
        user_id: int | None,
        tenant_id: int | None,
        tenant_code: str | None = None,
        is_authenticated: bool = True,
    ):
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.tenant_code = tenant_code
        self.is_authenticated = is_authenticated
        self._roles: list | None = None

    def _load_roles(self, db: Session) -> list:
        if self._roles is None:
            if self.user_id is not None and self.tenant_id is not None:
                self._roles = crud_rbac.get_user_roles(db, self.user_id, self.tenant_id)
            else:
                self._roles = []
        return self._roles

    def has_any_role(self, db: Session) -> bool:
        return len(self._load_roles(db)) > 0

    def has_platform_admin_role(self, db: Session) -> bool:
        roles = self._load_roles(db)
        return any(r.role_id == PLATFORM_ADMIN_ROLE_ID for r in roles)

    @property
    def is_platform_admin(self) -> bool:
        return self.tenant_id is not None and self.tenant_id == 0

    @property
    def role(self) -> str:
        """向后兼容：旧代码读 ctx.role"""
        if self.tenant_id == 0 or self.tenant_id is None:
            return "platform_admin"
        return "admin"


# 向后兼容别名
TenantContext = AuthContext


def _ensure_tenant_active(db: Session, tenant_id: int) -> str:
    tenant = crud_tenant.get_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=401, detail="租户不存在或登录已过期")
    if not crud_tenant.check_tenant_active(db, tenant_id):
        raise HTTPException(status_code=403, detail="租户已禁用或已过期")
    return tenant.code


# --- PLACEHOLDER_DEPS_CONTINUE ---


def get_public_tenant_context(
    tenant_code: str = Query("default", description="未登录访问时使用的租户编码"),
    db: Session = Depends(get_db),
) -> AuthContext:
    tenant = crud_tenant.get_tenant_by_code(db, tenant_code)
    if not tenant or not crud_tenant.check_tenant_active(db, tenant.id):
        raise HTTPException(status_code=400, detail="租户不存在或已禁用")
    return AuthContext(
        user_id=None,
        tenant_id=tenant.id,
        tenant_code=tenant.code,
        is_authenticated=False,
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> AuthContext:
    """任意已登录用户可访问（不检查角色）"""
    payload = _parse_token(credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    user_id, tenant_id = _extract_identity(payload)
    tenant_code = None
    if tenant_id and tenant_id > 0:
        tenant_code = _ensure_tenant_active(db, tenant_id)
    return AuthContext(
        user_id=user_id,
        tenant_id=tenant_id,
        tenant_code=tenant_code,
    )


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> AuthContext | None:
    payload = _parse_token(credentials)
    if not payload:
        return None
    try:
        user_id, tenant_id = _extract_identity(payload)
    except HTTPException:
        return None
    tenant_code = None
    if tenant_id and tenant_id > 0:
        try:
            tenant_code = _ensure_tenant_active(db, tenant_id)
        except HTTPException:
            return None
    return AuthContext(
        user_id=user_id,
        tenant_id=tenant_id,
        tenant_code=tenant_code,
    )


def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> AuthContext:
    """要求当前用户在该租户下有至少一个角色"""
    payload = _parse_token(credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    user_id, tenant_id = _extract_identity(payload)
    if not tenant_id or tenant_id <= 0:
        raise HTTPException(status_code=403, detail="需要租户管理员权限")
    tenant_code = _ensure_tenant_active(db, tenant_id)
    ctx = AuthContext(user_id=user_id, tenant_id=tenant_id, tenant_code=tenant_code)
    if not ctx.has_any_role(db):
        raise HTTPException(status_code=403, detail="该用户没有管理员权限")
    return ctx


# --- PLACEHOLDER_DEPS_CONTINUE2 ---


def get_current_admin_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> AuthContext | None:
    payload = _parse_token(credentials)
    if not payload:
        return None
    try:
        user_id, tenant_id = _extract_identity(payload)
    except HTTPException:
        return None
    if not tenant_id or tenant_id <= 0:
        return None
    try:
        tenant_code = _ensure_tenant_active(db, tenant_id)
    except HTTPException:
        return None
    ctx = AuthContext(user_id=user_id, tenant_id=tenant_id, tenant_code=tenant_code)
    if not ctx.has_any_role(db):
        return None
    return ctx


def get_current_platform_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> AuthContext:
    """要求当前用户有平台管理员角色"""
    payload = _parse_token(credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    user_id, tenant_id = _extract_identity(payload)
    if tenant_id != 0:
        raise HTTPException(status_code=403, detail="需要平台管理员权限")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    ctx = AuthContext(user_id=user_id, tenant_id=0, tenant_code=None)
    if not ctx.has_platform_admin_role(db):
        raise HTTPException(status_code=403, detail="需要平台管理员权限")
    return ctx


def get_current_admin_or_platform(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> AuthContext:
    """租户管理员或平台管理员均可访问"""
    payload = _parse_token(credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    user_id, tenant_id = _extract_identity(payload)
    if tenant_id == 0:
        ctx = AuthContext(user_id=user_id, tenant_id=0, tenant_code=None)
        if ctx.has_platform_admin_role(db):
            return ctx
        raise HTTPException(status_code=403, detail="需要管理员权限")
    tenant_code = _ensure_tenant_active(db, tenant_id)
    ctx = AuthContext(user_id=user_id, tenant_id=tenant_id, tenant_code=tenant_code)
    if ctx.has_any_role(db):
        return ctx
    raise HTTPException(status_code=403, detail="需要管理员权限")


def require_permission(permission_code: str):
    def checker(
        db: Session = Depends(get_db),
        ctx: AuthContext = Depends(get_current_admin),
    ) -> AuthContext:
        if not crud_rbac.has_permission(db, ctx.user_id, permission_code, ctx.tenant_id):
            raise HTTPException(status_code=403, detail=f"缺少权限: {permission_code}")
        return ctx
    return checker


def require_activity_admin(
    activity_id: int,
    db: Session,
    ctx: AuthContext,
    permission_code: str = "participant.view",
) -> AuthContext:
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")
    if has_activity_permission(db, ctx, activity_id, permission_code):
        return ctx
    raise HTTPException(status_code=403, detail="无权限查看此活动")


def has_activity_permission(
    db: Session,
    ctx: AuthContext,
    activity_id: int,
    permission_code: str,
) -> bool:
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")
    if crud_rbac.has_permission(db, ctx.user_id, permission_code, ctx.tenant_id):
        return True
    if activity.activity_type_id and crud_rbac.has_permission(
        db, ctx.user_id, permission_code, ctx.tenant_id,
        resource_id=activity.activity_type_id, resource_type="activity_type",
    ):
        return True
    if crud_rbac.has_permission(
        db, ctx.user_id, permission_code, ctx.tenant_id,
        resource_id=activity_id, resource_type="activity",
    ):
        return True
    return False


# 向后兼容：旧代码中 get_tenant_context 的调用
get_tenant_context = get_current_user
