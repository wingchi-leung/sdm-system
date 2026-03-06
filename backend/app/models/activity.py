from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
from .participant import ParticipantBase


class ActivityBase(BaseModel):
    activity_name: str = Field(..., min_length=1, max_length=100)
    activity_type_id: Optional[int] = None
    activity_type_name: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: int = Field(1, ge=1, le=3, description="1-未开始，2-进行中，3-已结束")
    tag: Optional[str] = None


class ActivityCreate(BaseModel):
    activity_name: str
    tag: Optional[str] = ""
    start_time: datetime
    participants: list[ParticipantBase] = []
    activity_type_id: Optional[int] = None
    activity_type_name: Optional[str] = None


class ActivityUpdate(BaseModel):
    activity_name: Optional[str] = None
    tag: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    activity_type_id: Optional[int] = None
    activity_type_name: Optional[str] = None


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