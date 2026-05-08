from sqlalchemy import Column, Integer, MetaData, String, Table, create_engine, inspect

from app.db_migrations import ensure_runtime_schema


def test_ensure_runtime_schema_adds_missing_user_avatar_url() -> None:
    engine = create_engine("sqlite:///:memory:")
    metadata = MetaData()
    Table(
        "user",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("industry", String(100), nullable=True),
    )
    metadata.create_all(engine)

    ensure_runtime_schema(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("user")}
    assert "avatar_url" in columns


def test_ensure_runtime_schema_is_idempotent_when_avatar_url_exists() -> None:
    engine = create_engine("sqlite:///:memory:")
    metadata = MetaData()
    Table(
        "user",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("industry", String(100), nullable=True),
        Column("avatar_url", String(500), nullable=True),
    )
    metadata.create_all(engine)

    ensure_runtime_schema(engine)

    columns = [
        column["name"]
        for column in inspect(engine).get_columns("user")
        if column["name"] == "avatar_url"
    ]
    assert columns == ["avatar_url"]


def test_ensure_runtime_schema_creates_missing_tables_from_metadata() -> None:
    engine = create_engine("sqlite:///:memory:")
    metadata = MetaData()
    Table(
        "user",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("industry", String(100), nullable=True),
        Column("avatar_url", String(500), nullable=True),
    )
    Table("runtime_created", metadata, Column("id", Integer, primary_key=True))

    ensure_runtime_schema(engine, metadata)

    assert inspect(engine).has_table("runtime_created")
