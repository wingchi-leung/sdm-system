"""
支付订单数据库操作
"""
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from app.schemas import PaymentOrder, Activity, ActivityParticipant, User
from app.models.payment import PaymentOrderCreate


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
    expire_minutes: int = 30,
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
        suggested_fee=suggested_fee,
        actual_fee=actual_fee,
        status=0,  # 待支付
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


def update_payment_order_success(
    db: Session,
    order_no: str,
    transaction_id: str,
    callback_raw: str,
    tenant_id: int,
) -> PaymentOrder:
    """
    更新订单为支付成功状态

    Args:
        db: 数据库会话
        order_no: 商户订单号
        transaction_id: 微信交易号
        callback_raw: 回调原始数据
        tenant_id: 租户ID

    Returns:
        PaymentOrder: 更新后的订单
    """
    order = get_payment_order_by_order_no(db, order_no, tenant_id)
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")

    order.status = 1  # 成功
    order.transaction_id = transaction_id
    order.callback_raw = callback_raw
    order.paid_at = datetime.now()
    order.update_time = datetime.now()

    db.commit()
    db.refresh(order)
    return order


def update_payment_order_failed(
    db: Session,
    order_no: str,
    tenant_id: int,
) -> PaymentOrder:
    """更新订单为支付失败状态"""
    order = get_payment_order_by_order_no(db, order_no, tenant_id)
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")

    order.status = 2  # 失败
    order.update_time = datetime.now()

    db.commit()
    db.refresh(order)
    return order


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


def create_participant_with_payment(
    db: Session,
    activity_id: int,
    participant_name: str,
    phone: str,
    identity_number: Optional[str],
    user_id: Optional[int],
    payment_order_id: int,
    paid_amount: int,
    tenant_id: int,
) -> ActivityParticipant:
    """
    创建参与者记录并关联支付订单

    Args:
        db: 数据库会话
        activity_id: 活动ID
        participant_name: 参与者姓名
        phone: 手机号
        identity_number: 证件号
        user_id: 用户ID
        payment_order_id: 支付订单ID
        paid_amount: 已支付金额
        tenant_id: 租户ID

    Returns:
        ActivityParticipant: 创建的参与者记录
    """
    participant = ActivityParticipant(
        tenant_id=tenant_id,
        activity_id=activity_id,
        user_id=user_id,
        participant_name=participant_name,
        phone=phone,
        identity_number=identity_number or "",
        payment_status=2,  # 已支付
        payment_order_id=payment_order_id,
        paid_amount=paid_amount,
        create_time=datetime.now(),
        update_time=datetime.now(),
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def update_payment_order_participant(
    db: Session,
    order_id: int,
    participant_id: int,
    tenant_id: int,
) -> PaymentOrder:
    """更新订单关联的参与者ID"""
    order = get_payment_order_by_id(db, order_id, tenant_id)
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")

    order.participant_id = participant_id
    order.update_time = datetime.now()

    db.commit()
    db.refresh(order)
    return order