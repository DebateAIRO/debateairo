# F-T17T9-3 — WORKER PACKET · re-derive the sealed envelope row (V's ruling (a), 2026-09-05)

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3   (branch lane/t17t9-3, cut from lane/devsync's round-3 tip 2af816f1 — the DEV-RECONCILED tree V chose as the closing run's target, D66)
ticket        : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-T17T9-3-envelope-tightness-stale.md
V's ruling    : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/V-DECISIONS-PACKET.md — row F-T17T9-3, option (a)
the RED       : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/integration-suite-b13.log line 42673 — tests/integration/t17-envelope-ledger.test.ts:633 expects 7 serve-leg sites in the retired organs' key format (COMPOSER:n, CONFORMANCE:n:m, POST_COMPOSE_R9:n); the ledger has 6 run-level sites (COMPOSER:SYNTHESIZER:{INITIAL:1,RETRY:2,RETRY:3}, POST_COMPOSE_R9:EVALUATOR:{1,2,3}), 3 attempts each
history       : codex t17t9 r1/r2 in /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-codex-r1.md and -r2.md — the true maximum path is 3 rounds / 6 run-level sites / 18 serve attempts / 106 total vs a sealed ceiling of 109 (~3% conservative)
rework rounds : max 3
```

## OUTCOME (D58 — you choose the mechanism)

The sealed envelope row describes the serve leg that ships: six run-level sites (SYNTHESIZER + EVALUATOR
per round, three rounds), not the retired composer / conformance / restatement organs. The row's formula
inputs are RE-DERIVED from the post-T9 serve leg in the runner, not typed to fit the test. The t17
expectation at :633 then FOLLOWS the row (derived from the same source as the row, or asserting against
the row) — it is not hand-edited to the observed ledger. The ceiling stays a bound that covers the true
maximum (106); if the re-derivation changes the ceiling, show the old and the new number side by side
and say which assertions pin each. Sealed rows are sealed: if the row lives in a migration, a NEW
migration supersedes it; you do not edit a shipped migration.

## Where the row lives (enumerated — D61; grant follows)

`envelopeFormulaInputs` appears in: `packages/register/src/algorithm-policy.ts` (the register's row),
`packages/register/src/index.ts`, `migrations/0050_t16_algorithm_register_rows.sql`,
`acceptance/runtime-policy.ts` + `.test.ts` (reads it), `apps/api/src/main.ts` (serves it),
`tests/integration/t16-algorithm-register.test.ts` (the 10-key expectation W3 r4 just repaired —
your change must keep it honest, not break it), `tests/support/t16PolicyScanner.ts`,
`tests/unit/t17-envelope.test.ts`, and the RED itself `tests/integration/t17-envelope-ledger.test.ts`.
The serve leg whose sites you are describing is `apps/runner/src/index.ts` (read-only for you).

## Required evidence

1. RED first: the b13 failure reproduced in YOUR worktree (record under `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/`).
2. The re-derivation shown as a computation from the runner's sites, not as a list you typed.
3. GREEN: t17-envelope-ledger, t17-envelope (unit), t16-algorithm-register, runtime-policy — all green;
   name every other failing test in those files and whether it predates you (verbatim `passed/total`).
4. Mutation custody via `tools/mutate.sh` (note: it cannot substitute a `/` — if your mutant needs
   one, use the same gate sequence by hand and SAY SO, as W5 did): at least one mutant that changes a
   site count and dies at the row-derived assertion.
5. Provisioning per D9 ADDENDUM: `pnpm install --frozen-lockfile` exit 0, `pnpm run generate:contract`
   exit 0, contract hash reported (this tree's is 842c6c4e…, differing from integration's 59a57922… in
   the `models` field — W5's finding; do not "fix" that, report it).
6. Typecheck 0. Then `pnpm test` ONCE on your tip with the four-count accounting (test failures /
   suite-load / skips / unhandled) — this is **b14** on the reconciled tree: every failing name attributed
   to a parent (dev b5a6b6eb or integration 1485b9e2) or to W5's round-3 accounting
   (`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w5-dev-reconciliation.md`), and NO unexplained name. Do not use T0's closed
   list; it does not describe this tree (D66).

## Contract (D61)

allowed  : packages/register/src/algorithm-policy.ts · packages/register/src/index.ts · migrations/ (NEW file only) ·
           acceptance/runtime-policy.ts · acceptance/runtime-policy.test.ts · tests/integration/t16-algorithm-register.test.ts ·
           tests/support/t16PolicyScanner.ts · tests/unit/t17-envelope.test.ts · tests/integration/t17-envelope-ledger.test.ts ·
           /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-self.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/* · .hermes/TOOLING-TRAPS.md (append-only)
readonly : apps/runner/src/index.ts · apps/api/src/main.ts · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-codex-r1.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-codex-r2.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/integration-suite-b13.log
forbidden: all_others · never push · never merge · never touch integration or lane-devsync worktrees · never edit the board or the DECISIONS file (the orchestrator mirrors) · no credential values (D18)
skills   : heartbeat-worker floor; whole Superpowers library open. Declare `SKILLS LOADED:` in the handoff.

## Records you owe

Report `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3.md`; self-report `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-self.md` answering, verbatim:
"treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade.
what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a
one prompt machine even better." Markers with `comments read through: t17t9-3-dispatch-2026-09-05`.
End with `READY FOR PEER REVIEW` or `BLOCKED <reason>`. Nothing pushed, nothing merged.

# ---- AMENDMENT 1 (2026-09-05, after the seat's BLOCK at a44c905f; original above preserved) ----

**Orchestrator defect (#24):** the grant enumerated files by the row's NAME and never asked what CONSUMES the
basis. The seat proved the gap (/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/04: the real parser REJECTS the re-derived basis). Corrected here.

**V's ruling on the number:** **Seal the true number, 106** (V, 2026-09-05 16:24, against the choice of keeping 109 as padding). The row, `parseCostEnvelopeBasis`, `fixtureStructuralCeiling`, and every test that pins 109 / serve 7 / `selected: COMPOSITION` move to 106 / 6 / `SYNTHESIS_LOOP` together, in this lane. No padding remains. My register sentence '109 stays as a bound' is withdrawn.

**Grant extended (D61):** `packages/budget/src/index.ts` (parseCostEnvelopeBasis — restate the serve rule
ONCE, or make the parser read the rule from the constructor; either way the two cannot disagree again) ·
`tests/support/discoveredPanel.ts` (fixtureStructuralCeiling) · every test whose ONLY change is the pinned
site count / selected arm / ceiling (list each in your report with its old→new pin) · `packages/budget`'s
own tests. The consumers of the basis on this tree, so you do not have to find them: `packages/budget/src/index.ts`,
`packages/register/src/index.ts`, `apps/runner/src/index.ts` (read-only — the serve leg you describe), `apps/api/src/main.ts`
(read-only unless a pin lives there), `acceptance/runtime-policy.ts` + `.test.ts`, `tests/support/discoveredPanel.ts`, and the
tests `budget-s09`, `dr181-ceiling`, `dr184-review-resilience`, `pro01-runner-tree`, `register-s09`, `xrev01-node-review`,
`t17-envelope`, `t17-envelope-ledger`, `architecture/scaffold`, `integration/database`, `dev-deployment-register`,
`evaluator-database`, and `tools/orphan-audit/src/index.ts`. Change only the pins that follow from 106/6/SYNTHESIS_LOOP;
list every one with old→new. `migrations/` grant withdrawn (P2: the value is minted by the seeder, not the migration).

**Scope added (P5):** `t17-envelope-ledger.test.ts:658` and the ":660 ceiling is TIGHT" comment.
**Ticket corrected (P6):** `compositionSegmentCap` is live; do not touch it.
**Typecheck (P3):** report the DIFFERENTIAL — exactly W5's 8 inherited `s14-ui` errors and no others.
**TOOLING-TRAPS (P8):** the LANE's copy, at `<lane>/dialectical-engine/.hermes/TOOLING-TRAPS.md`, append-only.
**Skills (P7):** if the Skill tool cannot load a role contract, read it at
`<lane>/dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md` and say so in SKILLS LOADED.

Everything else in the original stands: RED reproduced (done), re-derivation by import (done), then GREEN,
mutation custody (tools/mutate.sh v2 now accepts `/`), the four-count b14 on your tip, records, marker.
Round 2 of max 3. `comments read through: t17t9-3-amendment1-2026-09-05`.

# ---- AMENDMENT 2 (2026-09-05 18:41) — ROUND 3 OF MAX 3, THE LAST · after codex r1 CHANGES (B1, B2) · original + AMENDMENT 1 preserved above ----

codex verdict: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-codex-r1.md   (B1, B2 blocking; F1–F4 follow-ups ticketed separately, NOT in this round unless comment-only)
parent gate (machine-readable, cite THESE, not the prose): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/31-fourcount-run2.log · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/27-suite-run2.log
your b14: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/14-b14-full-suite.log (the 19 AUTH_MAIL_BUSY blocks from line ~47679; the capacity aggregate at line 659 is on the fixture's controlled clock, not the wall clock)

**The 106 derivation STANDS** (codex: "the 106 correction is supported"). Two evidence/coverage blockers remain.

## B1 — attribution of the 19 unhandled AUTH_MAIL_BUSY rejections (evidence blocker)

Keep the literal four-count **80/1/0/20**. RETRACT the "one contention event, proven" sentence: the log carries no wall-clock
timestamps or waiter/queue correlation ids, and the parent has ZERO such rejections, not a smaller count. What clears it,
in the reviewer's words: comparable parent/tip evidence tying the waiter timeouts (`apps/api/src/registration.ts:1094`,
the individual waiter's timeout) and the S3d test failure to the same load episode, with REAL timing/correlation and
observed promise settlement. Another isolated pass alone does not settle it.

**Bounded instrumentation is AUTHORIZED (this is the grant the reviewer asked for):** you may instrument the TEST
harness — `tests/integration/registration-database.test.ts` and the mail-queue fixture/support it uses under
`tests/support/` — to record wall-clock timestamps and a waiter/queue correlation id per rejection, then run the
smallest experiment that discriminates load from defect (e.g. that file alone vs. that file under the same concurrency
the full suite imposes, on the tip AND on the parent 2af816f1 in a scratch checkout you make and remove). Production
code (`apps/api/src/registration.ts`) stays read-only. If your evidence shows the rejections are NOT load, say so — that
is a finding, and B1 becomes "cause unknown, not this lane's" only if you can show the same behaviour on the parent
under the same conditions. Record everything under `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/`. Normalise the b14 four-count file's blank skips
field to an explicit 0.

## B2 — the S06 receipt fixture (coverage blocker)

`tests/integration/obs-l3-s06-runner-binding.test.ts:262-265` still supplies `serve: 7`, the three retired composition
fields and `selected: "COMPOSITION"` — the strict parser refuses it as RUN_COST_ENVELOPE_UNRESOLVED before the test's
intended provider-exhaustion path. It was hidden behind the inherited advisory-lock stub failure (b14 line 44397, parent
44369 — both stop at `UNEXPECTED_CLIENT_QUERY: SELECT pg_try_advisory_lock`). Update the fixture to six serve sites and
the two-field synthesis receipt, keep its deliberately small ceiling and provider-attempt setup, and ESTABLISH that its
receipt parses independently of the lease-stub failure (a direct parse of the fixture's basis is enough). Add the
old→new entry to your report. **My AMENDMENT 1 consumer list omitted this file — orchestrator defect #27; the generic
affected-pin grant already covered it, so this is a factual correction, not a new permission.**

## Also in this round (cheap, in files you hold)
- F4 narrowing, COMMENT-ONLY if you choose to take it: describe the parser as checking shape, chain identity and
  disclosed-count consistency — not as proving every accepted receipt could have been minted by the constructor
  (`tests/unit/t17-envelope.test.ts:461`, `packages/budget/src/index.ts:96`). Not required for MERGEABLE.
- F1's two comments you already flagged (`panel01`/`xrev01-depth1-proof.ts:37`) stay OUT of contract; they are ticketed.

## Contract — unchanged from AMENDMENT 1, plus
allowed +: tests/integration/obs-l3-s06-runner-binding.test.ts · tests/integration/registration-database.test.ts
(instrumentation only) · tests/support/* mail-queue fixtures (instrumentation only) · a scratch checkout of 2af816f1
OUTSIDE the mission worktrees for the parent comparison, removed afterwards.
readonly +: apps/api/src/registration.ts · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-codex-r1.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/31-fourcount-run2.log · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/27-suite-run2.log
Markers: `comments read through: t17t9-3-codex-r1-2026-09-05`. `REWORK READY FOR REVIEW` or `BLOCKED <reason>`.
After this round nothing is re-dispatched: whatever is open goes to V.

<!-- NOTE appended 18:42: the two `tools/mutate.sh` mentions in the round-1/round-2 text above mean /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh (a mission-dir tool). Sent text is preserved; this note is the correction. -->

# ---- AMENDMENT 3 (20:46 2026-09-05) — V-AUTHORISED EVIDENCE ROUND for B1 (not a rework round; V's decision of 20:46) · everything above preserved ----

V's ruling (V-DECISIONS-PACKET, row "F-T17T9-3 · B1"): **bounded evidence work** — one extra round, test harness only, no
production change, whose ONLY output is evidence about the 19 unhandled AUTH_MAIL_BUSY rejections. The 106 fix itself is
approved on its merits (codex r2: B2 cleared, derivation stands, transfer clean) and is NOT touched in this round.

codex r2 (final snapshot): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/codex-r2-verdict.final-snapshot.md — its "## B1" section IS the evidence bar; read it whole.

## OUTCOME (D58)
A record V can read that says, with data, whether the 19 unhandled rejections in b14 (5e837ba7) are an inherited
harness/load behaviour or a tip-only difference — or that the question is inconclusive after the specified experiment.
No guess is renamed proof.

## The bar, in the reviewer's words (verbatim requirements)
- Preserve the exact test-only probe SOURCE and its full hash (round 3 kept only a 16-char prefix and no diff — that is
  why parity could not be certified).
- Retain BOTH effective deadlines: 28 s for registration, 18 s for default reservations (round 3 said "18 s registration" —
  wrong). Do not shorten them for the discriminating run.
- Record, per reservation: identity, role (dummy / target / marker), the actual deadline, enqueue / grant / release /
  settlement times (wall clock), and occupancy.
- Compare parent 2af816f1 and tip under the SAME documented concurrency or controlled contention, WITH an uninduced control.
- The paired failing episode must REACH the relevant release / marker-grant phase, not prevent entry to it (round 3's
  1500 ms deadline lost queued work before the initial release gate — that is why it did not clear).
- Account for EVERY unhandled event; preserve observation/cleanup behaviour explicitly.

Decision rule (the reviewer's): the same correlated post-release failure on the parent → B1 clears as an inherited
harness/load issue with residual uncertainty stated; a repeatable tip-only difference → a finding for investigation;
neither run produces the episode → INCONCLUSIVE, stated as such. b14 stays the 5e837ba7 measurement 80/1/0/20.

## Contract (D61)
allowed : tests/integration/registration-database.test.ts (instrumentation only, reverted at the end, byte-identical proven) ·
          tests/support/* mail-queue fixtures (instrumentation only, same) · a scratch checkout of 2af816f1 outside the
          mission worktrees, removed afterwards · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/* (probe source + full hash + every run's log) ·
          /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3.md (append: "§6f B1 evidence round") · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-3-self.md (append) ·
          the lane's .hermes/TOOLING-TRAPS.md (append-only)
readonly: apps/api/src/registration.ts · apps/api/src/auth-policy.ts · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/27-suite-run2.log · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/31-fourcount-run2.log ·
          /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/14-b14-full-suite.log · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/codex-r2-verdict.final-snapshot.md
forbidden: all_others · NO change to the 106 fix or any file it touched · never push, never merge · no edits to the board or the DECISIONS file · no credential values (D18)
Time box: if after ~3 h of wall clock the episode has not been reached on either tree, STOP and file INCONCLUSIVE with what was observed.
Markers: `comments read through: t17t9-3-codex-r2-2026-09-05`. End with `EVIDENCE FILED — <cleared|tip-only difference|inconclusive>`.

<!-- CORRECTION appended 22:40 (codex r3 packet audit): AMENDMENT 3's read-only list named apps/api/src/auth-policy.ts, which does not exist; the sealed policy is packages/register/src/auth-policy.ts. Sent text preserved. -->
