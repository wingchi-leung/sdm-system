"""
微信支付 API 端点
"""
import json
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import ValidationError

from app.api import deps
from app.core.config import settings
from app.crud import crud_credential, crud_notification, crud_participant, crud_payment, crud_refund
from app.models.participant import ParticipantCreate
from app.models.payment import (
    RefundCreateRequest,
    RefundDetailResponse,
    PaymentOrderCreate,
    PaymentOrderResponse,
    PaymentOrderDetail,
)
from app.schemas import Activity, ActivityParticipant, PaymentOrder, PaymentRefund, User, UserCredential
from app.services import notification_center
from app.services.wechat_pay import get_wechat_pay_service

router = APIRouter()
logger = logging.getLogger(__name__)


def _decrypt_payment_payload(payload: dict) -> dict:
    # 支付创建不再需要敏感字段解密，简化处理
    return payload


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
    """获取用户的 openid。"""
    openid = crud_credential.get_wechat_openid(db, user_id, tenant_id)
    if not openid:
        raise HTTPException(status_code=400, detail="用户未绑定微信，无法支付")
    return openid


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
    """校验当前登录用户是否允许发起支付报名"""
    if user.isblock == 1:
        reason = user.block_reason or "您已被限制报名"
        raise HTTPException(status_code=403, detail=f"无法报名：{reason}")


def _ensure_activity_enrollable(activity: Activity) -> None:
    """后端兜底校验活动是否允许报名支付。"""
    if activity.status not in (1, 2):
        raise HTTPException(status_code=400, detail="活动当前不可报名")
    if activity.end_time and datetime.now() > activity.end_time:
        raise HTTPException(status_code=400, detail="活动已结束，无法报名")


def _merge_profile_fields(
    order_in: PaymentOrderCreate,
    current_user: User,
) -> PaymentOrderCreate:
    """已登录支付报名时，以当前登录人的资料为准，避免篡改只读字段。"""
    return order_in.model_copy(
        update={
            "user_id": current_user.id,
            "participant_name": current_user.name or order_in.participant_name,
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


def _unwrap_wechat_result(result: Any) -> tuple[int | None, dict[str, Any]]:
    """兼容真实支付服务与测试桩的返回格式。"""
    if isinstance(result, tuple) and len(result) == 2:
        return result[0], result[1] or {}
    if isinstance(result, dict):
        return 200, result
    raise ValueError("微信支付服务返回格式不正确")


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


def _prepare_pending_participant(
    db: Session,
    *,
    order_in: PaymentOrderCreate,
    tenant_id: int,
    user_id: int,
) -> ActivityParticipant:
    participant_in = ParticipantCreate.model_validate(
        order_in.model_dump(exclude={"actual_fee"})
    )
    participant_in.user_id = user_id

    existing_participant = crud_participant.get_participant_by_user(
        db, participant_in.activity_id, user_id, tenant_id
    )
    if existing_participant is None:
        # 只按 user_id 检查是否已报名
        pass

    if existing_participant:
        if existing_participant.payment_status == 2:
            raise HTTPException(status_code=400, detail="已报名，无需重复报名")
        existing_participant.participant_name = participant_in.participant_name
        existing_participant.why_join = participant_in.why_join
        existing_participant.channel = participant_in.channel
        existing_participant.expectation = participant_in.expectation
        existing_participant.activity_understanding = participant_in.activity_understanding
        existing_participant.has_questions = participant_in.has_questions
        existing_participant.payment_status = 1
        existing_participant.paid_amount = 0
        db.commit()
        db.refresh(existing_participant)
        return existing_participant

    participant = crud_participant.create_participant(
        db=db,
        participant=participant_in,
        tenant_id=tenant_id,
    )
    participant.payment_status = 1
    participant.paid_amount = 0
    db.commit()
    db.refresh(participant)
    return participant


def _complete_successful_payment(
    db: Session,
    order: PaymentOrder,
    resource: dict[str, Any],
) -> ActivityParticipant:
    """把微信侧已支付成功的订单补偿落库为参与记录。"""
    _validate_notify_resource(order, resource)
    participant = None
    if order.participant_id:
        participant = db.query(ActivityParticipant).filter(
            ActivityParticipant.id == order.participant_id,
            ActivityParticipant.tenant_id == order.tenant_id,
        ).first()
    if participant is None and order.user_id:
        participant = crud_participant.get_participant_by_user(
            db,
            order.activity_id,
            order.user_id,
            order.tenant_id,
        )
    if participant is None:
        raise HTTPException(status_code=409, detail="订单缺少待支付报名记录")

    participant.payment_status = 2
    participant.payment_order_id = order.id
    participant.paid_amount = order.actual_fee

    order.status = crud_payment.PAYMENT_STATUS_SUCCESS
    order.transaction_id = resource.get("transaction_id")
    order.callback_raw = json.dumps(resource, ensure_ascii=False)
    order.paid_at = datetime.now()
    order.participant_id = participant.id
    order.update_time = datetime.now()

    db.commit()
    db.refresh(participant)
    db.refresh(order)
    return participant


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
    """将待支付订单转换为支付响应。"""
    if order.status != crud_payment.PAYMENT_STATUS_PENDING or not order.prepay_id:
        raise HTTPException(status_code=400, detail="当前订单暂不可操作，请稍后再试")

    payment_params = pay_service.get_mini_program_payment_params(order.prepay_id)
    return PaymentOrderResponse(
        order_no=order.order_no,
        activity_id=order.activity_id,
        suggested_fee=order.suggested_fee,
        actual_fee=order.actual_fee,
        status=order.status,
        payment_params=payment_params,
    )


def _build_refund_detail(order: PaymentOrder, refund: PaymentRefund | None) -> RefundDetailResponse:
    return RefundDetailResponse(
        order_no=order.order_no,
        refund_status=order.refund_status,
        refund_amount=order.refund_amount,
        refund_apply_by=order.refund_apply_by,
        refund_apply_at=order.refund_apply_at,
        refund_success_at=order.refund_success_at,
        refund_fail_reason=order.refund_fail_reason,
        out_refund_no=refund.out_refund_no if refund else None,
    )


def _close_remote_order_if_needed(pay_service: Any, order_no: str) -> None:
    """在取消未支付订单前，尽量关闭微信侧订单。"""
    try:
        pay_service.close_order(order_no)
    except Exception as close_error:
        logger.warning("取消订单 %s 时关闭微信侧订单失败: %s", order_no, close_error)


def _is_cancelable_order(order: PaymentOrder) -> bool:
    """判断订单是否可以取消并删除。"""
    return order.status in (
        crud_payment.PAYMENT_STATUS_CREATING,
        crud_payment.PAYMENT_STATUS_PENDING,
        crud_payment.PAYMENT_STATUS_FAILED,
        crud_payment.PAYMENT_STATUS_CLOSED,
    )


@router.post("/create", response_model=PaymentOrderResponse)
async def create_payment_order(
    request: Request,
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

    if ctx.user_id is None or not ctx.tenant_id or ctx.tenant_id <= 0:
        raise HTTPException(status_code=403, detail="当前登录身份不可发起支付")
    try:
        payload = dict(await request.json() or {})
        payload = _decrypt_payment_payload(payload)
        order_in = PaymentOrderCreate.model_validate(payload)
    except SensitiveFieldCryptoError:
        raise HTTPException(status_code=400, detail="敏感字段解密失败")
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

    # 1. 验证活动
    activity = _get_activity_or_404(db, order_in.activity_id, tenant_id)

    if activity.require_payment != 1:
        raise HTTPException(status_code=400, detail="该活动不需要支付")
    _ensure_activity_enrollable(activity)

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
    pending_order = crud_payment.get_pending_payment_order_for_user_activity(
        db, normalized_order.activity_id, user_id, tenant_id
    )
    if pending_order:
        raise HTTPException(status_code=409, detail="当前存在未取消的支付订单，请先取消后再重新报名")

    participant = _prepare_pending_participant(
        db,
        order_in=normalized_order,
        tenant_id=tenant_id,
        user_id=user_id,
    )

    # 4. 获取用户 openid
    openid = _get_user_openid(db, user_id, tenant_id)

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
            participant_id=participant.id,
            status=crud_payment.PAYMENT_STATUS_CREATING,
        )
        participant.payment_order_id = local_order.id
        db.commit()

        # 调用微信统一下单
        try:
            code, response = _unwrap_wechat_result(pay_service.create_jsapi_order(
                order_no=order_no,
                amount=normalized_order.actual_fee,
                description=description,
                openid=openid,
            ))
            if code != 200:
                logger.error(f"微信下单失败: HTTP {code}, {response}")
                crud_payment.mark_payment_order_failed(db, local_order)
                raise HTTPException(status_code=500, detail="创建支付订单失败")
            result = response
        except HTTPException:
            raise
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

        # 幂等处理：如果订单已成功，直接返回成功
        if order.status == crud_payment.PAYMENT_STATUS_SUCCESS:
            logger.info(f"订单 {order_no} 已处理，跳过重复回调")
            return {"code": "SUCCESS", "message": "已处理"}

        if order.status == crud_payment.PAYMENT_STATUS_CLOSED:
            try:
                _, remote_order = _unwrap_wechat_result(pay_service.query_order(order_no))
            except Exception as query_error:
                logger.warning("关闭订单 %s 后查询微信状态失败: %s", order_no, query_error)
                return {"code": "FAIL", "message": "订单已关闭"}
            if not _is_remote_payment_success(remote_order):
                logger.info("订单 %s 已关闭且微信侧未支付成功", order_no)
                return {"code": "SUCCESS", "message": "订单已关闭"}
            logger.warning("订单 %s 本地已关闭，但微信侧已支付成功，继续按成功回调处理", order_no)

        if trade_state == "SUCCESS":
            try:
                participant = _complete_successful_payment(db, order, resource)
                logger.info(
                    "订单 %s 支付成功，参与者 %s 已落库",
                    order_no,
                    participant.id,
                )
                activity = db.query(Activity).filter(
                    Activity.id == order.activity_id,
                    Activity.tenant_id == order.tenant_id,
                ).first()
                if activity:
                    notification_center.enqueue_registration_success_message(
                        db,
                        tenant_id=order.tenant_id,
                        user_id=order.user_id,
                        participant=participant,
                        activity=activity,
                    )

            except Exception as e:
                db.rollback()
                logger.exception(f"处理支付成功回调异常: {e}")
                return {"code": "FAIL", "message": "处理失败"}

        else:
            # 支付失败
            _validate_notify_resource(order, resource)
            order.status = crud_payment.PAYMENT_STATUS_FAILED
            db.commit()
            logger.warning(f"订单 {order_no} 支付失败: {trade_state}")

        return {"code": "SUCCESS", "message": "成功"}

    except Exception as e:
        logger.exception(f"处理支付回调异常: {e}")
        return {"code": "FAIL", "message": "处理失败"}


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

    if order.status in (
        crud_payment.PAYMENT_STATUS_PENDING,
        crud_payment.PAYMENT_STATUS_CLOSED,
    ):
        try:
            pay_service = get_wechat_pay_service()
            _, remote_order = _unwrap_wechat_result(pay_service.query_order(order_no))
        except Exception as query_error:
            logger.warning("查询微信订单状态失败: %s, error=%s", order_no, query_error)
        else:
            if _is_remote_payment_success(remote_order):
                locked_order = db.query(PaymentOrder).filter(
                    PaymentOrder.id == order.id,
                    PaymentOrder.tenant_id == ctx.tenant_id,
                ).with_for_update().first()
                if locked_order and locked_order.status != crud_payment.PAYMENT_STATUS_SUCCESS:
                    try:
                        order = locked_order
                        participant = _complete_successful_payment(db, order, remote_order)
                        activity = db.query(Activity).filter(
                            Activity.id == order.activity_id,
                            Activity.tenant_id == ctx.tenant_id,
                        ).first()
                        if activity:
                            notification_center.enqueue_registration_success_message(
                                db,
                                tenant_id=ctx.tenant_id,
                                user_id=order.user_id,
                                participant=participant,
                                activity=activity,
                            )
                    except Exception as complete_error:
                        db.rollback()
                        logger.exception(
                            "微信侧已支付成功，但本地补偿落库失败: %s, error=%s",
                            order_no,
                            complete_error,
                        )
                elif locked_order:
                    order = locked_order

    participant_enroll_status = None
    if order.participant_id:
        participant = db.query(ActivityParticipant).filter(
            ActivityParticipant.id == order.participant_id,
            ActivityParticipant.tenant_id == ctx.tenant_id,
        ).first()
        if participant:
            participant_enroll_status = participant.enroll_status

    return _build_order_detail(order, participant_enroll_status)


@router.delete("/order/{order_no}")
def cancel_payment_order(
    order_no: str,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """取消未支付订单，并删除对应的报名记录。"""
    order = db.query(PaymentOrder).filter(
        PaymentOrder.order_no == order_no,
        PaymentOrder.tenant_id == ctx.tenant_id,
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.user_id != ctx.user_id:
        raise HTTPException(status_code=403, detail="无权操作此订单")
    if order.status == crud_payment.PAYMENT_STATUS_SUCCESS:
        raise HTTPException(status_code=400, detail="订单已支付成功，不能取消")
    if not _is_cancelable_order(order):
        raise HTTPException(status_code=400, detail="当前订单状态不允许取消")

    if order.prepay_id:
        pay_service = get_wechat_pay_service()
        try:
            _, remote_order = _unwrap_wechat_result(pay_service.query_order(order_no))
        except Exception as query_error:
            logger.warning("取消订单 %s 时查询微信状态失败: %s", order_no, query_error)
        else:
            if _is_remote_payment_success(remote_order):
                raise HTTPException(status_code=409, detail="订单已支付成功，不能取消")
            _close_remote_order_if_needed(pay_service, order_no)

    participant = None
    if order.participant_id:
        participant = db.query(ActivityParticipant).filter(
            ActivityParticipant.id == order.participant_id,
            ActivityParticipant.tenant_id == ctx.tenant_id,
        ).with_for_update().first()
    if participant is None and order.user_id:
        participant = crud_participant.get_participant_by_user(
            db,
            order.activity_id,
            order.user_id,
            ctx.tenant_id,
        )

    if participant is not None:
        db.delete(participant)
    db.delete(order)
    db.commit()
    return {"code": "SUCCESS", "message": "订单已取消"}


@router.post("/{order_no}/refund", response_model=RefundDetailResponse)
def create_refund(
    order_no: str,
    payload: RefundCreateRequest,
    idempotency_key: str = Header(default="", alias="Idempotency-Key"),
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    if not idempotency_key.strip():
        raise HTTPException(status_code=400, detail="缺少 Idempotency-Key")

    order = db.query(PaymentOrder).filter(
        PaymentOrder.order_no == order_no,
        PaymentOrder.tenant_id == ctx.tenant_id,
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.status != crud_payment.PAYMENT_STATUS_SUCCESS:
        raise HTTPException(status_code=400, detail="当前订单未支付成功，不能退款")
    if order.refund_status in (
        crud_payment.REFUND_STATUS_PROCESSING,
        crud_payment.REFUND_STATUS_SUCCESS,
        crud_payment.REFUND_STATUS_CLOSED,
    ):
        latest = crud_refund.get_latest_by_order(db, tenant_id=ctx.tenant_id, payment_order_id=order.id)
        return _build_refund_detail(order, latest)
    if order.refund_status not in (crud_payment.REFUND_STATUS_PENDING, crud_payment.REFUND_STATUS_FAILED):
        raise HTTPException(status_code=400, detail="当前订单状态不允许发起退款")

    idem_refund = crud_refund.get_by_idempotency_key(
        db,
        tenant_id=ctx.tenant_id,
        payment_order_id=order.id,
        idempotency_key=idempotency_key.strip(),
    )
    if idem_refund:
        return _build_refund_detail(order, idem_refund)

    latest = crud_refund.get_latest_by_order(db, tenant_id=ctx.tenant_id, payment_order_id=order.id)
    seq = 1 if latest is None else latest.id + 1
    out_refund_no = crud_refund.generate_out_refund_no(
        tenant_id=ctx.tenant_id,
        payment_order_id=order.id,
        seq=seq,
    )
    try:
        refund = crud_refund.create_refund(
            db,
            tenant_id=ctx.tenant_id,
            payment_order_id=order.id,
            participant_id=order.participant_id,
            out_refund_no=out_refund_no,
            amount=order.actual_fee,
            idempotency_key=idempotency_key.strip(),
            operator_id=ctx.user_id,
            reason=payload.reason.strip(),
            request_raw={"order_no": order_no, "reason": payload.reason},
        )
    except IntegrityError:
        db.rollback()
        locked_order = db.query(PaymentOrder).filter(
            PaymentOrder.order_no == order_no,
            PaymentOrder.tenant_id == ctx.tenant_id,
        ).with_for_update().first()
        if locked_order is None:
            raise HTTPException(status_code=404, detail="订单不存在")
        idem_refund = crud_refund.get_by_idempotency_key(
            db,
            tenant_id=ctx.tenant_id,
            payment_order_id=locked_order.id,
            idempotency_key=idempotency_key.strip(),
        )
        if idem_refund is None:
            raise HTTPException(status_code=409, detail="退款请求正在处理中，请稍后重试")
        return _build_refund_detail(locked_order, idem_refund)

    pay_service = get_wechat_pay_service()
    try:
        code, wx_resp = pay_service.create_refund(
            out_trade_no=order.order_no,
            out_refund_no=refund.out_refund_no,
            refund_amount=order.actual_fee,
            total_amount=order.actual_fee,
            reason=payload.reason.strip(),
        )
    except Exception as exc:
        crud_refund.mark_failed(db, refund, fail_reason=str(exc))
        order.refund_status = crud_payment.REFUND_STATUS_FAILED
        order.refund_fail_reason = str(exc)[:255]
        db.commit()
        db.refresh(order)
        db.refresh(refund)
        raise HTTPException(status_code=500, detail=f"退款申请失败：{exc}")

    if code >= 400:
        errmsg = (wx_resp or {}).get("message") or (wx_resp or {}).get("errmsg") or "微信退款返回失败"
        crud_refund.mark_failed(db, refund, fail_reason=errmsg, callback_raw=wx_resp)
        order.refund_status = crud_payment.REFUND_STATUS_FAILED
        order.refund_fail_reason = errmsg[:255]
        db.commit()
        db.refresh(order)
        db.refresh(refund)
        raise HTTPException(status_code=500, detail=f"退款申请失败：{errmsg}")

    crud_refund.mark_processing(db, refund, request_raw=wx_resp)
    order.refund_status = crud_payment.REFUND_STATUS_PROCESSING
    order.refund_apply_by = ctx.user_id
    order.refund_apply_at = datetime.now()
    order.refund_amount = order.actual_fee
    order.refund_fail_reason = None
    db.commit()
    db.refresh(order)
    db.refresh(refund)
    return _build_refund_detail(order, refund)


@router.get("/{order_no}/refund", response_model=RefundDetailResponse)
def get_refund_detail(
    order_no: str,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    order = db.query(PaymentOrder).filter(
        PaymentOrder.order_no == order_no,
        PaymentOrder.tenant_id == ctx.tenant_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    refund = crud_refund.get_latest_by_order(db, tenant_id=ctx.tenant_id, payment_order_id=order.id)
    return _build_refund_detail(order, refund)


@router.post("/refund/notify")
async def refund_notify(
    request: Request,
    db: Session = Depends(deps.get_db),
):
    try:
        headers = dict(request.headers)
        body = await request.body()
        body_str = body.decode("utf-8")
        pay_service = get_wechat_pay_service()
        decrypted_data = pay_service.decrypt_callback(headers, body_str)
        resource = decrypted_data.get("resource", {})

        out_refund_no = resource.get("out_refund_no")
        if not out_refund_no:
            return {"code": "FAIL", "message": "缺少退款单号"}

        refund = db.query(PaymentRefund).filter(
            PaymentRefund.out_refund_no == out_refund_no,
        ).with_for_update().first()
        if not refund:
            return {"code": "FAIL", "message": "退款单不存在"}

        order = db.query(PaymentOrder).filter(
            PaymentOrder.id == refund.payment_order_id,
            PaymentOrder.tenant_id == refund.tenant_id,
        ).with_for_update().first()
        if not order:
            return {"code": "FAIL", "message": "订单不存在"}

        if refund.status == crud_refund.REFUND_STATUS_SUCCESS:
            return {"code": "SUCCESS", "message": "已处理"}

        refund_status = (resource.get("refund_status") or "").upper()
        if refund_status == "SUCCESS":
            crud_refund.mark_success(
                db,
                refund,
                callback_raw=resource,
                wechat_refund_id=resource.get("refund_id"),
            )
            order.refund_status = crud_payment.REFUND_STATUS_SUCCESS
            order.refund_success_at = datetime.now()
            order.refund_fail_reason = None
            if order.user_id and settings.WECHAT_SUBSCRIBE_REFUND_SUCCESS_TEMPLATE_ID:
                credential = db.query(UserCredential).filter(
                    UserCredential.user_id == order.user_id,
                    UserCredential.tenant_id == order.tenant_id,
                    UserCredential.credential_type == "wechat",
                    UserCredential.status == 1,
                ).first()
                if credential:
                    rendered_message = notification_center.render_scene_message(
                        db,
                        tenant_id=order.tenant_id,
                        scene=notification_center.SCENE_REFUND_SUCCESS,
                        context={
                            "order_no": order.order_no[:20],
                            "amount_yuan": f"{order.actual_fee / 100:.2f}",
                        },
                    )
                    if rendered_message:
                        crud_notification.enqueue_message_task(
                            db,
                            tenant_id=order.tenant_id,
                            scene="refund_success",
                            biz_id=order.id,
                            user_id=order.user_id,
                            openid=credential.identifier,
                            template_id=rendered_message["template_id"],
                            payload=rendered_message["payload"],
                            page_path=rendered_message["page_path"],
                            max_retry=settings.WECHAT_SUBSCRIBE_RETRY_MAX,
                        )
        else:
            reason = resource.get("user_received_account") or resource.get("refund_status") or "退款失败"
            crud_refund.mark_failed(db, refund, fail_reason=reason, callback_raw=resource)
            order.refund_status = crud_payment.REFUND_STATUS_FAILED
            order.refund_fail_reason = reason[:255]
            if order.user_id and settings.WECHAT_SUBSCRIBE_REFUND_FAILED_TEMPLATE_ID:
                credential = db.query(UserCredential).filter(
                    UserCredential.user_id == order.user_id,
                    UserCredential.tenant_id == order.tenant_id,
                    UserCredential.credential_type == "wechat",
                    UserCredential.status == 1,
                ).first()
                if credential:
                    rendered_message = notification_center.render_scene_message(
                        db,
                        tenant_id=order.tenant_id,
                        scene=notification_center.SCENE_REFUND_FAILED,
                        context={
                            "order_no": order.order_no[:20],
                            "amount_yuan": f"{order.actual_fee / 100:.2f}",
                        },
                    )
                    if rendered_message:
                        crud_notification.enqueue_message_task(
                            db,
                            tenant_id=order.tenant_id,
                            scene="refund_failed",
                            biz_id=order.id,
                            user_id=order.user_id,
                            openid=credential.identifier,
                            template_id=rendered_message["template_id"],
                            payload=rendered_message["payload"],
                            page_path=rendered_message["page_path"],
                            max_retry=settings.WECHAT_SUBSCRIBE_RETRY_MAX,
                        )

        db.commit()
        return {"code": "SUCCESS", "message": "成功"}
    except Exception as exc:
        logger.exception("退款回调处理失败: %s", exc)
        db.rollback()
        return {"code": "FAIL", "message": "处理失败"}
