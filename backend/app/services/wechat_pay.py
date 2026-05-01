"""
微信支付服务封装
使用 wechatpayv3 库实现微信支付 JSAPI 支付。

支持两种验签模式（二选一，由环境变量决定）：
  - 微信支付公钥模式（新商户默认）：配置 WECHAT_PAY_PUBLIC_KEY_PATH + WECHAT_PAY_PUBLIC_KEY_ID
  - 平台证书模式（旧商户）：不配置上述两项，库自动从 /v3/certificates 拉取证书
"""
import json
import os
import time
import uuid
from datetime import datetime, timedelta
from functools import cached_property
from typing import Any

from wechatpayv3 import WeChatPay, WeChatPayType

from app.core.config import settings


def _read_file(path: str, label: str) -> str:
    """读取文件内容，路径不存在时给出明确错误。"""
    if not path or not os.path.exists(path):
        raise FileNotFoundError(f"{label}文件不存在: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _build_wxpay_client() -> WeChatPay:
    """
    根据环境变量构建 WeChatPay 客户端。

    公钥模式：同时配置了 WECHAT_PAY_PUBLIC_KEY_PATH 和 WECHAT_PAY_PUBLIC_KEY_ID
    证书模式：未配置上述两项，库自动拉取平台证书并缓存到 cert_dir
    """
    # --- 必填项校验 ---
    missing = [
        k for k, v in {
            "WECHAT_APPID": settings.WECHAT_APPID,
            "WECHAT_PAY_MCH_ID": settings.WECHAT_PAY_MCH_ID,
            "WECHAT_PAY_API_V3_KEY": settings.WECHAT_PAY_API_V3_KEY,
            "WECHAT_PAY_SERIAL_NO": settings.WECHAT_PAY_SERIAL_NO,
            "WECHAT_PAY_PRIVATE_KEY_PATH": settings.WECHAT_PAY_PRIVATE_KEY_PATH,
        }.items() if not v
    ]
    if missing:
        raise ValueError(f"微信支付配置缺失，请检查环境变量: {', '.join(missing)}")

    private_key = _read_file(settings.WECHAT_PAY_PRIVATE_KEY_PATH, "商户私钥")

    # --- 判断模式 ---
    use_public_key_mode = bool(
        settings.WECHAT_PAY_PUBLIC_KEY_PATH and settings.WECHAT_PAY_PUBLIC_KEY_ID
    )

    if use_public_key_mode:
        # 微信支付公钥模式（新商户）
        public_key = _read_file(settings.WECHAT_PAY_PUBLIC_KEY_PATH, "微信支付公钥")
        public_key_id = settings.WECHAT_PAY_PUBLIC_KEY_ID
        cert_dir = None
    else:
        # 平台证书模式（旧商户），缓存到私钥同目录下的 platform_certs/
        public_key = None
        public_key_id = None
        key_dir = os.path.dirname(os.path.abspath(settings.WECHAT_PAY_PRIVATE_KEY_PATH))
        cert_dir = os.path.join(key_dir, "platform_certs") + os.sep
        os.makedirs(cert_dir, exist_ok=True)

    try:
        return WeChatPay(
            wechatpay_type=WeChatPayType.JSAPI,
            mchid=settings.WECHAT_PAY_MCH_ID,
            private_key=private_key,
            cert_serial_no=settings.WECHAT_PAY_SERIAL_NO,
            apiv3_key=settings.WECHAT_PAY_API_V3_KEY,
            appid=settings.WECHAT_APPID,
            notify_url=settings.WECHAT_PAY_NOTIFY_URL or "",
            cert_dir=cert_dir,
            public_key=public_key,
            public_key_id=public_key_id,
        )
    except Exception as e:
        mode = "公钥模式" if use_public_key_mode else "平台证书模式"
        raise ValueError(
            f"微信支付客户端初始化失败（{mode}）：{e}\n"
            "请检查：\n"
            "  1. WECHAT_PAY_SERIAL_NO 是商户证书序列号（非平台证书序列号）\n"
            "  2. apiclient_key.pem 与商户证书必须是同一密钥对\n"
            "  3. WECHAT_PAY_API_V3_KEY 是32位 APIv3 密钥\n"
            "  4. 新商户（公钥模式）需配置 WECHAT_PAY_PUBLIC_KEY_PATH 和 WECHAT_PAY_PUBLIC_KEY_ID"
        ) from e


class WeChatPayService:
    """微信支付服务，封装 JSAPI 下单、查单、关单、回调解密。"""

    @cached_property
    def _client(self) -> WeChatPay:
        """懒加载 WeChatPay 客户端，首次使用时初始化。"""
        return _build_wxpay_client()

    def generate_order_no(self) -> str:
        """生成唯一商户订单号：SDM + 时间戳 + 8位随机串。"""
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
    ) -> tuple[int, dict[str, Any]]:
        """
        调用微信统一下单接口。

        Args:
            order_no: 商户订单号
            amount: 支付金额（分）
            description: 商品描述
            openid: 付款用户 openid
            expire_minutes: 订单有效期（分钟）

        Returns:
            (HTTP状态码, 微信下单结果 dict，含 prepay_id 等字段)
        """
        expire_time = (datetime.now() + timedelta(minutes=expire_minutes)).strftime(
            "%Y-%m-%dT%H:%M:%S+08:00"
        )
        code, response_text = self._client.pay(
            description=description,
            out_trade_no=order_no,
            amount={"total": amount, "currency": "CNY"},
            payer={"openid": openid},
            time_expire=expire_time,
        )
        result = json.loads(response_text) if response_text else {}
        return code, result

    def get_mini_program_payment_params(self, prepay_id: str) -> dict[str, str]:
        """
        生成小程序唤起支付所需的签名参数。

        Args:
            prepay_id: 统一下单返回的预支付标识

        Returns:
            包含 appId / timeStamp / nonceStr / package / signType / paySign 的字典
        """
        timestamp = str(int(time.time()))
        nonce_str = uuid.uuid4().hex
        package = f"prepay_id={prepay_id}"
        # 签名串格式：appId\ntimeStamp\nnonceStr\npackage\n
        # sign() 内部用 '\n'.join(data) + '\n' 拼接，故传入 list
        signature = self._client.sign(
            [settings.WECHAT_APPID, timestamp, nonce_str, package]
        )
        return {
            "appId": settings.WECHAT_APPID,
            "timeStamp": timestamp,
            "nonceStr": nonce_str,
            "package": package,
            "signType": "RSA",
            "paySign": signature,
        }

    def query_order(self, order_no: str) -> tuple[int, dict[str, Any]]:
        """查询微信侧订单状态。"""
        code, response_text = self._client.query(out_trade_no=order_no)
        result = json.loads(response_text) if response_text else {}
        return code, result

    def close_order(self, order_no: str) -> tuple[int, dict[str, Any]]:
        """关闭微信侧订单。"""
        code, response_text = self._client.close(out_trade_no=order_no)
        result = json.loads(response_text) if response_text else {}
        return code, result

    def decrypt_callback(
        self,
        headers: dict[str, str],
        body: str,
    ) -> dict[str, Any]:
        """
        验签并解密微信支付回调通知。

        两种模式下库内部均自动用对应公钥验签，行为一致。
        """
        return self._client.decrypt_callback(headers, body)


# 模块级单例，进程内唯一
_service: WeChatPayService | None = None


def get_wechat_pay_service() -> WeChatPayService:
    """获取微信支付服务单例。"""
    global _service
    if _service is None:
        _service = WeChatPayService()
    return _service
