"""幂等创建/更新超级管理员账号。

修复点:
1. 已存在用户时回填 name/phone/sex,确保管理员资料始终与预期一致
2. 用 phone_hash 盲索引查重(原代码的 User.phone == PHONE 在 SQLAlchemy 层不可用)
3. 启动时校验 PII_ENCRYPTION_KEY 是否固化,防止容器重启/重建后密钥翻篇
4. 区分 created / updated / noop,便于排障
5. 主入口加 if __name__ 保护,避免被 import 时副作用执行
"""
import sys

from app.core.config import settings
from app.core.pii import blind_index, decrypt_pii
from app.crud import crud_credential, crud_rbac
from app.database import SessionLocal
from app.schemas import Tenant, User

USERNAME = "wechatadmin"
TENANT_CODE = "default"
NAME = "超级管理员"
PHONE = "13900000001"
SEX = "M"
SUPER_ADMIN_ROLE_ID = 1


def _check_pii_key() -> None:
    """PII 加密密钥未固化时给出告警,避免历史密文因密钥翻篇而报废。"""
    if not settings.PII_ENCRYPTION_KEY:
        print(
            "[WARN] PII_ENCRYPTION_KEY 未设置,密钥派生自 JWT_SECRET。\n"
            "       若 JWT_SECRET 在不同部署间不一致,所有历史密文将无法解密。\n"
            "       建议在 .env 中固化: PII_ENCRYPTION_KEY=<32+ 字符随机串>",
            file=sys.stderr,
        )


def _get_bootstrap_password() -> str:
    """从环境配置读取初始化密码，禁止回退到仓库硬编码默认值。"""
    password = (settings.BOOTSTRAP_ADMIN_PASSWORD or "").strip()
    if password:
        return password
    raise RuntimeError(
        "缺少 BOOTSTRAP_ADMIN_PASSWORD，已禁止使用仓库内硬编码超级管理员密码。"
    )


def _find_user(db, tenant_id: int) -> User | None:
    """通过手机号盲索引查重。"""
    phone_hash = blind_index(PHONE, purpose="phone")
    if phone_hash:
        return (
            db.query(User)
            .filter(User.tenant_id == tenant_id, User.phone_hash == phone_hash)
            .first()
        )
    # 盲索引不可用时,回退到 Python 侧比对(性能可接受,只用于初始化场景)
    candidates = db.query(User).filter(User.tenant_id == tenant_id).all()
    return next((u for u in candidates if u.phone == PHONE), None)


def _sync_user_pii(user: User) -> str:
    """回填并自愈用户关键资料字段,返回变更摘要。"""
    actions: list[str] = []

    # name 已改为明文存储,直接校正
    if (user.name or "").strip() != NAME:
        old = user.name
        user.name = NAME
        actions.append(f"name: {old!r} -> {NAME!r}")

    # phone
    decrypted_phone = decrypt_pii(user._phone_ciphertext)
    if user._phone_ciphertext is not None and decrypted_phone is None:
        user.phone = PHONE
        actions.append("phone: 损坏密文(无法解密) -> 已重置")
    elif decrypted_phone != PHONE:
        user.phone = PHONE
        actions.append(f"phone: {decrypted_phone!r} -> {PHONE!r}")

    # sex(明文字段,直接比对)
    if user.sex != SEX:
        old = user.sex
        user.sex = SEX
        actions.append(f"sex: {old!r} -> {SEX!r}")

    return "; ".join(actions) if actions else "noop"


def _ensure_credential(db, user_id: int, tenant_id: int, password: str) -> str:
    """创建或刷新密码凭证。"""
    crud_credential.create_password_credential(
        db=db,
        user_id=user_id,
        tenant_id=tenant_id,
        identifier=USERNAME,
        password=password,
        must_reset=False,
    )
    return f"credential(identifier={USERNAME}) 已同步"


def _ensure_role(db, user_id: int, tenant_id: int) -> str:
    """分配超级管理员角色,已分配则幂等跳过。"""
    try:
        crud_rbac.assign_user_role(
            db=db,
            user_id=user_id,
            role_id=SUPER_ADMIN_ROLE_ID,
            tenant_id=tenant_id,
            scope_type=None,
            scope_id=None,
        )
        return f"role_id={SUPER_ADMIN_ROLE_ID} 已分配"
    except ValueError as e:
        if "已分配" not in str(e):
            raise
        return f"role_id={SUPER_ADMIN_ROLE_ID} 已存在,跳过"


def main() -> int:
    _check_pii_key()
    try:
        bootstrap_password = _get_bootstrap_password()
    except RuntimeError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.code == TENANT_CODE).first()
        if not tenant:
            print(f"[ERROR] 租户不存在: {TENANT_CODE}", file=sys.stderr)
            return 1

        user = _find_user(db, tenant.id)
        if not user:
            user = User(tenant_id=tenant.id, name=NAME, phone=PHONE, sex=SEX)
            db.add(user)
            db.flush()
            user_action = f"created user_id={user.id}"
        else:
            user_action = f"updated user_id={user.id} ({_sync_user_pii(user)})"

        cred_action = _ensure_credential(db, user.id, tenant.id, bootstrap_password)
        role_action = _ensure_role(db, user.id, tenant.id)

        db.commit()
        print(
            f"OK: username={USERNAME} tenant_code={TENANT_CODE}\n"
            f"    {user_action}\n"
            f"    {cred_action}\n"
            f"    {role_action}"
        )
        return 0
    except Exception as e:
        db.rollback()
        print(f"[ERROR] {e}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
