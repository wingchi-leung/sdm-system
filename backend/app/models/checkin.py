from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class CheckInBase(BaseModel):
    activity_id: int = Field(..., gt=0)
    user_id: Optional[int] = Field(None, gt=0)
    name: str = Field(..., min_length=1, max_length=255)
    identity_number: str = Field(None, min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=255, pattern=r'^\d{11}$')
    has_attend: int = Field(..., gt=0)
    note: str = Field(..., min_length=1, max_length=255)

class CheckInCreate(CheckInBase):
    pass

class CheckInResponse(CheckInBase):
    id: int
    checkin_time: datetime
    create_time: datetime
    update_time: datetime
    
    class Config:
        from_attributes = True
