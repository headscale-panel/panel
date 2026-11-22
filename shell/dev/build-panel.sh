#!/usr/bin/env bash
# Build the local dev panel container image.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

load_dev_env
apply_dev_profile

log_info "building ${DEV_PANEL_SERVICE} container image"
compose build "${DEV_PANEL_SERVICE}"
log_ok "${DEV_PANEL_SERVICE} image built"
