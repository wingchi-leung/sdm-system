from app.models.checkin import CheckInCreate
from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import HTTPException
from typing import List, Optional

from app.schemas import CheckInRecord, Activity


def get_recent_checkins(
    db: Session,
    tenant_id: int,
    skip: int = 0,
    limit: int = 100,
    activity_id: Optional[int] = None,
) -> List[dict]:
    """获取签到记录列表（租户隔离）"""
    q = (
        db.query(CheckInRecord, Activity.activity_name)
        .join(Activity, CheckInRecord.activity_id == Activity.id)
        .filter(CheckInRecord.tenant_id == tenant_id)
        .order_by(desc(CheckInRecord.checkin_time))
    )
    if activity_id is not None:
        q = q.filter(CheckInRecord.activity_id == activity_id)
    rows = q.offset(skip).limit(limit).all()
    return [
        {
            "id": r.id,
            "activity_id": r.activity_id,
            "user_id": r.user_id,
            "name": r.name,
            "identity_number": r.identity_number,
            "phone": r.phone,
            "checkin_time": r.checkin_time,
            "has_attend": r.has_attend,
            "note": r.note,
            "create_time": r.create_time,
            "update_time": r.update_time,
            "activity_name": name or "",
        }
        for r, name in rows
    ]


def get_activity_checkins(
    db: Session,
    activity_id: int,
    tenant_id: int,
    skip: int = 0,
    limit: int = 100,
) -> List[CheckInRecord]:
    """获取活动的签到记录（租户隔离）"""
    return (
        db.query(CheckInRecord)
        .filter(
            CheckInRecord.activity_id == activity_id,
            CheckInRecord.tenant_id == tenant_id
        )
        .order_by(desc(CheckInRecord.checkin_time))
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_checkin(db: Session, checkin: CheckInCreate, tenant_id: int) -> CheckInRecord:
    """创建签到记录（租户隔离）"""
    try:
        activity = db.query(Activity).filter(
            Activity.id == checkin.activity_id,
            Activity.tenant_id == tenant_id
        ).first()
        if not activity:
            raise HTTPException(status_code=404, detail="找不到活动")
        if activity.status != 2:
            raise HTTPException(status_code=400, detail="活动不在有效期内！")
            
        existing_checkin = check_already_checkin(db, checkin.activity_id, checkin.identity_number, tenant_id)
        if existing_checkin:
            raise HTTPException(status_code=400, detail="Already checked in")
        
        checkin_data = checkin.model_dump()
        checkin_data["tenant_id"] = tenant_id
        db_checkin = CheckInRecord(**checkin_data)
        db.add(db_checkin)
        db.commit()
        db.refresh(db_checkin)
        return db_checkin
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def check_already_checkin(db: Session, activity_id: int, identity_number: str, tenant_id: int) -> bool:
    """检查是否已签到（租户隔离）"""
    existing_checkin = db.query(CheckInRecord).filter(
        CheckInRecord.activity_id == activity_id,
        CheckInRecord.identity_number == identity_number,
        CheckInRecord.tenant_id == tenant_id
    ).first()
    
    return existing_checkin is not None