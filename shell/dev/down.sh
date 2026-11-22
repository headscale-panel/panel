#!/usr/bin/env bash
# Stop the local dev stack, optionally removing volumes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

WITH_VOLUMES=0
for arg in "$@"; do
    case "${arg}" in
        --volumes | -v) WITH_VOLUMES=1 ;;
        *) die "unknown option: ${arg}" ;;
    esac
done

load_dev_env
apply_dev_profile

if ((WITH_VOLUMES)); then
    compose down -v --remove-orphans
    log_ok "stack stopped and volumes removed"
else
    compose down
    log_ok "stack stopped (volumes kept)"
fi
