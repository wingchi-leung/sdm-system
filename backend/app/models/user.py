from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional
class UserBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    identity_number: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=255, pattern=r'^\d{11}$')
    sex: Optional[str] = Field(None, max_length=2, pattern=r'^[MF]$')

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    create_time: datetime
    update_time: datetime
    
    class Config:
        from_attributes = True