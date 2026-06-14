import json
import secrets
from datetime import datetime
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.community import CommunityChannelCreate
from app.models.community import CommunityChannelUpdate
from app.schemas import (
    CommunityChannel,
    CommunityChannelComment,
    CommunityChannelMember,
    CommunityChannelPost,
    CommunityNotification,
    CommunityMediaModerationTask,
    User,
)


def _parse_notification_data(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def _normalize_images(raw: str | list[str] | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(item) for item in raw if item]
    if isinstance(raw, str):
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(item) for item in parsed if item]
            return []
        except (TypeError, ValueError, json.JSONDecodeError):
            return []
    return []


def _build_comment_preview(comment: CommunityChannelComment, user: User) -> dict:
    return {
        "id": comment.id,
        "channel_id": comment.channel_id,
        "post_id": comment.post_id,
        "user_id": comment.user_id,
        "user_name": user.name or "用户",
        "user_avatar_url": user.avatar_url,
        "user_update_time": user.update_time,
        "content": comment.content,
        "images": _normalize_images(comment.images),
        "status": comment.status,
        "create_time": comment.create_time,
        "update_time": comment.update_time,
    }


def create_channel(
    db: Session,
    *,
    tenant_id: int,
    admin_user_id: int,
    body: CommunityChannelCreate,
) -> CommunityChannel:
    channel = CommunityChannel(
        tenant_id=tenant_id,
        name=body.name,
        description=body.description,
        avatar_url=body.avatar_url,
        admin_user_id=admin_user_id,
        status=1,
    )
    db.add(channel)
    db.flush()
    db.add(
        CommunityChannelMember(
            channel_id=channel.id,
            tenant_id=tenant_id,
            user_id=admin_user_id,
            role="admin",
            status="active",
            invited_by=admin_user_id,
            joined_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(channel)
    return channel


def update_channel(
    db: Session,
    *,
    tenant_id: int,
    channel_id: int,
    body: CommunityChannelUpdate,
) -> CommunityChannel | None:
    channel = db.query(CommunityChannel).filter(
        CommunityChannel.id == channel_id,
        CommunityChannel.tenant_id == tenant_id,
        CommunityChannel.status == 1,
    ).first()
    if not channel:
        return None

    if body.name is not None:
        channel.name = body.name
    if body.description is not None:
        channel.description = body.description
    if body.avatar_url is not None:
        channel.avatar_url = body.avatar_url

    db.commit()
    db.refresh(channel)
    return channel


def get_channel_by_id(db: Session, *, channel_id: int, tenant_id: int) -> CommunityChannel | None:
    return db.query(CommunityChannel).filter(
        CommunityChannel.id == channel_id,
        CommunityChannel.tenant_id == tenant_id,
        CommunityChannel.status == 1,
    ).first()


def get_user_member_record(
    db: Session,
    *,
    channel_id: int,
    tenant_id: int,
    user_id: int,
) -> CommunityChannelMember | None:
    return db.query(CommunityChannelMember).filter(
        CommunityChannelMember.channel_id == channel_id,
        CommunityChannelMember.tenant_id == tenant_id,
        CommunityChannelMember.user_id == user_id,
    ).first()


def list_user_channels(
    db: Session,
    *,
    ctx,
    tenant_id: int,
    user_id: int,
    skip: int,
    limit: int,
) -> tuple[list[dict], int]:
    is_admin = ctx.has_any_role(db) or ctx.is_platform_admin

    if is_admin:
        total = db.query(func.count(CommunityChannel.id)).filter(
            CommunityChannel.tenant_id == tenant_id,
            CommunityChannel.status == 1,
        ).scalar() or 0

        rows = db.query(CommunityChannel).filter(
            CommunityChannel.tenant_id == tenant_id,
            CommunityChannel.status == 1,
        ).order_by(CommunityChannel.update_time.desc()).offset(skip).limit(limit).all()

        channel_ids = [channel.id for channel in rows]
        count_rows = db.query(
            CommunityChannelMember.channel_id,
            func.count(CommunityChannelMember.id).label("member_count"),
        ).filter(
            CommunityChannelMember.tenant_id == tenant_id,
            CommunityChannelMember.channel_id.in_(channel_ids),
            CommunityChannelMember.status == "active",
        ).group_by(CommunityChannelMember.channel_id).all() if channel_ids else []
        count_map = {channel_id: int(member_count or 0) for channel_id, member_count in count_rows}

        member_rows = db.query(CommunityChannelMember).filter(
            CommunityChannelMember.tenant_id == tenant_id,
            CommunityChannelMember.user_id == user_id,
            CommunityChannelMember.status.in_(["active", "banned"]),
            CommunityChannelMember.channel_id.in_(channel_ids),
        ).all() if channel_ids else []
        role_map = {row.channel_id: row.role for row in member_rows}

        items = []
        for channel in rows:
            items.append({
                "id": channel.id,
                "tenant_id": channel.tenant_id,
                "name": channel.name,
                "description": channel.description,
                "avatar_url": channel.avatar_url,
                "admin_user_id": channel.admin_user_id,
                "member_count": count_map.get(channel.id, 0),
                "role": role_map.get(channel.id, "admin"),
                "create_time": channel.create_time,
                "update_time": channel.update_time,
            })
        return items, int(total)

    member_rows = db.query(CommunityChannelMember).filter(
        CommunityChannelMember.tenant_id == tenant_id,
        CommunityChannelMember.user_id == user_id,
        CommunityChannelMember.status.in_(["active", "banned"]),
    ).order_by(CommunityChannelMember.update_time.desc()).all()
    channel_ids = [row.channel_id for row in member_rows]
    if not channel_ids:
        return [], 0

    total = db.query(func.count(CommunityChannel.id)).filter(
        CommunityChannel.tenant_id == tenant_id,
        CommunityChannel.status == 1,
        CommunityChannel.id.in_(channel_ids),
    ).scalar() or 0

    rows = db.query(CommunityChannel).filter(
        CommunityChannel.tenant_id == tenant_id,
        CommunityChannel.status == 1,
        CommunityChannel.id.in_(channel_ids),
    ).order_by(CommunityChannel.update_time.desc()).offset(skip).limit(limit).all()

    role_map = {row.channel_id: row.role for row in member_rows}
    count_rows = db.query(
        CommunityChannelMember.channel_id,
        func.count(CommunityChannelMember.id).label("member_count"),
    ).filter(
        CommunityChannelMember.tenant_id == tenant_id,
        CommunityChannelMember.channel_id.in_([channel.id for channel in rows]),
        CommunityChannelMember.status == "active",
    ).group_by(CommunityChannelMember.channel_id).all()
    count_map = {channel_id: int(member_count or 0) for channel_id, member_count in count_rows}

    items = []
    for channel in rows:
        items.append({
            "id": channel.id,
            "tenant_id": channel.tenant_id,
            "name": channel.name,
            "description": channel.description,
            "avatar_url": channel.avatar_url,
            "admin_user_id": channel.admin_user_id,
            "member_count": count_map.get(channel.id, 0),
            "role": role_map.get(channel.id, "member"),
            "create_time": channel.create_time,
            "update_time": channel.update_time,
        })
    return items, int(total)


def list_channel_members(
    db: Session,
    *,
    tenant_id: int,
    channel_id: int,
    skip: int,
    limit: int,
) -> tuple[list[dict], int]:
    total = db.query(func.count(CommunityChannelMember.id)).filter(
        CommunityChannelMember.tenant_id == tenant_id,
        CommunityChannelMember.channel_id == channel_id,
        CommunityChannelMember.status.in_(["active", "pending", "banned"]),
    ).scalar() or 0

    rows = db.query(CommunityChannelMember, User).join(
        User,
        (User.id == CommunityChannelMember.user_id) & (User.tenant_id == CommunityChannelMember.tenant_id),
    ).filter(
        CommunityChannelMember.tenant_id == tenant_id,
        CommunityChannelMember.channel_id == channel_id,
        CommunityChannelMember.status.in_(["active", "pending", "banned"]),
    ).order_by(CommunityChannelMember.create_time.asc()).offset(skip).limit(limit).all()

    items = []
    for member, user in rows:
        items.append({
            "id": member.id,
            "channel_id": member.channel_id,
            "user_id": member.user_id,
            "user_name": user.name or "用户",
            "user_avatar_url": user.avatar_url,
            "user_update_time": user.update_time,
            "role": member.role,
            "status": member.status,
            "joined_at": member.joined_at,
            "create_time": member.create_time,
            "update_time": member.update_time,
        })
    return items, int(total)


def invite_members(
    db: Session,
    *,
    tenant_id: int,
    channel_id: int,
    inviter_user_id: int,
    user_ids: list[int],
) -> int:
    inviter_user = db.query(User).filter(
        User.id == inviter_user_id,
        User.tenant_id == tenant_id,
    ).first()
    inviter_name = inviter_user.name if inviter_user and inviter_user.name else "管理员"

    channel = get_channel_by_id(db, channel_id=channel_id, tenant_id=tenant_id)
    if not channel:
        return 0

    invited_count = 0
    for user_id in user_ids:
        if user_id == inviter_user_id:
            continue
        target = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
        if not target:
            continue
        member = get_user_member_record(db, channel_id=channel_id, tenant_id=tenant_id, user_id=user_id)
        if member and member.status == "active":
            continue
        if member is None:
            db.add(
                CommunityChannelMember(
                    channel_id=channel_id,
                    tenant_id=tenant_id,
                    user_id=user_id,
                    role="member",
                    status="pending",
                    invited_by=inviter_user_id,
                    joined_at=None,
                )
            )
        else:
            member.status = "pending"
            member.invited_by = inviter_user_id

        notification = CommunityNotification(
            tenant_id=tenant_id,
            recipient_user_id=user_id,
            type="channel_invite",
            title="邀请你加入频道",
            content=f"{inviter_name} 邀请你加入「{channel.name}」频道",
            data=json.dumps(
                {
                    "action": "channel_invite",
                    "channel_id": channel_id,
                    "channel_name": channel.name,
                    "inviter_user_id": inviter_user_id,
                    "inviter_name": inviter_name,
                    "status": "pending",
                },
                ensure_ascii=False,
            ),
            is_read=0,
        )
        db.add(notification)
        invited_count += 1

    db.commit()
    return invited_count


def list_notifications(
    db: Session,
    *,
    tenant_id: int,
    recipient_user_id: int,
    skip: int,
    limit: int,
) -> tuple[list[dict], int]:
    total = db.query(func.count(CommunityNotification.id)).filter(
        CommunityNotification.tenant_id == tenant_id,
        CommunityNotification.recipient_user_id == recipient_user_id,
    ).scalar() or 0

    rows = db.query(CommunityNotification).filter(
        CommunityNotification.tenant_id == tenant_id,
        CommunityNotification.recipient_user_id == recipient_user_id,
    ).order_by(CommunityNotification.create_time.desc()).offset(skip).limit(limit).all()

    items = []
    for row in rows:
        items.append({
            "id": row.id,
            "type": row.type,
            "title": row.title,
            "content": row.content,
            "data": _parse_notification_data(row.data),
            "is_read": row.is_read,
            "create_time": row.create_time,
        })
    return items, int(total)


def get_notification_by_id(
    db: Session,
    *,
    notification_id: int,
    tenant_id: int,
    recipient_user_id: int,
) -> CommunityNotification | None:
    return db.query(CommunityNotification).filter(
        CommunityNotification.id == notification_id,
        CommunityNotification.tenant_id == tenant_id,
        CommunityNotification.recipient_user_id == recipient_user_id,
    ).first()


def accept_invite(
    db: Session,
    *,
    notification: CommunityNotification,
    user_id: int,
    tenant_id: int,
) -> None:
    data = _parse_notification_data(notification.data)
    channel_id = int(data.get("channel_id") or 0)
    if channel_id <= 0:
        return
    member = get_user_member_record(db, channel_id=channel_id, tenant_id=tenant_id, user_id=user_id)
    if member is None:
        db.add(
            CommunityChannelMember(
                channel_id=channel_id,
                tenant_id=tenant_id,
                user_id=user_id,
                role="member",
                status="active",
                joined_at=datetime.utcnow(),
            )
        )
    else:
        member.status = "active"
        if member.joined_at is None:
            member.joined_at = datetime.utcnow()

    data["status"] = "accepted"
    notification.data = json.dumps(data, ensure_ascii=False)
    notification.is_read = 1
    db.commit()


def reject_invite(
    db: Session,
    *,
    notification: CommunityNotification,
) -> None:
    data = _parse_notification_data(notification.data)
    channel_id = int(data.get("channel_id") or 0)
    user_id = notification.recipient_user_id
    tenant_id = notification.tenant_id
    member = get_user_member_record(db, channel_id=channel_id, tenant_id=tenant_id, user_id=user_id)
    if member and member.status == "pending":
        member.status = "kicked"
    data["status"] = "rejected"
    notification.data = json.dumps(data, ensure_ascii=False)
    notification.is_read = 1
    db.commit()


def mark_notification_read(
    db: Session,
    *,
    notification_id: int,
    tenant_id: int,
    recipient_user_id: int,
) -> bool:
    notification = get_notification_by_id(
        db,
        notification_id=notification_id,
        tenant_id=tenant_id,
        recipient_user_id=recipient_user_id,
    )
    if not notification:
        return False
    notification.is_read = 1
    db.commit()
    return True


def mark_notifications_read_all(
    db: Session,
    *,
    tenant_id: int,
    recipient_user_id: int,
) -> int:
    updated = db.query(CommunityNotification).filter(
        CommunityNotification.tenant_id == tenant_id,
        CommunityNotification.recipient_user_id == recipient_user_id,
        CommunityNotification.is_read == 0,
    ).update({"is_read": 1}, synchronize_session=False)
    db.commit()
    return int(updated or 0)


def get_unread_count(
    db: Session,
    *,
    tenant_id: int,
    recipient_user_id: int,
) -> int:
    count = db.query(func.count(CommunityNotification.id)).filter(
        CommunityNotification.tenant_id == tenant_id,
        CommunityNotification.recipient_user_id == recipient_user_id,
        CommunityNotification.is_read == 0,
    ).scalar() or 0
    return int(count)


def update_member_status(
    db: Session,
    *,
    tenant_id: int,
    channel_id: int,
    user_id: int,
    status: str,
) -> bool:
    member = get_user_member_record(
        db,
        channel_id=channel_id,
        tenant_id=tenant_id,
        user_id=user_id,
    )
    if not member:
        return False
    member.status = status
    db.commit()
    return True


def delete_channel(
    db: Session,
    *,
    tenant_id: int,
    channel_id: int,
) -> dict[str, int] | None:
    channel = db.query(CommunityChannel).filter(
        CommunityChannel.id == channel_id,
        CommunityChannel.tenant_id == tenant_id,
        CommunityChannel.status == 1,
    ).first()
    if not channel:
        return None

    post_ids = [
        item_id
        for (item_id,) in db.query(CommunityChannelPost.id).filter(
            CommunityChannelPost.tenant_id == tenant_id,
            CommunityChannelPost.channel_id == channel_id,
        ).all()
    ]
    comment_ids = [
        item_id
        for (item_id,) in db.query(CommunityChannelComment.id).filter(
            CommunityChannelComment.tenant_id == tenant_id,
            CommunityChannelComment.channel_id == channel_id,
        ).all()
    ]

    deleted_comment_count = db.query(CommunityChannelComment).filter(
        CommunityChannelComment.tenant_id == tenant_id,
        CommunityChannelComment.channel_id == channel_id,
    ).delete(synchronize_session=False)

    deleted_post_count = db.query(CommunityChannelPost).filter(
        CommunityChannelPost.tenant_id == tenant_id,
        CommunityChannelPost.channel_id == channel_id,
    ).delete(synchronize_session=False)

    deleted_member_count = db.query(CommunityChannelMember).filter(
        CommunityChannelMember.tenant_id == tenant_id,
        CommunityChannelMember.channel_id == channel_id,
    ).delete(synchronize_session=False)

    deleted_notification_count = db.query(CommunityNotification).filter(
        CommunityNotification.tenant_id == tenant_id,
        CommunityNotification.type == "channel_invite",
        CommunityNotification.data.like(f'%"channel_id": {channel_id}%'),
    ).delete(synchronize_session=False)

    deleted_task_count = db.query(CommunityMediaModerationTask).filter(
        CommunityMediaModerationTask.tenant_id == tenant_id,
        or_(
            CommunityMediaModerationTask.item_type == "channel_avatar",
            CommunityMediaModerationTask.item_type == "channel_post",
            CommunityMediaModerationTask.item_type == "channel_comment",
        ),
        or_(
            CommunityMediaModerationTask.item_id == channel_id,
            CommunityMediaModerationTask.item_id.in_(post_ids or [-1]),
            CommunityMediaModerationTask.item_id.in_(comment_ids or [-1]),
        ),
    ).delete(synchronize_session=False)

    db.query(CommunityChannel).filter(
        CommunityChannel.id == channel_id,
        CommunityChannel.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()

    return {
        "deleted_comments": int(deleted_comment_count or 0),
        "deleted_posts": int(deleted_post_count or 0),
        "deleted_members": int(deleted_member_count or 0),
        "deleted_notifications": int(deleted_notification_count or 0),
        "deleted_tasks": int(deleted_task_count or 0),
    }


def generate_invite_code(
    db: Session,
    *,
    tenant_id: int,
    channel_id: int,
    expire_hours: int = 24 * 7,
) -> tuple[str, datetime] | None:
    channel = get_channel_by_id(db, channel_id=channel_id, tenant_id=tenant_id)
    if not channel:
        return None
    code = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
    expire_at = datetime.utcnow().replace(microsecond=0)
    expire_at = datetime.fromtimestamp(expire_at.timestamp() + expire_hours * 3600)
    channel.invite_code = code
    channel.invite_code_expire_at = expire_at
    db.commit()
    return code, expire_at


def join_by_invite_code(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    invite_code: str,
) -> CommunityChannel | None:
    channel = db.query(CommunityChannel).filter(
        CommunityChannel.tenant_id == tenant_id,
        CommunityChannel.status == 1,
        CommunityChannel.invite_code == invite_code,
    ).first()
    if not channel:
        return None
    member = get_user_member_record(db, channel_id=channel.id, tenant_id=tenant_id, user_id=user_id)
    if member is None:
        db.add(
            CommunityChannelMember(
                channel_id=channel.id,
                tenant_id=tenant_id,
                user_id=user_id,
                role="member",
                status="active",
                joined_at=datetime.utcnow(),
            )
        )
    else:
        member.status = "active"
        if member.joined_at is None:
            member.joined_at = datetime.utcnow()
    db.commit()
    db.refresh(channel)
    return channel


def create_channel_post(
    db: Session,
    *,
    tenant_id: int,
    channel_id: int,
    author_user_id: int,
    title: str,
    content: str,
    content_format: str,
    images: list[str],
    is_official: int = 0,
    status: int = 1,
) -> CommunityChannelPost:
    post = CommunityChannelPost(
        tenant_id=tenant_id,
        channel_id=channel_id,
        author_user_id=author_user_id,
        title=title,
        content=content,
        content_format=content_format,
        images=json.dumps(images, ensure_ascii=False),
        is_official=is_official,
        is_pinned=0,
        status=status,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def list_channel_posts(
    db: Session,
    *,
    tenant_id: int,
    channel_id: int,
    skip: int,
    limit: int,
) -> tuple[list[dict], int]:
    total = db.query(func.count(CommunityChannelPost.id)).filter(
        CommunityChannelPost.tenant_id == tenant_id,
        CommunityChannelPost.channel_id == channel_id,
        CommunityChannelPost.status == 1,
    ).scalar() or 0

    rows = db.query(
        CommunityChannelPost,
        User,
        func.count(CommunityChannelComment.id).label("comment_count"),
    ).join(
        User,
        (User.id == CommunityChannelPost.author_user_id) & (User.tenant_id == CommunityChannelPost.tenant_id),
    ).outerjoin(
        CommunityChannelComment,
        (CommunityChannelComment.post_id == CommunityChannelPost.id)
        & (CommunityChannelComment.tenant_id == CommunityChannelPost.tenant_id)
        & (CommunityChannelComment.status == 1),
    ).filter(
        CommunityChannelPost.tenant_id == tenant_id,
        CommunityChannelPost.channel_id == channel_id,
        CommunityChannelPost.status == 1,
    ).group_by(
        CommunityChannelPost.id,
        User.id,
        User._name_ciphertext,
    ).order_by(
        CommunityChannelPost.is_pinned.desc(),
        CommunityChannelPost.create_time.desc(),
    ).offset(skip).limit(limit).all()

    post_ids = [post.id for post, _, _ in rows]
    preview_comments_by_post: dict[int, list[dict]] = {}
    if post_ids:
        comment_rows = db.query(CommunityChannelComment, User).join(
            User,
            (User.id == CommunityChannelComment.user_id)
            & (User.tenant_id == CommunityChannelComment.tenant_id),
        ).filter(
            CommunityChannelComment.tenant_id == tenant_id,
            CommunityChannelComment.post_id.in_(post_ids),
            CommunityChannelComment.status == 1,
        ).order_by(
            CommunityChannelComment.post_id.asc(),
            CommunityChannelComment.create_time.desc(),
        ).all()

        for comment, comment_user in comment_rows:
            bucket = preview_comments_by_post.setdefault(comment.post_id, [])
            if len(bucket) >= 2:
                continue
            bucket.append(_build_comment_preview(comment, comment_user))

    items = []
    for post, user, comment_count in rows:
        items.append({
            "id": post.id,
            "channel_id": post.channel_id,
            "author_user_id": post.author_user_id,
            "author_name": user.name or "用户",
            "author_avatar_url": user.avatar_url,
            "author_update_time": user.update_time,
            "title": post.title,
            "content": post.content,
            "content_format": post.content_format,
            "images": _normalize_images(post.images),
            "is_official": post.is_official,
            "is_pinned": post.is_pinned,
            "status": post.status,
            "comment_count": int(comment_count or 0),
            "preview_comments": preview_comments_by_post.get(post.id, []),
            "create_time": post.create_time,
            "update_time": post.update_time,
        })
    return items, int(total)


def get_channel_post_detail(
    db: Session,
    *,
    tenant_id: int,
    post_id: int,
    include_non_public: bool = False,
) -> dict | None:
    query = db.query(
        CommunityChannelPost,
        User,
        func.count(CommunityChannelComment.id).label("comment_count"),
    ).join(
        User,
        (User.id == CommunityChannelPost.author_user_id) & (User.tenant_id == CommunityChannelPost.tenant_id),
    ).outerjoin(
        CommunityChannelComment,
        (CommunityChannelComment.post_id == CommunityChannelPost.id)
        & (CommunityChannelComment.tenant_id == CommunityChannelPost.tenant_id)
        & (CommunityChannelComment.status == 1),
    ).filter(
        CommunityChannelPost.tenant_id == tenant_id,
        CommunityChannelPost.id == post_id,
    )
    if not include_non_public:
        query = query.filter(CommunityChannelPost.status == 1)

    row = query.group_by(
        CommunityChannelPost.id,
        User.id,
        User._name_ciphertext,
    ).first()
    if not row:
        return None
    post, user, comment_count = row
    return {
        "id": post.id,
        "channel_id": post.channel_id,
        "author_user_id": post.author_user_id,
        "author_name": user.name or "用户",
        "author_avatar_url": user.avatar_url,
        "author_update_time": user.update_time,
        "title": post.title,
        "content": post.content,
        "content_format": post.content_format,
        "images": _normalize_images(post.images),
        "is_official": post.is_official,
        "is_pinned": post.is_pinned,
        "status": post.status,
        "comment_count": int(comment_count or 0),
        "preview_comments": [],
        "create_time": post.create_time,
        "update_time": post.update_time,
    }


def create_channel_comment(
    db: Session,
    *,
    tenant_id: int,
    channel_id: int,
    post_id: int,
    user_id: int,
    content: str,
    images: list[str],
    status: int = 1,
) -> CommunityChannelComment:
    comment = CommunityChannelComment(
        tenant_id=tenant_id,
        channel_id=channel_id,
        post_id=post_id,
        user_id=user_id,
        content=content,
        images=json.dumps(images, ensure_ascii=False),
        status=status,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def list_channel_comments(
    db: Session,
    *,
    tenant_id: int,
    post_id: int,
    skip: int,
    limit: int,
) -> tuple[list[dict], int]:
    total = db.query(func.count(CommunityChannelComment.id)).filter(
        CommunityChannelComment.tenant_id == tenant_id,
        CommunityChannelComment.post_id == post_id,
        CommunityChannelComment.status == 1,
    ).scalar() or 0
    rows = db.query(CommunityChannelComment, User).join(
        User,
        (User.id == CommunityChannelComment.user_id) & (User.tenant_id == CommunityChannelComment.tenant_id),
    ).filter(
        CommunityChannelComment.tenant_id == tenant_id,
        CommunityChannelComment.post_id == post_id,
        CommunityChannelComment.status == 1,
    ).order_by(
        CommunityChannelComment.create_time.asc(),
    ).offset(skip).limit(limit).all()
    items = []
    for comment, user in rows:
        items.append(_build_comment_preview(comment, user))
    return items, int(total)


def get_channel_comment_detail(
    db: Session,
    *,
    tenant_id: int,
    comment_id: int,
    include_non_public: bool = False,
) -> dict | None:
    query = db.query(CommunityChannelComment, User).join(
        User,
        (User.id == CommunityChannelComment.user_id) & (User.tenant_id == CommunityChannelComment.tenant_id),
    ).filter(
        CommunityChannelComment.tenant_id == tenant_id,
        CommunityChannelComment.id == comment_id,
    )
    if not include_non_public:
        query = query.filter(CommunityChannelComment.status == 1)

    row = query.first()
    if not row:
        return None
    comment, user = row
    return _build_comment_preview(comment, user)


def update_channel_status(
    db: Session,
    *,
    tenant_id: int,
    channel_id: int,
    status: int,
) -> bool:
    """更新频道状态（用于频道头像审核回调）。"""
    channel = db.query(CommunityChannel).filter(
        CommunityChannel.tenant_id == tenant_id,
        CommunityChannel.id == channel_id,
    ).first()
    if not channel:
        return False
    channel.status = status
    db.commit()
    return True


def update_channel_post_status(
    db: Session,
    *,
    tenant_id: int,
    post_id: int,
    status: int,
) -> bool:
    post = db.query(CommunityChannelPost).filter(
        CommunityChannelPost.tenant_id == tenant_id,
        CommunityChannelPost.id == post_id,
    ).first()
    if not post:
        return False
    post.status = status
    db.commit()
    return True


def update_channel_comment_status(
    db: Session,
    *,
    tenant_id: int,
    comment_id: int,
    status: int,
) -> bool:
    comment = db.query(CommunityChannelComment).filter(
        CommunityChannelComment.tenant_id == tenant_id,
        CommunityChannelComment.id == comment_id,
    ).first()
    if not comment:
        return False
    comment.status = status
    db.commit()
    return True


def list_pending_channel_posts(
    db: Session,
    *,
    tenant_id: int,
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[dict], int]:
    total = db.query(func.count(CommunityChannelPost.id)).filter(
        CommunityChannelPost.tenant_id == tenant_id,
        CommunityChannelPost.status == 0,
    ).scalar() or 0
    rows = db.query(CommunityChannelPost, User).join(
        User,
        (User.id == CommunityChannelPost.author_user_id) & (User.tenant_id == CommunityChannelPost.tenant_id),
    ).filter(
        CommunityChannelPost.tenant_id == tenant_id,
        CommunityChannelPost.status == 0,
    ).order_by(CommunityChannelPost.create_time.asc()).offset(skip).limit(limit).all()

    items: list[dict] = []
    for post, user in rows:
        items.append(
            {
                "id": post.id,
                "channel_id": post.channel_id,
                "author_user_id": post.author_user_id,
                "author_name": user.name or "用户",
                "title": post.title,
                "content": post.content,
                "images": _normalize_images(post.images),
                "is_official": post.is_official,
                "is_pinned": post.is_pinned,
                "status": post.status,
                "comment_count": 0,
                "create_time": post.create_time,
                "update_time": post.update_time,
            }
        )
    return items, int(total)


def list_pending_channel_comments(
    db: Session,
    *,
    tenant_id: int,
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[dict], int]:
    total = db.query(func.count(CommunityChannelComment.id)).filter(
        CommunityChannelComment.tenant_id == tenant_id,
        CommunityChannelComment.status == 0,
    ).scalar() or 0
    rows = db.query(CommunityChannelComment, User).join(
        User,
        (User.id == CommunityChannelComment.user_id) & (User.tenant_id == CommunityChannelComment.tenant_id),
    ).filter(
        CommunityChannelComment.tenant_id == tenant_id,
        CommunityChannelComment.status == 0,
    ).order_by(CommunityChannelComment.create_time.asc()).offset(skip).limit(limit).all()

    items: list[dict] = []
    for comment, user in rows:
        items.append(
            {
                "id": comment.id,
                "channel_id": comment.channel_id,
                "post_id": comment.post_id,
                "user_id": comment.user_id,
                "user_name": user.name or "用户",
                "content": comment.content,
                "images": _normalize_images(comment.images),
                "status": comment.status,
                "create_time": comment.create_time,
                "update_time": comment.update_time,
            }
        )
    return items, int(total)
