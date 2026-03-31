#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

check_deps
init_env_if_needed
ensure_data_dirs

mapfile -t services < <(dev_services)

echo -e "${YELLOW}[dev]${NC} Restarting external dev dependencies..."
dc restart "${services[@]}"
echo -e "${GREEN}[dev]${NC} Restarted."
