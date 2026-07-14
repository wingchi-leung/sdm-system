import pytest
from fastapi import status

from app.core.security import create_access_token
from app.core.security import hash_password
from app.services.wechat_content_security import ContentSecurityResult
from app.schemas import (
    CommunityChannel,
    CommunityChannelComment,
    CommunityChannelMember,
    CommunityChannelPost,
    CommunityMediaModerationTask,
    CommunityNotification,
    User,
    UserCredential,
    UserTenant,
)
from tests.conftest import auth_headers


@pytest.mark.api
class TestCommunityChannels:
    def _create_user(self, db_session, tenant_id: int, phone: str, name: str) -> User:
        user = User(
            tenant_id=tenant_id,
            name=name,
            phone=phone,
            identity_number="110101199001019999",
            avatar_url="builtin:avatar-2",
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
                identifier=phone,
                credential_hash=hash_password("user123"),
                must_reset_password=0,
                status=1,
            )
        )
        db_session.commit()
        db_session.refresh(user)
        return user

    def test_admin_can_create_channel(self, client, super_admin_token):
        response = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(super_admin_token),
            json={"name": "产品讨论", "description": "日常沟通频道"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "产品讨论"
        assert data["role"] == "admin"

    def test_admin_can_update_channel(self, client, super_admin_token):
        create_resp = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(super_admin_token),
            json={"name": "旧社区名称", "description": "旧描述"},
        )
        assert create_resp.status_code == status.HTTP_200_OK
        channel_id = create_resp.json()["id"]

        update_resp = client.put(
            f"/api/v1/community/channels/{channel_id}",
            headers=auth_headers(super_admin_token),
            json={
                "name": "新社区名称",
                "description": "新描述",
                "avatar_url": "/uploads/community/channels/new-avatar.png",
            },
        )
        assert update_resp.status_code == status.HTTP_200_OK
        data = update_resp.json()
        assert data["id"] == channel_id
        assert data["name"] == "新社区名称"
        assert data["description"] == "新描述"
        assert data["avatar_url"] == "/uploads/community/channels/new-avatar.png"

    def test_user_cannot_create_channel(self, client, user_token):
        response = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(user_token),
            json={"name": "普通用户频道"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json()["detail"] == "仅管理员可执行该操作"

    def test_user_can_list_joined_channels(self, client, db_session, sample_user):
        channel = CommunityChannel(
            tenant_id=sample_user.tenant_id,
            name="学习打卡",
            description="打卡频道",
            admin_user_id=sample_user.id,
            status=1,
        )
        db_session.add(channel)
        db_session.flush()
        db_session.add(
            CommunityChannelMember(
                tenant_id=sample_user.tenant_id,
                channel_id=channel.id,
                user_id=sample_user.id,
                role="admin",
                status="active",
            )
        )
        db_session.commit()

        response = client.get(
            "/api/v1/community/channels",
            headers=auth_headers(
                create_access_token(
                    sub=str(sample_user.id),
                    role="user",
                    tenant_id=sample_user.tenant_id,
                )
            ),
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["total"] >= 1

    def test_admin_can_invite_and_user_can_accept(
        self,
        client,
        db_session,
        super_admin,
        super_admin_token,
        sample_user,
    ):
        target_user = self._create_user(
            db_session,
            tenant_id=sample_user.tenant_id,
            phone="13800138111",
            name="被邀请用户",
        )
        target_token = create_access_token(
            sub=str(target_user.id),
            role="user",
            tenant_id=target_user.tenant_id,
        )

        create_channel_resp = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(super_admin_token),
            json={"name": "运营频道"},
        )
        assert create_channel_resp.status_code == status.HTTP_200_OK
        channel_id = create_channel_resp.json()["id"]

        invite_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/invite",
            headers=auth_headers(super_admin_token),
            json={"user_ids": [target_user.id]},
        )
        assert invite_resp.status_code == status.HTTP_200_OK
        assert invite_resp.json()["invited_count"] == 1

        notification_list = client.get(
            "/api/v1/community/notifications",
            headers=auth_headers(target_token),
        )
        assert notification_list.status_code == status.HTTP_200_OK
        items = notification_list.json()["items"]
        assert len(items) == 1
        notification_id = items[0]["id"]

        accept_resp = client.post(
            f"/api/v1/community/invites/{notification_id}/accept",
            headers=auth_headers(target_token),
        )
        assert accept_resp.status_code == status.HTTP_200_OK

        members_resp = client.get(
            f"/api/v1/community/channels/{channel_id}/members",
            headers=auth_headers(super_admin_token),
        )
        assert members_resp.status_code == status.HTTP_200_OK
        member_ids = [item["user_id"] for item in members_resp.json()["items"]]
        assert target_user.id in member_ids

        notification_obj = db_session.query(CommunityNotification).filter(
            CommunityNotification.id == notification_id
        ).first()
        assert notification_obj is not None
        assert notification_obj.is_read == 1

    def test_notification_read_and_unread_count(self, client, db_session, sample_user, user_token):
        notification = CommunityNotification(
            tenant_id=sample_user.tenant_id,
            recipient_user_id=sample_user.id,
            type="channel_invite",
            title="邀请你加入频道",
            content="测试消息",
            data="{}",
            is_read=0,
        )
        db_session.add(notification)
        db_session.commit()
        db_session.refresh(notification)

        unread_before = client.get(
            "/api/v1/community/notifications/unread-count",
            headers=auth_headers(user_token),
        )
        assert unread_before.status_code == status.HTTP_200_OK
        assert unread_before.json()["unread_count"] >= 1

        read_resp = client.post(
            f"/api/v1/community/notifications/{notification.id}/read",
            headers=auth_headers(user_token),
        )
        assert read_resp.status_code == status.HTTP_200_OK

    def test_invite_code_flow_is_closed(
        self,
        client,
        super_admin_token,
        user_token,
    ):
        create_resp = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(super_admin_token),
            json={"name": "邀请码频道"},
        )
        assert create_resp.status_code == status.HTTP_200_OK
        channel_id = create_resp.json()["id"]

        code_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/invite-code",
            headers=auth_headers(super_admin_token),
        )
        assert code_resp.status_code == status.HTTP_410_GONE
        assert code_resp.json()["detail"] == "邀请码加入功能已关闭"

        join_resp = client.post(
            "/api/v1/community/channels/join-by-code",
            headers=auth_headers(user_token),
            json={"invite_code": "TESTCODE"},
        )
        assert join_resp.status_code == status.HTTP_410_GONE
        assert join_resp.json()["detail"] == "邀请码加入功能已关闭"

    def test_channel_post_comment_and_ban_flow(
        self,
        client,
        db_session,
        super_admin,
        super_admin_token,
        sample_user,
        user_token,
    ):
        sample_user.avatar_url = "builtin:avatar-3"
        db_session.add(sample_user)
        db_session.commit()

        create_resp = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(super_admin_token),
            json={"name": "动态频道"},
        )
        assert create_resp.status_code == status.HTTP_200_OK
        channel_id = create_resp.json()["id"]

        # 邀请并接受
        invite_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/invite",
            headers=auth_headers(super_admin_token),
            json={"user_ids": [sample_user.id]},
        )
        assert invite_resp.status_code == status.HTTP_200_OK
        notification = db_session.query(CommunityNotification).filter(
            CommunityNotification.recipient_user_id == sample_user.id
        ).order_by(CommunityNotification.id.desc()).first()
        assert notification is not None
        accept_resp = client.post(
            f"/api/v1/community/invites/{notification.id}/accept",
            headers=auth_headers(user_token),
        )
        assert accept_resp.status_code == status.HTTP_200_OK

        post_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(user_token),
            json={"title": "频道动态", "content": "<p>这里是频道正文</p>", "content_format": "html", "images": []},
        )
        assert post_resp.status_code == status.HTTP_200_OK
        post_id = post_resp.json()["id"]

        comment_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/posts/{post_id}/comments",
            headers=auth_headers(user_token),
            json={"content": "频道评论", "images": []},
        )
        assert comment_resp.status_code == status.HTTP_200_OK

        post_list_resp = client.get(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(user_token),
        )
        assert post_list_resp.status_code == status.HTTP_200_OK
        post_item = post_list_resp.json()["items"][0]
        assert post_item["content_format"] == "html"
        assert post_item["author_avatar_url"] == sample_user.avatar_url
        assert len(post_item["preview_comments"]) == 1
        assert post_item["preview_comments"][0]["user_avatar_url"] == sample_user.avatar_url

        ban_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/members/{sample_user.id}/ban",
            headers=auth_headers(super_admin_token),
        )
        assert ban_resp.status_code == status.HTTP_200_OK

        blocked_post = client.post(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(user_token),
            json={"title": "被禁言动态", "content": "不能发", "images": []},
        )
        assert blocked_post.status_code == status.HTTP_403_FORBIDDEN

    def test_user_channel_post_with_sensitive_text_goes_pending_and_admin_can_approve(
        self,
        client,
        db_session,
        super_admin_token,
        sample_user,
        user_token,
        monkeypatch,
    ):
        create_resp = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(super_admin_token),
            json={"name": "审核频道"},
        )
        assert create_resp.status_code == status.HTTP_200_OK
        channel_id = create_resp.json()["id"]

        invite_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/invite",
            headers=auth_headers(super_admin_token),
            json={"user_ids": [sample_user.id]},
        )
        assert invite_resp.status_code == status.HTTP_200_OK
        notification = db_session.query(CommunityNotification).filter(
            CommunityNotification.recipient_user_id == sample_user.id
        ).order_by(CommunityNotification.id.desc()).first()
        assert notification is not None
        accept_resp = client.post(
            f"/api/v1/community/invites/{notification.id}/accept",
            headers=auth_headers(user_token),
        )
        assert accept_resp.status_code == status.HTTP_200_OK

        monkeypatch.setattr("app.services.wechat_content_security.settings.WECHAT_CONTENT_SECURITY_ENABLED", True)
        monkeypatch.setattr(
            "app.api.v1.endpoints.community.check_text_security",
            lambda text: ContentSecurityResult(
                passed=False,
                hit_sensitive=True,
                reason="内容含敏感信息，已转人工审核",
            ),
        )

        post_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(user_token),
            json={"title": "待审核动态", "content": "<p>触发敏感</p>", "content_format": "html", "images": []},
        )
        assert post_resp.status_code == status.HTTP_200_OK
        assert post_resp.json()["status"] == 0
        post_id = post_resp.json()["id"]

        list_resp = client.get(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(user_token),
        )
        assert list_resp.status_code == status.HTTP_200_OK
        assert list_resp.json()["total"] == 0

        approve_resp = client.post(
            f"/api/v1/community/moderation/channel_post/{post_id}",
            headers=auth_headers(super_admin_token),
            json={"action": "approve"},
        )
        assert approve_resp.status_code == status.HTTP_200_OK
        assert approve_resp.json()["status"] == 1

        list_after_approve = client.get(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(user_token),
        )
        assert list_after_approve.status_code == status.HTTP_200_OK
        assert list_after_approve.json()["total"] == 1

    def test_user_channel_post_with_images_creates_media_moderation_tasks(
        self,
        client,
        db_session,
        super_admin_token,
        sample_user,
        user_token,
        monkeypatch,
    ):
        create_resp = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(super_admin_token),
            json={"name": "图片审核频道"},
        )
        assert create_resp.status_code == status.HTTP_200_OK
        channel_id = create_resp.json()["id"]

        invite_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/invite",
            headers=auth_headers(super_admin_token),
            json={"user_ids": [sample_user.id]},
        )
        assert invite_resp.status_code == status.HTTP_200_OK
        notification = db_session.query(CommunityNotification).filter(
            CommunityNotification.recipient_user_id == sample_user.id
        ).order_by(CommunityNotification.id.desc()).first()
        assert notification is not None
        accept_resp = client.post(
            f"/api/v1/community/invites/{notification.id}/accept",
            headers=auth_headers(user_token),
        )
        assert accept_resp.status_code == status.HTTP_200_OK

        monkeypatch.setattr("app.api.v1.endpoints.community.settings.WECHAT_CONTENT_SECURITY_ENABLED", True)
        monkeypatch.setattr(
            "app.api.v1.endpoints.community.check_text_security",
            lambda text: ContentSecurityResult(
                passed=True,
                hit_sensitive=False,
                reason="审核通过",
            ),
        )
        monkeypatch.setattr(
            "app.api.v1.endpoints.community.submit_media_check_async",
            lambda media_url: type(
                "MockSubmitResult",
                (),
                {"accepted": True, "trace_id": f"trace_{hash(media_url)}", "reason": "提交成功"},
            )(),
        )

        post_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(user_token),
            json={
                "title": "图片待审动态",
                "content": "<p>图片审核测试</p>",
                "content_format": "html",
                "images": ["/uploads/community/posts/2026/05/pic_a.jpg"],
            },
        )
        assert post_resp.status_code == status.HTTP_200_OK
        data = post_resp.json()
        assert data["status"] == 0

        task = db_session.query(CommunityMediaModerationTask).filter(
            CommunityMediaModerationTask.item_type == "channel_post",
            CommunityMediaModerationTask.item_id == data["id"],
        ).first()
        assert task is not None
        assert task.status == "pending"

    def test_admin_channel_post_bypasses_text_and_image_moderation(
        self,
        client,
        db_session,
        super_admin_token,
        monkeypatch,
    ):
        create_resp = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(super_admin_token),
            json={"name": "管理员免审频道"},
        )
        assert create_resp.status_code == status.HTTP_200_OK
        channel_id = create_resp.json()["id"]

        monkeypatch.setattr(
            "app.api.v1.endpoints.community.check_text_security",
            lambda text: (_ for _ in ()).throw(AssertionError("管理员不应触发文本审核")),
        )
        monkeypatch.setattr(
            "app.api.v1.endpoints.community.submit_media_check_async",
            lambda media_url: (_ for _ in ()).throw(AssertionError("管理员不应触发图片审核")),
        )
        monkeypatch.setattr("app.api.v1.endpoints.community.settings.WECHAT_CONTENT_SECURITY_ENABLED", True)

        post_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(super_admin_token),
            json={
                "title": "管理员发布动态",
                "content": "<p>管理员内容</p>",
                "content_format": "html",
                "images": ["/uploads/community/posts/2026/05/admin.jpg"],
            },
        )
        assert post_resp.status_code == status.HTTP_200_OK
        data = post_resp.json()
        assert data["status"] == 1
        assert data["content_format"] == "html"
        assert data["images"] == ["/uploads/community/posts/2026/05/admin.jpg"]

        tasks = db_session.query(CommunityMediaModerationTask).filter(
            CommunityMediaModerationTask.item_type == "channel_post",
            CommunityMediaModerationTask.item_id == data["id"],
        ).all()
        assert tasks == []

    def test_channel_post_author_can_delete_and_other_member_cannot(
        self,
        client,
        db_session,
        super_admin_token,
        sample_user,
        user_token,
    ):
        other_user = self._create_user(
            db_session,
            tenant_id=sample_user.tenant_id,
            phone="13800138112",
            name="其他频道成员",
        )
        other_token = create_access_token(
            sub=str(other_user.id),
            role="user",
            tenant_id=other_user.tenant_id,
        )
        create_resp = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(super_admin_token),
            json={"name": "作者删除权限频道"},
        )
        assert create_resp.status_code == status.HTTP_200_OK
        channel_id = create_resp.json()["id"]
        db_session.add_all([
            CommunityChannelMember(
                tenant_id=sample_user.tenant_id,
                channel_id=channel_id,
                user_id=sample_user.id,
                role="member",
                status="active",
            ),
            CommunityChannelMember(
                tenant_id=other_user.tenant_id,
                channel_id=channel_id,
                user_id=other_user.id,
                role="member",
                status="active",
            ),
        ])
        db_session.commit()

        post_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(user_token),
            json={"title": "作者自己的帖子", "content": "正文", "images": []},
        )
        assert post_resp.status_code == status.HTTP_200_OK
        post_id = post_resp.json()["id"]
        comment_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/posts/{post_id}/comments",
            headers=auth_headers(user_token),
            json={"content": "随帖子一起删除的评论", "images": []},
        )
        assert comment_resp.status_code == status.HTTP_200_OK
        comment_id = comment_resp.json()["id"]

        forbidden_resp = client.delete(
            f"/api/v1/community/channels/{channel_id}/posts/{post_id}",
            headers=auth_headers(other_token),
        )
        assert forbidden_resp.status_code == status.HTTP_403_FORBIDDEN
        assert forbidden_resp.json()["detail"] == "只能删除自己发布的帖子"

        delete_resp = client.delete(
            f"/api/v1/community/channels/{channel_id}/posts/{post_id}",
            headers=auth_headers(user_token),
        )
        assert delete_resp.status_code == status.HTTP_200_OK
        assert delete_resp.json() == {
            "success": True,
            "post_id": post_id,
            "deleted_comments": 1,
        }
        db_session.expire_all()
        assert db_session.query(CommunityChannelPost).filter(
            CommunityChannelPost.id == post_id,
        ).one().status == -2
        assert db_session.query(CommunityChannelComment).filter(
            CommunityChannelComment.id == comment_id,
        ).one().status == -2
        review_deleted_resp = client.post(
            f"/api/v1/community/moderation/channel_post/{post_id}",
            headers=auth_headers(super_admin_token),
            json={"action": "approve"},
        )
        assert review_deleted_resp.status_code == status.HTTP_404_NOT_FOUND
        db_session.expire_all()
        assert db_session.query(CommunityChannelPost).filter(
            CommunityChannelPost.id == post_id,
        ).one().status == -2

        admin_delete_post_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(user_token),
            json={"title": "管理员可删除", "content": "正文", "images": []},
        )
        admin_delete_post_id = admin_delete_post_resp.json()["id"]
        admin_delete_resp = client.delete(
            f"/api/v1/community/channels/{channel_id}/posts/{admin_delete_post_id}",
            headers=auth_headers(super_admin_token),
        )
        assert admin_delete_resp.status_code == status.HTTP_200_OK
        assert admin_delete_resp.json()["success"] is True

    def test_admin_can_delete_channel_and_related_posts_comments(self, client, db_session, super_admin_token):
        create_resp = client.post(
            "/api/v1/community/channels",
            headers=auth_headers(super_admin_token),
            json={"name": "待删除频道"},
        )
        assert create_resp.status_code == status.HTTP_200_OK
        channel_id = create_resp.json()["id"]

        post_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/posts",
            headers=auth_headers(super_admin_token),
            json={"title": "待删除动态", "content": "<p>删除测试</p>", "content_format": "html", "images": []},
        )
        assert post_resp.status_code == status.HTTP_200_OK
        post_id = post_resp.json()["id"]

        comment_resp = client.post(
            f"/api/v1/community/channels/{channel_id}/posts/{post_id}/comments",
            headers=auth_headers(super_admin_token),
            json={"content": "待删除评论", "images": []},
        )
        assert comment_resp.status_code == status.HTTP_200_OK

        member_count_before = db_session.query(CommunityChannelMember).filter(
            CommunityChannelMember.channel_id == channel_id
        ).count()
        post_count_before = db_session.query(CommunityChannelPost).filter(
            CommunityChannelPost.channel_id == channel_id
        ).count()
        comment_count_before = db_session.query(CommunityChannelComment).filter(
            CommunityChannelComment.channel_id == channel_id
        ).count()
        assert member_count_before >= 1
        assert post_count_before == 1
        assert comment_count_before == 1

        delete_resp = client.delete(
            f"/api/v1/community/channels/{channel_id}",
            headers=auth_headers(super_admin_token),
        )
        assert delete_resp.status_code == status.HTTP_200_OK
        assert delete_resp.json()["success"] is True
        assert delete_resp.json()["deleted_posts"] == 1
        assert delete_resp.json()["deleted_comments"] == 1

        channel_row = db_session.query(CommunityChannel).filter(
            CommunityChannel.id == channel_id
        ).first()
        assert channel_row is None
        assert db_session.query(CommunityChannelMember).filter(
            CommunityChannelMember.channel_id == channel_id
        ).count() == 0
        assert db_session.query(CommunityChannelPost).filter(
            CommunityChannelPost.channel_id == channel_id
        ).count() == 0
        assert db_session.query(CommunityChannelComment).filter(
            CommunityChannelComment.channel_id == channel_id
        ).count() == 0
