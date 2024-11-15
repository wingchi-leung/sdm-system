from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "签到系统"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    MYSQL_HOST: str
    MYSQL_USER: str
    MYSQL_PASSWORD: str
    MYSQL_DB: str
    MYSQL_PORT: int = 3306

    class Config:
        env_file = ".env"

settings = Settings()