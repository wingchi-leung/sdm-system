import base64
import json
from functools import lru_cache

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding

from app.core.config import settings


class SensitiveFieldCryptoError(Exception):
    """敏感字段解密异常。"""


def _normalize_pem_text(raw_value: str | None) -> str:
    """兼容 .env 中的 \\n 转义与外层引号，统一为标准 PEM 文本。"""
    text = (raw_value or "").strip()
    if not text:
        return ""
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1]
    return text.replace("\\n", "\n").strip()


@lru_cache(maxsize=1)
def _load_private_key_map() -> dict[str, str]:
    mapping: dict[str, str] = {}
    raw = (settings.SENSITIVE_RSA_PRIVATE_KEYS_JSON or "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                mapping = {str(k): str(v) for k, v in parsed.items() if str(v).strip()}
        except Exception as exc:
            raise SensitiveFieldCryptoError(f"私钥映射解析失败: {exc}") from exc
    legacy = _normalize_pem_text(settings.SENSITIVE_RSA_PRIVATE_KEY)
    if legacy:
        mapping.setdefault(settings.SENSITIVE_RSA_KEY_ID, legacy)
    if not mapping:
        raise SensitiveFieldCryptoError("服务端未配置接口层解密私钥")
    return mapping


@lru_cache(maxsize=8)
def _load_private_key_by_kid(kid: str):
    private_key_pem = _normalize_pem_text(_load_private_key_map().get(kid))
    if not private_key_pem:
        raise SensitiveFieldCryptoError("未找到对应 kid 的解密私钥")
    try:
        return serialization.load_pem_private_key(
            private_key_pem.encode("utf-8"),
            password=None,
        )
    except Exception as exc:
        raise SensitiveFieldCryptoError(f"接口层解密私钥加载失败: {exc}") from exc


def decrypt_sensitive_field(value: str | None, kid: str | None = None) -> str:
    """解密小程序上送的 RSA 密文（base64）。"""
    text = (value or "").strip()
    key_id = (kid or settings.SENSITIVE_RSA_KEY_ID or "v1").strip()
    if not text:
        raise SensitiveFieldCryptoError("密文不能为空")
    try:
        cipher_bytes = base64.b64decode(text)
    except Exception as exc:
        raise SensitiveFieldCryptoError("密文字段不是有效的 base64") from exc

    try:
        plain_bytes = _load_private_key_by_kid(key_id).decrypt(cipher_bytes, padding.PKCS1v15())
        plain_text = plain_bytes.decode("utf-8").strip()
    except SensitiveFieldCryptoError:
        raise
    except Exception as exc:
        raise SensitiveFieldCryptoError("密文字段解密失败") from exc

    if not plain_text:
        raise SensitiveFieldCryptoError("密文字段解密后为空")
    return plain_text


@lru_cache(maxsize=1)
def _load_public_key_map() -> dict[str, str]:
    mapping: dict[str, str] = {}
    raw = (settings.SENSITIVE_RSA_PUBLIC_KEYS_JSON or "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                mapping = {str(k): str(v) for k, v in parsed.items() if str(v).strip()}
        except Exception as exc:
            raise SensitiveFieldCryptoError(f"公钥映射解析失败: {exc}") from exc
    legacy = _normalize_pem_text(settings.SENSITIVE_RSA_PUBLIC_KEY)
    if legacy:
        mapping.setdefault(settings.SENSITIVE_RSA_KEY_ID, legacy)
    if not mapping:
        raise SensitiveFieldCryptoError("服务端未配置接口层加密公钥")
    return mapping


def get_sensitive_public_key_bundle() -> dict[str, str]:
    """返回对外下发的小程序加密公钥与版本。"""
    kid = (settings.SENSITIVE_RSA_KEY_ID or "v1").strip()
    public_key_pem = _normalize_pem_text(_load_public_key_map().get(kid))
    if not public_key_pem:
        raise SensitiveFieldCryptoError("服务端未配置接口层加密公钥")
    return {"kid": kid, "public_key": public_key_pem}
