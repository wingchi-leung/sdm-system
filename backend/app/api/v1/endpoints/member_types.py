"""
会员类型管理 API
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.schemas import MemberType, MemberTypeActivityType, ActivityType
from app.api.deps import get_current_admin, get_tenant_context

router = APIRouter()


# ============================================================
# Pydantic 模型
# ============================================================

class MemberTypeCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    sort_order: int = 0


class MemberTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class MemberTypeResponse(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    is_default: int
    sort_order: int
    activity_types: List[int] = []  # 可访问的活动类型ID列表

    class Config:
        from_attributes = True


class SetActivityTypesRequest(BaseModel):
    activity_type_ids: List[int]


# ============================================================
# CRUD 操作
# ============================================================

def get_member_types(db: Session, tenant_id: int):
    """获取会员类型列表"""
    return db.query(MemberType).filter(
        MemberType.tenant_id == tenant_id
    ).order_by(MemberType.sort_order).all()


def get_member_type(db: Session, member_type_id: int, tenant_id: int):
    """获取单个会员类型"""
    return db.query(MemberType).filter(
        MemberType.id == member_type_id,
        MemberType.tenant_id == tenant_id
    ).first()


def get_default_member_type(db: Session, tenant_id: int):
    """获取默认会员类型"""
    member_type = db.query(MemberType).filter(
        MemberType.tenant_id == tenant_id,
        MemberType.is_default == 1
    ).first()
    
    if not member_type:
        # 如果没有默认会员类型，返回第一个
        member_type = db.query(MemberType).filter(
            MemberType.tenant_id == tenant_id
        ).first()
    
    return member_type


def get_member_activity_types(db: Session, member_type_id: int) -> List[int]:
    """获取会员类型可访问的活动类型ID列表"""
    relations = db.query(MemberTypeActivityType).filter(
        MemberTypeActivityType.member_type_id == member_type_id
    ).all()
    return [r.activity_type_id for r in relations]


def set_member_activity_types(db: Session, member_type_id: int, activity_type_ids: List[int]):
    """设置会员类型可访问的活动类型"""
    # 删除旧的关联
    db.query(MemberTypeActivityType).filter(
        MemberTypeActivityType.member_type_id == member_type_id
    ).delete()
    
    # 添加新的关联
    for activity_type_id in activity_type_ids:
        relation = MemberTypeActivityType(
            member_type_id=member_type_id,
            activity_type_id=activity_type_id
        )
        db.add(relation)
    
    db.commit()


# ============================================================
# API 路由
# ============================================================

@router.get("/", response_model=List[MemberTypeResponse])
def list_member_types(
    db: Session = Depends(get_db),
    ctx = Depends(get_current_admin)
):
    """获取会员类型列表（管理员）"""
    member_types = get_member_types(db, ctx.tenant_id)
    
    result = []
    for mt in member_types:
        activity_type_ids = get_member_activity_types(db, mt.id)
        result.append(MemberTypeResponse(
            id=mt.id,
            name=mt.name,
            code=mt.code,
            description=mt.description,
            is_default=mt.is_default,
            sort_order=mt.sort_order,
            activity_types=activity_type_ids
        ))
    
    return result


@router.get("/{member_type_id}", response_model=MemberTypeResponse)
def get_member_type_detail(
    member_type_id: int,
    db: Session = Depends(get_db),
    ctx = Depends(get_current_admin)
):
    """获取会员类型详情（管理员）"""
    member_type = get_member_type(db, member_type_id, ctx.tenant_id)
    if not member_type:
        raise HTTPException(status_code=404, detail="会员类型不存在")
    
    activity_type_ids = get_member_activity_types(db, member_type.id)
    
    return MemberTypeResponse(
        id=member_type.id,
        name=member_type.name,
        code=member_type.code,
        description=member_type.description,
        is_default=member_type.is_default,
        sort_order=member_type.sort_order,
        activity_types=activity_type_ids
    )


@router.post("/", response_model=MemberTypeResponse)
def create_member_type(
    data: MemberTypeCreate,
    db: Session = Depends(get_db),
    ctx = Depends(get_current_admin)
):
    """创建会员类型（管理员）"""
    # 检查 code 是否已存在
    existing = db.query(MemberType).filter(
        MemberType.tenant_id == ctx.tenant_id,
        MemberType.code == data.code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="会员类型代码已存在")
    
    member_type = MemberType(
        tenant_id=ctx.tenant_id,
        name=data.name,
        code=data.code,
        description=data.description,
        sort_order=data.sort_order,
        is_default=0
    )
    db.add(member_type)
    db.commit()
    db.refresh(member_type)
    
    return MemberTypeResponse(
        id=member_type.id,
        name=member_type.name,
        code=member_type.code,
        description=member_type.description,
        is_default=member_type.is_default,
        sort_order=member_type.sort_order,
        activity_types=[]
    )


@router.put("/{member_type_id}", response_model=MemberTypeResponse)
def update_member_type(
    member_type_id: int,
    data: MemberTypeUpdate,
    db: Session = Depends(get_db),
    ctx = Depends(get_current_admin)
):
    """更新会员类型（管理员）"""
    member_type = get_member_type(db, member_type_id, ctx.tenant_id)
    if not member_type:
        raise HTTPException(status_code=404, detail="会员类型不存在")
    
    if data.name is not None:
        member_type.name = data.name
    if data.description is not None:
        member_type.description = data.description
    if data.sort_order is not None:
        member_type.sort_order = data.sort_order
    
    db.commit()
    db.refresh(member_type)
    
    activity_type_ids = get_member_activity_types(db, member_type.id)
    
    return MemberTypeResponse(
        id=member_type.id,
        name=member_type.name,
        code=member_type.code,
        description=member_type.description,
        is_default=member_type.is_default,
        sort_order=member_type.sort_order,
        activity_types=activity_type_ids
    )


@router.delete("/{member_type_id}")
def delete_member_type(
    member_type_id: int,
    db: Session = Depends(get_db),
    ctx = Depends(get_current_admin)
):
    """删除会员类型（管理员）"""
    member_type = get_member_type(db, member_type_id, ctx.tenant_id)
    if not member_type:
        raise HTTPException(status_code=404, detail="会员类型不存在")
    
    # 不能删除默认会员类型
    if member_type.is_default == 1:
        raise HTTPException(status_code=400, detail="不能删除默认会员类型")
    
    # 删除关联的活动类型
    db.query(MemberTypeActivityType).filter(
        MemberTypeActivityType.member_type_id == member_type_id
    ).delete()
    
    db.delete(member_type)
    db.commit()
    
    return {"message": "删除成功"}


@router.put("/{member_type_id}/activity-types")
def set_activity_types(
    member_type_id: int,
    data: SetActivityTypesRequest,
    db: Session = Depends(get_db),
    ctx = Depends(get_current_admin)
):
    """设置会员类型可访问的活动类型（管理员）"""
    member_type = get_member_type(db, member_type_id, ctx.tenant_id)
    if not member_type:
        raise HTTPException(status_code=404, detail="会员类型不存在")
    
    # 验证活动类型是否存在
    for activity_type_id in data.activity_type_ids:
        activity_type = db.query(ActivityType).filter(
            ActivityType.id == activity_type_id,
            ActivityType.tenant_id == ctx.tenant_id
        ).first()
        if not activity_type:
            raise HTTPException(status_code=400, detail=f"活动类型 {activity_type_id} 不存在")
    
    set_member_activity_types(db, member_type_id, data.activity_type_ids)
    
    return {"message": "设置成功"}