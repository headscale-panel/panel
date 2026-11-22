#!/usr/bin/env bash
# Shared logging and assertion output helpers.

[[ -n "${_SHELL_LIB_LOG_LOADED:-}" ]] && return 0
readonly _SHELL_LIB_LOG_LOADED=1

# shellcheck source=constants.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/constants.sh"

log_info() {
    echo -e "${COLOR_CYAN}[info]${COLOR_NC} $*"
}

log_ok() {
    echo -e "${COLOR_GREEN}[ok]${COLOR_NC} $*"
}

log_warn() {
    echo -e "${COLOR_YELLOW}[warn]${COLOR_NC} $*"
}

log_err() {
    echo -e "${COLOR_RED}[error]${COLOR_NC} $*" >&2
}

die() {
    log_err "$*"
    exit 1
}

log_step() {
    echo -e "${COLOR_BOLD}$*${COLOR_NC}"
}

assert_pass() {
    echo -e "  ${COLOR_GREEN}✓${COLOR_NC} $*"
}

assert_fail() {
    echo -e "  ${COLOR_RED}✗${COLOR_NC} $*"
}
