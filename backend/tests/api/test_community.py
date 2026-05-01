import pytest
from fastapi import status

from app.schemas import ActivityParticipant, CommunityComment, CommunityPost
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
                phone=sample_user.phone,
                identity_number=sample_user.identity_number,
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
                phone=sample_user.phone,
                identity_number=sample_user.identity_number,
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

    def test_admin_cannot_comment(
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
            title="通知",
            content="管理员不允许评论",
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
                phone=sample_user.phone,
                identity_number=sample_user.identity_number,
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
