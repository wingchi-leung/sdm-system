from pydantic import BaseModel
from datetime import datetime


class ActivityTypeBase(BaseModel):
    type_name: str
    code: str | None = None


class ActivityTypeResponse(ActivityTypeBase):
    id: int
    tenant_id: int
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True