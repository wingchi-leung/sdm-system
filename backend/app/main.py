from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from app.database  import SessionLocal, engine
from app.core.config import resolve_local_upload_dir, settings
from app.api.v1.router import api_router
from app.db_migrations import ensure_runtime_schema
from app.schemas import Base
from app.core.pii import install_sensitive_data_filter
import logging
import os
from sqlalchemy import text

logger = logging.getLogger(__name__)
install_sensitive_data_filter()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    db = None
    # 启动诊断：明确打印当前服务目标数据库配置与实际连接库，便于排查“看着有列但运行报缺列”的问题。
    logger.warning(
        "数据库配置: host=%s port=%s db=%s user=%s",
        settings.MYSQL_HOST,
        settings.MYSQL_PORT,
        settings.MYSQL_DB,
        settings.MYSQL_USER,
    )
    try:
        with engine.connect() as conn:
            current_db = conn.execute(text("SELECT DATABASE()")).scalar()
            current_host = conn.execute(text("SELECT @@hostname")).scalar()
            current_port = conn.execute(text("SELECT @@port")).scalar()
            logger.warning(
                "数据库连接诊断: current_db=%s mysql_host=%s mysql_port=%s",
                current_db,
                current_host,
                current_port,
            )
    except Exception as e:
        logger.error(f"数据库连接诊断失败: {e}")

    try:
        ensure_runtime_schema(engine, Base.metadata)
    except Exception as e:
        logger.error(f"补齐运行期数据库结构失败: {e}")

    # 启动时启动定时任务
    try:
        from app.crud import crud_rbac
        db = SessionLocal()
        crud_rbac.ensure_system_rbac_seed(db)
        logger.info("RBAC 基础权限与系统角色已校准")
    except Exception as e:
        logger.error(f"校准 RBAC 基础数据失败: {e}")
    finally:
        if db is not None:
            db.close()

    try:
        from app.tasks.scheduler import start_scheduler
        start_scheduler(interval_seconds=300)  # 每 5 分钟执行一次
        logger.info("支付订单定时任务已启动")
    except Exception as e:
        logger.error(f"启动定时任务失败: {e}")

    yield

    # 关闭时停止定时任务
    try:
        from app.tasks.scheduler import stop_scheduler
        stop_scheduler()
        logger.info("支付订单定时任务已停止")
    except Exception as e:
        logger.error(f"停止定时任务失败: {e}")


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """请求体大小限制中间件"""

    def __init__(self, app, max_body_size: int):
        super().__init__(app)
        self.max_body_size = max_body_size

    async def dispatch(self, request: Request, call_next):
        # 获取 Content-Length 头
        content_length = request.headers.get("content-length")
        if content_length:
            content_length = int(content_length)
            if content_length > self.max_body_size:
                raise HTTPException(
                    status_code=413,
                    detail=f"请求体过大，最大允许 {self.max_body_size // (1024 * 1024)}MB"
                )
        return await call_next(request)


class UploadCacheControlMiddleware(BaseHTTPMiddleware):
    """给上传后的静态资源添加缓存头，降低重复加载耗时。"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if (
            request.method in {"GET", "HEAD"}
            and request.url.path.startswith("/uploads/")
            and response.status_code == 200
        ):
            response.headers.setdefault(
                "Cache-Control",
                "public, max-age=31536000, immutable",
            )
        return response


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# 添加请求体大小限制中间件
app.add_middleware(RequestSizeLimitMiddleware, max_body_size=settings.MAX_REQUEST_BODY_SIZE)
app.add_middleware(UploadCacheControlMiddleware)

app.include_router(api_router, prefix=settings.API_V1_STR)


# CORS configuration - 从环境变量读取允许的域名列表
cors_origins = settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS else ["*"]
# 移除空白字符
cors_origins = [origin.strip() for origin in cors_origins if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 本地存储模式下，挂载静态文件目录用于访问上传的文件
# 云存储模式下不需要，文件直接从云存储URL访问
if settings.STORAGE_TYPE == "local":
    uploads_dir = resolve_local_upload_dir(settings.LOCAL_UPLOAD_DIR)
    if not os.path.exists(uploads_dir):
        os.makedirs(uploads_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

 

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
