from __future__ import annotations

import subprocess
from pathlib import Path

from ipm_utils import is_windows, open_path_default


def run_powershell(cmd: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            cmd,
        ],
        capture_output=True,
        text=True,
    )


def mount_iso(iso_path: Path) -> None:
    if not is_windows():
        raise RuntimeError("Mount is only implemented on Windows in this app")

    # Mount via Windows PowerShell
    # Note: requires admin only in some environments/policies; we surface errors.
    esc = str(iso_path).replace("'", "''")
    cmd = f"Mount-DiskImage -ImagePath '{esc}'"
    cp = run_powershell(cmd)
    if cp.returncode != 0:
        raise RuntimeError((cp.stderr or cp.stdout or "Mount failed").strip())


def get_mounted_drive_letter(iso_path: Path) -> str | None:
    if not is_windows():
        return None
    # Query the volume drive letter for a mounted image
    # Returns something like 'E:' or None
    esc = str(iso_path).replace("'", "''")
    cmd = (
        f"$img = Get-DiskImage -ImagePath '{esc}' -ErrorAction Stop; "
        "$vol = $img | Get-Volume -ErrorAction SilentlyContinue; "
        "if ($vol -and $vol.DriveLetter) { $vol.DriveLetter + ':' }"
    )
    cp = run_powershell(cmd)
    out = (cp.stdout or "").strip()
    if cp.returncode != 0:
        return None
    return out if out else None


def open_explorer(target: str) -> None:
    if is_windows():
        subprocess.Popen(["explorer", target], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return
    open_path_default(target)
