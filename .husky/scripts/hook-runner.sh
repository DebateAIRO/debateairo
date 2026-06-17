#!/usr/bin/env bash
set -euo pipefail

hook=${1:-}
if [[ -z "$hook" ]]; then
  echo "Usage: hook-runner.sh <hook-name> [hook args...]" >&2
  exit 2
fi
shift || true

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$repo_root"

checks_ran=0

log() {
  printf '[ai-harness:%s] %s\n' "$hook" "$*" >&2
}

die() {
  log "$*"
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

run_check() {
  local label=$1
  shift
  checks_ran=$((checks_ran + 1))
  log "running: $label"
  "$@"
}

run_bash_script_if_present() {
  local script=$1
  local label=$2
  if [[ -x "$script" ]]; then
    run_check "$label" "$script"
  elif [[ -f "$script" ]]; then
    run_check "$label" bash "$script"
  fi
}

run_template_checks() {
  run_bash_script_if_present "tests/render-templates.sh" "render templates"
  run_bash_script_if_present "tests/lint-templates.sh" "lint templates"
}

run_harness_checks() {
  if [[ -x scripts/harness ]]; then
    run_check "harness lint" scripts/harness lint
    if [[ -f .harness/config.yml ]]; then
      run_check "harness verify-config" scripts/harness verify-config >/dev/null
    fi
  fi
}

staged_files() {
  git diff --cached --name-only --diff-filter=ACMR -z
}

check_staged_diff() {
  run_check "staged whitespace/conflict check" git diff --cached --check
}

check_staged_conflict_markers() {
  local failed=0
  local file tmp
  while IFS= read -r -d '' file; do
    tmp=$(mktemp)
    if git show ":$file" >"$tmp" 2>/dev/null && grep -Iq . "$tmp"; then
      if grep -nE '^(<{7}|={7}$|>{7})' "$tmp" >/tmp/aiharness-conflicts.$$; then
        log "conflict markers found in staged file: $file"
        cat /tmp/aiharness-conflicts.$$ >&2
        failed=1
      fi
    fi
    rm -f "$tmp" /tmp/aiharness-conflicts.$$
  done < <(staged_files)
  if [[ $failed -ne 0 ]]; then
    die "Resolve conflict markers, stage the fixes, then retry the commit."
  fi
}

check_staged_secrets() {
  if have gitleaks; then
    run_check "gitleaks staged secret scan" gitleaks protect --staged --redact
    return
  fi
  if have detect-secrets-hook; then
    if [[ -f .secrets.baseline ]]; then
      run_check "detect-secrets staged scan" detect-secrets-hook --baseline .secrets.baseline
    else
      run_check "detect-secrets staged scan" detect-secrets-hook
    fi
    return
  fi

  log "gitleaks/detect-secrets not found; running basic staged secret scan"
  local failed=0
  local file tmp
  while IFS= read -r -d '' file; do
    tmp=$(mktemp)
    if git show ":$file" >"$tmp" 2>/dev/null && grep -Iq . "$tmp"; then
      if grep -nE -- 'AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{36,}|sk-[A-Za-z0-9]{20,}|-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----' "$tmp" >/tmp/aiharness-secrets.$$; then
        log "possible secret found in staged file: $file"
        cat /tmp/aiharness-secrets.$$ >&2
        failed=1
      fi
    fi
    rm -f "$tmp" /tmp/aiharness-secrets.$$
  done < <(staged_files)
  if [[ $failed -ne 0 ]]; then
    die "Remove the secret from the staged diff, rotate it if needed, then retry."
  fi
}

validate_commit_msg() {
  local msg_file=${1:-}
  [[ -n "$msg_file" && -f "$msg_file" ]] || die "commit-msg requires the path to the commit message file."

  local subject
  subject=$(sed -n '1p' "$msg_file")

  if [[ "$subject" =~ ^(Merge|Revert|fixup!|squash!) ]]; then
    return
  fi
  if [[ "$subject" =~ ^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([A-Za-z0-9._/-]+\))?(!)?:[[:space:]].+ ]]; then
    return
  fi
  if [[ "$subject" =~ ^[A-Z][A-Z0-9]+-[0-9]+:[[:space:]].+ ]]; then
    return
  fi

  cat >&2 <<'EOF'
[ai-harness:commit-msg] Commit message rejected.

Use Conventional Commits:
  feat(scope): short imperative summary
  fix: short imperative summary

Or a ticket-aware subject:
  ABC-123: short imperative summary
EOF
  exit 1
}

is_protected_branch() {
  local branch=$1
  [[ "$branch" == "main" || "$branch" == "develop" || "$branch" == release/* ]]
}

protect_push_refs() {
  local local_ref local_sha remote_ref remote_sha branch
  while read -r local_ref local_sha remote_ref remote_sha; do
    [[ -n "${local_ref:-}" ]] || continue
    branch=${remote_ref#refs/heads/}
    if is_protected_branch "$branch"; then
      die "Direct push to '$branch' is blocked. Push a feature branch and open a PR."
    fi
  done
}

protect_rebase() {
  local branch upstream
  branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo "HEAD")
  if is_protected_branch "$branch"; then
    die "Rebasing protected branch '$branch' is blocked."
  fi
  if upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null); then
    if [[ "${AIHARNESS_ALLOW_REBASE_PUSHED:-}" == "1" ]]; then
      log "AIHARNESS_ALLOW_REBASE_PUSHED=1 set; allowing rebase of branch tracking '$upstream'."
      return
    fi
    die "Rebasing '$branch' is blocked because it tracks '$upstream'. Create a new branch or set AIHARNESS_ALLOW_REBASE_PUSHED=1 after coordinating."
  fi
}

post_merge_changed_files() {
  local base
  base=$(git rev-parse --verify ORIG_HEAD 2>/dev/null || true)
  [[ -n "$base" ]] || return 0
  git diff --name-only "$base" HEAD --
}

check_post_merge_remediation() {
  local changed
  changed=$(post_merge_changed_files)
  [[ -n "$changed" ]] || return 0

  if printf '%s\n' "$changed" | grep -E '(^|/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|Pipfile\.lock|go\.mod|go\.sum|Cargo\.(toml|lock)|Dockerfile|docker-compose[^/]*\.ya?ml|\.env\.example|\.harness/config\.yml(\.tpl)?|ARTIFACTS\.md|AGENTS\.md|.*\.tpl|\.husky/|scripts/setup/|tests/)' >/dev/null; then
    cat >&2 <<EOF
[ai-harness:post-merge] Merge completed, but dependencies/config/schema/templates changed.

Git post-merge hooks cannot undo the merge. Refresh your local environment before continuing:
  - reinstall dependencies if lockfiles or manifests changed
  - review .harness/config.yml against any .tpl/config changes
  - run repo validation, for this skeleton: tests/render-templates.sh and tests/lint-templates.sh

Changed files:
$changed
EOF
    exit 1
  fi
}

case "$hook" in
  pre-commit)
    check_staged_diff
    check_staged_conflict_markers
    check_staged_secrets
    run_template_checks
    run_harness_checks
    ;;
  commit-msg)
    validate_commit_msg "$@"
    ;;
  pre-push)
    protect_push_refs
    run_template_checks
    run_harness_checks
    if [[ $checks_ran -eq 0 ]]; then
      die "No repo-local validation checks were found. Add tests/render-templates.sh, tests/lint-templates.sh, or scripts/harness lint before pushing."
    fi
    ;;
  pre-rebase)
    protect_rebase
    ;;
  post-merge)
    check_post_merge_remediation
    ;;
  *)
    die "Unknown hook: $hook"
    ;;
esac
