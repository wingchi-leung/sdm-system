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
    get_participant_by_user,
    has_user_joined_activity,
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
            user_id=1001,
            why_join="想参加",
            channel="朋友推荐",
            expectation="学习交流",
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
            user_id=1001,
            why_join="想参加",
            channel="朋友推荐",
            expectation="学习交流",
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

    def test_get_participant_by_user(self, db_session: Session):
        """测试按用户查询参与者"""
        activity = ActivityFactory()
        participant = ParticipantFactory(
            activity_id=activity.id,
            user_id=1001,
        )
        db_session.add(participant)
        db_session.commit()

        found = get_participant_by_user(
            db_session,
            activity_id=activity.id,
            user_id=1001,
            tenant_id=1,
        )
        assert found is not None
        assert found.activity_id == activity.id
        assert found.user_id == 1001

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
            user_id=1001,
            why_join="想参加",
            channel="朋友推荐",
            expectation="学习交流",
        )

        with pytest.raises(Exception):
            create_participant(db_session, participant_data, tenant_id=1)

    def test_has_user_joined_activity_ignores_pending_payment(
        self,
        db_session: Session,
    ):
        """测试待支付记录不应被视为已报名"""
        activity = ActivityFactory()
        db_session.commit()

        pending_participant = ParticipantFactory(
            activity_id=activity.id,
            user_id=1001,
            payment_status=1,
            enroll_status=1,
        )
        paid_participant = ParticipantFactory(
            activity_id=activity.id,
            user_id=1002,
            payment_status=2,
            enroll_status=1,
        )
        free_participant = ParticipantFactory(
            activity_id=activity.id,
            user_id=1003,
            payment_status=0,
            enroll_status=2,
        )
        db_session.add_all([pending_participant, paid_participant, free_participant])
        db_session.commit()

        assert has_user_joined_activity(
            db_session,
            activity_id=activity.id,
            user_id=1001,
            tenant_id=1,
        ) is False
        assert has_user_joined_activity(
            db_session,
            activity_id=activity.id,
            user_id=1002,
            tenant_id=1,
        ) is True
        assert has_user_joined_activity(
            db_session,
            activity_id=activity.id,
            user_id=1003,
            tenant_id=1,
        ) is True
