#!/usr/bin/env python3
"""ipmtheme - create, check, preview, install and share ISO Package Manager themes.

Standalone: needs nothing but Python 3.10+ and the ``ipm_themes.py`` module that
sits next to this project. Run it from anywhere.

::

    python tools/ipmtheme.py list
    python tools/ipmtheme.py dir
    python tools/ipmtheme.py new "Midnight Blue" --base modern-dark --author me
    python tools/ipmtheme.py validate themes/midnight-blue.ipmtheme.json
    python tools/ipmtheme.py preview  themes/midnight-blue.ipmtheme.json
    python tools/ipmtheme.py install  themes/midnight-blue.ipmtheme.json
    python tools/ipmtheme.py bundle   themes/midnight-blue.ipmtheme.json
    python tools/ipmtheme.py export modern-dark -o my-start.ipmtheme.json

Exit codes: ``0`` fine, ``1`` the pack has errors, ``2`` bad usage or file
problem. That makes ``validate`` usable in a CI job or a pre-commit hook.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
for candidate in (_HERE.parent, _HERE):
    if (candidate / "ipm_themes.py").is_file():
        sys.path.insert(0, str(candidate))
        break

import ipm_themes as T  # noqa: E402

EXIT_OK = 0
EXIT_INVALID = 1
EXIT_USAGE = 2


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def _color_enabled() -> bool:
    return not os.environ.get("NO_COLOR") and bool(sys.stdout.isatty())


def _c(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _color_enabled() else text


def ok(text: str) -> str:
    return _c(text, "32")


def bad(text: str) -> str:
    return _c(text, "31")


def warn(text: str) -> str:
    return _c(text, "33")


def dim(text: str) -> str:
    return _c(text, "2")


def bold(text: str) -> str:
    return _c(text, "1")


def _fail(message: str) -> int:
    print(bad("error: ") + message, file=sys.stderr)
    return EXIT_USAGE


def _folder_state(path: Path) -> tuple[int, str | None]:
    """``(pack count, note)`` for one search-path entry.

    A folder can hold packs even when it is not a real directory: a zipapp or
    PyInstaller build keeps its ``themes`` folder *inside* the archive.  The
    note says so, otherwise it is ``None``.
    """
    try:
        count = len(T.iter_pack_files([Path(path)]))
    except Exception:  # pragma: no cover - defensive
        count = 0
    if count and not Path(path).is_dir():
        return count, "inside the archive"
    return count, None


def _resolve_targets(args: argparse.Namespace) -> list[Path]:
    """Files (or folders) the user pointed at."""
    found: list[Path] = []
    for raw in args.files:
        path = Path(raw).expanduser()
        if path.is_dir():
            found.extend(T.iter_pack_files([path]))
        else:
            found.append(path)
    return found


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_list(args: argparse.Namespace) -> int:
    registry = T.load_themes(T.search_paths()) if args.dir else T.load_themes()
    if args.json:
        payload = [
            {
                "id": t.id,
                "name": t.name,
                "author": t.author,
                "version": t.version,
                "builtin": t.is_builtin,
                "base": t.base,
                "source": t.source,
                "description": t.description,
            }
            for t in registry
        ]
        print(json.dumps(payload, indent=2))
        return EXIT_OK

    builtins = registry.builtins()
    packs = registry.packs()
    print(bold(f"{len(registry)} theme(s): {len(builtins)} built-in, {len(packs)} installed pack(s)"))
    print()
    print(bold("  Built-in"))
    for theme in builtins:
        print(f"    {theme.id:<16} {theme.name}")
    print()
    print(bold("  Theme packs"))
    if not packs:
        print(dim("    (none yet - run 'new' to make one, or 'install <file>' to add one)"))
    for theme in packs:
        credit = f" by {theme.author}" if theme.author else dim(" (no author set)")
        ver = f" v{theme.version}" if theme.version else ""
        print(f"    {theme.id:<16} {theme.name}{ver}{credit}")
        if args.verbose:
            print(dim(f"                     {theme.description or 'no description'}"))
            print(dim(f"                     {theme.source}"))

    if registry.problems:
        print()
        print(warn(f"  {len(registry.problems)} pack(s) were skipped:"))
        for problem in registry.problems:
            print(warn(f"    - {problem}"))

    print()
    for folder in registry.dirs:
        count, note = _folder_state(Path(folder))
        if Path(folder).is_dir():
            state = "exists"
        elif note:
            state = note
        else:
            state = "missing"
        suffix = f"  {count} pack file(s)" if count else ""
        print(dim(f"  [{state}] {folder}{suffix}"))
    return EXIT_OK


def cmd_dir(args: argparse.Namespace) -> int:
    paths = T.search_paths(args.app_dir)
    print(bold("Theme folders, in load order (first match wins for a duplicate id):"))
    for index, path in enumerate(paths, start=1):
        path = Path(path)
        count, note = _folder_state(path)
        if path.is_dir():
            marker = "exists"
        elif note:
            marker = note
        else:
            marker = warn("missing")
        print(f"  {index}. {path}  [{marker}]" + (f"  {count} pack file(s)" if count else ""))
    user_dir = T.user_theme_dir()
    print()
    print(f"{bold('Your packs')} go in: {user_dir}")
    if not user_dir.is_dir():
        print(dim("  (it does not exist yet - 'install' creates it for you)"))
    bundled = T.bundled_theme_dir()
    if bundled is not None:
        count, _note = _folder_state(bundled)
        print()
        print(f"{bold('Bundled with this build')}: {bundled}")
        print(dim(f"  {count} pack file(s) shipped inside the running archive/bundle"))
    print(dim("  Override with the IPM_THEMES_DIR environment variable (os.pathsep-separated)."))
    return EXIT_OK


def cmd_validate(args: argparse.Namespace) -> int:
    targets = _resolve_targets(args)
    if not targets:
        return _fail("no pack files given")

    total_errors = 0
    total_warnings = 0
    results: list[dict] = []

    for path in targets:
        if not path.is_file():
            total_errors += 1
            print(f"{bad('FAIL')} {path}: no such file")
            results.append({"file": str(path), "errors": ["no such file"], "warnings": []})
            continue

        try:
            raw_bytes, _member = T._read_pack_bytes(path)
            data = json.loads(raw_bytes.decode("utf-8-sig", errors="replace"))
        except Exception as exc:
            total_errors += 1
            print(f"{bad('FAIL')} {path.name}: {exc.__class__.__name__}: {exc}")
            results.append({"file": str(path), "errors": [str(exc)], "warnings": []})
            continue

        errors, warnings = T.validate_pack(data, path.name)
        results.append({"file": str(path), "errors": errors, "warnings": warnings})

        if not errors and not warnings:
            print(f"{ok('PASS')} {path.name}  {dim(T._theme_display_name(str(data.get('id', ''))))}")
        elif not errors:
            print(f"{warn('WARN')} {path.name}  ({len(warnings)} warning(s))")
        else:
            print(f"{bad('FAIL')} {path.name}  ({len(errors)} error(s))")

        for message in errors:
            print(f"        {bad('error')}   {message}")
        for message in warnings:
            print(f"        {warn('warning')} {message}")

        total_errors += len(errors)
        total_warnings += len(warnings)

    if args.json:
        print()
        print(json.dumps(results, indent=2))

    print()
    if total_errors:
        print(bad(f"{len(targets)} file(s) checked: {total_errors} error(s), {total_warnings} warning(s)"))
        return EXIT_INVALID
    if total_warnings and args.strict:
        print(warn(f"{len(targets)} file(s) checked: no errors, {total_warnings} warning(s) (--strict)"))
        return EXIT_INVALID
    verdict = ok("no problems found") if not total_warnings else f"no errors, {total_warnings} warning(s)"
    print(f"{len(targets)} file(s) checked: {verdict}")
    return EXIT_OK


def cmd_new(args: argparse.Namespace) -> int:
    try:
        pack = T.new_pack(args.name, base=args.base, author=args.author, pack_id=args.id or "")
    except T.ThemeError as exc:
        return _fail(str(exc))

    errors, warnings = T.validate_pack(pack, "new pack")
    if errors:
        return _fail("generated pack is invalid: " + "; ".join(errors))

    if args.output:
        target = Path(args.output).expanduser()
    else:
        themes_dir = Path.cwd() / "themes"
        target = (themes_dir if themes_dir.is_dir() else Path.cwd()) / f"{pack['id']}.ipmtheme.json"

    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and not args.force:
        return _fail(f"{target} already exists (use --force to overwrite)")
    target.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"{ok('created')} {target}")
    print()
    print("Next:")
    print(f"  1. edit the colours in {target.name} (everything is #rrggbb)")
    print(f"  2. python tools/ipmtheme.py validate {target}")
    print(f"  3. python tools/ipmtheme.py preview  {target}")
    print(f"  4. python tools/ipmtheme.py install  {target}")
    print()
    print(dim("  Tip: 'preview' shows a mock window in your colours with contrast warnings."))
    for message in warnings:
        print(warn(f"  warning: {message}"))
    return EXIT_OK


def cmd_install(args: argparse.Namespace) -> int:
    targets = _resolve_targets(args)
    if not targets:
        return _fail("no pack files given")

    code = EXIT_OK
    for path in targets:
        try:
            saved = T.install_pack(path, args.to)
        except T.ThemeError as exc:
            print(f"{bad('FAIL')} {path}: {exc}")
            code = EXIT_INVALID
            continue
        print(f"{ok('installed')} {saved}")
        if args.to is None:
            print(dim("  Restart the app, or use the Theme menu's 'Reload themes' entry."))
    return code


def cmd_export(args: argparse.Namespace) -> int:
    target = Path(args.output) if args.output else Path.cwd() / f"{args.theme}.ipmtheme.json"
    try:
        saved = T.export_builtin(args.theme, target)
    except T.ThemeError as exc:
        return _fail(str(exc))
    print(f"{ok('exported')} {saved}")
    print(dim("  Now edit the colours - this file is a valid pack already."))
    return EXIT_OK


def cmd_preview(args: argparse.Namespace) -> int:
    themes: list[T.Theme] = []
    if args.target:
        path = Path(args.target).expanduser()
        if path.is_file():
            try:
                themes = [T.load_pack_file(path)]
            except T.ThemeError as exc:
                return _fail(str(exc))
        else:
            theme = T.resolve(args.target)
            if theme.id.lower() != args.target.strip().lower() and theme.name.lower() != args.target.strip().lower():
                print(warn(f"  no theme matching {args.target!r} - showing {theme.name!r}"))
            themes = [theme]
    else:
        themes = list(T.load_themes())

    for index, theme in enumerate(themes):
        if index:
            print()
        print(T.ansi_preview(theme, color=None if not args.no_color else False))
        if args.contrast or args.verbose:
            print()
            for label, ratio_text, ratio, minimum, passed in T.contrast_report(theme.colors):
                mark = ok("ok  ") if passed else (warn("low ") if ratio is not None else dim("n/a "))
                print(f"    {mark} {label:<34} {ratio_text:>8}  (min {minimum:.1f}:1)")
    return EXIT_OK


def cmd_bundle(args: argparse.Namespace) -> int:
    try:
        saved = T.bundle_pack(args.file, args.output)
    except T.ThemeError as exc:
        return _fail(str(exc))
    size = saved.stat().st_size if saved.is_file() else 0
    print(f"{ok('bundled')} {saved}  ({size:,} bytes)")
    print()
    print("Share this single file - anyone can install it with:")
    print(f"  python tools/ipmtheme.py install \"{saved.name}\"")
    return EXIT_OK


def cmd_check(args: argparse.Namespace) -> int:
    """Validate against theme-pack.schema.json when 'jsonschema' is available."""
    schema_path = _HERE.parent / "theme-pack.schema.json"
    if not schema_path.is_file():
        return _fail(f"schema not found at {schema_path}")
    try:
        import jsonschema  # type: ignore
    except Exception:
        print(warn("optional dependency 'jsonschema' is not installed - skipping"))
        print(dim("  pip install jsonschema"))
        return EXIT_OK

    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    targets = _resolve_targets(args)
    if not targets:
        return _fail("no pack files given")

    code = EXIT_OK
    for path in targets:
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception as exc:
            print(f"{bad('FAIL')} {path.name}: {exc}")
            code = EXIT_INVALID
            continue
        try:
            jsonschema.validate(data, schema)
        except jsonschema.ValidationError as exc:  # type: ignore[attr-defined]
            where = "/".join(str(part) for part in exc.absolute_path) or "(root)"
            print(f"{bad('FAIL')} {path.name}: {where}: {exc.message}")
            code = EXIT_INVALID
        else:
            print(f"{ok('PASS')} {path.name}: matches theme-pack.schema.json")
    return code


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ipmtheme",
        description="Create, check, preview, install and share ISO Package Manager themes.",
        epilog="Docs: docs/THEME_FORMAT.md (how to author) and docs/SHARING.md (how to publish).",
    )
    parser.add_argument("--dir", action="store_true", help="scan only the configured theme folders (skip built-ins)")
    sub = parser.add_subparsers(dest="command", metavar="<command>")

    p_list = sub.add_parser("list", help="show every built-in theme and installed pack")
    p_list.add_argument("--json", action="store_true", help="machine-readable output")
    p_list.add_argument("-v", "--verbose", action="store_true", help="also show descriptions and paths")
    p_list.set_defaults(func=cmd_list, files=[])

    p_dir = sub.add_parser("dir", help="show which folders are scanned for packs")
    p_dir.add_argument("--app-dir", default=None, help="the application folder, if not the default")
    p_dir.set_defaults(func=cmd_dir, files=[], json=False, dir=False)

    p_val = sub.add_parser("validate", help="check one or more packs")
    p_val.add_argument("files", nargs="+", help="pack files or folders")
    p_val.add_argument("--strict", action="store_true", help="treat warnings as failures")
    p_val.add_argument("--json", action="store_true", help="also print a JSON report")
    p_val.set_defaults(func=cmd_validate)

    p_new = sub.add_parser("new", help="create a starter pack")
    p_new.add_argument("name", help='display name, e.g. "Midnight Blue"')
    p_new.add_argument("--base", default=T.FALLBACK_THEME_ID, choices=list(T.BUILTIN_ORDER), help="theme to start from")
    p_new.add_argument("--author", default="", help="your name or handle")
    p_new.add_argument("--id", default="", help="machine name (default: slug of the display name)")
    p_new.add_argument("-o", "--output", default="", help="where to write (default: themes/<id>.ipmtheme.json)")
    p_new.add_argument("--force", action="store_true", help="overwrite an existing file")
    p_new.set_defaults(func=cmd_new, files=[], json=False, dir=False)

    p_ins = sub.add_parser("install", help="copy a pack into a themes folder")
    p_ins.add_argument("files", nargs="+", help="pack files or folders")
    p_ins.add_argument("--to", default=None, help="destination folder (default: your user themes folder)")
    p_ins.set_defaults(func=cmd_install, json=False, dir=False)

    p_exp = sub.add_parser("export", help="write a built-in theme out as an editable pack")
    p_exp.add_argument("theme", help="one of: " + ", ".join(T.BUILTIN_ORDER))
    p_exp.add_argument("-o", "--output", default="", help="where to write")
    p_exp.set_defaults(func=cmd_export, files=[], json=False, dir=False)

    p_prev = sub.add_parser("preview", help="draw a mock window in a theme's colours")
    p_prev.add_argument("target", nargs="?", default="", help="theme id, name, or path to a pack (default: all)")
    p_prev.add_argument("--no-color", action="store_true", help="plain text, no escape codes")
    p_prev.add_argument("--contrast", action="store_true", help="also print the WCAG contrast table")
    p_prev.add_argument("-v", "--verbose", action="store_true", help="same as --contrast")
    p_prev.set_defaults(func=cmd_preview, files=[], json=False, dir=False)

    p_bun = sub.add_parser("bundle", help="zip a pack (+screenshot) for sharing")
    p_bun.add_argument("file", help="the pack file")
    p_bun.add_argument("-o", "--output", default=None, help="output .zip path")
    p_bun.set_defaults(func=cmd_bundle, files=[], json=False, dir=False)

    p_chk = sub.add_parser("check", help="validate against theme-pack.schema.json (needs jsonschema)")
    p_chk.add_argument("files", nargs="+")
    p_chk.set_defaults(func=cmd_check, json=False, dir=False)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    if not getattr(args, "command", None):
        parser.print_help()
        return EXIT_OK
    try:
        return int(args.func(args))
    except KeyboardInterrupt:
        print()
        return EXIT_USAGE
    except T.ThemeError as exc:
        return _fail(str(exc))


if __name__ == "__main__":
    raise SystemExit(main())
