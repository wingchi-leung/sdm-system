from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime
from typing import List, Optional
from fastapi import HTTPException
from app.models.activity import ActivityCreate, ActivityUpdate
from app.schemas import Activity
from app.schemas import ActivityParticipant, CheckInRecord
from app.crud import crud_activity_type


def _resolve_activity_type_id(db: Session, activity: ActivityCreate) -> Optional[int]:
    """从 activity_type_id 或 activity_type_name 解析出 activity_type_id"""
    if activity.activity_type_id is not None:
        t = crud_activity_type.get_by_id(db, activity.activity_type_id)
        if t:
            return t.id
    name = (activity.activity_type_name or "").strip()
    if name:
        t = crud_activity_type.get_or_create_by_name(db, name)
        return t.id
    return None


def create_activity(db: Session, activity: ActivityCreate) -> Activity:
    """Create a new activity record with participants"""
    try:
        participants = activity.participants or []
        activity_type_id = _resolve_activity_type_id(db, activity)

        activity_dict = activity.model_dump(exclude={"participants", "activity_type_name"})
        activity_dict["activity_type_id"] = activity_type_id
        activity_dict["status"] = 1  # 1-未开始 2-进行中 3-已结束
        activity_dict["create_time"] = datetime.now()
        activity_dict["update_time"] = datetime.now()
        if activity_dict.get("tag") is None:
            activity_dict["tag"] = None

        db_activity = Activity(**activity_dict)
        db.add(db_activity)
        db.flush()

        for participant in participants:
            participant_dict = {
                "activity_id": db_activity.id,
                "participant_name": participant.participant_name,
                "identity_number": participant.identity_number or "",
                "phone": participant.phone,
                "create_time": datetime.now(),
                "update_time": datetime.now(),
                "user_id": getattr(participant, "user_id", None),
            }
            db_participant = ActivityParticipant(**participant_dict)
            db.add(db_participant)

        db.commit()
        db.refresh(db_activity)
        return db_activity
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))




def get_activity(db: Session, activity_id: int) -> Optional[Activity]:
    """Get a single activity by id"""
    return db.query(Activity).filter(Activity.id == activity_id).first()


def get_activities(
    db: Session,
    skip: int = 0,
    limit: int = 10,
    status: Optional[int] = None,
    allowed_activity_type_ids: Optional[List[int]] = None,
) -> tuple:
    """
    Get list of activities with optional filtering and pagination.
    allowed_activity_type_ids: 若为 None 表示不按类型过滤；若为 [] 表示超级管理员也不过滤；
    若为非空列表则仅返回 activity_type_id 在该列表中的活动（活动管理员可见范围）。
    """
    try:
        query = db.query(Activity)
        if status is not None:
            query = query.filter(Activity.status == status)
        if allowed_activity_type_ids is not None and len(allowed_activity_type_ids) > 0:
            query = query.filter(Activity.activity_type_id.in_(allowed_activity_type_ids))
        total = query.count()
        activities = query.order_by(desc(Activity.start_time)).offset(skip).limit(limit).all()
        return activities, total
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def update_activity_status(
    db: Session,
    activity_id: int,
    status: int
) -> Activity:
    """Update activity status and handle automatic status transitions"""
    try:
        db_activity = get_activity(db, activity_id)
        if not db_activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        
        current_time = datetime.now()
        
        # Automatic status transitions based on time
        if status == 2:  # Starting activity
            if current_time < db_activity.start_time:
                raise HTTPException(status_code=400, detail="Cannot start activity before start time")
        elif status == 3:  # Ending activity
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
    activity_update: ActivityUpdate
) -> Activity:
    """Update activity information"""
    try:
        db_activity = get_activity(db, activity_id)
        if not db_activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        
        update_data = activity_update.model_dump(exclude_unset=True)
        
        # Handle activity_type_name to activity_type_id conversion
        if "activity_type_name" in update_data:
            type_name = update_data.pop("activity_type_name")
            if type_name:
                t = crud_activity_type.get_or_create_by_name(db, type_name.strip())
                update_data["activity_type_id"] = t.id
        
        # Update fields
        for field, value in update_data.items():
            if value is not None:
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


def delete_activity(db: Session, activity_id: int) -> bool:
    """Delete an activity and its related participants"""
    try:
        db_activity = get_activity(db, activity_id)
        if not db_activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        
        # Delete related participants first
        db.query(ActivityParticipant).filter(
            ActivityParticipant.activity_id == activity_id
        ).delete()
        
        # Delete related check-in records
        db.query(CheckInRecord).filter(
            CheckInRecord.activity_id == activity_id
        ).delete()
        
        # Delete the activity
        db.delete(db_activity)
        db.commit()
        return True
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))