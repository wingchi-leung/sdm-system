"""
签到管理 API 测试
"""
import pytest
from fastapi import status
from tests.conftest import auth_headers


@pytest.mark.api
class TestCheckIn:
    """签到功能测试"""

    def test_checkin_success(self, client, user_token, active_activity):
        """测试成功签到"""
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

    def test_checkin_duplicate(self, client, user_token, sample_checkin):
        """测试重复签到"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_checkin.activity_id,
                "name": "重复签到",
                "phone": "13900139001",
                "identity_number": "110101199001011237"
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_checkin_without_login(self, client, active_activity):
        """测试未登录签到"""
        response = client.post(
            "/api/v1/checkins/",
            json={
                "activity_id": active_activity.id,
                "name": "尝试签到",
                "phone": "13900139201",
                "identity_number": "110101199001014001"
            }
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

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

    def test_checkin_absent(self, client, user_token, active_activity):
        """测试缺席签到"""
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
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["has_attend"] == 0
        assert data["note"] == "请假"

    def test_checkin_nonexistent_activity(self, client, user_token):
        """测试对不存在的活动签到"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": 99999,
                "name": "签到",
                "phone": "13900139203",
                "identity_number": "110101199001014003"
            }
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_checkin_unstarted_activity(self, client, user_token, sample_activity):
        """测试对未开始的活动签到"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_activity.id,
                "name": "签到",
                "phone": "13900139204",
                "identity_number": "110101199001014004"
            }
        )
        # 可能不允许对未开始的活动签到
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_200_OK]


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
        assert response.status_code == status.HTTP_403_FORBIDDEN

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

    def test_get_checkin_by_id(self, client, super_admin_token, sample_checkin):
        """测试通过 ID 获取签到记录"""
        response = client.get(
            f"/api/v1/checkins/{sample_checkin.id}",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == sample_checkin.id

    def test_get_checkin_by_identity(self, client, super_admin_token, active_activity, db_session):
        """测试通过身份证号查找签到记录"""
        from tests.factories import CheckInFactory
        checkin = CheckInFactory(
            activity_id=active_activity.id,
            identity_number="110101199001014005"
        )
        db_session.add(checkin)
        db_session.commit()

        response = client.get(
            f"/api/v1/checkins/by-identity/{active_activity.id}/110101199001014005",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK

    def test_get_nonexistent_checkin(self, client, super_admin_token):
        """测试获取不存在的签到记录"""
        response = client.get(
            "/api/v1/checkins/99999",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.api
class TestCheckInManagement:
    """签到记录管理测试"""

    def test_update_checkin_note(self, client, super_admin_token, sample_checkin):
        """测试更新签到备注"""
        response = client.put(
            f"/api/v1/checkins/{sample_checkin.id}",
            headers=auth_headers(super_admin_token),
            json={"note": "更新后的备注"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["note"] == "更新后的备注"

    def test_update_checkin_status(self, client, super_admin_token, sample_checkin):
        """测试更新签到状态"""
        response = client.put(
            f"/api/v1/checkins/{sample_checkin.id}",
            headers=auth_headers(super_admin_token),
            json={"has_attend": 0}
        )
        assert response.status_code == status.HTTP_200_OK

    def test_update_checkin_unauthorized(self, client, user_token, sample_checkin):
        """测试普通用户更新签到记录被禁止"""
        response = client.put(
            f"/api/v1/checkins/{sample_checkin.id}",
            headers=auth_headers(user_token),
            json={"note": "尝试修改"}
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_checkin(self, client, super_admin_token, db_session):
        """测试删除签到记录"""
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
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT]

    def test_delete_checkin_unauthorized(self, client, user_token, sample_checkin):
        """测试普通用户删除签到记录被禁止"""
        response = client.delete(
            f"/api/v1/checkins/{sample_checkin.id}",
            headers=auth_headers(user_token)
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.api
class TestCheckInValidation:
    """签到验证测试"""

    def test_checkin_with_invalid_phone(self, client, user_token, active_activity):
        """测试无效手机号"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "name": "签到",
                "phone": "invalid",
                "identity_number": "110101199001014006"
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_checkin_with_invalid_identity(self, client, user_token, active_activity):
        """测试无效身份证号"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "name": "签到",
                "phone": "13900139205",
                "identity_number": "invalid"
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_check_duplicate_before_checkin(self, client, user_token, sample_checkin):
        """测试签到前检查重复"""
        response = client.post(
            "/api/v1/checkins/check-duplicate",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_checkin.activity_id,
                "identity_number": "110101199001011237"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["is_duplicate"] is True

    def test_check_not_duplicate(self, client, user_token, active_activity):
        """测试检查非重复签到"""
        response = client.post(
            "/api/v1/checkins/check-duplicate",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "identity_number": "110101199001014007"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["is_duplicate"] is False


@pytest.mark.api
class TestCheckInStatistics:
    """签到统计测试"""

    def test_get_checkin_count(self, client, super_admin_token, active_activity, db_session):
        """测试获取签到人数"""
        from tests.factories import CheckInFactory
        for _ in range(10):
            checkin = CheckInFactory(activity_id=active_activity.id, has_attend=1)
            db_session.add(checkin)
        db_session.commit()

        response = client.get(
            f"/api/v1/checkins/{active_activity.id}/count",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["count"] >= 10

    def test_get_attended_count_only(self, client, super_admin_token, active_activity, db_session):
        """测试获取实际出席人数"""
        from tests.factories import CheckInFactory
        for _ in range(5):
            CheckInFactory(activity_id=active_activity.id, has_attend=1)
        for _ in range(2):
            CheckInFactory(activity_id=active_activity.id, has_attend=0)
        db_session.commit()

        response = client.get(
            f"/api/v1/checkins/{active_activity.id}/count?attended_only=true",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["count"] >= 5

    def test_get_checkin_rate(self, client, super_admin_token, active_activity, db_session):
        """测试获取签到率"""
        from tests.factories import ParticipantFactory, CheckInFactory
        # 创建参与者
        for _ in range(10):
            participant = ParticipantFactory(activity_id=active_activity.id)
            db_session.add(participant)
        # 创建签到记录
        for _ in range(8):
            checkin = CheckInFactory(activity_id=active_activity.id, has_attend=1)
            db_session.add(checkin)
        db_session.commit()

        response = client.get(
            f"/api/v1/checkins/{active_activity.id}/statistics",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.api
class TestCheckInPermissions:
    """签到权限测试"""

    def test_admin_can_view_all_checkins(self, client, super_admin_token, sample_checkin):
        """测试管理员可以查看所有签到记录"""
        response = client.get(
            f"/api/v1/checkins/{sample_checkin.id}",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK

    def test_authorized_admin_can_manage_checkins(self, client, activity_admin_token, sample_checkin):
        """测试有权限的管理员可以管理签到"""
        response = client.get(
            f"/api/v1/checkins/?activity_id={sample_checkin.activity_id}",
            headers=auth_headers(activity_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK

    def test_unauthorized_admin_cannot_manage(self, client, activity_admin_no_permission_token, sample_checkin):
        """测试无权限的管理员无法管理签到"""
        response = client.get(
            f"/api/v1/checkins/?activity_id={sample_checkin.activity_id}",
            headers=auth_headers(activity_admin_no_permission_token)
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_user_can_checkin(self, client, user_token, active_activity):
        """测试用户可以签到"""
        response = client.post(
            "/api/v1/checkins/",
            headers=auth_headers(user_token),
            json={
                "activity_id": active_activity.id,
                "name": "用户签到",
                "phone": "13900139206",
                "identity_number": "110101199001014008"
            }
        )
        assert response.status_code == status.HTTP_200_OK
