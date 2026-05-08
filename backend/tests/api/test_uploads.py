"""
文件上传 API 测试
"""
from io import BytesIO

import pytest
from fastapi import status

from tests.conftest import auth_headers


@pytest.mark.api
class TestPosterUpload:
    """活动海报上传测试"""

    def test_upload_poster_accepts_octet_stream_from_wechat(
        self,
        client,
        super_admin_token,
    ):
        """测试兼容微信真机常见的 application/octet-stream。"""
        response = client.post(
            "/api/v1/uploads/poster",
            headers=auth_headers(super_admin_token),
            files={
                "file": ("poster.jpg", BytesIO(b"fake-image-bytes"), "application/octet-stream"),
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["url"].startswith("/uploads/posters/")
        assert data["filename"].endswith(".jpg")

    def test_upload_poster_rejects_invalid_extension(
        self,
        client,
        super_admin_token,
    ):
        """测试非法扩展名仍然被拒绝。"""
        response = client.post(
            "/api/v1/uploads/poster",
            headers=auth_headers(super_admin_token),
            files={
                "file": ("poster.gif", BytesIO(b"fake-image-bytes"), "application/octet-stream"),
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "扩展名" in response.json()["detail"]


@pytest.mark.api
class TestAvatarUpload:
    """用户头像上传测试"""

    def test_upload_avatar_accepts_octet_stream_from_wechat(
        self,
        client,
        user_token,
    ):
        response = client.post(
            "/api/v1/uploads/avatar",
            headers=auth_headers(user_token),
            files={
                "file": ("avatar.jpg", BytesIO(b"fake-avatar-bytes"), "application/octet-stream"),
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["url"].startswith("/uploads/avatars/")
        assert data["filename"].endswith(".jpg")
