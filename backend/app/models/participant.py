from pydantic import BaseModel, Field, field_serializer
from datetime import datetime
from typing import Literal, Optional, List

from app.core.pii import mask_name


class ParticipantBase(BaseModel):
    activity_id: Optional[int] = Field(None)
    user_id: Optional[int] = Field(None)
    participant_name: str = Field(..., max_length=255)
    enroll_status: Optional[int] = Field(None, ge=1, le=2, description="报名状态：1-已报名 2-候补")
    # 问卷字段
    why_join: Optional[str] = Field(None, max_length=500)
    channel: Optional[str] = Field(None, max_length=255)
    expectation: Optional[str] = Field(None, max_length=500)
    activity_understanding: Optional[str] = Field(None, max_length=255)
    has_questions: Optional[str] = Field(None, max_length=500)


class ParticipantCreate(ParticipantBase):
    pass


class ParticipantResponse(ParticipantBase):
    id: int
    review_status: Optional[int] = Field(None, description="审核状态：0-待审核 1-通过 2-拒绝")
    review_reason: Optional[str] = Field(None, description="审核拒绝原因")
    payment_status: Optional[int] = Field(None, description="支付状态：0-无需支付 1-待支付 2-已支付")
    payment_order_id: Optional[int] = Field(None, description="支付订单ID")
    paid_amount: Optional[int] = Field(None, description="实际支付金额（分）")
    create_time: datetime
    update_time: datetime

    @field_serializer('participant_name')
    def serialize_participant_name(self, value: str) -> str | None:
        return mask_name(value)

    class Config:
        from_attributes = True


class ParticipantListResponse(BaseModel):
    items: List[ParticipantResponse]
    total: int


class ParticipantActivitySummary(BaseModel):
    id: int
    activity_name: str
    activity_type_id: Optional[int] = None
    activity_type_name: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: int
    tag: Optional[str] = None
    poster_url: Optional[str] = None
    location: Optional[str] = None
    enroll_status: int
    payment_status: Optional[int] = None
    paid_amount: Optional[int] = None
    participant_id: int
    participant_create_time: datetime


class ParticipantActivityListResponse(BaseModel):
    items: List[ParticipantActivitySummary]
    total: int


class ParticipantReviewRequest(BaseModel):
    action: Literal["approve", "reject"]
    reason: Optional[str] = Field(None, max_length=255)
