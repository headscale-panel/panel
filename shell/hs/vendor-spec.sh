#!/usr/bin/env bash
# Vendor the downgraded OpenAPI 3.0.3 document for a Headscale ref into backend/pkg/hsapi/spec.
# Usage: vendor-spec.sh [ref]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"

readonly REF="${1:-main}"

command -v git >/dev/null 2>&1 || die "git is required"
command -v go >/dev/null 2>&1 || die "go is required"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

log_info "fetching headscale@${REF}"
if ! git clone --quiet --filter=blob:none --depth 1 --branch "${REF}" "${HS_REPO_URL}" "${WORK}/hs" 2>/dev/null; then
    git clone --quiet --filter=blob:none "${HS_REPO_URL}" "${WORK}/hs"
    git -C "${WORK}/hs" checkout --quiet "${REF}"
fi

readonly SHORT="$(git -C "${WORK}/hs" rev-parse --short="${COMMIT_SHORT_LEN}" HEAD)"
readonly FULL_SHA="$(git -C "${WORK}/hs" rev-parse HEAD)"
mkdir -p "${HS_SPEC_DIR}"
readonly OUT_SPEC="${HS_SPEC_DIR}/headscale-${SHORT}.yaml"

log_info "generating OpenAPI 3.0.3 document (commit ${SHORT})"
(
    cd "${WORK}/hs"
    go run ./cmd/gen-openapi -downgrade "${OUT_SPEC}"
)

log_ok "wrote ${OUT_SPEC}"
echo "    Update AdaptedHeadscaleCommit in ${HS_ADAPTED_FILE} to:"
echo "    ${FULL_SHA}"
