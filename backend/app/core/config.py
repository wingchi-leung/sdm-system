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
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    # 生产环境建议设为 True：仅允许通过 HTTPS 发起的登录请求，避免密码明文传输
    REQUIRE_HTTPS_FOR_LOGIN: bool = False
    # 登录限流：每个 IP 在此时间窗内最多允许的登录尝试次数
    LOGIN_RATE_LIMIT_COUNT: int = 10
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 60

    # 微信小程序：用于 code 换 openid（微信授权登录）
    WECHAT_APPID: Optional[str] = None
    WECHAT_SECRET: Optional[str] = None

    # 微信支付配置
    WECHAT_PAY_MCH_ID: Optional[str] = None           # 商户号
    WECHAT_PAY_API_V3_KEY: Optional[str] = None       # API v3 密钥
    WECHAT_PAY_SERIAL_NO: Optional[str] = None        # 商户证书序列号
    WECHAT_PAY_PRIVATE_KEY_PATH: Optional[str] = None # 私钥文件路径
    WECHAT_PAY_NOTIFY_URL: Optional[str] = None       # 支付回调地址

    class Config:
        env_file = ".env"

# 创建设置实例
@lru_cache()
def get_settings() -> Settings:
    return Settings()

# 导出设置实例
settings = get_settings()