#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

check_deps

echo -e "${YELLOW}[reset]${NC} Stopping containers..."
dc_all down -v --remove-orphans 2>/dev/null || true

echo -e "${YELLOW}[reset]${NC} Removing headscale config data..."
rm -rf "$BACKEND_DIR/data/headscale"

echo -e "${YELLOW}[reset]${NC} Removing docker volume data..."
rm -rf "$COMPOSE_DIR/data"

echo ""
echo -e "${GREEN}[reset]${NC} Reset complete."
echo -e "${CYAN}[info]${NC} Run ${BOLD}./shell/dev/01-init.sh${NC} to reinitialize."
