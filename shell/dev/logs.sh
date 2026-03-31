#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

check_deps
mapfile -t services < <(dev_services)

echo -e "${CYAN}[dev]${NC} Showing external dependency logs (Ctrl+C to exit)..."
dc logs -f "${services[@]}"
