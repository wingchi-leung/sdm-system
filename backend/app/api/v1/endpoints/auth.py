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
from app.crud import crud_admin, crud_user, crud_tenant
from app.core.security import create_access_token, BCRYPT_MAX_BYTES
from app.models.user import UserLoginRequest, UserLoginResponse, WechatLoginResponse
from app.schemas import ActivityType

logger = logging.getLogger(__name__)
router = APIRouter()

_login_attempts: dict[str, list[float]] = defaultdict(list)

# 微信 access_token 缓存
_wechat_access_token_cache: dict[str, dict] = {}


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
    tenant_code: str = "default"


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
    tenant_id: int
    tenant_name: str
    is_super_admin: bool = True
    activity_types: list[ActivityTypeItem] = []


def _admin_activity_types_for_response(db: Session, admin_id: int, tenant_id: int) -> list[dict]:
    """返回该管理员可管理的活动类型列表"""
    is_super, allowed_ids = crud_admin.get_admin_scope(db, admin_id, tenant_id)
    if is_super or not allowed_ids:
        return []
    types = db.query(ActivityType).filter(
        ActivityType.id.in_(allowed_ids),
        ActivityType.tenant_id == tenant_id
    ).all()
    return [{"id": t.id, "name": t.type_name, "code": t.code} for t in types]


@router.post("/login", response_model=LoginResponse)
def login(
    request: Request,
    body: LoginRequest,
    db: Session = Depends(deps.get_db),
):
    """管理员登录"""
    _enforce_https_and_rate_limit(request)
    _check_password_length(body.password)
    
    tenant = crud_tenant.get_tenant_by_code(db, body.tenant_code)
    if not tenant:
        raise HTTPException(status_code=400, detail="租户不存在")
    if tenant.status != 1:
        raise HTTPException(status_code=403, detail="租户已禁用或已过期")
    
    try:
        admin = crud_admin.authenticate_admin(db, body.username, body.password, tenant.id)
    except ValueError as e:
        if "72" in str(e) or "bytes" in str(e).lower():
            raise HTTPException(status_code=400, detail="密码校验异常，请确认密码长度正常") from e
        raise
    
    if not admin:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    
    token = create_access_token(sub=str(admin.id), role="admin", tenant_id=tenant.id)
    is_super = getattr(admin, "is_super_admin", 0) == 1
    activity_types = _admin_activity_types_for_response(db, admin.id, tenant.id)
    
    return LoginResponse(
        access_token=token,
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        is_super_admin=is_super,
        activity_types=[ActivityTypeItem(**t) for t in activity_types],
    )


@router.post("/user-login", response_model=UserLoginResponse)
def user_login(
    request: Request,
    body: UserLoginRequest,
    db: Session = Depends(deps.get_db),
):
    """普通用户登录"""
    _enforce_https_and_rate_limit(request)
    _check_password_length(body.password)
    
    tenant_code = getattr(body, 'tenant_code', None) or 'default'
    tenant = crud_tenant.get_tenant_by_code(db, tenant_code)
    if not tenant or tenant.status != 1:
        raise HTTPException(status_code=400, detail="租户不存在或已禁用")
    
    user = crud_user.authenticate_user(db, body.phone.strip(), body.password, tenant.id)
    if not user:
        raise HTTPException(status_code=401, detail="手机号或密码错误")
    if user.isblock == 1:
        reason = user.block_reason or "账号已被禁用"
        raise HTTPException(status_code=403, detail=f"账号已被拉黑：{reason}")
    
    token = create_access_token(sub=str(user.id), role="user", tenant_id=tenant.id)
    return UserLoginResponse(
        access_token=token,
        user_id=user.id,
        user_name=user.name or "",
    )


class WeChatLoginRequest(BaseModel):
    code: str
    tenant_code: str = "default"


def _wechat_code2session(code: str) -> dict:
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
            detail += "。请检查小程序配置。"
        raise HTTPException(status_code=400, detail=detail)
    openid = data.get("openid")
    if not openid:
        raise HTTPException(status_code=400, detail="微信未返回 openid")
    return data


@router.post("/wechat-login", response_model=WechatLoginResponse)
def wechat_login(
    request: Request,
    body: WeChatLoginRequest,
    db: Session = Depends(deps.get_db),
):
    """微信小程序授权登录"""
    _check_login_rate_limit(_get_client_ip(request))
    code = (body.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="缺少 code")

    data = _wechat_code2session(code)
    openid = data["openid"]

    tenant = crud_tenant.get_tenant_by_code(db, body.tenant_code)
    if not tenant or tenant.status != 1:
        raise HTTPException(status_code=400, detail="租户不存在或已禁用")

    user = crud_user.get_or_create_user_wechat(db, openid, tenant.id, nickname=None)
    if user.isblock == 1:
        reason = user.block_reason or "账号已被禁用"
        raise HTTPException(status_code=403, detail=f"账号已被拉黑：{reason}")

    token = create_access_token(sub=str(user.id), role="user", tenant_id=tenant.id)

    # 判断是否首次登录（检查关键信息是否完整）
    is_first_login = crud_user.is_user_profile_incomplete(db, user.id, tenant.id)

    # 获取会员信息
    member_type_id = user.member_type_id
    member_type_name = None
    member_expire_at = user.member_expire_at
    
    if member_type_id:
        from app.schemas import MemberType
        member_type = db.query(MemberType).filter(MemberType.id == member_type_id).first()
        if member_type:
            member_type_name = member_type.name

    return WechatLoginResponse(
        access_token=token,
        user_id=user.id,
        user_name=user.name or "微信用户",
        is_first_login=is_first_login,
        require_bind_info=is_first_login,
        member_type_id=member_type_id,
        member_type_name=member_type_name,
        member_expire_at=member_expire_at,
    )


def _get_wechat_access_token() -> str:
    """获取微信 access_token（带缓存，有效期 2 小时）"""
    appid = settings.WECHAT_APPID
    secret = settings.WECHAT_SECRET
    if not appid or not secret:
        raise HTTPException(
            status_code=503,
            detail="服务未配置微信登录，请设置 WECHAT_APPID 与 WECHAT_SECRET",
        )

    # 检查缓存
    cache_key = f"token_{appid}"
    cached = _wechat_access_token_cache.get(cache_key, {})
    if cached.get("token") and cached.get("expire_time", 0) > time.time() + 300:
        return cached["token"]

    # 请求新的 access_token
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={appid}&secret={secret}"
    try:
        req = UrllibRequest(url, method="GET")
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except (HTTPError, URLError, json.JSONDecodeError) as e:
        logger.exception("wechat get access_token error: %s", e)
        raise HTTPException(status_code=502, detail="微信服务暂时不可用，请稍后重试")

    errcode = data.get("errcode", 0)
    if errcode != 0:
        errmsg = data.get("errmsg", "unknown")
        raise HTTPException(status_code=500, detail=f"获取微信 access_token 失败：{errmsg}")

    access_token = data.get("access_token")
    expires_in = data.get("expires_in", 7200)

    # 缓存 token
    _wechat_access_token_cache[cache_key] = {
        "token": access_token,
        "expire_time": time.time() + expires_in,
    }

    return access_token


def _get_phone_number_from_wechat(code: str) -> str:
    """通过微信 code 获取用户手机号"""
    access_token = _get_wechat_access_token()
    url = f"https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token={access_token}"

    try:
        req = UrllibRequest(
            url,
            data=json.dumps({"code": code}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except (HTTPError, URLError, json.JSONDecodeError) as e:
        logger.exception("wechat get phone number error: %s", e)
        raise HTTPException(status_code=502, detail="微信服务暂时不可用，请稍后重试")

    errcode = data.get("errcode", 0)
    if errcode != 0:
        errmsg = data.get("errmsg", "unknown")
        detail = f"获取手机号失败：{errmsg}"
        if errcode == 40029:
            detail = "code 无效或已过期，请重新授权"
        raise HTTPException(status_code=400, detail=detail)

    phone_info = data.get("phone_info", {})
    phone = phone_info.get("phoneNumber") or phone_info.get("purePhoneNumber")
    if not phone:
        raise HTTPException(status_code=400, detail="微信未返回手机号")

    return phone


class PhoneLoginRequest(BaseModel):
    code: str
    tenant_code: str = "default"


@router.post("/phone-login", response_model=WechatLoginResponse)
def phone_login(
    request: Request,
    body: PhoneLoginRequest,
    db: Session = Depends(deps.get_db),
):
    """手机号授权登录"""
    _check_login_rate_limit(_get_client_ip(request))
    code = (body.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="缺少 code")

    # 获取手机号
    phone = _get_phone_number_from_wechat(code)

    tenant = crud_tenant.get_tenant_by_code(db, body.tenant_code)
    if not tenant or tenant.status != 1:
        raise HTTPException(status_code=400, detail="租户不存在或已禁用")

    # 查找或创建用户
    user = crud_user.get_or_create_user_by_phone(db, phone, tenant.id)
    if user.isblock == 1:
        reason = user.block_reason or "账号已被禁用"
        raise HTTPException(status_code=403, detail=f"账号已被拉黑：{reason}")

    token = create_access_token(sub=str(user.id), role="user", tenant_id=tenant.id)

    # 判断是否首次登录
    is_first_login = crud_user.is_user_profile_incomplete(db, user.id, tenant.id)

    return WechatLoginResponse(
        access_token=token,
        user_id=user.id,
        user_name=user.name or f"用户{phone[-4:]}",
        is_first_login=is_first_login,
        require_bind_info=is_first_login,
    )