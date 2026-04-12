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
from app.crud import crud_auth, crud_user, crud_tenant, crud_rbac
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


def _admin_activity_types_for_response(db: Session, user_id: int, tenant_id: int) -> list[dict]:
    """返回该管理员可管理的活动类型列表（基于 RBAC）"""
    # 获取用户的所有角色
    user_roles = crud_rbac.get_user_roles(db, user_id, tenant_id)

    # 收集所有活动类型范围
    activity_type_ids = set()
    has_global = False

    for ur in user_roles:
        if ur.scope_type is None:
            has_global = True
            break
        if ur.scope_type == 'activity_type' and ur.scope_id:
            activity_type_ids.add(ur.scope_id)

    # 全局权限返回空列表
    if has_global or not activity_type_ids:
        return []

    # 查询活动类型
    types = db.query(ActivityType).filter(
        ActivityType.id.in_(activity_type_ids),
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
        admin = crud_auth.authenticate_admin(db, body.username, body.password, tenant.id)
    except ValueError as e:
        if "72" in str(e) or "bytes" in str(e).lower():
            raise HTTPException(status_code=400, detail="密码校验异常，请确认密码长度正常") from e
        raise

    if not admin:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    # 检查用户是否有管理员权限
    user_roles = crud_rbac.get_user_roles(db, admin.user_id, tenant.id)
    if not user_roles:
        raise HTTPException(status_code=403, detail="该用户没有管理员权限")

    # 判断是否为超级管理员（拥有全局角色）
    is_super = any(ur.scope_type is None for ur in user_roles)

    token = create_access_token(sub=str(admin.user_id), role="admin", tenant_id=tenant.id)
    activity_types = _admin_activity_types_for_response(db, admin.user_id, tenant.id)
    
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

    return WechatLoginResponse(
        access_token=token,
        user_id=user.id,
        user_name=user.name or "微信用户",
        is_first_login=is_first_login,
        require_bind_info=is_first_login,
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
    # 优先取 purePhoneNumber（纯11位），phoneNumber 含 +86 前缀会导致前端校验失败
    phone = phone_info.get("purePhoneNumber") or phone_info.get("phoneNumber", "")
    # 如果仍带区号前缀（如 +8613xxxxxxxxx），去掉前缀只保留11位
    if phone.startswith("+86"):
        phone = phone[3:]
    if not phone:
        raise HTTPException(status_code=400, detail="微信未返回手机号")

    return phone


class PhoneLoginRequest(BaseModel):
    code: str
    tenant_code: str = "default"
    login_code: Optional[str] = None  # wx.login 返回的 code，用于换取 openid 以支持微信支付


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

    # 如果传了 login_code 且用户尚未绑定 openid，换取 openid 并保存
    login_code = (body.login_code or "").strip()
    if login_code and not user.wx_openid:
        try:
            session_data = _wechat_code2session(login_code)
            openid = session_data.get("openid")
            if openid:
                user.wx_openid = openid
                db.commit()
        except Exception:
            # openid 获取失败不阻断登录流程，仅支付时会受影响
            pass

    token = create_access_token(sub=str(user.id), role="user", tenant_id=tenant.id)

    # 判断是否首次登录
    is_first_login = crud_user.is_user_profile_incomplete(db, user.id, tenant.id)

    return WechatLoginResponse(
        access_token=token,
        user_id=user.id,
        user_name=user.name or f"用户{phone[-4:]}",
        is_first_login=is_first_login,
        require_bind_info=is_first_login,
        phone=phone,
    )