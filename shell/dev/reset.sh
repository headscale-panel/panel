#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

check_deps
init_env_if_needed

echo -e "${YELLOW}[dev]${NC} Cleaning dependency containers and volumes (.env preserved)..."
dc_all down -v --remove-orphans

echo -e "${YELLOW}[dev]${NC} Cleaning data directories..."
rm -rf "$COMPOSE_DIR/data/headscale" "$COMPOSE_DIR/data/derp"
ensure_data_dirs

echo -e "${GREEN}[dev]${NC} Dev environment data has been reset (.env preserved)."
