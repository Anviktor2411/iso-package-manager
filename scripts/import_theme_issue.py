#!/usr/bin/env python3
"""Turn an approved "Share a theme" GitHub issue into a theme pack in themes/.

Run by .github/workflows/import-theme.yml when a maintainer adds the
`approved` label. The issue body is untrusted: it only arrives through
environment variables, the pack is checked with the project's own validator
(tools/ipmtheme.py validate --strict), and the screenshot is downloaded,
size-checked and re-encoded to PNG with Pillow (which also strips metadata).

Environment: ISSUE_BODY, ISSUE_NUMBER, ISSUE_USER, GITHUB_TOKEN, GITHUB_OUTPUT
"""
from __future__ import annotations

import io
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEMES = ROOT / "themes"
SUBMISSIONS = ROOT / "docs" / "shop" / "submissions.json"
RESERVED = {"default", "modern-dark", "windows-xp", "graphical"}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
MAX_DOWNLOAD = 5_000_000
MAX_WIDTH = 1600
MAX_PNG = 1_500_000
IMAGE_URL = re.compile(
    r"https://(?:github\.com/user-attachments/assets/[A-Za-z0-9-]+"
    r"|(?:private-)?user-images\.githubusercontent\.com/[\w./-]+?\.(?:png|jpe?g|webp)(?:\?[\w=&.%-]*)?)"
)


def output(key: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(f"{key}<<__IPM_EOF__\n{value}\n__IPM_EOF__\n")
    print(f"{key}: {value}")


def fail(message: str) -> int:
    output("ok", "false")
    output("message", message)
    return 1


def extract_pack(body: str) -> dict:
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", body, re.S)
    if not m:
        raise ValueError("no ```json block with the theme pack was found")
    data = json.loads(m.group(1))
    if not isinstance(data, dict):
        raise ValueError("the JSON is not an object")
    return data


def download(url: str) -> bytes:
    headers = {"User-Agent": "iso-package-manager-theme-import"}
    token = os.environ.get("GITHUB_TOKEN")
    if token and url.startswith("https://github.com/"):
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as resp:
        data = resp.read(MAX_DOWNLOAD + 1)
    if len(data) > MAX_DOWNLOAD:
        raise ValueError("larger than 5 MB")
    return data


def save_png(data: bytes, target: Path) -> None:
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    img.load()
    if img.width * img.height > 40_000_000:
        raise ValueError("too many pixels")
    img = img.convert("RGB")
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)))
    for colors in (None, 256):
        out = img if colors is None else img.quantize(colors=colors)
        out.save(target, "PNG", optimize=True)
        if target.stat().st_size <= MAX_PNG:
            return
    raise ValueError("still larger than 1.5 MB after shrinking")


def main() -> int:
    body = os.environ.get("ISSUE_BODY", "")
    number = int(os.environ.get("ISSUE_NUMBER", "0") or 0)
    user = os.environ.get("ISSUE_USER", "").strip()
    if not number or not re.fullmatch(r"[A-Za-z0-9-]{1,39}", user):
        return fail("missing issue number or user")

    try:
        pack = extract_pack(body)
    except Exception as exc:
        return fail(f"could not read the theme JSON: {exc}")

    pack_id = str(pack.get("id", "")).strip().lower()
    if not ID_RE.match(pack_id) or pack_id in RESERVED:
        return fail(f'"id" {pack_id!r} is not allowed (lowercase letters, digits, . _ - and not a built-in name)')

    submissions = {}
    if SUBMISSIONS.exists():
        submissions = json.loads(SUBMISSIONS.read_text(encoding="utf-8"))
    target = THEMES / f"{pack_id}.ipmtheme.json"
    owner = submissions.get(pack_id, {}).get("issue")
    if target.exists() and owner != number:
        return fail(f'a theme with id "{pack_id}" already exists - please choose another id')
    name = str(pack.get("name", "")).strip().lower()
    for other in THEMES.glob("*.ipmtheme.json"):
        if other == target:
            continue
        try:
            if str(json.loads(other.read_text(encoding="utf-8")).get("name", "")).strip().lower() == name:
                return fail(f'a theme called "{pack.get("name")}" already exists - please choose another name')
        except Exception:
            continue

    # Only a screenshot that we download and re-encode ourselves is kept.
    pack["id"] = pack_id
    pack["$schema"] = "../theme-pack.schema.json"
    pack.pop("screenshot", None)
    homepage = pack.get("homepage")
    if homepage is not None and not (isinstance(homepage, str) and re.match(r"^https?://[^\s<>\"']{3,200}$", homepage)):
        pack.pop("homepage", None)

    notes = []
    shot_path = THEMES / f"{pack_id}.png"
    urls = list(dict.fromkeys(IMAGE_URL.findall(body)))
    if urls:
        try:
            save_png(download(urls[0]), shot_path)
            pack["screenshot"] = shot_path.name
        except Exception as exc:
            notes.append(f"screenshot skipped ({exc})")
        if len(urls) > 1:
            notes.append("only the first screenshot is used")
    elif shot_path.exists() and owner == number:
        pack["screenshot"] = shot_path.name

    order = ["$schema", "schema_version", "id", "name", "author", "version", "description",
             "license", "homepage", "base", "font_family", "screenshot", "min_app_version", "colors", "style"]
    ordered = {k: pack[k] for k in order if k in pack}
    ordered.update({k: v for k, v in pack.items() if k not in ordered})
    target.write_text(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    check = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "ipmtheme.py"), "validate", str(target), "--strict"],
        capture_output=True, text=True, env={**os.environ, "NO_COLOR": "1"},
    )
    if check.returncode != 0:
        target.unlink(missing_ok=True)
        if "screenshot" in pack and owner != number:
            shot_path.unlink(missing_ok=True)
        report = (check.stdout + check.stderr).strip()[-1500:]
        return fail("the pack did not pass `ipmtheme.py validate --strict`:\n```\n" + report + "\n```")

    submissions[pack_id] = {"issue": number, "user": user}
    SUBMISSIONS.parent.mkdir(parents=True, exist_ok=True)
    SUBMISSIONS.write_text(json.dumps(dict(sorted(submissions.items())), indent=2) + "\n", encoding="utf-8")

    output("ok", "true")
    output("id", pack_id)
    output("name", str(ordered.get("name", pack_id)))
    msg = f"Added **{ordered.get('name')}** as `themes/{target.name}`" + (" with a screenshot." if "screenshot" in ordered else ".")
    if notes:
        msg += "\n\nNotes:\n- " + "\n- ".join(notes)
    output("message", msg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
