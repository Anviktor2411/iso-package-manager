#!/usr/bin/env python3
"""ipm_shop - the Theme Shop inside ISO Package Manager.

Browse the community themes published at
https://anviktor2411.github.io/iso-package-manager/ and install them into the
user's own themes folder (``~/.ipm/themes``) without leaving the app.

The module is additive: the app works exactly as before when it is missing, and
everything here degrades to a clear message when there is no network.

Headless use (no Tk needed)::

    python ipm_shop.py list
    python ipm_shop.py install nord
    python ipm_shop.py install nord --to /tmp/themes
"""

from __future__ import annotations

import json
import os
import re
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import ipm_themes as T  # noqa: E402

REPO = os.environ.get("IPM_SHOP_REPO", "Anviktor2411/iso-package-manager")
BRANCH = os.environ.get("IPM_SHOP_BRANCH", "main")
BASE = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}"
INDEX_URL = os.environ.get("IPM_SHOP_INDEX", f"{BASE}/docs/shop/index.json")
PACK_BASE = os.environ.get("IPM_SHOP_PACKS", f"{BASE}/themes/")
SITE_URL = os.environ.get("IPM_SHOP_SITE", f"https://{REPO.split('/')[0].lower()}.github.io/{REPO.split('/')[1]}/")

TIMEOUT = 20.0
MAX_BYTES = 2_000_000          # a pack is a few kB; this is a sanity cap
MAX_IMAGE_BYTES = 4_000_000
FILE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}\.ipmtheme\.json$")
IMAGE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}\.(png|jpe?g|webp)$")

USER_AGENT = "iso-package-manager-theme-shop"


class ShopError(RuntimeError):
    """Anything the user should see as a message instead of a traceback."""


# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------

def _get(url: str, limit: int = MAX_BYTES, timeout: float = TIMEOUT) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read(limit + 1)
    except urllib.error.HTTPError as exc:
        raise ShopError(f"{url.rsplit('/', 1)[-1]}: HTTP {exc.code}") from exc
    except Exception as exc:  # URLError, socket timeout, TLS, ...
        raise ShopError(f"no connection to GitHub ({exc.__class__.__name__})") from exc
    if len(data) > limit:
        raise ShopError("the download is larger than expected")
    return data


def fetch_index(timeout: float = TIMEOUT) -> list[dict]:
    """The shop listing, newest first, as the website shows it."""
    try:
        payload = json.loads(_get(INDEX_URL, timeout=timeout).decode("utf-8"))
    except ShopError:
        raise
    except Exception as exc:
        raise ShopError(f"the shop index is not readable ({exc})") from exc

    themes = payload.get("themes") if isinstance(payload, dict) else None
    if not isinstance(themes, list):
        raise ShopError("the shop index has an unexpected shape")

    out: list[dict] = []
    for item in themes:
        if not isinstance(item, dict):
            continue
        file = str(item.get("file", ""))
        pack_id = str(item.get("id", ""))
        if not FILE_RE.match(file):
            continue
        entry = {
            "file": file,
            "id": pack_id or file.split(".")[0],
            "name": str(item.get("name") or pack_id)[:48],
            "author": str(item.get("author") or "")[:120],
            "version": str(item.get("version") or "")[:20],
            "base": str(item.get("base") or ""),
            "submitted_by": str(item.get("submitted_by") or "")[:39],
        }
        shot = item.get("screenshot")
        if isinstance(shot, str) and IMAGE_RE.match(shot):
            entry["screenshot"] = shot
        out.append(entry)
    return out


def fetch_pack(entry: dict, timeout: float = TIMEOUT) -> dict:
    """Download one pack and return it as a dict (not written to disk)."""
    file = str(entry.get("file", ""))
    if not FILE_RE.match(file):
        raise ShopError("that theme has an unexpected file name")
    try:
        pack = json.loads(_get(PACK_BASE + file, timeout=timeout).decode("utf-8-sig"))
    except ShopError:
        raise
    except Exception as exc:
        raise ShopError(f"{file}: not valid JSON ({exc})") from exc
    if not isinstance(pack, dict):
        raise ShopError(f"{file}: the pack is not a JSON object")
    return pack


def fetch_screenshot(entry: dict, timeout: float = TIMEOUT) -> bytes | None:
    """The theme's screenshot, or ``None`` when it has none / cannot be read."""
    shot = entry.get("screenshot")
    if not isinstance(shot, str) or not IMAGE_RE.match(shot):
        return None
    try:
        return _get(PACK_BASE + shot, limit=MAX_IMAGE_BYTES, timeout=timeout)
    except ShopError:
        return None


# ---------------------------------------------------------------------------
# Installing
# ---------------------------------------------------------------------------

def installed_ids() -> set[str]:
    """Ids of every pack the app can currently load."""
    try:
        return {theme.id for theme in T.load_themes().packs()}
    except Exception:
        return set()


def install_entry(entry: dict, dest: str | os.PathLike[str] | None = None,
                  timeout: float = TIMEOUT) -> Path:
    """Download, validate and install one shop theme. Returns the written file."""
    pack = fetch_pack(entry, timeout=timeout)
    errors, _warnings = T.validate_pack(pack, entry.get("file", "pack"))
    if errors:
        raise ShopError("the theme did not pass validation:\n  - " + "\n  - ".join(errors[:6]))

    folder = Path(dest).expanduser() if dest else T.ensure_user_theme_dir()
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{pack['id']}.ipmtheme.json"

    image = fetch_screenshot(entry, timeout=timeout)
    if image is not None:
        shot_name = f"{pack['id']}{Path(str(entry['screenshot'])).suffix}"
        try:
            (folder / shot_name).write_bytes(image)
            pack["screenshot"] = shot_name
        except Exception:
            pack.pop("screenshot", None)
    else:
        pack.pop("screenshot", None)

    target.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    try:
        T.load_pack_file(target)          # final read-back check
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise ShopError(f"the installed file could not be read back: {exc}") from exc
    return target


def remove_pack(pack_id: str) -> bool:
    """Delete a pack from the *user* folder only. True when something was removed."""
    folder = T.user_theme_dir()
    removed = False
    for path in folder.glob(f"{pack_id}.ipmtheme.*"):
        try:
            path.unlink()
            removed = True
        except Exception:
            pass
    for suffix in (".png", ".jpg", ".jpeg", ".webp"):
        shot = folder / f"{pack_id}{suffix}"
        if shot.is_file():
            try:
                shot.unlink()
            except Exception:
                pass
    return removed


# ---------------------------------------------------------------------------
# The window
# ---------------------------------------------------------------------------

def open_shop(parent=None, on_installed=None):
    """Open the Theme Shop window. ``on_installed(theme_name)`` runs after Apply."""
    try:
        import tkinter as tk
        from tkinter import messagebox, ttk
    except Exception as exc:  # pragma: no cover - needs Tk
        raise ShopError(f"this needs Tkinter, which is missing here ({exc})") from exc

    win = tk.Toplevel(parent) if parent is not None else tk.Tk()
    win.title("Theme Shop")
    win.geometry("900x560")
    win.minsize(760, 460)

    state: dict = {"entries": [], "filtered": [], "packs": {}, "busy": False}

    bar = ttk.Frame(win, padding=(10, 10, 10, 6))
    bar.pack(fill="x")
    ttk.Label(bar, text="Search:").pack(side="left")
    query = tk.StringVar()
    search = ttk.Entry(bar, textvariable=query, width=28)
    search.pack(side="left", padx=(6, 12))
    refresh_btn = ttk.Button(bar, text="Refresh")
    refresh_btn.pack(side="left")
    ttk.Button(bar, text="Open themes folder",
               command=lambda: _open_folder(T.ensure_user_theme_dir())).pack(side="left", padx=6)
    ttk.Button(bar, text="Open the website", command=lambda: _open_url(SITE_URL)).pack(side="left")

    body = ttk.Frame(win, padding=(10, 0, 10, 10))
    body.pack(fill="both", expand=True)
    body.columnconfigure(0, weight=3)
    body.columnconfigure(1, weight=2)
    body.rowconfigure(0, weight=1)

    columns = ("name", "author", "base", "state")
    tree = ttk.Treeview(body, columns=columns, show="headings", selectmode="browse")
    for key, title, width in (("name", "Theme", 200), ("author", "Author", 190),
                              ("base", "Base", 110), ("state", "Status", 90)):
        tree.heading(key, text=title)
        tree.column(key, width=width, anchor="w", stretch=(key in ("name", "author")))
    tree.grid(row=0, column=0, sticky="nsew")
    scroll = ttk.Scrollbar(body, orient="vertical", command=tree.yview)
    scroll.grid(row=0, column=0, sticky="nse")
    tree.configure(yscrollcommand=scroll.set)

    side = ttk.Frame(body, padding=(12, 0, 0, 0))
    side.grid(row=0, column=1, sticky="nsew")
    title_lbl = ttk.Label(side, text="Select a theme", font=("", 11, "bold"))
    title_lbl.pack(anchor="w")
    meta_lbl = ttk.Label(side, text="", foreground="#888888")
    meta_lbl.pack(anchor="w", pady=(2, 6))
    desc_lbl = ttk.Label(side, text="", wraplength=320, justify="left")
    desc_lbl.pack(anchor="w")
    preview = tk.Canvas(side, height=150, highlightthickness=1, highlightbackground="#888888")
    preview.pack(fill="x", pady=10)

    buttons = ttk.Frame(side)
    buttons.pack(anchor="w", pady=(4, 0))
    install_btn = ttk.Button(buttons, text="Install")
    install_btn.pack(side="left")
    apply_btn = ttk.Button(buttons, text="Install and use")
    apply_btn.pack(side="left", padx=6)
    remove_btn = ttk.Button(buttons, text="Remove")
    remove_btn.pack(side="left")

    status = ttk.Label(win, text="", anchor="w", padding=(12, 4))
    status.pack(fill="x", side="bottom")

    def say(text: str) -> None:
        status.configure(text=text)

    def selected() -> dict | None:
        rows = tree.selection()
        if not rows:
            return None
        index = int(rows[0])
        return state["filtered"][index] if 0 <= index < len(state["filtered"]) else None

    def draw_preview(pack: dict | None) -> None:
        preview.delete("all")
        if not pack:
            return
        colors = dict(pack.get("colors") or {})
        base = T.BUILTIN_THEMES.get(pack.get("base") or T.FALLBACK_THEME_ID)
        if base is not None:
            merged = dict(base.colors)
            merged.update({k: v for k, v in colors.items() if v})
            colors = merged
        bg = colors.get("bg", "#202020")
        panel = colors.get("panel", bg)
        text = colors.get("text", "#ffffff")
        accent = colors.get("accent", "#3b82f6")
        muted = colors.get("muted", text)
        border = colors.get("border", panel)
        width = max(preview.winfo_width(), 300)
        preview.configure(background=bg)
        preview.create_rectangle(8, 8, width - 8, 34, fill=panel, outline=border)
        preview.create_text(18, 21, anchor="w", text=pack.get("name", ""), fill=text)
        preview.create_rectangle(8, 42, width - 8, 108, fill=panel, outline=border)
        for row in range(3):
            y = 54 + row * 18
            preview.create_rectangle(20, y, 20 + 150 - row * 22, y + 8, fill=muted, outline=muted)
        preview.create_rectangle(width - 118, 118, width - 20, 140, fill=accent, outline=accent)
        preview.create_text(width - 69, 129, text="Download", fill=colors.get("accent_text", "#ffffff"))
        swatch_x = 20
        for key in ("bg", "panel", "text", "accent", "danger", "selection"):
            value = colors.get(key)
            if not value:
                continue
            preview.create_rectangle(swatch_x, 118, swatch_x + 20, 140, fill=value, outline=border)
            swatch_x += 24

    def show(entry: dict | None) -> None:
        if not entry:
            title_lbl.configure(text="Select a theme")
            meta_lbl.configure(text="")
            desc_lbl.configure(text="")
            draw_preview(None)
            for button in (install_btn, apply_btn, remove_btn):
                button.state(["disabled"])
            return
        here = installed_ids()
        title_lbl.configure(text=entry["name"])
        bits = [entry["author"] or "unknown author"]
        if entry.get("version"):
            bits.append("v" + entry["version"])
        if entry.get("base"):
            bits.append("base: " + entry["base"])
        meta_lbl.configure(text="  ·  ".join(bits))
        pack = state["packs"].get(entry["id"])
        desc_lbl.configure(text=(pack or {}).get("description", "") if pack else "loading…")
        draw_preview(pack)
        install_btn.state(["!disabled"])
        apply_btn.state(["!disabled"])
        remove_btn.state(["!disabled"] if entry["id"] in here else ["disabled"])
        if pack is None:
            _in_thread(lambda: fetch_pack(entry),
                       lambda result: (state["packs"].__setitem__(entry["id"], result), show(entry)),
                       lambda error: say(str(error)))

    def render() -> None:
        text = query.get().strip().lower()
        here = installed_ids()
        state["filtered"] = [
            e for e in state["entries"]
            if not text or text in f"{e['name']} {e['author']} {e['id']}".lower()
        ]
        tree.delete(*tree.get_children())
        for index, entry in enumerate(state["filtered"]):
            tree.insert("", "end", iid=str(index), values=(
                entry["name"], entry["author"], entry["base"],
                "installed" if entry["id"] in here else "",
            ))
        say(f"{len(state['filtered'])} theme(s)" + ("" if not text else f" matching '{text}'"))
        show(None)

    def _in_thread(work, done, failed) -> None:
        def runner():
            try:
                result = work()
            except Exception as exc:  # ShopError and friends
                _post(lambda error=exc: failed(error))
                return
            _post(lambda value=result: done(value))

        def _post(callback):
            try:                      # the window may be gone already
                win.after(0, callback)
            except Exception:
                pass

        threading.Thread(target=runner, daemon=True).start()

    def load() -> None:
        if state["busy"]:
            return
        state["busy"] = True
        refresh_btn.state(["disabled"])
        say("Loading the shop…")

        def done(entries):
            state["busy"] = False
            refresh_btn.state(["!disabled"])
            state["entries"] = entries
            render()

        def failed(error):
            state["busy"] = False
            refresh_btn.state(["!disabled"])
            say(str(error))
            messagebox.showwarning("Theme Shop", f"Could not load the shop:\n\n{error}", parent=win)

        _in_thread(fetch_index, done, failed)

    def do_install(and_use: bool) -> None:
        entry = selected()
        if not entry:
            return
        say(f"Installing {entry['name']}…")
        for button in (install_btn, apply_btn, remove_btn):
            button.state(["disabled"])

        def done(path):
            say(f"Installed: {path}")
            try:
                T.get_registry(refresh=True)
            except Exception:
                pass
            render()
            if and_use and callable(on_installed):
                try:
                    on_installed(entry["name"])
                except Exception:
                    pass

        def failed(error):
            say(str(error))
            messagebox.showerror("Theme Shop", str(error), parent=win)
            render()

        _in_thread(lambda: install_entry(entry), done, failed)

    def do_remove() -> None:
        entry = selected()
        if not entry:
            return
        if not messagebox.askyesno("Theme Shop", f"Remove {entry['name']} from your themes folder?", parent=win):
            return
        if remove_pack(entry["id"]):
            try:
                T.get_registry(refresh=True)
            except Exception:
                pass
            say(f"Removed {entry['name']}")
        else:
            say("Nothing to remove (it may be shipped with the app)")
        render()

    refresh_btn.configure(command=load)
    install_btn.configure(command=lambda: do_install(False))
    apply_btn.configure(command=lambda: do_install(True))
    remove_btn.configure(command=do_remove)
    tree.bind("<<TreeviewSelect>>", lambda _e: show(selected()))
    tree.bind("<Double-1>", lambda _e: do_install(True))
    query.trace_add("write", lambda *_: render())
    win.bind("<Escape>", lambda _e: win.destroy())

    show(None)
    load()
    search.focus_set()
    return win


def _open_folder(path) -> None:
    path = str(path)
    try:
        if sys.platform.startswith("win"):
            os.startfile(path)  # noqa: S606 - Windows only
        elif sys.platform == "darwin":
            import subprocess
            subprocess.Popen(["open", path])
        else:
            import subprocess
            subprocess.Popen(["xdg-open", path])
    except Exception:
        pass


def _open_url(url: str) -> None:
    try:
        import webbrowser
        webbrowser.open(url, new=2)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(prog="ipm_shop", description="Theme Shop for ISO Package Manager.")
    sub = parser.add_subparsers(dest="command", metavar="<command>")
    sub.add_parser("list", help="list the themes published in the shop")
    p_install = sub.add_parser("install", help="install one theme by id")
    p_install.add_argument("theme_id")
    p_install.add_argument("--to", default=None, help="destination folder (default: your themes folder)")
    p_remove = sub.add_parser("remove", help="remove an installed theme")
    p_remove.add_argument("theme_id")
    sub.add_parser("gui", help="open the Theme Shop window")

    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    if not args.command:
        parser.print_help()
        return 0

    try:
        if args.command == "gui":
            import tkinter as tk
            root = tk.Tk()
            root.withdraw()
            window = open_shop(root)
            window.protocol("WM_DELETE_WINDOW", root.destroy)
            root.mainloop()
            return 0

        if args.command == "remove":
            print("removed" if remove_pack(args.theme_id) else "nothing to remove")
            return 0

        entries = fetch_index()
        if args.command == "list":
            here = installed_ids()
            print(f"{len(entries)} theme(s) in the shop")
            for entry in entries:
                mark = "*" if entry["id"] in here else " "
                credit = f" by {entry['author']}" if entry["author"] else ""
                print(f" {mark} {entry['id']:<20} {entry['name']}{credit}")
            print("\n * = already installed")
            return 0

        match = next((e for e in entries if e["id"] == args.theme_id), None)
        if match is None:
            print(f"no theme with id {args.theme_id!r} - run 'list' to see them", file=sys.stderr)
            return 1
        path = install_entry(match, args.to)
        print(f"installed {path}")
        return 0
    except ShopError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
