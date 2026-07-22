# Dialectical Engine — Verified Improvement Plan (2026-07-22)

Source debate: `https://dezbatere.ro/debate/90bad9c5-7181-446f-b943-55aa997cfd9f`
(the meta-debate "What's the best algorithm to investigate a question…"), its
Synthesis, plus an independent audit of the running system on this machine.

Every claim in this document was verified directly against the live system:
the coordinator DB (`~/.dialectical/db.sqlite3`, snapshot via `VACUUM INTO`),
the coordinator/worker/web source, launchd state, process table, worker logs,
and live experiments (judge re-runs, CLI latency probes). Nothing below is
taken from the synthesis on faith; where the synthesis was wrong or already
addressed, that is said explicitly.

---

## 0. TL;DR

The synthesis's *architectural* recommendations are largely already designed
into the codebase (DF-QuAD, evidence gates, adaptive expansion, verdict
honesty) — but **most of that machinery is dormant in production** (flags OFF,
subsystems never fired), and the debate that produced the synthesis was
crippled by a **worker-orchestration failure mode** that has nothing to do
with algorithm design. The highest-leverage order of work is:

1. **P0 — Make branch generation reliable** (deadline/retry/fallback/worker
   lifecycle). Without this, every other improvement is measured on a broken
   substrate. 4 of 7 perspectives died for orchestration reasons.
2. **P1 — Build real evidence acquisition** (retrieval + citation
   verification). This is the single biggest epistemic gap: evidence_quality
   is 0.0 for 27/29 nodes and *cannot* be higher, because "evidence" is regex
   extraction from the model's own prose.
3. **P2 — Fix scoring validity** (honest uncertainty, cross-family judging,
   tree-aware scoring, stop scoring failed placeholders).
4. **P3 — Make the debate an actual debate** (per-node adversarial jobs
   across models; turn on adaptive expansion behind its existing telemetry).
5. **P4 — Verdict/synthesis integrity** (score-informed synthesis, fix the
   meaningless "Leans" indicator, sequencing).
6. **P5 — Stand up the benchmark harness** the blueprint already specifies,
   so every later change is an experiment, not a vibe.

---

## 1. What was verified (evidence log)

### 1.1 The four failed perspectives — root cause chain (orchestration, not models)

| Perspective | Pinned model | Outcome |
|---|---|---|
| Epistemic Validation | gpt-5.6sol-medium | complete, 1 attempt, ~18s |
| Adversarial Testing | claude-sonnet-5-high-loop | **failed**, 8/8 timeout attempts |
| Convergence Design | gemini-3.5-flash-loop | **failed**, 8/8 |
| Search Strategy | grok-4.5-high-loop | **failed**, 8/8 |
| Benchmarking | lmstudio:google_gemma-4-e4b-it | **failed**, 8/8 |
| Practical | gpt-5.6sol-medium | complete, 1 attempt, ~18s |
| Ethical | claude-sonnet-5-high-loop | complete, **attempt 5**, 537s wall |

Verified mechanics (all from `jobs` + `job_transitions` + source):

- POV jobs are **pinned to one model at creation** (round-robin over the
  online pool, `dialectical_v2.create_dialectical_debate`); retries never
  switch model (`create_job` keeps `required_model`), so one flaky backend
  = one permanently dead branch. Failure surfaces as
  `generation_exhausted` after a weighted budget of 8 timeout attempts
  (`orchestrator.job_attempts_exhausted`, timeouts at half weight).
- The **job deadline (~95s** observed; `make_deadline` = max(2×worker_poll,
  job_fallback), defaults 60/60) is **below realistic generation latency**
  for the loop CLIs: my live probe of the exact POV contract prompt on a
  healthy, idle `claude -p --model claude-sonnet-5 --effort high` took
  **51.2s**; under yesterday's load (6 concurrent jobs) it repeatedly
  exceeded 95s. The transitions show a metronomic claim→expire→reclaim
  cycle every ~95s, 8 times, same worker.
- The subscription loop workers **call `register` on every ~60s iteration**
  (`scripts/subscription_loop.py::ensure_loop_worker`), and coordinator
  `register` **kills any job the worker holds**
  (`orchestrator.py:907` → "Worker restarted while job was active"). The
  loop design guarantees periodic assassination of its own long-running jobs.
- **All three "failed" CLIs are healthy today**: `claude` 5.4s, `agy`
  (gemini) 5.2s, `grok` 4.9s on tiny probes. The models were never the
  problem; auth was fine at probe time (ModelAuth notes say grok 401s do
  recur after OAuth expiry).
- The worker fleet is chaotic right now: `com.dialectical.worker` and
  `com.dialectical.lmstudio-worker` launchd services are **crash-looping**
  on missing tokens (169 errors in the lmstudio log); the grok loop runs
  **twice concurrently** (one shell against `https://dezbatere.ro`, one tmux
  against `http://127.0.0.1:8000` — the same coordinator through two URLs),
  so the same worker name re-registers from two processes; `workers.status`
  says "online" for rows hours stale.

**Consequence:** the "model diversity" the synthesis calls for is configured
(round-robin exists, `DIALECTICAL_MULTI_MODEL_GENERATION` default ON) but the
delivery layer converts diversity into branch death. The surviving debate was
~80% one model family (GPT wrote 2 of 3 branches, the perspective plan, the
synthesis, and all scores).

### 1.2 Evidence subsystem — the biggest epistemic gap

- "EVIDENCE" nodes are **verbatim regex-extracted substrings of the
  generating model's own prose** (`app/evidence/extraction.py`, honest by
  design: "never an LLM call", no retrieval). The three evidence nodes in
  this debate literally restate their parent claims.
- The judge confirms it: **evidence_quality = 0.0 for 27/29 nodes** (max
  0.05); `missing_evidence` fatal flags on 26/29 nodes; every hole list is
  dominated by `evidence_auditor` "missing evidence" entries.
- The downstream machinery for real verification **exists but has never
  run**: `evidence_lifecycle_snapshots` = 0 rows ever,
  `lifecycle_decision_records` = 0 rows ever, the verifier judge role is
  implemented (`scoring/prompts.py` verifier branch) but no
  `evidence_verification` analyzer runs exist.
- The planned verdict evidence gate (`DIALECTICAL_VERDICT_EVIDENCE_GATE`,
  default OFF) will, once flipped, **withhold endorsed verdicts on empirical
  claims forever**, because the system as-is can never produce evidence. The
  flip-readiness doc's shadow telemetry will show ~100% `wouldSuppress` on
  empirical roots. Gate before acquisition = permanent suppression.

### 1.3 Scoring validity

- **`uncertainty` is not uncertainty.** It is a hand-coded checklist
  (`reducer.py::_uncertainty`): 0.20 base + 0.08·ambiguity_flags + 0.10 if
  no evidence refs + 0.10 if low evidence quality + 0.08·disagreements +
  0.04·caps. Empirically: only 5 distinct values across 29 nodes
  (0.40/0.44/0.48/0.52/0.56), 16 of them exactly 0.48. The UI renders "UNC
  48" as if it measured something about the claim.
- **Strength has a structural ceiling.** `base_strength` weights
  evidence_quality at 0.25; with evidence pinned at ~0, no claim can
  realistically exceed ~0.5 (observed max 0.474 across the debate). The
  whole tree reads "mediocre" for reasons no argument quality can change.
- **Single self-grading judge.** Judge = `codex/gpt-5.6sol-medium`
  (temperature 0), the same model that wrote most surviving content, the
  perspective plan, and the synthesis. `judge_registry` contains exactly one
  contract; calibration provenance says `single_judgment`, `cold_start`,
  `calibrationApplied: false`. The multi-judge/self-consistency modules
  (`scoring/self_consistency.py`, disagreement detection) exist but nothing
  exercises a second judge in production.
- **The judge is context-blind.** `render_single_node_judge_prompt` sends
  ONLY {normalized claim, argument_text}. It does not include the debate
  question (yet scores "relevance" ≈0.96 everywhere), nor the node's actual
  children/attackers (yet scores "counter_resilience" — against counters it
  imagines, while real CON children sit in the tree).
- **Judge noise is small; structure dominates.** I re-ran the production
  judge path 3× on the same node ("Consensus Is Not Validation"):
  strength 0.4225 / 0.4095 / 0.4195, impact 0.82/0.86/0.79, uncertainty
  0.48/0.48/0.48. So ±1–3 points of run noise — reproducibility is decent;
  the validity problems are the formula inputs, not sampling jitter.
- **Failed placeholder nodes get scored.** The four dead POV containers were
  judged on their label text ("Adversarial Testing POV" → STR 15) — wasted
  codex calls and misleading chips on set-aside paths.
- **Scoring is post-hoc and influences nothing.** Debate completed 13:49:18
  (synthesis included); `score_debate` ran 13:49→14:00 (29 sequential codex
  calls ≈ 11 min). Generation, expansion, and synthesis never see scores.
  DF-QuAD propagation DOES run (tauCoverage 1.0) but lands only in the
  `protocol_analysis` analyzer output; the "convergence" check then compares
  pre-scoring vs post-scoring runs and reports `converged: false, maxDelta
  0.35` — an artifact of comparing default-tau vs judge-tau runs, not
  instability.

### 1.4 The "debate" is not yet a debate

- Each POV branch — lens card + strongest-pro + strongest-con + one nested
  pro/con each — is produced by **one model in one completion**
  (`validate_pov_contract` hardcodes the 7-card shape; prompt says "Create
  one strongest Pro and one strongest Con…"). The PRO and CON of a branch
  share one author and one forward pass: self-play, not adversarial testing.
- Protocol phases 5.4 (cross-exam) and 5.5 (verification) are **passive
  read-only analyses** over already-persisted scoring items ("No new LLM
  calls. No new nodes." — `protocol/runner.py` docstring). 5.5 v1 only
  classifies whether a claim *kind* is verifiable.
- **Adaptive expansion is default-OFF** (`expansion_dispatch.py:79`,
  coordinator launchd env sets no DIALECTICAL_* flags) and has never made a
  decision in any debate. Tree shape is therefore always the fixed skeleton.
- **"Leans Even" is a tautology.** `computeLean` counts PRO vs CON nodes;
  the contract guarantees 3 PRO / 3 CON per completed branch. Verified: all
  12 debates in the DB have exactly equal PRO/CON counts (682/682 in the
  largest). The meter can never lean until asymmetric growth exists.
- Triage classified the root claim `normative` → `verification_required:
  false`, and claim normalization produced garbage scope ("population: 'the
  AIs that this'") — the deterministic normalizer is weak on real questions.

### 1.5 What the synthesis got right vs. what it missed

The synthesis's eight AGREEMENTS and nine EVIDENCE GAPS map almost 1:1 onto
real, verified deficiencies — remarkable, given the synthesizer had no access
to scores or code. Two calibrations:

- It **under-credits existing design**: DF-QuAD semantics, deterministic
  reducer separation, provenance stamping, dissent-preserving synthesis
  contract, verdict honesty gates, and per-node adversarial roles are
  already implemented or scaffolded — the gap is activation + reliability,
  not greenfield design.
- It **misses the operational layer entirely** (worker lifecycle, deadlines,
  registration churn, crash loops, duplicate loops, stale status), which is
  what actually destroyed 4/7 of its own perspectives. A perfect algorithm
  on this substrate still fails.

---

## 2. The plan

Ordered by leverage; each phase lists concrete changes, why (tied to §1
evidence), and the experiment that proves it worked. Follow the blueprint
rule (docs/algorithm-evaluation-blueprint.md): every phase compares against a
named baseline on the same inputs.

### P0 — Reliability of generation (stop losing branches) — days, not weeks

Changes:
1. **Model fallback on retry**: after N (=2) timeout-class attempts on the
   pinned model, requeue the job onto the next healthy pool model (keep
   provenance of the switch; the regeneration path already proves
   model-switching works). A failed branch should be a last resort, not the
   default outcome of one slow backend.
2. **Deadline ≥ observed P99 per model class**: raise `job_fallback_seconds`
   for generation jobs to ≥300s (POV-contract probe: 51s idle on Claude,
   >95s under load; Ethical needed ~500s wall). Better: per-model deadline
   learned from `generations.latency_ms` history. Keep the 600s stuck cap.
3. **Stop the register-kill loop**: `subscription_loop` must register once
   and reuse the session (it already saves worker tokens in config), or the
   coordinator's register handler must not terminalize held jobs when the
   registration is an idempotent re-register of the same healthy worker with
   a live heartbeat. In-run heartbeats already exist
   (`run_cli_with_liveness`) — verify they actually extend the deadline
   sweep (yesterday they demonstrably did not prevent ~95s expiries).
4. **One loop per provider, supervised**: kill the duplicate grok loop (two
   processes, two URLs, one coordinator); move the ad-hoc tmux/zsh loops
   into launchd (or one supervisor) with health reporting; fix the two
   crash-looping launchd workers (missing `user_token` / `worker_token`) or
   disable them; make `workers.status` reflect heartbeat staleness.
5. **Don't judge dead placeholders**: exclude `failed/abandoned` POV
   containers from `score_debate` (saves ~4 codex calls/debate, removes
   misleading STR chips on set-aside paths).

Experiment / acceptance:
- Re-run the same meta-debate topic 5× after the fixes. Baseline (this
  debate): 3/7 perspectives completed, 1 model family dominant. Target: ≥
  6.5/7 mean completed branches, ≥3 model families among completed branches,
  zero `generation_exhausted` from timeout-class causes, branch p95 wall
  time bounded. All measurable from `jobs`/`job_transitions`/`nodes` with
  the queries used in this audit.

### P1 — Real evidence acquisition + verification (the epistemic unlock)

Why first among the "algorithm" tracks: strength's 0.25-weight evidence term
is empty, the verdict evidence gate cannot be flipped without it, and the
synthesis's top evidence-gap items all reduce to "there are no sources".

Changes:
1. **Evidence acquisition jobs**: for each evidence-eligible claim
   (empirical/causal — triage already classifies this), queue a worker job
   that does retrieval (web search API and/or local corpus), returns
   candidate sources: {url, quote/span, publisher, date, retrieval query}.
   Store as EVIDENCE nodes with real provenance, replacing the regex
   extractor as the *primary* evidence source (keep the extractor for
   marking in-prose citations to be resolved).
2. **Activate the existing verifier**: run the already-implemented verifier
   judge role over (claim, evidence text, reference) with the entailment
   labels in `app/evidence/entailment.py`; persist
   `evidence_verification` analyzer runs; the latest-per-evidence-node
   rollup gate noted in `protocol/runner.py` (HARD GATE comment) must land
   at the same time.
3. **Feed DF-QuAD**: connect verified evidence leaves into the QBAF graph
   (today "EVIDENCE nodes are no-edge extracted substrings whose taus never
   reach the verdict" — runner comment). Verified-supporting evidence raises
   parent tau; refuting evidence attacks it. That makes propagated strength
   mean something.
4. **Only then flip `DIALECTICAL_VERDICT_EVIDENCE_GATE`** using the
   flip-readiness shadow telemetry as designed.
5. **Independence bookkeeping** (cheap first version of the synthesis's
   "independence metric"): record per evidence leaf {source domain, method:
   retrieval|model-claim, retrieval query, model family}; count distinct
   (domain, method) pairs per claim; expose it instead of pretending to
   measure training-corpus independence.

Experiment / acceptance:
- Golden set of 30 claims (10 clearly true, 10 clearly false, 10 contested —
  the blueprint's evaluation-unit format). Baseline: current pipeline scores
  them with evidence_quality 0.0 and near-flat strength (predicted from
  §1.3; spot-check 5 to confirm). Target: verified-true claims separate from
  verified-false by ≥0.25 mean strength gap; fabricated-citation rate 0 on
  audit of 100% of cited sources (they must resolve and contain the quote);
  every evidence node carries a resolvable URL + quote.

### P2 — Scoring validity (make the numbers honest)

Changes:
1. **Replace formula-uncertainty with labeled drivers**: show "no external
   evidence; 2 unresolved counters" as chips instead of "UNC 48". If a
   numeric uncertainty is kept, derive it from measurable dispersion:
   judge-panel disagreement + rerun variance (both already have module
   support: `disagreement.py`, `self_consistency.py`), not a checklist.
2. **Cross-family judge panel**: add 1–2 judge contracts on other families
   (Claude/Gemini adapters exist worker-side; scoring jobs can be
   worker-routed or use their CLIs in-process like codex). Use the existing
   reducer to merge, and the existing disagreement detector to surface
   splits. Never let the family that authored a branch be its sole judge.
3. **Tree-aware judging**: include the debate question and the node's actual
   children (attacks/supports) in the judge payload; score
   counter_resilience against real counters; drop or re-derive "relevance"
   (currently judged without the question it's supposed to be relevant to).
4. **Fix the strength composition**: while evidence is being built (P1),
   stop letting the empty evidence term crush all scores — either rebalance
   weights for non-empirical claims or label the band "argument-only
   strength" in the UI. After P1, restore evidence weighting.
5. **Hygiene**: fix the "Unknown claim scored…" rationale template; stop
   judging failed placeholders (also in P0); unify `complete`/`completed`
   node status values; retire the legacy 4-value POV `node_type` reuse (the
   QBAF adapter comment in `dialectical_v2.py:107` documents the constraint).

Experiment / acceptance:
- **Score-flip probe** (self-runnable): for 20 nodes, generate a
  deliberately weakened variant (remove the key reason) and a strengthened
  variant (add a verified source). A valid scorer must rank strengthened >
  original > weakened ≥80% of the time. Current system fails this by
  construction for the "add source" arm (evidence term can't move) — that's
  the point of the test.
- **Judge-panel calibration**: on the golden set, Brier/ECE of
  strength-as-probability vs. ground truth, single-judge vs. panel. Adopt
  panel only if it improves calibration or flags real disagreement.
- Rerun variance stays within the ±3-point envelope measured in §1.3.

### P3 — Make it an actual dialectic

Changes:
1. **Split the one-shot POV subtree into per-node jobs**: proposer writes
   the stance card; a *different model* writes the strongest attack against
   it (the `v2_expand` job type + prompt already exist and take
   `expansion_reason`); iterate one round deeper where scores/holes warrant.
   Cost control: this multiplies calls ~6× per branch — gate depth by the
   existing per-debate budgets, and only escalate contested nodes.
2. **Turn on adaptive expansion** (`DIALECTICAL_ADAPTIVE_EXPANSION`) after
   P0+P1, so `seek_evidence`/`challenge` decisions have real evidence
   statuses and working expand jobs to steer. Its categorical-only steering
   law (policy.py) is well-designed — it just needs its inputs to exist.
   Instrument with `lifecycleDecisions` serialization (already on the wire).
3. **Real cross-examination round**: before synthesis, give each branch's
   strongest claims to an opposing-family model with the explicit contract
   "find the decision-changing objection" (the skeptic role from
   `config/agents.yaml` is defined but unused). Persist as attacks, rescore
   affected nodes.
4. **Sequencing fix**: score (at least the cheap per-node pass) *before*
   synthesis, and pass scores + verification statuses into the synthesis
   prompt so tensions/verdict reflect measured standing, not just prose.
   Then the convergence check compares like with like (post-scoring runs).

Experiment / acceptance:
- A/B on 10 topics: fixed-skeleton (baseline) vs adversarial per-node
  pipeline, same budget. Judge with a held-out panel on the blueprint
  dimensions 4/5/6 (coverage, counterargument strength, sycophancy
  resistance). Require: unresolved-attack count surfaces in UI; at least one
  branch conclusion flips or gets qualified in ≥3/10 debates (if nothing
  ever flips, the adversarial round is theater — that's the null result the
  synthesis's "compliance theater" tension predicts).

### P4 — Verdict & synthesis integrity

1. **Fix "Leans"**: derive from propagated root strength of PRO- vs
   CON-side dialectical support (DF-QuAD strengths already exist per node),
   or from score-weighted counts — anything but raw symmetric node counts.
   Show "Even (structural)" until asymmetric growth exists.
2. **Score-informed, cross-family synthesis**: rotate the synthesizer off
   the anchor model (it's hardcoded `V2_CODEX_MODEL_ID` today) or run two
   synthesizers from different families and diff them; include per-node
   scores, verification statuses, unresolved attacks, and the failure
   manifest (which perspectives died and why) in the prompt context.
3. **Expose the honest verdict band** (`verdict-v2` bands + tauCoverage gate
   already implemented) in the default UI, replacing score chips as the
   headline — the flip-readiness plan (G-A) already stages this; execute it
   after P1 so empirical claims aren't permanently "withheld".

### P5 — The benchmark harness (make "better" measurable)

`docs/algorithm-evaluation-blueprint.md` already defines the 13 dimensions
and the baseline rule; none of it is implemented as a harness. Build the
smallest version that runs:

1. 25–50 case suite (blueprint's evaluation-unit schema): mix of
   ground-truth factual, contested-normative, and trap cases (false-premise
   questions for dimension 6).
2. A runner that executes a full debate per case against a tagged config
   (git SHA + flags + model pool), collects the §1-style metrics
   automatically (branch completion, model diversity, evidence resolution
   rate, score distributions, cost, wall time), plus an LLM-panel scoring of
   the synthesis on dimensions 1–10.
3. A one-page diff report: candidate vs baseline per dimension + cost.
   Gate every P1–P4 flag flip on a harness run (the flip-readiness doc
   already demands exactly this discipline for G-A/G-D).

Cost note: a 29-node debate today ≈ 7 generation calls + 29 judge calls
(~11 min sequential codex). The harness must track and cap spend
(`spend.py` already meters per-model spend) so experiments stay affordable.

---

## 3. Improvements beyond what the synthesis mentions

1. **Operational reliability is the binding constraint** (all of P0) — the
   synthesis reasons about semantics and stopping rules while 57% of its
   own perspectives died of deadline math and register-kills. No amount of
   DF-QuAD tuning fixes that.
2. **Judge context starvation** — scoring "relevance" without the question
   and "counter_resilience" without the actual counters is a validity bug
   the synthesis never surfaces (it only worries about calibration).
3. **Self-grading concentration** — one family generates, plans, judges,
   and synthesizes. The synthesis worries about correlated *training* data;
   the deployed system has literal *identity* correlation, which is cheaper
   to fix (route roles across the families you already run).
4. **Don't score what didn't happen** — judging failed placeholder labels
   pollutes the UI and the analyzer graph.
5. **The "Leans" meter is structurally frozen at Even** — a UI honesty bug
   invisible from inside the debate content.
6. **Flip-order dependency** — flipping the evidence gate before evidence
   acquisition exists would permanently suppress all empirical verdicts;
   the flip-readiness doc's shadow telemetry should be read with that in
   mind (100% wouldSuppress is expected, and not evidence the gate works).
7. **Latency/cost of post-hoc scoring** — 29 sequential judge calls after
   completion delay "fresh scores" ~11 min and cost real quota; batch
   sibling nodes per call (the scoring payload already carries full node
   lists) or score incrementally at node completion (hook exists:
   `ensure_node_scoring_on_completion`).
8. **Deterministic normalizer quality** — `scope.population: "the AIs that
   this"` on the root claim; claim-type/marker classification feeds triage
   and verification gating, so its errors propagate; worth a small eval set
   of its own.
9. **Status-vocabulary drift** (`complete` vs `completed`, stale `online`
   worker status) — small, but exactly the kind of thing that silently
   breaks "all branches done → synthesize" invariants later.
10. **Single-machine contention** — generation, judging, LM Studio, the web
    build, and four CLI loops share one Mac mini; yesterday's failure window
    had 6-way concurrency. Consider capping concurrent CLI subprocesses
    (worker-side semaphore) and staggering judge runs off the generation
    window.

---

## 4. Experiments already run for this audit (reproducible)

| # | Experiment | Method | Result |
|---|---|---|---|
| E1 | Failed-branch root cause | `jobs`/`job_transitions` on debate 90bad9c5 | 8×~95s same-model timeout cycles; final kill on worker re-register |
| E2 | Judge rerun variance | `scripts/real_codex_scoring_smoke.py` ×3 on node 8cc48f10 | strength 0.4225/0.4095/0.4195; UNC constant 0.48 |
| E3 | Uncertainty quantization | reducer source + 29 persisted scores | checklist formula; 5 distinct values, 16/29 = 0.48 |
| E4 | Evidence emptiness | scores + extraction source | evidence_quality 0.0 (27/29); evidence nodes = prose substrings |
| E5 | CLI health/latency | timed probes | claude 5.4s / agy 5.2s / grok 4.9s (tiny); claude POV contract 51.2s |
| E6 | POV wall time (prod) | job_transitions durations | gpt ~18s; claude 537s over 5 attempts |
| E7 | Lean symmetry | node counts, all 12 debates | PRO == CON everywhere (682/682 max) → "Even" is structural |
| E8 | Dormant subsystems | table counts + launchd env | 0 lifecycle decisions, 0 evidence snapshots ever; no DIALECTICAL_* flags set |
| E9 | Post-hoc scoring | analyzer_runs timestamps | synthesis 13:49:18, scoring 14:00:10 (+11 min) |

Snapshot + queries live in the session scratchpad; all are re-runnable
against `~/.dialectical/db.sqlite3` (read-only `VACUUM INTO` first).
