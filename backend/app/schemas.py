from sqlalchemy import Column, Integer, String, DateTime, Text, SmallInteger, func, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import object_session
from datetime import datetime

from app.core.pii import (
    blind_index,
    decrypt_pii,
    encrypt_pii,
    identity_last4,
    mask_phone,
    normalize_optional_text,
)

Base = declarative_base()


class TimestampModel:
    create_time = Column(DateTime, default=func.now(), nullable=False)
    update_time = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class BaseModel(Base, TimestampModel):
    __abstract__ = True
    id = Column(Integer, primary_key=True, autoincrement=True)


class EncryptedContactMixin:
    phone_hash = Column(String(64), nullable=True, index=True)
    phone_masked = Column(String(32), nullable=True)

    @property
    def phone(self):
        return decrypt_pii(getattr(self, "_phone_ciphertext", None))

    @phone.setter
    def phone(self, value):
        normalized = normalize_optional_text(value)
        self._phone_ciphertext = encrypt_pii(normalized)
        self.phone_hash = blind_index(normalized, purpose="phone")
        self.phone_masked = mask_phone(normalized)


class EncryptedIdentityMixin:
    identity_number_hash = Column(String(64), nullable=True, index=True)
    identity_last4 = Column(String(8), nullable=True)

    @property
    def identity_number(self):
        return decrypt_pii(getattr(self, "_identity_number_ciphertext", None))

    @identity_number.setter
    def identity_number(self, value):
        normalized = normalize_optional_text(value)
        self._identity_number_ciphertext = encrypt_pii(normalized)
        self.identity_number_hash = blind_index(normalized, purpose="identity_number")
        self.identity_last4 = identity_last4(normalized)


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
# 用户表
# ============================================================
class User(BaseModel, EncryptedContactMixin, EncryptedIdentityMixin):
    __tablename__ = "user"
    __table_args__ = (
        UniqueConstraint('phone_hash', 'tenant_id', name='uk_user_phone'),
        UniqueConstraint('email_hash', 'tenant_id', name='uk_user_email'),
    )
    tenant_id = Column(Integer, nullable=False, index=True)
    _name_ciphertext = Column("name", String(1024))
    _identity_number_ciphertext = Column("identity_number", String(1024), nullable=True)
    identity_type = Column(String(20), nullable=True)
    _phone_ciphertext = Column("phone", String(1024), nullable=True)
    _email_ciphertext = Column("email", String(1024), nullable=True)
    email_hash = Column(String(64), nullable=True, index=True)
    sex = Column(String(2))
    age = Column(Integer, nullable=True)
    occupation = Column(String(100), nullable=True)
    industry = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    isblock = Column(Integer, default=0)
    block_reason = Column(String(255), nullable=True)

    @property
    def name(self):
        return decrypt_pii(self._name_ciphertext)

    @name.setter
    def name(self, value):
        self._name_ciphertext = encrypt_pii(value)

    @property
    def email(self):
        return decrypt_pii(self._email_ciphertext)

    @email.setter
    def email(self, value):
        normalized = normalize_optional_text(value)
        self._email_ciphertext = encrypt_pii(normalized)
        self.email_hash = blind_index(normalized, purpose="email")

    @property
    def wx_openid(self):
        session = object_session(self)
        if session is None or self.id is None:
            return getattr(self, "_pending_wx_openid", None)
        credential = session.query(UserCredential).filter(
            UserCredential.user_id == self.id,
            UserCredential.tenant_id == self.tenant_id,
            UserCredential.credential_type == "wechat",
            UserCredential.status == 1,
        ).first()
        return credential.identifier if credential else getattr(self, "_pending_wx_openid", None)

    @wx_openid.setter
    def wx_openid(self, value):
        self._pending_wx_openid = value
        session = object_session(self)
        if session is None or self.id is None:
            return
        credential = session.query(UserCredential).filter(
            UserCredential.user_id == self.id,
            UserCredential.tenant_id == self.tenant_id,
            UserCredential.credential_type == "wechat",
        ).first()
        if value:
            if credential is None:
                credential = UserCredential(
                    user_id=self.id,
                    tenant_id=self.tenant_id,
                    credential_type="wechat",
                    identifier=value,
                    status=1,
                )
                session.add(credential)
            else:
                credential.identifier = value
                credential.status = 1
        elif credential is not None:
            session.delete(credential)

    @property
    def password_hash(self):
        session = object_session(self)
        if session is None or self.id is None:
            return getattr(self, "_pending_password_hash", None)
        credential = session.query(UserCredential).filter(
            UserCredential.user_id == self.id,
            UserCredential.tenant_id == self.tenant_id,
            UserCredential.credential_type == "password",
            UserCredential.status == 1,
        ).first()
        return credential.credential_hash if credential else getattr(self, "_pending_password_hash", None)

    @password_hash.setter
    def password_hash(self, value):
        self._pending_password_hash = value
        session = object_session(self)
        if session is None or self.id is None:
            return
        credential = session.query(UserCredential).filter(
            UserCredential.user_id == self.id,
            UserCredential.tenant_id == self.tenant_id,
            UserCredential.credential_type == "password",
        ).first()
        if value:
            if credential is None:
                credential = UserCredential(
                    user_id=self.id,
                    tenant_id=self.tenant_id,
                    credential_type="password",
                    identifier=self.phone or f"user:{self.id}",
                    credential_hash=value,
                    must_reset_password=0,
                    status=1,
                )
                session.add(credential)
            else:
                credential.identifier = self.phone or credential.identifier
                credential.credential_hash = value
                credential.status = 1
        elif credential is not None:
            session.delete(credential)


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
    activity_intro = Column(String(1000), nullable=True)  # 活动介绍（最多1000字）
    max_participants = Column(Integer, nullable=True)  # 最大参与人数，NULL 表示无限制
    is_public = Column(Integer, default=0)           # 是否公开：0-否 1-是（所有用户可见）


# ============================================================
# 活动参与人表
# ============================================================
class ActivityParticipant(BaseModel):
    __tablename__ = "activity_participants"
    __table_args__ = (
        UniqueConstraint('activity_id', 'user_id', 'tenant_id', name='uk_participant_user_unique'),
    )
    tenant_id = Column(Integer, nullable=False, index=True)
    activity_id = Column(Integer, index=True)
    user_id = Column(Integer, nullable=True)
    _participant_name_ciphertext = Column("participant_name", String(1024))
    enroll_status = Column(Integer, default=1)      # 报名状态：1-已报名 2-候补
    review_status = Column(Integer, default=1)      # 审核状态：0-待审核 1-通过 2-拒绝
    review_reason = Column(String(255), nullable=True)
    reviewed_by = Column(Integer, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    payment_status = Column(Integer, default=0)     # 0-无需支付 1-待支付 2-已支付
    payment_order_id = Column(Integer, nullable=True)
    paid_amount = Column(Integer, default=0)        # 实际支付金额（分）
    # 问卷字段
    why_join = Column(String(500), nullable=True)           # 为什么要参与
    channel = Column(String(255), nullable=True)            # 了解此活动的渠道/推荐人
    expectation = Column(String(500), nullable=True)        # 学习期望
    activity_understanding = Column(String(255), nullable=True)  # 是否了解活动（一句话描述）
    has_questions = Column(String(500), nullable=True)      # 是否有问题

    @property
    def participant_name(self):
        return decrypt_pii(self._participant_name_ciphertext)

    @participant_name.setter
    def participant_name(self, value):
        self._participant_name_ciphertext = encrypt_pii(value)


# ============================================================
# 签到记录表
# ============================================================
class CheckInRecord(BaseModel):
    __tablename__ = "checkin_records"
    __table_args__ = (
        UniqueConstraint('activity_id', 'user_id', 'tenant_id', name='uk_checkin_unique'),
    )
    tenant_id = Column(Integer, nullable=False, index=True)
    activity_id = Column(Integer, index=True)
    user_id = Column(Integer, nullable=True)
    name = Column(String(100), nullable=True)
    phone = Column(String(255), nullable=True)
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
    suggested_fee = Column(Integer, nullable=False)      # 建议费用（分）
    actual_fee = Column(Integer, nullable=False)         # 实际支付金额（分）
    status = Column(Integer, default=0, index=True)      # 0-待支付 1-成功 2-失败 3-关闭
    openid = Column(String(64), nullable=True)            # 付款用户 openid
    prepay_id = Column(String(128), nullable=True)        # 预支付ID
    paid_at = Column(DateTime, nullable=True)             # 支付成功时间
    refund_status = Column(Integer, default=0, index=True)  # 退款状态：0-无退款 1-待退款 2-处理中 3-成功 4-失败 5-关闭
    refund_amount = Column(Integer, default=0)             # 退款金额（分）
    refund_apply_by = Column(Integer, nullable=True)       # 退款操作人
    refund_apply_at = Column(DateTime, nullable=True)      # 退款申请时间
    refund_success_at = Column(DateTime, nullable=True)    # 退款成功时间
    refund_fail_reason = Column(String(255), nullable=True)
    expire_at = Column(DateTime, nullable=False)          # 过期时间
    callback_raw = Column(String(2000), nullable=True)    # 回调原始数据


class PaymentRefund(BaseModel):
    __tablename__ = "payment_refund"
    __table_args__ = (
        UniqueConstraint("tenant_id", "out_refund_no", name="uk_refund_out_refund_no"),
    )
    tenant_id = Column(Integer, nullable=False, index=True)
    payment_order_id = Column(Integer, nullable=False, index=True)
    participant_id = Column(Integer, nullable=True, index=True)
    out_refund_no = Column(String(64), nullable=False, index=True)
    wechat_refund_id = Column(String(64), nullable=True, index=True)
    amount = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="pending", index=True)
    idempotency_key = Column(String(128), nullable=False)
    operator_id = Column(Integer, nullable=True, index=True)
    reason = Column(String(255), nullable=True)
    request_raw = Column(Text, nullable=True)
    callback_raw = Column(Text, nullable=True)
    fail_reason = Column(String(255), nullable=True)


class MessageTask(BaseModel):
    __tablename__ = "message_task"
    __table_args__ = (
        UniqueConstraint("tenant_id", "scene", "biz_id", "user_id", name="uk_message_task_scene_biz_user"),
    )
    tenant_id = Column(Integer, nullable=False, index=True)
    scene = Column(String(64), nullable=False, index=True)
    biz_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    openid = Column(String(64), nullable=False)
    template_id = Column(String(64), nullable=False)
    payload_json = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="pending", index=True)
    retry_count = Column(Integer, nullable=False, default=0)
    max_retry = Column(Integer, nullable=False, default=5)
    next_retry_at = Column(DateTime, nullable=True, index=True)
    last_error = Column(String(255), nullable=True)
    sent_at = Column(DateTime, nullable=True)


class SubscribeConsent(BaseModel):
    __tablename__ = "subscribe_consent"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", "template_id", name="uk_subscribe_consent_user_template"),
    )
    tenant_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    template_id = Column(String(64), nullable=False)
    accept_status = Column(String(16), nullable=False)
    accept_time = Column(DateTime, nullable=True)
    source_page = Column(String(255), nullable=True)


# ============================================================
# 社区文章表
# ============================================================
class CommunityPost(BaseModel):
    __tablename__ = "community_post"
    tenant_id = Column(Integer, nullable=False, index=True)
    activity_id = Column(Integer, nullable=True, index=True)
    # channel_id:Phase 2 新增,与 activity_id 互斥(频道帖子归属);DDL 索引在 field.sql
    channel_id = Column(Integer, nullable=True, index=True)
    author_user_id = Column(Integer, nullable=False, index=True)
    title = Column(String(120), nullable=False)
    content = Column(Text, nullable=False)
    # content_format:Phase 2 新增,text/html/blocks;DDL 升 MEDIUMTEXT 在 field.sql
    content_format = Column(String(16), nullable=False, default="text")
    images = Column(Text, nullable=True)
    status = Column(SmallInteger, default=1, nullable=False, index=True)


# ============================================================
# 社区评论表
# ============================================================
class CommunityComment(BaseModel):
    __tablename__ = "community_comment"
    tenant_id = Column(Integer, nullable=False, index=True)
    activity_id = Column(Integer, nullable=False, index=True)
    post_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    content = Column(Text, nullable=False)
    images = Column(Text, nullable=True)
    status = Column(SmallInteger, default=1, nullable=False, index=True)


class CommunityChannel(BaseModel):
    __tablename__ = "community_channel"
    tenant_id = Column(Integer, nullable=False, index=True)
    name = Column(String(64), nullable=False)
    description = Column(String(500), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    admin_user_id = Column(Integer, nullable=False, index=True)
    invite_code = Column(String(32), nullable=True, index=True)
    invite_code_expire_at = Column(DateTime, nullable=True)
    status = Column(SmallInteger, default=1, nullable=False, index=True)


class CommunityChannelMember(BaseModel):
    __tablename__ = "community_channel_member"
    __table_args__ = (
        UniqueConstraint("channel_id", "user_id", name="uk_channel_member"),
    )
    channel_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    role = Column(String(20), nullable=False, default="member")
    status = Column(String(20), nullable=False, default="active")
    invited_by = Column(Integer, nullable=True)
    joined_at = Column(DateTime, nullable=True)


class CommunityNotification(BaseModel):
    __tablename__ = "community_notification"
    tenant_id = Column(Integer, nullable=False, index=True)
    recipient_user_id = Column(Integer, nullable=False, index=True)
    type = Column(String(32), nullable=False, index=True)
    title = Column(String(120), nullable=False)
    content = Column(String(500), nullable=True)
    data = Column(Text, nullable=True)
    is_read = Column(SmallInteger, default=0, nullable=False, index=True)


class CommunityChannelPost(BaseModel):
    __tablename__ = "community_channel_post"
    tenant_id = Column(Integer, nullable=False, index=True)
    channel_id = Column(Integer, nullable=False, index=True)
    author_user_id = Column(Integer, nullable=False, index=True)
    title = Column(String(120), nullable=False)
    content = Column(Text, nullable=False)
    content_format = Column(String(16), nullable=False, default="html")
    images = Column(Text, nullable=True)
    is_official = Column(SmallInteger, default=0, nullable=False)
    is_pinned = Column(SmallInteger, default=0, nullable=False)
    status = Column(SmallInteger, default=1, nullable=False, index=True)


class CommunityChannelComment(BaseModel):
    __tablename__ = "community_channel_comment"
    tenant_id = Column(Integer, nullable=False, index=True)
    channel_id = Column(Integer, nullable=False, index=True)
    post_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    content = Column(Text, nullable=False)
    images = Column(Text, nullable=True)
    status = Column(SmallInteger, default=1, nullable=False, index=True)


class CommunityChannelAnnouncement(BaseModel):
    __tablename__ = "community_channel_announcement"
    tenant_id = Column(Integer, nullable=False, index=True)
    channel_id = Column(Integer, nullable=False, index=True)
    author_user_id = Column(Integer, nullable=False, index=True)
    title = Column(String(120), nullable=False)
    # 公告与帖子一样走富文本 HTML；content 容量按 MEDIUMTEXT 在 table.sql 处理
    content = Column(Text, nullable=False)
    content_format = Column(String(16), nullable=False, default="html")
    images = Column(Text, nullable=True)
    status = Column(SmallInteger, default=1, nullable=False, index=True)


class CommunityMediaModerationTask(BaseModel):
    __tablename__ = "community_media_moderation_task"
    tenant_id = Column(Integer, nullable=False, index=True)
    item_type = Column(String(32), nullable=False, index=True)
    item_id = Column(Integer, nullable=False, index=True)
    media_url = Column(String(1024), nullable=False)
    trace_id = Column(String(128), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="pending")
    reason = Column(String(255), nullable=True)


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


# ============================================================
# 导入模板配置表
# ============================================================
class ImportTemplate(BaseModel):
    __tablename__ = "import_template"
    tenant_id = Column(Integer, nullable=False, index=True)
    # 模板配置：列索引 -> 字段名 的映射，JSON格式
    column_mapping = Column(Text, nullable=True)
    # 是否启用
    is_active = Column(Integer, default=1)


# ============================================================
# 用户凭证表（统一登录凭证）
# ============================================================
class UserCredential(BaseModel):
    __tablename__ = "user_credential"
    __table_args__ = (
        UniqueConstraint('tenant_id', 'credential_type', 'identifier', name='uk_credential_lookup'),
    )
    user_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    credential_type = Column(String(32), nullable=False)
    identifier = Column(String(255), nullable=False)
    credential_hash = Column(String(255), nullable=True)
    must_reset_password = Column(SmallInteger, default=0, nullable=False)
    status = Column(SmallInteger, default=1, nullable=False)


# ============================================================
# 用户-租户关联表
# ============================================================
class UserTenant(BaseModel):
    __tablename__ = "user_tenant"
    __table_args__ = (
        UniqueConstraint('user_id', 'tenant_id', name='uk_user_tenant'),
    )
    user_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    status = Column(SmallInteger, default=1, nullable=False)
    joined_at = Column(DateTime, default=func.now())


# ============================================================
# 用户-活动类型关联表
# ============================================================
class UserActivityType(BaseModel):
    __tablename__ = "user_activity_type"
    __table_args__ = (
        UniqueConstraint('user_id', 'activity_type_id', 'tenant_id', name='uk_user_activity_type'),
    )
    user_id = Column(Integer, nullable=False, index=True)
    activity_type_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
