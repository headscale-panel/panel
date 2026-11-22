#!/usr/bin/env bash
# Verify host prerequisites for running the local dev tailnet stack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/log.sh
source "${SCRIPT_DIR}/../lib/log.sh"

command -v docker >/dev/null 2>&1 || die "docker is not installed or not in PATH"
docker compose version >/dev/null 2>&1 || die "docker compose plugin is unavailable (Docker 20.10+ required)"
command -v openssl >/dev/null 2>&1 || die "openssl is not installed or not in PATH"
[[ -c "${TUN_DEVICE_PATH}" ]] || die "${TUN_DEVICE_PATH} is unavailable; tailscale clients require TUN support"

log_ok "all host dependencies verified"
