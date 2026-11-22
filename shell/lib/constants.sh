#!/usr/bin/env bash
# Shared immutable constants for all mise-invoked shell modules.

# Guard against duplicate sourcing.
[[ -n "${_SHELL_LIB_CONSTANTS_LOADED:-}" ]] && return 0
readonly _SHELL_LIB_CONSTANTS_LOADED=1

# Resolve repository root from this library file if not provided by mise.
if [[ -z "${PROJECT_ROOT:-}" ]]; then
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi
readonly PROJECT_ROOT

# Directory layout
readonly SHELL_DIR="${PROJECT_ROOT}/shell"
readonly BACKEND_DIR="${PROJECT_ROOT}/backend"
readonly FRONTEND_DIR="${PROJECT_ROOT}/frontend"
readonly DEV_DATA_DIR="${PROJECT_ROOT}/dev-data"
readonly COMPOSE_DIR="${SHELL_DIR}/docker/dev"
readonly COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.yml"
readonly DOCKER_ENV_FILE="${COMPOSE_DIR}/.env"
readonly DOCKER_ENV_EXAMPLE_FILE="${COMPOSE_DIR}/.env.example"
readonly STATE_DIR="${DEV_DATA_DIR}/state"
readonly CERT_OUT_DIR="${DEV_DATA_DIR}/cert"
readonly HS_ETC_DIR="${DEV_DATA_DIR}/headscale/etc"
readonly HS_LIB_DIR="${DEV_DATA_DIR}/headscale/lib"
readonly PANEL_DATA_DIR="${DEV_DATA_DIR}/panel"
readonly INFLUXDB_DATA_DIR="${DEV_DATA_DIR}/influxdb"
readonly HS_ADAPTED_FILE="${BACKEND_DIR}/pkg/hsapi/adapted.go"
readonly HS_SPEC_DIR="${BACKEND_DIR}/pkg/hsapi/spec"

# State files
readonly API_KEY_STATE_FILE="${STATE_DIR}/api-key.env"
readonly PREAUTH_STATE_FILE="${STATE_DIR}/preauth.env"
readonly HS_CONFIG_FILE="${HS_ETC_DIR}/config.yaml"
readonly HS_EXTRA_RECORDS_FILE="${HS_LIB_DIR}/extra-records.json"

# Upstream repository and image naming
readonly DEFAULT_HS_REPO_URL="https://github.com/juanfont/headscale.git"
readonly HS_REPO_URL="${HS_REPO_URL:-${DEFAULT_HS_REPO_URL}}"
readonly DEFAULT_HEADSCALE_RELEASE_IMAGE="ghcr.io/juanfont/headscale:0.30.0"
readonly HS_DEV_IMAGE_REPO="headscale-panel-dev/headscale"
readonly HS_ALPINE_BASE_IMAGE="alpine:3.20"
readonly COMMIT_SHORT_LEN=7

# Container names
readonly HEADSCALE_CONTAINER="panel-dev-headscale"
readonly PANEL_CONTAINER="panel-dev-panel"
readonly INFLUXDB_CONTAINER="panel-dev-influxdb"
readonly CLIENT_A_CONTAINER="panel-dev-client-a"
readonly CLIENT_B_CONTAINER="panel-dev-client-b"
readonly TARGET_A_CONTAINER="panel-dev-target-a"
readonly TARGET_B_CONTAINER="panel-dev-target-b"

# Dev compose service names
readonly -a DEV_INFRA_SERVICES=(headscale influxdb client-a client-b target-a target-b)
readonly DEV_PANEL_SERVICE="panel"

# Dev network topology
readonly NET_A_SUBNET="172.31.0.0/24"
readonly TARGET_A_IP="172.31.0.10"
readonly TARGET_B_IP="172.32.0.10"

# Ports and URLs
readonly DEFAULT_HEADSCALE_HTTP_PORT="5080"
readonly DEFAULT_PANEL_HTTP_PORT="8090"
readonly PANEL_INTERNAL_HEALTH_URL="http://127.0.0.1:8080/panel/api/v1/healthz"
readonly HEADSCALE_INTERNAL_URL="http://headscale:8080"
readonly HS_API_HEALTH_PATH="/api/v1/health"
readonly HS_API_NODE_PATH="/api/v1/node"
readonly HS_VERSION_PATH="/version"
readonly PANEL_SETUP_STATUS_PATH="/panel/api/v1/setup/status"
readonly PANEL_SETUP_INIT_PATH="/panel/api/v1/setup/init"

# Dev bootstrap defaults
readonly DEFAULT_DEV_PROFILE="main"
readonly DEFAULT_PANEL_MODE="container"
readonly PANEL_MODE_CONTAINER="container"
readonly PANEL_MODE_HOST="host"
readonly DEFAULT_ADMIN_USERNAME="admin"
readonly DEFAULT_ADMIN_PASSWORD="dev-admin-password-1234"
readonly DEFAULT_ADMIN_EMAIL="admin@example.com"
readonly DEFAULT_BOOTSTRAP_TOKEN="dev-bootstrap-token-change-me-0123456789"
readonly DEV_USER_ALICE="alice"
readonly DEV_USER_BOB="bob"
readonly PREAUTH_EXPIRATION="24h"
readonly EXPECTED_ONLINE_NODES=2

# Timeouts and polling
readonly HEALTH_TIMEOUT_SECONDS=180
readonly HEALTH_POLL_INTERVAL_SECONDS=2
readonly ROUTE_UNREACHABLE_ATTEMPTS=15
readonly ROUTE_REACHABLE_ATTEMPTS=8
readonly ROUTE_POLL_INTERVAL_SECONDS=1
readonly PING_TIMEOUT_SECONDS=2
readonly LOG_TAIL_LINES=100
readonly ERROR_LOG_TAIL_LINES=60

# Certificate defaults
readonly DEFAULT_CERT_CN="headscale"
readonly DEFAULT_CERT_ORG="headscale-panel"
readonly DEFAULT_CA_CN="Headscale Private CA"
readonly DEFAULT_CERT_DAYS=825
readonly DEFAULT_CA_DAYS=3650
readonly RSA_SERVER_KEY_BITS=2048
readonly RSA_CA_KEY_BITS=4096
readonly -a DEFAULT_SELF_SIGNED_SANS=(
    "DNS:localhost"
    "DNS:headscale"
    "DNS:panel"
    "IP:127.0.0.1"
    "IP:::1"
)

# Regex patterns
readonly IPV4_REGEX='^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'
readonly HS_API_KEY_REGEX='hskey-api-[A-Za-z0-9-]+'
readonly ADAPTED_COMMIT_SED_EXPR='s/.*AdaptedHeadscaleCommit *= *"\([^"]*\)".*/\1/p'
readonly TUN_DEVICE_PATH="/dev/net/tun"

# ANSI colors
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[1;33m'
readonly COLOR_CYAN='\033[0;36m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_BOLD='\033[1m'
readonly COLOR_NC='\033[0m'
