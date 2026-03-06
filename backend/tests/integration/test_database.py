"""
数据库集成测试
"""
import pytest
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.schemas import (
    Base,
    AdminUser,
    User,
    Activity,
    ActivityType,
    ActivityParticipant,
    CheckInRecord,
    AdminActivityTypeRole,
)
from app.core.security import hash_password


@pytest.mark.integration
class TestDatabaseSchema:
    """数据库模式测试"""

    def test_create_all_tables(self, db_session: Session):
        """测试所有表创建成功"""
        # 验证所有主要表都可以访问
        tables = [
            AdminUser,
            User,
            Activity,
            ActivityType,
            ActivityParticipant,
            CheckInRecord,
            AdminActivityTypeRole,
        ]

        for table in tables:
            # 尝试查询表（不会返回数据，但验证表存在）
            result = db_session.query(table).all()
            assert isinstance(result, list)

    def test_foreign_key_constraints(self, db_session: Session):
        """测试外键约束"""
        activity_type = ActivityType(type_name="测试类型", code="TEST")
        db_session.add(activity_type)
        db_session.commit()

        # 创建关联活动类型的活动
        activity = Activity(
            activity_name="测试活动",
            activity_type_id=activity_type.id,
            status=1,
        )
        db_session.add(activity)
        db_session.commit()

        # 尝试创建关联不存在活动类型的活动（应该失败）
        invalid_activity = Activity(
            activity_name="无效活动",
            activity_type_id=99999,
            status=1,
        )
        db_session.add(invalid_activity)

        with pytest.raises(Exception):
            db_session.commit()

    def test_unique_constraints(self, db_session: Session):
        """测试唯一约束"""
        # 测试管理员用户名唯一
        admin1 = AdminUser(
            username="unique_admin",
            password_hash=hash_password("password"),
            is_super_admin=0,
        )
        db_session.add(admin1)
        db_session.commit()

        admin2 = AdminUser(
            username="unique_admin",  # 重复用户名
            password_hash=hash_password("password"),
            is_super_admin=0,
        )
        db_session.add(admin2)

        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_cascade_delete(self, db_session: Session):
        """测试级联删除"""
        activity_type = ActivityType(type_name="待删除类型", code="DEL")
        db_session.add(activity_type)
        db_session.commit()

        activity = Activity(
            activity_name="关联活动",
            activity_type_id=activity_type.id,
            status=1,
        )
        db_session.add(activity)
        db_session.commit()

        # 删除活动类型
        db_session.delete(activity_type)
        db_session.commit()

        # 验证活动也被删除或设置为 NULL（取决于外键设置）
        deleted_activity = db_session.query(Activity).filter_by(id=activity.id).first()
        # 可能是 None 或 activity_type_id 为 None
        assert deleted_activity is None or deleted_activity.activity_type_id is None


@pytest.mark.integration
class TestDatabaseTransactions:
    """数据库事务测试"""

    def test_transaction_commit(self, db_session: Session):
        """测试事务提交"""
        user = User(
            name="事务用户",
            phone="13800138888",
            password_hash=hash_password("password"),
            identity_number="110101199001015000",
        )
        db_session.add(user)
        db_session.commit()

        # 验证数据已提交
        retrieved_user = db_session.query(User).filter_by(phone="13800138888").first()
        assert retrieved_user is not None
        assert retrieved_user.name == "事务用户"

    def test_transaction_rollback(self, db_session: Session):
        """测试事务回滚"""
        # 开始一个事务
        user = User(
            name="回滚用户",
            phone="13800138889",
            password_hash=hash_password("password"),
            identity_number="110101199001015001",
        )
        db_session.add(user)

        # 回滚事务
        db_session.rollback()

        # 验证数据未保存
        retrieved_user = db_session.query(User).filter_by(phone="13800138889").first()
        assert retrieved_user is None

    def test_nested_transaction(self, db_session: Session):
        """测试嵌套事务（savepoint）"""
        # 创建初始数据
        user = User(
            name="初始用户",
            phone="13800138900",
            password_hash=hash_password("password"),
            identity_number="110101199001015002",
        )
        db_session.add(user)
        db_session.commit()

        # 开始嵌套事务
        user.name = "修改后"
        db_session.begin_nested()

        # 回滚嵌套事务
        db_session.rollback()

        # 验证外层事务不受影响
        db_session.commit()
        retrieved_user = db_session.query(User).filter_by(phone="13800138900").first()
        assert retrieved_user.name == "初始用户"

    def test_concurrent_operations(self, db_session: Session):
        """测试并发操作"""
        # 创建活动类型
        activity_type = ActivityType(type_name="并发测试", code="CONCUR")
        db_session.add(activity_type)
        db_session.commit()

        # 批量创建活动
        activities = []
        for i in range(10):
            activity = Activity(
                activity_name=f"并发活动{i}",
                activity_type_id=activity_type.id,
                status=1,
            )
            activities.append(activity)
            db_session.add(activity)

        db_session.commit()

        # 验证所有活动都已创建
        count = db_session.query(Activity).filter_by(activity_type_id=activity_type.id).count()
        assert count == 10


@pytest.mark.integration
class TestMultiTenantIsolation:
    """多租户隔离测试"""

    def test_tenant_data_isolation(self, db_session: Session):
        """测试租户数据隔离"""
        # 注意：当前实现可能还没有完整的租户隔离
        # 这个测试为未来的多租户功能做准备

        # 创建两个租户的用户
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

        # 验证租户隔离
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
        activity_type = ActivityType(type_name="关联查询测试", code="JOIN")
        db_session.add(activity_type)
        db_session.commit()

        activity = Activity(
            activity_name="测试活动",
            activity_type_id=activity_type.id,
            status=1,
        )
        db_session.add(activity)
        db_session.commit()

        # 使用 join 查询
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
        # 创建不同状态的活动
        activity_type = ActivityType(type_name="过滤测试", code="FILTER")
        db_session.add(activity_type)
        db_session.commit()

        for status_val in [1, 2, 3]:
            activity = Activity(
                activity_name=f"状态{status_val}活动",
                activity_type_id=activity_type.id,
                status=status_val,
            )
            db_session.add(activity)
        db_session.commit()

        # 查询特定状态的活动
        status_1_activities = db_session.query(Activity).filter_by(status=1).all()
        status_2_activities = db_session.query(Activity).filter_by(status=2).all()
        status_3_activities = db_session.query(Activity).filter_by(status=3).all()

        assert len(status_1_activities) == 1
        assert len(status_2_activities) == 1
        assert len(status_3_activities) == 1

    def test_aggregated_query(self, db_session: Session):
        """测试聚合查询"""
        activity_type = ActivityType(type_name="聚合测试", code="AGG")
        db_session.add(activity_type)
        db_session.commit()

        # 创建多个活动
        for i in range(5):
            activity = Activity(
                activity_name=f"活动{i}",
                activity_type_id=activity_type.id,
                status=1,
            )
            db_session.add(activity)
        db_session.commit()

        # 统计活动数量
        count = db_session.query(Activity).filter_by(activity_type_id=activity_type.id).count()
        assert count == 5


@pytest.mark.integration
class TestDatabaseConstraints:
    """数据库约束测试"""

    def test_not_null_constraint(self, db_session: Session):
        """测试非空约束"""
        # 尝试创建缺少必填字段的用户
        user = User(
            name="测试",
            # phone 缺失
            password_hash=hash_password("password"),
        )
        db_session.add(user)

        with pytest.raises(Exception):
            db_session.commit()

    def test_check_constraint(self, db_session: Session):
        """测试检查约束"""
        # 尝试创建无效状态的活动
        activity_type = ActivityType(type_name="约束测试", code="CONST")
        db_session.add(activity_type)
        db_session.commit()

        activity = Activity(
            activity_name="无效状态活动",
            activity_type_id=activity_type.id,
            status=999,  # 无效状态
        )
        db_session.add(activity)

        with pytest.raises(Exception):
            db_session.commit()

    def test_default_values(self, db_session: Session):
        """测试默认值"""
        activity_type = ActivityType(type_name="默认值测试", code="DEFAULT")
        db_session.add(activity_type)
        db_session.commit()

        activity = Activity(
            activity_name="默认活动",
            activity_type_id=activity_type.id,
        )
        db_session.add(activity)
        db_session.commit()

        # 验证默认值
        retrieved_activity = db_session.query(Activity).filter_by(id=activity.id).first()
        assert retrieved_activity.status == 1  # 默认未开始状态
