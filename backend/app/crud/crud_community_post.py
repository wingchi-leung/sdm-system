from sqlalchemy import func
from sqlalchemy.orm import Session
import json

from app.models.community import CommunityPostCreate
from app.schemas import CommunityComment, CommunityPost, User


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


def create_post(
    db: Session,
    *,
    body: CommunityPostCreate,
    tenant_id: int,
    author_user_id: int,
    status: int = 1,
) -> CommunityPost:
    post = CommunityPost(
        tenant_id=tenant_id,
        activity_id=body.activity_id,
        author_user_id=author_user_id,
        title=body.title,
        content=body.content,
        images=json.dumps(body.images, ensure_ascii=False),
        status=status,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def get_post(db: Session, *, post_id: int, tenant_id: int) -> CommunityPost | None:
    return db.query(CommunityPost).filter(
        CommunityPost.id == post_id,
        CommunityPost.tenant_id == tenant_id,
        CommunityPost.status == 1,
    ).first()


def get_posts_by_activity(
    db: Session,
    *,
    activity_id: int,
    tenant_id: int,
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[dict], int]:
    comment_count_expr = func.count(CommunityComment.id)
    total = db.query(func.count(CommunityPost.id)).filter(
        CommunityPost.activity_id == activity_id,
        CommunityPost.tenant_id == tenant_id,
        CommunityPost.status == 1,
    ).scalar() or 0

    query = db.query(
        CommunityPost,
        User,
        comment_count_expr.label("comment_count"),
    ).join(
        User,
        (User.id == CommunityPost.author_user_id) & (User.tenant_id == CommunityPost.tenant_id),
    ).outerjoin(
        CommunityComment,
        (CommunityComment.post_id == CommunityPost.id)
        & (CommunityComment.tenant_id == CommunityPost.tenant_id)
        & (CommunityComment.status == 1),
    ).filter(
        CommunityPost.activity_id == activity_id,
        CommunityPost.tenant_id == tenant_id,
        CommunityPost.status == 1,
    ).group_by(
        CommunityPost.id,
        User.id,
        User.name,
    )

    rows = query.order_by(CommunityPost.create_time.desc()).offset(skip).limit(limit).all()
    items = []
    for post, author_user, comment_count in rows:
        items.append({
            "id": post.id,
            "activity_id": post.activity_id,
            "author_user_id": post.author_user_id,
            "author_name": author_user.name or "管理员",
            "title": post.title,
            "content": post.content,
            "images": _normalize_images(post.images),
            "status": post.status,
            "comment_count": int(comment_count or 0),
            "create_time": post.create_time,
            "update_time": post.update_time,
        })
    return items, total


def get_post_detail(
    db: Session,
    *,
    post_id: int,
    tenant_id: int,
    include_non_public: bool = False,
) -> dict | None:
    comment_count_expr = func.count(CommunityComment.id)
    query = db.query(
        CommunityPost,
        User,
        comment_count_expr.label("comment_count"),
    ).join(
        User,
        (User.id == CommunityPost.author_user_id) & (User.tenant_id == CommunityPost.tenant_id),
    ).outerjoin(
        CommunityComment,
        (CommunityComment.post_id == CommunityPost.id)
        & (CommunityComment.tenant_id == CommunityPost.tenant_id)
        & (CommunityComment.status == 1),
    ).filter(
        CommunityPost.id == post_id,
        CommunityPost.tenant_id == tenant_id,
    )
    if not include_non_public:
        query = query.filter(CommunityPost.status == 1)

    row = query.group_by(
        CommunityPost.id,
        User.id,
        User.name,
    ).first()

    if not row:
        return None

    post, author_user, comment_count = row
    return {
        "id": post.id,
        "activity_id": post.activity_id,
        "author_user_id": post.author_user_id,
        "author_name": author_user.name or "管理员",
        "title": post.title,
        "content": post.content,
        "images": _normalize_images(post.images),
        "status": post.status,
        "comment_count": int(comment_count or 0),
        "create_time": post.create_time,
        "update_time": post.update_time,
    }


def update_post_status(
    db: Session,
    *,
    post_id: int,
    tenant_id: int,
    status: int,
) -> bool:
    post = db.query(CommunityPost).filter(
        CommunityPost.id == post_id,
        CommunityPost.tenant_id == tenant_id,
    ).first()
    if not post:
        return False
    post.status = status
    db.commit()
    return True


def list_pending_posts(
    db: Session,
    *,
    tenant_id: int,
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[dict], int]:
    total = db.query(func.count(CommunityPost.id)).filter(
        CommunityPost.tenant_id == tenant_id,
        CommunityPost.status == 0,
    ).scalar() or 0

    rows = db.query(CommunityPost, User).join(
        User,
        (User.id == CommunityPost.author_user_id) & (User.tenant_id == CommunityPost.tenant_id),
    ).filter(
        CommunityPost.tenant_id == tenant_id,
        CommunityPost.status == 0,
    ).order_by(
        CommunityPost.create_time.asc(),
    ).offset(skip).limit(limit).all()

    items: list[dict] = []
    for post, user in rows:
        items.append(
            {
                "id": post.id,
                "activity_id": post.activity_id,
                "author_user_id": post.author_user_id,
                "author_name": user.name or "用户",
                "title": post.title,
                "content": post.content,
                "images": _normalize_images(post.images),
                "status": post.status,
                "comment_count": 0,
                "create_time": post.create_time,
                "update_time": post.update_time,
            }
        )
    return items, int(total)
