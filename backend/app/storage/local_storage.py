"""本地磁盘存储实现"""
import os
import aiofiles
from typing import Optional
from app.storage.base import StorageBase


class LocalStorage(StorageBase):
    """
    本地磁盘存储

    将文件存储在本地服务器磁盘上，适合：
    - 开发环境
    - 小规模部署
    - 内网环境

    注意：部署时需要确保：
    1. 存储目录有写入权限
    2. 静态文件服务已正确配置（如 Nginx 或 FastAPI StaticFiles）
    """

    def __init__(self, upload_dir: str, base_url: str):
        """
        初始化本地存储

        Args:
            upload_dir: 文件存储根目录，如 /data/sdm-uploads 或 D:/sdm-uploads
            base_url: 文件访问基础URL，如 http://192.168.1.100:8000/uploads
        """
        self.upload_dir = upload_dir
        self.base_url = base_url.rstrip("/")

        # 确保存储目录存在
        os.makedirs(self.upload_dir, exist_ok=True)

    async def upload(
        self,
        file_data: bytes,
        filename: str,
        folder: str = "posters"
    ) -> str:
        """
        上传文件到本地磁盘

        Args:
            file_data: 文件二进制数据
            filename: 文件名
            folder: 存储文件夹

        Returns:
            文件访问URL
        """
        # 构建存储路径
        folder_path = os.path.join(self.upload_dir, folder)
        os.makedirs(folder_path, exist_ok=True)

        file_path = os.path.join(folder_path, filename)

        # 异步写入文件
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_data)

        # 返回访问URL
        return self.get_full_url(f"{folder}/{filename}")

    async def delete(self, file_url: str) -> bool:
        """
        删除本地文件

        Args:
            file_url: 文件访问URL

        Returns:
            删除是否成功
        """
        try:
            # 从URL提取文件路径
            relative_path = file_url.replace(self.base_url + "/", "")
            file_path = os.path.join(self.upload_dir, relative_path)

            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False
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
        relative_path = file_url.replace(self.base_url + "/", "")
        file_path = os.path.join(self.upload_dir, relative_path)
        return os.path.exists(file_path)

    def get_full_url(self, relative_path: str) -> str:
        """
        根据相对路径获取完整访问URL

        Args:
            relative_path: 相对路径

        Returns:
            完整访问URL
        """
        return f"{self.base_url}/{relative_path}"