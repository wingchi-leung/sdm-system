from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_user, crud_tenant
from app.api import deps
from app.models import user
from app.schemas import User

router = APIRouter()


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