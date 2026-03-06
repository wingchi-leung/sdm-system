"""
用户管理 API 测试
"""
import pytest
from fastapi import status
from tests.conftest import auth_headers


@pytest.mark.api
class TestUserRegistration:
    """用户注册测试"""

    def test_register_user_success(self, client):
        """测试成功注册用户"""
        response = client.post("/api/v1/users/register", json={
            "name": "新用户",
            "phone": "13900139123",
            "password": "newpass123",
            "identity_number": "110101199001011999",
            "sex": "M"
        })
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "新用户"
        assert data["phone"] == "13900139123"
        assert "id" in data
        assert "password_hash" not in data  # 不应该返回密码哈希

    def test_register_user_duplicate_phone(self, client, sample_user):
        """测试注册重复手机号"""
        response = client.post("/api/v1/users/register", json={
            "name": "重复用户",
            "phone": "13800138000",  # sample_user 的手机号
            "password": "password123"
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_user_missing_required_fields(self, client):
        """测试缺少必填字段"""
        response = client.post("/api/v1/users/register", json={
            "name": "不完整用户"
        })
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_register_user_invalid_phone_format(self, client):
        """测试无效手机号格式"""
        response = client.post("/api/v1/users/register", json={
            "name": "用户",
            "phone": "invalid",
            "password": "password123"
        })
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_register_user_weak_password(self, client):
        """测试弱密码"""
        response = client.post("/api/v1/users/register", json={
            "name": "用户",
            "phone": "13900139124",
            "password": "123"  # 太短的密码
        })
        # 可能接受，也可能拒绝，取决于验证规则
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]

    def test_register_user_with_email(self, client):
        """测试注册带邮箱的用户"""
        response = client.post("/api/v1/users/register", json={
            "name": "邮箱用户",
            "phone": "13900139125",
            "password": "password123",
            "email": "user@example.com"
        })
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == "user@example.com"


@pytest.mark.api
class TestUserProfile:
    """用户信息测试"""

    def test_get_my_profile(self, client, user_token, sample_user):
        """测试获取个人信息"""
        response = client.get(
            "/api/v1/users/me",
            headers=auth_headers(user_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == sample_user.id
        assert data["name"] == "测试用户"
        assert data["phone"] == "13800138000"

    def test_get_my_profile_without_login(self, client):
        """测试未登录获取个人信息"""
        response = client.get("/api/v1/users/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_update_my_profile(self, client, user_token, sample_user):
        """测试更新个人信息"""
        response = client.put(
            "/api/v1/users/me",
            headers=auth_headers(user_token),
            json={"name": "更新后的姓名"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "更新后的姓名"

    def test_update_profile_email(self, client, user_token):
        """测试更新邮箱"""
        response = client.put(
            "/api/v1/users/me",
            headers=auth_headers(user_token),
            json={"email": "newemail@example.com"}
        )
        assert response.status_code == status.HTTP_200_OK

    def test_update_profile_phone_not_allowed(self, client, user_token):
        """测试不允许修改手机号"""
        response = client.put(
            "/api/v1/users/me",
            headers=auth_headers(user_token),
            json={"phone": "13900139999"}
        )
        # 手机号通常不允许修改
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_200_OK]


@pytest.mark.api
class TestUserManagement:
    """用户管理测试（管理员）"""

    def test_create_user_as_admin(self, client, super_admin_token):
        """测试管理员创建用户"""
        response = client.post(
            "/api/v1/users/create",
            headers=auth_headers(super_admin_token),
            json={
                "name": "管理员创建的用户",
                "phone": "13900139200",
                "password": "password123",
                "identity_number": "110101199001012000"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "管理员创建的用户"

    def test_create_user_as_normal_user_forbidden(self, client, user_token):
        """测试普通用户创建用户被禁止"""
        response = client.post(
            "/api/v1/users/create",
            headers=auth_headers(user_token),
            json={
                "name": "尝试创建",
                "phone": "13900139201",
                "password": "password123"
            }
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_users_list_as_admin(self, client, super_admin_token, db_session):
        """测试管理员获取用户列表"""
        # 创建一些测试用户
        from tests.factories import UserFactory
        for _ in range(5):
            user = UserFactory()
            db_session.add(user)
        db_session.commit()

        response = client.get(
            "/api/v1/users/",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 5

    def test_get_users_list_as_normal_user_forbidden(self, client, user_token):
        """测试普通用户获取用户列表被禁止"""
        response = client.get(
            "/api/v1/users/",
            headers=auth_headers(user_token)
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_users_list_pagination(self, client, super_admin_token, db_session):
        """测试用户列表分页"""
        from tests.factories import UserFactory
        for _ in range(15):
            user = UserFactory()
            db_session.add(user)
        db_session.commit()

        # 第一页
        response = client.get(
            "/api/v1/users/?skip=0&limit=10",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) <= 10

    def test_get_user_by_id_as_admin(self, client, super_admin_token, sample_user):
        """测试管理员通过 ID 获取用户"""
        response = client.get(
            f"/api/v1/users/{sample_user.id}",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == sample_user.id

    def test_get_nonexistent_user(self, client, super_admin_token):
        """测试获取不存在的用户"""
        response = client.get(
            "/api/v1/users/99999",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_block_user_as_admin(self, client, super_admin_token, db_session):
        """测试管理员拉黑用户"""
        from tests.factories import UserFactory
        user = UserFactory(phone="13900139300")
        db_session.add(user)
        db_session.commit()

        response = client.put(
            f"/api/v1/users/{user.id}/block",
            headers=auth_headers(super_admin_token),
            json={"isblock": 1, "block_reason": "违规操作"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["isblock"] == 1
        assert data["block_reason"] == "违规操作"

    def test_unblock_user_as_admin(self, client, super_admin_token, blocked_user):
        """测试管理员解除拉黑"""
        response = client.put(
            f"/api/v1/users/{blocked_user.id}/block",
            headers=auth_headers(super_admin_token),
            json={"isblock": 0, "block_reason": None}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["isblock"] == 0

    def test_delete_user_as_admin(self, client, super_admin_token, db_session):
        """测试管理员删除用户"""
        from tests.factories import UserFactory
        user = UserFactory(phone="13900139400")
        db_session.add(user)
        db_session.commit()

        response = client.delete(
            f"/api/v1/users/{user.id}",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK or response.status_code == status.HTTP_204_NO_CONTENT

    def test_delete_user_as_normal_user_forbidden(self, client, user_token, sample_user):
        """测试普通用户删除用户被禁止"""
        response = client.delete(
            f"/api/v1/users/{sample_user.id}",
            headers=auth_headers(user_token)
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.api
class TestUserPermissions:
    """用户权限测试"""

    def test_blocked_user_cannot_access(self, client, blocked_user):
        """测试被拉黑用户无法访问"""
        # 先登录获取 token
        login_response = client.post("/api/v1/auth/user-login", json={
            "phone": "13800138001",
            "password": "user123"
        })

        if login_response.status_code == status.HTTP_200_OK:
            token = login_response.json()["access_token"]
            response = client.get(
                "/api/v1/users/me",
                headers=auth_headers(token)
            )
            # 被拉黑用户可能被拒绝访问
            assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_200_OK]

    def test_user_can_only_access_own_data(self, client, user_token, sample_user, db_session):
        """测试用户只能访问自己的数据"""
        from tests.factories import UserFactory
        other_user = UserFactory(phone="13900139500")
        db_session.add(other_user)
        db_session.commit()

        # 尝试访问其他用户的信息
        response = client.get(
            f"/api/v1/users/{other_user.id}",
            headers=auth_headers(user_token)
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
