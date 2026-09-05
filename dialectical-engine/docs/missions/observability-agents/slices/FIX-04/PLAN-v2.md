# FIX-04 Immutable Admission and C1 Zone Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit FIX-04 from the exact reviewed authority/runtime composition, record its immutable base, and install a non-vacuous semantic zone-region guard before any product edit.

**Architecture:** Compose the reviewed controller authority and reviewed FIX-01 endpoint as one explicit two-parent merge, then record that merge's full SHA as `FIX04_BASE_REF`. The C1 test compares the semantic region from that immutable object with the worktree file, fails closed on absent or invalid input, and uses only in-memory mutants. Product behavior remains held because the reviewed capture interface cannot yet satisfy frozen R03 and R07.

**Tech Stack:** Git, zsh, TypeScript ESM, Node 22.23.1, pnpm 11, Vitest 4.1.10.

**Spec:** `docs/missions/observability-agents/slices/FIX-04/SPEC-v2.md`, together with unchanged rules in `SPEC.md`.

## Global Constraints

- This plan implements only dependency admission and C1. It permits no API, capture-package, helper, S04 test, migration, zone, UI, runner, scheduler, or listener edit.
- `FIX01_REVIEW_REF` is exactly `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`.
- `FIX04_AUTHORITY_REF` is a mandatory full-SHA input copied from the reviewed `fix04-b2-authority-report.md`; branch names and invocation-time `HEAD` are not substitutes.
- `FIX04_BASE_REF` is the exact two-parent composition merge created before the first implementation edit.
- The controller's existing FIX-07 decision delta and unrelated untracked paths remain untouched and unstaged.
- No command reads or uses `.hermes/**`.
- Every focused test command captures output before checking status, requires a nonzero executed-test count, and runs three times. The worst run controls.
- No merge into `dev`, push, production/service act, V acceptance, veto, or Done claim is authorized.

---

### Task 1: Create and record the reviewed dependency composition

**Files:**

- Create: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04/`
- Create: `.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md`
- Read: `.superpowers/sdd/PLAN-FixAgent/fix04-b2-authority-report.md`
- Read: FIX-01 final review reports `task-17-fix01-c5-zone-veto-sol-final-review.md` and `task-19-fix01-runtime-race-sol-review.md`

**Interfaces:**

- Consumes: reviewed `FIX04_AUTHORITY_REF` and exact `FIX01_REVIEW_REF`.
- Produces: branch `slice/oa-fix-04`, one two-parent composition commit, worktree `oa-fix-04`, and a durable receipt whose `FIX04_BASE_REF` is passed to every C1 run.

- [ ] **Step 1: Validate the exact inputs and controller state**

Run from `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine` with `FIX04_AUTHORITY_REF` already exported from the reviewed authority report:

```zsh
set -eu
: "${FIX04_AUTHORITY_REF:?supply the reviewed full authority SHA from fix04-b2-authority-report.md}"
FIX01_REVIEW_REF=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4
[[ ${#FIX04_AUTHORITY_REF} -eq 40 ]] || { print 'STOP: authority ref is not full length'; exit 1; }
[[ "$FIX04_AUTHORITY_REF" != *[!0-9a-f]* ]] || { print 'STOP: authority ref is not lowercase hex'; exit 1; }
git cat-file -e "${FIX04_AUTHORITY_REF}^{commit}"
git cat-file -e "${FIX01_REVIEW_REF}^{commit}"
[[ "$(git rev-parse "$FIX01_REVIEW_REF")" == "$FIX01_REVIEW_REF" ]]
[[ "$(git merge-base "$FIX04_AUTHORITY_REF" "$FIX01_REVIEW_REF")" == 2b670d3059c60d7262cf655bd5d402c88100dff3 ]]
git merge-base --is-ancestor 6649fd7d809c6bc2ff21123d8b47c3d8a2b553e9 "$FIX01_REVIEW_REF"
[[ "$(git rev-parse "$FIX04_AUTHORITY_REF:dialectical-engine/apps/api/src/index.ts")" == 174ee8ff60461eb4f5aa233441b0367bb3d174b7 ]]
[[ "$(git rev-parse "$FIX01_REVIEW_REF:dialectical-engine/apps/api/src/index.ts")" == 174ee8ff60461eb4f5aa233441b0367bb3d174b7 ]]
[[ -z "$(git diff --cached --name-only)" ]]
[[ ! -e /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-fix-04 ]]
! git show-ref --verify --quiet refs/heads/slice/oa-fix-04
```

Expected: exit `0`. The controller may still report the pre-existing unstaged FIX-07 decision path and unrelated untracked paths; none may enter the index.

- [ ] **Step 2: Create the one slice worktree and composition merge**

Run from the same controller directory:

```zsh
set -eu
FIX01_REVIEW_REF=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4
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

- [ ] **Step 3: Resolve and record the admitted zone evidence**

From the clean FIX-04 lane, use the existing semantic resolver on `FIX04_BASE_REF:dialectical-engine/apps/api/src/index.ts`. Require `ok=true`, three ordered POST mounts, `bytes=1653`, and `contentHash=bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d`.

Create `.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md` with `apply_patch`. Record these fields as literal expanded values, never as shell expressions:

- `FIX04_AUTHORITY_REF`: the full value validated in Step 1;
- `FIX01_REVIEW_REF`: `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`;
- `FIX04_BASE_REF`: the full merge SHA printed in Step 2;
- `FIX04_BASE_PARENT_1`: the same literal value recorded for `FIX04_AUTHORITY_REF`;
- `FIX04_BASE_PARENT_2`: `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`;
- `FIX04_API_BLOB`: `174ee8ff60461eb4f5aa233441b0367bb3d174b7`;
- `FIX04_ZONE_BYTES`: `1653`; and
- `FIX04_ZONE_SHA256`: `bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d`.

Admission is incomplete if a durable-report field is absent or empty.

- [ ] **Step 4: Verify the admission receipt without editing code**

Require all seven ref or digest fields (`FIX04_AUTHORITY_REF`, `FIX01_REVIEW_REF`, `FIX04_BASE_REF`, both parent refs, `FIX04_API_BLOB`, and `FIX04_ZONE_SHA256`) in the report to match the Git objects and exact constants above. Require the slice worktree to remain clean, with no test or product edit. Send the admission report for read-only authority verification before Task 2 begins.

---

### Task 2: Add the fail-closed C1 semantic zone guard

**Files:**

- Create: `tests/architecture/fix04-zone-region.test.ts`
- Read: `tests/support/zone-boundary.ts`
- Read: `apps/api/src/index.ts`
- Read: `.superpowers/sdd/PLAN-FixAgent/fix04-admission-report.md`

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
const expectedMounts = Object.freeze([
  Object.freeze({ verb: "post", path: "/v1/auth/register" }),
  Object.freeze({ verb: "post", path: "/v1/auth/verify-email" }),
  Object.freeze({ verb: "post", path: "/v1/auth/resend-verification" }),
]);

function requiredBaseRef(): string {
  const value = process.env.FIX04_BASE_REF;
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error("FIX04_BASE_REF_REQUIRED_FULL_SHA");
  }
  execFileSync("git", ["cat-file", "-e", `${value}^{commit}`], { cwd: root });
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

Run each command and require nonzero status with `FIX04_BASE_REF_REQUIRED_FULL_SHA` or a failed Git object check:

```zsh
env -u FIX04_BASE_REF pnpm exec vitest run tests/architecture/fix04-zone-region.test.ts --reporter=dot
FIX04_BASE_REF=29f370e pnpm exec vitest run tests/architecture/fix04-zone-region.test.ts --reporter=dot
FIX04_BASE_REF=0000000000000000000000000000000000000000 pnpm exec vitest run tests/architecture/fix04-zone-region.test.ts --reporter=dot
```

No invalid-input command is a RED implementation baseline. Each is a fail-closed configuration proof.

- [ ] **Step 3: Run the admitted C1 command three times**

Read the literal full SHA from `fix04-admission-report.md`, export it, and run:

```zsh
: "${FIX04_BASE_REF:?export the literal full SHA from fix04-admission-report.md}"
[[ ${#FIX04_BASE_REF} -eq 40 && "$FIX04_BASE_REF" != *[!0-9a-f]* ]] || { print 'STOP: invalid FIX04_BASE_REF'; exit 1; }
git cat-file -e "${FIX04_BASE_REF}^{commit}" || exit 1
for run in 1 2 3; do
  out="$(pnpm exec vitest run tests/architecture/fix04-zone-region.test.ts --reporter=dot 2>&1)"
  rc=$?
  print -r -- "$out"
  [[ $rc -eq 0 ]] || exit "$rc"
  print -r -- "$out" | grep -Eq 'Tests[[:space:]]+2 passed'
done
```

Expected: each run executes exactly two tests, both pass, and prints `FIX04_ZONE_DELTA` with the explicit full `FIX04_BASE_REF`, `1653` bytes on both sides, and hash `bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d` on both sides. A missing file, zero selected tests, crash, or absent summary is nonzero.

- [ ] **Step 4: Verify source custody and scope**

Run:

```zsh
git diff --check
git diff --name-only "$FIX04_BASE_REF"
git diff --cached --name-only
rg -n 'readFileSync|statSync|lstatSync|readdirSync|opendirSync|glob|packages/obs-capture/src/zone|apps/api/src/(registration|mfa|recovery|mail-channel|sessions|account-erasure|legacy-claim)' tests/architecture/fix04-zone-region.test.ts
```

Expected: diff check exits `0`; the unstaged path set is exactly `dialectical-engine/tests/architecture/fix04-zone-region.test.ts`; the index is empty; the custody scan names only the one permitted `readFileSync(indexPath, "utf8")` call and no zone path or metadata API.

- [ ] **Step 5: Commit C1 and write its normal report**

Stage only the architecture test and require the staged path set to equal that one path. Commit with exact subject:

```text
test(api): FIX-04 C1 — pin immutable zone delta
```

Write `.superpowers/sdd/PLAN-FixAgent/fix04-c1-implementation-report.md` outside the code commit. Record the admission pair, three-run counts, invalid-input proofs, in-memory controls, file hash, commit SHA, and remaining product blocker. Do not claim R01-R04 or R07-R09, persisted data, acceptance, or Done.

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
| Exact reviewed composition | Task 1 | two parents, fixed subject, fixed API blob |
| Explicit `FIX04_BASE_REF` | Task 1 | normal admission report with full SHA and parent readback |
| Active option-B comparison | Task 2 | immutable base object versus worktree source, independently resolved |
| In-region distinguishing control | Task 2 | in-memory byte insertion changes the resolved hash |
| Offset neighbor control | Task 2 | forty prefixed newlines preserve region bytes and hash |
| Shape control | Task 2 | one ruled mount deletion makes resolution fail |
| No zone-file metadata | Task 2 | exact imports, read target, and custody scan |
| R03/R07 implementation hold | Task 3 | reviewed ABI evidence; no product diff |

At handoff, report exact SHAs and path sets. Keep the controller's pre-existing FIX-07 decision delta and unrelated untracked paths untouched. No execution result under this plan is V acceptance or FIX-04 Done.
