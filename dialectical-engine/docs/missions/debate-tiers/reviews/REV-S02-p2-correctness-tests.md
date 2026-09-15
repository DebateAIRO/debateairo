# REV(S02) pass 2 — lens `correctness/tests` · seat REV-S02-p2-correctness-tests · ticket `t_1a0293cc`

**SKILLS LOADED:** `superpowers:using-superpowers` ·
`heartbeat-protocol` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`) ·
`heartbeat-reviewer` (`.claude/skills/heartbeat-reviewer/SKILL.md`) ·
`superpowers:verification-before-completion`. Nothing else was loaded.

- worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-p2-correctness/dialectical-engine`,
  detached HEAD `88f8a01f`, READ-ONLY; **no git write of any kind** this session.
- `pnpm run generate:contract` rc=0; `git status --porcelain` = **0** at the CLAIM, after every
  mutant restore, and at this handoff. Four product files were mutated temporarily and each
  restore was proved by sha256 equality against the copy captured before the first mutant
  (`/private/tmp/debate-tiers-REV-S02-p2-correctness-tests/orig/SHA256.txt`), not by `git status` alone.
- probe root `/private/tmp/debate-tiers-REV-S02-p2-correctness-tests` (every log named below lives there).
- blind: no sibling `rev-s02-p2-*` worktree, no other lens's output, no `slice/tiers-s02` lane was
  opened. **One disclosure, the same shape as pass 1:** promoting my probes into the SHARED
  `.hermes/reports/debate-tiers/probes/` printed the product lens's two pass-2 filenames in the `ls`.
  I opened neither, and every finding and the predictions in §8 were written before that listing.
- process hygiene: every long run was a `nohup`'d script whose PID I recorded
  (`clusters.pid` 20726, `tc.pid` 22864, `probes.pid` 23464, `verify-promoted.pid` 30217); all four
  are gone at handoff; no `pkill`; no port taken. `lsof` on :3000/:3001/:8790-:8793/:55432 at the end
  matches `listener-baseline.txt` (`:3000 1`, everything else 0). Two temporary fixtures under
  `tests/` are deleted; no dev server, no browser, no live database.

**VERDICT: PASS (pass 2 of 3) for the lens `correctness/tests`.** Every finding this lens raised at
pass 1 is closed, measured by me. Three non-blocking findings are new; none of them changes the built
behaviour, and each carries a remedy. One row for V is in §7.

---

## 1. Packet review (the packet is in my scope; its author cannot review it)

Every constant in `/.hermes/planning/debate-tiers/packets/REV-S02-p2-correctness-tests.md` re-measured
from my own cwd.

| packet claim | re-measured | verdict |
|---|---|---|
| detached HEAD `88f8a01f` | `git rev-parse --short HEAD` → `88f8a01f` | HOLDS |
| `88f8a01f` = `9ef275aa` + F3 `e8a7ad1a` + F1 `88496931` + F2 `88f8a01f` | `git log --oneline -5` reproduces exactly that chain | HOLDS |
| base `9ef275aa`, range `9ef275aa..88f8a01f`, "664-line product diff" | `git diff 9ef275aa..88f8a01f -- apps packages tests migrations \| wc -l` → **664**; `--stat` → **7 files, 373 insertions(+), 41 deletions(-)**, identical to `diffstat.txt` | HOLDS |
| freeze pair `07606035..c29741da`, cwd-relative pathspec | `git diff --stat 07606035..c29741da -- docs/missions/debate-tiers` → 5 files, 56 insertions (`RESUME-HERE`, `V-DECISIONS-PACKET`, S01 `PROGRESS`, S02 `DECISIONS`, S02 `PROGRESS`) | HOLDS |
| comment cursor at dispatch = 1 | the ticket carried exactly one comment (the DISPATCHED) | HOLDS |
| `ui: no` slice, "no DONE.md exists" | `ls docs/missions/debate-tiers/slices/S02/` → `DECISIONS PLAN PROGRESS SPEC-v2 SPEC`; no `DONE.md` | HOLDS |
| `allowed` list vs the deliverables demanded | artifact + self-report + probes under `.hermes/…/probes/` + a temporary fixture under `tests/` — all four needed, all four permitted | HOLDS |

**The pass-1 packet defect N7 (`t_512afe29`) is CLOSED by this packet.** Line 10 now carries a
concrete `<previous>..<latest>` pair *and* names the cwd-relative-pathspec trap in the same sentence;
I ran the command as written and it produced a non-empty diff on the first attempt. That was the
single most expensive packet defect of pass 1 and it is gone.

**N3 below is the one packet-adjacent defect I found**, and it is honest to say it originates in my
own pass-1 probe, not in the orchestrator's prose (§4 N3).

**Author `SKILLS LOADED` lines against the worker floor** (`heartbeat-protocol` §1: `using-superpowers`,
`heartbeat-protocol`, `heartbeat-worker`, `test-driven-development`, `verification-before-completion`,
`systematic-debugging`, plus `receiving-code-review` on a FIX node): FIX-S02-p1-F1, -F2 and -F3 each
name all seven, plus reference files (`codex-tools.md`, `writing-good-tests.md`, `root-cause-tracing.md`)
and, for F2, `brainstorming`. No shortfall; no skill named that the floor does not contain. No finding.

---

## 2. What I re-ran (verbatim)

### 2.1 The four cluster commands, three runs each, in MY worktree

Runner `clusters.sh` (PID 20726); full vitest output in `C{1,2,3,4}.r{1,2,3}.log`.

| cluster | run 1 | run 2 | run 3 | worst | `reverify-88f8a01f.txt` |
|---|---|---|---|---|---|
| C1 `vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | `Test Files 2 passed (2)` · `Tests 27 passed (27)` rc=0 | identical | identical | GREEN | matches |
| C2 `vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | `Test Files 3 passed (3)` · `Tests 58 passed (58)` rc=0 | identical | identical | GREEN | matches |
| C3 `vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | `Test Files 1 failed \| 1 passed (2)` · `Tests 3 failed \| 6 passed (9)` rc=1 | identical | identical | RED, inherited | matches |
| C4 `vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts` | `Test Files 4 passed (4)` · `Tests 42 passed (42)` rc=0 | identical | identical | GREEN | matches |

C3's three failures, named and dated **pre-existing** (`BASELINE.md`: `s14-contract` 3 failed / 2
passed at base on both lanes), identical in all three runs:
`uses the generated contract client for both browser and SSR with no V2 wire mirror` ·
`FX-ORPH-04 walks web consumers in both directions and rejects the death-list inventory` ·
`carries the S04 orphan-audit wording fix and deterministic locale tiebreak`.
Every `Test Files` count is pinned (the multi-path silent-drop trap). **Delta vs pass 1:** C1 25→27
(F1's two pre-0061 cases), C2 55→58 (F2's three), C3 and C4 unchanged.

### 2.2 R14 — the typecheck delta

`pnpm typecheck` at `88f8a01f` → rc=1 (inherited), **70 `error TS` lines across 22 files**
(`typecheck-head.log`, `tc-head-by-file.txt`). File-for-file and count-for-count identical to the
`tiers-s02` block of `BASELINE.md:47-70` **and** to my pass-1 §2.2. `grep -nE
'apps/api/src/index\.ts|packages/db/src|packages/contract/src|tiers-s02'` over the log → **empty**.
R14 delta = **0**.

### 2.3 Every promoted pass-1 probe, re-run by me

| probe | my measurement at `88f8a01f` | at `9ef275aa` (pass 1) | reading |
|---|---|---|---|
| `REV-S02-p1-correctness-tests-pre-0061-schema.sh` | `Test Files 3 passed (3)` · `Tests 76 passed (76)` · rc=0 · **42703 hits=0** | `2 failed \| 1 passed (3)` · `34 failed \| 42 passed (76)` · rc=1 · hits=14 | **B1's sample closed** |
| the fourth pair `database.test.ts` + `s7-authorization-database.test.ts` | `Test Files 2 failed (2)` · `Tests 2 failed \| 70 passed (72)` | `3 failed \| 69 passed (72)` | the slice-owned third failure (`fails closed and rolls migration 0037 back when any pre-S7 immutable run contains a raw user id`) is **gone**; the two survivors are the pre-existing runner-lifecycle failure and the lock-waiter race |
| `REV-S02-p1-correctness-tests-slice-probe.sh` (mine) | `Test Files 1 failed (1)` · `Tests 1 failed \| 6 passed (7)` | `1 passed (1)` · `7 passed (7)` | **expected**: the only failure is my pass-1 case 7, which PINNED the pre-fix `TypeError`; it now reads `expected { name: 'AskRefusal', …} to deeply equal { name: 'TypeError', code: null, …}`. The behaviour changed by design (N5's fix). Superseded by my `…-boundary.test.ts` (§3) |
| `REV-S02-p1-security-data-safety--run.sh` (security does not sit on this pass) | probe A `1 passed (1)` · `4 passed (4)`; probe B `1 passed (1)` · `5 passed (5)`; rcA=0 rcB=0 | 4/4 and 5/5 | unchanged |
| `REV-S02-p1-security-data-safety--mutant-evaluator-vacuity.sh` | **Cell A** (head + evaluator leak): `Test Files 1 failed (1)` · `Tests 1 failed \| 20 skipped (21)` · rc=1 · Cell B same | Cell A rc=0, `1 passed \| 20 skipped` — **vacuous** | **B2 closed**: the isolation assertion now FAILS on a real leak |
| `REV-S02-p1-product-truth.refusal-face.test.ts` | `1 passed (1)` · `5 passed (5)` | 5/5 | unchanged |

Every probe printed `git status --porcelain lines: 0` on restore; `dirty=0` after each step
(`probes.out`).

---

## 3. My own probes and mutants

Restoration is `cp` from copies captured before the first mutant; after every restore I printed
`git status --porcelain` **and** compared bytes (`cmp -s`).

### 3.1 Refutation matrix

| # | property under test | mutant / probe | outcome at `88f8a01f` | outcome at `9ef275aa` (pass 1) | porcelain · bytes |
|---|---|---|---|---|---|
| M9b | R2 — a tier branch WRAPPED over lines | the pass-1 three-line ternary on `ask.plan_tier` | **CAUGHT** `1 failed \| 3 passed (4)` | NOT caught → N1 | 0 · equal |
| M15 | R2 — a `switch`/`case` on the tier | multi-line `switch (ask.plan_tier)` with both cases | **CAUGHT** `1 failed \| 3 passed (4)` | NOT caught → N1 | 0 · equal |
| M6 (product) | R2 — an `if` on the tier | `let roster = PLAN_TIER_ROSTERS.premium; if (ask.plan_tier === "free") roster = PLAN_TIER_ROSTERS.free;` | **CAUGHT** `1 failed \| 3 passed (4)` | NOT caught → product N3 | 0 · equal |
| M14 (product) | R1 — the canonical declaration | one comment line prepended to `apps/ui/components/landing/cards.ts` | **ACCEPTED** `4 passed (4)` — the false positive is gone | FALSE POSITIVE → product N4 | 0 · equal |
| **M20** | R2 — a multi-line `if` selecting an ALIASED roster | `const freeAlias = PLAN_TIER_ROSTERS.free; … if (ask.plan_tier === "free") { aliasRoster = freeAlias; }` | **NOT CAUGHT** `4 passed (4)` → **N1** | NOT caught either | 0 · equal |
| **M21** | R2 — a ONE-LINE ternary selecting an ALIASED roster | `const aliasRoster2 = ask.plan_tier === "free" ? freeAlias2 : premiumAlias2;` | **NOT CAUGHT** `4 passed (4)` → **N1** | **CAUGHT** by the pass-1 guard (measured, §3.2) | 0 · equal |
| M10 | one production `startRun` caller | a second `.startRun(` added to `apps/api/src/main.ts` | **CAUGHT** `1 failed \| 1 passed (2)` | NOT caught → N3 | 0 · equal |
| M16 | R6 — the refusal is TYPED | the roster refusal thrown as a bare `Error` | **CAUGHT** `7 failed \| 5 passed (12)` (7 FAIL lines) | case 8 survived → N4 | 0 · equal |
| M17 | R8 — no run on refusal | `throw new TypedDomainError("UNRELATED_EARLY_FAILURE")` as `submit`'s first statement | **CAUGHT** `1 failed \| 11 passed (12)`; the one failure is `refuses before taking an admission lease or issuing any run-provision query` | whole file `9 passed (9)` → N4 | 0 · equal |
| M22 | F1's plaintext guard is load-bearing | `planTierColumnApplied = true` (the unconditional pre-fix write) | **RED** `1 failed \| 5 passed (6)`, failure `starts a legacy-principal run before migration 0061`, 3× `column "plan_tier" of relation "run" does not exist` | — | 0 · equal |
| M23 | F1's encrypted guard is load-bearing | the `CASE WHEN pg_get_functiondef …` stripper reverted to `$1::jsonb` | **RED** `1 failed \| 5 passed (6)`, failure `starts an encrypted server-principal run before migration 0061`, 2× `RUN_OWNER_INVALID` | — | 0 · equal |

### 3.2 The M21 regression, measured both ways

I re-instated the pass-1 guard in my worktree (`git show 9ef275aa:…/tiers-s02-rosters.test.ts`, a
two-file temporary mutant, both restored) and ran the same two mutants against it:

| mutant | pass-1 guard (`9ef275aa`) | pass-2 guard (`88f8a01f`) |
|---|---|---|
| M20 (multi-line `if`, aliased roster) | `4 passed (4)` — missed | `4 passed (4)` — missed |
| M21 (one-line ternary, aliased roster) | **`1 failed \| 3 passed (4)` — CAUGHT** | `4 passed (4)` — **missed** |

Logs `mut-M20-vs-p1guard.log`, `mut-M21-vs-p1guard.log`; porcelain 0 after each restore. The fix is a
large net gain (M9b, M15, M6 caught; M14's false positive gone) with one strength loss, and the loss
is what N1 tickets.

### 3.3 My own fixture A — the invalid-tier boundary (`…-boundary.test.ts`, 7 passed (7), rc=0)

Written from the CLAIM (SPEC-v2 R3/R4/R6/R7/R15 and the F2 claim), never from the author's tests.
What it establishes that no cluster test does:

1. **Fifteen** out-of-vocabulary tiers at the exported boundary — every `Object.prototype` key a
   prototype-chain lookup could have reached (`constructor`, `__proto__`, `toString`, `valueOf`,
   `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`), plus `gold`, `""`,
   `FREE`, `"free "`, `" premium"`, `0`, `length` — each answers
   `{ name: "AskRefusal", code: "ASK_PLAN_TIER_INVALID" }`. The authors' own case exercises two.
2. **The order between the two refusals**: with an EMPTY panel, `gold` → `ASK_PLAN_TIER_INVALID`
   while `free` → `ASK_PLAN_TIER_MODEL_UNAVAILABLE` with the full message. The new check does not
   shadow R6.
3. **The S01 shared surface, mounted**: `gold`, `constructor`, `__proto__` and `""` over the REAL
   route all answer `400 MALFORMED_REQUEST`, so `ASK_PLAN_TIER_INVALID` is unreachable over HTTP.
4. **R6/R7 unchanged at this head**, both bodies asserted whole: Free →
   `{"error":"ASK_PLAN_TIER_MODEL_UNAVAILABLE","message":"The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now"}`;
   Premium → `…"The premium plan needs grok-4.6, and it is not available right now"`.
5. **R4** on a six-member panel containing both rosters and a non-roster model: Free filters to
   exactly its two in roster order, Premium to exactly its three.
6. Two measurements that became findings: `counters` proves `resolveDiscoveredPanel` is called
   **before** the tier is validated (`{ panel: 1, envelope: 0 }` for an invalid tier → N2), and the
   message reflects the caller's raw string verbatim (→ N3 in §4, measured with
   `<script>alert(1)</script>`).

### 3.4 My own fixture B — the two HALF-APPLIED `0061` schema states (`…-half-applied-0061.test.ts`, 6 passed (6), rc=0)

This is the parameter the FIX seat did not exceed. F1 answers *"is 0061 applied?"* with **two
different oracles**: the plaintext INSERT asks `information_schema` for the COLUMN
(`packages/db/src/index.ts:635-646`, `:1138-1139`); the encrypted path asks `pg_get_functiondef`
whether `core.create_encrypted_run`'s TEXT contains `'planTier'` (`:1198-1206`). Migration 0061 moves
both at once, so every state any seat measured has them agreeing. I built the two states where they
disagree, on two fresh embedded-Postgres instances:

| cell | schema state | legacy principal | encrypted server principal |
|---|---|---|---|
| **A** — a deploy caught half-way through 0061 | column PRESENT, function OLD (pre-0061) — asserted in the fixture | run created, `plan_tier` reads back `premium` | run created, `question_line` = `CONTENT_CIPHERTEXT_SENTINEL`, **`plan_tier` NULL** (the key is stripped silently) |
| **B** — a partial rollback (column dropped, 0061 function left) | column ABSENT, function NEW — asserted in the fixture | run created | `TypedDomainError` `RUN_CONTENT_ROLLBACK_INCOMPLETE` |

**Cell A is the state B1's production half warned about, and the fix survives it in both write
paths** — that is the strongest evidence I have that the class is closed and not just the sample.
Cell B is **unreachable**: `migrate()` (`packages/db/src/index.ts:786-800`) only applies forward and
the repo carries no down-migration, so no supported operation produces "column dropped, function
kept". I record it as a fact about the two-oracle design, not as a finding. Cell A's silent drop is
the row for V (§7).

### 3.5 B1's seven-member class, swept member by member against the F1 diff

The class grep is stable: `grep -rn 'name < "' tests` still returns exactly the same truncated-migration
call sites, plus the one F1 added to its own suite. No new member appeared.

| # | member | pass-1 outcome | my measurement at `88f8a01f` | closed? |
|---|---|---|---|---|
| 1 | `packages/db/src/index.ts:1259-1288` plaintext INSERT | `42703`, 35 cases RED | column-conditional column list, bind list and `$n` offsets; pre-0061 legacy case GREEN (C1), Cell A GREEN, and **M22 proves the guard load-bearing** | YES |
| 2 | `packages/db/src/index.ts:1195-1209` encrypted path → `core.create_encrypted_run` | REASONED only, no suite reached it | now EXECUTED by `tiers-s02-run-plan-tier.test.ts:284` and by my Cell A; **M23 proves the stripper load-bearing** | YES — and the pass-1 gap "no suite reaches it" is closed too |
| 3 | `tests/integration/s7-authorization-database.test.ts:1214` (`< "0037…"`) | 1 case RED | fourth pair `2 failed \| 70 passed (72)`; the slice-owned case is gone | YES |
| 4 | `tests/integration/s6-content-encryption-database.test.ts:1383, :1427, :1485` | 31 cases RED | inside the class probe: `3 passed (3)` · `76 passed (76)` · 0 hits | YES |
| 5 | `tests/integration/s9-dev-token-retirement-database.test.ts:26` | 3 cases RED | same probe run | YES |
| 6 | `tests/integration/register-support-publication.test.ts:74` | never a member (no `startRun` on the truncated database) | same probe run, still green | n/a |
| 7 | `tests/integration/s6-content-encryption-database.test.ts:1524` (`>= "0038…"`) | not a member | unchanged | n/a |
| — | production READ paths of `core.run.plan_tier` (a member the pass-1 table did not enumerate) | not checked | `grep -rn 'plan_tier\|planTier' apps packages` → the only declaration outside `apps/ui` and `apps/api` is `packages/db/src/schema.ts:121`, and `schema.ts` is imported by **tests only** (9 hits, all under `tests/`). No production SELECT names the column | YES |

**35 cases green at base, RED at `9ef275aa`, green again at `88f8a01f`.** B1 `t_ca11cffb` is closed as
a CLASS, not as a sample.

### 3.6 Probes promoted (all four verified runnable from THIS worktree, `dirty=0` after each)

- `probes/REV-S02-p2-correctness-tests-boundary.test.ts` + `…-half-applied-0061.test.ts`, driven by
  `probes/REV-S02-p2-correctness-tests-run.sh` (root from `$WORKTREE` or argv, never hard-coded;
  restores FROM the state it captured). Verified: `rcA=0 rcB=0`, `7 passed (7)` and `6 passed (6)`,
  `restored · git status --porcelain lines: 0`.
- `probes/REV-S02-p2-correctness-tests--mutant-r2-alias-evasion.sh` — the M20/M21 cells, header states
  the head it was written against and restores from the captured copy. Verified: both cells
  `4 passed (4)`, `restored from the captured state`, porcelain empty.
- `probes/REV-S02-p2-correctness-tests-pre-0061-schema-strict.sh` — **closes `t_35e0669f`**, the
  defect FIX-S02-p1-F1 raised against my pass-1 detector: that script printed `B1 ABSENT` and exited 0
  on `hits == 0` alone, so a RED suite still read green (observed by that seat at 46/76, 74/76, 75/76).
  The strict version requires `rc=0` **and** `Test Files 3 passed (3)` **and** `Tests 76 passed (76)`
  **and** 0 hits, and exits 2 as INCONCLUSIVE otherwise. Its header also names the fourth pair with
  its measured outcome (N3). Verified at this head: `rc=0 · hits=0 · files_marker=1 · tests_marker=1 ·
  B1 ABSENT`.

---

## 4. Findings

No blocking finding. Three non-blocking; each needs a ticket through the orchestrator.

### N1 — the R2 guard misses a tier branch that selects a roster through a LOCAL ALIAS, and the one-line form is a regression against pass 1

`tests/architecture/tiers-s02-rosters.test.ts:156` (`const selectsRoster = /\bPLAN_TIER_ROSTERS\b/.test(selectedBody);`)
and `:162` (the `tierTernary` regex) both require the literal token `PLAN_TIER_ROSTERS` **inside the
selected branch body**. Bind the roster to a local name one line earlier and the branch is invisible:

```ts
const freeAlias = PLAN_TIER_ROSTERS.free;
const premiumAlias = PLAN_TIER_ROSTERS.premium;
let aliasRoster = premiumAlias;
if (ask.plan_tier === "free") { aliasRoster = freeAlias; }   // M20 — 4 passed (4)
const aliasRoster2 = ask.plan_tier === "free" ? freeAlias2 : premiumAlias2;  // M21 — 4 passed (4)
```

Both are exactly what R2 forbids ("No `if` on a tier name selects models anywhere else"). M20 was
missed at pass 1 too; **M21 is a strength loss introduced by the F3 remedy** — the pass-1 line-local
predicate caught it (§3.2, measured against the reinstated `9ef275aa` guard: `1 failed | 3 passed (4)`).
The F3 handoff's claim that "model selection in any supplied layout violates R2 [and is caught]" is
refuted by these two cells.

Remedy shape, which keeps F3's gain: collect the local identifiers initialised from a
`PLAN_TIER_ROSTERS` member in the same file (one pass over `const <id> = PLAN_TIER_ROSTERS`) and let
`selectsRoster` match that set as well as the literal token. Non-blocking: the built code does not
violate R2 at this head (guard green, and the sole selection is the data lookup at
`apps/api/src/index.ts:1214`); the gap is in the mechanism that would catch a future violation, and
pass 1 tiered the identical property as N1/product-N3. Class: "an architecture guard that binds to a
literal identifier misses every rename of it" — the only other member in this suite is
`sourceFilesContaining` (`:48-57`), which matches model-id STRINGS and is therefore alias-proof by
construction; checked, not a member.

*VERDICT: non-blocking, ticket / CONFIDENCE high (two cells, both directions, both restored byte-equal)
/ STRONGEST COUNTER: "every source-text guard has an evasion; naming one is not a finding." It does not
survive M21: this evasion was condemned by the previous version of the same guard, so the remedy traded
a caught shape away, and that is a fact the fix's handoff does not record.*

### N2 — the invalid-tier refusal is raised AFTER the panel has been resolved

`apps/api/src/index.ts:1206-1213`: `settings.resolveDiscoveredPanel()` runs first, and only then is
`ask.plan_tier` checked against the roster vocabulary. Measured with call counters in my fixture: an
out-of-vocabulary tier produces `{ panel: 1, envelope: 0 }` — one full panel resolution (in production
a `ProviderProbeRepository` read) spent on an ask that cannot be admitted. No product defect today
(the route's `.strict()` schema refuses first, §3.3 case 3), and R6's pinned order is about the
roster check versus `assertMakerAdmission`, not about this. Remedy: hoist the `Object.hasOwn` guard
above `:1206`. One line; it also makes the guard total over the function's inputs rather than over its
mid-state.

*VERDICT: non-blocking, ticket / CONFIDENCE high / STRONGEST COUNTER: "it is unreachable over HTTP, so
the cost is never paid." True today; `evaluateAskAdmission` is an exported member of `@debateai/api`
and the cost is paid by any future caller that does not sit behind the strict route.*

### N3 — `ASK_PLAN_TIER_INVALID` reflects the caller's raw tier string into the refusal message

`apps/api/src/index.ts:1209-1212` builds `` `The ${planTier} plan tier is invalid` `` from the
unvalidated value. Measured: `plan_tier: "<script>alert(1)</script>"` at the exported boundary yields
`{ name: "AskRefusal", code: "ASK_PLAN_TIER_INVALID", message: "The <script>alert(1)</script> plan tier
is invalid" }`, and an `AskRefusal` is rendered on the 422 face verbatim. Unreachable over HTTP today
(measured, §3.3 case 3), which is why this is not blocking. It is the only refusal message in this
slice whose text is not drawn from the roster declaration: R7's message interpolates `ask.plan_tier`
too (`:1224`) but only on a path where the tier has already been proved to be in the vocabulary.
Remedy: a fixed message naming the vocabulary (`The plan tier must be free or premium`), which also
removes the reflection question from the security lens's plate at pass 3.

*VERDICT: non-blocking, ticket / CONFIDENCE high / STRONGEST COUNTER: "the contract gate makes this
dead code." The gate is one `.strict()` schema away from the reflection, and the same argument was
made for the unguarded lookup this code replaced (pass-1 N5), which was fixed anyway.*

### N4 — (against my own pass-1 artifact, inherited by this packet) "the fourth pair" is named nowhere the packet points

`REV-S02-p2-correctness-tests.md:25` charge 2(1) says to run "the fourth pair **the probe's header
names**". The header of `probes/REV-S02-p1-correctness-tests-pre-0061-schema.sh:20-21` says only
*"The fourth suite is reported separately because it carries two failures…"* — singular, and it names
neither file. I recovered the pair (`tests/integration/database.test.ts` +
`tests/integration/s7-authorization-database.test.ts`) from my own pass-1 artifact §3 B1 and from the
F1 handoff. The defect is in the pass-1 probe I wrote; the packet inherited it. **Already repaired:**
my promoted strict detector names both files, the exact command and the measured outcome in its header.
Not a finding against the orchestrator's prose, and no rework follows. Ticket: yes, to record the
class — *"a packet may only point at a name a named artifact actually contains"*.

---

## 5. The pass-1 findings, each answered

| pass-1 finding | ticket | my measurement at `88f8a01f` | closed? |
|---|---|---|---|
| correctness **B1** — unconditional `plan_tier` INSERT | `t_ca11cffb` | class probe 76/76 · 0× 42703 · fourth pair 70/72 with only the two pre-existing names · seven-member sweep §3.5 · both guards load-bearing (M22, M23) · Cell A proves the half-deploy state works | **YES, as a class** |
| correctness **B2** = security N2 — vacuous FR-0.6 AC5 differential | `t_ca46998d` | the promoted two-cell mutant: Cell A rc=**1**, `1 failed | 20 skipped (21)` where pass 1 measured rc=0 and a pass. The assertion at `tests/integration/evaluator-database.test.ts:1460` now reads the RAW resolved panel captured at `:1364` | **YES** |
| correctness N1 / product N3 — line-local R2 guard | `t_bd8e3b18` | M9b, M15 and product M6 all CAUGHT (§3.1) | **YES** (residual alias gap → N1 above, a different mechanism) |
| correctness N2 / product N4 — line-pinned canonical-declaration guard | `t_f2da2b9a` | M14 ACCEPTED, `4 passed (4)`; the assertion is now a file set (`:184-202`), which is R1's own wording | **YES** |
| correctness N3 — single-caller guard scanned a subset of production | `t_51aa7ae5` | M10 CAUGHT, `1 failed | 1 passed (2)`; `productionSourceFiles` (`tests/unit/tiers-s02-wire.test.ts:89-111`) now walks all of `apps/` and `packages/` | **YES** |
| correctness N4 — R8's case accepted any early failure | `t_c38a3fdd` | M16 CAUGHT (7 failures), M17 CAUGHT (`refuses before taking an admission lease…`); the case now asserts `rejects.toMatchObject({ name: "AskRefusal", code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE" })` at `:317-324` | **YES** |
| correctness N5 = security N1 — untyped `TypeError` on an out-of-vocabulary tier | `t_d86b98ce` | 15/15 out-of-vocabulary tiers, prototype keys included, answer `AskRefusal` / `ASK_PLAN_TIER_INVALID` (§3.3 case 1) | **YES** |
| correctness N6 — the R12 relay in `PROGRESS.md` was elided | `t_42d46edd` | `slices/S02/PROGRESS.md:79` and `:86` now carry the command whole and copy-pasteable | **YES** |
| correctness N7 — the packet's unparameterisable diff command | `t_512afe29` | §1: a concrete pair, the trap named, ran first time | **YES** |
| `t_35e0669f` — my pass-1 probe's hit-only green marker (raised by FIX-S02-p1-F1, and correct) | `t_35e0669f` | closed by the promoted strict detector (§3.6) | **YES** |

**The new refusal code `ASK_PLAN_TIER_INVALID`, judged against SPEC-v2 R6/R15** (the orchestrator's
in-scope question). It is **neither a defect nor a requirement violation**: R6 governs only the
*roster-member-absent* case and is untouched — measured, an empty panel with `plan_tier: "free"` still
raises `ASK_PLAN_TIER_MODEL_UNAVAILABLE` with both members named and never `MAKER_INVENTORY_UNSATISFIED`
(§3.3 case 2). R15's seven RED frames are all still present and the invalid-tier case is an **eighth**,
not a substitution: the admission file went **9 → 12** `it(` blocks and **no block was deleted**
(`git diff 9ef275aa..88f8a01f -- …/tiers-s02-admission.test.ts | grep -E '^-.*\bit\('` → empty;
`grep -c '  it('` → 9 at `9ef275aa`, 12 here). It joins no vocabulary it must join:
`docs/missions/debate-tiers/reviews/ARCH-REV-S02-p1.md:334-343` already measured that
`packages/obs-capture/src/registry/index.ts` is a sha-pinned payload, not a codebase scan, and that
four sibling ask-path codes are already absent from it. Its only user-visible consequence would be a
422 body V's acceptance script does not mention — and I measured that body to be **unreachable over
HTTP** (400 `MALFORMED_REQUEST` for `gold`, `constructor`, `__proto__` and `""`). So it needs no V row
on behaviour; what it does need is N2 and N3 above.

---

## 6. UNVERIFIED

- **Acceptance steps 1–4 and 8–9** — row V-7: no `gpt-5.6-luna`, `claude-sonnet-5` or healthy
  `grok-4.6` discovery target exists, so they are untestable by any seat.
- **Steps 5–7** I proved in-process (`buildApi().inject()`), never in a browser. That is V's.
- **R12 against the dev database** was never run: `.local/**` and `127.0.0.1:55432` are no-touch. I
  verified R12's *read-back mechanism* on embedded Postgres only (C1's three cases, three runs, plus
  my Cell A reading `premium` back on a half-applied schema).
- **Cell B of §3.4** (column dropped, 0061 function kept) is a schema state I constructed by hand; I
  did not find any supported operation that produces it, so I did not price it.
- **The UI** — whether `/new` renders either refusal message correctly is the product-truth lens's.
- **Whether a `PROVIDER_DISCOVERY_TARGETS_JSON` entry must spell a model id exactly as the roster does**
  (my pass-1 prediction for the product lens) is still unasserted anywhere in the repo; I did not
  re-raise it because it is not this lens's and V-7 gates it.

---

## 7. Rows for V

**V-ROW: NEW · S02 · the tier a run records while migration 0061 is half-deployed**
On a stack where the API is running but `core.create_encrypted_run` has not yet been replaced by
0061, a signed-in (server-principal) run is **created successfully with `plan_tier` NULL** — the key
is dropped from the encrypted payload silently, with no error, no log line and no difference the
asker can see (measured: §3.4 Cell A, `plan_tier: null`, `question_line` = ciphertext sentinel). The
stated reason for recording the tier at all is billing (row V-6), so those runs are unbillable and
nothing says so. Refusing the run instead would be worse (that is finding B1, which this fix exists to
close); the third option is to keep creating the run and record the drop.
**Recommended default:** keep the silent drop — S02 ships as built, and a follow-up slice adds one
warning-level log line at `packages/db/src/index.ts:1195-1209` when the stripper fires.
**Smallest yes/no for V:** *"Is it acceptable that a run started while migration 0061 is only
half-deployed records no plan tier, silently?"*
VERDICT: accept as built, ticket the log line / CONFIDENCE medium (the behaviour is measured; how much
billing cares is V's) / STRONGEST COUNTER: "a half-deployed migration is an operator error that lasts
minutes, and a log line nobody reads does not fix it" — which argues the row should be answered
"yes, silent is fine" and closed, not that the row should not exist.

No other row from this lens. N1, N2 and N3 are engineering remedies against requirements SPEC-v2
already carries, not questions for V.

---

## 8. Predictions about the other lens (written before any contact; blind held)

The other lens on this pass is **product-truth**. I predict it confirms the two 422 bodies verbatim as
I measured them in §3.3 case 4, and that its sharpest independent finding is **not** in the diff at
all but in `apps/ui/components/landing/cards.ts` — it will re-raise `gemini-3-ultra` (its own pass-1
N7, `t_0e696ff8`) now that the canonical-declaration guard has been loosened from lines to file sets,
and it will notice that the loosening means a SECOND roster declared inside `cards.ts` using only
`gpt-5.6-sol` and `claude-opus-5` would no longer turn the guard red, where the pass-1 line pins would
have. I measured that the loosening matches R1's own wording ("in exactly one file"), so I expect it
to tier that non-blocking, and I expect it to be right. I predict it does **not** find N1: reaching M20
and M21 needs a mutant against the architecture guard, and a product lens has no reason to write one.
I predict it raises the new `ASK_PLAN_TIER_INVALID` code as a **product** question — "a second refusal
code now shares the 422 face acceptance step 7 pins to one code" — and opens a V row for it; I would
not, because I measured the code unreachable over the real route in four spellings, and the acceptance
step therefore still describes everything V can see. If it reports acceptance steps 1–4 and 8–9 as
UNVERIFIED and stops, that matches pass 1 and is correct. Finally, I predict neither of us finds a
behavioural defect in the range: the 664-line diff is four guards and two schema-version checks, and
after nineteen mutant cells across both passes the only things I could make survive are two shapes of
a source-text heuristic.
