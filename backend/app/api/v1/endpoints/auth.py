import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api import deps

logger = logging.getLogger(__name__)
from app.crud import crud_admin
from app.core.security import create_access_token, BCRYPT_MAX_BYTES

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "admin"


def _password_too_long(password: str) -> bool:
    return len(password.encode("utf-8")) > BCRYPT_MAX_BYTES


@router.post("/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    db: Session = Depends(deps.get_db),
):
    pwd_bytes = len(body.password.encode("utf-8"))
    if pwd_bytes > BCRYPT_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"密码长度不能超过 {BCRYPT_MAX_BYTES} 字节（当前收到 {pwd_bytes} 字节，请检查客户端是否传错字段）",
        )
    try:
        admin = crud_admin.authenticate_admin(db, body.username, body.password)
    except ValueError as e:
        if "72" in str(e) or "bytes" in str(e).lower():
            raise HTTPException(
                status_code=400,
                detail=f"密码校验异常（收到 {pwd_bytes} 字节）。bcrypt 限制 72 字节，请确认客户端发送的是「密码」字段且长度正常。",
            ) from e
        raise
    if not admin:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token(sub=str(admin.id), role="admin")
    return LoginResponse(access_token=token)
