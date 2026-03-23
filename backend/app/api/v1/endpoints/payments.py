"""
微信支付 API 端点
"""
import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from typing import Optional

from app.api import deps
from app.crud import crud_payment, crud_user, crud_participant
from app.models.payment import (
    PaymentOrderCreate,
    PaymentOrderResponse,
    PaymentOrderDetail,
)
from app.schemas import Activity, User, PaymentOrder, ActivityParticipant
from app.services.wechat_pay import get_wechat_pay_service, WeChatPayService

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_activity_or_404(db: Session, activity_id: int, tenant_id: int) -> Activity:
    """获取活动，不存在则抛出404"""
    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id,
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")
    return activity


def _get_user_openid(db: Session, user_id: int, tenant_id: int) -> str:
    """获取用户的 openid"""
    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).first()
    if not user or not user.wx_openid:
        raise HTTPException(status_code=400, detail="用户未绑定微信，无法支付")
    return user.wx_openid


@router.post("/create", response_model=PaymentOrderResponse)
def create_payment_order(
    order_in: PaymentOrderCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """
    创建支付订单

    流程：
    1. 验证活动存在且需要支付
    2. 验证支付金额是否符合要求
    3. 创建微信支付订单
    4. 保存订单到数据库
    5. 返回小程序支付参数
    """
    tenant_id = ctx.tenant_id
    user_id = ctx.user_id

    # 1. 验证活动
    activity = _get_activity_or_404(db, order_in.activity_id, tenant_id)

    if activity.require_payment != 1:
        raise HTTPException(status_code=400, detail="该活动不需要支付")

    # 2. 验证支付金额（必须 >= 建议费用，且大于0）
    if order_in.actual_fee <= 0:
        raise HTTPException(
            status_code=400,
            detail="支付金额必须大于0",
        )
    if order_in.actual_fee < activity.suggested_fee:
        raise HTTPException(
            status_code=400,
            detail=f"支付金额不能低于建议费用 {activity.suggested_fee / 100:.2f} 元",
        )
    # 验证支付金额上限（防止超大金额订单）
    from app.core.config import settings
    if order_in.actual_fee > settings.MAX_PAYMENT_AMOUNT:
        raise HTTPException(
            status_code=400,
            detail=f"支付金额超出上限 {settings.MAX_PAYMENT_AMOUNT / 100:.2f} 元",
        )

    # 3. 检查是否已报名
    if crud_participant.check_participant_exists(
        db, order_in.activity_id, order_in.identity_number, tenant_id
    ):
        raise HTTPException(status_code=400, detail="已报名，无需重复报名")

    # 4. 获取用户 openid
    openid = _get_user_openid(db, user_id, tenant_id)

    # 5. 创建微信支付订单
    try:
        pay_service = get_wechat_pay_service()
        order_no = pay_service.generate_order_no()
        description = f"活动报名-{activity.activity_name}"

        # 调用微信统一下单
        result = pay_service.create_jsapi_order(
            order_no=order_no,
            amount=order_in.actual_fee,
            description=description,
            openid=openid,
        )

        prepay_id = result.get("prepay_id")
        if not prepay_id:
            logger.error(f"微信下单失败: {result}")
            raise HTTPException(status_code=500, detail="创建支付订单失败")

        # 6. 保存订单到数据库
        db_order = crud_payment.create_payment_order(
            db=db,
            order_no=order_no,
            activity_id=order_in.activity_id,
            user_id=user_id,
            openid=openid,
            suggested_fee=activity.suggested_fee,
            actual_fee=order_in.actual_fee,
            prepay_id=prepay_id,
            tenant_id=tenant_id,
            participant_name=order_in.participant_name,
            phone=order_in.phone,
        )

        # 7. 获取小程序支付参数
        payment_params = pay_service.get_mini_program_payment_params(prepay_id)

        return PaymentOrderResponse(
            order_no=db_order.order_no,
            activity_id=db_order.activity_id,
            suggested_fee=db_order.suggested_fee,
            actual_fee=db_order.actual_fee,
            status=db_order.status,
            payment_params=payment_params,
        )

    except ValueError as e:
        logger.error(f"微信支付配置错误: {e}")
        raise HTTPException(status_code=500, detail="支付服务配置错误")
    except Exception as e:
        logger.exception(f"创建支付订单异常: {e}")
        raise HTTPException(status_code=500, detail="创建支付订单失败")


@router.post("/notify")
async def payment_notify(
    request: Request,
    db: Session = Depends(deps.get_db),
):
    """
    微信支付回调通知

    微信支付成功后会调用此接口通知商户
    """
    try:
        # 获取请求头和请求体
        headers = dict(request.headers)
        body = await request.body()
        body_str = body.decode("utf-8")

        # 解密回调数据
        pay_service = get_wechat_pay_service()
        decrypted_data = pay_service.decrypt_callback(headers, body_str)

        # 解析回调数据
        resource = decrypted_data.get("resource", {})
        order_no = resource.get("out_trade_no")
        transaction_id = resource.get("transaction_id")
        trade_state = resource.get("trade_state")

        if not order_no:
            logger.error("回调数据缺少订单号")
            return {"code": "FAIL", "message": "缺少订单号"}

        # 使用行锁获取订单，防止并发处理
        order = db.query(PaymentOrder).filter(
            PaymentOrder.order_no == order_no
        ).with_for_update().first()

        if not order:
            logger.error(f"订单不存在: {order_no}")
            return {"code": "FAIL", "message": "订单不存在"}

        tenant_id = order.tenant_id

        # 幂等处理：如果订单已成功，直接返回成功
        if order.status == 1:
            logger.info(f"订单 {order_no} 已处理，跳过重复回调")
            return {"code": "SUCCESS", "message": "已处理"}

        if trade_state == "SUCCESS":
            try:
                # 支付成功，在事务中更新订单状态和创建参与者
                order.status = 1  # 成功
                order.transaction_id = transaction_id
                order.callback_raw = json.dumps(decrypted_data, ensure_ascii=False)
                order.paid_at = datetime.now()

                # 创建参与者记录
                participant = ActivityParticipant(
                    tenant_id=tenant_id,
                    activity_id=order.activity_id,
                    user_id=order.user_id,
                    participant_name=order.participant_name or "",
                    phone=order.phone or "",
                    identity_number="",
                    payment_status=2,  # 已支付
                    payment_order_id=order.id,
                    paid_amount=order.actual_fee,
                )
                db.add(participant)
                db.flush()  # 获取 participant.id

                # 更新订单关联的参与者ID
                order.participant_id = participant.id

                db.commit()
                logger.info(f"订单 {order_no} 支付成功，已创建参与者记录")

            except Exception as e:
                db.rollback()
                logger.exception(f"处理支付成功回调异常: {e}")
                return {"code": "FAIL", "message": "处理失败"}

        else:
            # 支付失败
            order.status = 2  # 失败
            db.commit()
            logger.warning(f"订单 {order_no} 支付失败: {trade_state}")

        return {"code": "SUCCESS", "message": "成功"}

    except Exception as e:
        logger.exception(f"处理支付回调异常: {e}")
        return {"code": "FAIL", "message": str(e)}


@router.get("/order/{order_no}", response_model=PaymentOrderDetail)
def query_payment_order(
    order_no: str,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """
    查询订单状态
    """
    order = crud_payment.get_payment_order_by_order_no(db, order_no, ctx.tenant_id)

    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")

    # 验证订单所属用户
    if order.user_id != ctx.user_id:
        raise HTTPException(status_code=403, detail="无权访问此订单")

    return PaymentOrderDetail.model_validate(order)