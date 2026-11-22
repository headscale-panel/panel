#!/usr/bin/env bash
# Destroy containers, volumes, Headscale data, panel database, and dev state.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

ASSUME_YES=0
for arg in "$@"; do
    case "${arg}" in
        --yes | -y) ASSUME_YES=1 ;;
        *) die "unknown option: ${arg}" ;;
    esac
done

if ((!ASSUME_YES)); then
    echo -e "${COLOR_YELLOW}This will delete headscale data, the panel database and all dev volumes.${COLOR_NC}"
    read -r -p "Continue? [y/N] " reply
    [[ "${reply}" =~ ^[Yy]$ ]] || {
        log_info "aborted"
        exit 0
    }
fi

load_dev_env
apply_dev_profile

log_info "removing containers and volumes"
compose down -v --remove-orphans || true

log_info "removing generated dev data in ${DEV_DATA_DIR}"
rm -rf "${DEV_DATA_DIR}"

log_ok "dev environment reset"
