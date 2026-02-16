from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_activity, crud_checkin, crud_participant
from app.models import activity, checkin
from app.api import deps




router = APIRouter()

@router.post("/", response_model=activity.ActivityResponse)
def create_activity(
    activity: activity.ActivityCreate,
    db: Session = Depends(deps.get_db),
    admin_id: int = Depends(deps.get_current_admin),
):
    return crud_activity.create_activity(db=db, activity=activity)



@router.get("/", response_model=activity.ActivityListResponse)
def list_activities(
    skip: int = 0,
    limit: int = 100,
    status: int = None,
    db: Session = Depends(deps.get_db)
):
    activities, total = crud_activity.get_activities(db, skip=skip, limit=limit, status=status)
    return {
        "items": activities,
        "total": total
    }


@router.get("/unstarted/", response_model=activity.ActivityListResponse)
def get_unstarted_activities(db: Session = Depends(deps.get_db)):
    activities, total = crud_activity.get_activities(db, status=1)  # 1-未开始
    return {
        "items": activities,
        "total": total
    }


@router.put("/{activity_id}/status")
def update_activity_status(activity_id: int, status: int, db: Session = Depends(deps.get_db)):
    activity = crud_activity.update_activity_status(db, activity_id, status)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return {"status": "success", "message": "Activity status updated"}



@router.get("/{activity_id}/checkins/", response_model=List[checkin.CheckInResponse])
def get_activity_checkins(activity_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(deps.get_db)):
    return crud_checkin.get_activity_checkins(db, activity_id, skip=skip, limit=limit)


@router.get("/{activity_id}/statistics/")
def get_activity_stats(activity_id: int, db: Session = Depends(deps.get_db)):
    return crud_participant.get_activity_statistics(db, activity_id)