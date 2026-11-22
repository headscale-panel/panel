#!/usr/bin/env bash
# Prepare dev environment files, state directories, and Headscale config seeds.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"

load_dev_env
apply_dev_profile

mkdir -p "${HS_ETC_DIR}" "${HS_LIB_DIR}" "${PANEL_DATA_DIR}" "${INFLUXDB_DATA_DIR}" "${STATE_DIR}" "${CERT_OUT_DIR}"

readonly CONFIG_TEMPLATE="${COMPOSE_DIR}/headscale/config.${PROFILE}.yaml.tpl"
if [[ ! -f "${HS_CONFIG_FILE}" ]]; then
    cp "${CONFIG_TEMPLATE}" "${HS_CONFIG_FILE}"
    log_info "seeded ${HS_CONFIG_FILE} from ${PROFILE} template"
else
    log_warn "keeping existing ${HS_CONFIG_FILE} (profile ${PROFILE})"
fi

if [[ ! -f "${HS_EXTRA_RECORDS_FILE}" ]]; then
    printf '[]\n' >"${HS_EXTRA_RECORDS_FILE}"
    log_info "initialized ${HS_EXTRA_RECORDS_FILE}"
fi

log_ok "dev directories and config ready"
