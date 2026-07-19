# Refactorization Plan — The Final Stretch (v1)

```yaml
document_id: refactor-plan-final-stretch-v1
date: 2026-07-19
method: Mixture-of-Agents — 4 PoV researchers + GREEN team + RED team + impartial judge (7 agents, all Claude Fable 5, read-only against the live repo)
code_anchor: branch lane/roadmap-p0-p3 = origin/dev @ a320b63 (dynamic perspectives + crash-loop fixes + honest failed status, landed 2026-07-18)
inputs_reconciled:
  - .hermes/planning/truth-seeking/FinalPlan.md   (C4 honesty-layer mission, rev 2)
  - .hermes/prompts/claude-truth-seeking-consolidated-packet-v1.md  (upstream research of record)
status: plan for V approval — no implementation authorized by this document
lineage_disclosure: all seven agents share one lineage (Fable). Role separation was enforced
  (researchers/GREEN/RED never judged; judge spot-verified evidence in the repo first-hand),
  but per project doctrine this is independent=false until a different-lineage reviewer passes over it.
ownership_note: FinalPlan's "all coding = Codex" rule predates Claude routing; ownership is
  re-declared per wave by V (open question Q5).
```

---

## 1. Verdict on the algorithm as-it-is (impartial judge)

> The engine is **two systems of unequal maturity sharing one pipeline**. The honesty substrate is genuinely excellent: deterministic versioned reducer, contract-hashed judge artifacts, provenance-authenticated lifecycle decisions, semantics registry with pinning, and a complete (dark) suppression layer — all verified live. The generation loop, by contrast, is still one-shot: creation picks 2–5 lenses (the only live adaptivity), each `v2_pov` job materializes a fixed-shape subtree, and nothing ever adds work afterward. The signal machinery runs end-to-end but is consumed nowhere. The gravest defect is the **verdict**: protocol analysis runs exactly once, at synthesis, *before any score exists*, over all-default 0.5 taus, under semantics where the root receives only support edges — root strength lands ~0.93–0.97 and "supported" every time, never recomputed. Two fresh regressions ride the 2026-07-18 landing (regeneration destroys dynamic lens identity; the only user-facing "expansion" destructively regenerates via the v1 pipeline). Failure handling is bimodal (infinite retry or whole-debate kill). **The foundation deserves the final stretch; the loop and the verdict path must be re-sequenced before any adaptive spawning is wired.**

RED's summary of the stakes, judge-endorsed: *if adaptive expansion is wired on top of today's verdict path, the engine spends more money elaborating trees whose verdict was predetermined by graph shape — the opposite of the truth-seeking mission, discoverable by any user who notices every debate is "Strongly supported."*

## 2. What must NOT break (GREEN keep-list, judge-verified)

1. **node_type cycling invariant** — dynamic perspectives must keep reusing legacy POV node_types (identity in `label`, never the type): the QBAF adapter orphans unknown types from scoring in both semantics paths (`dialectical_v2.py:90-98`).
2. **Deterministic, provider-free creation** — `create_dialectical_debate` is synchronous; never block it on an LLM.
3. **Count-agnostic synthesis gating** — works for any N; no duplicate synthesis (`dialectical_v2.py:962-972, 1301-1310`).
4. **Best-effort try/except discipline** — protocol init/analysis/evidence extraction never fail creation, completion, or synthesis persistence.
5. **Score provenance stamping** — `final_score_source='deterministic_reducer'`, reducer/rubric versions, `contract_hash` pinning, semantics registry raising on unknown IDs.
6. **Worker resilience invariants** — 403-identity re-register (capped), bounded `/complete` retry, non-empty `/fail` reasons, `/fail` transport errors never kill the loop (regression suite `test_crashloop_recovery.py`).
7. **Honest status derivation** — terminal `failed` (never lying `generating`), SSR pending-not-fatal, data-driven N-branch labels.
8. **Verdict honesty laws** — `verdictBand` sole wire key, band always beside real strength in basis, declared-not-learned versioned thresholds, never-raises degradation.

**Underrated assets to exploit** (GREEN, judge-confirmed): `adaptive_depth_dry_run`/`select_depth_pressure` already compute a ranked expansion plan with zero side effects (`reducer.py:30-83`); the evidence-gate **shadow mode** has been silently accumulating before/after flip data; lifecycle decision records already persist full audit lineage — real spawning is a one-field change on an audited record; one classifier serves both lens choice and scoring (coherence property); the DF-QuAD core is citable published semantics with AST-enforced purity.

## 3. What gates the stretch (RED, judge-filtered to real blockers)

| # | Blocker (all repo-verified) | Evidence |
|---|---|---|
| B1 | **Verdict is a frozen topology artifact** — one protocol-analysis call site, pre-score, default taus, support-only root → "supported" ~always, never recomputed | dialectical_v2.py:1020 vs :1028-1030; debate_adapter.py:20,40-64; runner.py:172-186 |
| B2 | **Failure lifecycle is bimodal** — non-retryable leaf failure kills the whole debate; retryable loops forever (`attempts` written at orchestrator.py:901, read nowhere) | orchestrator.py:1200-1221 |
| B3 | **Fresh regression: regeneration destroys dynamic lens identity** — regen maps node_type→legacy label, materialize overwrites claim | orchestrator.py:1259-1261 + dialectical_v2.py:903 |
| B4 | **Fresh regression: "expand" is destructive v1 regeneration** — approved expand items re-generate the node, stale the subtree, can route a v2 debate through v1 synthesize | api/scoring.py:361-372; orchestrator.py:1262-1292, 1171-1188 |
| B5 | **Stopping can never be written on the live path** — `_ARGUMENT_NODE_TYPES` uses `'ROOT'` but the real type is `'ROOT_CLAIM'`; authentication gate essentially unsatisfiable with `DIALECTICAL_EVIDENCE_VERIFICATION` off | scoring_completion_lifecycle.py:24,34-57 |
| B6 | **Scoring is browser-pull-driven** — headless debates never get scores; nothing re-runs analysis after scores land | scoring/jobs.py:179-226; api/scoring.py:189 |

**Do-not-build-on list** (RED, judge-endorsed): the one-shot verdict path; `regenerate_node` as an expansion vehicle; the current fail/retry lifecycle; the depth-capped `spawn_child_argument_jobs` seam (v2 trees already exceed its max_depth); `classify_claim_type` as the *sole* adaptivity driver (mixed-collapse); the mis-keyed lifecycle reevaluation layer as-is.

Severity corrections by the judge: the evidence gate's empirical-only eligibility is **decided FinalPlan law** (G-D is V's gate), not a bug; the always-supported banner is dark by default — it poisons the payload and any future flip, not today's screen.

## 4. FinalPlan reconciliation (judge read all 642 lines, spot-verified anchors)

**Done / landed:** T1 (gate generalized to branch containers), T2 (semantics registry + stamping + convergence guard), T3 (df-quad-v2-lens-lift opt-in adapter), T4 (semantics in verdict basis), T5 (evidence_presence wiring), T6 (empirical-only gate + shadow + parity), T7 (suppression UI behind flag), T8 (stopping_reason drawer line). Beyond-plan: dynamic perspectives (default ON), crash-loop hardening, honest terminal `failed`.

**Obsolete / superseded:** the §2.2 non-goals "no dynamic lens types" and "no ExplorationPolicy wiring" (now the mission); the all-coding-is-Codex ownership rule (re-declare per wave); the §5 file-ownership map and H4/G5/H6 chain (mission closed); §0 anchor line numbers (drifted — never cite them again).

**Still binding for every wave below:**
- `verdictBand` is the sole band wire key; `suppressed` served only with the gate flag ON.
- Additive-only persistence: no artifact rewrites, no stored-output migrations, persisted LLM text never mutated, no product-data deletion without V.
- No fake runtime data; unknown claim type never suppressed or fabricated; `verificationStatus` never decides gate eligibility.
- **QBAF stays advisory**; any authority increase or default-semantics flip is V gate **G-B** with ZEN-TS-05/06 green.
- **G-A** (evidence gate default ON) and **G-D** (broaden eligibility) are V decisions fed by shadow telemetry — never silently flipped.
- Pinning discipline: stored analyses keep their stamp; missing stamp = df-quad-v1; convergence never compares across semantics.
- ZEN-TS-05: explicit edge-tuple assertions never replaced by fingerprint-only checks.
- Single verdict derivation point in `debate_to_dict`; synthesis `verdict_gate` mirrors it.
- Declared-not-learned thresholds stay versioned.

## 5. Judge rulings on contested points

1. **"Wiring job" (GREEN/Gen-Loop) vs "no mechanism exists" (RED)?** Both half-right — RED on facts (no safe spawn primitive exists today), Gen-Loop on plan (decision/persistence/job machinery is real). A new `v2_expand` job type + dispatcher is modest, well-scoped work — not greenfield, not mere wiring.
2. **Expansion first vs verdict truth first?** **Verdict inputs first.** Spawning onto predetermined verdicts is the anti-mission. Order: signals → primitive → dispatcher.
3. **May scalar thresholds steer expansion?** **No — categorical-only** until calibrated (calibration.py proves no ground truth exists). Scalar-grounded decisions annotate; only categorical-grounded decisions (evidence status, fatal flags, entailment, claim-type evidence requirements) may spawn — enforced by a machine-checkable `signal_class` field.
4. **Flip the honesty flags now?** **No.** G-A requires shadow evidence + V decision; flipping the banner before tau-coverage gating would render near-constant "Supported" — a product-honesty regression. Flips move to the final wave.
5. **Full reliability substrate before any adaptive wiring?** **Partially.** max_attempts, node-scoped failure, and capacity admission are hard prerequisites of the dispatcher; the reaper/ledger/logging/SSE-rebuild/Windows harness are required before soak but may run in parallel.

## 6. The waves

### W0 — Stabilize the 2026-07-18 landing *(first, small, independently revertible)*
**Goal:** dynamic-lens identity and lifecycle vocabulary survive every existing affordance; no fresh regression left live.
**Steps:** fix `regenerate_node` to derive role/label from the node's actual claim (not the legacy `V2_POV_ROLES` map) and make `materialize_pov_branch` never overwrite an existing dynamic label (B3); block or honestly relabel adaptive-depth "expand" approvals away from destructive regen (B4); fix `_ARGUMENT_NODE_TYPES` `'ROOT'` → `'ROOT_CLAIM'` or document root exclusion with a test (B5, cheap half).
**Acceptance:** regenerating a "Mechanism POV" branch preserves label+lens through completion; approved "expand" never silently wipes a subtree; lifecycle eligibility test covers the real root type.
**Depends on:** nothing.

### W1 — Bounded failure lifecycle
**Goal:** poison jobs terminate; one leaf failure degrades the debate instead of killing it.
**Steps:** read `job.attempts` in `fail_job`/claim with a config budget (~4); node-scoped terminal failure for node-scoped job types (`node.status='failed'`, path abandoned, `stopping_reason='generation_exhausted'`); debate-level `failed` reserved for root/synthesize jobs; update `effective_debate_status` + web branch rendering + tests in lockstep. Count timeout-class failures generously (transient-outage risk).
**Acceptance:** a retryable-failing job goes terminal at budget with no further requeue; a 3-lens debate with 1 poisoned lens serializes complete-with-failed-branch, not debate-`failed`.
**Depends on:** W0 (shares the fail_job/status contract).

### W2 — Honest verdict inputs *(the pivot of the stretch)*
**Goal:** scores exist before verdict-bearing analysis; verdict bands can no longer be topology artifacts.
**Steps:** queue per-node/per-branch scoring at v2 completion via an **internal trigger** (not browser polling — B6); re-run protocol analysis from the scoring-completion tail; add `tauCoverage` to qbaf_output; `verdict_summary` returns an `insufficient_scoring` basis below coverage threshold; semantics stay pinned v1 (G-B untouched), all changes additive.
**Acceptance:** a scored v2 debate's latest protocol run shows majority `tauSources='judge_strength'`; an unscored debate serves `insufficient_scoring` instead of "supported"; stored artifacts unrewritten; bounded scoring timeout degrades to today's behavior.
**Depends on:** W1 (scoring jobs need bounded failure). Binding: `verdictBand` key, additive fields, single derivation point.

### W3 — Expansion primitive + quiescence gate
**Goal:** a safe single-node work unit exists and synthesis waits on the whole tree.
**Steps:** new **`v2_expand`** job type — prompt branch (parent argument + lens + decision reason; single `{title, content}` contract), completion calls `create_completed_node` once + evidence extraction, **never touches the parent claim** (avoids the :903 corruption); worker `parse_result` whitelist entry; generalize `pending_branch_containers` → whole-tree `pending_generation_nodes` used at queue time AND re-checked in `persist_v2_synthesis`; retire `swarm_dispatch` or re-point it at the node-first helper so exactly one spawn path exists.
**Acceptance:** a manually queued `v2_expand` against a PRO node adds exactly one child through the real worker path, parent unchanged; a pending depth-2 node blocks `v2_synthesize` at both gate sites; flag-off debates byte-identical.
**Depends on:** W0 (lens identity), W1 (node-scoped failure for expansion children).

### W4 — Adaptive dispatcher *(flag-gated, categorical-only)*
**Goal:** authenticated lifecycle decisions spawn bounded real work; stopping becomes first-class.
**Steps:** `signal_class` on `ExpansionDecision`; `expansion_dispatch` called after `reevaluate_lifecycle_after_scoring_completion` behind `DIALECTICAL_ADAPTIVE_EXPANSION` (**default OFF**, same landing pattern as dynamic perspectives); node-first → `queue_v2_job` → write real `child_spawn_count` (ending the honest-but-inert 0); budgets (`max_rounds`, per-node, global) + `capable_online_workers` admission with `deferred_no_capacity`; `v2_expand` completion wakes a re-score (closing generate→score→decide→spawn→re-score); `stopped_because` recorded in `debate.config` and fed to the synthesis prompt; decide the `DIALECTICAL_EVIDENCE_VERIFICATION` interlock explicitly (V question Q1).
**Acceptance:** flag off — scoring byte-identical, `child_spawn_count` stays 0. Flag on — categorical-grounded challenge/seek_evidence spawn bounded children, idempotent on replay; scalar-only decisions never spawn; completed debates carry non-empty `stopped_because`.
**Depends on:** W2 (real signals), W3 (primitive + gate). Binding: no scalar authority without explicit `config_override` provenance.

### W5 — Transparency serialization + ops floor *(parallelizable pair)*
**Goal:** the product can say **why it grew, why it stopped, what failed** — and the loop survives restarts.
**Steps (transparency):** serialize `lifecycle_decisions` (bounded: latest per node); persist + serialize perspective `derivation` (claim_type + markers captured at creation — currently discarded at `dialectical_v2.py:166`); debate-level `completion {state, reason_code, human_reason}` derived from the terminal job's non-empty fail reason; shared reason-code→human-copy map (no more raw `"score_stale; evidence_stale"`); drawer "Path decision" for ALL decided nodes with annotate-not-cause phrasing while spawns are gated.
**Steps (ops floor):** coordinator reaper lifespan task with conditional-UPDATE guards; single-instance guard (the :8000-orphan/:8010 incident class); job transition ledger + `/api/ops/jobs`; SSE snapshot-on-subscribe from DB; structured JSON logs on hot paths; Windows-clean test entrypoint (guard `SIGALRM`, cross-platform test driver — also retires 194 of the 196 known heavy-sweep failures).
**Acceptance:** a failed debate's payload carries `completion.human_reason`; a new debate's payload carries `derivation` matching rendered branches; with zero polling workers an expired claim requeues within one reaper interval; `make test` runs on the Windows dev machine.
**Depends on:** W4 for causal phrasing; ops-floor half may start any time after W1.

### W6 — V-gated flips + contract shrink + soak
**Goal:** the honesty layer goes visible and **depth becomes an output of the loop**, on evidence.
**Steps:** run the shadow-window/soak review with V; flip `NEXT_PUBLIC_VERDICT_FIRST_UI` and `DIALECTICAL_VERDICT_EVIDENCE_GATE` (G-A) with the P10 manual checklist + updated source-tests; present mixed-collapse telemetry for G-D; after adaptive soak, shrink the `v2_pov` contract to POV + strongest pro/con (nested layer comes from expansion rounds instead) and flip `DIALECTICAL_ADAPTIVE_EXPANSION` default ON, with serializer/web verification for old-vs-new tree shapes.
**Acceptance:** default build renders the banner with `insufficient_scoring` honest on unscored debates; an evidence-less empirical claim shows a withheld verdict; **depth varies with signal pressure across debates**; every flip recorded as a V decision.
**Depends on:** W2 (coverage gating), W4 (soak data), W5 (transparency + checklist). G-A/G-B/G-D remain V's calls.

## 7. Priorities, ranked (judge)

1. **W0** — live regressions one click from corrupting the just-shipped product truth; cheapest, highest-certainty; everything later builds on durable lens identity.
2. **W1** — adaptive spawning multiplies every failure path; partial-result semantics is a hard prerequisite of an adaptive tree.
3. **W2** — today's verdict is fabricated confidence; every downstream feature would consume it. *The pivot.*
4. **W3** — no safe expansion primitive exists; one node per job + depth-aware gate is the minimal mechanism everything adaptive needs.
5. **W4** — turns the authenticated annotate-only ledger into signal-driven growth without inventing a second authority.
6. **W5 (transparency)** — decision provenance currently dies one layer below the serializer; required before any honesty-flag flip can be defended.
7. **W5 (ops floor)** — required before soak; parallelizable.
8. **W6** — the payoff, sequenced last, on evidence.

## 8. Open questions for V

1. **`DIALECTICAL_EVIDENCE_VERIFICATION` default:** categorical evidence signals (the only steer-eligible class) need a real verifier but add provider cost/latency per scoring run. Flip it on as a W4 precondition, or let expansion steer initially on fatal-flags/claim-type predicates only?
2. **Expansion budget economics:** acceptable per-debate ceiling for expansion rounds and full-debate re-scores? Numbers needed for W4's config, not adjectives. *(FinalPlan Q2 residual.)*
3. **Verdict-first UI timing:** keep the banner dark until W2's `insufficient_scoring` gating lands (judge-recommended), or accept an interim internal-dogfooding flip with the current near-constant "supported" band?
4. **G-D evidence ruling:** mixed-collapse means most realistic empirical topics escape the empirical-only gate. When shadow telemetry confirms it, broaden eligibility (+causal, +mixed-with-empirical-marker) or sharpen the classifier first?
5. **Ownership routing:** FinalPlan's "all coding = Codex" predates Claude routing. Confirm per-wave ownership (and whether the Kanban/Heartbeat chain applies per wave) before W0 starts.

## 9. One-sentence summary

Stabilize what just shipped, bound the failure paths, make the verdict honest before making the tree adaptive, then let authenticated categorical signals grow and stop the debate — and only then turn the honesty lights on, with V holding every flip.
