from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from datetime import datetime
from typing import List, Optional
from fastapi import HTTPException
from app.models.activity import ActivityCreate, ActivityUpdate
from app.schemas import Activity, ActivityParticipant, CheckInRecord
from app.crud import crud_activity_type


def _resolve_activity_type_id(db: Session, activity: ActivityCreate, tenant_id: int) -> Optional[int]:
    """从 activity_type_id 或 activity_type_name 解析出 activity_type_id"""
    if activity.activity_type_id is not None:
        t = crud_activity_type.get_by_id(db, activity.activity_type_id, tenant_id)
        if t and t.tenant_id == tenant_id:
            return t.id
    name = (activity.activity_type_name or "").strip()
    if name:
        t = crud_activity_type.get_or_create_by_name(db, name, tenant_id)
        return t.id
    return None


def create_activity(db: Session, activity: ActivityCreate, tenant_id: int) -> Activity:
    """创建活动（租户隔离）"""
    try:
        participants = activity.participants or []
        activity_type_id = _resolve_activity_type_id(db, activity, tenant_id)

        activity_dict = activity.model_dump(
            exclude={"participants", "activity_type_name", "registration_success_notification"}
        )
        activity_dict["activity_type_id"] = activity_type_id
        activity_dict["tenant_id"] = tenant_id
        activity_dict["status"] = 1
        activity_dict["create_time"] = datetime.now()
        activity_dict["update_time"] = datetime.now()
        activity_dict["suggested_fee"] = activity.suggested_fee or 0
        activity_dict["require_payment"] = activity.require_payment or 0
        activity_dict["poster_url"] = activity.poster_url or None
        activity_dict["location"] = activity.location or None
        if activity_dict.get("tag") is None:
            activity_dict["tag"] = None

        db_activity = Activity(**activity_dict)
        db.add(db_activity)
        db.flush()

        # 批量插入参与者
        if participants:
            participant_list = []
            now = datetime.now()
            for participant in participants:
                participant_list.append({
                    "tenant_id": tenant_id,
                    "activity_id": db_activity.id,
                    "participant_name": participant.participant_name,
                    "identity_number": participant.identity_number or "",
                    "phone": participant.phone,
                    "create_time": now,
                    "update_time": now,
                    "user_id": getattr(participant, "user_id", None),
                })
            db.bulk_insert_mappings(ActivityParticipant, participant_list)

        db.commit()
        db.refresh(db_activity)
        return db_activity
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def get_activity(db: Session, activity_id: int, tenant_id: int) -> Optional[Activity]:
    """获取单个活动（租户隔离）"""
    return db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id
    ).first()


def get_activities(
    db: Session,
    tenant_id: int,
    skip: int = 0,
    limit: int = 10,
    status: Optional[int] = None,
    allowed_activity_type_ids: Optional[List[int]] = None,
    allowed_activity_ids: Optional[List[int]] = None,
    user_id: Optional[int] = None,
    user_activity_type_ids: Optional[List[int]] = None,
    apply_public_filter_when_unscoped: bool = True,
) -> tuple:
    """获取活动列表（租户隔离）"""
    try:
        query = db.query(Activity).filter(Activity.tenant_id == tenant_id)
        if status is not None:
            query = query.filter(Activity.status == status)
        scope_filters = []
        has_scope_constraints = allowed_activity_type_ids is not None or allowed_activity_ids is not None
        if has_scope_constraints:
            scoped_filters = []
            if allowed_activity_type_ids:
                scoped_filters.append(Activity.activity_type_id.in_(allowed_activity_type_ids))
            if allowed_activity_ids:
                scoped_filters.append(Activity.id.in_(allowed_activity_ids))
            # 管理员管理视角只返回授权范围，避免把公开活动混入“可管理活动”
            if scoped_filters:
                scope_filters.append(or_(*scoped_filters))
            else:
                # 存在范围约束但没有任何有效 scope 时，禁止返回全量活动
                query = query.filter(Activity.id == -1)

        # 用户活动分层过滤：公开活动 OR 用户关联类型的活动
        if user_id is not None and user_activity_type_ids is not None:
            if user_activity_type_ids:
                scope_filters.append(
                    or_(
                        Activity.is_public == 1,
                        Activity.activity_type_id.in_(user_activity_type_ids)
                    )
                )
            else:
                # 用户没有任何关联类型，只能看公开活动
                scope_filters.append(Activity.is_public == 1)
        elif apply_public_filter_when_unscoped and allowed_activity_type_ids is None and allowed_activity_ids is None:
            # 未登录且没有权限限制，默认只看公开活动
            scope_filters.append(Activity.is_public == 1)

        if scope_filters:
            query = query.filter(or_(*scope_filters))
        total = query.count()
        activities = query.order_by(desc(Activity.start_time)).offset(skip).limit(limit).all()
        return activities, total
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def update_activity_status(
    db: Session,
    activity_id: int,
    status: int,
    tenant_id: int,
) -> Activity:
    """更新活动状态（租户隔离）"""
    try:
        db_activity = get_activity(db, activity_id, tenant_id)
        if not db_activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        
        current_time = datetime.now()
        
        if status == 2:
            if current_time < db_activity.start_time:
                raise HTTPException(status_code=400, detail="Cannot start activity before start time")
        elif status == 3:
            db_activity.end_time = current_time
            
        db_activity.status = status
        db.commit()
        db.refresh(db_activity)
        return db_activity
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def update_activity(
    db: Session,
    activity_id: int,
    activity_update: ActivityUpdate,
    tenant_id: int,
) -> Activity:
    """更新活动信息（租户隔离）"""
    try:
        db_activity = get_activity(db, activity_id, tenant_id)
        if not db_activity:
            raise HTTPException(status_code=404, detail="Activity not found")

        update_data = activity_update.model_dump(exclude_unset=True, exclude={"registration_success_notification"})

        if "activity_type_name" in update_data:
            type_name = update_data.pop("activity_type_name")
            if type_name:
                t = crud_activity_type.get_or_create_by_name(db, type_name.strip(), tenant_id)
                update_data["activity_type_id"] = t.id

        nullable_fields = {"tag", "end_time", "poster_url", "location", "max_participants"}

        for field, value in update_data.items():
            if value is None and field not in nullable_fields:
                continue
            setattr(db_activity, field, value)

        db_activity.update_time = datetime.now()
        db.commit()
        db.refresh(db_activity)
        return db_activity
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def delete_activity(db: Session, activity_id: int, tenant_id: int) -> bool:
    """删除活动（租户隔离）"""
    try:
        db_activity = get_activity(db, activity_id, tenant_id)
        if not db_activity:
            raise HTTPException(status_code=404, detail="Activity not found")

        participant_exists = db.query(ActivityParticipant.id).filter(
            ActivityParticipant.activity_id == activity_id,
            ActivityParticipant.tenant_id == tenant_id,
        ).first()
        if participant_exists is not None:
            raise HTTPException(status_code=400, detail="该活动已有用户报名，不能删除")
        
        db.query(ActivityParticipant).filter(
            ActivityParticipant.activity_id == activity_id,
            ActivityParticipant.tenant_id == tenant_id
        ).delete()
        
        db.query(CheckInRecord).filter(
            CheckInRecord.activity_id == activity_id,
            CheckInRecord.tenant_id == tenant_id
        ).delete()
        
        db.delete(db_activity)
        db.commit()
        return True
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
