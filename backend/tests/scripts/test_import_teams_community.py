import json
from pathlib import Path

import pytest

from scripts.import_teams_community import (
    build_comment_text,
    build_post_html,
    build_source_marker,
    load_threads,
    parse_source_marker,
    resolve_entry_images,
)


def test_source_marker_round_trip_and_html_escape():
    post = {
        "source_post_id": "1001",
        "author": "Inc. <ICOACH>",
        "published_at": "2026-07-14",
        "text": "第一段\n第二段<script>",
    }

    content = build_post_html(post, ["2002", "2001"])

    assert "<p>第一段</p>" in content
    assert "第二段&lt;script&gt;" in content
    assert parse_source_marker(content) == ("1001", {"2001", "2002"})
    assert build_source_marker("1001", ["2002", "2001"]).endswith(
        "replies:2001,2002 -->"
    )


def test_reply_keeps_only_original_text_and_allows_image_only_content():
    reply = {
        "author": "Inc. ICOACH",
        "published_at": "星期三",
        "text": "",
    }
    assert build_comment_text(reply) == ""
    assert build_comment_text({**reply, "text": " 原回复 "}) == "原回复"
    assert len(build_comment_text({"author": "A", "text": "x" * 1200})) == 1000


def test_load_threads_keeps_replies_under_parent(tmp_path: Path):
    payload = {
        "posts": [{"source_post_id": "1001"}, {"source_post_id": "1002"}],
        "replies": [
            {"source_reply_id": "2001", "source_parent_post_id": "1002"},
            {
                "source_reply_id": "2002",
                "source_parent_post_id": "1003",
                "parent_title": "其他作者主题",
                "parent_author": "其他作者",
            },
        ],
    }
    (tmp_path / "teams-raw.json").write_text(
        json.dumps(payload), encoding="utf-8"
    )

    threads = load_threads(tmp_path)

    assert len(threads) == 3
    assert threads[0].replies == []
    assert threads[1].replies[0]["source_reply_id"] == "2001"
    assert threads[2].post["source_post_id"] == "1003"
    assert threads[2].post["title"] == "其他作者主题"
    assert threads[2].replies[0]["source_reply_id"] == "2002"


def test_resolve_entry_images_rejects_path_escape(tmp_path: Path):
    outside = tmp_path.parent / "outside.jpg"
    outside.write_bytes(b"image")

    with pytest.raises(ValueError, match="图片路径越界"):
        resolve_entry_images(tmp_path, {"local_images": ["../outside.jpg"]})


def test_resolve_entry_images_accepts_mime_adjusted_extension(tmp_path: Path):
    actual_image = tmp_path / "posts" / "1001" / "images" / "01.png"
    actual_image.parent.mkdir(parents=True)
    actual_image.write_bytes(b"image")

    resolved = resolve_entry_images(
        tmp_path,
        {"local_images": ["posts/1001/images/01.jpg"]},
    )

    assert resolved == [actual_image]
