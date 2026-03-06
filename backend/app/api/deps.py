from typing import Generator
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import SessionLocal
from app.core.security import decode_access_token
from sqlalchemy.orm import Session
from app.crud import crud_admin, crud_activity

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


def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> int:
    """校验管理员 JWT，返回 admin_user.id"""
    payload = _parse_token(credentials)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    try:
        return int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="未登录或登录已过期")


def get_current_admin_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> int | None:
    """可选管理员鉴权：有 token 且为 admin 则返回 admin_id，否则 None（用于列表按权限过滤）"""
    payload = _parse_token(credentials)
    if not payload or payload.get("role") != "admin":
        return None
    try:
        return int(payload["sub"])
    except (KeyError, ValueError):
        return None


def get_admin_scope(
    db: Session = Depends(get_db),
    admin_id: int = Depends(get_current_admin),
) -> dict:
    """
    依赖：需已为管理员。返回 {"admin_id": int, "is_super": bool, "allowed_activity_type_ids": list[int]}。
    用于活动创建时的类型校验与列表过滤。
    """
    is_super, allowed_ids = crud_admin.get_admin_scope(db, admin_id)
    return {"admin_id": admin_id, "is_super": is_super, "allowed_activity_type_ids": allowed_ids}


def require_activity_admin(
    activity_id: int,
    db: Session = Depends(get_db),
    admin_id: int = Depends(get_current_admin),
) -> int:
    """
    依赖：当前管理员必须有该活动的管理权限（超级管理员或该活动所属类型在授权范围内）。
    返回 activity_id；无权限则 403。
    """
    activity = crud_activity.get_activity(db, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")
    is_super, allowed_ids = crud_admin.get_admin_scope(db, admin_id)
    if is_super:
        return activity_id
    atid = getattr(activity, "activity_type_id", None)
    if atid is not None and atid in allowed_ids:
        return activity_id
    raise HTTPException(status_code=403, detail="无该活动的管理权限")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """校验任意角色的 JWT，返回 {"id": int, "role": str}"""
    payload = _parse_token(credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    role = payload.get("role")
    if role not in ("admin", "user"):
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    try:
        return {"id": int(payload["sub"]), "role": role}
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="未登录或登录已过期")


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    """可选鉴权：有 token 则解析，无 token 返回 None（用于不强制登录的接口）"""
    payload = _parse_token(credentials)
    if not payload:
        return None
    role = payload.get("role")
    if role not in ("admin", "user"):
        return None
    try:
        return {"id": int(payload["sub"]), "role": role}
    except (KeyError, ValueError):
        return None