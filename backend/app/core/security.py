from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

# 配置 bcrypt 工作因子，rounds 越高安全性越高但计算越慢
# 每增加 1，计算时间约翻倍。推荐值 12（约 300ms）
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=settings.BCRYPT_ROUNDS
)

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


def create_access_token(
    sub: str | int,
    tenant_id: int | None = None,
    role: str = "user",
    **_kw,
) -> str:
    """生成 JWT。tid=0 或 None 表示平台级用户。"""
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(sub),
        "tid": tenant_id if tenant_id else 0,
        "tenant_id": tenant_id if tenant_id else 0,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """解析 JWT，兼容新旧格式"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if "tid" not in payload and "tenant_id" in payload:
            payload["tid"] = payload["tenant_id"]
        return payload
    except JWTError:
        return None
