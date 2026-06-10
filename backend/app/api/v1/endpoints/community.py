import json
import hashlib
import logging
import os
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.api import deps
from app.api.v1.endpoints.uploads import _optimize_avatar_image, _safe_image_extension
from app.core.config import settings
from app.crud import (
    crud_activity,
    crud_community_channel,
    crud_community_comment,
    crud_community_moderation,
    crud_community_post,
    crud_participant,
)
from app.models.community import (
    CommunityChannelCreate,
    CommunityChannelInviteRequest,
    CommunityChannelCommentCreate,
    CommunityChannelCommentListResponse,
    CommunityChannelCommentResponse,
    CommunityChannelPostCreate,
    CommunityChannelPostListResponse,
    CommunityChannelPostResponse,
    CommunityChannelListResponse,
    CommunityChannelMemberListResponse,
    CommunityModerationActionRequest,
    CommunityModerationQueueResponse,
    CommunityChannelResponse,
    CommunityCommentCreate,
    CommunityCommentListResponse,
    CommunityCommentResponse,
    CommunityNotificationListResponse,
    CommunityPostCreate,
    CommunityPostListResponse,
    CommunityPostResponse,
)
from app.services.wechat_content_security import check_text_security, submit_media_check_async
from app.storage import get_storage
from app.schemas import CommunityChannel

router = APIRouter()
logger = logging.getLogger(__name__)

# 频道头像上传白名单 mime（jpg/png/webp 全部允许，但保持 mime 严格）
CHANNEL_AVATAR_ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
# 复用 uploads.py 公开的 storage 单例
storage = get_storage()


def _ensure_channel_exists(db: Session, *, channel_id: int, tenant_id: int):
    channel = crud_community_channel.get_channel_by_id(db, channel_id=channel_id, tenant_id=tenant_id)
    if not channel:
        raise HTTPException(status_code=404, detail="频道不存在")
    return channel


def _ensure_channel_member(
    db: Session,
    *,
    channel_id: int,
    tenant_id: int,
    user_id: int,
):
    member = crud_community_channel.get_user_member_record(
        db,
        channel_id=channel_id,
        tenant_id=tenant_id,
        user_id=user_id,
    )
    if not member or member.status not in {"active", "banned"}:
        raise HTTPException(status_code=403, detail="无权限访问该频道")
    return member


def _ensure_channel_admin(
    db: Session,
    *,
    channel_id: int,
    tenant_id: int,
    user_id: int,
):
    member = _ensure_channel_member(
        db,
        channel_id=channel_id,
        tenant_id=tenant_id,
        user_id=user_id,
    )
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="仅频道管理员可执行该操作")
    return member


def _ensure_tenant_admin(ctx: deps.AuthContext) -> None:
    if ctx.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可执行该操作")


def _ensure_channel_can_publish(
    db: Session,
    *,
    channel_id: int,
    tenant_id: int,
    user_id: int,
):
    member = _ensure_channel_member(
        db,
        channel_id=channel_id,
        tenant_id=tenant_id,
        user_id=user_id,
    )
    if member.status == "banned":
        raise HTTPException(status_code=403, detail="你已被禁言，暂不可发布")
    return member


def _ensure_activity_exists(db: Session, *, activity_id: int, tenant_id: int):
    activity = crud_activity.get_activity(db, activity_id, tenant_id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")
    return activity


def _ensure_post_exists(db: Session, *, post_id: int, tenant_id: int) -> dict:
    post = crud_community_post.get_post_detail(db, post_id=post_id, tenant_id=tenant_id)
    if not post:
        raise HTTPException(status_code=404, detail="文章不存在")
    return post


def _ensure_can_read_activity_community(
    db: Session,
    *,
    ctx: deps.AuthContext,
    activity_id: int,
) -> None:
    activity = _ensure_activity_exists(db, activity_id=activity_id, tenant_id=ctx.tenant_id)

    # 管理能力（活动级 / 活动类型级 / 全局）可直接查看
    if deps.has_activity_permission(db, ctx, activity_id, "participant.view"):
        return

    if deps.has_activity_permission(db, ctx, activity_id, "activity.edit"):
        return

    # 用户能力：已报名同样可查看（兼容“用户+管理员”混合身份）
    if not crud_participant.has_user_joined_activity(
        db,
        activity_id=activity_id,
        user_id=ctx.user_id,
        tenant_id=ctx.tenant_id,
    ):
        raise HTTPException(status_code=403, detail="报名后才可查看活动社区内容")


def _ensure_can_publish_post(
    db: Session,
    *,
    ctx: deps.AuthContext,
    activity_id: int,
) -> None:
    _ensure_activity_exists(db, activity_id=activity_id, tenant_id=ctx.tenant_id)
    if not deps.has_activity_permission(db, ctx, activity_id, "activity.edit"):
        raise HTTPException(status_code=403, detail="无权限在该活动下发布文章")


def _should_bypass_security_check(
    db: Session,
    *,
    ctx: deps.AuthContext,
    channel_member_role: str | None = None,
) -> bool:
    if channel_member_role == "admin":
        return True
    return ctx.has_any_role(db)


def _resolve_review_status(
    *,
    text: str,
    bypass: bool,
) -> tuple[int, str]:
    if bypass:
        return 1, "管理员内容免审"

    check_result = check_text_security(text)
    if check_result.passed:
        return 1, "微信审核通过"
    return 0, check_result.reason


def _submit_image_tasks(
    db: Session,
    *,
    tenant_id: int,
    item_type: str,
    item_id: int,
    images: list[str],
) -> None:
    for image_url in images:
        submit_result = submit_media_check_async(image_url)
        crud_community_moderation.create_media_task(
            db,
            tenant_id=tenant_id,
            item_type=item_type,
            item_id=item_id,
            media_url=image_url,
            trace_id=submit_result.trace_id,
            status="pending" if submit_result.accepted else "failed_submit",
            reason=submit_result.reason,
        )


def _update_item_status(
    db: Session,
    *,
    tenant_id: int,
    item_type: str,
    item_id: int,
    status: int,
) -> None:
    if item_type == "activity_post":
        crud_community_post.update_post_status(db, post_id=item_id, tenant_id=tenant_id, status=status)
    elif item_type == "activity_comment":
        crud_community_comment.update_comment_status(db, comment_id=item_id, tenant_id=tenant_id, status=status)
    elif item_type == "channel_post":
        crud_community_channel.update_channel_post_status(db, post_id=item_id, tenant_id=tenant_id, status=status)
    elif item_type == "channel_comment":
        crud_community_channel.update_channel_comment_status(db, comment_id=item_id, tenant_id=tenant_id, status=status)
    elif item_type == "channel_avatar":
        # 频道头像审核：通过→1，拒绝→-1
        channel = db.query(CommunityChannel).filter(
            CommunityChannel.tenant_id == tenant_id,
            CommunityChannel.id == item_id,
        ).first()
        if channel is not None:
            channel.status = status
            db.commit()


def _evaluate_and_finalize_item(db: Session, *, tenant_id: int, item_type: str, item_id: int) -> None:
    tasks = crud_community_moderation.list_media_tasks_by_item(
        db,
        tenant_id=tenant_id,
        item_type=item_type,
        item_id=item_id,
    )
    if not tasks:
        return
    statuses = {task.status for task in tasks}
    if "risky" in statuses or "failed_submit" in statuses:
        _update_item_status(db, tenant_id=tenant_id, item_type=item_type, item_id=item_id, status=0)
        return
    if all(status == "pass" for status in statuses):
        _update_item_status(db, tenant_id=tenant_id, item_type=item_type, item_id=item_id, status=1)


def _verify_wechat_media_callback_signature(request: Request) -> None:
    token = (settings.WECHAT_MEDIA_CALLBACK_TOKEN or "").strip()
    if not token:
        raise HTTPException(status_code=503, detail="未配置 WECHAT_MEDIA_CALLBACK_TOKEN")

    signature = (request.query_params.get("signature") or "").strip()
    timestamp = (request.query_params.get("timestamp") or "").strip()
    nonce = (request.query_params.get("nonce") or "").strip()
    if not signature or not timestamp or not nonce:
        raise HTTPException(status_code=401, detail="微信回调签名参数缺失")

    expected = hashlib.sha1("".join(sorted([token, timestamp, nonce])).encode("utf-8")).hexdigest()
    if expected != signature:
        raise HTTPException(status_code=401, detail="微信回调签名校验失败")


@router.get("/posts", response_model=CommunityPostListResponse)
def list_activity_posts(
    activity_id: int = Query(..., ge=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    """获取活动下的社区文章列表。"""
    _ensure_can_read_activity_community(db, ctx=ctx, activity_id=activity_id)
    items, total = crud_community_post.get_posts_by_activity(
        db,
        activity_id=activity_id,
        tenant_id=ctx.tenant_id,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total}


@router.get("/posts/{post_id}", response_model=CommunityPostResponse)
def get_post_detail(
    post_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    """获取社区文章详情。"""
    post = _ensure_post_exists(db, post_id=post_id, tenant_id=ctx.tenant_id)
    _ensure_can_read_activity_community(db, ctx=ctx, activity_id=post["activity_id"])
    return post


@router.post("/posts", response_model=CommunityPostResponse)
def create_post(
    body: CommunityPostCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_admin),
):
    """在活动下发布社区文章。"""
    _ensure_can_publish_post(db, ctx=ctx, activity_id=body.activity_id)
    combined_text = f"{body.title}\n{body.content}"
    post_status, _ = _resolve_review_status(
        text=combined_text,
        bypass=_should_bypass_security_check(db, ctx=ctx),
    )
    post = crud_community_post.create_post(
        db,
        body=body,
        tenant_id=ctx.tenant_id,
        author_user_id=ctx.user_id,
        status=post_status,
    )
    if (
        post_status == 1
        and settings.WECHAT_CONTENT_SECURITY_ENABLED
        and body.images
        and not _should_bypass_security_check(db, ctx=ctx)
    ):
        crud_community_post.update_post_status(db, post_id=post.id, tenant_id=ctx.tenant_id, status=0)
        _submit_image_tasks(
            db,
            tenant_id=ctx.tenant_id,
            item_type="activity_post",
            item_id=post.id,
            images=body.images,
        )
    detail = crud_community_post.get_post_detail(
        db,
        post_id=post.id,
        tenant_id=ctx.tenant_id,
        include_non_public=True,
    )
    if not detail:
        raise HTTPException(status_code=500, detail="文章创建成功但读取失败")
    return detail


@router.get("/posts/{post_id}/comments", response_model=CommunityCommentListResponse)
def list_post_comments(
    post_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    """获取文章评论列表。"""
    post = _ensure_post_exists(db, post_id=post_id, tenant_id=ctx.tenant_id)
    _ensure_can_read_activity_community(db, ctx=ctx, activity_id=post["activity_id"])
    items, total = crud_community_comment.get_comments_by_post(
        db,
        post_id=post_id,
        tenant_id=ctx.tenant_id,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total}


@router.post("/posts/{post_id}/comments", response_model=CommunityCommentResponse)
def create_comment(
    post_id: int,
    body: CommunityCommentCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    """发表评论，仅限已报名学员。"""
    post = _ensure_post_exists(db, post_id=post_id, tenant_id=ctx.tenant_id)
    _ensure_can_read_activity_community(db, ctx=ctx, activity_id=post["activity_id"])
    comment_status, _ = _resolve_review_status(
        text=body.content,
        bypass=_should_bypass_security_check(db, ctx=ctx),
    )
    comment = crud_community_comment.create_comment(
        db,
        body=body,
        tenant_id=ctx.tenant_id,
        activity_id=post["activity_id"],
        post_id=post_id,
        user_id=ctx.user_id,
        status=comment_status,
    )
    if (
        comment_status == 1
        and settings.WECHAT_CONTENT_SECURITY_ENABLED
        and body.images
        and not _should_bypass_security_check(db, ctx=ctx)
    ):
        crud_community_comment.update_comment_status(db, comment_id=comment.id, tenant_id=ctx.tenant_id, status=0)
        _submit_image_tasks(
            db,
            tenant_id=ctx.tenant_id,
            item_type="activity_comment",
            item_id=comment.id,
            images=body.images,
        )
    detail = crud_community_comment.get_comment_detail(
        db,
        comment_id=comment.id,
        tenant_id=ctx.tenant_id,
        include_non_public=True,
    )
    if not detail:
        raise HTTPException(status_code=500, detail="评论创建成功但读取失败")
    return detail


@router.get("/channels", response_model=CommunityChannelListResponse)
def list_channels(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    items, total = crud_community_channel.list_user_channels(
        db,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total}


@router.post("/channels", response_model=CommunityChannelResponse)
def create_channel(
    body: CommunityChannelCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_tenant_admin(ctx)
    channel = crud_community_channel.create_channel(
        db,
        tenant_id=ctx.tenant_id,
        admin_user_id=ctx.user_id,
        body=body,
    )

    # 若提供了头像 URL 且内容安全检查已启用，提交图片审核任务
    # 审核通过回调后才将 channel.status 设为 1；当前设为 0(待审核)
    if body.avatar_url and settings.WECHAT_CONTENT_SECURITY_ENABLED:
        channel.status = 0
        db.commit()
        _submit_image_tasks(
            db,
            tenant_id=ctx.tenant_id,
            item_type="channel_avatar",
            item_id=channel.id,
            images=[body.avatar_url],
        )

    items, _ = crud_community_channel.list_user_channels(
        db,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        skip=0,
        limit=1,
    )
    if items:
        return items[0]
    return {
        "id": channel.id,
        "tenant_id": channel.tenant_id,
        "name": channel.name,
        "description": channel.description,
        "avatar_url": channel.avatar_url,
        "admin_user_id": channel.admin_user_id,
        "member_count": 1,
        "role": "admin",
        "create_time": channel.create_time,
        "update_time": channel.update_time,
    }


@router.get("/channels/{channel_id}", response_model=CommunityChannelResponse)
def get_channel_detail(
    channel_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_member(
        db,
        channel_id=channel_id,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
    )
    channel = _ensure_channel_exists(db, channel_id=channel_id, tenant_id=ctx.tenant_id)
    members, _ = crud_community_channel.list_channel_members(
        db,
        tenant_id=ctx.tenant_id,
        channel_id=channel_id,
        skip=0,
        limit=1000,
    )
    me = next((item for item in members if item["user_id"] == ctx.user_id), None)
    return {
        "id": channel.id,
        "tenant_id": channel.tenant_id,
        "name": channel.name,
        "description": channel.description,
        "avatar_url": channel.avatar_url,
        "admin_user_id": channel.admin_user_id,
        "member_count": len(members),
        "role": me["role"] if me else "member",
        "create_time": channel.create_time,
        "update_time": channel.update_time,
    }


@router.get("/channels/{channel_id}/members", response_model=CommunityChannelMemberListResponse)
def list_channel_members(
    channel_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_member(
        db,
        channel_id=channel_id,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
    )
    items, total = crud_community_channel.list_channel_members(
        db,
        tenant_id=ctx.tenant_id,
        channel_id=channel_id,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total}


@router.post("/channels/{channel_id}/invite")
def invite_channel_members(
    channel_id: int,
    body: CommunityChannelInviteRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_exists(db, channel_id=channel_id, tenant_id=ctx.tenant_id)
    _ensure_tenant_admin(ctx)
    _ensure_channel_admin(
        db,
        channel_id=channel_id,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
    )
    invited_count = crud_community_channel.invite_members(
        db,
        tenant_id=ctx.tenant_id,
        channel_id=channel_id,
        inviter_user_id=ctx.user_id,
        user_ids=body.user_ids,
    )
    return {"success": True, "invited_count": invited_count}


@router.get("/notifications", response_model=CommunityNotificationListResponse)
def list_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    items, total = crud_community_channel.list_notifications(
        db,
        tenant_id=ctx.tenant_id,
        recipient_user_id=ctx.user_id,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total}


@router.post("/invites/{notification_id}/accept")
def accept_invite(
    notification_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    notification = crud_community_channel.get_notification_by_id(
        db,
        notification_id=notification_id,
        tenant_id=ctx.tenant_id,
        recipient_user_id=ctx.user_id,
    )
    if not notification:
        raise HTTPException(status_code=404, detail="邀请通知不存在")
    crud_community_channel.accept_invite(
        db,
        notification=notification,
        user_id=ctx.user_id,
        tenant_id=ctx.tenant_id,
    )
    return {"success": True}


@router.post("/invites/{notification_id}/reject")
def reject_invite(
    notification_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    notification = crud_community_channel.get_notification_by_id(
        db,
        notification_id=notification_id,
        tenant_id=ctx.tenant_id,
        recipient_user_id=ctx.user_id,
    )
    if not notification:
        raise HTTPException(status_code=404, detail="邀请通知不存在")
    crud_community_channel.reject_invite(db, notification=notification)
    return {"success": True}


@router.post("/channels/{channel_id}/members/{user_id}/kick")
def kick_channel_member(
    channel_id: int,
    user_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_exists(db, channel_id=channel_id, tenant_id=ctx.tenant_id)
    _ensure_channel_admin(db, channel_id=channel_id, tenant_id=ctx.tenant_id, user_id=ctx.user_id)
    if user_id == ctx.user_id:
        raise HTTPException(status_code=400, detail="不能踢出自己")
    success = crud_community_channel.update_member_status(
        db,
        tenant_id=ctx.tenant_id,
        channel_id=channel_id,
        user_id=user_id,
        status="kicked",
    )
    if not success:
        raise HTTPException(status_code=404, detail="成员不存在")
    return {"success": True}


@router.post("/channels/{channel_id}/members/{user_id}/ban")
def ban_channel_member(
    channel_id: int,
    user_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_exists(db, channel_id=channel_id, tenant_id=ctx.tenant_id)
    _ensure_channel_admin(db, channel_id=channel_id, tenant_id=ctx.tenant_id, user_id=ctx.user_id)
    success = crud_community_channel.update_member_status(
        db,
        tenant_id=ctx.tenant_id,
        channel_id=channel_id,
        user_id=user_id,
        status="banned",
    )
    if not success:
        raise HTTPException(status_code=404, detail="成员不存在")
    return {"success": True}


@router.post("/channels/{channel_id}/members/{user_id}/unban")
def unban_channel_member(
    channel_id: int,
    user_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_exists(db, channel_id=channel_id, tenant_id=ctx.tenant_id)
    _ensure_channel_admin(db, channel_id=channel_id, tenant_id=ctx.tenant_id, user_id=ctx.user_id)
    success = crud_community_channel.update_member_status(
        db,
        tenant_id=ctx.tenant_id,
        channel_id=channel_id,
        user_id=user_id,
        status="active",
    )
    if not success:
        raise HTTPException(status_code=404, detail="成员不存在")
    return {"success": True}


@router.post("/channels/{channel_id}/invite-code")
def generate_channel_invite_code(
    channel_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    raise HTTPException(status_code=410, detail="邀请码加入功能已关闭")


@router.post("/channels/join-by-code")
def join_channel_by_code(
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    raise HTTPException(status_code=410, detail="邀请码加入功能已关闭")


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    success = crud_community_channel.mark_notification_read(
        db,
        notification_id=notification_id,
        tenant_id=ctx.tenant_id,
        recipient_user_id=ctx.user_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="通知不存在")
    return {"success": True}


@router.post("/notifications/read-all")
def mark_notifications_read_all(
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    updated_count = crud_community_channel.mark_notifications_read_all(
        db,
        tenant_id=ctx.tenant_id,
        recipient_user_id=ctx.user_id,
    )
    return {"success": True, "updated_count": updated_count}


@router.get("/notifications/unread-count")
def get_notifications_unread_count(
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    unread_count = crud_community_channel.get_unread_count(
        db,
        tenant_id=ctx.tenant_id,
        recipient_user_id=ctx.user_id,
    )
    return {"unread_count": unread_count}


@router.get("/channels/{channel_id}/posts", response_model=CommunityChannelPostListResponse)
def list_channel_posts(
    channel_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_member(db, channel_id=channel_id, tenant_id=ctx.tenant_id, user_id=ctx.user_id)
    items, total = crud_community_channel.list_channel_posts(
        db,
        tenant_id=ctx.tenant_id,
        channel_id=channel_id,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total}


@router.post("/channels/{channel_id}/posts", response_model=CommunityChannelPostResponse)
def create_channel_post(
    channel_id: int,
    body: CommunityChannelPostCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_exists(db, channel_id=channel_id, tenant_id=ctx.tenant_id)
    member = _ensure_channel_can_publish(
        db,
        channel_id=channel_id,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
    )
    is_official = body.is_official if member.role == "admin" else 0
    channel_post_status, _ = _resolve_review_status(
        text=f"{body.title}\n{body.content}",
        bypass=_should_bypass_security_check(db, ctx=ctx, channel_member_role=member.role),
    )
    post = crud_community_channel.create_channel_post(
        db,
        tenant_id=ctx.tenant_id,
        channel_id=channel_id,
        author_user_id=ctx.user_id,
        title=body.title,
        content=body.content,
        images=body.images,
        is_official=is_official,
        status=channel_post_status,
    )
    if (
        channel_post_status == 1
        and settings.WECHAT_CONTENT_SECURITY_ENABLED
        and body.images
        and not _should_bypass_security_check(db, ctx=ctx, channel_member_role=member.role)
    ):
        crud_community_channel.update_channel_post_status(
            db, tenant_id=ctx.tenant_id, post_id=post.id, status=0
        )
        _submit_image_tasks(
            db,
            tenant_id=ctx.tenant_id,
            item_type="channel_post",
            item_id=post.id,
            images=body.images,
        )
    detail = crud_community_channel.get_channel_post_detail(
        db,
        tenant_id=ctx.tenant_id,
        post_id=post.id,
        include_non_public=True,
    )
    if not detail:
        raise HTTPException(status_code=500, detail="动态创建成功但读取失败")
    return detail


@router.get("/channels/{channel_id}/posts/{post_id}", response_model=CommunityChannelPostResponse)
def get_channel_post_detail(
    channel_id: int,
    post_id: int,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_member(db, channel_id=channel_id, tenant_id=ctx.tenant_id, user_id=ctx.user_id)
    detail = crud_community_channel.get_channel_post_detail(db, tenant_id=ctx.tenant_id, post_id=post_id)
    if not detail or detail["channel_id"] != channel_id:
        raise HTTPException(status_code=404, detail="动态不存在")
    return detail


@router.get("/channels/{channel_id}/posts/{post_id}/comments", response_model=CommunityChannelCommentListResponse)
def list_channel_comments(
    channel_id: int,
    post_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_member(db, channel_id=channel_id, tenant_id=ctx.tenant_id, user_id=ctx.user_id)
    post = crud_community_channel.get_channel_post_detail(db, tenant_id=ctx.tenant_id, post_id=post_id)
    if not post or post["channel_id"] != channel_id:
        raise HTTPException(status_code=404, detail="动态不存在")
    items, total = crud_community_channel.list_channel_comments(
        db,
        tenant_id=ctx.tenant_id,
        post_id=post_id,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total}


@router.post("/channels/{channel_id}/posts/{post_id}/comments", response_model=CommunityChannelCommentResponse)
def create_channel_comment(
    channel_id: int,
    post_id: int,
    body: CommunityChannelCommentCreate,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    _ensure_channel_exists(db, channel_id=channel_id, tenant_id=ctx.tenant_id)
    _ensure_channel_can_publish(db, channel_id=channel_id, tenant_id=ctx.tenant_id, user_id=ctx.user_id)
    post = crud_community_channel.get_channel_post_detail(db, tenant_id=ctx.tenant_id, post_id=post_id)
    if not post or post["channel_id"] != channel_id:
        raise HTTPException(status_code=404, detail="动态不存在")
    channel_comment_status, _ = _resolve_review_status(
        text=body.content,
        bypass=_should_bypass_security_check(db, ctx=ctx),
    )
    comment = crud_community_channel.create_channel_comment(
        db,
        tenant_id=ctx.tenant_id,
        channel_id=channel_id,
        post_id=post_id,
        user_id=ctx.user_id,
        content=body.content,
        images=body.images,
        status=channel_comment_status,
    )
    if (
        channel_comment_status == 1
        and settings.WECHAT_CONTENT_SECURITY_ENABLED
        and body.images
        and not _should_bypass_security_check(db, ctx=ctx)
    ):
        crud_community_channel.update_channel_comment_status(
            db, tenant_id=ctx.tenant_id, comment_id=comment.id, status=0
        )
        _submit_image_tasks(
            db,
            tenant_id=ctx.tenant_id,
            item_type="channel_comment",
            item_id=comment.id,
            images=body.images,
        )
    detail = crud_community_channel.get_channel_comment_detail(
        db,
        tenant_id=ctx.tenant_id,
        comment_id=comment.id,
        include_non_public=True,
    )
    if not detail:
        raise HTTPException(status_code=500, detail="评论创建成功但读取失败")
    return detail


@router.get("/moderation/pending", response_model=CommunityModerationQueueResponse)
def list_pending_moderation_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_admin),
):
    post_items, post_total = crud_community_post.list_pending_posts(
        db,
        tenant_id=ctx.tenant_id,
        skip=skip,
        limit=limit,
    )
    comment_items, comment_total = crud_community_comment.list_pending_comments(
        db,
        tenant_id=ctx.tenant_id,
        skip=skip,
        limit=limit,
    )
    channel_post_items, channel_post_total = crud_community_channel.list_pending_channel_posts(
        db,
        tenant_id=ctx.tenant_id,
        skip=skip,
        limit=limit,
    )
    channel_comment_items, channel_comment_total = crud_community_channel.list_pending_channel_comments(
        db,
        tenant_id=ctx.tenant_id,
        skip=skip,
        limit=limit,
    )
    return {
        "activity_posts": {"items": post_items, "total": post_total},
        "activity_comments": {"items": comment_items, "total": comment_total},
        "channel_posts": {"items": channel_post_items, "total": channel_post_total},
        "channel_comments": {"items": channel_comment_items, "total": channel_comment_total},
    }


@router.post("/moderation/{item_type}/{item_id}")
def review_moderation_item(
    item_type: str,
    item_id: int,
    body: CommunityModerationActionRequest,
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_admin),
):
    status_to_update = 1 if body.action == "approve" else -1
    normalized_type = (item_type or "").strip().lower()

    if normalized_type == "activity_post":
        ok = crud_community_post.update_post_status(
            db, post_id=item_id, tenant_id=ctx.tenant_id, status=status_to_update
        )
    elif normalized_type == "activity_comment":
        ok = crud_community_comment.update_comment_status(
            db, comment_id=item_id, tenant_id=ctx.tenant_id, status=status_to_update
        )
    elif normalized_type == "channel_post":
        ok = crud_community_channel.update_channel_post_status(
            db, post_id=item_id, tenant_id=ctx.tenant_id, status=status_to_update
        )
    elif normalized_type == "channel_comment":
        ok = crud_community_channel.update_channel_comment_status(
            db, comment_id=item_id, tenant_id=ctx.tenant_id, status=status_to_update
        )
    else:
        raise HTTPException(status_code=400, detail="不支持的审核类型")

    if not ok:
        raise HTTPException(status_code=404, detail="待审核内容不存在")
    return {"success": True, "item_type": normalized_type, "item_id": item_id, "status": status_to_update}


@router.post("/moderation/wechat-media-callback")
async def handle_wechat_media_callback(
    request: Request,
    db: Session = Depends(deps.get_db),
):
    _verify_wechat_media_callback_signature(request)

    raw = await request.body()
    payload: dict = {}
    if raw:
        text = raw.decode("utf-8", errors="ignore").strip()
        if text.startswith("<"):
            try:
                root = ET.fromstring(text)
                payload = {child.tag: child.text for child in root}
            except ET.ParseError:
                payload = {}
        else:
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                payload = {}

    result_obj = payload.get("result")
    if isinstance(result_obj, str):
        try:
            result_obj = json.loads(result_obj)
        except json.JSONDecodeError:
            result_obj = {}
    if not isinstance(result_obj, dict):
        result_obj = {}

    trace_id = str(
        payload.get("trace_id")
        or payload.get("TraceId")
        or result_obj.get("trace_id")
        or result_obj.get("TraceId")
        or ""
    )
    if not trace_id:
        return PlainTextResponse("success")

    task = crud_community_moderation.get_media_task_by_trace_id_global(db, trace_id=trace_id)
    if not task:
        return PlainTextResponse("success")

    suggest = str(
        result_obj.get("suggest")
        or result_obj.get("Suggest")
        or payload.get("suggest")
        or payload.get("Suggest")
        or ""
    ).lower()
    errcode = int(
        payload.get("errcode")
        or payload.get("ErrCode")
        or result_obj.get("errcode")
        or result_obj.get("ErrCode")
        or 0
    )
    if errcode == 0 and suggest == "pass":
        crud_community_moderation.update_media_task_result(
            db,
            task=task,
            status="pass",
            reason="微信图片审核通过",
        )
    else:
        crud_community_moderation.update_media_task_result(
            db,
            task=task,
            status="risky",
            reason="微信图片审核未通过",
        )

    _evaluate_and_finalize_item(
        db,
        tenant_id=task.tenant_id,
        item_type=task.item_type,
        item_id=task.item_id,
    )
    return PlainTextResponse("success")


@router.post("/channels/avatar-upload")
async def upload_channel_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    ctx: deps.AuthContext = Depends(deps.get_current_user),
):
    """上传频道头像图片（管理员专用）。

    - 仅支持 JPEG、PNG、WebP 格式
    - 最大 5MB，自动压缩至 512×512
    - 返回可用的 avatar_url，再传给 POST /channels 创建频道
    """
    _ensure_tenant_admin(ctx)

    # 验证文件格式（mime + 扩展名双重校验）
    content_type = (file.content_type or "").strip().lower()
    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    allowed_exts = {".jpg", ".jpeg", ".png", ".webp"}

    if content_type not in allowed_types and ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="仅支持 JPEG、PNG、WebP 格式图片")

    # 读取并检查大小（5MB）
    content = await file.read()
    max_size = 5 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="文件过大，最大允许 5MB")

    # 压缩至头像尺寸（复用 uploads.py 的 _optimize_avatar_image）
    optimized, final_ext = _optimize_avatar_image(content)

    # 上传到存储服务
    from app.storage import get_storage
    folder = f"channel-avatars/{datetime.now().strftime('%Y/%m')}"
    filename = f"{uuid.uuid4().hex}{final_ext}"

    try:
        storage = get_storage()
        file_url = await storage.upload(optimized, filename, folder=folder)
        if settings.STORAGE_TYPE == "local":
            file_url = f"/uploads/{folder}/{filename}"
    except Exception as exc:
        logger.error("频道头像上传失败: %s", exc)
        raise HTTPException(status_code=500, detail="头像上传失败，请重试")

    return {"avatar_url": file_url}
