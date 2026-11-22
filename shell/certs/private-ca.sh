#!/usr/bin/env bash
# Generate a private CA and sign a Headscale server certificate.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/log.sh
source "${SCRIPT_DIR}/../lib/log.sh"

readonly CERT_CN="${CN:-${DEFAULT_CERT_CN}}"
readonly CA_DAYS="${DAYS_CA:-${DEFAULT_CA_DAYS}}"
readonly SERVER_DAYS="${DAYS_CERT:-${DEFAULT_CERT_DAYS}}"
readonly SAN_TOKEN_REGEX='^[A-Za-z0-9._:-]+$'

[[ "${CERT_CN}" =~ ${SAN_TOKEN_REGEX} ]] || die "invalid CERT_CN: ${CERT_CN}"

mkdir -p "${CERT_OUT_DIR}"
cd "${CERT_OUT_DIR}"

log_info "generating CA key and certificate"
(
    umask 077
    openssl genrsa -out ca.key "${RSA_CA_KEY_BITS}"
)
chmod 600 ca.key
openssl req -new -x509 -key ca.key -out ca.crt -days "${CA_DAYS}" \
    -subj "/CN=${DEFAULT_CA_CN}/O=${DEFAULT_CERT_ORG}" \
    -addext "basicConstraints=critical,CA:TRUE"

log_info "generating server key and CSR"
(
    umask 077
    openssl genrsa -out server.key "${RSA_SERVER_KEY_BITS}"
)
chmod 600 server.key

if [[ "${CERT_CN}" =~ ${IPV4_REGEX} ]]; then
    SAN="IP:${CERT_CN}"
else
    SAN="DNS:${CERT_CN}"
fi

cat >server.ext <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions     = v3_req
[req_distinguished_name]
[v3_req]
subjectAltName = ${SAN}
EOF

openssl req -new -key server.key -out server.csr \
    -subj "/CN=${CERT_CN}/O=${DEFAULT_CERT_ORG}"

log_info "signing server certificate with private CA"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out server.crt -days "${SERVER_DAYS}" \
    -extfile server.ext -extensions v3_req

log_ok "files written to ${CERT_OUT_DIR}"
echo "    tls.cert_path: ${CERT_OUT_DIR}/server.crt"
echo "    tls.key_path:  ${CERT_OUT_DIR}/server.key"
echo "    custom CA:     ${CERT_OUT_DIR}/ca.crt"
cat ca.crt
