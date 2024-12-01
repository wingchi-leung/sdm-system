from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional,List
from .participant import ParticipantBase

class ActivityBase(BaseModel):
    activity_name: str = Field(..., min_length=1, max_length=100)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: int = Field(1, ge=1, le=3, description="1-未开始，2-进行中，3-已结束")
    tag: Optional[str]  = None  

class ActivityCreate(BaseModel):
    activity_name: str
    tag: str 
    start_time: datetime
    participants: list[ParticipantBase]

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