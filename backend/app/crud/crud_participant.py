from .models import ActivityParticipant, Activity
from .schemas.participant import ParticipantCreate

def create_participant(db: Session, participant: ParticipantCreate) -> ActivityParticipant:
    try:
        # Verify activity exists
        activity = db.query(Activity).filter(Activity.id == participant.activity_id).first()
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")
            
        # Check for duplicate participant
        existing_participant = check_participant_exists(
            db, participant.activity_id, participant.identity_number
        )
        if existing_participant:
            raise HTTPException(status_code=400, detail="Already registered")
            
        db_participant = ActivityParticipant(**participant.model_dump())
        db.add(db_participant)
        db.commit()
        db.refresh(db_participant)
        return db_participant
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

def get_activity_statistics(db: Session, activity_id: int) -> dict:
    """Get comprehensive activity statistics"""
    try:
        activity = db.query(Activity).filter(Activity.id == activity_id).first()
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")
            
        total_participants = db.query(ActivityParticipant)\
            .filter(ActivityParticipant.activity_id == activity_id).count()
        
        total_checkins = db.query(CheckInRecord)\
            .filter(CheckInRecord.activity_id == activity_id).count()
        
        current_time = datetime.now()
        is_active = activity.status == 2 and (
            not activity.end_time or current_time <= activity.end_time
        )
        
        return {
            "activity_name": activity.activity_name,
            "status": activity.status,
            "is_active": is_active,
            "total_participants": total_participants,
            "total_checkins": total_checkins,
            "checkin_rate": round(total_checkins / total_participants * 100, 2) if total_participants > 0 else 0,
            "start_time": activity.start_time,
            "end_time": activity.end_time
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))