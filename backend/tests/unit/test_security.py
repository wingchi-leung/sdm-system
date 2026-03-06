"""
安全模块单元测试
"""
import pytest
from datetime import datetime, timedelta
from jose import JWTError

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)
from app.core.config import settings


@pytest.mark.unit
class TestPasswordSecurity:
    """密码安全测试"""

    def test_hash_password_success(self):
        """测试成功哈希密码"""
        plain_password = "my_secure_password"
        hashed = hash_password(plain_password)

        assert hashed is not None
        assert hashed != plain_password
        assert len(hashed) > 20  # bcrypt 哈希长度
        assert hashed.startswith("$2b$")  # bcrypt 前缀

    def test_hash_password_different_hashes(self):
        """测试相同密码产生不同哈希（由于 salt）"""
        password = "same_password"
        hash1 = hash_password(password)
        hash2 = hash_password(password)

        assert hash1 != hash2  # 由于随机 salt，哈希值应该不同

    def test_verify_password_correct(self):
        """测试验证正确的密码"""
        password = "correct_password"
        hashed = hash_password(password)

        is_valid = verify_password(password, hashed)
        assert is_valid is True

    def test_verify_password_incorrect(self):
        """测试验证错误的密码"""
        password = "correct_password"
        wrong_password = "wrong_password"
        hashed = hash_password(password)

        is_valid = verify_password(wrong_password, hashed)
        assert is_valid is False

    def test_hash_and_verify_roundtrip(self):
        """测试哈希和验证的往返"""
        passwords = [
            "simple",
            "complex123!@#",
            "中文密码",
        ]

        for password in passwords:
            hashed = hash_password(password)
            assert verify_password(password, hashed) is True
            assert verify_password(password + "wrong", hashed) is False

    def test_hash_password_too_long(self):
        """测试哈希过长密码"""
        # bcrypt 限制 72 字节
        with pytest.raises(ValueError):
            hash_password("x" * 100)


@pytest.mark.unit
class TestTokenSecurity:
    """JWT Token 安全测试"""

    def test_create_access_token_success(self):
        """测试成功创建 access token"""
        token = create_access_token(sub="123", role="admin", tenant_id=1)

        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 50  # JWT token 长度

    def test_create_token_with_user_role(self):
        """测试创建用户角色的 token"""
        token = create_access_token(sub="user_123", role="user", tenant_id=1)

        payload = decode_access_token(token)
        assert payload["sub"] == "user_123"
        assert payload["role"] == "user"

    def test_create_token_with_admin_role(self):
        """测试创建管理员角色的 token"""
        token = create_access_token(sub="admin_123", role="admin", tenant_id=1)

        payload = decode_access_token(token)
        assert payload["sub"] == "admin_123"
        assert payload["role"] == "admin"

    def test_create_token_with_tenant_id(self):
        """测试创建带租户 ID 的 token"""
        token = create_access_token(
            sub="user_123",
            role="user",
            tenant_id=5
        )

        payload = decode_access_token(token)
        assert payload["tenant_id"] == 5

    def test_decode_token_success(self):
        """测试成功解码 token"""
        token = create_access_token(sub="user_456", role="admin", tenant_id=1)

        payload = decode_access_token(token)
        assert payload["sub"] == "user_456"
        assert payload["role"] == "admin"
        assert "exp" in payload

    def test_decode_token_invalid(self):
        """测试解码无效的 token"""
        invalid_tokens = [
            "invalid.token.string",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid",
            "",
            "not-a-jwt",
        ]

        for invalid_token in invalid_tokens:
            payload = decode_access_token(invalid_token)
            assert payload is None

    def test_token_contains_all_required_claims(self):
        """测试 token 包含所有必需的声明"""
        token = create_access_token(
            sub="user_123",
            role="admin",
            tenant_id=5
        )

        payload = decode_access_token(token)
        required_claims = ["sub", "role", "exp", "tenant_id"]
        for claim in required_claims:
            assert claim in payload

    def test_create_token_with_various_subjects(self):
        """测试使用不同的主题创建 token"""
        subjects = ["123", "abc", "user-123", "admin@example.com"]

        for sub in subjects:
            token = create_access_token(sub=sub, role="user", tenant_id=1)
            payload = decode_access_token(token)
            assert payload["sub"] == sub

    def test_token_tampering_detection(self):
        """测试检测被篡改的 token"""
        token = create_access_token(sub="user_123", role="admin", tenant_id=1)

        # 篡改 token（修改最后几个字符）
        tampered_token = token[:-5] + "aaaaa"

        payload = decode_access_token(tampered_token)
        assert payload is None
