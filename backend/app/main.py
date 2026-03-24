from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from app.database  import SessionLocal
from app.core.config import settings
from app.api.v1.router import api_router
import logging
import os

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时启动定时任务
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


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# 添加请求体大小限制中间件
app.add_middleware(RequestSizeLimitMiddleware, max_body_size=settings.MAX_REQUEST_BODY_SIZE)

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
    uploads_dir = settings.LOCAL_UPLOAD_DIR
    if not os.path.isabs(uploads_dir):
        uploads_dir = os.path.join(os.getcwd(), uploads_dir)
    if not os.path.exists(uploads_dir):
        os.makedirs(uploads_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

 

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)