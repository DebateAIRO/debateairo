# Review of claude-truth-seeking-consolidated-packet-v1

```yaml
document_id: grok-truth-seeking-packet-v1-ai-review
reviews: claude-truth-seeking-consolidated-packet-v1
date: 2026-07-09
reviewer_model: Grok 4.5 (xAI)
repo_access: yes
lineage_relative_to_authors: different
workspace: apps/dialectical-engine/ (imported app under debateairo)
method: packet read + 4 parallel repo scouts + direct file:line verification
status: independent review — not approval
audience: next LLM reviewer / implementer agent
```

---

## How to use this document

1. Treat the original packet as the claim set; this file is the **independent stance sheet**.
2. Prefer **CHALLENGE / MODIFY / DEFER / REJECT** over soft agreement — same-lineage blind spots are the point of this review.
3. Before implementing any slice, re-verify the cited file:line (paths relative to `apps/dialectical-engine/coordinator/` unless noted).
4. Human product decisions remain Q1–Q7; agents must not invent answers for them.
5. Companion human guide: `docs/reviews/2026-07-09-truth-seeking-packet-v1-human-guide.md`.

---

## A. Per-point stances (all 21)

Format: `ID: STANCE — rationale [verified: …]`

### Blueprint points (P01–P14)

**P01: CONFIRM** — Adaptive expansion is the right product doctrine; fixed 4-POV × nested pro/con ≈ 29 nodes is wired and cost-blind. Binding mods (seed floor, budgets-before-adaptivity, signals rank-not-shape until proven) are necessary, not optional. [verified: `services/dialectical_v2.py:54-59,786-862,1198-1215`]

**P02: MODIFY** — Direction correct, but classifier-as-lane-driver is too early even as “advisory routing.”  
**Replacement text:** “Claim-type classification is **display + logging only** until a labeled rephrase-consistency eval exists. Dynamic lens selection v1 uses a **fixed small seed set** (empirical/normative split or EIAC-style obligations) + optional human_question on `unknown`/`mixed`. Classifier output must not select budgets, required roles, or synthesis gates.”  
[verified: `scoring/normalizer.py:139-162,280-293` — strip + regex + `key_terms=[]`]

**P03: CONFIRM** — EIAC as prompt/display rubric only (no schema contract, no node_types, no edge semantics) is the only safe adoption. Stripping self-reported confidence from Calibration is mandatory. [verified: fixed contracts already calcify defaults — `validate_pov_contract` at `dialectical_v2.py:630-647`]

**P04: CONFIRM** — Ex-ante benefit gating is an oracle; reframe to caps + post-call pruning + mandatory cheap adversarial floor is correct. [verified: no budget object; `Job.attempts` only incremented `orchestrator.py:709`]

**P05: MODIFY** — Doctrine is sound; bootstrap rule needs a harder default.  
**Replacement:** “Unlabeled placeholder scores **must hard-block** graph-shape decisions (`expansion_blocked: placeholder_scores`). A labeled `provisional` tier may only **rank within an already-selected fixed seed floor**, never add/drop lanes or stop early. v1 independence/calibration planks are recording-only and must not appear in user-facing ‘protection’ copy.”  
[verified: `orchestrator.py:388-411` constant 0.5 feed; `ScoreSignal.from_scoring_payload` exists but unused by production path]

**P06: DEFER** — Lane router is the right *eventual* abstraction but blocked on: (a) D1 synthesis-gate fix, (b) real score feed, (c) classifier maturity (P02 mod), (d) C01 advisory scorecard. Shipping a 20-lane library now recreates fixed-POV rigidity at larger scale. First ship: routing **artifact schema** + 2–4 lanes max, no behavior change. [verified: `Node.node_type` `String(16)` — `models/entities.py:55`; do not overload with lane_id]

**P07: CONFIRM** — Safe subset first (boolean hard gates + lexicographic tiers, remove ÷cost, attempt caps, explicit `action_unavailable_reason`) is the only shippable form. Full 6-factor formula is false precision today. [verified: policy pure + tested `exploration/policy.py:136+`; **not** called from `complete_v2_worker_job`]

**P08: CONFIRM** — AND-gate + keyword skeptic must not gate production stop. Neutral labels (`converged` / `budget_limited`) + hard safety vs soft convergence split is right. [verified: `metareasoning/stopping.py:32-44`; skeptic phrases `debate/roster.py:41-46,125-134`]

**P09: MODIFY** — Independence must become load-bearing; family substring bucketing is still theater for positive confirmation.  
**Replacement for asymmetric-rule implementation site:** Introduce a **display confidence envelope** separate from reducer strength:  
`display_confidence = f(reducer_strength, independence_flag, evidence_state, calibration_coverage)`.  
Same-lineage judge may only lower the envelope (never raise). Served UI “confidence/band” reads the envelope; reducer arithmetic stays raw for audit. Do not invent a second truth score.  
[verified: lineage honest recording `scoring/lineage.py:18-89`; flag-off block `scoring/service.py:502`; family substrings include gpt/codex collapse]

**P10: CONFIRM** — Never emit supported/contradicted without fetched external sources; state-machine-only until then; latest-per-node rollup; soft cap when verifier not run. [verified: verifier flag-off, no production caller, `evidence_text` only in metadata ignored by prompt builder — `evidence/verification_evaluator.py:140-170`; any-contradicted-wins `:91-101`]

**P11: CONFIRM** — First-slice = input-ambiguity clarification as versioned new debate (STOP-STATE), not mid-graph oracle humans. Defeasible human nodes only for non-truth-apt value questions, and only later. [verified: no first-class human routing product surface found in V2 path]

**P12: CONFIRM** — Dim by strength only with honest labels; wire already-serialized `stopping_reason`; composable flags not frozen 9-enum. [verified: serialized `services/serialization.py:180-182`; **zero** web consumers of `stopping_reason`; dimming `web/lib/debateTreeUtils.ts:104-110`]

**P13: CONFIRM** — POV-as-SUPPORT is a real bias (~0.9375 mass from four τ=0.5 lenses). No-edge LENS **must** ship with effective-parent edge-lifting + `semantics_version` + golden no-severed-subtree test. CE-QArg deferred.  
**Packet correction:** R11 overstates “advisory only.” QBAF dialectical strengths already feed **verdict_summary / VerdictBanner** via protocol analysis — product-facing when UI flag on — while per-node cards still use reducer scores. Treat edge fix as user-visible correctness, not lab hygiene.  
[verified: `qbaf/debate_adapter.py:15-37`; protocol runner; cyclic hard-fail `qbaf/dfquad.py:135-139`]

**P14: CONFIRM** — Positive golden-set non-regression gate + dependency ordering (enabling before behavior) + CI maturity labels. First dynamic-lens slice = D1 gate fix, not “add a 5th POV.” [verified: repo already uses `bool_env("DIALECTICAL_*", False)` pattern]

### Claude proposals (C01–C07)

**C01: CONFIRM** — Eval harness is the dependency spine; demote to advisory per-stratum scorecard; hard-gate only resolvable-empirical; process metrics for normative. Without S0, adaptive work is unfalsifiable aesthetics. [verified: `evaluation/harness.py` math only; no labeled production suite]

**C02: DEFER** — EVOI sensitivity ranking is blocked on Q4 + cold-start fix + non-O(n²) path + C01 beat-balance proof. Do not schedule as a behavior driver this cycle. May keep as offline diagnostic once score-bearing graph exists. [verified: `metareasoning/node_selection.py:41-59` — sensitivity 0 when uncertainty band collapses]

**C03: DEFER** — Double-crux presupposes iterative multi-round loop production V2 does not have (single-shot `v2_pov` → synthesize). Advisory extractor only if Q7 is yes; otherwise park. Forced crux on normative/definitional is confabulation risk. [verified: V2 flow is fixed fanout + one synthesis job]

**C04: MODIFY** — Position-swap diagnostic + identity blinding: yes.  
**Reject default paraphraser harder:** remove from default path entirely (not only “behind NLI guard”) until C01 shows accuracy gain; structural verbosity caps only. Position-swap remains diagnostic-only (`position_sensitivity` into uncertainty), never auto-route. [verified: production judge path has no robust blinding layer found]

**C05: CONFIRM** — Ship measurement half now (append-only ledger + offline reports); defer all auto-actuation of weights/thresholds. Coverage honesty mandatory. [verified: `scoring/calibration.py:110-167` always `brier=None`, `no_ground_truth_outcomes`]

**C06: CONFIRM** — Two clocks (cheap standing reducer/QBAF state vs debounced LLM narrative); never feed synthesis back into expansion; uncalibrated banner. **Must pair with M1 hierarchical synthesis before relaxing node floor.** [verified: synthesis dumps all nodes + complete AgentRuns — `dialectical_v2.py:1086-1131`]

**C07: CONFIRM** — Offline read-only duplicate-audit only this cycle; never auto-merge; no tree→DAG migration. Harm is mostly dormant while QBAF is not driving expansion, but double-count risk becomes real if Q4 chooses score-bearing. [verified: EVIDENCE in `_NO_EDGE_TYPES`; QBAF still affects verdict surface]

---

## B. Decision-forcing answers (§9)

### 1. Verdict stress-test — point most needing harder than `adopt_modified`

**C02 → DEFER (borderline REJECT as a near-term architecture commitment).**

Case:
- Inputs required (`node.uncertainty`, meaningful τ, score-bearing loop) do not exist on the production path (R5, R7, R11-as-corrected).
- Sensitivity is zero exactly on the un-debated frontier it must rank.
- “Analytic gradient” overclaims; live code is clone-and-repropagate O(n²).
- Prioritizing high structural swing rewards well-placed false claims (verdict-swing ≠ truth).
- Packet already notes buildability is overstated; uniform `adopt_modified` launders a research idea into roadmap gravity.

If forced to keep C02 in the packet, rename verdict to **`research_only_defer`** and remove it from any sequencing dependency of S0–S6.

**Runner-up for harder verdict: C03** (same substrate: no iterative loop).

### 2. Q4 recommendation — score-bearing QBAF vs advisory-forever

**Recommendation: hybrid, staged — not advisory-forever, not score-bearing-now.**

| Layer | Decision |
|-------|----------|
| **Expansion / stop / VOI** | QBAF remains **non-authoritative** until C01 shows DF-QuAD-driven selection beats fixed-tree + simple balance on held-out resolvable claims |
| **Verdict / dialecticalStrength** | Already product-facing → treat as **score-bearing for display** and fix P13 bias ASAP (semantics_version, edge-lifting) |
| **Per-node STR cards** | Stay on **deterministic reducer** |
| **Migration risk control** | Pin `semantics_version` per debate; never silent recompute of historical verdicts; dual-run shadow mode for N slices |

Rationale: calling QBAF “advisory forever” is false today (verdict path). Calling it the expansion brain now is unsafe (placeholder τ, POV support bias, no uncertainty). Honest path = fix graph truth (P13) → measure (C01) → only then let sensitivity rank spend.

### 3. Missing failure modes (nowhere or under-specified in §4–§6)

1. **Dual synthesis entry-point race.** `v2_agent_run` / capability path can queue `v2_synthesize` without the POV completeness semantics; hard guard may raise or synthesize early depending on path mix. Dynamic lenses amplify this. (`complete_v2_worker_job` multi-branch)
2. **String(16) node_type ceiling.** `STATISTICAL_POV` is already 15 chars; dynamic type names will hard-fail or force ugly codes. Packet notes missing dynamic types but not the column width trap.
3. **Synthesis prompt injection / data exfil via graph dump.** R23/M1 cover size; missing: malicious topic or nested claim text that hijacks the synthesizer when entire tree is JSON-dumped into one prompt.
4. **Worker / provider partial failure as silent truth skew.** 3 of 4 POVs complete, 1 retries forever (no attempts cap) → incomplete graph never synthesizes, or operator force-completes → biased tree. Not modeled as an epistemic failure mode.
5. **Eval set poisoning / training contamination feedback into C05 weights** once auto-actuation exists (M6 touches abuse; underweights *training cutoff contamination of the harness itself*).
6. **UI false completeness via dimming.** Greying at 0.35 without “low strength ≠ low importance” education is de facto deletion (packet P12 RED) — still missing: analytics whether users expand greyed nodes at all (false audit theater).

### 4. Sequencing challenge (S0–S6)

| Proposal | Verdict |
|----------|---------|
| Keep S0 first | **Yes** — skipping S0 makes every later “improvement” unfalsifiable |
| S1 before behavior | **Yes** — D1 is mandatory before any dynamic node type |
| S3 before S1? | **Does not break today** (policy unused by V2; S3 alone is lab→v1 wiring). **Does break dynamic-lens work** if anyone adds a 5th lens first. Order S1 then S3 remains correct. |
| S2 budget before S3 | **Yes** — without caps, real scores + policy can spend unbounded |
| S4 (P13) | **Raise priority:** because QBAF already feeds verdict, edge bias is live user-facing error, not pure lab debt. Consider S4 // with S2 after S1, not after S5. |
| S5 honest evidence SM | Keep; do **not** enable fetch verifier until M2 |
| S6 parallel wins | Keep (`stopping_reason` UI is cheapest honesty win) |

**Recommended reorder:**  
`S0 → S1 → S2 → S4∥S3 → S5 → S6`  
(S4 earlier because verdict surface already depends on QBAF edges.)

### 5. T1 arbitration (anytime synthesis vs evidence hard gates)

**Concrete rule:**

```
ALWAYS:
  - Standing state (reducer + optional QBAF strengths) is extractable at every step.
  - LLM narrative synthesis may run on debounce/terminal per C06 two-clock rule.

FOR claim_type in {empirical, causal, statistical} when evidence_state == no-evidence:
  - Render "verdict_suppressed" (no winner language, no high-confidence band).
  - Show standing tensions/gaps/unverified list with equal visual weight to any draft narrative.
  - Synthesis text allowed only as "map of arguments," never as endorsed conclusion.

FOR evidence_state == source-unresolved | pending_verification:
  - Soft confidence cap + explicit caveat; band may show only as "uncalibrated provisional."

FOR evidence_state == contradicted (retrieval-grounded only):
  - May lower root support; never delete nodes (P12).

Hard block of extractability is reserved for input-ambiguity STOP (P11), not for missing evidence.
```

---

## C. Tension resolutions (T1–T6)

| ID | Resolution |
|----|------------|
| **T1** | See §B.5 rule above. Anytime map always; endorsed verdict suppressed on no-evidence empirical/causal. |
| **T2** | C07 stays offline audit only. Never dampen/merge in product path this cycle. Cross-lineage same-proposition = corroboration signal to *preserve*, not collapse. |
| **T3** | Resolved by Q4 hybrid: QBAF display-bearing now (fix P13); expansion-bearing only after C01. C02/C03 stay DEFER until expansion-bearing is true. |
| **T4** | **Precedence on tight budget:** (1) safety/honesty labels, (2) seed floor (P01), (3) mandatory cheap adversarial pass (P04), (4) evidence actions for evidence-required types, (5) cosmetic deepen/tidy last. Floors beat benefit-pruning until floor complete; after floor, caps win. Encode in BudgetEnvelope object (S2). |
| **T5** | Feature extraction for calibration **before** any blinding/normalization. Never style-paraphrase default path (C04 MODIFY). If experimental paraphrase: run on a copy; keep raw hedges for C05. |
| **T6** | Mid-debate human answers are **out of v1 product**. Only versioned clarification debates are reproducible. If product later needs in-graph humans, store as defeasible nodes with full provenance and mark debate `replay_mode=non_deterministic`. |

---

## D. Gap additions (beyond M1–M6)

| ID | Gap | Why it matters |
|----|-----|----------------|
| **M7** | Dual synthesis / multi-path completion semantics | Dynamic lenses + planner/capability paths can race or bypass completeness |
| **M8** | `Node.node_type` String(16) width | Blocks readable dynamic types; forces parallel lane artifact (good) but easy to miss |
| **M9** | Synthesis prompt-injection threat model | Full-tree JSON dump is an attack surface, not only a context-size problem |
| **M10** | Partial worker failure as epistemic skew | Unbounded retries + fixed fanout → silent incompleteness or biased force-complete |
| **M11** | Cross-layer constant drift | POV lists duplicated in Python, QBAF sets, TS unions, presentation maps — no single source of truth |
| **M12** | “Stopped path” wire vs UI status mismatch | Backend may set `path_status`/`stopping_reason` without `node.status` abandon; UI reads status only |

---

## E. Repo verification log

| Packet claim | Result | Evidence |
|--------------|--------|----------|
| R1 fixed POV + rigid template | **HELD** | `dialectical_v2.py:54-59,630-647,786-862` |
| R2 synthesis gated on POV_BRANCHES | **HELD** | `:874-884,1198-1215` |
| R3 dynamic lens support missing | **HELD** | `entities.py:55` String(16); TS unions fixed; presentation maps fixed |
| R4 ExplorationPolicy lab | **HELD for V2** | Not referenced from `complete_v2_worker_job`; v1 orchestrator only |
| R5 placeholder score feed | **HELD** | `orchestrator.py:388-401` all 0.5, claim_type normative |
| R6 budget/retry missing | **HELD** | attempts++ `:709`, never checked |
| R7 NodeSelector lab / u=0 sensitivity | **HELD** | `node_selection.py` clone-repropagate; u=0 ⇒ sensitivity 0 |
| R8 StoppingCriterion AND + skeptic phrases | **HELD** | `stopping.py:32-44`; `roster.py:41-46,125-134` |
| R9 Recursive orchestrator side-path | **HELD** | `/api/qbaf/runs` in-memory |
| R10 POV SUPPORT bias ~0.94 | **HELD** | `_SUPPORT_TYPES` includes all POV; 1-(0.5)^4=0.9375 |
| R11 QBAF advisory only / not score-bearing | **PARTIAL FAIL** | Does not drive expansion; **does** feed verdict/dialecticalStrength via protocol analysis |
| R12 DF-QuAD cyclic error | **HELD** | `dfquad.py` CyclicGraphError |
| R13 reducer + artifacts + honest lineage | **HELD** | reducer pure; lineage never fabricates independence |
| R14 lineage independence flag-off zeros scoring | **HELD** | flag default false; when on, same-family → empty items |
| R15 calibration starved | **HELD** | brier always None |
| R16 normalize shallow | **HELD** | strip + regex + key_terms=[] |
| R17 evidence extract shallow wired | **HELD** | always-on best-effort on V2 materialize |
| R18 verification fake / no caller | **HELD / worse** | flag-off; no caller; metadata not in judge prompt |
| R19 any-contradicted-wins sticky | **HELD** | `rollup_claim_verification_status` |
| R20 stopping_* serialized, UI unread | **HELD** | serialization yes; web grep zero |
| R21 abandoned visibility + strength dim | **HELD** | `debateTreeUtils.ts:85-110` |
| R22 evidence badges missing | **HELD** | evidence_metadata not in node_to_dict UI path |
| R23 synthesis unbounded dump | **HELD** (nuance: all nodes + *complete* AgentRuns only) | `:1086-1131` |
| D2 policy unwired from V2 | **HELD** | complete_v2 never calls policy |
| Typical tree size ~29 | **HELD** | 1 root + 4 POV + 24 nested claim nodes (+ optional EVIDENCE) |

---

## F. Pros / cons per topic (agent-oriented)

### Mission: fixed tree → adaptive truth-seeking
- **Pros:** Correct objective function change; matches product doctrine already in DDD docs (exploration > scoring > generation).
- **Cons:** Signals to drive adaptivity are mostly placeholder/lab; risk of replacing boring-but-auditable coverage with unbounded spend + false sophistication.

### Repo reality (R1–R23)
- **Pros:** Packet scout table is largely accurate and actionable; maturity labels are the right vocabulary.
- **Cons:** R11 misframes QBAF as purely advisory; understates dual V2 job paths; understates verification prompt gap severity.

### D1–D9 discoveries
- **Pros:** D1/D2/D3/D4/D6 are load-bearing and repo-true; sequencing should hang on them.
- **Cons:** D9 interaction with live verdict path needs rewrite after R11 correction.

### P01 doctrine
- **Pros:** Abolishes clerical completion-as-success.
- **Cons:** Without seed floor + budgets, “adaptive” collapses to deepen-until-money-ends.

### P02 claim-type → lenses
- **Pros:** One lens set for all claim types is a category error.
- **Cons:** Regex classifier is framing-capturable; using it for routing reifies a shallow hack.

### P03 EIAC skeleton
- **Pros:** Good product language; targets real failure modes.
- **Cons:** Repo history turns defaults into schemas; Calibration slot invites fake confidence.

### P04 benefit-gated debate
- **Pros:** Debate is not always beneficial; cost awareness is missing.
- **Cons:** Ex-ante VOI is an oracle that defunds challenges to confident falsehoods.

### P05 Hermes doctrine
- **Pros:** Single meta-principle (don’t overclaim signal provenance).
- **Cons:** Placeholder→real score bootstrap deadlock if over-strict or over-loose.

### P06 lane router
- **Pros:** Asks “what does THIS claim need?”
- **Cons:** 20 lanes = fixed menu ×5; unreliable inputs → audit theater.

### P07 expansion controller
- **Pros:** Policy module already exists pure/tested.
- **Cons:** ÷cost inverts truth-seeking; unwired actions + no attempt caps → seek_evidence livelock.

### P08 stopping
- **Pros:** Named stop states > boolean done.
- **Cons:** Current AND + phrase-skeptic reward silence and livelock.

### P09 lineage independence
- **Pros:** Anti-laundering is core; recording already honest.
- **Cons:** Family substrings; agreement→stop is anti-truth; no display confidence knob yet.

### P10 evidence doctrine
- **Pros:** Separates unavailable vs refuted; blocks persuasion-as-truth.
- **Cons:** Existing verifier path is fake; hard block without fetch = permanent pending.

### P11 human routing
- **Pros:** Value/ambiguity questions need humans.
- **Cons:** Oracle humans + reward-hack route_to_human; reproducibility break.

### P12 UI preservation
- **Pros:** Considered-and-rejected is the point of debate.
- **Cons:** Greying unvalidated scores = soft deletion; 9-state enum lossy.

### P13 QBAF semantics
- **Pros:** Fixes provable root-true bias.
- **Cons:** Naive no-edge severs subtrees; historical fingerprint rewrite risk.

### P14 staged roadmap
- **Pros:** Matches repo culture; prevents giant rewrite.
- **Cons:** Negative-only non-negotiables allow green non-faking slices that still worsen truth.

### C01 eval harness
- **Pros:** Makes truth-seeking falsifiable.
- **Cons:** Distribution mismatch; contamination; consensus-as-truth for normative.

### C02 EVOI
- **Pros:** Principled sensitivity vs vibes formula.
- **Cons:** No substrate; cold-start zero; rewards structural swing not truth.

### C03 double-crux
- **Pros:** Attacks persuasion theater.
- **Cons:** Forced crux confabulation; no iterative loop in prod.

### C04 blind debiasing
- **Pros:** Real LLM-as-judge failure modes.
- **Cons:** Paraphraser destroys calibration signal; flip ≠ bias only.

### C05 calibration ledger
- **Pros:** Only long-run path to better truth.
- **Cons:** Selection bias; auto-weights monoculture; empty under single-judge.

### C06 anytime synthesis
- **Pros:** Fixes terminal fill-the-tree UX.
- **Cons:** Full re-synth is expensive; anchoring if fed back; confidence laundering.

### C07 propositional graph
- **Pros:** Correct long-term ontology for QBAF math.
- **Cons:** Migration huge; auto-merge erases corroboration/lineage; dormant harm today.

### Tensions T1–T6
- **Pros:** Packet correctly refuses to leave them implicit.
- **Cons:** Until V answers Qs, implementers will invent incompatible local rules.

### Gaps M1–M6 (+M7–M12)
- **Pros:** Completeness critic found real operational holes.
- **Cons:** Security (M2/M9), multi-tenant (M4), liability (M5) can block P10/C05 even if epistemology is ready.

### Sequencing S0–S6
- **Pros:** Enabling-before-behavior is correct.
- **Cons:** S4 under-prioritized given live verdict use of QBAF; uniform deferral of “interesting” ideas is good discipline if enforced.

---

## G. Net assessment (≤150 words)

This architecture is **converging on truth-seeking discipline**, not mere process theater — but only if the binding modifications are treated as the real plan and the headline `adopt_modified` uniformity is ignored. The repo already has the right *parts* (honest lineage recording, pure DF-QuAD, ExplorationPolicy seam, no-fake-score culture) sitting beside a **production path that ignores them** (fixed 29-node V2, constant-0.5 exploration feed, inert verification, QBAF root bias in the verdict path).

The single change that most raises odds: **S0 golden scorecard + S1 synthesis-gate fix + S4 QBAF edge transparency**, before any adaptive router or EVOI story. Without measurement and without fixing the live false support mass into “true,” further machinery will elaborate a biased, unmeasured tree-filler.

---

## H. Suggested stance summary for the next agent

| Stance | IDs |
|--------|-----|
| CONFIRM | P01, P03, P04, P07, P08, P10, P11, P12, P13, P14, C01, C05, C06, C07 |
| MODIFY | P02, P05, P09, C04 |
| DEFER | P06, C02, C03 |
| CHALLENGE | R11 framing in packet (QBAF not purely advisory) |
| REJECT | none of the *modified* cores; **reject near-term commitment** to C02/C03 as production drivers |

---

## I. Implementation guardrails for coding agents

1. Do not add a 5th POV until D1 gates enumerate actually-created completeness sets.
2. Do not call ExplorationPolicy from V2 until `_score_signal_for_node` uses real `NodeScoringPayload` (or hard-blocks).
3. Do not enable `DIALECTICAL_EVIDENCE_VERIFICATION` until external fetch + verifier prompt + latest-per-node rollup + M2 threat model.
4. Do not put lane_id into `Node.node_type`.
5. Do not recompute historical debates under new QBAF semantics without `semantics_version` pin.
6. Do not surface `independent=true` from family substring alone as user trust.
7. Every slice needs: goal, why-now, acceptance test, files, risks, **what-not-to-fake**, golden non-regression once S0 exists.

---

*End of AI review. Companion: `docs/reviews/2026-07-09-truth-seeking-packet-v1-human-guide.md`.*
