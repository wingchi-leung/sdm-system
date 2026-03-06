"""
活动 CRUD 单元测试
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.crud.crud_activity import (
    create_activity,
    get_activity_by_id,
    get_activities,
    get_activities_by_type,
    get_unstarted_activities,
    update_activity,
    update_activity_status,
    delete_activity,
    get_activity_statistics,
)
from app.schemas import Activity, ActivityType
from tests.factories import ActivityFactory, ActivityTypeFactory


@pytest.mark.unit
class TestActivityCRUD:
    """活动 CRUD 操作测试"""

    def test_create_activity_success(self, db_session: Session):
        """测试成功创建活动"""
        activity_type = ActivityTypeFactory()
        db_session.commit()

        activity = create_activity(
            db_session,
            activity_name="测试活动",
            activity_type_id=activity_type.id,
            start_time=datetime(2026, 5, 1, 10, 0, 0),
            tag="测试标签",
        )
        assert activity.id is not None
        assert activity.activity_name == "测试活动"
        assert activity.activity_type_id == activity_type.id
        assert activity.status == 1  # 默认未开始状态
        assert activity.tag == "测试标签"

    def test_create_activity_with_end_time(self, db_session: Session):
        """测试创建带结束时间的活动"""
        activity_type = ActivityTypeFactory()
        db_session.commit()

        start = datetime(2026, 5, 1, 10, 0, 0)
        end = datetime(2026, 5, 1, 18, 0, 0)

        activity = create_activity(
            db_session,
            activity_name="全天活动",
            activity_type_id=activity_type.id,
            start_time=start,
            end_time=end,
        )
        assert activity.start_time == start
        assert activity.end_time == end

    def test_get_activity_by_id_found(self, db_session: Session):
        """测试通过 ID 查找存在的活动"""
        activity = ActivityFactory()
        db_session.commit()

        found_activity = get_activity_by_id(db_session, activity.id)
        assert found_activity is not None
        assert found_activity.id == activity.id
        assert found_activity.activity_name == activity.activity_name

    def test_get_activity_by_id_not_found(self, db_session: Session):
        """测试通过 ID 查找不存在的活动"""
        found_activity = get_activity_by_id(db_session, 99999)
        assert found_activity is None

    def test_get_activities_pagination(self, db_session: Session):
        """测试分页获取活动列表"""
        # 创建 25 个活动
        for _ in range(25):
            ActivityFactory()
        db_session.commit()

        # 第一页
        activities_page1 = get_activities(db_session, skip=0, limit=10)
        assert len(activities_page1) == 10

        # 第二页
        activities_page2 = get_activities(db_session, skip=10, limit=10)
        assert len(activities_page2) == 10

        # 第三页
        activities_page3 = get_activities(db_session, skip=20, limit=10)
        assert len(activities_page3) == 5

    def test_get_activities_by_type(self, db_session: Session):
        """测试按类型获取活动"""
        type1 = ActivityTypeFactory(code="TYPE001")
        type2 = ActivityTypeFactory(code="TYPE002")
        db_session.commit()

        # 创建类型1的活动
        for _ in range(3):
            ActivityFactory(activity_type_id=type1.id)
        # 创建类型2的活动
        for _ in range(2):
            ActivityFactory(activity_type_id=type2.id)
        db_session.commit()

        type1_activities = get_activities_by_type(db_session, type1.id)
        type2_activities = get_activities_by_type(db_session, type2.id)

        assert len(type1_activities) == 3
        assert len(type2_activities) == 2
        for activity in type1_activities:
            assert activity.activity_type_id == type1.id

    def test_get_unstarted_activities(self, db_session: Session):
        """测试获取未开始的活动"""
        activity_type = ActivityTypeFactory()
        db_session.commit()

        # 创建未开始的活动 (status=1)
        for _ in range(3):
            ActivityFactory(activity_type_id=activity_type.id, status=1)

        # 创建进行中的活动 (status=2)
        ActivityFactory(activity_type_id=activity_type.id, status=2)

        # 创建已结束的活动 (status=3)
        ActivityFactory(activity_type_id=activity_type.id, status=3)
        db_session.commit()

        unstarted = get_unstarted_activities(db_session)
        assert len(unstarted) == 3
        for activity in unstarted:
            assert activity.status == 1

    def test_update_activity_name(self, db_session: Session):
        """测试更新活动名称"""
        activity = ActivityFactory(activity_name="原名称")
        db_session.commit()

        updated_activity = update_activity(db_session, activity.id, activity_name="新名称")
        assert updated_activity.activity_name == "新名称"

    def test_update_activity_time(self, db_session: Session):
        """测试更新活动时间"""
        activity = ActivityFactory(
            start_time=datetime(2026, 5, 1, 10, 0, 0),
        )
        db_session.commit()

        new_start = datetime(2026, 6, 1, 14, 0, 0)
        updated_activity = update_activity(db_session, activity.id, start_time=new_start)
        assert updated_activity.start_time == new_start

    def test_update_activity_not_found(self, db_session: Session):
        """测试更新不存在的活动"""
        result = update_activity(db_session, 99999, activity_name="新名称")
        assert result is None

    def test_update_activity_status_to_ongoing(self, db_session: Session):
        """测试更新活动状态为进行中"""
        activity = ActivityFactory(status=1)
        db_session.commit()

        updated_activity = update_activity_status(db_session, activity.id, 2)
        assert updated_activity.status == 2

    def test_update_activity_status_to_ended(self, db_session: Session):
        """测试更新活动状态为已结束"""
        activity = ActivityFactory(status=2, end_time=None)
        db_session.commit()

        updated_activity = update_activity_status(db_session, activity.id, 3)
        assert updated_activity.status == 3
        # 结束状态应该设置结束时间
        assert updated_activity.end_time is not None

    def test_delete_activity_success(self, db_session: Session):
        """测试删除活动"""
        activity = ActivityFactory()
        db_session.commit()

        deleted_activity = delete_activity(db_session, activity.id)
        assert deleted_activity is not None

        # 验证已删除
        found_activity = get_activity_by_id(db_session, activity.id)
        assert found_activity is None

    def test_delete_activity_not_found(self, db_session: Session):
        """测试删除不存在的活动"""
        result = delete_activity(db_session, 99999)
        assert result is None

    def test_get_activity_statistics(self, db_session: Session):
        """测试获取活动统计信息"""
        activity_type = ActivityTypeFactory()
        db_session.commit()

        # 创建不同状态的活动
        ActivityFactory(activity_type_id=activity_type.id, status=1)  # 未开始
        ActivityFactory(activity_type_id=activity_type.id, status=2)  # 进行中
        ActivityFactory(activity_type_id=activity_type.id, status=3)  # 已结束
        db_session.commit()

        stats = get_activity_statistics(db_session)
        assert stats["total"] == 3
        assert stats["unstarted"] == 1
        assert stats["ongoing"] == 1
        assert stats["ended"] == 1

    def test_get_activity_statistics_empty(self, db_session: Session):
        """测试空活动的统计信息"""
        stats = get_activity_statistics(db_session)
        assert stats["total"] == 0
        assert stats["unstarted"] == 0
        assert stats["ongoing"] == 0
        assert stats["ended"] == 0

    def test_create_activity_with_invalid_type(self, db_session: Session):
        """测试使用不存在的活动类型创建活动"""
        with pytest.raises(Exception):
            create_activity(
                db_session,
                activity_name="无效类型活动",
                activity_type_id=99999,
                start_time=datetime(2026, 5, 1, 10, 0, 0),
            )

    def test_update_activity_tag(self, db_session: Session):
        """测试更新活动标签"""
        activity = ActivityFactory(tag="旧标签")
        db_session.commit()

        updated_activity = update_activity(db_session, activity.id, tag="新标签")
        assert updated_activity.tag == "新标签"

    def test_get_activities_filter_by_status(self, db_session: Session):
        """测试按状态过滤活动"""
        activity_type = ActivityTypeFactory()
        db_session.commit()

        # 创建不同状态的活动
        for _ in range(5):
            ActivityFactory(activity_type_id=activity_type.id, status=1)
        for _ in range(3):
            ActivityFactory(activity_type_id=activity_type.id, status=2)
        db_session.commit()

        # 获取所有活动
        all_activities = get_activities(db_session)
        assert len(all_activities) == 8
