#!/usr/bin/env bash
# Build a Headscale container image from source at a given git ref.
# Usage: build-image.sh [ref] [image-tag]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"

readonly REF="${1:-$(read_adapted_commit)}"
[[ -n "${REF}" ]] || die "could not determine ref; pass one explicitly"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

log_info "cloning headscale@${REF}"
git clone --quiet --filter=blob:none "${HS_REPO_URL}" "${WORK}/hs"
git -C "${WORK}/hs" checkout --quiet "${REF}"

readonly SHORT="$(git -C "${WORK}/hs" rev-parse --short="${COMMIT_SHORT_LEN}" HEAD)"
readonly IMAGE_TAG="${2:-${HS_DEV_IMAGE_REPO}:${SHORT}}"

log_info "building headscale binary (CGO_ENABLED=0)"
(
    cd "${WORK}/hs"
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o "${WORK}/headscale" ./cmd/headscale
)

log_info "building image ${IMAGE_TAG}"
mkdir -p "${WORK}/build"
mv "${WORK}/headscale" "${WORK}/build/headscale"
cat >"${WORK}/build/Dockerfile" <<EOF
FROM ${HS_ALPINE_BASE_IMAGE}
RUN apk add --no-cache ca-certificates tzdata
COPY headscale /usr/bin/headscale
ENTRYPOINT ["/usr/bin/headscale"]
EOF

docker build --quiet -t "${IMAGE_TAG}" "${WORK}/build" >/dev/null

log_ok "built ${IMAGE_TAG}"
echo "    export HEADSCALE_IMAGE=${IMAGE_TAG}"
