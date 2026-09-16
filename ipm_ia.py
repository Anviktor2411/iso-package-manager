"""Generic Internet Archive (archive.org) ISO discovery for the ISO Package Manager.

``ipm_windows`` covers the Microsoft desktop releases.  This module covers
everything else that is preserved on archive.org:

* macOS / Mac OS X installer images
* the BSDs - FreeBSD, OpenBSD, NetBSD, DragonFly BSD
* Linux distributions, including releases whose original mirrors are long gone
* Windows Server (the desktop editions stay in ``ipm_windows``)
* FreeDOS, Solaris, Haiku, ReactOS, Android-x86, Qubes OS
* retro / hobby / historic systems such as TempleOS, KolibriOS, MenuetOS,
  SerenityOS, Syllable, Plan 9, MINIX, OS/2, AROS, AmigaOS, MorphOS, RISC OS,
  OpenVMS, IRIX, HP-UX, AIX and BeOS
* desktop and gaming Linux such as Bazzite, CachyOS, Nobara, SteamOS, Garuda,
  EndeavourOS, KDE neon, elementary, Deepin, Endless, Solus, Clear Linux,
  MX Linux, Raspberry Pi OS, DietPi, Puppy Linux, Tiny Core and ChromeOS Flex
* security / appliance distributions such as Parrot OS, BlackArch, Pentoo,
  SystemRescue, GParted Live, Clonezilla, Rescuezilla, Devuan, antiX,
  OpenMandriva, Proxmox, TrueNAS, pfSense, OPNsense and OpenWrt
* media centre images such as Batocera, Lakka, Recalbox, RetroPie, LibreELEC

Resolution is deterministic, exactly like ``ipm_windows``:

  1. ``advancedsearch.php``   -> candidate items whose format is "ISO Image"
  2. ``/metadata/<id>``       -> the real .iso file names + byte sizes per item
  3. ``/download/<id>/<file>``-> direct download URL (serves the ISO with
     ``application/x-iso9660-image``, supports HEAD/Range, so Validate and the
     download manager work unchanged)

Notes
-----
* Internet Archive items are user-contributed.  Names that look like repacks,
  activators or "lite" builds are filtered out, and every result shows its byte
  size so a trimmed image is obvious next to the real one.  Compare hashes with
  the vendor's list whenever one is published.
* Nothing here needs an API key; the whole module is read-only HTTP.
"""

from __future__ import annotations

import json
import re
import threading
import time
import urllib.parse

from ipm_http import http_get_text
from ipm_models import RemoteIsoItem
from ipm_utils import human_bytes


# --------------------------------------------------------------------------
# Internet Archive endpoints
# --------------------------------------------------------------------------

_IA_SEARCH_URL = "https://archive.org/advancedsearch.php"
_IA_METADATA_URL = "https://archive.org/metadata/"
_IA_DOWNLOAD_URL = "https://archive.org/download/"

# A full installer image is never smaller than this.  The floor is lower than
# ipm_windows' (300 MB) because Alpine/Haiku/ReactOS images are legitimately
# small; obvious fragments and stray files are still dropped.
_MIN_ISO_BYTES = 100 * 1024 * 1024

# Catalogue rows read by the generic "any ISO" browse listing (no search term).
_GENERIC_MIN_ROWS = 25

_MB = 1024 * 1024

# Per-family overrides where the global floor would be wrong.  Old and hobby
# systems genuinely ship as floppy-sized images, so they need their own floor.
_MIN_BYTES_BY_LABEL: dict[str, int] = {
    "Alpine Linux": 80 * _MB,
    "Tails": 400 * _MB,
    "Haiku": 200 * _MB,
    "ReactOS": 60 * _MB,
    "FreeDOS": 40 * _MB,
    "Android-x86": 200 * _MB,
    # Tiny artefact systems.
    "TempleOS": 1 * _MB,
    "MenuetOS": _MB // 2,
    "KolibriOS": _MB // 2,
    "MINIX": _MB // 2,
    "RISC OS": 20 * _MB,
    "Syllable": 8 * _MB,
    "AROS": 10 * _MB,
    "BeOS": 20 * _MB,
    "AmigaOS": 40 * _MB,
    "MorphOS": 40 * _MB,
    "Tiny Core Linux": 8 * _MB,
    "DietPi": 30 * _MB,
    "OpenWrt": 20 * _MB,
    "SerenityOS": 60 * _MB,
    "Plan 9": 50 * _MB,
    "Puppy Linux": 90 * _MB,
    "GParted Live": 150 * _MB,
    "ChromeOS Flex": 300 * _MB,
}

_ITEM_WORKERS = 8
_DEFAULT_ROWS = 6
_MAX_ROWS = 30

# The pseudo-family used by the "Archive.org (any ISO)" UI source and by
# free-text queries such as "any iso".
IA_GENERIC_LABEL = "Archive.org (any ISO)"

_SHORT_TAG: dict[str, str] = {
    "macOS": "macOS",
    "FreeBSD": "FreeBSD",
    "OpenBSD": "OpenBSD",
    "NetBSD": "NetBSD",
    "DragonFly BSD": "DragonFly",
    "Linux (any ISO)": "Linux",
    "Ubuntu": "Ubuntu",
    "Debian": "Debian",
    "Fedora": "Fedora",
    "Arch Linux": "Arch",
    "Linux Mint": "Mint",
    "Kali Linux": "Kali",
    "Manjaro": "Manjaro",
    "openSUSE": "openSUSE",
    "Alpine Linux": "Alpine",
    "Gentoo": "Gentoo",
    "Rocky Linux": "Rocky",
    "AlmaLinux": "AlmaLinux",
    "CentOS": "CentOS",
    "RHEL": "RHEL",
    "Slackware": "Slackware",
    "Void Linux": "Void",
    "NixOS": "NixOS",
    "Zorin OS": "Zorin",
    "Pop!_OS": "Pop!_OS",
    "Tails": "Tails",
    "Qubes OS": "Qubes",
    "Windows Server": "Win Server",
    "FreeDOS": "FreeDOS",
    "Solaris": "Solaris",
    "Haiku": "Haiku",
    "ReactOS": "ReactOS",
    "Android-x86": "Android-x86",
    # Retro / alternative systems.
    "TempleOS": "TempleOS",
    "SerenityOS": "Serenity",
    "KolibriOS": "Kolibri",
    "MenuetOS": "Menuet",
    "Syllable": "Syllable",
    "Plan 9": "Plan 9",
    "MINIX": "MINIX",
    "OS/2": "OS/2",
    "AROS": "AROS",
    "AmigaOS": "AmigaOS",
    "MorphOS": "MorphOS",
    "RISC OS": "RISC OS",
    "OpenVMS": "OpenVMS",
    "IRIX": "IRIX",
    "HP-UX": "HP-UX",
    "IBM AIX": "AIX",
    "BeOS": "BeOS",
    # Desktop / gaming Linux.
    "Bazzite": "Bazzite",
    "CachyOS": "CachyOS",
    "Nobara": "Nobara",
    "SteamOS": "SteamOS",
    "Garuda Linux": "Garuda",
    "EndeavourOS": "Endeavour",
    "KDE neon": "KDE neon",
    "elementary OS": "elementary",
    "Deepin": "Deepin",
    "Endless OS": "Endless",
    "Solus": "Solus",
    "Clear Linux": "Clear",
    "MX Linux": "MX",
    "Raspberry Pi OS": "RPi OS",
    "DietPi": "DietPi",
    "Puppy Linux": "Puppy",
    "Tiny Core Linux": "TinyCore",
    "ChromeOS Flex": "ChromeOS Flex",
    # Security / system / appliance distributions.
    "Parrot OS": "Parrot",
    "BlackArch": "BlackArch",
    "Pentoo": "Pentoo",
    "SystemRescue": "SystemRescue",
    "GParted Live": "GParted",
    "Clonezilla": "Clonezilla",
    "Rescuezilla": "Rescuezilla",
    "Artix Linux": "Artix",
    "Devuan": "Devuan",
    "antiX": "antiX",
    "Mageia": "Mageia",
    "OpenMandriva": "OpenMandriva",
    "Proxmox": "Proxmox",
    "TrueNAS": "TrueNAS",
    "pfSense": "pfSense",
    "OPNsense": "OPNsense",
    "OpenWrt": "OpenWrt",
    # Media centre / retro gaming appliances.
    "Batocera": "Batocera",
    "Lakka": "Lakka",
    "Recalbox": "Recalbox",
    "RetroPie": "RetroPie",
    "LibreELEC": "LibreELEC",
    IA_GENERIC_LABEL: "Archive.org",
}


# --------------------------------------------------------------------------
# Families covered by this module
# --------------------------------------------------------------------------
# (label, aliases, archive.org search terms)
#
# Order matters twice:
#   * resolution walks the tuple top-down and consumes matched text, so the
#     specific families must come before the generic "Linux (any ISO)" catch-all;
#   * the Microsoft *desktop* releases are deliberately absent - ipm_windows
#     owns those, and `resolve_ia_targets("Windows 7")` must return [].
#
# Aliases must already be in "normalised" form (lower case, words separated by a
# single space, no punctuation) because they are matched against normalised
# text.  See ``_norm_text``.
IA_TARGETS: tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...] = (
    ("Windows Server", ("windows server", "win server"), ("windows server",)),
    ("macOS", ("macos", "mac os x", "mac os", "os x", "osx"), ("macos", "osx", "mac os x")),
    ("DragonFly BSD", ("dragonfly bsd", "dragonflybsd", "dragonfly"), ("dragonflybsd", "dragonfly bsd")),
    ("FreeBSD", ("freebsd", "free bsd"), ("freebsd",)),
    ("OpenBSD", ("openbsd", "open bsd"), ("openbsd",)),
    ("NetBSD", ("netbsd", "net bsd"), ("netbsd",)),
    ("Linux Mint", ("linux mint", "linuxmint", "mint"), ("linuxmint", "linux mint")),
    ("Arch Linux", ("arch linux", "archlinux", "arch"), ("archlinux", "arch linux")),
    ("Alpine Linux", ("alpine linux", "alpine"), ("alpine",)),
    ("Void Linux", ("void linux", "voidlinux"), ("voidlinux", "void linux")),
    ("Kali Linux", ("kali linux", "kali"), ("kali", "kali linux")),
    ("Ubuntu", ("ubuntu",), ("ubuntu",)),
    ("Debian", ("debian",), ("debian",)),
    ("Fedora", ("fedora",), ("fedora",)),
    ("openSUSE", ("opensuse", "open suse", "suse"), ("opensuse", "suse")),
    ("Manjaro", ("manjaro",), ("manjaro",)),
    ("Gentoo", ("gentoo",), ("gentoo",)),
    ("Rocky Linux", ("rocky linux", "rockylinux", "rocky"), ("rockylinux", "rocky linux")),
    ("AlmaLinux", ("almalinux", "alma linux"), ("almalinux",)),
    ("CentOS", ("centos",), ("centos",)),
    ("RHEL", ("rhel", "red hat enterprise linux", "redhat enterprise linux"), ("rhel", "red hat enterprise linux")),
    ("Slackware", ("slackware",), ("slackware",)),
    ("NixOS", ("nixos",), ("nixos",)),
    ("Zorin OS", ("zorin os", "zorin"), ("zorin",)),
    ("Pop!_OS", ("pop os", "popos"), ("pop os", "popos")),
    ("Tails", ("tails",), ("tails",)),
    ("Qubes OS", ("qubes os", "qubes"), ("qubes",)),
    ("FreeDOS", ("freedos", "free dos"), ("freedos",)),
    ("Solaris", ("solaris", "opensolaris", "oracle solaris"), ("solaris",)),
    ("Haiku", ("haiku",), ("haiku",)),
    ("ReactOS", ("reactos", "react os"), ("reactos",)),
    ("Android-x86", ("android x86", "androidx86", "android x86 iso"), ("androidx86", "android x86")),

    # ---- Retro, hobby and historic systems -------------------------------
    ("TempleOS", ("templeos", "temple os"), ("templeos", "temple os")),
    ("SerenityOS", ("serenityos", "serenity os", "serenity"), ("serenityos", "serenity")),
    ("KolibriOS", ("kolibrios", "kolibri os", "kolibri"), ("kolibrios", "kolibri")),
    ("MenuetOS", ("menuetos", "menuet os"), ("menuetos",)),
    ("Syllable", ("syllable", "syllableos", "syllable desktop"), ("syllable",)),
    ("Plan 9", ("plan 9", "plan9", "9front"), ("plan9", "plan 9", "9front")),
    ("MINIX", ("minix", "minix 3"), ("minix",)),
    ("OS/2", ("os 2", "os2", "ibm os 2", "warp 4"), ("os2", "ibm os 2", "warp 4")),
    ("AROS", ("aros", "aros one"), ("aros",)),
    ("AmigaOS", ("amigaos", "amiga os", "amiga os 4"), ("amigaos", "amiga os")),
    ("MorphOS", ("morphos", "morph os"), ("morphos",)),
    ("RISC OS", ("risc os", "riscos", "risc os open"), ("risc os", "riscos")),
    ("OpenVMS", ("openvms", "open vms", "vms"), ("openvms", "open vms")),
    ("HP-UX", ("hp ux", "hpux"), ("hp ux", "hpux")),
    ("IBM AIX", ("ibm aix", "aix"), ("ibm aix", "aix")),
    ("IRIX", ("irix", "sgi irix"), ("irix",)),
    ("BeOS", ("beos", "be os", "haiku beos"), ("beos", "be os")),

    # ---- Desktop and gaming Linux ----------------------------------------
    ("Bazzite", ("bazzite",), ("bazzite",)),
    ("CachyOS", ("cachyos", "cachy os", "cachy"), ("cachyos",)),
    ("Nobara", ("nobara", "nobara linux"), ("nobara",)),
    ("SteamOS", ("steamos", "steam os", "steamdeck", "steam deck"), ("steamos", "steam os")),
    ("Garuda Linux", ("garuda linux", "garudaos", "garuda"), ("garuda",)),
    ("EndeavourOS", ("endeavouros", "endeavour os", "endeavour"), ("endeavouros",)),
    ("KDE neon", ("kde neon",), ("kde neon",)),
    ("elementary OS", ("elementary os", "elementaryos", "elementary"), ("elementary os", "elementaryos")),
    ("Deepin", ("deepin", "deepin linux"), ("deepin",)),
    ("Endless OS", ("endless os", "endlessos", "endless"), ("endless os", "endlessos")),
    ("Solus", ("solus", "solusos"), ("solus",)),
    ("Clear Linux", ("clear linux", "clearlinux"), ("clearlinux", "clear linux")),
    ("MX Linux", ("mx linux", "mxlinux"), ("mx linux", "mxlinux")),
    ("Raspberry Pi OS", ("raspberry pi os", "raspios", "raspbian",
                        "raspberry pi desktop"), ("raspberry pi os", "raspbian", "raspios")),
    ("DietPi", ("dietpi", "diet pi"), ("dietpi",)),
    ("Puppy Linux", ("puppy linux", "puppylinux", "puppy"), ("puppy linux", "puppylinux")),
    ("Tiny Core Linux", ("tiny core linux", "tinycorelinux", "tinycore",
                         "tiny core"), ("tinycore", "tiny core")),
    ("ChromeOS Flex", ("chromeos flex", "chrome os flex", "cloudready"),
     ("chromeos flex", "chrome os flex", "cloudready")),

    # ---- Security, system and appliance distributions --------------------
    ("Parrot OS", ("parrot os", "parrotsec", "parrot security"),
     ("parrot os", "parrotsec")),
    ("BlackArch", ("blackarch", "black arch"), ("blackarch",)),
    ("Pentoo", ("pentoo",), ("pentoo",)),
    ("SystemRescue", ("systemrescue", "systemrescuecd", "system rescue cd",
                      "system rescue"), ("systemrescue", "system rescue")),
    ("GParted Live", ("gparted live", "gparted"), ("gparted",)),
    ("Clonezilla", ("clonezilla",), ("clonezilla",)),
    ("Rescuezilla", ("rescuezilla", "rescue zilla"), ("rescuezilla",)),
    ("Artix Linux", ("artix linux", "artix"), ("artix",)),
    ("Devuan", ("devuan",), ("devuan",)),
    ("antiX", ("antix", "anti x"), ("antix",)),
    ("Mageia", ("mageia",), ("mageia",)),
    ("OpenMandriva", ("openmandriva", "open mandriva"), ("openmandriva",)),
    ("Proxmox", ("proxmox", "proxmox ve", "proxmoxve"), ("proxmox",)),
    ("TrueNAS", ("truenas", "freenas", "true nas"), ("truenas", "freenas")),
    ("pfSense", ("pfsense",), ("pfsense",)),
    ("OPNsense", ("opnsense", "opn sense"), ("opnsense",)),
    ("OpenWrt", ("openwrt", "open wrt", "lede"), ("openwrt",)),

    # ---- Media centre and retro gaming appliances ------------------------
    ("Batocera", ("batocera", "batocera linux"), ("batocera",)),
    ("Lakka", ("lakka", "lakka linux"), ("lakka",)),
    ("Recalbox", ("recalbox", "recal box"), ("recalbox",)),
    ("RetroPie", ("retropie", "retro pie"), ("retropie",)),
    ("LibreELEC", ("libreelec", "libre elec"), ("libreelec",)),

    # Catch-all: every distribution without its own entry above.
    ("Linux (any ISO)", ("linux",), ("linux",)),
)

_IA_TERMS: dict[str, tuple[str, ...]] = {label: terms for label, _aliases, terms in IA_TARGETS}
_IA_ALIASES: dict[str, tuple[str, ...]] = {label: aliases for label, aliases, _terms in IA_TARGETS}

_GENERIC_LABEL = "Linux (any ISO)"

# Source names offered in the UI's "Archive.org" category.
IA_SOURCES: tuple[str, ...] = (
    IA_GENERIC_LABEL,
    # Desktop and server class.
    "Windows Server",
    "macOS",
    "FreeBSD",
    "OpenBSD",
    "NetBSD",
    "DragonFly BSD",
    "Ubuntu",
    "Debian",
    "Fedora",
    "Arch Linux",
    "Linux Mint",
    "Kali Linux",
    "Manjaro",
    "openSUSE",
    "Alpine Linux",
    "Gentoo",
    "Rocky Linux",
    "AlmaLinux",
    "CentOS",
    "RHEL",
    "Slackware",
    "Void Linux",
    "NixOS",
    "Zorin OS",
    "Pop!_OS",
    "Tails",
    "Qubes OS",
    "FreeDOS",
    "Solaris",
    "Haiku",
    "ReactOS",
    "Android-x86",
    # Retro, hobby and historic.
    "TempleOS",
    "SerenityOS",
    "KolibriOS",
    "MenuetOS",
    "Syllable",
    "Plan 9",
    "MINIX",
    "OS/2",
    "AROS",
    "AmigaOS",
    "MorphOS",
    "RISC OS",
    "OpenVMS",
    "HP-UX",
    "IBM AIX",
    "IRIX",
    "BeOS",
    # Desktop / gaming Linux.
    "Bazzite",
    "CachyOS",
    "Nobara",
    "SteamOS",
    "Garuda Linux",
    "EndeavourOS",
    "KDE neon",
    "elementary OS",
    "Deepin",
    "Endless OS",
    "Solus",
    "Clear Linux",
    "MX Linux",
    "Raspberry Pi OS",
    "DietPi",
    "Puppy Linux",
    "Tiny Core Linux",
    "ChromeOS Flex",
    # Security, system and appliance distributions.
    "Parrot OS",
    "BlackArch",
    "Pentoo",
    "SystemRescue",
    "GParted Live",
    "Clonezilla",
    "Rescuezilla",
    "Artix Linux",
    "Devuan",
    "antiX",
    "Mageia",
    "OpenMandriva",
    "Proxmox",
    "TrueNAS",
    "pfSense",
    "OPNsense",
    "OpenWrt",
    # Media centre and retro gaming appliances.
    "Batocera",
    "Lakka",
    "Recalbox",
    "RetroPie",
    "LibreELEC",
)

# Other names the app (or a saved settings file) may use for the same family.
IA_UI_ALIASES: dict[str, str] = {
    "openSUSE Leap": "openSUSE",
    "openSUSE Tumbleweed": "openSUSE",
    "CentOS Stream": "CentOS",
    "Red Hat Enterprise Linux": "RHEL",
    "Qubes": "Qubes OS",
    "Android x86": "Android-x86",
    "Ubuntu Linux": "Ubuntu",
    "Debian GNU/Linux": "Debian",
    "Raspbian": "Raspberry Pi OS",
    "Raspberry Pi Desktop": "Raspberry Pi OS",
    "TinyCore": "Tiny Core Linux",
    "Tiny Core": "Tiny Core Linux",
    "Puppy": "Puppy Linux",
    "Garuda": "Garuda Linux",
    "Endeavour": "EndeavourOS",
    "Elementary OS": "elementary OS",
    "elementary": "elementary OS",
    "Chrome OS Flex": "ChromeOS Flex",
    "CloudReady": "ChromeOS Flex",
    "Steam OS": "SteamOS",
    "Proxmox VE": "Proxmox",
    "FreeNAS": "TrueNAS",
    "IBM OS/2": "OS/2",
    "OS2": "OS/2",
    "System Rescue CD": "SystemRescue",
    "Parrot Security": "Parrot OS",
    "Black Arch": "BlackArch",
    "Alias antiX": "antiX",
}

# Free-text queries that mean "show me ISOs from archive.org" with no family.
_GENERIC_QUERY_TEXTS = frozenset(
    {
        "any",
        "any iso",
        "any isos",
        "any iso image",
        "all iso",
        "all isos",
        "archive org",
        "archiveorg",
        "archive.org",
        "internet archive",
        "internetarchive",
    }
)

LICENSE_NOTE = (
    "Internet Archive hosts user-contributed operating system media. Names "
    "include the byte size so trimmed repacks are obvious, but verify the hash "
    "against the vendor's official list before installing."
)


# --------------------------------------------------------------------------
# Query / source-name handling
# --------------------------------------------------------------------------

def _norm_text(text: str) -> str:
    """"Mac OS X 10.9.iso" -> "mac os x 10.9 iso"."""
    return re.sub(r"[^a-z0-9.]+", " ", str(text or "").lower()).strip()


def _alias_pattern(alias: str) -> str:
    # "linux" must not match inside "linuxmint" and "arch" must not match
    # inside "archman", so an alias may be followed by nothing word-ish.
    return r"(?<![a-z0-9])" + re.escape(alias) + r"(?![a-z0-9])"


_TARGET_RE_CACHE: dict[str, re.Pattern] = {}


def _target_re(label: str) -> re.Pattern | None:
    """Compiled matcher for every alias of ``label`` (cached)."""
    hit = _TARGET_RE_CACHE.get(label)
    if hit is not None:
        return hit
    aliases = _IA_ALIASES.get(label)
    if not aliases:
        return None
    pat = re.compile("|".join(_alias_pattern(a) for a in aliases))
    _TARGET_RE_CACHE[label] = pat
    return pat


# Families that must never be confused with each other: the catalogue's search
# is fuzzy, so "linux" hits also return Linux Mint items and a FreeBSD query can
# return the other BSDs.  A candidate file is dropped when the *text that
# matched* also names a different family.
_IA_EXCLUDE: dict[str, tuple[str, ...]] = {
    "Linux (any ISO)": ("linuxmint", "linux mint"),
    "FreeBSD": ("openbsd", "netbsd", "dragonfly bsd", "dragonflybsd"),
    "OpenBSD": ("freebsd", "netbsd", "dragonfly bsd", "dragonflybsd"),
    "NetBSD": ("freebsd", "openbsd", "dragonfly bsd", "dragonflybsd"),
    "DragonFly BSD": ("freebsd", "openbsd", "netbsd"),
    "Arch Linux": ("archman", "archbang", "archlabs"),
    "Plan 9": ("plan 9 from outer space", "plan 9 from bell labs dvd"),
    "OS/2": ("mac os", "chrome os", "android os"),
    "MINIX": ("minix neo",),
    "Syllable": ("syllable division", "syllable stress"),
    "Solus": ("solusvm", "solus os project bsd"),
    "Puppy Linux": ("puppy linux wallpaper", "puppy linux screenshots"),
    # "serenity" is a common word and fake "Windows Serenity Build ..." images
    # are common in the catalogue.
    "SerenityOS": ("windows", "microsoft"),
}

_EXCLUDE_RE_CACHE: dict[str, re.Pattern] = {}


def _exclude_re(label: str) -> re.Pattern | None:
    hit = _EXCLUDE_RE_CACHE.get(label)
    if hit is not None:
        return hit
    words = _IA_EXCLUDE.get(label)
    if not words:
        return None
    pat = re.compile("|".join(_alias_pattern(w) for w in words))
    _EXCLUDE_RE_CACHE[label] = pat
    return pat


def _matches_target(label: str, *texts: str) -> bool:
    """True when one of ``texts`` really names the family ``label``."""
    pat = _target_re(label)
    if pat is None:
        return True
    bad = _exclude_re(label)
    for text in texts:
        if not text:
            continue
        norm = _norm_text(text)
        if not pat.search(norm):
            continue
        if bad is not None and bad.search(norm):
            continue  # actually a different family (linuxmint vs linux)
        return True
    return False


def _mentions_any_family(query: str) -> bool:
    return bool(resolve_ia_targets(query))


def resolve_ia_targets(query: str) -> list[str]:
    """Map a UI source name or a free-text query to concrete family labels."""
    raw = str(query or "").strip()
    if not raw:
        return []

    aliased = IA_UI_ALIASES.get(raw, raw)

    if aliased.strip().lower() == IA_GENERIC_LABEL.lower():
        return [IA_GENERIC_LABEL]
    if _norm_text(aliased).strip() in _GENERIC_QUERY_TEXTS:
        return [IA_GENERIC_LABEL]

    exact = [label for label, _aliases, _terms in IA_TARGETS if label == aliased]
    if exact:
        return exact

    # Normalised text with a trailing space so a match at the very end of the
    # query is still followed by a non-word character.
    text = _norm_text(aliased) + " "
    found: list[str] = []
    for label, _aliases, _terms in IA_TARGETS:
        pat = _target_re(label)
        if pat is None:
            continue
        m = pat.search(text)
        if not m:
            continue
        found.append(label)
        # Consume the matched text so a more generic family cannot match inside
        # the alias we just used ("kali linux" must not also resolve "linux").
        text = text[: m.start()] + " " * (m.end() - m.start()) + text[m.end():]

    if len(found) > 1 and _GENERIC_LABEL in found:
        found.remove(_GENERIC_LABEL)
    return found


def has_ia_support(query: str) -> bool:
    """True when a free-text query should pull in the archive.org catalogue."""
    if not str(query or "").strip():
        return False
    return bool(resolve_ia_targets(query))


def is_ia_source(source: str) -> bool:
    return source in IA_SOURCES or source in IA_UI_ALIASES


def ia_source_names() -> tuple[str, ...]:
    return IA_SOURCES


# --------------------------------------------------------------------------
# Internet Archive lookups
# --------------------------------------------------------------------------

_JSON_CACHE: dict[str, tuple[float, object]] = {}
_JSON_CACHE_LOCK = threading.Lock()
_JSON_CACHE_TTL = 900.0


def _get_json(url: str, timeout: float = 30.0):
    now = time.time()
    with _JSON_CACHE_LOCK:
        hit = _JSON_CACHE.get(url)
        if hit is not None and now - hit[0] < _JSON_CACHE_TTL:
            return hit[1]
    text = http_get_text(url, timeout=timeout)
    data = json.loads(text)
    with _JSON_CACHE_LOCK:
        _JSON_CACHE[url] = (now, data)
    return data


def _ia_search(terms, rows: int, *, mediatype: str = "software", iso_format: bool = True) -> list[dict]:
    """One advancedsearch.php query.  Returns the raw docs (may be empty)."""
    if isinstance(terms, str):
        terms = (terms,)
    clauses: list[str] = []
    for term in terms or ():
        if not term:
            continue
        clauses.append(f"title:({term})")
        clauses.append(f"identifier:({term})")

    q = f"mediatype:{mediatype}"
    if iso_format:
        q += ' AND format:"ISO Image"'
    if clauses:
        q += " AND (" + " OR ".join(clauses) + ")"

    params = [
        ("q", q),
        ("fl[]", "identifier"),
        ("fl[]", "title"),
        ("fl[]", "year"),
        ("fl[]", "downloads"),
        ("sort[]", "downloads desc"),
        ("rows", str(max(1, rows))),
        ("page", "1"),
        ("output", "json"),
    ]
    url = _IA_SEARCH_URL + "?" + urllib.parse.urlencode(params)
    try:
        data = _run_bounded(lambda: _get_json(url, timeout=30.0), _SEARCH_BUDGET, None)
    except Exception:
        return []
    if not isinstance(data, dict):
        return []
    docs = (data.get("response") or {}).get("docs") or []
    return [d for d in docs if isinstance(d, dict) and d.get("identifier")]


def _ia_docs(terms, rows: int) -> list[dict]:
    """Search with a strict query first, then a relaxed one.

    Older uploads (and a lot of BSD/macOS media) are catalogued with a different
    ``mediatype`` or without the "ISO Image" format, so a strict-only search
    would silently miss them.  The relaxed pass still requires the real file to
    end in ``.iso`` (enforced in :func:`_ia_item_isos`).
    """
    docs = _run_bounded(lambda: _ia_search(terms, rows), _SEARCH_BUDGET, []) or []
    if docs:
        return docs
    return _run_bounded(
        lambda: _ia_search(terms, rows, mediatype="(software OR data OR other)", iso_format=False),
        _SEARCH_BUDGET,
        [],
    ) or []


def _min_bytes(label: str) -> int:
    return int(_MIN_BYTES_BY_LABEL.get(label, _MIN_ISO_BYTES))


def _ia_item_isos(identifier: str, min_bytes: int = _MIN_ISO_BYTES) -> list[dict]:
    """Return the .iso files of an Internet Archive item."""
    url = _IA_METADATA_URL + urllib.parse.quote(str(identifier))
    try:
        data = _get_json(url, timeout=30.0)
    except Exception:
        return []

    out: list[dict] = []
    for f in (data or {}).get("files") or []:
        if not isinstance(f, dict):
            continue
        name = str(f.get("name") or "").strip()
        if not name.lower().endswith(".iso"):
            continue
        try:
            size = int(f.get("size") or 0)
        except Exception:
            size = 0
        if size and size < min_bytes:
            continue
        out.append({"name": name, "size": size})
    return out


# --------------------------------------------------------------------------
# Quality filtering / ranking
# --------------------------------------------------------------------------

# Clearly repacked or tampered builds - not genuine vendor media.
_JUNK_RE = re.compile(
    r"(?i)\b(lite|nano|micro|tiny|mini|ultra|super ?light|ghost|spectre|"
    r"remaster\w*|remixed?|modified|modded|pre ?mod|repack\w*|crack(?:ed)?|"
    r"keygen|activat\w*|preactivat\w*|kms|pirat\w*|bypass|debloat|"
    r"hacked|slim|compact)\b"
)

# Same idea for tokens glued onto an item identifier ("freebsdlite") where \b
# never fires.  Applied to the identifier and file name only - never to the
# descriptive title, which may legitimately mention such words.
_JUNK_STRONG_RE = re.compile(
    r"(?i)(lite|nano|tiny|ghost|spectre|crack|keygen|activat|kms|pirat|"
    r"bloat|mod(?:ded|ified)|hack|repack)"
)

# Genuine, but not the plain installer - kept, just ranked lower.
_ALT_RE = re.compile(
    r"(?i)\b(preview|beta|alpha|insider|snapshot|nightly|release candidate|"
    r"rc\d|build \d{4,5}|recovery|rescue|minimal|netinst|netboot|cloud|"
    r"docker|container|virtualbox|vmware|qemu|vhd|vhdx|ova|upgrade|"
    r"update|source|src|checksums?|torrent|magnet|old|legacy)\b"
)

# The generic "Archive.org (any ISO)" listing has no family name to match against,
# so a candidate must at least look like operating-system media.  Without this
# gate the catalogue happily returns game discs, driver CDs and application
# media (a "GTA San Andreas PC.iso" showed up as item #1 in live testing).
_OS_HINT_RE = re.compile(
    r"(?i)\b(ubuntu|debian|fedora|centos|red ?hat|rhel|rocky|alma ?linux|arch ?linux|"
    r"manjaro|linux ?mint|opensuse|suse|slackware|gentoo|alpine|kali|parrot|nixos|"
    r"pop!_?os|zorin|elementary|deepin|garuda|endeavour|void ?linux|mx ?linux|"
    r"raspbian|raspberry ?pi|linux|windows|win ?(?:xp|vista|7|8|10|11)|freebsd|"
    r"openbsd|netbsd|dragonfly|mac ?os|macos|os ?x|solaris|illumos|haiku|reactos|"
    r"freedos|temple ?os|kolibri|menuet|serenity ?os|plan ?9|minix|os ?/?2|"
    r"aros|amiga|morphos|risc ?os|irix|hp ?-?ux|aix|open ?vms|be ?os|syllable|"
    r"android|chrome ?os|proxmox|truenas|pfsense|opnsense|openwrt|system ?rescue|"
    r"gparted|clonezilla|rescuezilla|batocera|lakka|recalbox|retropie|libreelec|"
    r"bazzite|cachyos|nobara|steam ?os|dietpi|freedos|distro|installer|setup|"
    r"installation (?:media|disc|disk|dvd|cd)|operating system|"
    r"live ?(?:cd|dvd|usb)|boot ?(?:cd|dvd|usb)|recovery (?:disc|disk|media))\b"
)


# Looks like a versioned, arch-qualified installer name rather than "some.iso".
_OFFICIAL_HINT_RE = re.compile(
    r"(?i)(\d+\.\d+|(19|20)\d{2})\.?|amd64|x86_64|i386|i486|i586|arm64|"
    r"aarch64|dvd|desktop|server|install|release|bootonly|disc\d|memstick|"
    r"disc|live|full"
)


# Family names that legitimately contain a token the junk heuristics look for
# ("tiny core", "puppy").  The family's own name is masked out of the haystack
# before the junk patterns run, otherwise Tiny Core would always be dropped.
_JUNK_EXEMPT: dict[str, tuple[str, ...]] = {
    "Tiny Core Linux": ("tinycore", "tiny core", "tinycorelinux", "tiny"),
    "MenuetOS": ("menuetos", "menuet os"),
    "KolibriOS": ("kolibrios", "kolibri os"),
    "MINIX": ("minix",),
    "Puppy Linux": ("puppylinux", "puppy linux", "puppy"),
    "Syllable": ("syllable",),
}


def _is_junk(identifier: str, filename: str, label: str = "") -> bool:
    hay = _norm_text(f"{identifier} {filename}")
    for token in _JUNK_EXEMPT.get(label, ()):
        hay = hay.replace(token, " ")
    return bool(_JUNK_RE.search(hay) or _JUNK_STRONG_RE.search(hay))


# Titles that are not operating system media at all (music, films, game discs).
_BAD_TITLE_RE = re.compile(
    r"(?i)\b(soundtrack|original score|full album|music disc|mp3|flac|"
    r"audio cd|classical|jazz|rock band|movie|film|blu ?ray|dvd rip|"
    r"playstation|ps[1-4]|psp|nintendo|gamecube|wii |xbox (?:360 )?game|"
    r"rom ?set|no-?intro|demoscene|video ?(?:game|tutorial))\b"
)

# Families whose name is an ordinary English word (or a common abbreviation) in
# the catalogue.  A candidate must additionally show a technological hint, so a
# "Syllable" search cannot return a linguistics lecture and "Plan 9" cannot
# return the film.
_TECH_HINT_RE = re.compile(
    r"(?i)(\.iso|operating system|\bos\b|install|boot|live ?cd|live ?dvd|"
    r"amd64|x86_64|i[3-6]86|arm64|aarch64|\d+\.\d|(19|20)\d{2}|release|"
    r"disk|disc|image|desktop|workstation|server|kernel)"
)

_FILENAME_HINTS: dict[str, re.Pattern] = {
    "Syllable": re.compile(r"(?i)syllable"),
    "Plan 9": re.compile(r"(?i)plan ?9|9front"),
    "MINIX": re.compile(r"(?i)minix"),
    "OS/2": re.compile(r"(?i)os ?/?2|warp|ibm os"),
    "AROS": re.compile(r"(?i)aros"),
    "AmigaOS": re.compile(r"(?i)amiga"),
    "MorphOS": re.compile(r"(?i)morphos"),
    "RISC OS": re.compile(r"(?i)risc ?os"),
    "BeOS": re.compile(r"(?i)be ?os"),
    "OpenVMS": re.compile(r"(?i)open ?vms|\bvms\b"),
    "HP-UX": re.compile(r"(?i)hp ?-?ux"),
    "IBM AIX": re.compile(r"(?i)aix"),
    "IRIX": re.compile(r"(?i)irix"),
    "TempleOS": re.compile(r"(?i)temple ?os"),
    "SerenityOS": re.compile(r"(?i)serenity"),
    "KolibriOS": re.compile(r"(?i)kolibri"),
    "MenuetOS": re.compile(r"(?i)menuet"),
    "DietPi": re.compile(r"(?i)dietpi"),
    "SteamOS": re.compile(r"(?i)steamos|steam ?deck|steam ?os"),
    "ChromeOS Flex": re.compile(r"(?i)chrome ?os|cloudready|flex"),
    "Raspberry Pi OS": re.compile(r"(?i)raspberry|raspbian|raspios"),
    "TrueNAS": re.compile(r"(?i)truenas|freenas"),
    "OpenWrt": re.compile(r"(?i)openwrt|lede"),
    "Puppy Linux": re.compile(r"(?i)puppy"),
    "Tiny Core Linux": re.compile(r"(?i)tiny ?core|tinycore"),
    # Generic "any ISO" listing: no family to match, so an operating-system hint
    # is required (see _OS_HINT_RE).
    IA_GENERIC_LABEL: _OS_HINT_RE,
}

# Labels whose archive.org query is fuzzy enough to drag in neighbouring
# families; ``_matches_target`` already rejects those, but a title-only check
# keeps obvious mismatches out even when the file name is generic.
_STRICT_MATCH_LABELS = frozenset({"OS/2", "Plan 9", "Syllable", "Solus", "MINIX", "SerenityOS"})


def _media_ok(label: str, identifier: str, filename: str, title: str = "") -> bool:
    """Relevance gate: is this .iso really media for ``label``?

    Drops music/film/game media and, for families whose name is an ordinary
    word, requires the name plus a technical hint.  Unknown families pass unless
    the metadata clearly says "not an operating system".
    """
    blob = f"{identifier} {filename} {title}"
    if _BAD_TITLE_RE.search(blob):
        return False

    hint = _FILENAME_HINTS.get(label)
    name_blob = f"{filename} {title} {identifier}"
    if hint is not None:
        if not hint.search(name_blob):
            return False
        if label in _STRICT_MATCH_LABELS and not _TECH_HINT_RE.search(name_blob):
            return False
        return True

    if label in _STRICT_MATCH_LABELS:
        return bool(_TECH_HINT_RE.search(name_blob))
    return True


def _score(filename: str, size: int, downloads: int, title: str) -> tuple:
    official = 1 if _OFFICIAL_HINT_RE.search(filename) else 0
    alt = 1 if _ALT_RE.search(f"{filename} {title}") else 0
    # Sorted descending: versioned installer names first, plain installers
    # before preview/netinst/recovery media, then larger (full) images, then
    # popular items.
    return (official, -alt, size, downloads)


def _display_name(label: str, filename: str, size: int) -> str:
    tag = _SHORT_TAG.get(label, label)
    size_txt = f" [{human_bytes(size)}]" if size else ""
    return f"[{tag}] {filename}{size_txt}"


def _download_url(identifier: str, filename: str) -> str:
    return (
        _IA_DOWNLOAD_URL
        + urllib.parse.quote(str(identifier))
        + "/"
        + urllib.parse.quote(filename)
    )


def _result(identifier: str, name: str, size: int, label: str, known: dict, limit: int, out: list) -> bool:
    """Dedupe (by lower-cased file name) and append one result.

    Returns True when ``limit`` has been reached.
    """
    key = name.strip().lower()
    score = size
    if key in known:
        return False
    known[key] = score
    out.append(
        RemoteIsoItem(
            name=_display_name(label, name, size),
            url=_download_url(identifier, name),
            sha256=None,
        )
    )
    return bool(limit > 0 and len(out) >= limit)


_ITEM_BUDGET = 40.0
# One advancedsearch.php round trip (the body can trickle for a long time).
_SEARCH_BUDGET = 45.0
# Ceiling for a whole family lookup across all of its catalogue labels.
_TOTAL_BUDGET = 90.0


def _run_bounded(fn, timeout: float, default):
    """Call ``fn()`` in a daemon thread and give up after ``timeout`` seconds.

    ``urllib``'s socket timeout only fires when the peer stops sending data
    altogether - archive.org sometimes trickles a response slowly enough to keep
    the socket alive indefinitely.  The worker thread is a daemon, so an
    abandoned request can never keep the interpreter alive at shutdown either.
    """
    box: dict = {}
    done = threading.Event()

    def run() -> None:
        try:
            box["value"] = fn()
        except Exception:
            pass
        finally:
            done.set()

    threading.Thread(target=run, name="ipm-ia-bounded", daemon=True).start()
    if done.wait(max(0.1, float(timeout))):
        return box.get("value", default)
    return default


def _fetch_items(
    docs: list[dict],
    min_bytes: int,
    budget: float = _ITEM_BUDGET,
) -> list[tuple[dict, list[dict]]]:
    """Fetch every item's file list, giving up after ``budget`` seconds.

    archive.org occasionally throttles or trickles a single metadata response;
    waiting for it would stall the whole search, so the slow items are simply
    skipped (a later refresh retries them).  The workers are daemon threads, so
    an abandoned request never blocks process exit.
    """
    results: list[tuple[dict, list[dict]]] = []
    lock = threading.Lock()
    pending = list(docs)
    stop = threading.Event()

    def worker() -> None:
        while not stop.is_set():
            with lock:
                if not pending:
                    return
                doc = pending.pop(0)
            try:
                files = _ia_item_isos(doc.get("identifier"), min_bytes)
            except Exception:
                continue
            with lock:
                results.append((doc, files))

    workers = max(1, min(_ITEM_WORKERS, len(docs) or 1))
    threads = [
        threading.Thread(target=worker, name="ipm-ia-item", daemon=True)
        for _ in range(workers)
    ]
    for thread in threads:
        thread.start()

    deadline = time.monotonic() + max(0.0, float(budget))
    for thread in threads:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        thread.join(timeout=remaining)
    stop.set()
    with lock:
        return list(results)


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

def _rows_for_level(archive_level: int) -> int:
    try:
        level = max(0, int(archive_level))
    except Exception:
        level = 0
    return min(_MAX_ROWS, _DEFAULT_ROWS + level * _DEFAULT_ROWS)


def ia_iso_search(
    query: str,
    archive_level: int = 0,
    *,
    max_items: int = -1,
) -> list[RemoteIsoItem]:
    """Find preserved ISOs of the OS family named in ``query``.

    ``query`` may be a UI source name ("OpenBSD"), a free-text query
    ("haiku iso") or the generic label "Archive.org (any ISO)".  ``archive_level``
    (the UI's "Load more" depth) widens how many catalogue items per family are
    read.  Windows 11/10/8.1/8/7/Vista/XP are intentionally not handled here -
    see ``ipm_windows``.
    """
    try:
        targets = resolve_ia_targets(query)
    except Exception:
        targets = []
    if not targets:
        return []
    if targets == [IA_GENERIC_LABEL]:
        return ia_generic_search("", archive_level, max_items=max_items)

    rows = _rows_for_level(archive_level)
    limit = max_items if max_items and max_items > 0 else -1
    out: list[RemoteIsoItem] = []
    known: dict[str, int] = {}
    deadline = time.monotonic() + _TOTAL_BUDGET

    for label in targets:
        if time.monotonic() >= deadline:
            break
        terms = _IA_TERMS.get(label) or (label.lower(),)
        min_bytes = _min_bytes(label)
        docs = _run_bounded(lambda: _ia_docs(terms, rows), _SEARCH_BUDGET, []) or []
        if not docs:
            continue
        docs = docs[:rows]

        candidates: list[tuple[tuple, str, int, str]] = []
        for doc, files in _fetch_items(docs, min_bytes):
            ident = str(doc.get("identifier") or "")
            title = str(doc.get("title") or "")
            try:
                downloads = int(doc.get("downloads") or 0)
            except Exception:
                downloads = 0
            for f in files:
                name = str(f.get("name") or "")
                size = int(f.get("size") or 0)
                if _is_junk(ident, name, label):
                    continue
                if not _matches_target(label, name, ident, title):
                    continue
                if not _media_ok(label, ident, name, title):
                    continue
                candidates.append((_score(name, size, downloads, title), name, size, ident))

        candidates.sort(key=lambda c: c[0], reverse=True)

        for _sc, name, size, ident in candidates:
            if _result(ident, name, size, label, known, limit, out):
                return out

    return out


def ia_generic_search(
    query: str,
    archive_level: int = 0,
    *,
    max_items: int = -1,
) -> list[RemoteIsoItem]:
    """Free-text archive.org ISO search with no family filter.

    Never raises: a dead network or an empty catalogue simply returns ``[]``.
    An empty ``query`` means "show me notable preserved ISOs", which is what the
    "Archive.org (any ISO)" source does when the search box is empty.  A query
    that names a known family is delegated instead, so its own size floor and
    relevance rules apply (TempleOS and friends are far smaller than the generic
    floor).
    """
    try:
        if str(query or "").strip():
            targets = resolve_ia_targets(query)
            named = [t for t in targets if t != IA_GENERIC_LABEL]
            if named:
                return ia_iso_search(query, archive_level, max_items=max_items)

        term = _norm_text(query)
        rows = _rows_for_level(archive_level)
        if not term:
            # Browsing with no search term: read more catalogue items so the
            # operating-system relevance gate still leaves a useful list.
            rows = max(rows, _GENERIC_MIN_ROWS)
        limit = max_items if max_items and max_items > 0 else -1
        docs = _run_bounded(
            lambda: _ia_docs((term,) if term else (), rows), _SEARCH_BUDGET, []
        ) or []
        if not docs:
            return []
        docs = docs[:rows]

        terms = [t for t in term.split() if len(t) > 2]
        candidates: list[tuple[tuple, str, int, str]] = []
        for doc, files in _fetch_items(docs, _MIN_ISO_BYTES):
            ident = str(doc.get("identifier") or "")
            title = str(doc.get("title") or "")
            try:
                downloads = int(doc.get("downloads") or 0)
            except Exception:
                downloads = 0
            for f in files:
                name = str(f.get("name") or "")
                size = int(f.get("size") or 0)
                if _is_junk(ident, name, IA_GENERIC_LABEL):
                    continue
                if not _media_ok(IA_GENERIC_LABEL, ident, name, title):
                    continue
                hay = _norm_text(f"{name} {title}")
                hits = sum(1 for t in terms if t in hay)
                score = (hits, *_score(name, size, downloads, title))
                candidates.append((score, name, size, ident))

        candidates.sort(key=lambda c: c[0], reverse=True)

        out: list[RemoteIsoItem] = []
        known: dict[str, int] = {}
        for _sc, name, size, ident in candidates:
            if _result(ident, name, size, IA_GENERIC_LABEL, known, limit, out):
                break
        return out
    except Exception:
        return []
