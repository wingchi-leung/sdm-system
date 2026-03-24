"""文件上传 API 端点"""
import os
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.api import deps
from app.core.config import settings
from app.storage import get_storage

router = APIRouter()

# 获取存储服务实例（全局单例）
storage = get_storage()


def _validate_image(file: UploadFile) -> None:
    """验证图片文件"""
    # 检查文件类型
    allowed_types = settings.ALLOWED_POSTER_TYPES.split(",")
    content_type = file.content_type or ""
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="不支持的文件类型，仅支持 PNG 和 JPG 格式"
        )


@router.post("/poster")
async def upload_poster(
    file: UploadFile = File(...),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """
    上传活动海报图片

    - 仅支持 PNG、JPG 格式
    - 最大文件大小 5MB
    - 需要管理员权限

    返回:
    - url: 文件访问URL（完整URL，可直接访问）
    - filename: 文件名
    - size: 文件大小（字节）
    """
    # 验证文件类型
    _validate_image(file)

    # 读取文件内容检查大小
    content = await file.read()
    if len(content) > settings.MAX_POSTER_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件过大，最大允许 {settings.MAX_POSTER_SIZE // (1024*1024)}MB"
        )

    # 生成唯一文件名
    ext = os.path.splitext(file.filename or "image.jpg")[1].lower()
    if ext not in [".png", ".jpg", ".jpeg"]:
        ext = ".jpg"

    filename = f"{datetime.now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"

    # 使用存储服务上传文件
    # 存储服务会根据配置自动选择本地存储或云存储
    file_url = await storage.upload(content, filename, folder="posters")

    return {
        "url": file_url,
        "filename": filename,
        "size": len(content),
    }