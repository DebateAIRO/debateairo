# Flip-readiness — final stretch (W6 prep)

**Status: preparation only.** No flag default anywhere in this repository was
changed to produce this document, and nothing in W6 flips a flag. Every
decision below (G-A, G-B, G-D, adaptive default-ON) belongs to V, made on
evidence gathered after this branch ships — this document exists so that
evidence, the checklist, and the exact mechanics of each flip are ready when
V asks for them. See `refactor-plan-final-stretch-v1.md` §6 (W6), §8
(open questions), and §5.4 (judge ruling: "Flip the honesty flags now? No...
Flips move to the final wave") for the governing decisions this document
implements.

Where telemetry doesn't exist yet, this document says so explicitly rather
than inventing a number. Every flag name, endpoint shape, and budget value
below was verified directly against the code on `lane/final-stretch-v1` at
the time of writing (commit `d2a6982`), not copied from a wave report without
checking.

---

## G-A — flip `DIALECTICAL_VERDICT_EVIDENCE_GATE` + `NEXT_PUBLIC_VERDICT_FIRST_UI` to default ON

### Preconditions now satisfied by this branch

- **tauCoverage gating is live** (W2). `coordinator/app/scoring/verdict.py`
  gates any strength-based band behind `_TAU_COVERAGE_MIN = 0.5`: a
  protocol run whose judge-tau coverage is below that threshold serves the
  honest `insufficient_scoring` band instead of a topology-artifact
  "supported" reading, with the real strength and coverage still in `basis`.
- **`insufficient_scoring` is honest and composes correctly with the gate**
  (W2). When the gate is ON and a debate is both unscored AND
  evidence-eligible, suppression wins over `insufficient_scoring`, and the
  pre-gate reading (`insufficient_scoring`) is preserved in
  `basis.preGateVerdictBand` rather than silently discarded — pinned by
  `coordinator/tests/test_verdict.py::test_evidence_gate_suppression_still_wins_over_insufficient_scoring`
  and, at the real env-var/serialization boundary,
  `coordinator/tests/test_serialization.py::test_env_gate_on_and_unscored_debate_compose_without_contradiction`
  (new, W6).
- **Transparency serialization landed** (W5a): `lifecycleDecisions`,
  `derivation`, and `completion` (with `humanReason`) are on the wire
  payload, so a flip is defensible to a user who asks "why does this verdict
  say withheld" or "why did this debate fail" — not just why the band
  changed.
- **The evidence gate itself has been live in shadow mode since before this
  branch** (T6/T7, `refactor-plan-final-stretch-v1.md` §4): every OFF-mode
  verdict response already carries `verdict.evidenceGateShadow`
  (`wouldSuppress`, `claimType`, `claimTypeSource`, `reason`) recording what
  the gate would have done. This branch (W5b) adds the debate-scale
  aggregation of that shadow signal (see below).

### Evidence to review before flipping

`GET /api/ops/verdict-shadow?limit=N` (bearer user token required via
`require_user_token`; `limit` 1–200, default 50; `coordinator/app/api/ops.py`)
walks the most recently completed, non-archived debates and derives each
one's verdict through the single derivation path
(`app.services.serialization.derive_debate_verdict`), returning:

- `debates[]`: per-debate `{debateId, completedAt, verdictBand,
  preGateVerdictBand, wouldSuppress, suppressed, tauCoverage, claimType}`.
- `aggregates.bandHistogram` / `preGateBandHistogram`: served vs. pre-gate
  band counts.
- `aggregates.wouldFlipCount`: debates that are *not already suppressed*
  whose served band would change if the gate flipped — the direct answer to
  "how many real debates would look different tomorrow."
- `aggregates.coverageHistogram`: quartile buckets of `tauCoverage`, plus an
  honest `unavailable` bucket for unscored debates.
- `aggregates.claimTypeHistogram`: resolved claim types across the sample
  (also feeds the G-D decision below), with an honest `unknown` bucket.
- `gateEnabled`: echoes the live flag value, so a dashboard snapshot can't be
  misread against a since-changed flag.
- `sampled` / `errors`: per-debate derivation failures are counted and
  skipped, never raise — the feed keeps serving the rest.

**No shadow data has been collected yet.** The endpoint is new on this
branch (W5b) and no soak or production sampling against it has been run as
part of this work. Everything above describes the *shape* of the evidence
to review, not an observed value.

**Recommended shadow window** (a recommendation for V to size against real
numbers once they exist — not a measured threshold): review at least the
endpoint's maximum sample (200 completed debates) or two weeks of
representative usage, whichever is later, before flipping. Rationale:
`wouldFlipCount` and `claimTypeHistogram` need enough real empirical-claim
volume to be signal rather than noise, and G-A flips two flags together, so
under-sampling the debate mix risks a visible false-negative on day one
("supported" quietly becoming near-universally suppressed, or vice versa).

### Manual verification checklist

Run against a live/staging instance once the shadow review above is
favorable. Each item below already has an automated regression pinning the
same property; the manual pass is about confirming the real UI/API, not
re-deriving these from scratch.

1. **Unscored debate → banner shows `insufficient_scoring`**, not
   "supported", with the neutral copy "Not enough judge scoring."
   Automated: `test_serialization.py::test_debate_detail_unscored_protocol_run_serves_insufficient_scoring`;
   `web/components/VerdictBanner.insufficientScoring.source-test.mjs`.
2. **Evidence-less empirical claim (scored) → verdict withheld.** Band
   `suppressed`, and `basis.preGateVerdictBand` still carries the real
   pre-gate band — never lost. Automated:
   `test_serialization.py::test_env_gate_on_preserves_pregate_band_for_suppressed_scored_debate`
   (new, W6), `test_verdict.py::test_verdict_state_suppressed_no_evidence_for_proven_empirical_claim`;
   `web/components/VerdictBanner.suppression.source-test.mjs`.
3. **Scored debate → real band beside the real strength.** The badge shows
   one of `supported`/`contested`/`unsupported`, and the numeric strength
   only ever renders inside the `<details>` block next to it — never
   band-only, never the raw number outside the details. Automated:
   `test_serialization.py::test_debate_detail_verdict_matches_verdict_summary_for_latest_protocol_analysis_run`;
   `VerdictBanner.source-test.mjs` ("confines the real dialectical strength
   number to a `<details>` element").
4. **Failed debate → `completion.humanReason` is non-empty plain language**,
   never the raw code and never the private `job.error` text. Automated:
   `test_serialization.py::test_completion_block_failed_debate_carries_the_node_reason`,
   `::test_completion_block_failed_debate_without_node_reason_uses_the_honest_generic_code`.
5. **Unknown claim type → never suppressed.** `caveats` carries
   `claim_type_unknown`; the band is whatever the real strength/coverage
   computed, never forced to `suppressed`. Automated:
   `test_verdict.py::test_missing_or_unknown_claim_type_never_suppressed_and_never_fabricated`;
   `test_serialization.py::test_env_gate_on_never_suppresses_unknown_claim_type`
   (new, W6).

### Exact env changes (when V approves)

- Coordinator process env: `DIALECTICAL_VERDICT_EVIDENCE_GATE=1` (read via
  `bool_env`; call sites `coordinator/app/services/serialization.py:622` and
  `coordinator/app/api/ops.py:162`). Any of `1`/`true`/`yes`/`on`
  (case-insensitive) enables it.
- Web build/runtime env: `NEXT_PUBLIC_VERDICT_FIRST_UI=true` (Next.js public
  env var — baked in at build time, so this needs a rebuild/redeploy, not
  just a process restart; read at
  `web/app/debate/[id]/DebatePageClient.tsx:1073` and `:1227`, exact string
  `"true"` required).
- The two flags have no code-level coupling — either can be flipped alone.
  The plan groups them because flipping the banner without the gate would
  surface the pre-tauCoverage-gating near-constant "supported" reading (the
  original honesty problem this whole stretch exists to fix), and flipping
  the gate without the banner makes the honesty change invisible to users.
  **Recommended order:** gate first (server-side only; verify via
  `/api/ops/verdict-shadow` for a burn-in period with the banner still off),
  then the banner.

### Rollback

Set both env vars back to unset/off. **No data migration in either
direction.** `verdictBand`, `suppressionReason`, `caveats`, and every other
verdict field are computed fresh on every read from already-persisted
`protocol_analysis` output — never rewritten, never cached. Turning the gate
back off simply stops `_apply_evidence_gate` from applying its suppression
branch on the next request; turning the banner flag off simply stops
mounting the component. Nothing to backfill or forward-fix.

---

## G-B — semantics default (df-quad-v1)

**NOT proposed by this branch.** `coordinator/app/qbaf/semantics_versions.py`:

```python
SEMANTICS_V1 = "df-quad-v1"
DEFAULT_SEMANTICS = SEMANTICS_V1
```

`resolve_semantics` pins any missing/`None` stamp to `df-quad-v1` and raises
`ValueError` on an unregistered identifier — confirmed unchanged on this
branch (`coordinator/tests/test_semantics_versions.py::test_semantics_registry_uses_distinct_stable_identifiers`,
`::test_resolve_semantics_defaults_to_v1_and_raises_on_unknown`, both green).
`SEMANTICS_V2_LENS_LIFT = "df-quad-v2-lens-lift"` exists in the registry as
an opt-in adapter (pre-branch) but is not the default, and this branch does
not touch that wiring or propose flipping it.

The plan's shorthand "ZEN-TS-05/06" refers to the semantics/edge-tuple
regression suites — `coordinator/tests/test_dfquad.py`,
`test_qbaf_semantics.py`, `test_semantics_versions.py` — which pin explicit
node/edge-tuple assertions against the published DF-QuAD reference cases
(`test_golden_1_fake_news_case_study_matches_arxiv_2307_13582_fig3`,
`test_golden_2_ce_qarg_loan_approval_matches_arxiv_2407_08497_fig1`) plus
monotonicity/cycle/duplicate-edge properties, never fingerprint-only checks.
All green on this branch (see the acceptance test run below).

Any future default-semantics change stays G-B: it needs these suites green
and V's explicit sign-off. Nothing here prepares or schedules that flip.

---

## G-D — eligibility broadening (beyond empirical-only)

Currently: `GATE_ELIGIBLE_CLAIM_TYPES = frozenset({"empirical"})`
(`coordinator/app/scoring/verdict.py:34`) — the gate only ever evaluates
suppression for claims classified `"empirical"`; every other or unknown
claim type is `endorsed`/`endorsed_with_caveat`, never suppressed (binding
invariant, tested at both the pure-function and serialization/env-var
levels — see the G-A checklist item 5 above).

**Telemetry to collect before deciding:** `aggregates.claimTypeHistogram`
from `GET /api/ops/verdict-shadow` — the distribution of resolved claim
types (`empirical`, `normative`, `definitional`, `unknown`, ...) across
recently completed debates. The mixed-collapse concern
(`refactor-plan-final-stretch-v1.md` §8 Q4): most realistic
empirical-flavored topics may classify as something other than pure
`"empirical"` (mixed or causal framing), which would make the gate rarely
eligible in practice regardless of default. This histogram is the only way
to see that rate, and **it does not exist yet** — the endpoint is new on
this branch and no soak data has been collected.

**Two options from the plan** (§8 Q4), presented without a recommendation:

1. Broaden `GATE_ELIGIBLE_CLAIM_TYPES` to include `+causal` and/or a
   `+mixed-with-empirical-marker` category.
2. Sharpen the claim-type classifier itself so genuinely empirical claims
   are classified `"empirical"` more often, rather than broadening what the
   gate accepts.

This is V's call once `claimTypeHistogram` shows real numbers. No default
change is proposed here.

---

## Adaptive default-ON (`DIALECTICAL_ADAPTIVE_EXPANSION`) + v2_pov contract shrink

### Preconditions

- A soak run with `DIALECTICAL_ADAPTIVE_EXPANSION=1` on a **dev/staging**
  instance (never production — see `common-constraints.md`'s live-stack
  rules; this machine runs the production dezbatere.ro stack on the same
  ports this repo's tests are forbidden from binding) for a representative
  volume of debates, long enough to observe multiple dispatch rounds per
  debate and the loop terminating via each `stopped_because` value at least
  once.
- **Structural precondition, code-verified (W4):** with
  `DIALECTICAL_EVIDENCE_VERIFICATION` at its default OFF, no authenticated
  (grounded) `LifecycleDecisionRecord` can exist at all —
  `coordinator/app/exploration/scoring_completion_lifecycle.py:30-41`
  documents that the verification evaluator is the only writer of grounded
  evidence snapshots, so the fatal-flag / claim-type categorical signals
  that flow through the same authentication gate cannot fire either with
  verification off. Concretely: **enabling the automatic adaptive loop
  requires enabling verification too** — with verification off, only
  explicit user approvals (the approvals endpoint) can grow the tree, even
  with the adaptive flag on.
- **Cost/latency consequence of that dependency:** `DIALECTICAL_EVIDENCE_VERIFICATION=1`
  makes every scoring run call the verification evaluator
  (`coordinator/app/evidence/verification_evaluator.py`), which places one
  real judge-provider call per EVIDENCE node in the debate — in addition to
  the existing claim-scoring judge calls. This is real provider spend and
  real latency per node, not a one-time cost, and it compounds under
  adaptive expansion: the loop re-scores the whole debate after every
  completed expand round (`maybe_queue_rescore_after_expansion`), so up to
  `DIALECTICAL_EXPANSION_MAX_ROUNDS` (2, default) additional full re-scores
  per debate each pay the verification cost again for every evidence node
  then in the tree. This compounding is why a soak, not a smoke test, is the
  bar.
- **Budgets currently in force** (unchanged by this branch, `int_env`
  clamped, `coordinator/app/exploration/expansion_dispatch.py:44-49`):

  | env | default | clamp |
  |---|---|---|
  | `DIALECTICAL_EXPANSION_MAX_ROUNDS` | 2 | 0–20 |
  | `DIALECTICAL_EXPANSION_MAX_PER_NODE` | 2 | 0–20 |
  | `DIALECTICAL_EXPANSION_MAX_PER_DEBATE` | 6 | 0–100 |

### What the contract shrink will change

Today `v2_pov` materializes each perspective's full fixed-shape subtree in
one job at creation time. The plan (§6 W6) calls for shrinking that contract
to just the POV claim plus its strongest pro/con, with the deeper/nested
layer instead coming from `v2_expand` rounds — i.e. depth becomes an output
of the adaptive loop rather than a fixed creation-time shape.

**This is not implemented by this branch.** Nothing here touches `v2_pov`'s
job contract, prompt, or completion shape (`V2_GENERATION_JOB_TYPES = ("v2_pov", "v2_expand")`
in `coordinator/app/services/dialectical_v2.py` is unchanged).

**Why it must wait for soak:** shrinking the initial contract makes debates
structurally *depend* on the adaptive loop to reach useful depth. Flipping
that shrink before the loop has demonstrated it reliably grows and stops
(bounded, non-degenerate, an acceptable failure rate) would ship debates
that are shallow by default with no safety net if adaptive expansion
misbehaves in production traffic patterns the dev/staging soak didn't cover.

### Soak metrics to watch

Via `GET /api/ops/jobs?limit=N` (bearer user token; `limit` 1–500, default
100 — recent `job_transitions` plus `job_counts`/`job_counts_by_status`) and
`GET /api/ops/verdict-shadow`:

- **Spawn counts:** `v2_expand` job-creation transitions (`channel="create"`,
  `job_type="v2_expand"`) per debate, against the
  `MAX_PER_DEBATE`/`MAX_PER_NODE` ceilings — are debates routinely hitting
  the cap (signal the budget is too low) or rarely spawning at all (signal
  `no_categorical_signals` / verification isn't producing categorical
  grounding in practice)?
- **`stopped_because` distribution:** each adaptive debate's
  `debate.config.adaptive_expansion.stopped_because`, also surfaced on the
  wire via `completion.reasonCode`/`completion.humanReason`
  (`coordinator/app/exploration/expansion_dispatch.py:121`,
  `stopped_because_of`). Watch the mix of `budget_exhausted` /
  `deferred_no_capacity` / `no_categorical_signals` /
  `quiescent_no_decisions` / `generation_exhausted`. A soak dominated by
  `deferred_no_capacity` means worker capacity, not the algorithm, is the
  bottleneck; one dominated by `no_categorical_signals` means the
  verification evaluator rarely produces categorical grounding in practice.
- **Depth variance across debates:** node counts / materialized-path depth
  per debate should visibly differ once expansion is real — the plan's own
  W6 acceptance bar is "depth varies with signal pressure across debates."
  Today depth is a creation-time constant, so any variance observed during
  soak is itself the primary signal the feature is doing something.
- **Failure rates:** `job_counts_by_status` for `v2_expand` (the `failed`
  proportion) and the `generation_exhausted` share of `stopped_because` —
  confirms the terminal-failure path (W1) is absorbing bad expansions
  without wedging debates, per the wedge-free design invariant (synthesis
  queueing at the expand tail stays unconditional regardless of scoring
  outcome).

**No soak has been run on this branch.** The above describes what to look
at, not observed values.

### Rollback

Set `DIALECTICAL_ADAPTIVE_EXPANSION` back to unset/`0`. Flag-off is
byte-identical to the pre-flip serialized payload for dispatch bookkeeping —
`child_spawn_count` stays 0 and the dispatcher is never invoked (checked at
every call site before the call). No code path continues spawning once the
flag is off; in-flight/completed `v2_expand` jobs and their audit rows
(`LifecycleDecisionRecord.dispatch_outcome`, `child_spawn_count`) are left
exactly as persisted — additive-only, never rewritten, no data migration in
either direction. **If the `v2_pov` contract shrink has also shipped** by
the time of a rollback, reverting `DIALECTICAL_ADAPTIVE_EXPANSION` alone
would leave shrunk-contract debates without their depth-restoring loop — the
shrink and the flip are designed to ship and roll back together. Not a live
concern today since neither has shipped.

---

## Execution order

Per the plan (§6 W6, §8 Q3-Q5, §5.4): every flip above is a V decision,
executed only after V reviews the corresponding telemetry section above.
This document schedules none of them — it is the checklist V uses when they
choose to.

1. **G-A gate + banner** — after the shadow-window review is favorable. Gate
   first (server-side, burn in against `/api/ops/verdict-shadow`), banner
   second (see G-A "exact env changes" for why).
2. **G-D eligibility broadening** — after `claimTypeHistogram` shows the
   real mixed-collapse rate. Independent of G-A's timing; can run
   concurrently once both feeds have data.
3. **`DIALECTICAL_EVIDENCE_VERIFICATION=1` on dev/staging** — a soak
   *precondition* for adaptive default-ON, not itself a production flip.
4. **Adaptive default-ON + v2_pov contract shrink** — after the soak
   demonstrates bounded, non-degenerate growth. Designed to ship together
   (the shrink depends on the loop actually working).
5. **Every flip above is recorded as an explicit V decision** — per the
   plan's judge ruling ("Flip the honesty flags now? No... Flips move to the
   final wave"), this document only prepares the ground; V holds every
   switch.

---

## Config surface audit

Every `DIALECTICAL_*` / `NEXT_PUBLIC_*` flag this branch (`lane/final-stretch-v1`,
W0–W5b) introduced or touches. Verified against the code (`bool_env`/
`int_env`/`float_env` call sites and their defaults/clamps), not copied
blind from a wave report.

| Flag | Default | Type / clamp | What flipping it does | Introduced / touched |
|---|---|---|---|---|
| `DIALECTICAL_MAX_JOB_ATTEMPTS` | `4` | int, 1–100 | Retry budget before a retryable job goes terminal instead of looping forever. | **W1** (new) |
| `DIALECTICAL_VERDICT_EVIDENCE_GATE` | OFF | bool | ON: an eligible (empirical) claim with no evidence serves `suppressed` (withheld) instead of its computed band. OFF: shadow-only — `evidenceGateShadow` is still recorded on every response but never applied. | Pre-branch (T6); **touched by W2** (insufficient_scoring precedence ahead of it) and **W5b** (`/api/ops/verdict-shadow` review feed) |
| `NEXT_PUBLIC_VERDICT_FIRST_UI` | OFF (exact string `"true"` required) | Next.js public string flag | ON: mounts `VerdictBanner` and threads `synthesis.verdict_gate` into `SynthesisPanel`. OFF: neither renders. | Pre-branch (T7); **touched by W2** (insufficient_scoring copy) and **W5a** (drawer/derivation/completion rendering) |
| `DIALECTICAL_EVIDENCE_VERIFICATION` | OFF | bool | ON: real judge-provider verification call per EVIDENCE node on every scoring run; unlocks authenticated (grounded) lifecycle decisions — the only source of automatic categorical expansion signals. | Pre-branch (Phase 7); **interlocked by W4** (documented hard dependency for automatic adaptive dispatch) |
| `DIALECTICAL_DYNAMIC_PERSPECTIVES` | ON | bool | ON (current default): claim-type classification selects 2–5 dynamic lens perspectives at creation. OFF: legacy fixed-quartet path. Binding invariant: this default does not change on this branch. | Pre-branch (landed 2026-07-18); **touched by W5a** (`derivation` = claim_type/markers/lens_set serialization when ON) |
| `DIALECTICAL_ADAPTIVE_EXPANSION` | OFF | bool | ON: the scoring-completion tail dispatches categorical-grounded lifecycle decisions into bounded `v2_expand` jobs (real tree growth) and re-scores after each completed round. OFF: dispatcher never invoked, `child_spawn_count` stays 0, byte-identical payloads. | **W4** (new) |
| `DIALECTICAL_EXPANSION_MAX_ROUNDS` | `2` | int, 0–20 | Per-debate cap on automatic dispatch passes (soft loop bound — the per-debate job budget below is the hard cap). | **W4** (new) |
| `DIALECTICAL_EXPANSION_MAX_PER_NODE` | `2` | int, 0–20 | Cap on `v2_expand` jobs (any status) whose `parent_node_id` is a given node. | **W4** (new) |
| `DIALECTICAL_EXPANSION_MAX_PER_DEBATE` | `6` | int, 0–100 | Cap on `v2_expand` jobs (any status) per debate — the hard spawn ceiling. | **W4** (new) |
| `DIALECTICAL_REAPER_INTERVAL_S` | `60.0` | float, 0.05–3600 | Coordinator lifespan reaper's sweep interval for expired claimed/running jobs (excludes `score_debate`, which has its own stale-expiry path). | **W5b** (new) |
| `DIALECTICAL_ALLOW_MULTI_INSTANCE` | OFF | bool | ON: skips the single-instance advisory-lock guard at startup, allowing multiple coordinator processes against the same DB — an operator override for a deliberate multi-instance setup. | **W5b** (new) |

Flags intentionally **excluded** from this table as out of scope for this
branch (pre-existing, not introduced or materially touched by W0–W5b):
`DIALECTICAL_QBAF_DEBUG`, `DIALECTICAL_LINEAGE_INDEPENDENCE`,
`DIALECTICAL_CALIBRATION_DISCOUNT_FACTOR`, `DIALECTICAL_CALIBRATION_WEIGHTS`,
and the provider/infra config vars (`DIALECTICAL_WORKER_*`,
`DIALECTICAL_*_URL`, `DIALECTICAL_*_MODELS`, `NEXT_PUBLIC_API_BASE`, etc.).
