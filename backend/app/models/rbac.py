from pydantic import BaseModel
from typing import List, Optional


class PermissionResponse(BaseModel):
    id: int
    code: str
    name: str
    resource: str
    action: str

    class Config:
        from_attributes = True


class RoleResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    is_system: int
    description: Optional[str]

    class Config:
        from_attributes = True


class RoleWithPermissions(RoleResponse):
    permissions: List[PermissionResponse]


class UserRoleAssign(BaseModel):
    """用户角色分配"""
    user_id: int
    role_id: int
    scope_type: Optional[str] = None
    scope_id: Optional[int] = None


class UserRoleResponse(BaseModel):
    id: int
    user_id: int
    role_id: int
    role_name: str
    scope_type: Optional[str]
    scope_id: Optional[int]

    class Config:
        from_attributes = True
