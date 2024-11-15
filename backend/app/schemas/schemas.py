from pydantic import BaseModel
from typing import Optional

class CheckIn(BaseModel):
    name: str
    activity: str