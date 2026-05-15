"""
微信实名校验 API（方案：官方「实名信息校验」）

流程：
1. 前端跳转微信城市服务小程序（appid=wx308bd2aeb83d3345, path=subPages/city/wxpay-auth/main）
2. 用户授权同意后返回小程序，extraData 带上 code
3. 前端把 code + 姓名 + 证件号发到后端
4. 后端用小程序 access_token 调 https://api.weixin.qq.com/intp/realname/checkrealnameinfo 核验

校验结果判定：
- verify_openid == V_OP_NA      → 用户未在微信支付实名
- verify_openid == V_OP_NM_MA 且 verify_real_name == V_NM_ID_MA → 匹配（认证成功）
- verify_openid == V_OP_NM_MA 且 verify_real_name == V_NM_ID_UM → 不匹配（认证失败）
"""
import json
import logging
from urllib.request import urlopen, Request as UrllibRequest
from urllib.error import HTTPError, URLError

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import crud_credential
from app.api.v1.endpoints.auth import _get_wechat_access_token
from app.core.sensitive_field_crypto import SensitiveFieldCryptoError, decrypt_sensitive_field

logger = logging.getLogger(__name__)
router = APIRouter()


class RealnameVerifyRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=128, description="微信城市服务授权后返回的 code")
    real_name: str = Field(..., min_length=1, max_length=50, description="用户填写的姓名")
    cred_id: str | None = Field(None, min_length=1, max_length=50, description="用户填写的证件号")
    cred_id_encrypted: str | None = Field(None, description="RSA 加密后的证件号(base64)")
    encryption_kid: str | None = Field(None, description="加密密钥版本")


class RealnameVerifyResponse(BaseModel):
    verify_result: bool = Field(description="综合验证结果")
    verify_openid: str = Field("", description="V_OP_NA=未实名 / V_OP_NM_MA=已实名")
    verify_real_name: str = Field("", description="V_NM_ID_MA=姓名证件号匹配 / V_NM_ID_UM=不匹配")
    message: str = Field("", description="友好提示")


@router.post("/verify", response_model=RealnameVerifyResponse)
def verify_real_name(
    body: RealnameVerifyRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """调用微信官方实名信息校验接口核对用户填写的姓名+证件号。"""
    openid = crud_credential.get_wechat_openid(db, ctx.user_id, ctx.tenant_id)
    if not openid:
        raise HTTPException(status_code=400, detail="当前账号未绑定微信，无法完成实名核验")

    access_token = _get_wechat_access_token()
    url = f"https://api.weixin.qq.com/intp/realname/checkrealnameinfo?access_token={access_token}"

    cred_id = ""
    kid = getattr(body, "encryption_kid", None)
    if not body.cred_id_encrypted:
        raise HTTPException(status_code=400, detail="敏感字段必须使用加密传输")
    try:
        cred_id = decrypt_sensitive_field(body.cred_id_encrypted, kid)
    except SensitiveFieldCryptoError:
        raise HTTPException(status_code=400, detail="敏感字段解密失败")
    if not cred_id:
        raise HTTPException(status_code=400, detail="证件号不能为空")

    payload = {
        "openid": openid,
        "real_name": body.real_name.strip(),
        "cred_id": cred_id,
        "code": body.code.strip(),
    }

    try:
        req = UrllibRequest(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        with urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, json.JSONDecodeError) as e:
        logger.exception("微信实名校验请求失败: %s", e)
        raise HTTPException(status_code=502, detail="微信服务暂时不可用，请稍后重试")

    errcode = result.get("errcode", 0)
    if errcode != 0:
        errmsg = result.get("errmsg", "unknown")
        logger.warning("微信实名校验接口返回错误: errcode=%s, errmsg=%s", errcode, errmsg)
        if errcode == 40001:
            raise HTTPException(status_code=502, detail="微信 access_token 失效，请稍后重试")
        raise HTTPException(status_code=400, detail=f"实名校验失败：{errmsg}（{errcode}）")

    verify_openid = result.get("verify_openid", "")
    verify_real_name = result.get("verify_real_name", "")

    if verify_openid == "V_OP_NA":
        return RealnameVerifyResponse(
            verify_result=False,
            verify_openid=verify_openid,
            verify_real_name=verify_real_name,
            message="用户未在微信支付完成实名认证",
        )

    if verify_openid == "V_OP_NM_MA" and verify_real_name == "V_NM_ID_MA":
        return RealnameVerifyResponse(
            verify_result=True,
            verify_openid=verify_openid,
            verify_real_name=verify_real_name,
            message="实名认证通过",
        )

    return RealnameVerifyResponse(
        verify_result=False,
        verify_openid=verify_openid,
        verify_real_name=verify_real_name,
        message="姓名与证件号不匹配，请核对后重新输入",
    )
