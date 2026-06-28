from __future__ import annotations

import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile


ROOT = Path(__file__).resolve().parents[2]
SOURCE_FONT = ROOT / "backend" / "uploads" / "fonts" / "LorchinSansP0.full.woff2"
TARGET_FONT = ROOT / "backend" / "uploads" / "fonts" / "LorchinSansP0.woff2"
MINIPROGRAM_DIR = ROOT / "miniprogram"
TEXT_EXTENSIONS = {".js", ".json", ".wxml", ".wxss"}


def collect_text_chars() -> str:
    """提取小程序源码中实际出现的可见字符。"""
    chars: set[str] = set()
    for file_path in MINIPROGRAM_DIR.rglob("*"):
        if not file_path.is_file() or file_path.suffix not in TEXT_EXTENSIONS:
            continue
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        for char in text:
            if char.isspace():
                continue
            chars.add(char)

    return "".join(sorted(chars))


def build_subset_font(text: str) -> None:
    """基于字符集生成 woff2 子集字体。"""
    if not SOURCE_FONT.exists():
        raise FileNotFoundError(f"源字体不存在: {SOURCE_FONT}")

    with NamedTemporaryFile("w", encoding="utf-8", delete=False) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(text)

    try:
        command = [
            "pyftsubset",
            str(SOURCE_FONT),
            f"--output-file={TARGET_FONT}",
            "--flavor=woff2",
            "--layout-features=*",
            "--no-hinting",
            "--ignore-missing-unicodes",
            "--notdef-outline",
            "--recalc-bounds",
            "--recalc-average-width",
            f"--text-file={temp_path}",
        ]
        subprocess.run(command, check=True)
    finally:
        temp_path.unlink(missing_ok=True)


def main() -> None:
    text = collect_text_chars()
    if not text:
        raise RuntimeError("未从小程序源码中提取到可用字符")

    build_subset_font(text)
    print(f"已生成子集字体: {TARGET_FONT}")
    print(f"字符数量: {len(text)}")


if __name__ == "__main__":
    main()
