"""
会员权限辅助函数
"""
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional

from app.schemas import User, MemberType, MemberTypeActivityType


def get_user_member_type(db: Session, user: User) -> Optional[MemberType]:
    """
    获取用户有效的会员类型
    处理会员过期的情况
    """
    if not user.member_type_id:
        return get_default_member_type(db, user.tenant_id)
    
    # 检查是否过期
    if user.member_expire_at and user.member_expire_at < datetime.now():
        # 已过期，返回默认会员类型
        return get_default_member_type(db, user.tenant_id)
    
    # 获取会员类型
    member_type = db.query(MemberType).filter(
        MemberType.id == user.member_type_id,
        MemberType.tenant_id == user.tenant_id
    ).first()
    
    if not member_type:
        return get_default_member_type(db, user.tenant_id)
    
    return member_type


def get_default_member_type(db: Session, tenant_id: int) -> Optional[MemberType]:
    """
    获取默认会员类型（普通会员）
    """
    member_type = db.query(MemberType).filter(
        MemberType.tenant_id == tenant_id,
        MemberType.is_default == 1
    ).first()
    
    if not member_type:
        # 如果没有默认，获取第一个
        member_type = db.query(MemberType).filter(
            MemberType.tenant_id == tenant_id
        ).first()
    
    return member_type


def get_member_allowed_activity_types(db: Session, member_type_id: int) -> List[int]:
    """
    获取会员类型可访问的活动类型ID列表
    """
    relations = db.query(MemberTypeActivityType).filter(
        MemberTypeActivityType.member_type_id == member_type_id
    ).all()
    
    return [r.activity_type_id for r in relations]


def get_user_allowed_activity_types(db: Session, user: User) -> List[int]:
    """
    获取用户可访问的活动类型ID列表
    """
    member_type = get_user_member_type(db, user)
    
    if not member_type:
        return []
    
    return get_member_allowed_activity_types(db, member_type.id)


def can_user_access_activity_type(db: Session, user: User, activity_type_id: int) -> bool:
    """
    检查用户是否可访问某类型活动
    """
    allowed_ids = get_user_allowed_activity_types(db, user)
    
    # 如果没有配置任何活动类型，默认允许访问
    if not allowed_ids:
        return True
    
    return activity_type_id in allowed_ids


def set_user_member(
    db: Session, 
    user_id: int, 
    tenant_id: int,
    member_type_id: int,
    member_expire_at: Optional[datetime] = None
) -> User:
    """
    设置用户会员类型
    """
    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id
    ).first()
    
    if not user:
        raise ValueError("用户不存在")
    
    user.member_type_id = member_type_id
    user.member_expire_at = member_expire_at
    db.commit()
    db.refresh(user)
    
    return user


def set_default_member_for_new_user(db: Session, user: User) -> User:
    """
    为新用户设置默认会员类型
    """
    default_member = get_default_member_type(db, user.tenant_id)
    
    if default_member:
        user.member_type_id = default_member.id
        user.member_expire_at = None  # 永久有效
        db.commit()
        db.refresh(user)
    
    return user