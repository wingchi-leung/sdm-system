"""
文件上传 API 测试
"""
from io import BytesIO
from datetime import datetime

import pytest
from fastapi import status
from PIL import Image

from tests.conftest import auth_headers


def _make_png_bytes(size: tuple[int, int] = (1600, 1600)) -> bytes:
    buffer = BytesIO()
    Image.new("RGBA", size, (42, 128, 196, 255)).save(buffer, format="PNG")
    return buffer.getvalue()


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

    def test_upload_avatar_optimizes_large_image(
        self,
        client,
        user_token,
    ):
        original = _make_png_bytes()

        response = client.post(
            "/api/v1/uploads/avatar",
            headers=auth_headers(user_token),
            files={
                "file": ("avatar.png", BytesIO(original), "image/png"),
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["url"].startswith("/uploads/avatars/")
        assert data["filename"].endswith(".jpg")
        assert data["size"] < len(original)

    def test_uploaded_files_use_long_cache_headers(
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

        static_response = client.get(response.json()["url"])

        assert static_response.status_code == status.HTTP_200_OK
        assert static_response.headers["cache-control"] == "public, max-age=31536000, immutable"


@pytest.mark.api
class TestCommunityImageUpload:
    """社区图片上传测试"""

    def test_upload_community_image_success(
        self,
        client,
        user_token,
    ):
        response = client.post(
            "/api/v1/uploads/community-image",
            headers=auth_headers(user_token),
            files={
                "file": ("community.jpg", BytesIO(b"fake-image-bytes"), "application/octet-stream"),
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["url"].startswith("/uploads/community/posts/")
        assert data["filename"].endswith(".jpg")

        now = datetime.now()
        assert f"/{now.strftime('%Y')}/{now.strftime('%m')}/" in data["url"]
