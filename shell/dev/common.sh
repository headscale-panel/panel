#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_SHELL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_DIR="$ROOT_SHELL_DIR/docker/dev"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
ENV_FILE="$COMPOSE_DIR/.env"
ENV_EXAMPLE_FILE="$COMPOSE_DIR/.env.example"
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

dc() {
    if [[ "$WITH_DERP" == "true" ]]; then
        docker compose -f "$COMPOSE_FILE" --profile derp "$@"
    else
        docker compose -f "$COMPOSE_FILE" "$@"
    fi
}

dc_all() {
    docker compose -f "$COMPOSE_FILE" --profile derp "$@"
}

dev_services() {
    local services=(headscale)
    if [[ "$WITH_DERP" == "true" ]]; then
        services+=(headscale-derp)
    fi
    printf '%s\n' "${services[@]}"
}

init_env_if_needed() {
    if [[ ! -f "$ENV_FILE" ]]; then
        echo -e "${YELLOW}[init]${NC} .env not found, copying from .env.example..."
        cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
        echo -e "${YELLOW}[init]${NC} Generated $ENV_FILE"
        echo -e "${YELLOW}[init]${NC} Please update it as needed before continuing."
    fi
}

ensure_data_dirs() {
    mkdir -p "$COMPOSE_DIR/data/headscale"
    if [[ "$WITH_DERP" == "true" ]]; then
        mkdir -p "$COMPOSE_DIR/data/derp"
    fi
}

print_api_key_hint() {
    echo -e "${YELLOW}${BOLD}[hint] A Headscale API key is required before running the local backend${NC}"
    echo -e "  1. Run: ${CYAN}docker exec panel-dev-headscale headscale apikeys create${NC}"
    echo -e "  2. Put the key in: ${BOLD}backend/.env${NC} under HEADSCALE_API_KEY"
    echo -e "  3. Recommended local backend settings:"
    echo -e "     ${CYAN}HEADSCALE_GRPC_ADDR=localhost:50443${NC}"
    echo -e "     ${CYAN}HEADSCALE_INSECURE=true${NC}"
    echo ""
}
