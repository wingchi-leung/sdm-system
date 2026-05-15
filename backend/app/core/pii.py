import base64
import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


PHONE_PATTERN = re.compile(r"(?<!\d)(1[3-9]\d{9})(?!\d)")
MAINLAND_ID_PATTERN = re.compile(r"(?<![A-Za-z0-9])([1-9]\d{16}[\dXx])(?![A-Za-z0-9])")
JSON_FIELD_PATTERNS = (
    re.compile(r'("phone"\s*:\s*")([^"]+)(")'),
    re.compile(r"('phone'\s*:\s*')([^']+)(')"),
    re.compile(r'("identity_number"\s*:\s*")([^"]+)(")'),
    re.compile(r"('identity_number'\s*:\s*')([^']+)(')"),
    re.compile(r'("name"\s*:\s*")([^"]+)(")'),
    re.compile(r"('name'\s*:\s*')([^']+)(')"),
)


def _derive_aes_key() -> bytes:
    seed = settings.PII_ENCRYPTION_KEY or f"{settings.JWT_SECRET}:pii-encryption"
    return hashlib.sha256(seed.encode("utf-8")).digest()


def _derive_hmac_key() -> bytes:
    seed = settings.PII_ENCRYPTION_KEY or f"{settings.JWT_SECRET}:pii-hmac"
    return hashlib.sha256(seed.encode("utf-8")).digest()


_AES_KEY = _derive_aes_key()
_HMAC_KEY = _derive_hmac_key()


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def encrypt_pii(value: str | None) -> str | None:
    text = normalize_optional_text(value)
    if text is None:
        return None
    nonce = os.urandom(12)
    cipher = AESGCM(_AES_KEY).encrypt(nonce, text.encode("utf-8"), None)
    payload = base64.urlsafe_b64encode(nonce + cipher).decode("ascii")
    return payload


def decrypt_pii(value: str | None) -> str | None:
    text = normalize_optional_text(value)
    if text is None:
        return None
    try:
        raw = base64.urlsafe_b64decode(text.encode("ascii"))
        nonce, cipher = raw[:12], raw[12:]
        plain = AESGCM(_AES_KEY).decrypt(nonce, cipher, None)
        return plain.decode("utf-8")
    except Exception:
        # 兼容历史明文数据：当值不是加密密文时，按原文返回，避免读取老数据时报错。
        return text


def blind_index(value: str | None, *, purpose: str) -> str | None:
    text = normalize_optional_text(value)
    if text is None:
        return None
    digest = hmac.new(
        _HMAC_KEY,
        f"{purpose}:{text}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest


def mask_phone(value: str | None) -> str | None:
    text = normalize_optional_text(value)
    if text is None:
        return None
    if len(text) < 7:
        return "*" * len(text)
    return f"{text[:3]}****{text[-4:]}"


def mask_identity_number(value: str | None) -> str | None:
    text = normalize_optional_text(value)
    if text is None:
        return None
    if len(text) <= 4:
        return "*" * len(text)
    return f"{text[:2]}{'*' * max(1, len(text) - 6)}{text[-4:]}"


def mask_name(value: str | None) -> str | None:
    text = normalize_optional_text(value)
    if text is None:
        return None
    if len(text) == 1:
        return "*"
    return text[0] + "*" * (len(text) - 1)


def mask_email(value: str | None) -> str | None:
    text = normalize_optional_text(value)
    if text is None:
        return None
    if "@" not in text:
        return "***"
    local, domain = text.split("@", 1)
    if not local:
        return f"***@{domain}"
    visible = local[:1]
    return f"{visible}{'*' * max(2, len(local) - 1)}@{domain}"


def identity_last4(value: str | None) -> str | None:
    text = normalize_optional_text(value)
    if text is None:
        return None
    return text[-4:]


def redact_text(value: str) -> str:
    redacted = PHONE_PATTERN.sub(lambda m: mask_phone(m.group(1)) or "****", value)
    redacted = MAINLAND_ID_PATTERN.sub(
        lambda m: mask_identity_number(m.group(1)) or "****",
        redacted,
    )
    for pattern in JSON_FIELD_PATTERNS:
        redacted = pattern.sub(
            lambda m: f"{m.group(1)}{_mask_json_field(m.group(2), m.group(1))}{m.group(3)}",
            redacted,
        )
    return redacted


def _mask_json_field(value: str, prefix: str) -> str:
    if "phone" in prefix:
        return mask_phone(value) or ""
    if "identity_number" in prefix:
        return mask_identity_number(value) or ""
    if "name" in prefix:
        return mask_name(value) or ""
    return "***"


def _redact_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        return {
            key: (
                mask_phone(item) if key == "phone"
                else mask_identity_number(item) if key == "identity_number"
                else mask_name(item) if key == "name"
                else _redact_value(item)
            )
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return type(value)(_redact_value(item) for item in value)
    return value


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_text(record.msg)
        elif isinstance(record.msg, dict):
            record.msg = json.dumps(_redact_value(record.msg), ensure_ascii=False)

        if record.args:
            if isinstance(record.args, tuple):
                record.args = tuple(_redact_value(arg) for arg in record.args)
            elif isinstance(record.args, dict):
                record.args = {key: _redact_value(value) for key, value in record.args.items()}
        return True


def install_sensitive_data_filter() -> None:
    root_logger = logging.getLogger()
    if any(isinstance(current, SensitiveDataFilter) for current in root_logger.filters):
        return

    data_filter = SensitiveDataFilter()
    root_logger.addFilter(data_filter)
    for handler in root_logger.handlers:
        handler.addFilter(data_filter)
