"""文件上传 API 端点"""
import io
import logging
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api import deps
from app.core.config import settings
from app.storage import get_storage

router = APIRouter()
logger = logging.getLogger(__name__)

# 获取存储服务实例（全局单例）
storage = get_storage()

AVATAR_MAX_SIDE = 512
AVATAR_JPEG_QUALITY = 82


def _build_dated_folder(*segments: str) -> str:
    """按年月构造分层目录，避免单目录文件过多。"""
    now = datetime.now()
    safe_segments = [segment.strip("/") for segment in segments if segment and segment.strip("/")]
    safe_segments.extend([now.strftime("%Y"), now.strftime("%m")])
    return "/".join(safe_segments)


def _validate_image(file: UploadFile) -> None:
    """验证图片文件。

    微信真机上传时 content_type 可能为空或被设置成 application/octet-stream，
    因此这里同时兼容文件扩展名校验，避免真机图片被误判。
    """
    allowed_types = {
        item.strip().lower()
        for item in settings.ALLOWED_POSTER_TYPES.split(",")
        if item.strip()
    }
    allowed_extensions = {".png", ".jpg", ".jpeg"}

    content_type = (file.content_type or "").strip().lower()
    extension = os.path.splitext(file.filename or "")[1].lower()

    content_type_allowed = not content_type or content_type in allowed_types or content_type == "application/octet-stream"
    extension_allowed = extension in allowed_extensions

    if not extension_allowed and not content_type_allowed:
        raise HTTPException(
            status_code=400,
            detail="不支持的文件类型，仅支持 PNG 和 JPG 格式"
        )

    if extension and not extension_allowed:
        raise HTTPException(
            status_code=400,
            detail="不支持的文件扩展名，仅支持 PNG 和 JPG 格式"
        )


def _safe_image_extension(filename: str | None, fallback: str = ".jpg") -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in [".png", ".jpg", ".jpeg"]:
        return ext
    return fallback


def _optimize_avatar_image(content: bytes) -> tuple[bytes, str]:
    """将头像压缩到展示所需尺寸，减少上传后首屏加载体积。"""
    try:
        from PIL import Image, ImageOps, UnidentifiedImageError
    except ImportError:
        logger.warning("Pillow 未安装，头像将按原图保存")
        return content, ".jpg"

    try:
        with Image.open(io.BytesIO(content)) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((AVATAR_MAX_SIDE, AVATAR_MAX_SIDE))

            if image.mode in ("RGBA", "LA") or (
                image.mode == "P" and "transparency" in image.info
            ):
                rgba = image.convert("RGBA")
                canvas = Image.new("RGB", rgba.size, (255, 255, 255))
                canvas.paste(rgba, mask=rgba.getchannel("A"))
                output_image = canvas
            else:
                output_image = image.convert("RGB")

            output = io.BytesIO()
            output_image.save(
                output,
                format="JPEG",
                quality=AVATAR_JPEG_QUALITY,
                optimize=True,
                progressive=True,
            )
            optimized = output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        logger.info("头像图片优化失败，按原图保存: %s", exc)
        return content, ".jpg"

    if len(optimized) >= len(content):
        return content, ".jpg"
    return optimized, ".jpg"


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
    folder = _build_dated_folder("posters")
    file_url = await storage.upload(content, filename, folder=folder)
    if settings.STORAGE_TYPE == "local":
        file_url = f"/uploads/{folder}/{filename}"

    return {
        "url": file_url,
        "filename": filename,
        "size": len(content),
    }


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """上传用户头像。"""
    _validate_image(file)

    content = await file.read()
    if len(content) > settings.MAX_POSTER_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件过大，最大允许 {settings.MAX_POSTER_SIZE // (1024 * 1024)}MB"
        )

    original_ext = _safe_image_extension(file.filename, fallback=".jpg")
    optimized_content, optimized_ext = _optimize_avatar_image(content)
    if optimized_content is content:
        optimized_ext = original_ext

    filename = f"{datetime.now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{optimized_ext}"
    folder = _build_dated_folder("avatars")
    file_url = await storage.upload(optimized_content, filename, folder=folder)
    if settings.STORAGE_TYPE == "local":
        file_url = f"/uploads/{folder}/{filename}"

    return {
        "url": file_url,
        "filename": filename,
        "size": len(optimized_content),
    }


@router.post("/community-image")
async def upload_community_image(
    file: UploadFile = File(...),
    ctx: deps.TenantContext = Depends(deps.get_current_user),
):
    """上传社区图片（频道封面、动态配图、评论配图）。"""
    _validate_image(file)

    content = await file.read()
    if len(content) > settings.MAX_POSTER_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件过大，最大允许 {settings.MAX_POSTER_SIZE // (1024 * 1024)}MB"
        )

    ext = os.path.splitext(file.filename or "image.jpg")[1].lower()
    if ext not in [".png", ".jpg", ".jpeg"]:
        ext = ".jpg"

    filename = f"{datetime.now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"
    folder = _build_dated_folder("community", "posts")
    file_url = await storage.upload(content, filename, folder=folder)
    if settings.STORAGE_TYPE == "local":
        file_url = f"/uploads/{folder}/{filename}"

    return {
        "url": file_url,
        "filename": filename,
        "size": len(content),
    }
