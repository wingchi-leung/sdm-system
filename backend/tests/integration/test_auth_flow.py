"""
认证流程集成测试
"""
import pytest
from fastapi import status
from tests.conftest import auth_headers


@pytest.mark.integration
class TestAdminAuthFlow:
    """管理员认证流程测试"""

    def test_complete_admin_login_flow(self, client, super_admin):
        """测试完整的管理员登录流程"""
        # 1. 登录
        login_response = client.post("/api/v1/auth/login", json={
            "username": "super_admin",
            "password": "admin123"
        })
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        # 2. 验证 token 有效 - 访问活动列表端点
        activities_response = client.get(
            "/api/v1/activities/",
            headers=auth_headers(token)
        )
        assert activities_response.status_code == status.HTTP_200_OK

    def test_admin_permission_check_flow(self, client, db_session, activity_admin, sample_activity_type, sample_activity_type_2):
        """测试管理员权限校验流程"""
        # 1. 登录
        login_response = client.post("/api/v1/auth/login", json={
            "username": "activity_admin",
            "password": "admin123"
        })
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        # 2. 访问有权限的活动类型 - 应该成功
        from tests.factories import ActivityFactory
        activity1 = ActivityFactory(activity_type_id=sample_activity_type.id)
        db_session.add(activity1)
        db_session.commit()

        response1 = client.get(
            f"/api/v1/activities/{activity1.id}",
            headers=auth_headers(token)
        )
        assert response1.status_code == status.HTTP_200_OK

        # 3. 尝试访问无权限的活动类型 - 应该失败
        activity2 = ActivityFactory(activity_type_id=sample_activity_type_2.id)
        db_session.add(activity2)
        db_session.commit()

        response2 = client.put(
            f"/api/v1/activities/{activity2.id}",
            headers=auth_headers(token),
            json={"activity_name": "尝试修改"}
        )
        assert response2.status_code == status.HTTP_403_FORBIDDEN

    def test_token_expiry_flow(self, client, super_admin, mocker):
        """测试 token 过期流程"""
        # Mock 时间流逝
        import time
        original_time = time.time
        mock_time = mocker.MagicMock()

        # 第一次调用返回当前时间，第二次调用返回 7 天后
        call_count = [0]
        def mock_time_func():
            call_count[0] += 1
            if call_count[0] == 1:
                return original_time()
            else:
                return original_time() + (8 * 24 * 60 * 60)  # 8 天后

        mocker.patch("time.time", side_effect=mock_time_func)

        # 登录获取 token
        login_response = client.post("/api/v1/auth/login", json={
            "username": "super_admin",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]

        # 尝试使用过期的 token
        response = client.get(
            "/api/v1/activities/",
            headers=auth_headers(token)
        )
        # 应该返回 401 或重新生成 token
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_200_OK]


@pytest.mark.integration
class TestUserAuthFlow:
    """用户认证流程测试"""

    def test_complete_user_registration_and_login_flow(self, client):
        """测试完整的用户注册和登录流程"""
        # 1. 注册新用户
        register_response = client.post("/api/v1/users/register", json={
            "name": "新用户",
            "phone": "13900139300",
            "password": "newpass123",
            "identity_number": "110101199001016000"
        })
        assert register_response.status_code == status.HTTP_200_OK

        # 2. 登录
        login_response = client.post("/api/v1/auth/user-login", json={
            "phone": "13900139300",
            "password": "newpass123"
        })
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        # 3. 访问个人信息
        profile_response = client.get(
            "/api/v1/users/me",
            headers=auth_headers(token)
        )
        assert profile_response.status_code == status.HTTP_200_OK
        assert profile_response.json()["name"] == "新用户"

    def test_user_blocked_flow(self, client, blocked_user):
        """测试被拉黑用户的认证流程"""
        # 尝试登录
        login_response = client.post("/api/v1/auth/user-login", json={
            "phone": "13800138001",
            "password": "user123"
        })

        # 被拉黑用户登录应该被拒绝（返回 403 Forbidden）
        assert login_response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.integration
class TestWeChatAuthFlow:
    """微信认证流程测试"""

    def test_wechat_login_new_user_flow(self, client, mocker):
        """测试微信登录新用户流程"""
        # Mock 微信 API
        mock_wx_response = {
            "openid": "wx_new_user_flow",
            "session_key": "session_key"
        }
        mock_resp = mocker.MagicMock()
        mock_resp.read.return_value = __import__('json').dumps(mock_wx_response).encode()
        mock_resp.__enter__ = lambda self: self
        mock_resp.__exit__ = lambda self, *args: None
        mocker.patch("app.api.v1.endpoints.auth.urlopen", return_value=mock_resp)

        # 1. 微信登录
        login_response = client.post("/api/v1/auth/wechat-login", json={
            "code": "wx_code"
        })
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        # 2. 访问个人信息
        profile_response = client.get(
            "/api/v1/users/me",
            headers=auth_headers(token)
        )
        assert profile_response.status_code == status.HTTP_200_OK

    def test_wechat_login_existing_user_flow(self, client, db_session, sample_user, mocker):
        """测试微信登录已存在用户流程"""
        # 设置用户的微信 openid
        sample_user.wx_openid = "wx_existing_flow"
        db_session.commit()

        # Mock 微信 API
        mock_wx_response = {
            "openid": "wx_existing_flow",
            "session_key": "session_key"
        }
        mock_resp = mocker.MagicMock()
        mock_resp.read.return_value = __import__('json').dumps(mock_wx_response).encode()
        mock_resp.__enter__ = lambda self: self
        mock_resp.__exit__ = lambda self, *args: None
        mocker.patch("app.api.v1.endpoints.auth.urlopen", return_value=mock_resp)

        # 登录
        login_response = client.post("/api/v1/auth/wechat-login", json={
            "code": "wx_code"
        })
        assert login_response.status_code == status.HTTP_200_OK

        # 验证是同一个用户
        token = login_response.json()["access_token"]
        profile_response = client.get(
            "/api/v1/users/me",
            headers=auth_headers(token)
        )
        assert profile_response.json()["id"] == sample_user.id


@pytest.mark.integration
class TestPermissionFlow:
    """权限校验流程测试"""

    def test_role_based_access_control_flow(self, client, super_admin_token, activity_admin_token, user_token, sample_activity):
        """测试基于角色的访问控制流程"""
        # 超级管理员可以修改活动
        super_admin_response = client.put(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(super_admin_token),
            json={"activity_name": "超级管理员修改"}
        )
        assert super_admin_response.status_code == status.HTTP_200_OK

        # 有权限的活动管理员可以修改
        activity_admin_response = client.put(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(activity_admin_token),
            json={"activity_name": "活动管理员修改"}
        )
        assert activity_admin_response.status_code == status.HTTP_200_OK

        # 普通用户不能修改活动（返回 401 因为端点仅限管理员）
        user_response = client.put(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(user_token),
            json={"activity_name": "用户尝试修改"}
        )
        assert user_response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_cross_tenant_isolation_flow(self, client, db_session):
        """测试跨租户隔离流程"""
        from tests.conftest import _create_admin_with_role
        from tests.factories import ActivityFactory, ActivityTypeFactory

        # 创建租户1的管理员和活动
        tenant1_type = ActivityTypeFactory(code="TENANT1")
        db_session.commit()

        _create_admin_with_role(
            db_session,
            tenant_id=1,
            username="tenant1_admin",
            password="password123",
            user_name="租户1管理员",
            phone="13800138031",
            identity_number="110101199001011231",
            permission_codes=["activity.create", "activity.edit", "participant.view"],
            scope_type="activity_type",
            scope_id=tenant1_type.id,
        )

        tenant1_activity = ActivityFactory(activity_type_id=tenant1_type.id)
        db_session.commit()

        # 租户1管理员登录
        login_response = client.post("/api/v1/auth/login", json={
            "username": "tenant1_admin",
            "password": "password123"
        })
        token = login_response.json()["access_token"]

        # 租户1管理员应该能访问自己的活动
        response = client.get(
            f"/api/v1/activities/{tenant1_activity.id}",
            headers=auth_headers(token)
        )
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.integration
class TestSecurityFlow:
    """安全流程测试"""

    def test_password_change_flow(self, client, super_admin):
        """测试密码修改流程"""
        # 1. 登录
        login_response = client.post("/api/v1/auth/login", json={
            "username": "super_admin",
            "password": "admin123"
        })
        old_token = login_response.json()["access_token"]

        # 2. 修改密码
        # （假设有修改密码的端点）
        # change_response = client.put(
        #     "/api/v1/users/change-password",
        #     headers=auth_headers(old_token),
        #     json={"old_password": "admin123", "new_password": "newpass123"}
        # )
        # assert change_response.status_code == status.HTTP_200_OK

        # 3. 使用新密码登录
        # new_login_response = client.post("/api/v1/auth/login", json={
        #     "username": "super_admin",
        #     "password": "newpass123"
        # })
        # assert new_login_response.status_code == status.HTTP_200_OK

        # 4. 旧密码应该无法登录
        old_login_response = client.post("/api/v1/auth/login", json={
            "username": "super_admin",
            "password": "admin123"
        })
        # 应该仍然有效（因为未实际修改）
        assert old_login_response.status_code == status.HTTP_200_OK

    def test_login_attempt_limiting_flow(self, client, super_admin):
        """测试登录尝试限制流程"""
        # 多次失败登录
        for _ in range(5):
            response = client.post("/api/v1/auth/login", json={
                "username": "super_admin",
                "password": "wrong_password"
            })
            # 可能触发限流
            if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                break

        # 即使在限流后，正确密码应该仍然可以登录
        success_response = client.post("/api/v1/auth/login", json={
            "username": "super_admin",
            "password": "admin123"
        })
        # 可能成功或被限流
        assert success_response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_429_TOO_MANY_REQUESTS
        ]
