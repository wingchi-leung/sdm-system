"""多租户端到端隔离测试。"""
from fastapi import status
import pytest

from app.core.security import create_access_token, create_platform_access_token
from app.schemas import Activity, ActivityParticipant, ActivityType, Tenant, User
from tests.conftest import _create_admin_with_role, _create_platform_admin, auth_headers


@pytest.mark.e2e
class TestMultiTenantEndToEnd:
    """跨两个租户验证公开、登录、管理与写入隔离。"""

    def test_multi_tenant_access_and_write_isolation(self, client, db_session, default_tenant):
        """测试两个租户的数据不会在公开访问、管理查询、报名和签到中串租户"""
        tenant2 = Tenant(name="第二租户", code="tenant_two", status=1, plan="basic")
        db_session.add(tenant2)
        db_session.flush()

        type1 = ActivityType(tenant_id=default_tenant.id, type_name="默认租户类型", code="T1")
        type2 = ActivityType(tenant_id=tenant2.id, type_name="第二租户类型", code="T2")
        db_session.add_all([type1, type2])
        db_session.flush()

        activity1 = Activity(
            tenant_id=default_tenant.id,
            activity_name="默认租户活动",
            activity_type_id=type1.id,
            status=2,
        )
        activity2 = Activity(
            tenant_id=tenant2.id,
            activity_name="第二租户活动",
            activity_type_id=type2.id,
            status=2,
        )
        db_session.add_all([activity1, activity2])
        db_session.flush()

        tenant2_user = User(
            tenant_id=tenant2.id,
            name="第二租户用户",
            phone="13800138881",
            identity_number="110101199001018881",
            identity_type="mainland",
            sex="M",
            age=30,
            occupation="工程师",
            industry="IT",
            isblock=0,
        )
        db_session.add(tenant2_user)
        db_session.flush()

        tenant2_participant = ActivityParticipant(
            tenant_id=tenant2.id,
            activity_id=activity2.id,
            user_id=tenant2_user.id,
            participant_name=tenant2_user.name,
            phone=tenant2_user.phone,
            identity_number=tenant2_user.identity_number,
        )
        db_session.add(tenant2_participant)

        _create_admin_with_role(
            db_session,
            tenant_id=default_tenant.id,
            username="tenant1_owner",
            password="password123",
            user_name="默认租户管理员",
            phone="13800138880",
            identity_number="110101199001018880",
            permission_codes=["user.view", "activity.create", "activity.edit", "participant.view"],
        )
        platform_admin = _create_platform_admin(
            db_session,
            username="platform_e2e",
            password="platform123",
        )
        db_session.commit()

        # 公开活动列表按 tenant_code 隔离
        default_public = client.get("/api/v1/activities/?tenant_code=default")
        assert default_public.status_code == status.HTTP_200_OK
        assert [item["activity_name"] for item in default_public.json()["items"]] == ["默认租户活动"]

        tenant2_public = client.get("/api/v1/activities/?tenant_code=tenant_two")
        assert tenant2_public.status_code == status.HTTP_200_OK
        assert [item["activity_name"] for item in tenant2_public.json()["items"]] == ["第二租户活动"]

        # 租户管理员不能通过 tenant_code 查看其他租户用户
        tenant_admin_login = client.post(
            "/api/v1/auth/login",
            json={
                "username": "tenant1_owner",
                "password": "password123",
                "tenant_code": "default",
            },
        )
        assert tenant_admin_login.status_code == status.HTTP_200_OK
        tenant_admin_token = tenant_admin_login.json()["access_token"]
        forbidden_users = client.get(
            "/api/v1/users/admin/all?tenant_code=tenant_two",
            headers=auth_headers(tenant_admin_token),
        )
        assert forbidden_users.status_code == status.HTTP_403_FORBIDDEN

        # 平台管理员可以显式按租户查询
        platform_token = create_platform_access_token(str(platform_admin.id))
        platform_users = client.get(
            "/api/v1/users/admin/all?tenant_code=tenant_two",
            headers=auth_headers(platform_token),
        )
        assert platform_users.status_code == status.HTTP_200_OK
        assert platform_users.json()["items"][0]["tenant_id"] == tenant2.id

        # 第二租户用户 token 不能报名默认租户活动
        tenant2_token = create_access_token(str(tenant2_user.id), "user", tenant2.id)
        cross_register = client.post(
            "/api/v1/participants/",
            headers=auth_headers(tenant2_token),
            json={
                "activity_id": activity1.id,
                "participant_name": tenant2_user.name,
                "phone": tenant2_user.phone,
                "identity_number": tenant2_user.identity_number,
            },
        )
        assert cross_register.status_code == status.HTTP_404_NOT_FOUND

        # 匿名签到按活动归属租户落库
        checkin_response = client.post(
            "/api/v1/checkins/",
            json={
                "activity_id": activity2.id,
                "name": tenant2_user.name,
                "phone": tenant2_user.phone,
                "identity_number": tenant2_user.identity_number,
                "has_attend": 1,
                "note": "多租户端到端签到",
            },
        )
        assert checkin_response.status_code == status.HTTP_200_OK
