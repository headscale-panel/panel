#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 02-private-ca.sh — Create a private CA + sign a cert for headscale gRPC.
#
# Generates:
#   ca.key      — CA private key (keep secret)
#   ca.crt      — CA certificate  (paste into headscale-panel "Custom CA Cert")
#   server.key  — headscale server private key
#   server.crt  — headscale server certificate signed by the private CA
#
# Usage:
#   CN=headscale.internal bash 02-private-ca.sh
#   CN=192.168.1.10       bash 02-private-ca.sh   # IP address
#
# Output directory:
#   shell/docker/dev/cert
#
# After running, add the cert paths to headscale config:
#   grpc_listen_addr: 0.0.0.0:50443
#   tls_cert_path: /path/to/server.crt
#   tls_key_path:  /path/to/server.key
#
# In headscale-panel Settings → Connection:
#   Enable TLS: ON
#   Skip TLS verification: OFF
#   Custom CA Certificate: paste contents of ca.crt
# ---------------------------------------------------------------------------
set -euo pipefail

CN="${CN:-headscale.internal}"
DAYS_CA=3650   # 10 years
DAYS_CERT=825  # ~2 years

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/../docker/dev/cert"
mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"
cd "${OUT_DIR}"

echo "==> Generating CA key and certificate…"
openssl genrsa -out ca.key 4096
openssl req -new -x509 -key ca.key -out ca.crt -days "${DAYS_CA}" \
  -subj "/CN=Headscale Private CA/O=headscale-panel" \
  -addext "basicConstraints=critical,CA:TRUE"

echo "==> Generating server key and CSR…"
openssl genrsa -out server.key 2048

# Build SAN extension: if CN looks like an IP, use IP SAN; otherwise DNS SAN.
if [[ "${CN}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SAN="IP:${CN}"
else
  SAN="DNS:${CN}"
fi

cat > server.ext <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions     = v3_req
[req_distinguished_name]
[v3_req]
subjectAltName = ${SAN}
EOF

openssl req -new -key server.key -out server.csr \
  -subj "/CN=${CN}/O=headscale-panel"

echo "==> Signing server certificate with private CA…"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days "${DAYS_CERT}" \
  -extfile server.ext -extensions v3_req

echo ""
echo "==> Done. Files written to: ${OUT_DIR}"
echo ""
echo "    headscale config:"
echo "      tls_cert_path: ${OUT_DIR}/server.crt"
echo "      tls_key_path:  ${OUT_DIR}/server.key"
echo ""
echo "    headscale-panel → Custom CA Certificate:"
echo "      Paste the contents of: ${OUT_DIR}/ca.crt"
cat ca.crt
