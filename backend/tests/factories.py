"""
测试数据工厂 - 使用 factory-boy 生成测试数据
"""
from datetime import datetime
from typing import Optional

import factory
from factory.alchemy import SQLAlchemyModelFactory
from faker import Faker

from app.schemas import (
    User,
    UserCredential,
    UserTenant,
    Activity,
    ActivityType,
    ActivityParticipant,
    CheckInRecord,
)
from app.core.security import hash_password

fake = Faker("zh_CN")


class ActivityTypeFactory(SQLAlchemyModelFactory):
    """活动类型工厂"""
    class Meta:
        model = ActivityType
        sqlalchemy_session_persistence = "commit"

    type_name = factory.Sequence(lambda n: f"活动类型{n}")
    code = factory.Sequence(lambda n: f"CODE{n:04d}")
    tenant_id = 1


class AdminUserFactory(SQLAlchemyModelFactory):
    """管理员用户工厂"""
    class Meta:
        model = User
        sqlalchemy_session_persistence = "commit"

    tenant_id = 1
    name = factory.Sequence(lambda n: f"管理员{n}")
    phone = factory.Sequence(lambda n: f"1389{n:07d}")
    identity_number = factory.Sequence(lambda n: f"11010119900101{n:04d}")
    isblock = 0

    @factory.post_generation
    def setup_auth(obj, create, extracted, **kwargs):
        if not create or not obj.id:
            return
        session = obj._sa_instance_state.session
        username = kwargs.get("username") or f"admin{obj.id}"
        obj.username = username
        if not session.query(UserTenant).filter_by(user_id=obj.id, tenant_id=obj.tenant_id).first():
            session.add(UserTenant(user_id=obj.id, tenant_id=obj.tenant_id, status=1))
        if not session.query(UserCredential).filter_by(
            user_id=obj.id,
            tenant_id=obj.tenant_id,
            credential_type="password",
            identifier=username,
        ).first():
            session.add(UserCredential(
                user_id=obj.id,
                tenant_id=obj.tenant_id,
                credential_type="password",
                identifier=username,
                credential_hash=hash_password("password123"),
                must_reset_password=0,
                status=1,
            ))
        session.flush()


class SuperAdminFactory(AdminUserFactory):
    """超级管理员工厂"""
    pass


class ActivityAdminFactory(AdminUserFactory):
    """活动管理员工厂"""
    pass


class UserFactory(SQLAlchemyModelFactory):
    """用户工厂"""
    class Meta:
        model = User
        sqlalchemy_session_persistence = "commit"

    name = factory.LazyAttribute(lambda _: fake.name())
    tenant_id = 1
    phone = factory.Sequence(lambda n: f"138{n:08d}")
    identity_number = factory.LazyAttribute(lambda _: fake.ssn()[:18])
    email = factory.LazyAttribute(lambda _: fake.email())
    sex = factory.LazyAttribute(lambda _: fake.random_element(["M", "F"]))
    isblock = 0
    block_reason = None

    @factory.post_generation
    def setup_auth(obj, create, extracted, **kwargs):
        if not create or not obj.id:
            return
        session = obj._sa_instance_state.session
        if not session.query(UserTenant).filter_by(user_id=obj.id, tenant_id=obj.tenant_id).first():
            session.add(UserTenant(user_id=obj.id, tenant_id=obj.tenant_id, status=1))

        password = kwargs.get("password")
        if password and not session.query(UserCredential).filter_by(
            user_id=obj.id,
            tenant_id=obj.tenant_id,
            credential_type="password",
            identifier=obj.phone,
        ).first():
            session.add(UserCredential(
                user_id=obj.id,
                tenant_id=obj.tenant_id,
                credential_type="password",
                identifier=obj.phone,
                credential_hash=hash_password(password),
                must_reset_password=0,
                status=1,
            ))

        openid = kwargs.get("wx_openid")
        if openid and not session.query(UserCredential).filter_by(
            tenant_id=obj.tenant_id,
            credential_type="wechat",
            identifier=openid,
        ).first():
            session.add(UserCredential(
                user_id=obj.id,
                tenant_id=obj.tenant_id,
                credential_type="wechat",
                identifier=openid,
                status=1,
            ))
        session.flush()


class BlockedUserFactory(UserFactory):
    """被拉黑用户工厂"""
    isblock = 1
    block_reason = "测试拉黑"


class ActivityFactory(SQLAlchemyModelFactory):
    """活动工厂"""
    class Meta:
        model = Activity
        sqlalchemy_session_persistence = "commit"

    activity_name = factory.LazyAttribute(lambda _: f"测试活动_{fake.word()}")
    tenant_id = 1
    activity_type_id = None
    start_time = factory.LazyAttribute(lambda _: datetime.now())
    end_time = None
    status = 1
    tag = factory.LazyAttribute(lambda _: fake.word())


class ActiveActivityFactory(ActivityFactory):
    """进行中的活动工厂"""
    status = 2


class EndedActivityFactory(ActivityFactory):
    """已结束的活动工厂"""
    status = 3
    end_time = factory.LazyAttribute(lambda _: datetime.now())


class ParticipantFactory(SQLAlchemyModelFactory):
    """参与者工厂"""
    class Meta:
        model = ActivityParticipant
        sqlalchemy_session_persistence = "commit"

    activity_id = None
    tenant_id = 1
    user_id = None
    participant_name = factory.LazyAttribute(lambda _: fake.name())
    phone = factory.Sequence(lambda n: f"139{n:08d}")
    identity_number = factory.LazyAttribute(lambda _: fake.ssn()[:18])


class CheckInFactory(SQLAlchemyModelFactory):
    """签到记录工厂"""
    class Meta:
        model = CheckInRecord
        sqlalchemy_session_persistence = "commit"

    activity_id = None
    tenant_id = 1
    user_id = None
    name = factory.LazyAttribute(lambda _: fake.name())
    phone = factory.Sequence(lambda n: f"137{n:08d}")
    identity_number = factory.LazyAttribute(lambda _: fake.ssn()[:18])
    has_attend = 1
    note = factory.LazyAttribute(lambda _: fake.sentence(nb_words=3))


# 辅助函数：创建 factory 实例并设置 session
def create_with_session(factory_class, db_session, **kwargs):
    """创建 factory 实例并设置 session"""
    original_session = factory_class._meta.sqlalchemy_session
    factory_class._meta.sqlalchemy_session = db_session
    try:
        instance = factory_class(**kwargs)
    finally:
        factory_class._meta.sqlalchemy_session = original_session
    return instance
