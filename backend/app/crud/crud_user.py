from app.models.user import UserCreate, RegisterRequest
from sqlalchemy.orm import Session
from app.schemas import User
from app.core.security import hash_password, verify_password
from fastapi import HTTPException


def get_users(db: Session, tenant_id: int) -> list[User]:
    """获取用户列表（租户隔离）"""
    return db.query(User).filter(User.tenant_id == tenant_id).all()


def get_user(db: Session, user_id: int, tenant_id: int) -> User | None:
    """获取单个用户（租户隔离）"""
    return db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id
    ).first()


def get_user_by_phone(db: Session, phone: str, tenant_id: int) -> User | None:
    """根据手机号获取用户（租户隔离）"""
    return db.query(User).filter(
        User.phone == phone,
        User.tenant_id == tenant_id
    ).first()


def get_user_by_wx_openid(db: Session, openid: str, tenant_id: int) -> User | None:
    """根据微信 openid 获取用户（租户隔离）"""
    return db.query(User).filter(
        User.wx_openid == openid,
        User.tenant_id == tenant_id
    ).first()


def get_or_create_user_wechat(db: Session, openid: str, tenant_id: int, nickname: str | None = None) -> User:
    """微信授权登录：存在则返回，不存在则创建"""
    user = get_user_by_wx_openid(db, openid, tenant_id)
    if user:
        return user
    try:
        phone_placeholder = f"wx_{openid}"
        db_user = User(
            tenant_id=tenant_id,
            name=nickname or "微信用户",
            phone=phone_placeholder,
            email=None,
            password_hash=None,
            identity_number=None,
            sex=None,
            isblock=0,
            block_reason=None,
            wx_openid=openid,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"创建微信用户失败: {str(e)}")


def create_user(db: Session, user: UserCreate, tenant_id: int) -> User:
    """创建用户（租户隔离）"""
    try:
        if user.identity_number:
            existing = db.query(User).filter(
                User.identity_number == user.identity_number,
                User.tenant_id == tenant_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="该证件号已存在")
        
        db_user = User(
            tenant_id=tenant_id,
            name=user.name,
            identity_number=user.identity_number,
            phone=user.phone,
            email=user.email,
            password_hash=None,
            sex=user.sex,
            isblock=user.isblock,
            block_reason=user.block_reason,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def register_user(db: Session, body: RegisterRequest, tenant_id: int) -> User:
    """用户注册（租户隔离）"""
    try:
        existing_phone = get_user_by_phone(db, body.phone.strip(), tenant_id)
        if existing_phone:
            raise HTTPException(status_code=400, detail="该手机号已注册")
        
        if body.email:
            existing_email = db.query(User).filter(
                User.email == body.email,
                User.tenant_id == tenant_id
            ).first()
            if existing_email:
                raise HTTPException(status_code=400, detail="该邮箱已注册")
        
        db_user = User(
            tenant_id=tenant_id,
            name=body.name.strip(),
            phone=body.phone.strip(),
            email=body.email,
            password_hash=hash_password(body.password),
            identity_number=None,
            sex=None,
            isblock=0,
            block_reason=None,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def authenticate_user(db: Session, phone: str, password: str, tenant_id: int) -> User | None:
    """普通用户认证（租户隔离）"""
    user = get_user_by_phone(db, phone, tenant_id)
    if not user or not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def is_user_profile_incomplete(db: Session, user_id: int, tenant_id: int) -> bool:
    """检查用户信息是否不完整"""
    user = get_user(db, user_id, tenant_id)
    if not user:
        return True
    # 检查关键信息是否缺失
    if not user.name or user.name == "微信用户":
        return True
    if not user.sex:
        return True
    if not user.phone or user.phone.startswith("wx_"):
        return True
    return False


def update_user_bind_info(db: Session, user_id: int, tenant_id: int, bind_info: dict) -> User:
    """更新用户绑定信息"""
    user = get_user(db, user_id, tenant_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 检查手机号是否被其他用户占用
    if bind_info.get("phone"):
        existing = db.query(User).filter(
            User.phone == bind_info["phone"],
            User.id != user_id,
            User.tenant_id == tenant_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="该手机号已被使用")

    # 更新字段
    for field in ["name", "sex", "age", "occupation", "phone", "email", "industry", "identity_number", "identity_type"]:
        if field in bind_info and bind_info[field] is not None:
            setattr(user, field, bind_info[field])

    db.commit()
    db.refresh(user)
    return user