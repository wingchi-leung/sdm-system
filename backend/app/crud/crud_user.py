from app.models.user import UserCreate 
from sqlalchemy.orm import Session
from app.schemas import User
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, Depends


def create_user(db: Session, user: UserCreate) -> User:
    try:
        # Check for existing user with same identity number
        existing_user = db.query(User)\
            .filter(User.identity_number == user.identity_number)\
            .first()
        if existing_user:
            raise HTTPException(
                status_code=400, 
                detail="User with this identity number already exists"
            )
            
        db_user = User(**user.model_dump())
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))