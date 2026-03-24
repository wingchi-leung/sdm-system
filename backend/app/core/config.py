from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache
import sys


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
    # JWT 密钥：必须通过环境变量配置，不提供默认值
    JWT_SECRET: str
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

    # 数据库配置
    DB_ECHO: bool = False  # 是否打印 SQL 日志，生产环境应设为 False

    # CORS 配置：允许的跨域来源，逗号分隔
    # 生产环境必须配置，不允许使用 "*"
    CORS_ORIGINS: str = "*"  # 示例: "https://example.com,https://admin.example.com"

    # 请求体大小限制（字节）
    MAX_REQUEST_BODY_SIZE: int = 10 * 1024 * 1024  # 10MB

    # 支付金额上限（分，单位：厘，100000 = 1000元）
    MAX_PAYMENT_AMOUNT: int = 100000  # 1000元上限

    # 密码哈希配置：bcrypt 工作因子（12 是推荐值，平衡安全性和性能）
    BCRYPT_ROUNDS: int = 12

    # 文件上传配置
    MAX_POSTER_SIZE: int = 5 * 1024 * 1024  # 海报最大尺寸 5MB
    ALLOWED_POSTER_TYPES: str = "image/png,image/jpeg,image/jpg"  # 允许的海报类型

    # ============================================================
    # 存储服务配置
    # ============================================================
    # 存储类型: local（本地）, oss（阿里云）, cos（腾讯云）
    STORAGE_TYPE: str = "local"

    # --- 本地存储配置 ---
    LOCAL_UPLOAD_DIR: str = "uploads"  # 本地存储目录
    STORAGE_BASE_URL: str = "http://localhost:8000/uploads"  # 文件访问基础URL

    # --- 阿里云OSS配置（STORAGE_TYPE=oss 时使用）---
    OSS_ACCESS_KEY_ID: Optional[str] = None
    OSS_ACCESS_KEY_SECRET: Optional[str] = None
    OSS_BUCKET: Optional[str] = None
    OSS_ENDPOINT: Optional[str] = None  # 如: oss-cn-hangzhou.aliyuncs.com
    OSS_CDN_DOMAIN: Optional[str] = None  # CDN加速域名（可选）

    # --- 腾讯云COS配置（STORAGE_TYPE=cos 时使用）---
    COS_SECRET_ID: Optional[str] = None
    COS_SECRET_KEY: Optional[str] = None
    COS_BUCKET: Optional[str] = None  # 如: mybucket-1250000000
    COS_REGION: Optional[str] = None  # 如: ap-guangzhou
    COS_CDN_DOMAIN: Optional[str] = None  # CDN加速域名（可选）

    class Config:
        env_file = ".env"


# 默认 JWT 密钥值，用于检测是否配置
_DEFAULT_JWT_SECRET = "change-me-in-production"


# 创建设置实例
@lru_cache()
def get_settings() -> Settings:
    try:
        settings_instance = Settings()
        # 检查 JWT_SECRET 是否为不安全的默认值
        if settings_instance.JWT_SECRET == _DEFAULT_JWT_SECRET:
            print("[ERROR] JWT_SECRET 不能使用默认值，请配置环境变量 JWT_SECRET")
            sys.exit(1)
        return settings_instance
    except Exception as e:
        print(f"[ERROR] 配置加载失败: {e}")
        sys.exit(1)


# 导出设置实例
settings = get_settings()