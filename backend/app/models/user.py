import re
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional


class UserBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    identity_number: Optional[str] = Field(None, max_length=255)
    identity_type: Optional[str] = Field(None, pattern=r'^(mainland|hongkong|taiwan|foreign)$')
    phone: Optional[str] = Field(None, max_length=11)
    email: Optional[str] = Field(None, max_length=255)
    sex: Optional[str] = Field(None, max_length=2, pattern=r'^[MF]$')
    isblock: int = Field(0, ge=0, le=1, description="0-正常 1-拉黑")
    block_reason: Optional[str] = Field(None, max_length=255)

    @field_validator('phone')
    @classmethod
    def phone_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        phone = v.strip()
        if not re.match(r'^1[3-9]\d{9}$', phone):
            raise ValueError('手机号格式不正确，请输入有效的中国手机号')
        return phone

    @field_validator('identity_number')
    @classmethod
    def identity_number_format(cls, v: Optional[str], info) -> Optional[str]:
        if v is None or not v.strip():
            return None
        identity_number = v.strip()
        identity_type = info.data.get('identity_type')

        if identity_type == 'mainland':
            # 中国大陆身份证：18位，最后一位可以是X
            if not re.match(r'^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$', identity_number):
                raise ValueError('身份证号格式不正确，请输入有效的18位中国大陆身份证号')
        elif identity_type == 'hongkong':
            # 香港身份证：格式如 A123456(7)
            if not re.match(r'^[A-Z]\d{6}\(\d\)$', identity_number):
                raise ValueError('香港身份证号格式不正确，正确格式如：A123456(7)')
        elif identity_type == 'taiwan':
            # 台湾身份证：10位，首位字母+9位数字
            if not re.match(r'^[A-Z]\d{9}$', identity_number):
                raise ValueError('台湾身份证号格式不正确，应为10位（1位字母+9位数字）')
        # foreign 类型不做严格格式限制，只做基本验证
        elif identity_type == 'foreign':
            if len(identity_number) < 5 or len(identity_number) > 50:
                raise ValueError('证件号码长度应在5-50位之间')
        else:
            # 未指定类型时，做基本长度验证
            if len(identity_number) < 5 or len(identity_number) > 50:
                raise ValueError('证件号码长度应在5-50位之间')

        return identity_number


class UserCreate(UserBase):
    pass


class RegisterRequest(BaseModel):
    """用户注册：姓名、手机、密码必填，邮箱选填"""
    name: str = Field(..., min_length=1, max_length=255)
    phone: str = Field(..., min_length=11, max_length=11)
    password: str = Field(..., min_length=6, max_length=64)
    email: Optional[str] = Field(None, max_length=255)

    @field_validator('email')
    @classmethod
    def email_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        pattern = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
        if not re.match(pattern, v.strip()):
            raise ValueError('邮箱格式不正确')
        return v.strip()

    @field_validator('phone')
    @classmethod
    def phone_format(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('手机号不能为空')
        phone = v.strip()
        if not re.match(r'^1[3-9]\d{9}$', phone):
            raise ValueError('手机号格式不正确，请输入有效的中国手机号')
        return phone

    @field_validator('name')
    @classmethod
    def name_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('姓名不能为空')
        return v.strip()


class UserLoginRequest(BaseModel):
    """普通用户登录：手机 + 密码"""
    phone: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=64)


class UserLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "user"
    user_id: int
    user_name: str


class UserResponse(UserBase):
    id: int
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True


class UserList(BaseModel):
    id: int
    name: str
    identity_number: str
    phone: str | None = None
    sex: str | None = None
    isblock: int = 0
    block_reason: str | None = None

    class Config:
        orm_mode = True


class WechatLoginResponse(BaseModel):
    """微信登录响应"""
    access_token: str
    token_type: str = "bearer"
    role: str = "user"
    user_id: int
    user_name: str
    is_first_login: bool = False
    require_bind_info: bool = False


class UserBindInfoRequest(BaseModel):
    """用户信息绑定请求"""
    name: str = Field(..., min_length=1, max_length=255)
    sex: str = Field(..., pattern=r'^(male|female|other)$')
    age: int = Field(..., ge=0, le=150)
    occupation: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=11, max_length=11)
    email: Optional[str] = Field(None, max_length=255)
    industry: str = Field(..., min_length=1, max_length=100)
    identity_number: Optional[str] = Field(None, max_length=255)
    identity_type: Optional[str] = Field(None, pattern=r'^(mainland|hongkong|taiwan|foreign)$')

    @field_validator('email')
    @classmethod
    def email_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        pattern = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
        if not re.match(pattern, v.strip()):
            raise ValueError('邮箱格式不正确')
        return v.strip()

    @field_validator('phone')
    @classmethod
    def phone_format(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('手机号不能为空')
        if not re.match(r'^1[3-9]\d{9}$', v.strip()):
            raise ValueError('手机号格式不正确')
        return v.strip()

    @field_validator('identity_number')
    @classmethod
    def identity_number_format(cls, v: Optional[str], info) -> Optional[str]:
        if v is None or not v.strip():
            return None
        identity_number = v.strip()
        identity_type = info.data.get('identity_type')

        if identity_type == 'mainland':
            # 中国大陆身份证：18位，最后一位可以是X
            if not re.match(r'^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$', identity_number):
                raise ValueError('身份证号格式不正确，请输入有效的18位中国大陆身份证号')
        elif identity_type == 'hongkong':
            # 香港身份证：格式如 A123456(7)
            if not re.match(r'^[A-Z]\d{6}\(\d\)$', identity_number):
                raise ValueError('香港身份证号格式不正确，正确格式如：A123456(7)')
        elif identity_type == 'taiwan':
            # 台湾身份证：10位，首位字母+9位数字
            if not re.match(r'^[A-Z]\d{9}$', identity_number):
                raise ValueError('台湾身份证号格式不正确，应为10位（1位字母+9位数字）')
        # foreign 类型不做严格格式限制，只做基本验证
        elif identity_type == 'foreign':
            if len(identity_number) < 5 or len(identity_number) > 50:
                raise ValueError('证件号码长度应在5-50位之间')
        else:
            # 未指定类型时，做基本长度验证
            if len(identity_number) < 5 or len(identity_number) > 50:
                raise ValueError('证件号码长度应在5-50位之间')

        return identity_number


class UserBindInfoResponse(BaseModel):
    """用户信息绑定响应"""
    success: bool
    message: str = ""


class AdminUserListItem(BaseModel):
    """管理员列表项（用于超级管理员查看）"""
    id: int
    tenant_id: int
    username: str
    is_super_admin: int = 0

    class Config:
        from_attributes = True


class UserListItemForAdmin(BaseModel):
    """用户列表项（用于超级管理员查看）"""
    id: int
    tenant_id: int
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    sex: str | None = None
    age: int | None = None
    occupation: str | None = None
    industry: str | None = None
    isblock: int = 0
    block_reason: str | None = None
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True


class UserListForAdminResponse(BaseModel):
    """用户列表响应（超级管理员查看）"""
    items: list[UserListItemForAdmin]
    total: int
    skip: int
    limit: int