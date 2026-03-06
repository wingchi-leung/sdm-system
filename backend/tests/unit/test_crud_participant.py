"""
参与者 CRUD 单元测试
"""
import pytest
from sqlalchemy.orm import Session

from app.crud.crud_participant import (
    create_participant,
    get_activity_participants,
    get_activity_participants_with_count,
    get_activity_statistics,
    check_participant_exists,
)
from app.models.participant import ParticipantCreate
from app.schemas import Activity, ActivityParticipant
from tests.factories import ParticipantFactory, ActivityFactory


@pytest.mark.unit
class TestParticipantCRUD:
    """参与者 CRUD 操作测试"""

    def test_create_participant_success(self, db_session: Session):
        """测试成功创建参与者"""
        activity = ActivityFactory()
        db_session.commit()

        participant_data = ParticipantCreate(
            activity_id=activity.id,
            participant_name="测试参与者",
            phone="13800138000",
            identity_number="110101199001011234",
        )

        participant = create_participant(db_session, participant_data, tenant_id=1)
        assert participant.id is not None
        assert participant.activity_id == activity.id
        assert participant.participant_name == "测试参与者"

    def test_create_participant_duplicate(self, db_session: Session):
        """测试重复报名"""
        activity = ActivityFactory()
        db_session.commit()

        participant_data = ParticipantCreate(
            activity_id=activity.id,
            participant_name="参与者",
            phone="13800138001",
            identity_number="110101199001011235",
        )

        # 第一次报名
        create_participant(db_session, participant_data, tenant_id=1)

        # 第二次报名（应该失败）
        with pytest.raises(Exception):
            create_participant(db_session, participant_data, tenant_id=1)

    def test_get_activity_participants(self, db_session: Session):
        """测试获取活动参与者列表"""
        activity = ActivityFactory()
        db_session.commit()

        # 创建参与者
        for i in range(5):
            participant = ParticipantFactory(
                activity_id=activity.id,
                participant_name=f"参与者{i}",
            )
            db_session.add(participant)
        db_session.commit()

        participants = get_activity_participants(
            db_session, activity.id, tenant_id=1, skip=0, limit=10
        )
        assert len(participants) == 5
        for p in participants:
            assert p.activity_id == activity.id

    def test_get_activity_participants_empty(self, db_session: Session):
        """测试获取空参与者列表"""
        activity = ActivityFactory()
        db_session.commit()

        participants = get_activity_participants(
            db_session, activity.id, tenant_id=1
        )
        assert len(participants) == 0

    def test_get_activity_participants_with_count(self, db_session: Session):
        """测试获取参与者列表和总数"""
        activity = ActivityFactory()
        db_session.commit()

        # 创建 15 个参与者
        for i in range(15):
            participant = ParticipantFactory(activity_id=activity.id)
            db_session.add(participant)
        db_session.commit()

        participants, total = get_activity_participants_with_count(
            db_session, activity.id, tenant_id=1, skip=0, limit=10
        )
        assert len(participants) == 10
        assert total == 15

    def test_check_participant_exists(self, db_session: Session):
        """测试检查参与者是否存在"""
        activity = ActivityFactory()
        participant = ParticipantFactory(
            activity_id=activity.id,
            identity_number="110101199001011236"
        )
        db_session.add(participant)
        db_session.commit()

        # 存在的参与者
        exists = check_participant_exists(
            db_session, activity.id, "110101199001011236", tenant_id=1
        )
        assert exists is True

        # 不存在的参与者
        not_exists = check_participant_exists(
            db_session, activity.id, "999999999999999999", tenant_id=1
        )
        assert not_exists is False

    def test_get_activity_statistics(self, db_session: Session):
        """测试获取活动统计"""
        activity = ActivityFactory(status=2)  # 进行中的活动
        db_session.commit()

        # 创建参与者
        for _ in range(10):
            participant = ParticipantFactory(activity_id=activity.id)
            db_session.add(participant)
        db_session.commit()

        stats = get_activity_statistics(db_session, activity.id, tenant_id=1)
        assert "total_participants" in stats
        assert stats["total_participants"] >= 10
        assert "activity_name" in stats
        assert "checkin_rate" in stats

    def test_create_participant_nonexistent_activity(self, db_session: Session):
        """测试为不存在的活动创建参与者"""
        participant_data = ParticipantCreate(
            activity_id=99999,
            participant_name="测试",
            phone="13800138002",
            identity_number="110101199001011237",
        )

        with pytest.raises(Exception):
            create_participant(db_session, participant_data, tenant_id=1)
