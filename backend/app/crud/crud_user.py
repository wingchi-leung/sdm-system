from app.models.user import UserCreate, RegisterRequest
from sqlalchemy.orm import Session
from app.schemas import User
from app.core.security import hash_password, verify_password
from fastapi import HTTPException


def get_users(db: Session) -> list[User]:
    return db.query(User).all()


def get_user(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_phone(db: Session, phone: str) -> User | None:
    return db.query(User).filter(User.phone == phone).first()


def get_user_by_wx_openid(db: Session, openid: str) -> User | None:
    """按微信 openid 查找用户"""
    return db.query(User).filter(User.wx_openid == openid).first()


def get_or_create_user_wechat(db: Session, openid: str, nickname: str | None = None) -> User:
    """微信授权登录：存在则返回，不存在则创建（phone 占位为 wx_{openid}）"""
    user = get_user_by_wx_openid(db, openid)
    if user:
        return user
    try:
        phone_placeholder = f"wx_{openid}"  # 占位满足 phone 唯一且非空（openid 约 28 位）
        db_user = User(
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


def create_user(db: Session, user: UserCreate) -> User:
    try:
        if user.identity_number:
            existing = db.query(User).filter(User.identity_number == user.identity_number).first()
            if existing:
                raise HTTPException(status_code=400, detail="该证件号已存在")
        db_user = User(**user.model_dump())
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


def register_user(db: Session, body: RegisterRequest) -> User:
    """用户注册：姓名、手机、密码必填；按手机去重"""
    try:
        existing_phone = db.query(User).filter(User.phone == body.phone.strip()).first()
        if existing_phone:
            raise HTTPException(status_code=400, detail="该手机号已注册")
        if body.email:
            existing_email = db.query(User).filter(User.email == body.email).first()
            if existing_email:
                raise HTTPException(status_code=400, detail="该邮箱已注册")
        db_user = User(
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


def authenticate_user(db: Session, phone: str, password: str) -> User | None:
    """普通用户认证：手机号 + 密码"""
    user = get_user_by_phone(db, phone)
    if not user or not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user