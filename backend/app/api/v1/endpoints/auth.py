import logging
import time
from collections import defaultdict
from urllib.request import urlopen, Request as UrllibRequest
from urllib.error import HTTPError, URLError
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud import crud_credential, crud_user, crud_tenant, crud_rbac
from app.core.security import create_access_token, BCRYPT_MAX_BYTES
from app.models.auth import (
    LoginRequest, LoginResponse, WechatAuthRequest, WechatAuthResponse,
    SetPasswordRequest, UserInfo, TenantInfo, AuthInfo, ActivityTypeInfo,
)
from app.schemas import ActivityType, User

logger = logging.getLogger(__name__)
router = APIRouter()

_login_attempts: dict[str, list[float]] = defaultdict(list)
_wechat_access_token_cache: dict[str, dict] = {}


# ============================================================
# 通用工具函数
# ============================================================

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
        raise HTTPException(status_code=429, detail=f"登录尝试过于频繁，请 {window} 秒后再试")
    _login_attempts[ip].append(now)


def _enforce_https_and_rate_limit(request: Request) -> None:
    if settings.REQUIRE_HTTPS_FOR_LOGIN and not _is_https(request):
        raise HTTPException(status_code=403, detail="登录仅支持 HTTPS，请使用安全连接")
    _check_login_rate_limit(_get_client_ip(request))


def _check_password_length(password: str) -> None:
    if len(password.encode("utf-8")) > BCRYPT_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"密码长度不能超过 {BCRYPT_MAX_BYTES} 字节")


def _build_auth_info(db: Session, user_id: int, tenant_id: int) -> AuthInfo:
    """构建统一的 auth 信息"""
    user_roles = crud_rbac.get_user_roles(db, user_id, tenant_id)
    is_admin = len(user_roles) > 0
    is_platform_admin = any(r.role_id == deps.PLATFORM_ADMIN_ROLE_ID for r in user_roles)
    is_super = any(ur.scope_type is None for ur in user_roles)
    permissions = crud_rbac.get_user_permissions(db, user_id, tenant_id) if is_admin else []

    activity_types: list[ActivityTypeInfo] = []
    if is_admin and not is_super:
        type_ids = {ur.scope_id for ur in user_roles if ur.scope_type == "activity_type" and ur.scope_id}
        if type_ids:
            types = db.query(ActivityType).filter(
                ActivityType.id.in_(type_ids),
                ActivityType.tenant_id == tenant_id,
            ).all()
            activity_types = [ActivityTypeInfo(id=t.id, name=t.type_name, code=t.code) for t in types]

    # must_reset_password 从凭证读取
    from app.schemas import UserCredential
    pwd_cred = db.query(UserCredential).filter(
        UserCredential.user_id == user_id,
        UserCredential.tenant_id == tenant_id,
        UserCredential.credential_type == "password",
        UserCredential.status == 1,
    ).first()
    must_reset = bool(pwd_cred.must_reset_password) if pwd_cred else False

    return AuthInfo(
        is_admin=is_admin,
        is_platform_admin=is_platform_admin,
        is_super_admin=is_super,
        permissions=permissions,
        activity_types=activity_types,
        must_reset_password=must_reset,
    )


# ============================================================
# POST /auth/login — 统一密码登录
# ============================================================

@router.post("/login", response_model=LoginResponse)
def login(request: Request, body: LoginRequest, db: Session = Depends(deps.get_db)):
    _enforce_https_and_rate_limit(request)
    _check_password_length(body.password)

    # 判断是平台管理员还是租户用户
    is_platform = body.tenant_code.lower() in ("platform", "")
    tenant_id = 0 if is_platform else None
    tenant_info: TenantInfo | None = None

    if not is_platform:
        tenant = crud_tenant.get_tenant_by_code(db, body.tenant_code)
        if not tenant:
            raise HTTPException(status_code=400, detail="租户不存在")
        if tenant.status != 1:
            raise HTTPException(status_code=403, detail="租户已禁用或已过期")
        tenant_id = tenant.id
        tenant_info = TenantInfo(id=tenant.id, name=tenant.name, code=tenant.code)

    cred = crud_credential.authenticate_by_password(db, tenant_id, body.identifier, body.password)
    if not cred:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    user = db.query(User).filter(User.id == cred.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if hasattr(user, 'isblock') and user.isblock == 1:
        raise HTTPException(status_code=403, detail=f"账号已被拉黑：{user.block_reason or '账号已被禁用'}")

    auth_info = _build_auth_info(db, user.id, tenant_id)
    token = create_access_token(user.id, tenant_id)

    return LoginResponse(
        access_token=token,
        user=UserInfo(id=user.id, name=user.name, phone=user.phone),
        tenant=tenant_info,
        auth=auth_info,
    )


# ============================================================
# POST /auth/wechat — 统一微信认证
# ============================================================

# --- PLACEHOLDER_WECHAT ---


def _wechat_code2session(code: str) -> dict:
    appid = settings.WECHAT_APPID
    secret = settings.WECHAT_SECRET
    if not appid or not secret:
        raise HTTPException(status_code=503, detail="服务未配置微信登录，请设置 WECHAT_APPID 与 WECHAT_SECRET")
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
    if not data.get("openid"):
        raise HTTPException(status_code=400, detail="微信未返回 openid")
    return data


def _get_wechat_access_token() -> str:
    appid = settings.WECHAT_APPID
    secret = settings.WECHAT_SECRET
    if not appid or not secret:
        raise HTTPException(status_code=503, detail="服务未配置微信登录，请设置 WECHAT_APPID 与 WECHAT_SECRET")
    cache_key = f"token_{appid}"
    cached = _wechat_access_token_cache.get(cache_key, {})
    if cached.get("token") and cached.get("expire_time", 0) > time.time() + 300:
        return cached["token"]
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={appid}&secret={secret}"
    try:
        req = UrllibRequest(url, method="GET")
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except (HTTPError, URLError, json.JSONDecodeError) as e:
        logger.exception("wechat get access_token error: %s", e)
        raise HTTPException(status_code=502, detail="微信服务暂时不可用，请稍后重试")
    if data.get("errcode", 0) != 0:
        raise HTTPException(status_code=500, detail=f"获取微信 access_token 失败：{data.get('errmsg', 'unknown')}")
    access_token = data.get("access_token")
    expires_in = data.get("expires_in", 7200)
    _wechat_access_token_cache[cache_key] = {"token": access_token, "expire_time": time.time() + expires_in}
    return access_token


def _get_phone_number_from_wechat(code: str) -> str:
    access_token = _get_wechat_access_token()
    url = f"https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token={access_token}"
    try:
        req = UrllibRequest(
            url, data=json.dumps({"code": code}).encode("utf-8"),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except (HTTPError, URLError, json.JSONDecodeError) as e:
        logger.exception("wechat get phone number error: %s", e)
        raise HTTPException(status_code=502, detail="微信服务暂时不可用，请稍后重试")
    if data.get("errcode", 0) != 0:
        errmsg = data.get("errmsg", "unknown")
        detail = f"获取手机号失败：{errmsg}"
        if data.get("errcode") == 40029:
            detail = "code 无效或已过期，请重新授权"
        raise HTTPException(status_code=400, detail=detail)
    phone_info = data.get("phone_info", {})
    phone = phone_info.get("purePhoneNumber") or phone_info.get("phoneNumber", "")
    if phone.startswith("+86"):
        phone = phone[3:]
    if not phone:
        raise HTTPException(status_code=400, detail="微信未返回手机号")
    return phone


# --- PLACEHOLDER_WECHAT_ENDPOINT ---


@router.post("/wechat", response_model=WechatAuthResponse)
def wechat_auth(request: Request, body: WechatAuthRequest, db: Session = Depends(deps.get_db)):
    """统一微信认证（openid 模式 / phone 模式）"""
    _check_login_rate_limit(_get_client_ip(request))
    code = (body.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="缺少 code")

    tenant = crud_tenant.get_tenant_by_code(db, body.tenant_code)
    if not tenant or tenant.status != 1:
        raise HTTPException(status_code=400, detail="租户不存在或已禁用")

    phone: str | None = None
    wechat_payment_ready = False
    wechat_payment_hint: str | None = None

    if body.mode == "phone":
        phone = _get_phone_number_from_wechat(code)
        user = crud_user.get_or_create_user_by_phone(db, phone, tenant.id)
        crud_credential.get_or_create_phone_credential(db, user.id, tenant.id, phone)
        wechat_payment_ready = bool(crud_credential.get_wechat_openid(db, user.id, tenant.id))

        login_code = (body.login_code or "").strip()
        if login_code:
            existing_openid = crud_credential.get_wechat_openid(db, user.id, tenant.id)
            try:
                session_data = _wechat_code2session(login_code)
                openid = session_data.get("openid")
                if openid:
                    crud_credential.bind_wechat_credential(db, user.id, tenant.id, openid)
                db.commit()
                wechat_payment_ready = bool(crud_credential.get_wechat_openid(db, user.id, tenant.id))
            except Exception as exc:
                db.rollback()
                user = crud_user.get_or_create_user_by_phone(db, phone, tenant.id)
                logger.exception("手机号登录刷新 openid 失败: %s", exc)
                wechat_payment_ready = bool(existing_openid)
                wechat_payment_hint = "本次微信支付绑定刷新失败，如需支付请重新登录后再试"
        elif not wechat_payment_ready:
            wechat_payment_hint = "当前账号尚未完成微信支付绑定，如需支付请使用手机号一键登录"
    else:
        data = _wechat_code2session(code)
        openid = data["openid"]
        user = crud_user.get_or_create_user_wechat(db, openid, tenant.id, nickname=None)
        crud_credential.bind_wechat_credential(db, user.id, tenant.id, openid)
        db.commit()
        wechat_payment_ready = bool(crud_credential.get_wechat_openid(db, user.id, tenant.id))

    db.commit()

    if user.isblock == 1:
        raise HTTPException(status_code=403, detail=f"账号已被拉黑：{user.block_reason or '账号已被禁用'}")

    is_first_login = crud_user.is_user_profile_incomplete(db, user.id, tenant.id)
    auth_info = _build_auth_info(db, user.id, tenant.id)
    token = create_access_token(user.id, tenant.id)

    return WechatAuthResponse(
        access_token=token,
        user=UserInfo(id=user.id, name=user.name, phone=user.phone),
        tenant=TenantInfo(id=tenant.id, name=tenant.name, code=tenant.code),
        auth=auth_info,
        is_first_login=is_first_login,
        require_bind_info=is_first_login,
        phone=phone,
        wechat_payment_ready=wechat_payment_ready,
        wechat_payment_hint=wechat_payment_hint,
    )


# ============================================================
# POST /auth/set-password — 修改密码
# ============================================================

@router.post("/set-password")
def set_password(
    request: Request,
    body: SetPasswordRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _check_password_length(body.password)
    crud_credential.update_password(db, ctx.user_id, ctx.tenant_id, body.password)
    db.commit()
    return {"status": "success", "message": "密码设置成功"}


# 向后兼容旧端点名
@router.post("/set-admin-password")
def set_admin_password(
    request: Request,
    body: SetPasswordRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _check_password_length(body.password)
    crud_credential.update_password(db, ctx.user_id, ctx.tenant_id, body.password)
    db.commit()
    return {"status": "success", "message": "密码设置成功"}


# ============================================================
# GET /auth/me — 获取当前用户信息
# ============================================================

@router.get("/me", response_model=LoginResponse)
def get_me(db: Session = Depends(deps.get_db), ctx: deps.AuthContext = Depends(deps.get_current_user)):
    user = db.query(User).filter(User.id == ctx.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")

    tenant_info = None
    if ctx.tenant_id and ctx.tenant_id > 0:
        tenant = crud_tenant.get_tenant(db, ctx.tenant_id)
        if tenant:
            tenant_info = TenantInfo(id=tenant.id, name=tenant.name, code=tenant.code)

    auth_info = _build_auth_info(db, user.id, ctx.tenant_id)
    return LoginResponse(
        access_token="",
        user=UserInfo(id=user.id, name=user.name, phone=user.phone),
        tenant=tenant_info,
        auth=auth_info,
    )
