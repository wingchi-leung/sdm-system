from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud import crud_notification
from app.models.notification import (
    MessageTaskRetryResponse,
    RefundNotifyEnqueueRequest,
    SubscribeConfigResponse,
    SubscribeConsentUpsert,
)
from app.schemas import PaymentOrder, UserCredential

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
    _ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    return SubscribeConfigResponse(
        enabled=settings.WECHAT_SUBSCRIBE_ENABLED,
        refund_success_template_id=settings.WECHAT_SUBSCRIBE_REFUND_SUCCESS_TEMPLATE_ID,
        refund_failed_template_id=settings.WECHAT_SUBSCRIBE_REFUND_FAILED_TEMPLATE_ID,
        activity_remind_template_id=settings.WECHAT_SUBSCRIBE_ACTIVITY_REMIND_TEMPLATE_ID,
        retry_max=settings.WECHAT_SUBSCRIBE_RETRY_MAX,
    )


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
    payload_data = {
        "thing1": {"value": f"订单{order.order_no}"[:20]},
        "amount2": {"value": f"{order.actual_fee / 100:.2f}元"},
        "phrase3": {"value": "退款成功" if payload.result == "success" else "退款失败"},
    }
    task = crud_notification.enqueue_message_task(
        db,
        tenant_id=ctx.tenant_id,
        scene=scene,
        biz_id=order.id,
        user_id=order.user_id,
        openid=credential.identifier,
        template_id=template_id,
        payload=payload_data,
        max_retry=settings.WECHAT_SUBSCRIBE_RETRY_MAX,
    )
    return {"task_id": task.id, "status": task.status}
