# ISO Package Manager

A simple GUI app for finding, managing, and downloading `.iso` files.

## Features

- **Local** tab
  - Scan folders for `.iso` files
  - Filter by distro and search by name
  - Best-effort filename metadata parsing (distro / version / arch) shown in the list
  - Find duplicates by SHA-256
  - Copy path, extract, and (on Windows) mount + open
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
- **Languages**
  - Switch UI language from the **Language** menu (English, German, Spanish, French, Russian, Portuguese, Chinese)

See also: [Search Guide](SEARCH_GUIDE.md)

## Requirements

- Python 3
- Tkinter (usually included with Python on Windows/macOS; on Linux you may need a distro package)

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
python3 main.py
```

If you are using a venv:

```bash
. .venv/bin/activate
python main.py
```

## Notes

- **Mount + Open** is only implemented on **Windows** in this app.
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

