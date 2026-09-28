#!/usr/bin/env sh
# XP Flight Computer - Linux / macOS launcher.  Usage: sh start.sh [--lan] [other xpfc.py options]
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 xpfc.py "$@"
elif command -v python >/dev/null 2>&1; then
  exec python xpfc.py "$@"
fi
echo "Python 3 was not found. Install it with your package manager, e.g. 'sudo pacman -S python' or 'sudo apt install python3'."
exit 1
