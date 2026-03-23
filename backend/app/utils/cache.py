"""
应用内存缓存模块

适用于单实例部署场景，提供线程安全的简单缓存实现。
"""
from datetime import datetime, timedelta
from typing import Any, Callable, Optional
import threading


class SimpleCache:
    """简单的线程安全内存缓存"""

    def __init__(self):
        self._cache: dict[str, Any] = {}
        self._expire: dict[str, datetime] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        """获取缓存值，过期返回 None"""
        with self._lock:
            if key not in self._cache:
                return None
            if datetime.now() > self._expire.get(key, datetime.max):
                del self._cache[key]
                del self._expire[key]
                return None
            return self._cache[key]

    def set(self, key: str, value: Any, ttl_seconds: int):
        """设置缓存值"""
        with self._lock:
            self._cache[key] = value
            self._expire[key] = datetime.now() + timedelta(seconds=ttl_seconds)

    def delete(self, key: str):
        """删除缓存"""
        with self._lock:
            self._cache.pop(key, None)
            self._expire.pop(key, None)

    def clear(self):
        """清空所有缓存"""
        with self._lock:
            self._cache.clear()
            self._expire.clear()

    def cleanup_expired(self):
        """清理过期缓存（可选，用于定期清理）"""
        with self._lock:
            now = datetime.now()
            expired_keys = [
                k for k, v in self._expire.items()
                if v <= now
            ]
            for k in expired_keys:
                self._cache.pop(k, None)
                self._expire.pop(k, None)


# 全局缓存实例
cache = SimpleCache()


def cached(key: str, ttl_seconds: int, loader: Callable[[], Any]) -> Any:
    """
    缓存获取辅助函数

    Args:
        key: 缓存键
        ttl_seconds: 过期时间（秒）
        loader: 数据加载函数

    Returns:
        缓存值或加载的值

    Example:
        def get_tenant_cached(db: Session, tenant_id: int) -> Tenant:
            return cached(
                f"tenant:{tenant_id}",
                ttl_seconds=600,
                loader=lambda: db.query(Tenant).filter(Tenant.id == tenant_id).first()
            )
    """
    value = cache.get(key)
    if value is not None:
        return value
    value = loader()
    cache.set(key, value, ttl_seconds)
    return value


# 缓存键常量和 TTL 配置
class CacheKeys:
    """缓存键前缀常量"""
    TENANT = "tenant"
    ACTIVITY_TYPES = "activity_types"
    ADMIN_SCOPE = "admin_scope"
    WECHAT_TOKEN = "wechat_token"


class CacheTTL:
    """缓存 TTL 常量（秒）"""
    TENANT = 600           # 10 分钟
    ACTIVITY_TYPES = 600   # 10 分钟
    ADMIN_SCOPE = 300      # 5 分钟
    WECHAT_TOKEN = 5400    # 1.5 小时（微信 token 有效期 2 小时）
