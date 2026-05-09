"""
微信支付实名认证 API

流程三大步：
1. 获取授权码：前端跳转微信支付实名授权页，拿到 auth_code（小程序端处理）
2. 换令牌：后端用 auth_code 换 access_token + refresh_token
3. 实名验证：后端用 access_token + 用户姓名 + 证件号请求验证接口

参考：https://pay.wechatpay.cn/doc/v2/merchant/4011987263
"""
import logging
import time
from urllib.request import urlopen, Request as UrllibRequest
from urllib.error import HTTPError, URLError
import json
import base64
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import settings
from app.services.wechat_pay import get_wechat_pay_service

logger = logging.getLogger(__name__)
router = APIRouter()

# 微信支付实名认证 appid（固定）
_WECHAT_REALNAME_APPID = "wxb369391ce8a1a1c8"


# ============================================================
# 内部工具函数
# ============================================================

def _decrypt_wechat_response(encrypted_data: str, service_id: str) -> dict:
    """
    解密微信支付实名验证返回的加密数据（使用 APIv3 密钥 AES-GCM 解密）。
    返回明文 dict，包含 V_OP_NM_MA、V_NM_ID_MA 等状态码。
    """
    try:
        encrypted_dict = json.loads(encrypted_data)
    except Exception:
        raise HTTPException(status_code=500, detail="微信返回数据格式异常")

    algorithm = encrypted_dict.get("algorithm", "")
    if algorithm != "AEAD_AES_256_GCM":
        raise HTTPException(status_code=500, detail=f"不支持的加密算法: {algorithm}")

    nonce = encrypted_dict.get("nonce", "")
    ciphertext = encrypted_dict.get("ciphertext", "")
    associated_data = encrypted_dict.get("associated_data", service_id)

    if not nonce or not ciphertext:
        raise HTTPException(status_code=500, detail="微信返回加密数据不完整")

    # 使用与微信支付相同的 APIv3 密钥解密
    key_bytes = settings.WECHAT_PAY_API_V3_KEY.encode("UTF-8")
    nonce_bytes = nonce.encode("UTF-8")
    associated_data_bytes = associated_data.encode("UTF-8")
    data = base64.b64decode(ciphertext)

    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    aesgcm = AESGCM(key=key_bytes)
    try:
        plain = aesgcm.decrypt(nonce=nonce_bytes, data=data, associated_data=associated_data_bytes)
        return json.loads(plain.decode("UTF-8"))
    except Exception as e:
        logger.exception("AES-GCM 解密失败: %s", e)
        raise HTTPException(status_code=500, detail="解密失败，请稍后重试")


def _parse_verify_result(result: dict) -> dict:
    """
    解析实名验证结果，提取关键状态码。
    状态码说明：
      V_OP_NM_MA      - 操作员姓名是否匹配微信实名（Y/N）
      V_NM_ID_MA      - 姓名与证件号是否匹配（Y/N/U）
      U_OP_NM_MA      - 操作员是否已实名（Y/N/U）
      U_NM_ID_MA      - 用户姓名与证件号是否匹配（Y/N/U）
      verify_result   - 综合结果（TRUE/FALSE）
    """
    return {
        "verify_result": result.get("verify_result", "").upper() == "TRUE",
        "V_OP_NM_MA": result.get("V_OP_NM_MA", ""),   # 操作员姓名匹配微信实名
        "V_NM_ID_MA": result.get("V_NM_ID_MA", ""),   # 姓名与证件号匹配
        "U_OP_NM_MA": result.get("U_OP_NM_MA", ""),   # 操作员是否已实名
        "U_NM_ID_MA": result.get("U_NM_ID_MA", ""),   # 用户姓名与证件号匹配
        "err_code": result.get("err_code", ""),
        "err_msg": result.get("err_msg", ""),
    }


# ============================================================
# 请求/响应模型
# ============================================================

class RealnameAuthCodeRequest(BaseModel):
    """步骤1：换取访问令牌请求"""
    auth_code: str = Field(..., min_length=1, max_length=64, description="微信支付实名授权码")


class RealnameAccessTokenResponse(BaseModel):
    """步骤1响应：返回 access_token 和 refresh_token"""
    access_token: str
    expires_in: int
    refresh_token: str


class RealnameVerifyRequest(BaseModel):
    """步骤2：实名验证请求"""
    access_token: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=50, description="用户填写的姓名（将加密传输）")
    id_number: str = Field(..., min_length=1, max_length=50, description="用户填写的证件号（将加密传输）")


class RealnameVerifyDetail(BaseModel):
    """实名验证结果明细"""
    verify_result: bool = Field(description="综合验证结果")
    V_OP_NM_MA: str = Field(description="操作员姓名匹配微信实名 Y/N")
    V_NM_ID_MA: str = Field(description="姓名与证件号匹配 Y/N/U")
    U_OP_NM_MA: str = Field(description="操作员是否已实名 Y/N/U")
    U_NM_ID_MA: str = Field(description="用户姓名与证件号匹配 Y/N/U")
    err_code: str = Field("")
    err_msg: str = Field("")


class RealnameVerifyResponse(BaseModel):
    """步骤2响应：返回验证结果明细"""
    verify_result: bool
    detail: RealnameVerifyDetail
    message: str = ""


# ============================================================
# API 端点
# ============================================================

@router.post("/exchange-token", response_model=RealnameAccessTokenResponse)
def exchange_auth_code_for_token(body: RealnameAuthCodeRequest, request: Request):
    """
    步骤1：用 auth_code 换取 access_token 和 refresh_token。

    微信支付实名认证接口不支持直接前端调用，必须通过后端请求。
    这里使用与微信支付相同的商家证书签名，确保安全性。
    """
    auth_code = body.auth_code.strip()
    logger.info("准备兑换实名授权码: %s", auth_code[:8] + "****")

    try:
        pay_service = get_wechat_pay_service()
        # 使用微信支付客户端的请求方法
        # 注意：实名认证接口使用特殊 appid，需要单独构建请求
        path = "/v3/certificates"

        # 实名认证接口直接调用，不需要通过 SDK
        # 构建请求 URL
        timestamp = str(int(time.time()))
        nonce_str = ''.join(str(time.time_ns()).split('-')).upper()[:32]
        url = f"https://api.mch.weixin.qq.com/v3/merchant/entrusting/auth_code_to_access_token"

        # 构建请求体
        data = {
            "appid": _WECHAT_REALNAME_APPID,
            "auth_code": auth_code,
            "grant_type": "authorization_code",
        }
        body_str = json.dumps(data)

        # 获取私钥并签名
        import os
        private_key_path = settings.WECHAT_PAY_PRIVATE_KEY_PATH
        if not private_key_path or not os.path.exists(private_key_path):
            raise HTTPException(status_code=503, detail="微信支付配置不完整")

        with open(private_key_path, "r", encoding="utf-8") as f:
            private_key_str = f.read()

        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        from cryptography.hazmat.primitives.hashes import SHA256
        from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15
        from base64 import b64encode

        private_key = load_pem_private_key(private_key_str.encode("UTF-8"), password=None)

        sign_str = f"POST\n{path}\n{timestamp}\n{nonce_str}\n{body_str}\n"
        signature = private_key.sign(
            data=sign_str.encode("UTF-8"),
            padding=PKCS1v15(),
            algorithm=SHA256(),
        )
        signature_b64 = b64encode(signature).decode("UTF-8").replace("\n", "")

        authorization = (
            f'WECHATPAY2-SHA256-RSA2048 '
            f'mchid="{settings.WECHAT_PAY_MCH_ID}",'
            f'nonce_str="{nonce_str}",'
            f'signature="{signature_b64}",'
            f'timestamp="{timestamp}",'
            f'serial_no="{settings.WECHAT_PAY_SERIAL_NO}"'
        )

        # 发送请求
        req = UrllibRequest(
            url,
            data=body_str.encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": authorization,
                "User-Agent": "SDM-System/1.0",
            },
            method="POST",
        )

        with urlopen(req, timeout=30) as resp:
            resp_body = resp.read().decode("utf-8")
            result = json.loads(resp_body)

        if "errcode" in result and result["errcode"] != 0:
            errcode = result.get("errcode")
            errmsg = result.get("errmsg", "unknown")
            # 常见错误码处理
            if errcode == "NO_API_AUTH":
                raise HTTPException(
                    status_code=403,
                    detail="商户号未开通实名认证权限（NO_API_AUTH），请联系微信支付运营人员开通"
                )
            raise HTTPException(status_code=400, detail=f"兑换令牌失败：{errmsg}（错误码 {errcode}）")

        return RealnameAccessTokenResponse(
            access_token=result["access_token"],
            expires_in=result.get("expires_in", 7200),
            refresh_token=result["refresh_token"],
        )

    except HTTPException:
        raise
    except (HTTPError, URLError, json.JSONDecodeError) as e:
        logger.exception("微信实名认证 - 兑换令牌失败: %s", e)
        raise HTTPException(status_code=502, detail="微信服务暂时不可用，请稍后重试")


@router.post("/verify", response_model=RealnameVerifyResponse)
def verify_real_name(body: RealnameVerifyRequest):
    """
    步骤2：调用实名验证接口，验证姓名与证件号是否匹配。

    姓名和证件号会以加密形式传输，微信返回结果也是加密的。
    需要本地解密后解析状态码。

    状态码说明：
    - verify_result: 综合结果 TRUE/FALSE
    - V_OP_NM_MA: 操作员姓名是否匹配微信实名（Y/N）
    - V_NM_ID_MA: 姓名与证件号是否匹配（Y/N/U，U=未知/未实名）
    - U_OP_NM_MA: 操作员是否已实名（Y/N/U）
    - U_NM_ID_MA: 用户姓名与证件号匹配（Y/N/U）
    """
    access_token = body.access_token.strip()
    name = body.name.strip()
    id_number = body.id_number.strip()

    logger.info("收到实名验证请求，姓名: %s***, 证件号: %s****",
                name[:1] + "*" * (len(name) - 1) if len(name) > 1 else "*",
                id_number[:4] + "*" * (len(id_number) - 4) if len(id_number) > 4 else "****")

    try:
        pay_service = get_wechat_pay_service()
        path = "/v3/merchant/realname/verify"
        url = f"https://api.mch.weixin.qq.com{path}"

        # 使用公钥模式加密姓名和证件号
        import os
        public_key_path = settings.WECHAT_PAY_PUBLIC_KEY_PATH
        if not public_key_path or not os.path.exists(public_key_path):
            raise HTTPException(status_code=503, detail="微信支付公钥配置不完整")

        with open(public_key_path, "r", encoding="utf-8") as f:
            public_key_str = f.read()

        from cryptography.hazmat.primitives.serialization import load_pem_public_key
        from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15
        from cryptography.hazmat.primitives.hashes import SHA256
        from base64 import b64encode, b64decode

        public_key = load_pem_public_key(public_key_str.encode("UTF-8"))

        # 使用公钥加密姓名和证件号
        name_encrypted = public_key.encrypt(
            name.encode("UTF-8"),
            PKCS1v15(),
            SHA256(),
        )
        id_encrypted = public_key.encrypt(
            id_number.encode("UTF-8"),
            PKCS1v15(),
            SHA256(),
        )

        name_encrypted_b64 = b64encode(name_encrypted).decode("UTF-8")
        id_encrypted_b64 = b64encode(id_encrypted).decode("UTF-8")

        timestamp = str(int(time.time()))
        nonce_str = ''.join(str(time.time_ns()).split('-')).upper()[:32]

        # 构建请求体
        data = {
            "appid": _WECHAT_REALNAME_APPID,
            "name": name_encrypted_b64,
            "id_number": id_encrypted_b64,
        }
        body_str = json.dumps(data)

        # 签名
        sign_str = f"POST\n{path}\n{timestamp}\n{nonce_str}\n{body_str}\n"
        with open(settings.WECHAT_PAY_PRIVATE_KEY_PATH, "r", encoding="utf-8") as f:
            private_key_str = f.read()

        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        private_key = load_pem_private_key(private_key_str.encode("UTF-8"), password=None)
        signature = private_key.sign(
            data=sign_str.encode("UTF-8"),
            padding=PKCS1v15(),
            algorithm=SHA256(),
        )
        signature_b64 = b64encode(signature).decode("UTF-8").replace("\n", "")

        authorization = (
            f'WECHATPAY2-SHA256-RSA2048 '
            f'mchid="{settings.WECHAT_PAY_MCH_ID}",'
            f'nonce_str="{nonce_str}",'
            f'signature="{signature_b64}",'
            f'timestamp="{timestamp}",'
            f'serial_no="{settings.WECHAT_PAY_SERIAL_NO}"'
        )

        # 发送请求
        req = UrllibRequest(
            url,
            data=body_str.encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": authorization,
                "User-Agent": "SDM-System/1.0",
                "Authorization": f"Bearer {access_token}",
            },
            method="POST",
        )

        with urlopen(req, timeout=30) as resp:
            resp_body = resp.read().decode("utf-8")
            result = json.loads(resp_body)

        # 检查错误
        if "errcode" in result and result["errcode"] != 0:
            errcode = str(result["errcode"])
            errmsg = result.get("errmsg", "unknown")
            if errcode == "NO_API_AUTH":
                raise HTTPException(
                    status_code=403,
                    detail="商户号未开通实名认证权限（NO_API_AUTH），请联系微信支付运营人员开通"
                )
            raise HTTPException(status_code=400, detail=f"实名验证失败：{errmsg}（错误码 {errcode}）")

        # 解密返回数据
        encrypted_response = result.get("response", "")
        if not encrypted_response:
            raise HTTPException(status_code=500, detail="微信返回数据异常，缺少 response 字段")

        plain_result = _decrypt_wechat_response(encrypted_response, service_id=settings.WECHAT_PAY_MCH_ID)
        detail = _parse_verify_result(plain_result)

        # 构建友好提示
        if detail["verify_result"]:
            message = "实名认证通过"
        else:
            if detail["U_OP_NM_MA"] == "N":
                message = "用户尚未完成微信实名认证"
            elif detail["V_NM_ID_MA"] == "N":
                message = "姓名与证件号不匹配，请核对后重新输入"
            elif detail["V_OP_NM_MA"] == "N":
                message = "姓名与微信实名信息不匹配"
            else:
                message = "实名认证未通过"

        return RealnameVerifyResponse(
            verify_result=detail["verify_result"],
            detail=RealnameVerifyDetail(**detail),
            message=message,
        )

    except HTTPException:
        raise
    except (HTTPError, URLError, json.JSONDecodeError) as e:
        logger.exception("微信实名认证 - 验证失败: %s", e)
        raise HTTPException(status_code=502, detail="微信服务暂时不可用，请稍后重试")