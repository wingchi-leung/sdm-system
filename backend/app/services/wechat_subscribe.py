import json
import logging
import time
import urllib.parse
import urllib.request

from app.core.config import settings

logger = logging.getLogger(__name__)

_wechat_access_token_cache: dict[str, dict] = {}


def _get_wechat_access_token() -> str:
    appid = settings.WECHAT_APPID
    secret = settings.WECHAT_SECRET
    if not appid or not secret:
        raise RuntimeError("微信配置缺失，无法获取 access_token")

    cache_key = f"{appid}:{secret}"
    now = time.time()
    cached = _wechat_access_token_cache.get(cache_key, {})
    if cached and cached.get("expire_time", 0) > now:
        return str(cached["token"])

    params = urllib.parse.urlencode(
        {
            "grant_type": "client_credential",
            "appid": appid,
            "secret": secret,
        }
    )
    url = f"https://api.weixin.qq.com/cgi-bin/token?{params}"
    with urllib.request.urlopen(url, timeout=8) as response:
        data = json.loads(response.read().decode("utf-8"))

    if data.get("errcode"):
        raise RuntimeError(f"获取微信 access_token 失败：{data.get('errmsg', 'unknown')}")

    access_token = data.get("access_token")
    if not access_token:
        raise RuntimeError("微信 access_token 响应缺失")

    expires_in = int(data.get("expires_in", 7200)) - 120
    _wechat_access_token_cache[cache_key] = {
        "token": access_token,
        "expire_time": now + max(expires_in, 60),
    }
    return str(access_token)


def send_subscribe_message(*, openid: str, template_id: str, data: dict, page: str | None = None) -> dict:
    if not settings.WECHAT_SUBSCRIBE_ENABLED:
        raise RuntimeError("微信订阅消息未启用")

    access_token = _get_wechat_access_token()
    url = f"https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token={access_token}"

    payload = {
        "touser": openid,
        "template_id": template_id,
        "data": data,
    }
    if page:
        payload["page"] = page

    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=8) as response:
        result = json.loads(response.read().decode("utf-8"))

    errcode = int(result.get("errcode", 0))
    if errcode != 0:
        errmsg = result.get("errmsg", "unknown")
        logger.warning("发送订阅消息失败: errcode=%s errmsg=%s", errcode, errmsg)
        raise RuntimeError(f"发送订阅消息失败：{errcode}-{errmsg}")

    return result
