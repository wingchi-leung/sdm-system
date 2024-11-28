from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime
from typing import List, Optional
from fastapi import HTTPException
from app.models.activity import ActivityCreate 
from app.schemas import Activity

def create_activity(db: Session, activity: ActivityCreate) -> Activity:
    """Create a new activity record"""
    try:
        db_activity = Activity(**activity.model_dump())
        db.add(db_activity)
        db.commit()
        db.refresh(db_activity)
        return db_activity
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

def get_activities(
    db: Session, 
    skip: int = 0, 
    limit: int = 10,
    status: Optional[int] = None
) -> List[Activity]:
    """Get list of activities with optional filtering and pagination"""
    try:
        query = db.query(Activity)
        if status is not None:
            query = query.filter(Activity.status == status)
        
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