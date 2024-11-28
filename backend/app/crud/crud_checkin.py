from app.models.checkin import  CheckInCreate
from sqlalchemy.orm import Session

from app.schemas import CheckInRecord



def create_checkin(db: Session, checkin: CheckInCreate) -> CheckInRecord:
    try:
        # Verify activity exists and is active
        activity = db.query(Activity).filter(Activity.id == checkin.activity_id).first()
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        if activity.status != 2:
            raise HTTPException(status_code=400, detail="Activity is not in progress")
            
        # Check for duplicate check-in
        existing_checkin = check_already_checkin(db, checkin.activity_id, checkin.identity_number)
        if existing_checkin:
            raise HTTPException(status_code=400, detail="Already checked in")
            
        db_checkin = CheckInRecord(**checkin.model_dump())
        db.add(db_checkin)
        db.commit()
        db.refresh(db_checkin)
        return db_checkin
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))