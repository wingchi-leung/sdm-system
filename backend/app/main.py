from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from app.database  import SessionLocal
from app.core.config import settings
from app.api.v1.router import api_router


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
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
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

 

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)