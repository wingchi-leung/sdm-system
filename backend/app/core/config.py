from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache

class Settings(BaseSettings):
    PROJECT_NAME: str = "SDM system"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DESCRIPTION : str  = "SDM signin system"
    MYSQL_HOST: str
    MYSQL_USER: str
    MYSQL_PASSWORD: str
    MYSQL_DB: str
    MYSQL_PORT: int = 3306

    class Config:
        env_file = ".env"

# 创建设置实例
@lru_cache()
def get_settings() -> Settings:
    return Settings()

# 导出设置实例
settings = get_settings()