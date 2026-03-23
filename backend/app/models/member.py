from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


class MemberTypeBase(BaseModel):
    """会员类型基础模型"""
    name: str = Field(..., min_length=1, max_length=50, description="会员类型名称")
    code: str = Field(..., min_length=1, max_length=50, description="会员类型代码")
    description: Optional[str] = Field(None, max_length=500, description="会员类型描述")
    is_default: int = Field(0, ge=0, le=1, description="是否为默认会员类型：0-否 1-是")
    sort_order: int = Field(0, ge=0, description="排序顺序")


class MemberTypeCreate(MemberTypeBase):
    """创建会员类型请求"""
    pass


class MemberTypeUpdate(BaseModel):
    """更新会员类型请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    code: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    is_default: Optional[int] = Field(None, ge=0, le=1)
    sort_order: Optional[int] = Field(None, ge=0)


class MemberTypeResponse(MemberTypeBase):
    """会员类型响应"""
    id: int
    tenant_id: int
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True


class MemberTypeListResponse(BaseModel):
    """会员类型列表响应"""
    items: List[MemberTypeResponse]
    total: int


# ============================================================
# 会员类型活动类型关联
# ============================================================
class MemberTypeActivityTypeBase(BaseModel):
    """会员类型活动类型关联基础模型"""
    member_type_id: int = Field(..., description="会员类型ID")
    activity_type_id: int = Field(..., description="活动类型ID")


class MemberTypeActivityTypeCreate(MemberTypeActivityTypeBase):
    """创建会员类型活动类型关联请求"""
    pass


class SetActivityTypesRequest(BaseModel):
    """设置会员类型可访问活动类型请求"""
    activity_type_ids: List[int] = Field(..., description="活动类型ID列表")


class ActivityTypeInMemberType(BaseModel):
    """会员类型中的活动类型信息"""
    id: int
    type_name: str
    code: Optional[str] = None

    class Config:
        from_attributes = True


class MemberTypeWithActivityTypes(MemberTypeResponse):
    """带活动类型的会员类型响应"""
    activity_types: List[ActivityTypeInMemberType] = Field(default_factory=list)


# ============================================================
# 用户会员相关
# ============================================================
class UserMemberUpdateRequest(BaseModel):
    """设置用户会员类型请求"""
    member_type_id: int = Field(..., description="会员类型ID")
    member_expire_at: Optional[datetime] = Field(None, description="会员过期时间，不设置则永久有效")


class UserMemberInfo(BaseModel):
    """用户会员信息"""
    id: int
    member_type_id: Optional[int] = None
    member_expire_at: Optional[datetime] = None
    member_type_name: Optional[str] = None
    member_type_code: Optional[str] = None
    is_expired: bool = False

    class Config:
        from_attributes = True
