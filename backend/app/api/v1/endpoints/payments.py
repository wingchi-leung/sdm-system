"""
微信支付 API 端点
"""
import json
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.crud import crud_participant, crud_payment
from app.models.participant import ParticipantCreate
from app.models.payment import (
    PaymentOrderCreate,
    PaymentOrderResponse,
    PaymentOrderDetail,
)
from app.schemas import Activity, PaymentOrder, User
from app.services.wechat_pay import get_wechat_pay_service

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


def _lock_user_for_payment(db: Session, user_id: int, tenant_id: int) -> User:
    """锁定当前用户，串行化同一用户的支付下单请求"""
    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).with_for_update().first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


def _ensure_user_can_pay(user: User) -> None:
    """校验当前登录用户是否允许继续支付报名"""
    if user.isblock == 1:
        reason = user.block_reason or "您已被限制报名"
        raise HTTPException(status_code=403, detail=f"无法报名：{reason}")


def _build_participant_snapshot(order_in: PaymentOrderCreate, user_id: int) -> dict[str, Any]:
    """构建报名快照，供支付成功回调复原参与记录"""
    snapshot = order_in.model_dump(exclude={"actual_fee"})
    snapshot["user_id"] = user_id
    return snapshot


def _merge_profile_fields(
    order_in: PaymentOrderCreate,
    current_user: User,
) -> PaymentOrderCreate:
    """已登录支付报名时，以当前登录人的资料为准，避免篡改只读字段。"""
    return order_in.model_copy(
        update={
            "user_id": current_user.id,
            "participant_name": current_user.name or order_in.participant_name,
            "phone": current_user.phone or order_in.phone,
            "identity_number": current_user.identity_number or order_in.identity_number,
            "identity_type": current_user.identity_type or order_in.identity_type,
            "sex": current_user.sex or order_in.sex,
            "age": current_user.age if current_user.age is not None else order_in.age,
            "occupation": current_user.occupation or order_in.occupation,
            "email": current_user.email or order_in.email,
            "industry": current_user.industry or order_in.industry,
        }
    )


def _close_remote_order_safely(pay_service: Any, order_no: str) -> None:
    """本地落单失败后，尽力关闭微信侧订单，避免留下失联订单"""
    try:
        pay_service.close_order(order_no)
        logger.warning("本地落单失败，已尝试关闭微信订单: %s", order_no)
    except Exception as close_error:
        logger.exception(
            "本地落单失败，关闭微信订单也失败: %s, error=%s",
            order_no,
            close_error,
        )


def _validate_notify_resource(order: PaymentOrder, resource: dict[str, Any]) -> None:
    """校验微信回调中的关键业务字段"""
    if resource.get("appid") != settings.WECHAT_APPID:
        raise HTTPException(status_code=400, detail="回调 appid 不匹配")
    if resource.get("mchid") != settings.WECHAT_PAY_MCH_ID:
        raise HTTPException(status_code=400, detail="回调商户号不匹配")

    amount = resource.get("amount") or {}
    if amount.get("total") != order.actual_fee:
        raise HTTPException(status_code=400, detail="回调金额与订单不一致")

    payer = resource.get("payer") or {}
    if payer.get("openid") != order.openid:
        raise HTTPException(status_code=400, detail="回调付款人不匹配")


def _is_remote_payment_success(remote_order: dict[str, Any]) -> bool:
    """判断微信查单结果是否已支付成功"""
    return (remote_order or {}).get("trade_state") == "SUCCESS"


def _build_order_detail(order: PaymentOrder, participant_enroll_status: int | None = None) -> PaymentOrderDetail:
    """构造订单详情响应"""
    return PaymentOrderDetail(
        id=order.id,
        order_no=order.order_no,
        transaction_id=order.transaction_id,
        activity_id=order.activity_id,
        user_id=order.user_id,
        participant_id=order.participant_id,
        suggested_fee=order.suggested_fee,
        actual_fee=order.actual_fee,
        status=order.status,
        openid=order.openid,
        prepay_id=order.prepay_id,
        paid_at=order.paid_at,
        participant_enroll_status=participant_enroll_status,
        expire_at=order.expire_at,
        create_time=order.create_time,
        update_time=order.update_time,
    )


def _build_order_response_from_existing_pending(
    order: PaymentOrder,
    pay_service: Any,
) -> PaymentOrderResponse:
    """将未过期待支付订单转换为可恢复支付的响应"""
    if order.status != crud_payment.PAYMENT_STATUS_PENDING or not order.prepay_id:
        raise HTTPException(status_code=400, detail="当前订单暂不可继续支付，请稍后再试")

    payment_params = pay_service.get_mini_program_payment_params(order.prepay_id)
    return PaymentOrderResponse(
        order_no=order.order_no,
        activity_id=order.activity_id,
        suggested_fee=order.suggested_fee,
        actual_fee=order.actual_fee,
        status=order.status,
        payment_params=payment_params,
    )


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

    if ctx.role == "admin":
        raise HTTPException(status_code=403, detail="管理员账号不能直接报名或发起支付")

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
    if order_in.actual_fee > settings.MAX_PAYMENT_AMOUNT:
        raise HTTPException(
            status_code=400,
            detail=f"支付金额超出上限 {settings.MAX_PAYMENT_AMOUNT / 100:.2f} 元",
        )

    # 3. 检查是否已报名或存在未完成订单
    current_user = _lock_user_for_payment(db, user_id, tenant_id)
    _ensure_user_can_pay(current_user)
    normalized_order = _merge_profile_fields(order_in, current_user)
    existing_participant = crud_participant.get_participant_by_user(
        db, normalized_order.activity_id, user_id, tenant_id
    )
    if existing_participant or crud_participant.check_participant_exists(
        db, normalized_order.activity_id, normalized_order.identity_number, tenant_id
    ):
        raise HTTPException(status_code=400, detail="已报名，无需重复报名")

    pending_order = crud_payment.get_pending_payment_order_for_user_activity(
        db, normalized_order.activity_id, user_id, tenant_id
    )
    if pending_order:
        if pending_order.status == crud_payment.PAYMENT_STATUS_PENDING and pending_order.prepay_id:
            pay_service = get_wechat_pay_service()
            return _build_order_response_from_existing_pending(pending_order, pay_service)
        raise HTTPException(status_code=400, detail="订单创建中，请稍后再试")

    # 4. 获取用户 openid
    openid = _get_user_openid(db, user_id, tenant_id)
    participant_snapshot = _build_participant_snapshot(normalized_order, user_id)

    # 5. 创建微信支付订单
    try:
        pay_service = get_wechat_pay_service()
        order_no = pay_service.generate_order_no()
        description = f"活动报名-{activity.activity_name}"

        local_order = crud_payment.create_payment_order(
            db=db,
            order_no=order_no,
            activity_id=normalized_order.activity_id,
            user_id=user_id,
            openid=openid,
            suggested_fee=activity.suggested_fee,
            actual_fee=normalized_order.actual_fee,
            prepay_id=None,
            tenant_id=tenant_id,
            participant_name=normalized_order.participant_name,
            phone=normalized_order.phone,
            participant_snapshot=participant_snapshot,
            status=crud_payment.PAYMENT_STATUS_CREATING,
        )

        # 调用微信统一下单
        try:
            result = pay_service.create_jsapi_order(
                order_no=order_no,
                amount=normalized_order.actual_fee,
                description=description,
                openid=openid,
            )
        except Exception:
            crud_payment.mark_payment_order_failed(db, local_order)
            raise

        prepay_id = result.get("prepay_id")
        if not prepay_id:
            logger.error(f"微信下单失败: {result}")
            crud_payment.mark_payment_order_failed(db, local_order)
            raise HTTPException(status_code=500, detail="创建支付订单失败")

        # 6. 激活本地订单
        try:
            db_order = crud_payment.mark_payment_order_pending(
                db,
                local_order,
                openid=openid,
                prepay_id=prepay_id,
            )
        except Exception:
            db.rollback()
            crud_payment.mark_payment_order_failed(db, local_order)
            _close_remote_order_safely(pay_service, order_no)
            raise

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
    except HTTPException:
        raise
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
        if order.status == crud_payment.PAYMENT_STATUS_SUCCESS:
            logger.info(f"订单 {order_no} 已处理，跳过重复回调")
            return {"code": "SUCCESS", "message": "已处理"}

        if order.status == crud_payment.PAYMENT_STATUS_CLOSED:
            try:
                remote_order = pay_service.query_order(order_no)
            except Exception as query_error:
                logger.warning("关闭订单 %s 后查询微信状态失败: %s", order_no, query_error)
                return {"code": "FAIL", "message": "订单已关闭"}
            if not _is_remote_payment_success(remote_order):
                logger.info("订单 %s 已关闭且微信侧未支付成功", order_no)
                return {"code": "SUCCESS", "message": "订单已关闭"}
            logger.warning("订单 %s 本地已关闭，但微信侧已支付成功，继续按成功回调处理", order_no)

        if trade_state == "SUCCESS":
            try:
                _validate_notify_resource(order, resource)
                snapshot = crud_payment.parse_participant_snapshot(order)
                snapshot.setdefault("user_id", order.user_id)

                # 用支付时的最新用户资料覆盖快照中的用户字段，防止快照过时导致参与者信息与用户当前资料不一致
                if order.user_id:
                    fresh_user = db.query(User).filter(
                        User.id == order.user_id,
                        User.tenant_id == tenant_id,
                    ).first()
                    if fresh_user:
                        if fresh_user.name:
                            snapshot["participant_name"] = fresh_user.name
                        if fresh_user.phone:
                            snapshot["phone"] = fresh_user.phone
                        if fresh_user.identity_number:
                            snapshot["identity_number"] = fresh_user.identity_number
                        if fresh_user.identity_type:
                            snapshot["identity_type"] = fresh_user.identity_type
                        if fresh_user.sex:
                            snapshot["sex"] = fresh_user.sex
                        if fresh_user.age is not None:
                            snapshot["age"] = fresh_user.age
                        if fresh_user.occupation:
                            snapshot["occupation"] = fresh_user.occupation
                        if fresh_user.email:
                            snapshot["email"] = fresh_user.email
                        if fresh_user.industry:
                            snapshot["industry"] = fresh_user.industry

                participant_in = ParticipantCreate.model_validate(snapshot)

                participant = crud_participant.create_participant(
                    db=db,
                    participant=participant_in,
                    tenant_id=tenant_id,
                    commit=False,
                )
                participant.payment_status = 2
                participant.payment_order_id = order.id
                participant.paid_amount = order.actual_fee

                # 支付成功，在事务中更新订单状态和创建参与者
                order.status = crud_payment.PAYMENT_STATUS_SUCCESS
                order.transaction_id = transaction_id
                order.callback_raw = json.dumps(resource, ensure_ascii=False)
                order.paid_at = datetime.now()

                # 更新订单关联的参与者ID
                order.participant_id = participant.id
                order.update_time = datetime.now()

                db.commit()
                logger.info(
                    "订单 %s 支付成功，参与者 %s 已落库",
                    order_no,
                    participant.id,
                )

            except Exception as e:
                db.rollback()
                logger.exception(f"处理支付成功回调异常: {e}")
                return {"code": "FAIL", "message": "处理失败"}

        else:
            # 支付失败
            order.status = crud_payment.PAYMENT_STATUS_FAILED
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

    participant_enroll_status = None
    if order.participant_id:
        participant = crud_participant.get_participant_by_user(
            db,
            activity_id=order.activity_id,
            user_id=order.user_id,
            tenant_id=ctx.tenant_id,
        )
        if participant and participant.id == order.participant_id:
            participant_enroll_status = participant.enroll_status

    return _build_order_detail(order, participant_enroll_status)
