"""将 Teams 社区导出归档导入本机 SDM 社区频道。"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


POST_MARKER_RE = re.compile(
    r"<!-- teams-source-post:(?P<post_id>[^;]+);replies:(?P<reply_ids>[^ ]*) -->"
)


@dataclass(frozen=True)
class ImportThread:
    post: dict[str, Any]
    replies: list[dict[str, Any]]


def load_threads(batch_dir: Path) -> list[ImportThread]:
    raw_path = batch_dir / "teams-raw.json"
    if not raw_path.is_file():
        raise ValueError(f"没有找到 Teams 原始数据：{raw_path}")
    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    posts = raw.get("posts") or []
    replies_by_post: dict[str, list[dict[str, Any]]] = {}
    for reply in raw.get("replies") or []:
        parent_id = str(reply.get("source_parent_post_id") or "")
        replies_by_post.setdefault(parent_id, []).append(reply)
    threads = [
        ImportThread(
            post=post,
            replies=replies_by_post.get(str(post.get("source_post_id") or ""), []),
        )
        for post in posts
    ]
    post_ids = {str(post.get("source_post_id") or "") for post in posts}
    for parent_id, orphan_replies in replies_by_post.items():
        if parent_id in post_ids or not orphan_replies:
            continue
        first_reply = orphan_replies[0]
        threads.append(
            ImportThread(
                post={
                    "source_post_id": parent_id,
                    "author": first_reply.get("parent_author") or "未知作者",
                    "published_at": "",
                    "title": first_reply.get("parent_title") or "Teams 社区主题",
                    "text": "该 Teams 主帖不在作者筛选范围内，归档仅保留其中符合条件的回复。",
                    "local_images": [],
                },
                replies=orphan_replies,
            )
        )
    return threads


def build_source_marker(post_id: str, reply_ids: list[str]) -> str:
    normalized_ids = sorted({str(item) for item in reply_ids if str(item)})
    return f"<!-- teams-source-post:{post_id};replies:{','.join(normalized_ids)} -->"


def parse_source_marker(content: str) -> tuple[str, set[str]] | None:
    match = POST_MARKER_RE.search(content or "")
    if not match:
        return None
    reply_ids = {item for item in match.group("reply_ids").split(",") if item}
    return match.group("post_id"), reply_ids


def build_post_html(post: dict[str, Any], reply_ids: list[str]) -> str:
    post_id = str(post.get("source_post_id") or "")
    paragraphs = [
        f"<p>{html.escape(line)}</p>"
        for line in str(post.get("text") or "").splitlines()
        if line.strip()
    ]
    author = html.escape(str(post.get("author") or "未知"))
    published_at = html.escape(str(post.get("published_at") or "未知"))
    attribution = f"<p>来源：Microsoft Teams｜作者：{author}｜发布时间：{published_at}</p>"
    return "".join([*paragraphs, attribution, build_source_marker(post_id, reply_ids)])


def replace_source_marker(content: str, post_id: str, reply_ids: list[str]) -> str:
    marker = build_source_marker(post_id, reply_ids)
    if POST_MARKER_RE.search(content or ""):
        return POST_MARKER_RE.sub(marker, content, count=1)
    return f"{content}{marker}"


def build_comment_text(reply: dict[str, Any]) -> str:
    return str(reply.get("text") or "").strip()[:1000]


def resolve_entry_images(batch_dir: Path, entry: dict[str, Any]) -> list[Path]:
    batch_root = batch_dir.resolve()
    result: list[Path] = []
    for relative_path in entry.get("local_images") or []:
        candidate = (batch_root / str(relative_path)).resolve()
        if not candidate.is_relative_to(batch_root):
            raise ValueError(f"图片路径越界：{relative_path}")
        if not candidate.is_file():
            alternatives = [
                candidate.with_suffix(extension)
                for extension in (".jpg", ".jpeg", ".png")
                if candidate.with_suffix(extension).is_file()
            ]
            if len(alternatives) != 1:
                raise ValueError(f"图片文件不存在：{candidate}")
            candidate = alternatives[0]
        result.append(candidate)
    if len(result) > 9:
        raise ValueError(f"单条内容图片超过 9 张：{entry.get('source_post_id') or entry.get('source_reply_id')}")
    return result


def validate_threads(batch_dir: Path, threads: list[ImportThread]) -> dict[str, int]:
    image_count = 0
    reply_count = 0
    for thread in threads:
        if not str(thread.post.get("source_post_id") or ""):
            raise ValueError("主帖缺少 source_post_id")
        image_count += len(resolve_entry_images(batch_dir, thread.post))
        for reply in thread.replies:
            if not str(reply.get("source_reply_id") or ""):
                raise ValueError("回复缺少 source_reply_id")
            image_count += len(resolve_entry_images(batch_dir, reply))
            reply_count += 1
    return {"posts": len(threads), "replies": reply_count, "images": image_count}


def copy_entry_images(
    batch_dir: Path,
    entry: dict[str, Any],
    upload_root: Path,
    public_folder: str,
) -> list[str]:
    source_id = str(entry.get("source_post_id") or entry.get("source_reply_id") or "unknown")
    destination_dir = upload_root / public_folder
    destination_dir.mkdir(parents=True, exist_ok=True)
    urls: list[str] = []
    for index, source in enumerate(resolve_entry_images(batch_dir, entry), start=1):
        extension = source.suffix.lower() if source.suffix.lower() in {".jpg", ".jpeg", ".png"} else ".jpg"
        filename = f"teams_{source_id}_{index:02d}{extension}"
        destination = destination_dir / filename
        if not destination.exists():
            shutil.copy2(source, destination)
        urls.append(f"/uploads/{public_folder}/{filename}")
    return urls


def import_threads(
    batch_dir: Path,
    channel_id: int,
    threads: list[ImportThread],
    author_user_id: int | None = None,
) -> dict[str, int]:
    from app.core.config import resolve_local_upload_dir, settings
    from app.database import SessionLocal
    from app.schemas import (
        CommunityChannel,
        CommunityChannelComment,
        CommunityChannelPost,
        User,
    )

    if settings.STORAGE_TYPE != "local":
        raise ValueError("当前导入命令仅支持 STORAGE_TYPE=local")

    upload_root = Path(resolve_local_upload_dir(settings.LOCAL_UPLOAD_DIR))
    now = datetime.now()
    public_folder = f"community/posts/{now:%Y/%m}"
    result = {"created_posts": 0, "created_replies": 0, "skipped_posts": 0}
    db = SessionLocal()
    try:
        channel = db.query(CommunityChannel).filter(
            CommunityChannel.id == channel_id,
            CommunityChannel.status == 1,
        ).first()
        if not channel:
            raise ValueError(f"社区频道不存在或已停用：{channel_id}")
        import_user_id = author_user_id or channel.admin_user_id
        user = db.query(User).filter(
            User.id == import_user_id,
            User.tenant_id == channel.tenant_id,
        ).first()
        if not user:
            raise ValueError(f"导入用户不属于目标租户：{import_user_id}")

        for thread in threads:
            post_id = str(thread.post["source_post_id"])
            marker_prefix = f"<!-- teams-source-post:{post_id};"
            existing_post = db.query(CommunityChannelPost).filter(
                CommunityChannelPost.tenant_id == channel.tenant_id,
                CommunityChannelPost.channel_id == channel.id,
                CommunityChannelPost.content.like(f"%{marker_prefix}%"),
            ).first()
            marker = parse_source_marker(existing_post.content) if existing_post else None
            imported_reply_ids = marker[1] if marker else set()
            new_replies = [
                reply
                for reply in thread.replies
                if str(reply["source_reply_id"]) not in imported_reply_ids
            ]
            all_reply_ids = sorted(
                imported_reply_ids | {str(reply["source_reply_id"]) for reply in new_replies}
            )

            try:
                post_images = copy_entry_images(
                    batch_dir, thread.post, upload_root, public_folder
                )
                if existing_post:
                    existing_post.title = str(thread.post.get("title") or "无标题")[:120]
                    existing_post.content = replace_source_marker(
                        build_post_html(thread.post, all_reply_ids), post_id, all_reply_ids
                    )
                    existing_post.images = json.dumps(post_images, ensure_ascii=False)
                    post = existing_post
                    result["skipped_posts"] += 1
                else:
                    post = CommunityChannelPost(
                        tenant_id=channel.tenant_id,
                        channel_id=channel.id,
                        author_user_id=import_user_id,
                        title=str(thread.post.get("title") or "无标题")[:120],
                        content=build_post_html(thread.post, all_reply_ids),
                        content_format="html",
                        images=json.dumps(post_images, ensure_ascii=False),
                        is_official=1,
                        is_pinned=0,
                        status=1,
                    )
                    db.add(post)
                    db.flush()
                    result["created_posts"] += 1

                for reply in new_replies:
                    reply_images = copy_entry_images(
                        batch_dir, reply, upload_root, public_folder
                    )
                    db.add(
                        CommunityChannelComment(
                            tenant_id=channel.tenant_id,
                            channel_id=channel.id,
                            post_id=post.id,
                            user_id=import_user_id,
                            content=build_comment_text(reply),
                            images=json.dumps(reply_images, ensure_ascii=False),
                            status=1,
                        )
                    )
                    result["created_replies"] += 1
                db.commit()
            except Exception:
                db.rollback()
                raise
        return result
    finally:
        db.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch_dir", type=Path, help="包含 teams-raw.json 的导出批次目录")
    parser.add_argument("--channel-id", type=int, required=True, help="目标社区频道 ID")
    parser.add_argument("--author-user-id", type=int, help="落库作者用户 ID，默认使用频道管理员")
    parser.add_argument("--limit", type=int, default=0, help="最多导入的主帖数，0 表示全部")
    parser.add_argument("--apply", action="store_true", help="实际写入；未提供时只做校验")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    batch_dir = args.batch_dir.resolve()
    threads = load_threads(batch_dir)
    if args.limit > 0:
        threads = threads[: args.limit]
    summary = validate_threads(batch_dir, threads)
    if not args.apply:
        print(json.dumps({"mode": "dry-run", **summary}, ensure_ascii=False))
        return 0
    result = import_threads(
        batch_dir,
        channel_id=args.channel_id,
        threads=threads,
        author_user_id=args.author_user_id,
    )
    print(json.dumps({"mode": "applied", **summary, **result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
