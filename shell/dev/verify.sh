#!/usr/bin/env bash
# End-to-end assertions for the local dev tailnet: verify bridge isolation,
# tailnet visibility, subnet route gating/approval, and node online count.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"
# shellcheck source=../lib/docker.sh
source "${SCRIPT_DIR}/../lib/docker.sh"

FAILURES=0

record_pass() {
    assert_pass "$*"
}

record_fail() {
    assert_fail "$*"
    FAILURES=$((FAILURES + 1))
}

wait_for_unreachable() {
    local container="$1"
    local target="$2"
    local attempts="${3:-${ROUTE_UNREACHABLE_ATTEMPTS}}"
    local i
    for ((i = 1; i <= attempts; i++)); do
        container_ping_ok "${container}" "${target}" || return 0
        sleep "${ROUTE_POLL_INTERVAL_SECONDS}"
    done
    return 1
}

wait_for_reachable() {
    local container="$1"
    local target="$2"
    local attempts="${3:-${ROUTE_REACHABLE_ATTEMPTS}}"
    local i
    for ((i = 1; i <= attempts; i++)); do
        container_ping_ok "${container}" "${target}" && return 0
        sleep "${ROUTE_POLL_INTERVAL_SECONDS}"
    done
    return 1
}

api_get() {
    local path="$1"
    curl -fsS -H "Authorization: Bearer ${HEADSCALE_API_KEY}" "$(headscale_base_url)${path}"
}

approve_node_routes() {
    local node_id="$1"
    local payload="$2"
    curl -fsS -X POST \
        -H "Authorization: Bearer ${HEADSCALE_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "${payload}" \
        "$(headscale_base_url)${HS_API_NODE_PATH}/${node_id}/approve_routes" >/dev/null
}

node_id_by_name() {
    local name="$1"
    api_get "${HS_API_NODE_PATH}" | jq -r --arg n "${name}" '.nodes[] | select(.givenName == $n or .name == $n) | .id' | head -n1
}

main() {
    load_dev_env
    apply_dev_profile
    command -v jq >/dev/null 2>&1 || die "jq is required by verify.sh"

    [[ -f "${API_KEY_STATE_FILE}" ]] || die "no API key found; run mise run dev:up first"
    # shellcheck disable=SC1090
    source "${API_KEY_STATE_FILE}"

    log_step "1. clients must not reach each other directly"
    if container_ping_ok "${CLIENT_A_CONTAINER}" "${TARGET_B_IP}"; then
        record_fail "client-a reached net-b directly (bridge isolation broken)"
    else
        record_pass "client-a cannot reach net-b (${TARGET_B_IP})"
    fi

    log_step "2. both clients are visible in the tailnet"
    if docker exec "${CLIENT_A_CONTAINER}" tailscale status 2>/dev/null | grep -q "client-b"; then
        record_pass "client-a sees client-b in tailscale status"
    else
        record_fail "client-b missing from client-a's tailscale status"
    fi

    log_step "3. subnet route is not effective before approval"
    local node_id
    node_id="$(node_id_by_name "client-a" || true)"
    if [[ -z "${node_id}" ]]; then
        record_fail "client-a node not found via the API"
    else
        approve_node_routes "${node_id}" '{"routes":[]}' 2>/dev/null || true
    fi

    if wait_for_unreachable "${CLIENT_B_CONTAINER}" "${TARGET_A_IP}"; then
        record_pass "client-b cannot reach ${TARGET_A_IP} yet"
    else
        record_fail "client-b reached ${TARGET_A_IP} before the route was approved"
    fi

    log_step "4. approve the advertised subnet route"
    if [[ -z "${node_id}" ]]; then
        record_fail "client-a node not found via the API"
    else
        local body
        body="$(printf '{"routes":["%s"]}' "${NET_A_SUBNET}")"
        if approve_node_routes "${node_id}" "${body}"; then
            record_pass "approved ${NET_A_SUBNET} on client-a (node ${node_id})"
        else
            record_fail "approve_routes request failed"
        fi
    fi

    log_step "5. subnet route works through the tailnet"
    if wait_for_reachable "${CLIENT_B_CONTAINER}" "${TARGET_A_IP}"; then
        record_pass "client-b reaches target-a (${TARGET_A_IP}) via client-a"
    else
        record_fail "client-b still cannot reach ${TARGET_A_IP} after approval"
    fi

    log_step "6. headscale reports both clients online"
    local online total
    online="$(api_get "${HS_API_NODE_PATH}" | jq '[.nodes[] | select(.online == true)] | length')"
    total="$(api_get "${HS_API_NODE_PATH}" | jq '.nodes | length')"
    if [[ "${total}" == "${EXPECTED_ONLINE_NODES}" && "${online}" == "${EXPECTED_ONLINE_NODES}" ]]; then
        record_pass "${EXPECTED_ONLINE_NODES}/${EXPECTED_ONLINE_NODES} nodes online"
    else
        record_fail "expected ${EXPECTED_ONLINE_NODES} nodes online, got ${online}/${total}"
    fi

    echo ""
    if ((FAILURES == 0)); then
        log_ok "all assertions passed"
        exit 0
    fi
    log_err "${FAILURES} assertion(s) failed"
    exit 1
}

main "$@"
