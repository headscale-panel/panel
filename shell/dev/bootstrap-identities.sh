#!/usr/bin/env bash
# Ensure dev Headscale users (alice, bob) exist and mint reusable pre-auth keys.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

find_user_id() {
    local name="$1"
    hs_cli users list 2>/dev/null | awk -v target="${name}" '
        $0 ~ target { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+$/) { print $i; exit } }
    '
}

ensure_user() {
    local name="$1"
    local id
    id="$(find_user_id "${name}")"
    if [[ -n "${id}" ]]; then
        printf '%s\n' "${id}"
        return 0
    fi
    hs_cli users create "${name}" >/dev/null 2>&1 || true
    id="$(find_user_id "${name}")"
    [[ -n "${id}" ]] || die "failed to create headscale user '${name}'"
    printf '%s\n' "${id}"
}

create_preauth_key() {
    local user_id="$1"
    hs_cli preauthkeys create --user "${user_id}" --reusable --expiration "${PREAUTH_EXPIRATION}" 2>/dev/null ||
        hs_cli preauthkeys create -u "${user_id}" --reusable --expiration "${PREAUTH_EXPIRATION}" 2>/dev/null
}

load_dev_env
apply_dev_profile

uid_a="$(ensure_user "${DEV_USER_ALICE}")"
uid_b="$(ensure_user "${DEV_USER_BOB}")"
log_ok "network identities ready (${DEV_USER_ALICE}=${uid_a} ${DEV_USER_BOB}=${uid_b})"

key_a="$(create_preauth_key "${uid_a}")"
key_b="$(create_preauth_key "${uid_b}")"
[[ -n "${key_a}" && -n "${key_b}" ]] || die "failed to create pre-auth keys"

umask 077
printf 'PREAUTH_KEY_A=%s\nPREAUTH_KEY_B=%s\n' "${key_a}" "${key_b}" >"${PREAUTH_STATE_FILE}"
log_ok "pre-auth keys stored in ${PREAUTH_STATE_FILE}"
