"""
参与者 CRUD 单元测试
"""
import pytest
from sqlalchemy.orm import Session

from app.crud.crud_participant import (
    create_participant,
    get_participant_by_id,
    get_participants_by_activity,
    get_participants_by_user,
    check_duplicate_participation,
    get_participant_count,
    delete_participant,
    create_participants_batch,
)
from app.schemas import ActivityParticipant
from tests.factories import ParticipantFactory, ActivityFactory, UserFactory


@pytest.mark.unit
class TestParticipantCRUD:
    """参与者 CRUD 操作测试"""

    def test_create_participant_success(self, db_session: Session):
        """测试成功创建参与者"""
        activity = ActivityFactory()
        user = UserFactory()
        db_session.commit()

        participant = create_participant(
            db_session,
            activity_id=activity.id,
            user_id=user.id,
            participant_name="测试参与者",
            phone="13800138000",
            identity_number="110101199001011234",
        )
        assert participant.id is not None
        assert participant.activity_id == activity.id
        assert participant.user_id == user.id
        assert participant.participant_name == "测试参与者"
        assert participant.phone == "13800138000"
        assert participant.identity_number == "110101199001011234"

    def test_create_participant_without_user(self, db_session: Session):
        """测试创建无用户关联的参与者（外部报名）"""
        activity = ActivityFactory()
        db_session.commit()

        participant = create_participant(
            db_session,
            activity_id=activity.id,
            participant_name="外部参与者",
            phone="13900139000",
            identity_number="110101199001011235",
        )
        assert participant.activity_id == activity.id
        assert participant.user_id is None

    def test_get_participant_by_id_found(self, db_session: Session):
        """测试通过 ID 查找参与者"""
        participant = ParticipantFactory()
        db_session.commit()

        found = get_participant_by_id(db_session, participant.id)
        assert found is not None
        assert found.id == participant.id

    def test_get_participant_by_id_not_found(self, db_session: Session):
        """测试通过 ID 查找不存在的参与者"""
        found = get_participant_by_id(db_session, 99999)
        assert found is None

    def test_get_participants_by_activity(self, db_session: Session):
        """测试获取活动的所有参与者"""
        activity = ActivityFactory()
        db_session.commit()

        # 为活动创建 5 个参与者
        for i in range(5):
            ParticipantFactory(activity_id=activity.id)
        db_session.commit()

        participants = get_participants_by_activity(db_session, activity.id)
        assert len(participants) == 5
        for p in participants:
            assert p.activity_id == activity.id

    def test_get_participants_by_activity_empty(self, db_session: Session):
        """测试获取没有参与者的活动"""
        activity = ActivityFactory()
        db_session.commit()

        participants = get_participants_by_activity(db_session, activity.id)
        assert len(participants) == 0

    def test_get_participants_by_user(self, db_session: Session):
        """测试获取用户的所有参与记录"""
        user = UserFactory()
        db_session.commit()

        # 为用户创建 3 个参与记录
        for _ in range(3):
            ParticipantFactory(user_id=user.id)
        db_session.commit()

        participants = get_participants_by_user(db_session, user.id)
        assert len(participants) == 3
        for p in participants:
            assert p.user_id == user.id

    def test_check_duplicate_participation_exists(self, db_session: Session):
        """测试检查重复参与 - 已存在"""
        activity = ActivityFactory()
        participant = ParticipantFactory(
            activity_id=activity.id,
            phone="13800138000",
            identity_number="110101199001011234",
        )
        db_session.commit()

        # 检查相同手机号
        is_duplicate = check_duplicate_participation(
            db_session,
            activity_id=activity.id,
            phone="13800138000",
        )
        assert is_duplicate is True

        # 检查相同身份证号
        is_duplicate = check_duplicate_participation(
            db_session,
            activity_id=activity.id,
            identity_number="110101199001011234",
        )
        assert is_duplicate is True

    def test_check_duplicate_participation_not_exists(self, db_session: Session):
        """测试检查重复参与 - 不存在"""
        activity = ActivityFactory()
        db_session.commit()

        is_duplicate = check_duplicate_participation(
            db_session,
            activity_id=activity.id,
            phone="13800138000",
        )
        assert is_duplicate is False

    def test_check_duplicate_participation_different_activity(self, db_session: Session):
        """测试不同活动可以重复参与"""
        activity1 = ActivityFactory()
        activity2 = ActivityFactory()
        ParticipantFactory(
            activity_id=activity1.id,
            phone="13800138000",
        )
        db_session.commit()

        # 同一用户参与不同活动不应该算重复
        is_duplicate = check_duplicate_participation(
            db_session,
            activity_id=activity2.id,
            phone="13800138000",
        )
        assert is_duplicate is False

    def test_get_participant_count(self, db_session: Session):
        """测试获取活动参与人数"""
        activity = ActivityFactory()
        db_session.commit()

        # 创建 10 个参与者
        for _ in range(10):
            ParticipantFactory(activity_id=activity.id)
        db_session.commit()

        count = get_participant_count(db_session, activity.id)
        assert count == 10

    def test_get_participant_count_zero(self, db_session: Session):
        """测试获取没有参与者的活动人数"""
        activity = ActivityFactory()
        db_session.commit()

        count = get_participant_count(db_session, activity.id)
        assert count == 0

    def test_delete_participant_success(self, db_session: Session):
        """测试删除参与者"""
        participant = ParticipantFactory()
        db_session.commit()

        deleted = delete_participant(db_session, participant.id)
        assert deleted is not None

        # 验证已删除
        found = get_participant_by_id(db_session, participant.id)
        assert found is None

    def test_delete_participant_not_found(self, db_session: Session):
        """测试删除不存在的参与者"""
        result = delete_participant(db_session, 99999)
        assert result is None

    def test_create_participants_batch_success(self, db_session: Session):
        """测试批量创建参与者"""
        activity = ActivityFactory()
        db_session.commit()

        participants_data = [
            {
                "participant_name": f"参与者{i}",
                "phone": f"138{i:08d}",
                "identity_number": f"110101199001011{i:03d}",
            }
            for i in range(1, 6)
        ]

        participants = create_participants_batch(
            db_session,
            activity_id=activity.id,
            participants_data=participants_data,
        )
        assert len(participants) == 5
        for i, p in enumerate(participants, 1):
            assert p.participant_name == f"参与者{i}"
            assert p.activity_id == activity.id

    def test_create_participants_batch_empty(self, db_session: Session):
        """测试批量创建空列表"""
        activity = ActivityFactory()
        db_session.commit()

        participants = create_participants_batch(
            db_session,
            activity_id=activity.id,
            participants_data=[],
        )
        assert len(participants) == 0

    def test_create_participants_partial_failure(self, db_session: Session):
        """测试批量创建时的部分失败处理"""
        activity = ActivityFactory()
        # 先创建一个参与者
        ParticipantFactory(activity_id=activity.id, phone="13800000001")
        db_session.commit()

        participants_data = [
            {"participant_name": "新用户1", "phone": "13800000002", "identity_number": "110101199001011001"},
            {"participant_name": "重复手机号", "phone": "13800000001", "identity_number": "110101199001011002"},
            {"participant_name": "新用户2", "phone": "13800000003", "identity_number": "110101199001011003"},
        ]

        # 应该只创建成功的，跳过重复的
        participants = create_participants_batch(
            db_session,
            activity_id=activity.id,
            participants_data=participants_data,
        )
        assert len(participants) >= 2  # 至少创建 2 个成功的
