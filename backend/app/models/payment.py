"""
支付相关 Pydantic 模型
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class PaymentOrderCreate(BaseModel):
    """创建支付订单请求"""
    activity_id: int = Field(..., description="活动ID")
    participant_name: str = Field(..., max_length=255, description="报名人姓名")
    phone: str = Field(..., min_length=1, max_length=255, description="手机号")
    identity_number: Optional[str] = Field(None, max_length=255, description="证件号")
    actual_fee: int = Field(..., ge=0, description="实际支付金额（分）")


class PaymentOrderResponse(BaseModel):
    """支付订单响应"""
    order_no: str = Field(..., description="商户订单号")
    activity_id: int = Field(..., description="活动ID")
    suggested_fee: int = Field(..., description="建议费用（分）")
    actual_fee: int = Field(..., description="实际支付金额（分）")
    status: int = Field(..., description="订单状态：0-待支付 1-成功 2-失败 3-关闭")
    payment_params: Optional[dict] = Field(None, description="小程序支付参数")

    class Config:
        from_attributes = True


class PaymentOrderDetail(BaseModel):
    """支付订单详情"""
    id: int
    order_no: str
    transaction_id: Optional[str] = None
    activity_id: int
    user_id: Optional[int] = None
    participant_id: Optional[int] = None
    suggested_fee: int
    actual_fee: int
    status: int
    openid: Optional[str] = None
    prepay_id: Optional[str] = None
    paid_at: Optional[datetime] = None
    expire_at: datetime
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True


class PaymentCallbackData(BaseModel):
    """支付回调数据"""
    appid: str
    mchid: str
    out_trade_no: str
    transaction_id: str
    trade_type: str
    trade_state: str
    success_time: Optional[str] = None
    amount: dict
    payer: dict