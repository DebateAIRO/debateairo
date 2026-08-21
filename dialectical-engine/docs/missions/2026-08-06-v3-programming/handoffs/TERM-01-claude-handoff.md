# TERM-01 — Claude worker handoff (DR-139 · DR-140 lane)

Ticket `t_b4d01f31` · board `debateai-v3` · worker: Claude coding instance ·
reviewer: **Grok** (DR-140). Git untouched (V-gated): working tree only.

## What shipped

The REAL terminal WAIT activation evaluator — the production component that, at
run completion, gives each still-parked WAIT row its genuine ruling from the
run's **recorded facts only**, replacing the DR-135 refusing evaluator on the
live acceptance path. Plus both riders (`--serve` standing mode; self-contained
default question).

## Inventory

| File | Change |
|---|---|
| `packages/battery/src/terminal.ts` | **NEW.** `evaluateTerminalActivations` (pure, per-row predicate table over a typed `TerminalRecordedFacts` snapshot, Kleene three-valued), `readTerminalRecordedFacts` (SQL read projection, reads never write), `createTerminalActivationEvaluator` (seam factory), `TerminalCompletionDeclaration`, `TERMINAL_EVALUATOR_REF`, `SHIPPED_QUESTION_CLASS` |
| `packages/battery/src/index.ts` | exports the terminal module; new `declaredPredicateInputNames(rowId)` exposing the ratified per-row input names |
| `packages/kernel/src/index.ts` | `CONDITION_MARKS` += `OWED-CHECK-UNEXECUTED` (minted in the kernel, the sole minting authority, under DR-139(4)) |
| `packages/serve/src/index.ts` | `ConditionMarkRecord.mark` union += the new mark; `persist` requires a typed record for it (same fail-loud symmetry as the two budget marks); `readAnswerProjection` now returns `condition_mark_records` (reads the existing `serve.condition_mark` rows — **no DDL anywhere in this ticket**) |
| `packages/contract/src/index.ts` | `AnswerSchema` += `condition_mark_records` (mark, scope, subject_ref, reason, lift_path); contract artifacts regenerated |
| `apps/runner/src/index.ts` | seam widened: `resolveTerminalActivations` now receives `completion: TerminalCompletionDeclaration` and may return resolutions carrying `executedCheckRef`; after the drain, every ACTIVE resolution without a recorded execution becomes an `OWED-CHECK-UNEXECUTED` answer mark + per-row record before `serve.persist` |
| `acceptance/main.ts` | live path wires `createTerminalActivationEvaluator(pool)`; DR-135 refusing evaluator retained as the outermost fallback; test-only override gate unchanged |
| `acceptance/run-acceptance.ts` | riders: `--serve` flag (default now exits cleanly after settle); default question self-contained (N1) |
| `acceptance/README.md` | documents the evaluator swap and both riders |
| `web/lib/v3Presentation.ts` | `conditionMarkLabel` case for the new mark (exhaustive-switch law forced it); `projectAnswerSurface` destructures + projects `condition_mark_records` (AC-61 served-field→consumer law, enforced by FX-ORPH-04) |
| `web/components/DebateWorkspaceDrawer.tsx` | renders the named condition-mark records in the honesty drawer (mark label · battery row · reason) |
| `web/.env.local` | restored `NEXT_PUBLIC_API_BASE=/api` (see Environment note) |
| tests | `tests/unit/battery-terminal.test.ts` **NEW** (10 tests); `acceptance/ceremony.test.ts` upgraded to the REAL evaluator; `acceptance/run-acceptance.test.ts` rider cases; fixture field adds in `tests/unit/contract.test.ts`, `tests/unit/s14-ui.test.ts` (mark count 22→23, DR-139 cited) |

## Design, mapped to the DR-139 rulings

1. **Recorded facts only.** `readTerminalRecordedFacts` reads counts and rows
   from the run's own record (ledger entries incl. per-call-site MODEL_CALL
   stamps, graph nodes, reduced judgements, propagation receipts, decision
   records, evidence/critique/scorecard/serve tables, the sealed register, and
   settled work items). The pure evaluation computes each row's **declared**
   predicate input names (`predicateInputsByRow`), applies the SHIPPED
   `resolveActivationState` (cacheHit=false — no cache-satisfaction record
   exists in the schema), and records values + per-input basis on every drain
   transition (`predicate_inputs.evaluator = battery:terminal-activation-evaluator:DR-139:v1`).
   **Terminal-completeness principle** (documented in the module): at the
   completion boundary the record is the complete account of the run, so
   recorded ABSENCE decides event/route-shaped inputs FALSE; VALUE-shaped
   inputs with no record stay UNRESOLVED and refuse.
2. **Unavailable input → typed loud refusal.** Kleene three-valued evaluation;
   a predicate UNRESOLVED after `resolveActivationState` (i.e. would stay WAIT)
   throws `TERMINAL_ACTIVATION_UNRESOLVED` naming every row and missing input;
   the run stays unsettled. The DR-135 refusing evaluator remains exported as
   the outermost fallback. `POLICY_BLOCKED`/unknown rows in the waiting set
   throw `TERMINAL_ROW_NOT_EVALUATABLE` (they can never lawfully wait).
3. **Tier-invariant by construction** — neither the snapshot nor the
   evaluation takes a risk tier.
4. **ACTIVE at terminal → settle WITH typed loud condition marks.** The runner
   turns every ACTIVE resolution lacking a recorded execution
   (`executedCheckRef === null`) into one `serve.condition_mark` record
   (subject_ref = the battery row, scope=answer, affected node = the served
   node) plus the answer-level `OWED-CHECK-UNEXECUTED` mark; the served answer
   NAMES each owed check via the new `condition_mark_records` projection field.
   R9 is the one row with a recorded execution (stranger-restatement rows +
   POST_COMPOSE_R9 call) and correctly carries no owed mark. No
   check-execution engine was built (ruled out of TERM-01).

**Evaluator placement:** the drain lawfully precedes `serve.persist` — the S07
DDL trigger (`core.reject_terminal_with_wait`) refuses the TERMINAL progress
event while any WAIT survives, and persist writes TERMINAL. The runner
therefore passes a `TerminalCompletionDeclaration`
(`kind: ANSWER_RECORD_PERSIST`, served node ids, served-number plan): the
completing runner's own state, recorded by the same completion sequence at
persist. Only four inputs consume it (Q59 `answer_record_created`, Q36
`served_answer_count`, Q38 `numeric_answer_planned`, and the
`Q7_terminality`/`terminality` non-terminal-route reading); everything else is
a DB read. This is flagged as QUESTIONS FOR V #1.

## TDD — RED → GREEN (real pasted output)

RED (before `packages/battery/src/terminal.ts` existed):

```
 FAIL  tests/unit/battery-terminal.test.ts > ... > returns no resolutions for an empty waiting set
TypeError: evaluateTerminalActivations is not a function
 Test Files  1 failed (1)
      Tests  10 failed (10)
```

RED (riders, before implementation):

```
Expected: "DUPLICATE_ACCEPTANCE_ARGUMENT:--serve"
Received: "UNKNOWN_ACCEPTANCE_ARGUMENT:--serve"
 Test Files  1 failed (1)
      Tests  3 failed | 2 passed (5)
```

Mid-build, FX-ORPH-04 (the web type-graph audit) went RED after the contract
regeneration — real output:

```
AssertionError: expected [ 'condition_mark_records' ] to deeply equal []
+   "condition_mark_records",
```

— the new served field had no web consumer. Fixed by projecting it through
`projectAnswerSurface` and rendering the named records in the honesty drawer.

GREEN (final state, all in-sandbox on real embedded PostgreSQL where
DB-backed):

```
tests/unit + tests/integration + tests/architecture
                                           Tests  319 passed (319)
tests/unit/battery-terminal.test.ts        10 passed (10)  [within the above]
acceptance (vitest, embedded PG)           Test Files  6 passed (6) · Tests  15 passed (15)
tsc --noEmit                               clean (FINAL_TYPECHECK_CLEAN)
audit:architecture                         {"edgeRowsChecked": 27, "violations": []}
audit:source                               {"blocking": []}
```

## The ceremony dry-run — the 64-row refusal replaced

`acceptance/ceremony.test.ts` now runs the REAL evaluator (test-only stub
removed) through the real API root, runner, embedded PostgreSQL and seeded
DR-133 register, and asserts the honest outcome:

- final activation states: **24 ACTIVE · 44 INACTIVE · 3 POLICY_BLOCKED** = 71
  (opening 3 ACTIVE + 3 POLICY_BLOCKED + Q61 INACTIVE, then 64 drained as
  21 ACTIVE / 43 INACTIVE);
- **64** drain events carry `predicate_inputs.evaluator =
  battery:terminal-activation-evaluator:DR-139:v1` with computed values, bases
  and (where lawful) typed absent-input records;
- the served answer's `condition_marks` contains `OWED-CHECK-UNEXECUTED` and
  `condition_mark_records` names exactly the 20 owed rows:
  Q2 Q3 Q4 Q5 Q6 Q7 Q8 Q10 Q18 Q33 Q36 Q38 Q43 Q52 Q53 Q54 Q57 Q59 R2 R7
  (R9 ACTIVE with recorded execution — no owed mark);
- the DR-089 DDL trigger accepted TERMINAL (no WAIT survived).

The **live** ceremony (real GPT judge via the codex shim) is the
orchestrator's DONE-WHEN step and was not run from this sandbox.

## Rider status

- **`--serve` standing mode: DONE.** Default now exits cleanly after settle;
  `--serve` keeps DB + shim + API standing for the UI at :3000 (Ctrl-C stops).
  Replaces the ad-hoc standing script. Parse rules tested (position-free,
  duplicate rejected).
- **Self-contained default question: DONE.** New default: *"What is the
  strongest case for adopting a four-day workweek at a software company?"* —
  carries its own proposal per review finding N1; documented in the README with
  the reason (the old default made the judge honestly refuse → components-only,
  never a composed debate).

## Environment note

`web/.env.local` (untracked) had been rewritten by the earlier ad-hoc standing
setup to only `DIALECTICAL_API_BASE=http://127.0.0.1:8790`, which broke the S14
architecture pin `NEXT_PUBLIC_API_BASE=/api` (browser traffic must ride the
same-origin proxy). Restored to carry both lines. This was a pre-existing
working-tree drift, not a product change.

## Deferrals (acknowledged)

- No check-execution engine at terminal — DR-139(4) rules it the production
  follow-up, out of TERM-01.
- Docker/Hatchet remain deferred (DR-121/DR-121-r); no container fixtures run.
- The orchestrator-run LIVE ceremony + :3000 render is the ticket's DONE-WHEN
  and stays with the orchestrator.
- FAIR-01/FAIR-02 (multi-node, multi-maker debate per DR-140(b)) untouched.

## QUESTIONS FOR V

1. **The completion declaration.** The evaluator receives the runner's own
   `ANSWER_RECORD_PERSIST` declaration for exactly four serve/settle-stage
   inputs (Q59, Q36, Q38, terminality). It is the completing runner's state,
   recorded by the same completion sequence at persist — but at the drain
   instant it is not yet a DB row (the drain MUST precede persist: the DR-089
   DDL trigger refuses TERMINAL over a surviving WAIT, which is the fail-closed
   law DR-135 established). Ratify this narrow channel, or rule an alternative
   (e.g. a recorded pre-persist "completion intent" ledger action — that would
   be a recording widening I did not make silently).
2. **Q50/Q37 question type.** Resolved through the ruled DR-021 knob-10
   factual fallback, recorded as `RULED_FALLBACK` evidence on the transitions.
   The knob-10 travelling label (`UNRESOLVED-TYPE-FALLBACK`) is NOT added to
   the served answer by this evaluator (it is not the type-resolution organ).
   Should the label ride the answer whenever the fallback is consulted?
3. **Q18 basis.** `answer_can_change_over_time`/`registry_class` derive from
   the ruled `livenessPolicy` register row (a ruled review/retire clock =
   declared revisable), read tolerantly in BOTH recorded shapes — the shipped
   reader's `classes{}` and the DR-133 draft `members[]` the acceptance seed
   writes (the carried A1 advisory) — under the shipped scheduler's
   question-class binding (`"standard"`). Which shape should the sealed
   register row carry going forward?
4. **Recording gaps (parked, not widened).** Genuinely unrecorded today:
   `settlement_act` (Q37 — currently decidable via the recorded
   `study_result_in_use=false` conjunct; a run with study results in use will
   REFUSE), and a critique agreement verdict (Q42 — decidable now only via the
   zero-packet no-critic limb; a run with critique packets will REFUSE). If
   these must become recordable, that is a ruled migration (P17), not mine.
5. **Q56 sufficiency.** Zero recorded class history is filed decidably
   insufficient (no threshold consulted, none invented — AC-76); NONZERO
   history with no ruled sufficiency-threshold register row will REFUSE.
   Confirm, or rule the threshold row.
6. **Kernel mint.** `OWED-CHECK-UNEXECUTED` added to the closed
   `CONDITION_MARKS` vocabulary under DR-139(4) (kernel = sole minting
   authority); the S14 renderer count test retitled 22→23 citing the ruling.
   Confirm the mint.

## SELF-REPORT (agent-reports parent missing; filed here per dispatch)

Went well: the ratified row-contract table (10-row-contracts.md) was precise
enough to derive all 64 predicates without inventing anything; the Kleene
three-valued frame made ruling 1 and ruling 2 compose cleanly (short-circuit on
recorded conjuncts, refuse only when an unrecorded value actually decides);
the exhaustive-switch and strict-schema laws caught every ripple (web label,
fixtures) at typecheck time; the upgraded ceremony test turned DONE-WHEN into
an executable in-sandbox assertion.

Fought me: the drain-before-persist ordering vs. serve-stage predicate inputs
(answer_record_created is not yet a row at the drain instant) — resolved with
the narrow completion declaration, which I flagged for V rather than widening
recording silently; the battery index↔terminal module cycle (TDZ on
BATTERY_ROW_IDS) needed call-time row lookup; the pre-existing web/.env.local
drift surfaced as a seemingly unrelated architecture failure.

Would change: predicateInputsByRow deserves per-input TYPE metadata
(event-shaped vs value-shaped) in the contract itself so the
absence-decides-FALSE rule is declared data, not evaluator code; and the
recording gaps in Q37/Q42 should get a ruled recording path before any
research-route run reaches terminal.

---

# ADDENDUM — micro-round (DR-141 · DR-142 · Grok advisory 1)

Same worker, same-session rework law. Grok rev-1: APPROVED, zero blocking.
V ratified all six QUESTIONS FOR V as **DR-141**; the normative composition
entry arrived as **DR-142** (orchestrator comment on `t_b4d01f31`,
created_at 1786346305). Every item below was reproduced RED before the fix.

## 1 · Grok advisory 1 — run-scoped instrument-certification facts

RED (new two-run fixture, `tests/integration/database.test.ts` — run B's
CERTIFIED instrument certification leaked into run A's Q23 facts):

```
× TERM-01 micro-round — run-scoped instrument-certification facts (Grok advisory 1)
  → expected 1 to be +0 // Object.is equality
```

Fix: `WHERE run_id = $1` on the `evidence.instrument_certification` count in
`readTerminalRecordedFacts` (packages/battery/src/terminal.ts). GREEN. The
fixture drives the real DDL chain (raw artifact → node → gateway ledger entry
→ positive/negative probe captures → certification trigger deriving
CERTIFIED) and asserts the leak-source run still counts 1.

## 2 · DR-141(2) — the knob-10 fallback label rides the served answer

RED (unit + ceremony):

```
× flags the DR-021 knob-10 type fallback on exactly the rows that consulted it — never otherwise (DR-141(2))
  → expected [] to deeply equal [ 'Q37', 'Q50' ]
× ACC-01 dry-run ceremony ...
  → expected [ 'OWED-CHECK-UNEXECUTED' ] to include 'UNRESOLVED-TYPE-FALLBACK'
```

Fix: row evaluations that consult the ruled type fallback set
`consultedTypeFallback`; resolutions carry `typeFallbackConsulted` (whatever
the resolved state — consulted is consulted); the runner adds the
`UNRESOLVED-TYPE-FALLBACK` mark to the served answer with one named
condition-mark record per consulting battery row (`serve.ConditionMarkRecord`
union widened; `persist` requires a typed record for this mark, same fail-loud
symmetry as the other three). Ceremony now proves the label appears with
records naming exactly Q37 and Q50, and the unit test proves it never appears
when no consulting row is in the waiting set. GREEN.

## 3 · DR-141(3) — livenessPolicy seed aligned to the shipped classes{} shape

RED: `acceptance/seed-register.test.ts` expecting `classes{}` failed against
the seeded `members[]` draft shape. Fix: the seed row now writes
`{ kind: LIVENESS_POLICY, classes: { standard: { review_after_ms, retire_after_ms } } }`
— parseable by the SHIPPED `readLivenessPolicy` reader. The evaluator's
tolerant dual-read remains for older recordings. GREEN. (Closes the carried
A1 advisory for this row.)

## 4 · DR-142 — the normative claimTypeCompositionMap entry (checked pre-handoff)

The orchestrator comment approving the entry EXISTS; seeded **byte-faithfully
as posted**: `normative: { branch: EVIDENCE_AWARE, clarityDecayPerAmbiguity:
0.1, terms: [{ metric: steelman_fidelity, coefficient: 1 }], caps: [],
uncertaintyLadder: [{ atMost: 1, label: PROVISIONAL }] }`. Provenance follows
the DR-136 discipline: the map row's `source_ref` is now
`acceptance:DR-142:V-approved` (the ruling that approved the row's current
value-set), minted as `ACCEPTANCE_COMPOSITION_MAP_SOURCE_REF`. RED first:

```
× materializes the V-approved DR-133 values byte-faithfully ...
  → expected 'acceptance:DR-133:V-approved' to be 'acceptance:DR-142:V-approved'
```

GREEN after seeding. The entry parses under the shipped strict
`claimTypeCompositionMemberSchema` (`normative` is a kernel CLAIM_TYPE), so
the live ceremony's `COMPOSITION_UNRESOLVED` stop for claim type `normative`
is now resolvable.

## Operational note for ceremony 4

`seedAcceptanceRegister` verifies canonical equality against already-sealed
rows. A standing `acceptance/.pgdata` from earlier ceremonies holds the OLD
sealed `livenessPolicy` (members[]) and DR-133-only map, so reseeding over it
will fail LOUDLY with `ACCEPTANCE_REGISTER_CONFLICT:<row>` — that is the
seed-freshness discipline working. **Ceremony 4 needs a fresh data directory**
(or a V-ruled register-version bump).

## Still parked (advisory, per Grok rev-1; not directed this round)

- Advisory 2 (Q34 per-side evidence basis) — before research-route terminals.
- Advisory 3 (Q55 explicit open-unknown carrier) — with the ignorance-ledger
  carrier when one ships.

## Micro-round verification (final state, real output)

```
tests/unit + tests/integration + tests/architecture   Test Files 52 passed · Tests 321 passed (321)
acceptance (embedded PG)                              Test Files  6 passed · Tests  15 passed (15)
tsc --noEmit                                          clean (TYPECHECK_CLEAN)
audit:architecture                                    {"edgeRowsChecked": 27, "violations": []}
audit:source                                          {"blocking": []}
```

---

# ADDENDUM 2 — rework round 2 (composer-organ segment contract, live ceremony 4)

Directed finding + narrow production authorization (orchestrator comment on
`t_b4d01f31`, created_at 1786346770). Live ceremony 4 evidence:
`handoffs/TERM-01-live-ceremony2.log` — composition SUCCEEDED under DR-142 and
the run stopped one gate further, honestly:

```
TypedDomainError: A reasoning answer requires both a hypothesis and a research-plan segment
    at runServeGateChain (packages/serve/src/index.ts:502)
  code: 'COMPOSITION_CONTRACT_ERROR'
```

Root cause (the S04 judge-prompt defect class, now on the COMPOSER organ): the
serve gate is byte-strict — when every load-bearing node is REASONING the
answer takes HYPOTHESIS_WITH_RESEARCH_PLAN form and MUST arrive as
segments[0]=hypothesis, segments[1]=research plan — but the composer system
prompt never declared that contract, so the live model returned one segment.

## RED (real output — the observed live failure reproduced in-sandbox)

New integration test (`tests/integration/database.test.ts`, "TERM-01 rework 2
— the composer organ is told the ruled reasoning-answer segment contract"): a
contract-aware provider double behaves like the live model — it inspects the
composer SYSTEM prompt and returns the observed under-segmented shape (one
verdict segment) unless the prompt declares the reasoning contract; judge
returns a REASONING-only judgement so the run takes the ruled gate path.

```
× TERM-01 rework 2 — ... declares the reasoning-only segment contract and settles the answer as hypothesis + research plan
  → A reasoning answer requires both a hypothesis and a research-plan segment
```

## Fix (narrowly authorized production edit)

`apps/runner/src/index.ts` composer SYSTEM prompt amended — it now declares
the ruled segment contract in full: the segment shape
(segment_id/text/node_refs/served_number_refs; node_refs name supplied nodes;
preserve the fact bundle, add no facts) AND the reasoning-only rule: *"When
the supplied nodes rest on reasoning alone, with no measured or looked-up
evidence behind them, return at least two segments in order: the first
segment states the provisional answer as a hypothesis; the second segment
states the research plan that would lift it."* The serve gate is untouched
and stays byte-strict; NO output repair anywhere.

## GREEN (real output)

```
✓ declares the reasoning-only segment contract and settles the answer as hypothesis + research plan
tests/unit + tests/integration + tests/architecture   Test Files 52 passed · Tests 322 passed (322)
acceptance (embedded PG)                              Test Files  6 passed · Tests  15 passed (15)
tsc --noEmit                                          clean
audit:architecture                                    {"edgeRowsChecked": 27, "violations": []}
audit:source                                          {"blocking": []}
```

The test also asserts the settled answer: terminal DOWNGRADED, answer_form =
{ kind: HYPOTHESIS_WITH_RESEARCH_PLAN, hypothesis = segments[0].text,
researchPlan = segments[1].text }.

## Contract-hash freshness

The composer contract hash IS computed from this prompt text
(`acceptance/seed-register.ts` `computeContractHashes` regex-extracts the
string beginning `Return only JSON with a segments array`). The amended prompt
stays a single quote-free line, so both the seed and the seed test extract and
digest the SAME new text — proven green above. On a fresh `.pgdata` (the
ceremony discipline) the new hash seeds cleanly; reseeding over an old data
dir stops loudly with `ACCEPTANCE_REGISTER_CONFLICT` (stale-hash discipline,
as before: ceremony 5 needs a fresh data directory).

## Residual risk, stated plainly

The rule the prompt declares is conditional ("when the supplied nodes rest on
reasoning alone"), but the composer packet's `availableNodes` does not carry
`way_of_knowing` — the live model must infer the epistemic basis from the fact
bundle itself. The authorization covered the SYSTEM prompt only, so I did not
widen the packet. If ceremony 5 still under-segments on a reasoning answer,
the next narrow fix is declaring each supplied node's way_of_knowing in the
composer user packet — flagged here rather than done silently. The gate stays
byte-strict either way; a non-compliant model produces the same honest loud
stop, never a repaired answer.

Micro-round surface untouched except this fix's own files (runner prompt +
new integration test).
