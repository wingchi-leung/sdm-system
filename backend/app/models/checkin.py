from pydantic import BaseModel, Field, field_serializer
from datetime import datetime
from typing import Optional

from app.core.pii import mask_identity_number, mask_name, mask_phone

class CheckInBase(BaseModel):
    activity_id: int = Field(..., gt=0)
    user_id: Optional[int] = Field(None, gt=0)
    name: str = Field(..., min_length=1, max_length=255)
    identity_number: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=255 )
    has_attend: int = Field(..., gt=0)
    note: str = Field(...,  max_length=255)

class CheckInCreate(CheckInBase):
    pass

class CheckInResponse(CheckInBase):
    id: int
    checkin_time: datetime
    create_time: datetime
    update_time: datetime

    @field_serializer('name')
    def serialize_name(self, value: str) -> str | None:
        return mask_name(value)

    @field_serializer('identity_number')
    def serialize_identity_number(self, value: str | None) -> str | None:
        return mask_identity_number(value)

    @field_serializer('phone')
    def serialize_phone(self, value: str | None) -> str | None:
        return mask_phone(value)

    class Config:
        from_attributes = True


class CheckInRecordWithActivity(CheckInResponse):
    """签到记录 + 活动名称，用于统计列表"""
    activity_name: Optional[str] = None

    class Config:
        from_attributes = True
