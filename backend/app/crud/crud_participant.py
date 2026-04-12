from datetime import datetime
from app.models.participant import ParticipantCreate, ParticipantResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError
from typing import List
from app.schemas import Activity, ActivityParticipant, CheckInRecord
from fastapi import HTTPException


def get_enrolled_count(db: Session, activity_id: int, tenant_id: int) -> int:
    """获取活动已报名人数（不含候补）"""
    return db.query(ActivityParticipant).filter(
        ActivityParticipant.activity_id == activity_id,
        ActivityParticipant.tenant_id == tenant_id,
        ActivityParticipant.enroll_status == 1  # 已报名
    ).count()


def get_waitlist_count(db: Session, activity_id: int, tenant_id: int) -> int:
    """获取活动候补人数"""
    return db.query(ActivityParticipant).filter(
        ActivityParticipant.activity_id == activity_id,
        ActivityParticipant.tenant_id == tenant_id,
        ActivityParticipant.enroll_status == 2  # 候补
    ).count()


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


def create_participant(
    db: Session,
    participant: ParticipantCreate,
    tenant_id: int,
    commit: bool = True,
) -> ActivityParticipant:
    """创建参与人（租户隔离），支持限额和候补"""
    try:
        activity = db.query(Activity).filter(
            Activity.id == participant.activity_id,
            Activity.tenant_id == tenant_id
        ).with_for_update().first()
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")

        existing_participant = False
        if participant.user_id is not None:
            existing_participant = get_participant_by_user(
                db, participant.activity_id, participant.user_id, tenant_id
            ) is not None
        if not existing_participant:
            existing_participant = check_participant_exists(
                db, participant.activity_id, participant.identity_number, tenant_id
            )
        if existing_participant:
            raise HTTPException(status_code=400, detail="Already registered")

        # 计算报名状态
        enroll_status = 1  # 默认已报名
        max_participants = activity.max_participants

        if max_participants is not None:
            # 有名额限制，检查当前已报名人数
            enrolled_count = get_enrolled_count(db, participant.activity_id, tenant_id)
            if enrolled_count >= max_participants:
                # 已满员，进入候补
                enroll_status = 2

        participant_data = participant.model_dump()
        participant_data["tenant_id"] = tenant_id
        participant_data["enroll_status"] = enroll_status

        db_participant = ActivityParticipant(**participant_data)
        db.add(db_participant)
        if commit:
            db.commit()
            db.refresh(db_participant)
        else:
            db.flush()
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
    if not identity_number:
        return False
    existing_participant = db.query(ActivityParticipant).filter(
        ActivityParticipant.activity_id == activity_id,
        ActivityParticipant.identity_number == identity_number,
        ActivityParticipant.tenant_id == tenant_id
    ).first()
        
    return existing_participant is not None


def get_participant_by_user(
    db: Session,
    activity_id: int,
    user_id: int,
    tenant_id: int,
) -> ActivityParticipant | None:
    """根据活动和用户查询参与记录"""
    return db.query(ActivityParticipant).filter(
        ActivityParticipant.activity_id == activity_id,
        ActivityParticipant.user_id == user_id,
        ActivityParticipant.tenant_id == tenant_id,
    ).first()
