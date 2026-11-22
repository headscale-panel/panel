#!/usr/bin/env bash
# Log dev Tailscale client containers into the local Headscale tailnet.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

login_client() {
    local container="$1"
    local auth_key="$2"
    local advertise_routes="$3"
    local accept_routes="$4"

    if tailscale_is_up "${container}"; then
        log_info "${container} already logged in"
        return 0
    fi

    local -a args=(
        up
        "--login-server=${HEADSCALE_INTERNAL_URL}"
        "--authkey=${auth_key}"
        "--accept-routes=${accept_routes}"
        "--accept-dns=false"
    )
    if [[ -n "${advertise_routes}" ]]; then
        args+=("--advertise-routes=${advertise_routes}")
    fi

    docker exec "${container}" tailscale "${args[@]}" >/dev/null
    log_ok "${container} connected to the tailnet"
}

load_dev_env
apply_dev_profile

[[ -f "${PREAUTH_STATE_FILE}" ]] || die "missing ${PREAUTH_STATE_FILE}; run mise run dev:bootstrap:identities first"
# shellcheck disable=SC1090
source "${PREAUTH_STATE_FILE}"

login_client "${CLIENT_A_CONTAINER}" "${PREAUTH_KEY_A}" "${NET_A_SUBNET}" "false"
login_client "${CLIENT_B_CONTAINER}" "${PREAUTH_KEY_B}" "" "true"
