from sqlalchemy import Column, Integer, String, DateTime, func
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class TimestampModel:
    create_time = Column(DateTime, default=func.now(), nullable=False)
    update_time = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class BaseModel(Base, TimestampModel):
    __abstract__ = True
    id = Column(Integer, primary_key=True, autoincrement=True)


# ============================================================
# 租户表
# ============================================================
class Tenant(BaseModel):
    __tablename__ = "tenant"
    name = Column(String(100), nullable=False)
    code = Column(String(32), unique=True, nullable=False, index=True)
    status = Column(Integer, default=1)  # 1-正常 0-禁用
    plan = Column(String(32), default='basic')
    max_admins = Column(Integer, default=5)
    max_activities = Column(Integer, default=100)
    expire_at = Column(DateTime, nullable=True)
    contact_name = Column(String(64), nullable=True)
    contact_phone = Column(String(32), nullable=True)


# ============================================================
# 活动类型表
# ============================================================
class ActivityType(BaseModel):
    __tablename__ = "activity_type"
    tenant_id = Column(Integer, nullable=False, index=True, default=1)
    type_name = Column(String(64), nullable=False, index=True)
    code = Column(String(32), nullable=True)


# ============================================================
# 管理员表
# ============================================================
class AdminUser(BaseModel):
    __tablename__ = "admin_user"
    tenant_id = Column(Integer, nullable=False, index=True, default=1)
    username = Column(String(64), nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    user_id = Column(Integer, nullable=True)
    is_super_admin = Column(Integer, default=0, nullable=False)


# ============================================================
# 管理员-活动类型授权
# ============================================================
class AdminActivityTypeRole(BaseModel):
    __tablename__ = "admin_activity_type_role"
    tenant_id = Column(Integer, nullable=False, index=True, default=1)
    admin_user_id = Column(Integer, nullable=False, index=True)
    activity_type_id = Column(Integer, nullable=False, index=True)


# ============================================================
# 用户表
# ============================================================
class User(BaseModel):
    __tablename__ = "user"
    tenant_id = Column(Integer, nullable=False, index=True, default=1)
    name = Column(String(255))
    identity_number = Column(String(255), nullable=True)
    identity_type = Column(String(20), nullable=True)
    phone = Column(String(255), index=True)
    email = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=True)
    sex = Column(String(2))
    age = Column(Integer, nullable=True)
    occupation = Column(String(100), nullable=True)
    industry = Column(String(100), nullable=True)
    isblock = Column(Integer, default=0)
    block_reason = Column(String(255), nullable=True)
    wx_openid = Column(String(64), nullable=True, index=True)


# ============================================================
# 活动表
# ============================================================
class Activity(BaseModel):
    __tablename__ = "activity"
    tenant_id = Column(Integer, nullable=False, index=True, default=1)
    activity_name = Column(String(100))
    activity_type_id = Column(Integer, nullable=True, index=True)
    start_time = Column(DateTime, default=datetime.now)
    end_time = Column(DateTime, nullable=True)
    status = Column(Integer, default=1)
    tag = Column(String(255), nullable=True)


# ============================================================
# 活动参与人表
# ============================================================
class ActivityParticipant(BaseModel):
    __tablename__ = "activity_participants"
    tenant_id = Column(Integer, nullable=False, index=True, default=1)
    activity_id = Column(Integer)
    user_id = Column(Integer, nullable=True)
    participant_name = Column(String(255))
    identity_number = Column(String(255))
    phone = Column(String(255))


# ============================================================
# 签到记录表
# ============================================================
class CheckInRecord(BaseModel):
    __tablename__ = "checkin_records"
    tenant_id = Column(Integer, nullable=False, index=True, default=1)
    activity_id = Column(Integer)
    user_id = Column(Integer, nullable=True)
    name = Column(String(100))
    identity_number = Column(String(255))
    phone = Column(String(255))
    checkin_time = Column(DateTime, default=datetime.now)
    has_attend = Column(Integer, default=0)
    note = Column(String(255))