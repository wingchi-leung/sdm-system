from datetime import datetime
from typing import List, Optional

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
    cover_url: Optional[str] = Field(None, max_length=500)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return _normalize_required_text(value, "标题", 120)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return _normalize_required_text(value, "正文", 10000)

    @field_validator("cover_url")
    @classmethod
    def validate_cover_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = value.strip()
        return text or None


class CommunityCommentCreate(BaseModel):
    content: str = Field(..., max_length=1000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return _normalize_required_text(value, "评论内容", 1000)


class CommunityPostResponse(BaseModel):
    id: int
    activity_id: int
    author_user_id: int
    author_name: str
    title: str
    content: str
    cover_url: Optional[str] = None
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
    status: int
    create_time: datetime
    update_time: datetime


class CommunityCommentListResponse(BaseModel):
    items: List[CommunityCommentResponse]
    total: int
