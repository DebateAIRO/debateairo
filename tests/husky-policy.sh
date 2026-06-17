#!/usr/bin/env bash
set -euo pipefail

runner=".husky/scripts/hook-runner.sh"
msg=$(mktemp)
trap 'rm -f "$msg"' EXIT

printf 'feat(hooks): add local guardrails\n' > "$msg"
"$runner" commit-msg "$msg"

printf 'ABC-123: add local guardrails\n' > "$msg"
"$runner" commit-msg "$msg"

printf 'updated stuff\n' > "$msg"
if "$runner" commit-msg "$msg" >/tmp/aiharness-commit-msg.$$ 2>&1; then
  echo "commit-msg accepted an invalid message" >&2
  rm -f /tmp/aiharness-commit-msg.$$
  exit 1
fi
if ! grep -q "Conventional Commits" /tmp/aiharness-commit-msg.$$; then
  echo "commit-msg failure did not explain the accepted formats" >&2
  cat /tmp/aiharness-commit-msg.$$ >&2
  rm -f /tmp/aiharness-commit-msg.$$
  exit 1
fi
rm -f /tmp/aiharness-commit-msg.$$

repo=$(mktemp -d)
trap 'rm -f "$msg"; rm -rf "$repo"' EXIT
git -C "$repo" init -b main >/dev/null
if (cd "$repo" && AIHARNESS_ALLOW_REBASE_PUSHED=1 "$OLDPWD/$runner" pre-rebase >/tmp/aiharness-pre-rebase.$$ 2>&1); then
  echo "pre-rebase allowed protected branch main" >&2
  rm -f /tmp/aiharness-pre-rebase.$$
  exit 1
fi
if ! grep -q "protected branch 'main'" /tmp/aiharness-pre-rebase.$$; then
  echo "pre-rebase failure did not explain protected branch policy" >&2
  cat /tmp/aiharness-pre-rebase.$$ >&2
  rm -f /tmp/aiharness-pre-rebase.$$
  exit 1
fi
rm -f /tmp/aiharness-pre-rebase.$$

echo "Husky-style hook policies behave as expected"
