"""
签到 CRUD 单元测试
"""
import pytest
from sqlalchemy.orm import Session

from app.crud.crud_checkin import (
    create_checkin,
    get_recent_checkins,
    get_activity_checkins,
    check_already_checkin,
)
from app.models.checkin import CheckInCreate
from tests.factories import CheckInFactory, ActivityFactory, ActiveActivityFactory


@pytest.mark.unit
class TestCheckInCRUD:
    """签到 CRUD 操作测试"""

    def test_create_checkin_success(self, db_session: Session):
        """测试成功创建签到记录"""
        activity = ActiveActivityFactory()
        db_session.commit()
        db_session.refresh(activity)

        checkin_data = CheckInCreate(
            activity_id=activity.id,
            name="签到用户",
            phone="13800138000",
            identity_number="110101199001011234",
            has_attend=1,
            note="正常签到",
        )

        checkin = create_checkin(db_session, checkin_data, tenant_id=1)
        assert checkin.id is not None
        assert checkin.activity_id == activity.id
        assert checkin.name == "签到用户"
        assert checkin.has_attend == 1

    def test_create_checkin_duplicate(self, db_session: Session):
        """测试重复签到"""
        activity = ActiveActivityFactory()
        db_session.commit()
        db_session.refresh(activity)

        checkin_data = CheckInCreate(
            activity_id=activity.id,
            name="签到用户",
            phone="13800138001",
            identity_number="110101199001011235",
            has_attend=1,
            note="正常签到",
        )

        # 第一次签到
        create_checkin(db_session, checkin_data, tenant_id=1)

        # 第二次签到（应该失败）
        with pytest.raises(Exception):
            create_checkin(db_session, checkin_data, tenant_id=1)

    def test_create_checkin_not_active_activity(self, db_session: Session):
        """测试对非进行中活动签到"""
        activity = ActivityFactory(status=1)  # 未开始
        db_session.commit()
        db_session.refresh(activity)

        checkin_data = CheckInCreate(
            activity_id=activity.id,
            name="签到用户",
            phone="13800138002",
            identity_number="110101199001011236",
            has_attend=1,
            note="尝试签到",
        )

        with pytest.raises(Exception):
            create_checkin(db_session, checkin_data, tenant_id=1)

    def test_get_activity_checkins(self, db_session: Session):
        """测试获取活动签到记录"""
        activity = ActiveActivityFactory()
        db_session.commit()
        db_session.refresh(activity)

        # 创建签到记录
        for i in range(5):
            checkin = CheckInFactory(
                activity_id=activity.id,
                name=f"签到用户{i}",
            )
            db_session.add(checkin)
        db_session.commit()

        checkins = get_activity_checkins(
            db_session, activity.id, tenant_id=1, skip=0, limit=10
        )
        assert len(checkins) == 5
        for c in checkins:
            assert c.activity_id == activity.id

    def test_get_activity_checkins_empty(self, db_session: Session):
        """测试获取空签到记录"""
        activity = ActiveActivityFactory()
        db_session.commit()
        db_session.refresh(activity)

        checkins = get_activity_checkins(db_session, activity.id, tenant_id=1)
        assert len(checkins) == 0

    def test_get_recent_checkins(self, db_session: Session):
        """测试获取最近签到记录"""
        activity1 = ActiveActivityFactory()
        activity2 = ActiveActivityFactory()
        db_session.commit()

        # 创建不同活动的签到记录
        CheckInFactory(activity_id=activity1.id, name="用户1")
        CheckInFactory(activity_id=activity2.id, name="用户2")
        db_session.commit()

        # 获取所有签到记录
        checkins = get_recent_checkins(db_session, tenant_id=1, skip=0, limit=10)
        assert len(checkins) >= 2
        assert "activity_name" in checkins[0]

        # 按活动过滤
        activity_checkins = get_recent_checkins(
            db_session, tenant_id=1, skip=0, limit=10, activity_id=activity1.id
        )
        assert len(activity_checkins) >= 1
        for c in activity_checkins:
            assert c["activity_id"] == activity1.id

    def test_check_already_checkin(self, db_session: Session):
        """测试检查是否已签到"""
        activity = ActiveActivityFactory()
        db_session.commit()
        db_session.refresh(activity)

        checkin = CheckInFactory(
            activity_id=activity.id,
            identity_number="110101199001011237"
        )
        db_session.add(checkin)
        db_session.commit()

        # 已签到
        exists = check_already_checkin(
            db_session, activity.id, "110101199001011237", tenant_id=1
        )
        assert exists is True

        # 未签到
        not_exists = check_already_checkin(
            db_session, activity.id, "999999999999999999", tenant_id=1
        )
        assert not_exists is False

    def test_create_checkin_absent(self, db_session: Session):
        """测试创建签到记录（带缺席标记）"""
        activity = ActiveActivityFactory()
        db_session.commit()
        db_session.refresh(activity)

        checkin_data = CheckInCreate(
            activity_id=activity.id,
            name="签到用户",
            phone="13800138003",
            identity_number="110101199001011238",
            has_attend=1,
            note="请假",  # 在备注中说明缺席
        )

        checkin = create_checkin(db_session, checkin_data, tenant_id=1)
        assert checkin.has_attend == 1
        assert checkin.note == "请假"

    def test_create_checkin_nonexistent_activity(self, db_session: Session):
        """测试为不存在的活动签到"""
        checkin_data = CheckInCreate(
            activity_id=99999,
            name="签到用户",
            phone="13800138004",
            identity_number="110101199001011239",
            has_attend=1,
            note="测试",
        )

        with pytest.raises(Exception):
            create_checkin(db_session, checkin_data, tenant_id=1)
