import re

from app.core.pii import normalize_optional_text


_TOKEN_LIKE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,}$")


def normalize_display_name(value: str | None, fallback: str) -> str:
    """把明显像系统标识的字符串兜底成可读名称。"""
    text = normalize_optional_text(value)
    if not text:
        return fallback
    if _TOKEN_LIKE_NAME_PATTERN.fullmatch(text):
        return fallback
    return text
