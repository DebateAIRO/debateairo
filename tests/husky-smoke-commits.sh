#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

git -C "$tmp" init -b feature >/dev/null
cp -R "$repo_root/.husky" "$tmp/.husky"
git -C "$tmp" config core.hooksPath .husky
git -C "$tmp" config user.name "Hook Test"
git -C "$tmp" config user.email hook-test@example.invalid

printf 'hello\n' > "$tmp/file.txt"
git -C "$tmp" add file.txt
if git -C "$tmp" commit -m "updated stuff" >"$tmp/invalid-msg.out" 2>&1; then
  echo "FAIL invalid commit message unexpectedly passed" >&2
  cat "$tmp/invalid-msg.out" >&2
  exit 1
fi
grep -q "Commit message rejected" "$tmp/invalid-msg.out"
echo "PASS invalid commit message was blocked"
grep -m 1 "Commit message rejected" "$tmp/invalid-msg.out"

printf 'AWS_ACCESS_KEY_ID=%s%s\n' 'AKIA1234567890' 'ABCDEF' > "$tmp/secret.txt"
git -C "$tmp" add secret.txt
if git -C "$tmp" commit -m "feat: add secret fixture" >"$tmp/secret.out" 2>&1; then
  echo "FAIL secret commit unexpectedly passed" >&2
  cat "$tmp/secret.out" >&2
  exit 1
fi
grep -q "possible secret found" "$tmp/secret.out"
echo "PASS staged secret was blocked"
grep -m 1 "possible secret found" "$tmp/secret.out"

if printf 'refs/heads/feature 1111111111111111111111111111111111111111 refs/heads/main 0000000000000000000000000000000000000000\n' \
  | (cd "$tmp" && .husky/scripts/hook-runner.sh pre-push) >"$tmp/pre-push.out" 2>&1; then
  echo "FAIL protected branch push unexpectedly passed" >&2
  cat "$tmp/pre-push.out" >&2
  exit 1
fi
grep -q "Direct push to 'main' is blocked" "$tmp/pre-push.out"
echo "PASS direct push to main was blocked"
grep -m 1 "Direct push to 'main' is blocked" "$tmp/pre-push.out"
