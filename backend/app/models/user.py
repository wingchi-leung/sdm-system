from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional
class UserBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    identity_number: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=255)
    sex: Optional[str] = Field(None, max_length=2, pattern=r'^[MF]$')
    isblock: int = Field(0, ge=0, le=1, description="0-正常 1-拉黑")
    block_reason: Optional[str] = Field(None, max_length=255)

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    create_time: datetime
    update_time: datetime
    
    class Config:
        from_attributes = True


class UserList(BaseModel):
    id: int
    name: str
    identity_number: str
    phone: str | None = None
    sex: str | None = None
    isblock: int = 0
    block_reason: str | None = None

    class Config:
        orm_mode = True