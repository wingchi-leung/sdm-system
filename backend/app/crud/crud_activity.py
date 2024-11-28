from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime
from typing import List, Optional
from fastapi import HTTPException
from app.models.activity import ActivityCreate 
from app.schemas import Activity
from app.schemas import ActivityParticipant 


def create_activity(db: Session, activity: ActivityCreate) -> Activity:
    """Create a new activity record with participants"""
    try:
        # Extract participants data
        participants = activity.participants
        
        # Create activity
        activity_dict = activity.model_dump(exclude={'participants'})
        activity_dict['status'] = 1  # Set initial status as "未开始"
        activity_dict['create_time'] = datetime.now()
        activity_dict['update_time'] = datetime.now()
        
        db_activity = Activity(**activity_dict)
        db.add(db_activity)
        db.flush()  # This gets us the activity_id without committing
        
        # Create participants
        for participant in participants:
            participant_dict = {
                'activity_id': db_activity.id,
                'participant_name': participant.participant_name,
                'identity_number': participant.identity_number,
                'phone': participant.phone,
                'create_time': datetime.now(),
                'update_time': datetime.now()
            }
            db_participant = ActivityParticipant(**participant_dict)
            db.add(db_participant)
        
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