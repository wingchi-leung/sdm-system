import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.sql.schema import MetaData

logger = logging.getLogger(__name__)


def _has_column(engine: Engine, table_name: str, column_name: str) -> bool:
    inspector = inspect(engine)
    return any(
        column["name"] == column_name
        for column in inspector.get_columns(table_name)
    )


def ensure_runtime_schema(engine: Engine, metadata: MetaData | None = None) -> None:
    """补齐旧 Docker 数据卷中缺失的轻量字段。"""
    if metadata is not None:
        metadata.create_all(bind=engine)

    if not _has_column(engine, "user", "avatar_url"):
        statement = "ALTER TABLE user ADD COLUMN avatar_url VARCHAR(500) NULL"
        if engine.dialect.name == "mysql":
            statement = (
                "ALTER TABLE user "
                "ADD COLUMN avatar_url VARCHAR(500) NULL COMMENT '头像地址' "
                "AFTER industry"
            )

        with engine.begin() as connection:
            connection.execute(text(statement))
        logger.info("已补齐 user.avatar_url 数据库字段")

    if not _has_column(engine, "user", "email_hash"):
        statement = "ALTER TABLE user ADD COLUMN email_hash VARCHAR(64) NULL"
        if engine.dialect.name == "mysql":
            statement = (
                "ALTER TABLE user "
                "ADD COLUMN email_hash VARCHAR(64) NULL COMMENT '邮箱盲索引' "
                "AFTER email"
            )

        with engine.begin() as connection:
            connection.execute(text(statement))
        logger.info("已补齐 user.email_hash 数据库字段")

    if not _has_column(engine, "activity_participants", "email_hash"):
        statement = "ALTER TABLE activity_participants ADD COLUMN email_hash VARCHAR(64) NULL"
        if engine.dialect.name == "mysql":
            statement = (
                "ALTER TABLE activity_participants "
                "ADD COLUMN email_hash VARCHAR(64) NULL COMMENT '报名邮箱盲索引' "
                "AFTER email"
            )

        with engine.begin() as connection:
            connection.execute(text(statement))
        logger.info("已补齐 activity_participants.email_hash 数据库字段")

    if not _has_column(engine, "activity", "activity_intro"):
        statement = "ALTER TABLE activity ADD COLUMN activity_intro VARCHAR(1000) NULL"
        if engine.dialect.name == "mysql":
            statement = (
                "ALTER TABLE activity "
                "ADD COLUMN activity_intro VARCHAR(1000) NULL COMMENT '活动介绍（最多1000字）' "
                "AFTER location"
            )

        with engine.begin() as connection:
            connection.execute(text(statement))
        logger.info("已补齐 activity.activity_intro 数据库字段")

    if not _has_column(engine, "user", "phone_hash"):
        statement = "ALTER TABLE user ADD COLUMN phone_hash VARCHAR(64) NULL"
        if engine.dialect.name == "mysql":
            statement = (
                "ALTER TABLE user "
                "ADD COLUMN phone_hash VARCHAR(64) NULL COMMENT '手机号盲索引' "
                "AFTER update_time"
            )

        with engine.begin() as connection:
            connection.execute(text(statement))
        logger.info("已补齐 user.phone_hash 数据库字段")

    if not _has_column(engine, "user", "phone_masked"):
        statement = "ALTER TABLE user ADD COLUMN phone_masked VARCHAR(32) NULL"
        if engine.dialect.name == "mysql":
            statement = (
                "ALTER TABLE user "
                "ADD COLUMN phone_masked VARCHAR(32) NULL COMMENT '手机号脱敏展示' "
                "AFTER phone_hash"
            )

        with engine.begin() as connection:
            connection.execute(text(statement))
        logger.info("已补齐 user.phone_masked 数据库字段")

    if not _has_column(engine, "user", "identity_number_hash"):
        statement = "ALTER TABLE user ADD COLUMN identity_number_hash VARCHAR(64) NULL"
        if engine.dialect.name == "mysql":
            statement = (
                "ALTER TABLE user "
                "ADD COLUMN identity_number_hash VARCHAR(64) NULL COMMENT '证件号盲索引' "
                "AFTER phone_masked"
            )

        with engine.begin() as connection:
            connection.execute(text(statement))
        logger.info("已补齐 user.identity_number_hash 数据库字段")

    if not _has_column(engine, "user", "identity_last4"):
        statement = "ALTER TABLE user ADD COLUMN identity_last4 VARCHAR(8) NULL"
        if engine.dialect.name == "mysql":
            statement = (
                "ALTER TABLE user "
                "ADD COLUMN identity_last4 VARCHAR(8) NULL COMMENT '证件号后四位' "
                "AFTER identity_number_hash"
            )

        with engine.begin() as connection:
            connection.execute(text(statement))
        logger.info("已补齐 user.identity_last4 数据库字段")

    # 兼容旧数据卷：若缺少邮箱唯一约束对应索引，则补齐。
    if engine.dialect.name == "mysql":
        inspector = inspect(engine)
        indexes = inspector.get_indexes("user")
        unique_constraints = inspector.get_unique_constraints("user")
        index_names = {idx.get("name") for idx in indexes}
        unique_names = {uc.get("name") for uc in unique_constraints}

        if "uk_user_email" not in index_names and "uk_user_email" not in unique_names:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "ALTER TABLE user "
                        "ADD CONSTRAINT uk_user_email UNIQUE (email_hash, tenant_id)"
                    )
                )
            logger.info("已补齐 user.uk_user_email 唯一约束")
