"""将 `user.name` 从历史密文批量回填为明文。

用法：
  uv run python scripts/migrate_user_names_to_plaintext.py

说明：
  - 只处理能够被当前密钥正确解密的记录
  - 已经是明文的记录会自动跳过
  - 解密失败的可疑值会被统计为 skipped，方便人工排查
"""
from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import select

_backend_root = Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from app.core.pii import decrypt_pii  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.schemas import User  # noqa: E402


def main() -> int:
    db = SessionLocal()
    updated = 0
    skipped = 0
    failed = 0
    try:
        rows = db.execute(select(User.id, User.__table__.c.name)).all()
        for user_id, raw_name in rows:
            if raw_name is None:
                skipped += 1
                continue

            plain_name = decrypt_pii(raw_name)
            if plain_name is None:
                failed += 1
                print(f"[skip] user_id={user_id} name 看起来像密文但无法解密，已跳过")
                continue

            if plain_name == raw_name:
                skipped += 1
                continue

            db.execute(
                User.__table__.update()
                .where(User.id == user_id)
                .values(name=plain_name)
            )
            updated += 1

        db.commit()
        print(f"完成：updated={updated}, skipped={skipped}, failed={failed}")
        return 0
    except Exception as exc:  # pragma: no cover - 运行期脚本兜底
        db.rollback()
        print(f"迁移失败: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
