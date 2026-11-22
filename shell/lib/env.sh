#!/usr/bin/env bash
# Shared environment, profile, and adapted-commit helpers.

[[ -n "${_SHELL_LIB_ENV_LOADED:-}" ]] && return 0
readonly _SHELL_LIB_ENV_LOADED=1

_ENV_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.sh
source "${_ENV_LIB_DIR}/constants.sh"
# shellcheck source=log.sh
source "${_ENV_LIB_DIR}/log.sh"

load_dev_env() {
    if [[ ! -f "${DOCKER_ENV_FILE}" ]]; then
        cp "${DOCKER_ENV_EXAMPLE_FILE}" "${DOCKER_ENV_FILE}"
        log_info "created ${DOCKER_ENV_FILE} from .env.example"
    fi
    set -a
    # shellcheck disable=SC1090
    source "${DOCKER_ENV_FILE}"
    set +a
    mkdir -p "${STATE_DIR}"
}

read_adapted_commit() {
    [[ -f "${HS_ADAPTED_FILE}" ]] || die "missing ${HS_ADAPTED_FILE}"
    local commit
    commit="$(sed -n "${ADAPTED_COMMIT_SED_EXPR}" "${HS_ADAPTED_FILE}" | head -n1)"
    [[ -n "${commit}" ]] || die "AdaptedHeadscaleCommit not found in ${HS_ADAPTED_FILE}"
    printf '%s' "${commit}"
}

short_commit() {
    local commit="$1"
    printf '%s' "${commit:0:${COMMIT_SHORT_LEN}}"
}

adapted_image_tag() {
    local commit="$1"
    printf '%s:%s' "${HS_DEV_IMAGE_REPO}" "$(short_commit "${commit}")"
}

apply_dev_profile() {
    export PROFILE="${PROFILE:-${DEFAULT_DEV_PROFILE}}"
    export DEV_DATA_DIR
    if [[ "${HS_BUILD_FROM_SOURCE:-0}" == "1" ]]; then
        local commit
        commit="$(read_adapted_commit)"
        export HEADSCALE_IMAGE="${HEADSCALE_IMAGE_SOURCE:-$(adapted_image_tag "${commit}")}"
    else
        export HEADSCALE_IMAGE="${HEADSCALE_IMAGE_RELEASE:-${DEFAULT_HEADSCALE_RELEASE_IMAGE}}"
    fi
}

headscale_base_url() {
    printf 'http://localhost:%s' "${HEADSCALE_HTTP_PORT:-${DEFAULT_HEADSCALE_HTTP_PORT}}"
}

panel_base_url() {
    printf 'http://localhost:%s' "${PANEL_HTTP_PORT:-${DEFAULT_PANEL_HTTP_PORT}}"
}
