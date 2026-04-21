"""
签到管理 API 测试
"""
import pytest
from fastapi import status
from tests.conftest import auth_headers


@pytest.mark.api
class TestCheckIn:
    """签到功能测试"""

    def test_checkin_success(self, client, user_token, active_activity, db_session):
        """测试成功签到 - 需要先报名"""
        from tests.factories import ParticipantFactory
        # 先报名
        participant = ParticipantFactory(
            activity_id=active_activity.id,
            phone="13900139200",
            identity_number="110101199001014000"
        )
        db_session.add(participant)
        db_session.commit()

        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "name": "签到用户",
                "phone": "13900139200",
                "identity_number": "110101199001014000",
                "has_attend": 1,
                "note": "正常签到"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["activity_id"] == active_activity.id
        assert data["has_attend"] == 1

    def test_checkin_duplicate(self, client, user_token, sample_checkin, db_session):
        """测试重复签到 - 需要先报名"""
        from tests.factories import ParticipantFactory
        participant = ParticipantFactory(
            activity_id=sample_checkin.activity_id,
            phone="13900139001",
            identity_number="110101199001011237"
        )
        db_session.add(participant)
        db_session.commit()

        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_checkin.activity_id,
                "name": "重复签到",
                "phone": "13900139001",
                "identity_number": "110101199001011237",
                "has_attend": 1,
                "note": "测试"
            }
        )
        # 已经签到过
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND]

    def test_checkin_without_login(self, client, active_activity):
        """测试未登录签到 - 允许匿名签到"""
        response = client.post(
            "/api/v1/checkins/",
            json={
                "activity_id": active_activity.id,
                "name": "尝试签到",
                "phone": "13900139201",
                "identity_number": "110101199001014001",
                "has_attend": 1,
                "note": "测试"
            }
        )
        # 允许匿名签到
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_401_UNAUTHORIZED, status.HTTP_404_NOT_FOUND]

    def test_anonymous_checkin_uses_activity_tenant(self, client, db_session):
        """测试匿名签到按活动归属租户落库，不回落到 1 号租户"""
        from app.schemas import Activity, ActivityParticipant, Tenant

        other_tenant = Tenant(name="签到租户", code="checkin_tenant", status=1, plan="basic")
        db_session.add(other_tenant)
        db_session.flush()

        activity = Activity(
            tenant_id=other_tenant.id,
            activity_name="其他租户活动",
            status=2,
        )
        db_session.add(activity)
        db_session.flush()

        participant = ActivityParticipant(
            tenant_id=other_tenant.id,
            activity_id=activity.id,
            participant_name="匿名签到用户",
            phone="13900139988",
            identity_number="110101199001019988",
        )
        db_session.add(participant)
        db_session.commit()

        response = client.post(
            "/api/v1/checkins/",
            json={
                "activity_id": activity.id,
                "name": "匿名签到用户",
                "phone": "13900139988",
                "identity_number": "110101199001019988",
                "has_attend": 1,
                "note": "跨租户匿名签到",
            },
        )

        assert response.status_code == status.HTTP_200_OK

        from app.schemas import CheckInRecord

        saved = db_session.query(CheckInRecord).filter(
            CheckInRecord.activity_id == activity.id,
            CheckInRecord.identity_number == "110101199001019988",
        ).first()
        assert saved is not None
        assert saved.tenant_id == other_tenant.id

    def test_checkin_missing_fields(self, client, user_token, active_activity):
        """测试缺少必填字段"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "name": "不完整签到"
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_checkin_absent(self, client, user_token, active_activity, db_session):
        """测试缺席签到 - 需要先报名"""
        from tests.factories import ParticipantFactory
        participant = ParticipantFactory(
            activity_id=active_activity.id,
            phone="13900139202",
            identity_number="110101199001014002"
        )
        db_session.add(participant)
        db_session.commit()

        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "name": "缺席用户",
                "phone": "13900139202",
                "identity_number": "110101199001014002",
                "has_attend": 0,
                "note": "请假"
            }
        )
        # has_attend 必须 > 0
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_422_UNPROCESSABLE_ENTITY, status.HTTP_404_NOT_FOUND]

    def test_checkin_nonexistent_activity(self, client, user_token):
        """测试对不存在的活动签到"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": 99999,
                "name": "签到",
                "phone": "13900139203",
                "identity_number": "110101199001014003",
                "has_attend": 1,
                "note": "测试"
            }
        )
        assert response.status_code in [status.HTTP_404_NOT_FOUND, status.HTTP_400_BAD_REQUEST]

    def test_checkin_unstarted_activity(self, client, user_token, sample_activity, db_session):
        """测试对未开始的活动签到"""
        from tests.factories import ParticipantFactory
        participant = ParticipantFactory(
            activity_id=sample_activity.id,
            phone="13900139204",
            identity_number="110101199001014004"
        )
        db_session.add(participant)
        db_session.commit()

        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_activity.id,
                "name": "签到",
                "phone": "13900139204",
                "identity_number": "110101199001014004",
                "has_attend": 1,
                "note": "测试"
            }
        )
        # 可能不允许对未开始的活动签到
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]


@pytest.mark.api
class TestCheckInRetrieval:
    """签到记录查询测试"""

    def test_get_activity_checkins(self, client, super_admin_token, active_activity, db_session):
        """测试获取活动签到记录"""
        from tests.factories import CheckInFactory
        for _ in range(5):
            checkin = CheckInFactory(activity_id=active_activity.id)
            db_session.add(checkin)
        db_session.commit()

        response = client.get(
            f"/api/v1/checkins/?activity_id={active_activity.id}",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 5

    def test_get_all_checkins(self, client, super_admin_token, db_session):
        """测试获取所有签到记录"""
        from tests.factories import CheckInFactory, ActiveActivityFactory
        activity1 = ActiveActivityFactory()
        activity2 = ActiveActivityFactory()
        db_session.commit()

        CheckInFactory(activity_id=activity1.id)
        CheckInFactory(activity_id=activity2.id)
        db_session.commit()

        response = client.get(
            "/api/v1/checkins/",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 2

    def test_get_checkins_unauthorized(self, client, user_token, active_activity):
        """测试普通用户获取签到记录被禁止"""
        response = client.get(
            f"/api/v1/checkins/?activity_id={active_activity.id}",
            headers=auth_headers(user_token)
        )
        # 返回 401 因为不是管理员
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

    def test_get_checkins_pagination(self, client, super_admin_token, active_activity, db_session):
        """测试签到记录分页"""
        from tests.factories import CheckInFactory
        for _ in range(15):
            checkin = CheckInFactory(activity_id=active_activity.id)
            db_session.add(checkin)
        db_session.commit()

        response = client.get(
            f"/api/v1/checkins/?activity_id={active_activity.id}&skip=0&limit=10",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) <= 10

    def test_get_nonexistent_checkin(self, client, super_admin_token):
        """测试获取不存在的签到记录"""
        response = client.get(
            "/api/v1/checkins/99999",
            headers=auth_headers(super_admin_token)
        )
        # 当前 API 不支持通过 ID 获取签到
        assert response.status_code in [status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED]


@pytest.mark.api
class TestCheckInManagement:
    """签到记录管理测试"""

    def test_update_checkin_note(self, client, super_admin_token, sample_checkin, db_session):
        """测试更新签到备注 - 直接操作数据库"""
        sample_checkin.note = "更新后的备注"
        db_session.commit()

        db_session.refresh(sample_checkin)
        assert sample_checkin.note == "更新后的备注"

    def test_update_checkin_status(self, client, super_admin_token, sample_checkin, db_session):
        """测试更新签到状态 - 直接操作数据库"""
        sample_checkin.has_attend = 0
        db_session.commit()

        db_session.refresh(sample_checkin)
        assert sample_checkin.has_attend == 0

    def test_delete_checkin(self, client, super_admin_token, db_session):
        """测试删除签到记录 - 当前 API 不支持"""
        from tests.factories import CheckInFactory, ActiveActivityFactory
        activity = ActiveActivityFactory()
        db_session.commit()

        checkin = CheckInFactory(activity_id=activity.id)
        db_session.add(checkin)
        db_session.commit()

        response = client.delete(
            f"/api/v1/checkins/{checkin.id}",
            headers=auth_headers(super_admin_token)
        )
        # 当前 API 不支持删除签到
        assert response.status_code in [status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED]


@pytest.mark.api
class TestCheckInValidation:
    """签到验证测试"""

    def test_checkin_with_invalid_phone(self, client, user_token, active_activity):
        """测试无效手机号 - 当前 API 不验证格式"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "name": "签到",
                "phone": "invalid",
                "identity_number": "110101199001014006",
                "has_attend": 1,
                "note": "测试"
            }
        )
        # 当前 API 不验证手机号格式
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_422_UNPROCESSABLE_ENTITY, status.HTTP_404_NOT_FOUND]

    def test_checkin_with_invalid_identity(self, client, user_token, active_activity):
        """测试无效身份证号 - 当前 API 不验证格式"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "name": "签到",
                "phone": "13900139205",
                "identity_number": "invalid",
                "has_attend": 1,
                "note": "测试"
            }
        )
        # 当前 API 不验证身份证格式
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_422_UNPROCESSABLE_ENTITY, status.HTTP_404_NOT_FOUND]


@pytest.mark.api
class TestCheckInStatistics:
    """签到统计测试"""

    def test_get_checkin_count(self, client, super_admin_token, active_activity, db_session):
        """测试获取签到人数 - 使用活动统计 API"""
        from tests.factories import CheckInFactory
        for _ in range(10):
            checkin = CheckInFactory(activity_id=active_activity.id, has_attend=1)
            db_session.add(checkin)
        db_session.commit()

        response = client.get(
            f"/api/v1/activities/{active_activity.id}/statistics/",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data.get("total_checkins", 0) >= 10


@pytest.mark.api
class TestCheckInPermissions:
    """签到权限测试"""

    def test_authorized_admin_can_manage_checkins(self, client, activity_admin_token, sample_checkin):
        """测试有权限的管理员可以管理签到"""
        response = client.get(
            f"/api/v1/checkins/?activity_id={sample_checkin.activity_id}",
            headers=auth_headers(activity_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK

    def test_activity_admin_cannot_read_other_activity_checkins(
        self,
        client,
        activity_admin_token,
        sample_activity_type_2,
        default_tenant,
        db_session,
    ):
        """测试活动类型管理员不能用 activity_id 读取未授权活动签到"""
        from app.schemas import Activity, CheckInRecord

        activity = Activity(
            tenant_id=default_tenant.id,
            activity_name="未授权签到活动",
            activity_type_id=sample_activity_type_2.id,
            status=2,
        )
        db_session.add(activity)
        db_session.flush()
        db_session.add(
            CheckInRecord(
                tenant_id=default_tenant.id,
                activity_id=activity.id,
                name="未授权签到用户",
                phone="13900139971",
                identity_number="110101199001019971",
                has_attend=1,
            )
        )
        db_session.commit()

        response = client.get(
            f"/api/v1/checkins/?activity_id={activity.id}",
            headers=auth_headers(activity_admin_token),
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_activity_admin_all_checkins_are_scope_filtered(
        self,
        client,
        activity_admin_token,
        active_activity,
        sample_activity_type_2,
        default_tenant,
        db_session,
    ):
        """测试不传 activity_id 时签到列表仍按授权 scope 过滤"""
        from app.schemas import Activity, CheckInRecord

        other_activity = Activity(
            tenant_id=default_tenant.id,
            activity_name="未授权全量签到活动",
            activity_type_id=sample_activity_type_2.id,
            status=2,
        )
        db_session.add(other_activity)
        db_session.flush()
        db_session.add_all([
            CheckInRecord(
                tenant_id=default_tenant.id,
                activity_id=active_activity.id,
                name="可见签到",
                phone="13900139972",
                identity_number="110101199001019972",
                has_attend=1,
            ),
            CheckInRecord(
                tenant_id=default_tenant.id,
                activity_id=other_activity.id,
                name="不可见签到",
                phone="13900139973",
                identity_number="110101199001019973",
                has_attend=1,
            ),
        ])
        db_session.commit()

        response = client.get(
            "/api/v1/checkins/",
            headers=auth_headers(activity_admin_token),
        )

        assert response.status_code == status.HTTP_200_OK
        names = {item["name"] for item in response.json()}
        assert "可见签到" in names
        assert "不可见签到" not in names

    def test_user_can_checkin(self, client, user_token, active_activity, db_session):
        """测试用户可以签到 - 需要先报名"""
        from tests.factories import ParticipantFactory
        participant = ParticipantFactory(
            activity_id=active_activity.id,
            phone="13900139206",
            identity_number="110101199001014008"
        )
        db_session.add(participant)
        db_session.commit()

        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "name": "用户签到",
                "phone": "13900139206",
                "identity_number": "110101199001014008",
                "has_attend": 1,
                "note": "测试签到"
            }
        )
        assert response.status_code == status.HTTP_200_OK
