from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class CheckInBase(BaseModel):
    activity_id: int = Field(..., gt=0)
    user_id: int = Field(..., gt=0)
    has_attend: int = Field(..., ge=0)
    note: Optional[str] = Field(None, max_length=255)

class CheckInCreate(CheckInBase):
    pass

class CheckInResponse(BaseModel):
    activity_id: int
    user_id: Optional[int] = None
    has_attend: int = 0
    note: Optional[str] = None
    id: int
    checkin_time: datetime
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True


class CheckInRecordWithActivity(CheckInResponse):
    """签到记录 + 活动名称，用于统计列表"""
    activity_name: Optional[str] = None

    class Config:
        from_attributes = True
