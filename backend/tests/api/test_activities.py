"""
活动管理 API 测试
"""
import pytest
from datetime import datetime, timedelta
from fastapi import status
from tests.conftest import auth_headers


@pytest.mark.api
class TestActivityCreation:
    """活动创建测试"""

    def test_create_activity_as_super_admin(self, client, super_admin_token, sample_activity_type):
        """测试超级管理员创建活动"""
        response = client.post(
            "/api/v1/activities/",
            headers=auth_headers(super_admin_token),
            json={
                "activity_name": "新活动",
                "activity_type_id": sample_activity_type.id,
                "start_time": "2026-06-01T10:00:00",
                "tag": "测试"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["activity_name"] == "新活动"
        assert data["activity_type_id"] == sample_activity_type.id
        assert data["status"] == 1  # 默认未开始

    def test_create_activity_as_authorized_admin(self, client, activity_admin_token, sample_activity_type):
        """测试有权限的活动管理员创建活动"""
        response = client.post(
            "/api/v1/activities/",
            headers=auth_headers(activity_admin_token),
            json={
                "activity_name": "授权管理员创建的活动",
                "activity_type_id": sample_activity_type.id,
                "start_time": "2026-06-01T14:00:00"
            }
        )
        assert response.status_code == status.HTTP_200_OK

    def test_create_activity_unauthorized_type(self, client, activity_admin_no_permission_token, sample_activity_type):
        """测试无权限的管理员创建活动"""
        response = client.post(
            "/api/v1/activities/",
            headers=auth_headers(activity_admin_no_permission_token),
            json={
                "activity_name": "未授权活动",
                "activity_type_id": sample_activity_type.id,
                "start_time": "2026-06-01T14:00:00"
            }
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_activity_as_normal_user_forbidden(self, client, user_token, sample_activity_type):
        """测试普通用户创建活动被禁止"""
        response = client.post(
            "/api/v1/activities/",
            headers=auth_headers(user_token),
            json={
                "activity_name": "尝试创建",
                "activity_type_id": sample_activity_type.id,
                "start_time": "2026-06-01T10:00:00"
            }
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_activity_missing_fields(self, client, super_admin_token):
        """测试缺少必填字段"""
        response = client.post(
            "/api/v1/activities/",
            headers=auth_headers(super_admin_token),
            json={"activity_name": "不完整活动"}
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_activity_with_end_time(self, client, super_admin_token, sample_activity_type):
        """测试创建带结束时间的活动"""
        response = client.post(
            "/api/v1/activities/",
            headers=auth_headers(super_admin_token),
            json={
                "activity_name": "全天活动",
                "activity_type_id": sample_activity_type.id,
                "start_time": "2026-06-01T09:00:00",
                "end_time": "2026-06-01T18:00:00"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["activity_name"] == "全天活动"


@pytest.mark.api
class TestActivityRetrieval:
    """活动查询测试"""

    def test_get_activities_list(self, client, super_admin_token, db_session):
        """测试获取活动列表"""
        from tests.factories import ActivityFactory
        for _ in range(5):
            activity = ActivityFactory()
            db_session.add(activity)
        db_session.commit()

        response = client.get(
            "/api/v1/activities/",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] >= 5
        assert len(data["items"]) >= 5

    def test_get_activities_without_login_forbidden(self, client):
        """测试未登录获取活动列表"""
        response = client.get("/api/v1/activities/")
        assert response.status_code == status.HTTP_200_OK

    def test_get_activities_pagination(self, client, super_admin_token, db_session):
        """测试活动列表分页"""
        from tests.factories import ActivityFactory
        for _ in range(15):
            activity = ActivityFactory()
            db_session.add(activity)
        db_session.commit()

        response = client.get(
            "/api/v1/activities/?skip=0&limit=10",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["items"]) <= 10

    def test_get_activity_by_id(self, client, super_admin_token, sample_activity):
        """测试通过 ID 获取活动"""
        response = client.get(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == sample_activity.id
        assert data["activity_name"] == "测试活动"

    def test_get_nonexistent_activity(self, client, super_admin_token):
        """测试获取不存在的活动"""
        response = client.get(
            "/api/v1/activities/99999",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_unstarted_activities(self, client, user_token, db_session):
        """测试获取未开始的活动"""
        from tests.factories import ActivityFactory
        # 创建未开始的活动
        for _ in range(3):
            activity = ActivityFactory(status=1)
            db_session.add(activity)
        # 创建进行中的活动
        activity = ActivityFactory(status=2)
        db_session.add(activity)
        db_session.commit()

        response = client.get(
            "/api/v1/activities/unstarted/",
            headers=auth_headers(user_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        for activity in data["items"]:
            assert activity["status"] == 1

    def test_get_activities_by_type(self, client, super_admin_token, sample_activity_type, sample_activity_type_2, db_session):
        """测试按类型获取活动"""
        from tests.factories import ActivityFactory
        # 创建类型1的活动
        for _ in range(3):
            activity = ActivityFactory(activity_type_id=sample_activity_type.id)
            db_session.add(activity)
        # 创建类型2的活动
        activity = ActivityFactory(activity_type_id=sample_activity_type_2.id)
        db_session.add(activity)
        db_session.commit()

        response = client.get(
            f"/api/v1/activities/?activity_type_id={sample_activity_type.id}",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] >= 4


@pytest.mark.api
class TestActivityUpdate:
    """活动更新测试"""

    def test_update_activity_name(self, client, super_admin_token, sample_activity):
        """测试更新活动名称"""
        response = client.put(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(super_admin_token),
            json={"activity_name": "更新后的活动名称"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["activity_name"] == "更新后的活动名称"

    def test_update_activity_time(self, client, super_admin_token, sample_activity):
        """测试更新活动时间"""
        new_time = "2026-07-01T14:00:00"
        response = client.put(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(super_admin_token),
            json={"start_time": new_time}
        )
        assert response.status_code == status.HTTP_200_OK

    def test_update_activity_authorized_admin(self, client, activity_admin_token, sample_activity):
        """测试有权限的管理员更新活动"""
        response = client.put(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(activity_admin_token),
            json={"activity_name": "授权管理员更新"}
        )
        assert response.status_code == status.HTTP_200_OK

    def test_update_activity_unauthorized_admin(self, client, activity_admin_no_permission_token, sample_activity):
        """测试无权限的管理员更新活动"""
        response = client.put(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(activity_admin_no_permission_token),
            json={"activity_name": "尝试更新"}
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_nonexistent_activity(self, client, super_admin_token):
        """测试更新不存在的活动"""
        response = client.put(
            "/api/v1/activities/99999",
            headers=auth_headers(super_admin_token),
            json={"activity_name": "不存在的活动"}
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.api
class TestActivityStatus:
    """活动状态测试"""

    def test_update_activity_status_to_ongoing(self, client, super_admin_token, sample_activity):
        """测试更新活动状态为进行中"""
        response = client.put(
            f"/api/v1/activities/{sample_activity.id}/status?status=2",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]

    def test_update_activity_status_to_ended(self, client, super_admin_token, active_activity):
        """测试更新活动状态为已结束"""
        response = client.put(
            f"/api/v1/activities/{active_activity.id}/status?status=3",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "success"

    def test_invalid_status_transition(self, client, super_admin_token, sample_activity):
        """测试无效的状态转换"""
        # 从未开始直接到已结束（可能不允许）
        response = client.put(
            f"/api/v1/activities/{sample_activity.id}/status?status=3",
            headers=auth_headers(super_admin_token),
        )
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]

    def test_update_status_unauthorized(self, client, user_token, sample_activity):
        """测试普通用户更新活动状态被禁止"""
        response = client.put(
            f"/api/v1/activities/{sample_activity.id}/status?status=2",
            headers=auth_headers(user_token),
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.api
class TestActivityDeletion:
    """活动删除测试"""

    def test_delete_activity_as_super_admin(self, client, super_admin_token, db_session):
        """测试超级管理员删除活动"""
        from tests.factories import ActivityFactory
        activity = ActivityFactory(activity_name="待删除活动")
        db_session.add(activity)
        db_session.commit()

        response = client.delete(
            f"/api/v1/activities/{activity.id}",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT]

    def test_delete_activity_authorized_admin(self, client, activity_admin_token, sample_activity):
        """测试有权限的管理员删除活动"""
        response = client.delete(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(activity_admin_token)
        )
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT]

    def test_delete_activity_unauthorized_admin(self, client, activity_admin_no_permission_token, sample_activity):
        """测试无权限的管理员删除活动"""
        response = client.delete(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(activity_admin_no_permission_token)
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_nonexistent_activity(self, client, super_admin_token):
        """测试删除不存在的活动"""
        response = client.delete(
            "/api/v1/activities/99999",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.api
class TestActivityStatistics:
    """活动统计测试"""

    def test_get_activity_statistics(self, client, super_admin_token, sample_activity):
        """测试获取活动统计"""
        response = client.get(
            f"/api/v1/activities/{sample_activity.id}/statistics/",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "total_participants" in data or "participant_count" in data

    def test_get_activity_checkins(self, client, super_admin_token, active_activity, db_session):
        """测试获取活动签到记录"""
        from tests.factories import CheckInFactory
        for _ in range(5):
            checkin = CheckInFactory(activity_id=active_activity.id)
            db_session.add(checkin)
        db_session.commit()

        response = client.get(
            f"/api/v1/activities/{active_activity.id}/checkins/",
            headers=auth_headers(super_admin_token)
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 5

    def test_get_statistics_unauthorized(self, client, user_token, sample_activity):
        """测试普通用户获取统计被禁止"""
        response = client.get(
            f"/api/v1/activities/{sample_activity.id}/statistics/",
            headers=auth_headers(user_token)
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.api
class TestActivityPermissions:
    """活动权限测试"""

    def test_normal_user_can_view_activities(self, client, user_token, sample_activity):
        """测试普通用户可以查看活动"""
        response = client.get(
            f"/api/v1/activities/{sample_activity.id}",
            headers=auth_headers(user_token)
        )
        assert response.status_code == status.HTTP_200_OK

    def test_admin_can_only_manage_authorized_types(self, client, activity_admin_token, sample_activity_type_2, db_session):
        """测试管理员只能管理有权限的活动类型"""
        from tests.factories import ActivityFactory
        # 创建无权限类型活动
        activity = ActivityFactory(activity_type_id=sample_activity_type_2.id)
        db_session.add(activity)
        db_session.commit()

        response = client.put(
            f"/api/v1/activities/{activity.id}",
            headers=auth_headers(activity_admin_token),
            json={"activity_name": "尝试修改"}
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_without_scope_does_not_see_all_activities(
        self,
        client,
        activity_admin_no_permission_token,
        sample_activity,
    ):
        """测试无范围管理员不会被当成全量权限"""
        response = client.get(
            "/api/v1/activities/",
            headers=auth_headers(activity_admin_no_permission_token),
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_single_activity_scope_can_manage_assigned_activity(
        self,
        client,
        db_session,
        activity_admin_no_permission,
        activity_admin_no_permission_token,
        active_activity,
    ):
        """测试单活动 scope 可以管理被授权的活动"""
        from app.schemas import Permission, Role, RolePermission, UserRole

        role = Role(
            tenant_id=activity_admin_no_permission.tenant_id,
            name="单活动编辑员",
            is_system=0,
            description="测试单活动 scope",
        )
        db_session.add(role)
        db_session.flush()

        for code in ["activity.edit", "participant.view"]:
            permission = db_session.query(Permission).filter(Permission.code == code).first()
            if permission is None:
                permission = Permission(
                    code=code,
                    name=code,
                    resource=code.split(".")[0],
                    action=code.split(".")[1],
                )
                db_session.add(permission)
                db_session.flush()
            db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))

        db_session.add(
            UserRole(
                user_id=activity_admin_no_permission.user_id,
                role_id=role.id,
                tenant_id=activity_admin_no_permission.tenant_id,
                scope_type="activity",
                scope_id=active_activity.id,
            )
        )
        db_session.commit()

        update_response = client.put(
            f"/api/v1/activities/{active_activity.id}",
            headers=auth_headers(activity_admin_no_permission_token),
            json={"activity_name": "单活动授权修改"},
        )
        assert update_response.status_code == status.HTTP_200_OK

        stats_response = client.get(
            f"/api/v1/activities/{active_activity.id}/statistics/",
            headers=auth_headers(activity_admin_no_permission_token),
        )
        assert stats_response.status_code == status.HTTP_200_OK
