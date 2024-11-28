from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class ParticipantBase(BaseModel):
    activity_id: int = Field(..., gt=0)
    user_id: Optional[int] = Field(None, gt=0)
    participant_name: str = Field(..., min_length=1, max_length=255)
    identity_number: str = Field(..., min_length=1, max_length=255)

class ParticipantCreate(ParticipantBase):
    pass

class ParticipantResponse(ParticipantBase):
    id: int
    create_time: datetime
    update_time: datetime
    
    class Config:
        from_attributes = True