# GROK REVIEW: TERM-01 · rev 1 (sole review lens · DR-140)

**Verdict: APPROVED**

Independent Grok seat review of ticket `t_b4d01f31` (Claude coded; DR-140 sole
Grok lens). Worker claims treated as hypotheses until re-verified. Sources:
packet `term01-grok-packet.md`; ticket body + comments (sqlite read-only);
ledger DR-133..DR-140; `handoffs/TERM-01-claude-handoff.md`; shipped surface
(`packages/battery/src/terminal.ts`, battery exports, runner seam, kernel mark
mint, serve/contract projection, acceptance wiring, web honesty drawer, tests);
`git status --porcelain` / diffs. Claude seat review files were **not** opened.
Board was **not** mutated. Git history was **not** written. Evidence captures
live only in private reviewer scratch (`term01-suite-*.log`,
`term01-typecheck.log`, `term01-audit-*.log`, `term01-sysv-sweep.log`).

## Independent re-runs (after SysV shared-memory sweep)

| Suite | This-seat result |
|---|---|
| SysV `ipcs`/`ipcrm` sweep | Clean (no residual segments) before embedded-PG runs |
| `vitest run tests/unit tests/architecture` | **45 files / 269 tests GREEN** |
| `vitest run tests/integration` (embedded PG) | **7 files / 50 tests GREEN** |
| Combined unit+int+arch | **319 / 319** (matches handoff claim) |
| `vitest run --config acceptance/vitest.config.ts` | **6 files / 15 tests GREEN** (includes ceremony dry path on real embedded PG) |
| `pnpm run typecheck` | clean (`tsc --noEmit`) |
| `pnpm run audit:architecture` | `edgeRowsChecked: 27`, `violations: []` |
| `pnpm run audit:source` | `blocking: []` |

Ceremony dry-run (this seat, real embedded PG, REAL evaluator — no test stub):
final activation map **ACTIVE 24 · INACTIVE 44 · POLICY_BLOCKED 3**; **64**
drain events with `predicate_inputs.evaluator =
battery:terminal-activation-evaluator:DR-139:v1`; served answer carries
`OWED-CHECK-UNEXECUTED` and names exactly the 20 owed rows
`Q2 Q3 Q4 Q5 Q6 Q7 Q8 Q10 Q18 Q33 Q36 Q38 Q43 Q52 Q53 Q54 Q57 Q59 R2 R7`
(R9 ACTIVE with recorded execution — no owed mark).

## Dimension checklist (six blocking)

| # | Dimension | Judgment | Evidence |
|---|---|---|---|
| 1 | DR-139 fidelity — recorded facts only; shipped `resolveActivationState`; predicateInputs evidence; loud `TERMINAL_ACTIVATION_UNRESOLVED`; tier-invariant; ACTIVE→per-row `OWED-CHECK-UNEXECUTED` | **PASS** | Pure evaluator `evaluateTerminalActivations` (`packages/battery/src/terminal.ts:859-957`) has no model calls, clock, or probability (only risk-tier mentions are comment law at `:20-21`). Applies shipped `resolveActivationState` with `cacheHit: false` (`:896-901`; shipped rule at `packages/battery/src/index.ts:44-54`). Predicate evidence stamped with `TERMINAL_EVALUATOR_REF` (`terminal.ts:37`, `:923-930`). UNRESOLVED after resolve → typed `TERMINAL_ACTIVATION_UNRESOLVED` naming rows/missing inputs; run stays unsettled (`:948-955`). POLICY_BLOCKED/unknown waiting rows → `TERMINAL_ROW_NOT_EVALUATABLE` (`:869-876`). Runner mints one `OWED-CHECK-UNEXECUTED` record per ACTIVE resolution with null `executedCheckRef` before `serve.persist` (`apps/runner/src/index.ts:644-666`); R9 supplies `executedCheckRef` when stranger restatement + composer evidence exist (`terminal.ts:834-846`). Unit suite asserts 64-row composed path, evidence, owed-except-R9, Kleene refuse, empty WAIT (`tests/unit/battery-terminal.test.ts`, 10 tests, this-seat GREEN). |
| 2 | DR-115 — no fabrication; SQL from persisted state; Kleene never defaults; no runtime-reachable test double | **PASS** (see ADVISORY #1) | `readTerminalRecordedFacts` is SELECT-only projection (`terminal.ts:1006-1175`) over ledger/graph/judgement/propagation/decisions/research/critique/settlement/serve/register/work_item. Kleene `and3`/`or3` short-circuit on FALSE / refuse only when UNRESOLVED decides (`:156-166`, Q37 partial+INACTIVE via recorded conjunct `:550-567`, Q42 zero-packet limb `:594-610`, Q56 zero-history decidable / nonzero→UNRESOLVED `:719-738`). Live wiring: `createTerminalActivationEvaluator(pool)` default; `testOnlyTerminalEvaluator` rejected when `NODE_ENV !== "test"` (`acceptance/main.ts:106-108,179`). Ceremony no longer supplies a stub (`acceptance/ceremony.test.ts:106-119`). DR-135 refusing evaluator retained as outermost fallback export (`main.ts:61-79`), not the live default. |
| 3 | No silent widening of handoff QUESTIONS FOR V | **PASS** | Six QFV parked in handoff, not paper-fixed: (1) completion declaration channel for Q59/Q36/Q38/terminality (`terminal.ts:48-52,198-204,530-541,568-574,759-766`; runner supplies it at `:637-641`) — explicitly not a pre-persist ledger widening; (2) Q50/Q37 factual fallback via DR-021 knob-10 as `RULED_FALLBACK` evidence without minting answer label (`terminal.ts:236-246`); (3) dual liveness register shapes read tolerantly (`:983-1003`); (4) `settlement_act` / critique agreement remain unrecorded and refuse when deciding (`:550-554`, `:604-610`); (5) Q56 no invented threshold (`:731-737`); (6) kernel mint of `OWED-CHECK-UNEXECUTED` under DR-139(4) (`packages/kernel/src/index.ts:88-96`) — confirm-to-V, not silent product invention beyond the ruling. No new migrations/DDL (migrations tree clean). |
| 4 | TDD RED-first + ceremony dry-run evidence | **PASS** | Handoff pastes real RED (`evaluateTerminalActivations is not a function` 10/10; `--serve` UNKNOWN→duplicate; FX-ORPH-04 `condition_mark_records` orphan). This seat cannot re-run pre-implementation RED; GREEN path re-verified: unit battery-terminal 10/10; ceremony dry-run asserts the 64-row refusal replacement with evidence-carrying transitions, 24/44/3 map, 20 owed marks, R9 exempt (`acceptance/ceremony.test.ts:153-195`) — observed GREEN on real embedded PG. Rider tests for `--serve` parse/duplicate and self-contained default question GREEN (`acceptance/run-acceptance.test.ts`). |
| 5 | SOLID/DDD/pattern register (P3/P8/P13/P17); suites clean | **PASS** | P3: pure evaluate vs impure SQL reader vs seam factory (`createTerminalActivationEvaluator`); runner owns mark mint after drain, battery owns predicate truth. P8: acceptance composition root wires evaluator; no product mode branch for acceptance. P13: drain still ledgered via `drainWaitsForCompletion` with recorded predicate_inputs; no re-derived activation order. P17: **no new DDL** — reuses existing `serve.condition_mark` table for named records (`packages/serve/src/index.ts:1170-1184,1232-1238`). Suites this seat: 319/319 + acceptance 15/15 + typecheck + audits clean (table above). |
| 6 | Scope = ticket surface; git V-gated; riders minimal | **PASS** (see ADVISORY #4) | TERM-01 inventory matches shipped delta: new `terminal.ts` + unit test; battery exports; kernel mark; serve/contract `condition_mark_records`; runner owed-mark path; acceptance live evaluator + ceremony/rider tests/README; web label + honesty-drawer records. Riders: `--serve` standing mode + four-day-workweek default question (`acceptance/run-acceptance.ts:64-89,183-189`) documented in README. `git` shows dirty working tree only — no TERM-01 commits (V-gated). Pre-existing ACC-01 production diffs (critique/judgement mono-model, web `/api` proxy) remain on the shared tree; they are prior-ticket surface, not TERM-01 silent expansion. No migrations dirty. |

## Findings

None **BLOCKING**.

1. **ADVISORY** — `readTerminalRecordedFacts` counts `evidence.instrument_certification` **without** `WHERE run_id = $1` even though the table is run-scoped (`migrations/0008_s06.sql:101-112`; reader at `packages/battery/src/terminal.ts:1066`). Every sibling research count is run-filtered. On a multi-run database this can attribute another run's instrument certifications to the completing run (Q23). Current acceptance/ceremony path uses a fresh embedded DB and zero instrument rows, so the observed dry-run is unaffected. Fix: add `WHERE run_id = $1` before multi-run production use. (By contrast, unscoped `scorecard.scorecard_cell` has no `run_id` column — global class history is schema-correct for Q56.)

2. **ADVISORY** — Q34 always presents `evidence_on_both_sides = false` with a note that assumes zero evidence items (`terminal.ts:513-520`), even if `evidence_item_count > 0`. Row contract (`docs/architecture/10-row-contracts.md` Q34) says missing side records must not silent-INACTIVE the fairness verdict. Zero-evidence acceptance path is honest INACTIVE; a research-route run with items but no side tags should refuse (UNRESOLVED) or record true per-side sets. Park or fix before research-route terminals.

3. **ADVISORY** — Q55 hardcodes `open_unknown_count` to `0` while only consulting `absence_row_count` in the basis (`terminal.ts:710-717`). Terminal-completeness may justify “no open-unknown table → zero,” but the value is not derived from a named open-unknown projection. Prefer an explicit UNRECORDED/absent input or a real ignorance-ledger read if that carrier exists.

4. **ADVISORY** — Shared working tree still carries ACC-01 product deltas (e.g. `packages/critique`, `packages/judgement`, `web/lib/api.ts`, `web/app/api/`, package.json critique workspace dep) alongside TERM-01. Not a TERM-01 defect, but V-gated commit/PR packaging should separate or stack those surfaces so TERM-01 review scope stays auditable.

## Residual honesty (non-blocking)

- Ticket DONE-WHEN also requires an **orchestrator-run live** ceremony (real multi-model path) and `:3000` render. This seat approves the **shipped evaluator + dry-run gate** on embedded PG; live settle remains orchestrator-owned (handoff deferrals; DR-121-r Docker/Hatchet still deferred).
- FAIR-01/FAIR-02 multi-node / multi-maker requirement (DR-140(b)) is explicitly out of TERM-01 and untouched — correct scope.
- Completion-declaration ratification and the other five QUESTIONS FOR V remain open for V; none were silently coded as settled law beyond DR-139/DR-021 as cited.

GROK REVIEW: APPROVED — TERM-01
