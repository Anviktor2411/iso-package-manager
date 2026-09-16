"""Mount / unmount / open helpers used by the UI.

The app started as a Windows tool, but the same GUI, CLI and launcher run on
Linux and macOS, so every OS-specific command lives here behind one tiny API:

* ``mount_supported()``        - is there a usable mount backend on this OS?
* ``mount_backend()``          - its name, for status messages
* ``mount_iso(path)``          - attach the image
* ``get_mount_point(path)``    - where it showed up (``E:\\``, ``/media/...``)
* ``unmount_iso(path)``        - detach it again
* ``open_explorer(target)``    - reveal a path in the file manager

Backends
--------
Windows : PowerShell ``Mount-DiskImage`` / ``Dismount-DiskImage``, drive letter
          from ``Get-Volume`` (unchanged from earlier releases).
Linux   : ``udisksctl loop-setup`` + ``udisksctl mount`` - no root needed inside
          a normal desktop session - with ``mount -o loop,ro`` as the fallback
          for root/console use.  The loop device is resolved with ``losetup -j``
          so nothing has to be remembered between calls, and mount points are
          read from ``findmnt`` with ``/proc/mounts`` as a fallback.
macOS   : ``hdiutil attach -nobrowse -readonly`` / ``hdiutil detach``.

On Linux and macOS everything attached *by this process* is detached again at
interpreter exit (``atexit``), so a closed window never leaves a loop device or
an ``/Volumes`` entry behind.  Windows keeps the historical behaviour (the
drive stays mounted until the user ejects it via the UI or Windows itself).
"""

from __future__ import annotations

import atexit
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from ipm_utils import is_linux, is_macos, is_windows, open_path_default

if is_windows():  # pragma: no cover - platform specific
    _CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
else:
    _CREATE_NO_WINDOW = 0

_TIMEOUT = 60.0

# Images attached through this module: str(image) -> mount point / drive letter.
_ATTACHED: dict[str, str] = {}
# Loop devices created by ``udisksctl loop-setup``: str(image) -> /dev/loopN.
_LOOP_DEVICE: dict[str, str] = {}


def _run(cmd: list[str], timeout: float = _TIMEOUT) -> subprocess.CompletedProcess:
    kwargs: dict = {"capture_output": True, "text": True, "timeout": timeout}
    if _CREATE_NO_WINDOW:
        kwargs["creationflags"] = _CREATE_NO_WINDOW
    try:
        return subprocess.run(cmd, **kwargs)
    except FileNotFoundError as exc:
        raise RuntimeError(f"{cmd[0]} not found") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"{cmd[0]} timed out after {timeout:.0f}s") from exc


def _out(cp: subprocess.CompletedProcess) -> str:
    return ((cp.stdout or "") + (cp.stderr or "")).strip()


def _safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", str(text)).strip("-") or "iso"


# ---------------------------------------------------------------------------
# Windows
# ---------------------------------------------------------------------------

def run_powershell(cmd: str) -> subprocess.CompletedProcess:
    if not is_windows():
        raise RuntimeError("PowerShell is only available on Windows")
    return _run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            cmd,
        ]
    )


def _ps_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _windows_mount(iso: Path) -> None:
    cp = run_powershell(f"Mount-DiskImage -ImagePath {_ps_quote(str(iso))}")
    if cp.returncode != 0:
        raise RuntimeError(_out(cp) or "Mount failed")


def _windows_mount_point(iso: Path) -> str | None:
    cmd = (
        f"$img = Get-DiskImage -ImagePath {_ps_quote(str(iso))} -ErrorAction Stop; "
        "$vol = $img | Get-Volume -ErrorAction SilentlyContinue; "
        "if ($vol -and $vol.DriveLetter) { $vol.DriveLetter + ':\\' }"
    )
    cp = run_powershell(cmd)
    if cp.returncode != 0:
        return None
    out = (cp.stdout or "").strip()
    return out or None


def _windows_unmount(iso: Path) -> bool:
    cp = run_powershell(
        f"Dismount-DiskImage -ImagePath {_ps_quote(str(iso))} -ErrorAction SilentlyContinue"
    )
    return cp.returncode == 0


# ---------------------------------------------------------------------------
# Linux
# ---------------------------------------------------------------------------

def _linux_loop_device(iso: Path) -> str | None:
    """Return the ``/dev/loopN`` bound to ``iso``, if any."""
    known = _LOOP_DEVICE.get(str(iso))
    if known:
        return known
    losetup = shutil.which("losetup")
    if not losetup:
        return None
    cp = _run([losetup, "-j", str(iso)], timeout=15)
    first = (cp.stdout or "").strip().splitlines()
    if first:
        match = re.match(r"(/dev/loop\d+)\s*:", first[0])
        if match:
            _LOOP_DEVICE[str(iso)] = match.group(1)
            return match.group(1)
    return None


def _proc_mounts() -> list[tuple[str, str]]:
    """(source, target) pairs from /proc/mounts - no external tools needed."""
    out: list[tuple[str, str]] = []
    try:
        with open("/proc/mounts", "r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                parts = line.split()
                if len(parts) >= 2:
                    out.append((parts[0], parts[1].replace("\\040", " ")))
    except OSError:
        pass
    return out


def _linux_target_for(iso: Path) -> Path:
    return Path(tempfile.gettempdir()) / ("ipm-" + _safe_name(iso.stem))


def _linux_mount_point_for_device(device: str) -> str | None:
    findmnt = shutil.which("findmnt")
    if findmnt:
        cp = _run([findmnt, "-n", "-o", "TARGET", "--source", device], timeout=15)
        lines = [line.strip() for line in (cp.stdout or "").splitlines() if line.strip()]
        if cp.returncode == 0 and lines:
            return lines[0]
    for source, target in _proc_mounts():
        if source == device:
            return target
    return None


def _linux_mount_point(iso: Path) -> str | None:
    device = _linux_loop_device(iso)
    if device:
        point = _linux_mount_point_for_device(device)
        if point:
            return point
    # ``mount -o loop`` fallback: look for our own target directory.
    target = str(_linux_target_for(iso))
    for _source, mounted_at in _proc_mounts():
        if mounted_at == target:
            return mounted_at
    return None


def _linux_mount_udisks(udisksctl: str, iso: Path) -> str:
    """Attach with udisks2 (the desktop-friendly, root-free path)."""
    setup = _run(
        [udisksctl, "loop-setup", "--file", str(iso), "--no-user-interaction"],
        timeout=30,
    )
    text = _out(setup)
    match = re.search(r"(/dev/loop\d+)", text)
    if setup.returncode != 0 or not match:
        raise RuntimeError(text or "udisksctl loop-setup failed")
    device = match.group(1)
    _LOOP_DEVICE[str(iso)] = device

    cp = _run(
        [udisksctl, "mount", "--block-device", device, "--no-user-interaction"],
        timeout=30,
    )
    text = _out(cp)
    if cp.returncode == 0:
        match = re.search(r"\bat\s+(.+?)\.?\s*$", text, re.M)
        if match:
            return match.group(1).strip()
        point = _linux_mount_point_for_device(device)
        if point:
            return point
    raise RuntimeError(text or f"udisksctl could not mount {device}")


def _linux_mount_loop(iso: Path) -> str:
    """Fallback for root / non-desktop sessions: ``mount -o loop,ro``."""
    target = _linux_target_for(iso)
    target.mkdir(parents=True, exist_ok=True)
    mount = shutil.which("mount") or "mount"
    cp = _run([mount, "-o", "loop,ro", "-t", "iso9660", str(iso), str(target)], timeout=60)
    if cp.returncode != 0:
        first_err = _out(cp)
        # Hybrid images (isohybrid/udf) do not always answer to -t iso9660.
        cp = _run([mount, "-o", "loop,ro", str(iso), str(target)], timeout=60)
        if cp.returncode != 0:
            raise RuntimeError(_out(cp) or first_err or "mount failed")
    return str(target)


def _linux_mount(iso: Path) -> str:
    errors: list[str] = []
    udisksctl = shutil.which("udisksctl")
    if udisksctl:
        try:
            return _linux_mount_udisks(udisksctl, iso)
        except Exception as exc:  # fall through to the mount(8) path
            errors.append(str(exc))
    try:
        return _linux_mount_loop(iso)
    except Exception as exc:
        errors.append(str(exc))
    detail = "; ".join(errors)
    raise RuntimeError(
        (detail + "\n" if detail else "")
        + "Mounting needs udisks2 (desktop sessions) or root.\n"
        "Install udisks2, or use 'Extract' / open the .iso directly instead."
    )


def _linux_unmount(iso: Path) -> bool:
    device = _linux_loop_device(iso)
    if not device:
        # Root ``mount -o loop`` fallback: unmount our own target directory.
        target = str(_linux_target_for(iso))
        if any(mounted_at == target for _s, mounted_at in _proc_mounts()):
            umount = shutil.which("umount") or "umount"
            cp = _run([umount, target], timeout=30)
            return cp.returncode == 0
        return False

    udisksctl = shutil.which("udisksctl")
    ok = False
    if udisksctl:
        cp = _run(
            [udisksctl, "unmount", "--block-device", device, "--no-user-interaction"],
            timeout=30,
        )
        ok = cp.returncode == 0
    else:
        point = _linux_mount_point_for_device(device)
        if point:
            umount = shutil.which("umount") or "umount"
            cp = _run([umount, point], timeout=30)
            ok = cp.returncode == 0

    if udisksctl:
        cp = _run(
            [udisksctl, "loop-delete", "--block-device", device, "--no-user-interaction"],
            timeout=30,
        )
        ok = ok or cp.returncode == 0
    else:
        losetup = shutil.which("losetup") or "losetup"
        cp = _run([losetup, "-d", device], timeout=30)
        ok = ok or cp.returncode == 0

    _LOOP_DEVICE.pop(str(iso), None)
    return ok


# ---------------------------------------------------------------------------
# macOS
# ---------------------------------------------------------------------------

def _mac_mount(iso: Path) -> str:
    """Attach with hdiutil and return the /Volumes mount point.

    ``hdiutil attach`` prints one tab/space separated line per partition, e.g.
    ``/dev/disk4s1\tApple_HFS\t/Volumes/Ubuntu 24.04``.  The mount point is a
    column, not the start of the line, and it may contain spaces - so scan the
    fields instead of anchoring on ``^/Volumes``.
    """
    hdiutil = shutil.which("hdiutil") or "hdiutil"
    cp = _run([hdiutil, "attach", "-nobrowse", "-readonly", str(iso)], timeout=120)
    text = _out(cp)
    if cp.returncode != 0:
        raise RuntimeError(text or "hdiutil attach failed")

    for line in text.splitlines():
        for field in (part.strip() for part in line.split("\t")):
            if field.startswith("/Volumes/"):
                return field

    # Last resort: some builds separate columns with spaces only.
    match = re.search(r"(/Volumes/[^\t\n]+?)\s*$", text, re.M)
    if match:
        return match.group(1).strip()
    raise RuntimeError(text or "hdiutil attach did not report a /Volumes mount point")


def _mac_mount_point(iso: Path) -> str | None:
    known = _ATTACHED.get(str(iso))
    if known and Path(known).exists():
        return known
    hdiutil = shutil.which("hdiutil")
    if not hdiutil:
        return None
    cp = _run([hdiutil, "info"], timeout=30)
    for block in (cp.stdout or "").split("/dev/disk")[1:]:
        if str(iso) in block:
            match = re.search(r"(/Volumes/[^\n]+)", block)
            if match:
                return match.group(1).strip()
    return None


def _mac_unmount(iso: Path) -> bool:
    point = _mac_mount_point(iso)
    if not point:
        return False
    hdiutil = shutil.which("hdiutil") or "hdiutil"
    cp = _run([hdiutil, "detach", point], timeout=60)
    return cp.returncode == 0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def mount_backend() -> str:
    """Name of the backend that will be used, or "" when mounting is impossible."""
    if is_windows():
        return "powershell" if shutil.which("powershell") else ""
    if is_macos():
        return "hdiutil" if shutil.which("hdiutil") else ""
    if is_linux():
        if shutil.which("udisksctl"):
            return "udisksctl"
        if shutil.which("mount") and shutil.which("losetup"):
            return "mount"
        return ""
    return ""


def mount_supported() -> bool:
    """True when this OS can attach an ISO from inside the app."""
    return bool(mount_backend())


def mount_iso(iso_path: Path | str) -> None:
    """Attach ``iso_path``; raises RuntimeError with a usable message on failure."""
    iso = Path(iso_path)
    if not iso.exists():
        raise RuntimeError(f"Image not found: {iso}")

    if not mount_supported():
        # Fail fast with an actionable message instead of running a privileged
        # command that is guaranteed to fail.
        raise RuntimeError(
            f"Mounting is not supported on {sys.platform}: no mount backend found.\n"
            "On Linux install udisks2 (desktop sessions) or run with root (mount -o loop)."
        )

    if is_windows():
        _windows_mount(iso)
        point = _windows_mount_point(iso)
    elif is_macos():
        point = _mac_mount(iso)
    elif is_linux():
        point = _linux_mount(iso)
    else:
        raise RuntimeError(f"Mounting is not supported on {sys.platform}")

    if point:
        _ATTACHED[str(iso)] = point


def get_mount_point(iso_path: Path | str) -> str | None:
    """Where the image is mounted right now (drive letter or mount directory)."""
    iso = Path(iso_path)
    if is_windows():
        return _windows_mount_point(iso)
    if is_macos():
        return _mac_mount_point(iso)
    if is_linux():
        return _linux_mount_point(iso)
    return None


# Backwards compatible name - older GUI code called it a "drive letter".
get_mounted_drive_letter = get_mount_point


def is_mounted(iso_path: Path | str) -> bool:
    return bool(get_mount_point(iso_path))


def unmount_iso(iso_path: Path | str) -> bool:
    """Detach the image. Returns True when the image is no longer mounted."""
    iso = Path(iso_path)
    if is_windows():
        ok = _windows_unmount(iso)
    elif is_macos():
        ok = _mac_unmount(iso)
    elif is_linux():
        ok = _linux_unmount(iso)
    else:
        ok = False
    if ok:
        _ATTACHED.pop(str(iso), None)
    return ok or not is_mounted(iso)


def open_explorer(target: str | Path) -> None:
    """Reveal a path (drive, mount point or folder) in the OS file manager."""
    text = str(target)
    if is_windows():
        subprocess.Popen(
            ["explorer", text],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return
    open_path_default(text)


def _detach_on_exit() -> None:
    """Leave no loop device / /Volumes entry behind when the app closes.

    Windows is deliberately excluded: there the OS owns the mount and the user
    may still be using the drive after the window is closed.
    """
    if is_windows():
        return
    for iso in list(_ATTACHED):
        try:
            unmount_iso(iso)
        except Exception:
            pass


atexit.register(_detach_on_exit)
