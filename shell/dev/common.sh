#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_SHELL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$ROOT_SHELL_DIR/.." && pwd)"
COMPOSE_DIR="$ROOT_SHELL_DIR/docker/dev"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
DOCKER_ENV_FILE="$COMPOSE_DIR/.env"
DOCKER_ENV_EXAMPLE_FILE="$COMPOSE_DIR/.env.example"
BACKEND_DIR="$PROJECT_ROOT/backend"
BACKEND_ENV_FILE="$BACKEND_DIR/.env"
BACKEND_ENV_EXAMPLE_FILE="$BACKEND_DIR/.env.example"
WITH_DERP="${WITH_DERP:-false}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

check_deps() {
    if ! command -v docker >/dev/null 2>&1; then
        echo -e "${RED}[error]${NC} docker is not installed or not in PATH" >&2
        exit 1
    fi
    if ! docker compose version >/dev/null 2>&1; then
        echo -e "${RED}[error]${NC} docker compose plugin is unavailable (Docker 20.10+ required)" >&2
        exit 1
    fi
}

check_go() {
    if ! command -v go >/dev/null 2>&1; then
        echo -e "${RED}[error]${NC} go is not installed or not in PATH" >&2
        exit 1
    fi
}

dc() {
    local profiles=()
    if [[ "$WITH_DERP" == "true" ]]; then
        profiles+=(--profile derp)
    fi
    docker compose -f "$COMPOSE_FILE" "${profiles[@]}" "$@"
}

dc_all() {
    docker compose -f "$COMPOSE_FILE" --profile derp "$@"
}

dev_services() {
    local services=(headscale influxdb)
    if [[ "$WITH_DERP" == "true" ]]; then
        services+=(headscale-derp)
    fi
    printf '%s\n' "${services[@]}"
}

