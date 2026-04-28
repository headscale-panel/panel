#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

check_deps

mapfile -t services < <(dev_services)

echo -e "${YELLOW}[dev]${NC} Restarting dev containers..."
dc restart "${services[@]}"
echo -e "${GREEN}[dev]${NC} Containers restarted."
echo ""
print_tailscale_login_instructions
