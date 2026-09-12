# REV(S02) pass 1 — lens `correctness/tests` · seat REV-S02-p1-correctness-tests · ticket `t_edf20575`

**SKILLS LOADED:** `superpowers:using-superpowers` · `heartbeat-protocol`
(`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`) ·
`heartbeat-reviewer` (`.claude/skills/heartbeat-reviewer/SKILL.md`) ·
`superpowers:verification-before-completion`. Nothing else was loaded.

- worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-p1-correctness/dialectical-engine`, detached HEAD `9ef275aa` (= `slice/tiers-s02` head, verified with `git rev-parse --short slice/tiers-s02`), READ-ONLY; **no git write of any kind** this session.
- `pnpm run generate:contract` rc=0; `git status --porcelain` = 0 lines before every measurement and after every mutant restore.
- probe root `/private/tmp/debate-tiers-REV-S02-p1-correctness-tests` (all logs named below live there).
- blind: no other lens's worktree, output or the `slice/tiers-s02` lane was opened. One
  disclosure: `ls` of the SHARED `.hermes/reports/debate-tiers/probes/` directory, while
  promoting my own probes, printed the security lens's promoted filenames. I opened none of
  them, and my findings and predictions were written before and independently of that listing.
- probes promoted: `probes/REV-S02-p1-correctness-tests-pre-0061-schema.sh` (the B1 detector —
  root from argv or `$WORKTREE`, mutates nothing; verified from this worktree: `rc=1 · 42703
  hits=14`) and `probes/REV-S02-p1-correctness-tests-slice-probe.{sh,test.ts}` (my whole-slice
  fixture and a runner that copies it in, runs it, and restores FROM the state it captured;
  verified: `Test Files 1 passed (1)` · `Tests 7 passed (7)` · `git status --porcelain lines: 0`).
- process hygiene: every run was foreground or a `nohup`'d script whose PID is recorded in
  `/private/tmp/debate-tiers-REV-S02-p1-correctness-tests/*.pid`; all eight are `gone` at
  handoff; no `pkill`; no port taken; `lsof` on :3000/:3001/:8790-:8793/:55432 is empty, the
  same as `listener-baseline.txt`. The temporary fixture under `tests/unit/` is deleted and
  the worktree is byte-clean at `9ef275aa`.

**VERDICT: REWORK (pass 1 of 3).** Two blocking findings, seven non-blocking.

---

## 1. Packet review (the packet is in my scope; its author cannot review it)

Checked `/.hermes/planning/debate-tiers/packets/REV-S02-p1-correctness-tests.md` constant by constant.

| packet claim | re-measured | verdict |
|---|---|---|
| detached HEAD `9ef275aa` = `slice/tiers-s02` head | `git rev-parse --short slice/tiers-s02` → `9ef275aa` | HOLDS |
| base `3bf54957` for C2/C3/C4, `7f89f7b7` for C1 | matches README § The slice; both ranges reproduce the two patch files | HOLDS |
| comment cursor at dispatch = 1 | ticket had exactly 1 comment (the DISPATCHED) | HOLDS |
| `ui: no` slice, "no DONE.md exists" | `ls docs/missions/debate-tiers/slices/S02/` → no `DONE.md` | HOLDS |
| package `probes.md` "nine facts" | nine numbered probes | HOLDS |
| charge 2: "the C2 seat's R9 sweep (comment 8 on `t_1675b61f`)" | comment 8 is the seven-place sweep | HOLDS |
| `allowed` list vs the deliverables demanded | output + self-report + probes + a temporary fixture under `tests/` — all four present | HOLDS |

**N7 (packet defect, orchestrator)** — `packets/REV-S02-p1-correctness-tests.md:10` hands me
`git diff --stat <previous>..<latest> -- docs/missions/debate-tiers` and points at `COMMON.md` §6
row `freeze commits` for the pair. That row gives **no commit pair for S02** — only "the HEAD each
DISPATCHED comment stamps (2026-09-12)". The command is therefore unparameterisable as written.
Second half of the same defect: run from the packet's own cwd the pathspec must be **cwd-relative**
(`docs/missions/debate-tiers`); the git-root-relative spelling returns an EMPTY diff that reads as
"unchanged" — the TOOLING-TRAPS entry `git diff/log/ls-tree -- <pathspec>` from inside
`dialectical-engine/` (2026-09-01), which this packet's charge 3 does not name among the traps it
lists. I hit it and lost a round trip on `git ls-tree HEAD dialectical-engine/web/`, which answered
empty and nearly made me date a pre-existing failure wrongly (see §4, "what I nearly got wrong").

Author `SKILLS LOADED` lines checked against the worker floor (`heartbeat-protocol` §1:
`test-driven-development` · `verification-before-completion` · `systematic-debugging`): BUILD-S02-C1,
C2, C3 and C4 each name all three plus `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`.
No shortfall, no skill named that the floor does not contain. No finding.

---

## 2. What I re-ran (verbatim)

### 2.1 The four cluster commands, three runs each, in MY worktree

Runner `/private/tmp/debate-tiers-REV-S02-p1-correctness-tests/clusters.sh` and `clusters23.sh`;
full vitest output in `C{1,2,3,4}.log` and `C{1,2,3,4}.r{2,3}.log`.

| cluster | run 1 | run 2 | run 3 | worst |
|---|---|---|---|---|
| C1 `vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | `Test Files 2 passed (2)` · `Tests 25 passed (25)` rc=0 | identical | identical | GREEN |
| C2 `vitest run tests/unit/tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | `Test Files 3 passed (3)` · `Tests 55 passed (55)` rc=0 | identical | identical | GREEN |
| C3 `vitest run tests/architecture/tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | `Test Files 1 failed \| 1 passed (2)` · `Tests 3 failed \| 6 passed (9)` rc=1 | identical | identical | RED, inherited |
| C4 `vitest run tests/unit/tiers-s02-wire.test.ts tests/unit/load01-live-proof.test.ts tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts` | `Test Files 4 passed (4)` · `Tests 42 passed (42)` rc=0 | identical | identical | GREEN |

C3's three failures, named and dated **pre-existing** (`BASELINE.md`, `s14-contract` 3 failed / 2
passed at base on both lanes): `uses the generated contract client for both browser and SSR with no
V2 wire mirror` · `FX-ORPH-04 walks web consumers in both directions and rejects the death-list
inventory` · `carries the S04 orphan-audit wording fix and deterministic locale tiebreak`.
Every number agrees with the orchestrator's `reverify-9ef275aa.txt`. File counts pinned in every
row (the multi-path silent-drop trap).

### 2.2 R14 — the typecheck delta

`pnpm typecheck` at `9ef275aa` → rc=1 (inherited), **70 `error TS` lines across 22 files**
(`typecheck-head.log`). File-for-file and count-for-count identical to the `tiers-s02` block of
`BASELINE.md` (which also sums to 70). **Zero diagnostics name any path this slice touched**
(`grep -nE 'apps/api/src/index\.ts|packages/db/src|packages/contract/src|tiers-s02'` → empty).
R14 holds; the claim "no diagnostic in the allowed paths" is verified, not accepted.

### 2.3 Suites the cluster commands do NOT cover

R13's own grep set, re-run by me (`UNCOV-*.log`):
`dr181-ceiling` · `dr184-review-resilience` · `register-s09` · `tier01-ask-wire` · `v2ui-data-layer` ·
`pol01-policy` · `s5-session-http` · `v2ui-proxy` → `Test Files 8 passed (8)` · `Tests 112 passed (112)`;
`render/tier01-new-plan-tier` → `22 passed (22)`; `integration/register-version-boundaries` →
`6 passed (6)`. `architecture/scaffold.test.ts` → `2 failed | 7 passed (9)`, **pre-existing**: proved
twice — `web/package.json` is absent at base and head (`git ls-tree 3bf54957 web/` and
`git ls-tree HEAD web/` both show only `web/next.config.mjs`), and mutant **M13** (this slice's
`apps/api/src/index.ts` reverted to `3bf54957`) reproduces the same two failures.

Then I widened past R13's grep, because R13 can only find suites that go through an **ask**, and C1
changed `RunRepository.startRun`, which many suites call directly. That is where B1 lives (§3).

### 2.4 My own fixture for the whole slice

`tests/unit/rev-s02-p1-correctness-probe.test.ts` (written from the CLAIM — SPEC-v2 R3/R4/R6/R7/R9
and acceptance steps 6–7 — never from the authors' tests; deleted before this handoff; source
promoted to `.hermes/reports/debate-tiers/probes/`). `Test Files 1 passed (1)` · `Tests 7 passed (7)`,
rc=0, first attempt (`own-fixture-1.log`). What it establishes that no cluster test does:

1. **The exact 422 body V reads on today's real panel**, both tiers, asserted whole (the authors
   assert only `.error`): Free → `{"error":"ASK_PLAN_TIER_MODEL_UNAVAILABLE","message":"The free plan
   needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now"}`; Premium →
   `{"error":"ASK_PLAN_TIER_MODEL_UNAVAILABLE","message":"The premium plan needs grok-4.6, and it is
   not available right now"}`. Acceptance steps 6–7 pass as written on the panel `00-intake.md:52`
   describes, with no preparation.
2. **R3/R4/R9 beyond the authors' parameters**: panel delivered REVERSED, carrying a non-roster
   member (`model:evaluator-local`) and TWO providers for `grok-4.6`. Result keeps roster order,
   takes the FIRST provider in probe order (`provider:grok-b`), drops the non-roster member,
   `panelSize` = 3.
3. **The cross-cluster property no single cluster owns**: one `PostgresAskApplication.submit`
   carries BOTH the filtered panel AND the plan tier into the SAME `StartRunInput`
   (`captured[0].planTier === "premium"` and `captured[0].discoveredPanel` = the premium roster,
   evaluator excluded). C4's wire test asserts `planTier` only; C2's asserts the panel only.
4. **The shared surface with S01**: `plan_tier: "gold"` over HTTP → `400 MALFORMED_REQUEST`, so the
   roster lookup is unreachable with an out-of-vocabulary tier. (N5 records what happens if the
   exported function is called past that gate.)

### 2.5 Determinism of the probe order (package probe 2)

`apps/api/src/provider-discovery.ts:131` builds `observations` with
`Promise.all(input.targets.map(...))` — `Promise.all` preserves **input order**, and `:119-124`
refuses any target set that is not element-for-element the configured provider list. So the panel's
order is the order of `PROVIDER_DISCOVERY_TARGETS_JSON`, deterministic across runs; `find`
(`apps/api/src/index.ts:1209`) therefore takes the first configured provider per model id — row
V-19's binding default, and my fixture's case 2 pins it with the panel reversed. Downstream sees the
filtered list only: `apps/api/src/index.ts:1305` destructures it, `:1327` passes it to `startRun`,
`packages/db/src/index.ts:1253` derives `agent_count` as `jsonb_array_length($14::jsonb)` from that
same value, and `migrations/0061_plan_tier_on_run.sql:68` does the same for the encrypted path.

---

## 3. Findings

### B1 (blocking) — `RunRepository.startRun` now requires migration 0061 unconditionally; 35 pre-existing green cases are RED at the slice head

`packages/db/src/index.ts:1248` puts `plan_tier` in the INSERT column list and `:1239`/`:1253` bind
it, with no guard on whether the target schema has the column. `core.run.plan_tier` is created by
`migrations/0061_plan_tier_on_run.sql:1`. Every write against a schema older than 0061 therefore
fails with PostgreSQL `42703`:

```
error: column "plan_tier" of relation "run" does not exist
 ❯ RunRepository.startRun packages/db/src/index.ts:1244:7
Serialized Error: { code: '42703', position: '207', file: 'parse_target.c', routine: 'checkInsertTargets' }
```

**Measured, at `9ef275aa`, in my worktree:**

| suite | at head `9ef275aa` | with ONLY `packages/db/src/index.ts` reverted to `7f89f7b7` |
|---|---|---|
| `tests/integration/s6-content-encryption-database.test.ts` | 31 failed | — |
| `tests/integration/s9-dev-token-retirement-database.test.ts` | 3 failed | — |
| the two above + `tests/integration/register-support-publication.test.ts` | `Test Files 2 failed \| 1 passed (3)` · `Tests 34 failed \| 42 passed (76)` rc=1 · 14 lines reading `column "plan_tier" of relation "run" does not exist` (20 lines mention `plan_tier` at all) | `Test Files 3 passed (3)` · `Tests 76 passed (76)` rc=0 · **0** lines mentioning `plan_tier` |
| `tests/integration/database.test.ts` + `tests/integration/s7-authorization-database.test.ts` | `Tests 3 failed \| 69 passed (72)` | `Tests 2 failed \| 70 passed (72)` — the case that DISAPPEARS is `fails closed and rolls migration 0037 back when any pre-S7 immutable run contains a raw user id` |

Logs: `CLASS-sweep.log`, `CLASS-sweep-reverted.log`, `UNCOV-admission.log`,
`UNCOV-admission-runA.log`, `UNCOV-admission-runB.log`. The two failures that SURVIVE the revert
(`database.test.ts > apps/runner — legal command lifecycle > claims, judges through the HTTP gateway,
propagates, serves, and settles` and `s7-authorization-database.test.ts > locks every matching run
before allocation while a rejected transfer is queued`) are **pre-existing, not this slice's** —
they reproduce identically with S02's production reverted, and the second is a lock-waiter race
(`expected 1 to be greater than or equal to 2`).

**Total: 35 cases, green at base, RED at the slice head, caused by S02-C1.** None of the three
suites is in any of the four cluster commands and none has a row in `BASELINE.md`, which is why four
green clusters and the orchestrator's re-verification all missed it.

**The class, swept member by member** — every place that writes `core.run` against a schema that may
predate 0061, found by `grep -rn 'name < "' tests` (suites that apply a TRUNCATED migration set) plus
the two production write paths:

| # | member | pre-0061 outcome | measured |
|---|---|---|---|
| 1 | `packages/db/src/index.ts:1244-1256` plaintext INSERT | `42703` | YES — the 35 failures above |
| 2 | `packages/db/src/index.ts:1182-1201` encrypted path → `core.create_encrypted_run` | on a pre-0061 database the live function is `migrations/0040_account_erasure.sql:4270-4276`, whose key allow-list has no `'planTier'`, so `p_run - ARRAY[…] <> '{}'` is true and it `RETURN false` — a silent refusal surfacing as `RUN_OWNER_INVALID` (the shape BUILD-S02-C1 itself measured as its sixth mutant) | REASONED, not reached by any current suite |
| 3 | `tests/integration/s7-authorization-database.test.ts:1214` (`name < "0037_run_ownership.sql"`) | `42703` | YES, 1 case |
| 4 | `tests/integration/s6-content-encryption-database.test.ts:1383, :1427` (`< "0040…"`), `:1485` (`< "0038…"`) | `42703` | YES, 31 cases |
| 5 | `tests/integration/s9-dev-token-retirement-database.test.ts:26` (`< "0041…"`) | `42703` | YES, 3 cases |
| 6 | `tests/integration/register-support-publication.test.ts:74` (`< "0055…"`) | no `startRun` on the truncated database | NO — green, 1 file passed |
| 7 | `tests/integration/s6-content-encryption-database.test.ts:1524` (`>= "0038…"`, i.e. through 0061) | column present | NO — not a member |

Beyond the suites this is also a **deploy-ordering hazard in production**: the code writes a column
0061 creates, so any rollout that ships the API before the migration breaks every run creation, and
any rollback past 0061 breaks it again. The SPEC does not require the write to be unconditional —
R11 asks only that the tier be readable back — so this is a REWORK item under SPEC-v2, not a V row.

*VERDICT: REWORK / CONFIDENCE high (the revert is a clean two-sided measurement: 34 fail → 0 fail with
one file reverted, nothing else changed) / STRONGEST COUNTER: "those three suites exercise historical
schemas on purpose, so a code change that assumes the current schema is legitimate and the tests
should be updated instead." It does not survive the production half: the same unconditional write is
what makes a code-before-migration deploy fail, and `packages/db/src/schema.ts:121` already declares
the column nullable, which is a promise that the row can exist without it.*

### B2 (blocking) — the C2 re-fixture left the FR-0.6 AC5 panel-isolation differential unable to fail

`tests/integration/evaluator-database.test.ts:1446-1447` re-seeds the two product probes from
`model:product-a` / `model:product-b` to `gpt-5.6-luna` / `claude-sonnet-5`. The case's own claim is
the assertion at `:1458-1460`: no member of the persisted panel carries `EVALUATOR_PROVIDER_REF` or
`EVALUATOR_MAKER`. After S02 the persisted panel is `filteredPanel`, every member of which has a
`model_id` drawn from the free roster — and the evaluator's `model:evaluator-local` cannot be in it
by construction. **The assertion is now unfalsifiable.**

Measured, not argued — mutant **M12**: make the leak the case was written to catch real, by adding
`EVALUATOR_PROVIDER_REF` to the provider refs `resolveDiscoveredPanel` reads
(`tests/integration/evaluator-database.test.ts:1357-1360`), so the evaluator reaches the RAW panel.

```
rc=0
 Test Files  1 passed (1)
      Tests  21 passed (21)
```
`mut-M12-evaluator-leak.log`; restore printed `git status --porcelain lines: 0`.

The PROPERTY still holds — nothing leaks. What is gone is the test's ability to notice if it stops
holding, and the C2 handoff reports the re-seed as a green repair with no note that its discriminator
died. The remedy is one assertion (assert the RAW resolved panel excludes the evaluator, or assert
the filtered panel is exactly the roster AND the raw one is not), in a file already in C2's `allowed`
list.

**The class** — "an S02 edit that repairs a pre-existing suite by moving its fixture into the roster
vocabulary may neutralise that suite's own discriminator", swept over both re-fixtured files:

| member | discriminator after the edit | verdict |
|---|---|---|
| `tests/integration/evaluator-database.test.ts:1446-1460` | dead (M12) | **the finding** |
| `tests/unit/api.test.ts:179` `rosterPanel("free", ["maker:1","maker:1"])` (was `fixtureDiscoveredPanel(1)`) | alive — two members, ONE distinct maker, so `makers.length === 1` still drives `SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE`; the roster is complete so no refusal intervenes | SURVIVES |
| `tests/unit/api.test.ts:189` `rosterPanel("free")` added under the envelope-throw block | alive — complete roster, two makers, so the `STRUCTURAL_CEILING_INPUTS_UNRESOLVED` refusal is still the thing asserted (M11-style edits to that path go RED) | SURVIVES |
| `tests/unit/api.test.ts:101` default `admissionSettings()` (was `fixtureDiscoveredPanel(2)`) | alive — every ask in the file is `plan_tier: "free"` (`:152, :175, :259, :331, :398, :491, :564`), so the default panel is complete and no case is silently short-circuited by a refusal | SURVIVES |

*VERDICT: REWORK / CONFIDENCE high / STRONGEST COUNTER: "FR-0.6 AC5 belongs to another mission, so
restoring its bite is out of S02's scope." It does not survive: S02 edited that exact file and that
exact fixture, and the packet put it in C2's `allowed` list; the loss is this slice's to price.*

### N1 — the R2 guard is blind to any tier branch that is not on ONE line, and false-positive on lines that are not selections

`tests/architecture/tiers-s02-rosters.test.ts:68-70`: `namesBothTiers = line.includes("free") &&
line.includes("premium")` and `branches = line.includes("===") || /\bcase\s+/.test(line)` — a
LINE-local substring predicate.

| mutant | shape inserted into `apps/api/src/index.ts` | result |
|---|---|---|
| M9a | `const shadowRoster = ask.plan_tier === "free" ? PLAN_TIER_ROSTERS.free : PLAN_TIER_ROSTERS.premium;` (one line) | **caught** — `1 failed \| 3 passed (4)` |
| M9b | the SAME expression, wrapped over three lines the way a formatter wraps it | **NOT caught** — `Test Files 1 passed (1)` · `Tests 4 passed (4)` |
| M15 | `switch (ask.plan_tier) { case "free": … case "premium": … }`, each `case` on its own line | **NOT caught** — `4 passed (4)` |

M15 is the sharp one: the case is named *"keeps plan-tier model selection out of if and **case**
branches"* and a real `case` branch on the tier name selecting a roster passes it. Logs
`mut-M9a-branch-one-line.log`, `mut-M9b-branch-multi-line.log`, `mut-M15-switch-case-branch.log`;
`git status --porcelain lines: 0` after each restore. The converse is live too: any single line
naming both tier words beside `===` is condemned even when it selects copy rather than models — the
shape S03's UI will plausibly write. `t_2e74f402` records the *wording* conflict behind the
line-local reading; this finding is the *consequence* of that reading, and is not on that ticket.

### N2 — the canonical-declaration guard is pinned to absolute line numbers

`tests/architecture/tiers-s02-rosters.test.ts:90-103` asserts each model id appears at exactly
`apps/ui/components/landing/cards.ts:27` / `:28` and `packages/contract/src/plan-tiers.ts:9` / `:10`.
Mutant **M14** — prepend ONE comment line to `apps/ui/components/landing/cards.ts`, moving no roster
and changing no behaviour: `Test Files 1 failed (1)` · `Tests 1 failed | 3 passed (4)`
(`mut-M14-cards-line-shift.log`). This is TOOLING-TRAPS variant 6 ("an acceptance pinned to ABSOLUTE
LINE NUMBERS", 2026-08-29) reappearing inside a guard — the gate condemns correct input. R1 asks for
"exactly one file", not an exact line; asserting the set of FILES (or `path` plus the matched text)
keeps the requirement and drops the brittleness.

### N3 — the single-production-`startRun`-caller guard scans a subset of production

`tests/unit/tiers-s02-wire.test.ts:89-108`: `productionSourceFiles` seeds `apps/api/src/index.ts`
and then walks **only** `packages/*/src`. Mutant **M10** — a second production `.startRun(` call
added to `apps/api/src/main.ts`: `Test Files 2 passed (2)` · `Tests 6 passed (6)`, **not caught**
(`mut-M10-second-startrun-caller.log`). Invisible to the guard today: the other 14 files of
`apps/api/src`, and all of `apps/runner/src` (39 entries), `apps/scheduler/src`,
`apps/evaluator-worker/src`, `apps/replay/src`, `apps/observation-agent/src`. This is the *other
direction* of `t_dbbb615b` (which tickets the packet for permitting a mutant outside the scan roots);
that ticket does not say the roots are narrower than production, and the C4 seat's own mutant (b)
sat inside them, so the gap was never exercised until now.

### N4 — R8's test cannot tell a refusal from any other early failure

`tests/unit/tiers-s02-admission.test.ts:213-267`, in particular `:262` `.catch(() => undefined)` and
`:264-266`. The case asserts only that nothing connected and no run-provision SQL was issued; it
never asserts WHICH error was thrown.

| mutant | result on the file |
|---|---|
| M16 — the roster refusal thrown as a bare `Error` instead of through `markAskRefusal` | cases 3,4,5,6,7 fail; **case 8 passes** |
| M17 — `throw new TypedDomainError("UNRELATED_EARLY_FAILURE", …)` as the FIRST statement of `PostgresAskApplication.submit` | **`Test Files 1 passed (1)` · `Tests 9 passed (9)`, rc=0** — the whole file is green with the production method doing nothing at all |

Logs `mut-M16-untyped-refusal.log`, `mut-M17-unrelated-early-throw.log`. R15 requires a RED test for
"no-run-on-refusal (R8)"; the test present is satisfied by any early throw, so R8's mechanism is only
incidentally exercised. Remedy: replace `.catch(() => undefined)` with
`await expect(application.submit(…)).rejects.toMatchObject({ name: "AskRefusal", code:
"ASK_PLAN_TIER_MODEL_UNAVAILABLE" })` and keep both existing assertions.

### N5 — `evaluateAskAdmission` answers an out-of-vocabulary tier with an untyped `TypeError`

`apps/api/src/index.ts:1207-1210`: `PLAN_TIER_ROSTERS[ask.plan_tier]` is `undefined` for a tier
outside the enum, and `.map` on it throws. Measured in my fixture (case 7):
`{ name: "TypeError", code: null, message: "Cannot read properties of undefined (reading 'map')" }`
— not a `TypedDomainError`, so `markAskRefusal` (`:300-303`) rethrows it raw and the boundary maps it
to `500 INTERNAL_ERROR` (`:514-521`). **No product defect today**: the route validates against the
`.strict()` `AskRequestSchema` (`packages/contract/src/index.ts:107-119`, `plan_tier:
PlanTierSchema`), and my fixture measures `400 MALFORMED_REQUEST` for `plan_tier: "gold"` over HTTP.
It is a hardening item because `evaluateAskAdmission` is an exported member of `@debateai/api` and
this is the only unguarded lookup in it. This is package probe 4's question answered from the
correctness side; the security lens owns the rest of that probe.

### N6 — the R12 read-back relay into `PROGRESS.md` is elided and not runnable

Acceptance step 9 says V may run R12's command from any of three places. Two carry it verbatim (the
BUILD-S02-C1 READY handoff, and the board export inside the review package at
`review-packages/S02-p1/board/BUILD-S02-C1.t_422678f3.txt:279`). The third —
`docs/missions/debate-tiers/slices/S02/PROGRESS.md:48` — carries
``docker exec debateai-v3-postgres-1 psql … SELECT plan_tier FROM core.run WHERE run_id=…``, with the
ellipsis swallowing the flags. R12 is met; the relay V is most likely to read is not copy-pasteable.
Finding against the orchestrator's relay, not against the C1 seat.

### N7 — packet defect (orchestrator): §1 `inputs` hands me an unparameterisable command

Stated in full in §1 above.

---

## 4. The R9 sweep, re-measured place by place at `9ef275aa`

The C2 seat's seven places (ticket comment 8 on `t_1675b61f`) re-measured against my own greps.
The seat measured at `86bfa432`; C4 added one line to `apps/api/src/index.ts` afterwards, so its
numbers below `:1325` drift by one — expected, not a finding.

| # | the seat's place | re-measured at the slice head | verdict |
|---|---|---|---|
| 1 | `index.ts:1206` sole admission-path `resolveDiscoveredPanel()` | `:1206`; repo-wide `grep -rn resolveDiscoveredPanel apps packages tests` → production only at `apps/api/src/main.ts:252` (wiring), `index.ts:1171` (the interface) and `:1206` | HOLDS |
| 2 | makers / registerRef / panelSize / return all consume `filteredPanel` | `:1222`, `:1229`, `:1241`, `:1249` — all four | HOLDS |
| 3 | `assertMakerAdmission` follows the completeness refusal | refusal `:1214-1221`, `assertMakerAdmission` `:1232`; mutant **M3** (refusal moved after it) fails cases 3, 6 and 7 | HOLDS, and it is pinned |
| 4 | `startRun` receives the filtered panel | destructured `:1305`, passed `:1327`; my fixture case 5 asserts the value at the boundary, which no cluster test did | HOLDS |
| 5 | `agent_count` derived by `jsonb_array_length` on the same JSON | `packages/db/src/index.ts:1253` (plaintext). **Correction:** the seat cited `migrations/0040_account_erasure.sql:4317` for the encrypted path; after 0061 the live definition is `migrations/0061_plan_tier_on_run.sql:68`. Identical derivation, so the conclusion stands, but the sweep checked a superseded body | HOLDS (citation corrected) |
| 6 | `provider-discovery.ts` has no fallback or substitution branch | `:143-148` emits only `state === "HEALTHY" && modelId !== null`; the `catch` at `:89-98` records `ABSENT` with `modelId: null`, which cannot enter the panel | HOLDS |
| 7 | the `resolveDiscoveredPanel` grep | reproduced; the set is unchanged except for my own probe file | HOLDS |

**R9 itself I could not refute.** Mutants M1 (panel order instead of roster order), M4 (`panelSize`
from the raw panel), M5 (raw panel returned) were each caught by three admission cases; there is no
path I could find in which a non-roster model joins the panel or a short roster starts a run.

## 5. Refutation matrix — every mutant I ran

Restoration is `cp` from a captured copy taken before the first mutant
(`/private/tmp/debate-tiers-REV-S02-p1-correctness-tests/orig/`); `git status --porcelain` printed
after each restore and reproduced below.

| # | property under test | mutant | outcome | `git status --porcelain` after restore |
|---|---|---|---|---|
| M1 | R3 roster ORDER | `roster.map(find)` → `discoveredPanel.filter(roster.includes)` | CAUGHT (3 cases) | 0 |
| M2 | R6 the refusal exists | refusal block deleted | CAUGHT (5 cases) | 0 |
| M3 | R6 the refusal's POSITION | moved after `assertMakerAdmission` | CAUGHT (3 cases) | 0 |
| M4 | R4 envelope sized to the roster | `panelSize: discoveredPanel.length` | CAUGHT (3 cases) | 0 |
| M5 | R4 persisted panel is the filtered one | `discoveredPanel` returned raw | CAUGHT (3 cases) | 0 |
| M6 | R11 the wire | `planTier: ask.plan_tier` removed from `startRun` | CAUGHT (2 cases) | 0 |
| M7 | R11 encrypted write path | `planTier: null` in the encrypted input | CAUGHT (1 case) | 0 |
| M8 | R11 plaintext write path | `null` bound for `$12` | CAUGHT (1 case) | 0 |
| M9a | R2 no tier branch (one line) | one-line ternary on the tier | CAUGHT | 0 |
| M9b | R2 no tier branch (wrapped) | the same ternary over three lines | **NOT CAUGHT** → N1 | 0 |
| M10 | one production `startRun` caller | second `.startRun(` in `apps/api/src/main.ts` | **NOT CAUGHT** → N3 | 0 |
| M11 | R7 message names the tier | tier dropped from the message | CAUGHT (1 case) | 0 |
| M12 | FR-0.6 AC5 isolation differential | evaluator leaked into the RAW panel | **NOT CAUGHT** → B2 | 0 |
| M13 | dating `scaffold.test.ts` | `apps/api/src/index.ts` ← `3bf54957` | same 2 failures → pre-existing | 0 |
| M14 | R1 canonical declaration | one comment line prepended to `cards.ts` | **FALSE POSITIVE** → N2 | 0 |
| M15 | R2 no tier `case` branch | `switch (ask.plan_tier)` over lines | **NOT CAUGHT** → N1 | 0 |
| M16 | R6 the refusal is TYPED | refusal thrown as a bare `Error` | case 8 still passes → N4 | 0 |
| M17 | R8 no run on refusal | unrelated throw at `submit`'s first statement | **whole file 9/9 green** → N4 | 0 |
| M18 | 0061 function allow-list | `'planTier'` removed from the key allow-list | CAUGHT (1 case) | 0 |
| M19 | 0061 CHECK constraint | `run_plan_tier_vocabulary` removed | CAUGHT (1 case) | 0 |
| RevA | dating B1 (ask path) | `packages/db/src/index.ts` ← `7f89f7b7`, `apps/api/src/index.ts` ← `3bf54957` | 1 of 3 failures disappears → B1 | 0 |
| RevB | dating B1 (class sweep) | `packages/db/src/index.ts` ← `7f89f7b7` only | 34 failures → 0; `76 passed (76)` → B1 | 0 |

**What I nearly got wrong.** My first attempt to date the `scaffold.test.ts` failures used
`git ls-tree HEAD dialectical-engine/web/`, which answered EMPTY from inside `dialectical-engine/`
and would have let me report "web/ is untracked, therefore pre-existing" on a git-pathspec artefact
rather than on evidence. The cwd-relative spelling shows `web/next.config.mjs` tracked at both base
and head, and M13 settled it independently. TOOLING-TRAPS 2026-09-01 names exactly this; the packet
did not list it among the traps for this node (N7).

---

## 6. Charges, answered

1. **Package README first, then `probes.md`, then the diffs, then only what they name** — done, in
   that order; both diff ranges read in full.
2. **The nine admission cases** — all nine exercised by mutants; eight discriminate, case 8 does not
   (N4). **The `api.test.ts` re-fixture and the `evaluator-database` re-seed (probe 1)** — every
   original `api.test.ts` assertion survives and none is vacuous (§3 B2's class table, three
   members checked); the `evaluator-database` re-seed **did** make an assertion vacuous (B2).
   **The filter's order and one-member-per-id shape (probe 2)** — §2.5, deterministic, first match.
   **The four architecture guards and what they do NOT catch (probe 3)** — N1 (multi-line and
   `switch`/`case` evade it; the converse condemns copy), N2 (line-pinned, false-positive on
   formatting); guard 1 (exact ordered roster) and guard 4 (`length >= 2`) both hold, with guard 4's
   known limit — R5 asks for two distinct MAKERS and the guard counts MEMBERS — already carried by
   `t_8eb3dcff` / row **V-15**, so it is not a new finding. **The wire and the single-caller guard**
   — the wire is pinned (M6), the caller guard is not (N3). **Every cluster command re-run** — §2.1,
   three runs each. **The seats' refutation matrices rebuilt with MY mutants** — §5; C2's three, C1's
   two most load-bearing and C4's both reproduce. **The C2 R9 sweep place by place** — §4, seven of
   seven hold, one citation corrected. **The typecheck-delta claim** — §2.2, verified, 70/70.
3. **Blind** — no sibling worktree, output or lane opened; `generate:contract` rc=0; 0 dirty at
   handoff; no `pkill`; no port taken (every suite reserved its own embedded-Postgres port from the
   OS); every multi-path run pinned the `Test Files` count.
4. **Every finding tiered with `file:line`** — §3. B1 and B2 are REWORK items under SPEC-v2; none of
   my findings is a V row (§7).
5. **This artifact's shape** — SKILLS LOADED, packet review, what I re-ran verbatim, my probes and
   mutants with restores, findings, verdict, predictions.

**UNVERIFIED.** Acceptance steps 1–4 and 8–9 (row V-7: no `gpt-5.6-luna`, `claude-sonnet-5` or
`grok-4.6` discovery target exists) — untestable by any seat; steps 5–7 I proved in-process
(`buildApi().inject()`), never in a browser, which is V's. R12's command was never run against the
dev database (`.local/**` and `127.0.0.1:55432` are no-touch). Class member 2 of B1 (the encrypted
path on a pre-0061 schema) is REASONED from `migrations/0040_account_erasure.sql:4270-4276`, not
executed — no current suite reaches it. I did not measure whether `apps/ui` renders the refusal
message correctly; that is the product-truth lens's (package probe 8).

---

## 7. Rows for V

**None from this lens.** B1 and B2 are both defects against requirements SPEC-v2 already carries
(R11's write must not break existing writers; a re-fixture must not kill the fixture's own
discriminator), so they are REWORK items, not questions for V. Package probe 6 (a `free` ask
carrying Premium gauge values) is already row **V-20** and belongs to the security lens. Guard 4's
member-count-versus-maker-span limit is already row **V-15**.

---

## 8. Predictions about the other two lenses (falsifiable; blind held)

I expect **security/data-safety** to clear R8's control flow — the refusal genuinely precedes the
lease (`index.ts:1305` before `:1310`) and my M2/M3 mutants confirm nothing writes on a refusal — and
to land instead on package probe 4: I predict it reports the same untyped `TypeError` I have as N5,
and rates it higher than I do because it will read the exported function as an attack surface rather
than as an internal call. I predict it does NOT find B1, because a security lens has no reason to run
`s6-content-encryption-database` or `s9-dev-token-retirement` — the word "migration" will send it to
0061's `SECURITY DEFINER` body (which is sound: my M18 shows the key allow-list is pinned) rather
than to the schema-version assumption in the TypeScript. I also predict it raises the refusal message
as an information-disclosure question (it names internal model ids to any unauthenticated-adjacent
caller) and opens a V row for it; I would not, because the ids are already on the marketing page
(`apps/ui/components/landing/cards.ts:27-28`). For **product-truth** I predict it confirms the exact
422 strings I measured in §2.4 and finds the same N6 elision in `PROGRESS.md`, but that it reports
acceptance steps 1–4 as UNVERIFIED and stops there, and that its sharpest independent finding is one
I deliberately left alone: nothing in the repo asserts that the `model` field of a
`PROVIDER_DISCOVERY_TARGETS_JSON` entry must be spelled exactly as the roster spells it, so V can
satisfy row V-7 with a target named `gpt-5.6-luna-latest` and every Free ask will still refuse, with
a message naming a model V believes is configured. If neither lens raises B1, its 35 red cases are
the single most expensive thing this pass found, and the union should carry it first.
