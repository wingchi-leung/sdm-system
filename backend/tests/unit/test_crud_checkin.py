"""
签到 CRUD 单元测试
"""
import pytest
from datetime import datetime
from sqlalchemy.orm import Session

from app.crud.crud_checkin import (
    create_checkin,
    get_checkin_by_id,
    get_checkins_by_activity,
    get_checkins_by_user,
    get_checkin_by_identity,
    check_duplicate_checkin,
    get_checkin_count,
    update_checkin_note,
)
from app.schemas import CheckInRecord
from tests.factories import CheckInFactory, ActivityFactory, UserFactory, ActiveActivityFactory


@pytest.mark.unit
class TestCheckInCRUD:
    """签到 CRUD 操作测试"""

    def test_create_checkin_success(self, db_session: Session):
        """测试成功创建签到记录"""
        activity = ActiveActivityFactory()
        user = UserFactory()
        db_session.commit()

        checkin = create_checkin(
            db_session,
            activity_id=activity.id,
            user_id=user.id,
            name="签到用户",
            phone="13800138000",
            identity_number="110101199001011234",
            has_attend=1,
            note="正常签到",
        )
        assert checkin.id is not None
        assert checkin.activity_id == activity.id
        assert checkin.user_id == user.id
        assert checkin.name == "签到用户"
        assert checkin.has_attend == 1
        assert checkin.note == "正常签到"

    def test_create_checkin_without_user(self, db_session: Session):
        """测试创建无用户关联的签到记录"""
        activity = ActiveActivityFactory()
        db_session.commit()

        checkin = create_checkin(
            db_session,
            activity_id=activity.id,
            name="外部签到",
            phone="13900139000",
            identity_number="110101199001011235",
            has_attend=1,
        )
        assert checkin.activity_id == activity.id
        assert checkin.user_id is None

    def test_create_checkin_absent(self, db_session: Session):
        """测试创建缺席记录"""
        activity = ActiveActivityFactory()
        db_session.commit()

        checkin = create_checkin(
            db_session,
            activity_id=activity.id,
            name="缺席用户",
            phone="13900139001",
            identity_number="110101199001011236",
            has_attend=0,
            note="请假",
        )
        assert checkin.has_attend == 0
        assert checkin.note == "请假"

    def test_get_checkin_by_id_found(self, db_session: Session):
        """测试通过 ID 查找签到记录"""
        checkin = CheckInFactory()
        db_session.commit()

        found = get_checkin_by_id(db_session, checkin.id)
        assert found is not None
        assert found.id == checkin.id

    def test_get_checkin_by_id_not_found(self, db_session: Session):
        """测试通过 ID 查找不存在的签到记录"""
        found = get_checkin_by_id(db_session, 99999)
        assert found is None

    def test_get_checkins_by_activity(self, db_session: Session):
        """测试获取活动的所有签到记录"""
        activity = ActiveActivityFactory()
        db_session.commit()

        # 创建 8 个签到记录
        for _ in range(8):
            CheckInFactory(activity_id=activity.id)
        db_session.commit()

        checkins = get_checkins_by_activity(db_session, activity.id)
        assert len(checkins) == 8
        for c in checkins:
            assert c.activity_id == activity.id

    def test_get_checkins_by_activity_empty(self, db_session: Session):
        """测试获取没有签到记录的活动"""
        activity = ActiveActivityFactory()
        db_session.commit()

        checkins = get_checkins_by_activity(db_session, activity.id)
        assert len(checkins) == 0

    def test_get_checkins_by_user(self, db_session: Session):
        """测试获取用户的所有签到记录"""
        user = UserFactory()
        db_session.commit()

        # 为用户创建 4 个签到记录
        for _ in range(4):
            CheckInFactory(user_id=user.id)
        db_session.commit()

        checkins = get_checkins_by_user(db_session, user.id)
        assert len(checkins) == 4
        for c in checkins:
            assert c.user_id == user.id

    def test_get_checkin_by_identity_found(self, db_session: Session):
        """测试通过身份证号查找签到记录"""
        activity = ActiveActivityFactory()
        checkin = CheckInFactory(
            activity_id=activity.id,
            identity_number="110101199001011234",
        )
        db_session.commit()

        found = get_checkin_by_identity(
            db_session,
            activity_id=activity.id,
            identity_number="110101199001011234",
        )
        assert found is not None
        assert found.id == checkin.id

    def test_get_checkin_by_identity_not_found(self, db_session: Session):
        """测试通过身份证号查找不存在的签到记录"""
        activity = ActiveActivityFactory()
        db_session.commit()

        found = get_checkin_by_identity(
            db_session,
            activity_id=activity.id,
            identity_number="999999999999999999",
        )
        assert found is None

    def test_check_duplicate_checkin_exists(self, db_session: Session):
        """测试检查重复签到 - 已签到"""
        activity = ActiveActivityFactory()
        CheckInFactory(
            activity_id=activity.id,
            identity_number="110101199001011234",
            has_attend=1,
        )
        db_session.commit()

        is_duplicate = check_duplicate_checkin(
            db_session,
            activity_id=activity.id,
            identity_number="110101199001011234",
        )
        assert is_duplicate is True

    def test_check_duplicate_checkin_not_exists(self, db_session: Session):
        """测试检查重复签到 - 未签到"""
        activity = ActiveActivityFactory()
        db_session.commit()

        is_duplicate = check_duplicate_checkin(
            db_session,
            activity_id=activity.id,
            identity_number="110101199001011234",
        )
        assert is_duplicate is False

    def test_check_duplicate_checkin_different_activity(self, db_session: Session):
        """测试不同活动可以重复签到"""
        activity1 = ActiveActivityFactory()
        activity2 = ActiveActivityFactory()
        CheckInFactory(
            activity_id=activity1.id,
            identity_number="110101199001011234",
        )
        db_session.commit()

        # 同一用户在不同活动签到不应该算重复
        is_duplicate = check_duplicate_checkin(
            db_session,
            activity_id=activity2.id,
            identity_number="110101199001011234",
        )
        assert is_duplicate is False

    def test_get_checkin_count(self, db_session: Session):
        """测试获取活动签到人数"""
        activity = ActiveActivityFactory()
        db_session.commit()

        # 创建 15 个签到记录
        for _ in range(15):
            CheckInFactory(activity_id=activity.id)
        db_session.commit()

        count = get_checkin_count(db_session, activity.id)
        assert count == 15

    def test_get_checkin_count_attended_only(self, db_session: Session):
        """测试获取实际出席人数"""
        activity = ActiveActivityFactory()
        db_session.commit()

        # 创建 10 个签到记录，其中 2 个缺席
        for _ in range(8):
            CheckInFactory(activity_id=activity.id, has_attend=1)
        for _ in range(2):
            CheckInFactory(activity_id=activity.id, has_attend=0)
        db_session.commit()

        count = get_checkin_count(db_session, activity.id, attended_only=True)
        assert count == 8

    def test_get_checkin_count_zero(self, db_session: Session):
        """测试获取没有签到记录的活动人数"""
        activity = ActiveActivityFactory()
        db_session.commit()

        count = get_checkin_count(db_session, activity.id)
        assert count == 0

    def test_update_checkin_note(self, db_session: Session):
        """测试更新签到备注"""
        checkin = CheckInFactory(note="原备注")
        db_session.commit()

        updated = update_checkin_note(db_session, checkin.id, "新备注")
        assert updated.note == "新备注"

    def test_update_checkin_note_not_found(self, db_session: Session):
        """测试更新不存在的签到记录备注"""
        result = update_checkin_note(db_session, 99999, "新备注")
        assert result is None

    def test_create_checkin_with_timestamp(self, db_session: Session):
        """测试创建带时间戳的签到记录"""
        activity = ActiveActivityFactory()
        db_session.commit()

        checkin = create_checkin(
            db_session,
            activity_id=activity.id,
            name="定时签到",
            phone="13800138000",
            identity_number="110101199001011234",
            has_attend=1,
        )
        assert checkin.checkin_time is not None
        assert isinstance(checkin.checkin_time, datetime)
