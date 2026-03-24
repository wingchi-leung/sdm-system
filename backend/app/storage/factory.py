"""存储服务工厂"""
from functools import lru_cache
from app.storage.base import StorageBase
from app.storage.local_storage import LocalStorage
from app.storage.oss_storage import AliyunOSSStorage
from app.storage.cos_storage import TencentCOSStorage
from app.core.config import settings


@lru_cache()
def get_storage() -> StorageBase:
    """
    根据配置获取存储服务实例

    配置示例（.env文件）：

    # === 本地存储（默认）===
    STORAGE_TYPE=local
    LOCAL_UPLOAD_DIR=/data/sdm-uploads
    STORAGE_BASE_URL=http://192.168.1.100:8000/uploads

    # === 阿里云OSS ===
    # STORAGE_TYPE=oss
    # OSS_ACCESS_KEY_ID=your_access_key
    # OSS_ACCESS_KEY_SECRET=your_secret
    # OSS_BUCKET=your-bucket
    # OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
    # OSS_CDN_DOMAIN=cdn.example.com  # 可选

    # === 腾讯云COS ===
    # STORAGE_TYPE=cos
    # COS_SECRET_ID=your_secret_id
    # COS_SECRET_KEY=your_secret_key
    # COS_BUCKET=your-bucket-1250000000
    # COS_REGION=ap-guangzhou
    # COS_CDN_DOMAIN=cdn.example.com  # 可选

    Returns:
        StorageBase: 存储服务实例
    """
    storage_type = settings.STORAGE_TYPE.lower()

    if storage_type == "local":
        return LocalStorage(
            upload_dir=settings.LOCAL_UPLOAD_DIR,
            base_url=settings.STORAGE_BASE_URL,
        )

    elif storage_type == "oss":
        return AliyunOSSStorage(
            access_key_id=settings.OSS_ACCESS_KEY_ID,
            access_key_secret=settings.OSS_ACCESS_KEY_SECRET,
            endpoint=settings.OSS_ENDPOINT,
            bucket_name=settings.OSS_BUCKET,
            cdn_domain=settings.OSS_CDN_DOMAIN,
        )

    elif storage_type == "cos":
        return TencentCOSStorage(
            secret_id=settings.COS_SECRET_ID,
            secret_key=settings.COS_SECRET_KEY,
            region=settings.COS_REGION,
            bucket_name=settings.COS_BUCKET,
            cdn_domain=settings.COS_CDN_DOMAIN,
        )

    else:
        raise ValueError(
            f"不支持的存储类型: {storage_type}。"
            f"支持的类型: local, oss, cos"
        )