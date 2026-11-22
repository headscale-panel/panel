#!/usr/bin/env bash
# Start dev compose services and wait until Headscale (and panel in container mode) are healthy.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

PANEL_MODE="${PANEL_MODE:-${DEFAULT_PANEL_MODE}}"

for arg in "$@"; do
    case "${arg}" in
        --host) PANEL_MODE="${PANEL_MODE_HOST}" ;;
        --container) PANEL_MODE="${PANEL_MODE_CONTAINER}" ;;
        *) die "unknown option: ${arg}" ;;
    esac
done

load_dev_env
apply_dev_profile

services=("${DEV_INFRA_SERVICES[@]}")
if [[ "${PANEL_MODE}" == "${PANEL_MODE_CONTAINER}" ]]; then
    services=("${DEV_PANEL_SERVICE}" "${services[@]}")
fi

log_info "starting stack (profile=${PROFILE}, panel=${PANEL_MODE})"
compose up -d "${services[@]}"

wait_for_headscale
if [[ "${PANEL_MODE}" == "${PANEL_MODE_CONTAINER}" ]]; then
    wait_for_panel
fi

echo ""
log_ok "stack containers are running"
echo -e "  headscale  ${COLOR_BOLD}$(headscale_base_url)${COLOR_NC}"
if [[ "${PANEL_MODE}" == "${PANEL_MODE_CONTAINER}" ]]; then
    echo -e "  panel      ${COLOR_BOLD}$(panel_base_url)/panel${COLOR_NC}"
else
    echo -e "  panel      ${COLOR_BOLD}mise run backend:dev${COLOR_NC}"
fi
