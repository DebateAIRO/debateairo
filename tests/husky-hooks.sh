#!/usr/bin/env bash
set -euo pipefail

hooks=(pre-commit commit-msg pre-push pre-rebase post-merge)

assert_executable() {
  local file=$1
  if [[ ! -f "$file" ]]; then
    echo "Missing hook file: $file" >&2
    exit 1
  fi
  if [[ ! -x "$file" ]]; then
    echo "Hook is not executable: $file" >&2
    exit 1
  fi
}

assert_runner_entrypoint() {
  local file=$1 hook=$2
  if ! grep -q "hook-runner.sh\" $hook" "$file"; then
    echo "Hook does not delegate to hook-runner.sh for $hook: $file" >&2
    exit 1
  fi
}

for hook in "${hooks[@]}"; do
  assert_executable ".husky/$hook"
  assert_runner_entrypoint ".husky/$hook" "$hook"
  assert_executable "skeleton/.husky/$hook"
  assert_runner_entrypoint "skeleton/.husky/$hook" "$hook"
done

assert_executable ".husky/scripts/hook-runner.sh"
assert_executable "skeleton/.husky/scripts/hook-runner.sh"

out=$(mktemp -d)
cp -R skeleton/. "$out/"
for hook in "${hooks[@]}"; do
  assert_executable "$out/.husky/$hook"
  assert_runner_entrypoint "$out/.husky/$hook" "$hook"
done
assert_executable "$out/.husky/scripts/hook-runner.sh"

echo "Husky-style hook files are present and renderable"
