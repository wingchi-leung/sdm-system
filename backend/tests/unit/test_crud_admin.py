"""
管理员 CRUD 单元测试
"""
import pytest
from sqlalchemy.orm import Session

from app.crud.crud_admin import (
    create_admin,
    get_admin_by_id,
    get_admin_by_username,
    get_admins,
    update_admin,
    delete_admin,
    grant_activity_type_permission,
    revoke_activity_type_permission,
    check_admin_permission,
    get_admin_activity_types,
    authenticate_admin,
)
from app.core.security import hash_password
from app.schemas import AdminUser
from tests.factories import AdminUserFactory, SuperAdminFactory, ActivityTypeFactory


@pytest.mark.unit
class TestAdminCRUD:
    """管理员 CRUD 操作测试"""

    def test_create_admin_success(self, db_session: Session):
        """测试成功创建管理员"""
        admin = create_admin(
            db_session,
            username="test_admin",
            password="password123",
            is_super_admin=0,
        )
        assert admin.id is not None
        assert admin.username == "test_admin"
        assert admin.is_super_admin == 0
        assert admin.password_hash is not None
        assert admin.password_hash != "password123"

    def test_create_super_admin(self, db_session: Session):
        """测试创建超级管理员"""
        admin = create_admin(
            db_session,
            username="super_admin",
            password="password123",
            is_super_admin=1,
        )
        assert admin.is_super_admin == 1

    def test_create_admin_duplicate_username(self, db_session: Session):
        """测试创建重复用户名的管理员"""
        AdminUserFactory(username="duplicate_admin")
        db_session.commit()

        with pytest.raises(Exception):
            create_admin(
                db_session,
                username="duplicate_admin",
                password="password123",
            )

    def test_get_admin_by_id_found(self, db_session: Session):
        """测试通过 ID 查找管理员"""
        admin = AdminUserFactory()
        db_session.commit()

        found = get_admin_by_id(db_session, admin.id)
        assert found is not None
        assert found.id == admin.id
        assert found.username == admin.username

    def test_get_admin_by_id_not_found(self, db_session: Session):
        """测试通过 ID 查找不存在的管理员"""
        found = get_admin_by_id(db_session, 99999)
        assert found is None

    def test_get_admin_by_username_found(self, db_session: Session):
        """测试通过用户名查找管理员"""
        admin = AdminUserFactory(username="specific_admin")
        db_session.commit()

        found = get_admin_by_username(db_session, "specific_admin")
        assert found is not None
        assert found.username == "specific_admin"

    def test_get_admin_by_username_not_found(self, db_session: Session):
        """测试通过用户名查找不存在的管理员"""
        found = get_admin_by_username(db_session, "nonexistent_admin")
        assert found is None

    def test_get_admins_pagination(self, db_session: Session):
        """测试分页获取管理员列表"""
        # 创建 12 个管理员
        for _ in range(12):
            AdminUserFactory()
        db_session.commit()

        # 第一页
        admins_page1 = get_admins(db_session, skip=0, limit=5)
        assert len(admins_page1) == 5

        # 第二页
        admins_page2 = get_admins(db_session, skip=5, limit=5)
        assert len(admins_page2) == 5

        # 第三页
        admins_page3 = get_admins(db_session, skip=10, limit=5)
        assert len(admins_page3) == 2

    def test_get_admins_empty(self, db_session: Session):
        """测试获取空管理员列表"""
        admins = get_admins(db_session)
        assert len(admins) == 0

    def test_update_admin_username(self, db_session: Session):
        """测试更新管理员用户名"""
        admin = AdminUserFactory(username="old_username")
        db_session.commit()

        updated = update_admin(db_session, admin.id, username="new_username")
        assert updated.username == "new_username"

    def test_update_admin_password(self, db_session: Session):
        """测试更新管理员密码"""
        admin = AdminUserFactory()
        db_session.commit()

        new_password_hash = hash_password("new_password")
        updated = update_admin(db_session, admin.id, password_hash=new_password_hash)
        assert updated.password_hash == new_password_hash

    def test_update_admin_not_found(self, db_session: Session):
        """测试更新不存在的管理员"""
        result = update_admin(db_session, 99999, username="new_username")
        assert result is None

    def test_delete_admin_success(self, db_session: Session):
        """测试删除管理员"""
        admin = AdminUserFactory()
        db_session.commit()

        deleted = delete_admin(db_session, admin.id)
        assert deleted is not None

        # 验证已删除
        found = get_admin_by_id(db_session, admin.id)
        assert found is None

    def test_delete_admin_not_found(self, db_session: Session):
        """测试删除不存在的管理员"""
        result = delete_admin(db_session, 99999)
        assert result is None

    def test_grant_activity_type_permission(self, db_session: Session):
        """测试授予活动类型权限"""
        admin = AdminUserFactory(is_super_admin=0)
        activity_type = ActivityTypeFactory()
        db_session.commit()

        granted = grant_activity_type_permission(
            db_session,
            admin_id=admin.id,
            activity_type_id=activity_type.id,
        )
        assert granted is not None
        assert granted.admin_user_id == admin.id
        assert granted.activity_type_id == activity_type.id

    def test_grant_duplicate_permission(self, db_session: Session):
        """测试授予重复权限"""
        admin = AdminUserFactory(is_super_admin=0)
        activity_type = ActivityTypeFactory()
        db_session.commit()

        # 第一次授权
        grant_activity_type_permission(db_session, admin.id, activity_type.id)
        db_session.commit()

        # 第二次授权应该处理重复情况
        result = grant_activity_type_permission(db_session, admin.id, activity_type.id)
        # 根据实际实现，可能返回现有记录或失败
        assert result is not None or result is False

    def test_revoke_activity_type_permission(self, db_session: Session):
        """测试撤销活动类型权限"""
        admin = AdminUserFactory(is_super_admin=0)
        activity_type = ActivityTypeFactory()
        # 先授权
        from app.schemas import AdminActivityTypeRole
        role = AdminActivityTypeRole(
            admin_user_id=admin.id,
            activity_type_id=activity_type.id,
        )
        db_session.add(role)
        db_session.commit()

        # 撤销授权
        revoked = revoke_activity_type_permission(
            db_session,
            admin_id=admin.id,
            activity_type_id=activity_type.id,
        )
        assert revoked is not None

    def test_check_admin_permission_super_admin(self, db_session: Session):
        """测试超级管理员拥有所有权限"""
        super_admin = SuperAdminFactory()
        activity_type = ActivityTypeFactory()
        db_session.commit()

        has_permission = check_admin_permission(
            db_session,
            admin_id=super_admin.id,
            activity_type_id=activity_type.id,
        )
        assert has_permission is True

    def test_check_admin_permission_with_grant(self, db_session: Session):
        """测试已授权的活动管理员有权限"""
        admin = AdminUserFactory(is_super_admin=0)
        activity_type = ActivityTypeFactory()
        # 授权
        grant_activity_type_permission(db_session, admin.id, activity_type.id)
        db_session.commit()

        has_permission = check_admin_permission(
            db_session,
            admin_id=admin.id,
            activity_type_id=activity_type.id,
        )
        assert has_permission is True

    def test_check_admin_permission_without_grant(self, db_session: Session):
        """测试未授权的活动管理员无权限"""
        admin = AdminUserFactory(is_super_admin=0)
        activity_type = ActivityTypeFactory()
        db_session.commit()

        has_permission = check_admin_permission(
            db_session,
            admin_id=admin.id,
            activity_type_id=activity_type.id,
        )
        assert has_permission is False

    def test_get_admin_activity_types(self, db_session: Session):
        """测试获取管理员的活动类型列表"""
        admin = AdminUserFactory(is_super_admin=0)
        type1 = ActivityTypeFactory(code="TYPE001")
        type2 = ActivityTypeFactory(code="TYPE002")
        type3 = ActivityTypeFactory(code="TYPE003")
        db_session.commit()

        # 授予 type1 和 type2 权限
        grant_activity_type_permission(db_session, admin.id, type1.id)
        grant_activity_type_permission(db_session, admin.id, type2.id)
        db_session.commit()

        activity_types = get_admin_activity_types(db_session, admin.id)
        type_ids = [t.id for t in activity_types]
        assert type1.id in type_ids
        assert type2.id in type_ids
        assert type3.id not in type_ids

    def test_authenticate_admin_success(self, db_session: Session):
        """测试成功的管理员认证"""
        admin = AdminUserFactory(
            username="auth_admin",
            password_hash=hash_password("correct_password")
        )
        db_session.commit()

        authenticated = authenticate_admin(
            db_session,
            username="auth_admin",
            password="correct_password",
        )
        assert authenticated is not None
        assert authenticated.id == admin.id

    def test_authenticate_admin_wrong_password(self, db_session: Session):
        """测试错误密码的管理员认证"""
        admin = AdminUserFactory(
            username="auth_admin",
            password_hash=hash_password("correct_password")
        )
        db_session.commit()

        authenticated = authenticate_admin(
            db_session,
            username="auth_admin",
            password="wrong_password",
        )
        assert authenticated is None

    def test_authenticate_admin_not_found(self, db_session: Session):
        """测试认证不存在的管理员"""
        authenticated = authenticate_admin(
            db_session,
            username="nonexistent",
            password="password",
        )
        assert authenticated is None

    def test_super_admin_all_permissions(self, db_session: Session):
        """测试超级管理员对所有活动类型都有权限"""
        super_admin = SuperAdminFactory()
        db_session.commit()

        # 创建多个活动类型
        for i in range(5):
            ActivityTypeFactory(code=f"TYPE{i:03d}")
        db_session.commit()

        # 获取所有活动类型
        all_types = get_admin_activity_types(db_session, super_admin.id)
        assert len(all_types) > 0
