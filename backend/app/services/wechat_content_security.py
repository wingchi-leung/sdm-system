import json
import logging
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrllibRequest, urlopen

from app.core.config import settings

logger = logging.getLogger(__name__)

_wechat_access_token_cache: dict[str, dict] = {}


@dataclass(frozen=True)
class ContentSecurityResult:
    passed: bool
    hit_sensitive: bool
    reason: str


@dataclass(frozen=True)
class MediaCheckSubmitResult:
    accepted: bool
    trace_id: str | None
    reason: str


def resolve_media_url_for_wechat(media_url: str) -> str:
    url = (media_url or "").strip()
    if not url:
        return url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    base = (settings.STORAGE_BASE_URL or "").rstrip("/")
    if not base:
        return url
    if url.startswith("/"):
        return f"{base}{url}"
    return f"{base}/{url}"


def _get_wechat_access_token() -> str:
    appid = settings.WECHAT_APPID
    secret = settings.WECHAT_SECRET
    if not appid or not secret:
        raise RuntimeError("未配置 WECHAT_APPID 或 WECHAT_SECRET")

    cache_key = f"token_{appid}"
    cached = _wechat_access_token_cache.get(cache_key, {})
    if cached.get("token") and cached.get("expire_time", 0) > time.time() + 300:
        return str(cached["token"])

    url = (
        "https://api.weixin.qq.com/cgi-bin/token"
        f"?grant_type=client_credential&appid={appid}&secret={secret}"
    )
    req = UrllibRequest(url, method="GET")
    with urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())

    if data.get("errcode", 0) != 0:
        errmsg = str(data.get("errmsg", "unknown"))
        raise RuntimeError(f"获取微信 access_token 失败：{errmsg}")

    access_token = data.get("access_token")
    if not access_token:
        raise RuntimeError("微信 access_token 响应缺失")
    expires_in = int(data.get("expires_in", 7200))
    _wechat_access_token_cache[cache_key] = {
        "token": access_token,
        "expire_time": time.time() + expires_in,
    }
    return str(access_token)


def check_text_security(text: str, *, scene: int = 2) -> ContentSecurityResult:
    """检查文本内容是否通过微信内容安全审核。

    scene:
    - 1: 资料
    - 2: 评论/发帖（默认）
    """
    content = (text or "").strip()
    if not content:
        return ContentSecurityResult(passed=True, hit_sensitive=False, reason="空内容无需审核")

    if not settings.WECHAT_CONTENT_SECURITY_ENABLED:
        return ContentSecurityResult(passed=True, hit_sensitive=False, reason="未开启微信内容审核")

    try:
        access_token = _get_wechat_access_token()
        url = f"https://api.weixin.qq.com/wxa/msg_sec_check?access_token={access_token}"
        payload = {"content": content, "version": 2, "scene": scene}
        req = UrllibRequest(
            url=url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except (HTTPError, URLError, json.JSONDecodeError, RuntimeError) as exc:
        logger.exception("微信内容安全审核请求失败: %s", exc)
        return ContentSecurityResult(
            passed=False,
            hit_sensitive=False,
            reason="微信审核服务异常，已转人工审核",
        )

    errcode = int(data.get("errcode", -1))
    if errcode == 0:
        result = data.get("result") or {}
        suggest = str(result.get("suggest") or "").lower()
        if suggest == "pass":
            return ContentSecurityResult(passed=True, hit_sensitive=False, reason="审核通过")
        return ContentSecurityResult(
            passed=False,
            hit_sensitive=True,
            reason="内容触发微信安全策略，已转人工审核",
        )

    # 常见敏感内容命中：87014；其余错误码按“服务异常”处理为人工审核
    if errcode == 87014:
        return ContentSecurityResult(
            passed=False,
            hit_sensitive=True,
            reason="内容含敏感信息，已转人工审核",
        )

    errmsg = str(data.get("errmsg", "unknown"))
    logger.warning("微信内容安全审核返回异常: errcode=%s errmsg=%s", errcode, errmsg)
    return ContentSecurityResult(
        passed=False,
        hit_sensitive=False,
        reason="微信审核服务异常，已转人工审核",
    )


def submit_media_check_async(
    media_url: str,
    *,
    scene: int = 2,
    version: int = 2,
) -> MediaCheckSubmitResult:
    url = resolve_media_url_for_wechat(media_url)
    if not url:
        return MediaCheckSubmitResult(accepted=False, trace_id=None, reason="图片地址为空")

    if not settings.WECHAT_CONTENT_SECURITY_ENABLED:
        return MediaCheckSubmitResult(accepted=False, trace_id=None, reason="未开启微信内容审核")

    try:
        access_token = _get_wechat_access_token()
        req_url = f"https://api.weixin.qq.com/wxa/media_check_async?access_token={access_token}"
        payload = {"media_url": url, "scene": scene, "version": version}
        req = UrllibRequest(
            url=req_url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except (HTTPError, URLError, json.JSONDecodeError, RuntimeError) as exc:
        logger.exception("提交微信图片审核失败: %s", exc)
        return MediaCheckSubmitResult(accepted=False, trace_id=None, reason="提交微信图片审核失败")

    if int(data.get("errcode", -1)) != 0:
        errmsg = str(data.get("errmsg", "unknown"))
        logger.warning("微信图片审核提交异常: %s", errmsg)
        return MediaCheckSubmitResult(accepted=False, trace_id=None, reason=f"微信图片审核提交失败：{errmsg}")

    trace_id = data.get("trace_id")
    return MediaCheckSubmitResult(accepted=True, trace_id=str(trace_id) if trace_id else None, reason="提交成功")
