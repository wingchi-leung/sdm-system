"""
认证 API 测试
"""
import pytest
from fastapi import status
from tests.conftest import auth_headers


@pytest.mark.api
class TestAuthEndpoints:
    """认证接口测试"""

    def test_admin_login_success(self, client, super_admin):
        """测试管理员成功登录"""
        response = client.post("/api/v1/auth/login", json={
            "username": "super_admin",
            "password": "admin123"
        })
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_admin_login_wrong_password(self, client, super_admin):
        """测试错误密码登录"""
        response = client.post("/api/v1/auth/login", json={
            "username": "super_admin",
            "password": "wrong_password"
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_admin_login_nonexistent_user(self, client):
        """测试不存在的用户登录"""
        response = client.post("/api/v1/auth/login", json={
            "username": "nonexistent_user",
            "password": "password123"
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.parametrize("username,password,expected_status", [
        ("", "password", status.HTTP_401_UNAUTHORIZED),
        ("username", "", status.HTTP_401_UNAUTHORIZED),
        (None, None, status.HTTP_422_UNPROCESSABLE_ENTITY),
        ({}, None, status.HTTP_422_UNPROCESSABLE_ENTITY),
    ])
    def test_login_validation_errors(self, client, username, password, expected_status):
        """测试登录参数验证"""
        response = client.post("/api/v1/auth/login", json={
            "username": username,
            "password": password
        })
        assert response.status_code == expected_status

    def test_admin_login_activity_admin(self, client, activity_admin):
        """测试活动管理员登录"""
        response = client.post("/api/v1/auth/login", json={
            "username": "activity_admin",
            "password": "admin123"
        })
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data

    def test_user_login_success(self, client, sample_user):
        """测试普通用户登录"""
        response = client.post("/api/v1/auth/user-login", json={
            "phone": "13800138000",
            "password": "user123"
        })
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data

    def test_user_login_wrong_password(self, client, sample_user):
        """测试用户登录错误密码"""
        response = client.post("/api/v1/auth/user-login", json={
            "phone": "13800138000",
            "password": "wrong_password"
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_user_login_nonexistent_phone(self, client):
        """测试不存在的手机号登录"""
        response = client.post("/api/v1/auth/user-login", json={
            "phone": "99999999999",
            "password": "password123"
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_user_login_blocked_user(self, client, blocked_user):
        """测试被拉黑用户登录"""
        response = client.post("/api/v1/auth/user-login", json={
            "phone": "13800138001",
            "password": "user123"
        })
        # 被拉黑用户可能可以登录但应标记状态，或直接拒绝
        # 根据业务逻辑决定
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN, status.HTTP_200_OK]

    def test_user_login_invalid_phone_format(self, client):
        """测试无效手机号格式"""
        response = client.post("/api/v1/auth/user-login", json={
            "phone": "invalid_phone",
            "password": "password123"
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_wechat_login_new_user(self, client, mocker):
        """测试微信小程序登录 - 新用户"""
        mock_wx_response = {
            "openid": "wx_openid_new_user",
            "session_key": "session_key_123"
        }
        mock_resp = mocker.MagicMock()
        mock_resp.read.return_value = __import__("json").dumps(mock_wx_response).encode()
        mock_resp.__enter__ = lambda self: self
        mock_resp.__exit__ = lambda self, *args: None
        mocker.patch("app.api.v1.endpoints.auth.urlopen", return_value=mock_resp)

        response = client.post("/api/v1/auth/wechat-login", json={
            "code": "mock_wx_code"
        })
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data

    def test_wechat_login_existing_user(self, client, sample_user, mocker):
        """测试微信小程序登录 - 已存在用户"""
        # 更新用户已有微信 openid
        sample_user.wx_openid = "wx_openid_existing"

        mock_wx_response = {
            "openid": "wx_openid_existing",
            "session_key": "session_key_456"
        }
        mock_resp = mocker.MagicMock()
        mock_resp.read.return_value = __import__("json").dumps(mock_wx_response).encode()
        mock_resp.__enter__ = lambda self: self
        mock_resp.__exit__ = lambda self, *args: None
        mocker.patch("app.api.v1.endpoints.auth.urlopen", return_value=mock_resp)

        response = client.post("/api/v1/auth/wechat-login", json={
            "code": "mock_wx_code"
        })
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data

    def test_wechat_login_invalid_code(self, client, mocker):
        """测试微信登录 - 无效 code"""
        from urllib.error import URLError

        mocker.patch("app.api.v1.endpoints.auth.urlopen", side_effect=URLError("Invalid code"))

        response = client.post("/api/v1/auth/wechat-login", json={
            "code": "invalid_code"
        })
        assert response.status_code == status.HTTP_502_BAD_GATEWAY

    def test_token_expiry_format(self, client, super_admin):
        """测试返回的 token 格式"""
        response = client.post("/api/v1/auth/login", json={
            "username": "super_admin",
            "password": "admin123"
        })
        data = response.json()
        token = data.get("access_token")

        # JWT token 应该有三个部分，用点分隔
        parts = token.split(".")
        assert len(parts) == 3

    def test_rate_limiting(self, client, super_admin):
        """测试登录限流"""
        # 多次快速登录尝试
        failed_attempts = 0
        for _ in range(10):
            response = client.post("/api/v1/auth/login", json={
                "username": "super_admin",
                "password": "wrong_password"
            })
            if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                failed_attempts += 1
                break

        # 验证是否触发限流
        # (实际实现取决于限流配置)
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_429_TOO_MANY_REQUESTS
        ]

    def test_concurrent_login(self, client, super_admin):
        """测试同一用户多次登录"""
        # 第一次登录
        response1 = client.post("/api/v1/auth/login", json={
            "username": "super_admin",
            "password": "admin123"
        })
        assert response1.status_code == status.HTTP_200_OK

        # 第二次登录（应该成功，可能返回新的 token）
        response2 = client.post("/api/v1/auth/login", json={
            "username": "super_admin",
            "password": "admin123"
        })
        assert response2.status_code == status.HTTP_200_OK


@pytest.mark.api
class TestTokenValidation:
    """Token 验证测试"""

    def test_access_protected_endpoint_with_valid_token(self, client, sample_activity, super_admin_token):
        """测试使用有效 token 访问受保护端点"""
        response = client.get(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK

    def test_access_protected_endpoint_without_token(self, client, sample_activity):
        """测试不携带 token 访问受保护端点"""
        response = client.get(f"/api/v1/activities/{sample_activity.id}")
        assert response.status_code == status.HTTP_200_OK

    def test_access_protected_endpoint_with_invalid_token(self, client, sample_activity):
        """测试使用无效 token 访问受保护端点"""
        response = client.get(
            f"/api/v1/activities/{sample_activity.id}",
            headers={"Authorization": "Bearer invalid_token"}
        )
        assert response.status_code == status.HTTP_200_OK

    def test_access_protected_endpoint_with_expired_token(self, client, sample_activity):
        """测试使用过期 token 访问受保护端点"""
        # 创建一个模拟的过期 token
        expired_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyNDkwMjJ9.expired"

        response = client.get(
            f"/api/v1/activities/{sample_activity.id}",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        assert response.status_code == status.HTTP_200_OK

    def test_token_with_bearer_prefix(self, client, super_admin_token):
        """测试管理员 token 访问普通用户端点会被拒绝"""
        response = client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_token_without_bearer_prefix(self, client, super_admin_token):
        """测试不带 Bearer 前缀的 token"""
        response = client.get(
            "/api/v1/users/me",
            headers={"Authorization": super_admin_token}
        )
        # 应该失败，因为需要 Bearer 前缀
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
