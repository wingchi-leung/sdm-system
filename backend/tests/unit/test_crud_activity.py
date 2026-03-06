"""
活动 CRUD 单元测试
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.crud.crud_activity import (
    create_activity,
    get_activity,
    get_activities,
    update_activity_status,
    update_activity,
    delete_activity,
)
from app.models.activity import ActivityCreate, ActivityUpdate
from tests.factories import ActivityFactory, ActivityTypeFactory


@pytest.mark.unit
class TestActivityCRUD:
    """活动 CRUD 操作测试"""

    def test_create_activity_success(self, db_session: Session):
        """测试成功创建活动"""
        activity_type = ActivityTypeFactory()
        db_session.commit()

        activity_data = ActivityCreate(
            activity_name="测试活动",
            activity_type_id=activity_type.id,
            start_time=datetime(2026, 6, 1, 10, 0, 0),
            tag="测试标签",
        )

        activity = create_activity(db_session, activity_data, tenant_id=1)
        assert activity.id is not None
        assert activity.activity_name == "测试活动"
        assert activity.activity_type_id == activity_type.id
        assert activity.status == 1  # 默认未开始状态
        assert activity.tag == "测试标签"

    def test_create_activity_with_participants(self, db_session: Session):
        """测试创建活动并添加参与者"""
        from app.models.participant import ParticipantCreate

        activity_type = ActivityTypeFactory()
        db_session.commit()

        activity_data = ActivityCreate(
            activity_name="带参与者的活动",
            activity_type_id=activity_type.id,
            start_time=datetime(2026, 6, 1, 10, 0, 0),
            participants=[
                ParticipantCreate(
                    participant_name="参与者1",
                    phone="13800138001",
                    identity_number="110101199001011234",
                ),
                ParticipantCreate(
                    participant_name="参与者2",
                    phone="13800138002",
                    identity_number="110101199001011235",
                ),
            ],
        )

        activity = create_activity(db_session, activity_data, tenant_id=1)
        assert activity.id is not None

        # 验证参与者已创建
        from app.schemas import ActivityParticipant
        participants = db_session.query(ActivityParticipant).filter_by(
            activity_id=activity.id
        ).all()
        assert len(participants) == 2

    def test_create_activity_with_type_name(self, db_session: Session):
        """测试使用活动类型名称创建"""
        activity_data = ActivityCreate(
            activity_name="使用类型名称的活动",
            activity_type_name="新类型",
            start_time=datetime(2026, 6, 1, 10, 0, 0),
        )

        activity = create_activity(db_session, activity_data, tenant_id=1)
        assert activity.id is not None
        assert activity.activity_type_id is not None

    def test_get_activity_by_id(self, db_session: Session):
        """测试通过 ID 获取活动"""
        activity = ActivityFactory()
        db_session.commit()

        found = get_activity(db_session, activity.id, tenant_id=1)
        assert found is not None
        assert found.id == activity.id
        assert found.activity_name == activity.activity_name

    def test_get_activity_not_found(self, db_session: Session):
        """测试获取不存在的活动"""
        found = get_activity(db_session, 99999, tenant_id=1)
        assert found is None

    def test_get_activity_different_tenant(self, db_session: Session):
        """测试跨租户隔离"""
        activity = ActivityFactory(tenant_id=1)
        db_session.commit()

        # 租户2 查询不到租户1的活动
        found = get_activity(db_session, activity.id, tenant_id=2)
        assert found is None

    def test_get_activities(self, db_session: Session):
        """测试获取活动列表"""
        activity_type = ActivityTypeFactory()
        db_session.commit()

        # 创建多个活动
        for i in range(5):
            activity = ActivityFactory(activity_type_id=activity_type.id)
            db_session.add(activity)
        db_session.commit()

        activities, total = get_activities(db_session, tenant_id=1, skip=0, limit=10)
        assert len(activities) == 5
        assert total == 5

    def test_get_activities_with_status_filter(self, db_session: Session):
        """测试按状态过滤活动"""
        # 创建不同状态的活动
        for status_val in [1, 2, 3]:
            activity = ActivityFactory(status=status_val)
            db_session.add(activity)
        db_session.commit()

        # 只获取未开始的活动
        activities, total = get_activities(
            db_session, tenant_id=1, skip=0, limit=10, status=1
        )
        assert len(activities) == 1
        assert activities[0].status == 1

    def test_get_activities_pagination(self, db_session: Session):
        """测试分页获取活动"""
        for _ in range(15):
            activity = ActivityFactory()
            db_session.add(activity)
        db_session.commit()

        # 第一页
        activities1, total = get_activities(db_session, tenant_id=1, skip=0, limit=10)
        assert len(activities1) == 10
        assert total == 15

        # 第二页
        activities2, _ = get_activities(db_session, tenant_id=1, skip=10, limit=10)
        assert len(activities2) == 5

    def test_update_activity_status_to_ongoing(self, db_session: Session):
        """测试更新活动状态为进行中"""
        activity = ActivityFactory(
            start_time=datetime.now() - timedelta(hours=1),
            status=1
        )
        db_session.commit()

        updated = update_activity_status(
            db_session, activity.id, status=2, tenant_id=1
        )
        assert updated.status == 2

    def test_update_activity_status_to_ended(self, db_session: Session):
        """测试更新活动状态为已结束"""
        activity = ActivityFactory(status=2)
        db_session.commit()

        updated = update_activity_status(
            db_session, activity.id, status=3, tenant_id=1
        )
        assert updated.status == 3
        assert updated.end_time is not None

    def test_update_activity_status_invalid_time(self, db_session: Session):
        """测试无效时间更新状态"""
        activity = ActivityFactory(
            start_time=datetime.now() + timedelta(hours=1),
            status=1
        )
        db_session.commit()

        # 在开始时间前尝试开始活动（应该失败）
        with pytest.raises(Exception):
            update_activity_status(
                db_session, activity.id, status=2, tenant_id=1
            )

    def test_update_activity(self, db_session: Session):
        """测试更新活动信息"""
        activity = ActivityFactory(activity_name="原名称")
        db_session.commit()

        update_data = ActivityUpdate(activity_name="新名称")
        updated = update_activity(
            db_session, activity.id, update_data, tenant_id=1
        )
        assert updated.activity_name == "新名称"

    def test_update_activity_with_type_name(self, db_session: Session):
        """测试使用活动类型名称更新"""
        activity = ActivityFactory()
        db_session.commit()

        update_data = ActivityUpdate(activity_type_name="新类型")
        updated = update_activity(
            db_session, activity.id, update_data, tenant_id=1
        )
        assert updated.activity_type_id is not None

    def test_update_activity_not_found(self, db_session: Session):
        """测试更新不存在的活动"""
        update_data = ActivityUpdate(activity_name="新名称")

        with pytest.raises(Exception):
            update_activity(db_session, 99999, update_data, tenant_id=1)

    def test_delete_activity(self, db_session: Session):
        """测试删除活动"""
        activity = ActivityFactory()
        db_session.commit()

        result = delete_activity(db_session, activity.id, tenant_id=1)
        assert result is True

        # 验证已删除
        found = get_activity(db_session, activity.id, tenant_id=1)
        assert found is None

    def test_delete_activity_with_participants(self, db_session: Session):
        """测试删除活动及其关联数据"""
        from app.schemas import ActivityParticipant
        from app.models.participant import ParticipantCreate

        activity_type = ActivityTypeFactory()
        db_session.commit()

        activity_data = ActivityCreate(
            activity_name="待删除活动",
            activity_type_id=activity_type.id,
            start_time=datetime(2026, 6, 1, 10, 0, 0),
            participants=[
                ParticipantCreate(
                    participant_name="参与者",
                    phone="13800138003",
                    identity_number="110101199001011236",
                ),
            ],
        )

        activity = create_activity(db_session, activity_data, tenant_id=1)

        # 删除活动
        delete_activity(db_session, activity.id, tenant_id=1)

        # 验证参与者也被删除
        participants = db_session.query(ActivityParticipant).filter_by(
            activity_id=activity.id
        ).all()
        assert len(participants) == 0

    def test_delete_activity_not_found(self, db_session: Session):
        """测试删除不存在的活动"""
        with pytest.raises(Exception):
            delete_activity(db_session, 99999, tenant_id=1)
