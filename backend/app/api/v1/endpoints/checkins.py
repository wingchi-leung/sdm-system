from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_checkin 
from app.crud.crud_checkin import check_already_checkin

from app.models import checkin 
from app.api import deps

router = APIRouter()

# Check-in endpoints
@router.post("/checkin/", response_model=checkin.CheckInResponse)
def create_checkin(checkin: checkin.CheckInCreate, db: Session = Depends(deps.get_db)):
    # Verify participant exists
    if not crud_participant.check_participant_exists(db, checkin.activity_id, checkin.identity_number):
        raise HTTPException(status_code=404, detail="Participant not registered for this activity")
    
    # Check if already checked in
    if check_already_checkin(db, checkin.activity_id, checkin.identity_number):
        raise HTTPException(status_code=400, detail="Already checked in")
    
    return crud_checkin.create_checkin(db=db, checkin=checkin)