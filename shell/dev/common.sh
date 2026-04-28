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
    if [[ ! -c /dev/net/tun ]]; then
        echo -e "${RED}[error]${NC} /dev/net/tun is unavailable; tailscale router requires TUN support" >&2
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
    docker compose -f "$COMPOSE_FILE" "$@"
}

dc_all() {
    docker compose -f "$COMPOSE_FILE" "$@"
}

dev_services() {
    local services=(headscale influxdb tailscale-router tailnet-nginx)
    printf '%s\n' "${services[@]}"
}

print_tailscale_login_instructions() {
    local login_server
    local advertise_routes
    local headscale_http_port
    local gateway_login_server
    local -a host_ips
    local -a client_login_servers
    local ip

    login_server="http://headscale:8080"
    advertise_routes="172.30.0.0/24"
    headscale_http_port="5080"
    gateway_login_server="http://172.30.0.1:${headscale_http_port}"

    mapfile -t host_ips < <(
        ip -4 -o addr show scope global up 2>/dev/null \
            | awk '
                $2 ~ /^(docker|br-|veth|cni|flannel|tailscale|tun|tap|virbr|podman|lxc|lxdbr)/ { next }
                { split($4, addr, "/"); print addr[1] }
            ' \
            | sort -u || true
    )

    client_login_servers=("$gateway_login_server")
    for ip in "${host_ips[@]}"; do
        client_login_servers+=("http://${ip}:${headscale_http_port}")
    done

    echo -e "${BOLD}Use a pre-auth key to connect the test router to Headscale:${NC}"
    echo -e "  ${CYAN}docker exec -it panel-dev-tailscale-router tailscale up --login-server=${login_server} --authkey=<PREAUTH_KEY> --accept-dns=false --accept-routes=false --advertise-routes=${advertise_routes}${NC}"
    echo -e "${BOLD}Use a pre-auth key to connect other clients to Headscale:${NC}"
    for login_server in "${client_login_servers[@]}"; do
        echo -e "  ${CYAN}tailscale up --login-server=${login_server} --authkey=<PREAUTH_KEY>${NC}"
    done
    echo ""
}

