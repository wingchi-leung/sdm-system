from datetime import datetime
from typing import List

from pydantic import BaseModel, Field


class TenantBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=32)
    plan: str = Field(default="basic", max_length=32)
    max_admins: int = Field(default=5, ge=0)
    max_activities: int = Field(default=100, ge=0)
    expire_at: datetime | None = None
    contact_name: str | None = Field(default=None, max_length=64)
    contact_phone: str | None = Field(default=None, max_length=32)


class TenantCreate(TenantBase):
    pass


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    status: int | None = Field(default=None, ge=0, le=1)
    plan: str | None = Field(default=None, max_length=32)
    max_admins: int | None = Field(default=None, ge=0)
    max_activities: int | None = Field(default=None, ge=0)
    expire_at: datetime | None = None
    contact_name: str | None = Field(default=None, max_length=64)
    contact_phone: str | None = Field(default=None, max_length=32)


class TenantResponse(TenantBase):
    id: int
    status: int
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True


class TenantSummary(BaseModel):
    total: int
    active: int
    disabled: int
    expired: int


class TenantListResponse(BaseModel):
    items: List[TenantResponse]
    total: int
    summary: TenantSummary
