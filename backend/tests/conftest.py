"""
测试配置文件 - 提供数据库、客户端、认证等核心 fixtures
"""
import os
os.environ["JWT_SECRET"] = "test-secret-key-for-testing-only"
os.environ["MYSQL_HOST"] = "localhost"
os.environ["MYSQL_USER"] = "test"
os.environ["MYSQL_PASSWORD"] = "test"
os.environ["MYSQL_DB"] = "test"
os.environ["WECHAT_APPID"] = "test-wechat-appid"
os.environ["WECHAT_SECRET"] = "test-wechat-secret"
# 禁用登录限流用于测试
os.environ["LOGIN_RATE_LIMIT_COUNT"] = "1000"
os.environ["LOGIN_RATE_LIMIT_WINDOW_SECONDS"] = "1"

from datetime import datetime
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.main import app
from app.schemas import Base  # 使用 schemas 的 Base，包含所有模型
from app.core.security import hash_password, create_access_token
from app.schemas import (
    User,
    UserCredential,
    UserTenant,
    Activity,
    ActivityType,
    ActivityParticipant,
    CheckInRecord,
    Tenant,
    Permission,
    Role,
    RolePermission,
    UserRole,
)
from app.api.deps import get_db


SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """为 SQLite 测试库开启外键约束。"""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def _ensure_permission(
    db_session: Session,
    code: str,
    *,
    name: str | None = None,
    resource: str = "system",
    action: str = "manage",
) -> Permission:
    permission = db_session.query(Permission).filter(Permission.code == code).first()
    if permission:
        return permission

    permission = Permission(
        code=code,
        name=name or code,
        resource=resource,
        action=action,
    )
    db_session.add(permission)
    db_session.flush()
    return permission


def _create_role_with_permissions(
    db_session: Session,
    *,
    tenant_id: int,
    role_name: str,
    permission_codes: list[str],
) -> Role:
    role = Role(
        tenant_id=tenant_id,
        name=role_name,
        is_system=0,
        description=f"{role_name} 测试角色",
    )
    db_session.add(role)
    db_session.flush()

    resource_map = {
        "activity.create": ("activity", "create"),
        "activity.edit": ("activity", "edit"),
        "activity.delete": ("activity", "delete"),
        "participant.view": ("participant", "view"),
        "user.view": ("user", "view"),
        "admin.manage": ("admin", "manage"),
        "role.manage": ("role", "manage"),
    }
    for code in permission_codes:
        resource, action = resource_map.get(code, ("system", "manage"))
        permission = _ensure_permission(
            db_session,
            code,
            name=code,
            resource=resource,
            action=action,
        )
        db_session.add(RolePermission(role_id=role.id, permission_id=permission.id))

    db_session.flush()
    return role


def _create_admin_with_role(
    db_session: Session,
    *,
    tenant_id: int,
    username: str,
    password: str,
    user_name: str,
    phone: str,
    identity_number: str,
    permission_codes: list[str] | None = None,
    scope_type: str | None = None,
    scope_id: int | None = None,
) -> User:
    user = User(
        tenant_id=tenant_id,
        name=user_name,
        phone=phone,
        identity_number=identity_number,
        isblock=0,
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserTenant(user_id=user.id, tenant_id=tenant_id, status=1))
    db_session.add(UserCredential(
        user_id=user.id,
        tenant_id=tenant_id,
        credential_type="password",
        identifier=username,
        credential_hash=hash_password(password),
        must_reset_password=0,
        status=1,
    ))
    db_session.flush()

    if permission_codes:
        role = _create_role_with_permissions(
            db_session,
            tenant_id=tenant_id,
            role_name=f"{username}_role",
            permission_codes=permission_codes,
        )
        db_session.add(
            UserRole(
                user_id=user.id,
                role_id=role.id,
                tenant_id=tenant_id,
                scope_type=scope_type,
                scope_id=scope_id,
            )
        )

    db_session.commit()
    db_session.refresh(user)
    user.user_id = user.id
    user.username = username
    return user


def _create_platform_admin(
    db_session: Session,
    *,
    username: str = "platform_admin",
    password: str = "platform123",
) -> User:
    role = db_session.query(Role).filter(Role.id == 3, Role.tenant_id == 0).first()
    if not role:
        role = Role(
            id=3,
            tenant_id=0,
            name="平台管理员",
            is_system=1,
            description="测试平台管理员角色",
        )
        db_session.add(role)
        db_session.flush()

    user = User(
        tenant_id=0,
        name="平台管理员",
        phone=None,
        identity_number=None,
        isblock=0,
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserCredential(
        user_id=user.id,
        tenant_id=0,
        credential_type="password",
        identifier=username,
        credential_hash=hash_password(password),
        must_reset_password=0,
        status=1,
    ))
    db_session.add(UserRole(user_id=user.id, role_id=3, tenant_id=0, scope_type=None, scope_id=None))
    db_session.commit()
    db_session.refresh(user)
    user.username = username
    return user


@pytest.fixture(scope="function")
def db_session() -> Generator[Session, None, None]:
    """创建测试数据库会话，每个测试函数独立使用"""
    Base.metadata.create_all(bind=engine)
    
    connection = engine.connect()
    transaction = connection.begin()
    
    session = TestingSessionLocal(bind=connection)
    
    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(db_session, transaction):
        if transaction.nested and not transaction._parent.nested:
            session.expire_all()
            session.begin_nested()
    
    session.begin_nested()
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session: Session) -> TestClient:
    """创建测试客户端，并自动创建默认租户"""
    # 自动创建默认租户
    tenant = Tenant(
        name="测试租户",
        code="default",
        status=1,
        plan="basic",
    )
    db_session.add(tenant)
    db_session.commit()

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    from app.tasks import scheduler
    original_start_scheduler = scheduler.start_scheduler
    original_stop_scheduler = scheduler.stop_scheduler
    scheduler.start_scheduler = lambda *args, **kwargs: None
    scheduler.stop_scheduler = lambda *args, **kwargs: None

    with TestClient(app) as test_client:
        yield test_client

    scheduler.start_scheduler = original_start_scheduler
    scheduler.stop_scheduler = original_stop_scheduler
    app.dependency_overrides.clear()


@pytest.fixture
def default_tenant(db_session: Session) -> Tenant:
    """获取默认租户（由 client fixture 创建）"""
    tenant = db_session.query(Tenant).filter(Tenant.code == "default").first()
    if not tenant:
        # 如果不存在则创建（用于不使用 client fixture 的测试）
        tenant = Tenant(
            name="测试租户",
            code="default",
            status=1,
            plan="basic",
        )
        db_session.add(tenant)
        db_session.commit()
        db_session.refresh(tenant)
    return tenant


@pytest.fixture
def sample_activity_type(db_session: Session, default_tenant: Tenant) -> ActivityType:
    """创建示例活动类型"""
    activity_type = ActivityType(
        type_name="测试活动类型",
        code="TEST001",
        tenant_id=default_tenant.id,
    )
    db_session.add(activity_type)
    db_session.commit()
    db_session.refresh(activity_type)
    return activity_type


@pytest.fixture
def sample_activity_type_2(db_session: Session, default_tenant: Tenant) -> ActivityType:
    """创建第二个活动类型"""
    activity_type = ActivityType(
        type_name="测试活动类型2",
        code="TEST002",
        tenant_id=default_tenant.id,
    )
    db_session.add(activity_type)
    db_session.commit()
    db_session.refresh(activity_type)
    return activity_type


@pytest.fixture
def super_admin(db_session: Session, default_tenant: Tenant) -> User:
    """创建超级管理员"""
    return _create_admin_with_role(
        db_session,
        tenant_id=default_tenant.id,
        username="super_admin",
        password="admin123",
        user_name="超级管理员",
        phone="13800138010",
        identity_number="110101199001011210",
        permission_codes=[
            "activity.create",
            "activity.edit",
            "activity.delete",
            "participant.view",
            "user.view",
            "admin.manage",
            "role.manage",
        ],
    )


@pytest.fixture
def activity_admin(db_session: Session, sample_activity_type: ActivityType, default_tenant: Tenant) -> User:
    """创建活动管理员（有特定类型权限）"""
    return _create_admin_with_role(
        db_session,
        tenant_id=default_tenant.id,
        username="activity_admin",
        password="admin123",
        user_name="活动管理员",
        phone="13800138011",
        identity_number="110101199001011211",
        permission_codes=[
            "activity.create",
            "activity.edit",
            "activity.delete",
            "participant.view",
        ],
        scope_type="activity_type",
        scope_id=sample_activity_type.id,
    )


@pytest.fixture
def activity_admin_no_permission(db_session: Session, default_tenant: Tenant) -> User:
    """创建无权限的活动管理员"""
    return _create_admin_with_role(
        db_session,
        tenant_id=default_tenant.id,
        username="no_perm_admin",
        password="admin123",
        user_name="无权限管理员",
        phone="13800138012",
        identity_number="110101199001011212",
        permission_codes=None,
    )


@pytest.fixture
def platform_admin(db_session: Session) -> User:
    """创建平台管理员"""
    return _create_platform_admin(db_session)


@pytest.fixture
def super_admin_token(super_admin: User) -> str:
    """超级管理员 token"""
    return create_access_token(sub=str(super_admin.id), role="admin", tenant_id=super_admin.tenant_id)


@pytest.fixture
def activity_admin_token(activity_admin: User) -> str:
    """活动管理员 token"""
    return create_access_token(sub=str(activity_admin.id), role="admin", tenant_id=activity_admin.tenant_id)


@pytest.fixture
def no_perm_admin_token(activity_admin_no_permission: User) -> str:
    """无权限管理员 token"""
    return create_access_token(sub=str(activity_admin_no_permission.id), role="admin", tenant_id=activity_admin_no_permission.tenant_id)


@pytest.fixture
def sample_user(db_session: Session, default_tenant: Tenant) -> User:
    """创建示例普通用户"""
    user = User(
        name="测试用户",
        phone="13800138000",
        identity_number="110101199001011234",
        isblock=0,
        tenant_id=default_tenant.id,
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserTenant(user_id=user.id, tenant_id=default_tenant.id, status=1))
    db_session.add(UserCredential(
        user_id=user.id,
        tenant_id=default_tenant.id,
        credential_type="password",
        identifier="13800138000",
        credential_hash=hash_password("user123"),
        must_reset_password=0,
        status=1,
    ))
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def blocked_user(db_session: Session, default_tenant: Tenant) -> User:
    """创建被拉黑的用户"""
    user = User(
        name="被拉黑用户",
        phone="13800138001",
        identity_number="110101199001011235",
        isblock=1,
        block_reason="测试拉黑",
        tenant_id=default_tenant.id,
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(UserTenant(user_id=user.id, tenant_id=default_tenant.id, status=1))
    db_session.add(UserCredential(
        user_id=user.id,
        tenant_id=default_tenant.id,
        credential_type="password",
        identifier="13800138001",
        credential_hash=hash_password("user123"),
        must_reset_password=0,
        status=1,
    ))
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def user_token(sample_user: User) -> str:
    """普通用户 token"""
    return create_access_token(sub=str(sample_user.id), role="user", tenant_id=sample_user.tenant_id)


@pytest.fixture
def sample_activity(
    db_session: Session,
    sample_activity_type: ActivityType,
    default_tenant: Tenant,
) -> Activity:
    """创建示例活动"""
    activity = Activity(
        tenant_id=default_tenant.id,
        activity_name="测试活动",
        activity_type_id=sample_activity_type.id,
        start_time=datetime(2026, 4, 1, 10, 0, 0),
        end_time=None,
        status=1,
        tag="测试",
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return activity


@pytest.fixture
def active_activity(
    db_session: Session,
    sample_activity_type: ActivityType,
    default_tenant: Tenant,
) -> Activity:
    """创建进行中的活动"""
    activity = Activity(
        tenant_id=default_tenant.id,
        activity_name="进行中的活动",
        activity_type_id=sample_activity_type.id,
        start_time=datetime(2026, 1, 1, 10, 0, 0),
        end_time=None,
        status=2,
        tag="测试",
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return activity


@pytest.fixture
def sample_participant(
    db_session: Session,
    sample_activity: Activity,
    default_tenant: Tenant,
) -> ActivityParticipant:
    """创建示例参与者"""
    participant = ActivityParticipant(
        tenant_id=default_tenant.id,
        activity_id=sample_activity.id,
        participant_name="参与者张三",
        phone="13900139000",
        identity_number="110101199001011236",
    )
    db_session.add(participant)
    db_session.commit()
    db_session.refresh(participant)
    return participant


@pytest.fixture
def sample_checkin(
    db_session: Session,
    active_activity: Activity,
    default_tenant: Tenant,
) -> CheckInRecord:
    """创建示例签到记录"""
    checkin = CheckInRecord(
        tenant_id=default_tenant.id,
        activity_id=active_activity.id,
        name="签到用户",
        phone="13900139001",
        identity_number="110101199001011237",
        has_attend=1,
        note="正常签到",
    )
    db_session.add(checkin)
    db_session.commit()
    db_session.refresh(checkin)
    return checkin


def auth_headers(token: str) -> dict:
    """生成认证请求头"""
    return {"Authorization": f"Bearer {token}"}


# 别名 fixture，方便测试中使用
@pytest.fixture
def activity_admin_no_permission_token(no_perm_admin_token: str) -> str:
    """无权限管理员 token（别名）"""
    return no_perm_admin_token


# 设置 factories 的 session
@pytest.fixture(autouse=True)
def set_factory_session(db_session: Session):
    """为测试数据工厂设置数据库会话"""
    from tests import factories
    # 设置所有工厂的 session
    factories.ActivityTypeFactory._meta.sqlalchemy_session = db_session
    factories.AdminUserFactory._meta.sqlalchemy_session = db_session
    factories.SuperAdminFactory._meta.sqlalchemy_session = db_session
    factories.ActivityAdminFactory._meta.sqlalchemy_session = db_session
    factories.UserFactory._meta.sqlalchemy_session = db_session
    factories.BlockedUserFactory._meta.sqlalchemy_session = db_session
    factories.ActivityFactory._meta.sqlalchemy_session = db_session
    factories.ActiveActivityFactory._meta.sqlalchemy_session = db_session
    factories.EndedActivityFactory._meta.sqlalchemy_session = db_session
    factories.ParticipantFactory._meta.sqlalchemy_session = db_session
    factories.CheckInFactory._meta.sqlalchemy_session = db_session
    yield


# 重置登录限流状态
@pytest.fixture(autouse=True)
def reset_login_rate_limit():
    """每个测试前重置登录限流状态"""
    from app.api.v1.endpoints.auth import _login_attempts
    _login_attempts.clear()
    yield
