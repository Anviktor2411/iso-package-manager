from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


ISO_EXTENSIONS = {".iso"}


@dataclass(frozen=True)
class IsoItem:
    path: Path

    @property
    def name(self) -> str:
        return self.path.name

    @property
    def size_bytes(self) -> int:
        return self.path.stat().st_size

    @property
    def mtime(self) -> float:
        return self.path.stat().st_mtime


@dataclass(frozen=True)
class RemoteIsoItem:
    name: str
    url: str
    sha256: str | None
