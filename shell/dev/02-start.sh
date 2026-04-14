#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

check_deps

mapfile -t services < <(dev_services)

echo -e "${CYAN}[dev]${NC} Starting dev containers..."
dc up -d --build --wait "${services[@]}"

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Dev containers are running${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Start the backend:${NC}"
echo -e "  ${CYAN}cd backend && go run .${NC}"
echo ""
echo -e "${BOLD}Start the frontend:${NC}"
echo -e "  ${CYAN}cd frontend && pnpm dev${NC}"
echo ""
echo -e "${BOLD}Generate a Headscale API key (after setup wizard):${NC}"
echo -e "  ${CYAN}docker exec panel-dev-headscale headscale apikeys create${NC}"
echo ""
