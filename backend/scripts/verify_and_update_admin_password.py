"""
排查/修复管理员登录：用指定密码生成 hash 并校验一次，再输出 UPDATE SQL。
用法：python scripts/verify_and_update_admin_password.py admin mysql123456

注意：密码必须和你要在 Flutter 里输入的完全一致（你写 msyql123456 会少一个 l，正确是 mysql123456）。
"""
import sys
from app.core.security import hash_password, verify_password

def main():
    if len(sys.argv) < 3:
        print("用法: python scripts/verify_and_update_admin_password.py <用户名> <密码>")
        print("示例: python scripts/verify_and_update_admin_password.py admin mysql123456")
        sys.exit(1)
    username = sys.argv[1]
    password = sys.argv[2]

    try:
        h = hash_password(password)
    except ValueError as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

    if not verify_password(password, h):
        print("错误: 生成的 hash 与密码校验失败，请检查 passlib/bcrypt 版本。", file=sys.stderr)
        sys.exit(1)
    print("校验通过：该 hash 与当前密码一致。")
    print()
    print("请将下面整段 hash 更新到数据库 admin_user 表：")
    print(h)
    print()
    print("SQL（在 MySQL 里执行，若 hash 中含单引号请手动转义）：")
    h_esc = h.replace("'", "''")  # MySQL 单引号转义
    print(f"UPDATE admin_user SET password_hash = '{h_esc}' WHERE username = '{username}';")
    print()
    print("若该用户不存在，可先插入：")
    print(f"INSERT INTO admin_user (username, password_hash) VALUES ('{username}', '{h_esc}');")

if __name__ == "__main__":
    main()
