#!/usr/bin/env bash
# Ensure the Headscale dev image is available locally.
# In default release mode, uses the configured release image directly.
# When HS_BUILD_FROM_SOURCE=1, builds the image from AdaptedHeadscaleCommit.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

load_dev_env
apply_dev_profile

if image_exists_locally "${HEADSCALE_IMAGE}"; then
    log_info "reusing local image ${HEADSCALE_IMAGE}"
    exit 0
fi

if [[ "${HS_BUILD_FROM_SOURCE:-0}" == "1" ]]; then
    log_info "building ${HEADSCALE_IMAGE} from source (temporary source-build mode)"
    "${SHELL_DIR}/hs/build-image.sh" "$(read_adapted_commit)" "${HEADSCALE_IMAGE}"
    exit 0
fi

log_info "pulling release image ${HEADSCALE_IMAGE}"
docker pull "${HEADSCALE_IMAGE}"
log_ok "pulled ${HEADSCALE_IMAGE}"
