from sqlalchemy.orm import Session
import json

from app.models.community import CommunityCommentCreate
from app.core.display_name import normalize_display_name
from app.schemas import CommunityComment, User


def _normalize_images(images_text: str | None) -> list[str]:
    if not images_text:
        return []
    try:
        parsed = json.loads(images_text)
        if not isinstance(parsed, list):
            return []
        return [str(item).strip() for item in parsed if str(item).strip()]
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def create_comment(
    db: Session,
    *,
    body: CommunityCommentCreate,
    tenant_id: int,
    activity_id: int,
    post_id: int,
    user_id: int,
    status: int = 1,
) -> CommunityComment:
    comment = CommunityComment(
        tenant_id=tenant_id,
        activity_id=activity_id,
        post_id=post_id,
        user_id=user_id,
        content=body.content,
        images=json.dumps(body.images, ensure_ascii=False),
        status=status,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def get_comment_detail(
    db: Session,
    *,
    comment_id: int,
    tenant_id: int,
    include_non_public: bool = False,
) -> dict | None:
    query = db.query(
        CommunityComment,
        User,
    ).join(
        User,
        (User.id == CommunityComment.user_id) & (User.tenant_id == CommunityComment.tenant_id),
    ).filter(
        CommunityComment.id == comment_id,
        CommunityComment.tenant_id == tenant_id,
    )
    if not include_non_public:
        query = query.filter(CommunityComment.status == 1)

    row = query.first()

    if not row:
        return None

    comment, user = row
    return {
        "id": comment.id,
        "activity_id": comment.activity_id,
        "post_id": comment.post_id,
        "user_id": comment.user_id,
        "user_name": normalize_display_name(user.name, "学员"),
        "content": comment.content,
        "images": _normalize_images(comment.images),
        "status": comment.status,
        "create_time": comment.create_time,
        "update_time": comment.update_time,
    }


def update_comment_status(
    db: Session,
    *,
    comment_id: int,
    tenant_id: int,
    status: int,
) -> bool:
    comment = db.query(CommunityComment).filter(
        CommunityComment.id == comment_id,
        CommunityComment.tenant_id == tenant_id,
    ).first()
    if not comment:
        return False
    comment.status = status
    db.commit()
    return True


def list_pending_comments(
    db: Session,
    *,
    tenant_id: int,
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[dict], int]:
    total = db.query(CommunityComment).filter(
        CommunityComment.tenant_id == tenant_id,
        CommunityComment.status == 0,
    ).count()

    rows = db.query(
        CommunityComment,
        User,
    ).join(
        User,
        (User.id == CommunityComment.user_id) & (User.tenant_id == CommunityComment.tenant_id),
    ).filter(
        CommunityComment.tenant_id == tenant_id,
        CommunityComment.status == 0,
    ).order_by(CommunityComment.create_time.asc()).offset(skip).limit(limit).all()

    items: list[dict] = []
    for comment, user in rows:
        items.append(
            {
                "id": comment.id,
                "activity_id": comment.activity_id,
                "post_id": comment.post_id,
                "user_id": comment.user_id,
                "user_name": normalize_display_name(user.name, "学员"),
                "content": comment.content,
                "images": _normalize_images(comment.images),
                "status": comment.status,
                "create_time": comment.create_time,
                "update_time": comment.update_time,
            }
        )
    return items, int(total)


def get_comments_by_post(
    db: Session,
    *,
    post_id: int,
    tenant_id: int,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[dict], int]:
    total = db.query(CommunityComment).filter(
        CommunityComment.post_id == post_id,
        CommunityComment.tenant_id == tenant_id,
        CommunityComment.status == 1,
    ).count()

    query = db.query(
        CommunityComment,
        User,
    ).join(
        User,
        (User.id == CommunityComment.user_id) & (User.tenant_id == CommunityComment.tenant_id),
    ).filter(
        CommunityComment.post_id == post_id,
        CommunityComment.tenant_id == tenant_id,
        CommunityComment.status == 1,
    )

    rows = query.order_by(CommunityComment.create_time.asc()).offset(skip).limit(limit).all()
    items = []
    for comment, user in rows:
        items.append({
            "id": comment.id,
            "activity_id": comment.activity_id,
            "post_id": comment.post_id,
            "user_id": comment.user_id,
            "user_name": normalize_display_name(user.name, "学员"),
            "content": comment.content,
            "images": _normalize_images(comment.images),
            "status": comment.status,
            "create_time": comment.create_time,
            "update_time": comment.update_time,
        })
    return items, total
