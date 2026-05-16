from sqlalchemy.orm import Session

from app.models.community import CommunityCommentCreate
from app.schemas import CommunityComment, User


def create_comment(
    db: Session,
    *,
    body: CommunityCommentCreate,
    tenant_id: int,
    activity_id: int,
    post_id: int,
    user_id: int,
) -> CommunityComment:
    comment = CommunityComment(
        tenant_id=tenant_id,
        activity_id=activity_id,
        post_id=post_id,
        user_id=user_id,
        content=body.content,
        status=1,
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
) -> dict | None:
    row = db.query(
        CommunityComment,
        User,
    ).join(
        User,
        (User.id == CommunityComment.user_id) & (User.tenant_id == CommunityComment.tenant_id),
    ).filter(
        CommunityComment.id == comment_id,
        CommunityComment.tenant_id == tenant_id,
        CommunityComment.status == 1,
    ).first()

    if not row:
        return None

    comment, user = row
    return {
        "id": comment.id,
        "activity_id": comment.activity_id,
        "post_id": comment.post_id,
        "user_id": comment.user_id,
        "user_name": user.name or "学员",
        "content": comment.content,
        "status": comment.status,
        "create_time": comment.create_time,
        "update_time": comment.update_time,
    }


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
            "user_name": user.name or "学员",
            "content": comment.content,
            "status": comment.status,
            "create_time": comment.create_time,
            "update_time": comment.update_time,
        })
    return items, total
