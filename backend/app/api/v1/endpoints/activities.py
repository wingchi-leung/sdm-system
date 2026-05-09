from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_activity, crud_checkin, crud_participant, crud_rbac
from app.models import activity, checkin
from app.api import deps
from app.schemas import Activity, ActivityParticipant, ActivityType, PaymentOrder, Tenant

router = APIRouter()


def _allowed_scopes_for_list(
    db: Session,
    user_id: int | None,
    tenant_id: int,
) -> tuple[List[int] | None, List[int] | None]:
    """管理员列表过滤（基于 RBAC）"""
    if user_id is None:
        return None, None

    user_roles = crud_rbac.get_user_roles(db, user_id, tenant_id)

    # 检查是否有全局权限
    if any(ur.scope_type is None for ur in user_roles):
        return None, None

    # 收集活动类型权限
    type_ids = [ur.scope_id for ur in user_roles if ur.scope_type == 'activity_type' and ur.scope_id]
    activity_ids = [ur.scope_id for ur in user_roles if ur.scope_type == 'activity' and ur.scope_id]

    return type_ids, activity_ids


def _is_super_admin(ctx: deps.TenantContext, db: Session) -> bool:
    """判断当前管理员是否具备租户级超级管理员能力。"""
    if ctx.is_platform_admin:
        return True

    user_roles = crud_rbac.get_user_roles(db, ctx.user_id, ctx.tenant_id)
    return any(user_role.scope_type is None for user_role in user_roles)


@router.post("/", response_model=activity.ActivityResponse)
def create_activity(
    body: activity.ActivityCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """创建活动"""
    has_global_permission = crud_rbac.has_permission(
        db,
        ctx.user_id,
        "activity.create",
        ctx.tenant_id,
    )
    has_scoped_permission = False
    if body.activity_type_id:
        has_scoped_permission = crud_rbac.has_permission(
            db,
            ctx.user_id,
            "activity.create",
            ctx.tenant_id,
            resource_id=body.activity_type_id,
            resource_type="activity_type",
        )

    if not has_global_permission and not has_scoped_permission:
        raise HTTPException(status_code=403, detail="缺少权限: activity.create")

    if body.activity_type_id and not has_global_permission:
        user_roles = crud_rbac.get_user_roles(db, ctx.user_id, ctx.tenant_id)
        allowed_types = [ur.scope_id for ur in user_roles if ur.scope_type == 'activity_type']
        if body.activity_type_id not in allowed_types:
            raise HTTPException(status_code=403, detail="所选活动类型不在授权范围内")

    return crud_activity.create_activity(db=db, activity=body, tenant_id=ctx.tenant_id)


@router.post("/export", response_model=activity.ActivityExportResponse)
def export_activities(
    body: activity.ActivityExportRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin_or_platform),
):
    """导出活动报名数据，仅平台管理员或租户超级管理员可访问。"""
    if not _is_super_admin(ctx, db):
        raise HTTPException(status_code=403, detail="仅超级管理员可导出活动数据")

    activity_ids = list(dict.fromkeys(body.activity_ids))
    if not activity_ids:
        raise HTTPException(status_code=400, detail="请至少选择一个活动")

    activity_query = db.query(Activity).filter(Activity.id.in_(activity_ids))
    if not ctx.is_platform_admin:
        activity_query = activity_query.filter(Activity.tenant_id == ctx.tenant_id)

    activities = activity_query.all()
    activity_by_id = {item.id: item for item in activities}

    missing_activity_ids = [activity_id for activity_id in activity_ids if activity_id not in activity_by_id]
    if missing_activity_ids:
        raise HTTPException(status_code=404, detail=f"部分活动不存在或无权访问: {missing_activity_ids}")

    tenant_ids = {item.tenant_id for item in activities}
    type_ids = {item.activity_type_id for item in activities if item.activity_type_id}

    tenant_by_id = {
        item.id: item for item in db.query(Tenant).filter(Tenant.id.in_(tenant_ids)).all()
    } if tenant_ids else {}
    type_name_by_id = {
        item.id: item.type_name for item in db.query(ActivityType).filter(ActivityType.id.in_(type_ids)).all()
    } if type_ids else {}

    participant_query = db.query(ActivityParticipant).filter(
        ActivityParticipant.activity_id.in_(activity_ids),
    )
    if not ctx.is_platform_admin:
        participant_query = participant_query.filter(ActivityParticipant.tenant_id == ctx.tenant_id)

    participants = participant_query.order_by(
        ActivityParticipant.activity_id.asc(),
        ActivityParticipant.create_time.asc(),
        ActivityParticipant.id.asc(),
    ).all()

    participant_ids = [item.id for item in participants]
    payment_order_ids = [item.payment_order_id for item in participants if item.payment_order_id]

    order_query = db.query(PaymentOrder).filter(
        or_(
            PaymentOrder.id.in_(payment_order_ids or [-1]),
            PaymentOrder.participant_id.in_(participant_ids or [-1]),
        )
    )
    if not ctx.is_platform_admin:
        order_query = order_query.filter(PaymentOrder.tenant_id == ctx.tenant_id)
    payment_orders = order_query.all() if participants else []

    order_by_id = {item.id: item for item in payment_orders}
    latest_order_by_participant_id: dict[int, PaymentOrder] = {}
    for payment_order in payment_orders:
        if payment_order.participant_id is None:
            continue
        current_order = latest_order_by_participant_id.get(payment_order.participant_id)
        if current_order is None or payment_order.create_time >= current_order.create_time:
            latest_order_by_participant_id[payment_order.participant_id] = payment_order

    participants_by_activity_id: dict[int, list[activity.ActivityExportParticipantRow]] = {
        activity_id: [] for activity_id in activity_ids
    }
    for participant in participants:
        payment_order = order_by_id.get(participant.payment_order_id) or latest_order_by_participant_id.get(participant.id)
        participants_by_activity_id.setdefault(participant.activity_id, []).append(
            activity.ActivityExportParticipantRow(
                id=participant.id,
                user_id=participant.user_id,
                participant_name=participant.participant_name,
                phone=participant.phone,
                identity_type=participant.identity_type,
                identity_number=participant.identity_number,
                sex=participant.sex,
                age=participant.age,
                occupation=participant.occupation,
                industry=participant.industry,
                email=participant.email,
                enroll_status=participant.enroll_status,
                payment_status=participant.payment_status,
                payment_order_id=participant.payment_order_id,
                paid_amount=participant.paid_amount,
                why_join=participant.why_join,
                channel=participant.channel,
                expectation=participant.expectation,
                activity_understanding=participant.activity_understanding,
                has_questions=participant.has_questions,
                payment_order_no=payment_order.order_no if payment_order else None,
                payment_paid_at=payment_order.paid_at if payment_order else None,
                create_time=participant.create_time,
                update_time=participant.update_time,
            )
        )

    export_items: list[activity.ActivityExportItem] = []
    for activity_id in activity_ids:
        activity_item = activity_by_id[activity_id]
        tenant = tenant_by_id.get(activity_item.tenant_id)
        export_items.append(
            activity.ActivityExportItem(
                tenant_id=activity_item.tenant_id,
                tenant_name=tenant.name if tenant else None,
                tenant_code=tenant.code if tenant else None,
                activity_id=activity_item.id,
                activity_name=activity_item.activity_name,
                activity_type_name=type_name_by_id.get(activity_item.activity_type_id),
                start_time=activity_item.start_time,
                end_time=activity_item.end_time,
                status=activity_item.status,
                tag=activity_item.tag,
                suggested_fee=activity_item.suggested_fee,
                require_payment=activity_item.require_payment,
                location=activity_item.location,
                max_participants=activity_item.max_participants,
                participants=participants_by_activity_id.get(activity_id, []),
            )
        )

    return activity.ActivityExportResponse(
        exported_at=datetime.now(),
        activities=export_items,
    )


@router.get("/", response_model=activity.ActivityListResponse)
def list_activities(
    skip: int = 0,
    limit: int = 100,
    status: int = None,
    tenant_code: str = Query("default", description="未登录访问时使用的租户编码"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """活动列表"""
    tenant_id = ctx.tenant_id if ctx else deps.get_public_tenant_context(tenant_code, db).tenant_id
    admin_id = ctx.user_id if ctx and ctx.role == "admin" else None
    
    allowed_types, allowed_activities = (
        _allowed_scopes_for_list(db, admin_id, tenant_id) if admin_id else (None, None)
    )
    activities, total = crud_activity.get_activities(
        db, tenant_id=tenant_id, skip=skip, limit=limit, status=status,
        allowed_activity_type_ids=allowed_types,
        allowed_activity_ids=allowed_activities,
    )
    return {"items": activities, "total": total}


@router.get("/unstarted/", response_model=activity.ActivityListResponse)
def get_unstarted_activities(
    tenant_code: str = Query("default", description="未登录访问时使用的租户编码"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """未开始活动列表"""
    tenant_id = ctx.tenant_id if ctx else deps.get_public_tenant_context(tenant_code, db).tenant_id
    admin_id = ctx.user_id if ctx and ctx.role == "admin" else None
    
    allowed_types, allowed_activities = (
        _allowed_scopes_for_list(db, admin_id, tenant_id) if admin_id else (None, None)
    )
    activities, total = crud_activity.get_activities(
        db,
        tenant_id=tenant_id,
        status=1,
        allowed_activity_type_ids=allowed_types,
        allowed_activity_ids=allowed_activities,
    )
    return {"items": activities, "total": total}


@router.get("/{activity_id}", response_model=activity.ActivityResponse)
def get_activity(
    activity_id: int,
    tenant_code: str = Query("default", description="未登录访问时使用的租户编码"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """获取活动详情"""
    tenant_id = ctx.tenant_id if ctx else deps.get_public_tenant_context(tenant_code, db).tenant_id
    act = crud_activity.get_activity(db, activity_id, tenant_id)
    if act is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return act


@router.get("/{activity_id}/enrollment-info")
def get_enrollment_info(
    activity_id: int,
    tenant_code: str = Query("default", description="未登录访问时使用的租户编码"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional),
):
    """获取活动报名情况（剩余名额等）"""
    tenant_id = ctx.tenant_id if ctx else deps.get_public_tenant_context(tenant_code, db).tenant_id
    act = crud_activity.get_activity(db, activity_id, tenant_id)
    if act is None:
        raise HTTPException(status_code=404, detail="Activity not found")

    enrolled_count = crud_participant.get_enrolled_count(db, activity_id, tenant_id)
    waitlist_count = crud_participant.get_waitlist_count(db, activity_id, tenant_id)

    max_participants = act.max_participants
    remaining_quota = None
    is_full = False

    if max_participants is not None:
        remaining_quota = max(0, max_participants - enrolled_count)
        is_full = enrolled_count >= max_participants

    return {
        "max_participants": max_participants,
        "enrolled_count": enrolled_count,
        "waitlist_count": waitlist_count,
        "remaining_quota": remaining_quota,
        "is_full": is_full,
    }


@router.put("/{activity_id}/status")
def update_activity_status(
    activity_id: int,
    status: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """更新活动状态"""
    # 检查编辑权限
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not deps.has_activity_permission(db, ctx, activity_id, "activity.edit"):
        raise HTTPException(status_code=403, detail="无权限编辑此活动")

    act = crud_activity.update_activity_status(db, activity_id, status, ctx.tenant_id)
    if act is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return {"status": "success", "message": "Activity status updated"}


@router.get("/{activity_id}/checkins/", response_model=List[checkin.CheckInResponse])
def get_activity_checkins(
    activity_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """查看活动签到"""
    # 检查查看权限
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not deps.has_activity_permission(db, ctx, activity_id, "checkin.manage"):
        raise HTTPException(status_code=403, detail="无权限查看此活动")

    return crud_checkin.get_activity_checkins(db, activity_id, ctx.tenant_id, skip=skip, limit=limit)


@router.get("/{activity_id}/statistics/")
def get_activity_stats(
    activity_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """活动报名统计"""
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not deps.has_activity_permission(db, ctx, activity_id, "participant.view"):
        raise HTTPException(status_code=403, detail="无权限查看此活动")

    return crud_participant.get_activity_statistics(db, activity_id, ctx.tenant_id)


@router.put("/{activity_id}", response_model=activity.ActivityResponse)
def update_activity(
    activity_id: int,
    body: activity.ActivityUpdate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """编辑活动信息"""
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not deps.has_activity_permission(db, ctx, activity_id, "activity.edit"):
        raise HTTPException(status_code=403, detail="无权限编辑此活动")

    return crud_activity.update_activity(db, activity_id, body, ctx.tenant_id)


@router.delete("/{activity_id}")
def delete_activity(
    activity_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """删除活动"""
    activity = crud_activity.get_activity(db, activity_id, ctx.tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")

    if not deps.has_activity_permission(db, ctx, activity_id, "activity.delete"):
        raise HTTPException(status_code=403, detail="无权限删除此活动")

    crud_activity.delete_activity(db, activity_id, ctx.tenant_id)
    return {"status": "success", "message": "Activity deleted successfully"}
