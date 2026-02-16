"""
本地排查：用「用户名 + 密码」校验库里 admin_user 的 password_hash 是否匹配。
用法：在 backend 目录执行
  python scripts/verify_admin_password.py admin mysql123456
若输出「校验通过」说明库里 hash 与密码一致；若「校验失败」说明 hash 与密码不一致，需重新生成 hash 并 UPDATE。
"""
import sys
import os

# 让脚本能 import app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.crud.crud_admin import get_admin_by_username
from app.core.security import verify_password


def main():
    if len(sys.argv) != 3:
        print("用法: python scripts/verify_admin_password.py <用户名> <密码>")
        print("示例: python scripts/verify_admin_password.py admin mysql123456")
        sys.exit(1)
    username = sys.argv[1]
    password = sys.argv[2]

    db = SessionLocal()
    try:
        admin = get_admin_by_username(db, username)
        if not admin:
            print(f"未找到用户: {username}")
            print("请确认 admin_user 表中有该用户（SELECT * FROM admin_user;）")
            sys.exit(1)
        ok = verify_password(password, admin.password_hash)
        if ok:
            print("校验通过：该密码与库中 password_hash 一致，可正常登录。")
        else:
            print("校验失败：该密码与库中 password_hash 不一致。")
            print("请用「你要登录的密码」重新生成 hash：")
            print(f"  python scripts/hash_admin_password.py {password}")
            print("然后用输出的 hash 执行：")
            print(f"  UPDATE admin_user SET password_hash='<hash>' WHERE username='{username}';")
            sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
