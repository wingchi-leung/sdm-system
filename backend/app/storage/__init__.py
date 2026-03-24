"""存储服务模块"""
from app.storage.base import StorageBase
from app.storage.factory import get_storage

__all__ = ["StorageBase", "get_storage"]