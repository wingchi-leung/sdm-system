from typing import Generator
from fastapi import Depends, HTTPException, status
from app.database import SessionLocal
from sqlalchemy.orm import Session

def get_db() -> Generator[Session, None, None]:
    """
    数据库依赖项，用于在每个请求中获取数据库会话
    使用方法：db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()