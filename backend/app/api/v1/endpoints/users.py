from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.crud import crud_user
from app.api import deps
from app.models import user

router = APIRouter()


@router.post("/register", response_model=user.UserResponse)
def register(body: user.RegisterRequest, db: Session = Depends(deps.get_db)):
    """用户注册：姓名、手机、密码必填"""
    return crud_user.register_user(db=db, body=body)


@router.get("/me", response_model=user.UserResponse)
def get_my_profile(
    db: Session = Depends(deps.get_db),
    current: dict = Depends(deps.get_current_user),
):
    """获取当前登录用户的个人信息（需要 user 角色的 token）"""
    if current["role"] != "user":
        raise HTTPException(status_code=403, detail="仅限普通用户访问")
    db_user = crud_user.get_user(db, user_id=current["id"])
    if db_user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return db_user


@router.post("/create", response_model=user.UserResponse)
def create_user(user_in: user.UserCreate, db: Session = Depends(deps.get_db)):
    return crud_user.create_user(db=db, user=user_in)


@router.get("/{user_id}", response_model=user.UserResponse)
def read_user(user_id: int, db: Session = Depends(deps.get_db)):
    db_user = crud_user.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


@router.get("/", response_model=List[user.UserResponse])
def get_users(db: Session = Depends(deps.get_db)):
    try:
        return crud_user.get_users(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))