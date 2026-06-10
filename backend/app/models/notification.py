from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class SubscribeConsentUpsert(BaseModel):
    template_id: str = Field(..., min_length=1, max_length=64)
    accept_status: Literal["accept", "reject", "ban"]
    source_page: Optional[str] = Field(None, max_length=255)


class SubscribeConfigResponse(BaseModel):
    enabled: bool
    refund_success_template_id: Optional[str] = None
    refund_failed_template_id: Optional[str] = None
    activity_remind_template_id: Optional[str] = None
    retry_max: int


class MessageTaskRetryResponse(BaseModel):
    task_id: int
    status: str
    retry_count: int
    max_retry: int
    next_retry_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RefundNotifyEnqueueRequest(BaseModel):
    order_no: str = Field(..., min_length=1, max_length=64)
    result: Literal["success", "failed"]
