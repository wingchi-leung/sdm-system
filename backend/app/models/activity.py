from pydantic import BaseModel, Field, field_serializer
from datetime import datetime
from typing import Optional, List
from .participant import ParticipantBase
from app.core.pii import mask_email, mask_identity_number, mask_name, mask_phone


class ActivityBase(BaseModel):
    activity_name: str = Field(..., min_length=1, max_length=100)
    activity_type_id: Optional[int] = None
    activity_type_name: Optional[str] = Field(None, max_length=50)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: int = Field(1, ge=1, le=3, description="1-未开始，2-进行中，3-已结束")
    tag: Optional[str] = None
    suggested_fee: int = Field(0, ge=0, description="建议费用（分），0表示免费")
    require_payment: int = Field(0, ge=0, le=1, description="是否需要支付：0-否 1-是")
    poster_url: Optional[str] = Field(None, max_length=500, description="活动海报图片URL")
    location: Optional[str] = Field(None, max_length=255, description="活动地点，为空表示线上活动")
    max_participants: Optional[int] = Field(None, ge=1, description="最大参与人数，NULL表示无限制")
    is_public: int = Field(0, ge=0, le=1, description="是否公开：0-否 1-是（所有用户可见）")


class ActivityCreate(BaseModel):
    activity_name: str
    tag: Optional[str] = ""
    start_time: datetime
    participants: list[ParticipantBase] = []
    activity_type_id: Optional[int] = None
    activity_type_name: Optional[str] = Field(None, max_length=50)
    suggested_fee: int = Field(0, ge=0, description="建议费用（分），0表示免费")
    require_payment: int = Field(0, ge=0, le=1, description="是否需要支付：0-否 1-是")
    poster_url: Optional[str] = Field(None, max_length=500, description="活动海报图片URL")
    location: Optional[str] = Field(None, max_length=255, description="活动地点，为空表示线上活动")
    max_participants: Optional[int] = Field(None, ge=1, description="最大参与人数，NULL表示无限制")
    is_public: int = Field(0, ge=0, le=1, description="是否公开：0-否 1-是（所有用户可见）")


class ActivityUpdate(BaseModel):
    activity_name: Optional[str] = None
    tag: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    activity_type_id: Optional[int] = None
    activity_type_name: Optional[str] = Field(None, max_length=50)
    suggested_fee: Optional[int] = Field(None, ge=0, description="建议费用（分），0表示免费")
    require_payment: Optional[int] = Field(None, ge=0, le=1, description="是否需要支付：0-否 1-是")
    poster_url: Optional[str] = Field(None, max_length=500, description="活动海报图片URL")
    location: Optional[str] = Field(None, max_length=255, description="活动地点，为空表示线上活动")
    max_participants: Optional[int] = Field(None, ge=1, description="最大参与人数，NULL表示无限制")
    is_public: Optional[int] = Field(None, ge=0, le=1, description="是否公开：0-否 1-是（所有用户可见）")


class ActivityResponse(ActivityBase):
    id: int
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True

# 分页模型
class ActivityListResponse(BaseModel):
    items: List[ActivityResponse]
    total: int


class ActivityExportRequest(BaseModel):
    activity_ids: List[int] = Field(..., min_length=1, max_length=50, description="待导出的活动 ID 列表")


class ActivityExportParticipantRow(BaseModel):
    id: int
    user_id: Optional[int] = None
    participant_name: str
    phone: str
    identity_type: Optional[str] = None
    identity_number: Optional[str] = None
    sex: Optional[str] = None
    age: Optional[int] = None
    occupation: Optional[str] = None
    industry: Optional[str] = None
    email: Optional[str] = None
    enroll_status: int
    payment_status: int
    payment_order_id: Optional[int] = None
    payment_suggested_fee: Optional[int] = None
    paid_amount: int
    why_join: Optional[str] = None
    channel: Optional[str] = None
    expectation: Optional[str] = None
    activity_understanding: Optional[str] = None
    has_questions: Optional[str] = None
    payment_order_no: Optional[str] = None
    payment_paid_at: Optional[datetime] = None
    create_time: datetime
    update_time: datetime

    @field_serializer('participant_name')
    def serialize_participant_name(self, value: str) -> str | None:
        return mask_name(value)

    @field_serializer('phone')
    def serialize_phone(self, value: str) -> str | None:
        return mask_phone(value)

    @field_serializer('identity_number')
    def serialize_identity_number(self, value: str | None) -> str | None:
        return mask_identity_number(value)

    @field_serializer('email')
    def serialize_email(self, value: str | None) -> str | None:
        return mask_email(value)


class ActivityExportItem(BaseModel):
    tenant_id: int
    tenant_name: Optional[str] = None
    tenant_code: Optional[str] = None
    activity_id: int
    activity_name: str
    activity_type_name: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: int
    tag: Optional[str] = None
    suggested_fee: int
    require_payment: int
    location: Optional[str] = None
    max_participants: Optional[int] = None
    participants: List[ActivityExportParticipantRow]


class ActivityExportResponse(BaseModel):
    exported_at: datetime
    activities: List[ActivityExportItem]
