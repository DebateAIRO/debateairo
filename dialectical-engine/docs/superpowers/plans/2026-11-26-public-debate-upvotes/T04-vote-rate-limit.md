### Task T04: The `publicVotes` admission budget

One flood brake per account for the three upvote routes together (design §5 "Rate limit", §7.2). This task adds
the budget and its default in code. It mounts no route and charges nothing: T07 does that.

Every command below is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

Depends on: nothing of this slice. May run alongside T01, T03, T09, T10 (no shared file). If another task shares
your working tree, run your typecheck and commit steps while no other task is in the middle of an edit, and read
every `git status` and typecheck expectation below as "nothing else of yours".

**Files:**
- Create: `tests/unit/public-vote-budget.test.ts`
- Modify: `packages/register/src/session-policy.ts:157-163` (schema member), `:199-203` (type member), `:344-348`
  (the default), `:354-355` (the `??` line), `:447-453` (the parsed member)
- Modify: `apps/api/src/admission.ts:9-14` (scope name), `:36-44` (bucket policy union), `:107-110` (the bucket)
- Modify: `tests/architecture/b10-admission-policy-register.test.ts:48-52` (the whole-policy `toEqual`)
- Modify: `docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md:10` (row 4, one clause)
- Test: `tests/unit/public-vote-budget.test.ts`, `tests/architecture/b10-admission-policy-register.test.ts`

**Interfaces:**
- Consumes: nothing from another task of this slice. (The tree already holds `dev` with step 0192.)
- Produces, for T07 (the routes) and its tests:
  - `AdmissionScope` (`apps/api/src/admission.ts`) includes `"publicVotes"`.
  - `AdmissionPolicy.publicVotes: AdmissionScopePolicy<"owner">` (`@debateai/register`), never `null`.
  - The register member is `public_votes` (optional in the `admissionPolicy` row). When a version carries none, the
    parsed value is `{ key: "owner", limit: 60, windowMs: 60_000, capacity: 65_536 }`.
  - `new AdmissionLimiter(policy)` always has the bucket, so `admitOrRefuse(reply, "publicVotes", route, ownerRef)`
    (`apps/api/src/index.ts:2949-2958`) is called with NO `options.admission?.configured(...)` guard. The key is the
    session's `ownerRef` for all three routes.
  - A small budget for a route test: `admissionPolicyFromValue({ ...ADMISSION_POLICY_REGISTER_ROW.value,
    public_votes: { key: "owner", limit: 2, window_ms: 60_000, capacity: 8 } }, "test")`.

**Before you start:**

Read these as templates.
- `packages/register/src/session-policy.ts:157-162`, `:199-202`, `:324-346`, `:354-355`, `:441-452`: how
  `publish_checks` and `language_checks` are optional members with a default in the parser. Copy that pattern member
  for member.
- `apps/api/src/admission.ts:9-14`, `:36-44`, `:103-110`: the scope union, the bucket's policy union and the two
  always-present buckets (`publishChecks`, `languageChecks`).
- `tests/unit/nv47-language-check-budget.test.ts:18-33` and `:85-122`: the test shape (helpers `refusalCode` and
  `with…`, the "admits N then LIMIT then next window" case, the CAPACITY case).

Traps.
- Do not edit either sealed row: `ADMISSION_POLICY_REGISTER_ROW` (`session-policy.ts:213-228`) and
  `ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW` (`:262-322`) stay byte for byte, their `sourceRef` strings included.
  The default lives only in the parser. A test below pins that neither row has a `public_votes` member.
- `DEFAULT_PUBLIC_VOTES` is NOT exported. The source audit refuses an exported upper-case numeric constant, and
  no other file needs it.
- Do NOT add `"publicVotes"` to `EVICTING_SCOPES` (`admission.ts:62-65`). It is keyed by account and must refuse a
  new key when its table is full. `tests/unit/admission-public-reads-capacity.test.ts:91-106` walks every parsed
  scope and fails if an owner-keyed one evicts. That file is not edited.
- Do NOT add it to `SUPPORT_SWEPT_SCOPES` (`admission.ts:16-18`); `tests/unit/sf-s05-admission-sweep.test.ts:95-96`
  pins that list. Expired keys of a full table are dropped on the next new key (`admission.ts:170-175`).
- Capacity is `65_536`, as every per-minute account scope (`session-policy.ts:311-320`). Not `8_192` (`asks`) and
  not `196_608` (the two 24-hour defaults).
- `tests/architecture/b10-admission-policy-register.test.ts:26-53` is the only test that lists every member of the
  parsed policy. It goes red by name until the member is added there.
- `apps/api/src/index.ts` and `apps/api/src/main.ts` are not touched by this task (T07 alone edits them).
- The pull request's `limits-check` job reads every added line and every commit message and refuses a figure that
  is on a secret list kept outside the repository (`tools/limits-check.mjs:2-20`). There is no list on this machine,
  so only the pull request shows it. Keep figures out of the commit message. If the job refuses the default's line,
  stop and report: the number is then the owner's to change. Never add the mark `limits-check-ok` to this line.
- The new test file sits flat in `tests/unit/` (the gate accepts only `tests/<dir>/<name>.test.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/public-vote-budget.test.ts` with exactly these cases.

```ts
import { describe, expect, it } from "vitest";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";

/**
 * Public debate upvotes (design 2026-11-26, section 5): casting, withdrawing and the "which have I upvoted" read share
 * one per-account flood brake, the `publicVotes` admission scope. No sealed row carries `public_votes`; the parser
 * applies its default, so every settings version gets the bound. Keyed by account and fail-closed (never evicting).
 */
const DEFAULT_PUBLIC_VOTES = { key: "owner", limit: 60, windowMs: 60_000, capacity: 65_536 };
const VALID = { key: "owner", limit: 3, window_ms: 1_000, capacity: 16 };
const T0 = new Date("2026-11-26T12:00:00.000Z");

function refusalCode(value: unknown): unknown {
  try {
    admissionPolicyFromValue(value, "public-votes");
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return "NOT_REFUSED";
}

function withPublicVotes(publicVotes: unknown) {
  return { ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, public_votes: publicVotes };
}

function sealedLimiter(): AdmissionLimiter {
  return new AdmissionLimiter(admissionPolicyFromValue(
    ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef
  ));
}

describe("publicVotes admission scope (public debate upvotes)", () => {
  it("the sealed row and the deployment row both resolve to the parser's default", () => {
    for (const row of [ADMISSION_POLICY_REGISTER_ROW, ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW]) {
      const policy = admissionPolicyFromValue(row.value, row.sourceRef);
      expect(policy.publicVotes).toEqual(DEFAULT_PUBLIC_VOTES);
      expect(Object.isFrozen(policy.publicVotes)).toBe(true);
    }
  });

  it("a version that carries public_votes gets exactly that value", () => {
    const policy = admissionPolicyFromValue(withPublicVotes(VALID), "public-votes");
    expect(policy.publicVotes).toEqual({ key: "owner", limit: 3, windowMs: 1_000, capacity: 16 });
  });

  it("a well-formed public_votes is accepted; a source key, a zero limit, a window past 24 h, a capacity past the bound and an unknown member are refused", () => {
    expect(refusalCode(withPublicVotes(VALID))).toBe("NOT_REFUSED");
    for (const publicVotes of [
      { ...VALID, key: "source" },
      { ...VALID, limit: 0 },
      { ...VALID, window_ms: 86_400_001 },
      { ...VALID, capacity: 1_048_577 },
      { ...VALID, windowMs: 1_000 },
      null
    ]) {
      expect(refusalCode(withPublicVotes(publicVotes)), JSON.stringify(publicVotes)).toBe("ADMISSION_POLICY_INVALID");
    }
  });

  // guard: green before the change too. The default lives in the parser, never in a sealed row.
  it("no sealed row carries a public_votes member", () => {
    expect("public_votes" in ADMISSION_POLICY_REGISTER_ROW.value).toBe(false);
    expect("public_votes" in ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value).toBe(false);
  });

  it("the default limiter admits 60 actions per account per fixed minute, and the next minute admits again", () => {
    const limiter = sealedLimiter();
    expect(limiter.configured("publicVotes")).toBe(true);
    for (let action = 1; action <= 60; action += 1) {
      expect(limiter.decide("publicVotes", "owner:heavy", T0), String(action)).toEqual({ allowed: true });
    }
    expect(limiter.decide("publicVotes", "owner:heavy", T0)).toEqual({
      allowed: false, reason: "LIMIT", retryAfterMs: 60_000, windowMs: 60_000
    });
    expect(limiter.decide("publicVotes", "owner:other", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publicVotes", "owner:heavy", new Date(T0.getTime() + 59_999)))
      .toMatchObject({ allowed: false, reason: "LIMIT", retryAfterMs: 1 });
    expect(limiter.decide("publicVotes", "owner:heavy", new Date(T0.getTime() + 60_000))).toEqual({ allowed: true });
  });

  it("vote actions and asks are counted apart", () => {
    const limiter = sealedLimiter();
    for (let action = 1; action <= 61; action += 1) limiter.decide("publicVotes", "owner:a", T0);
    expect(limiter.size("asks")).toBe(0);
    for (let ask = 1; ask <= 20; ask += 1) {
      expect(limiter.decide("asks", "owner:a", T0), String(ask)).toEqual({ allowed: true });
    }
    expect(limiter.decide("asks", "owner:a", T0)).toMatchObject({ allowed: false, reason: "LIMIT" });
    expect(limiter.decide("publicVotes", "owner:b", T0)).toEqual({ allowed: true });
    expect(limiter.size("publicVotes")).toBe(2);
  });

  it("a full table refuses a new account with CAPACITY, and keeps the counted ones", () => {
    const limiter = new AdmissionLimiter(admissionPolicyFromValue(
      withPublicVotes({ key: "owner", limit: 2, window_ms: 60_000, capacity: 2 }), "public-votes"
    ));
    expect(limiter.decide("publicVotes", "owner:a", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publicVotes", "owner:b", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publicVotes", "owner:c", T0)).toEqual({
      allowed: false, reason: "CAPACITY", retryAfterMs: 60_000, windowMs: 60_000
    });
    expect(limiter.size("publicVotes")).toBe(2);
    expect(limiter.decide("publicVotes", "owner:a", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publicVotes", "owner:a", T0)).toMatchObject({ allowed: false, reason: "LIMIT" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-vote-budget.test.ts`

Expected: `Tests  6 failed | 1 passed (7)`. The one that passes is "no sealed row carries a public_votes member".
The failures read: `expected undefined to deeply equal …` (the default), `The sealed admission policy is absent or
malformed` (twice: the strict schema does not know `public_votes` yet),
`expected 'ADMISSION_POLICY_INVALID' to be 'NOT_REFUSED'`, `expected false to be true` (`configured`), and
`TypeError: ADMISSION_SCOPE_UNKNOWN:publicVotes`.

- [ ] **Step 3: Add the member to the one test that lists the whole parsed policy**

In `tests/architecture/b10-admission-policy-register.test.ts`, between the `languageChecks` line (`:51`) and the
`sourceRef` line (`:52`), add:

```ts
      // Public debate upvotes (design 2026-11-26): the parser's default; the sealed row carries no such member.
      publicVotes: { key: "owner", limit: 60, windowMs: 60_000, capacity: 65_536 },
```

- [ ] **Step 4: Run it and see it fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/b10-admission-policy-register.test.ts`

Expected: `Tests  1 failed | 2 passed (3)`; the failing one is "pins the proposed admission values pending V-1
ratification", whose diff shows `publicVotes` missing from the received object.

- [ ] **Step 5: The register member and its default** (`packages/register/src/session-policy.ts`)

Five edits, each beside its `language_checks` / `languageChecks` twin. Nothing else in the file changes.

1. `admissionPolicyValueSchema` (`:137-163`): after `language_checks` (`:162`, which gains a comma), a new last
   member `public_votes: admissionScopeValueSchema("owner").optional()`, under a two-line comment in the style of
   `:160-161` saying: public debate upvotes (design 2026-11-26), per account; no sealed row carries it; the parser
   applies `DEFAULT_PUBLIC_VOTES` when absent, so the parsed scope is never null.
2. `AdmissionPolicy` (`:174-204`): after `languageChecks` (`:202`) and before `sourceRef` (`:203`),
   `publicVotes: AdmissionScopePolicy<"owner">;` with a one-line doc comment: the three upvote routes together, per
   account; never null (the parser's default when the version carries none).
3. After `DEFAULT_LANGUAGE_CHECKS` (`:344-346`) and before `admissionPolicyFromValue` (`:348`), not exported:

```ts
const DEFAULT_PUBLIC_VOTES = Object.freeze({
  key: "owner" as const, limit: 60, window_ms: 60_000, capacity: 65_536
});
```

   Its doc comment says, in the file's own style (`:324-329`): one account's upvote actions (casting, withdrawing and
   the "which have I upvoted" read together) per API process per fixed minute, starting at the account's first
   counted action; applied when the version carries no `public_votes`, which is every sealed version today, so
   neither row above is edited; it only stops floods, the one-vote rule is the table's primary key; the capacity is
   the other per-minute account scopes'; fail-closed, never evicting; the value is the owner's to rule (V-1).
   No money amount in that comment.
4. In `admissionPolicyFromValue`, after `:355`:
   `const publicVotes = policy.public_votes ?? DEFAULT_PUBLIC_VOTES;`
5. In the returned object, after the `languageChecks` member (`:447-452`) and before `sourceRef` (`:453`), a frozen
   `publicVotes` member mapped exactly as `languageChecks` is: `key`, `limit`, `windowMs: publicVotes.window_ms`,
   `capacity`.

- [ ] **Step 6: The limiter's scope and bucket** (`apps/api/src/admission.ts`)

Three edits. `EVICTING_SCOPES` (`:62-65`) and `SUPPORT_SWEPT_SCOPES` (`:16-18`) are not touched.

1. `AdmissionScope` (`:9-14`): a new last line `| "publicVotes";` (the semicolon moves from `:14`).
2. `AdmissionBucket.policy` (`:36-44`): add `| AdmissionPolicy["publicVotes"]` as the last member of the union,
   inside the `NonNullable<…>`.
3. Constructor (`:103-110`): directly after the `languageChecks` entry (`:110`) and before the `// DL1-F2` comment
   (`:111`):

```ts
      // Public debate upvotes (design 2026-11-26): always present (the parser's default when the version carries none);
      // keyed by account, fail-closed (not in EVICTING_SCOPES).
      ["publicVotes", { policy: policy.publicVotes, entries: new Map() }],
```

- [ ] **Step 7: Run both tests and see them pass**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-vote-budget.test.ts`
Expected: `Tests  7 passed (7)`.

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/b10-admission-policy-register.test.ts`
Expected: `Tests  3 passed (3)`.

- [ ] **Step 8: Name the scope in go-live row 4**

`docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md:10` lists the in-memory scopes that a restart
resets and a second API instance doubles. In that one line, replace

``the four calls before Start's `startStepCalls` (owner ruling 2026-11-09) (a restart resets them``

with

``the four calls before Start's `startStepCalls` (owner ruling 2026-11-09) and the public-debate upvote routes' `publicVotes` (design 2026-11-26) (a restart resets them``

The row stays one line; no row is added or renumbered (a test counts the rows as 1 to 77 with no gap).

- [ ] **Step 9: Verify**

Each command with the prefix
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`:

| Command | Expected |
|---|---|
| `pnpm exec vitest run tests/unit/public-vote-budget.test.ts` | `Tests  7 passed (7)` |
| `pnpm exec vitest run tests/architecture/b10-admission-policy-register.test.ts` | `Tests  3 passed (3)` |
| `pnpm exec vitest run tests/unit/admission-public-reads-capacity.test.ts` | `Tests  4 passed (4)`, file unedited (red here means the scope was made evicting) |
| `pnpm exec vitest run tests/unit/nv46-publish-check-budget.test.ts` | `Tests  6 passed (6)`, file unedited |
| `pnpm exec vitest run tests/unit/nv47-language-check-budget.test.ts` | `Tests  9 passed (9)`, file unedited |
| `pnpm exec vitest run tests/unit/sf-s05-admission-sweep.test.ts` | `Tests  11 passed (11)`, file unedited |
| `pnpm exec vitest run tests/unit/api-admission-limits.test.ts` | `Tests  8 passed (8)`, file unedited |
| `pnpm exec vitest run tests/architecture/scaffold.test.ts` | `Tests  1 failed \| 28 passed (29)`: the one known red of the untouched tree (the undeclared `obs-capture` edges), nothing new |
| `pnpm exec vitest run tests/architecture/vps-billing-runbook.test.ts` | `Tests  29 passed (29)`, file unedited (it counts the checklist's rows) |
| `pnpm run typecheck` | exit 0 (no `error TS` line) |
| `git status --short` | the five paths of this task, and nothing else of yours (the `??` lines under `docs/superpowers/` were there before and are not staged) |

- [ ] **Step 10: Stage the five paths and run the limits check on them**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add packages/register/src/session-policy.ts apps/api/src/admission.ts tests/architecture/b10-admission-policy-register.test.ts tests/unit/public-vote-budget.test.ts docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
```

Never `git add -A` or `git add .`: the tree holds untracked plan and design files that are not this task's.
Expected from the check: a `LIMITS_CHECK_NO_LIST: …` note, then `LIMITS_CHECK_OK <n> added line(s) read.`, exit 0.
Only the shape half runs here; the list half runs in the pull request.

- [ ] **Step 11: Commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "Upvotes on public debates get their own per-account request budget, with its default in code, so it is in force on every settings version." -m "The admission policy takes an optional public_votes member; the parser fills the default when a version carries none, so no sealed row is edited and the limiter always has the publicVotes scope. Nothing charges it yet: the three upvote routes do, in their own task. Tests: tests/unit/public-vote-budget.test.ts; the B10 test lists the member; go-live row 4 names the scope." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

No figure in the commit message (the pull request's limits check reads it). The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The
last `-m` is the attribution line; if your session's instructions give another one, use theirs.
