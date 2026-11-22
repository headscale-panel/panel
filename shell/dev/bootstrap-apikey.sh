#!/usr/bin/env bash
# Mint or reuse the Headscale admin API key for the local dev stack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

extract_api_key() {
    grep -oE "${HS_API_KEY_REGEX}" | head -n1 || true
}

load_dev_env
apply_dev_profile

readonly HEALTH_URL="$(headscale_base_url)${HS_API_HEALTH_PATH}"

if [[ -f "${API_KEY_STATE_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${API_KEY_STATE_FILE}"
    if [[ -n "${HEADSCALE_API_KEY:-}" ]] &&
        curl -fsS -o /dev/null -H "Authorization: Bearer ${HEADSCALE_API_KEY}" "${HEALTH_URL}"; then
        log_info "reusing existing headscale API key"
        exit 0
    fi
    log_warn "stored API key no longer works, minting a new one"
fi

raw_output="$(hs_cli apikeys create)"
api_key="$(printf '%s' "${raw_output}" | extract_api_key)"
[[ -n "${api_key}" ]] || die "failed to create a headscale API key"

umask 077
printf 'HEADSCALE_API_KEY=%s\n' "${api_key}" >"${API_KEY_STATE_FILE}"
log_ok "minted headscale API key"
