import pytest

from app.core.pii import decrypt_pii, encrypt_pii


@pytest.mark.unit
def test_decrypt_pii_plaintext_compatibility():
    """历史明文兼容：非密文内容保持原样返回。"""
    assert decrypt_pii("13800138000") == "13800138000"


@pytest.mark.unit
def test_decrypt_pii_invalid_ciphertext_returns_none():
    """疑似密文但解密失败时，避免回传密文字符串。"""
    invalid_cipher = "jMMTOkAOBifrOiGnT6XvCvUlVkylTP7YMOjw_8Cw-WHhnuiqJJlgiXlBQTmHKw=="
    assert decrypt_pii(invalid_cipher) is None


@pytest.mark.unit
def test_decrypt_pii_invalid_unpadded_base64url_ciphertext_returns_none():
    """无填充符号的疑似密文也应降级为 None。"""
    invalid_cipher = "bAxZat7moHUALl2abldqr4AM5q8Ql-75LcM7iGtB65DbPVXMrRVE"
    assert decrypt_pii(invalid_cipher) is None


@pytest.mark.unit
def test_encrypt_then_decrypt_roundtrip():
    """正常加密解密应保持往返一致。"""
    plain = "13800138000"
    cipher = encrypt_pii(plain)
    assert cipher
    assert decrypt_pii(cipher) == plain
