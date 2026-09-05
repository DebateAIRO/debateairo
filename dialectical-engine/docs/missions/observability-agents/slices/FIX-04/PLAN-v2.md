# FIX-04 Immutable Admission and C1 Zone Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit FIX-04 from the exact reviewed authority/runtime composition, record its immutable base, and install a non-vacuous semantic zone-region guard before any product edit.

**Architecture:** Compose the reviewed controller authority and reviewed FIX-01 endpoint as one explicit two-parent merge, then record that merge's full SHA as `FIX04_BASE_REF`. The C1 test compares the semantic region from that immutable object with the worktree file, fails closed on absent or invalid input, and uses only in-memory mutants. Product behavior remains held because the reviewed capture interface cannot yet satisfy frozen R03 and R07.

**Tech Stack:** Git, zsh, TypeScript ESM, Node 22.23.1, pnpm 11, Vitest 4.1.10.

**Spec:** `docs/missions/observability-agents/slices/FIX-04/SPEC-v2.md`, together with unchanged rules in `SPEC.md`.

## Global Constraints

- This plan implements only dependency admission and C1. It permits no API, capture-package, helper, S04 test, migration, zone, UI, runner, scheduler, or listener edit.
- `FIX01_REVIEW_REF` is exactly `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`.
- `FIX04_AUTHORITY_REF` is exactly reviewed authority commit `d935aad03aa56e752016011c57a81c5d33d27680`; a caller-supplied expectation, branch name, predecessor, or invocation-time `HEAD` is not a substitute.
- `FIX04_BASE_REF` is the exact two-parent composition merge created before the first implementation edit.
- The durable admission receipt is controller-owned at `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md`; no FIX-04 code-worktree ignore or exclude mutation is permitted.
- The controller's existing FIX-07 decision delta and unrelated untracked paths remain untouched and unstaged.
- No command reads or uses `.hermes/**`.
- Every focused test command captures output before checking status, requires a nonzero executed-test count, and runs three times. The worst run controls.
- No merge into `dev`, push, production/service act, V acceptance, veto, or Done claim is authorized.

---

### Task 1: Create and record the reviewed dependency composition

**Files:**

- Create: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04/`
- Create: `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md`
- Read: `.superpowers/sdd/PLAN-FixAgent/fix04-b2-authority-report.md`
- Read: FIX-01 final review reports `task-17-fix01-c5-zone-veto-sol-final-review.md` and `task-19-fix01-runtime-race-sol-review.md`

**Interfaces:**

- Consumes: reviewed authority commit `d935aad03aa56e752016011c57a81c5d33d27680` and exact `FIX01_REVIEW_REF`.
- Produces: branch `slice/oa-fix-04`, one two-parent composition commit, worktree `oa-fix-04`, and a durable receipt whose `FIX04_BASE_REF` is passed to every C1 run.

- [ ] **Step 1: Validate the exact inputs and controller state**

Run from `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine`. The reviewed authority literal is defined inside the procedure; do not accept it from caller state:

```zsh
set -eu
EXPECTED_AUTHORITY_REF=d935aad03aa56e752016011c57a81c5d33d27680
EXPECTED_AUTHORITY_PARENT=b5ae558bdff12011dbf6f74f2a3655cbae5c724c
EXPECTED_AUTHORITY_SUBJECT='docs(obs): authorize FIX-04 immutable admission base'
EXPECTED_AUTHORITY_PATHS=$'dialectical-engine/docs/missions/observability-agents/slices/FIX-04/DECISIONS.md\ndialectical-engine/docs/missions/observability-agents/slices/FIX-04/PLAN-v2.md\ndialectical-engine/docs/missions/observability-agents/slices/FIX-04/SPEC-v2.md'
AUTHORITY_REPORT=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-b2-authority-report.md
FIX01_REVIEW_REF=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4

attest_authority() {
  local candidate="$1"
  [[ "$candidate" == "$EXPECTED_AUTHORITY_REF" ]] || {
    print 'FIX04_AUTHORITY_REF_MISMATCH'
    return 1
  }
  git cat-file -e "${candidate}^{commit}" || {
    print 'FIX04_AUTHORITY_NOT_COMMIT'
    return 1
  }
  [[ "$(git rev-list --parents -n 1 "$candidate")" == "$candidate $EXPECTED_AUTHORITY_PARENT" ]] || {
    print 'FIX04_AUTHORITY_PARENT_MISMATCH'
    return 1
  }
  [[ "$(git log -1 --format=%s "$candidate")" == "$EXPECTED_AUTHORITY_SUBJECT" ]] || {
    print 'FIX04_AUTHORITY_SUBJECT_MISMATCH'
    return 1
  }
  [[ "$(git diff-tree --no-commit-id --name-only -r "$candidate")" == "$EXPECTED_AUTHORITY_PATHS" ]] || {
    print 'FIX04_AUTHORITY_DELTA_MISMATCH'
    return 1
  }
}

FIX04_AUTHORITY_REF="$EXPECTED_AUTHORITY_REF"
attest_authority "$FIX04_AUTHORITY_REF"
[[ "$(rg -c -x "FIX04_AUTHORITY_REF=$EXPECTED_AUTHORITY_REF" "$AUTHORITY_REPORT")" -eq 1 ]]
if wrong_authority_out="$(attest_authority "$EXPECTED_AUTHORITY_PARENT" 2>&1)"; then
  print 'STOP: predecessor was accepted as authority'
  exit 1
else
  wrong_authority_rc=$?
fi
[[ $wrong_authority_rc -ne 0 ]]
[[ "$wrong_authority_out" == *FIX04_AUTHORITY_REF_MISMATCH* ]]
print "FIX04_AUTHORITY_NEGATIVE_PROOF candidate=$EXPECTED_AUTHORITY_PARENT rc=$wrong_authority_rc reason=FIX04_AUTHORITY_REF_MISMATCH"
git cat-file -e "${FIX01_REVIEW_REF}^{commit}"
[[ "$(git rev-parse "$FIX01_REVIEW_REF")" == "$FIX01_REVIEW_REF" ]]
[[ "$(git merge-base "$FIX04_AUTHORITY_REF" "$FIX01_REVIEW_REF")" == 2b670d3059c60d7262cf655bd5d402c88100dff3 ]]
git merge-base --is-ancestor 6649fd7d809c6bc2ff21123d8b47c3d8a2b553e9 "$FIX01_REVIEW_REF"
[[ "$(git rev-parse "$FIX04_AUTHORITY_REF:dialectical-engine/apps/api/src/index.ts")" == 174ee8ff60461eb4f5aa233441b0367bb3d174b7 ]]
[[ "$(git rev-parse "$FIX01_REVIEW_REF:dialectical-engine/apps/api/src/index.ts")" == 174ee8ff60461eb4f5aa233441b0367bb3d174b7 ]]
[[ -z "$(git diff --cached --name-only)" ]]
FIX04_WORKTREE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04
ADMISSION_REPORT=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md
branch_present=0
worktree_present=0
git show-ref --verify --quiet refs/heads/slice/oa-fix-04 && branch_present=1
[[ -d "$FIX04_WORKTREE/dialectical-engine" ]] && worktree_present=1
[[ ! -e "$ADMISSION_REPORT" ]]
if [[ $branch_present -eq 0 && $worktree_present -eq 0 ]]; then
  print 'FIX04_ADMISSION_MODE=fresh'
elif [[ $branch_present -eq 1 && $worktree_present -eq 1 ]]; then
  print 'FIX04_ADMISSION_MODE=resume-existing-34ebf866'
else
  print "STOP: partial FIX-04 lane state branch=$branch_present worktree=$worktree_present"
  exit 1
fi
```

Expected: exit `0` and exactly one admission mode. The controller may still report the pre-existing unstaged FIX-07 decision path and unrelated untracked paths; none may enter the index. Run exactly Step 2F for `fresh` or Step 2R for `resume-existing-34ebf866`; never run both.

- [ ] **Step 2F: Fresh mode — create the one slice worktree and composition merge**

Run from the same controller directory only when Step 1 printed `FIX04_ADMISSION_MODE=fresh`:

```zsh
set -eu
FIX04_AUTHORITY_REF=d935aad03aa56e752016011c57a81c5d33d27680
FIX01_REVIEW_REF=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4
ADMISSION_REPORT=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md
[[ ! -e /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04 ]]
! git show-ref --verify --quiet refs/heads/slice/oa-fix-04
[[ ! -e "$ADMISSION_REPORT" ]]
zsh docs/missions/observability-agents/logs/prep-slice-worktree.sh FIX-04 "$FIX04_AUTHORITY_REF"
FIX04_LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04/dialectical-engine
git -C "$FIX04_LANE" merge --no-ff "$FIX01_REVIEW_REF" -m 'chore(obs): compose FIX-04 reviewed dependencies'
FIX04_BASE_REF="$(git -C "$FIX04_LANE" rev-parse HEAD)"
[[ "$(git -C "$FIX04_LANE" rev-list --parents -n 1 "$FIX04_BASE_REF" | awk '{print NF}')" -eq 3 ]]
[[ "$(git -C "$FIX04_LANE" rev-parse "${FIX04_BASE_REF}^1")" == "$FIX04_AUTHORITY_REF" ]]
[[ "$(git -C "$FIX04_LANE" rev-parse "${FIX04_BASE_REF}^2")" == "$FIX01_REVIEW_REF" ]]
[[ "$(git -C "$FIX04_LANE" log -1 --format=%s)" == 'chore(obs): compose FIX-04 reviewed dependencies' ]]
[[ "$(git -C "$FIX04_LANE" rev-parse "$FIX04_BASE_REF:dialectical-engine/apps/api/src/index.ts")" == 174ee8ff60461eb4f5aa233441b0367bb3d174b7 ]]
[[ -z "$(git -C "$FIX04_LANE" status --porcelain)" ]]
print "FIX04_BASE_REF=$FIX04_BASE_REF"
```

Expected: one merge commit with the authority ref first and FIX-01 ref second, a clean slice worktree, and one printed full `FIX04_BASE_REF`. A conflict, fast-forward, wrong parent, wrong subject, changed API blob, or dirty result is a stop.

- [ ] **Step 2R: Resume mode — attest the already-created admission state without changing it**

Run from the controller only when Step 1 printed `FIX04_ADMISSION_MODE=resume-existing-34ebf866`. This path accepts exactly the already-created Task-1 composition and performs no Git write:

```zsh
set -eu
CONTROLLER_ENGINE=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine
FIX04_LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04/dialectical-engine
FIX04_WORKTREE_ROOT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04
FIX04_BASE_REF=34ebf866f7801d9620ee56f14f548b220b6ad442
FIX04_AUTHORITY_REF=d935aad03aa56e752016011c57a81c5d33d27680
FIX01_REVIEW_REF=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4
EXPECTED_API_BLOB=174ee8ff60461eb4f5aa233441b0367bb3d174b7
EXPECTED_COMMON_DIR=/Users/vladmihaimiron/Documents/DebateAIRO/.git
EXPECTED_WORKTREE_BRANCH=refs/heads/slice/oa-fix-04
EXPECTED_WORKTREE_STANZA=$'worktree /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04\nHEAD 34ebf866f7801d9620ee56f14f548b220b6ad442\nbranch refs/heads/slice/oa-fix-04'
ADMISSION_REPORT=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md
MISPLACED_REPORT="$FIX04_WORKTREE_ROOT/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md"

canonical_common_dir() {
  local repository_path="$1"
  local common_dir
  common_dir="$(git -C "$repository_path" rev-parse --git-common-dir)"
  if [[ "$common_dir" != /* ]]; then
    common_dir="$repository_path/$common_dir"
  fi
  (
    cd "$common_dir"
    pwd -P
  )
}

attest_worktree_registration() {
  local registry_text="$1"
  local controller_common_dir="$2"
  local lane_common_dir="$3"
  local stanza line stanza_touches
  local exact_count=0
  local conflict_count=0
  local -a registry_stanzas stanza_lines

  [[ "$controller_common_dir" == "$EXPECTED_COMMON_DIR" ]] || {
    print -u2 'FIX04_CONTROLLER_COMMON_DIR_MISMATCH'
    return 1
  }
  [[ "$lane_common_dir" == "$EXPECTED_COMMON_DIR" && "$lane_common_dir" == "$controller_common_dir" ]] || {
    print -u2 'FIX04_WORKTREE_COMMON_DIR_MISMATCH'
    return 1
  }

  registry_stanzas=("${(@ps:\n\n:)registry_text}")
  for stanza in "${registry_stanzas[@]}"; do
    stanza_touches=0
    stanza_lines=("${(@f)stanza}")
    for line in "${stanza_lines[@]}"; do
      case "$line" in
        ("worktree $FIX04_WORKTREE_ROOT"|"HEAD $FIX04_BASE_REF"|"branch $EXPECTED_WORKTREE_BRANCH") stanza_touches=1 ;;
      esac
    done
    if [[ "$stanza" == "$EXPECTED_WORKTREE_STANZA" ]]; then
      (( exact_count += 1 ))
    elif (( stanza_touches )); then
      (( conflict_count += 1 ))
    fi
  done

  (( conflict_count == 0 )) || {
    print -u2 'FIX04_WORKTREE_REGISTRATION_CONFLICT'
    return 1
  }
  (( exact_count > 0 )) || {
    print -u2 'FIX04_WORKTREE_REGISTRATION_MISSING'
    return 1
  }
  (( exact_count == 1 )) || {
    print -u2 'FIX04_WORKTREE_REGISTRATION_DUPLICATE'
    return 1
  }
  print "FIX04_WORKTREE_REGISTRATION_ATTESTED path=$FIX04_WORKTREE_ROOT head=$FIX04_BASE_REF branch=$EXPECTED_WORKTREE_BRANCH common=$lane_common_dir"
}

assert_registration_rejected() {
  local label="$1"
  local registry_text="$2"
  local controller_common_dir="$3"
  local lane_common_dir="$4"
  local expected_error="$5"
  local inverse_output inverse_status
  set +e
  inverse_output="$(attest_worktree_registration "$registry_text" "$controller_common_dir" "$lane_common_dir" 2>&1)"
  inverse_status=$?
  set -e
  (( inverse_status != 0 ))
  [[ "$inverse_output" == "$expected_error" ]]
  print "FIX04_WORKTREE_REGISTRATION_INVERSE label=$label status=$inverse_status reason=$inverse_output"
}

[[ -d "$FIX04_LANE" ]]
[[ "$(cd "$CONTROLLER_ENGINE" && pwd -P)" == "$CONTROLLER_ENGINE" ]]
[[ "$(cd "$FIX04_WORKTREE_ROOT" && pwd -P)" == "$FIX04_WORKTREE_ROOT" ]]
[[ "$(cd "$EXPECTED_COMMON_DIR" && pwd -P)" == "$EXPECTED_COMMON_DIR" ]]
controller_common_dir="$(canonical_common_dir "$CONTROLLER_ENGINE")"
lane_common_dir="$(canonical_common_dir "$FIX04_LANE")"
worktree_registry="$(git -C "$CONTROLLER_ENGINE" worktree list --porcelain)"
registration_evidence="$(attest_worktree_registration "$worktree_registry" "$controller_common_dir" "$lane_common_dir")"
[[ "$registration_evidence" == "FIX04_WORKTREE_REGISTRATION_ATTESTED path=$FIX04_WORKTREE_ROOT head=$FIX04_BASE_REF branch=$EXPECTED_WORKTREE_BRANCH common=$EXPECTED_COMMON_DIR" ]]

UNRELATED_WORKTREE_STANZA=$'worktree /private/tmp/fix04-unrelated\nHEAD 0000000000000000000000000000000000000000\nbranch refs/heads/fix04-unrelated'
CONFLICTING_WORKTREE_STANZA=$'worktree /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04\nHEAD 0000000000000000000000000000000000000000\nbranch refs/heads/slice/oa-fix-04'
assert_registration_rejected wrong-common-dir "$EXPECTED_WORKTREE_STANZA" "$controller_common_dir" /private/tmp/fix04-wrong-common FIX04_WORKTREE_COMMON_DIR_MISMATCH
assert_registration_rejected missing-registration "$UNRELATED_WORKTREE_STANZA" "$controller_common_dir" "$lane_common_dir" FIX04_WORKTREE_REGISTRATION_MISSING
assert_registration_rejected duplicate-registration "$EXPECTED_WORKTREE_STANZA"$'\n\n'"$EXPECTED_WORKTREE_STANZA" "$controller_common_dir" "$lane_common_dir" FIX04_WORKTREE_REGISTRATION_DUPLICATE
assert_registration_rejected conflicting-registration "$EXPECTED_WORKTREE_STANZA"$'\n\n'"$CONFLICTING_WORKTREE_STANZA" "$controller_common_dir" "$lane_common_dir" FIX04_WORKTREE_REGISTRATION_CONFLICT

[[ "$(git -C "$FIX04_LANE" rev-parse --show-toplevel)" == "$FIX04_WORKTREE_ROOT" ]]
[[ "$(git -C "$FIX04_LANE" branch --show-current)" == slice/oa-fix-04 ]]
[[ "$(git -C "$CONTROLLER_ENGINE" show-ref --verify --hash "$EXPECTED_WORKTREE_BRANCH")" == "$FIX04_BASE_REF" ]]
[[ "$(git -C "$FIX04_LANE" rev-parse HEAD)" == "$FIX04_BASE_REF" ]]
[[ "$(git -C "$FIX04_LANE" rev-list --parents -n 1 HEAD)" == "$FIX04_BASE_REF $FIX04_AUTHORITY_REF $FIX01_REVIEW_REF" ]]
[[ "$(git -C "$FIX04_LANE" log -1 --format=%s)" == 'chore(obs): compose FIX-04 reviewed dependencies' ]]
[[ "$(git -C "$FIX04_LANE" rev-parse HEAD:dialectical-engine/apps/api/src/index.ts)" == "$EXPECTED_API_BLOB" ]]
[[ -z "$(git -C "$FIX04_LANE" status --porcelain=v1 --untracked-files=all)" ]]
[[ -z "$(git -C "$FIX04_LANE" diff --cached --name-only)" ]]
[[ -z "$(git -C "$FIX04_LANE" diff --name-only)" ]]
[[ ! -e "$ADMISSION_REPORT" ]]
[[ ! -e "$MISPLACED_REPORT" ]]
[[ ! -e "$FIX04_LANE/tests/architecture/fix04-zone-region.test.ts" ]]
! git -C "$FIX04_LANE" cat-file -e "$FIX04_BASE_REF:dialectical-engine/tests/architecture/fix04-zone-region.test.ts" 2>/dev/null

resume_zone_evidence="$(
  cd "$FIX04_LANE"
  FIX04_BASE_REF="$FIX04_BASE_REF" pnpm exec node --import tsx --input-type=module -e '
import { execFileSync } from "node:child_process";
import { resolveZoneRouteMountRegion } from "./tests/support/zone-boundary.ts";
const ref = process.env.FIX04_BASE_REF;
const source = execFileSync("git", ["show", `${ref}:dialectical-engine/apps/api/src/index.ts`], { encoding: "utf8" });
const region = resolveZoneRouteMountRegion(source);
if (!region.ok) throw new Error(region.reason);
const mounts = region.mounts.map(({ verb, path }) => ({ verb, path }));
const expected = [
  { verb: "post", path: "/v1/auth/register" },
  { verb: "post", path: "/v1/auth/verify-email" },
  { verb: "post", path: "/v1/auth/resend-verification" },
];
if (JSON.stringify(mounts) !== JSON.stringify(expected)) throw new Error("FIX04_RESUME_ZONE_SHAPE_MISMATCH");
console.log(`FIX04_RESUME_ZONE bytes=${region.bytes} sha256=${region.contentHash}`);
'
)"
[[ "$resume_zone_evidence" == 'FIX04_RESUME_ZONE bytes=1653 sha256=bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d' ]]
[[ -z "$(git -C "$FIX04_LANE" status --porcelain=v1 --untracked-files=all)" ]]
print "FIX04_RESUME_ATTESTED base=$FIX04_BASE_REF parents=$FIX04_AUTHORITY_REF,$FIX01_REVIEW_REF receipt=absent c1=absent lane=registered-clean"
```

Expected: the exact existing merge, branch, registered worktree root, parents, subject, API blob, semantic region, clean tracked/untracked/index state, absent controller receipt, absent misplaced receipt, and absent C1 file all pass. The controller and lane resolve to the same canonical physical Git common directory, the controller registry has exactly one non-conflicting path/HEAD/branch stanza, and the in-memory wrong-common-directory, missing, duplicate, and conflicting registration controls all fail for their named reasons. Any other existing state stops; do not recreate, reset, amend, merge, stash, clean, or edit it.

- [ ] **Step 3: Resolve and record the admitted zone evidence**

From the clean FIX-04 lane, use the existing semantic resolver on `FIX04_BASE_REF:dialectical-engine/apps/api/src/index.ts`. Require `ok=true`, three ordered POST mounts, `bytes=1653`, and `contentHash=bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d`.

Before writing the receipt, prove the controller-owned destination is an existing writable normal-report directory covered by the controller's existing ignore policy, while the code worktree and both indexes retain their admitted state:

```zsh
set -eu
CONTROLLER_ENGINE=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine
FIX04_LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04/dialectical-engine
FIX04_WORKTREE_ROOT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04
ADMISSION_REPORT=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md
MISPLACED_REPORT="$FIX04_WORKTREE_ROOT/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md"
EXPECTED_CONTROLLER_TRACKED_STATUS=' M dialectical-engine/docs/missions/observability-agents/slices/FIX-07/DECISIONS.md'

[[ -d "${ADMISSION_REPORT:h}" && -w "${ADMISSION_REPORT:h}" ]]
[[ ! -e "$ADMISSION_REPORT" ]]
[[ ! -e "$MISPLACED_REPORT" ]]
git -C "$CONTROLLER_ENGINE" check-ignore -q "$ADMISSION_REPORT"
if git -C "$FIX04_LANE" check-ignore -q "$MISPLACED_REPORT"; then
  print 'STOP: unexpected code-worktree receipt ignore rule'
  exit 1
fi
[[ "$(git -C "$CONTROLLER_ENGINE" status --porcelain=v1 --untracked-files=no)" == "$EXPECTED_CONTROLLER_TRACKED_STATUS" ]]
[[ -z "$(git -C "$CONTROLLER_ENGINE" diff --cached --name-only)" ]]
[[ -z "$(git -C "$FIX04_LANE" status --porcelain=v1 --untracked-files=all)" ]]
[[ -z "$(git -C "$FIX04_LANE" diff --cached --name-only)" ]]
print "FIX04_RECEIPT_PATH_ATTESTED path=$ADMISSION_REPORT controller_tracked=preserved controller_index=empty lane=clean"
```

Create `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md` with `apply_patch`. This is the controller-owned normal workspace, not the FIX-04 code worktree. Record these fields as literal expanded values, never as shell expressions:

- `FIX04_AUTHORITY_REF`: the full value validated in Step 1;
- `FIX01_REVIEW_REF`: `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`;
- `FIX04_BASE_REF`: the full merge SHA printed in Step 2;
- `FIX04_BASE_PARENT_1`: the same literal value recorded for `FIX04_AUTHORITY_REF`;
- `FIX04_BASE_PARENT_2`: `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`;
- `FIX04_API_BLOB`: `174ee8ff60461eb4f5aa233441b0367bb3d174b7`;
- `FIX04_ZONE_BYTES`: `1653`; and
- `FIX04_ZONE_SHA256`: `bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d`.

Write those eight fields as the report's only assignment-form lines. Admission is incomplete if a field is absent, empty, duplicated, conflicting, or accompanied by another assignment.

- [ ] **Step 4: Verify the admission receipt without editing code**

Run this total parser from the clean FIX-04 lane. It admits exactly eight unique assignment lines, performs in-memory missing/duplicate/conflicting/extra-assignment controls, and compares all eight values to Git and the semantic resolver:

```zsh
set -eu
ADMISSION_REPORT=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md
CONTROLLER_ENGINE=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine
FIX04_LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04/dialectical-engine
EXPECTED_CONTROLLER_TRACKED_STATUS=' M dialectical-engine/docs/missions/observability-agents/slices/FIX-07/DECISIONS.md'
EXPECTED_AUTHORITY_REF=d935aad03aa56e752016011c57a81c5d33d27680
EXPECTED_FIX01_REF=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4
EXPECTED_API_BLOB=174ee8ff60461eb4f5aa233441b0367bb3d174b7
EXPECTED_ZONE_BYTES=1653
EXPECTED_ZONE_SHA256=bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d
EXPECTED_MERGE_SUBJECT='chore(obs): compose FIX-04 reviewed dependencies'
required_receipt_keys=(
  FIX04_AUTHORITY_REF FIX01_REVIEW_REF FIX04_BASE_REF FIX04_BASE_PARENT_1
  FIX04_BASE_PARENT_2 FIX04_API_BLOB FIX04_ZONE_BYTES FIX04_ZONE_SHA256
)

parse_receipt_text() {
  local receipt_text="$1"
  local receipt_line receipt_key receipt_value required_key
  local -a receipt_lines
  local -A seen
  receipt_lines=("${(@f)receipt_text}")
  for receipt_line in "${receipt_lines[@]}"; do
    receipt_key="${receipt_line%%=*}"
    receipt_value="${receipt_line#*=}"
    case "$receipt_key" in
      (FIX04_AUTHORITY_REF|FIX01_REVIEW_REF|FIX04_BASE_REF|FIX04_BASE_PARENT_1|FIX04_BASE_PARENT_2|FIX04_API_BLOB|FIX04_ZONE_BYTES|FIX04_ZONE_SHA256) ;;
      (*) print -u2 "FIX04_RECEIPT_EXTRA_ASSIGNMENT:$receipt_key"; return 1 ;;
    esac
    [[ -n "$receipt_value" && "$receipt_value" != *[[:space:]]* ]] || {
      print -u2 "FIX04_RECEIPT_EMPTY_OR_SPACED_VALUE:$receipt_key"
      return 1
    }
    if (( ${+seen[$receipt_key]} == 1 )); then
      if [[ "${seen[$receipt_key]}" == "$receipt_value" ]]; then
        print -u2 "FIX04_RECEIPT_DUPLICATE_ASSIGNMENT:$receipt_key"
      else
        print -u2 "FIX04_RECEIPT_CONFLICTING_ASSIGNMENT:$receipt_key"
      fi
      return 1
    fi
    seen[$receipt_key]="$receipt_value"
  done
  for required_key in "${required_receipt_keys[@]}"; do
    (( ${+seen[$required_key]} == 1 )) || {
      print -u2 "FIX04_RECEIPT_MISSING_ASSIGNMENT:$required_key"
      return 1
    }
  done
  (( ${#receipt_lines[@]} == 8 && ${#seen[@]} == 8 )) || {
    print -u2 'FIX04_RECEIPT_ASSIGNMENT_COUNT_MISMATCH'
    return 1
  }
  for required_key in "${required_receipt_keys[@]}"; do
    print -r -- "$required_key=${seen[$required_key]}"
  done
}

receipt_text="$(LC_ALL=C rg '^[A-Za-z_][A-Za-z0-9_]*=' "$ADMISSION_REPORT")"
normalized_receipt="$(parse_receipt_text "$receipt_text")"
typeset -A receipt
for receipt_line in "${(@f)normalized_receipt}"; do
  receipt[${receipt_line%%=*}]="${receipt_line#*=}"
done

for receipt_mutant in \
  "$receipt_text"$'\nFIX04_ZONE_BYTES=1653' \
  "$receipt_text"$'\nFIX04_ZONE_BYTES=999' \
  "$receipt_text"$'\nUNREVIEWED_FIELD=1' \
  "$(print -r -- "$receipt_text" | rg -v '^FIX04_ZONE_BYTES=')"
do
  if mutant_out="$(parse_receipt_text "$receipt_mutant" 2>&1)"; then
    print 'STOP: malformed receipt was accepted'
    exit 1
  else
    mutant_rc=$?
  fi
  [[ $mutant_rc -ne 0 ]]
  [[ "$mutant_out" == *FIX04_RECEIPT_* ]]
  print "FIX04_RECEIPT_NEGATIVE_PROOF rc=$mutant_rc reason=$mutant_out"
done

[[ "${receipt[FIX04_AUTHORITY_REF]}" == "$EXPECTED_AUTHORITY_REF" ]]
[[ "${receipt[FIX01_REVIEW_REF]}" == "$EXPECTED_FIX01_REF" ]]
[[ "${receipt[FIX04_BASE_PARENT_1]}" == "$EXPECTED_AUTHORITY_REF" ]]
[[ "${receipt[FIX04_BASE_PARENT_2]}" == "$EXPECTED_FIX01_REF" ]]
[[ "${receipt[FIX04_API_BLOB]}" == "$EXPECTED_API_BLOB" ]]
[[ "${receipt[FIX04_ZONE_BYTES]}" == "$EXPECTED_ZONE_BYTES" ]]
[[ "${receipt[FIX04_ZONE_SHA256]}" == "$EXPECTED_ZONE_SHA256" ]]
FIX04_BASE_REF="${receipt[FIX04_BASE_REF]}"
[[ ${#FIX04_BASE_REF} -eq 40 && "$FIX04_BASE_REF" != *[!0-9a-f]* ]]
[[ "$(git rev-list --parents -n 1 "${FIX04_BASE_REF}^{commit}")" == "$FIX04_BASE_REF $EXPECTED_AUTHORITY_REF $EXPECTED_FIX01_REF" ]]
[[ "$(git log -1 --format=%s "$FIX04_BASE_REF")" == "$EXPECTED_MERGE_SUBJECT" ]]
[[ "$(git rev-parse "$FIX04_BASE_REF:dialectical-engine/apps/api/src/index.ts")" == "$EXPECTED_API_BLOB" ]]

zone_evidence="$(FIX04_BASE_REF="$FIX04_BASE_REF" pnpm exec node --import tsx --input-type=module -e '
import { execFileSync } from "node:child_process";
import { resolveZoneRouteMountRegion } from "./tests/support/zone-boundary.ts";
const ref = process.env.FIX04_BASE_REF;
const source = execFileSync("git", ["show", `${ref}:dialectical-engine/apps/api/src/index.ts`], { encoding: "utf8" });
const region = resolveZoneRouteMountRegion(source);
if (!region.ok) throw new Error(region.reason);
const mounts = region.mounts.map(({ verb, path }) => ({ verb, path }));
const expected = [
  { verb: "post", path: "/v1/auth/register" },
  { verb: "post", path: "/v1/auth/verify-email" },
  { verb: "post", path: "/v1/auth/resend-verification" },
];
if (JSON.stringify(mounts) !== JSON.stringify(expected)) throw new Error("FIX04_ZONE_SHAPE_MISMATCH");
console.log(`FIX04_ZONE_BYTES=${region.bytes}`);
console.log(`FIX04_ZONE_SHA256=${region.contentHash}`);
')"
[[ "$zone_evidence" == $'FIX04_ZONE_BYTES=1653\nFIX04_ZONE_SHA256=bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d' ]]
git -C "$CONTROLLER_ENGINE" check-ignore -q "$ADMISSION_REPORT"
[[ "$(git -C "$CONTROLLER_ENGINE" status --porcelain=v1 --untracked-files=no)" == "$EXPECTED_CONTROLLER_TRACKED_STATUS" ]]
[[ -z "$(git -C "$CONTROLLER_ENGINE" diff --cached --name-only)" ]]
[[ -z "$(git -C "$FIX04_LANE" status --porcelain=v1 --untracked-files=all)" ]]
[[ -z "$(git -C "$FIX04_LANE" diff --cached --name-only)" ]]
print "FIX04_RECEIPT_ATTESTED base=$FIX04_BASE_REF bytes=$EXPECTED_ZONE_BYTES sha256=$EXPECTED_ZONE_SHA256"
```

Expected: the real receipt and all eight Git/resolver comparisons pass; all four in-memory malformed receipts fail with a named receipt reason; the worktree remains clean with no test or product edit. Send the literal report and this output for independent read-only admission review. Task 2 must not begin until that review approves the same receipt and reruns this verifier.

---

### Task 2: Add the fail-closed C1 semantic zone guard

**Files:**

- Create: `tests/architecture/fix04-zone-region.test.ts`
- Read: `tests/support/zone-boundary.ts`
- Read: `apps/api/src/index.ts`
- Read: `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md`

**Interfaces:**

- Consumes: explicit `process.env.FIX04_BASE_REF` and `resolveZoneRouteMountRegion(source: string): ZoneRegion`.
- Produces: a two-case architecture test that proves exact shape and byte identity plus in-memory distinguishing controls.

- [ ] **Step 1: Write the complete C1 test**

Create `tests/architecture/fix04-zone-region.test.ts` with these behaviors:

```ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveZoneRouteMountRegion } from "../support/zone-boundary.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const indexGitPath = "dialectical-engine/apps/api/src/index.ts";
const indexPath = fileURLToPath(new URL("../../apps/api/src/index.ts", import.meta.url));
const authorityRef = "d935aad03aa56e752016011c57a81c5d33d27680";
const fix01Ref = "24d0b3e5de84876b6b46fa84b13a0a42aa2640a4";
const admissionSubject = "chore(obs): compose FIX-04 reviewed dependencies";
const expectedApiBlob = "174ee8ff60461eb4f5aa233441b0367bb3d174b7";
const expectedZoneBytes = 1653;
const expectedZoneHash = "bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d";
const expectedMounts = Object.freeze([
  Object.freeze({ verb: "post", path: "/v1/auth/register" }),
  Object.freeze({ verb: "post", path: "/v1/auth/verify-email" }),
  Object.freeze({ verb: "post", path: "/v1/auth/resend-verification" }),
]);

function gitText(args: readonly string[], failureCode: string): string {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    throw new Error(failureCode);
  }
}

function requiredBaseRef(): string {
  const value = process.env.FIX04_BASE_REF;
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error("FIX04_BASE_REF_REQUIRED_FULL_SHA");
  }
  const topology = gitText(
    ["rev-list", "--parents", "-n", "1", `${value}^{commit}`],
    "FIX04_BASE_REF_NOT_COMMIT",
  );
  if (topology !== `${value} ${authorityRef} ${fix01Ref}`) {
    throw new Error("FIX04_BASE_REF_TOPOLOGY_MISMATCH");
  }
  if (gitText(["log", "-1", "--format=%s", value], "FIX04_BASE_REF_NOT_COMMIT") !== admissionSubject) {
    throw new Error("FIX04_BASE_REF_SUBJECT_MISMATCH");
  }
  if (gitText(["rev-parse", `${value}:${indexGitPath}`], "FIX04_BASE_REF_API_BLOB_MISSING") !== expectedApiBlob) {
    throw new Error("FIX04_BASE_REF_API_BLOB_MISMATCH");
  }
  return value;
}

function readIndexSource(): string {
  return readFileSync(indexPath, "utf8");
}

function requireRegion(source: string, label: string) {
  const result = resolveZoneRouteMountRegion(source);
  if (!result.ok) throw new Error(`${label}:${result.reason}`);
  expect(result.mounts.map(({ verb, path }) => ({ verb, path }))).toEqual(expectedMounts);
  return result;
}

describe("FIX-04 per-slice zone delta", () => {
  it("matches the admitted immutable region to the worktree region", () => {
    const baseRef = requiredBaseRef();
    const baseSource = execFileSync("git", ["show", `${baseRef}:${indexGitPath}`], {
      cwd: root,
      encoding: "utf8",
    });
    const workSource = readIndexSource();
    const base = requireRegion(baseSource, "base");
    const work = requireRegion(workSource, "work");

    expect(base.bytes).toBe(expectedZoneBytes);
    expect(base.contentHash).toBe(expectedZoneHash);
    console.info("FIX04_ZONE_DELTA", JSON.stringify({
      baseRef,
      baseBytes: base.bytes,
      baseHash: base.contentHash,
      workBytes: work.bytes,
      workHash: work.contentHash,
    }));
    expect(work.region).toBe(base.region);
    expect(work.bytes).toBe(base.bytes);
    expect(work.contentHash).toBe(base.contentHash);
  });

  it("distinguishes an in-region edit from an offset-only edit and a missing mount", () => {
    const source = readIndexSource();
    const original = requireRegion(source, "original");
    const insertionOffset = source.indexOf("{", original.startOffset) + 1;
    expect(insertionOffset).toBeGreaterThan(original.startOffset);
    const changedInside = source.slice(0, insertionOffset)
      + " " + source.slice(insertionOffset);
    const inside = requireRegion(changedInside, "inside");
    expect(inside.contentHash).not.toBe(original.contentHash);

    const shifted = "\n".repeat(40) + source;
    const shiftedRegion = requireRegion(shifted, "shifted");
    expect(shiftedRegion.region).toBe(original.region);
    expect(shiftedRegion.contentHash).toBe(original.contentHash);

    const withoutMount = source.replace(
      'api.post("/v1/auth/register"',
      'api.get("/v1/auth/register"',
    );
    expect(withoutMount).not.toBe(source);
    expect(resolveZoneRouteMountRegion(withoutMount).ok).toBe(false);
  });
});
```

The test imports only Node built-ins, Vitest, and the shared resolver. It reads only the API index file. Do not call `assertZoneBoundaryIntact()`, because that helper's older S04-wide source inventory is not the FIX-04 read boundary.

- [ ] **Step 2: Prove invalid admission input fails closed**

Run the complete negative matrix three times. Each invocation captures output and status, proves the named identity test executed, requires exactly two executed tests, and requires the failure assigned to that case:

```zsh
set -eu
negative_cases=(
  'missing|UNSET|FIX04_BASE_REF_REQUIRED_FULL_SHA'
  'short|29f370e|FIX04_BASE_REF_REQUIRED_FULL_SHA'
  'nonhex|gggggggggggggggggggggggggggggggggggggggg|FIX04_BASE_REF_REQUIRED_FULL_SHA'
  'nonexistent|0000000000000000000000000000000000000000|FIX04_BASE_REF_NOT_COMMIT'
  'predecessor|b5ae558bdff12011dbf6f74f2a3655cbae5c724c|FIX04_BASE_REF_TOPOLOGY_MISMATCH'
  'authority-tip|d935aad03aa56e752016011c57a81c5d33d27680|FIX04_BASE_REF_TOPOLOGY_MISMATCH'
  'fix01-tip|24d0b3e5de84876b6b46fa84b13a0a42aa2640a4|FIX04_BASE_REF_TOPOLOGY_MISMATCH'
  'stale-s04-merge|3e91cf4222767d1eafc2c1dde8d336f87b8fc448|FIX04_BASE_REF_TOPOLOGY_MISMATCH'
)

for negative_case in "${negative_cases[@]}"; do
  case_parts=("${(@s:|:)negative_case}")
  case_label="${case_parts[1]}"
  case_ref="${case_parts[2]}"
  expected_failure="${case_parts[3]}"
  for run in 1 2 3; do
    if [[ "$case_ref" == UNSET ]]; then
      if negative_out="$(env -u FIX04_BASE_REF pnpm exec vitest run tests/architecture/fix04-zone-region.test.ts --reporter=verbose 2>&1)"; then
        negative_rc=0
      else
        negative_rc=$?
      fi
    else
      if negative_out="$(env FIX04_BASE_REF="$case_ref" pnpm exec vitest run tests/architecture/fix04-zone-region.test.ts --reporter=verbose 2>&1)"; then
        negative_rc=0
      else
        negative_rc=$?
      fi
    fi
    print -r -- "$negative_out"
    [[ $negative_rc -ne 0 ]]
    print -r -- "$negative_out" | grep -Fq 'matches the admitted immutable region to the worktree region'
    print -r -- "$negative_out" | grep -Fq "$expected_failure"
    print -r -- "$negative_out" | grep -Eq 'Tests[[:space:]]+.*\(2\)'
    print "FIX04_BASE_NEGATIVE_PROOF case=$case_label run=$run rc=$negative_rc reason=$expected_failure"
  done
done
```

No invalid-input command is a RED implementation baseline. Each is a fail-closed configuration proof, and any unexpected zero, missing test name, wrong reason, or zero/vacuous executed-test summary stops the matrix.

- [ ] **Step 3: Run the admitted C1 command three times**

Re-attest the exact eight-field receipt, derive the only permitted full base SHA from it, attest topology/subject/API blob again, and run:

```zsh
set -eu
ADMISSION_REPORT=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md
receipt_text="$(LC_ALL=C rg '^[A-Za-z_][A-Za-z0-9_]*=' "$ADMISSION_REPORT")"
[[ "$(print -r -- "$receipt_text" | awk 'NF { count += 1 } END { print count + 0 }')" -eq 8 ]]
[[ "$(print -r -- "$receipt_text" | rg -c -x 'FIX04_AUTHORITY_REF=d935aad03aa56e752016011c57a81c5d33d27680')" -eq 1 ]]
[[ "$(print -r -- "$receipt_text" | rg -c -x 'FIX01_REVIEW_REF=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4')" -eq 1 ]]
[[ "$(print -r -- "$receipt_text" | rg -c -x 'FIX04_BASE_REF=[0-9a-f]{40}')" -eq 1 ]]
[[ "$(print -r -- "$receipt_text" | rg -c -x 'FIX04_BASE_PARENT_1=d935aad03aa56e752016011c57a81c5d33d27680')" -eq 1 ]]
[[ "$(print -r -- "$receipt_text" | rg -c -x 'FIX04_BASE_PARENT_2=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4')" -eq 1 ]]
[[ "$(print -r -- "$receipt_text" | rg -c -x 'FIX04_API_BLOB=174ee8ff60461eb4f5aa233441b0367bb3d174b7')" -eq 1 ]]
[[ "$(print -r -- "$receipt_text" | rg -c -x 'FIX04_ZONE_BYTES=1653')" -eq 1 ]]
[[ "$(print -r -- "$receipt_text" | rg -c -x 'FIX04_ZONE_SHA256=bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d')" -eq 1 ]]
FIX04_BASE_REF="$(print -r -- "$receipt_text" | sed -n 's/^FIX04_BASE_REF=//p')"
[[ "$(git rev-list --parents -n 1 "${FIX04_BASE_REF}^{commit}")" == "$FIX04_BASE_REF d935aad03aa56e752016011c57a81c5d33d27680 24d0b3e5de84876b6b46fa84b13a0a42aa2640a4" ]]
[[ "$(git log -1 --format=%s "$FIX04_BASE_REF")" == 'chore(obs): compose FIX-04 reviewed dependencies' ]]
[[ "$(git rev-parse "$FIX04_BASE_REF:dialectical-engine/apps/api/src/index.ts")" == 174ee8ff60461eb4f5aa233441b0367bb3d174b7 ]]
for run in 1 2 3; do
  if positive_out="$(env FIX04_BASE_REF="$FIX04_BASE_REF" pnpm exec vitest run tests/architecture/fix04-zone-region.test.ts --reporter=verbose 2>&1)"; then
    positive_rc=0
  else
    positive_rc=$?
  fi
  print -r -- "$positive_out"
  [[ $positive_rc -eq 0 ]]
  print -r -- "$positive_out" | grep -Fq 'matches the admitted immutable region to the worktree region'
  print -r -- "$positive_out" | grep -Eq 'Tests[[:space:]]+2 passed[[:space:]]+\(2\)'
  print -r -- "$positive_out" | grep -Fq "$FIX04_BASE_REF"
  print -r -- "$positive_out" | grep -Fq 'bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d'
  print "FIX04_BASE_POSITIVE_PROOF run=$run rc=$positive_rc tests=2 base=$FIX04_BASE_REF"
done
```

Expected: each run executes exactly two tests, both pass, and prints `FIX04_ZONE_DELTA` with the explicit full `FIX04_BASE_REF`, `1653` bytes on both sides, and hash `bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d` on both sides. A missing file, zero selected tests, crash, or absent summary is nonzero.

- [ ] **Step 4: Verify source custody and scope**

Before staging, run this fail-closed exact-set check from the FIX-04 lane:

```zsh
set -eu
C1_PATH=tests/architecture/fix04-zone-region.test.ts
EXPECTED_PRESTAGE_STATUS="?? $C1_PATH"
[[ "$(git status --porcelain=v1 --untracked-files=all)" == "$EXPECTED_PRESTAGE_STATUS" ]]
[[ -z "$(git diff --cached --name-only)" ]]
[[ -z "$(git diff --name-only)" ]]
if whitespace_out="$(git diff --no-index --check /dev/null "$C1_PATH" 2>&1)"; then
  whitespace_rc=0
else
  whitespace_rc=$?
fi
[[ $whitespace_rc -eq 1 ]]
[[ -z "$whitespace_out" ]]
[[ "$(rg -c 'readFileSync' "$C1_PATH")" -eq 2 ]]
[[ "$(rg -c 'return readFileSync\(indexPath, "utf8"\);' "$C1_PATH")" -eq 1 ]]
! rg -n 'statSync|lstatSync|readdirSync|opendirSync|glob|packages/obs-capture/src/zone|apps/api/src/(registration|mfa|recovery|mail-channel|sessions|account-erasure|legacy-claim)' "$C1_PATH"
print "FIX04_PRESTAGE_SCOPE_ATTESTED status=$EXPECTED_PRESTAGE_STATUS index=empty tracked_unstaged=empty"
```

Expected: porcelain contains exactly the one untracked C1 path; the index and unstaged tracked set are empty; the untracked file has no diff-check warning; source custody contains only the import plus the single permitted `readFileSync(indexPath, "utf8")` call and no zone path or metadata API.

- [ ] **Step 5: Commit C1 and write its normal report**

Stage, attest, commit, and read back exactly the one architecture path:

```zsh
set -eu
C1_PATH=tests/architecture/fix04-zone-region.test.ts
EXPECTED_C1_SUBJECT='test(api): FIX-04 C1 — pin immutable zone delta'
git add -- "$C1_PATH"
[[ "$(git diff --cached --relative --name-status)" == $'A\ttests/architecture/fix04-zone-region.test.ts' ]]
git diff --cached --check
[[ -z "$(git diff --name-only)" ]]
[[ "$(git status --porcelain=v1 --untracked-files=all)" == 'A  tests/architecture/fix04-zone-region.test.ts' ]]
git commit -m "$EXPECTED_C1_SUBJECT"
FIX04_TIP_REF="$(git rev-parse HEAD)"
[[ "$(git log -1 --format=%s "$FIX04_TIP_REF")" == "$EXPECTED_C1_SUBJECT" ]]
[[ "$(git diff-tree --no-commit-id --name-status -r --relative "$FIX04_TIP_REF")" == $'A\ttests/architecture/fix04-zone-region.test.ts' ]]
[[ -z "$(git diff --cached --name-only)" ]]
[[ -z "$(git diff --name-only)" ]]
[[ -z "$(git status --porcelain=v1 --untracked-files=all)" ]]
print "FIX04_C1_COMMIT_ATTESTED tip=$FIX04_TIP_REF subject=$EXPECTED_C1_SUBJECT delta=A:$C1_PATH"
```

Write `.superpowers/sdd/PLAN-FixAgent/fix04-c1-implementation-report.md` outside the code commit. Record the eight admitted receipt fields, full `FIX04_TIP_REF`, three-run counts, invalid-input proofs, in-memory controls, file hash, commit SHA, and remaining product blocker. Do not claim R01-R04 or R07-R09, persisted data, acceptance, or Done.

- [ ] **Step 6: Bind pre-merge and any future post-merge receipt to topology**

Before pre-merge review, require the implementation report to contain exactly one full `FIX04_BASE_REF` and `FIX04_TIP_REF`, then prove the reviewed admission base is the tip's ancestor and the tip is exactly the one-path C1 commit:

```zsh
set -eu
IMPLEMENTATION_REPORT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04/.superpowers/sdd/PLAN-FixAgent/fix04-c1-implementation-report.md
[[ "$(rg -c -x 'FIX04_BASE_REF=[0-9a-f]{40}' "$IMPLEMENTATION_REPORT")" -eq 1 ]]
[[ "$(rg -c -x 'FIX04_TIP_REF=[0-9a-f]{40}' "$IMPLEMENTATION_REPORT")" -eq 1 ]]
FIX04_BASE_REF="$(sed -n 's/^FIX04_BASE_REF=//p' "$IMPLEMENTATION_REPORT")"
FIX04_TIP_REF="$(sed -n 's/^FIX04_TIP_REF=//p' "$IMPLEMENTATION_REPORT")"
[[ "$FIX04_BASE_REF" != "$FIX04_TIP_REF" ]]
[[ "$(git rev-list --parents -n 1 "${FIX04_BASE_REF}^{commit}")" == "$FIX04_BASE_REF d935aad03aa56e752016011c57a81c5d33d27680 24d0b3e5de84876b6b46fa84b13a0a42aa2640a4" ]]
[[ "$(git rev-parse "${FIX04_TIP_REF}^{commit}")" == "$FIX04_TIP_REF" ]]
git merge-base --is-ancestor "$FIX04_BASE_REF" "$FIX04_TIP_REF"
[[ "$(git merge-base "$FIX04_BASE_REF" "$FIX04_TIP_REF")" == "$FIX04_BASE_REF" ]]
[[ "$(git log -1 --format=%s "$FIX04_TIP_REF")" == 'test(api): FIX-04 C1 — pin immutable zone delta' ]]
[[ "$(git diff-tree --no-commit-id --name-status -r --relative "$FIX04_TIP_REF")" == $'A\ttests/architecture/fix04-zone-region.test.ts' ]]
print "FIX04_PREMERGE_TOPOLOGY_ATTESTED base=$FIX04_BASE_REF tip=$FIX04_TIP_REF"
```

If V later creates an integration merge, the V-owned post-merge operator records four literal full ref assignments in `.superpowers/sdd/PLAN-FixAgent/fix04-post-merge-zone-report.md`. The verifier derives each ref from that receipt rather than caller state:

```zsh
set -eu
POSTMERGE_REPORT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04/.superpowers/sdd/PLAN-FixAgent/fix04-post-merge-zone-report.md
for receipt_key in FIX04_BASE_REF FIX04_TIP_REF FIX04_MERGE_PARENT_REF FIX04_MERGE_RESULT_REF; do
  [[ "$(rg -c -x "$receipt_key=[0-9a-f]{40}" "$POSTMERGE_REPORT")" -eq 1 ]]
done
FIX04_BASE_REF="$(sed -n 's/^FIX04_BASE_REF=//p' "$POSTMERGE_REPORT")"
FIX04_TIP_REF="$(sed -n 's/^FIX04_TIP_REF=//p' "$POSTMERGE_REPORT")"
FIX04_MERGE_PARENT_REF="$(sed -n 's/^FIX04_MERGE_PARENT_REF=//p' "$POSTMERGE_REPORT")"
FIX04_MERGE_RESULT_REF="$(sed -n 's/^FIX04_MERGE_RESULT_REF=//p' "$POSTMERGE_REPORT")"
for immutable_ref in "$FIX04_BASE_REF" "$FIX04_TIP_REF" "$FIX04_MERGE_PARENT_REF" "$FIX04_MERGE_RESULT_REF"; do
  [[ ${#immutable_ref} -eq 40 && "$immutable_ref" != *[!0-9a-f]* ]]
  [[ "$(git rev-parse "${immutable_ref}^{commit}")" == "$immutable_ref" ]]
done
[[ "$(git rev-list --parents -n 1 "$FIX04_BASE_REF")" == "$FIX04_BASE_REF d935aad03aa56e752016011c57a81c5d33d27680 24d0b3e5de84876b6b46fa84b13a0a42aa2640a4" ]]
git merge-base --is-ancestor "$FIX04_BASE_REF" "$FIX04_TIP_REF"
[[ "$(git merge-base "$FIX04_BASE_REF" "$FIX04_TIP_REF")" == "$FIX04_BASE_REF" ]]
[[ "$(git rev-list --parents -n 1 "$FIX04_MERGE_RESULT_REF")" == "$FIX04_MERGE_RESULT_REF $FIX04_MERGE_PARENT_REF $FIX04_TIP_REF" ]]
git merge-base --is-ancestor "$FIX04_TIP_REF" "$FIX04_MERGE_RESULT_REF"
postmerge_evidence="$(FIX04_MERGE_PARENT_REF="$FIX04_MERGE_PARENT_REF" FIX04_MERGE_RESULT_REF="$FIX04_MERGE_RESULT_REF" pnpm exec node --import tsx --input-type=module -e '
import { execFileSync } from "node:child_process";
import { resolveZoneRouteMountRegion } from "./tests/support/zone-boundary.ts";
const resolveRef = (ref) => {
  const source = execFileSync("git", ["show", `${ref}:dialectical-engine/apps/api/src/index.ts`], { encoding: "utf8" });
  const region = resolveZoneRouteMountRegion(source);
  if (!region.ok) throw new Error(region.reason);
  return region;
};
const parent = resolveRef(process.env.FIX04_MERGE_PARENT_REF);
const result = resolveRef(process.env.FIX04_MERGE_RESULT_REF);
if (parent.region !== result.region || parent.contentHash !== result.contentHash) throw new Error("FIX04_POSTMERGE_ZONE_DELTA");
console.log(`FIX04_POSTMERGE_ZONE_IDENTITY bytes=${parent.bytes} sha256=${parent.contentHash}`);
')"
[[ "$postmerge_evidence" == 'FIX04_POSTMERGE_ZONE_IDENTITY bytes=1653 sha256=bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d' ]]
print "FIX04_POSTMERGE_TOPOLOGY_ATTESTED parent=$FIX04_MERGE_PARENT_REF result=$FIX04_MERGE_RESULT_REF tip=$FIX04_TIP_REF"
```

Expected: pre-merge evidence is the admitted base-to-descendant-tip relation; post-merge evidence, if it exists, is exactly a two-parent result whose first parent is the recorded integration state and whose second parent is the reviewed FIX-04 tip. Full strings without these ancestry and parent relations fail.

---

### Task 3: Stop product work at the reviewed interface boundary

**Files:**

- Read: `packages/obs-capture/src/emit.ts`
- Read: `packages/obs-capture/src/redactor.ts`
- Read: `packages/obs-capture/src/runtime/index.ts`
- Read: `apps/api/src/index.ts`
- Modify: none

**Interfaces:**

- Consumes: the reviewed FIX-01 capture ABI at `FIX01_REVIEW_REF`.
- Produces: a blocker receipt for the separate successor-authority task; no product or test delta.

- [ ] **Step 1: Reproduce the correlation-id gap**

Confirm at `FIX01_REVIEW_REF` that `emit()` and `captureHandled()` return `void`, `safeSourceEventRef()` obtains the id only from the redactor callback, and `INPUT_ALLOWLIST` omits `source_event_ref`. Record the three exact source locations and blob ids from `SPEC-v2.md` §7.

- [ ] **Step 2: Reproduce the route-template gap**

Confirm that runtime construction sets `component` to only `process` and `package`, and `INPUT_ALLOWLIST` omits `component`. Record why an API-only edit cannot persist `component.route_template`.

- [ ] **Step 3: Route the narrow successor question**

Request V authority for one exact capture contract that covers both caller-visible source-event reservation or acknowledgement and safe per-event route-template projection. The request must name the owner files, return/ordering semantics, privacy/zone rule, old-caller compatibility, spool/database equality proof, and mutants. It must not propose a direct obs-table write from the API.

- [ ] **Step 4: Stop**

Do not edit `apps/api/src/index.ts`, `apps/api/src/main.ts`, any capture package file, or any C2/C3 test until that successor is ratified. C1 remains a worker milestone only.

## Trace and handoff

| Successor obligation | Task | Proof |
|---|---|---|
| Exact reviewed authority | Task 1 | literal SHA, one parent, fixed subject, exact three-path delta, predecessor RED control |
| Exact reviewed composition | Task 1 | two parents, fixed subject, fixed API blob |
| Exact in-progress resume | Task 1 | literal `34ebf866...` HEAD, branch/worktree identity, topology, region, clean lane, absent receipt/C1 |
| Controller-owned receipt | Task 1 | fixed absolute normal-workspace path, existing ignore policy, unchanged controller/lane tracked and index state |
| Total admission receipt | Task 1 | eight unique fields; missing, duplicate, conflicting, and extra assignment controls |
| Explicit `FIX04_BASE_REF` | Tasks 1-2 | receipt plus exact authority/FIX-01 topology, subject, API blob, and wrong-full-ref matrix |
| Active option-B comparison | Task 2 | immutable base object versus worktree source, independently resolved |
| Exact C1 path state | Task 2 | one untracked path, one staged path, cached diff check, one-path commit, clean readback |
| Pre/post immutable history | Task 2 | base ancestry, exact tip delta, and exact merge-result parent topology |
| In-region distinguishing control | Task 2 | in-memory byte insertion changes the resolved hash |
| Offset neighbor control | Task 2 | forty prefixed newlines preserve region bytes and hash |
| Shape control | Task 2 | one ruled mount deletion makes resolution fail |
| No zone-file metadata | Task 2 | exact imports, read target, and custody scan |
| R03/R07 implementation hold | Task 3 | reviewed ABI evidence; no product diff |

At handoff, report exact SHAs and path sets. Keep the controller's pre-existing FIX-07 decision delta and unrelated untracked paths untouched. No execution result under this plan is V acceptance or FIX-04 Done.
