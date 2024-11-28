from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional
from .participant import ParticipantBase

class ActivityBase(BaseModel):
    activity_name: str = Field(..., min_length=1, max_length=100)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: int = Field(1, ge=1, le=3, description="1-未开始，2-进行中，3-已结束")
    
    @validator('end_time')
    def end_time_must_be_after_start_time(cls, v, values):
        if v and 'start_time' in values and v < values['start_time']:
            raise ValueError('end_time must be after start_time')
        return v

class ActivityCreate(BaseModel):
    activity_name: str
    start_time: datetime
    participants: list[ParticipantBase]

class ActivityResponse(ActivityBase):
    id: int
    create_time: datetime
    update_time: datetime
    
    class Config:
        from_attributes = True   