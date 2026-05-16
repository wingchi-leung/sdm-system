from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import crud_activity, crud_community_comment, crud_community_post, crud_participant
from app.models.community import (
    CommunityCommentCreate,
    CommunityCommentListResponse,
    CommunityCommentResponse,
    CommunityPostCreate,
    CommunityPostListResponse,
    CommunityPostResponse,
)

router = APIRouter()


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
    post = crud_community_post.create_post(
        db,
        body=body,
        tenant_id=ctx.tenant_id,
        author_user_id=ctx.user_id,
    )
    detail = crud_community_post.get_post_detail(db, post_id=post.id, tenant_id=ctx.tenant_id)
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
    comment = crud_community_comment.create_comment(
        db,
        body=body,
        tenant_id=ctx.tenant_id,
        activity_id=post["activity_id"],
        post_id=post_id,
        user_id=ctx.user_id,
    )
    detail = crud_community_comment.get_comment_detail(
        db,
        comment_id=comment.id,
        tenant_id=ctx.tenant_id,
    )
    if not detail:
        raise HTTPException(status_code=500, detail="评论创建成功但读取失败")
    return detail
