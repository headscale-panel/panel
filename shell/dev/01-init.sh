#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

copy_env_if_missing() {
    local src="$1" dst="$2" label="$3"
    if [[ ! -f "$src" ]]; then
        echo -e "${RED}[error]${NC} Missing env template: $src" >&2
        exit 1
    fi
    if [[ -f "$dst" ]]; then
        echo -e "${YELLOW}[init]${NC} $label .env already exists, keeping: $dst"
        return
    fi
    cp "$src" "$dst"
    echo -e "${GREEN}[init]${NC} Created $label .env: $dst"
}

# ── Step 1: Init env files ───────────────────────────────────────────────────
echo -e "${CYAN}[init]${NC} Initializing env files..."
copy_env_if_missing "$DOCKER_ENV_EXAMPLE_FILE" "$DOCKER_ENV_FILE" "docker/dev"
copy_env_if_missing "$BACKEND_ENV_EXAMPLE_FILE" "$BACKEND_ENV_FILE" "backend"

# ── Step 2: Create headscale config files if missing ────────────────────────
echo -e "${CYAN}[init]${NC} Ensuring headscale config files exist..."

HS_ETC_DIR="$BACKEND_DIR/data/headscale/etc"
HS_LIB_DIR="$BACKEND_DIR/data/headscale/lib"
mkdir -p "$HS_ETC_DIR" "$HS_LIB_DIR"

if [[ ! -f "$HS_ETC_DIR/config.yaml" ]]; then
    cat > "$HS_ETC_DIR/config.yaml" <<'EOF'
server_url: https://vpn.example.com
listen_addr: 0.0.0.0:8080
metrics_listen_addr: 0.0.0.0:9090
grpc_listen_addr: 0.0.0.0:50443
grpc_allow_insecure: true
private_key_path: /var/lib/headscale/private.key
noise:
    private_key_path: /var/lib/headscale/noise_private.key
prefixes:
    v4: 100.100.0.0/16
    v6: 64:ff9b::/96
    allocation: sequential
derp:
    server:
        enabled: false
    paths:
        - /etc/headscale/derp-custom.yaml
database:
    type: sqlite
    sqlite:
        path: /var/lib/headscale/db.sqlite
        write_ahead_log: true
dns:
    base_domain: example.net
    magic_dns: true
    nameservers:
        global:
            - 1.1.1.1
            - 1.0.0.1
    override_local_dns: true
policy:
    mode: database
EOF
    echo -e "${GREEN}[init]${NC} Created headscale config: $HS_ETC_DIR/config.yaml"
else
    echo -e "${YELLOW}[init]${NC} Headscale config already exists, keeping: $HS_ETC_DIR/config.yaml"
fi

if [[ ! -f "$HS_ETC_DIR/derp-custom.yaml" ]]; then
    cat > "$HS_ETC_DIR/derp-custom.yaml" <<'EOF'
regions:
  900:
    regionid: 900
    regioncode: custom
    regionname: My Region
    nodes:
      - name: 900a
        regionid: 900
        hostname: myderp.example.com
        stunport: 0
        stunonly: false
        derpport: 0
EOF
    echo -e "${GREEN}[init]${NC} Created DERP map: $HS_ETC_DIR/derp-custom.yaml"
else
    echo -e "${YELLOW}[init]${NC} DERP map already exists, keeping: $HS_ETC_DIR/derp-custom.yaml"
fi

if [[ ! -f "$HS_LIB_DIR/extra-records.json" ]]; then
    echo '[]' > "$HS_LIB_DIR/extra-records.json"
    echo -e "${GREEN}[init]${NC} Created extra records: $HS_LIB_DIR/extra-records.json"
else
    echo -e "${YELLOW}[init]${NC} Extra records already exist, keeping: $HS_LIB_DIR/extra-records.json"
fi

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Initialization complete${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════${NC}"
echo -e "${CYAN}[info]${NC} Next: run ${BOLD}./shell/dev/02-start.sh${NC} to start containers."
echo ""
