"""
测试数据工厂 - 使用 factory-boy 生成测试数据
"""
from datetime import datetime
from typing import Optional

import factory
from factory.alchemy import SQLAlchemyModelFactory
from faker import Faker

from app.schemas import (
    AdminUser,
    User,
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
    """管理员工厂"""
    class Meta:
        model = AdminUser
        sqlalchemy_session_persistence = "commit"

    username = factory.Sequence(lambda n: f"admin{n}")
    password_hash = factory.LazyAttribute(lambda _: hash_password("password123"))
    tenant_id = 1
    user_id = factory.Sequence(lambda n: n + 1000)


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
    password_hash = factory.LazyAttribute(lambda _: hash_password("password123"))
    sex = factory.LazyAttribute(lambda _: fake.random_element(["M", "F"]))
    isblock = 0
    block_reason = None
    wx_openid = None


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
