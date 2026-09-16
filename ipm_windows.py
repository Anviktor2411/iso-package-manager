"""Windows (Microsoft) media discovery for the ISO Package Manager.

Microsoft only still publishes Windows 10 / 11 media through browser-only
download pages (there is no stable, scriptable direct-ISO endpoint any more),
and Windows 8.1, 8, 7, Vista and XP are not published by Microsoft at all.

This module resolves *preserved* Microsoft media deterministically through the
Internet Archive's public catalogue:

  1. ``advancedsearch.php``  -> candidate items whose format is "ISO Image"
  2. ``/metadata/<id>``      -> the real .iso file names + byte sizes per item
  3. ``/download/<id>/<f>``  -> direct download URL (serves
     ``application/x-iso9660-image``; supports HEAD and Range requests, so the
     app's Validate and download paths work unchanged)

Supported releases: Windows 11, 10, 8.1, 8, 7, Vista and XP.

Notes
-----
* Internet Archive items are user-contributed. Obvious repacks / tampered
  builds are filtered out, and each name includes its byte size so a full
  retail image can be told apart from a trimmed one. Even so, compare the hash
  against Microsoft's official hash list before installing.
* A genuine Windows licence/key is still required to activate any of these.
"""

from __future__ import annotations

import json
import re
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from ipm_http import http_get_text
from ipm_models import RemoteIsoItem
from ipm_utils import human_bytes


# --------------------------------------------------------------------------
# Internet Archive endpoints
# --------------------------------------------------------------------------

_IA_SEARCH_URL = "https://archive.org/advancedsearch.php"
_IA_METADATA_URL = "https://archive.org/metadata/"
_IA_DOWNLOAD_URL = "https://archive.org/download/"

# A retail Windows image is never this small (XP x86 is ~590 MB, Win 11 ~5 GB).
_MIN_ISO_BYTES = 300 * 1024 * 1024

_ITEM_WORKERS = 8
_DEFAULT_ROWS = 6
_MAX_ROWS = 30


# --------------------------------------------------------------------------
# Supported releases
# --------------------------------------------------------------------------
# Order matters: the list is scanned top-down and matched text is consumed, so
# "Windows 8.1" wins over "Windows 8".
WINDOWS_TARGETS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Windows 11", ("windows 11", "win 11", "win11", "windows11", "win-11")),
    ("Windows 10", ("windows 10", "win 10", "win10", "windows10", "win-10")),
    ("Windows 8.1", ("windows 8.1", "win 8.1", "win8.1", "windows8.1", "win-8.1")),
    ("Windows 8", ("windows 8", "win 8", "win8", "windows8", "win-8")),
    ("Windows 7", ("windows 7", "win 7", "win7", "windows7", "win-7")),
    ("Windows Vista", ("windows vista", "win vista", "winvista", "vista")),
    ("Windows XP", ("windows xp", "win xp", "winxp", "windowsxp", "xp")),
)

# What a bare "windows" query expands to (the releases this app advertises).
DEFAULT_WINDOWS_VERSIONS: tuple[str, ...] = (
    "Windows 11",
    "Windows 10",
    "Windows 8.1",
    "Windows 8",
    "Windows 7",
    "Windows XP",
)

# Source names offered in the UI's "Windows" category.
WINDOWS_SOURCES: tuple[str, ...] = (
    "Windows 11",
    "Windows 10",
    "Windows 8.1",
    "Windows 8",
    "Windows 7",
    "Windows Vista",
    "Windows XP",
    "Windows (all versions)",
)

# Legacy UI names, kept so existing saved settings keep working.
WINDOWS_UI_ALIASES: dict[str, str] = {
    "Windows 11 (Microsoft)": "Windows 11",
    "Windows 10 (Microsoft)": "Windows 10",
}

# Search terms used against the Internet Archive per release. The first is the
# canonical Microsoft name; the extra one catches the common short form.
_IA_TERMS: dict[str, tuple[str, ...]] = {
    "Windows 11": ("windows 11", "win11"),
    "Windows 10": ("windows 10", "win10"),
    "Windows 8.1": ("windows 8.1", "win8.1"),
    "Windows 8": ("windows 8", "win8"),
    "Windows 7": ("windows 7", "win7"),
    "Windows Vista": ("windows vista", "winvista"),
    "Windows XP": ("windows xp", "winxp"),
}

# Short tag shown in the result list, e.g. "[Win 8.1] Win8.1_English_x64.iso".
_SHORT_TAG: dict[str, str] = {
    "Windows 11": "Win 11",
    "Windows 10": "Win 10",
    "Windows 8.1": "Win 8.1",
    "Windows 8": "Win 8",
    "Windows 7": "Win 7",
    "Windows Vista": "Win Vista",
    "Windows XP": "Win XP",
}

LICENSE_NOTE = (
    "Internet Archive hosts user-contributed Microsoft media. Names include the "
    "byte size so trimmed repacks are obvious, but verify the hash against "
    "Microsoft's official list. A valid Windows licence/key is still required."
)


# --------------------------------------------------------------------------
# Query / source-name handling
# --------------------------------------------------------------------------

def _norm_query(query: str) -> str:
    return " " + re.sub(r"[^a-z0-9.]+", " ", (query or "").lower()).strip() + " "


def _alias_pattern(alias: str) -> str:
    # "win8" must not match inside "win8.1", so an alias may not be followed by
    # a word character or by a dot-digit pair (which would make it 8.1/10/11).
    return (
        r"(?<![a-z0-9])"
        + re.escape(alias)
        + r"(?![a-z0-9])(?!\.\d)"
    )


_RELEASE_RE_CACHE: dict[str, re.Pattern] = {}


def _release_re(label: str) -> re.Pattern | None:
    """Compiled matcher for any alias of ``label`` (cached)."""
    hit = _RELEASE_RE_CACHE.get(label)
    if hit is not None:
        return hit
    aliases = dict(WINDOWS_TARGETS).get(label)
    if not aliases:
        return None
    pat = re.compile("|".join(_alias_pattern(a) for a in aliases))
    _RELEASE_RE_CACHE[label] = pat
    return pat


def _mentions_release(label: str, *texts: str) -> bool:
    """True when one of ``texts`` actually names the release ``label``.

    The catalogue's search is fuzzy: a title match for "windows 8" also returns
    Windows 8.1 items and unrelated titles, so each result list is kept on its
    own release.
    """
    pat = _release_re(label)
    if pat is None:
        return True
    for text in texts:
        if text and pat.search(_norm_query(text)):
            return True
    return False


def match_windows_versions(query: str) -> list[str]:
    """Return the Windows releases named in ``query`` (most specific first)."""
    q = _norm_query(query)
    found: list[str] = []
    for label, aliases in WINDOWS_TARGETS:
        for alias in aliases:
            m = re.search(_alias_pattern(alias), q)
            if not m:
                continue
            found.append(label)
            # Consume the match so "windows 8" cannot match inside an
            # already-matched "windows 8.1".
            q = q[: m.start()] + " " * (m.end() - m.start()) + q[m.end():]
            break
    return found


def looks_like_windows_query(query: str) -> bool:
    q = (query or "").lower()
    if re.search(r"(?<![a-z0-9])(windows|win)(?![a-z0-9])", q):
        return True
    return "microsoft windows" in q


def has_windows_support(query: str) -> bool:
    """True when a free-text query should pull in the Windows catalogues."""
    if match_windows_versions(query):
        return True
    return looks_like_windows_query(query)


def resolve_windows_targets(query: str) -> list[str]:
    """Map a UI source name or a free-text query to concrete release labels."""
    raw = (query or "").strip()
    aliased = WINDOWS_UI_ALIASES.get(raw, raw)

    if aliased == "Windows (all versions)":
        return list(DEFAULT_WINDOWS_VERSIONS)

    exact = [label for label, _ in WINDOWS_TARGETS if label == aliased]
    if exact:
        return exact

    named = match_windows_versions(aliased)
    if named:
        return named

    if looks_like_windows_query(aliased):
        return list(DEFAULT_WINDOWS_VERSIONS)

    return []


def is_windows_source(source: str) -> bool:
    return source in WINDOWS_SOURCES or source in WINDOWS_UI_ALIASES


def windows_source_names() -> tuple[str, ...]:
    return WINDOWS_SOURCES


# --------------------------------------------------------------------------
# Internet Archive lookups
# --------------------------------------------------------------------------

_JSON_CACHE: dict[str, tuple[float, object]] = {}
_JSON_CACHE_LOCK = threading.Lock()
_JSON_CACHE_TTL = 900.0


def _get_json(url: str, timeout: float = 30.0):
    now = time.time()
    with _JSON_CACHE_LOCK:
        hit = _JSON_CACHE.get(url)
        if hit is not None and now - hit[0] < _JSON_CACHE_TTL:
            return hit[1]
    text = http_get_text(url, timeout=timeout)
    data = json.loads(text)
    with _JSON_CACHE_LOCK:
        _JSON_CACHE[url] = (now, data)
    return data


def _ia_search(terms, rows: int) -> list[dict]:
    if isinstance(terms, str):
        terms = (terms,)
    clauses: list[str] = []
    for term in terms:
        clauses.append(f"title:({term})")
        clauses.append(f"identifier:({term})")
    params = [
        ("q", 'mediatype:software AND format:"ISO Image" AND ('
              + " OR ".join(clauses) + ")"),
        ("fl[]", "identifier"),
        ("fl[]", "title"),
        ("fl[]", "year"),
        ("fl[]", "downloads"),
        ("sort[]", "downloads desc"),
        ("rows", str(max(1, rows))),
        ("page", "1"),
        ("output", "json"),
    ]
    url = _IA_SEARCH_URL + "?" + urllib.parse.urlencode(params)
    try:
        data = _get_json(url, timeout=30.0)
    except Exception:
        return []
    docs = ((data or {}).get("response") or {}).get("docs") or []
    return [d for d in docs if isinstance(d, dict) and d.get("identifier")]


def _ia_item_isos(identifier: str) -> list[dict]:
    """Return the .iso files of an Internet Archive item."""
    url = _IA_METADATA_URL + urllib.parse.quote(str(identifier))
    try:
        data = _get_json(url, timeout=30.0)
    except Exception:
        return []

    out: list[dict] = []
    for f in (data or {}).get("files") or []:
        if not isinstance(f, dict):
            continue
        name = str(f.get("name") or "").strip()
        if not name.lower().endswith(".iso"):
            continue
        try:
            size = int(f.get("size") or 0)
        except Exception:
            size = 0
        if size and size < _MIN_ISO_BYTES:
            continue
        sha = str(f.get("sha256") or f.get("sha256sum") or "").strip().lower()
        if not re.fullmatch(r"[a-f0-9]{64}", sha):
            sha = None
        out.append({"name": name, "size": size, "sha256": sha})
    return out


# --------------------------------------------------------------------------
# Quality filtering / ranking
# --------------------------------------------------------------------------

# Clearly repacked or tampered builds - not genuine Microsoft media.
_JUNK_RE = re.compile(
    r"(?i)\b(lite|nano|micro|tiny|mini|ultra|super ?light|ghost|spectre|"
    r"remaster|remixed?|modified|modded|pre ?mod|crack(?:ed)?|activat\w*|"
    r"kms|pirat\w*|bypass|debloat|autounattend|unattended|winpe|"
    r"hacked|slim|compact)\b"
)

# Same idea for tokens repackers glue onto the item identifier
# ("windows11tinyedition") where \b never fires. Applied to the identifier and
# file name only - never to the descriptive title, which may legitimately
# mention such words.
_JUNK_STRONG_RE = re.compile(
    r"(?i)(lite|nano|tiny|ghost|spectre|crack|activat|kms|pirat|bloat|"
    r"mod(?:ded|ified)|hack|winpe|unattend)"
)

# Genuine, but not a plain retail image - kept, just ranked lower.
_ALT_RE = re.compile(
    r"(?i)\b(preview|beta|insider|release candidate|rc|build \d{4,5}|"
    r"recovery|oem|arm64|evaluation|eval)\b"
)

# Microsoft's own media naming (en_windows_7_..., X17-58997.iso, Win10_22H2_...).
_MS_MEDIA_RE = re.compile(
    r"(?i)^(en_|x1[0-9]-\d{4,}|x2[0-9]-\d{4,}|win(?:dows)?[ _-]?"
    r"(?:xp|vista|7|8|8\.1|10|11)|windows_)"
)


def _is_junk(identifier: str, title: str, filename: str) -> bool:
    hay = f"{identifier} {filename}"
    return bool(_JUNK_RE.search(hay) or _JUNK_STRONG_RE.search(hay))


def _score(filename: str, size: int, downloads: int, title: str) -> tuple:
    authentic = 1 if _MS_MEDIA_RE.match(filename) else 0
    alt = 1 if _ALT_RE.search(f"{filename} {title}") else 0
    # Sorted descending: authentic Microsoft media first, plain retail before
    # preview/recovery media, then larger (full) images, then popular items.
    return (authentic, -alt, size, downloads)


def _display_name(label: str, filename: str, size: int) -> str:
    tag = _SHORT_TAG.get(label, label)
    size_txt = f" [{human_bytes(size)}]" if size else ""
    return f"[{tag}] {filename}{size_txt}"


def _download_url(identifier: str, filename: str) -> str:
    return (
        _IA_DOWNLOAD_URL
        + urllib.parse.quote(str(identifier))
        + "/"
        + urllib.parse.quote(filename)
    )


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

def _rows_for_level(archive_level: int) -> int:
    try:
        level = max(0, int(archive_level))
    except Exception:
        level = 0
    return min(_MAX_ROWS, _DEFAULT_ROWS + level * _DEFAULT_ROWS)


def windows_iso_search(
    query: str,
    archive_level: int = 0,
    *,
    max_items: int = -1,
) -> list[RemoteIsoItem]:
    """Find preserved Windows ISOs for the releases named in ``query``.

    ``query`` may be a UI source name ("Windows 7"), a free-text query
    ("windows xp iso") or "Windows (all versions)". ``archive_level`` (the UI's
    "Load more" depth) widens how many catalogue items per release are read.
    """
    targets = resolve_windows_targets(query)
    if not targets:
        return []

    rows = _rows_for_level(archive_level)
    out: list[RemoteIsoItem] = []
    seen_files: dict[str, tuple] = {}
    limit = max_items if max_items and max_items > 0 else -1

    for label in targets:
        terms = _IA_TERMS.get(label) or (label.lower(),)
        docs = _ia_search(terms, rows)
        if not docs:
            continue
        docs = docs[:rows]

        def fetch(doc: dict) -> tuple[dict, list[dict]]:
            return doc, _ia_item_isos(doc.get("identifier"))

        try:
            with ThreadPoolExecutor(max_workers=_ITEM_WORKERS) as pool:
                results = list(pool.map(fetch, docs))
        except Exception:
            results = []

        candidates: list[tuple[tuple, str, int, str]] = []
        for doc, files in results:
            ident = str(doc.get("identifier") or "")
            title = str(doc.get("title") or "")
            try:
                downloads = int(doc.get("downloads") or 0)
            except Exception:
                downloads = 0
            for f in files:
                name = str(f.get("name") or "")
                size = int(f.get("size") or 0)
                if _is_junk(ident, title, name):
                    continue
                if not _mentions_release(label, name, title):
                    continue
                candidates.append((_score(name, size, downloads, title), name, size, ident))

        candidates.sort(key=lambda c: c[0], reverse=True)

        for _sc, name, size, ident in candidates:
            key = name.strip().lower()
            prev = seen_files.get(key)
            if prev is not None:
                # Same file name hosted by several items: keep the better one.
                if prev[0] < _sc:
                    seen_files[key] = (_sc, ident, size)
                continue
            seen_files[key] = (_sc, ident, size)
            out.append(
                RemoteIsoItem(
                    name=_display_name(label, name, size),
                    url=_download_url(ident, name),
                    sha256=None,
                )
            )
            if limit > 0 and len(out) >= limit:
                return out

    return out


def windows_iso_search_limited(query: str, limit: int = -1) -> list[RemoteIsoItem]:
    return windows_iso_search(query, 0, max_items=limit)
