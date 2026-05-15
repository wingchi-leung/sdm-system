from pydantic import BaseModel, model_validator
from typing import Optional


class UserInfo(BaseModel):
    id: int
    name: str | None = None
    phone: str | None = None


class TenantInfo(BaseModel):
    id: int
    name: str
    code: str


class ActivityTypeInfo(BaseModel):
    id: int
    name: str
    code: str | None = None

    class Config:
        from_attributes = True


class AuthInfo(BaseModel):
    is_admin: bool = False
    is_platform_admin: bool = False
    is_super_admin: bool = False
    permissions: list[str] = []
    activity_types: list[ActivityTypeInfo] = []
    must_reset_password: bool = False


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo
    tenant: TenantInfo | None = None
    auth: AuthInfo


class WechatAuthResponse(LoginResponse):
    is_first_login: bool = False
    require_bind_info: bool = False
    phone: str | None = None
    wechat_payment_ready: bool = False
    wechat_payment_hint: str | None = None


class LoginRequest(BaseModel):
    identifier: str
    password: str
    tenant_code: str = "default"

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_username(cls, data):
        if isinstance(data, dict) and "identifier" not in data and "username" in data:
            return {**data, "identifier": data.get("username")}
        return data


class WechatAuthRequest(BaseModel):
    code: str
    tenant_code: str = "default"
    mode: str = "openid"
    login_code: str | None = None


class SetPasswordRequest(BaseModel):
    password: str
