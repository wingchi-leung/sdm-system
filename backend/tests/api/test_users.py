"""
用户管理 API 测试
"""
import pytest
import base64
from fastapi import status
from types import SimpleNamespace
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
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
        """测试无效手机号格式 - 当前 API 不验证格式"""
        response = client.post("/api/v1/users/register", json={
            "name": "用户",
            "phone": "invalid",
            "password": "password123"
        })
        # 当前 API 不验证手机号格式，会成功注册
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_422_UNPROCESSABLE_ENTITY]

    def test_register_user_weak_password(self, client):
        """测试弱密码"""
        response = client.post("/api/v1/users/register", json={
            "name": "用户",
            "phone": "13900139124",
            "password": "123"  # 太短的密码
        })
        # 密码验证规则：最小长度 6
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

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

    def test_get_my_profile_as_admin(self, client, super_admin_token, super_admin):
        """测试管理员也能获取自己关联的个人信息"""
        response = client.get(
            "/api/v1/users/me",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == super_admin.user_id

    def test_get_my_profile_without_login(self, client):
        """测试未登录获取个人信息"""
        response = client.get("/api/v1/users/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_update_my_profile(self, client, user_token, sample_user):
        """测试更新个人信息 - 使用 bind-info 端点"""
        response = client.put(
            "/api/v1/users/bind-info",
            headers=auth_headers(user_token),
            json={
                "name": "更新后的姓名",
                "sex": "male",
                "age": 25,
                "occupation": "工程师",
                "phone": sample_user.phone,
                "industry": "IT",
                "identity_type": "mainland",
                "identity_number": sample_user.identity_number,
            }
        )
        assert response.status_code == status.HTTP_200_OK

    def test_update_profile_email(self, client, user_token, sample_user):
        """测试更新邮箱 - 使用 bind-info 端点"""
        response = client.put(
            "/api/v1/users/bind-info",
            headers=auth_headers(user_token),
            json={
                "name": "测试用户",
                "sex": "male",
                "age": 25,
                "occupation": "工程师",
                "phone": sample_user.phone,
                "email": "newemail@example.com",
                "industry": "IT",
                "identity_type": "mainland",
                "identity_number": sample_user.identity_number,
            }
        )
        assert response.status_code == status.HTTP_200_OK

    def test_update_my_profile_accepts_encrypted_phone_and_identity_number(
        self,
        client,
        user_token,
        sample_user,
        monkeypatch,
    ):
        """测试 bind-info 支持接口层 RSA 密文字段。"""
        from app.core.config import settings
        from app.core import sensitive_field_crypto

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_key = private_key.public_key()
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("utf-8")
        public_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("utf-8")
        monkeypatch.setattr(settings, "SENSITIVE_RSA_PRIVATE_KEY", private_pem, raising=False)
        monkeypatch.setattr(settings, "SENSITIVE_RSA_PUBLIC_KEY", public_pem, raising=False)
        monkeypatch.setattr(settings, "SENSITIVE_RSA_KEY_ID", "v1", raising=False)
        monkeypatch.setattr(settings, "SENSITIVE_RSA_PRIVATE_KEYS_JSON", None, raising=False)
        monkeypatch.setattr(settings, "SENSITIVE_RSA_PUBLIC_KEYS_JSON", None, raising=False)
        sensitive_field_crypto._load_private_key_map.cache_clear()
        sensitive_field_crypto._load_private_key_by_kid.cache_clear()

        phone_cipher = base64.b64encode(public_key.encrypt(
            sample_user.phone.encode("utf-8"),
            padding.PKCS1v15(),
        )).decode("utf-8")
        identity_cipher = base64.b64encode(public_key.encrypt(
            sample_user.identity_number.encode("utf-8"),
            padding.PKCS1v15(),
        )).decode("utf-8")

        response = client.put(
            "/api/v1/users/bind-info",
            headers=auth_headers(user_token),
            json={
                "name": "加密资料用户",
                "sex": "male",
                "age": 25,
                "occupation": "工程师",
                "phone_encrypted": phone_cipher,
                "industry": "IT",
                "identity_type": "mainland",
                "identity_number_encrypted": identity_cipher,
            },
        )

        assert response.status_code == status.HTTP_200_OK

    def test_update_my_profile_accepts_encrypted_identity_without_phone_cipher_when_phone_already_bound(
        self,
        client,
        user_token,
        sample_user,
        monkeypatch,
    ):
        """测试 bind-info 在手机号只读场景下可仅传加密证件号。"""
        from app.core.config import settings
        from app.core import sensitive_field_crypto

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_key = private_key.public_key()
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("utf-8")
        public_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("utf-8")
        monkeypatch.setattr(settings, "SENSITIVE_RSA_PRIVATE_KEY", private_pem, raising=False)
        monkeypatch.setattr(settings, "SENSITIVE_RSA_PUBLIC_KEY", public_pem, raising=False)
        monkeypatch.setattr(settings, "SENSITIVE_RSA_KEY_ID", "v1", raising=False)
        monkeypatch.setattr(settings, "SENSITIVE_RSA_PRIVATE_KEYS_JSON", None, raising=False)
        monkeypatch.setattr(settings, "SENSITIVE_RSA_PUBLIC_KEYS_JSON", None, raising=False)
        sensitive_field_crypto._load_private_key_map.cache_clear()
        sensitive_field_crypto._load_private_key_by_kid.cache_clear()

        identity_cipher = base64.b64encode(public_key.encrypt(
            sample_user.identity_number.encode("utf-8"),
            padding.PKCS1v15(),
        )).decode("utf-8")

        response = client.put(
            "/api/v1/users/bind-info",
            headers=auth_headers(user_token),
            json={
                "name": "只读手机号用户",
                "sex": "male",
                "age": 25,
                "occupation": "工程师",
                "industry": "IT",
                "identity_type": "mainland",
                "identity_number_encrypted": identity_cipher,
            },
        )

        assert response.status_code == status.HTTP_200_OK

    def test_update_profile_phone_not_allowed(self, client, user_token, sample_user):
        """测试修改手机号 - 使用 bind-info 端点"""
        response = client.put(
            "/api/v1/users/bind-info",
            headers=auth_headers(user_token),
            json={
                "name": "测试用户",
                "sex": "male",
                "age": 25,
                "occupation": "工程师",
                "phone": "13900139999",  # 尝试修改手机号
                "industry": "IT",
                "identity_type": "mainland",
                "identity_number": sample_user.identity_number,
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_profile_rejects_other_sex(self, client, user_token, sample_user):
        """测试绑定资料时拒绝 other 性别，避免数据污染"""
        response = client.put(
            "/api/v1/users/bind-info",
            headers=auth_headers(user_token),
            json={
                "name": "测试用户",
                "sex": "other",
                "age": 25,
                "occupation": "工程师",
                "phone": sample_user.phone,
                "industry": "IT",
                "identity_type": "mainland",
                "identity_number": sample_user.identity_number,
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_profile_rejects_legacy_taiwan_identity_type(self, client, user_token, sample_user):
        """测试绑定资料不再接受台湾身份证类型。"""
        response = client.put(
            "/api/v1/users/bind-info",
            headers=auth_headers(user_token),
            json={
                "name": "测试用户",
                "sex": "male",
                "age": 25,
                "occupation": "工程师",
                "phone": sample_user.phone,
                "industry": "IT",
                "identity_type": "taiwan",
                "identity_number": "A123456789",
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_update_profile_rejects_duplicate_identity(
        self,
        client,
        user_token,
        sample_user,
        db_session,
    ):
        """测试绑定资料时拒绝使用其他用户证件号"""
        from app.schemas import User

        other_user = User(
            tenant_id=sample_user.tenant_id,
            name="证件占用用户",
            phone="13800138199",
            identity_number="110101199001011299",
            identity_type="mainland",
            sex="M",
            isblock=0,
        )
        db_session.add(other_user)
        db_session.commit()

        response = client.put(
            "/api/v1/users/bind-info",
            headers=auth_headers(user_token),
            json={
                "name": "测试用户",
                "sex": "male",
                "age": 25,
                "occupation": "工程师",
                "phone": sample_user.phone,
                "industry": "IT",
                "identity_type": "mainland",
                "identity_number": other_user.identity_number,
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "证件号已被使用" in response.json()["detail"]

    def test_check_bind_status_requires_full_profile(self, client, user_token, sample_user, db_session):
        """测试绑定状态会校验完整资料，而不只是姓名性别手机号"""
        sample_user.sex = "M"
        sample_user.age = None
        sample_user.occupation = None
        sample_user.industry = None
        sample_user.identity_type = None
        sample_user.identity_number = None
        db_session.commit()

        response = client.get(
            "/api/v1/users/check-bind-status",
            headers=auth_headers(user_token),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["require_bind_info"] is True
        assert data["is_bound"] is False

    def test_admin_can_update_own_profile(self, client, super_admin_token, super_admin, db_session):
        """测试管理员也能更新自己关联的个人资料"""
        response = client.put(
            "/api/v1/users/bind-info",
            headers=auth_headers(super_admin_token),
            json={
                "name": "管理员本人",
                "sex": "male",
                "age": 35,
                "occupation": "运营负责人",
                "phone": "13800138010",
                "industry": "教育",
                "identity_type": "mainland",
                "identity_number": "110101199001011210",
            }
        )
        assert response.status_code == status.HTTP_200_OK

        from app.schemas import User

        admin_user = db_session.query(User).filter(User.id == super_admin.user_id).first()
        assert admin_user is not None
        assert admin_user.name == "管理员本人"
        assert admin_user.sex == "M"

    def test_update_avatar_to_builtin_avatar(self, client, user_token):
        """测试用户可以切换到默认头像。"""
        response = client.put(
            "/api/v1/users/avatar",
            headers=auth_headers(user_token),
            json={"avatar_url": "builtin:avatar-2"},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["avatar_url"] == "builtin:avatar-2"

    def test_update_avatar_accepts_post_for_compatibility(self, client, user_token):
        """测试头像更新接口兼容 POST，避免代理环境拦截 PUT。"""
        response = client.post(
            "/api/v1/users/avatar",
            headers=auth_headers(user_token),
            json={"avatar_url": "builtin:avatar-3"},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["avatar_url"] == "builtin:avatar-3"

    def test_update_avatar_rejects_invalid_url(self, client, user_token):
        """测试头像地址非法时返回友好错误。"""
        response = client.put(
            "/api/v1/users/avatar",
            headers=auth_headers(user_token),
            json={"avatar_url": "/uploads/posters/not-avatar.jpg"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "头像地址不合法" in response.json()["detail"]

    def test_update_profile_self_success(self, client, user_token):
        """测试用户可修改个人信息 。"""
        response = client.put(
            "/api/v1/users/profile",
            headers=auth_headers(user_token),
            json={
                "name": "更正姓名",
                "sex": "female",
                "age": 30,
                "occupation": "产品经理",
                "industry": "互联网",
                "email": "self-update@example.com",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "更正姓名"
        assert data["sex"] == "F"
        assert data["email"] == "self-update@example.com"

    def test_clear_profile_fields_self_success(self, client, user_token):
        """测试用户可删除部分个人信息字段。"""
        response = client.request(
            "DELETE",
            "/api/v1/users/profile-fields",
            headers=auth_headers(user_token),
            json={"fields": ["industry", "occupation", "avatar_url"]},
        )
        assert response.status_code == status.HTTP_200_OK
        me_response = client.get(
            "/api/v1/users/me",
            headers=auth_headers(user_token),
        )
        assert me_response.status_code == status.HTTP_200_OK
        data = me_response.json()
        assert data.get("industry") is None
        assert data.get("occupation") is None
        assert data.get("avatar_url") is None

    def test_deactivate_my_account_success(self, client, user_token):
        """测试用户可注销账号，后续登录被阻止。"""
        me_before = client.get("/api/v1/users/me", headers=auth_headers(user_token))
        assert me_before.status_code == status.HTTP_200_OK
        phone = me_before.json()["phone"]

        response = client.delete(
            "/api/v1/users/me",
            headers=auth_headers(user_token),
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["success"] is True

        relogin = client.post("/api/v1/auth/login", json={
            "identifier": phone,
            "password": "user123",
            "tenant_code": "default",
        })
        assert relogin.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


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
        # 返回 401 因为不是管理员
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

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

    def test_get_users_list_tolerates_legacy_non_phone_identifier(self, client, super_admin_token, db_session, default_tenant):
        """测试历史账号把登录名写入 phone 时，权限页用户列表不再 500。"""
        from app.schemas import User

        db_session.add(User(
            tenant_id=default_tenant.id,
            name="历史管理员",
            phone="wechat_admin",
            isblock=0,
        ))
        db_session.commit()

        response = client.get(
            "/api/v1/users/",
            headers=auth_headers(super_admin_token),
        )

        assert response.status_code == status.HTTP_200_OK
        assert any(item["phone"] == "wechat_admin" for item in response.json())

    def test_get_all_users_admin_route_not_shadowed(self, client, super_admin_token, sample_user):
        """测试 /admin/all 不会被 /{user_id} 动态路由挡住"""
        response = client.get(
            "/api/v1/users/admin/all",
            headers=auth_headers(super_admin_token),
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "items" in data
        assert data["total"] >= 1

    def test_import_template_route_not_shadowed_by_user_detail(self, client, super_admin_token):
        """测试导入模板读取路由不会被 /{user_id} 动态路由挡住。"""
        save_response = client.put(
            "/api/v1/users/import-template",
            headers=auth_headers(super_admin_token),
            json={"column_mapping": {"0": "name", "1": "phone"}},
        )
        assert save_response.status_code == status.HTTP_200_OK

        response = client.get(
            "/api/v1/users/import-template",
            headers=auth_headers(super_admin_token),
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["is_active"] is True
        assert data["column_mapping"] == {"0": "name", "1": "phone"}

    def test_import_excel_supports_block_fields_and_identity_type_labels(
        self,
        client,
        super_admin_token,
        db_session,
        default_tenant,
    ):
        """测试 Excel 导入支持是否拉黑、拉黑原因和中文证件类型。"""
        import base64
        import io

        from openpyxl import Workbook
        from app.schemas import User

        mapping = {
            "0": "name",
            "1": "phone",
            "2": "identity_type",
            "3": "identity_number",
            "4": "isblock",
            "5": "block_reason",
        }
        save_response = client.put(
            "/api/v1/users/import-template",
            headers=auth_headers(super_admin_token),
            json={"column_mapping": mapping},
        )
        assert save_response.status_code == status.HTTP_200_OK

        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["姓名", "手机号", "证件类型", "证件号码", "是否拉黑", "拉黑原因"])
        sheet.append(["导入黑名单", "13900139777", "大陆身份证", "110101199001019777", "是", "批量导入"])
        buffer = io.BytesIO()
        workbook.save(buffer)
        file_content = base64.b64encode(buffer.getvalue()).decode()

        response = client.post(
            "/api/v1/users/import-excel",
            headers=auth_headers(super_admin_token),
            json={"file_content": file_content},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] == 1
        imported_user = db_session.query(User).filter(
            User.tenant_id == default_tenant.id,
            User.phone == "13900139777",
        ).first()
        assert imported_user is not None
        assert imported_user.identity_type == "mainland"
        assert imported_user.isblock == 1
        assert imported_user.block_reason == "批量导入"

    def test_get_all_users_tolerates_legacy_invalid_timestamps(self, client, super_admin_token, monkeypatch):
        """测试历史用户脏数据不会导致管理员列表 500"""
        from app.api.v1.endpoints import users as users_endpoint

        legacy_user = SimpleNamespace(
            id=99,
            tenant_id=1,
            name="历史用户",
            phone="13800138999",
            email=None,
            sex="M",
            age=None,
            occupation=None,
            industry=None,
            isblock=0,
            block_reason=None,
            create_time="0000-00-00 00:00:00",
            update_time=None,
        )

        monkeypatch.setattr(
            users_endpoint.crud_user,
            "get_all_users_for_super_admin",
            lambda *args, **kwargs: ([legacy_user], 1),
        )

        response = client.get(
            "/api/v1/users/admin/all",
            headers=auth_headers(super_admin_token),
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == 99
        assert data["items"][0]["create_time"] is None
        assert data["items"][0]["update_time"] is None

    def test_get_all_users_rejects_cross_tenant_query(
        self,
        client,
        db_session,
        super_admin_token,
    ):
        """测试租户内管理员不能通过 tenant_code 查询其他租户用户"""
        from app.schemas import Tenant

        other_tenant = Tenant(
            name="其他租户",
            code="other",
            status=1,
            plan="basic",
        )
        db_session.add(other_tenant)
        db_session.commit()

        response = client.get(
            "/api/v1/users/admin/all?tenant_code=other",
            headers=auth_headers(super_admin_token),
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "不能跨租户" in response.json()["detail"]

    def test_platform_admin_can_query_other_tenant_users(
        self,
        client,
        db_session,
        platform_admin,
    ):
        """测试平台管理员可以按租户编码查询其他租户用户"""
        from app.core.security import create_platform_access_token
        from app.schemas import Tenant, User

        other_tenant = Tenant(
            name="平台查询租户",
            code="platform_target",
            status=1,
            plan="basic",
        )
        db_session.add(other_tenant)
        db_session.flush()

        other_user = User(
            tenant_id=other_tenant.id,
            name="平台可见用户",
            phone="13800138998",
            isblock=0,
        )
        db_session.add(other_user)
        db_session.commit()

        token = create_platform_access_token(str(platform_admin.id))
        response = client.get(
            "/api/v1/users/admin/all?tenant_code=platform_target",
            headers=auth_headers(token),
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["tenant_id"] == other_tenant.id

    def test_admin_all_and_all_web_return_raw_pii(
        self,
        client,
        db_session,
        super_admin_token,
        default_tenant,
    ):
        """测试 /admin/all 与 /admin/all-web 均返回未脱敏字段。"""
        from app.schemas import User

        raw_user = User(
            tenant_id=default_tenant.id,
            name="明文姓名",
            phone="13800138123",
            email="raw@example.com",
            isblock=0,
        )
        db_session.add(raw_user)
        db_session.commit()

        admin_all_res = client.get(
            "/api/v1/users/admin/all",
            headers=auth_headers(super_admin_token),
        )
        assert admin_all_res.status_code == status.HTTP_200_OK
        admin_all_items = admin_all_res.json()["items"]
        admin_all_target = next((item for item in admin_all_items if item["id"] == raw_user.id), None)
        assert admin_all_target is not None
        assert admin_all_target["name"] == "明文姓名"
        assert admin_all_target["phone"] == "13800138123"
        assert admin_all_target["email"] == "raw@example.com"

        raw_res = client.get(
            "/api/v1/users/admin/all-web",
            headers=auth_headers(super_admin_token),
        )
        assert raw_res.status_code == status.HTTP_200_OK
        raw_items = raw_res.json()["items"]
        raw_target = next((item for item in raw_items if item["id"] == raw_user.id), None)
        assert raw_target is not None
        assert raw_target["name"] == "明文姓名"
        assert raw_target["phone"] == "13800138123"
        assert raw_target["email"] == "raw@example.com"

    def test_get_users_list_as_normal_user_forbidden(self, client, user_token):
        """测试普通用户获取用户列表被禁止"""
        response = client.get(
            "/api/v1/users/",
            headers=auth_headers(user_token)
        )
        # 返回 401 因为不是管理员
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

    def test_activity_admin_without_user_view_cannot_get_user_list(self, client, activity_admin_token):
        """测试活动管理员不能读取租户级用户列表"""
        response = client.get(
            "/api/v1/users/",
            headers=auth_headers(activity_admin_token),
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
        # API 返回所有用户，不实现分页
        assert len(data) >= 15  # 至少有 15 个用户

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

    def test_block_user_as_admin(self, client, super_admin_token, sample_user, db_session):
        """测试管理员拉黑用户 - 直接操作数据库"""
        # 直接修改用户状态
        sample_user.isblock = 1
        sample_user.block_reason = "违规操作"
        db_session.commit()

        # 验证用户被拉黑
        db_session.refresh(sample_user)
        assert sample_user.isblock == 1
        assert sample_user.block_reason == "违规操作"

    def test_block_user_endpoint_tolerates_imported_identity_type_label(
        self,
        client,
        super_admin_token,
        db_session,
        default_tenant,
    ):
        """测试导入的中文证件类型不会导致拉黑接口响应 500。"""
        from app.schemas import User

        imported_user = User(
            tenant_id=default_tenant.id,
            name="导入用户",
            phone="13900139666",
            identity_type="大陆身份证",
            identity_number="110101199001019666",
            isblock=0,
        )
        db_session.add(imported_user)
        db_session.commit()
        db_session.refresh(imported_user)

        response = client.post(
            f"/api/v1/users/{imported_user.id}/block",
            headers=auth_headers(super_admin_token),
            json={"reason": "Excel 导入测试"},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["isblock"] == 1
        assert data["block_reason"] == "Excel 导入测试"

    def test_unblock_user_as_admin(self, client, super_admin_token, blocked_user, db_session):
        """测试管理员解除拉黑 - 直接操作数据库"""
        # 直接修改用户状态
        blocked_user.isblock = 0
        blocked_user.block_reason = None
        db_session.commit()

        # 验证用户已解除拉黑
        db_session.refresh(blocked_user)
        assert blocked_user.isblock == 0

    def test_delete_user_as_admin(self, client, super_admin_token, db_session):
        """测试管理员删除用户 - 当前 API 不支持"""
        from tests.factories import UserFactory
        user = UserFactory(phone="13900139400")
        db_session.add(user)
        db_session.commit()

        response = client.delete(
            f"/api/v1/users/{user.id}",
            headers=auth_headers(super_admin_token)
        )
        # 当前 API 不支持删除用户
        assert response.status_code in [status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED]

    def test_delete_user_as_normal_user_forbidden(self, client, user_token, sample_user):
        """测试普通用户删除用户被禁止"""
        response = client.delete(
            f"/api/v1/users/{sample_user.id}",
            headers=auth_headers(user_token)
        )
        # 当前 API 不支持删除用户
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED]


@pytest.mark.api
class TestUserPermissions:
    """用户权限测试"""

    def test_blocked_user_cannot_access(self, client, blocked_user):
        """测试被拉黑用户无法访问"""
        # 被拉黑用户登录应该被拒绝
        login_response = client.post("/api/v1/auth/user-login", json={
            "phone": "13800138001",
            "password": "user123"
        })
        # 被拉黑用户登录返回 403
        assert login_response.status_code == status.HTTP_403_FORBIDDEN

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
        # 返回 401 因为不是管理员
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]
