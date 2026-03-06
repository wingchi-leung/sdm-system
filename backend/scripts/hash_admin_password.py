"""生成管理员密码的 bcrypt hash，用于 INSERT admin_user。用法：uv run python scripts/hash_admin_password.py <密码>"""
import sys
from pathlib import Path

# 将 backend 根目录加入 path，以便 import app（从 backend 或任意目录运行均可）
_backend_root = Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from app.core.security import hash_password, BCRYPT_MAX_BYTES

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: uv run python scripts/hash_admin_password.py <密码>")
        sys.exit(1)
    password = sys.argv[1]
    try:
        print(hash_password(password))
    except ValueError as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)
