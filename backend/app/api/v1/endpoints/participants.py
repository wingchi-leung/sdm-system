from fastapi import APIRouter, Depends, HTTPException,Query
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_participant
from app.models import participant 
from app.api import deps


router = APIRouter()


# Participant endpoints
@router.post("/", response_model=participant.ParticipantResponse)
def create_participant(participant: participant.ParticipantCreate, db: Session = Depends(deps.get_db)):
    # Check if participant already exists
    if crud_participant.check_participant_exists(db, participant.activity_id, participant.identity_number):
        raise HTTPException(status_code=400, detail="Participant already registered")
    return crud.create_participant(db=db, participant=participant)


    
@router.get("/{activity_id}/participants/", response_model=participant.ParticipantListResponse)
def get_activity_participants(
    activity_id: int, 
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(deps.get_db)
):
    """
    Get paginated list of participants for a specific activity
    Returns both participants data and total count
    """
    try:
        participants, total = crud_participant.get_activity_participants(
            db, 
            activity_id=activity_id, 
            skip=skip, 
            limit=limit
        )
        
        return ParticipantListResponse(
            total=total,
            participants=participants,
            page=skip // limit + 1,
            size=limit,
            pages=(total + limit - 1) // limit
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))