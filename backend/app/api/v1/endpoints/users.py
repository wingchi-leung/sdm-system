from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import json

from app.crud import crud_user, crud_tenant, crud_rbac
from app.api import deps
from app.models import user
from app.models.user import ImportTemplateRequest, ImportTemplateResponse, ImportExcelRequest, ImportResult
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
    """获取当前登录身份关联的个人信息"""
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


@router.put("/bind-info")
def bind_user_info(
    bind_info: user.UserBindInfoRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """绑定用户完整信息"""
    try:
        crud_user.update_user_bind_info(
            db, ctx.user_id, ctx.tenant_id, bind_info
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
    """检查当前登录身份关联用户的信息绑定状态"""
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
    ctx: deps.TenantContext = Depends(deps.get_current_admin_or_platform),
):
    """
    查看用户列表（按租户筛选）
    平台管理员可跨租户筛选；租户管理员只能查询当前租户。
    """
    # 根据租户code获取租户
    tenant = crud_tenant.get_tenant_by_code(db, tenant_code)
    if not tenant:
        raise HTTPException(status_code=400, detail="租户不存在")

    if ctx.is_platform_admin:
        if not crud_tenant.check_tenant_active(db, tenant.id):
            raise HTTPException(status_code=400, detail="租户不存在或已禁用")
    else:
        # 检查是否为租户超级管理员
        is_super = crud_rbac.has_permission(db, ctx.user_id, "user.view", ctx.tenant_id)
        if not is_super:
            raise HTTPException(status_code=403, detail="仅超级管理员可访问")
        if tenant.id != ctx.tenant_id:
            raise HTTPException(status_code=403, detail="不能跨租户查看用户")

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
    ctx: deps.TenantContext = Depends(deps.require_permission("user.view")),
):
    """用户列表"""
    return crud_user.get_users(db, tenant_id=ctx.tenant_id)


@router.post("/{user_id}/block", response_model=user.UserResponse)
def block_user(
    user_id: int,
    body: user.BlockUserRequest = None,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """拉黑用户（仅超级管理员）"""
    # 检查是否为超级管理员
    is_super = crud_rbac.has_permission(db, ctx.user_id, "user.view", ctx.tenant_id)
    if not is_super:
        raise HTTPException(status_code=403, detail="仅超级管理员可操作")

    reason = body.reason if body else None
    return crud_user.block_user(db, user_id, ctx.tenant_id, reason)


@router.post("/{user_id}/unblock", response_model=user.UserResponse)
def unblock_user(
    user_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """解除拉黑用户（仅超级管理员）"""
    # 检查是否为超级管理员
    is_super = crud_rbac.has_permission(db, ctx.user_id, "user.view", ctx.tenant_id)
    if not is_super:
        raise HTTPException(status_code=403, detail="仅超级管理员可操作")

    return crud_user.unblock_user(db, user_id, ctx.tenant_id)


# ============================================================
# 导入模板配置 API（仅超级管理员）
# ============================================================

@router.get("/import-template", response_model=ImportTemplateResponse)
def get_import_template(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """获取导入模板配置"""
    # 检查是否为超级管理员
    is_super = crud_rbac.has_permission(db, ctx.user_id, "user.view", ctx.tenant_id)
    if not is_super:
        raise HTTPException(status_code=403, detail="仅超级管理员可操作")

    template = crud_user.get_import_template(db, ctx.tenant_id)
    if not template or not template.column_mapping:
        return ImportTemplateResponse(column_mapping={}, is_active=False)

    return ImportTemplateResponse(
        column_mapping=json.loads(template.column_mapping),
        is_active=template.is_active == 1,
    )


@router.put("/import-template", response_model=ImportTemplateResponse)
def save_import_template_config(
    config: ImportTemplateRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """保存导入模板配置"""
    # 检查是否为超级管理员
    is_super = crud_rbac.has_permission(db, ctx.user_id, "user.view", ctx.tenant_id)
    if not is_super:
        raise HTTPException(status_code=403, detail="仅超级管理员可操作")

    template = crud_user.save_import_template(db, ctx.tenant_id, config)
    return ImportTemplateResponse(
        column_mapping=json.loads(template.column_mapping),
        is_active=template.is_active == 1,
    )


@router.delete("/import-template")
def delete_import_template_config(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """删除导入模板配置"""
    # 检查是否为超级管理员
    is_super = crud_rbac.has_permission(db, ctx.user_id, "user.view", ctx.tenant_id)
    if not is_super:
        raise HTTPException(status_code=403, detail="仅超级管理员可操作")

    crud_user.delete_import_template(db, ctx.tenant_id)
    return {"message": "删除成功"}


@router.post("/import-excel", response_model=ImportResult)
def import_users_excel(
    body: ImportExcelRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """导入Excel用户（需要先配置模板）"""
    # 检查是否为超级管理员
    is_super = crud_rbac.has_permission(db, ctx.user_id, "user.view", ctx.tenant_id)
    if not is_super:
        raise HTTPException(status_code=403, detail="仅超级管理员可操作")

    try:
        return crud_user.import_users_from_excel(db, ctx.tenant_id, body.file_content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
