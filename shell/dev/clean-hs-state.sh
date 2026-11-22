#!/usr/bin/env bash
# Remove Headscale runtime state (database, noise/private keys, seeded config) for a fresh start.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

load_dev_env
apply_dev_profile

log_warn "removing headscale state (database, keys, and seeded config)"
compose down --remove-orphans >/dev/null 2>&1 || true

rm -f \
    "${HS_LIB_DIR}/db.sqlite" \
    "${HS_LIB_DIR}/db.sqlite-shm" \
    "${HS_LIB_DIR}/db.sqlite-wal" \
    "${HS_LIB_DIR}/private.key" \
    "${HS_LIB_DIR}/noise_private.key"
rm -rf "${STATE_DIR}"
rm -f "${HS_CONFIG_FILE}"

log_ok "headscale state cleared"
