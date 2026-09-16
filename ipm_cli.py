#!/usr/bin/env python3
"""ISO Package Manager - terminal edition (ipm_cli.py).

Command line front-end for the same engines the Tk GUI uses:

* ``ipm_search.archive_search_all``  - deterministic distro/BSD/archive.org lookup
* ``ipm_search.ia_iso_search``       - Internet Archive catalogue (non-Windows families)
* ``ipm_ia.ia_generic_search``       - "Archive.org (any ISO)" catch-all engine for uncurated systems
* ``ipm_search.windows_iso_search``  - Windows release medias, retail and LTSC
  (Windows only)
* ``ipm_search.web_search_iso_urls`` - optional web-engine fallback (DuckDuckGo/SearxNG/Google)

Examples
--------
    python ipm_cli.py list archive
    python ipm_cli.py search ubuntu
    python ipm_cli.py search TempleOS --level 1 -n 5
    python ipm_cli.py search "plan 9" --json
    python ipm_cli.py search serenityos
    python ipm_cli.py fetch "bazzite" -d D:\\isos -y
    python ipm_cli.py url debian
    python ipm_cli.py themes
    python ipm_cli.py themes --preview

Any operating system, even one this tool has no curated catalogue for, can be
searched through the generic archive.org engine::

    python ipm_cli.py search kolibri -s "Archive.org (any ISO)"
    python ipm_cli.py search "windows 2000" -s "Archive.org (any ISO)" -n 10
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from ipm_ia import (
    IA_GENERIC_LABEL,
    IA_SOURCES,
    LICENSE_NOTE,
    ia_generic_search,
    ia_iso_search,
    is_ia_source,
)
from ipm_models import RemoteIsoItem
from ipm_search import (
    ARCHIVE_SPECS,
    archive_search_all,
    has_archive_support,
    web_search_iso_urls,
)
from ipm_utils import human_bytes, ssl_context_for_https
from ipm_windows import WINDOWS_SOURCES, is_windows_source, windows_iso_search

try:  # optional: theme packs are additive, the terminal edition works without them
    import ipm_themes
except Exception:  # pragma: no cover
    ipm_themes = None

DEFAULT_LIMIT = 12
EXIT_OK = 0
EXIT_ERROR = 1
EXIT_NO_RESULTS = 2
EXIT_USAGE = 3


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def _supports_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if not sys.stdout.isatty():
        return False
    if os.name == "nt":
        return bool(os.environ.get("WT_SESSION") or os.environ.get("ANSICON"))
    return True


_COLOR = _supports_color()


def _c(text: str, code: str) -> str:
    if not _COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"


def bold(text: str) -> str:
    return _c(text, "1")


def dim(text: str) -> str:
    return _c(text, "2")


def warn(text: str) -> str:
    return _c(text, "33")


def bad(text: str) -> str:
    return _c(text, "31")


def good(text: str) -> str:
    return _c(text, "32")


def _err(message: str) -> None:
    print(bad("error: ") + message, file=sys.stderr)


# ---------------------------------------------------------------------------
# Search back-ends
# ---------------------------------------------------------------------------

def _source_kind(query: str) -> str:
    """Classify a query/source name: 'windows', 'ia', or 'catalogue'."""
    if is_windows_source(query):
        return "windows"
    if is_ia_source(query):
        return "ia"
    if has_archive_support(query):
        return "catalogue"
    return "catalogue"


def search_items(
    query: str,
    *,
    source: str = "",
    level: int = 0,
    limit: int = DEFAULT_LIMIT,
    web: str = "",
    searxng_url: str = "",
    google_key: str = "",
    google_cx: str = "",
) -> list[RemoteIsoItem]:
    """Return ISO candidates for ``query`` using the same fallback chain as the GUI.

    ``source`` pins one source by name, exactly like selecting the matching row
    in the GUI: the generic label "Archive.org (any ISO)" runs the unfiltered
    archive.org search over the free-text ``query`` (so *any* OS, curated or not,
    can be looked up), a family name uses that family's own relevance rules, and
    anything else is treated as the query itself.
    """
    query = (query or "").strip()
    source = (source or "").strip()
    if not query and not source:
        return []

    want = -1 if limit <= 0 else limit
    items: list[RemoteIsoItem] = []

    if source:
        if source == IA_GENERIC_LABEL:
            try:
                items = list(ia_generic_search(query, level, max_items=want if want > 0 else -1))
            except Exception as exc:  # pragma: no cover - network dependent
                _err(f"Archive.org lookup failed: {exc}")
                items = []
            return items
        query = build_query_from_source(source)

    if not query:
        return []

    if is_windows_source(query):
        try:
            items = list(windows_iso_search(query, level))
        except Exception as exc:  # pragma: no cover - network dependent
            _err(f"Windows archive lookup failed: {exc}")
            items = []
        return items[:want] if want > 0 else items

    if is_ia_source(query):
        try:
            items = list(ia_iso_search(query, level, max_items=want if want > 0 else -1))
        except Exception as exc:  # pragma: no cover - network dependent
            _err(f"Archive.org lookup failed: {exc}")
            items = []
        return items

    # Deterministic catalogue first (distro mirrors, BSD, archive.org families).
    try:
        items = list(archive_search_all(query, level))
    except Exception as exc:  # pragma: no cover - network dependent
        _err(f"catalogue lookup failed: {exc}")
        items = []

    if not items and web:
        try:
            items = list(
                web_search_iso_urls(
                    query,
                    web,
                    searxng_url=searxng_url,
                    google_key=google_key,
                    google_cx=google_cx,
                    archive_level=level,
                    deterministic_first=True,
                )
            )
        except Exception as exc:  # pragma: no cover - network dependent
            _err(f"web search failed: {exc}")
            items = []

    return items[:want] if want > 0 else items


def build_query_from_source(source: str) -> str:
    """Allow ``--source`` to behave like typing the name in the GUI."""
    source = (source or "").strip()
    if not source:
        return ""
    if source == IA_GENERIC_LABEL:
        return ""
    return source


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def _print_table(items: list[RemoteIsoItem], *, show_index: bool = True) -> None:
    for i, item in enumerate(items, start=1):
        prefix = f"{i:>3}. " if show_index else "  - "
        print(prefix + bold(item.name))
        print("     " + dim(item.url))
        if item.sha256:
            print("     " + dim("sha256: " + item.sha256))


def cmd_search(args: argparse.Namespace) -> int:
    label = args.query or args.source
    items = search_items(
        args.query,
        source=args.source or "",
        level=args.level,
        limit=args.limit,
        web=args.web,
        searxng_url=args.searxng_url or "",
        google_key=args.google_key or os.environ.get("IPM_GOOGLE_KEY", ""),
        google_cx=args.google_cx or os.environ.get("IPM_GOOGLE_CX", ""),
    )

    if args.json:
        print(json.dumps([{"name": i.name, "url": i.url, "sha256": i.sha256} for i in items], indent=2))
        return EXIT_OK if items else EXIT_NO_RESULTS

    if not items:
        _err(f"no ISO found for '{label}'.")
        if is_ia_source(args.query):
            print(warn("note: ") + LICENSE_NOTE, file=sys.stderr)
        else:
            print(
                warn("hint: ")
                + "try --level 1 for a deeper catalogue scan, or --web duckduckgo as a fallback.",
                file=sys.stderr,
            )
            if not args.source:
                print(
                    warn("hint: ")
                    + 'for an uncurated system add: -s "'
                    + IA_GENERIC_LABEL
                    + '"',
                    file=sys.stderr,
                )
        return EXIT_NO_RESULTS

    print(bold(f"{len(items)} result(s) for '{args.query}'"))
    _print_table(items)
    return EXIT_OK


def cmd_url(args: argparse.Namespace) -> int:
    """Print only the best matching URL (script friendly)."""
    items = search_items(
        args.query,
        source=args.source or "",
        level=args.level,
        limit=max(1, args.index),
        web=args.web,
        searxng_url=args.searxng_url or "",
        google_key=args.google_key or os.environ.get("IPM_GOOGLE_KEY", ""),
        google_cx=args.google_cx or os.environ.get("IPM_GOOGLE_CX", ""),
    )
    if not items:
        _err(f"no ISO found for '{args.query}'.")
        return EXIT_NO_RESULTS
    idx = min(max(1, args.index), len(items)) - 1
    print(items[idx].url)
    return EXIT_OK


def cmd_info(args: argparse.Namespace) -> int:
    items = search_items(
        args.query,
        source=args.source or "",
        level=args.level,
        limit=max(1, args.index),
        web=args.web,
        searxng_url=args.searxng_url or "",
        google_key=args.google_key or os.environ.get("IPM_GOOGLE_KEY", ""),
        google_cx=args.google_cx or os.environ.get("IPM_GOOGLE_CX", ""),
    )
    if not items:
        _err(f"no ISO found for '{args.query}'.")
        return EXIT_NO_RESULTS

    idx = min(max(1, args.index), len(items)) - 1
    item = items[idx]
    kind = _source_kind(args.source or args.query)

    size_txt = "unknown"
    if args.head:
        try:
            req = urllib.request.Request(item.url, method="HEAD", headers={"User-Agent": "ipm_cli/1.0"})
            with urllib.request.urlopen(req, timeout=15, context=ssl_context_for_https()) as resp:
                length = resp.headers.get("Content-Length")
                if length and length.isdigit():
                    size_txt = human_bytes(int(length))
                ctype = resp.headers.get("Content-Type") or "-"
                print(f"{'Content-Type:':<14}{ctype}")
        except Exception as exc:
            size_txt = f"HEAD failed ({exc})"

    if args.json:
        print(
            json.dumps(
                {
                    "name": item.name,
                    "url": item.url,
                    "sha256": item.sha256,
                    "size": size_txt,
                    "engine": kind,
                    "level": args.level,
                },
                indent=2,
            )
        )
        return EXIT_OK

    print(bold(item.name))
    print(f"{'Query:':<14}{args.query}")
    print(f"{'Engine:':<14}{kind}")
    print(f"{'URL:':<14}{item.url}")
    print(f"{'SHA-256:':<14}{item.sha256 or '(not published)'}")
    print(f"{'Size:':<14}{size_txt}")
    if kind in ("ia", "catalogue"):
        print(dim("Note: " + LICENSE_NOTE))
    return EXIT_OK


def _download(item: RemoteIsoItem, target_dir: Path, *, assume_yes: bool) -> int:
    target_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(item.name).name or "download.iso"
    target = target_dir / safe_name
    if target.exists() and not assume_yes:
        answer = input(f"{target} exists. Overwrite? [y/N] ").strip().lower()
        if answer not in ("y", "yes"):
            print("skipped.")
            return EXIT_OK

    req = urllib.request.Request(item.url, headers={"User-Agent": "ipm_cli/1.0"})
    downloaded = 0
    try:
        with urllib.request.urlopen(req, timeout=60, context=ssl_context_for_https()) as resp:
            total = resp.headers.get("Content-Length")
            total_n = int(total) if total and total.isdigit() else 0
            with open(target, "wb") as fh:
                while True:
                    chunk = resp.read(1024 * 256)
                    if not chunk:
                        break
                    fh.write(chunk)
                    downloaded += len(chunk)
                    if total_n:
                        pct = downloaded * 100.0 / total_n
                        sys.stderr.write(f"\r  {pct:5.1f}%  {human_bytes(downloaded)} / {human_bytes(total_n)}")
                    else:
                        sys.stderr.write(f"\r  {human_bytes(downloaded)}")
                    sys.stderr.flush()
    except (urllib.error.URLError, OSError) as exc:
        sys.stderr.write("\n")
        _err(f"download failed: {exc}")
        return EXIT_ERROR

    sys.stderr.write("\n")
    print(good("saved: ") + str(target))

    if item.sha256:
        from ipm_utils import sha256_file

        actual = sha256_file(target)
        if actual.lower() == item.sha256.lower():
            print(good("sha256 verified"))
        else:
            print(bad("sha256 MISMATCH"))
            print(f"  expected {item.sha256}")
            print(f"  actual   {actual}")
            return EXIT_ERROR
    else:
        print(dim("sha256 not published - verify manually against the vendor list."))
    return EXIT_OK


def cmd_fetch(args: argparse.Namespace) -> int:
    items = search_items(
        args.query,
        source=args.source or "",
        level=args.level,
        limit=max(1, args.index),
        web=args.web,
        searxng_url=args.searxng_url or "",
        google_key=args.google_key or os.environ.get("IPM_GOOGLE_KEY", ""),
        google_cx=args.google_cx or os.environ.get("IPM_GOOGLE_CX", ""),
    )
    if not items:
        _err(f"no ISO found for '{args.query}'.")
        return EXIT_NO_RESULTS

    idx = min(max(1, args.index), len(items)) - 1
    item = items[idx]
    print(bold("selected: ") + item.name)
    print(dim("  " + item.url))

    if args.print_only:
        return EXIT_OK
    if not args.yes and not sys.stdin.isatty():
        _err("refusing to download without --yes on a non-interactive shell.")
        return EXIT_USAGE

    return _download(item, Path(args.dir).expanduser(), assume_yes=args.yes)


def cmd_list(args: argparse.Namespace) -> int:
    what = (args.what or "all").lower()
    if what in ("all", "archive", "ia", "archive.org"):
        print(bold(f"Archive.org catalogue families ({len(IA_SOURCES)}):"))
        for name in IA_SOURCES:
            print("  - " + name)
        print()
    if what in ("all", "windows"):
        print(bold(f"Windows sources ({len(WINDOWS_SOURCES)}):"))
        for name in WINDOWS_SOURCES:
            print("  - " + name)
        print()
    if what in ("all", "linux", "catalogue", "mirrors"):
        print(bold(f"Deterministic mirror specs ({len(ARCHIVE_SPECS)}):"))
        for spec in ARCHIVE_SPECS:
            print("  - " + spec.label)
        print()
    if what not in ("all", "archive", "ia", "archive.org", "windows", "linux", "catalogue", "mirrors"):
        _err(f"unknown list group '{args.what}'. Use: all, archive, windows, linux.")
        return EXIT_USAGE
    return EXIT_OK


def cmd_themes(args: argparse.Namespace) -> int:
    """List the built-in themes plus every installed theme pack."""
    if ipm_themes is None:
        _err("theme support is unavailable: ipm_themes.py was not found next to this script.")
        return EXIT_ERROR

    name = (getattr(args, "name", "") or "").strip()
    if getattr(args, "preview", False):
        print(ipm_themes.ansi_preview(name or None))
        return EXIT_OK

    registry = ipm_themes.get_registry(refresh=True)

    if name:
        found = registry.get(name)
        if found is None:
            _err(f"no theme called {name!r} - run 'ipm_cli.py themes' to see the list.")
            return EXIT_NO_RESULTS
        kind = "built-in" if found.is_builtin else "theme pack"
        print(bold(f"{found.name}  [{found.id}]  ({kind})"))
        if found.author:
            print(f"  by {found.author}" + (f"  v{found.version}" if found.version else ""))
        if found.description:
            print(dim(f"  {found.description}"))
        if not found.is_builtin:
            print(dim(f"  base: {found.base}    file: {found.source}"))
        print()
        for key in ipm_themes.COLOR_KEYS:
            print(f"  {key:<16} {found.color(key)}")
        return EXIT_OK

    builtins = registry.builtins()
    packs = registry.packs()
    print(bold(f"{len(builtins) + len(packs)} theme(s): {len(builtins)} built-in, {len(packs)} theme pack(s)"))
    print()
    print(bold("  Built-in"))
    for theme in builtins:
        print(f"    {theme.id:<16} {theme.name}")
    print()
    print(bold("  Theme packs"))
    if not packs:
        print(dim(f"    (none - install one with 'python tools/ipmtheme.py install <file>')"))
    for theme in packs:
        ver = f" v{theme.version}" if theme.version else ""
        credit = f" by {theme.author}" if theme.author else dim(" (no author set)")
        print(f"    {theme.id:<16} {theme.name}{ver}{credit}")

    if registry.problems:
        print()
        print(warn(f"  {len(registry.problems)} pack(s) were skipped:"))
        for problem in registry.problems:
            print(warn(f"    - {problem}"))

    print()
    print(dim("  run 'ipm_cli.py themes --preview' to see one drawn in the terminal"))
    return EXIT_OK


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=os.path.basename(sys.argv[0]) or "ipm_cli.py",
        description="ISO Package Manager - terminal edition.",
        epilog="Sources are community preserved images; verify checksums before use.",
    )
    sub = parser.add_subparsers(dest="command")

    def add_common(p: argparse.ArgumentParser, *, with_web: bool = True) -> None:
        p.add_argument(
            "query",
            nargs="?",
            default="",
            help="OS name or free-text query, e.g. ubuntu, TempleOS, 'plan 9' (optional when --source is given)",
        )
        p.add_argument(
            "-s",
            "--source",
            default="",
            help='pin one source by name; use "' + IA_GENERIC_LABEL + '" to search any OS on archive.org',
        )
        p.add_argument("-l", "--level", type=int, default=0, help="catalogue depth (same as the GUI 'Load more'), default 0")
        p.add_argument("-i", "--index", type=int, default=1, help="1-based result index to use, default 1")
        p.add_argument("-n", "--limit", type=int, default=DEFAULT_LIMIT, help=f"max results, default {DEFAULT_LIMIT}")
        p.add_argument("--json", action="store_true", help="machine readable output")
        if with_web:
            p.add_argument("--web", default="", choices=["", "duckduckgo", "searxng", "google"], help="web-engine fallback when the catalogue is empty")
            p.add_argument("--searxng-url", default="", help="SearxNG base URL for --web searxng")
            p.add_argument("--google-key", default="", help="Google CSE API key (or IPM_GOOGLE_KEY)")
            p.add_argument("--google-cx", default="", help="Google CSE engine id (or IPM_GOOGLE_CX)")

    p_search = sub.add_parser("search", help="search for ISO images")
    add_common(p_search)
    p_search.set_defaults(func=cmd_search)

    p_url = sub.add_parser("url", help="print only the best matching ISO URL")
    add_common(p_url)
    p_url.set_defaults(func=cmd_url)

    p_info = sub.add_parser("info", help="show details for one result")
    add_common(p_info)
    p_info.add_argument("--head", action="store_true", help="issue a HEAD request for size/content type")
    p_info.set_defaults(func=cmd_info)

    p_fetch = sub.add_parser("fetch", help="download the best matching ISO")
    add_common(p_fetch)
    p_fetch.add_argument("-d", "--dir", default=".", help="download directory, default current directory")
    p_fetch.add_argument("-y", "--yes", action="store_true", help="overwrite without asking")
    p_fetch.add_argument("--print-only", action="store_true", help="only print the chosen URL")
    p_fetch.set_defaults(func=cmd_fetch)

    p_list = sub.add_parser("list", help="list known sources")
    p_list.add_argument("what", nargs="?", default="all", help="all | archive | windows | linux")
    p_list.set_defaults(func=cmd_list)

    p_themes = sub.add_parser("themes", help="list built-in themes and installed theme packs")
    p_themes.add_argument("name", nargs="?", default="", help="show one theme in detail (id or name)")
    p_themes.add_argument("--preview", action="store_true", help="draw the theme as a colour preview in the terminal")
    p_themes.set_defaults(func=cmd_themes)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "command", None):
        parser.print_help()
        return EXIT_USAGE
    if args.command not in ("list", "themes") and not (getattr(args, "query", "") or getattr(args, "source", "")):
        _err('give a query, or pin a source with -s (e.g. -s "' + IA_GENERIC_LABEL + '").')
        return EXIT_USAGE
    try:
        return int(args.func(args))
    except KeyboardInterrupt:
        print("\ninterrupted.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())