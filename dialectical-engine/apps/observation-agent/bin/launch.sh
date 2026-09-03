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
cd "$repo_root/apps/observation-agent"
exec node --import tsx src/main.ts
