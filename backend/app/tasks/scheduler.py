"""
后台定时任务
用于处理支付订单超时关闭等定时任务
"""
import logging
import threading
import time
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.database import SessionLocal
from app.schemas import PaymentOrder
from app.services.wechat_pay import get_wechat_pay_service
from app.crud import crud_payment

logger = logging.getLogger(__name__)

# 任务停止标志
_stop_event = Optional[threading.Event]
_scheduler_thread: Optional[threading.Thread] = None


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
                    _, remote_order = pay_service.query_order(order.order_no)
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
