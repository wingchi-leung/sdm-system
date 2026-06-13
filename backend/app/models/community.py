from datetime import datetime
import re
from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator


def _normalize_required_text(value: str, field_name: str, max_length: int) -> str:
    text = (value or "").strip()
    if not text:
        raise ValueError(f"{field_name}不能为空")
    if len(text) > max_length:
        raise ValueError(f"{field_name}不能超过{max_length}个字符")
    return text


class CommunityPostCreate(BaseModel):
    activity_id: int = Field(..., ge=1)
    title: str = Field(..., max_length=120)
    content: str = Field(..., max_length=10000)
    images: List[str] = Field(default_factory=list, max_length=9)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return _normalize_required_text(value, "标题", 120)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return _normalize_required_text(value, "正文", 10000)

    @field_validator("images")
    @classmethod
    def validate_images(cls, value: List[str]) -> List[str]:
        if len(value) > 9:
            raise ValueError("图片数量不能超过9张")
        normalized: list[str] = []
        for item in value:
            text = (item or "").strip()
            if not text:
                continue
            if len(text) > 500:
                raise ValueError("图片地址长度不能超过500个字符")
            if not (
                text.startswith("/uploads/")
                or re.match(r"^https?://", text, flags=re.IGNORECASE)
            ):
                raise ValueError("图片地址格式不正确")
            normalized.append(text)
        return normalized


class CommunityCommentCreate(BaseModel):
    content: str = Field(..., max_length=1000)
    images: List[str] = Field(default_factory=list, max_length=9)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return _normalize_required_text(value, "评论内容", 1000)

    @field_validator("images")
    @classmethod
    def validate_comment_images(cls, value: List[str]) -> List[str]:
        if len(value) > 9:
            raise ValueError("评论图片数量不能超过9张")
        normalized: list[str] = []
        for item in value:
            text = (item or "").strip()
            if not text:
                continue
            if len(text) > 500:
                raise ValueError("评论图片地址长度不能超过500个字符")
            if not (
                text.startswith("/uploads/")
                or re.match(r"^https?://", text, flags=re.IGNORECASE)
            ):
                raise ValueError("评论图片地址格式不正确")
            normalized.append(text)
        return normalized


class CommunityPostResponse(BaseModel):
    id: int
    activity_id: Optional[int] = None
    channel_id: Optional[int] = None
    author_user_id: int
    author_name: str
    title: str
    content: str
    content_format: Optional[str] = None
    images: List[str] = Field(default_factory=list)
    status: int
    comment_count: int = 0
    create_time: datetime
    update_time: datetime


class CommunityPostListResponse(BaseModel):
    items: List[CommunityPostResponse]
    total: int


class CommunityCommentResponse(BaseModel):
    id: int
    activity_id: int
    post_id: int
    user_id: int
    user_name: str
    content: str
    images: List[str] = Field(default_factory=list)
    status: int
    create_time: datetime
    update_time: datetime


class CommunityCommentListResponse(BaseModel):
    items: List[CommunityCommentResponse]
    total: int


class CommunityModerationActionRequest(BaseModel):
    action: str = Field(..., description="审核动作：approve/reject")

    @field_validator("action")
    @classmethod
    def validate_action(cls, value: str) -> str:
        normalized = (value or "").strip().lower()
        if normalized not in {"approve", "reject"}:
            raise ValueError("action 仅支持 approve 或 reject")
        return normalized


class CommunityChannelCreate(BaseModel):
    name: str = Field(..., max_length=64)
    description: Optional[str] = Field(None, max_length=500)
    avatar_url: Optional[str] = Field(None, max_length=500)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _normalize_required_text(value, "频道名称", 64)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = value.strip()
        if not text:
            return None
        if len(text) > 500:
            raise ValueError("频道描述不能超过500个字符")
        return text

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = value.strip()
        return text or None


class CommunityChannelResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    admin_user_id: int
    member_count: int = 0
    role: str = "member"
    create_time: datetime
    update_time: datetime


class CommunityChannelListResponse(BaseModel):
    items: List[CommunityChannelResponse]
    total: int


class CommunityChannelMemberResponse(BaseModel):
    id: int
    channel_id: int
    user_id: int
    user_name: str
    user_avatar_url: Optional[str] = None
    user_update_time: Optional[datetime] = None
    role: str
    status: str
    joined_at: Optional[datetime] = None
    create_time: datetime
    update_time: datetime


class CommunityChannelMemberListResponse(BaseModel):
    items: List[CommunityChannelMemberResponse]
    total: int


class CommunityChannelInviteRequest(BaseModel):
    user_ids: List[int] = Field(..., min_length=1, max_length=100)

    @field_validator("user_ids")
    @classmethod
    def validate_user_ids(cls, value: List[int]) -> List[int]:
        cleaned: list[int] = []
        for user_id in value:
            if user_id <= 0:
                raise ValueError("用户ID必须大于0")
            if user_id not in cleaned:
                cleaned.append(user_id)
        if not cleaned:
            raise ValueError("至少选择一个用户")
        return cleaned


class CommunityNotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    content: Optional[str] = None
    data: dict[str, Any] = Field(default_factory=dict)
    is_read: int
    create_time: datetime


class CommunityNotificationListResponse(BaseModel):
    items: List[CommunityNotificationResponse]
    total: int


class CommunityChannelPostCreate(BaseModel):
    title: str = Field(..., max_length=120)
    content: str = Field(..., max_length=10000)
    # content_format:Phase 2 新增,默认 'html'(A 方案主存 HTML)
    content_format: Optional[str] = "html"
    images: List[str] = Field(default_factory=list, max_length=9)
    is_official: int = Field(0, ge=0, le=1)

    @field_validator("title")
    @classmethod
    def validate_title_required(cls, value: str) -> str:
        return _normalize_required_text(value, "标题", 120)

    @field_validator("content")
    @classmethod
    def validate_post_content(cls, value: str) -> str:
        return _normalize_required_text(value, "正文", 10000)

    @field_validator("images")
    @classmethod
    def validate_post_images(cls, value: List[str]) -> List[str]:
        return CommunityPostCreate.validate_images(value)


class CommunityChannelPostResponse(BaseModel):
    id: int
    channel_id: int
    author_user_id: int
    author_name: str
    author_avatar_url: Optional[str] = None
    author_update_time: Optional[datetime] = None
    title: str
    content: str
    # content_format:Phase 2 新增,响应体透传
    content_format: Optional[str] = None
    images: List[str] = Field(default_factory=list)
    is_official: int = 0
    is_pinned: int = 0
    status: int
    comment_count: int = 0
    preview_comments: List["CommunityChannelCommentResponse"] = Field(default_factory=list)
    create_time: datetime
    update_time: datetime


class CommunityChannelPostListResponse(BaseModel):
    items: List[CommunityChannelPostResponse]
    total: int


class CommunityChannelCommentCreate(BaseModel):
    content: str = Field(..., max_length=1000)
    images: List[str] = Field(default_factory=list, max_length=9)

    @field_validator("content")
    @classmethod
    def validate_channel_comment_content(cls, value: str) -> str:
        return _normalize_required_text(value, "评论内容", 1000)

    @field_validator("images")
    @classmethod
    def validate_channel_comment_images(cls, value: List[str]) -> List[str]:
        return CommunityCommentCreate.validate_comment_images(value)


class CommunityChannelCommentResponse(BaseModel):
    id: int
    channel_id: int
    post_id: int
    user_id: int
    user_name: str
    user_avatar_url: Optional[str] = None
    user_update_time: Optional[datetime] = None
    content: str
    images: List[str] = Field(default_factory=list)
    status: int
    create_time: datetime
    update_time: datetime


class CommunityChannelCommentListResponse(BaseModel):
    items: List[CommunityChannelCommentResponse]
    total: int


class CommunityModerationQueueResponse(BaseModel):
    activity_posts: CommunityPostListResponse
    activity_comments: CommunityCommentListResponse
    channel_posts: CommunityChannelPostListResponse
    channel_comments: CommunityChannelCommentListResponse
