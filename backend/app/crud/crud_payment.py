"""
支付订单数据库操作
"""
import json
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import and_
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.schemas import PaymentOrder

PAYMENT_STATUS_CREATING = 4
PAYMENT_STATUS_PENDING = 0
PAYMENT_STATUS_SUCCESS = 1
PAYMENT_STATUS_FAILED = 2
PAYMENT_STATUS_CLOSED = 3


def create_payment_order(
    db: Session,
    order_no: str,
    activity_id: int,
    user_id: Optional[int],
    openid: str,
    suggested_fee: int,
    actual_fee: int,
    prepay_id: str,
    tenant_id: int,
    participant_name: Optional[str] = None,
    phone: Optional[str] = None,
    participant_snapshot: Optional[dict[str, Any]] = None,
    expire_minutes: int = 30,
    status: int = PAYMENT_STATUS_PENDING,
) -> PaymentOrder:
    """
    创建支付订单

    Args:
        db: 数据库会话
        order_no: 商户订单号
        activity_id: 活动ID
        user_id: 用户ID
        openid: 用户 openid
        suggested_fee: 建议费用（分）
        actual_fee: 实际支付金额（分）
        prepay_id: 预支付ID
        tenant_id: 租户ID
        participant_name: 报名人姓名
        phone: 报名人手机号
        expire_minutes: 过期时间（分钟）

    Returns:
        PaymentOrder: 创建的订单
    """
    order = PaymentOrder(
        tenant_id=tenant_id,
        order_no=order_no,
        activity_id=activity_id,
        user_id=user_id,
        participant_name=participant_name,
        phone=phone,
        participant_snapshot=(
            json.dumps(participant_snapshot, ensure_ascii=False)
            if participant_snapshot is not None else None
        ),
        suggested_fee=suggested_fee,
        actual_fee=actual_fee,
        status=status,
        openid=openid,
        prepay_id=prepay_id,
        expire_at=datetime.now() + timedelta(minutes=expire_minutes),
        create_time=datetime.now(),
        update_time=datetime.now(),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def get_payment_order_by_order_no(
    db: Session,
    order_no: str,
    tenant_id: int,
) -> Optional[PaymentOrder]:
    """根据订单号查询订单"""
    return db.query(PaymentOrder).filter(
        and_(
            PaymentOrder.order_no == order_no,
            PaymentOrder.tenant_id == tenant_id,
        )
    ).first()


def get_payment_order_by_id(
    db: Session,
    order_id: int,
    tenant_id: int,
) -> Optional[PaymentOrder]:
    """根据ID查询订单"""
    return db.query(PaymentOrder).filter(
        and_(
            PaymentOrder.id == order_id,
            PaymentOrder.tenant_id == tenant_id,
        )
    ).first()


def get_pending_payment_order_for_user_activity(
    db: Session,
    activity_id: int,
    user_id: int,
    tenant_id: int,
) -> Optional[PaymentOrder]:
    """查询同一用户在同一活动下尚未结束的支付订单"""
    now = datetime.now()
    return db.query(PaymentOrder).filter(
        and_(
            PaymentOrder.activity_id == activity_id,
            PaymentOrder.user_id == user_id,
            PaymentOrder.tenant_id == tenant_id,
            PaymentOrder.status.in_([PAYMENT_STATUS_CREATING, PAYMENT_STATUS_PENDING]),
            PaymentOrder.expire_at > now,
        )
    ).order_by(PaymentOrder.create_time.desc()).first()


def mark_payment_order_pending(
    db: Session,
    order: PaymentOrder,
    *,
    openid: str,
    prepay_id: str,
) -> PaymentOrder:
    """微信预下单成功后，将订单激活为待支付"""
    order.openid = openid
    order.prepay_id = prepay_id
    order.status = PAYMENT_STATUS_PENDING
    order.update_time = datetime.now()
    db.commit()
    db.refresh(order)
    return order


def mark_payment_order_failed(
    db: Session,
    order: PaymentOrder,
    *,
    commit: bool = True,
) -> PaymentOrder:
    """标记订单创建或支付失败"""
    persistent_order = order
    identity = sa_inspect(order).identity
    if identity:
        persistent_order = db.get(PaymentOrder, identity[0]) or order

    persistent_order.status = PAYMENT_STATUS_FAILED
    persistent_order.update_time = datetime.now()
    if commit:
        db.commit()
    else:
        db.flush()
    return persistent_order


def parse_participant_snapshot(order: PaymentOrder) -> dict[str, Any]:
    """解析报名快照"""
    if not order.participant_snapshot:
        raise HTTPException(status_code=500, detail="支付订单缺少报名快照")
    try:
        snapshot = json.loads(order.participant_snapshot)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="支付订单报名快照损坏") from exc
    if not isinstance(snapshot, dict):
        raise HTTPException(status_code=500, detail="支付订单报名快照格式错误")
    return snapshot


def close_expired_orders(db: Session, tenant_id: Optional[int] = None) -> int:
    """
    关闭过期订单

    Args:
        db: 数据库会话
        tenant_id: 租户ID，None 表示处理所有租户

    Returns:
        int: 关闭的订单数量
    """
    now = datetime.now()
    query = db.query(PaymentOrder).filter(
        and_(
            PaymentOrder.status == 0,  # 待支付
            PaymentOrder.expire_at < now,
        )
    )
    if tenant_id is not None:
        query = query.filter(PaymentOrder.tenant_id == tenant_id)

    expired_orders = query.all()

    count = 0
    for order in expired_orders:
        order.status = 3  # 关闭
        order.update_time = now
        count += 1

    if count > 0:
        db.commit()

    return count
