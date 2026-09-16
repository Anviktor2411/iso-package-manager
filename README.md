# ISO Package Manager

A simple GUI app for finding, managing, and downloading `.iso` files.

## Features

- **Local** tab
  - Scan folders for `.iso` files
  - Filter by distro and search by name
  - Best-effort filename metadata parsing (distro / version / arch) shown in the list
  - Find duplicates by SHA-256
  - Copy path, extract, and mount + open / eject (Windows, Linux, macOS)
- **Internet** tab
  - Browse curated sources and list available ISO downloads
  - **Windows** category: Microsoft Windows 11, 10, 8.1, 8, 7, Vista and XP install media (from the Internet Archive catalogues)
  - Download queue with per-file job list + progress
  - Pause / resume per download job
  - Optional auto-verify (SHA-256) when a checksum is known
  - Open official source pages
  - Multi-select ISOs in the list and download multiple files in one operation
  - Web search for direct `.iso` links (best-effort)
    - Deterministic-first option (try known mirrors/archives first)
    - Archive level control
    - Provider profiles (save/apply search provider settings)
    - Search history + favorites (right-click in the Web Search box)
  - Change how many web results are shown at a time (page size)
  - **Load more**
    - First reveals more already-fetched rows
    - Then (when all fetched items are already shown) fetches older/archived versions from official archives
- **Settings** tab
  - Persist theme, language, startup tab, scan folders, provider settings, and other options
- **Logs** tab
  - In-app log viewer for errors and status updates
- **Themes**
  - Switch between `Default`, `Modern Dark`, `Windows XP`, and `Graphical` from the **Theme** menu
  - **Theme packs** - drop any `*.ipmtheme.json` file into a `themes` folder and it shows up
    in the same menu, after a separator. No rebuild, no code: five packs ship with the
    download (Catppuccin Mocha, Dracula, Gruvbox Dark, Nord, Solarized Light) and a fresh
    `.pyz` already carries them *inside* the archive, so even the single downloaded file
    has themes to pick from
  - Packs are looked for in `IPM_THEMES_DIR`, then the `themes` folder next to the app,
    then `~/.ipm/themes`, then `themes/` inside the running `.pyz` / PyInstaller bundle -
    the first folder that has a given id wins, so your own copy always overrides the packed-in one
  - Command line: `ipm_cli.py themes [--preview]`, and for authors
    `python tools/ipmtheme.py list | validate | new | install | preview | bundle`
  - Visual editor: `python tools/theme_editor.py` (live preview, WCAG contrast checks, presets)
  - Docs: [`docs/THEME_FORMAT.md`](docs/THEME_FORMAT.md) (every field),
    [`docs/THEME_EDITOR.md`](docs/THEME_EDITOR.md) (the editor),
    [`docs/SHARING.md`](docs/SHARING.md) (publishing a pack),
    [`docs/THEME_PACKS.md`](docs/THEME_PACKS.md) (overview of the theme system)
- **Languages**
  - Switch UI language from the **Language** menu (English, German, Spanish, French, Russian, Portuguese, Chinese)

See also: [Search Guide](SEARCH_GUIDE.md)

## Requirements

All platforms:

- Python 3.10 or newer
- Tkinter (included with the official installers on Windows/macOS; on Linux it is a separate distro package)

Linux extras (used by **Mount + Open** / **Eject ISO**; the app degrades gracefully without them):

- `udisks2` — provides `udisksctl`, which mounts loop devices without root
- `xdg-utils` — provides `xdg-open`, used to reveal a folder in your file manager
- `p7zip-full` — provides the `7z` binary used by **Extract**

```bash
sudo apt install python3-tk udisks2 xdg-utils p7zip-full     # Debian/Ubuntu/Mint
sudo dnf install python3-tkinter udisks2 xdg-utils p7zip     # Fedora
sudo pacman -S tk udisks2 xdg-utils p7zip                    # Arch/Manjaro
sudo zypper install python3-tk udisks2 xdg-utils p7zip       # openSUSE
```

Optional dependencies (from `requirements.txt`):

- `pywebview` (in-app browser window for “Open Source Page”)
- `certifi` (improves SSL certificate validation for some HTTPS downloads/searches on certain systems)

## Setup (recommended: virtual environment)

On many Linux distros, system Python is **externally managed** (PEP 668), so installing with `pip` globally is blocked. Use a virtual environment.

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -U pip
python -m pip install -r requirements.txt
```

If you already have a `.venv` but it behaves strangely, delete it and recreate it:

```bash
rm -rf .venv
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
```

## Run

```bash
python3 ipm_launcher.py
```

The launcher asks whether to start the **UI** or the **Terminal** interface. Passing
any argument skips the question:

```bash
python3 ipm_launcher.py --gui                       # UI, no question
python3 ipm_launcher.py --cli search ubuntu -n 5    # Terminal, one shot
python3 ipm_launcher.py --version
```

You can still start the Tk window directly with `python3 main.py`.

If you are using a venv:

```bash
. .venv/bin/activate
python ipm_launcher.py
```

## Mounting an ISO

**Mount + Open** attaches the selected image and reveals it in your file manager;
**Eject ISO** detaches it again. Both report the backend they used in the status bar.

| Platform | Backend | Notes |
| --- | --- | --- |
| Windows | PowerShell `Mount-DiskImage` / `Dismount-DiskImage` | Drive letter is resolved automatically. |
| Linux | `udisksctl loop-setup` + `loop-mount` / `loop-delete` | No root needed; requires `udisks2` and a running desktop polkit agent. |
| Linux (fallback) | `mount -o loop,ro` + `umount` + `udisksctl loop-delete` | Used when `udisksctl` is missing; needs root or an `/etc/fstab` entry. |
| macOS | `hdiutil attach` / `hdiutil detach` | Mount point is read from `/Volumes/...`. |

On Linux and macOS the app detaches any image *it* attached when it exits, so no
loop device or volume is left behind. Images you mounted yourself are never touched.

If no mount backend is available, **Mount + Open** falls back to opening the `.iso`
with the default desktop application, and **Eject ISO** tells you to unmount it with
your OS tools instead of failing silently.

**Extract** uses the 7-Zip CLI (`7z`, `7zz`, `7za`, `7zr` on Linux/macOS; `7z.exe`,
`7za.exe`, `7zr.exe` on Windows) and works identically on all three platforms.

## Build a standalone executable

Windows:

```bat
build_exe.bat                 REM -> "dist\ISO Package Manager.exe"
```

### Linux

Two different Linux executables can be produced:

| Output | What it is | Can be built on |
| --- | --- | --- |
| `dist/iso-package-manager-<version>.pyz` | single-file Python zipapp with a `#!/usr/bin/env python3` shebang; needs `python3` + `tkinter` on the target | any OS, including Windows |
| `dist/iso-package-manager` | native ELF onefile binary, no Python on the target at all | Linux only (PyInstaller cannot cross-compile) |

**Portable `.pyz` — buildable from any machine, including Windows:**

```bash
python build_pyz.py                                # -> dist/iso-package-manager-0.9.pyz
chmod +x dist/iso-package-manager-0.9.pyz
./dist/iso-package-manager-0.9.pyz                 # asks: UI or Terminal
./dist/iso-package-manager-0.9.pyz --cli search ubuntu -n 5
./dist/iso-package-manager-0.9.pyz --gui
```

On Windows the same archive runs as `python dist\iso-package-manager-0.9.pyz`.

**Native ELF — run this on Linux:**

```bash
chmod +x build_linux.sh
./build_linux.sh              # -> dist/iso-package-manager
./build_linux.sh pyz          # -> the portable .pyz only (no compiler needed)
./build_linux.sh all          # pyz + native binary (+ .deb when dpkg-deb exists)
./build_linux.sh install      # build, then install to ~/.local/bin + a .desktop entry
./build_linux.sh deb          # build, then package dist/iso-package-manager_*.deb
./build_linux.sh clean        # remove build/ and dist/
```

Every target exits non-zero when something goes wrong, so `./build_linux.sh build || echo failed`
is safe in a script. `dist/iso-package-manager` is smoke-tested with `--version` before the
script reports success.

**No Linux machine at hand?** Either of these produces the native binary for you:

```bash
./build_linux_docker.sh all   # needs Docker; runs the whole build in ubuntu:22.04
```

or push to GitHub: `.github/workflows/build-linux.yml` builds the `.pyz`, the native
binary and a `.deb` on Ubuntu 22.04 (glibc 2.35) and 24.04 and uploads them as
downloadable artifacts on every push, pull request or manual run. Take the 22.04
("glibc-2.35") artifact for maximum compatibility — it also runs on Debian 12+, Mint,
Pop!_OS and current Fedora; the 24.04 binary is x86-64-v3 tuned and wants a recent CPU.

macOS can run `build_linux.sh` too (PyInstaller emits a Mach-O binary in `dist/`), but
that path has not been verified on a Mac in this project.

## Notes

- **Mount + Open** / **Eject ISO** work on Windows, Linux and macOS — see [Mounting an ISO](#mounting-an-iso).
- Current version: **V0.9**.
- If `pywebview` is not installed, source pages open in your default browser.

### Archive / "older versions" settings

The app can fetch older versions from official distro archives when you use **Web Search** and click **Load more**.

Environment variables (optional):

- `IPM_MAX_ARCHIVE_ITEMS`
  - Caps how many archive ISO links can be collected per search.
  - Set to `0` or `-1` for unlimited (can be slow).
- `IPM_MAX_KALI_VERSIONS`
  - Caps how many Kali versions are scanned when searching without an explicit version.
- `IPM_MAX_MINT_VERSIONS`
  - Caps how many Linux Mint versions are scanned when searching without an explicit version.
- `IPM_MAX_ARCH_DATED_DIRS`
  - Caps how many dated directories are scanned for Arch/Artix when searching without an explicit date.

## Security / GitHub hygiene

- This repo includes a `.gitignore` to avoid committing virtual environments, caches, and downloaded ISO files.
- See `SECURITY.md` for vulnerability reporting guidance.
- If you enable Dependabot on GitHub, `.github/dependabot.yml` will check `requirements.txt` for dependency updates.

### Internet tab tips

- **Windows sources**
  - Pick **Category: Windows** and choose a release (`Windows 11`, `Windows 10`, `Windows 8.1`, `Windows 8`, `Windows 7`, `Windows Vista`, `Windows XP`) or `Windows (all versions)`.
  - **Refresh** lists genuine Microsoft install media found in the Internet Archive, with the file size next to each name.
  - Items are filtered: repacks/"lite" editions, cracked/activated builds and files under 300 MB are dropped, and results are matched to the requested release so e.g. XP discs do not show up under Windows 8.
  - **Open Source Page** goes to Microsoft's official download page for 10/11, the Windows 8 hub page for 8/8.1, and the Internet Archive search for 7/Vista/XP (Microsoft no longer offers them).
  - **Load more** widens the catalogue search for more (older) builds.
  - The archive copies are user-contributed. Verify the SHA-256 of a downloaded ISO against Microsoft's official hash list before installing, and note that installing Windows still requires a valid licence key.

- **Multi-download**
  - Select multiple rows in the ISO list (Ctrl/Shift) and click **Download**.
  - If multiple items are selected, the app will ask for a **target folder** and download all selected ISOs into it.
  - **Copy URL** copies all selected URLs (one per line).

- **Downloads (queue)**
  - Downloads are queued and shown in the **Downloads** list.
  - Select a job and use **Pause** / **Resume**.
  - **Auto-verify (SHA-256)** checks downloaded files when a checksum is available.

- **Web Search (best-effort)**
  - The **Web Search** box tries to find direct `.iso` URLs and may crawl a few top result pages.
  - You can switch **Provider** between:
    - `DuckDuckGo`
    - `SearxNG` (more “Google-like” results; requires a SearxNG instance URL)
    - `Google API` (requires a Google API key + Custom Search Engine ID)
  - If Web Search returns 0 direct ISO links, try curated **Source** listings first.
  - For `Google API`:
    - Create an API key and enable the **Custom Search API**
    - Create a **Programmable Search Engine** (CSE) and copy its `cx` ID
    - Paste both into the app (do not commit keys to GitHub)
  - This can return 0 results if search engines rate-limit/block scraping or if pages hide links behind scripts.
  - Try more specific queries like:
    - `site:releases.ubuntu.com ubuntu iso`
    - `site:cdimage.debian.org debian live iso`
    - `site:download.opensuse.org tumbleweed iso`

