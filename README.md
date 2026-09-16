# ISO Package Manager

A Windows desktop app (Python + Tkinter) for finding, downloading, verifying and mounting OS installation ISOs.

## Features

- **Local tab:** scans folders for ISO files, computes SHA-256, finds duplicates, mounts ISOs (Windows) and opens them in Explorer.
- **Internet tab:** has about 50 built-in sources (Ubuntu and its flavours, Debian, Fedora, Arch, Kali, Mint, openSUSE, Alpine, Rocky, AlmaLinux, the BSDs, Slackware, Tiny Core and others). They are read straight from official mirrors, and SHA-256 checksums are attached where the distro publishes them.
- **Release archives:** "Load more" goes further back in time and lists older releases, not only the latest one. You can also search for a specific version, e.g. `ubuntu 16.04`, `debian 10` or `fedora 39`.
- **Web search:** uses DuckDuckGo, SearxNG or the Google Custom Search API. If the engine returns nothing, the app falls back to the built-in sources.
- **Windows 10 / 11:** gets official, time-limited ISO links from Microsoft through [Fido](https://github.com/pbatard/Fido). Fido is downloaded at runtime and is not bundled with this app.
- **Downloads:** a download queue with pause/resume and automatic SHA-256 verification.
- **Audit Sources:** checks which built-in sources currently work.
- **UI:** themes (Default, Modern Dark, Windows XP, Graphical) and language switching.

## Requirements

- Windows 10/11 (mounting and the Windows ISO lookup use PowerShell; most other features also run on Linux/macOS)
- Python 3.10+ with Tkinter

```bash
pip install -r requirements.txt
python main.py
```

## Project structure

| File | Purpose |
|------|---------|
| `main.py` | GUI, built-in sources, downloads, audit |
| `ipm_search.py` | Web search providers and the release-archive engine |
| `ipm_http.py` | HTTP helper with retries |
| `ipm_utils.py` | Hashing, URL parsing, checksum parsing |
| `ipm_models.py` | Data classes for local and remote ISOs |
| `ipm_winops.py` | Windows ISO mounting via PowerShell |

## Optional environment variables

| Variable | Effect |
|----------|--------|
| `IPM_WIN_LANG` | Language for Windows ISOs, e.g. `Estonian` (default: English International) |
| `IPM_CUSTOM_MIRRORS` | Extra ISO directory URLs to search, separated by spaces or commas |
| `IPM_MAX_ARCHIVE_VERSIONS` | Maximum number of versions per archive search |

## Notes

- Microsoft no longer distributes Windows 7, 8.1 or XP ISOs. For those, the app only accepts your own licensed ISO (Local tab) or a link from a Visual Studio subscription or Volume Licensing (Custom Source). It does not search for unofficial copies.
- Settings are stored in `~/.ipm_settings.json` and are never written to the project folder.
