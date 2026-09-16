from __future__ import annotations

import json
import os
import re
import urllib.parse
from typing import TypeVar

from ipm_http import http_get_text
from ipm_ia import has_ia_support, ia_iso_search, is_ia_source
from ipm_models import RemoteIsoItem
from ipm_utils import (
    build_iso_focused_query,
    extract_iso_urls_from_text,
    infer_version_from_iso_name,
    is_plausible_iso_download_url,
    join_url,
    parse_apache_listing_for_links,
    parse_checksum_lines,
)
from ipm_windows import has_windows_support, windows_iso_search


def _env_int(name: str, default: int) -> int:
    try:
        v = int((os.environ.get(name) or "").strip())
        # 0 or -1 means "unlimited".
        if v in (0, -1):
            return -1
        return v if v > 0 else default
    except Exception:
        return default


T = TypeVar("T")


def _cap_list(items: list[T], limit: int) -> list[T]:
    if limit is None or limit < 0:
        return items
    return items[:limit]


def _try_custom_mirrors(query: str, limits: dict[str, int]) -> list[RemoteIsoItem]:
    raw = (os.environ.get("IPM_CUSTOM_MIRRORS") or "").strip()
    if not raw:
        return []

    tokens = [t for t in re.split(r"[\s,;]+", raw) if t]
    if not tokens:
        return []

    q = (query or "").strip().lower()
    words = [w for w in re.split(r"\s+", q) if w and len(w) >= 3]

    out: list[RemoteIsoItem] = []
    seen: set[str] = set()
    for base in tokens:
        b = base.strip().rstrip("/") + "/"
        if not (b.startswith("http://") or b.startswith("https://")):
            continue
        try:
            page = http_get_text(b, timeout=15.0)
        except Exception:
            continue
        links = parse_apache_listing_for_links(page)
        iso_names = sorted({l for l in links if l and l.lower().endswith(".iso") and "../" not in l and "/" not in l.strip("/")})
        if not iso_names:
            iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
        for name in iso_names:
            low = name.lower()
            if words and not any(w in low for w in words):
                continue
            url = join_url(b, name)
            if not is_plausible_iso_download_url(url):
                continue
            if url in seen:
                continue
            seen.add(url)
            out.append(RemoteIsoItem(name=f"[Custom] {name}", url=url, sha256=None))
            if _hit_limit(len(out), limits.get("max_archive_items", 200)):
                return out
    return out



def _try_fedora_latest(query: str) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if "fedora" not in q:
        return []

    # If the user requested a specific Fedora release number, let _try_fedora_archives handle it.
    if re.search(r"\b\d{2,3}\b", q):
        return []

    base_root = "https://dl.fedoraproject.org/pub/fedora/linux/releases/"
    try:
        idx = http_get_text(base_root)
    except Exception:
        return []

    links = parse_apache_listing_for_links(idx)
    vers: list[int] = []
    for href in links:
        m = re.fullmatch(r"(\d{2,3})/", (href or "").strip())
        if not m:
            continue
        try:
            vers.append(int(m.group(1)))
        except Exception:
            continue
    if not vers:
        return []

    ver = str(sorted(vers, reverse=True)[0])
    base = f"{base_root}{ver}/Workstation/x86_64/iso/"
    try:
        page = http_get_text(base)
    except Exception:
        return []

    links2 = parse_apache_listing_for_links(page)
    iso_names = sorted({l for l in links2 if l and l.lower().endswith(".iso") and "../" not in l and "/" not in l.strip("/")})
    if not iso_names:
        iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
    if not iso_names:
        return []

    items: list[RemoteIsoItem] = []
    for name in iso_names:
        items.append(RemoteIsoItem(name=f"[{ver}] {name}", url=join_url(base, name), sha256=None))
    return items

def _hit_limit(count: int, limit: int) -> bool:
    return limit >= 0 and count >= limit


def _limit_for_level(base: int, level: int, cap: int) -> int:
    lvl = max(0, int(level))
    if cap < 0:
        return -1
    wanted = base * (lvl + 1)
    if cap > 0:
        return min(wanted, cap)
    return wanted


def _get_limits(archive_level: int) -> dict[str, int]:
    cap_items = _env_int("IPM_MAX_ARCHIVE_ITEMS", 2000)
    cap_kali = _env_int("IPM_MAX_KALI_VERSIONS", 60)
    cap_mint = _env_int("IPM_MAX_MINT_VERSIONS", 40)
    cap_arch = _env_int("IPM_MAX_ARCH_DATED_DIRS", 365)

    return {
        "_level": max(0, int(archive_level)),
        "max_archive_items": _limit_for_level(400, archive_level, cap_items),
        "max_archive_versions": _limit_for_level(5, archive_level, _env_int("IPM_MAX_ARCHIVE_VERSIONS", 200)),
        "max_kali_versions": _limit_for_level(10, archive_level, cap_kali),
        "max_mint_versions": _limit_for_level(8, archive_level, cap_mint),
        "max_arch_dated_dirs": _limit_for_level(10, archive_level, cap_arch),
    }


def _try_ubuntu_old_releases(query: str) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if "ubuntu" not in q:
        return []

    m = re.search(r"\b(\d+\.\d+(?:\.\d+)?)\b", q)
    if not m:
        return []
    ver = m.group(1)

    # old-releases uses folders like 14.04.6/ rather than 14.04/
    base_root = "https://old-releases.ubuntu.com/releases/"
    base = f"{base_root}{ver}/"

    page = None
    try:
        page = http_get_text(base)
    except Exception:
        try:
            idx = http_get_text(base_root)
        except Exception:
            return []

        links = parse_apache_listing_for_links(idx)
        vers: list[str] = []
        for href in links:
            if not href:
                continue
            mm = re.match(r"^(\d+\.\d+(?:\.\d+)?)/$", href.strip())
            if not mm:
                continue
            v = mm.group(1)
            if v == ver or v.startswith(ver + "."):
                vers.append(v)

        if not vers:
            return []

        def key(v: str) -> list[int]:
            try:
                return [int(p) for p in v.split(".")]
            except Exception:
                return [0]

        best = sorted(vers, key=key, reverse=True)[0]
        base = f"{base_root}{best}/"
        try:
            page = http_get_text(base)
        except Exception:
            return []
        ver = best

    links = parse_apache_listing_for_links(page)
    iso_names = sorted({l for l in links if l and l.lower().endswith(".iso") and "../" not in l and "/" not in l.strip("/")})
    if not iso_names:
        iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
    if not iso_names:
        return []

    items: list[RemoteIsoItem] = []
    for name in iso_names:
        url = join_url(base, name)
        items.append(RemoteIsoItem(name=f"[{ver}] {name}", url=url, sha256=None))
    return items


def _try_opensuse_latest(query: str) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if "opensuse" not in q and "open suse" not in q and "suse" not in q:
        return []

    out: list[RemoteIsoItem] = []
    seen: set[str] = set()

    # Tumbleweed (single rolling target)
    tumbleweed_bases = [
        "https://download.opensuse.org/tumbleweed/iso/",
        "https://mirrors.kernel.org/opensuse/tumbleweed/iso/",
    ]
    for base in tumbleweed_bases:
        try:
            page = http_get_text(base)
        except Exception:
            continue
        links = parse_apache_listing_for_links(page)
        iso_names = sorted({l for l in links if l and l.lower().endswith(".iso") and "../" not in l and "/" not in l.strip("/")})
        if not iso_names:
            iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
        for name in iso_names:
            url = join_url(base, name)
            if url in seen:
                continue
            seen.add(url)
            out.append(RemoteIsoItem(name=f"[Tumbleweed] {name}", url=url, sha256=None))
        if out:
            break

    # Leap (discover latest version directory)
    leap_index_bases = [
        "https://download.opensuse.org/distribution/leap/",
        "https://mirrors.kernel.org/opensuse/distribution/leap/",
    ]
    leap_ver = ""
    for base in leap_index_bases:
        try:
            idx = http_get_text(base)
        except Exception:
            continue
        links = parse_apache_listing_for_links(idx)
        vers: list[tuple[int, int, str]] = []
        for l in links:
            if not l or "../" in l:
                continue
            m = re.fullmatch(r"(\d+)\.(\d+)/", l.strip())
            if not m:
                continue
            try:
                vers.append((int(m.group(1)), int(m.group(2)), f"{m.group(1)}.{m.group(2)}"))
            except Exception:
                continue
        if vers:
            vers.sort(reverse=True)
            leap_ver = vers[0][2]
            break

    if leap_ver:
        leap_iso_bases = [
            f"https://download.opensuse.org/distribution/leap/{leap_ver}/iso/",
            f"https://mirrors.kernel.org/opensuse/distribution/leap/{leap_ver}/iso/",
        ]
        for base in leap_iso_bases:
            try:
                page = http_get_text(base)
            except Exception:
                continue
            links = parse_apache_listing_for_links(page)
            iso_names = sorted({l for l in links if l and l.lower().endswith(".iso") and "../" not in l and "/" not in l.strip("/")})
            if not iso_names:
                iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
            for name in iso_names:
                url = join_url(base, name)
                if url in seen:
                    continue
                seen.add(url)
                out.append(RemoteIsoItem(name=f"[Leap {leap_ver}] {name}", url=url, sha256=None))
            if iso_names:
                break

    return out


def _try_artix_archive(query: str, limits: dict[str, int]) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if "artix" not in q:
        return []

    items: list[RemoteIsoItem] = []
    seen: set[str] = set()

    bases = [
        "https://iso.artixlinux.org/iso/",
        "https://mirror1.artixlinux.org/iso/",
    ]

    for base in bases:
        try:
            root = http_get_text(base)
        except Exception:
            continue

        try:
            links = parse_apache_listing_for_links(root)
        except Exception:
            links = []

        # Prefer deeper version directories if present; otherwise just scan base.
        dirs: list[str] = []
        for href in links:
            if not href or href.startswith("?") or href.startswith("../"):
                continue
            if href.endswith("/") and re.fullmatch(r"\d{4}\.\d{2}\.\d{2}/", href):
                dirs.append(href.strip("/"))

        scan_bases = [base]
        if dirs:
            dirs.sort(reverse=True)
            scan_bases = [f"{base}{d}/" for d in _cap_list(dirs, limits.get("max_arch_dated_dirs", 20))]

        for b in scan_bases:
            try:
                page = http_get_text(b)
                page_links = parse_apache_listing_for_links(page)
            except Exception:
                continue

            for href in page_links:
                if not href or not href.lower().endswith(".iso"):
                    continue
                url = join_url(b, href)
                if url in seen:
                    continue
                if not is_plausible_iso_download_url(url):
                    continue
                seen.add(url)
                name = href
                ver = ""
                m = re.search(r"(\d{4}\.\d{2}\.\d{2})", url)
                if m:
                    ver = m.group(1)
                if ver:
                    name = f"[{ver}] {name}"
                items.append(RemoteIsoItem(name=name, url=url, sha256=None))

                if limits.get("max_archive_items", -1) > 0 and len(items) >= int(limits.get("max_archive_items", 0)):
                    return items

        if items:
            return items

    return items


def _try_kali_archive(query: str, limits: dict[str, int]) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if not re.search(r"\bkali\b", q):
        return []

    m = re.search(r"\b(\d{4}\.\d+)\b", q)
    ver = m.group(1) if m else ""

    if not ver:
        # Best-effort: pick a few latest kali-YYYY.N folders from the main listing.
        vers: list[str] = []
        try:
            idx = http_get_text("https://cdimage.kali.org/")
            links = parse_apache_listing_for_links(idx)
            for href in links:
                mm = re.match(r"^kali-(\d{4}\.\d+)/$", (href or "").strip())
                if mm:
                    vers.append(mm.group(1))
            if vers:
                vers.sort(key=lambda s: [int(p) for p in s.split(".")], reverse=True)
                vers = _cap_list(vers, limits.get("max_kali_versions", 6))
        except Exception:
            vers = []

        if not vers:
            return []

        out: list[RemoteIsoItem] = []
        seen: set[str] = set()
        # Query a few recent versions and merge results.
        for v in vers:
            bases = [
                f"https://cdimage.kali.org/kali-{v}/",
                f"https://old.kali.org/kali-images/kali-{v}/",
            ]
            for base in bases:
                try:
                    page = http_get_text(base)
                except Exception:
                    continue

                links2 = parse_apache_listing_for_links(page)
                iso_names = sorted(
                    {
                        l
                        for l in links2
                        if l
                        and l.lower().endswith(".iso")
                        and "../" not in l
                        and "/" not in l.strip("/")
                    }
                )
                if not iso_names:
                    iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
                if not iso_names:
                    continue

                for name in iso_names:
                    url = join_url(base, name)
                    if url in seen:
                        continue
                    seen.add(url)
                    out.append(RemoteIsoItem(name=f"[{v}] {name}", url=url, sha256=None))

            # Keep this bounded so a generic "kali" search doesn't become too slow.
            if _hit_limit(len(out), limits.get("max_archive_items", 200)):
                break

        return out

    if not ver:
        return []

    bases = [
        f"https://cdimage.kali.org/kali-{ver}/",
        f"https://old.kali.org/kali-images/kali-{ver}/",
    ]

    for base in bases:
        try:
            page = http_get_text(base)
        except Exception:
            continue

        links = parse_apache_listing_for_links(page)
        iso_names = sorted({l for l in links if l and l.lower().endswith(".iso") and "../" not in l and "/" not in l.strip("/")})
        if not iso_names:
            iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
        if not iso_names:
            continue

        items: list[RemoteIsoItem] = []
        for name in iso_names:
            items.append(RemoteIsoItem(name=f"[{ver}] {name}", url=join_url(base, name), sha256=None))
        return items

    return []


def _try_linux_mint_archive(query: str, limits: dict[str, int]) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if not (re.search(r"\bmint\b", q) or "linux mint" in q):
        return []

    m = re.search(r"\b(\d+\.\d+(?:\.\d+)?)\b", q)
    ver = m.group(1) if m else ""

    if not ver:
        vers: list[str] = []
        try:
            idx = http_get_text("https://mirrors.edge.kernel.org/linuxmint/stable/")
            links = parse_apache_listing_for_links(idx)
            for href in links:
                mm = re.match(r"^(\d+\.\d+(?:\.\d+)?)/$", (href or "").strip())
                if mm:
                    vers.append(mm.group(1))

            def key(v: str) -> list[int]:
                try:
                    return [int(p) for p in v.split(".")]
                except Exception:
                    return [0]

            if vers:
                vers.sort(key=key, reverse=True)
                vers = _cap_list(vers, limits.get("max_mint_versions", 5))
        except Exception:
            vers = []

        if not vers:
            return []

        out: list[RemoteIsoItem] = []
        seen: set[str] = set()
        for v in vers:
            majmin = ".".join(v.split(".")[:2])
            roots = [
                f"https://mirrors.edge.kernel.org/linuxmint/stable/{majmin}/",
                f"https://mirrors.edge.kernel.org/linuxmint/stable/{v}/",
                f"https://mirrors.edge.kernel.org/linuxmint/stable/old/{majmin}/",
                f"https://mirrors.edge.kernel.org/linuxmint/stable/old/{v}/",
            ]

            bases: list[str] = []
            for r in roots:
                bases.append(r)
                bases.append(join_url(r, "iso/"))

            for base in bases:
                try:
                    page = http_get_text(base)
                except Exception:
                    continue
                links2 = parse_apache_listing_for_links(page)
                iso_names = sorted(
                    {
                        l
                        for l in links2
                        if l
                        and l.lower().endswith(".iso")
                        and "../" not in l
                        and "/" not in l.strip("/")
                    }
                )
                if not iso_names:
                    iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
                if not iso_names:
                    continue

                for name in iso_names:
                    url = join_url(base, name)
                    if url in seen:
                        continue
                    seen.add(url)
                    out.append(RemoteIsoItem(name=f"[{v}] {name}", url=url, sha256=None))

            if _hit_limit(len(out), limits.get("max_archive_items", 200)):
                break

        return out

    majmin = ".".join(ver.split(".")[:2])

    roots = [
        f"https://mirrors.edge.kernel.org/linuxmint/stable/{majmin}/",
        f"https://mirrors.edge.kernel.org/linuxmint/stable/{ver}/",
        f"https://mirrors.edge.kernel.org/linuxmint/stable/old/{majmin}/",
        f"https://mirrors.edge.kernel.org/linuxmint/stable/old/{ver}/",
    ]

    bases: list[str] = []
    for r in roots:
        bases.append(r)
        bases.append(join_url(r, "iso/"))

    for base in bases:
        try:
            page = http_get_text(base)
        except Exception:
            continue
        links = parse_apache_listing_for_links(page)
        iso_names = sorted({l for l in links if l and l.lower().endswith(".iso") and "../" not in l and "/" not in l.strip("/")})
        if not iso_names:
            iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
        if not iso_names:
            continue

        items: list[RemoteIsoItem] = []
        for name in iso_names:
            items.append(RemoteIsoItem(name=f"[{ver}] {name}", url=join_url(base, name), sha256=None))
        return items

    return []


def _try_opensuse_leap_archive(query: str) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if "opensuse" not in q and "open suse" not in q and "suse" not in q:
        return []
    if "leap" not in q:
        return []

    m = re.search(r"\b(\d+\.\d+)\b", q)
    if not m:
        return []
    ver = m.group(1)

    # Some openSUSE endpoints render pretty HTML without listing actual files.
    # Try a few mirrors that commonly expose Apache directory listings.
    bases = [
        f"https://download.opensuse.org/distribution/leap/{ver}/iso/",
        f"https://mirrors.kernel.org/opensuse/distribution/leap/{ver}/iso/",
        f"https://ftp.gwdg.de/pub/opensuse/distribution/leap/{ver}/iso/",
    ]

    for base in bases:
        try:
            page = http_get_text(base)
        except Exception:
            continue

        links = parse_apache_listing_for_links(page)
        iso_names = sorted({l for l in links if l and l.lower().endswith(".iso") and "../" not in l and "/" not in l.strip("/")})
        if not iso_names:
            iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
        if not iso_names:
            continue

        items: list[RemoteIsoItem] = []
        for name in iso_names:
            items.append(RemoteIsoItem(name=f"[{ver}] {name}", url=join_url(base, name), sha256=None))
        return items

    return []


def _try_alpine_archive(query: str) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if not re.search(r"\balpine\b", q):
        return []

    m = re.search(r"\b(\d+\.\d+)(?:\.\d+)?\b", q)
    majmin = m.group(1) if m else ""

    if not majmin:
        # Best-effort: use latest-stable alias.
        bases = [
            "https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/x86_64/",
            "https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/x86/",
        ]
        ver = "latest-stable"
    else:
        ver = majmin
        bases = [
            f"https://dl-cdn.alpinelinux.org/alpine/v{majmin}/releases/x86_64/",
            f"https://dl-cdn.alpinelinux.org/alpine/v{majmin}/releases/x86/",
        ]

    for base in bases:
        try:
            page = http_get_text(base)
        except Exception:
            continue
        links = parse_apache_listing_for_links(page)
        iso_names = sorted({l for l in links if l and l.lower().endswith(".iso") and "../" not in l and "/" not in l.strip("/")})
        if not iso_names:
            iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
        if not iso_names:
            continue

        items: list[RemoteIsoItem] = []
        for name in iso_names:
            items.append(RemoteIsoItem(name=f"[{ver}] {name}", url=join_url(base, name), sha256=None))
        return items

    return []


def _try_archlinux_archive(query: str, limits: dict[str, int]) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if not (re.search(r"\barch\b", q) or "archlinux" in q):
        return []

    # Arch archive uses yyyy.mm.dd directories.
    m = re.search(r"\b(\d{4}\.\d{2}\.\d{2})\b", q)
    ver = m.group(1) if m else ""

    if ver:
        bases = [f"https://archive.archlinux.org/iso/{ver}/"]
        shown_versions = [ver]
    else:
        bases = [
            "https://geo.mirror.pkgbuild.com/iso/latest/",
            "https://archive.archlinux.org/iso/latest/",
        ]
        shown_versions = ["latest"]

        try:
            root = http_get_text("https://archive.archlinux.org/iso/")
            links0 = parse_apache_listing_for_links(root)
            dirs: list[str] = []
            for href in links0:
                mm0 = re.match(r"^(\d{4}\.\d{2}\.\d{2})/$", (href or "").strip())
                if mm0:
                    dirs.append(mm0.group(1))
            if dirs:
                dirs.sort(key=lambda s: [int(p) for p in s.split(".")], reverse=True)
                for d in _cap_list(dirs, limits.get("max_arch_dated_dirs", 3)):
                    bases.append(f"https://archive.archlinux.org/iso/{d}/")
                    shown_versions.append(d)
        except Exception:
            pass

    out: list[RemoteIsoItem] = []
    seen: set[str] = set()
    for base in bases:
        try:
            page = http_get_text(base)
        except Exception:
            continue

        links = parse_apache_listing_for_links(page)
        iso_names = sorted({l for l in links if l and l.lower().endswith(".iso") and "../" not in l and "/" not in l.strip("/")})
        if not iso_names:
            iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
        if not iso_names:
            continue

        shown_ver = "latest"
        mmv = re.search(r"/iso/(\d{4}\.\d{2}\.\d{2}|latest)/", base)
        if mmv:
            shown_ver = mmv.group(1)

        for name in iso_names:
            url = join_url(base, name)
            if url in seen:
                continue
            seen.add(url)
            out.append(RemoteIsoItem(name=f"[{shown_ver}] {name}", url=url, sha256=None))
        if _hit_limit(len(out), limits.get("max_archive_items", 200)):
            break

    return out


def _try_fedora_archives(query: str) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if "fedora" not in q:
        return []

    m = re.search(r"\b(\d{2,3})\b", q)
    if not m:
        return []
    ver = m.group(1)

    bases = [
        f"https://dl.fedoraproject.org/pub/fedora/linux/releases/{ver}/Workstation/x86_64/iso/",
        f"https://archives.fedoraproject.org/pub/archive/fedora/linux/releases/{ver}/Workstation/x86_64/iso/",
    ]

    last_page = None
    for base in bases:
        try:
            last_page = http_get_text(base)
        except Exception:
            continue

        links = parse_apache_listing_for_links(last_page)
        iso_names = sorted(
            {
                l
                for l in links
                if l
                and l.lower().endswith(".iso")
                and not l.startswith("?")
                and "../" not in l
                and "/" not in l.strip("/")
            }
        )
        if not iso_names:
            iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", last_page)))
        if not iso_names:
            continue

        items: list[RemoteIsoItem] = []
        for name in iso_names:
            items.append(RemoteIsoItem(name=f"[{ver}] {name}", url=join_url(base, name), sha256=None))
        return items

    return []


def _try_debian_archive(query: str) -> list[RemoteIsoItem]:
    q = (query or "").strip().lower()
    if "debian" not in q:
        return []

    # Debian archive layout varies; we do a best-effort scan from cdimage archive.
    m = re.search(r"\b(\d{1,2})(?:\.\d+){0,2}\b", q)
    if not m:
        return []
    major = m.group(1)

    base_root = "https://cdimage.debian.org/cdimage/archive/"
    try:
        idx = http_get_text(base_root)
    except Exception:
        return []

    links = parse_apache_listing_for_links(idx)
    vers: list[str] = []
    for href in links:
        mm = re.match(r"^(\d+\.\d+(?:\.\d+)?)/$", (href or "").strip())
        if not mm:
            continue
        v = mm.group(1)
        if v.startswith(major + "."):
            vers.append(v)
    if not vers:
        return []

    def key(v: str) -> list[int]:
        try:
            return [int(p) for p in v.split(".")]
        except Exception:
            return [0]

    best = sorted(vers, key=key, reverse=True)[0]
    bases = [
        f"{base_root}{best}/amd64/iso-cd/",
        f"{base_root}{best}/amd64/iso-dvd/",
    ]
    for base in bases:
        try:
            page = http_get_text(base)
        except Exception:
            continue
        links2 = parse_apache_listing_for_links(page)
        iso_names = sorted({l for l in links2 if l.lower().endswith(".iso")})
        if not iso_names:
            iso_names = sorted(set(re.findall(r"([A-Za-z0-9._-]+\.iso)", page)))
        if not iso_names:
            continue
        items: list[RemoteIsoItem] = []
        for name in iso_names:
            items.append(RemoteIsoItem(name=f"[{best}] {name}", url=join_url(base, name), sha256=None))
        return items

    return []



# ---------------------------------------------------------------------------
# Generic multi-version archive engine
# ---------------------------------------------------------------------------
# Each spec describes where a distro keeps its version folders and where the ISOs
# are inside one version folder. Versions are listed newest-first; archive_level
# ("Load more") decides how many versions deep we go.

import threading as _threading
import time as _time
from concurrent.futures import ThreadPoolExecutor as _Pool
from dataclasses import dataclass as _dataclass, field as _field

_CACHE: dict[str, tuple[float, str]] = {}
_CACHE_LOCK = _threading.Lock()
_CACHE_TTL = 600.0


def _cached_get(url: str, timeout: float = 15.0) -> str:
    now = _time.time()
    with _CACHE_LOCK:
        hit = _CACHE.get(url)
        if hit and now - hit[0] < _CACHE_TTL:
            return hit[1]
    txt = http_get_text(url, timeout=timeout)
    with _CACHE_LOCK:
        _CACHE[url] = (now, txt)
    return txt


@_dataclass(frozen=True)
class ArchiveSpec:
    label: str
    keywords: tuple[str, ...]          # plain phrases; longest match wins
    indexes: tuple[str, ...]           # pages listing version folders (current first, archive after)
    ver_re: str                        # regex on a folder href; group(1) = version
    iso_dirs: tuple[str, ...]          # templates using {index} and {ver}
    all_indexes: bool = False          # collect from every index (e.g. per-edition folders)
    name_re: str | None = None         # optional filter for ISO file names
    extra: dict = _field(default_factory=dict, compare=False, hash=False)


def _ubuntu_flavor(label: str, slug: str, *kw: str) -> ArchiveSpec:
    return ArchiveSpec(
        label=label,
        keywords=kw,
        indexes=(
            f"https://cdimage.ubuntu.com/{slug}/releases/",
            f"https://old-releases.ubuntu.com/releases/{slug}/releases/",
        ),
        ver_re=r"(\d{1,2}\.\d{2}(?:\.\d+)?)/",
        iso_dirs=("{index}{ver}/release/",),
    )


ARCHIVE_SPECS: tuple[ArchiveSpec, ...] = (
    ArchiveSpec(
        "Ubuntu", ("ubuntu",),
        ("https://releases.ubuntu.com/", "https://old-releases.ubuntu.com/releases/"),
        r"(\d{1,2}\.\d{2}(?:\.\d+)?)/", ("{index}{ver}/",),
    ),
    _ubuntu_flavor("Kubuntu", "kubuntu", "kubuntu"),
    _ubuntu_flavor("Xubuntu", "xubuntu", "xubuntu"),
    _ubuntu_flavor("Lubuntu", "lubuntu", "lubuntu"),
    _ubuntu_flavor("Ubuntu MATE", "ubuntu-mate", "ubuntu mate", "ubuntu-mate"),
    _ubuntu_flavor("Ubuntu Budgie", "ubuntu-budgie", "ubuntu budgie", "ubuntu-budgie"),
    _ubuntu_flavor("Ubuntu Studio", "ubuntustudio", "ubuntu studio", "ubuntustudio"),
    _ubuntu_flavor("Ubuntu Kylin", "ubuntukylin", "ubuntu kylin", "ubuntukylin"),
    ArchiveSpec(
        "Debian", ("debian",),
        ("https://cdimage.debian.org/debian-cd/", "https://cdimage.debian.org/cdimage/archive/"),
        r"(\d+\.\d+(?:\.\d+)?)/", ("{index}{ver}/amd64/iso-cd/", "{index}{ver}/amd64/iso-dvd/"),
    ),
    ArchiveSpec(
        "Debian Live", ("debian live",),
        ("https://cdimage.debian.org/debian-cd/", "https://cdimage.debian.org/cdimage/archive/"),
        r"(\d+\.\d+(?:\.\d+)?)/", ("{index}{ver}/amd64/iso-hybrid/",),
    ),
    ArchiveSpec(
        "Fedora", ("fedora",),
        ("https://dl.fedoraproject.org/pub/fedora/linux/releases/",
         "https://archives.fedoraproject.org/pub/archive/fedora/linux/releases/"),
        r"(\d{2})/", ("{index}{ver}/Workstation/x86_64/iso/", "{index}{ver}/Live/x86_64/"),
    ),
    ArchiveSpec(
        "openSUSE Leap", ("opensuse leap", "leap", "opensuse", "suse"),
        ("https://download.opensuse.org/distribution/leap/",
         "https://ftp.gwdg.de/pub/opensuse/distribution/leap/"),
        r"(\d+\.\d+)/", ("{index}{ver}/iso/",),
    ),
    ArchiveSpec(
        "Alpine", ("alpine",),
        ("https://dl-cdn.alpinelinux.org/alpine/",),
        r"v(\d+\.\d+)/", ("{index}v{ver}/releases/x86_64/",),
    ),
    ArchiveSpec(
        "Rocky Linux", ("rocky linux", "rocky"),
        ("https://download.rockylinux.org/pub/rocky/", "https://dl.rockylinux.org/vault/rocky/"),
        r"(\d+\.\d+)/", ("{index}{ver}/isos/x86_64/",),
    ),
    ArchiveSpec(
        "AlmaLinux", ("almalinux", "alma linux", "alma"),
        ("https://repo.almalinux.org/almalinux/", "https://vault.almalinux.org/"),
        r"(\d+\.\d+)/", ("{index}{ver}/isos/x86_64/",),
    ),
    ArchiveSpec(
        "CentOS Stream", ("centos stream", "centos"),
        ("https://mirror.stream.centos.org/", "https://vault.centos.org/"),
        r"(\d+)-stream/", ("{index}{ver}-stream/BaseOS/x86_64/iso/", "{index}{ver}-stream/isos/x86_64/"),
        all_indexes=False,
    ),
    ArchiveSpec(
        "FreeBSD", ("freebsd",),
        ("https://download.freebsd.org/releases/ISO-IMAGES/",
         "http://ftp-archive.freebsd.org/pub/FreeBSD-Archive/old-releases/ISO-IMAGES/"),
        r"(\d+\.\d+)/", ("{index}{ver}/",), name_re=r"(amd64|i386)",
    ),
    ArchiveSpec(
        "OpenBSD", ("openbsd",),
        ("https://cdn.openbsd.org/pub/OpenBSD/",),
        r"(\d+\.\d)/", ("{index}{ver}/amd64/", "{index}{ver}/i386/"),
    ),
    ArchiveSpec(
        "NetBSD", ("netbsd",),
        ("https://cdn.netbsd.org/pub/NetBSD/iso/", "https://archive.netbsd.org/pub/NetBSD-archive/iso/"),
        r"(\d+\.\d+(?:\.\d+)?)/", ("{index}{ver}/",),
    ),
    ArchiveSpec(
        "Slackware", ("slackware",),
        ("https://mirrors.slackware.com/slackware/slackware-iso/",
         "https://slackware.uk/slackware/slackware-iso/"),
        r"slackware64-(\d+\.\d+)-iso/", ("{index}slackware64-{ver}-iso/",),
    ),
    ArchiveSpec(
        "Tiny Core", ("tiny core", "tinycore"),
        ("https://distro.ibiblio.org/tinycorelinux/", "http://tinycorelinux.net/"),
        r"(\d+)\.x/", ("{index}{ver}.x/x86/release/", "{index}{ver}.x/x86_64/release/"),
    ),
    ArchiveSpec(
        "Mageia", ("mageia",),
        ("https://mirrors.kernel.org/mageia/iso/",
         "https://distrib-coffee.ipsl.jussieu.fr/pub/linux/Mageia/iso/"),
        r"(\d+(?:\.\d+)?)/", ("{index}{ver}/",),
    ),
    ArchiveSpec(
        "Void Linux", ("void linux", "voidlinux", "void"),
        ("https://repo-default.voidlinux.org/live/",),
        r"(\d{8})/", ("{index}{ver}/",), name_re=r"x86_64",
    ),
    ArchiveSpec(
        "Parrot OS", ("parrot os", "parrotsec", "parrot"),
        ("https://deb.parrot.sh/parrot/iso/",),
        r"(\d+\.\d+(?:\.\d+)?)/", ("{index}{ver}/",),
    ),
    ArchiveSpec(
        "Gentoo", ("gentoo",),
        ("https://distfiles.gentoo.org/releases/amd64/autobuilds/",),
        r"(\d{8}T\d{6}Z)/", ("{index}{ver}/",),
    ),
    ArchiveSpec(
        "Manjaro", ("manjaro",),
        ("https://download.manjaro.org/kde/", "https://download.manjaro.org/xfce/",
         "https://download.manjaro.org/gnome/"),
        r"(\d+\.\d+(?:\.\d+)?)/", ("{index}{ver}/",), all_indexes=True,
    ),
    ArchiveSpec(
        "Tails", ("tails",),
        ("https://archive.torproject.org/amnesia.boum.org/tails/stable/",),
        r"tails-amd64-(\d+\.\d+(?:\.\d+)?)/", ("{index}tails-amd64-{ver}/",),
    ),
    ArchiveSpec(
        "KDE neon", ("kde neon", "neon"),
        ("https://files.kde.org/neon/images/user/",),
        r"(\d{8}-\d{4})/", ("{index}{ver}/",),
    ),
)


def _norm_words(s: str) -> str:
    return " " + re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip() + " "


def match_archive_specs(query: str) -> list[ArchiveSpec]:
    """Specs whose keyword appears in the query; only the longest (most specific) matches are kept."""
    q = _norm_words(query)
    if " tumbleweed " in q:
        return []  # rolling release: no version archive
    scored: list[tuple[int, ArchiveSpec]] = []
    for spec in ARCHIVE_SPECS:
        best = 0
        for kw in spec.keywords:
            k = _norm_words(kw)
            if k.strip() and k in q:
                best = max(best, len(k.strip()))
        if best:
            scored.append((best, spec))
    if not scored:
        return []
    top = max(s for s, _ in scored)
    return [spec for s, spec in scored if s == top]


def _version_key(v: str) -> list[int]:
    return [int(x) for x in re.findall(r"\d+", v)] or [0]


def _query_version_tokens(query: str, spec: ArchiveSpec) -> list[str]:
    q = " " + re.sub(r"[^a-z0-9.]+", " ", (query or "").lower()).strip() + " "
    for kw in sorted(spec.keywords, key=len, reverse=True):  # don't treat digits in the distro name as a version
        q = q.replace(_norm_words(kw), " ")
    toks = re.findall(r"(?<![a-z0-9.])(\d+(?:\.\d+)*)(?![a-z0-9])", q)
    return [t for t in toks if t not in ("32", "64", "86")]  # ignore "64 bit", "x86 64"


def _version_matches(v: str, tokens: list[str]) -> bool:
    if not tokens:
        return True
    for t in tokens:
        if v == t or v.startswith(t + ".") or v.startswith(t + "-") or v.startswith(t + "T"):
            return True
        if len(t) >= 4 and v.startswith(t):  # year / yyyymm style
            return True
    return False


def _list_hrefs(page: str) -> list[str]:
    return [h.strip() for h in parse_apache_listing_for_links(page) if h and not h.startswith(("?", "#", "mailto:"))]


def _parse_any_checksums(text: str) -> dict[str, str]:
    out = parse_checksum_lines(text)
    for m in re.finditer(r"SHA256 \(([^)]+)\) = ([a-fA-F0-9]{64})", text):
        out[m.group(1).strip()] = m.group(2).lower()
    return out


def _isos_in_dir(dir_url: str, name_re: str | None, depth: int = 1) -> list[tuple[str, str, str | None]]:
    """Return (name, url, sha256) for ISOs in a directory listing, descending one level if empty."""
    try:
        page = _cached_get(dir_url)
    except Exception:
        return []
    hrefs = _list_hrefs(page)
    found: list[tuple[str, str]] = []
    sums_files: list[str] = []
    subdirs: list[str] = []
    for h in hrefs:
        base = urllib.parse.unquote(h.rstrip("/").rsplit("/", 1)[-1])
        low = base.lower()
        if h.lower().endswith(".iso"):
            if name_re and not re.search(name_re, base, flags=re.IGNORECASE):
                continue
            found.append((base, join_url(dir_url, h)))
        elif low in ("sha256sums", "sha256sums.txt", "sha256sum.txt") or "checksum" in low and "sha256" in low \
                or low.endswith("-checksum"):
            sums_files.append(join_url(dir_url, h))
        elif h.endswith("/") and "/" not in h.rstrip("/") and not h.startswith(("..", "http")):
            subdirs.append(join_url(dir_url, h))

    if not found and depth > 0:
        out: list[tuple[str, str, str | None]] = []
        for sd in subdirs[:12]:
            out.extend(_isos_in_dir(sd, name_re, depth - 1))
        return out

    sums: dict[str, str] = {}
    for sf in sums_files[:3]:
        try:
            sums.update(_parse_any_checksums(_cached_get(sf)))
        except Exception:
            pass
    return [(n, u, sums.get(n)) for n, u in found]


def _spec_versions(spec: ArchiveSpec) -> list[tuple[str, list[str]]]:
    """[(version, [index urls that have it])], newest first."""
    ver_idx: dict[str, list[str]] = {}
    pat = re.compile(r"(?:^|/)" + spec.ver_re + r"$")
    for idx in spec.indexes:
        try:
            page = _cached_get(idx)
        except Exception:
            continue
        for h in _list_hrefs(page):
            m = pat.search(h if h.endswith("/") else h + "/")
            if m:
                lst = ver_idx.setdefault(m.group(1), [])
                if idx not in lst:
                    lst.append(idx)
    return sorted(ver_idx.items(), key=lambda kv: _version_key(kv[0]), reverse=True)


def archive_iso_search(query: str, archive_level: int = 0) -> list[RemoteIsoItem]:
    """Older + current releases for any distro in ARCHIVE_SPECS. Deeper archive_level = more versions."""
    specs = match_archive_specs(query)
    if not specs:
        return []
    limits = _get_limits(archive_level)
    max_versions = limits.get("max_archive_versions", 5)
    max_items = limits.get("max_archive_items", 400)

    out: list[RemoteIsoItem] = []
    seen_urls: set[str] = set()
    seen_names: set[str] = set()
    for spec in specs:
        tokens = _query_version_tokens(query, spec)
        versions = [(v, idxs) for v, idxs in _spec_versions(spec) if _version_matches(v, tokens)]
        versions = _cap_list(versions, max_versions)

        def fetch(entry: tuple[str, list[str]]) -> list[tuple[str, str, str | None]]:
            ver, idxs = entry
            got: list[tuple[str, str, str | None]] = []
            for idx in idxs:
                for tmpl in spec.iso_dirs:
                    got.extend(_isos_in_dir(tmpl.format(index=idx, ver=ver), spec.name_re))
                    if got and not spec.all_indexes:
                        return got
            return got

        with _Pool(max_workers=8) as pool:
            results = list(pool.map(fetch, versions))

        for (ver, _), isos in zip(versions, results):
            for name, url, sha in sorted(isos, key=lambda t: t[0]):
                if url in seen_urls or name in seen_names:
                    continue  # same file mirrored under current/ and archive/ or a symlinked point release
                seen_urls.add(url)
                seen_names.add(name)
                # A symlinked folder (26.04.1/) can also hold 26.04 ISOs: label by the file's own version.
                fv = infer_version_from_iso_name(name)
                label = fv if fv and "." in fv and fv.split(".")[0] == re.split(r"[.\-T]", ver)[0] else ver
                out.append(RemoteIsoItem(name=f"[{label}] {name}", url=url, sha256=sha))
                if _hit_limit(len(out), max_items):
                    return out
    return out


def _try_windows_archive(query: str, limits: dict[str, int]) -> list[RemoteIsoItem]:
    """Internet Archive lookups for Microsoft Windows releases (11/10/8.1/8/7/Vista/XP)."""
    if not has_windows_support(query):
        return []
    try:
        level = int(limits.get("_level", 0) or 0)
    except Exception:
        level = 0
    items = windows_iso_search(query, level)
    return _cap_list(items, limits.get("max_archive_items", 200))


def _try_ia_archive(query: str, limits: dict[str, int]) -> list[RemoteIsoItem]:
    """Internet Archive lookups for every non-Windows family (see ``ipm_ia``).

    Covers macOS, the BSDs, Linux distributions, retro systems (TempleOS,
    KolibriOS, OS/2 ...) and appliance images (Proxmox, TrueNAS, pfSense ...).
    """
    if not (has_ia_support(query) or is_ia_source(query)):
        return []
    try:
        level = int(limits.get("_level", 0) or 0)
    except Exception:
        level = 0
    items = ia_iso_search(query, level)
    return _cap_list(items, limits.get("max_archive_items", 200))


def _archive_fallback(query: str, limits: dict[str, int]) -> list[RemoteIsoItem]:
    # Order matters: pick the most deterministic sources first.
    out: list[RemoteIsoItem] = []
    seen: set[str] = set()

    try:
        custom = _try_custom_mirrors(query, limits)
    except Exception:
        custom = []
    for it in custom:
        if it.url in seen:
            continue
        seen.add(it.url)
        out.append(it)
        if _hit_limit(len(out), limits.get("max_archive_items", 200)):
            return out

    # Microsoft Windows releases (kept near the front so the catalogues win over
    # generic listing scrapes, which usually find nothing for these queries).
    try:
        windows = _try_windows_archive(query, limits)
    except Exception:
        windows = []
    for it in windows:
        if it.url in seen:
            continue
        seen.add(it.url)
        out.append(it)
        if _hit_limit(len(out), limits.get("max_archive_items", 200)):
            return out

    # Every non-Windows family preserved on archive.org (macOS, BSDs, Linux,
    # retro systems, appliances).  Runs before the distro-specific legacy
    # handlers because the Internet Archive catalogue is usually the only place
    # these images still exist.
    try:
        ia_items = _try_ia_archive(query, limits)
    except Exception:
        ia_items = []
    for it in ia_items:
        if it.url in seen:
            continue
        seen.add(it.url)
        out.append(it)
        if _hit_limit(len(out), limits.get("max_archive_items", 200)):
            return out

    try:
        generic = archive_iso_search(query, limits.get("_level", 0))
    except Exception:
        generic = []
    for it in generic:
        if it.url in seen:
            continue
        seen.add(it.url)
        out.append(it)
        if _hit_limit(len(out), limits.get("max_archive_items", 200)):
            return out

    # Legacy handlers for distros not covered by ARCHIVE_SPECS (Kali, Mint, Arch, Artix, Tumbleweed).
    for fn in (
        _try_opensuse_latest,
    ):
        try:
            items = fn(query)
        except Exception:
            items = []
        for it in items:
            if it.url in seen:
                continue
            seen.add(it.url)
            out.append(it)
            if _hit_limit(len(out), limits.get("max_archive_items", 200)):
                return out

    for fn2 in (
        _try_artix_archive,
        _try_archlinux_archive,
        _try_kali_archive,
        _try_linux_mint_archive,
    ):
        try:
            items2 = fn2(query, limits)
        except Exception:
            items2 = []
        for it in items2:
            if it.url in seen:
                continue
            seen.add(it.url)
            out.append(it)
            if _hit_limit(len(out), limits.get("max_archive_items", 200)):
                return out
    return out


def duckduckgo_iso_search(query: str, max_results: int = 80, *, archive_level: int = 0) -> list[RemoteIsoItem]:
    q = (query or "").strip()
    if not q:
        return []

    url = "https://duckduckgo.com/html/?q=" + urllib.parse.quote_plus(q)
    try:
        html = http_get_text(url)
    except Exception:
        html = ""

    # DuckDuckGo uses redirect links containing 'uddg' which is the real target.
    targets: list[str] = []
    for m in re.finditer(r"[?&]uddg=([^&\"\']+)", html, flags=re.IGNORECASE):
        try:
            targets.append(urllib.parse.unquote(m.group(1)))
        except Exception:
            continue

    # If /html was blocked (403/429) or returned no redirect targets, fall back to /lite.
    if not targets:
        try:
            lite_url = "https://lite.duckduckgo.com/lite/?q=" + urllib.parse.quote_plus(q)
            lite_html = http_get_text(lite_url)
            for m in re.finditer(r'href="([^"]+)"', lite_html, flags=re.IGNORECASE):
                href = (m.group(1) or "").strip()
                if not href:
                    continue
                if href.startswith("//"):
                    href = "https:" + href
                if href.startswith("http://") or href.startswith("https://"):
                    targets.append(href)
        except Exception:
            pass

    # First: direct .iso URLs present in the search HTML/targets (rare)
    urls: list[str] = []
    for t in targets:
        if ".iso" in t.lower():
            urls.extend(extract_iso_urls_from_text(t))
    urls.extend(extract_iso_urls_from_text(html))

    q_lc = q.lower()
    looks_archived = bool(re.search(r"\b(old|archive|archived|legacy|deprecated)\b", q_lc)) or bool(
        re.search(r"\b\d+\.\d+(?:\.\d+)?\b", q_lc)
    )
    lvl = max(0, int(archive_level))
    max_result_pages = (12 if looks_archived else 8) * (lvl + 1)
    max_follow_per_page = (10 if looks_archived else 6) * (lvl + 1)
    max_result_pages = min(max_result_pages, 60)
    max_follow_per_page = min(max_follow_per_page, 50)

    # Fallback: crawl a few top result pages and look for direct .iso links there.
    # This is still best-effort and may fail due to bot protections.
    # To improve results (especially for older/archived releases), do a bounded
    # "deep scan" by following a few same-host links from each result page.
    seen_targets: set[str] = set()
    crawled = 0
    for t in targets:
        if t in seen_targets:
            continue
        seen_targets.add(t)
        crawled += 1
        if crawled > max_result_pages:
            break
        try:
            page = http_get_text(t, timeout=15.0)
        except Exception:
            continue
        urls.extend(extract_iso_urls_from_text(page))
        if len(urls) < max_results:
            try:
                base_parsed = urllib.parse.urlparse(t)
                base_host = base_parsed.netloc
                # Extract links from the page; follow only a few, same-host, and likely to contain files.
                hrefs = parse_apache_listing_for_links(page)
                candidates: list[str] = []
                for href in hrefs:
                    if not href:
                        continue
                    if href.startswith("#") or href.lower().startswith("javascript:"):
                        continue
                    u = urllib.parse.urljoin(t, href)
                    pu = urllib.parse.urlparse(u)
                    if pu.scheme not in ("http", "https"):
                        continue
                    if pu.netloc != base_host:
                        continue
                    low = u.lower()
                    if any(x in low for x in (".iso", "/iso", "releases", "release", "download", "mirror", "cdimage", "archive", "old")):
                        candidates.append(u)

                seen_cand: set[str] = set()
                followed = 0
                for u in candidates:
                    if u in seen_cand:
                        continue
                    seen_cand.add(u)
                    followed += 1
                    if followed > max_follow_per_page:
                        break
                    try:
                        sub = http_get_text(u, timeout=12.0)
                    except Exception:
                        continue
                    urls.extend(extract_iso_urls_from_text(sub))
                    if len(urls) >= max_results:
                        break
            except Exception:
                pass
        if len(urls) >= max_results:
            break

    dedup: list[str] = []
    seen: set[str] = set()
    for u in urls:
        if u not in seen and is_plausible_iso_download_url(u):
            seen.add(u)
            dedup.append(u)
        if len(dedup) >= max_results:
            break

    items: list[RemoteIsoItem] = []
    for u in dedup:
        if not is_plausible_iso_download_url(u):
            continue
        p = urllib.parse.urlparse(u)
        name = os.path.basename(p.path) or u
        ver = infer_version_from_iso_name(name)
        if ver and f"{ver}" not in name:
            name = f"[{ver}] {name}"
        items.append(RemoteIsoItem(name=name, url=u, sha256=None))
    if not items:
        # Deterministic archive fallbacks for older releases.
        # Web engines sometimes block/limit crawling, producing 0 results.
        items = _archive_fallback(query, _get_limits(archive_level=0))

    return items


def google_cse_iso_search(
    query: str, api_key: str, cse_id: str, max_results: int = 80, *, archive_level: int = 0
) -> list[RemoteIsoItem]:
    q = (query or "").strip()
    if not q:
        return []

    key = (api_key or "").strip()
    cx = (cse_id or "").strip()
    if not key:
        raise RuntimeError("Google API key is empty")
    if not cx:
        raise RuntimeError("Google CSE ID (cx) is empty")

    # Official Google Custom Search JSON API.
    # Note: This requires enabling the API + a Custom Search Engine (CSE) configured by the user.
    api = "https://www.googleapis.com/customsearch/v1?" + urllib.parse.urlencode(
        {
            "key": key,
            "cx": cx,
            "q": q,
            "num": "10",
            "safe": "off",
        }
    )

    txt = http_get_text(api, timeout=20.0)
    try:
        data = json.loads(txt)
    except Exception as e:
        raise RuntimeError(f"Google API returned invalid JSON: {e}")

    if isinstance(data, dict) and "error" in data:
        err = data.get("error")
        msg = None
        if isinstance(err, dict):
            msg = err.get("message")
        raise RuntimeError(msg or "Google API error")

    items_raw = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items_raw, list):
        return []

    targets: list[str] = []
    for it in items_raw:
        if not isinstance(it, dict):
            continue
        u = (it.get("link") or "").strip()
        if u.startswith("http://") or u.startswith("https://"):
            targets.append(u)

    # Reuse the same bounded crawler behavior.
    q_lc = q.lower()
    looks_archived = bool(re.search(r"\b(old|archive|archived|legacy|deprecated)\b", q_lc)) or bool(
        re.search(r"\b\d+\.\d+(?:\.\d+)?\b", q_lc)
    )
    lvl = max(0, int(archive_level))
    max_result_pages = (12 if looks_archived else 8) * (lvl + 1)
    max_follow_per_page = (10 if looks_archived else 6) * (lvl + 1)
    max_result_pages = min(max_result_pages, 60)
    max_follow_per_page = min(max_follow_per_page, 50)

    urls: list[str] = []
    seen_targets: set[str] = set()
    crawled = 0
    for t in targets:
        if t in seen_targets:
            continue
        seen_targets.add(t)
        crawled += 1
        if crawled > max_result_pages:
            break
        try:
            page = http_get_text(t, timeout=15.0)
        except Exception:
            continue
        urls.extend(extract_iso_urls_from_text(page))
        if len(urls) < max_results:
            try:
                base_parsed = urllib.parse.urlparse(t)
                base_host = base_parsed.netloc
                hrefs = parse_apache_listing_for_links(page)
                candidates: list[str] = []
                for href in hrefs:
                    if not href:
                        continue
                    if href.startswith("#") or href.lower().startswith("javascript:"):
                        continue
                    u = urllib.parse.urljoin(t, href)
                    pu = urllib.parse.urlparse(u)
                    if pu.scheme not in ("http", "https"):
                        continue
                    if pu.netloc != base_host:
                        continue
                    low = u.lower()
                    if any(x in low for x in (".iso", "/iso", "releases", "release", "download", "mirror", "cdimage", "archive", "old")):
                        candidates.append(u)

                seen_cand: set[str] = set()
                followed = 0
                for u in candidates:
                    if u in seen_cand:
                        continue
                    seen_cand.add(u)
                    followed += 1
                    if followed > max_follow_per_page:
                        break
                    try:
                        sub = http_get_text(u, timeout=12.0)
                    except Exception:
                        continue
                    urls.extend(extract_iso_urls_from_text(sub))
                    if len(urls) >= max_results:
                        break
            except Exception:
                pass
        if len(urls) >= max_results:
            break

    dedup: list[str] = []
    seen: set[str] = set()
    for u in urls:
        if u not in seen and is_plausible_iso_download_url(u):
            seen.add(u)
            dedup.append(u)
        if len(dedup) >= max_results:
            break

    items: list[RemoteIsoItem] = []
    for u in dedup:
        if not is_plausible_iso_download_url(u):
            continue
        p = urllib.parse.urlparse(u)
        name = os.path.basename(p.path) or u
        ver = infer_version_from_iso_name(name)
        if ver and f"{ver}" not in name:
            name = f"[{ver}] {name}"
        items.append(RemoteIsoItem(name=name, url=u, sha256=None))
    if not items:
        items = _archive_fallback(query, _get_limits(archive_level=0))
    return items


def searxng_iso_search(query: str, base_url: str, max_results: int = 80, *, archive_level: int = 0) -> list[RemoteIsoItem]:
    q = (query or "").strip()
    if not q:
        return []

    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("SearxNG base URL is empty")
    if not (base.startswith("http://") or base.startswith("https://")):
        raise RuntimeError("SearxNG base URL must start with http:// or https://")

    # SearxNG JSON API: /search?q=...&format=json
    api = f"{base}/search?" + urllib.parse.urlencode(
        {
            "q": q,
            "format": "json",
            "language": "en",
            "safesearch": "0",
        }
    )

    txt = http_get_text(api, timeout=20.0)
    try:
        data = json.loads(txt)
    except Exception as e:
        raise RuntimeError(f"SearxNG returned invalid JSON: {e}")

    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        raise RuntimeError("SearxNG response missing 'results'")

    targets: list[str] = []
    for r in results[:25]:
        if not isinstance(r, dict):
            continue
        u = (r.get("url") or "").strip()
        if u.startswith("http://") or u.startswith("https://"):
            targets.append(u)

    # Reuse the same bounded crawler behavior as DuckDuckGo search.
    q_lc = q.lower()
    looks_archived = bool(re.search(r"\b(old|archive|archived|legacy|deprecated)\b", q_lc)) or bool(
        re.search(r"\b\d+\.\d+(?:\.\d+)?\b", q_lc)
    )
    lvl = max(0, int(archive_level))
    max_result_pages = (12 if looks_archived else 8) * (lvl + 1)
    max_follow_per_page = (10 if looks_archived else 6) * (lvl + 1)
    max_result_pages = min(max_result_pages, 60)
    max_follow_per_page = min(max_follow_per_page, 50)

    urls: list[str] = []
    seen_targets: set[str] = set()
    crawled = 0
    for t in targets:
        if t in seen_targets:
            continue
        seen_targets.add(t)
        crawled += 1
        if crawled > max_result_pages:
            break
        try:
            page = http_get_text(t, timeout=15.0)
        except Exception:
            continue
        urls.extend(extract_iso_urls_from_text(page))
        if len(urls) < max_results:
            try:
                base_parsed = urllib.parse.urlparse(t)
                base_host = base_parsed.netloc
                hrefs = parse_apache_listing_for_links(page)
                candidates: list[str] = []
                for href in hrefs:
                    if not href:
                        continue
                    if href.startswith("#") or href.lower().startswith("javascript:"):
                        continue
                    u = urllib.parse.urljoin(t, href)
                    pu = urllib.parse.urlparse(u)
                    if pu.scheme not in ("http", "https"):
                        continue
                    if pu.netloc != base_host:
                        continue
                    low = u.lower()
                    if any(x in low for x in (".iso", "/iso", "releases", "release", "download", "mirror", "cdimage", "archive", "old")):
                        candidates.append(u)

                seen_cand: set[str] = set()
                followed = 0
                for u in candidates:
                    if u in seen_cand:
                        continue
                    seen_cand.add(u)
                    followed += 1
                    if followed > max_follow_per_page:
                        break
                    try:
                        sub = http_get_text(u, timeout=12.0)
                    except Exception:
                        continue
                    urls.extend(extract_iso_urls_from_text(sub))
                    if len(urls) >= max_results:
                        break
            except Exception:
                pass
        if len(urls) >= max_results:
            break

    dedup: list[str] = []
    seen: set[str] = set()
    for u in urls:
        if u not in seen and is_plausible_iso_download_url(u):
            seen.add(u)
            dedup.append(u)
        if len(dedup) >= max_results:
            break

    items: list[RemoteIsoItem] = []
    for u in dedup:
        if not is_plausible_iso_download_url(u):
            continue
        p = urllib.parse.urlparse(u)
        name = os.path.basename(p.path) or u
        ver = infer_version_from_iso_name(name)
        if ver and f"{ver}" not in name:
            name = f"[{ver}] {name}"
        items.append(RemoteIsoItem(name=name, url=u, sha256=None))
    if not items:
        items = _archive_fallback(query, _get_limits(archive_level=0))
    return items


def web_search_iso_urls(
    query: str,
    provider: str,
    *,
    searxng_url: str = "",
    google_key: str = "",
    google_cx: str = "",
    archive_level: int = 0,
    deterministic_first: bool = False,
) -> list[RemoteIsoItem]:
    q = build_iso_focused_query(query)
    p = (provider or "DuckDuckGo").strip()
    limits = _get_limits(archive_level)

    if deterministic_first:
        out: list[RemoteIsoItem] = []
        seen: set[str] = set()
        try:
            arch0 = _archive_fallback(query, limits)
        except Exception:
            arch0 = []
        for it in arch0:
            if it.url and it.url not in seen:
                seen.add(it.url)
                out.append(it)
        try:
            custom0 = _try_custom_mirrors(query, limits)
        except Exception:
            custom0 = []
        for it in custom0:
            if it.url and it.url not in seen:
                seen.add(it.url)
                out.append(it)

        # Continue with the selected provider and merge results.
        items = out
    else:
        items: list[RemoteIsoItem] = []

    def run(search_query: str) -> list[RemoteIsoItem]:
        if p == "SearxNG":
            return searxng_iso_search(search_query, searxng_url, max_results=80, archive_level=archive_level)
        if p == "Google API":
            return google_cse_iso_search(search_query, google_key, google_cx, max_results=80, archive_level=archive_level)
        return duckduckgo_iso_search(search_query, max_results=80, archive_level=archive_level)

    more_items = run(q)

    if more_items:
        if deterministic_first:
            seen2 = {it.url for it in items if it.url}
            for it in more_items:
                if it.url and it.url not in seen2:
                    seen2.add(it.url)
                    items.append(it)
        else:
            items = more_items

    if not items:
        items = _archive_fallback(query, limits)

    try:
        custom = _try_custom_mirrors(query, limits)
    except Exception:
        custom = []
    if custom:
        seen_urls = {it.url for it in items}
        for it in custom:
            if it.url not in seen_urls:
                seen_urls.add(it.url)
                items.append(it)

    # Archived/older release discovery: if results are sparse, retry with stronger archive hints.
    # (Some engines ignore filetype filters or require explicit archive wording.)
    if len(items) < 5:
        q2 = (query or "").strip()
        q2_lc = q2.lower()
        parts: list[str] = [q2]
        if "iso" not in q2_lc:
            parts.append("iso")
        if "filetype:iso" not in q2_lc:
            parts.append("filetype:iso")
        parts.append('("old releases" OR archive OR archived OR "release archive" OR legacy OR mirror)')
        parts.append('(download OR cdimage OR iso)')
        q_fallback = " ".join([s for s in parts if s])

        try:
            more = run(q_fallback)
        except Exception:
            more = []

        if more:
            seen = {it.url for it in items}
            for it in more:
                if it.url not in seen:
                    seen.add(it.url)
                    items.append(it)

    # For some distros (notably Kali), generic web search tends to return only the newest
    # folder even when the user wants older releases too. If the query has no explicit
    # version, merge in deterministic archive results.
    #
    # Also, when the UI requests deeper archive levels ("Load more"), always attempt
    # deterministic archive sources regardless of query heuristics.
    q_lc = (query or "").strip().lower()
    merge_archives = False
    if re.search(r"\bkali\b", q_lc) and not re.search(r"\b\d{4}\.\d+\b", q_lc):
        merge_archives = True
    if (re.search(r"\bmint\b", q_lc) or "linux mint" in q_lc) and not re.search(r"\b\d+\.\d+(?:\.\d+)?\b", q_lc):
        merge_archives = True
    if (re.search(r"\barch\b", q_lc) or "archlinux" in q_lc) and not re.search(r"\b\d{4}\.\d{2}\.\d{2}\b", q_lc):
        merge_archives = True
    if re.search(r"\balpine\b", q_lc) and not re.search(r"\b\d+\.\d+(?:\.\d+)?\b", q_lc):
        merge_archives = True
    if "opensuse" in q_lc or "open suse" in q_lc or re.search(r"\bsuse\b", q_lc):
        merge_archives = True
    if re.search(r"\bfedora\b", q_lc):
        merge_archives = True
    if has_windows_support(query):
        merge_archives = True
    if has_ia_support(query) or is_ia_source(query):
        merge_archives = True

    if match_archive_specs(query):
        merge_archives = True
    if int(archive_level) > 0:
        merge_archives = True

    if merge_archives:
        try:
            arch = _archive_fallback(query, limits)
        except Exception:
            arch = []
        if arch:
            seen_m = {it.url for it in items}
            for it in arch:
                if it.url not in seen_m:
                    seen_m.add(it.url)
                    items.append(it)

    # If the user searches for a specific distro keyword, prefer results that match it.
    # This avoids cases like "artix" returning Arch Linux archive links.
    q_lc = (query or "").strip().lower()
    keyword = None
    for k in ("artix", "archlinux"):
        if re.search(rf"\b{re.escape(k)}\b", q_lc):
            keyword = k
            break

    if keyword:
        filtered = [it for it in items if keyword in (it.url or "").lower() or keyword in (it.name or "").lower()]
        # Only apply filter if it doesn't completely wipe results.
        if filtered:
            items = filtered

    return items


def archive_search_all(query: str, archive_level: int = 0) -> list[RemoteIsoItem]:
    """Deterministic archive lookup only (no web engine): generic specs + legacy Kali/Mint/Arch/Artix."""
    return _archive_fallback(query, _get_limits(archive_level))


def has_archive_support(query: str) -> bool:
    """True when the deterministic catalogue path can answer ``query``.

    The archive.org families include the retro/hobby systems and most BSDs, so
    ``has_ia_support`` is checked before the legacy distro keywords.
    """
    q = (query or "").lower()
    if "tumbleweed" in q:
        return False
    if match_archive_specs(query):
        return True
    if has_windows_support(query):
        return True
    if has_ia_support(query) or is_ia_source(query):
        return True
    return bool(re.search(r"\b(kali|mint|arch|archlinux|artix)\b", q))
