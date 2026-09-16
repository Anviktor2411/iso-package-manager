# Search Guide

This guide explains how to find ISO downloads using the app.

## Two ways to find ISOs

### 1) Curated Sources (recommended)

Use the **Internet** tab and pick a **Category** and **Source**, then click **Refresh List**.

- This is the most reliable way to find official ISO downloads.
- It usually provides cleaner results than web search.

### 2) Web Search (best-effort)

Use the **Web Search** box to find direct `.iso` URLs.

- Results depend on the search provider.
- Some websites hide links behind scripts.
- Some engines rate-limit/block automated access and may return few or no results.
- If Web Search returns 0 results, try **Curated Sources** first.

### Microsoft Windows

Pick **Category: Windows** to list Microsoft Windows install media.

- Available sources: `Windows 11`, `Windows 10`, `Windows 8.1`, `Windows 8`, `Windows 7`, `Windows Vista`, `Windows XP`, and `Windows (all versions)`.
- Data comes from the Internet Archive catalogues (`mediatype:software` + `format:"ISO Image"`), because Microsoft no longer offers scriptable direct-ISO links for 10/11 and has retired 8.1/8/7/Vista/XP.
- Each row shows `[Win X] filename.iso [size]`, and the file size is included in the name so tiny repacks are easy to spot.
- Filtering removes cracked/activated, "lite"/"nano"/"tiny edition" and other repacks, drops files under 300 MB, and drops results that do not mention the requested release (so XP discs don't appear under Windows 8).
- **Load more** raises the number of scanned archive entries per release, so more (and older) builds appear.
- **Open Source Page**: Microsoft's official page for 10/11, the Windows 8 hub for 8/8.1, and Internet Archive search for 7/Vista/XP.
- Typing `windows 7 iso` (and similar) in **Web Search** also pulls in these catalogues.

The archive copies are community uploads: hashes are not published by Microsoft through this source, so verify a download against Microsoft's official SHA-256 list, and keep in mind that installation still needs a valid licence key.

### Deterministic-first (recommended)

Enable **Deterministic first** to try known official archives/mirrors and custom mirrors before general web search.

This is often more reliable for:

- Older releases
- Mirrors/archives that don’t rank well in search engines

## Web Search providers

### DuckDuckGo

Good default. Can sometimes return fewer results for older/archived releases.

### SearxNG

Often provides “Google-like” results.

- Set **Provider** = `SearxNG`
- Enter your instance URL in **SearxNG URL**

### Google API

Most consistent, but requires credentials.

- Set **Provider** = `Google API`
- Provide:
  - **Google API key** (Custom Search API enabled)
  - **Google CSE ID (cx)** (Programmable Search Engine)

Do not commit keys to GitHub.

## Page size vs Load more

The Internet results table shows a limited number of rows at a time.

- **Page size** controls how many rows are shown.
- **Load more** works in two steps:
  1) If there are already more fetched items hidden by page size, it will show more rows.
  2) If you are already showing everything fetched, it will fetch older/archived versions (deeper archives) and merge them into the list.

## Archive level

**Archive level** controls how aggressively the app crawls “index pages” and archives during Web Search.

- Level `0` is fastest (shallow search)
- Higher levels may find more results, but can be slower

## Getting older versions

If you search without an explicit version/date, the app may start with newer releases first.

Tips:

- Use **Load more** repeatedly to go deeper into archives.
- Add archive hints to your query:
  - `archive`
  - `old releases`
  - `mirror`
  - `legacy`
- Add a version/date when possible:
  - Arch-style: `2023.11.01`
  - Ubuntu/Mint-style: `22.04`, `21.3`
  - Kali-style: `2024.1`

Examples:

- `arch iso archive`
- `arch 2021.01.01 iso`
- `ubuntu 20.04 iso old releases`
- `debian 11 live iso`
- `kali 2023.4 iso`
- `artix iso archive`

## Saving provider profiles

If you often switch between providers (DuckDuckGo / SearxNG / Google API), you can:

- Click **Save Profile** to store the current provider settings
- Click **Apply Profile** to quickly restore them later

## Search history & favorites

Right-click the **Web Search** box to:

- Reuse recent searches
- Mark searches as favorites
- Clear recent searches

## Avoiding “wrong distro” results

Some distro names are similar (for example, `artix` vs `arch`).

- Prefer including the full distro name in the query.
- If you still see unrelated results, try adding `site:` hints.

Examples:

- `site:artixlinux.org artix iso`
- `site:archlinux.org arch iso`

## Archive limits (advanced)

The app uses safety caps to keep archive crawling from becoming too slow.

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
