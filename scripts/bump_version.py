#!/usr/bin/env python3
"""Change the application version everywhere in one go.

``ipm_launcher.py`` owns the version number - the build scripts read it from
there, so the ``.exe``, the Linux binary, the ``.deb`` and the ``.pyz`` are all
named after it. A handful of other files carry a copy: two literal fallbacks
(used when the launcher is not importable) and some documentation examples.
Keeping those in sync by hand is how a release ends up shipping "0.9" files
under a "v0.10.0" tag, so do it with this script instead.

Usage
-----

    python scripts/bump_version.py --check        # are all the copies in sync?
    python scripts/bump_version.py 0.11           # bump every file to 0.11
    python scripts/bump_version.py 0.11 --dry-run # show the edits, change nothing

Run it from anywhere; paths are resolved against the repository root.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The one line that decides the version.
SOURCE_FILE = "ipm_launcher.py"
SOURCE_PATTERN = re.compile(r'^APP_VERSION\s*=\s*"([^"]+)"', re.MULTILINE)

VERSION_RE = re.compile(r"^\d+\.\d+(\.\d+)?$")


def _literal(version: str) -> str:
    return f'APP_VERSION = "{version}"'


def _edits(old: str, new: str) -> list[tuple[str, str, str, bool]]:
    """(path, find, replace, required) for every place the version is written."""
    return [
        # The source of truth.
        (SOURCE_FILE, _literal(old), _literal(new), True),
        # Fallbacks, used only when ipm_launcher cannot be imported.
        ("main.py", _literal(old), _literal(new), True),
        ("ipm_themes.py", _literal(old), _literal(new), True),
        (
            "tools/theme_editor.py",
            f"getattr(T, 'APP_VERSION', '{old}')",
            f"getattr(T, 'APP_VERSION', '{new}')",
            True,
        ),
        # Documentation and help text: the built file names.
        ("README.md", f"iso-package-manager-{old}.pyz", f"iso-package-manager-{new}.pyz", False),
        ("README.md", f"Current version: **V{old}**", f"Current version: **V{new}**", False),
        ("build_pyz.py", f"iso-package-manager-{old}.pyz", f"iso-package-manager-{new}.pyz", False),
        ("ipm_themes.py", f"iso-package-manager-{old}.pyz", f"iso-package-manager-{new}.pyz", False),
    ]


def current_version() -> str:
    text = (ROOT / SOURCE_FILE).read_text(encoding="utf-8")
    match = SOURCE_PATTERN.search(text)
    if not match:
        raise SystemExit(f"error: no APP_VERSION line found in {SOURCE_FILE}")
    return match.group(1)


def check(version: str) -> int:
    """Report any file that still carries a different version. 0 = all good."""
    problems = []
    for path, find, _replace, required in _edits(version, version):
        full = ROOT / path
        if not full.exists():
            if required:
                problems.append(f"{path}: file is missing")
            continue
        if find not in full.read_text(encoding="utf-8"):
            problems.append(f"{path}: expected to find {find!r}")

    if problems:
        print(f"Version {version} is NOT consistent:")
        for line in problems:
            print(f"  - {line}")
        print("\nRun: python scripts/bump_version.py " + version)
        return 1

    print(f"Version {version} is consistent across every file.")
    return 0


def bump(old: str, new: str, *, dry_run: bool) -> int:
    if old == new:
        print(f"Already at {new}; nothing to do.")
        return 0

    changed: dict[str, str] = {}
    missing = []

    for path, find, replace, required in _edits(old, new):
        full = ROOT / path
        if not full.exists():
            if required:
                missing.append(f"{path} is missing")
            continue

        text = changed.get(path)
        if text is None:
            text = full.read_text(encoding="utf-8")

        count = text.count(find)
        if count == 0:
            if required:
                missing.append(f"{path} has no {find!r}")
            else:
                print(f"  {path}: nothing to change for {find!r}")
            continue

        changed[path] = text.replace(find, replace)
        print(f"  {path}: {count}x {find!r} -> {replace!r}")

    if missing:
        print("\nerror: some required places were not found:")
        for line in missing:
            print(f"  - {line}")
        print("Nothing was written. Fix the files or update this script.")
        return 1

    if dry_run:
        print(f"\nDry run: {len(changed)} file(s) would change.")
        return 0

    for path, text in changed.items():
        # newline="" keeps each file's existing line endings intact.
        with (ROOT / path).open("w", encoding="utf-8", newline="") as handle:
            handle.write(text)

    print(f"\n{old} -> {new} in {len(changed)} file(s).")
    print("Next: python scripts/bump_version.py --check")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Change the app version in every file.")
    parser.add_argument("version", nargs="?", help='the new version, e.g. "0.11" or "1.0.0"')
    parser.add_argument("--check", action="store_true", help="only verify that every file agrees")
    parser.add_argument("--dry-run", action="store_true", help="print the edits without writing")
    args = parser.parse_args(argv)

    old = current_version()

    if args.check or not args.version:
        print(f"Current version: {old}")
        return check(old)

    new = args.version.strip().lstrip("vV")
    if not VERSION_RE.match(new):
        print(f'error: "{new}" does not look like a version (use 0.11 or 1.0.0)')
        return 2

    print(f"Bumping {old} -> {new}")
    return bump(old, new, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
