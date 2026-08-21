# GROK REVIEW: FAIR-01 · rev 1 (sole review lens · DR-140)

**Verdict: APPROVED**

Independent Grok seat review of ticket `t_e8c76da2` (status `review`, assignee
`claude-worker`) under mission PROG-V3-R1 / DR-140 lane: Claude worker coded;
this seat is the review gate only. Board was **not** mutated. Git history was
**not** written. Sole write is this file.

V's requirement treated as law: a real debate must have **MORE THAN ONE NODE**
and **MORE THAN ONE MODEL** — verified against the persisted record and the
run-level fair-debate gate, not hand-waved.

## Context consulted

| Source | What was taken as law |
|---|---|
| Ticket `t_e8c76da2` body | Settled acceptance debate with >1 first-class graph node (position + genuine counter) and >1 model maker (FAIR-02 Anthropic relay + OpenAI); honest lineage; rendered at `/debate/<id>`. Ship shipped machinery only — no new organs, no fabricated nodes. DONE WHEN = Grok greenlight **and** orchestrator-run live ceremony. |
| Ticket comments | Orchestrator lane-cut (DR-140). Worker READY FOR PEER REVIEW: two-maker two-node debate; JUDGE:critic; defeater+attack UNKNOWN magnitude; fair-debate gate; 324+34 suites green claimed; QFV on scoringOperator + Q42 migration. |
| Handoff `handoffs/FAIR-01-claude-handoff.md` | Design (OpenAI position / Anthropic counter via same JUDGE organ), inventory, RED→GREEN diary (incl. Q42 collision pivot), residual live-CLI deferral, QUESTIONS FOR V (handoff still frames scoringOperator as unruled — superseded mid-review by concurrent DR-144 seed). |
| Ledger DR-139..DR-145 | DR-139 terminal evaluator; DR-140 roster+fair-debate; DR-141 Q42 park; DR-142 normative map; DR-143 run-level maker law / handshake; **DR-144 `scoringOperator = accumulate`**; DR-145 UI (out of FAIR-01 scope). |
| `git status` delta | Core FAIR-01: `apps/runner/src/index.ts` critic leg; `packages/judgement` `claimClassificationLine`; `acceptance/fair-debate.ts` + ceremony/main/run-acceptance wiring; orphan-audit + architecture expectations. Wider dirty tree holds ACC-01/TERM-01/FAIR-02 seats — not silent FAIR-01 expansion. Concurrent micro-round landed DR-144 seed in `acceptance/seed-register.ts` (+ ceremony test rewrite for the now-ruled row). |

## Independent re-runs (after SysV shared-memory sweep)

| Suite | This-seat result |
|---|---|
| SysV `ipcs`/`ipcrm` sweep | Residual segment `m 15138816` held (`ipcrm` Invalid argument — same class as prior ACC-01 standing PG). Suite runs used separate embedded PG ports and completed clean |
| `vitest run tests/unit tests/architecture` | **45 files / 272 tests GREEN** |
| `vitest run tests/integration` (embedded PG) | **7 files / 52 tests GREEN** |
| Combined unit+int+arch | **52 files / 324 tests GREEN** (matches handoff claim) |
| `vitest run --config acceptance/vitest.config.ts` (final, post DR-144 seed + ceremony rewrite) | **9 files / 34 tests GREEN** (incl. fair-debate 6/6, ceremony 2/2 with dual-maker dry path, seed DR-144 pin) |
| `pnpm run typecheck` (root `tsc --noEmit`) | clean |
| `tsc --noEmit -p acceptance` | **FAILS** — see ADVISORY #1 (`independenceStatus`) |
| `pnpm run audit:architecture` | `edgeRowsChecked: 27`, `violations: []` |
| `pnpm run audit:source` | `blocking: []` |

Evidence captures live only in private reviewer scratch (`fair01-*.log`,
`fair01-summary.txt`, `fair01-review-scope.txt`). Live dual-maker ceremony
against a logged-in Claude CLI was **not** run here (orchestrator-owned
post-login per ticket DONE WHEN + handoff §8.4).

**Mid-review honesty:** first acceptance pass (pre concurrent seed rewrite)
showed ceremony RED: unruled-operator test completed instead of refusing
(because DR-144 seed had landed) and the dual-maker path hit
`PROVIDER_CALL_FAILED` (doubles exhausted by the first test). After the
concurrent ceremony rewrite (composition-level unruled guard + DR-144 seed
assert), full acceptance re-ran **34/34 GREEN**. Product design under review
is that post-seed state.

## Per-dimension verdict

### (1) DR-115 — no fabrication; real Anthropic critic; per-artifact lineage never blended — **PASS**

- Critic is a **real second `Judge`** over a second `ProviderGateway`, not a
  synthetic node (`apps/runner/src/index.ts:207–208`, `:435–467`). Call site
  is exactly `JUDGE:critic` (`:459`).
- Acceptance composition root builds the Anthropic gateway from the ruled
  provider set with **CLI-reported model id** and maker `Anthropic`
  (`acceptance/main.ts:154–159,201–207`); ceremony boots the real FAIR-02
  claude relay after handshake (`acceptance/run-acceptance.ts:132–148`).
- Counter enters the graph only via shipped `GraphWriter.addNode` +
  `addEdge` inside `withGraphWrite`, provenance = the critic's real
  `counterJudged.provenanceRef` (`apps/runner/src/index.ts:485–525`) — no
  fabricated node/edge ids.
- Edge magnitude is honestly **UNKNOWN** / `strength: null` /
  `strengthSource: "EVIDENCE_VERIFIER"` (`:510–522`) — mirrors S07
  `spawnPendingChild` defeater edge shape
  (`packages/graph/src/index.ts:382–395`); no invented edge number (AC-76).
- Strength lineage maps **per node id** to that node's own reduced
  judgement + provenance; unmapped node → typed `STRENGTH_LINEAGE_UNRESOLVED`
  (`apps/runner/src/index.ts:603–624`). Ceremony asserts
  `strength.source_ref === node.provenance_ref` for both nodes and makers
  `["OpenAI","Anthropic"]` (`acceptance/ceremony.test.ts:327–352`).
- **Zero critique packets** on the fair path (DR-141(4) Q42 park is
  respected — no S08 packet organs called from the runner; ceremony
  `critique_packet` count = 0 at `:360–368`). Independence is proven from
  recorded maker lineage, not invented receipt rows.
- Provider path stamps `maker` onto `ledger.raw_artifact` from gateway
  options (`packages/providers/src/index.ts` persist path) — never blended
  at write time.

### (2) Shipped machinery only; JUDGE contract surface; GraphWriter/S07 shapes — **PASS** (see ADVISORY #2)

- No new engine organ package. Critic reuses shipped `Judge` +
  `GraphWriter.addNode`/`addEdge`/`addStrangerRestatement` +
  `JudgementRepository.recordReduced` + shipped `resolveScoringOperator`
  (`apps/runner/src/index.ts:25,485–574`).
- Optional `claimClassificationLine` on `JudgeInput` defaults to
  `questionLine` — position path byte-identical when unset
  (`packages/judgement/src/index.ts:34–41,64–66,114–116`). System prompt
  template string is not parameterized by the classification line (user
  content stays `questionLine`).
- S07 edge shape mirrored: `polarity: "attack"`, `kind: "rebutting"`,
  `magnitudeStatus: "UNKNOWN"`, `strengthSource: "EVIDENCE_VERIFIER"`,
  `childKind: "defeater"`, `explorationDecision: "challenge"`,
  `generationStatus: "complete"` (artifact already exists — correct
  vs pending spawn).
- Handoff design call against inventing `decide()` signals is sound: no
  fabricated battery signals.

### (3) AC-76 / DR-144 scoringOperator — **PASS** (seed present)

- Runner refuses critique composition without the row **before any claim /
  model call** (`apps/runner/src/index.ts:290–298`); arrow-bearing path
  re-checks and resolves via shipped `resolveScoringOperator` with
  `suppliedBy` recorded (`:563–581`). Ceremony proves the unruled
  composition guard with a refusing provider (`acceptance/ceremony.test.ts:116–183`).
- **DR-144 landed** (concurrent seed micro-round, observed this seat):
  `acceptance/seed-register.ts:18–23,168` seeds
  `{ rowKey: "scoringOperator", value: "accumulate", sourceRef:
  "acceptance:DR-144:V-approved" }`. Ceremony asserts the persisted row
  (`acceptance/ceremony.test.ts:198–204`). Seed unit pins provenance
  (`acceptance/seed-register.test.ts:46–54`).
- No invented operator literal in product code; value rides the register.

### (4) Fair-debate gate reads back from persisted settled state — **PASS**

- Pure core `evaluateFairDebate` enforces: nodes ≥ 2; every node has
  provenanceRef + maker + modelId; distinct makers ≥ 2; ≥1 in-graph
  attack edge; ≥1 **cross-maker** attack edge
  (`acceptance/fair-debate.ts:51–99`) with typed codes
  `FAIR_DEBATE_NODE_COUNT_UNSATISFIED` /
  `LINEAGE_MISSING` / `MAKER_COUNT_UNSATISFIED` /
  `COUNTER_EDGE_MISSING` / `COUNTER_NOT_INDEPENDENT`.
- Imperative shell `readFairDebateEvidence` is **SELECT-only** over
  `core.node ⟕ ledger.raw_artifact` and `core.edge` filtered by
  `run_id`, non-stale, `polarity='attack'`, `target_kind='NODE'`
  (`acceptance/fair-debate.ts:102–140`) — not in-memory runner values.
- Ceremony wires `assertFairDebate(pool, runId)` after settle
  (`acceptance/ceremony.test.ts:378–384`;
  `acceptance/run-acceptance.ts:176–179`). Six pure-core refusal tests
  green (`acceptance/fair-debate.test.ts`).

### (5) TDD RED→GREEN honesty + independent suite re-run — **PASS**

- Handoff pastes real RED: judgement classification-line failures; missing
  `fair-debate` module; Q42/`TERMINAL_ACTIVATION_UNRESOLVED` after
  recording an S08 packet (lawful pivot); battery census shift for
  two-node reality.
- This seat cannot re-run pre-implementation RED; **GREEN path re-verified**
  after SysV sweep: 324 product + 34 acceptance, audits clean (table above).
- Ceremony dry-run on real embedded PG asserts 2 nodes / 1 attack edge /
  OpenAI+Anthropic makers / per-node strength lineage / 1× `JUDGE:critic` /
  0 critique packets / fair-debate report / ACTIVE 32·INACTIVE 36·POLICY_BLOCKED 3
  with 28 owed-check rows — observed GREEN.

### (6) SOLID/DDD/pattern register + scope/git clean (V-gated) — **PASS** (see ADVISORY #1, #3)

- **P2**: pure `evaluateFairDebate` vs impure SQL reader.
- **P8**: acceptance composition root wires critic relay + optional
  scoringOperator; product runner has no acceptance mode branch.
- **P7**: counter node+edge in one `withGraphWrite` transaction.
- **P18 / DR-115**: absent lineage is typed refusal, never assumed
  independence.
- Scope matches ticket: runner critic leg, judgement classification seam,
  fair-debate gate, acceptance wiring/tests, orphan-audit attachment
  updates (`addEdge` / `resolveScoringOperator` attached; S08 packets stay
  neverCalled under DR-141(4)). Git dirty working tree only — no FAIR-01
  commits (V-gated).

## Findings

None **BLOCKING**.

1. **ADVISORY** — `acceptance/run-acceptance.ts:184` logs
   `fairDebate.independenceStatus`, but `FairDebateReport`
   (`acceptance/fair-debate.ts:43–49`) exposes only
   `independentAttackEdgeCount` (plus node/attack counts and
   `distinctMakers`). Root `pnpm typecheck` does **not** include
   `acceptance/` (`tsconfig.json` include list); `tsc -p acceptance`
   fails with **TS2339**. Runtime effect is cosmetic
   (`independence: undefined` on the ceremony console line) — the gate
   itself still runs `assertFairDebate` correctly at
   `run-acceptance.ts:179`. Fix: print
   `independentAttackEdgeCount` (or add a derived status string on the
   report). Prefer also wiring acceptance into CI typecheck so this class
   cannot slip past "tsc clean" claims.

2. **ADVISORY** — Handoff claims the judge prompt template is
   "byte-untouched (judge contract hash unchanged)". Relative to founding
   commit `f59aaf5`, `packages/judgement/src/index.ts` expands the system
   prompt to a full schema (shared dirty tree with prior ACC-01 seats) in
   addition to FAIR-01's `claimClassificationLine` seam. FAIR-01's own
   classification seam correctly leaves the template string independent of
   the classification line, and the acceptance seed recomputes
   `judgeContractHash` from shipped text so the register stays
   self-consistent. Not a fabrication defect; package the ACC-01 prompt
   expansion separately under V-gated commit so FAIR-01's contract claim
   is auditable.

3. **ADVISORY** — Handoff §5 / QUESTIONS FOR V #1 still frames
   `scoringOperator` as unruled and asks V to choose. **DR-144** (ledger)
   and the concurrent seed now rule and persist `accumulate` with
   provenance `acceptance:DR-144:V-approved`. Treat QFV #1 as closed by
   that ruling; live gate still needs a **fresh** `acceptance/.pgdata`
   after the register content change (conflict guard). Remaining open
   QFV is the DR-141(4) Q42 recording migration (parked correctly — not
   silently coded).

4. **ADVISORY** — Shared working tree still carries ACC-01 / TERM-01 /
   FAIR-02 / S14 surfaces beside FAIR-01. Not a FAIR-01 product defect;
   V-gated commit/PR packaging should separate or stack seats so the
   fair-debate delta stays reviewable.

## Residual honesty (non-blocking)

- Ticket DONE WHEN also requires an **orchestrator-run live** ceremony
  (real Claude CLI + codex CLI) and `:3000` multi-node render. This seat
  approves the **shipped critic leg + fair-debate gate + dry-run proof**
  on embedded PG with both maker transports doubled; live post-login
  remains orchestrator-owned (handoff §8.4; DR-121-r Docker/Hatchet still
  deferred).
- S08 blinded-packet + independence-receipt attestation stays parked under
  DR-141(4) — independence is proven from per-artifact maker lineage per
  DR-140(b)'s letter; that is lawful, not a silent downgrade of the gate.
- Attack-edge magnitude remains UNKNOWN until an evidence-verifier organ
  measures edges (AC-76 honest).

GROK REVIEW: APPROVED — FAIR-01
