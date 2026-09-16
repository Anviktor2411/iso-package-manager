#!/usr/bin/env python3
"""Build themes/index.json for the theme gallery website.

The gallery reads this one file instead of listing the folder. It is rebuilt by
CI whenever themes/ changes, so nobody edits it by hand.

    python scripts/build_theme_index.py          # write themes/index.json
    python scripts/build_theme_index.py --check  # exit 1 if it is out of date
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEMES = ROOT / "themes"
INDEX = THEMES / "index.json"
SUBMISSIONS = THEMES / "submissions.json"
SAFE_FILE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}\.(png|jpe?g|webp)$")


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def build() -> dict:
    submissions = load_json(SUBMISSIONS, {})
    entries = []
    for path in sorted(THEMES.glob("*.ipmtheme.json")):
        pack = load_json(path, None)
        if not isinstance(pack, dict) or not isinstance(pack.get("id"), str):
            print(f"skip {path.name}: not a readable pack", file=sys.stderr)
            continue
        entry = {
            "file": path.name,
            "id": pack["id"],
            "name": str(pack.get("name", pack["id"]))[:48],
            "author": str(pack.get("author", ""))[:120],
            "version": str(pack.get("version", ""))[:20],
            "base": str(pack.get("base", "")),
        }
        shot = pack.get("screenshot")
        if isinstance(shot, str) and SAFE_FILE.match(shot) and (THEMES / shot).is_file():
            entry["screenshot"] = shot
        sub = submissions.get(pack["id"])
        if isinstance(sub, dict):
            if isinstance(sub.get("issue"), int):
                entry["issue"] = sub["issue"]
            if isinstance(sub.get("user"), str) and re.fullmatch(r"[A-Za-z0-9-]{1,39}", sub["user"]):
                entry["submitted_by"] = sub["user"]
        entries.append(entry)
    entries.sort(key=lambda e: (-e.get("issue", 0), e["name"].lower()))
    return {"schema_version": 1, "themes": entries}


def main() -> int:
    wanted = build()
    text = json.dumps(wanted, indent=2, ensure_ascii=False) + "\n"
    if "--check" in sys.argv:
        current = INDEX.read_text(encoding="utf-8") if INDEX.exists() else ""
        if current != text:
            print("themes/index.json is out of date: run python scripts/build_theme_index.py")
            return 1
        print(f"themes/index.json is up to date ({len(wanted['themes'])} themes)")
        return 0
    INDEX.write_text(text, encoding="utf-8")
    print(f"wrote themes/index.json ({len(wanted['themes'])} themes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
