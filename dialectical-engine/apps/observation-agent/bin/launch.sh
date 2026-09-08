#!/bin/zsh
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd -P)"
repo_root="$(cd "$script_dir/../../.." && pwd -P)"
environment_file="$repo_root/.local/dev-auth/observation-agent.env"

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
cd "$repo_root"
exec node --import tsx apps/observation-agent/src/main.ts
