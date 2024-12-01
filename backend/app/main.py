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
from app.core.config import settings
from app.api.v1.router import api_router


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.include_router(api_router, prefix=settings.API_V1_STR)


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)