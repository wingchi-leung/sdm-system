from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

BCRYPT_MAX_BYTES = 72


def _password_bytes_ok(password: str) -> bool:
    return len(password.encode("utf-8")) <= BCRYPT_MAX_BYTES


def hash_password(password: str) -> str:
    """哈希密码用于存储"""
    if not _password_bytes_ok(password):
        raise ValueError("密码长度不能超过 72 字节（约 24 个汉字）")
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """校验明文密码与存储的哈希"""
    if not _password_bytes_ok(plain):
        return False
    return pwd_context.verify(plain, hashed)


def create_access_token(sub: str, role: str, tenant_id: int) -> str:
    """生成 JWT，包含租户信息"""
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(sub),
        "role": role,
        "tenant_id": tenant_id,
        "exp": expire
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """解析 JWT"""
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None