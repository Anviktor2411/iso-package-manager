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

- Available sources: `Windows 11`, `Windows 11 Enterprise LTSC`, `Windows 11 IoT Enterprise LTSC`, `Windows 10`, `Windows 10 Enterprise LTSC`, `Windows 10 IoT Enterprise LTSC`, `Windows 8.1`, `Windows 8`, `Windows 7`, `Windows Vista`, `Windows XP`, and `Windows (all versions)`.
- The LTSC (long-term servicing channel) editions are separate sources. A free-text search such as `windows 11 ltsc`, `win 11 ltsc` or just `ltsc` also reaches them, and `ltsc`/`ltsb` on its own lists every LTSC edition.
- Data comes from the Internet Archive catalogues (`mediatype:software` + `format:"ISO Image"`), because Microsoft no longer offers scriptable direct-ISO links for 10/11 and has retired 8.1/8/7/Vista/XP.
- Each row shows `[Win X] filename.iso [size]`, and the file size is included in the name so tiny repacks are easy to spot. LTSC rows are tagged `[Win 11 LTSC]`, `[Win 11 IoT LTSC]`, `[Win 10 LTSC]` or `[Win 10 IoT LTSC]`.
- Filtering removes cracked/activated, "lite"/"nano"/"tiny edition" and other repacks, drops files under 300 MB, and drops results that do not mention the requested release (so XP discs don't appear under Windows 8).
- LTSC media is matched through the archive item's title, because Microsoft's LTSC file names never contain the word "LTSC" (for example `X23-81951_26100.1742.240906-0331.ge_release_svc_refresh_CLIENT_ENTERPRISES_OEM_x64FRE_en-us.iso`). Language-pack ISOs stored in the same items (`CLIENT_LOF_PACKAGES_OEM.iso`) are excluded.
- Retail `Windows 11` / `Windows 10` results deliberately leave LTSC and other enterprise images out: an LTSC build is reported under its own source instead.
- **Load more** raises the number of scanned archive entries per release, so more (and older) builds appear.
- **Open Source Page**: Microsoft's official page for 10/11 (retail), the Windows 8 hub for 8/8.1, and Internet Archive search for 7/Vista/XP and all four LTSC editions (LTSC is not on Microsoft's consumer download pages).
- Typing `windows 7 iso` (and similar) in **Web Search** also pulls in these catalogues.

The archive copies are community uploads: hashes are not published by Microsoft through this source, so verify a download against Microsoft's official SHA-256 list, and keep in mind that installation still needs a valid licence key.

### Microsoft Windows Server

Pick **Category: Windows Server** to list Windows Server install media, or reach the same releases through **Category: Windows** / **All**.

- Available sources: `Windows Server 2025`, `Windows Server 2022`, `Windows Server 2019`, `Windows Server 2016`, `Windows Server 2012 R2`, `Windows Server 2012`, `Windows Server 2008 R2`, and `Windows Server (all versions)` — listed newest first, with `2012 R2` before `2012`.
- A bare `windows server`, `win server` or `windows srv` query names the product line but no version, and expands to every Server release.
- Rows are tagged `[Srv 2025]`, `[Srv 2022]`, `[Srv 2019]`, `[Srv 2016]`, `[Srv 2012 R2]`, `[Srv 2012]` or `[Srv 2008 R2]`, and follow the same `[tag] filename.iso [size]` format as the client sources.
- Current releases (2016 and newer) are served by Microsoft's Evaluation Center media and the Internet Archive; retired releases (2012 R2 and older, back to 2008 R2) only exist as community archive copies, so 2008 R2 typically returns evaluation kits such as `7601.17514.101119-1850_x64fre_server_en-us_VL-GRMSXVOL_EN_DVD.iso` rather than retail discs.
- Filtering is the client filter set plus two Server-specific guards:
  - Desktop client media is kept out of Server lists, so a Windows 7 disc sharing a catalogue item with a 2008 R2 disc cannot leak into the `Windows Server 2008 R2` results.
  - Non-OS server products are excluded: `SQL Server` / `MSSQL`, `Exchange Server`, `SharePoint`, `Lync Server`, `System Center`, `BizTalk` and `MultiPoint Server`. `Hyper-V Server` is deliberately kept, because it is a Windows Server install image.
- `Windows Server 2012` and `Windows Server 2012 R2` share the base title `Windows Server 2012`, so R2 media is reported under `Windows Server 2012 R2` and filtered out of the plain `Windows Server 2012` list.
- A few archive items use volume-licence names that never spell out the release, e.g. `HRM_SSS_X64FRE_EN-US_DV5.iso` (Server 2012 R2). These are resolved by filename hints, so the release still resolves correctly instead of showing up under the wrong Server version.
- **Open Source Page** goes to Microsoft's Evaluation Center for current releases and to the Internet Archive search for retired ones.
- Server images are useful for labs, training and testing. Install only where you are licensed and authorised, and verify the SHA-256 against Microsoft's published hash list before use.

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
