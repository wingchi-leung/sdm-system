import re
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List


class ParticipantBase(BaseModel):
    activity_id: Optional[int] = Field(None)
    user_id: Optional[int] = Field(None)
    participant_name: str = Field(..., max_length=255)
    phone: str = Field(..., min_length=11, max_length=11)
    identity_number: Optional[str] = Field(None, max_length=255)
    identity_type: Optional[str] = Field(None, pattern=r'^(mainland|hongkong|taiwan|foreign)$')
    enroll_status: Optional[int] = Field(None, ge=1, le=2, description="报名状态：1-已报名 2-候补")
    # 用户信息字段（从用户资料获取）
    sex: Optional[str] = Field(None, max_length=2)
    age: Optional[int] = Field(None, ge=0, le=150)
    occupation: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    industry: Optional[str] = Field(None, max_length=100)
    # 问卷字段
    why_join: Optional[str] = Field(None, max_length=500)
    channel: Optional[str] = Field(None, max_length=255)
    expectation: Optional[str] = Field(None, max_length=500)
    activity_understanding: Optional[str] = Field(None, max_length=255)
    has_questions: Optional[str] = Field(None, max_length=500)

    @field_validator('phone')
    @classmethod
    def phone_format(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('手机号不能为空')
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


class ParticipantCreate(ParticipantBase):
    pass


class ParticipantResponse(ParticipantBase):
    id: int
    payment_status: Optional[int] = Field(None, description="支付状态：0-无需支付 1-待支付 2-已支付")
    payment_order_id: Optional[int] = Field(None, description="支付订单ID")
    paid_amount: Optional[int] = Field(None, description="实际支付金额（分）")
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True


class ParticipantListResponse(BaseModel):
    items: List[ParticipantResponse]
    total: int
