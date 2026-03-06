from sqlalchemy import Column, Integer, String, DateTime, func
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class TimestampModel:
    create_time = Column(DateTime, default=func.now(), nullable=False)
    update_time = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


#  自定义基础类，所有模型继承自该类
class BaseModel(Base, TimestampModel):
    __abstract__ = True  # 该模型不被映射到数据库

    id = Column(Integer, primary_key=True, autoincrement=True)

# 活动类型表（活动大类：参、健康锻炼等）
class ActivityType(BaseModel):
    __tablename__ = "activity_type"
    type_name = Column(String(64), unique=True, nullable=False, index=True)
    code = Column(String(32), nullable=True)


# 管理员表（登录后台/管理功能用）；user_id 可选，关联 user 表表示该管理员对应哪个用户
class AdminUser(BaseModel):
    __tablename__ = "admin_user"
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    user_id = Column(Integer, nullable=True)  # 可选：关联 user.id
    is_super_admin = Column(Integer, default=0, nullable=False)  # 1=超级管理员，0=活动管理员


# 管理员-活动类型授权（活动管理员可管理的类型）
class AdminActivityTypeRole(BaseModel):
    __tablename__ = "admin_activity_type_role"
    admin_user_id = Column(Integer, nullable=False, index=True)
    activity_type_id = Column(Integer, nullable=False, index=True)


# 用户（isblock=1 表示黑名单，block_reason 为拉黑原因）
# 支持微信授权登录：wx_openid 唯一标识小程序用户，微信登录用户 phone 存为 wx_{openid} 占位
class User(BaseModel):
    __tablename__ = "user"
    name = Column(String(255))
    identity_number = Column(String(255), nullable=True)
    phone = Column(String(255), unique=True, index=True)
    email = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=True)
    sex = Column(String(2))
    isblock = Column(Integer, default=0)  # 0-正常 1-拉黑
    block_reason = Column(String(255), nullable=True)
    wx_openid = Column(String(64), unique=True, nullable=True, index=True)  # 微信小程序 openid


# 活动记录表
class Activity(BaseModel):
    __tablename__ = "activity"
    activity_name = Column(String(100))
    activity_type_id = Column(Integer, nullable=True, index=True)  # 归属活动类型
    start_time = Column(DateTime, default=datetime.now)
    end_time = Column(DateTime, nullable=True)
    status = Column(Integer, default=1)  # 1-未开始，2-进行中，3-已结束
    tag = Column(String(255), nullable=True) 


#活动参与人表，user_id 可有可无
class ActivityParticipant(BaseModel):
    __tablename__ = "activity_participants"
    
    activity_id = Column(Integer)
    user_id = Column(Integer, nullable=True)
    participant_name = Column(String(255))
    identity_number = Column(String(255))
    phone = Column(String(255))

#活动签到表 - user_id 也是可有可无
class CheckInRecord(BaseModel):
    __tablename__ = "checkin_records"
    
    activity_id = Column(Integer)
    user_id = Column(Integer, nullable=True)
    name = Column(String(100))
    identity_number = Column(String(255))
    phone = Column(String(255))
    checkin_time = Column(DateTime, default=datetime.now) 
    has_attend =  Column(Integer, default=0) 
    note = Column(String(255))