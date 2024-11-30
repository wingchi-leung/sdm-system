from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from app.database  import SessionLocal, engine
from app.crud  import crud_activity, crud_user, crud_checkin 
from app.models import user, participant,checkin, activity
from fastapi import FastAPI, HTTPException, Depends
from fastapi import Query
from app.crud import crud_participant
from app.schemas import ActivityParticipant
from app.models.participant import ParticipantListResponse


app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# User endpoints
@app.post("/createUser/", response_model=user.UserResponse)
def create_user(user: user.UserCreate, db: Session = Depends(get_db)):
    return crud_user.create_user(db=db, user=user)



@app.get("/users/{user_id}", response_model=user.UserResponse)
def read_user(user_id: int, db: Session = Depends(get_db)):
    db_user = crud_user.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.get("/userLists", response_model=list[user.UserResponse])
def get_user_lists(db: Session = Depends(get_db)):
    try:
        return crud_user.get_users(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Activity endpoints
@app.post("/create-activity/", response_model=activity.ActivityResponse)
def create_activity(activity: activity.ActivityCreate, db: Session = Depends(get_db)):
    return crud_activity.create_activity(db=db, activity=activity)


@app.get("/unstarted-activities/", response_model=List[activity.ActivityResponse])
def get_unstarted_activities(db: Session = Depends(get_db)):
    return crud_activity.get_activities(db, status=1)[0]  # status 1 = unstarted


@app.get("/activities/", response_model=List[activity.ActivityResponse])
def list_activities(
    skip: int = 0, 
    limit: int = 100, 
    status: int = None, 
    db: Session = Depends(get_db)
):
    activities = crud_activity.get_activities(db, skip=skip, limit=limit, status=status)
    return activities

@app.put("/activities/{activity_id}/status")
def update_activity_status(activity_id: int, status: int, db: Session = Depends(get_db)):
    activity = crud_activity.update_activity_status(db, activity_id, status)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return {"status": "success", "message": "Activity status updated"}

# Participant endpoints
@app.post("/participants/", response_model=participant.ParticipantResponse)
def create_participant(participant: participant.ParticipantCreate, db: Session = Depends(get_db)):
    # Check if participant already exists
    if crud.check_participant_exists(db, participant.activity_id, participant.identity_number):
        raise HTTPException(status_code=400, detail="Participant already registered")
    return crud.create_participant(db=db, participant=participant)
@app.get("/activities/{activity_id}/participants/", response_model=ParticipantListResponse)
def get_activity_participants(
    activity_id: int, 
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db)
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

# Check-in endpoints
@app.post("/checkin/", response_model=checkin.CheckInResponse)
def create_checkin(checkin: checkin.CheckInCreate, db: Session = Depends(get_db)):
    # Verify participant exists
    if not crud.check_participant_exists(db, checkin.activity_id, checkin.identity_number):
        raise HTTPException(status_code=404, detail="Participant not registered for this activity")
    
    # Check if already checked in
    if crud.check_already_checkin(db, checkin.activity_id, checkin.identity_number):
        raise HTTPException(status_code=400, detail="Already checked in")
    
    return crud.create_checkin(db=db, checkin=checkin)

@app.get("/activities/{activity_id}/checkins/", response_model=List[checkin.CheckInResponse])
def get_activity_checkins(activity_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    checkins = crud.get_activity_checkins(db, activity_id, skip=skip, limit=limit)
    return checkins

# Statistics endpoint
@app.get("/activities/{activity_id}/statistics/")
def get_activity_stats(activity_id: int, db: Session = Depends(get_db)):
    return crud.get_activity_statistics(db, activity_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)