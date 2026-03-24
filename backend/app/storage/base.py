"""存储服务抽象基类"""
from abc import ABC, abstractmethod
from typing import Optional


class StorageBase(ABC):
    """
    存储服务抽象基类

    所有存储实现（本地、OSS、COS等）都需要继承此类并实现所有方法。
    这样业务代码只需要调用统一的接口，不需要关心底层存储实现。
    """

    @abstractmethod
    async def upload(
        self,
        file_data: bytes,
        filename: str,
        folder: str = "posters"
    ) -> str:
        """
        上传文件

        Args:
            file_data: 文件二进制数据
            filename: 文件名（含扩展名）
            folder: 存储文件夹，默认 posters

        Returns:
            文件访问URL
        """
        pass

    @abstractmethod
    async def delete(self, file_url: str) -> bool:
        """
        删除文件

        Args:
            file_url: 文件访问URL

        Returns:
            删除是否成功
        """
        pass

    @abstractmethod
    async def exists(self, file_url: str) -> bool:
        """
        检查文件是否存在

        Args:
            file_url: 文件访问URL

        Returns:
            文件是否存在
        """
        pass

    @abstractmethod
    def get_full_url(self, relative_path: str) -> str:
        """
        根据相对路径获取完整访问URL

        Args:
            relative_path: 相对路径，如 posters/xxx.jpg

        Returns:
            完整访问URL
        """
        pass