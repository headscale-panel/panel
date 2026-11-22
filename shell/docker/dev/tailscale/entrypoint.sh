#!/bin/sh
# Wrapper entrypoint for dev tailscale containers.
# Workaround for Tailscale's controlhttp "forcing port 443 dial due to recent noise dial"
# deadlock against plain-HTTP Headscale when Headscale restarts: if tailscaled stays
# Running with Self.Online=false while Headscale is healthy, recycle tailscaled to clear
# its in-memory LastNoiseDialWasRecent state and reconnect cleanly.
set -eu

HEADSCALE_HEALTH_URL="${HEADSCALE_HEALTH_URL:-http://headscale:8080/health}"
WATCHDOG_INTERVAL="${TAILSCALE_WATCHDOG_INTERVAL:-5}"
OFFLINE_THRESHOLD=2

TAILSCALED_PID=""

cleanup() {
    if [ -n "${TAILSCALED_PID}" ] && kill -0 "${TAILSCALED_PID}" 2>/dev/null; then
        kill -TERM "${TAILSCALED_PID}" 2>/dev/null || true
        wait "${TAILSCALED_PID}" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup INT TERM

while true; do
    /usr/local/bin/tailscaled "$@" &
    TAILSCALED_PID=$!

    offline_streak=0
    while kill -0 "${TAILSCALED_PID}" 2>/dev/null; do
        sleep "${WATCHDOG_INTERVAL}"
        kill -0 "${TAILSCALED_PID}" 2>/dev/null || break

        status_json="$(/usr/local/bin/tailscale status --self --peers=false --json 2>/dev/null || true)"
        case "${status_json}" in
            *'"BackendState": "Running"'*)
                case "${status_json}" in
                    *'"Online": false'*)
                        if wget -qO- -T 2 "${HEADSCALE_HEALTH_URL}" >/dev/null 2>&1; then
                            offline_streak=$((offline_streak + 1))
                            if [ "${offline_streak}" -ge "${OFFLINE_THRESHOLD}" ]; then
                                echo "[dev-watchdog] tailscaled stuck offline while headscale is healthy; restarting tailscaled" >&2
                                kill -TERM "${TAILSCALED_PID}" 2>/dev/null || true
                                wait "${TAILSCALED_PID}" 2>/dev/null || true
                                break
                            fi
                        else
                            offline_streak=0
                        fi
                        ;;
                    *)
                        offline_streak=0
                        ;;
                esac
                ;;
            *)
                offline_streak=0
                ;;
        esac
    done

    wait "${TAILSCALED_PID}" 2>/dev/null || true
    sleep 1
done
