#!/usr/bin/env python3
"""Restructure site into pages/ + assets/ with conservative URL rewriting."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit, urlunsplit
import re

ROOT = Path(__file__).resolve().parents[1]

HTML_EXTS = {".htm", ".html"}
TEXT_EXTS = {".htm", ".html", ".css", ".js"}
KEEP_EXACT = {"README.md", "zip.sh"}
KEEP_PREFIXES = ("util/",)

QUOTED_RE = re.compile(r"([\"'])([^\"'\n\r]+)(\1)")
UNQUOTED_ATTR_RE = re.compile(
    r"(?i)(\b(?:href|src|background|action|data|archive)\s*=\s*)([^\"'\s>]+)"
)
CSS_URL_UNQUOTED_RE = re.compile(r"(?i)(url\(\s*)([^\)\"'\s][^\)\"']*)(\s*\))")


def git_tracked_files() -> list[str]:
    out = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
    return [line.strip() for line in out.splitlines() if line.strip()]


def should_keep(path: str) -> bool:
    if path in KEEP_EXACT:
        return True
    return any(path.startswith(prefix) for prefix in KEEP_PREFIXES)


def new_location(path: str) -> str:
    ext = PurePosixPath(path).suffix.lower()
    if ext in HTML_EXTS:
        return f"pages/{path}"
    return f"assets/{path}"


def build_mapping(paths: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for p in paths:
        if should_keep(p):
            continue
        mapping[p] = new_location(p)
    return mapping


def build_dir_mapping(mapping: dict[str, str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for old, new in mapping.items():
        old_dir = PurePosixPath(old).parent.as_posix()
        new_dir = PurePosixPath(new).parent.as_posix()
        result[old_dir] = new_dir
    return result


def looks_like_path(value: str) -> bool:
    if not value:
        return False
    if any(ch.isspace() for ch in value):
        return False

    lower = value.lower()
    if lower.startswith(("javascript:", "mailto:", "data:")):
        return False

    return (
        "/" in value
        or value.endswith("/")
        or any(
            lower.endswith(ext)
            for ext in (
                ".htm",
                ".html",
                ".gif",
                ".jpg",
                ".jpeg",
                ".png",
                ".ico",
                ".css",
                ".js",
                ".swf",
                ".ttf",
                ".mid",
                ".mp3",
                ".ogg",
                ".wav",
                ".zip",
            )
        )
    )


def rewrite_url(
    raw_url: str,
    old_source: str,
    new_source: str,
    mapping: dict[str, str],
    dir_mapping: dict[str, str],
) -> str:
    if not looks_like_path(raw_url):
        return raw_url

    parts = urlsplit(raw_url)
    if parts.scheme or parts.netloc:
        return raw_url

    path = parts.path
    if not path:
        return raw_url

    old_source_abs = (ROOT / old_source).resolve()
    new_source_abs = (ROOT / new_source).resolve()

    if path.startswith("/"):
        target_abs = (ROOT / path.lstrip("/")).resolve()
    else:
        target_abs = (old_source_abs.parent / path).resolve()

    target_new_abs: Path | None = None

    try:
        rel_old = target_abs.relative_to(ROOT)
        rel_old_str = rel_old.as_posix()

        if rel_old_str in mapping:
            target_new_abs = (ROOT / mapping[rel_old_str]).resolve()
        else:
            rel_old_dir = rel_old_str.rstrip("/")
            if rel_old_dir in dir_mapping:
                target_new_abs = (ROOT / dir_mapping[rel_old_dir]).resolve()
            else:
                # Inside repo but not moved by mapping: leave untouched.
                return raw_url
    except ValueError:
        # Outside repo path: adjust to preserve same absolute target after moving source.
        target_new_abs = target_abs

    new_rel = os.path.relpath(target_new_abs, start=new_source_abs.parent).replace(os.sep, "/")
    if path.endswith("/") and not new_rel.endswith("/"):
        new_rel += "/"

    rebuilt = urlunsplit(("", "", new_rel, parts.query, parts.fragment))
    return rebuilt


def rewrite_file_text(
    text: str,
    old_source: str,
    new_source: str,
    mapping: dict[str, str],
    dir_mapping: dict[str, str],
) -> str:
    def quoted_sub(match: re.Match[str]) -> str:
        quote, value, _ = match.groups()
        new_value = rewrite_url(value, old_source, new_source, mapping, dir_mapping)
        return f"{quote}{new_value}{quote}"

    def unquoted_attr_sub(match: re.Match[str]) -> str:
        prefix, value = match.groups()
        new_value = rewrite_url(value, old_source, new_source, mapping, dir_mapping)
        return f"{prefix}{new_value}"

    def css_unquoted_sub(match: re.Match[str]) -> str:
        prefix, value, suffix = match.groups()
        new_value = rewrite_url(value, old_source, new_source, mapping, dir_mapping)
        return f"{prefix}{new_value}{suffix}"

    text = QUOTED_RE.sub(quoted_sub, text)
    text = UNQUOTED_ATTR_RE.sub(unquoted_attr_sub, text)
    text = CSS_URL_UNQUOTED_RE.sub(css_unquoted_sub, text)
    return text


def rewrite_text_files(paths: list[str], mapping: dict[str, str], dir_mapping: dict[str, str]) -> int:
    changed = 0
    for old in paths:
        new = mapping.get(old)
        if not new:
            continue

        if PurePosixPath(old).suffix.lower() not in TEXT_EXTS:
            continue

        file_path = ROOT / old
        original = file_path.read_text(encoding="latin-1")
        rewritten = rewrite_file_text(original, old, new, mapping, dir_mapping)

        if rewritten != original:
            file_path.write_text(rewritten, encoding="latin-1")
            changed += 1

    return changed


def move_files(mapping: dict[str, str]) -> None:
    for old in sorted(mapping.keys(), key=lambda p: (p.count("/"), p), reverse=True):
        src = ROOT / old
        dst = ROOT / mapping[old]

        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)


def remove_empty_dirs() -> None:
    candidates = [ROOT / "bogeygame", ROOT / "sheena", ROOT / "prescaled"]
    for path in candidates:
        if path.exists() and path.is_dir() and not any(path.iterdir()):
            path.rmdir()


def write_root_index() -> None:
    content = """<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\">
  <meta http-equiv=\"refresh\" content=\"0; url=pages/index.htm\">
  <title>Kid Radd</title>
</head>
<body>
  <p>Redirecting to <a href=\"pages/index.htm\">pages/index.htm</a></p>
</body>
</html>
"""
    (ROOT / "index.htm").write_text(content, encoding="utf-8")


def main() -> None:
    files = git_tracked_files()
    mapping = build_mapping(files)
    dir_mapping = build_dir_mapping(mapping)

    rewritten = rewrite_text_files(files, mapping, dir_mapping)
    move_files(mapping)
    remove_empty_dirs()
    write_root_index()

    print(f"tracked files: {len(files)}")
    print(f"moved files: {len(mapping)}")
    print(f"rewritten text files: {rewritten}")


if __name__ == "__main__":
    main()
