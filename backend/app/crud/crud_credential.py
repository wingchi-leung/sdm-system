from typing import Optional

from sqlalchemy.orm import Session

from app.schemas import UserCredential
from app.core.security import verify_password, hash_password


def get_credential(
    db: Session,
    tenant_id: int,
    credential_type: str,
    identifier: str,
) -> Optional[UserCredential]:
    """按 (tenant_id, type, identifier) 查找有效凭证"""
    return db.query(UserCredential).filter(
        UserCredential.tenant_id == tenant_id,
        UserCredential.credential_type == credential_type,
        UserCredential.identifier == identifier,
        UserCredential.status == 1,
    ).first()


def get_credential_by_user(
    db: Session,
    user_id: int,
    tenant_id: int,
    credential_type: str,
) -> Optional[UserCredential]:
    """按用户查找某类有效凭证。"""
    return db.query(UserCredential).filter(
        UserCredential.user_id == user_id,
        UserCredential.tenant_id == tenant_id,
        UserCredential.credential_type == credential_type,
        UserCredential.status == 1,
    ).first()


def authenticate_by_password(
    db: Session,
    tenant_id: int,
    identifier: str,
    password: str,
) -> Optional[UserCredential]:
    """密码认证：查找 password 凭证并校验 bcrypt"""
    cred = get_credential(db, tenant_id, "password", identifier)
    if not cred or not cred.credential_hash:
        return None
    if not verify_password(password, cred.credential_hash):
        return None
    return cred


def get_wechat_openid(
    db: Session,
    user_id: int,
    tenant_id: int,
) -> str | None:
    """获取用户当前绑定的微信 openid。"""
    cred = get_credential_by_user(db, user_id, tenant_id, "wechat")
    return cred.identifier if cred else None


def get_or_create_wechat_credential(
    db: Session,
    user_id: int,
    tenant_id: int,
    openid: str,
) -> UserCredential:
    """确保微信凭证存在，不存在则创建"""
    cred = get_credential(db, tenant_id, "wechat", openid)
    if cred:
        return cred
    cred = UserCredential(
        user_id=user_id,
        tenant_id=tenant_id,
        credential_type="wechat",
        identifier=openid,
    )
    db.add(cred)
    db.flush()
    return cred


def bind_wechat_credential(
    db: Session,
    user_id: int,
    tenant_id: int,
    openid: str,
) -> UserCredential:
    """把 openid 绑定到指定用户，并处理凭证迁移。"""
    existing_by_openid = get_credential(db, tenant_id, "wechat", openid)
    current = get_credential_by_user(db, user_id, tenant_id, "wechat")

    if existing_by_openid and existing_by_openid.user_id == user_id:
        return existing_by_openid

    if existing_by_openid and current and current.id != existing_by_openid.id:
        db.delete(current)
        db.flush()
        current = None

    if existing_by_openid:
        existing_by_openid.user_id = user_id
        existing_by_openid.tenant_id = tenant_id
        existing_by_openid.status = 1
        db.flush()
        return existing_by_openid

    if current:
        current.identifier = openid
        current.status = 1
        db.flush()
        return current

    cred = UserCredential(
        user_id=user_id,
        tenant_id=tenant_id,
        credential_type="wechat",
        identifier=openid,
    )
    db.add(cred)
    db.flush()
    return cred


def get_or_create_phone_credential(
    db: Session,
    user_id: int,
    tenant_id: int,
    phone: str,
) -> UserCredential:
    """确保手机号凭证存在，不存在则创建"""
    cred = get_credential(db, tenant_id, "phone_code", phone)
    if cred:
        return cred
    cred = UserCredential(
        user_id=user_id,
        tenant_id=tenant_id,
        credential_type="phone_code",
        identifier=phone,
    )
    db.add(cred)
    db.flush()
    return cred


def create_password_credential(
    db: Session,
    user_id: int,
    tenant_id: int,
    identifier: str,
    password: str,
    must_reset: bool = True,
) -> UserCredential:
    """创建密码凭证（分配角色时自动创建）"""
    existing = get_credential(db, tenant_id, "password", identifier)
    if existing:
        return existing
    cred = UserCredential(
        user_id=user_id,
        tenant_id=tenant_id,
        credential_type="password",
        identifier=identifier,
        credential_hash=hash_password(password),
        must_reset_password=1 if must_reset else 0,
    )
    db.add(cred)
    db.flush()
    return cred


def update_password(
    db: Session,
    user_id: int,
    tenant_id: int,
    new_password: str,
) -> Optional[UserCredential]:
    """更新用户的密码凭证并清除 must_reset 标志"""
    cred = db.query(UserCredential).filter(
        UserCredential.user_id == user_id,
        UserCredential.tenant_id == tenant_id,
        UserCredential.credential_type == "password",
        UserCredential.status == 1,
    ).first()
    if not cred:
        return None
    cred.credential_hash = hash_password(new_password)
    cred.must_reset_password = 0
    db.flush()
    return cred


def sync_phone_identifiers(
    db: Session,
    user_id: int,
    tenant_id: int,
    old_phone: str | None,
    new_phone: str | None,
) -> None:
    """同步以手机号作为 identifier 的凭证。"""
    if not old_phone or not new_phone or old_phone == new_phone:
        return

    credentials = db.query(UserCredential).filter(
        UserCredential.user_id == user_id,
        UserCredential.tenant_id == tenant_id,
        UserCredential.status == 1,
        UserCredential.credential_type.in_(["password", "phone_code"]),
        UserCredential.identifier == old_phone,
    ).all()

    for cred in credentials:
        conflict = db.query(UserCredential).filter(
            UserCredential.tenant_id == tenant_id,
            UserCredential.credential_type == cred.credential_type,
            UserCredential.identifier == new_phone,
            UserCredential.status == 1,
            UserCredential.id != cred.id,
        ).first()
        if conflict:
            continue
        cred.identifier = new_phone

    db.flush()
