from sqlalchemy import Column, Integer, String, DateTime, Text, func, UniqueConstraint
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
    tenant_id = Column(Integer, nullable=False, index=True)
    type_name = Column(String(64), nullable=False, index=True)
    code = Column(String(32), nullable=True)


# ============================================================
# 管理员认证表（仅用于登录）
# ============================================================
class AdminUser(BaseModel):
    __tablename__ = "admin_user"
    tenant_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    username = Column(String(64), nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)


# ============================================================
# 用户表
# ============================================================
class User(BaseModel):
    __tablename__ = "user"
    __table_args__ = (
        UniqueConstraint('phone', 'tenant_id', name='uk_user_phone'),
        UniqueConstraint('email', 'tenant_id', name='uk_user_email'),
    )
    tenant_id = Column(Integer, nullable=False, index=True)
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
    tenant_id = Column(Integer, nullable=False, index=True)
    activity_name = Column(String(100))
    activity_type_id = Column(Integer, nullable=True, index=True)
    start_time = Column(DateTime, default=datetime.now)
    end_time = Column(DateTime, nullable=True)
    status = Column(Integer, default=1)
    tag = Column(String(255), nullable=True)
    suggested_fee = Column(Integer, default=0)       # 建议费用（分），0 表示免费
    require_payment = Column(Integer, default=0)    # 是否需要支付：0-否 1-是
    poster_url = Column(String(500), nullable=True)  # 活动海报图片URL
    location = Column(String(255), nullable=True)    # 活动地点（为空则表示线上活动）
    max_participants = Column(Integer, nullable=True)  # 最大参与人数，NULL 表示无限制


# ============================================================
# 活动参与人表
# ============================================================
class ActivityParticipant(BaseModel):
    __tablename__ = "activity_participants"
    __table_args__ = (
        UniqueConstraint('activity_id', 'identity_number', 'tenant_id', name='uk_participant_unique'),
        UniqueConstraint('activity_id', 'user_id', 'tenant_id', name='uk_participant_user_unique'),
    )
    tenant_id = Column(Integer, nullable=False, index=True)
    activity_id = Column(Integer, index=True)
    user_id = Column(Integer, nullable=True)
    participant_name = Column(String(255))
    identity_number = Column(String(255), index=True)
    phone = Column(String(255))
    enroll_status = Column(Integer, default=1)      # 报名状态：1-已报名 2-候补
    payment_status = Column(Integer, default=0)     # 0-无需支付 1-待支付 2-已支付
    payment_order_id = Column(Integer, nullable=True)
    paid_amount = Column(Integer, default=0)        # 实际支付金额（分）
    # 用户信息字段（从用户资料获取）
    sex = Column(String(2), nullable=True)
    age = Column(Integer, nullable=True)
    occupation = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    industry = Column(String(100), nullable=True)
    identity_type = Column(String(20), nullable=True)
    # 问卷字段
    why_join = Column(String(500), nullable=True)           # 为什么要参与
    channel = Column(String(255), nullable=True)            # 了解此活动的渠道/推荐人
    expectation = Column(String(500), nullable=True)        # 学习期望
    activity_understanding = Column(String(255), nullable=True)  # 是否了解活动（一句话描述）
    has_questions = Column(String(500), nullable=True)      # 是否有问题


# ============================================================
# 签到记录表
# ============================================================
class CheckInRecord(BaseModel):
    __tablename__ = "checkin_records"
    __table_args__ = (
        UniqueConstraint('activity_id', 'identity_number', 'tenant_id', name='uk_checkin_unique'),
    )
    tenant_id = Column(Integer, nullable=False, index=True)
    activity_id = Column(Integer, index=True)
    user_id = Column(Integer, nullable=True)
    name = Column(String(100))
    identity_number = Column(String(255), index=True)
    phone = Column(String(255))
    checkin_time = Column(DateTime, default=datetime.now)
    has_attend = Column(Integer, default=0)
    note = Column(String(255))


# ============================================================
# 支付订单表
# ============================================================
class PaymentOrder(BaseModel):
    __tablename__ = "payment_order"
    tenant_id = Column(Integer, nullable=False, index=True)
    order_no = Column(String(64), unique=True, nullable=False, index=True)   # 商户订单号
    transaction_id = Column(String(64), nullable=True, index=True)           # 微信交易号
    activity_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    participant_id = Column(Integer, nullable=True, index=True)
    participant_name = Column(String(255), nullable=True)   # 报名人姓名
    phone = Column(String(255), nullable=True)              # 报名人手机号
    participant_snapshot = Column(Text, nullable=True)      # 报名信息快照(JSON)
    suggested_fee = Column(Integer, nullable=False)      # 建议费用（分）
    actual_fee = Column(Integer, nullable=False)         # 实际支付金额（分）
    status = Column(Integer, default=0, index=True)      # 0-待支付 1-成功 2-失败 3-关闭
    openid = Column(String(64), nullable=True)            # 付款用户 openid
    prepay_id = Column(String(128), nullable=True)        # 预支付ID
    paid_at = Column(DateTime, nullable=True)             # 支付成功时间
    expire_at = Column(DateTime, nullable=False)          # 过期时间
    callback_raw = Column(String(2000), nullable=True)    # 回调原始数据


# ============================================================
# RBAC 权限系统
# ============================================================
class Permission(BaseModel):
    __tablename__ = "permission"
    code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    resource = Column(String(32), nullable=False, index=True)
    action = Column(String(32), nullable=False)
    description = Column(String(500), nullable=True)


class Role(BaseModel):
    __tablename__ = "role"
    tenant_id = Column(Integer, nullable=False, index=True)
    name = Column(String(64), nullable=False, index=True)
    is_system = Column(Integer, default=0, nullable=False)
    description = Column(String(500), nullable=True)


class RolePermission(BaseModel):
    __tablename__ = "role_permission"
    role_id = Column(Integer, nullable=False, index=True)
    permission_id = Column(Integer, nullable=False, index=True)


class UserRole(BaseModel):
    __tablename__ = "user_role"
    user_id = Column(Integer, nullable=False, index=True)
    role_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    scope_type = Column(String(32), nullable=True)
    scope_id = Column(Integer, nullable=True)
