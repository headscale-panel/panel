#!/usr/bin/env bash
# Follow container logs for the local dev stack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

load_dev_env
apply_dev_profile

if [[ $# -eq 0 ]]; then
    compose logs -f "--tail=${LOG_TAIL_LINES}"
    exit 0
fi

compose logs -f "--tail=${LOG_TAIL_LINES}" "$@"
