from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import ssl


def ssl_context_for_https() -> ssl.SSLContext | None:
    try:
        import certifi  # type: ignore

        ctx = ssl.create_default_context(cafile=certifi.where())
        return ctx
    except Exception:
        return None


def human_bytes(num: int) -> str:
    step = 1024.0
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num)
    for u in units:
        if size < step or u == units[-1]:
            if u == "B":
                return f"{int(size)} {u}"
            return f"{size:.2f} {u}"
        size /= step
    return f"{size:.2f} TB"


def sha256_file(path: Path, progress_cb=None, stop_flag=None) -> str:
    h = hashlib.sha256()
    total = path.stat().st_size
    done = 0
    with path.open("rb") as f:
        while True:
            if stop_flag is not None and stop_flag.is_set():
                raise RuntimeError("Hashing cancelled")
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
            done += len(chunk)
            if progress_cb is not None and total > 0:
                progress_cb(done / total)
    return h.hexdigest()


def which_7z() -> str | None:
    """Locate a 7-Zip CLI. Names differ per OS (7z.exe on Windows, 7z/7zz elsewhere)."""
    for exe in ("7z.exe", "7za.exe", "7zr.exe", "7z", "7zz", "7za", "7zr"):
        p = shutil.which(exe)
        if p:
            return p
    return None


def is_windows() -> bool:
    return sys.platform.startswith("win")


def is_linux() -> bool:
    return sys.platform.startswith("linux")


def is_macos() -> bool:
    return sys.platform == "darwin"


def platform_label() -> str:
    """Human readable OS name for status bars, logs and error dialogs."""
    if is_windows():
        return "Windows"
    if is_macos():
        return "macOS"
    if is_linux():
        return "Linux"
    return sys.platform


def seven_zip_hint() -> str:
    """The 7-Zip executable name a user has to install on this OS."""
    return "7z.exe" if is_windows() else "7z"


def _linux_openers() -> list[list[str]]:
    candidates = ("xdg-open", "gio", "kde-open6", "kde-open5", "exo-open", "caja", "dolphin")
    out: list[list[str]] = []
    for name in candidates:
        found = shutil.which(name)
        if not found:
            continue
        out.append([found, "open", found] if name == "gio" else [found])
    return out


def open_path_default(path: str | Path) -> None:
    """Open a file/URL/folder with the desktop default handler on any OS."""
    p = str(path)
    if is_windows():
        os.startfile(p)  # type: ignore[attr-defined]
        return
    if is_macos():
        subprocess.Popen(["open", p], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return

    attempts = _linux_openers()
    if not attempts:
        raise RuntimeError(
            "No desktop opener found (install xdg-utils) - open the path manually: " + p
        )
    last_err: Exception | None = None
    for cmd in attempts:
        try:
            subprocess.Popen([*cmd, p], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except Exception as exc:  # try the next opener
            last_err = exc
    raise RuntimeError(f"Could not open {p}: {last_err}")


def open_url_default(url: str) -> None:
    open_path_default(url)


def join_url(base: str, href: str) -> str:
    import urllib.parse

    return urllib.parse.urljoin(base, href)


def parse_apache_listing_for_links(html: str) -> list[str]:
    return re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.IGNORECASE)


def extract_iso_urls_from_text(text: str) -> list[str]:
    # Best-effort: find direct ISO URLs in any HTML/text.
    # Important: pages (especially mirror lists) may contain many URLs with little/no whitespace.
    # We must ensure we don't greedily match across multiple "https://" occurrences.
    raw = re.findall(
        r"https?://(?:(?!https?://)[^\s\"\'<>])+?\.iso(?:\?(?:(?!https?://)[^\s\"\'<>])*)?",
        text,
        flags=re.IGNORECASE,
    )
    out: list[str] = []
    seen: set[str] = set()
    for u in raw:
        u2 = u.strip().rstrip(").,;")
        # Extra safety: discard any match that still contains multiple URL starts.
        if len(re.findall(r"https?://", u2, flags=re.IGNORECASE)) > 1:
            continue
        if u2 not in seen:
            seen.add(u2)
            out.append(u2)
    return out


def infer_version_from_iso_name(name_or_url: str) -> str | None:
    import urllib.parse

    s = (name_or_url or "").strip()
    if not s:
        return None
    base = s
    try:
        p = urllib.parse.urlparse(s)
        if p.scheme and p.netloc:
            base = os.path.basename(p.path) or s
    except Exception:
        pass

    # Prefer date-style versions used by some distros (e.g. Arch: 2026.02.01)
    m = re.search(r"\b(\d{4}\.\d{2}\.\d{2})\b", base)
    if m:
        return m.group(1)

    # Common semantic versions: 16.04, 24.04.1, 9.5, 2024.1
    # Avoid matching architectures like x86_64.
    m = re.search(r"(?<!x)\b(\d{1,4}\.\d{1,2}(?:\.\d{1,2})?)\b", base)
    if m:
        return m.group(1)

    # Fedora-like: 39, 40, etc. (very ambiguous; only return if strongly hinted)
    m = re.search(r"\b(\d{2,3})\b", base)
    if m:
        return m.group(1)
    return None


def is_plausible_iso_download_url(url: str) -> bool:
    import urllib.parse

    try:
        p = urllib.parse.urlparse(url)
    except Exception:
        return False

    if p.scheme not in ("http", "https"):
        return False
    if not p.netloc:
        return False

    host = p.netloc.lower()
    # Filter out documentation/reference pages that may include .iso in the URL but are not downloads.
    bad_hosts = (
        "wikipedia.org",
        "www.wikipedia.org",
        "iana.org",
        "www.iana.org",
    )
    if any(host == h or host.endswith("." + h) for h in bad_hosts):
        return False

    path = p.path or ""
    if not path.lower().endswith(".iso"):
        return False

    # Must be a file path, not just a domain like https://mirror.iso
    if "/" not in path:
        return False

    base = os.path.basename(path)
    # Exclude trivial/bogus filenames like '.iso'
    if len(base) < 6:
        return False
    if base.lower() in (".iso", "iso"):
        return False
    return True


def build_iso_focused_query(user_query: str) -> str:
    q = (user_query or "").strip()
    if not q:
        return q

    q_lc = q.lower()
    looks_archived = bool(re.search(r"\b(old|archive|archived|legacy|deprecated)\b", q_lc)) or bool(
        re.search(r"\b\d+\.\d+(?:\.\d+)?\b", q_lc)
    )

    # Keep this generic (no hardcoded site lists). DuckDuckGo often understands filetype filters.
    # We add light hints for archived/older content if the user query suggests it.
    parts = [q]
    if "iso" not in q_lc:
        parts.append("iso")
    parts.append("filetype:iso")
    if looks_archived:
        parts.append("(archive OR archived OR old OR legacy)")
    return " ".join(parts)


def parse_checksum_lines(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^([a-fA-F0-9]{64})\s+\*?(.+)$", line)
        if not m:
            continue
        out[m.group(2).strip()] = m.group(1).lower()
    return out
