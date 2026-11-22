#!/usr/bin/env bash
# Initialize the panel admin account and Headscale API connection via /setup/init.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"

load_dev_env
apply_dev_profile

[[ -f "${API_KEY_STATE_FILE}" ]] || die "missing ${API_KEY_STATE_FILE}; run mise run dev:bootstrap:apikey first"
# shellcheck disable=SC1090
source "${API_KEY_STATE_FILE}"

readonly STATUS_URL="$(panel_base_url)${PANEL_SETUP_STATUS_PATH}"
readonly INIT_URL="$(panel_base_url)${PANEL_SETUP_INIT_PATH}"

readonly ADMIN_USER="${PANEL_ADMIN_USERNAME:-${DEFAULT_ADMIN_USERNAME}}"
readonly ADMIN_PASS="${PANEL_ADMIN_PASSWORD:-${DEFAULT_ADMIN_PASSWORD}}"
readonly ADMIN_EMAIL="${PANEL_ADMIN_EMAIL:-${DEFAULT_ADMIN_EMAIL}}"
readonly BOOTSTRAP_TOKEN="${SETUP_BOOTSTRAP_TOKEN:-${DEFAULT_BOOTSTRAP_TOKEN}}"

status="$(curl -fsS -H "X-Setup-Bootstrap-Token: ${BOOTSTRAP_TOKEN}" "${STATUS_URL}" 2>/dev/null)" || {
    log_warn "panel API not reachable at ${STATUS_URL}, skipping panel initialization"
    exit 0
}

if printf '%s' "${status}" | grep -q '"initialized":true'; then
    log_info "panel already initialized"
    exit 0
fi

init_token="$(printf '%s' "${status}" | sed -n 's/.*"init_token":"\([^"]*\)".*/\1/p')"

if command -v jq >/dev/null 2>&1; then
    payload="$(jq -n \
        --arg headscale_api_addr "${HEADSCALE_INTERNAL_URL}" \
        --arg api_key "${HEADSCALE_API_KEY}" \
        --arg username "${ADMIN_USER}" \
        --arg password "${ADMIN_PASS}" \
        --arg email "${ADMIN_EMAIL}" \
        '{headscale_api_addr: $headscale_api_addr, api_key: $api_key, username: $username, password: $password, email: $email}')"
else
    payload="$(python3 -c 'import json, sys; print(json.dumps({"headscale_api_addr": sys.argv[1], "api_key": sys.argv[2], "username": sys.argv[3], "password": sys.argv[4], "email": sys.argv[5]}))' \
        "${HEADSCALE_INTERNAL_URL}" "${HEADSCALE_API_KEY}" "${ADMIN_USER}" "${ADMIN_PASS}" "${ADMIN_EMAIL}")"
fi

curl_headers=(
    -H "Content-Type: application/json"
    -H "X-Setup-Bootstrap-Token: ${BOOTSTRAP_TOKEN}"
)
if [[ -n "${init_token}" ]]; then
    curl_headers+=(-H "X-Setup-Init-Token: ${init_token}")
fi

if curl -fsS -X POST \
    "${curl_headers[@]}" \
    -d "${payload}" \
    "${INIT_URL}" >/dev/null 2>&1; then
    log_ok "panel initialized via ${PANEL_SETUP_INIT_PATH}"
    exit 0
fi

log_warn "panel initialization failed; complete it at $(panel_base_url)/panel/setup"
