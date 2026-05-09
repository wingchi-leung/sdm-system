from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from typing import List, Optional
from fastapi import HTTPException
from app.schemas import UserActivityType


def create_user_activity_type(
    db: Session,
    user_id: int,
    activity_type_id: int,
    tenant_id: int,
) -> UserActivityType:
    """创建用户与活动类型的关联"""
    try:
        existing = db.query(UserActivityType).filter(
            UserActivityType.user_id == user_id,
            UserActivityType.activity_type_id == activity_type_id,
            UserActivityType.tenant_id == tenant_id,
        ).first()
        if existing:
            return existing

        db_obj = UserActivityType(
            user_id=user_id,
            activity_type_id=activity_type_id,
            tenant_id=tenant_id,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def create_user_activity_types_batch(
    db: Session,
    user_id: int,
    activity_type_ids: List[int],
    tenant_id: int,
) -> List[UserActivityType]:
    """批量创建用户与活动类型的关联"""
    try:
        results = []
        for activity_type_id in activity_type_ids:
            obj = create_user_activity_type(db, user_id, activity_type_id, tenant_id)
            results.append(obj)
        return results
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def get_user_activity_type_ids(
    db: Session,
    user_id: int,
    tenant_id: int,
) -> List[int]:
    """获取用户关联的所有活动类型ID列表"""
    results = db.query(UserActivityType.activity_type_id).filter(
        UserActivityType.user_id == user_id,
        UserActivityType.tenant_id == tenant_id,
    ).all()
    return [r[0] for r in results]


def get_user_activity_types(
    db: Session,
    user_id: int,
    tenant_id: int,
    skip: int = 0,
    limit: int = 100,
) -> tuple:
    """获取用户关联的活动类型列表"""
    query = db.query(UserActivityType).filter(
        UserActivityType.user_id == user_id,
        UserActivityType.tenant_id == tenant_id,
    )
    total = query.count()
    items = query.order_by(desc(UserActivityType.create_time)).offset(skip).limit(limit).all()
    return items, total


def delete_user_activity_type(
    db: Session,
    user_id: int,
    activity_type_id: int,
    tenant_id: int,
) -> bool:
    """删除用户与活动类型的关联"""
    try:
        result = db.query(UserActivityType).filter(
            UserActivityType.user_id == user_id,
            UserActivityType.activity_type_id == activity_type_id,
            UserActivityType.tenant_id == tenant_id,
        ).delete()
        db.commit()
        return result > 0
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def delete_user_activity_types_batch(
    db: Session,
    user_id: int,
    activity_type_ids: List[int],
    tenant_id: int,
) -> int:
    """批量删除用户与活动类型的关联"""
    try:
        result = db.query(UserActivityType).filter(
            UserActivityType.user_id == user_id,
            UserActivityType.activity_type_id.in_(activity_type_ids),
            UserActivityType.tenant_id == tenant_id,
        ).delete(synchronize_session=False)
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def get_users_by_activity_type(
    db: Session,
    activity_type_id: int,
    tenant_id: int,
    skip: int = 0,
    limit: int = 100,
) -> tuple:
    """获取某活动类型关联的所有用户"""
    query = db.query(UserActivityType).filter(
        UserActivityType.activity_type_id == activity_type_id,
        UserActivityType.tenant_id == tenant_id,
    )
    total = query.count()
    items = query.order_by(desc(UserActivityType.create_time)).offset(skip).limit(limit).all()
    return items, total