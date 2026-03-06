"""
参与者管理 API 测试
"""
import pytest
from fastapi import status
from tests.conftest import auth_headers


@pytest.mark.api
class TestParticipantRegistration:
    """参与者报名测试"""

    def test_register_for_activity(self, client, user_token, sample_activity):
        """测试用户报名活动"""
        response = client.post(
            "/api/v1/participants/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_activity.id,
                "participant_name": "报名者",
                "phone": "13900139100",
                "identity_number": "110101199001013000"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["activity_id"] == sample_activity.id
        assert data["participant_name"] == "报名者"

    def test_register_duplicate_participation(self, client, user_token, sample_participant):
        """测试重复报名"""
        response = client.post(
            "/api/v1/participants/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_participant.activity_id,
                "participant_name": "重复报名",
                "phone": "13900139000",  # 与 sample_participant 相同
                "identity_number": "110101199001011236"
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_without_login(self, client, sample_activity):
        """测试未登录报名"""
        response = client.post(
            "/api/v1/participants/",
            json={
                "activity_id": sample_activity.id,
                "participant_name": "尝试报名",
                "phone": "13900139101",
                "identity_number": "110101199001013001"
            }
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_register_missing_fields(self, client, user_token, sample_activity):
        """测试缺少必填字段"""
        response = client.post(
            "/api/v1/participants/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_activity.id,
                "participant_name": "不完整"
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_register_nonexistent_activity(self, client, user_token):
        """测试报名不存在的活动"""
        response = client.post(
            "/api/v1/participants/",
            headers=auth_headers(user_token),
            json={
                "activity_id": 99999,
                "participant_name": "尝试报名",
                "phone": "13900139102",
                "identity_number": "110101199001013002"
            }
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_register_batch_participants(self, client, super_admin_token, sample_activity):
        """测试批量报名"""
        participants_data = [
            {
                "participant_name": f"批量参与者{i}",
                "phone": f"139001391{i:02d}",
                "identity_number": f"110101199001013{i:03d}"
            }
            for i in range(1, 6)
        ]

        response = client.post(
            f"/api/v1/participants/{sample_activity.id}/batch",
            headers=auth_headers(super_admin_token),
            json={"participants": participants_data}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 5


@pytest.mark.api
class TestParticipantRetrieval:
    """参与者查询测试"""

    def test_get_activity_participants(self, client, super_admin_token, sample_activity, db_session):
        """测试获取活动参与者列表"""
        from tests.factories import ParticipantFactory
        for i in range(5):
            participant = ParticipantFactory(
                activity_id=sample_activity.id,
                participant_name=f"参与者{i}"
            )
            db_session.add(participant)
        db_session.commit()

        response = client.get(
            f"/api/v1/participants/{sample_activity.id}/",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 5

    def test_get_participants_unauthorized(self, client, user_token, sample_activity):
        """测试普通用户获取参与者列表"""
        response = client.get(
            f"/api/v1/participants/{sample_activity.id}/",
            headers=auth_headers(user_token)
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_participants_pagination(self, client, super_admin_token, sample_activity, db_session):
        """测试参与者列表分页"""
        from tests.factories import ParticipantFactory
        for _ in range(15):
            participant = ParticipantFactory(activity_id=sample_activity.id)
            db_session.add(participant)
        db_session.commit()

        response = client.get(
            f"/api/v1/participants/{sample_activity.id}/?skip=0&limit=10",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) <= 10

    def test_get_empty_participants(self, client, super_admin_token, db_session):
        """测试获取没有参与者的活动"""
        from tests.factories import ActivityFactory
        activity = ActivityFactory(activity_name="无参与者活动")
        db_session.add(activity)
        db_session.commit()

        response = client.get(
            f"/api/v1/participants/{activity.id}/",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 0

    def test_get_participant_by_id(self, client, super_admin_token, sample_participant):
        """测试通过 ID 获取参与者"""
        response = client.get(
            f"/api/v1/participants/{sample_participant.id}/detail",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == sample_participant.id


@pytest.mark.api
class TestParticipantManagement:
    """参与者管理测试"""

    def test_update_participant_info(self, client, super_admin_token, sample_participant):
        """测试更新参与者信息"""
        response = client.put(
            f"/api/v1/participants/{sample_participant.id}",
            headers=auth_headers(super_admin_token),
            json={"participant_name": "更新后的姓名"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["participant_name"] == "更新后的姓名"

    def test_update_participant_phone(self, client, super_admin_token, sample_participant):
        """测试更新参与者手机号"""
        response = client.put(
            f"/api/v1/participants/{sample_participant.id}",
            headers=auth_headers(super_admin_token),
            json={"phone": "13900139999"}
        )
        assert response.status_code == status.HTTP_200_OK

    def test_update_participant_unauthorized(self, client, user_token, sample_participant):
        """测试普通用户更新参与者信息被禁止"""
        response = client.put(
            f"/api/v1/participants/{sample_participant.id}",
            headers=auth_headers(user_token),
            json={"participant_name": "尝试修改"}
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_participant(self, client, super_admin_token, db_session):
        """测试删除参与者"""
        from tests.factories import ParticipantFactory
        participant = ParticipantFactory(participant_name="待删除参与者")
        db_session.add(participant)
        db_session.commit()

        response = client.delete(
            f"/api/v1/participants/{participant.id}",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT]

    def test_delete_participant_unauthorized(self, client, user_token, sample_participant):
        """测试普通用户删除参与者被禁止"""
        response = client.delete(
            f"/api/v1/participants/{sample_participant.id}",
            headers=auth_headers(user_token)
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.api
class TestParticipantValidation:
    """参与者验证测试"""

    def test_register_with_invalid_phone(self, client, user_token, sample_activity):
        """测试无效手机号格式"""
        response = client.post(
            "/api/v1/participants/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_activity.id,
                "participant_name": "报名者",
                "phone": "invalid_phone",
                "identity_number": "110101199001013003"
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_register_with_invalid_identity(self, client, user_token, sample_activity):
        """测试无效身份证号格式"""
        response = client.post(
            "/api/v1/participants/",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_activity.id,
                "participant_name": "报名者",
                "phone": "13900139103",
                "identity_number": "invalid_id"
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_check_duplicate_before_register(self, client, user_token, sample_participant):
        """测试报名前检查重复"""
        response = client.post(
            "/api/v1/participants/check-duplicate",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_participant.activity_id,
                "phone": "13900139000"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["is_duplicate"] is True

    def test_check_not_duplicate(self, client, user_token, sample_activity):
        """测试检查非重复报名"""
        response = client.post(
            "/api/v1/participants/check-duplicate",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_activity.id,
                "phone": "13900139104"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["is_duplicate"] is False


@pytest.mark.api
class TestParticipantPermissions:
    """参与者权限测试"""

    def test_admin_can_view_all_participants(self, client, super_admin_token, sample_participant):
        """测试管理员可以查看所有参与者"""
        response = client.get(
            f"/api/v1/participants/{sample_participant.id}/detail",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK

    def test_authorized_admin_can_manage_participants(self, client, activity_admin_token, sample_participant):
        """测试有权限的管理员可以管理参与者"""
        response = client.get(
            f"/api/v1/participants/{sample_participant.activity_id}/",
            headers=auth_headers(activity_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK

    def test_unauthorized_admin_cannot_manage(self, client, activity_admin_no_permission_token, sample_participant):
        """测试无权限的管理员无法管理参与者"""
        response = client.get(
            f"/api/v1/participants/{sample_participant.activity_id}/",
            headers=auth_headers(activity_admin_no_permission_token)
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.api
class TestParticipantStatistics:
    """参与者统计测试"""

    def test_get_participant_count(self, client, super_admin_token, sample_activity, db_session):
        """测试获取参与人数"""
        from tests.factories import ParticipantFactory
        for _ in range(10):
            participant = ParticipantFactory(activity_id=sample_activity.id)
            db_session.add(participant)
        db_session.commit()

        response = client.get(
            f"/api/v1/participants/{sample_activity.id}/count",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["count"] >= 10

    def test_export_participants(self, client, super_admin_token, sample_activity):
        """测试导出参与者列表"""
        response = client.get(
            f"/api/v1/participants/{sample_activity.id}/export",
            headers=auth_headers(super_admin_token)
        )
        # 可能返回文件或数据
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]
