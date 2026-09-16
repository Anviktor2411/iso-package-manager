#!/usr/bin/env python3
"""patch_app.py - wire theme-pack support into ISO Package Manager.

This is the *only* script that touches the application folder. It rewrites two
files, always with an exact, anchored search-and-replace, so it either applies a
rule completely or not at all:

* ``main.py``    - optional ``ipm_themes`` import, theme menu and Settings
                   dropdown built from the registry, and the pack palette
                   painted over the built-in palette inside ``_apply_style``.
* ``ipm_cli.py`` - optional ``ipm_themes`` import and a new ``themes``
                   subcommand (``python ipm_cli.py themes --preview``).

Safety
------
* **Dry run is the default.** Nothing is written unless you pass ``--apply``.
* Every changed file is copied to ``<file>.ipmbak`` before it is rewritten.
* ``--revert`` restores those backups and deletes them.
* Applying twice is a no-op: a rule whose replacement is already present is
  reported as "already applied" and skipped.
* After a successful ``--apply`` the script byte-compiles both files, so a bad
  patch is caught immediately instead of at app start-up.

Usage
-----
::

    python tools/patch_app.py                       # show the diff, write nothing
    python tools/patch_app.py --check               # only report which rules match
    python tools/patch_app.py --apply               # write the changes (backup first)
    python tools/patch_app.py --apply --app-dir "D:\\apps\\IsoPackageManager"
    python tools/patch_app.py --revert              # restore the backups

The script never needs the application to be importable and never runs it.
"""

from __future__ import annotations

import argparse
import difflib
import os
import py_compile
import shutil
import sys
from pathlib import Path

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_USAGE = 3

BACKUP_SUFFIX = ".ipmbak"

# ---------------------------------------------------------------------------
# Injected code
# ---------------------------------------------------------------------------

MAIN_HELPERS = '''# ---------------------------------------------------------------------------
# Theme packs (ipm_themes.py) - optional, additive
# ---------------------------------------------------------------------------
# When ipm_themes.py sits next to this file, ISO Package Manager also loads
# themes that users install themselves (.ipmtheme.json files). If the module is
# missing, the four built-in themes below keep working exactly as before.
try:
    import ipm_themes as _ipm_themes
except Exception:  # pragma: no cover - theme packs are optional
    _ipm_themes = None


def _ipm_theme_menu_entries() -> list:
    """Menu labels: the built-ins, then a separator, then installed packs."""
    builtins = ["Default", "Modern Dark", "Windows XP", "Graphical"]
    if _ipm_themes is None:
        return builtins
    try:
        packs = [t.name for t in _ipm_themes.get_registry().packs()]
    except Exception:
        packs = []
    if not packs:
        return builtins
    return builtins + [None] + packs


def _ipm_theme_labels() -> list:
    """The same labels without the separator (for the Settings combobox)."""
    return [label for label in _ipm_theme_menu_entries() if label]


def _ipm_pack_kwargs(theme: str):
    """Flat palette/style dict for an installed pack, else ``None``.

    Returns ``None`` for the built-in themes so the hand-written palettes in
    ``_apply_style`` stay the single source of truth for them.
    """
    if _ipm_themes is None or not theme:
        return None
    try:
        found = _ipm_themes.get_registry().get(theme)
        if found is None or found.is_builtin:
            return None
        return found.style_kwargs()
    except Exception:
        return None


'''

MAIN_MENU_OLD = '''        theme_menu = tk.Menu(menubar, tearoff=0)
        for label in ("Default", "Modern Dark", "Windows XP", "Graphical"):
            theme_menu.add_radiobutton(
                label=label,
                value=label,
                variable=self._theme_var,
                command=lambda v=label: self._set_theme(v),
            )
'''

MAIN_MENU_NEW = '''        theme_menu = tk.Menu(menubar, tearoff=0)
        for label in _ipm_theme_menu_entries():
            if label is None:
                theme_menu.add_separator()
                continue
            theme_menu.add_radiobutton(
                label=label,
                value=label,
                variable=self._theme_var,
                command=lambda v=label: self._set_theme(v),
            )
'''

MAIN_COMBO_OLD = '''            values=["Default", "Modern Dark", "Windows XP", "Graphical"],
'''

MAIN_COMBO_NEW = '''            values=_ipm_theme_labels(),
'''

MAIN_PALETTE_OLD = '''            default_font = (font_family, 10)
'''

MAIN_PALETTE_NEW = '''            # -- theme packs (ipm_themes) ---------------------------------
            # A user-installed pack paints with its own palette. Anything the
            # pack leaves unset keeps the value from the base theme above, so a
            # one-colour pack still behaves. ``_pack`` is None for built-ins.
            _pack = _ipm_pack_kwargs(theme)
            if _pack:
                font_family = _pack.get("font_family") or font_family
                bg = _pack["bg"]
                panel = _pack["panel"]
                text = _pack["text"]
                muted = _pack["muted"]
                accent = _pack["accent"]
                accent_active = _pack["accent_active"]
                danger = _pack["danger"]
                danger_active = _pack["danger_active"]
                border = _pack["border"]
                selection = _pack["selection"]
                tree_bg = _pack.get("tree_bg") or panel
                tree_heading_bg = _pack.get("tree_heading_bg") or bg
                tab_bg = _pack.get("tab_bg") or panel
                tab_selected_bg = _pack.get("tab_selected_bg") or bg
            # -------------------------------------------------------------

            default_font = (font_family, 10)
'''

CLI_IMPORT_OLD = '''from ipm_windows import WINDOWS_SOURCES, is_windows_source, windows_iso_search
'''

CLI_IMPORT_NEW = '''from ipm_windows import WINDOWS_SOURCES, is_windows_source, windows_iso_search

try:  # optional: theme packs are additive, the terminal edition works without them
    import ipm_themes
except Exception:  # pragma: no cover
    ipm_themes = None
'''

CLI_DOC_OLD = '''    python ipm_cli.py url debian
'''

CLI_DOC_NEW = '''    python ipm_cli.py url debian
    python ipm_cli.py themes
    python ipm_cli.py themes --preview
'''

CLI_FUNC_OLD = '''# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
'''

CLI_FUNC_NEW = '''def cmd_themes(args: argparse.Namespace) -> int:
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
'''

CLI_PARSER_OLD = '''    p_list = sub.add_parser("list", help="list known sources")
    p_list.add_argument("what", nargs="?", default="all", help="all | archive | windows | linux")
    p_list.set_defaults(func=cmd_list)

    return parser
'''

CLI_PARSER_NEW = '''    p_list = sub.add_parser("list", help="list known sources")
    p_list.add_argument("what", nargs="?", default="all", help="all | archive | windows | linux")
    p_list.set_defaults(func=cmd_list)

    p_themes = sub.add_parser("themes", help="list built-in themes and installed theme packs")
    p_themes.add_argument("name", nargs="?", default="", help="show one theme in detail (id or name)")
    p_themes.add_argument("--preview", action="store_true", help="draw the theme as a colour preview in the terminal")
    p_themes.set_defaults(func=cmd_themes)

    return parser
'''

CLI_GUARD_OLD = '''    if args.command != "list" and not (getattr(args, "query", "") or getattr(args, "source", "")):
'''

CLI_GUARD_NEW = '''    if args.command not in ("list", "themes") and not (getattr(args, "query", "") or getattr(args, "source", "")):
'''

# ---------------------------------------------------------------------------
# Patch rules
# ---------------------------------------------------------------------------
# (file, label, marker, anchor, replacement)
#
# ``marker`` is a snippet that only exists once the rule has been applied. It is
# what makes a second run a no-op - some anchors (a plain function signature, a
# line of the palette block) survive in the replacement text themselves.
# ---------------------------------------------------------------------------

RULES: list[tuple[str, str, str, str, str]] = [
    (
        "main.py",
        "optional ipm_themes import + theme-pack helpers",
        "import ipm_themes as _ipm_themes",
        "def can_open_in_app_webview() -> bool:",
        MAIN_HELPERS + "def can_open_in_app_webview() -> bool:",
    ),
    (
        "main.py",
        "theme menu lists installed packs after a separator",
        "for label in _ipm_theme_menu_entries():",
        MAIN_MENU_OLD,
        MAIN_MENU_NEW,
    ),
    (
        "main.py",
        "Settings theme dropdown lists installed packs",
        "values=_ipm_theme_labels(),",
        MAIN_COMBO_OLD,
        MAIN_COMBO_NEW,
    ),
    (
        "main.py",
        "paint a pack palette over the built-in palette",
        "_pack = _ipm_pack_kwargs(theme)",
        MAIN_PALETTE_OLD,
        MAIN_PALETTE_NEW,
    ),
    (
        "ipm_cli.py",
        "optional ipm_themes import",
        "    import ipm_themes\n",
        CLI_IMPORT_OLD,
        CLI_IMPORT_NEW,
    ),
    (
        "ipm_cli.py",
        "document the new themes command",
        "python ipm_cli.py themes",
        CLI_DOC_OLD,
        CLI_DOC_NEW,
    ),
    (
        "ipm_cli.py",
        "add cmd_themes",
        "def cmd_themes(args: argparse.Namespace) -> int:",
        CLI_FUNC_OLD,
        CLI_FUNC_NEW,
    ),
    (
        "ipm_cli.py",
        "register the themes subcommand",
        'sub.add_parser("themes", help=',
        CLI_PARSER_OLD,
        CLI_PARSER_NEW,
    ),
    (
        "ipm_cli.py",
        "the themes command needs no search query",
        'args.command not in ("list", "themes")',
        CLI_GUARD_OLD,
        CLI_GUARD_NEW,
    ),
]


# ---------------------------------------------------------------------------
# Locating the application
# ---------------------------------------------------------------------------

def guess_app_dir(explicit: str | None) -> Path | None:
    """Find the folder holding main.py: --app-dir, $IPM_APP_DIR, then siblings."""
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    env = os.environ.get("IPM_APP_DIR")
    if env:
        candidates.append(Path(env).expanduser())

    here = Path(__file__).resolve().parent.parent
    desktop = here.parent
    for name in sorted(desktop.glob("IsoPackageManager*")):
        if name.is_dir():
            candidates.append(name)

    for candidate in candidates:
        target = candidate / "main.py"
        if target.is_file():
            return candidate.resolve()
    return None


# ---------------------------------------------------------------------------
# Applying rules
# ---------------------------------------------------------------------------

def apply_rules(app_dir: Path, *, dry_run: bool, check_only: bool) -> int:
    plan: list[tuple[Path, list[tuple[str, str]]]] = []
    problems: list[str] = []

    for filename in ("main.py", "ipm_cli.py"):
        target = app_dir / filename
        if not target.is_file():
            problems.append(f"{target}: not found")
            continue
        text = target.read_text(encoding="utf-8")
        changes: list[tuple[str, str]] = []
        for rule_file, label, marker, anchor, replacement in RULES:
            if rule_file != filename:
                continue
            if marker in text:
                # The rule already ran on this file; applying it again would
                # duplicate the injected block.
                print(f"  [skip] {filename}: already applied - {label}")
                continue
            count = text.count(anchor)
            if count == 0:
                problems.append(f"{filename}: anchor not found for rule {label!r}")
                continue
            if count > 1:
                problems.append(f"{filename}: anchor is ambiguous ({count} matches) for rule {label!r}")
                continue
            text = text.replace(anchor, replacement, 1)
            changes.append((label, anchor))
            print(f"  [ok]   {filename}: {label}")
        if changes:
            plan.append((target, changes))
            if not dry_run and not check_only:
                backup = target.with_name(target.name + BACKUP_SUFFIX)
                if not backup.exists():
                    shutil.copyfile(target, backup)
                    print(f"         backup -> {backup.name}")
                target.write_text(text, encoding="utf-8")
                print(f"         wrote  {target}")

    if check_only and plan:
        print()
        print("Run again with --apply to write these changes.")

    for problem in problems:
        print(f"  [FAIL] {problem}")

    return EXIT_ERROR if problems else EXIT_OK


def show_diffs(app_dir: Path, rules_only: bool = True) -> None:
    for filename in ("main.py", "ipm_cli.py"):
        target = app_dir / filename
        if not target.is_file():
            continue
        original = target.read_text(encoding="utf-8")
        patched = original
        for rule_file, _label, marker, anchor, replacement in RULES:
            if rule_file != filename or marker in patched:
                continue
            if patched.count(anchor) == 1:
                patched = patched.replace(anchor, replacement, 1)
        if patched == original:
            continue
        diff = difflib.unified_diff(
            original.splitlines(keepends=True),
            patched.splitlines(keepends=True),
            fromfile=str(target),
            tofile=str(target) + " (patched)",
            n=4,
        )
        sys.stdout.writelines(diff)
        print()


def revert(app_dir: Path) -> int:
    restored = 0
    for filename in ("main.py", "ipm_cli.py"):
        target = app_dir / filename
        backup = target.with_name(target.name + BACKUP_SUFFIX)
        if backup.is_file():
            shutil.copyfile(backup, target)
            backup.unlink()
            print(f"  restored {target} from {backup.name}")
            restored += 1
        else:
            print(f"  [skip] no backup for {filename}")
    if not restored:
        print("Nothing to revert: no .ipmbak files next to main.py / ipm_cli.py")
        return EXIT_ERROR
    return EXIT_OK


def compile_check(app_dir: Path) -> int:
    failures = 0
    for filename in ("main.py", "ipm_cli.py"):
        target = app_dir / filename
        if not target.is_file():
            continue
        try:
            py_compile.compile(str(target), doraise=True)
            print(f"  syntax OK: {filename}")
        except py_compile.PyCompileError as exc:
            failures += 1
            print(f"  SYNTAX ERROR in {filename}: {exc}")
    return EXIT_ERROR if failures else EXIT_OK


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="patch_app.py",
        description="Add theme-pack support to ISO Package Manager (dry run by default).",
    )
    parser.add_argument("--app-dir", default="", help="folder with main.py / ipm_cli.py (auto-detected otherwise)")
    parser.add_argument("--apply", action="store_true", help="write the changes (creates .ipmbak backups first)")
    parser.add_argument("--check", action="store_true", help="report which rules match, write nothing")
    parser.add_argument("--diff", action="store_true", help="print a unified diff of what would change")
    parser.add_argument("--revert", action="store_true", help="restore main.py / ipm_cli.py from the .ipmbak backups")
    args = parser.parse_args(argv)

    app_dir = guess_app_dir(args.app_dir or None)
    if app_dir is None:
        print("Could not find the application folder (main.py). Pass --app-dir \"C:\\path\\to\\IsoPackageManager\".")
        return EXIT_USAGE
    print(f"Application folder: {app_dir}")
    print()

    if args.revert:
        return revert(app_dir)

    if args.diff:
        show_diffs(app_dir)
        if not args.apply:
            print("Dry run only - nothing was written. Re-run with --apply to patch.")
            return EXIT_OK

    status = apply_rules(app_dir, dry_run=not args.apply, check_only=args.check)

    if args.apply and status == EXIT_OK:
        print()
        print("Verifying syntax with py_compile:")
        status = compile_check(app_dir)

    if not args.apply:
        print()
        print("Dry run: nothing was written. Re-run with --apply to patch, --diff to see the code.")
    return status


if __name__ == "__main__":
    raise SystemExit(main())