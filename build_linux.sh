#!/usr/bin/env bash
#
# ISO Package Manager - Linux build / install helper.
#
#   ./build_linux.sh              build the native one-file binary into ./dist
#   ./build_linux.sh build        same as above
#   ./build_linux.sh pyz          build the portable .pyz (no compiler needed)
#   ./build_linux.sh all          pyz + native binary (+ .deb when dpkg-deb exists)
#   ./build_linux.sh install      build, then install to ~/.local/bin + a .desktop entry
#   ./build_linux.sh deb          build, then package a .deb into ./dist (needs dpkg-deb)
#   ./build_linux.sh clean        remove the build/ and dist/ artifacts
#
# Two different Linux executables come out of here:
#
#   dist/iso-package-manager        native ELF (PyInstaller onefile, no Python
#                                   needed on the target - built on Linux only)
#   dist/iso-package-manager-*.pyz  portable Python zipapp with a
#                                   "#!/usr/bin/env python3" shebang; runs on
#                                   any distro that has python3 + tkinter and
#                                   can also be produced from Windows/macOS
#                                   (see build_pyz.py)
#
# Runtime requirements: python3 (3.10+) with tkinter. For "Mount + Open" the app
# uses `udisksctl` when available (no root needed) and falls back to a plain
# `mount -o loop,ro` (needs root or an entry in /etc/fstab).
#
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

APP_NAME="ISO Package Manager"      # display name (window title, .desktop Name)
BIN_NAME="iso-package-manager"      # on-disk name - no spaces, Linux friendly
ENTRY="ipm_launcher.py"
PKG_SLUG="iso-package-manager"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

find_python() {
  for py in python3 python; do
    if command -v "$py" >/dev/null 2>&1; then
      if "$py" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
        printf '%s' "$py"
        return 0
      fi
    fi
  done
  return 1
}

check_python() {
  PY="$(find_python)" || die "python3 >= 3.10 is required (install python3 and python3-tk)"
  log "using $("$PY" -V 2>&1)"

  "$PY" -c 'import tkinter' 2>/dev/null \
    || die "tkinter is missing - install it (Debian/Ubuntu: sudo apt install python3-tk)"
  "$PY" -c 'import certifi' 2>/dev/null \
    || warn "certifi not installed - pip install certifi for reliable HTTPS verification"
}

app_version() {
  local v
  v="$(sed -n 's/^APP_VERSION *= *"\(.*\)".*/\1/p' ipm_launcher.py | head -n 1)"
  printf '%s' "${v:-0.8}"
}

# ---------------------------------------------------------------------------
# Targets
# ---------------------------------------------------------------------------

cmd_pyz() {
  check_python
  log "building the portable zipapp executable ..."
  "$PY" build_pyz.py || die "zipapp build failed"
}

cmd_build() {
  check_python

  if ! "$PY" -m PyInstaller --version >/dev/null 2>&1; then
    log "installing PyInstaller ..."
    if ! "$PY" -m pip install --user --disable-pip-version-check pyinstaller; then
      # Debian 12+ / Ubuntu 23.04+ mark their python3 as externally managed
      # (PEP 668), which makes a plain --user install fail.
      warn "pip refused the install - retrying with --break-system-packages"
      "$PY" -m pip install --user --disable-pip-version-check --break-system-packages pyinstaller \
        || die "pip install pyinstaller failed - install it yourself (pipx install pyinstaller)"
    fi
  fi
  log "PyInstaller $("$PY" -m PyInstaller --version)"

  EXTRA=()
  if "$PY" -c 'import webview' >/dev/null 2>&1; then
    log "pywebview detected - bundling the in-app browser backend"
    EXTRA+=(--collect-all webview --hidden-import webview.platforms.gtk)
  else
    warn "pywebview not installed - the in-app browser falls back to the default browser"
  fi
  if "$PY" -c 'import certifi' >/dev/null 2>&1; then
    EXTRA+=(--collect-data certifi)
  fi

  log "building the native one-file binary (this takes a minute) ..."
  "$PY" -m PyInstaller --noconfirm --clean --onefile --console \
    --name "$BIN_NAME" \
    --distpath dist --workpath build --specpath build \
    --hidden-import main --hidden-import ipm_cli --hidden-import ipm_ia \
    --hidden-import ipm_search --hidden-import ipm_windows --hidden-import ipm_winops \
    --hidden-import ipm_http --hidden-import ipm_models --hidden-import ipm_utils \
    "${EXTRA[@]+"${EXTRA[@]}"}" "$ENTRY" \
    || die "build failed - scroll up for the PyInstaller error"

  [[ -f "dist/$BIN_NAME" ]] || die "PyInstaller reported success but dist/$BIN_NAME is missing"
  chmod +x "dist/$BIN_NAME"

  # Smoke test: --version must run without a display and without Tk.
  local vout
  if vout="$("dist/$BIN_NAME" --version 2>&1 | head -n 1)"; then
    log "smoke test: $vout"
  else
    die "dist/$BIN_NAME built but refuses to run - check missing system libraries"
  fi

  log "done: dist/$BIN_NAME ($(du -h "dist/$BIN_NAME" | cut -f1))"
  printf '  run:  ./dist/%s                  (asks: UI or Terminal)\n' "$BIN_NAME"
  printf '        ./dist/%s --cli search ubuntu\n' "$BIN_NAME"
  printf '        ./dist/%s --gui\n' "$BIN_NAME"

  command -v udisksctl >/dev/null 2>&1 \
    || warn "udisksctl not found - ISO mounting will need root (install udisks2)"
  command -v xdg-open >/dev/null 2>&1 \
    || warn "xdg-open not found - install xdg-utils so the app can open folders"
}

write_desktop_file() {
  local target="$1" exec_path="$2"
  mkdir -p "$(dirname "$target")"
  cat > "$target" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=$APP_NAME
GenericName=ISO image manager
Comment=Browse, download and mount ISO images
Exec=$exec_path
Terminal=true
Categories=Utility;System;FileTools;
Keywords=iso;image;mount;download;ubuntu;debian;linux;
EOF
}

cmd_install() {
  cmd_build
  local bin_dir="$HOME/.local/bin"
  local apps_dir="$HOME/.local/share/applications"
  mkdir -p "$bin_dir" "$apps_dir"

  install -m 0755 "dist/$BIN_NAME" "$bin_dir/$BIN_NAME"
  write_desktop_file "$apps_dir/$PKG_SLUG.desktop" "$bin_dir/$BIN_NAME"

  log "installed $bin_dir/$BIN_NAME"
  log "installed $apps_dir/$PKG_SLUG.desktop"
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) warn "$bin_dir is not on your PATH - add it: export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
  esac
  log "launch it from your application menu or run: \"$bin_dir/$BIN_NAME\""
}

cmd_deb() {
  cmd_build
  command -v dpkg-deb >/dev/null 2>&1 || die "dpkg-deb not found (install dpkg-dev)"

  local ver arch root out
  ver="$(app_version)"
  arch="$(dpkg --print-architecture)"
  root="build/deb/${PKG_SLUG}_${ver}_${arch}"
  out="dist/${PKG_SLUG}_${ver}_${arch}.deb"

  rm -rf "$root"
  install -Dm0755 "dist/$BIN_NAME" "$root/usr/bin/$PKG_SLUG"
  write_desktop_file "$root/usr/share/applications/$PKG_SLUG.desktop" "/usr/bin/$PKG_SLUG"

  mkdir -p "$root/DEBIAN"
  cat > "$root/DEBIAN/control" <<EOF
Package: $PKG_SLUG
Version: $ver
Section: utils
Priority: optional
Architecture: $arch
Maintainer: $(git config user.name 2>/dev/null || echo "${USER:-unknown}") <$(git config user.email 2>/dev/null || echo "${USER:-unknown}@localhost")>
Depends: libc6
Recommends: udisks2, xdg-utils
Description: Browse, download and mount ISO images
 ISO Package Manager finds Linux/BSD/macOS/Windows ISO images on the internet,
 downloads them with checksum validation, and mounts or extracts local images
 for inspection.
EOF

  dpkg-deb --build --root-owner-group "$root" "$out"
  log "done: $out"
  printf '  install: sudo dpkg -i %s\n' "$out"
}

cmd_all() {
  cmd_pyz
  cmd_build
  if command -v dpkg-deb >/dev/null 2>&1; then
    cmd_deb
  else
    warn "skipping the .deb (dpkg-deb not installed - apt install dpkg-dev)"
  fi
  log "all Linux artifacts are in ./dist"
}

cmd_clean() {
  rm -rf build dist
  log "removed build/ and dist/"
}

case "${1:-build}" in
  build|"") cmd_build ;;
  pyz)      cmd_pyz ;;
  all)      cmd_all ;;
  install)  cmd_install ;;
  deb)      cmd_deb ;;
  clean)    cmd_clean ;;
  -h|--help|help) sed -n '2,11p' "$0" ;;
  *) die "unknown target '$1' (use: build | pyz | all | install | deb | clean)" ;;
esac
