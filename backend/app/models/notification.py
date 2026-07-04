from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class SubscribeConsentUpsert(BaseModel):
    template_id: str = Field(..., min_length=1, max_length=64)
    accept_status: Literal["accept", "reject", "ban"]
    source_page: Optional[str] = Field(None, max_length=255)


class NotificationSceneConfigItem(BaseModel):
    scene: str
    name: str
    description: Optional[str] = None
    enabled: bool
    template_id: Optional[str] = None
    page_path: Optional[str] = None
    payload_template_json: dict[str, Any] = Field(default_factory=dict)


class ActivityNotificationConfigItem(BaseModel):
    activity_id: int
    scene: str
    enabled: bool
    template_id: Optional[str] = None
    page_path: Optional[str] = None
    payload_template_json: dict[str, Any] = Field(default_factory=dict)


class SubscribeConfigResponse(BaseModel):
    enabled: bool
    refund_success_template_id: Optional[str] = None
    refund_failed_template_id: Optional[str] = None
    activity_remind_template_id: Optional[str] = None
    registration_success_template_id: Optional[str] = None
    retry_max: int
    scenes: list[NotificationSceneConfigItem] = Field(default_factory=list)


class NotificationSceneConfigUpsert(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    enabled: bool = True
    template_id: Optional[str] = Field(None, max_length=64)
    page_path: Optional[str] = Field(None, max_length=255)
    payload_template_json: dict[str, Any] = Field(default_factory=dict)


class ActivityNotificationConfigUpsert(BaseModel):
    enabled: bool = True
    template_id: Optional[str] = Field(None, max_length=64)
    page_path: Optional[str] = Field(None, max_length=255)
    payload_template_json: dict[str, Any] = Field(default_factory=dict)


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
