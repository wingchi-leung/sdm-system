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

# 管理员表（登录后台/管理功能用）；user_id 可选，关联 user 表表示该管理员对应哪个用户
class AdminUser(BaseModel):
    __tablename__ = "admin_user"
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    user_id = Column(Integer, nullable=True)  # 可选：关联 user.id


# 用户（isblock=1 表示黑名单，block_reason 为拉黑原因）
class User(BaseModel):
    __tablename__ = "user"
    name = Column(String(255))
    identity_number = Column(String(255), nullable=True)
    phone = Column(String(255))
    sex = Column(String(2))
    isblock = Column(Integer, default=0)  # 0-正常 1-拉黑
    block_reason = Column(String(255), nullable=True)  # 拉黑原因


#活动记录表
class Activity(BaseModel):
    __tablename__ = "activity"
    activity_name = Column(String(100))
    start_time = Column(DateTime, default=datetime.now)
    end_time = Column(DateTime, nullable=True)
    status = Column(Integer, default=1)  # 1-未开始，2-进行中，3-已结束
    tag = Column(String(255),nullable =True) 


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