"""
会员系统 API 测试
"""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.schemas import MemberType, MemberTypeActivityType, User
from app.core.security import create_access_token


class TestMemberTypeAPI:
    """会员类型 API 测试"""

    def test_list_member_types_empty(self, client: TestClient, super_admin_token: str):
        """测试空会员类型列表"""
        response = client.get(
            "/api/v1/member-types/",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        assert response.json() == []

    def test_create_member_type(self, client: TestClient, super_admin_token: str, default_tenant):
        """测试创建会员类型"""
        response = client.post(
            "/api/v1/member-types/",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={
                "name": "普通会员",
                "code": "normal",
                "description": "默认会员类型",
                "sort_order": 0
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "普通会员"
        assert data["code"] == "normal"
        assert data["is_default"] == 0

    def test_create_duplicate_code(self, client: TestClient, super_admin_token: str, db_session: Session, default_tenant):
        """测试创建重复 code 的会员类型"""
        # 创建第一个
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="普通会员",
            code="normal",
            is_default=0,
            sort_order=0
        )
        db_session.add(member_type)
        db_session.commit()

        # 尝试创建重复 code
        response = client.post(
            "/api/v1/member-types/",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={
                "name": "另一个会员",
                "code": "normal",  # 重复的 code
                "description": "测试"
            }
        )
        assert response.status_code == 400
        assert "已存在" in response.json()["detail"]

    def test_get_member_type(self, client: TestClient, super_admin_token: str, db_session: Session, default_tenant):
        """测试获取会员类型详情"""
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="VIP会员",
            code="vip",
            is_default=0,
            sort_order=1
        )
        db_session.add(member_type)
        db_session.commit()
        db_session.refresh(member_type)

        response = client.get(
            f"/api/v1/member-types/{member_type.id}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "VIP会员"
        assert data["code"] == "vip"

    def test_update_member_type(self, client: TestClient, super_admin_token: str, db_session: Session, default_tenant):
        """测试更新会员类型"""
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="测试会员",
            code="test",
            is_default=0,
            sort_order=0
        )
        db_session.add(member_type)
        db_session.commit()
        db_session.refresh(member_type)

        response = client.put(
            f"/api/v1/member-types/{member_type.id}",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={
                "name": "更新后的会员",
                "description": "更新描述"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "更新后的会员"

    def test_delete_member_type(self, client: TestClient, super_admin_token: str, db_session: Session, default_tenant):
        """测试删除会员类型"""
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="待删除会员",
            code="to_delete",
            is_default=0,
            sort_order=0
        )
        db_session.add(member_type)
        db_session.commit()
        db_session.refresh(member_type)

        response = client.delete(
            f"/api/v1/member-types/{member_type.id}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200

        # 验证已删除
        response = client.get(
            f"/api/v1/member-types/{member_type.id}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 404

    def test_cannot_delete_default_member_type(self, client: TestClient, super_admin_token: str, db_session: Session, default_tenant):
        """测试不能删除默认会员类型"""
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="默认会员",
            code="default_member",
            is_default=1,  # 默认会员类型
            sort_order=0
        )
        db_session.add(member_type)
        db_session.commit()
        db_session.refresh(member_type)

        response = client.delete(
            f"/api/v1/member-types/{member_type.id}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 400
        assert "默认" in response.json()["detail"]


class TestMemberActivityType:
    """会员类型-活动类型关联测试"""

    def test_set_activity_types(self, client: TestClient, super_admin_token: str, db_session: Session, default_tenant, sample_activity_type):
        """测试设置会员可访问的活动类型"""
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="A类会员",
            code="member_a",
            is_default=0,
            sort_order=1
        )
        db_session.add(member_type)
        db_session.commit()
        db_session.refresh(member_type)

        response = client.put(
            f"/api/v1/member-types/{member_type.id}/activity-types",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={
                "activity_type_ids": [sample_activity_type.id]
            }
        )
        assert response.status_code == 200

        # 验证关联已创建
        response = client.get(
            f"/api/v1/member-types/{member_type.id}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        data = response.json()
        assert sample_activity_type.id in data["activity_types"]


class TestUserMemberSetting:
    """用户会员设置测试"""

    def test_set_user_member(self, client: TestClient, super_admin_token: str, db_session: Session, default_tenant, sample_user):
        """测试设置用户会员类型"""
        # 创建会员类型
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="VIP会员",
            code="vip",
            is_default=0,
            sort_order=1
        )
        db_session.add(member_type)
        db_session.commit()
        db_session.refresh(member_type)

        # 设置用户会员
        response = client.put(
            f"/api/v1/users/{sample_user.id}/member",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={
                "member_type_id": member_type.id,
                "member_expire_at": "2026-12-31T00:00:00"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["member_type"] == "VIP会员"

    def test_set_user_member_not_found(self, client: TestClient, super_admin_token: str, db_session: Session, default_tenant):
        """测试设置不存在用户的会员"""
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="普通会员",
            code="normal",
            is_default=1,
            sort_order=0
        )
        db_session.add(member_type)
        db_session.commit()

        response = client.put(
            "/api/v1/users/99999/member",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={
                "member_type_id": member_type.id
            }
        )
        assert response.status_code == 404

    def test_get_users_with_member(self, client: TestClient, super_admin_token: str, db_session: Session, default_tenant, sample_user):
        """测试获取用户列表（含会员信息）"""
        # 创建会员类型
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="普通会员",
            code="normal",
            is_default=1,
            sort_order=0
        )
        db_session.add(member_type)
        db_session.commit()
        db_session.refresh(member_type)

        # 设置用户会员
        sample_user.member_type_id = member_type.id
        db_session.commit()

        response = client.get(
            "/api/v1/users/with-member",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) > 0
        user = next((u for u in data if u["id"] == sample_user.id), None)
        assert user is not None
        assert user["member_type_name"] == "普通会员"


class TestMemberActivityFilter:
    """会员活动过滤测试"""

    def test_activity_list_filtered_by_member(
        self, 
        client: TestClient, 
        db_session: Session, 
        default_tenant,
        sample_activity_type,
        sample_activity_type_2
    ):
        """测试活动列表根据会员类型过滤"""
        # 创建会员类型
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="A类会员",
            code="member_a",
            is_default=0,
            sort_order=1
        )
        db_session.add(member_type)
        db_session.commit()
        db_session.refresh(member_type)

        # 设置会员可访问的活动类型（只能访问 sample_activity_type）
        relation = MemberTypeActivityType(
            member_type_id=member_type.id,
            activity_type_id=sample_activity_type.id
        )
        db_session.add(relation)
        db_session.commit()

        # 创建用户
        user = User(
            name="会员用户",
            phone="13800138002",
            tenant_id=default_tenant.id,
            member_type_id=member_type.id,
            isblock=0
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        # 创建两个活动
        from app.schemas import Activity
        activity1 = Activity(
            tenant_id=default_tenant.id,
            activity_name="活动1",
            activity_type_id=sample_activity_type.id,
            status=1
        )
        activity2 = Activity(
            tenant_id=default_tenant.id,
            activity_name="活动2",
            activity_type_id=sample_activity_type_2.id,
            status=1
        )
        db_session.add_all([activity1, activity2])
        db_session.commit()

        # 生成用户 token
        token = create_access_token(
            sub=str(user.id), 
            role="user", 
            tenant_id=user.tenant_id
        )

        # 获取活动列表
        response = client.get(
            "/api/v1/activities/",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # 只应该看到活动1（会员可访问的活动类型）
        assert data["total"] == 1
        assert data["items"][0]["activity_name"] == "活动1"

    def test_new_user_gets_default_member(self, db_session: Session, default_tenant):
        """测试新用户自动获得默认会员类型"""
        from app.crud import crud_user
        
        # 创建默认会员类型
        member_type = MemberType(
            tenant_id=default_tenant.id,
            name="普通会员",
            code="normal",
            is_default=1,
            sort_order=0
        )
        db_session.add(member_type)
        db_session.commit()
        db_session.refresh(member_type)

        # 创建微信用户
        user = crud_user.get_or_create_user_wechat(
            db_session, 
            openid="test_openid_123", 
            tenant_id=default_tenant.id,
            nickname="测试用户"
        )

        # 验证用户有默认会员类型
        assert user.member_type_id == member_type.id
        assert user.member_expire_at is None  # 永久有效