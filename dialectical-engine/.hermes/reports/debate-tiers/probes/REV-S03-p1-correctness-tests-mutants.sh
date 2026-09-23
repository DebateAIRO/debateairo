#!/bin/zsh
# REV-S03-p1-correctness-tests — the three mutants of REV(S03) pass 1, replayable from ANY worktree.
#
# WRITTEN AGAINST HEAD: cc014550 (slice/tiers-s03, S03 all four clusters landed).
#   At a different head the line content may differ; every mutant below is applied by CONTENT
#   (a literal string match), never by line number, and every restore is FROM A BYTE COPY this
#   script captures at run time — never `git checkout --`, never a literal re-write.
#
# Usage:  WORKTREE=/abs/path/to/<wt>/dialectical-engine zsh REV-S03-p1-correctness-tests-mutants.sh
#     or: zsh REV-S03-p1-correctness-tests-mutants.sh /abs/path/to/<wt>/dialectical-engine
# The worktree must be installed and have had `pnpm run generate:contract` run once.
# The script refuses to run against a dirty tree and verifies byte restoration by sha256.
set -u

W="${WORKTREE:-${1:-}}"
[ -n "$W" ] || { echo "WORKTREE=<abs worktree dialectical-engine dir> required (or argv 1)" >&2; exit 2; }
case "$W" in /*) ;; *) echo "WORKTREE must be absolute (got: $W)" >&2; exit 2;; esac
cd "$W" || exit 2

PANEL="apps/runner/src/dev-cli-provider-panel.ts"
UI_MUTANT="apps/ui/app/new/REV-PROBE-MUTANT.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$PANEL" ] || { echo "not a slice worktree: $PANEL missing" >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "REFUSING: worktree is dirty; mutants need a clean tree" >&2; exit 2; }

cp -p "$PANEL" "$TMP/panel.orig"
BEFORE="$(shasum -a 256 "$PANEL" | awk '{print $1}')"
restore() {
  cp -p "$TMP/panel.orig" "$PANEL"
  rm -f "$UI_MUTANT"
  local after; after="$(shasum -a 256 "$PANEL" | awk '{print $1}')"
  [ "$after" = "$BEFORE" ] || { echo "RESTORE FAILED: $after != $BEFORE" >&2; exit 3; }
  echo "restored; sha256 $after; porcelain: $(git status --porcelain | wc -l | tr -d ' ') entries"
}
trap 'restore; rm -rf "$TMP"' EXIT

echo "=== M1 — delete the two erasing casts, ask the COMPILER what they hid (expect 2x TS2353) ==="
perl -0pi -e 's/\n      \} as unknown as Parameters<typeof startClaudeRelay>\[0\]\);/\n      });/' "$PANEL"
perl -0pi -e 's/\n      \} as unknown as Parameters<typeof startGrokRelay>\[0\]\);/\n      });/' "$PANEL"
if ! git diff --quiet -- "$PANEL"; then
  pnpm typecheck > "$TMP/m1.log" 2>&1
  grep -E "dev-cli-provider-panel\.ts.*TS2353" "$TMP/m1.log" || echo "M1: NO TS2353 — the option types now carry \`model\`; B1 may be fixed at this head"
else
  echo "M1: the cast text did not match at this head — inspect $PANEL by hand"
fi
cp -p "$TMP/panel.orig" "$PANEL"

echo
echo "=== M2 — pass the key the relay ACTUALLY reads (modelAlias) and run the panel suite ==="
echo "===      expect RED on 'passes the full Claude model id without a modelAlias key'      ==="
# NB: the codex branch carries byte-identical option text, so anchor on startClaudeRelay.
perl -0pi -e 's/(startClaudeRelay\(\{\s*\n\s*port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS, )model: slot\.model/${1}modelAlias: slot.model/' "$PANEL"
git diff --quiet -- "$PANEL" && echo "M2: the claude call text did not match at this head — inspect by hand"
LANG=en_US.UTF-8 npx vitest run tests/unit/dev-cli-provider-panel.test.ts > "$TMP/m2.log" 2>&1
grep -E '^[[:space:]]*(×|FAIL[[:space:]])|^[[:space:]]*Tests[[:space:]]' "$TMP/m2.log" | head -6
cp -p "$TMP/panel.orig" "$PANEL"

echo
echo "=== M3 — add a REAL PLAN_TIER_ROSTERS selector under apps/ui; expect the S13 case RED ==="
mkdir -p "$(dirname "$UI_MUTANT")"
cat > "$UI_MUTANT" <<'EOF'
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
export const mutantFree = PLAN_TIER_ROSTERS.free;
EOF
LANG=en_US.UTF-8 npx vitest run tests/architecture/tiers-s02-rosters.test.ts > "$TMP/m3.log" 2>&1
grep -E '^[[:space:]]*(×|FAIL[[:space:]])|^[[:space:]]*Tests[[:space:]]' "$TMP/m3.log" | head -6
rm -f "$UI_MUTANT"

echo
echo "=== restoring ==="
