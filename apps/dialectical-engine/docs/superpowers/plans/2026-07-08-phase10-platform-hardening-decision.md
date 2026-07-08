# Phase 10 — Platform Hardening Decision Document

Status: DECISION RECORD (no code changes in this phase)
Scope: dialectical-engine coordinator + web, consolidating findings accumulated across P4-P9
Audience: V (commander), Hermes routing, future implementers picking up hardening tickets

This is a decision-and-prioritization document, not an implementation plan. It records
rulings that are now binding, states honest rationale, sets revisit criteria, and
prioritizes the hardening backlog that accumulated during the P4-P9 mission ledger
(`.hermes/live/claude-p4p8-progress.md`).

---

## 1. Decisions

### D1 — Stay Python (no TypeScript rewrite of coordinator/workers)

**Ruling (V, binding, non-negotiable):** The coordinator and worker processes remain
Python. No TypeScript port is undertaken in this mission.

**Rationale:** The coordinator is mid-buildout (P4-P9 landed graph adapter, 8-phase
protocol, lineage independence, evidence/verification, calibration, verdict-first UI —
all in Python/SQLAlchemy). A rewrite would freeze feature velocity for a horizontal
platform bet with no product requirement driving it. The web app is already TypeScript/
Next.js; the split (Python backend, TS frontend) is a normal polyglot boundary, not
technical debt.

**Revisit criteria (any one, not all):**
- Team composition shifts to majority TS/JS engineers with no Python maintainers.
- A concrete requirement emerges for shared type definitions across a language boundary
  that costs more in DTO-drift bugs than a rewrite would cost in schedule.
- Coordinator needs to be embedded in a Node-only runtime (e.g. edge/serverless
  constraint) for a deployment target not yet in scope.

### D2 — Stay SQLite (no Postgres migration)

**Ruling (V, binding, non-negotiable):** SQLite remains the persistence layer for the
current dev/local-first stage. No Postgres migration in this mission.

**Rationale:** Current deployment is single-writer, local-first, dev/demo scale. SQLite
has carried the full P4-P9 buildout (migrations 0010+, AnalyzerRun/NodeScoringResult/
Job tables, evidence substrate) without a correctness incident attributable to the
database engine itself. The known correctness issues in this codebase (see D3-adjacent
created_at-tie backlog item below) are query-construction bugs that reproduce on
Postgres too — swapping engines would not fix them and would add operational surface
(connection pooling, migration tooling divergence, deployment complexity) with no
matching product need yet.

**Revisit criteria (any one, not all):**
- Multi-writer production deployment (more than one coordinator process writing
  concurrently) becomes a real requirement — SQLite's single-writer lock model will
  become a throughput/latency ceiling.
- Cloud multi-tenant rollout — per the earlier production-cloud architecture research
  packet, the recommended path at that point is **Hybrid D** (not a same-shape Postgres
  swap-in; that packet should be re-read in full before any migration work starts).
- Sustained concurrent-debate load exceeds what SQLite's write-lock serialization can
  absorb without visible latency (needs a measured threshold, not a guess — tie this to
  the P11 swarm slice's load numbers once they exist).

### D3 — No judge rotation until pool substrate exists (P6 ruling, reaffirmed)

**Ruling (orchestrator, P6, reaffirmed here):** Judge rotation was explicitly scoped out
of P6. `detect_scoring_provider_config` resolves exactly one judge model system-wide;
there is no judge-pool plumbing. Lineage independence (P6) ships a binary block/proceed
guard plus an honest `no_independent_judge` error instead of rotation.

**Rationale:** Building rotation without a pool substrate would mean inventing the pool
abstraction under a different name, untested, inside an unrelated feature. Honest
single-judge-with-a-guard is a correct, shippable intermediate state.

**Revisit criteria:** Judge-pool plumbing lands (candidate slice: P8/P11 era per the
ledger) — rotation becomes a follow-on task on top of that substrate, not before.

### D4 — Verdict-first UI ships unstyled, flag-gated, manual checklist deferred

**Ruling (P9, reaffirmed here):** `VerdictBanner` and `DebateCanvas` low-strength dimming
ship behind `NEXT_PUBLIC_VERDICT_FIRST_UI`, default OFF, deliberately unstyled ("v1
sanctioned-disclosed"). Manual browser checklists from 9.2/9.4 were not run in-mission
(would require a live stack + rebuild-per-flag-toggle) and were carried to this document
instead of blocking phase closure.

**Rationale:** Source-tests + tsc + build gate correctness of the wiring; visual polish
and live-stack manual verification are a separable, lower-risk follow-up that doesn't
gate the underlying data-plumbing correctness.

**Revisit criteria:** Before flipping the flag default ON, the manual checklist must
actually run once against a live stack (see backlog P1 item below).

---

## 2. Hardening Backlog (prioritized)

Legend: effort is a one-line order-of-magnitude estimate, not a scheduled commitment.

### P0 — correctness/production-blocking

| Item | Description | Effort |
|---|---|---|
| **created_at-tie / monotonic-tiebreak systemic fix** | Three known "latest row" read sites resolve ties on `created_at` with a UUID `id.desc()` secondary sort, which is stable but not chronological (arbitrary insertion-order breakage on same-timestamp collisions). Sites: (1) `coordinator/app/scoring/service.py:130` — `node_scoring` latest-read, **confirmed flake root cause** (P9.1 Opus-diagnosed, the recurring maxDelta convergence-test flake traced upstream to here); (2) serialization `latest-protocol-analysis-run` read (P9.1, first served/public exposure — `detail["verdict"]`); (3) prior-protocol-run read at write time (P5c, "prod-safe at write time" per query-before-construct, but same tiebreak shape). | Medium — one schema migration (monotonic sequence column, e.g. autoincrement `seq_no`, or switch id generation to ULID/UUIDv7 for natural chronological sort) + update the 3 call sites' `order_by` clauses + regression-pin all 3 with synthetic same-timestamp fixtures. Single migration covers all three sites since they share the tiebreak pattern. |
| **P7 HARD GATE — latest-per-evidenceNodeId overlay** | Standing binding condition from P7.3: before ANY task wires `evaluate_evidence_verdict` as a production caller, or introduces re-verification, the runner overlay MUST switch from aggregate-all-verdicts to latest-per-evidenceNodeId. Currently inert only because the evaluator has zero production callers today — becomes a correctness bug the moment that changes. | Small-Medium — runner-only overlay logic change + test; must land in the same change as the first production caller, not after. |
| **Verifier prompt authoring (unblocks P7.2 evaluator)** | The verification evaluator is honest-closed today (structurally cannot fabricate "supported" — strict allowlist parser fails closed on unparseable output) but has no real verifier prompt; it is unwired pending one. This is the actual precondition for `DIALECTICAL_EVIDENCE_VERIFICATION` to produce real verdicts instead of `unparseable_verdict`. | Medium — prompt design + eval against sample evidence spans + integration test; couples with the HARD GATE item above once wired. |

### P1 — should land before next flag flips / before P11 widening

| Item | Description | Effort |
|---|---|---|
| **17 baseline env-harness failures — decide fix vs. quarantine** | Known-baseline set, unchanged across all of P4-P9 (verified at every phase gate: 17 failed/1356 passed/4 skipped at P9 close): `test_status_report`×10, `test_dev_guardian`×3, `test_dev_runner`×1, `test_local_cluster_check`×1, `test_makefile_targets`×1, `test_providers`×1. Root causes are env-harness plumbing + a foreign guardian WIP (Makefile/dev_guardian.py/start_dev.ps1 are one-writer-forbidden files per mission law, not owned by this mission). Honest options: (a) fix — requires touching guardian-owned files, blocked by mission law until that ownership question is resolved; (b) quarantine with `@pytest.mark.xfail(strict=False)` or a `known_env_failures` marker + CI allowlist, so the baseline count stops being manually re-verified by humans reading ledger prose every phase. **Recommendation: quarantine now (cheap, honest, machine-checked), fix later when guardian ownership is unblocked** — do not leave this as tribal knowledge in a ledger file indefinitely. | Small (quarantine) / Unknown (real fix — blocked on guardian file ownership, not effort). |
| **Manual browser checklists (P9.2 VerdictBanner, P9.4 canvas dimming)** | Not yet run against a live stack; required before `NEXT_PUBLIC_VERDICT_FIRST_UI` default flips ON. | Small — one live-stack session, both flag states, checklist already exists in P9 plan docs. |
| **DebateTree / ArgumentFocusView dead code** | P9.3 discovered `DebateTree` is unmounted; its only consumer `ArgumentNodeCard` is consumed solely by also-unmounted `ArgumentFocusView` — a triple-dead chain with zero user-visible value. The mandated P9.4 fix moved the real dimming behavior to the live path (`DebateCanvas`) instead. **Recommendation: delete the dead chain** (DebateTree, ArgumentFocusView, and their now-orphaned low-strength source-tests) rather than leave unmounted components accumulating drift against the live `DebateCanvas` implementation — dead UI code is a maintenance trap disguised as coverage. | Small — delete + remove now-pointless `DebateTree.lowStrength.source-test.mjs`, keep `DebateCanvas` tests as the real coverage. |
| **Web test-runner gap** | Repo convention is `*.source-test.mjs` (node:test regex over source) + `tsc` + `next build`, stated honestly in the P9 plan rather than pretending Jest/Vitest coverage exists. This is workable but has real limits: no component-render testing, no DOM assertions, no snapshot testing. **Recommendation: accept the source-test convention for now** (it has correctly caught real regressions across P9.2-9.4) but flag that it does not scale past simple prop/type-shape assertions — if UI logic complexity grows (e.g. real conditional rendering trees), add Vitest + Testing Library rather than stretching source-tests to do DOM verification they aren't built for. | Decision only, no effort now; Medium if/when Vitest is added later. |

### P2 — lower urgency, correctness-adjacent notes and comments

| Item | Description | Effort |
|---|---|---|
| **lineage_family future-caller comment** | P6.1 flagged `lineage_family` raw-passthrough as a latent leak vector for future unscrubbed callers. P8.3's fix wave structurally resolved the concrete instance (relocated `_public_metadata_text` + `SECRET_METADATA_MARKERS` to `lineage.py` as a leaf module), but the original one-line defensive comment for future callers was never separately added. | Trivial — one comment at the `lineage_family` field definition pointing future callers at the leaf-module scrub helper. |
| **verificationConflicts audit note** | P7.3: overruled-stray-verdicts (a verdict that gets superseded/overridden) are not currently recorded anywhere queryable. Candidate: add a `verificationConflicts` audit key alongside the existing `verificationSource` key. | Small — additive metadata key, no behavior change. |
| **epsilonSource marker** | P5c.2: no marker distinguishing "epsilon convergence threshold came from config" vs. "epsilon came from a default." Flagged as brief-inconsistent and deferred. | Trivial — one additional key on the convergence output payload (camelCase: `epsilonSource`, values e.g. `"config"` \| `"default"`). |
| **Flag-flip cache-staleness runbook note** | P8.2: flipping `DIALECTICAL_CALIBRATION_WEIGHTS` is not retroactive on already-cached scoring rows (same characteristic as all served overlays, e.g. lineage). Not a bug — an operational fact that needs to be a runbook line, not tribal knowledge: "flipping a scoring-overlay flag does not recompute cached rows; a cache invalidation pass is required to make old rows reflect new flag state." | Trivial — runbook doc line, no code. |
| **pending vs pending_verification distinct states** | P7.3: `"pending"` (real-verdict, all-unverifiable evidence) and `"pending_verification"` (kind-classifier state) are distinct and P9 consumers must not conflate them. P9.1 confirmed they were kept distinct. Recorded here as a standing downstream-contract note for any future consumer. | None — documentation note only, already respected in code. |
| **persist_evidence_nodes idempotency guard** | P7.1: lacks an idempotency guard; currently unreachable because it's gated by `ensure_mutable_claim`, but any future re-completion path would need the guard added first. | Small — add guard + comment before any re-completion path lands; not urgent while unreachable. |
| **POV-node prose extraction (v1 boundary)** | P7.1: POV-node prose is not extracted into evidence spans in v1; documented boundary, not a bug. | Documentation only unless product asks for POV evidence coverage. |

---

## 3. Flag Rollout Readiness

| Flag | What it does | Prerequisites before default-ON | Risk if flipped ON today |
|---|---|---|---|
| `DIALECTICAL_LINEAGE_INDEPENDENCE` | Enforces judge≠arguer model-family independence at every scoring write path (single choke point: `score_node_with_provider`). Off by default; recording (judgeLineage/arguerLineage/independent) is always-on regardless of flag. | Product sign-off on unknown-lineage-proceeds semantics (P6 implementer-flagged — today unknown lineage never blocks, by design; needs an explicit product decision that this is acceptable for GA, not just an engineering default). | Low-medium. Enforcement path is Opus-approved, single-choke-point verified, flag-off is byte-identical. Main risk is honest same-family blocks disrupting flows product hasn't reviewed yet — not a correctness risk, a UX/availability one. |
| `DIALECTICAL_EVIDENCE_VERIFICATION` | Gates creation of evidence-verification records via the verification evaluator (honest-closed parser, cannot fabricate "supported"). | (1) Verifier prompt authored (P0 backlog item above) — without it, flag-on today only ever produces `unparseable_verdict`, not real verdicts. (2) P7 HARD GATE (latest-per-evidenceNodeId overlay) must land before or alongside the first production caller of the evaluator. | Currently near-zero risk (flag has no production callers of the evaluator yet — P7.3 confirmed "inert today"). Risk becomes real and non-trivial the moment a production caller is wired without the HARD GATE fix landing first — stale/aggregate verdicts would dominate. |
| `DIALECTICAL_CALIBRATION_WEIGHTS` | Applies judge_weight / correlated_discount math at the `_attach_plural_judge_provenance` seam (N>=2 judgments only). Off by default; metadata-only disagreement detection is always-on. | (1) Manual review of the documented DB-ordering choice (first-by-provider/model-asc same-family judgment keeps weight 1.0) — this is a deliberate, disclosed default, not a bug, but needs explicit product/eng sign-off since it has real influence on scores. (2) Flag-flip cache-staleness runbook note (P2 backlog) should exist before ops flips this in a live environment with pre-existing cached rows. | Low. Math is independently hand-recomputed and Opus-verified non-circular; flag-off is byte-identical; div-by-zero fails closed. Main risk is stale cached rows silently keeping pre-flip scores until cache invalidation — an operational surprise, not a correctness bug. |
| `NEXT_PUBLIC_VERDICT_FIRST_UI` | Renders `VerdictBanner` + low-strength node dimming in `DebateCanvas` (build-time inlined, Next.js `NEXT_PUBLIC_` convention). Off by default. | Manual browser checklist (P1 backlog item) must actually run once against a live stack, both flag states — not yet done. | Low technical risk (source-tests + tsc + build all green, flag-off byte-identity structurally guaranteed for the dimming math). Main risk is unstyled/unpolished UI reaching users if flipped before a design pass — a product/UX risk, not a data-integrity one. |
| `DIALECTICAL_QBAF_DEBUG` | Exposes QBAF (Quantitative Bipolar Argumentation Framework) debug/introspection data — internal scoring computation visibility, not a product-facing feature. | None outstanding — P4.2 shipped this with regression-pinned filter mirroring, Opus-approved, "character-identical" to the underlying computation, error-path leak-free. | Very low. This is a debug/observability flag with no known open findings against it. Safe to leave on in non-production debug contexts today; should stay off in production by convention (debug surfaces shouldn't be default-on regardless of risk level). |

---

## 4. P11 Gate Assessment

The mission gates P11 (swarm initial slice) on **credible P5-P8 proofs**. This section
enumerates what was actually delivered as evidence, and states honestly what is and
isn't proven.

### What P5-P8 delivered, and the evidence for it

| Claim | Evidence | Proven? |
|---|---|---|
| Protocol runs persist real, structured analysis (8-phase protocol state machine) | All 8 phases registered end-to-end (P5a/b/c); phase gate at P5 close: 17 known-baseline failures / 1277 passed / 4 skipped, +45 net-new passing, zero regressions vs. P4. Guard-hardening + synthetic frozenset coverage closes the "phase can silently stay not_implemented" hole. | **Yes** — proven by a real, growing regression suite exercising the actual phase transitions, not mocks of the phase machine itself. |
| Judge≠arguer lineage independence is real and enforceable | P6: lineage always recorded (real computed `independent` flag comparing arguer/judge model families, null+reason when unknown, secret-scrubbed); enforcement at the single shared write-path choke point (`score_node_with_provider`), verified to cover all 3 entry paths (background job, force-refresh API, `ensure_node_scoring_on_completion`) after the P6.2 fix wave. Flag default OFF. | **Yes, for the plumbing.** The independence *mechanism* is proven (Opus re-review approved, bypass tests exist). What is **not** proven: whether judge independence actually improves calibration/quality in practice against a live model roster — that requires the rotation/pool substrate explicitly scoped out (D3), so it's an open question by design, not a gap in P6's delivery. |
| Verdicts come from real judges producing trustworthy assessments | Evidence substrate (P7.1) and verification evaluator (P7.2) are real, migration-backed, Opus-approved, honest-closed (cannot fabricate "supported"). | **NOT yet exercised end-to-end against a live model.** The evaluator has zero production callers today (P7.3: "inert today") and no real verifier prompt exists yet (P0 backlog item). What's proven is that the pipeline *cannot lie* when it does run (fails closed to `unparseable_verdict`) — not that it has produced a single real verdict against live provider output. This is the single biggest gap between "mechanism proven" and "capability proven" in the whole P5-P8 set. |
| Calibration adjusts for correlated judge error | P8: pure calibration module (P8.1) hand-verified on 4 worked examples; flag-gated weighted integration (P8.2) independently re-derived to 0.58, non-circular, flag-off byte-identical; Brier/ECE stubs (P8.3) are honest always-null with `no_ground_truth_outcomes`, not fabricated numbers. | **Substrate only, no ground truth.** The math is correct and non-circular by hand-verification, but there is no resolved-outcome data anywhere in the system yet (repo-wide grep confirmed zero `resolvedOutcomes` sources) — so calibration quality itself (does the weighting actually track real judge error correlation?) is **unproven and structurally unprovable today**. This is honest by design (P8.3 refused to fabricate a Brier/ECE number) but it means "calibration works" is not yet a claim P5-P8 can support — only "calibration math is implemented correctly" is. |
| Verdict-first UI reflects real backend state without lying to users | P9: verdict summary keyed off real root-claim adapter data, pending/pending_verification kept distinct, full-precision numbers confined to details (headline uses claim-language, not raw floats), flag-off byte-identical, abandoned/greyed nodes never re-gated. | **Yes for correctness of wiring; no for live user validation.** Source-tests + tsc + build all green; the actual visual/UX manual checklist against a live stack was never run (carried to this doc as a P1 backlog item). |

### Overall assessment

The **mechanisms** built in P5-P8 (phase persistence, lineage independence enforcement,
evidence/verification pipeline, calibration math, verdict-first serving) are real,
tested, and Opus-reviewed at every step — this is not a facade. But three specific
capability claims are **not yet exercised against live, non-mock conditions**:

1. No real evidence verdict has ever been produced against live provider output
   (no verifier prompt, zero production callers of the evaluator).
2. No calibration weighting has ever been checked against a real resolved-outcome
   ground truth (none exists in the system).
3. The created_at-tie flake (P0 backlog item) is a live, currently-unfixed correctness
   bug in exactly the "latest scoring/verdict" read path that a swarm slice would
   stress hardest (concurrent writes racing on timestamp resolution).

### Recommendation: **CONDITIONAL-GO** for a minimal P11 slice

Conditions, in order of blocking severity:

1. **Must fix before P11 starts:** the created_at-tie / monotonic-tiebreak systemic fix
   (P0 item #1). A swarm slice increases concurrent-write pressure on exactly the query
   pattern that already has a confirmed flake root cause at
   `coordinator/app/scoring/service.py:130`. Shipping a swarm slice on top of an
   already-diagnosed race-prone read is avoidable risk with a known, scoped fix.
2. **Must be true before P11, or explicitly scoped out of the P11 slice itself:** if the
   P11 slice touches evidence verification or calibration-weighted scoring at all, the
   P7 HARD GATE (latest-per-evidenceNodeId overlay) must land first — do not let P11 be
   the accidental first production caller that trips the standing hard gate.
3. **Should be true, not strictly blocking:** the 17 baseline env-harness failures should
   at minimum be quarantined (P1 item) before P11 adds more test volume on top of an
   already-manually-tracked baseline — an unquarantined baseline makes it harder to tell
   a P11 regression from a pre-existing known failure by CI signal alone.
4. **Explicitly not required for P11 GO:** judge rotation (D3 — correctly out of scope
   until pool substrate exists), verdict-first UI manual checklist (P9 UI is not on the
   swarm's critical path unless P11 exposes new UI surface), Postgres/TypeScript
   questions (D1/D2 — orthogonal to whether a minimal swarm slice can start).

In short: the proof P5-P8 delivered is strong on *mechanism correctness* and honest about
where it stops short of *capability proof* (real verdicts, real calibration ground
truth). That gap is acceptable for a **minimal, explicitly-scoped** P11 slice as long as
the one live correctness bug in the read path it will stress hardest (item 1 above) is
fixed first, and the standing P7 hard gate isn't silently tripped by whatever P11
touches.

## Review addendum (Opus doc review, 2026-07-08)

- **Backlog add (P2, open decision):** POV→root support-edge mapping in the QBAF adapter (P4 follow-up) remains flagged for **Hermes adjudication** — an open product/semantics decision, not a cosmetic nit.
- **P11 scope clarification (binding per review):** the minimal P11 slice must **NOT** wire the evidence verification evaluator or claim real-model verdicts — neither capability is proven yet (no verifier prompt, zero production callers). "Minimal slice" stays honest: orchestration mechanics only.
