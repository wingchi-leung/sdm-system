"""生成管理员密码的 bcrypt hash，用于 INSERT admin_user。用法：uv run python scripts/hash_admin_password.py <密码>"""
import sys
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
