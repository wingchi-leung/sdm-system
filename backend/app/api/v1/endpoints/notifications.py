from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud import crud_notification
from app.models.notification import (
    MessageTaskRetryResponse,
    NotificationSceneConfigItem,
    NotificationSceneConfigUpsert,
    RefundNotifyEnqueueRequest,
    SubscribeConfigResponse,
    SubscribeConsentUpsert,
)
from app.schemas import PaymentOrder, UserCredential
from app.services import notification_center

router = APIRouter()


@router.post("/subscribe-consent")
def upsert_subscribe_consent(
    payload: SubscribeConsentUpsert,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    if not ctx.user_id or not ctx.tenant_id:
        raise HTTPException(status_code=403, detail="当前用户不允许操作")

    record = crud_notification.upsert_subscribe_consent(
        db,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        template_id=payload.template_id,
        accept_status=payload.accept_status,
        source_page=payload.source_page,
    )
    return {
        "id": record.id,
        "template_id": record.template_id,
        "accept_status": record.accept_status,
        "accept_time": record.accept_time,
    }


@router.get("/config", response_model=SubscribeConfigResponse)
def get_subscribe_config(
    db: Session = Depends(deps.get_db),
    _ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    scenes = notification_center.list_scene_configs(db, _ctx.tenant_id)
    scene_map = {item["scene"]: item for item in scenes}
    return SubscribeConfigResponse(
        enabled=settings.WECHAT_SUBSCRIBE_ENABLED,
        refund_success_template_id=scene_map.get(notification_center.SCENE_REFUND_SUCCESS, {}).get("template_id"),
        refund_failed_template_id=scene_map.get(notification_center.SCENE_REFUND_FAILED, {}).get("template_id"),
        activity_remind_template_id=scene_map.get(notification_center.SCENE_ACTIVITY_REMIND_30M, {}).get("template_id"),
        registration_success_template_id=scene_map.get(notification_center.SCENE_REGISTRATION_SUCCESS, {}).get("template_id"),
        registration_received_template_id=scene_map.get(notification_center.SCENE_REGISTRATION_RECEIVED, {}).get("template_id"),
        review_result_template_id=scene_map.get(notification_center.SCENE_REVIEW_RESULT, {}).get("template_id"),
        retry_max=settings.WECHAT_SUBSCRIBE_RETRY_MAX,
        scenes=[NotificationSceneConfigItem(**item) for item in scenes],
    )


@router.get("/scene-configs", response_model=list[NotificationSceneConfigItem])
def list_scene_configs(
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    scenes = notification_center.list_scene_configs(db, ctx.tenant_id)
    return [NotificationSceneConfigItem(**item) for item in scenes]


@router.put("/scene-configs/{scene}", response_model=NotificationSceneConfigItem)
def upsert_scene_config(
    scene: str,
    payload: NotificationSceneConfigUpsert,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    try:
        notification_center.get_scene_config(db, ctx.tenant_id, scene)
    except KeyError:
        raise HTTPException(status_code=404, detail="通知场景不存在")

    notification_center.upsert_scene_config(
        db,
        tenant_id=ctx.tenant_id,
        scene=scene,
        name=payload.name,
        description=payload.description,
        enabled=payload.enabled,
        template_id=payload.template_id,
        page_path=payload.page_path,
        payload_template_json=payload.payload_template_json,
    )
    scene_config = notification_center.get_scene_config(db, ctx.tenant_id, scene)
    return NotificationSceneConfigItem(**scene_config)


@router.post("/tasks/{task_id}/retry", response_model=MessageTaskRetryResponse)
def retry_message_task(
    task_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    task = crud_notification.get_message_task(db, task_id, ctx.tenant_id)
    if not task:
        raise HTTPException(status_code=404, detail="通知任务不存在")
    if task.status not in {crud_notification.TASK_STATUS_FAILED, crud_notification.TASK_STATUS_DEAD}:
        raise HTTPException(status_code=400, detail="当前状态不允许重试")

    updated = crud_notification.retry_message_task(db, task)
    return MessageTaskRetryResponse(
        task_id=updated.id,
        status=updated.status,
        retry_count=updated.retry_count,
        max_retry=updated.max_retry,
        next_retry_at=updated.next_retry_at,
    )


@router.post("/refund-result/enqueue")
def enqueue_refund_notify(
    payload: RefundNotifyEnqueueRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    order = db.query(PaymentOrder).filter(
        PaymentOrder.order_no == payload.order_no,
        PaymentOrder.tenant_id == ctx.tenant_id,
    ).first()
    if not order or not order.user_id:
        raise HTTPException(status_code=404, detail="订单不存在")

    credential = db.query(UserCredential).filter(
        UserCredential.user_id == order.user_id,
        UserCredential.tenant_id == ctx.tenant_id,
        UserCredential.credential_type == "wechat",
        UserCredential.status == 1,
    ).first()
    if not credential:
        raise HTTPException(status_code=400, detail="用户缺少微信绑定，无法发送通知")

    template_id = (
        settings.WECHAT_SUBSCRIBE_REFUND_SUCCESS_TEMPLATE_ID
        if payload.result == "success"
        else settings.WECHAT_SUBSCRIBE_REFUND_FAILED_TEMPLATE_ID
    )
    if not template_id:
        raise HTTPException(status_code=400, detail="退款通知模板未配置")

    scene = "refund_success" if payload.result == "success" else "refund_failed"
    rendered_message = notification_center.render_scene_message(
        db,
        tenant_id=ctx.tenant_id,
        scene=scene,
        context={
            "order_no": order.order_no[:20],
            "amount_yuan": f"{order.actual_fee / 100:.2f}",
        },
    )
    if not rendered_message:
        raise HTTPException(status_code=400, detail="当前通知场景未启用或模板未配置")

    task = crud_notification.enqueue_message_task(
        db,
        tenant_id=ctx.tenant_id,
        scene=scene,
        biz_id=order.id,
        user_id=order.user_id,
        openid=credential.identifier,
        template_id=template_id,
        payload=rendered_message["payload"],
        page_path=rendered_message["page_path"],
        max_retry=settings.WECHAT_SUBSCRIBE_RETRY_MAX,
    )
    return {"task_id": task.id, "status": task.status}
