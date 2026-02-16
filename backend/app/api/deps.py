from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import SessionLocal
from app.core.security import decode_access_token
from sqlalchemy.orm import Session

security = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    """
    数据库依赖项，用于在每个请求中获取数据库会话
    使用方法：db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> int:
    """校验管理员 JWT，返回 admin_user.id"""
    if not credentials or credentials.scheme != "Bearer":
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    payload = decode_access_token(credentials.credentials)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    try:
        return int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="未登录或登录已过期")