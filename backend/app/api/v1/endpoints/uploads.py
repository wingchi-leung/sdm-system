"""文件上传 API 端点"""
import os
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.api import deps
from app.core.config import settings

router = APIRouter()


def _ensure_upload_dir():
    """确保上传目录存在"""
    upload_dir = os.path.join(os.getcwd(), settings.UPLOAD_DIR, "posters")
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


def _validate_image(file: UploadFile) -> None:
    """验证图片文件"""
    # 检查文件类型
    allowed_types = settings.ALLOWED_POSTER_TYPES.split(",")
    content_type = file.content_type or ""
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型，仅支持 PNG 和 JPG 格式"
        )


@router.post("/poster")
async def upload_poster(
    file: UploadFile = File(...),
    ctx: deps.TenantContext = Depends(deps.get_current_admin),
):
    """上传活动海报图片

    - 仅支持 PNG、JPG 格式
    - 最大文件大小 5MB
    - 需要管理员权限
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

    # 保存文件
    upload_dir = _ensure_upload_dir()
    file_path = os.path.join(upload_dir, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    # 返回可访问的 URL
    poster_url = f"/uploads/posters/{filename}"

    return {
        "url": poster_url,
        "filename": filename,
        "size": len(content),
    }