"""数据库集成测试。"""
from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.schemas import (
    Activity,
    ActivityParticipant,
    ActivityType,
    AdminUser,
    CheckInRecord,
    PaymentOrder,
    Permission,
    Role,
    RolePermission,
    Tenant,
    User,
    UserRole,
)


@pytest.mark.integration
class TestDatabaseSchema:
    """数据库模式测试"""

    def test_create_all_tables(self, db_session: Session):
        """测试所有主要表均可访问"""
        tables = [
            Tenant,
            AdminUser,
            User,
            Activity,
            ActivityType,
            ActivityParticipant,
            CheckInRecord,
            PaymentOrder,
            Permission,
            Role,
            RolePermission,
            UserRole,
        ]

        for table in tables:
            assert isinstance(db_session.query(table).all(), list)

    def test_activity_can_reference_activity_type(self, db_session: Session):
        """测试活动类型与活动关联能正常保存"""
        activity_type = ActivityType(type_name="测试类型", code="TEST", tenant_id=1)
        db_session.add(activity_type)
        db_session.commit()

        activity = Activity(
            tenant_id=1,
            activity_name="测试活动",
            activity_type_id=activity_type.id,
            status=1,
        )
        db_session.add(activity)
        db_session.commit()
        db_session.refresh(activity)

        assert activity.activity_type_id == activity_type.id

    def test_admin_username_can_repeat_across_accounts(self, db_session: Session):
        """测试当前模型未对管理员用户名加唯一约束"""
        admin1 = AdminUser(
            tenant_id=1,
            user_id=5001,
            username="unique_admin",
            password_hash=hash_password("password"),
        )
        admin2 = AdminUser(
            tenant_id=1,
            user_id=5002,
            username="unique_admin",
            password_hash=hash_password("password"),
        )
        db_session.add(admin1)
        db_session.commit()
        db_session.add(admin2)

        db_session.commit()
        assert db_session.query(AdminUser).filter_by(username="unique_admin").count() == 2

    def test_user_phone_unique_per_tenant(self, db_session: Session):
        """测试用户手机号在同租户内唯一"""
        user1 = User(
            tenant_id=1,
            name="用户1",
            phone="13800138021",
            password_hash=hash_password("password"),
        )
        user2 = User(
            tenant_id=1,
            name="用户2",
            phone="13800138021",
            password_hash=hash_password("password"),
        )
        db_session.add(user1)
        db_session.commit()
        db_session.add(user2)

        with pytest.raises(IntegrityError):
            db_session.commit()


@pytest.mark.integration
class TestDatabaseTransactions:
    """数据库事务测试"""

    def test_transaction_commit(self, db_session: Session):
        """测试事务提交"""
        user = User(
            tenant_id=1,
            name="事务用户",
            phone="13800138888",
            password_hash=hash_password("password"),
            identity_number="110101199001015000",
        )
        db_session.add(user)
        db_session.commit()

        retrieved_user = db_session.query(User).filter_by(phone="13800138888").first()
        assert retrieved_user is not None
        assert retrieved_user.name == "事务用户"

    def test_transaction_rollback(self, db_session: Session):
        """测试事务回滚"""
        user = User(
            tenant_id=1,
            name="回滚用户",
            phone="13800138889",
            password_hash=hash_password("password"),
            identity_number="110101199001015001",
        )
        db_session.add(user)
        db_session.rollback()

        retrieved_user = db_session.query(User).filter_by(phone="13800138889").first()
        assert retrieved_user is None

    def test_nested_transaction(self, db_session: Session):
        """测试嵌套事务（savepoint）"""
        user = User(
            tenant_id=1,
            name="初始用户",
            phone="13800138900",
            password_hash=hash_password("password"),
            identity_number="110101199001015002",
        )
        db_session.add(user)
        db_session.commit()

        nested = db_session.begin_nested()
        user.name = "修改后"
        db_session.flush()
        nested.rollback()

        db_session.refresh(user)
        assert user.name == "初始用户"

    def test_batch_insert_activities(self, db_session: Session):
        """测试批量插入活动"""
        activity_type = ActivityType(type_name="并发测试", code="CONCUR", tenant_id=1)
        db_session.add(activity_type)
        db_session.commit()

        for i in range(10):
            db_session.add(
                Activity(
                    tenant_id=1,
                    activity_name=f"并发活动{i}",
                    activity_type_id=activity_type.id,
                    status=1,
                )
            )

        db_session.commit()
        count = db_session.query(Activity).filter_by(activity_type_id=activity_type.id).count()
        assert count == 10


@pytest.mark.integration
class TestMultiTenantIsolation:
    """多租户隔离测试"""

    def test_tenant_data_isolation(self, db_session: Session):
        """测试租户数据隔离"""
        user1 = User(
            name="租户1用户",
            phone="13800138100",
            password_hash=hash_password("password"),
            identity_number="110101199001015010",
            tenant_id=1,
        )
        user2 = User(
            name="租户2用户",
            phone="13800138200",
            password_hash=hash_password("password"),
            identity_number="110101199001015020",
            tenant_id=2,
        )
        db_session.add_all([user1, user2])
        db_session.commit()

        tenant1_users = db_session.query(User).filter_by(tenant_id=1).all()
        tenant2_users = db_session.query(User).filter_by(tenant_id=2).all()

        assert len(tenant1_users) == 1
        assert len(tenant2_users) == 1
        assert tenant1_users[0].tenant_id == 1
        assert tenant2_users[0].tenant_id == 2


@pytest.mark.integration
class TestDatabaseQueries:
    """数据库查询测试"""

    def test_joined_query(self, db_session: Session):
        """测试关联查询"""
        activity_type = ActivityType(type_name="关联查询测试", code="JOIN", tenant_id=1)
        db_session.add(activity_type)
        db_session.commit()

        activity = Activity(
            tenant_id=1,
            activity_name="测试活动",
            activity_type_id=activity_type.id,
            status=1,
        )
        db_session.add(activity)
        db_session.commit()

        result = (
            db_session.query(Activity, ActivityType)
            .join(ActivityType, Activity.activity_type_id == ActivityType.id)
            .first()
        )

        assert result is not None
        queried_activity, queried_type = result
        assert queried_activity.activity_name == "测试活动"
        assert queried_type.type_name == "关联查询测试"

    def test_filtered_query(self, db_session: Session):
        """测试过滤查询"""
        activity_type = ActivityType(type_name="过滤测试", code="FILTER", tenant_id=1)
        db_session.add(activity_type)
        db_session.commit()

        for status_val in [1, 2, 3]:
            db_session.add(
                Activity(
                    tenant_id=1,
                    activity_name=f"状态{status_val}活动",
                    activity_type_id=activity_type.id,
                    status=status_val,
                )
            )
        db_session.commit()

        assert len(db_session.query(Activity).filter_by(status=1).all()) == 1
        assert len(db_session.query(Activity).filter_by(status=2).all()) == 1
        assert len(db_session.query(Activity).filter_by(status=3).all()) == 1

    def test_aggregated_query(self, db_session: Session):
        """测试聚合查询"""
        activity_type = ActivityType(type_name="聚合测试", code="AGG", tenant_id=1)
        db_session.add(activity_type)
        db_session.commit()

        for i in range(5):
            db_session.add(
                Activity(
                    tenant_id=1,
                    activity_name=f"活动{i}",
                    activity_type_id=activity_type.id,
                    status=1,
                )
            )
        db_session.commit()

        count = db_session.query(Activity).filter_by(activity_type_id=activity_type.id).count()
        assert count == 5


@pytest.mark.integration
class TestDatabaseConstraints:
    """数据库约束测试"""

    def test_not_null_constraint(self, db_session: Session):
        """测试当前用户模型允许 phone 为空"""
        user = User(
            tenant_id=1,
            name="测试",
            password_hash=hash_password("password"),
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        assert user.phone is None

    def test_payment_order_unique_order_no(self, db_session: Session):
        """测试支付订单号唯一约束"""
        order1 = PaymentOrder(
            tenant_id=1,
            order_no="ORDER-001",
            activity_id=1,
            suggested_fee=100,
            actual_fee=100,
            status=0,
            expire_at=datetime(2026, 4, 6, 12, 0, 0),
        )
        order2 = PaymentOrder(
            tenant_id=1,
            order_no="ORDER-001",
            activity_id=2,
            suggested_fee=100,
            actual_fee=100,
            status=0,
            expire_at=datetime(2026, 4, 6, 12, 0, 0),
        )
        db_session.add(order1)
        db_session.commit()
        db_session.add(order2)

        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_default_values(self, db_session: Session):
        """测试默认值"""
        activity_type = ActivityType(type_name="默认值测试", code="DEFAULT", tenant_id=1)
        db_session.add(activity_type)
        db_session.commit()

        activity = Activity(
            tenant_id=1,
            activity_name="默认活动",
            activity_type_id=activity_type.id,
        )
        db_session.add(activity)
        db_session.commit()

        retrieved_activity = db_session.query(Activity).filter_by(id=activity.id).first()
        assert retrieved_activity.status == 1
