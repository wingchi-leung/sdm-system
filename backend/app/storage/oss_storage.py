"""阿里云OSS存储实现"""
import os
from typing import Optional
from app.storage.base import StorageBase

# 阿里云OSS SDK（需要时安装：pip install oss2）
# import oss2


class AliyunOSSStorage(StorageBase):
    """
    阿里云OSS存储

    适合：
    - 生产环境
    - 需要CDN加速
    - 高可用要求

    使用前需要：
    1. pip install oss2
    2. 在阿里云创建OSS Bucket
    3. 获取 AccessKey 和 SecretKey
    """

    def __init__(
        self,
        access_key_id: str,
        access_key_secret: str,
        endpoint: str,
        bucket_name: str,
        cdn_domain: Optional[str] = None,
    ):
        """
        初始化阿里云OSS存储

        Args:
            access_key_id: 阿里云AccessKey ID
            access_key_secret: 阿里云AccessKey Secret
            endpoint: OSS地域节点，如 oss-cn-hangzhou.aliyuncs.com
            bucket_name: Bucket名称
            cdn_domain: CDN加速域名（可选），如果配置了CDN则使用CDN域名
        """
        self.access_key_id = access_key_id
        self.access_key_secret = access_key_secret
        self.endpoint = endpoint
        self.bucket_name = bucket_name
        self.cdn_domain = cdn_domain

        # 基础URL（默认使用OSS域名，有CDN则用CDN）
        if cdn_domain:
            self.base_url = f"https://{cdn_domain}"
        else:
            self.base_url = f"https://{bucket_name}.{endpoint}"

        # 初始化Bucket（需要安装oss2）
        # auth = oss2.Auth(access_key_id, access_key_secret)
        # self.bucket = oss2.Bucket(auth, endpoint, bucket_name)

        # 未安装oss2时的占位
        self.bucket = None
        self._oss_available = False
        try:
            import oss2
            auth = oss2.Auth(access_key_id, access_key_secret)
            self.bucket = oss2.Bucket(auth, endpoint, bucket_name)
            self._oss_available = True
        except ImportError:
            pass

    async def upload(
        self,
        file_data: bytes,
        filename: str,
        folder: str = "posters"
    ) -> str:
        """
        上传文件到阿里云OSS

        Args:
            file_data: 文件二进制数据
            filename: 文件名
            folder: 存储文件夹

        Returns:
            文件访问URL
        """
        if not self._oss_available:
            raise RuntimeError("阿里云OSS SDK未安装，请执行: pip install oss2")

        # 构建对象键（OSS中的文件路径）
        object_key = f"{folder}/{filename}"

        # 上传到OSS
        self.bucket.put_object(object_key, file_data)

        return self.get_full_url(object_key)

    async def delete(self, file_url: str) -> bool:
        """
        删除OSS中的文件

        Args:
            file_url: 文件访问URL

        Returns:
            删除是否成功
        """
        if not self._oss_available:
            return False

        try:
            # 从URL提取对象键
            object_key = file_url.replace(self.base_url + "/", "")
            self.bucket.delete_object(object_key)
            return True
        except Exception:
            return False

    async def exists(self, file_url: str) -> bool:
        """
        检查文件是否存在

        Args:
            file_url: 文件访问URL

        Returns:
            文件是否存在
        """
        if not self._oss_available:
            return False

        try:
            object_key = file_url.replace(self.base_url + "/", "")
            return self.bucket.object_exists(object_key)
        except Exception:
            return False

    def get_full_url(self, relative_path: str) -> str:
        """
        根据相对路径获取完整访问URL

        Args:
            relative_path: 相对路径

        Returns:
            完整访问URL
        """
        return f"{self.base_url}/{relative_path}"