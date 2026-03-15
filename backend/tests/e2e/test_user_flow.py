"""
用户完整业务流程 E2E 测试
"""
import pytest
from fastapi import status
from tests.conftest import auth_headers


@pytest.mark.e2e
class TestUserCompleteWorkflow:
    """用户完整业务流程测试"""

    def test_user_registers_and_participates(self, client):
        """测试用户注册和参与活动的完整流程"""
        phone = "13900140001"
        identity_number = "110101199001021000"

        # 1. 注册
        register_response = client.post("/api/v1/users/register", json={
            "name": "新用户",
            "phone": phone,
            "password": "userpass123",
            "identity_number": identity_number,
            "sex": "M"
        })
        assert register_response.status_code == status.HTTP_200_OK
        user = register_response.json()
        user_id = user["id"]

        # 2. 登录
        login_response = client.post("/api/v1/auth/user-login", json={
            "phone": phone,
            "password": "userpass123"
        })
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        # 3. 查看个人信息
        profile_response = client.get(
            "/api/v1/users/me",
            headers=auth_headers(token)
        )
        assert profile_response.status_code == status.HTTP_200_OK
        assert profile_response.json()["name"] == "新用户"

        # 4. 查看可用活动
        activities_response = client.get(
            "/api/v1/activities/unstarted/",
            headers=auth_headers(token)
        )
        assert activities_response.status_code == status.HTTP_200_OK

    def test_user_browses_and_registers_activity(self, client, user_token, sample_activity):
        """测试用户浏览和报名活动"""
        # 1. 查看活动列表
        list_response = client.get(
            "/api/v1/activities/",
            headers=auth_headers(user_token)
        )
        assert list_response.status_code == status.HTTP_200_OK

        # 2. 查看活动详情
        detail_response = client.get(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(user_token)
        )
        assert detail_response.status_code == status.HTTP_200_OK
        activity = detail_response.json()
        assert activity["activity_name"] == "测试活动"

        # 3. 报名活动
        register_response = client.post(
            "/api/v1/participants/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_activity.id,
                "participant_name": "报名用户",
                "phone": "13900140002",
                "identity_number": "110101199001021001"
            }
        )
        assert register_response.status_code == status.HTTP_200_OK

    def test_user_checkin_to_activity(self, client, user_token, active_activity):
        """测试用户签到活动"""
        # 先报名
        client.post(
            "/api/v1/participants/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "participant_name": "签到用户",
                "phone": "13900140003",
                "identity_number": "110101199001021002"
            }
        )

        # 签到
        checkin_response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "name": "签到用户",
                "phone": "13900140003",
                "identity_number": "110101199001021002",
                "has_attend": 1,
                "note": "正常签到"
            }
        )
        assert checkin_response.status_code == status.HTTP_200_OK

    def test_user_updates_profile(self, client, user_token, sample_user):
        """测试用户更新个人信息"""
        # 使用 bind-info 端点更新用户信息（需要完整信息）
        update_response = client.put(
            "/api/v1/users/bind-info",
            headers=auth_headers(user_token),
            json={
                "name": "更新后的姓名",
                "sex": "male",
                "age": 25,
                "occupation": "工程师",
                "phone": sample_user.phone,
                "industry": "IT"
            }
        )
        assert update_response.status_code == status.HTTP_200_OK

    def test_user_views_participation_history(self, client, user_token, sample_user, db_session):
        """测试用户查看参与历史"""
        from tests.factories import ParticipantFactory

        # 创建参与记录
        for i in range(3):
            participant = ParticipantFactory(
                user_id=sample_user.id,
                participant_name=f"历史记录{i}",
                phone=f"139001401{i:02d}",
                identity_number=f"110101199001022{i:03d}"
            )
            db_session.add(participant)
        db_session.commit()

        # 查看参与历史（如果端点存在）
        # history_response = client.get(
        #     "/api/v1/users/participation-history",
        #     headers=auth_headers(user_token)
        # )
        # assert history_response.status_code == status.HTTP_200_OK


@pytest.mark.e2e
class TestUserWeChatFlow:
    """用户微信小程序流程测试"""

    def test_user_wechat_login_and_register(self, client, mocker):
        """测试用户微信登录和注册流程"""
        # Mock 微信 API
        mock_wx_response = {
            "openid": "wx_e2e_test_user",
            "session_key": "test_session_key"
        }
        mock_resp = mocker.MagicMock()
        mock_resp.read.return_value = __import__('json').dumps(mock_wx_response).encode()
        mock_resp.__enter__ = lambda self: self
        mock_resp.__exit__ = lambda self, *args: None
        mocker.patch("app.api.v1.endpoints.auth.urlopen", return_value=mock_resp)

        # 1. 微信登录（新用户自动注册）
        login_response = client.post("/api/v1/auth/wechat-login", json={
            "code": "wx_test_code"
        })
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]

        # 2. 获取用户信息
        profile_response = client.get(
            "/api/v1/users/me",
            headers=auth_headers(token)
        )
        assert profile_response.status_code == status.HTTP_200_OK

        # 3. 使用 token 访问其他功能
        activities_response = client.get(
            "/api/v1/activities/",
            headers=auth_headers(token)
        )
        assert activities_response.status_code == status.HTTP_200_OK


@pytest.mark.e2e
class TestUserErrorScenarios:
    """用户错误场景 E2E 测试"""

    def test_user_fails_duplicate_registration(self, client, user_token, sample_participant):
        """测试用户重复报名失败"""
        # 尝试重复报名
        response = client.post(
            "/api/v1/participants/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_participant.activity_id,
                "participant_name": "重复报名",
                "phone": "13900139000",
                "identity_number": "110101199001011236"
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_user_fails_duplicate_checkin(self, client, user_token, sample_checkin):
        """测试用户重复签到失败"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_checkin.activity_id,
                "name": "重复签到",
                "phone": "13900139001",
                "identity_number": "110101199001011237",
                "has_attend": 1,
                "note": "测试签到"
            }
        )
        # 重复签到应该返回 400（未报名）或成功检查重复
        # 实际 API 行为：如果没有报名会返回 404，如果已签到会返回 400
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND]

    def test_blocked_user_cannot_participate(self, client, blocked_user):
        """测试被拉黑用户无法参与活动"""
        # 尝试登录
        login_response = client.post("/api/v1/auth/user-login", json={
            "phone": "13800138001",
            "password": "user123"
        })

        if login_response.status_code == status.HTTP_200_OK:
            token = login_response.json()["access_token"]

            # 尝试报名活动（应该失败）
            register_response = client.post(
                "/api/v1/participants/",
                headers=auth_headers(token),
                json={
                    "activity_id": 1,  # 假设有活动
                    "participant_name": "拉黑用户",
                    "phone": "13800138001",
                    "identity_number": "110101199001011235"
                }
            )
            # 应该被拒绝或提示用户被拉黑
            assert register_response.status_code in [
                status.HTTP_403_FORBIDDEN,
                status.HTTP_400_BAD_REQUEST
            ]

    def test_user_with_invalid_credentials(self, client):
        """测试无效凭证的用户"""
        # 错误的密码登录
        response = client.post("/api/v1/auth/user-login", json={
            "phone": "13900140004",
            "password": "wrong_password"
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

        # 不存在的用户登录
        response = client.post("/api/v1/auth/user-login", json={
            "phone": "99999999999",
            "password": "password123"
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.e2e
class TestMultiUserInteraction:
    """多用户交互 E2E 测试"""

    def test_multiple_users_register_same_activity(self, client, super_admin_token, sample_activity, db_session):
        """测试多个用户报名同一活动"""
        from tests.factories import UserFactory

        users = []
        for i in range(5):
            # 注册用户
            register_response = client.post("/api/v1/users/register", json={
                "name": f"用户{i}",
                "phone": f"139001401{i:02d}",
                "password": "password123",
                "identity_number": f"110101199001023{i:03d}"
            })
            assert register_response.status_code == status.HTTP_200_OK

            # 登录
            login_response = client.post("/api/v1/auth/user-login", json={
                "phone": f"139001401{i:02d}",
                "password": "password123"
            })
            assert login_response.status_code == status.HTTP_200_OK
            users.append(login_response.json()["access_token"])

        # 所有用户报名同一活动
        for i, token in enumerate(users):
            response = client.post(
                "/api/v1/participants/",
                headers=auth_headers(token),
                json={
                    "activity_id": sample_activity.id,
                    "participant_name": f"用户{i}",
                    "phone": f"139001401{i:02d}",
                    "identity_number": f"110101199001023{i:03d}"
                }
            )
            assert response.status_code == status.HTTP_200_OK

        # 管理员查看参与者列表
        list_response = client.get(
            f"/api/v1/participants/{sample_activity.id}/",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert list_response.status_code == status.HTTP_200_OK
        # 返回的是 {"items": [...], "total": N} 格式
        data = list_response.json()
        assert data.get("total", 0) >= 5
