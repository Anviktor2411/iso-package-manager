#!/usr/bin/env bash
#
# Produce the native Linux executable from any machine that has Docker.
#
#   ./build_linux_docker.sh            # pyz + native onefile + .deb
#   ./build_linux_docker.sh pyz        # portable .pyz only
#   ./build_linux_docker.sh build      # native onefile only
#   ./build_linux_docker.sh clean      # wipe build/ and dist/
#
# The build runs inside an Ubuntu 22.04 container (glibc 2.35) so the binary it
# produces keeps working on older distros instead of demanding the newest glibc.
# Artifacts land in ./dist on the host, owned by you (not by root).
#
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

IMAGE="ipm-linux-builder:22.04"
TARGET="${1:-all}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 \
  || die "docker not found - install Docker Desktop / dockerd, or build on Linux with ./build_linux.sh"

if ! docker info >/dev/null 2>&1; then
  die "the Docker daemon is not reachable - start Docker Desktop / dockerd first"
fi

log "building image $IMAGE (cached after the first run) ..."
docker build -f Dockerfile.linux-build -t "$IMAGE" . \
  || die "docker build failed"

mkdir -p dist

# HOME=/tmp keeps PyInstaller's cache writable for the non-root uid we run as,
# and matching the host uid avoids root-owned files in ./dist. The uid mapping
# is skipped where `id` is unavailable (e.g. Docker Desktop on Windows).
RUN_ARGS=(--rm -v "$PWD:/src" -w /src -e HOME=/tmp)
if command -v id >/dev/null 2>&1 && id -u >/dev/null 2>&1; then
  RUN_ARGS+=(-u "$(id -u):$(id -g)")
else
  warn "no 'id' command here - artifacts in ./dist may be owned by root"
fi

log "running ./build_linux.sh $TARGET inside the container ..."
docker run "${RUN_ARGS[@]}" "$IMAGE" ./build_linux.sh "$TARGET" \
  || die "build failed inside the container"

log "artifacts in ./dist:"
ls -lh dist || true
