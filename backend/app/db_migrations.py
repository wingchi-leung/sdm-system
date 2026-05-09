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
