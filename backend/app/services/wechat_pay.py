"""
微信支付服务封装
使用 wechatpayv3 库实现微信支付 JSAPI 支付
"""
import os
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from wechatpayv3 import WeChatPay, WeChatPayType

from app.core.config import settings


class WeChatPayService:
    """微信支付服务类"""

    _instance: Optional["WeChatPayService"] = None
    _wxpay: Optional[WeChatPay] = None

    def __new__(cls):
        """单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化微信支付客户端"""
        if self._wxpay is not None:
            return

        # 检查配置是否完整
        if not all([
            settings.WECHAT_APPID,
            settings.WECHAT_PAY_MCH_ID,
            settings.WECHAT_PAY_API_V3_KEY,
            settings.WECHAT_PAY_SERIAL_NO,
            settings.WECHAT_PAY_PRIVATE_KEY_PATH,
        ]):
            raise ValueError("微信支付配置不完整，请检查环境变量")

        # 读取私钥文件
        private_key = self._read_private_key()

        # 初始化 WeChatPay 客户端
        self._wxpay = WeChatPay(
            wechatpay_type=WeChatPayType.JSAPI,
            mchid=settings.WECHAT_PAY_MCH_ID,
            private_key=private_key,
            merchant_certid=settings.WECHAT_PAY_SERIAL_NO,
            apiv3_key=settings.WECHAT_PAY_API_V3_KEY,
            appid=settings.WECHAT_APPID,
            notify_url=settings.WECHAT_PAY_NOTIFY_URL or "",
        )

    def _read_private_key(self) -> str:
        """读取商户私钥文件"""
        key_path = settings.WECHAT_PAY_PRIVATE_KEY_PATH
        if not key_path or not os.path.exists(key_path):
            raise FileNotFoundError(f"微信支付私钥文件不存在: {key_path}")

        with open(key_path, "r", encoding="utf-8") as f:
            return f.read()

    def generate_order_no(self) -> str:
        """生成商户订单号"""
        # 使用时间戳 + UUID 生成唯一订单号
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        short_uuid = uuid.uuid4().hex[:8].upper()
        return f"SDM{timestamp}{short_uuid}"

    def create_jsapi_order(
        self,
        order_no: str,
        amount: int,
        description: str,
        openid: str,
        expire_minutes: int = 30,
    ) -> Dict[str, Any]:
        """
        创建 JSAPI 支付订单

        Args:
            order_no: 商户订单号
            amount: 支付金额（分）
            description: 商品描述
            openid: 用户 openid
            expire_minutes: 订单过期时间（分钟）

        Returns:
            预支付交易会话标识等信息
        """
        # 计算过期时间
        expire_time = datetime.now() + timedelta(minutes=expire_minutes)
        time_expire = expire_time.strftime("%Y-%m-%dT%H:%M:%S+08:00")

        result = self._wxpay.pay(
            description=description,
            out_trade_no=order_no,
            amount={"total": amount, "currency": "CNY"},
            payer={"openid": openid},
            time_expire=time_expire,
        )

        return result

    def get_mini_program_payment_params(
        self,
        prepay_id: str,
    ) -> Dict[str, str]:
        """
        获取小程序支付参数

        Args:
            prepay_id: 预支付交易会话标识

        Returns:
            小程序调起支付所需的参数
        """
        # 生成时间戳
        timestamp = str(int(time.time()))
        # 生成随机字符串
        nonce_str = uuid.uuid4().hex
        # 构造签名串
        package = f"prepay_id={prepay_id}"

        # 使用 wechatpayv3 的签名方法
        sign_str = f"{settings.WECHAT_APPID}\n{timestamp}\n{nonce_str}\n{package}\n"
        signature = self._wxpay.sign(sign_str)

        return {
            "appId": settings.WECHAT_APPID,
            "timeStamp": timestamp,
            "nonceStr": nonce_str,
            "package": package,
            "signType": "RSA",
            "paySign": signature,
        }

    def query_order(self, order_no: str) -> Dict[str, Any]:
        """
        查询订单状态

        Args:
            order_no: 商户订单号

        Returns:
            订单信息
        """
        result = self._wxpay.query(out_trade_no=order_no)
        return result

    def close_order(self, order_no: str) -> Dict[str, Any]:
        """
        关闭订单

        Args:
            order_no: 商户订单号

        Returns:
            关闭结果
        """
        result = self._wxpay.close(out_trade_no=order_no)
        return result

    def decrypt_callback(
        self,
        headers: Dict[str, str],
        body: str,
    ) -> Dict[str, Any]:
        """
        解密支付回调通知

        Args:
            headers: HTTP 请求头
            body: 请求体

        Returns:
            解密后的回调数据
        """
        result = self._wxpay.decrypt_callback(headers, body)
        return result


# 全局服务实例
wechat_pay_service: Optional[WeChatPayService] = None


def get_wechat_pay_service() -> WeChatPayService:
    """获取微信支付服务实例"""
    global wechat_pay_service
    if wechat_pay_service is None:
        wechat_pay_service = WeChatPayService()
    return wechat_pay_service