from pydantic import BaseModel
from typing import List, Optional


class AdminBase(BaseModel):
    username: str


class AdminResponse(AdminBase):
    id: int
    tenant_id: int
    is_super_admin: int

    class Config:
        from_attributes = True


class AdminListResponse(BaseModel):
    items: List[AdminResponse]
    total: int


class AdminRoleAssign(BaseModel):
    """管理员授权请求"""
    admin_user_id: int
    activity_type_ids: List[int]


class AdminRoleResponse(BaseModel):
    """管理员授权信息"""
    admin_user_id: int
    username: str
    is_super_admin: int
    activity_type_ids: List[int]

    class Config:
        from_attributes = True
