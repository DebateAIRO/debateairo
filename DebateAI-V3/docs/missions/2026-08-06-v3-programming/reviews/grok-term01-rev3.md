# GROK REVIEW: TERM-01 · rev 3 (composer segment-contract prompt · rework-2)

**Verdict: APPROVED**

Independent Grok seat delta review of ticket `t_b4d01f31` rework-2 (rev 3).
Rev 1 and rev 2 (this seat) were **APPROVED**. This pass re-reads **only** this
seat’s prior TERM-01 reviews and the rework-2 handoff/progress surface; Claude
seat reviews were **not** opened. Worker claims treated as hypotheses until
re-verified in code, tests, and (where standing) live serve. Board was **not**
mutated. Git history was **not** written. Sole write is this file.

## Delta contract consulted

| Source | What was taken as law |
|---|---|
| Own rev-1 / rev-2 | APPROVED baseline (DR-139 evaluator; DR-141/DR-142 micro-round) |
| Handoff **ADDENDUM 2** (`handoffs/TERM-01-claude-handoff.md`) | S04-class defect on **composer** organ; RED via contract-aware double; GREEN after SYSTEM prompt declares reasoning-only two-segment rule; serve gate untouched |
| Progress log | REWORK-2 complete claim: suites 322/322 + 15/15; contract-hash freshness |
| Live proof claim | Ceremony 3 log run `4594a592` settled; UI `/debate/4594a592-…`; serve `COMPONENTS_ONLY` with honest DR-139(4) / DR-141(2) marks |

## Independent re-runs (after SysV shared-memory sweep)

| Suite | This-seat result |
|---|---|
| SysV `ipcs`/`ipcrm` sweep | Residual segment present (held by standing ACC-01 ceremony3 postgres on :55432); suite runs used separate embedded PG ports and completed clean |
| `vitest run tests/unit tests/architecture` | **45 files / 270 tests GREEN** |
| `vitest run tests/integration` (embedded PG) | **7 files / 52 tests GREEN** (includes rework-2 fixture) |
| Combined unit+int+arch | **52 / 322** (matches handoff claim) |
| `vitest run --config acceptance/vitest.config.ts` | **6 files / 15 tests GREEN** (seed-register contract hashes included) |
| `pnpm run typecheck` | clean (`tsc --noEmit`) |
| `pnpm run audit:architecture` | `edgeRowsChecked: 27`, `violations: []` |
| `pnpm run audit:source` | `blocking: []` |

Evidence captures live only in private reviewer scratch (`term01-rev3-*.log`).

## Per-item delta verdict

### (1) Composer SYSTEM prompt declares ruled segment contract — **VERIFIED**

Shipped prompt at `apps/runner/src/index.ts` (compose `provider.call` SYSTEM
message, ~line 524), with explicit rework-2 comment that the gate is
byte-strict and repairs nothing:

```text
Return only JSON with a segments array of
{segment_id,text,node_refs,served_number_refs}. node_refs must name the
supplied nodes whose facts the segment asserts. Preserve the fact bundle and
add no facts. When the supplied nodes rest on reasoning alone, with no
measured or looked-up evidence behind them, return at least two segments in
order: the first segment states the provisional answer as a hypothesis; the
second segment states the research plan that would lift it.
```

Matches Q51 gate semantics in `packages/serve/src/index.ts` (~502–513):

- When every load-bearing node is `REASONING`, require `segments.length >= 2`
  (else `COMPOSITION_CONTRACT_ERROR`: *"A reasoning answer requires both a
  hypothesis and a research-plan segment"*).
- On pass: `terminal = DOWNGRADED`,
  `answerForm = { kind: HYPOTHESIS_WITH_RESEARCH_PLAN, hypothesis:
  segments[0].text, researchPlan: segments[1].text }`.
- No segment rewrite / padding / repair on the under-segmented path.

### (2) Serve gate byte-strict and untouched for this delta — **VERIFIED**

- `git diff HEAD -- packages/serve/src/index.ts` contains **no** hunks on the
  Q51 reasoning-only gate lines (no change to the `< 2` throw, no
  `HYPOTHESIS_WITH_RESEARCH_PLAN` mapping edit). Dirty serve surface is the
  earlier TERM-01 condition-mark work (DR-139(4) / DR-141(2) record types +
  projection), not rework-2.
- Grep for repair/pad/ensure-segment helpers on under-segmentation: only the
  rework-2 comment *"repairs nothing"* on the runner compose path.

RED→GREEN evidence is the contract-aware provider double, not a gate soften:

- Integration fixture
  `TERM-01 rework 2 — the composer organ is told the ruled reasoning-answer
  segment contract` (`tests/integration/database.test.ts`):
  - Double returns the live under-segmented shape (one `segment:verdict`)
    **unless** the SYSTEM prompt contains all four ruled fragments
    (`When the supplied nodes rest on reasoning alone`, `at least two
    segments`, hypothesis-first, research-plan-second).
  - GREEN (this seat, 59ms): asserts those fragments are present on the
    captured composer SYSTEM prompt, run `COMPLETED`, terminal `DOWNGRADED`,
    `answer_form.kind === HYPOTHESIS_WITH_RESEARCH_PLAN` with the double’s
    two segment texts.

### (3) Contract-hash freshness — **VERIFIED**

- `acceptance/seed-register.ts` `computeContractHashes` regex-extracts
  `content: "(Return only JSON with a segments array[^"]+)"` from the shipped
  runner and digests it as `composerContractHash`.
- `acceptance/seed-register.test.ts` uses the **same** extract pattern over
  the same shipped file for the expected digest.
- Independent recompute this seat: seed row hash
  `eaa024e43d8bfb01b1b93b0a16b0ae17dd5a822187a4aa13bb64f70370933bd2`
  equals digest of the extracted prompt text (`matchSeed: true`,
  `matchTestExtract: true`). Prompt remains a single quote-free line so the
  extract still binds.
- Acceptance suite GREEN includes the seed-register materialization test.
  Stale-seed discipline (`ACCEPTANCE_REGISTER_CONFLICT`) remains the existing
  seed path; not re-exercised against a deliberately stale `.pgdata` here.

### (4) Suites green — **VERIFIED**

See table above. Combined unit+architecture+integration = **322**; acceptance
= **15**; typecheck + both audits clean.

### (5) Git scope / board — **VERIFIED (relative to rev-3 delta)**

- Rework-2 production surface is the runner SYSTEM prompt amendment (+
  comment) and the new integration describe/it for the contract-aware double.
- Serve package remains dirty from prior TERM-01 (condition marks) but **gate
  lines for this delta are absent from the serve diff**.
- Working tree remains dirty and **V-gated** (no TERM-01 commit) — same posture
  as rev-2; not a regression of rework-2 scope.
- No board/sqlite ticket status writes from this seat. Sole file written:
  this review.

### (6) Live ceremony 3 proof (spot-check, standing serve) — **VERIFIED**

- Log `handoffs/TERM-01-live-ceremony3.log` records run
  `4594a592-f8c5-4a42-9d38-7ea74f6f0116` and answer
  `59bbc1d3-48b7-43f3-8370-0401999ba1d8` with UI path
  `/debate/4594a592-f8c5-4a42-9d38-7ea74f6f0116`.
- Standing API on `:8790` (orchestrator-owned `--serve`) answered under
  `x-user-dev-token: v-dev`:

| Field | Observed |
|---|---|
| `run_ref` | `4594a592-f8c5-4a42-9d38-7ea74f6f0116` |
| `terminal` / `serve_state` | `COMPONENTS_ONLY` / `COMPONENTS_ONLY` |
| `conformance_outcome` | `FAIL` (honest COMPONENTS_ONLY path; **not** a composition under-segment loud stop) |
| `composed_text` segment ids | `hypothesis`, `research_plan` (count 2) — model obeyed the declared contract |
| `condition_marks` | `DEFECT`, `OWED-CHECK-UNEXECUTED`, `UNRESOLVED-TYPE-FALLBACK` |
| DR-139(4) records | 20 × `OWED-CHECK-UNEXECUTED` with DR-139(4) reasons |
| DR-141(2) records | `UNRESOLVED-TYPE-FALLBACK` on **Q37** and **Q50** |
| Load-bearing node `way_of_knowing` | `REASONING` |

Run is settled on the wire (answer indexable; projection readable). UI at
`:3000` serves the debate route HTML; full browser render of marks was not
re-driven beyond API projection.

## Residual honesty (non-blocking)

1. **Composer packet still omits `way_of_knowing` per node** (handoff residual):
   the prompt’s “reasoning alone” rule is conditional; the live model must
   infer epistemic basis from the fact bundle. Out of this delta’s
   authorization; gate stays byte-strict either way. Not a BLOCKING for rev 3.
2. **Ceremony 3 COMPONENTS_ONLY is conformance FAIL**, not the ceremony-4
   under-segment `COMPOSITION_CONTRACT_ERROR`. The rework-2 fix is still
   evidenced by: (a) two-segment `composed_text` on the live REASONING answer,
   (b) RED/GREEN integration double. Multi-model ceremony was not re-launched
   by this seat.
3. Parked advisories from rev-1/rev-2 (Q34, Q55, ACC-01 packaging) remain
   parked; not re-opened.

## Findings

| Severity | Finding |
|---|---|
| BLOCKING | **none** |
| ADVISORY | none new for this delta (packet `way_of_knowing` residual remains parked as handoff-stated product risk, not a verify-list fail) |

GROK REVIEW: APPROVED — TERM-01 (rev 3)
