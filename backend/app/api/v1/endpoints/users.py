
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_user
from app.api import deps
from app.models import user 


router = APIRouter()


# User endpoints
@router.post("/", response_model=user.UserResponse)   
def create_user(user: user.UserCreate, db: Session = Depends(deps.get_db)):
    return crud_user.create_user(db=db, user=user)

@router.get("/{user_id}", response_model=user.UserResponse)
def read_user(user_id: int, db: Session = Depends(deps.get_db)):
    db_user = crud_user.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@router.get("/", response_model=List[user.UserResponse])   
def get_users(db: Session = Depends(deps.get_db)):
    try:
        return crud_user.get_users(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))