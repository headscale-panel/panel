#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

check_deps
init_env_if_needed
ensure_data_dirs

mapfile -t services < <(dev_services)

echo -e "${CYAN}[dev]${NC} Starting external dev dependencies..."
dc up -d --build --wait "${services[@]}"

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  External dependency environment is up${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════${NC}"
echo -e "${CYAN}[info]${NC} See README.md for ports, commands, and next steps."
echo ""
