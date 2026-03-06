from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_activity, crud_checkin, crud_participant, crud_admin
from app.models import activity, checkin
from app.api import deps

router = APIRouter()


def _allowed_type_ids_for_list(db: Session, admin_id: int | None) -> List[int] | None:
    """管理员列表过滤：None 表示不过滤，[] 表示无权限（返回空），非空为类型 id 列表。"""
    if admin_id is None:
        return None
    is_super, allowed = crud_admin.get_admin_scope(db, admin_id)
    if is_super or not allowed:
        return None  # 超级管理员或未传类型：不过滤
    return allowed


@router.post("/", response_model=activity.ActivityResponse)
def create_activity(
    body: activity.ActivityCreate,
    db: Session = Depends(deps.get_db),
    scope: dict = Depends(deps.get_admin_scope),
):
    """创建活动。活动管理员只能创建其授权类型下的活动，且须带 activity_type_id 或 activity_type_name。"""
    if not scope["is_super"]:
        allowed = scope["allowed_activity_type_ids"]
        if not allowed:
            raise HTTPException(status_code=403, detail="当前账号未授权任何活动类型，无法创建活动")
        # 解析类型：若仅传 name 则会在 create 里 get_or_create，需校验该类型在授权内
        from app.crud import crud_activity_type
        type_id = body.activity_type_id
        type_name = (body.activity_type_name or "").strip()
        if type_id is not None:
            if type_id not in allowed:
                raise HTTPException(status_code=403, detail="所选活动类型不在授权范围内")
        elif type_name:
            t = crud_activity_type.get_by_name(db, type_name)
            if not t or t.id not in allowed:
                raise HTTPException(status_code=403, detail="所选活动类型不在授权范围内或不存在")
        else:
            raise HTTPException(status_code=400, detail="活动管理员创建活动须指定活动类型（activity_type_id 或 activity_type_name）")
    return crud_activity.create_activity(db=db, activity=body)


@router.get("/", response_model=activity.ActivityListResponse)
def list_activities(
    skip: int = 0,
    limit: int = 100,
    status: int = None,
    db: Session = Depends(deps.get_db),
    admin_id: int | None = Depends(deps.get_current_admin_optional),
):
    """活动列表。带管理员 token 时仅返回该管理员有权限的活动（超级管理员看全部）。"""
    allowed = _allowed_type_ids_for_list(db, admin_id)
    activities, total = crud_activity.get_activities(
        db, skip=skip, limit=limit, status=status,
        allowed_activity_type_ids=allowed,
    )
    return {"items": activities, "total": total}


@router.get("/unstarted/", response_model=activity.ActivityListResponse)
def get_unstarted_activities(
    db: Session = Depends(deps.get_db),
    admin_id: int | None = Depends(deps.get_current_admin_optional),
):
    """未开始活动列表。带管理员 token 时按权限过滤。"""
    allowed = _allowed_type_ids_for_list(db, admin_id)
    activities, total = crud_activity.get_activities(
        db, status=1, allowed_activity_type_ids=allowed
    )
    return {"items": activities, "total": total}


@router.put("/{activity_id}/status")
def update_activity_status(
    activity_id: int,
    status: int,
    db: Session = Depends(deps.get_db),
    _: int = Depends(deps.require_activity_admin),
):
    """更新活动状态。仅超级管理员或该活动所属类型的活动管理员可操作。"""
    act = crud_activity.update_activity_status(db, activity_id, status)
    if act is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return {"status": "success", "message": "Activity status updated"}


@router.get("/{activity_id}/checkins/", response_model=List[checkin.CheckInResponse])
def get_activity_checkins(
    activity_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    _: int = Depends(deps.require_activity_admin),
):
    """查看活动签到。仅超级管理员或该活动类型的活动管理员可查看。"""
    return crud_checkin.get_activity_checkins(db, activity_id, skip=skip, limit=limit)


@router.get("/{activity_id}/statistics/")
def get_activity_stats(
    activity_id: int,
    db: Session = Depends(deps.get_db),
    _: int = Depends(deps.require_activity_admin),
):
    """活动报名统计。仅超级管理员或该活动类型的活动管理员可查看。"""
    return crud_participant.get_activity_statistics(db, activity_id)


@router.put("/{activity_id}", response_model=activity.ActivityResponse)
def update_activity(
    activity_id: int,
    body: activity.ActivityUpdate,
    db: Session = Depends(deps.get_db),
    _: int = Depends(deps.require_activity_admin),
):
    """编辑活动信息。仅超级管理员或该活动所属类型的活动管理员可操作。"""
    return crud_activity.update_activity(db, activity_id, body)


@router.delete("/{activity_id}")
def delete_activity(
    activity_id: int,
    db: Session = Depends(deps.get_db),
    _: int = Depends(deps.require_activity_admin),
):
    """删除活动。仅超级管理员或该活动所属类型的活动管理员可操作。"""
    crud_activity.delete_activity(db, activity_id)
    return {"status": "success", "message": "Activity deleted successfully"}