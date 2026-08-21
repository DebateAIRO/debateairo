# GROK REVIEW: TERM-01 · rev 2 (micro-round delta · DR-141 / DR-142 · advisory-1)

**Verdict: APPROVED**

Independent Grok seat delta review of ticket `t_b4d01f31` micro-round (rev 2).
Rev 1 (this seat) was **APPROVED** with zero BLOCKING and one relevant advisory:
`readTerminalRecordedFacts` counted `evidence.instrument_certification` without
`WHERE run_id = $1`. This rev re-reads **only** that own rev-1 file; Claude seat
reviews were **not** opened. Worker claims treated as hypotheses until
re-verified in code/tests. Board was **not** mutated. Git history was **not**
written. Sole write is this file.

## Delta contract consulted

| Source | What was taken as law |
|---|---|
| Own rev-1 (`reviews/grok-term01-rev1.md`) | APPROVED baseline; advisory-1 = unscoped instrument_certification count |
| Handoff addendum (`handoffs/TERM-01-claude-handoff.md` § ADDENDUM — micro-round) | Four delta items + claimed suite surface 321/321 + acceptance 15/15 |
| Ticket comment **340** (`claude-orchestrator`) | MICRO-ROUND DIRECTED: (a) advisory-1 `WHERE run_id=$1` + two-run RED; (b) DR-141(2) label rides answer; (c) livenessPolicy → classes{}; normative map pending V |
| Ticket comment **341** (`claude-orchestrator`) | DR-142: seed normative entry **exactly** as posted; provenance `acceptance:DR-142:V-approved`; byte-faithful + idempotent seed test |
| Ticket comment **342** (`claude-worker`) | REWORK READY claim covering all four items + suite numbers |
| Ledger **DR-141** | Six ratifications; (2) knob-10 label rides served answer; (3) livenessPolicy = shipped classes{} |
| Ledger **DR-142** | Normative composition entry ruled; provenance `acceptance:DR-142:V-approved` |

## Independent re-runs (after SysV shared-memory sweep)

| Suite | This-seat result |
|---|---|
| SysV `ipcs`/`ipcrm` sweep | Clean (no residual segments) before embedded-PG runs |
| `vitest run tests/unit tests/architecture` | **45 files / 270 tests GREEN** |
| `vitest run tests/integration` (embedded PG) | **7 files / 51 tests GREEN** |
| Combined unit+int+arch | **52 / 321** (matches handoff claim) |
| `vitest run --config acceptance/vitest.config.ts` | **6 files / 15 tests GREEN** (ceremony dry path includes `UNRESOLVED-TYPE-FALLBACK` + Q37/Q50 records; register seed byte-faithful + idempotent) |
| `pnpm run typecheck` | clean (`tsc --noEmit`) |
| `pnpm run audit:architecture` | `edgeRowsChecked: 27`, `violations: []` |
| `pnpm run audit:source` | `blocking: []` |

Evidence captures live only in private reviewer scratch (`term01-rev2-*.log`).

## Per-item delta verdict

### (1) Grok advisory-1 — run-scoped instrument_certification — **VERIFIED FIXED**

- Shipped SQL in `packages/battery/src/terminal.ts` now counts
  `(SELECT count(*) FROM evidence.instrument_certification WHERE run_id = $1)`
  (sibling research counts remain run-filtered).
- Two-run fixture in `tests/integration/database.test.ts`
  (`TERM-01 micro-round — run-scoped instrument-certification facts`):
  creates `targetRunId` + `leakSourceRunId`; materializes a CERTIFIED
  certification only on the leak-source run (via real artifact/node/gateway +
  probe rows + certification insert); asserts
  `leakSourceFacts.research.instrumentCertificationCount === 1` and
  `targetFacts.research.instrumentCertificationCount === 0`.
- Not a tautology: the leak source still counts 1; the completing run does not
  absorb the foreign CERTIFIED row. This seat observed the integration suite
  GREEN, which includes this fixture.

### (2) DR-141(2) — `UNRESOLVED-TYPE-FALLBACK` rides the served answer — **VERIFIED FIXED**

End-to-end lawful condition-mark path re-traced:

| Layer | Evidence |
|---|---|
| Battery evaluation | Q37 and Q50 consult `questionTypeInput` (RULED_FALLBACK factual) and set `consultedTypeFallback: true` (`terminal.ts`); other rows do not |
| Resolution stamp | `typeFallbackConsulted: true` is carried whenever consulted, independent of ACTIVE/INACTIVE (`terminal.ts` evaluate path) |
| Runner mint | After drain, runner filters `typeFallbackConsulted === true`, appends one named `ConditionMarkRecord` per consulting row, and adds mark `UNRESOLVED-TYPE-FALLBACK` to the answer (`apps/runner/src/index.ts`) |
| Serve persist fail-loud | `ConditionMarkRecord.mark` union includes `UNRESOLVED-TYPE-FALLBACK`; persist loop requires a typed record for this mark alongside `SKIPPED-BY-BUDGET` / `ENVELOPE_EXHAUSTED` / `OWED-CHECK-UNEXECUTED` (`packages/serve/src/index.ts`) — same fail-loud symmetry |
| Kernel / contract / web | Mark remains in closed `CONDITION_MARKS`; contract projects `condition_mark_records`; web label renders the mark |
| Unit | `flags the DR-021 knob-10 type fallback…` asserts consulted rows `["Q37","Q50"]` and never-otherwise when waiting set is `Q2/Q53/R9` (`tests/unit/battery-terminal.test.ts`) |
| Ceremony | Dry-run asserts `condition_marks` contains `UNRESOLVED-TYPE-FALLBACK` and named records subject_ref exactly `["Q37","Q50"]` (`acceptance/ceremony.test.ts`) |

Never-otherwise holds at both evaluation (unit) and serve surface (ceremony only mints when consulting rows exist in the waiting set that was evaluated).

### (3) DR-141(3) — livenessPolicy seed → shipped `classes{}` — **VERIFIED FIXED**

- Acceptance seed writes
  `{ kind: "LIVENESS_POLICY", classes: { standard: { review_after_ms, retire_after_ms } } }`
  (`acceptance/seed-register.ts`).
- Shipped reader `readLivenessPolicy` parses **only** `classes{}`
  (`packages/register/src/index.ts` `livenessPolicySchema`).
- Seed test asserts that exact shape
  (`acceptance/seed-register.test.ts`).
- Evaluator dual-read of `classes{}` + legacy `members[]` remains for older
  recordings (`terminal.ts` `matchLivenessPolicyMember`) — allowed by the
  directed micro-round.

### (4) DR-142 — normative `claimTypeCompositionMap` entry — **VERIFIED FIXED**

Orchestrator comment 341 payload (required exact seed):

```json
"normative": {
  "branch": "EVIDENCE_AWARE",
  "clarityDecayPerAmbiguity": 0.1,
  "terms": [{ "metric": "steelman_fidelity", "coefficient": 1 }],
  "caps": [],
  "uncertaintyLadder": [{ "atMost": 1, "label": "PROVISIONAL" }]
}
```

- Seeded **byte-faithfully** under `entries.normative` with the same field set
  and numbers (`acceptance/seed-register.ts`).
- Provenance: `ACCEPTANCE_COMPOSITION_MAP_SOURCE_REF = "acceptance:DR-142:V-approved"`
  on the map row (DR-136 discipline).
- Byte-faithful materialization asserted in `acceptance/seed-register.test.ts`
  (sourceRef + full value equality including `normative`).
- Idempotent re-run: `seedAcceptanceRegister` uses `ON CONFLICT DO NOTHING` then
  canonical-equality conflict check (`ACCEPTANCE_REGISTER_CONFLICT:<row>`);
  ceremony test **seeds idempotently** (second seed equals first; row count
  stable) on real embedded PG — covers the DR-142 map row with the rest of the
  register.
- Entry shape is accepted by shipped `claimTypeCompositionMemberSchema`
  (`packages/register`); `normative` is a kernel `CLAIM_TYPE`.

## Scope / git status

Working tree remains dirty and **V-gated** (no TERM-01 commit). Micro-round
surface is present among dirty/untracked paths
(`packages/battery/src/terminal.ts`, runner/serve/kernel/contract, acceptance
seed + ceremony, unit battery-terminal + integration database fixture, web
label, handoff, ledger DR-141/DR-142, this review). Pre-existing ACC-01
product dirt called out in rev-1 advisory-4
(`packages/critique`, `packages/judgement`, web `/api` proxy, package.json
workspace dep) remains on the shared tree — not micro-round expansion, still
packaging noise for V-gated commit/PR separation. No migrations dirty. Board
not mutated (sqlite comments read-only).

## Findings

None **BLOCKING**. None **NEW FINDING** on the four directed delta items.

Parked (unchanged from rev-1; out of this micro-round per orchestrator +
handoff):

- Advisory-2 (Q34 per-side evidence basis) — before research-route terminals.
- Advisory-3 (Q55 explicit open-unknown carrier) — with the ignorance-ledger
  carrier when one ships.
- Advisory-4 (ACC-01 shared-tree packaging) — V-gated commit hygiene.

## Residual honesty (non-blocking)

- Live multi-model ceremony and `:3000` render remain orchestrator-owned; this
  seat re-verified the **shipped evaluator + dry-run gate** on embedded PG only.
- Ceremony 4 operational note (fresh `acceptance/.pgdata` required, else
  `ACCEPTANCE_REGISTER_CONFLICT` on old sealed `livenessPolicy`/DR-133-only map)
  is seed-freshness discipline working as ruled — not a product defect.
- Full 8-type composition map remains provisional pending a later sitting
  (DR-142 ledger note).

GROK REVIEW: APPROVED — TERM-01 (rev 2)
