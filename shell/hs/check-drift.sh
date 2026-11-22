#!/usr/bin/env bash
# CI gate: ensure the vendored OpenAPI document matches AdaptedHeadscaleCommit.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"

readonly COMMIT="$(read_adapted_commit)"
readonly SHORT="$(short_commit "${COMMIT}")"
readonly EXPECTED_SPEC="${HS_SPEC_DIR}/headscale-${SHORT}.yaml"

if [[ ! -f "${EXPECTED_SPEC}" ]]; then
    log_err "missing OpenAPI document for adapted commit ${SHORT}"
    log_err "expected: ${EXPECTED_SPEC}"
    log_err "run: mise run hs:vendor-spec -- ${COMMIT}"
    exit 1
fi

log_ok "spec matches adapted commit ${SHORT}"
