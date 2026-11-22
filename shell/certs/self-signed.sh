#!/usr/bin/env bash
# Generate a self-signed TLS certificate covering the dev stack names and host LAN IP.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/log.sh
source "${SCRIPT_DIR}/../lib/log.sh"

readonly CERT_CN="${CN:-${DEFAULT_CERT_CN}}"
readonly CERT_DAYS="${DAYS:-${DEFAULT_CERT_DAYS}}"
readonly SAN_TOKEN_REGEX='^[A-Za-z0-9._:-]+$'

[[ "${CERT_CN}" =~ ${SAN_TOKEN_REGEX} ]] || die "invalid CERT_CN: ${CERT_CN}"

mkdir -p "${CERT_OUT_DIR}"
cd "${CERT_OUT_DIR}"

san_entries=("${DEFAULT_SELF_SIGNED_SANS[@]}")

add_san() {
    local value="$1"
    [[ -n "${value}" ]] || return 0
    [[ "${value}" =~ ${SAN_TOKEN_REGEX} ]] || die "invalid SAN entry: ${value}"
    if [[ "${value}" =~ ${IPV4_REGEX} ]]; then
        san_entries+=("IP:${value}")
    else
        san_entries+=("DNS:${value}")
    fi
}

add_san "${CERT_CN}"
add_san "${HOST_IP:-}"
if [[ -n "${EXTRA_SANS:-}" ]]; then
    read -ra extra_san_list <<<"${EXTRA_SANS}"
    for extra in "${extra_san_list[@]}"; do
        add_san "${extra}"
    done
fi

if [[ -z "${HOST_IP:-}" ]]; then
    detected="$(ip -4 -o addr show scope global up 2>/dev/null |
        awk '$2 !~ /^(docker|br-|veth|tun|tailscale)/ { split($4, a, "/"); print a[1]; exit }')"
    add_san "${detected:-}"
fi

SAN="$(printf '%s,' "${san_entries[@]}")"
SAN="${SAN%,}"

log_info "generating self-signed certificate for ${CERT_CN}"
log_info "SAN: ${SAN}"

(
    umask 077
    openssl req -x509 -newkey "rsa:${RSA_SERVER_KEY_BITS}" \
        -keyout selfsigned.key -out selfsigned.crt \
        -days "${CERT_DAYS}" -nodes \
        -subj "/CN=${CERT_CN}/O=${DEFAULT_CERT_ORG}" \
        -addext "subjectAltName=${SAN}"
)
chmod 600 selfsigned.key
chmod 644 selfsigned.crt

log_ok "files written to ${CERT_OUT_DIR}"
echo "    tls.cert_path: ${CERT_OUT_DIR}/selfsigned.crt"
echo "    tls.key_path:  ${CERT_OUT_DIR}/selfsigned.key"
