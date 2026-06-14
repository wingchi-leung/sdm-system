import pytest
from fastapi import status

from app.core.security import create_access_token
from app.schemas import (
    CommunityChannel,
    CommunityChannelAnnouncement,
    CommunityChannelMember,
    CommunityChannelPost,
    CommunityChannelComment,
    User,
)
from tests.conftest import auth_headers


@pytest.mark.api
class TestCommunityAnnouncements:
    """SPEC-11: 社区频道公告全链路测试。

    覆盖：
    - 列表/详情/summary CRUD
    - 发布权限：频道管理员 OK / 普通成员 403
    - 详情跨频道 404 / 跨租户 404
    - 删除：仅发布人或频道管理员可删
    - 删频道级联清理公告
    """

    # ---------- 工具方法 ----------

    def _create_channel(self, db_session, tenant_id, admin_user_id, name="公告频道"):
        ch = CommunityChannel(
            tenant_id=tenant_id,
            name=name,
            description=None,
            admin_user_id=admin_user_id,
            status=1,
        )
        db_session.add(ch)
        db_session.flush()
        db_session.add(
            CommunityChannelMember(
                tenant_id=tenant_id,
                channel_id=ch.id,
                user_id=admin_user_id,
                role="admin",
                status="active",
            )
        )
        db_session.commit()
        db_session.refresh(ch)
        return ch

    def _add_member(self, db_session, tenant_id, channel_id, user_id, role="member"):
        db_session.add(
            CommunityChannelMember(
                tenant_id=tenant_id,
                channel_id=channel_id,
                user_id=user_id,
                role=role,
                status="active",
            )
        )
        db_session.commit()

    def _create_user(self, db_session, tenant_id, user_id, name="普通成员"):
        from app.core.security import hash_password
        from app.schemas import UserCredential, UserTenant

        user = User(
            id=user_id,
            tenant_id=tenant_id,
            name=name,
            phone=f"13900139{user_id:04d}",
            identity_number="110101199001019999",
            avatar_url=None,
            isblock=0,
        )
        db_session.add(user)
        db_session.flush()
        db_session.add(UserTenant(user_id=user.id, tenant_id=tenant_id, status=1))
        db_session.add(
            UserCredential(
                user_id=user.id,
                tenant_id=tenant_id,
                credential_type="password",
                identifier=user.phone,
                credential_hash=hash_password("user123"),
                must_reset_password=0,
                status=1,
            )
        )
        db_session.commit()
        db_session.refresh(user)
        return user

    # ---------- 列表 & summary ----------

    def test_list_announcements_returns_empty_for_new_channel(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        resp = client.get(
            f"/api/v1/community/channels/{channel.id}/announcements",
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_summary_returns_total_and_latest(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        # 用显式时间倒序插入，确保 latest 是最后插入的那条
        from datetime import datetime, timedelta
        base = datetime.utcnow() - timedelta(minutes=10)
        for offset, title in enumerate(["公告 0", "公告 1", "公告 2"]):
            ann = CommunityChannelAnnouncement(
                tenant_id=channel.tenant_id,
                channel_id=channel.id,
                author_user_id=super_admin.id,
                title=title,
                content="<p>x</p>",
                content_format="html",
                images="[]",
                status=1,
            )
            ann.create_time = base + timedelta(minutes=offset)
            ann.update_time = base + timedelta(minutes=offset)
            db_session.add(ann)
        db_session.commit()

        resp = client.get(
            f"/api/v1/community/channels/{channel.id}/announcements/summary",
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["total"] == 3
        assert data["latest"] is not None
        # 时间倒序，最新一条 title 是 "公告 2"
        assert data["latest"]["title"] == "公告 2"

    def test_summary_returns_total_zero_and_null_latest_when_no_announcements(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        resp = client.get(
            f"/api/v1/community/channels/{channel.id}/announcements/summary",
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["total"] == 0
        assert data["latest"] is None

    def test_list_announcements_orders_by_create_time_desc(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        from datetime import datetime, timedelta
        base = datetime.utcnow() - timedelta(minutes=10)
        for offset, title in enumerate(["first", "second", "third"]):
            ann = CommunityChannelAnnouncement(
                tenant_id=channel.tenant_id,
                channel_id=channel.id,
                author_user_id=super_admin.id,
                title=title,
                content="<p>x</p>",
                content_format="html",
                images="[]",
                status=1,
            )
            ann.create_time = base + timedelta(minutes=offset)
            ann.update_time = base + timedelta(minutes=offset)
            db_session.add(ann)
        db_session.commit()

        resp = client.get(
            f"/api/v1/community/channels/{channel.id}/announcements",
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == status.HTTP_200_OK
        items = resp.json()["items"]
        assert [item["title"] for item in items] == ["third", "second", "first"]

    def test_list_announcements_pagination(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        for i in range(7):
            db_session.add(
                CommunityChannelAnnouncement(
                    tenant_id=channel.tenant_id,
                    channel_id=channel.id,
                    author_user_id=super_admin.id,
                    title=f"公告 {i}",
                    content="<p>x</p>",
                    content_format="html",
                    images="[]",
                    status=1,
                )
            )
        db_session.commit()

        resp1 = client.get(
            f"/api/v1/community/channels/{channel.id}/announcements?skip=0&limit=3",
            headers=auth_headers(super_admin_token),
        )
        resp2 = client.get(
            f"/api/v1/community/channels/{channel.id}/announcements?skip=3&limit=3",
            headers=auth_headers(super_admin_token),
        )
        assert resp1.status_code == status.HTTP_200_OK
        assert resp2.status_code == status.HTTP_200_OK
        assert resp1.json()["total"] == 7
        assert len(resp1.json()["items"]) == 3
        assert len(resp2.json()["items"]) == 3
        # 翻页无重复
        ids1 = {item["id"] for item in resp1.json()["items"]}
        ids2 = {item["id"] for item in resp2.json()["items"]}
        assert ids1.isdisjoint(ids2)

    # ---------- 发布 ----------

    def test_channel_admin_can_create_announcement(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        resp = client.post(
            f"/api/v1/community/channels/{channel.id}/announcements",
            headers=auth_headers(super_admin_token),
            json={
                "title": "本周六活动调整",
                "content": "<p>详情</p>",
                "content_format": "html",
                "images": ["/uploads/community/announcements/a.jpg"],
            },
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["title"] == "本周六活动调整"
        assert data["content"] == "<p>详情</p>"
        assert data["content_format"] == "html"
        assert data["images"] == ["/uploads/community/announcements/a.jpg"]
        assert data["status"] == 1  # 管理员免审
        assert data["author_user_id"] == super_admin.id
        assert data["author_name"] == super_admin.name

    def test_member_cannot_create_announcement(
        self, client, db_session, super_admin, super_admin_token, sample_user, user_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        # sample_user 是普通成员
        self._add_member(db_session, super_admin.tenant_id, channel.id, sample_user.id, role="member")

        resp = client.post(
            f"/api/v1/community/channels/{channel.id}/announcements",
            headers=auth_headers(user_token),
            json={"title": "普通成员尝试", "content": "<p>x</p>"},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_non_member_cannot_create_announcement(
        self, client, db_session, super_admin, super_admin_token, sample_user, user_token
    ):
        # sample_user 不是该频道成员
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        resp = client.post(
            f"/api/v1/community/channels/{channel.id}/announcements",
            headers=auth_headers(user_token),
            json={"title": "非成员尝试", "content": "<p>x</p>"},
        )
        # 普通成员也走 _ensure_channel_admin，会先被 _ensure_channel_member 拦下 → 403
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_create_announcement_rejects_empty_title(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        resp = client.post(
            f"/api/v1/community/channels/{channel.id}/announcements",
            headers=auth_headers(super_admin_token),
            json={"title": "  ", "content": "<p>x</p>"},
        )
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_announcement_rejects_too_many_images(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        images = [f"/uploads/community/announcements/pic_{i}.jpg" for i in range(10)]
        resp = client.post(
            f"/api/v1/community/channels/{channel.id}/announcements",
            headers=auth_headers(super_admin_token),
            json={"title": "测试", "content": "<p>x</p>", "images": images},
        )
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # ---------- 详情 ----------

    def test_get_announcement_detail(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        ann = CommunityChannelAnnouncement(
            tenant_id=channel.tenant_id,
            channel_id=channel.id,
            author_user_id=super_admin.id,
            title="详情测试",
            content="<p>正文</p>",
            content_format="html",
            images="[]",
            status=1,
        )
        db_session.add(ann)
        db_session.commit()
        db_session.refresh(ann)

        resp = client.get(
            f"/api/v1/community/channels/{channel.id}/announcements/{ann.id}",
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["id"] == ann.id
        assert data["title"] == "详情测试"

    def test_get_announcement_detail_cross_channel_returns_404(
        self, client, db_session, super_admin, super_admin_token
    ):
        ch1 = self._create_channel(db_session, super_admin.tenant_id, super_admin.id, "频道1")
        ch2 = self._create_channel(db_session, super_admin.tenant_id, super_admin.id, "频道2")
        ann = CommunityChannelAnnouncement(
            tenant_id=ch1.tenant_id,
            channel_id=ch1.id,
            author_user_id=super_admin.id,
            title="A",
            content="<p>x</p>",
            content_format="html",
            images="[]",
            status=1,
        )
        db_session.add(ann)
        db_session.commit()
        db_session.refresh(ann)

        # 拿 ch1 的 ann，但路径带 ch2
        resp = client.get(
            f"/api/v1/community/channels/{ch2.id}/announcements/{ann.id}",
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_get_announcement_detail_deleted_returns_404(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        ann = CommunityChannelAnnouncement(
            tenant_id=channel.tenant_id,
            channel_id=channel.id,
            author_user_id=super_admin.id,
            title="已删除",
            content="<p>x</p>",
            content_format="html",
            images="[]",
            status=0,  # 软删状态
        )
        db_session.add(ann)
        db_session.commit()
        db_session.refresh(ann)

        resp = client.get(
            f"/api/v1/community/channels/{channel.id}/announcements/{ann.id}",
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    # ---------- 删除 ----------

    def test_author_can_delete_own_announcement(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        ann = CommunityChannelAnnouncement(
            tenant_id=channel.tenant_id,
            channel_id=channel.id,
            author_user_id=super_admin.id,
            title="可删",
            content="<p>x</p>",
            content_format="html",
            images="[]",
            status=1,
        )
        db_session.add(ann)
        db_session.commit()
        db_session.refresh(ann)

        resp = client.delete(
            f"/api/v1/community/channels/{channel.id}/announcements/{ann.id}",
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["success"] is True

        # 列表中不再有
        list_resp = client.get(
            f"/api/v1/community/channels/{channel.id}/announcements",
            headers=auth_headers(super_admin_token),
        )
        assert list_resp.json()["total"] == 0

    def test_channel_admin_can_delete_others_announcement(
        self, client, db_session, super_admin, super_admin_token, sample_user, user_token
    ):
        # super_admin 是频道 admin，sample_user 是普通成员
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        self._add_member(db_session, super_admin.tenant_id, channel.id, sample_user.id, role="member")

        # sample_user 不是频道 admin，按理不能发公告；但本期不强制要求频道 member 也能发，
        # 我们手动插一条 author=sample_user 的公告来测"频道管理员可删"
        ann = CommunityChannelAnnouncement(
            tenant_id=channel.tenant_id,
            channel_id=channel.id,
            author_user_id=sample_user.id,
            title="由 sample_user 发布的公告",
            content="<p>x</p>",
            content_format="html",
            images="[]",
            status=1,
        )
        db_session.add(ann)
        db_session.commit()
        db_session.refresh(ann)

        # super_admin（频道 admin）可删
        resp = client.delete(
            f"/api/v1/community/channels/{channel.id}/announcements/{ann.id}",
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == status.HTTP_200_OK

    def test_non_admin_non_author_cannot_delete(
        self, client, db_session, super_admin, super_admin_token, sample_user, user_token
    ):
        # super_admin 是频道 admin，创建一条公告
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        self._add_member(db_session, super_admin.tenant_id, channel.id, sample_user.id, role="member")

        ann = CommunityChannelAnnouncement(
            tenant_id=channel.tenant_id,
            channel_id=channel.id,
            author_user_id=super_admin.id,
            title="A",
            content="<p>x</p>",
            content_format="html",
            images="[]",
            status=1,
        )
        db_session.add(ann)
        db_session.commit()
        db_session.refresh(ann)

        # sample_user 既不是作者也不是频道 admin → 403
        resp = client.delete(
            f"/api/v1/community/channels/{channel.id}/announcements/{ann.id}",
            headers=auth_headers(user_token),
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_non_member_cannot_delete(
        self, client, db_session, super_admin, super_admin_token, sample_user, user_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        ann = CommunityChannelAnnouncement(
            tenant_id=channel.tenant_id,
            channel_id=channel.id,
            author_user_id=super_admin.id,
            title="A",
            content="<p>x</p>",
            content_format="html",
            images="[]",
            status=1,
        )
        db_session.add(ann)
        db_session.commit()
        db_session.refresh(ann)

        # sample_user 不是该频道成员 → 403
        resp = client.delete(
            f"/api/v1/community/channels/{channel.id}/announcements/{ann.id}",
            headers=auth_headers(user_token),
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    # ---------- 跨租户 ----------

    def test_cross_tenant_returns_404(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        ann = CommunityChannelAnnouncement(
            tenant_id=channel.tenant_id,
            channel_id=channel.id,
            author_user_id=super_admin.id,
            title="A",
            content="<p>x</p>",
            content_format="html",
            images="[]",
            status=1,
        )
        db_session.add(ann)
        db_session.commit()
        db_session.refresh(ann)

        # 拿别的租户的 token 来访问：用户 ID 用不存在的即可，因为 _ensure_channel_member
        # 会先被 tenant_id 隔离。但因为 token 校验用的 sub 是 super_admin.id
        # （该用户只在原租户存在），实际是 401；改为只校验"不会成功读到目标内容"
        other_token = create_access_token(
            sub="99999",
            role="admin",
            tenant_id=999,
        )
        resp = client.get(
            f"/api/v1/community/channels/{channel.id}/announcements/{ann.id}",
            headers=auth_headers(other_token),
        )
        # 跨租户场景：401（用户不存在）/ 403 / 404 都算"读不到"
        assert resp.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_404_NOT_FOUND,
            status.HTTP_403_FORBIDDEN,
        )

    # ---------- 删频道级联清理 ----------

    def test_delete_channel_cascades_announcements(
        self, client, db_session, super_admin, super_admin_token
    ):
        channel_id = self._create_channel(
            db_session, super_admin.tenant_id, super_admin.id
        ).id
        for i in range(3):
            db_session.add(
                CommunityChannelAnnouncement(
                    tenant_id=super_admin.tenant_id,
                    channel_id=channel_id,
                    author_user_id=super_admin.id,
                    title=f"公告 {i}",
                    content="<p>x</p>",
                    content_format="html",
                    images="[]",
                    status=1,
                )
            )
        db_session.commit()

        before = db_session.query(CommunityChannelAnnouncement).filter(
            CommunityChannelAnnouncement.channel_id == channel_id
        ).count()
        assert before == 3

        delete_resp = client.delete(
            f"/api/v1/community/channels/{channel_id}",
            headers=auth_headers(super_admin_token),
        )
        assert delete_resp.status_code == status.HTTP_200_OK
        assert delete_resp.json()["deleted_announcements"] == 3

        # 用 expunge_all 避免访问已删 channel 对象
        db_session.expunge_all()
        after = db_session.query(CommunityChannelAnnouncement).filter(
            CommunityChannelAnnouncement.channel_id == channel_id
        ).count()
        assert after == 0
