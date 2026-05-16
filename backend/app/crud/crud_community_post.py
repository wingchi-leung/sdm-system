from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.community import CommunityPostCreate
from app.schemas import CommunityComment, CommunityPost, User


def create_post(
    db: Session,
    *,
    body: CommunityPostCreate,
    tenant_id: int,
    author_user_id: int,
) -> CommunityPost:
    post = CommunityPost(
        tenant_id=tenant_id,
        activity_id=body.activity_id,
        author_user_id=author_user_id,
        title=body.title,
        content=body.content,
        cover_url=body.cover_url,
        status=1,
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
        User._name_ciphertext,
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
            "cover_url": post.cover_url,
            "status": post.status,
            "comment_count": int(comment_count or 0),
            "create_time": post.create_time,
            "update_time": post.update_time,
        })
    return items, total


def get_post_detail(db: Session, *, post_id: int, tenant_id: int) -> dict | None:
    comment_count_expr = func.count(CommunityComment.id)
    row = db.query(
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
        CommunityPost.status == 1,
    ).group_by(
        CommunityPost.id,
        User.id,
        User._name_ciphertext,
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
        "cover_url": post.cover_url,
        "status": post.status,
        "comment_count": int(comment_count or 0),
        "create_time": post.create_time,
        "update_time": post.update_time,
    }
