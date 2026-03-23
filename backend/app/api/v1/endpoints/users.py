from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.crud import crud_user, crud_tenant, crud_admin
from app.api import deps
from app.models import user
from app.schemas import User, MemberType

router = APIRouter()


# ============================================================
# 会员设置相关模型
# ============================================================

class SetUserMemberRequest(BaseModel):
    """设置用户会员类型请求"""
    member_type_id: int
    member_expire_at: Optional[datetime] = None  # None 表示永久有效


class UserWithMemberResponse(BaseModel):
    """用户信息（含会员信息）"""
    id: int
    name: Optional[str]
    phone: Optional[str]
    member_type_id: Optional[int]
    member_type_name: Optional[str] = None
    member_expire_at: Optional[datetime]
    
    class Config:
        from_attributes = True


# ============================================================
# API 路由
# ============================================================

@router.post("/register", response_model=user.UserResponse)
def register(body: user.RegisterRequest, db: Session = Depends(deps.get_db)):
    """用户注册"""
    tenant_code = getattr(body, 'tenant_code', None) or 'default'
    tenant = crud_tenant.get_tenant_by_code(db, tenant_code)
    if not tenant or tenant.status != 1:
        raise HTTPException(status_code=400, detail="租户不存在或已禁用")
    
    return crud_user.register_user(db=db, body=body, tenant_id=tenant.id)


@router.get("/me", response_model=user.UserResponse)
def get_my_profile(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """获取当前登录用户的个人信息"""
    if ctx.role != "user":
        raise HTTPException(status_code=403, detail="仅限普通用户访问")
    db_user = crud_user.get_user(db, user_id=ctx.user_id, tenant_id=ctx.tenant_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return db_user


@router.post("/create", response_model=user.UserResponse)
def create_user(
    user_in: user.UserCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """创建用户"""
    return crud_user.create_user(db=db, user=user_in, tenant_id=ctx.tenant_id)


@router.get("/{user_id}", response_model=user.UserResponse)
def read_user(
    user_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """获取用户详情"""
    db_user = crud_user.get_user(db, user_id=user_id, tenant_id=ctx.tenant_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


@router.get("/", response_model=List[user.UserResponse])
def get_users(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """用户列表"""
    return crud_user.get_users(db, tenant_id=ctx.tenant_id)


@router.put("/bind-info")
def bind_user_info(
    bind_info: user.UserBindInfoRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """绑定用户完整信息"""
    if ctx.role != "user":
        raise HTTPException(status_code=403, detail="仅限普通用户访问")

    try:
        user = crud_user.update_user_bind_info(
            db, ctx.user_id, ctx.tenant_id, bind_info.model_dump()
        )
        return {"success": True, "message": "信息绑定成功"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"绑定失败: {str(e)}")


@router.get("/check-bind-status")
def check_bind_status(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """检查用户信息绑定状态"""
    if ctx.role != "user":
        raise HTTPException(status_code=403, detail="仅限普通用户访问")

    is_incomplete = crud_user.is_user_profile_incomplete(
        db, ctx.user_id, ctx.tenant_id
    )
    return {
        "require_bind_info": is_incomplete,
        "is_bound": not is_incomplete
    }


@router.get("/admin/all", response_model=user.UserListForAdminResponse)
def get_all_users_for_super_admin(
    tenant_code: str = Query("default", description="租户编码，默认default"),
    skip: int = Query(0, ge=0, description="跳过记录数"),
    limit: int = Query(20, ge=1, le=100, description="每页记录数"),
    keyword: Optional[str] = Query(None, description="搜索关键字（姓名、手机号）"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """
    超级管理员查看所有用户（按租户筛选）
    仅超级管理员可访问
    """
    # 检查是否为超级管理员
    is_super, _ = crud_admin.get_admin_scope(db, ctx.user_id, ctx.tenant_id)
    if not is_super:
        raise HTTPException(status_code=403, detail="仅超级管理员可访问")

    # 根据租户code获取租户
    tenant = crud_tenant.get_tenant_by_code(db, tenant_code)
    if not tenant:
        raise HTTPException(status_code=400, detail="租户不存在")

    users, total = crud_user.get_all_users_for_super_admin(
        db,
        tenant_id=tenant.id,
        skip=skip,
        limit=limit,
        keyword=keyword,
    )

    return user.UserListForAdminResponse(
        items=[user.UserListItemForAdmin.model_validate(u) for u in users],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.put("/{user_id}/member")
def set_user_member(
    user_id: int,
    data: SetUserMemberRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """
    设置用户会员类型（管理员）
    """
    # 检查用户是否存在
    db_user = crud_user.get_user(db, user_id=user_id, tenant_id=ctx.tenant_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查会员类型是否存在
    member_type = db.query(MemberType).filter(
        MemberType.id == data.member_type_id,
        MemberType.tenant_id == ctx.tenant_id
    ).first()
    if not member_type:
        raise HTTPException(status_code=404, detail="会员类型不存在")
    
    # 更新用户会员信息
    db_user.member_type_id = data.member_type_id
    db_user.member_expire_at = data.member_expire_at
    db.commit()
    
    return {
        "success": True,
        "message": "会员设置成功",
        "member_type": member_type.name,
        "expire_at": data.member_expire_at
    }


@router.get("/with-member", response_model=List[UserWithMemberResponse])
def get_users_with_member(
    member_type_id: Optional[int] = Query(None, description="按会员类型筛选"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """
    获取用户列表（含会员信息）
    """
    query = db.query(User).filter(User.tenant_id == ctx.tenant_id)
    
    if member_type_id:
        query = query.filter(User.member_type_id == member_type_id)
    
    users = query.all()
    
    result = []
    for u in users:
        member_type_name = None
        if u.member_type_id:
            mt = db.query(MemberType).filter(MemberType.id == u.member_type_id).first()
            if mt:
                member_type_name = mt.name
        
        result.append(UserWithMemberResponse(
            id=u.id,
            name=u.name,
            phone=u.phone,
            member_type_id=u.member_type_id,
            member_type_name=member_type_name,
            member_expire_at=u.member_expire_at
        ))
    
    return result