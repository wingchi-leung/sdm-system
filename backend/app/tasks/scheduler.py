"""
后台定时任务
用于处理支付订单超时关闭等定时任务
"""
import logging
import threading
import time
from typing import Optional
import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.database import SessionLocal
from app.schemas import Activity, ActivityParticipant, PaymentOrder, User, UserCredential
from app.services.wechat_pay import get_wechat_pay_service
from app.services import notification_center
from app.services.wechat_subscribe import send_subscribe_message
from app.crud import crud_notification, crud_payment
from app.core.config import settings

logger = logging.getLogger(__name__)

# 任务停止标志
_stop_event = Optional[threading.Event]
_scheduler_thread: Optional[threading.Thread] = None
WECHAT_CREDENTIAL_TYPE = "wechat"


def _unwrap_wechat_result(result):
    """兼容真实支付服务与测试桩的返回格式。"""
    if isinstance(result, tuple) and len(result) == 2:
        return result[0], result[1] or {}
    if isinstance(result, dict):
        return 200, result
    raise ValueError("微信支付服务返回格式不正确")


def _should_mark_closed_from_remote_query(remote_order: dict | None) -> bool:
    """根据微信查单结果判断是否可安全关闭本地订单"""
    trade_state = (remote_order or {}).get("trade_state")
    return trade_state in {"NOTPAY", "CLOSED", "REVOKED", "PAYERROR"}


def close_expired_payment_orders():
    """
    关闭过期的支付订单。
    - PENDING (status=0)：调用微信关单接口，再更新本地状态
    - CREATING (status=4)：直接标记为失败，无需调用微信（预下单未完成）
    """
    db: Session = SessionLocal()
    try:
        from datetime import datetime

        now = datetime.now()

        # 1. 清理长时间卡在 CREATING 状态的订单（预下单未完成，微信侧无记录）
        stuck_creating_orders = db.query(PaymentOrder).filter(
            and_(
                PaymentOrder.status == crud_payment.PAYMENT_STATUS_CREATING,
                PaymentOrder.expire_at < now,
            )
        ).all()
        if stuck_creating_orders:
            logger.info(f"发现 {len(stuck_creating_orders)} 个卡住的 CREATING 订单，直接标记失败")
            for order in stuck_creating_orders:
                order.status = crud_payment.PAYMENT_STATUS_FAILED
                order.update_time = now
            db.commit()

        # 2. 查询所有待支付的过期订单
        expired_orders = db.query(PaymentOrder).filter(
            and_(
                PaymentOrder.status == crud_payment.PAYMENT_STATUS_PENDING,
                PaymentOrder.expire_at < now,
            )
        ).all()

        if not expired_orders:
            return

        logger.info(f"发现 {len(expired_orders)} 个过期订单待处理")

        pay_service = get_wechat_pay_service()
        closed_count = 0
        failed_count = 0

        for order in expired_orders:
            try:
                locked_order = db.query(PaymentOrder).filter(
                    PaymentOrder.id == order.id
                ).with_for_update().first()
                if not locked_order or locked_order.status != crud_payment.PAYMENT_STATUS_PENDING:
                    continue

                # 调用微信关闭订单接口
                pay_service.close_order(locked_order.order_no)
                # 更新订单状态
                locked_order.status = crud_payment.PAYMENT_STATUS_CLOSED
                locked_order.update_time = now
                closed_count += 1
                logger.info(f"关闭过期订单: {locked_order.order_no}")
            except Exception as e:
                try:
                    _, remote_order = _unwrap_wechat_result(pay_service.query_order(order.order_no))
                except Exception as query_error:
                    failed_count += 1
                    logger.warning(
                        "关闭订单 %s 时微信接口失败，且查单也失败: %s / %s",
                        order.order_no,
                        e,
                        query_error,
                    )
                    continue

                if _should_mark_closed_from_remote_query(remote_order):
                    locked_order = db.query(PaymentOrder).filter(
                        PaymentOrder.id == order.id
                    ).with_for_update().first()
                    if locked_order and locked_order.status == crud_payment.PAYMENT_STATUS_PENDING:
                        locked_order.status = crud_payment.PAYMENT_STATUS_CLOSED
                        locked_order.update_time = now
                        closed_count += 1
                        logger.warning(
                            "关闭订单 %s 时微信接口失败，但查单确认未支付，已关闭本地订单",
                            order.order_no,
                        )
                    continue

                failed_count += 1
                logger.warning(
                    "关闭订单 %s 时微信接口失败，查单结果为已支付或支付中，保留待处理状态: %s",
                    order.order_no,
                    remote_order,
                )

        db.commit()
        logger.info(f"过期订单处理完成: 成功 {closed_count}, 失败 {failed_count}")

    except Exception as e:
        logger.exception(f"关闭过期订单任务异常: {e}")
        db.rollback()
    finally:
        db.close()


def queue_activity_remind_tasks(lookahead_seconds: int = 300):
    """把活动开始前 30 分钟提醒按幂等规则入队。"""
    if not settings.WECHAT_SUBSCRIBE_ENABLED:
        return
    template_id = settings.WECHAT_SUBSCRIBE_ACTIVITY_REMIND_TEMPLATE_ID
    if not template_id:
        return

    db: Session = SessionLocal()
    try:
        now = datetime.now()
        window_start = now + timedelta(minutes=30)
        window_end = window_start + timedelta(seconds=max(lookahead_seconds, 60))
        participants = (
            db.query(ActivityParticipant, Activity, UserCredential)
            .join(
                Activity,
                and_(
                    Activity.id == ActivityParticipant.activity_id,
                    Activity.tenant_id == ActivityParticipant.tenant_id,
                ),
            )
            .join(
                User,
                and_(
                    User.id == ActivityParticipant.user_id,
                    User.tenant_id == ActivityParticipant.tenant_id,
                ),
            )
            .join(
                UserCredential,
                and_(
                    UserCredential.user_id == ActivityParticipant.user_id,
                    UserCredential.tenant_id == ActivityParticipant.tenant_id,
                    UserCredential.credential_type == WECHAT_CREDENTIAL_TYPE,
                    UserCredential.status == 1,
                ),
            )
            .filter(
                Activity.start_time >= window_start,
                Activity.start_time < window_end,
                ActivityParticipant.review_status == 1,
                ActivityParticipant.payment_status.in_([0, 2]),
                User.isblock == 0,
            )
            .all()
        )

        for participant, activity, credential in participants:
            rendered_message = notification_center.render_scene_message(
                db,
                tenant_id=participant.tenant_id,
                scene=notification_center.SCENE_ACTIVITY_REMIND_30M,
                context={
                    "activity_id": activity.id,
                    "activity_name": activity.activity_name[:20],
                    "start_time": activity.start_time.strftime("%Y-%m-%d %H:%M"),
                    "location": (activity.location or "线上活动")[:20],
                },
            )
            if not rendered_message:
                continue
            crud_notification.enqueue_message_task(
                db,
                tenant_id=participant.tenant_id,
                scene="activity_remind_30m",
                biz_id=participant.id,
                user_id=participant.user_id,
                openid=credential.identifier,
                template_id=rendered_message["template_id"],
                payload=rendered_message["payload"],
                page_path=rendered_message["page_path"],
                max_retry=settings.WECHAT_SUBSCRIBE_RETRY_MAX,
            )
    except Exception as exc:
        logger.exception("入队活动提醒通知失败: %s", exc)
        db.rollback()
    finally:
        db.close()


def queue_refund_notify_tasks(limit: int = 200):
    """根据退款状态自动入队退款结果通知。"""
    if not settings.WECHAT_SUBSCRIBE_ENABLED:
        return

    db: Session = SessionLocal()
    try:
        template_success = settings.WECHAT_SUBSCRIBE_REFUND_SUCCESS_TEMPLATE_ID
        template_failed = settings.WECHAT_SUBSCRIBE_REFUND_FAILED_TEMPLATE_ID
        if not template_success and not template_failed:
            return

        orders = (
            db.query(PaymentOrder, UserCredential)
            .join(
                UserCredential,
                and_(
                    UserCredential.user_id == PaymentOrder.user_id,
                    UserCredential.tenant_id == PaymentOrder.tenant_id,
                    UserCredential.credential_type == WECHAT_CREDENTIAL_TYPE,
                    UserCredential.status == 1,
                ),
            )
            .filter(
                PaymentOrder.user_id.is_not(None),
                PaymentOrder.refund_status.in_([3, 4]),
            )
            .order_by(PaymentOrder.id.desc())
            .limit(limit)
            .all()
        )

        for order, credential in orders:
            if order.refund_status == 3 and template_success:
                scene = notification_center.SCENE_REFUND_SUCCESS
                phrase = "退款成功"
            elif order.refund_status == 4 and template_failed:
                scene = notification_center.SCENE_REFUND_FAILED
                phrase = "退款失败"
            else:
                continue

            rendered_message = notification_center.render_scene_message(
                db,
                tenant_id=order.tenant_id,
                scene=scene,
                context={
                    "order_no": order.order_no[:20],
                    "amount_yuan": f"{(order.refund_amount or order.actual_fee) / 100:.2f}",
                    "result_phrase": phrase,
                },
            )
            if not rendered_message:
                continue
            crud_notification.enqueue_message_task(
                db,
                tenant_id=order.tenant_id,
                scene=scene,
                biz_id=order.id,
                user_id=order.user_id,
                openid=credential.identifier,
                template_id=rendered_message["template_id"],
                payload=rendered_message["payload"],
                page_path=rendered_message["page_path"],
                max_retry=settings.WECHAT_SUBSCRIBE_RETRY_MAX,
            )
    except Exception as exc:
        logger.exception("入队退款结果通知失败: %s", exc)
        db.rollback()
    finally:
        db.close()


def dispatch_message_tasks(batch_size: int = 20):
    """发送待处理通知任务，失败按策略重试。"""
    if not settings.WECHAT_SUBSCRIBE_ENABLED:
        return

    db: Session = SessionLocal()
    try:
        tasks = crud_notification.get_retryable_tasks(db, limit=batch_size)
        for task in tasks:
            locked_task = crud_notification.try_mark_task_sending(db, task.id)
            if not locked_task:
                continue
            try:
                payload = json.loads(locked_task.payload_json)
                send_subscribe_message(
                    openid=locked_task.openid,
                    template_id=locked_task.template_id,
                    data=payload,
                    page=locked_task.page_path,
                )
                crud_notification.mark_task_success(db, locked_task)
            except Exception as exc:
                crud_notification.mark_task_failed(db, locked_task, str(exc))
    except Exception as exc:
        logger.exception("发送通知任务失败: %s", exc)
        db.rollback()
    finally:
        db.close()


def _scheduler_worker(interval_seconds: int = 300):
    """
    定时任务工作线程

    Args:
        interval_seconds: 执行间隔（秒），默认 5 分钟
    """
    logger.info(f"定时任务线程启动，执行间隔: {interval_seconds} 秒")

    while not _stop_event.is_set():
        try:
            close_expired_payment_orders()
            queue_activity_remind_tasks(lookahead_seconds=interval_seconds)
            queue_refund_notify_tasks()
            dispatch_message_tasks()
        except Exception as e:
            logger.exception(f"定时任务执行异常: {e}")

        # 等待下一次执行，或收到停止信号
        _stop_event.wait(interval_seconds)

    logger.info("定时任务线程停止")


def start_scheduler(interval_seconds: int = 300):
    """
    启动定时任务调度器

    Args:
        interval_seconds: 执行间隔（秒），默认 5 分钟
    """
    global _stop_event, _scheduler_thread

    if _scheduler_thread is not None:
        logger.warning("定时任务已经在运行，无需重复启动")
        return

    _stop_event = threading.Event()
    _scheduler_thread = threading.Thread(
        target=_scheduler_worker,
        args=(interval_seconds,),
        daemon=True,
        name="PaymentOrderScheduler",
    )
    _scheduler_thread.start()
    logger.info("定时任务调度器已启动")


def stop_scheduler():
    """停止定时任务调度器"""
    global _stop_event, _scheduler_thread

    if _stop_event is not None:
        _stop_event.set()
        logger.info("定时任务停止信号已发送")

    if _scheduler_thread is not None:
        _scheduler_thread.join(timeout=5)
        if _scheduler_thread.is_alive():
            logger.warning("定时任务线程未能在超时时间内停止")
        else:
            logger.info("定时任务线程已停止")
        _scheduler_thread = None
        _stop_event = None
