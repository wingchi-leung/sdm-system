import pytest
from fastapi import status
import hashlib

from app.services.wechat_content_security import ContentSecurityResult
from app.schemas import ActivityParticipant, CommunityComment, CommunityMediaModerationTask, CommunityPost
from tests.conftest import auth_headers


@pytest.mark.api
class TestCommunityPosts:
    def test_admin_can_create_post(self, client, super_admin_token, sample_activity):
        response = client.post(
            "/api/v1/community/posts",
            headers=auth_headers(super_admin_token),
            json={
                "activity_id": sample_activity.id,
                "title": "课前须知",
                "content": "请大家提前十分钟到场。",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["activity_id"] == sample_activity.id
        assert data["title"] == "课前须知"
        assert data["author_name"] == "超级管理员"
        assert data["comment_count"] == 0
        assert data["images"] == []

    def test_admin_can_create_post_with_images(self, client, super_admin_token, sample_activity):
        response = client.post(
            "/api/v1/community/posts",
            headers=auth_headers(super_admin_token),
            json={
                "activity_id": sample_activity.id,
                "title": "图文通知",
                "content": "请看图片说明。",
                "images": [
                    "/uploads/community/posts/2026/05/demo_1.jpg",
                    "/uploads/community/posts/2026/05/demo_2.jpg",
                ],
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["images"] == [
            "/uploads/community/posts/2026/05/demo_1.jpg",
            "/uploads/community/posts/2026/05/demo_2.jpg",
        ]

    def test_create_post_rejects_too_many_images(self, client, super_admin_token, sample_activity):
        response = client.post(
            "/api/v1/community/posts",
            headers=auth_headers(super_admin_token),
            json={
                "activity_id": sample_activity.id,
                "title": "超限图片",
                "content": "图片数量超限",
                "images": [f"/uploads/community/posts/2026/05/{index}.jpg" for index in range(10)],
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_user_cannot_create_post(self, client, user_token, sample_activity):
        response = client.post(
            "/api/v1/community/posts",
            headers=auth_headers(user_token),
            json={
                "activity_id": sample_activity.id,
                "title": "普通用户发文",
                "content": "不应该成功",
            },
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_enrolled_user_can_list_posts(
        self,
        client,
        db_session,
        user_token,
        sample_activity,
        sample_user,
        super_admin,
    ):
        db_session.add(
            ActivityParticipant(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                user_id=sample_user.id,
                participant_name=sample_user.name,
                enroll_status=1,
            )
        )
        db_session.add(
            CommunityPost(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                author_user_id=super_admin.id,
                title="第一篇文章",
                content="欢迎来到社区",
                status=1,
            )
        )
        db_session.commit()

        response = client.get(
            f"/api/v1/community/posts?activity_id={sample_activity.id}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["title"] == "第一篇文章"

    def test_pending_payment_user_cannot_list_posts(
        self,
        client,
        db_session,
        user_token,
        sample_activity,
        sample_user,
        super_admin,
    ):
        db_session.add(
            ActivityParticipant(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                user_id=sample_user.id,
                participant_name=sample_user.name,
                enroll_status=1,
                payment_status=1,
            )
        )
        db_session.add(
            CommunityPost(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                author_user_id=super_admin.id,
                title="待支付不可见",
                content="未完成支付不能看社区",
                status=1,
            )
        )
        db_session.commit()

        response = client.get(
            f"/api/v1/community/posts?activity_id={sample_activity.id}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "报名后才可查看" in response.json()["detail"]

    def test_unenrolled_user_cannot_list_posts(
        self,
        client,
        user_token,
        sample_activity,
    ):
        response = client.get(
            f"/api/v1/community/posts?activity_id={sample_activity.id}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "报名后才可查看" in response.json()["detail"]

    def test_unauthenticated_user_cannot_list_posts(self, client, sample_activity):
        response = client.get(f"/api/v1/community/posts?activity_id={sample_activity.id}")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_admin_can_get_post_detail_without_registration(
        self,
        client,
        db_session,
        super_admin_token,
        sample_activity,
        super_admin,
    ):
        post = CommunityPost(
            tenant_id=sample_activity.tenant_id,
            activity_id=sample_activity.id,
            author_user_id=super_admin.id,
            title="管理员通知",
            content="今晚请准时参加。",
            status=1,
        )
        db_session.add(post)
        db_session.commit()
        db_session.refresh(post)

        response = client.get(
            f"/api/v1/community/posts/{post.id}",
            headers=auth_headers(super_admin_token),
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["title"] == "管理员通知"


@pytest.mark.api
class TestCommunityComments:
    def test_enrolled_user_can_comment(
        self,
        client,
        db_session,
        user_token,
        sample_activity,
        sample_user,
        super_admin,
    ):
        db_session.add(
            ActivityParticipant(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                user_id=sample_user.id,
                participant_name=sample_user.name,
                enroll_status=1,
            )
        )
        post = CommunityPost(
            tenant_id=sample_user.tenant_id,
            activity_id=sample_activity.id,
            author_user_id=super_admin.id,
            title="答疑帖",
            content="大家可以在下面提问。",
            status=1,
        )
        db_session.add(post)
        db_session.commit()
        db_session.refresh(post)

        response = client.post(
            f"/api/v1/community/posts/{post.id}/comments",
            headers=auth_headers(user_token),
            json={"content": "收到，期待活动开始。"},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["post_id"] == post.id
        assert data["user_name"] == sample_user.name
        assert data["images"] == []

    def test_enrolled_user_can_comment_with_images(
        self,
        client,
        db_session,
        user_token,
        sample_activity,
        sample_user,
        super_admin,
    ):
        db_session.add(
            ActivityParticipant(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                user_id=sample_user.id,
                participant_name=sample_user.name,
                enroll_status=1,
            )
        )
        post = CommunityPost(
            tenant_id=sample_user.tenant_id,
            activity_id=sample_activity.id,
            author_user_id=super_admin.id,
            title="图评测试",
            content="大家可以图评。",
            status=1,
        )
        db_session.add(post)
        db_session.commit()
        db_session.refresh(post)

        response = client.post(
            f"/api/v1/community/posts/{post.id}/comments",
            headers=auth_headers(user_token),
            json={
                "content": "图片评论",
                "images": [
                    "/uploads/community/posts/2026/05/comment_1.jpg",
                    "/uploads/community/posts/2026/05/comment_2.jpg",
                ],
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["images"]) == 2

    def test_comment_rejects_too_many_images(
        self,
        client,
        db_session,
        user_token,
        sample_activity,
        sample_user,
        super_admin,
    ):
        db_session.add(
            ActivityParticipant(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                user_id=sample_user.id,
                participant_name=sample_user.name,
                enroll_status=1,
            )
        )
        post = CommunityPost(
            tenant_id=sample_user.tenant_id,
            activity_id=sample_activity.id,
            author_user_id=super_admin.id,
            title="图评超限",
            content="图评超限。",
            status=1,
        )
        db_session.add(post)
        db_session.commit()
        db_session.refresh(post)

        response = client.post(
            f"/api/v1/community/posts/{post.id}/comments",
            headers=auth_headers(user_token),
            json={
                "content": "超限评论",
                "images": [f"/uploads/community/posts/2026/05/{idx}.jpg" for idx in range(10)],
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_admin_can_comment_when_joined(
        self,
        client,
        db_session,
        super_admin_token,
        sample_activity,
        super_admin,
    ):
        db_session.add(
            ActivityParticipant(
                tenant_id=sample_activity.tenant_id,
                activity_id=sample_activity.id,
                user_id=super_admin.id,
                participant_name=super_admin.name,
                enroll_status=1,
            )
        )
        post = CommunityPost(
            tenant_id=sample_activity.tenant_id,
            activity_id=sample_activity.id,
            author_user_id=super_admin.id,
            title="通知",
            content="管理员可按用户身份评论",
            status=1,
        )
        db_session.add(post)
        db_session.commit()
        db_session.refresh(post)

        response = client.post(
            f"/api/v1/community/posts/{post.id}/comments",
            headers=auth_headers(super_admin_token),
            json={"content": "我是管理员"},
        )

        assert response.status_code == status.HTTP_200_OK

    def test_admin_without_permission_and_without_registration_cannot_list_posts(
        self,
        client,
        db_session,
        activity_admin_no_permission_token,
        sample_activity,
        super_admin,
    ):
        post = CommunityPost(
            tenant_id=sample_activity.tenant_id,
            activity_id=sample_activity.id,
            author_user_id=super_admin.id,
            title="权限隔离文章",
            content="未报名且无活动权限不可读",
            status=1,
        )
        db_session.add(post)
        db_session.commit()

        response = client.get(
            f"/api/v1/community/posts?activity_id={sample_activity.id}",
            headers=auth_headers(activity_admin_no_permission_token),
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_enrolled_user_can_list_comments(
        self,
        client,
        db_session,
        user_token,
        sample_activity,
        sample_user,
        super_admin,
    ):
        db_session.add(
            ActivityParticipant(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                user_id=sample_user.id,
                participant_name=sample_user.name,
                enroll_status=1,
            )
        )
        post = CommunityPost(
            tenant_id=sample_user.tenant_id,
            activity_id=sample_activity.id,
            author_user_id=super_admin.id,
            title="评论测试",
            content="这里有评论。",
            status=1,
        )
        db_session.add(post)
        db_session.commit()
        db_session.refresh(post)
        db_session.add(
            CommunityComment(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                post_id=post.id,
                user_id=sample_user.id,
                content="第一条评论",
                status=1,
            )
        )
        db_session.commit()

        response = client.get(
            f"/api/v1/community/posts/{post.id}/comments",
            headers=auth_headers(user_token),
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["content"] == "第一条评论"

    def test_unenrolled_user_cannot_get_comments(
        self,
        client,
        db_session,
        user_token,
        sample_activity,
        super_admin,
    ):
        post = CommunityPost(
            tenant_id=sample_activity.tenant_id,
            activity_id=sample_activity.id,
            author_user_id=super_admin.id,
            title="不可见文章",
            content="未报名不可见。",
            status=1,
        )
        db_session.add(post)
        db_session.commit()
        db_session.refresh(post)

        response = client.get(
            f"/api/v1/community/posts/{post.id}/comments",
            headers=auth_headers(user_token),
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_sensitive_comment_enters_manual_review_queue(
        self,
        client,
        db_session,
        user_token,
        sample_activity,
        sample_user,
        super_admin,
        super_admin_token,
        monkeypatch,
    ):
        db_session.add(
            ActivityParticipant(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                user_id=sample_user.id,
                participant_name=sample_user.name,
                enroll_status=1,
            )
        )
        post = CommunityPost(
            tenant_id=sample_user.tenant_id,
            activity_id=sample_activity.id,
            author_user_id=super_admin.id,
            title="敏感词测试",
            content="评论测试",
            status=1,
        )
        db_session.add(post)
        db_session.commit()
        db_session.refresh(post)

        monkeypatch.setattr("app.services.wechat_content_security.settings.WECHAT_CONTENT_SECURITY_ENABLED", True)
        monkeypatch.setattr(
            "app.api.v1.endpoints.community.check_text_security",
            lambda text: ContentSecurityResult(
                passed=False,
                hit_sensitive=True,
                reason="内容含敏感信息，已转人工审核",
            ),
        )

        create_res = client.post(
            f"/api/v1/community/posts/{post.id}/comments",
            headers=auth_headers(user_token),
            json={"content": "敏感评论"},
        )
        assert create_res.status_code == status.HTTP_200_OK
        assert create_res.json()["status"] == 0

        list_res = client.get(
            f"/api/v1/community/posts/{post.id}/comments",
            headers=auth_headers(user_token),
        )
        assert list_res.status_code == status.HTTP_200_OK
        assert list_res.json()["total"] == 0

        pending_res = client.get(
            "/api/v1/community/moderation/pending",
            headers=auth_headers(super_admin_token),
        )
        assert pending_res.status_code == status.HTTP_200_OK
        assert pending_res.json()["activity_comments"]["total"] >= 1


@pytest.mark.api
class TestCommunityMediaCallback:
    def test_callback_accepts_nested_result_suggest_and_sets_item_pass(
        self,
        client,
        db_session,
        sample_activity,
        super_admin,
        monkeypatch,
    ):
        post = CommunityPost(
            tenant_id=sample_activity.tenant_id,
            activity_id=sample_activity.id,
            author_user_id=super_admin.id,
            title="待图片回调",
            content="图片审核中",
            status=0,
        )
        db_session.add(post)
        db_session.flush()
        db_session.add(
            CommunityMediaModerationTask(
                tenant_id=sample_activity.tenant_id,
                item_type="activity_post",
                item_id=post.id,
                media_url="/uploads/community/posts/2026/05/a.jpg",
                trace_id="trace_nested_pass",
                status="pending",
            )
        )
        db_session.commit()

        monkeypatch.setattr("app.api.v1.endpoints.community.settings.WECHAT_MEDIA_CALLBACK_TOKEN", "cb-token")
        timestamp = "1711111111"
        nonce = "n123"
        signature = hashlib.sha1("".join(sorted(["cb-token", timestamp, nonce])).encode("utf-8")).hexdigest()
        callback_payload = {
            "result": {
                "trace_id": "trace_nested_pass",
                "suggest": "pass",
            }
        }
        response = client.post(
            f"/api/v1/community/moderation/wechat-media-callback?signature={signature}&timestamp={timestamp}&nonce={nonce}",
            json=callback_payload,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.text == "success"

        db_session.refresh(post)
        assert post.status == 1

    def test_callback_rejects_invalid_signature(self, client, monkeypatch):
        monkeypatch.setattr("app.api.v1.endpoints.community.settings.WECHAT_MEDIA_CALLBACK_TOKEN", "cb-token")
        response = client.post(
            "/api/v1/community/moderation/wechat-media-callback?signature=bad&timestamp=1&nonce=2",
            json={"trace_id": "any"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
