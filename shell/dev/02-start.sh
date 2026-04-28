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
echo -e "${BOLD}External services:${NC}"
echo -e "  ${CYAN}- Headscale${NC}"
echo -e "  ${CYAN}- InfluxDB${NC}"
echo -e "  ${CYAN}- Tailscale subnet router${NC}"
echo -e "  ${CYAN}- Tailnet-only nginx test target (http://172.30.0.10)${NC}"
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
print_tailscale_login_instructions
