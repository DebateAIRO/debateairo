#!/bin/zsh
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd -P)"
repo_root="$(cd "$script_dir/../../.." && pwd -P)"

# DL7-F4: dev key custody is movable — DEBATEAI_DEV_CUSTODY_ROOT exists so keys need never
# sit inside a cloud-synced checkout (F-05). The resolver in
# deploy/dev-auth/custody-root.mjs is the single source of that rule; this launcher honours
# the same override rather than assuming the repository, and refuses a relative override
# instead of silently reading the wrong file.
custody_root="${DEBATEAI_DEV_CUSTODY_ROOT:-$repo_root/.local/dev-auth}"
if [[ "$custody_root" != /* ]]; then
  print -u2 -- DEV_AUTH_CUSTODY_ROOT_RELATIVE
  exit 2
fi
environment_file="$custody_root/observation-agent.env"

if [[ ! -f "$environment_file" ]]; then
  print -u2 -- OBSERVATION_ENV_FILE_MISSING
  exit 2
fi

mode="$(stat -f '%Lp' "$environment_file")"
owner="$(stat -f '%u' "$environment_file")"
if [[ "$mode" != "600" ]]; then
  # Required custody mode: 0600.
  print -u2 -- OBSERVATION_ENV_FILE_MODE_INVALID
  exit 2
fi
if [[ "$owner" != "$(id -u)" ]]; then
  print -u2 -- OBSERVATION_ENV_FILE_OWNER_INVALID
  exit 2
fi

set -a
source "$environment_file"
set +a
user_home="${HOME:-}"
if [[ -z "$user_home" ]]; then
  print -u2 -- OBSERVATION_RUNTIME_PATH_INVALID
  exit 2
fi
export PATH="$user_home/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export NODE_USE_SYSTEM_CA=1

# DL7-F5. This launcher runs under launchd with KeepAlive and a 10 s throttle,
# and the first entry on the PATH above is a user-writable directory. On
# 2026-09-17 on this Mac a launcher whose file had been overwritten with plain
# text was handed to a shell, which — unable to EXECUTE it — read it back as a
# script whose first line re-ran the launcher, forking until the process table
# was full. So: deduce each binary by NAME, then PROVE the resolved file is a
# program before exec, and never let a shell decide what an unexecutable file
# is. Same discipline as `.hermes/.../tools/closing-run.sh` (`is_program`) and
# the relay resolver of D10/D75.

# is_program <file>: the first four bytes must be a shebang or a Mach-O,
# universal or ELF magic number. The candidate is read, never started.
is_program() {
  local magic
  magic="$(head -c 4 "$1" 2>/dev/null | od -An -tx1 | tr -d ' \n' || true)"
  case "$magic" in
    2321*) return 0 ;;                                   # "#!" shebang
    cffaedfe|cefaedfe|feedfacf|feedface) return 0 ;;     # Mach-O 64/32-bit, either byte order
    cafebabe|bebafeca) return 0 ;;                       # universal (fat) binary
    7f454c46*) return 0 ;;                               # ELF, for a host that is not this Mac
    *) return 1 ;;
  esac
}

# require_program <name>: prints the absolute path of <name> as deduced from
# PATH, or refuses loudly with a typed code. Symlinks are followed on purpose —
# nearly every real launcher is one, and the defect lives in the target.
require_program() {
  local name=$1 path real
  path="$(command -v "$name" 2>/dev/null || true)"
  if [[ -z "$path" ]]; then
    print -u2 -- "OBSERVATION_RUNTIME_PATH_INVALID $name"
    return 1
  fi
  real="$(readlink -f "$path" 2>/dev/null || print -r -- "$path")"
  if [[ ! -f "$real" || ! -s "$real" || ! -x "$real" ]] || ! is_program "$real"; then
    print -u2 -- "OBSERVATION_RUNTIME_NOT_A_PROGRAM $name $real"
    return 1
  fi
  print -r -- "$real"
}

node_bin="$(require_program node)" || exit 2

# The daemon execs `docker` by name off the PATH exported above, so that
# candidate is owed the same proof here. An absent docker is not a fault — the
# wrapper's ENOENT is a clean, bounded failure — but a docker that is not a
# program is the 2026-09-17 class and must never be reached.
if command -v docker >/dev/null 2>&1; then
  require_program docker >/dev/null || exit 2
fi

cd "$repo_root"
exec "$node_bin" --import tsx apps/observation-agent/src/main.ts
