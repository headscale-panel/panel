#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 01-self-signed.sh — Generate a self-signed cert for headscale gRPC.
#
# Use this when you want TLS encryption but don't need a trusted CA.
# Enable "Skip TLS Certificate Verification" in headscale-panel for this.
#
# Generates:
#   selfsigned.key  — server private key
#   selfsigned.crt  — self-signed server certificate
#
# Usage:
#   CN=headscale          bash 01-self-signed.sh
#   CN=192.168.1.10       bash 01-self-signed.sh   # IP address
#
# Output directory:
#   shell/docker/dev/cert
#
# After running, add to headscale config:
#   grpc_listen_addr: 0.0.0.0:50443
#   tls_cert_path: /path/to/selfsigned.crt
#   tls_key_path:  /path/to/selfsigned.key
#
# In headscale-panel Settings → Connection:
#   Enable TLS: ON
#   Skip TLS verification: ON   ← required for self-signed
#   Custom CA Certificate: leave empty
# ---------------------------------------------------------------------------
set -euo pipefail

CN="${CN:-headscale}"
DAYS=825  # ~2 years

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/../docker/dev/cert"
mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"
cd "${OUT_DIR}"

# Build SAN extension: IP or DNS
if [[ "${CN}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SAN="IP:${CN}"
else
  SAN="DNS:${CN}"
fi

echo "==> Generating self-signed certificate for ${CN} (SAN: ${SAN})…"

openssl req -x509 -newkey rsa:2048 -keyout selfsigned.key -out selfsigned.crt \
  -days "${DAYS}" -nodes \
  -subj "/CN=${CN}/O=headscale-panel" \
  -addext "subjectAltName=${SAN}"

echo ""
echo "==> Done. Files written to: ${OUT_DIR}"
echo ""
echo "    headscale config:"
echo "      tls_cert_path: ${OUT_DIR}/selfsigned.crt"
echo "      tls_key_path:  ${OUT_DIR}/selfsigned.key"
echo ""
echo "    headscale-panel: enable 'Skip TLS Certificate Verification'."
