#!/usr/bin/env bash
# Diff two Headscale refs across API files, config keys, and declared HTTP routes.
# Usage: diff.sh [old-ref] [new-ref]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/env.sh
source "${SCRIPT_DIR}/../lib/env.sh"

readonly OLD_REF="${1:-$(read_adapted_commit)}"
readonly NEW_REF="${2:-main}"

command -v git >/dev/null 2>&1 || die "git is required"
command -v python3 >/dev/null 2>&1 || die "python3 is required"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

fetch_ref() {
    local ref="$1"
    local dir="$2"
    git clone --quiet --filter=blob:none --no-checkout "${HS_REPO_URL}" "${dir}"
    git -C "${dir}" checkout --quiet "${ref}" --
}

resolve_config_example() {
    local dir="$1"
    if [[ -f "${dir}/docs/ref/config-example.yaml" ]]; then
        printf '%s' "${dir}/docs/ref/config-example.yaml"
    elif [[ -f "${dir}/config-example.yaml" ]]; then
        printf '%s' "${dir}/config-example.yaml"
    else
        return 1
    fi
}

flatten_yaml() {
    python3 - "$1" <<'PY'
import sys
try:
    import yaml
except ImportError:
    print("# PyYAML missing; skipping key diff", file=sys.stderr)
    sys.exit(2)

def walk(node, prefix):
    if isinstance(node, dict):
        for k, v in node.items():
            key = f"{prefix}.{k}" if prefix else str(k)
            yield key
            yield from walk(v, key)

with open(sys.argv[1]) as fh:
    data = yaml.safe_load(fh) or {}
for key in sorted(walk(data, "")):
    print(key)
PY
}

extract_routes() {
    grep -rhoE 'Path:\s*"/api/v[12]/[^"]*"' "$1/hscontrol/api" 2>/dev/null |
        sed -E 's/.*Path:\s*"([^"]*)"/\1/' | sort -u
}

log_info "fetching ${OLD_REF} and ${NEW_REF}"
fetch_ref "${OLD_REF}" "${WORK}/old"
fetch_ref "${NEW_REF}" "${WORK}/new"

echo ""
log_step "1. API implementation files"
git -C "${WORK}/old" ls-tree -r --name-only HEAD | grep -E '^hscontrol/api/(v1|v2)/' | sort >"${WORK}/old_api.txt" || true
git -C "${WORK}/new" ls-tree -r --name-only HEAD | grep -E '^hscontrol/api/(v1|v2)/' | sort >"${WORK}/new_api.txt" || true
diff -u "${WORK}/old_api.txt" "${WORK}/new_api.txt" || true

echo ""
log_step "2. config-example.yaml keys"
if old_cfg="$(resolve_config_example "${WORK}/old")" &&
    new_cfg="$(resolve_config_example "${WORK}/new")" &&
    flatten_yaml "${old_cfg}" >"${WORK}/old_keys.txt" 2>/dev/null &&
    flatten_yaml "${new_cfg}" >"${WORK}/new_keys.txt" 2>/dev/null; then
    diff -u "${WORK}/old_keys.txt" "${WORK}/new_keys.txt" || true
else
    log_warn "skipped key diff (install PyYAML or verify config-example.yaml path)"
fi

echo ""
log_step "3. declared API routes"
extract_routes "${WORK}/old" >"${WORK}/old_routes.txt"
extract_routes "${WORK}/new" >"${WORK}/new_routes.txt"
diff -u "${WORK}/old_routes.txt" "${WORK}/new_routes.txt" || true

echo ""
log_ok "diff complete; review changes and update AdaptedHeadscaleCommit"
