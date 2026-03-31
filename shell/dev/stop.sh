#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

check_deps

echo -e "${YELLOW}[dev]${NC} Stopping and removing external dev dependency containers..."
dc_all down
echo -e "${GREEN}[dev]${NC} Stopped."
