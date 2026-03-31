#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

PROJECT_ROOT="$(cd "$ROOT_SHELL_DIR/.." && pwd)"

BACKEND_ENV_EXAMPLE="$PROJECT_ROOT/backend/.env.example"
BACKEND_ENV="$PROJECT_ROOT/backend/.env"

FRONTEND_ENV_EXAMPLE="$PROJECT_ROOT/frontend/.env.example"
FRONTEND_ENV="$PROJECT_ROOT/frontend/.env"

copy_env_if_missing() {
    local env_example="$1"
    local env_file="$2"
    local label="$3"

    if [[ ! -f "$env_example" ]]; then
        echo -e "${RED}[error]${NC} Missing template for $label env: $env_example" >&2
        exit 1
    fi

    if [[ -f "$env_file" ]]; then
        echo -e "${YELLOW}[init]${NC} $label env already exists, keeping current file: $env_file"
        return
    fi

    cp "$env_example" "$env_file"
    echo -e "${GREEN}[init]${NC} Created $label env: $env_file"
}

echo -e "${CYAN}[init]${NC} Initializing backend and frontend env files..."

copy_env_if_missing "$BACKEND_ENV_EXAMPLE" "$BACKEND_ENV" "backend"
copy_env_if_missing "$FRONTEND_ENV_EXAMPLE" "$FRONTEND_ENV" "frontend"

echo ""
echo -e "${GREEN}${BOLD}Environment initialization complete.${NC}"
echo -e "${BOLD}Next manual steps:${NC}"
echo -e "  1. Start dependencies if needed: ${CYAN} ./shell/dev/start.sh${NC}"
echo -e "  2. Generate Headscale API key: ${CYAN}docker exec panel-dev-headscale headscale apikeys create${NC}"
echo -e "  3. Update ${BOLD}backend/.env${NC}: set ${CYAN}HEADSCALE_API_KEY=<generated_key>${NC}"
echo -e "  4. Update ${BOLD}frontend/.env${NC}: set ${CYAN}VITE_OAUTH_PORTAL_URL${NC} and ${CYAN}VITE_APP_ID${NC}"
echo -e "  5. Update ${BOLD}frontend/.env${NC}: set ${CYAN}VITE_FRONTEND_FORGE_API_KEY${NC} (required for MapView)"
echo ""