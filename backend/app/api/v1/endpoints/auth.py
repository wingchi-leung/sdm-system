import logging
import time
from collections import defaultdict
from urllib.request import urlopen, Request as UrllibRequest
from urllib.error import HTTPError, URLError
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api import deps
from app.core.config import settings
from app.crud import crud_admin, crud_user
from app.core.security import create_access_token, BCRYPT_MAX_BYTES
from app.models.user import UserLoginRequest, UserLoginResponse
from app.schemas import ActivityType

logger = logging.getLogger(__name__)
router = APIRouter()

_login_attempts: dict[str, list[float]] = defaultdict(list)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_https(request: Request) -> bool:
    proto = request.headers.get("X-Forwarded-Proto", "").strip().lower()
    if proto == "https":
        return True
    return request.url.scheme == "https"


def _check_login_rate_limit(ip: str) -> None:
    now = time.time()
    window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
    max_count = settings.LOGIN_RATE_LIMIT_COUNT
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < window]
    if len(_login_attempts[ip]) >= max_count:
        raise HTTPException(
            status_code=429,
            detail=f"登录尝试过于频繁，请 {window} 秒后再试",
        )
    _login_attempts[ip].append(now)


def _enforce_https_and_rate_limit(request: Request) -> None:
    if settings.REQUIRE_HTTPS_FOR_LOGIN and not _is_https(request):
        raise HTTPException(status_code=403, detail="登录仅支持 HTTPS，请使用安全连接")
    _check_login_rate_limit(_get_client_ip(request))


def _check_password_length(password: str) -> None:
    pwd_bytes = len(password.encode("utf-8"))
    if pwd_bytes > BCRYPT_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"密码长度不能超过 {BCRYPT_MAX_BYTES} 字节",
        )


class LoginRequest(BaseModel):
    username: str
    password: str


class ActivityTypeItem(BaseModel):
    id: int
    name: str
    code: str | None = None

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "admin"
    is_super_admin: bool = True
    activity_types: list[ActivityTypeItem] = []


def _admin_activity_types_for_response(db: Session, admin_id: int) -> list[dict]:
    """返回该管理员可管理的活动类型列表（用于登录响应）"""
    is_super, allowed_ids = crud_admin.get_admin_scope(db, admin_id)
    if is_super or not allowed_ids:
        return []
    types = db.query(ActivityType).filter(ActivityType.id.in_(allowed_ids)).all()
    return [{"id": t.id, "name": t.type_name, "code": t.code} for t in types]


@router.post("/login", response_model=LoginResponse)
def login(
    request: Request,
    body: LoginRequest,
    db: Session = Depends(deps.get_db),
):
    """管理员登录：用户名 + 密码。返回 is_super_admin 与 activity_types 供前端分级展示。"""
    _enforce_https_and_rate_limit(request)
    _check_password_length(body.password)
    try:
        admin = crud_admin.authenticate_admin(db, body.username, body.password)
    except ValueError as e:
        if "72" in str(e) or "bytes" in str(e).lower():
            raise HTTPException(status_code=400, detail="密码校验异常，请确认密码长度正常") from e
        raise
    if not admin:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token(sub=str(admin.id), role="admin")
    is_super = getattr(admin, "is_super_admin", 0) == 1
    activity_types = _admin_activity_types_for_response(db, admin.id)
    return LoginResponse(
        access_token=token,
        is_super_admin=is_super,
        activity_types=[ActivityTypeItem(**t) for t in activity_types],
    )


@router.post("/user-login", response_model=UserLoginResponse)
def user_login(
    request: Request,
    body: UserLoginRequest,
    db: Session = Depends(deps.get_db),
):
    """普通用户登录：手机号 + 密码"""
    _enforce_https_and_rate_limit(request)
    _check_password_length(body.password)
    user = crud_user.authenticate_user(db, body.phone.strip(), body.password)
    if not user:
        raise HTTPException(status_code=401, detail="手机号或密码错误")
    if user.isblock == 1:
        reason = user.block_reason or "账号已被禁用"
        raise HTTPException(status_code=403, detail=f"账号已被拉黑：{reason}")
    token = create_access_token(sub=str(user.id), role="user")
    return UserLoginResponse(
        access_token=token,
        user_id=user.id,
        user_name=user.name or "",
    )


class WeChatLoginRequest(BaseModel):
    """微信小程序授权登录：wx.login() 得到的 code"""
    code: str


def _wechat_code2session(code: str) -> dict:
    """调用微信 jscode2session，返回 openid、session_key 或抛出 HTTPException"""
    appid = settings.WECHAT_APPID
    secret = settings.WECHAT_SECRET
    if not appid or not secret:
        raise HTTPException(
            status_code=503,
            detail="服务未配置微信登录，请设置 WECHAT_APPID 与 WECHAT_SECRET",
        )
    url = (
        f"https://api.weixin.qq.com/sns/jscode2session"
        f"?appid={appid}&secret={secret}&js_code={code}&grant_type=authorization_code"
    )
    try:
        req = UrllibRequest(url, method="GET")
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except (HTTPError, URLError, json.JSONDecodeError) as e:
        logger.exception("wechat jscode2session error: %s", e)
        raise HTTPException(status_code=502, detail="微信服务暂时不可用，请稍后重试")
    errcode = data.get("errcode", 0)
    if errcode != 0:
        errmsg = data.get("errmsg", "unknown")
        detail = f"微信登录失败：{errmsg}"
        if errcode == 40029 or "invalid code" in (errmsg or "").lower():
            detail += "。请检查：① 后端 .env 中 WECHAT_APPID 是否与小程序 project.config.json 的 appid 一致；② 每个 code 仅能使用一次且约 5 分钟有效，请勿重复点击或重试过久。"
        raise HTTPException(status_code=400, detail=detail)
    openid = data.get("openid")
    if not openid:
        raise HTTPException(status_code=400, detail="微信未返回 openid")
    return data


@router.post("/wechat-login", response_model=UserLoginResponse)
def wechat_login(
    request: Request,
    body: WeChatLoginRequest,
    db: Session = Depends(deps.get_db),
):
    """微信小程序授权登录：用 code 换 openid，自动注册或登录为普通用户"""
    _check_login_rate_limit(_get_client_ip(request))
    code = (body.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="缺少 code")
    data = _wechat_code2session(code)
    openid = data["openid"]
    user = crud_user.get_or_create_user_wechat(db, openid, nickname=None)
    if user.isblock == 1:
        reason = user.block_reason or "账号已被禁用"
        raise HTTPException(status_code=403, detail=f"账号已被拉黑：{reason}")
    token = create_access_token(sub=str(user.id), role="user")
    return UserLoginResponse(
        access_token=token,
        user_id=user.id,
        user_name=user.name or "微信用户",
    )
