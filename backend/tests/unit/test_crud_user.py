"""
用户 CRUD 单元测试
"""
import pytest
from sqlalchemy.orm import Session

from app.crud.crud_user import (
    create_user,
    get_user,
    get_user_by_phone,
    get_user_by_wx_openid,
    get_users,
    get_or_create_user_wechat,
    register_user,
    authenticate_user,
)
from app.core.security import hash_password
from app.schemas import User
from app.models.user import UserCreate, RegisterRequest
from tests.factories import UserFactory


@pytest.mark.unit
class TestUserCRUD:
    """用户 CRUD 操作测试"""

    def test_register_user_success(self, db_session: Session):
        """测试成功注册用户"""
        register_data = RegisterRequest(
            name="新用户",
            phone="13800138000",
            password="password123",
        )
        user = register_user(db_session, register_data, tenant_id=1)
        assert user.id is not None
        assert user.name == "新用户"
        assert user.phone == "13800138000"
        assert user.password_hash is not None
        assert user.tenant_id == 1

    def test_register_user_with_email(self, db_session: Session):
        """测试注册带邮箱的用户"""
        register_data = RegisterRequest(
            name="邮箱用户",
            phone="13800138001",
            password="password123",
            email="user@example.com",
        )
        user = register_user(db_session, register_data, tenant_id=1)
        assert user.email == "user@example.com"

    def test_register_user_duplicate_phone(self, db_session: Session):
        """测试注册重复手机号"""
        UserFactory(phone="13800138002")
        db_session.commit()

        register_data = RegisterRequest(
            name="重复用户",
            phone="13800138002",
            password="password123",
        )
        with pytest.raises(Exception):  # HTTPException
            register_user(db_session, register_data, tenant_id=1)

    def test_create_user_success(self, db_session: Session):
        """测试创建用户"""
        user_data = UserCreate(
            name="创建用户",
            phone="13800138003",
            identity_number="110101199001011234",
            sex="M",
        )
        user = create_user(db_session, user_data, tenant_id=1)
        assert user.id is not None
        assert user.name == "创建用户"

    def test_get_user_by_id(self, db_session: Session):
        """测试通过 ID 获取用户"""
        user = UserFactory()
        db_session.commit()

        found_user = get_user(db_session, user.id, tenant_id=1)
        assert found_user is not None
        assert found_user.id == user.id

    def test_get_user_by_id_not_found(self, db_session: Session):
        """测试获取不存在的用户"""
        found_user = get_user(db_session, 99999, tenant_id=1)
        assert found_user is None

    def test_get_user_by_phone_found(self, db_session: Session):
        """测试通过手机号获取用户"""
        user = UserFactory(phone="13900139000")
        db_session.commit()

        found_user = get_user_by_phone(db_session, "13900139000", tenant_id=1)
        assert found_user is not None
        assert found_user.phone == "13900139000"

    def test_get_user_by_phone_not_found(self, db_session: Session):
        """测试获取不存在的手机号"""
        found_user = get_user_by_phone(db_session, "99999999999", tenant_id=1)
        assert found_user is None

    def test_get_user_by_wx_openid_found(self, db_session: Session):
        """测试通过微信 OpenID 获取用户"""
        user = UserFactory(wx_openid="wx_openid_123")
        db_session.commit()

        found_user = get_user_by_wx_openid(db_session, "wx_openid_123", tenant_id=1)
        assert found_user is not None
        assert found_user.wx_openid == "wx_openid_123"

    def test_get_user_by_wx_openid_not_found(self, db_session: Session):
        """测试获取不存在的微信用户"""
        found_user = get_user_by_wx_openid(db_session, "nonexistent_wx", tenant_id=1)
        assert found_user is None

    def test_get_users(self, db_session: Session):
        """测试获取用户列表"""
        # 创建多个用户
        for i in range(5):
            user = UserFactory(phone=f"138{i:08d}")
            db_session.add(user)
        db_session.commit()

        users = get_users(db_session, tenant_id=1)
        assert len(users) >= 5

    def test_authenticate_user_success(self, db_session: Session):
        """测试成功的用户认证"""
        user = UserFactory(phone="13800138888")
        user.password_hash = hash_password("correct_password")
        db_session.add(user)
        db_session.commit()

        authenticated = authenticate_user(
            db_session,
            "13800138888",
            "correct_password",
            tenant_id=1
        )
        assert authenticated is not None
        assert authenticated.id == user.id

    def test_authenticate_user_wrong_password(self, db_session: Session):
        """测试错误密码的认证"""
        user = UserFactory(phone="13800138889")
        user.password_hash = hash_password("correct_password")
        db_session.add(user)
        db_session.commit()

        authenticated = authenticate_user(
            db_session,
            "13800138889",
            "wrong_password",
            tenant_id=1
        )
        assert authenticated is None

    def test_authenticate_user_not_found(self, db_session: Session):
        """测试认证不存在的用户"""
        authenticated = authenticate_user(
            db_session,
            "99999999999",
            "password",
            tenant_id=1
        )
        assert authenticated is None

    def test_get_or_create_user_wechat_existing(self, db_session: Session):
        """测试微信登录 - 已存在用户"""
        user = UserFactory(wx_openid="wx_existing_123")
        db_session.commit()

        found_user = get_or_create_user_wechat(
            db_session,
            "wx_existing_123",
            tenant_id=1,
            nickname="微信用户"
        )
        assert found_user is not None
        assert found_user.id == user.id

    def test_get_or_create_user_wechat_new(self, db_session: Session):
        """测试微信登录 - 创建新用户"""
        new_user = get_or_create_user_wechat(
            db_session,
            "wx_new_456",
            tenant_id=1,
            nickname="新微信用户"
        )
        assert new_user is not None
        assert new_user.wx_openid == "wx_new_456"
        assert new_user.name == "新微信用户"
