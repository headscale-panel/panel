#!/usr/bin/env bash
# Shared Docker, Docker Compose, Headscale CLI, and healthcheck helpers.

[[ -n "${_SHELL_LIB_DOCKER_LOADED:-}" ]] && return 0
readonly _SHELL_LIB_DOCKER_LOADED=1

_DOCKER_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.sh
source "${_DOCKER_LIB_DIR}/constants.sh"
# shellcheck source=log.sh
source "${_DOCKER_LIB_DIR}/log.sh"

compose() {
    docker compose -f "${COMPOSE_FILE}" "$@"
}

image_exists_locally() {
    docker image inspect "$1" >/dev/null 2>&1
}

hs_cli() {
    docker exec "${HEADSCALE_CONTAINER}" headscale "$@"
}

tailscale_is_up() {
    docker exec "$1" tailscale status >/dev/null 2>&1
}

container_ping_ok() {
    local container="$1"
    local target="$2"
    docker exec "${container}" ping -c1 -W"${PING_TIMEOUT_SECONDS}" "${target}" >/dev/null 2>&1
}

wait_for_headscale() {
    local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
    while ((SECONDS < deadline)); do
        if docker exec "${HEADSCALE_CONTAINER}" headscale health >/dev/null 2>&1; then
            log_ok "headscale is healthy"
            return 0
        fi
        sleep "${HEALTH_POLL_INTERVAL_SECONDS}"
    done
    docker logs --tail "${ERROR_LOG_TAIL_LINES}" "${HEADSCALE_CONTAINER}" >&2 || true
    die "headscale did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s"
}

wait_for_panel() {
    local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
    while ((SECONDS < deadline)); do
        if docker exec "${PANEL_CONTAINER}" wget -qO- "${PANEL_INTERNAL_HEALTH_URL}" >/dev/null 2>&1; then
            log_ok "panel is healthy"
            return 0
        fi
        sleep "${HEALTH_POLL_INTERVAL_SECONDS}"
    done
    docker logs --tail "${ERROR_LOG_TAIL_LINES}" "${PANEL_CONTAINER}" >&2 || true
    die "panel did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s"
}
