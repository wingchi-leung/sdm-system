from datetime import datetime
from app.models.participant import ParticipantCreate, ParticipantResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, IntegrityError
from typing import List
from app.schemas import Activity, ActivityParticipant, CheckInRecord
from fastapi import HTTPException


def get_activity_participants_with_count(
    db: Session,
    activity_id: int,
    tenant_id: int,
    skip: int = 0,
    limit: int = 10
) -> tuple:
    """获取活动参与人（租户隔离）"""
    try:
        activity = db.query(Activity).filter(
            Activity.id == activity_id,
            Activity.tenant_id == tenant_id
        ).first()
        if not activity:
            raise HTTPException(status_code=404, detail="找不到活动！")
            
        query = db.query(ActivityParticipant).filter(
            ActivityParticipant.activity_id == activity_id,
            ActivityParticipant.tenant_id == tenant_id
        )
            
        total = query.count()
        
        participants = query\
            .order_by(ActivityParticipant.create_time.desc())\
            .offset(skip)\
            .limit(limit)\
            .all()
            
        return participants, total
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def get_activity_participants(
    db: Session,
    activity_id: int,
    tenant_id: int,
    skip: int = 0,
    limit: int = 10
) -> List[ParticipantResponse]:
    """获取活动参与人列表（租户隔离）"""
    try:
        activity = db.query(Activity).filter(
            Activity.id == activity_id,
            Activity.tenant_id == tenant_id
        ).first()
        if not activity:
            raise HTTPException(status_code=404, detail="找不到活动！")
            
        query = db.query(ActivityParticipant).filter(
            ActivityParticipant.activity_id == activity_id,
            ActivityParticipant.tenant_id == tenant_id
        )
            
        total = query.count()
        
        participants = query\
            .order_by(ActivityParticipant.create_time.desc())\
            .offset(skip)\
            .limit(limit)\
            .all()
            
        return participants
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def create_participant(db: Session, participant: ParticipantCreate, tenant_id: int) -> ActivityParticipant:
    """创建参与人（租户隔离）"""
    try:
        activity = db.query(Activity).filter(
            Activity.id == participant.activity_id,
            Activity.tenant_id == tenant_id
        ).first()
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")

        existing_participant = check_participant_exists(
            db, participant.activity_id, participant.identity_number, tenant_id
        )
        if existing_participant:
            raise HTTPException(status_code=400, detail="Already registered")

        participant_data = participant.model_dump()
        participant_data["tenant_id"] = tenant_id
        db_participant = ActivityParticipant(**participant_data)
        db.add(db_participant)
        db.commit()
        db.refresh(db_participant)
        return db_participant
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Already registered")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def get_activity_statistics(db: Session, activity_id: int, tenant_id: int) -> dict:
    """获取活动统计（租户隔离）"""
    try:
        activity = db.query(Activity).filter(
            Activity.id == activity_id,
            Activity.tenant_id == tenant_id
        ).first()
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")
            
        total_participants = db.query(ActivityParticipant).filter(
            ActivityParticipant.activity_id == activity_id,
            ActivityParticipant.tenant_id == tenant_id
        ).count()
        
        total_checkins = db.query(CheckInRecord).filter(
            CheckInRecord.activity_id == activity_id,
            CheckInRecord.tenant_id == tenant_id
        ).count()
        
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


def check_participant_exists(db: Session, activity_id: int, identity_number: str, tenant_id: int) -> bool:
    """检查参与人是否存在（租户隔离）"""
    existing_participant = db.query(ActivityParticipant).filter(
        ActivityParticipant.activity_id == activity_id,
        ActivityParticipant.identity_number == identity_number,
        ActivityParticipant.tenant_id == tenant_id
    ).first()
        
    return existing_participant is not None