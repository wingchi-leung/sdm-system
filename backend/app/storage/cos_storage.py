"""腾讯云COS存储实现"""
from typing import Optional
from app.storage.base import StorageBase

# 腾讯云COS SDK（需要时安装：pip install cos-python-sdk-v5）
# from qcloud_cos import CosConfig, CosS3Client


class TencentCOSStorage(StorageBase):
    """
    腾讯云COS存储

    适合：
    - 生产环境
    - 需要CDN加速
    - 高可用要求

    使用前需要：
    1. pip install cos-python-sdk-v5
    2. 在腾讯云创建COS Bucket
    3. 获取 SecretId 和 SecretKey
    """

    def __init__(
        self,
        secret_id: str,
        secret_key: str,
        region: str,
        bucket_name: str,
        cdn_domain: Optional[str] = None,
    ):
        """
        初始化腾讯云COS存储

        Args:
            secret_id: 腾讯云SecretId
            secret_key: 腾讯云SecretKey
            region: 地域，如 ap-guangzhou
            bucket_name: Bucket名称，如 mybucket-1250000000
            cdn_domain: CDN加速域名（可选）
        """
        self.secret_id = secret_id
        self.secret_key = secret_key
        self.region = region
        self.bucket_name = bucket_name
        self.cdn_domain = cdn_domain

        # 基础URL
        if cdn_domain:
            self.base_url = f"https://{cdn_domain}"
        else:
            self.base_url = f"https://{bucket_name}.cos.{region}.myqcloud.com"

        # 初始化客户端
        self.client = None
        self._cos_available = False
        try:
            from qcloud_cos import CosConfig, CosS3Client
            config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key)
            self.client = CosS3Client(config)
            self._cos_available = True
        except ImportError:
            pass

    async def upload(
        self,
        file_data: bytes,
        filename: str,
        folder: str = "posters"
    ) -> str:
        """上传文件到腾讯云COS"""
        if not self._cos_available:
            raise RuntimeError("腾讯云COS SDK未安装，请执行: pip install cos-python-sdk-v5")

        object_key = f"{folder}/{filename}"

        self.client.put_object(
            Bucket=self.bucket_name,
            Body=file_data,
            Key=object_key,
        )

        return self.get_full_url(object_key)

    async def delete(self, file_url: str) -> bool:
        """删除COS中的文件"""
        if not self._cos_available:
            return False

        try:
            object_key = file_url.replace(self.base_url + "/", "")
            self.client.delete_object(Bucket=self.bucket_name, Key=object_key)
            return True
        except Exception:
            return False

    async def exists(self, file_url: str) -> bool:
        """检查文件是否存在"""
        if not self._cos_available:
            return False

        try:
            object_key = file_url.replace(self.base_url + "/", "")
            self.client.head_object(Bucket=self.bucket_name, Key=object_key)
            return True
        except Exception:
            return False

    def get_full_url(self, relative_path: str) -> str:
        """根据相对路径获取完整访问URL"""
        return f"{self.base_url}/{relative_path}"