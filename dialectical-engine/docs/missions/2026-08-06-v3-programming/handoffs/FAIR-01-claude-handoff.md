# FAIR-01 — THE FAIR DEBATE: more than one node, more than one model (DR-140)

Ticket `t_e8c76da2` · worker: Claude (DR-140 roster: Claude codes, Grok reviews)
· laws: CODING-LOOP-PROTOCOL + ledger through DR-143 · git untouched (V-gated).

V's words are the requirement: *"I want the debate to have more than one node
and one model"* / *"more than one node to be fair"*.

## 1 · The design — which organ each maker serves, and why

**OpenAI (`acceptance:codex-cli`, gpt-5.6-sol) judges the POSITION** and keeps
the composer/conformance chain — the shipped walking-skeleton path, unchanged.

**Anthropic (`acceptance:claude-cli`, the CLI-reported model) runs the CRITIC
leg**: the SAME shipped Judge organ (identical ruled contract text, identical
ruled JUDGE cost bound, distinct call site `JUDGE:critic`) is asked for the
strongest genuine counter-position to the position's statement. The counter
enters the graph through the shipped `GraphWriter` inside one `withGraphWrite`
transaction (P7): a first-class **`defeater` child node** (`generation_status
complete`, `exploration_decision challenge`) with its own stranger
restatement, plus a real **`attack`/`rebutting` edge** onto the position —
the exact S07 defeater edge shape (`strength null`, `magnitude UNKNOWN`,
`strength_source EVIDENCE_VERIFIER`): no evidence verifier measured the edge,
so no number rides it (AC-76). The counter gets its own reduced judgement
(tau), and every propagation strength record cites **its own node's artifact**
(never the position's lineage stamped onto the counter — DR-115).

Why this split is genuinely fair (DR-140(b)):
- The counter is **another maker's real artifact** — provable from
  `ledger.raw_artifact.maker` on the counter node's `provenance_ref`.
- The counter prompt carries only the position's **statement text** — no
  maker, model, or provider identity travels to the critic (blind in fact).
- One debate, one claim frame: the counter judgement is **classified on the
  run's question line**, not on the position's wording (new optional
  `claimClassificationLine` on the shipped Judge input; position-side
  behavior byte-identical, judge contract template untouched — the ruled
  judge contract hash is unchanged).

**The RUN-LEVEL fair-debate gate** (`acceptance/fair-debate.ts`, DR-143
clause 1: run-level law, not a deployment floor): after settle, the ceremony
reads the RECORD back and refuses loudly unless the debate has (i) more than
one node, (ii) every node with persisted artifact lineage, (iii) more than
one distinct persisted maker, (iv) at least one attack edge joining graph
nodes, and (v) at least one attack edge joining nodes of **different**
makers. Codes: `FAIR_DEBATE_NODE_COUNT_UNSATISFIED`,
`FAIR_DEBATE_LINEAGE_MISSING`, `FAIR_DEBATE_MAKER_COUNT_UNSATISFIED`,
`FAIR_DEBATE_COUNTER_EDGE_MISSING`, `FAIR_DEBATE_COUNTER_NOT_INDEPENDENT`.
Pure core + imperative shell (P2); nothing defaults (P18).

### Design calls a reviewer will ask about

- **Why not the S07 `SplitStageRunner`/`decide()` organ?** `decide()` needs a
  full `DecisionInput` signal bundle (score/evidence availability, freshness,
  firing reasons — `packages/battery/decision/src/index.ts:31-56`). No
  recorded battery signals drive the counter spawn; inventing
  availability/freshness members to satisfy the organ would be fabricated
  signal data. The counter's generation is already COMPLETE when it enters
  the graph (a real artifact exists), so `spawnPendingChild`'s pending-child
  shape is also wrong. `addNode`+`addEdge` are the same shipped writer
  primitives the runner already uses for the root — composed, not minted.
- **Why not `agent_count >= 2`?** `agent_count` is recorded on the run
  (`core.run.agent_count`) and consumed by no shipped organ; raising it would
  change nothing real and imply a fanout that does not exist. The ceremony
  ask stays byte-identical to ACC-01's (depth 1 / standard — the DR-138 run
  envelope member).
- **Why `defeater` and not `attack`?** Both are lawful `CHILD_KINDS`;
  `defeater` is what the serve projection surfaces (`defeater_refs` on the
  position node — `packages/serve/src/index.ts` readNodesForRun), so the UI
  honestly names the counter as the position's defeater. The S07 spawn organ
  treats defeater exactly as attacking (polarity attack, kind rebutting) —
  mirrored byte-for-byte.
- **Why does the attack not lower the served number?** The edge magnitude is
  honestly UNKNOWN (no verifier ran; the critic's self-scored
  `counterargumentStrength` is an assessment of its own statement, not a
  measured edge magnitude — stamping it `MEASURED` would invent a
  measurement). Propagation therefore scores both nodes and records
  `attackedBy` on the position without a numeric reduction. The served
  number remains the position node's final strength, now selected **by node
  id** (the old `strengths[0]` indexing is unsafe in a multi-node graph).

## 2 · Inventory

| File | Change |
|---|---|
| `apps/runner/src/index.ts` | The critique leg (second maker → counter judgement → defeater node + attack edge → own reduced judgement); `RunnerCritiqueSettings` + `ScoringOperatorRegisterInput` settings; P8 operator resolution via the SHIPPED `resolveScoringOperator` with supplying level recorded on the propagation receipt; typed loud `SCORING_OPERATOR_UNRESOLVED` (before any claim/model call when the critique leg is configured, and again at any arrow-bearing snapshot); per-node strength lineage (`STRENGTH_LINEAGE_UNRESOLVED` refusal instead of borrowed lineage); served number selected by node id; second `JUDGEMENT_SCHEDULED` entry for the counter. |
| `packages/judgement/src/index.ts` | Optional `claimClassificationLine` on `JudgeInput`; classifier + `resolveClaimType` read it; prompt template byte-untouched (judge contract hash unchanged). |
| `acceptance/fair-debate.ts` (new) | The DR-140(b)/DR-143(1) run-level gate: pure `evaluateFairDebate` + `readFairDebateEvidence` + `assertFairDebate`. |
| `acceptance/main.ts` | `createAcceptanceRuntime` now REQUIRES `criticRelay {baseUrl, model}`; builds the Anthropic gateway (`createPostgresProviderGateway`, maker from the RULED provider set, model = the relay's honestly-reported id); wires `critique` + optional `scoringOperator` into the runner; standalone `main()` starts the real claude relay itself (handshake before the API accepts asks). |
| `acceptance/runtime-policy.ts` | `readOptionalScoringOperator` — reads the DR-074 row if V has ruled it; absent ⇒ undefined ⇒ runner loud stop; the raw row value is validated by the shipped resolver at the point of use. |
| `acceptance/run-acceptance.ts` | Ceremony starts the claude relay (real CLI handshake) beside the shim; passes it to the runtime; runs `assertFairDebate` after settle and prints the graph/maker report; `--serve` keeps the relay standing; close() closes it. |
| `acceptance/ceremony.test.ts` | New first test: unruled `scoringOperator` ⇒ `SCORING_OPERATOR_UNRESOLVED` before any claim/model call. Main ceremony test drives BOTH maker doubles: asserts 2 nodes / 1 attack edge / `defeater_refs` / distinct persisted makers `["OpenAI","Anthropic"]` / per-node strength lineage / served number = position strength / zero critique packets / exactly one `JUDGE:critic` model call / the fair-debate report; updated drained census + owed-check rows to the honest two-node reality. |
| `acceptance/fair-debate.test.ts` (new) | Six pure-core gate tests (pass + five typed refusals). |
| `tests/unit/judgement.test.ts` | Two tests for the one-claim-frame law. |
| `tools/orphan-audit/src/index.ts` | `GraphWriter.addEdge` + `resolveScoringOperator` leave the hardcoded `neverCalled` list (they now have production callers); critique-row reasons updated to cite the DR-141(4) Q42 refusal law (they stay unattached — deliberately). |
| `tests/architecture/scaffold.test.ts`, `tests/architecture/s08-contract.test.ts` | Expectations updated to the derived reality: `addEdge`/`resolveScoringOperator` ATTACHED; S08 packet organs remain UNATTACHED with the DR-141(4) citation. |
| `acceptance/README.md` | FAIR-01 section: the two-maker debate, the DR-074 loud stop, `--serve` now includes the relay. |

Not touched: `packages/propagation`, `packages/serve`, `packages/critique`,
`packages/ledger`, `seed-register.ts` (register content byte-identical — the
standing `.pgdata` seeds without conflict), the composer/conformance prompt
strings in the runner (their captured contract hashes are unchanged),
`dual-maker-proof.ts`, web.

## 3 · TDD — RED → GREEN (real output)

RED 1 (judgement, before `claimClassificationLine` existed):

```
FAIL  tests/unit/judgement.test.ts > FAIR-01 / DR-140(b) — one debate, one claim frame > keeps the code-first classification when the classification line resolves on its own
AssertionError: expected 'empirical' to be 'normative' // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
```

RED 2 (acceptance, before the gate module and wiring existed):

```
FAIL  acceptance/ceremony.test.ts [ acceptance/ceremony.test.ts ]
Error: Cannot find module './fair-debate.js' imported from .../acceptance/ceremony.test.ts
FAIL  acceptance/fair-debate.test.ts [ acceptance/fair-debate.test.ts ]
Error: Cannot find module './fair-debate.js' imported from .../acceptance/fair-debate.test.ts
 Test Files  2 failed (2)
```

RED 3 (mid-build, the law collision — first leg implementation recorded an
S08 critique packet; the REAL DR-139 terminal evaluator refused settle):

```
EXECUTE ERROR: DR-139(2) typed refusal — the run stays unsettled; predicate inputs genuinely unrecorded at terminal: Q42[critic_agrees]
CODE: TERMINAL_ACTIVATION_UNRESOLVED
```

RED 4 (after the pivot, the honest two-node battery census differs):

```
AssertionError: expected { ACTIVE: 32, INACTIVE: 36, …(1) } to deeply equal { ACTIVE: 24, INACTIVE: 44, …(1) }
```

GREEN (final full verification, this session):

```
tests/unit + tests/integration + tests/architecture:  Tests  324 passed (324)
acceptance suite:                                     Tests  34 passed (34)
tsc --noEmit                                          (clean)
audit:architecture  { "edgeRowsChecked": 27, "violations": [] }
audit:source        { "blocking": [] }
```

The census shift is fully accounted for: the two-node debate honestly flips
eight recorded-fact rows INACTIVE→ACTIVE — Q9 (`live_answer_count: 2`),
Q26–Q31 (the split into rival positions: `Q10.split true`, one spawned child,
one survivor), Q45 (`multiple_components_to_compose: true`) — and each newly
ACTIVE row rides the served answer as a DR-139(4) `OWED-CHECK-UNEXECUTED`
condition-mark record (visible honesty, asserted in the ceremony test).

## 4 · The law collision found and how it is resolved (READ THIS FIRST)

**Recording an S08 critique packet makes the run UNSETTLEABLE.** Evidence:
`packages/battery/src/terminal.ts:601-618` — Q42's evaluator: with
`critiquePacketCount >= 1` the predicate input `critic_agrees` is filed
ABSENT (*"critique packets exist but the record carries no agreement verdict
shape"*) and the predicate is UNRESOLVED ⇒ `TERMINAL_ACTIVATION_UNRESOLVED`.
This is RULED behavior — DR-141(4): *"Q37/Q42 recording gaps stay parked:
runs needing them REFUSE until a ruled migration"* — and the TERM-01 handoff
says it verbatim: *"a run with critique packets will REFUSE"*.

So the first implementation (blinded packet + P18 independence receipt +
`blinded-before-critic` sequence proof — all recorded through the shipped
S08 organs) settled NOTHING; the refusal above is its real output.

**The lawful resolution shipped here:** the counter leg is a **rival
judgement**, not a CROSS adjudication. No critique packet is recorded (the
CROSS blind-verification instrument genuinely did not run — Q41/Q42 stay on
their honest zero-packet limbs), and the counter's independence is proven
from **recorded per-artifact maker lineage** — which is DR-140(b)'s own
letter ("MORE THAN ONE MODEL MAKER with honest lineage"). The blinding
remains true in fact (the critic prompt contains no identity), but it is not
a recorded attestation until V rules the Q42 recording migration — parked in
QUESTIONS FOR V 2, with the packet-recording implementation retained in this
handoff's history for immediate reuse once ruled.

## 5 · The ONE unruled value — the DR-074 `scoringOperator` row

An arrow-bearing graph cannot propagate without an operator resolution for
each attacked node (`packages/propagation/src/index.ts:368-370`,
`OPERATOR_RESOLUTION_MISSING`). The only lawful source is the mandatory
deployment `scoringOperator` register row (DR-074; P8), whose VALUE the
architecture explicitly reserves: *"Value `— none stated`; **V's at DR-023**
… Inventing the value here would be the AC-76 / DR-039 violation"*
(`docs/architecture/05-register-skeleton.md:247-254`).

Shipped behavior: the runner resolves the row through the SHIPPED
`resolveScoringOperator` chain and RECORDS the supplying level on the
propagation receipt; while the row is unruled the ceremony stops loudly with
`SCORING_OPERATOR_UNRESOLVED` **before any claim or model call** (first
acceptance test proves it). Tests use a clearly-labelled
`acceptance:test-layer` row inside their own ephemeral databases only —
nothing is seeded for the live register.

**Operator-invariance proof for THIS debate shape** (making the ruling
cheap): the position has one incoming attack arrow (magnitude UNKNOWN) and
zero support arrows; the counter has none. `accumulate` and `strict-and`
differ only in support aggregation (`strict-and` = product over supports,
conjunct-required) — over an empty support list both reduce to `agg([]) = 0`,
and attacks aggregate identically under both. So both operators yield
**byte-identical strengths** here; the choice affects only the recorded
receipt fields (`operatorUsed`, `rivalOperator`, `rivalStrength` — the rival
strength equals the primary for this shape). The value is still V's.

**Exact edit on V's ruling** (new DR, say DR-14x), in
`acceptance/seed-register.ts` `buildAcceptanceRegisterRows` ruledRows:

```ts
{ rowKey: "scoringOperator", value: "<accumulate | strict-and — V's word>", sourceRef: "acceptance:DR-14x:V-approved" },
```

NOTE: adding the row changes the seeded row count, so the sealed
`register_version.row_count` in any standing `.pgdata` no longer matches ⇒
`ACCEPTANCE_REGISTER_VERSION_CONFLICT`. **A fresh acceptance data directory
is required for the live gate** (anticipated by the dispatch note): stop the
standing stack and remove `acceptance/.pgdata` before the ceremony.

## 6 · The live ceremony — exact orchestrator command

Preconditions: (1) V has ruled the `scoringOperator` row AND the seed edit
above is applied; (2) fresh `acceptance/.pgdata` (see §5); (3) plain terminal
(the claude CLI needs its keychain login — `claude /login` if expired; the
codex CLI as for ACC-01); (4) the web dev server on :3000 pointed at the
acceptance API (`NEXT_PUBLIC_API_BASE` / `DIALECTICAL_API_BASE`).

```bash
cd DebateAI-V3
ACCEPTANCE_DB_PORT=55432 \
ACCEPTANCE_API_HOST=127.0.0.1 \
ACCEPTANCE_API_PORT=8790 \
ACCEPTANCE_SHIM_PORT=8791 \
ACCEPTANCE_STRANGER_SAMPLE_RATE=1 \
ACCEPTANCE_BATTERY_VERSION=acceptance-v1 \
ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:standing-watch \
./node_modules/.bin/tsx acceptance/run-acceptance.ts --token <ui-token> --serve
```

The ceremony now: boots DB → seeds → starts the codex shim AND the claude
relay (real handshake; a dead/unauthenticated CLI refuses the ceremony —
DR-143(3)) → API → ask → the runner executes BOTH maker legs → settles →
**runs the fair-debate gate** and prints:

```
ACC-01 run id: <run-id>
ACC-01 answer id: <answer-id>
FAIR-01 graph: 2 nodes · 1 attack edge(s)
FAIR-01 makers: Anthropic, OpenAI · independence: (independentAttackEdgeCount ≥ 1)
ACC-01 UI: http://localhost:3000/debate/<run-id>
```

Model-call budget within DR-138's ruled 9: judge 1 + critic 1 + composer 1 +
conformance ≤3 + R9 1 ≤ 7. If the gate fails, the ceremony fails loudly with
the exact `FAIR_DEBATE_*` code — never a quietly-served unfair debate.

Risk note (honest): the live counter judgement's claim type resolves on the
run's question line; if the model classifies it to a type without a ruled
composition entry (map has `unknown` + `normative`), the run stops loudly
with `COMPOSITION_UNRESOLVED` — that would be a new DR-142-style entry for V,
not a defect.

## 7 · What the UI should show at :3000/debate/&lt;id&gt;

- **Argument graph: `2 nodes · 1 edges`** (DebateCanvas renders counts,
  node cards and edge lines generically — no web change needed).
- Node card 1: the position claim (maker OpenAI lineage behind its
  provenance ref); node card 2: the counter-position claim (maker Anthropic),
  each with way-of-knowing and staleness.
- The edge line: **attack** `<counter-node> → <position-node>` with the
  UNKNOWN-magnitude placeholder strength reason (`NO_JUDGEMENT_OR_MAGNITUDE`)
  — honest: nobody measured the edge.
- The position node's `defeater_refs` names the counter node.
- The honesty drawer additionally carries the larger OWED-CHECK-UNEXECUTED
  record set (28 rows — the two-node debate honestly owes more checks).

## 8 · Acknowledged deferrals

1. **S08 packet/independence-receipt recording** — blocked by DR-141(4)'s
   Q42 refusal law; parked as QUESTIONS FOR V 2 (the working implementation
   existed and was reverted; RED 3 is its real output).
2. **Attack-edge magnitude** — stays UNKNOWN until an evidence-verifier organ
   measures edges; no invented number (AC-76).
3. **CROSS-loop composition** (planBlindVerification, symmetry, objections,
   maker-availability caps) — unchanged, later runner composition per the
   audit inventory.
4. **`--serve` live smoke in-sandbox** — the real CLIs (codex binary,
   claude keychain) are not reachable from this sandbox; the dry ceremony
   (both maker transports doubled) is fully green, argument parsing tests
   green, and FAIR-02 proved the live relay pattern. The orchestrator runs
   the live gate.
5. **Q37/Q56 recording gaps, Docker/Hatchet (DR-121)** — untouched, as
   ruled.

## 9 · QUESTIONS FOR V

1. **Rule the `scoringOperator` deployment register row** (DR-074 mint; value
   yours at DR-023). Recommendation: **`accumulate`** for the acceptance
   register — for the FAIR-01 debate shape the two operators provably yield
   identical strengths (§5), so this ruling only fixes the recorded receipt
   vocabulary; the full DR-023 sitting can revise at a later register
   version. On your word the seed gains
   `{ rowKey: "scoringOperator", value: "...", sourceRef: "acceptance:DR-14x:V-approved" }`
   and the live gate needs one fresh acceptance data directory.
2. **The Q42 recording migration (when you want the blinding ATTESTED, not
   just true).** Today the counter's independence is proven by per-artifact
   maker lineage; the S08 blinded-packet + independence-receipt attestation
   cannot be recorded because DR-141(4) rules that any run carrying critique
   packets refuses at terminal (`critic_agrees` has no recorded shape —
   `packages/battery/src/terminal.ts:601-618`). If you rule where the
   critic's agreement verdict is recorded (a P17 migration + the Q42
   evaluator reading it), the packet/receipt leg from RED 3 can be restored
   verbatim. No urgency for FAIR-01's gate; it hardens the record.
3. **Confirm the counter-leg design** (one word): OpenAI judges the position,
   Anthropic judges the counter-position as a first-class defeater node with
   an attack edge, independence by recorded maker lineage — the ceremony
   refuses any settled debate that is not multi-node multi-maker.

## 10 · Session accounting

Progress log: `handoffs/FAIR-01-progress.log` (one ISO line per major step,
including the Q42 collision and the pivot). Register content unchanged in
this diff — the standing `.pgdata` remains seed-compatible until the
scoringOperator ruling lands. Git untouched.

---

# ADDENDUM — DR-144 seed micro-round (same worker, same-session law)

V ruled QUESTIONS FOR V #1 → **DR-144**: `scoringOperator = "accumulate"`,
provenance `acceptance:DR-144:V-approved`, provisional pending the DR-023
sitting. QUESTIONS FOR V #2 (the Q42/critique-packet recording migration)
stands as filed under DR-141(4) — no action taken. Grok's review of the main
delta runs concurrently; this addendum touches ONLY the documented seed edit
and its tests.

## Seed edit applied (byte-faithful to handoff §5)

- `acceptance/seed-register.ts`: new
  `ACCEPTANCE_SCORING_OPERATOR_SOURCE_REF = "acceptance:DR-144:V-approved"`
  and the ruled row
  `{ rowKey: "scoringOperator", value: "accumulate", sourceRef: ACCEPTANCE_SCORING_OPERATOR_SOURCE_REF }`
  in `buildAcceptanceRegisterRows` — nothing else seeded, no neighbouring
  value invented.
- `acceptance/seed-register.test.ts`: byte-faithful value + DR-144 provenance
  assertions (and the row joins the own-provenance exemption list).
- `acceptance/ceremony.test.ts`: (i) the main ceremony now asserts the
  PERSISTED row (`value_json #>> '{}' = 'accumulate'`,
  `source_ref = 'acceptance:DR-144:V-approved'`) across the double-seed
  idempotency check, and the stale test-layer INSERT is gone (the seed now
  supplies the ruled row); (ii) the unruled-state test is reworked: a seeded
  acceptance register can no longer produce the unruled state (append-only
  rows + DR-144), so the typed guard is proven at the composition seam — a
  `WalkingSkeletonRunner` wired for the fair debate WITHOUT the ruled row
  rejects `SCORING_OPERATOR_UNRESOLVED` before any claim or model call
  (refusing provider doubles prove no call was made).
- `acceptance/README.md`: the "unruled value" paragraph updated to the DR-144
  ruling + the fresh-`.pgdata` note. No other surface touched.

## RED → GREEN (real output)

RED (seed test before the seed row existed):

```
 ❯ acceptance/seed-register.test.ts:49:35
+ Received:
undefined
    expect(byKey.scoringOperator).toEqual({
      rowKey: "scoringOperator",
      value: "accumulate",
```

GREEN (after the seed edit, full verification this session):

```
acceptance suite:                                     Tests  34 passed (34)
tests/unit + tests/integration + tests/architecture:  Tests  324 passed (324)
tsc --noEmit                                          (clean)
audit:architecture  { "edgeRowsChecked": 27, "violations": [] }
audit:source        { "blocking": [] }
```

## FINAL live ceremony command (orchestrator)

Preconditions:
1. **Fresh acceptance data directory** — the seed's row count changed, so a
   standing `.pgdata` sealed before DR-144 stops loudly with
   `ACCEPTANCE_REGISTER_VERSION_CONFLICT`. Stop the standing stack (DB 55432
   / API 8790 / shim 8791) and remove `DebateAI-V3/acceptance/.pgdata`.
2. Plain terminal: claude CLI keychain login live (`claude /login` if
   expired); codex CLI as for ACC-01.
3. Web dev server on :3000 pointed at the acceptance API
   (`NEXT_PUBLIC_API_BASE=http://127.0.0.1:8790`,
   `DIALECTICAL_API_BASE=http://127.0.0.1:8790`).

```bash
cd DebateAI-V3
ACCEPTANCE_DB_PORT=55432 \
ACCEPTANCE_API_HOST=127.0.0.1 \
ACCEPTANCE_API_PORT=8790 \
ACCEPTANCE_SHIM_PORT=8791 \
ACCEPTANCE_STRANGER_SAMPLE_RATE=1 \
ACCEPTANCE_BATTERY_VERSION=acceptance-v1 \
ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:standing-watch \
./node_modules/.bin/tsx acceptance/run-acceptance.ts --token <ui-token> --serve
```

Expected: both makers genuinely called (judge = OpenAI, `JUDGE:critic` =
Anthropic via the handshaken relay), the run settles, the fair-debate gate
prints `FAIR-01 graph: 2 nodes · 1 attack edge(s)` and
`FAIR-01 makers: Anthropic, OpenAI`, and the debate renders at
`http://localhost:3000/debate/<run-id>` with the defeater node attacking the
position. Any shortfall is a typed loud `FAIR_DEBATE_*` /
`SCORING_OPERATOR_UNRESOLVED` / `COMPOSITION_UNRESOLVED` stop — never a
quietly-served unfair debate.
