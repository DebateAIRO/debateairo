# Flip plan — 2026-07 (whole-branch flag surface, staged order)

**Status: preparation only.** No flag default anywhere in this repository was
changed to produce this document, and nothing here flips a flag. Every
decision below belongs to whoever operates the live dezbatere.ro stack (V, in
`refactor-plan-final-stretch-v1.md`'s terms — see `docs/flip-readiness-final-
stretch.md`'s header for that document's own framing of the same rule), made
on evidence gathered after this branch ships. This document exists so the
staged order, preconditions, verification steps, and rollback mechanics for
**every** `DIALECTICAL_*`/`NEXT_PUBLIC_*` flag this branch (`docs/improvement-
plan-2026-07-22.md`, tasks T1–T16) introduced or made production-ready are in
one place, in the order they should be flipped.

This document **supplements, not replaces**,
[`docs/flip-readiness-final-stretch.md`](./flip-readiness-final-stretch.md)
(hereafter "the G-A doc"): that document already covers the verdict-evidence
gate (G-A), the semantics default (G-B), gate-eligibility broadening (G-D),
and an early cut of adaptive-expansion default-ON — written before Tasks
10–16 landed the evidence-acquisition, verification, DF-QuAD, adversarial-POV,
cross-exam, and adaptive-expansion-readiness work those sections either
didn't yet cover or only partially covered. Rather than rewrite the G-A doc's
existing sections (which remain accurate for what they cover) around a
different structure, this document adds the missing staged order across the
**whole** flag surface and links back to the G-A doc for the flags it already
documents in full detail (evidence gate, semantics, eligibility).

Every flag name, default, and code reference below was verified directly
against the code on this branch at the time of writing (commit `cad8188` and
this task's own commits), not copied from a task report without checking.

**Operational context** (see the operator's own notes, not reproduced in
full here): the coordinator on this Mac runs the **production** dezbatere.ro
stack via launchd (`com.dialectical.coordinator`, `com.dialectical.web`).
Model workers are per-provider "subscription loop" shell loops (tmux, not
launchd) invoking `claude`/`agy`/`grok` CLIs one-shot every ~60s via
`scripts/dezbatere_loop_helper.sh`. Judge scoring (including any judge panel,
step 3 below) runs **in-coordinator** via CLI providers, not through a
worker round trip. Every flip below is a live-stack config change — there is
no separate staging deployment. Soak/verification windows should use real
but low-stakes debates and should be reviewed via the read-only `/api/ops/*`
endpoints (bearer user token) rather than by tailing production traffic
blind.

---

## Staged flip order

Preconditions are cumulative: each step assumes every earlier step is
already flipped ON and has been observed healthy, except step 5, which is
explicitly independent and may run concurrently with any other step.

| # | Flag(s) | Depends on |
|---|---|---|
| 1 | `DIALECTICAL_EVIDENCE_ACQUISITION` | healthy Claude loop worker w/ WebSearch |
| 2 | `DIALECTICAL_EVIDENCE_VERIFICATION` | 1 (needs acquisition producing nodes) |
| 3 | `DIALECTICAL_JUDGE_PANEL_MODELS` + `DIALECTICAL_CALIBRATION_WEIGHTS` | independent of 1–2; needs extra judge CLIs |
| 4 | `DIALECTICAL_ADAPTIVE_EXPANSION` | 1 + 2 (needs real evidence signals) |
| 5 | `DIALECTICAL_ADVERSARIAL_POV` / `DIALECTICAL_CROSS_EXAM` | independent of everything else; cost-bearing |
| 6 | `DIALECTICAL_VERDICT_EVIDENCE_GATE` + `NEXT_PUBLIC_VERDICT_FIRST_UI` | LAST — see the G-A doc |

---

### 1. `DIALECTICAL_EVIDENCE_ACQUISITION`

**What it does.** Default OFF. ON: `v2_pov`/`v2_expand` completion queues a
`v2_evidence` job per evidence-eligible argument node (the same deterministic
`empirical`/`causal` classifier scoring uses), which asks a search-capable
worker to retrieve independent sources and materializes `EVIDENCE` nodes
with real retrieval provenance (`method: "retrieval"`), instead of only the
pre-existing regex-extracted "model-claim" evidence. AUXILIARY job class: a
terminal failure never damages the node or debate. Full detail:
[`docs/evidence-acquisition.md`](./evidence-acquisition.md).

**Precondition — a healthy Claude loop worker with WebSearch.** Retrieval
rides `DIALECTICAL_EVIDENCE_SEARCH_MODELS` (default `claude-sonnet-5-high-
loop`, comma-separated, round-robins the **online** subset). The loop
worker's `claude -p` invocation gains `--allowedTools WebSearch` only for
`v2_evidence` jobs (`scripts/subscription_loop.py::claude_once`) — this
requires the Claude subscription-loop tmux worker to be running and online
(`Worker.status == "online"`, recent `last_seen`), and for the underlying
`claude` CLI session to actually have WebSearch tool access available (not
blocked by account/tool restrictions). If no search model is online, jobs
queue but stay pending (never silently reroute onto a non-search model —
`app/services/orchestrator.py::next_failover_model`'s search-pool routing).

**Budgets** (`docs/evidence-acquisition.md`'s table): `DIALECTICAL_EVIDENCE_
MAX_PER_NODE` (2, clamp 0–20), `DIALECTICAL_EVIDENCE_MAX_PER_DEBATE` (6,
clamp 0–200); at most 3 sources per job.

**Verification.**
1. Flip `DIALECTICAL_EVIDENCE_ACQUISITION=1` on the coordinator process and
   restart it (launchd `com.dialectical.coordinator`).
2. Start (or confirm running) the Claude subscription-loop tmux worker.
3. Start a fresh debate with an empirical/causal-sounding topic; watch for
   `v2_evidence` jobs via `GET /api/ops/jobs?limit=N` (`job_type=
   "v2_evidence"`, `channel="create"` transitions) and confirm they reach
   `complete` with materialized `EVIDENCE` nodes (position band `2000+`,
   `evidence_metadata.method == "retrieval"`) rather than staying pending
   forever.
4. Confirm citation resolution ran: the same nodes' `evidence_metadata.
   resolution_status` becomes `resolved_quote_found` / `resolved_quote_
   missing` / `unreachable` shortly after materialization (fire-and-forget
   thread; not immediate).
5. Confirm a `v2_evidence` failure never surfaces as `node_failed`/
   `debate_failed` (AUXILIARY posture) — the debate and its argument nodes
   stay untouched.

**Rollback.** Set `DIALECTICAL_EVIDENCE_ACQUISITION` back to unset/`0` and
restart. No new `v2_evidence` jobs queue; nothing spawned so far is deleted
or reinterpreted (additive-only, no data migration either direction) — the
debate simply stops gaining new retrieval evidence going forward.

---

### 2. `DIALECTICAL_EVIDENCE_VERIFICATION`

**What it does.** Default OFF. ON: every scoring pass calls a real
judge-provider verdict (`supported`/`contradicted`/`unverifiable`) for each
verification-eligible `EVIDENCE` node under a freshly-scored claim
(`app/evidence/verification_evaluator.py::evaluate_evidence_verdict`), one
call per evidence node, requiring a judge **independent** in lineage from
the argument's author (fails closed to `unverifiable` otherwise — never a
fabricated verdict). This is the **sole** writer of grounded evidence
lifecycle signals: with this flag off, no `EvidenceLifecycleSnapshot` (and
therefore no authenticated `LifecycleDecisionRecord`) can exist at all — see
step 4.

**As of this task (T16, P3.2):** a real `supported` verdict authenticates
`EvidenceStatus.GROUNDED`/`SUPPORTS` (unchanged since Task 11); a real
`contradicted` verdict now also authenticates `EvidenceStatus.CONTRADICTED`/
`REFUTES` (fixed sentinel confidence — the verifier schema never elicits a
magnitude for this branch, only the verdict itself, mirroring `app.qbaf.
debate_adapter.CONTRADICTED_EVIDENCE_TAU`'s established posture); a real
`unverifiable` verdict now authenticates `EvidenceStatus.NO_INFO`/`NOINFO`.
Before this task, only `supported` ever produced anything other than a
withheld/unauthenticated evidence signal — `contradicted` and `unverifiable`
were indistinguishable, at the lifecycle-input layer, from an infra failure
(timeout/provider error) that produced no real verdict at all. That silently
made `app.exploration.policy`'s `challenge` and `seek_evidence` branches
structurally unreachable even with this flag on (see `coordinator/tests/
test_verification_evaluator.py`'s "Task 16" section and `coordinator/app/
exploration/lifecycle_decision_service.py`'s `_EVIDENCE_AUTHENTICATING_
STATES`). `AnalyzerRun.output["baseScore"]` (the DF-QuAD/Task-12 contract) is
untouched by this change — it stays honestly `None` for both `contradicted`
and `unverifiable`, exactly as before.

**Precondition — acquisition producing nodes (or the always-on extractor).**
Verification runs against **whichever** `EVIDENCE` nodes exist under a
scored claim: the always-on regex extractor (`method: "model-claim"`, live
regardless of step 1) or step 1's retrieval nodes (`method: "retrieval"`),
skipping only nodes whose citation resolved `unreachable`. Flipping this
flag with step 1 still off is legal and will verify extractor evidence, but
verifying against genuinely independent retrieved sources (the point of
this whole wave) needs step 1 on and healthy first.

**Cost/latency.** One real judge-provider call per `EVIDENCE` node on
**every** scoring run — additive to the existing per-claim judge calls, and
compounding under step 4 (adaptive expansion re-scores the whole debate
after every completed round).

**Verification.**
1. Flip `DIALECTICAL_EVIDENCE_VERIFICATION=1`, restart the coordinator.
2. On a debate with at least one `EVIDENCE` node (extractor or retrieval),
   trigger a scoring pass and confirm an `evidence_verification` `AnalyzerRun`
   is created per eligible evidence node (`GET /api/ops/jobs` won't show
   this directly — it's not a job, it runs inline inside `score_debate`;
   query the debate's protocol-analysis / verification data via the debate
   detail API, or inspect `evidence_verification` rows directly).
3. Confirm the 5.5 protocol-runner overlay's `verificationStatuses`/
   `verificationSource` reflect the real verdict (`"real_verdict"`, not
   `"kind_classifier"` fallback) for a verified claim.
4. Confirm DF-QuAD picks up a `supported`/`contradicted` verdict as a real
   graph edge (`docs/evidence-acquisition.md`'s Verification section).
5. Confirm the independence guard: a same-family judge/arguer pair never
   calls the provider (`reason: "no_independent_judge"`, `unverifiable`).

**Rollback.** Set back to unset/`0`, restart. No new verification calls;
existing `evidence_verification` rows and `EvidenceLifecycleSnapshot`s are
left exactly as persisted (additive-only). The 5.5 overlay and DF-QuAD
degrade to their pre-verification no-op reading (kind-classifier fallback /
no edge) on the next scoring pass.

---

### 3. `DIALECTICAL_JUDGE_PANEL_MODELS` + `DIALECTICAL_CALIBRATION_WEIGHTS`

**What they do.** `DIALECTICAL_JUDGE_PANEL_MODELS` (default unset/empty —
comma-separated model ids, `app/scoring/judge_panel.py`): when set, each
listed model that resolves to a family with a working in-process CLI
provider (today: `claude`, `gemini` — `app/providers/judge_panel_providers.
py`) becomes a **secondary** judge, run in-process alongside the primary
(`codex`, `gpt-5.6sol-medium`) judge for every scored node — the empty/unset
default keeps the single-judge path byte-identical. A panel member
failing/timing out degrades to the remaining judges (never fails the
scoring run); disagreement across panel judgments is persisted
(`judge_disagreements`, `disagreement_status`) regardless of the calibration
flag. `DIALECTICAL_CALIBRATION_WEIGHTS` (default OFF, `app/scoring/service.
py`): with 2+ judgments, applies a correlated-family discount
(`DIALECTICAL_CALIBRATION_DISCOUNT_FACTOR`, default `0.5`, clamp 0.0–1.0) to
the weighted score aggregate. The discount/weights metadata is **always**
computed and recorded regardless of this flag (honest bookkeeping); only the
score-affecting weighted aggregate itself is gated.

**Precondition — extra judge CLIs available in-coordinator.** Judge scoring
(primary and panel) runs **in-coordinator**, not through a worker loop — the
panel needs the `claude`/`gemini` CLIs (whichever families are listed)
actually installed, authenticated, and callable in-process on the
coordinator machine, in addition to the existing `codex` primary judge. An
unrecognized family or a recognized-but-unavailable CLI is a per-model skip
(recorded in `score_provenance.judge_panel_notes`), never a hard failure —
but a panel entirely composed of skips reproduces today's single-judge
behavior silently, so verify actual panel participation, not just that the
flag is set.

**Verification.**
1. Confirm the listed CLIs work standalone on the coordinator machine before
   touching the flag.
2. Set `DIALECTICAL_JUDGE_PANEL_MODELS` (e.g. `claude-sonnet-5-high-loop,
   gemini-...`), restart the coordinator.
3. Score a node and inspect `score_provenance.judge_panel_notes` — confirm
   the expected models actually participated (not all skipped) and that
   `judge_participation`/`disagreement_status` populate for 2+ judgments.
4. Only then consider `DIALECTICAL_CALIBRATION_WEIGHTS=1` and confirm the
   weighted aggregate actually differs from the single-judge score on a case
   with real cross-family disagreement (else the discount is a silent no-op).

**Rollback.** Unset `DIALECTICAL_JUDGE_PANEL_MODELS` (empty list ⇒ panel
disabled, single-judge path byte-identical) and/or `DIALECTICAL_CALIBRATION_
WEIGHTS` back to `0`; restart. Already-persisted `judge_panel_notes`/
`judge_disagreements`/calibration metadata on past runs are untouched
(additive, never rewritten).

---

### 4. `DIALECTICAL_ADAPTIVE_EXPANSION`

**What it does, budgets, and the full soak/rollback plan** are already
documented in the G-A doc's ["Adaptive default-ON" section](./flip-
readiness-final-stretch.md#adaptive-default-on-dialectical_adaptive_expansion--v2_pov-contract-shrink)
— read that section in full before flipping this flag. This section only
records what changed since that section was written.

**Update from this task (T16, P3.2).** The G-A doc's structural precondition
("enabling the automatic adaptive loop requires enabling verification too")
still holds exactly as written — verification (step 2) remains the sole
source of grounded evidence signals. What changed: **before this task, that
precondition was necessary but not sufficient** — even with both flags on,
`app.exploration.policy`'s `challenge` (needs `EvidenceStatus.REFUTED/
CONTRADICTED` + `EntailmentLabel.REFUTES`) and `seek_evidence` (needs
`EvidenceStatus.MISSING/UNAVAILABLE/NO_INFO`) branches were structurally
unreachable through the real verifier pipeline — only `abandon`/`reopen`
(and the scalar `continue`/`deepen` fallbacks, which never spawn) could ever
authenticate, because only a `supported` verdict ever produced a usable
evidence signal (see step 2's update). This task closed that gap: a real
`contradicted`/`unverifiable` verdict now authenticates too, so `challenge`
and `seek_evidence` are reachable and dispatchable — proven end-to-end by
`coordinator/tests/test_adaptive_expansion.py::test_real_contradicted_
verifier_verdict_authenticates_challenge_and_dispatches_expand_job` and
`::test_real_unverifiable_verifier_verdict_authenticates_seek_evidence_and_
dispatches_expand_job` (real scoring completion → verification → lifecycle
decision → `expansion_dispatch` → a real `v2_expand` job → the audited
`LifecycleDecisionRecord`, no scripted decision function anywhere in the
chain). The G-A doc's soak-metrics guidance (`stopped_because` distribution,
spawn counts vs. budget ceilings, depth variance) is now more likely to show
real signal — the loop's full decision vocabulary is live, not just the
`abandon` slice of it.

**Known interaction: adaptive dispatch can race a pending synthesis
(reviewer follow-up, not fixed by this task).** Making `challenge`/
`seek_evidence` reachable (above) also makes a narrow, already-bounded race
reachable: a generation-completion tail can see the tree quiescent and queue
a `v2_synthesize` job (`app/services/dialectical_v2.py::
queue_v2_synthesize_job`) at the same moment an in-flight scoring pass's
adaptive dispatch (`app/exploration/expansion_dispatch.py::admit_and_spawn`)
authenticates a fresh categorical decision and spawns a `v2_expand` job
through the same W3 primitive every other expansion uses. When that happens,
the pending synthesis submission fails `persist_v2_synthesis`'s own
whole-tree quiescence re-check (`ValueError: "Cannot synthesize until all
branches and expansions are complete"`, surfaced to the worker as HTTP 400)
and burns one attempt (`Job.attempts` counts claims) before the expansion's
own completion tail re-queues synthesis once the tree is quiescent again.
This is bounded on every axis that matters, never open-ended: `DIALECTICAL_
MAX_JOB_ATTEMPTS`/`max_job_attempts()` caps how many attempts a job can burn
before terminalizing, the adaptive dispatcher's own round/per-node/
per-debate budgets (`DIALECTICAL_EXPANSION_MAX_ROUNDS`/`_PER_NODE`/
`_PER_DEBATE`) cap how often it can fire at all, and every `queue_v2_
synthesize_job` call site's `existing_synthesis` check means the debate is
never left with two `v2_synthesize` jobs pending at once (no double-queue).
The cost is a wasted attempt and a delayed synthesis, never a stuck or
duplicated debate. Operators soaking this step should expect a nonzero
"synthesize retries during adaptive rounds" signal and should not treat it
as a bug by itself — only investigate if it grows unbounded or a debate
fails to ever synthesize. A future claim-gate mirroring `v2_synthesis_
claim_blocked`'s existing deferral pattern (defer a pending `v2_synthesize`
claim while a categorical dispatch decision is imminent, the same way
score-before-synthesis already defers it on scoring) would remove the
burned attempt entirely; that gate does not exist today and is out of scope
for this task.

**`lifecycleDecisions` on the wire.** Also verified/closed by this task: the
debate payload's `lifecycleDecisions` array (`app/services/serialization.
py::_lifecycle_decisions_payload`), the web types (`LifecycleDecision` in
`web/lib/types.ts`), and the `NodeDetailDrawer` render slot were **already
fully wired** (landed with decision-provenance serialization, W5a) — the
reason production has zero rows today is entirely the write-path gap this
task closes (verification producing only `abandon`/`reopen`-authenticating
signals, or nothing at all with the flag off), not a missing read/
serialization path. No web changes were needed.

**No soak has been run on this branch** (T16 or otherwise) — the above
updates what to expect from a soak, not an observed result.

---

### 5. `DIALECTICAL_ADVERSARIAL_POV` / `DIALECTICAL_CROSS_EXAM`

**Independent of every other step** — both flags default OFF, touch only
`v2_expand` challenge jobs against already-complete claims, and are
reasoned to compose safely together and with step 4 (structurally shared,
collision-free position/quiescence handling — see Task 14/15's reports'
"Concerns" sections for the exact reasoning, not re-exercised by a combined
test). They may be flipped in any order relative to steps 1–4, but **are
real generation cost**, so size them independently of the readiness work
above.

**`DIALECTICAL_ADVERSARIAL_POV`** (default OFF, `app/services/dialectical_
v2.py`): the `v2_pov` proposer writes only the PRO side; a **different**
model family authors the CON attacks via two extra `v2_expand` jobs per
branch (queued on proposer completion). Cost: +2 generation jobs per POV
branch versus the legacy self-play path, one of which uses a cross-family
model specifically to stress-test the claim.

**`DIALECTICAL_CROSS_EXAM`** (default OFF): a skeptic wave immediately
before synthesis — one `v2_expand` CHALLENGE job per completed POV branch
(against that branch's strongest-scored claim), capped by `DIALECTICAL_
CROSS_EXAM_MAX_JOBS` (default `8`, clamp 0–20; `0` disables the wave even
with the flag on). Cost: up to `min(branch_count, cap)` extra generation
jobs per debate, once, before synthesis — delays synthesis by one
generation round-trip.

**Verification (either flag).** Flip, restart, run a debate, confirm: (a)
the expected extra `v2_expand` jobs appear and complete; (b) the attacker/
skeptic model is genuinely cross-family from the attacked claim's author
(payload `adversarial_attacker_reason` / cross-exam's attacker-selection
reasoning — same-family fallback is honest, not silently substituted); (c)
an attacker/skeptic terminal failure degrades the single CON node, never the
debate (`AUXILIARY`-for-cross-exam / `NODE_DEGRADABLE`-for-adversarial-POV
posture — see Task 14/15 reports); (d) synthesis still completes.

**Rollback.** Unset either flag, restart. Flag-off is byte-identical to the
pre-flip legacy path (self-play POV / no skeptic wave) — no data migration;
already-materialized attacker/skeptic nodes from while the flag was on are
left exactly as persisted.

---

### 6. `DIALECTICAL_VERDICT_EVIDENCE_GATE` + `NEXT_PUBLIC_VERDICT_FIRST_UI`

**LAST, and only after shadow telemetry review.** Full preconditions,
evidence-to-review shape (`GET /api/ops/verdict-shadow`), manual
verification checklist, exact env changes, and rollback are in the G-A
doc's ["G-A" section](./flip-readiness-final-stretch.md#g-a--flip-
dialectical_verdict_evidence_gate--next_public_verdict_first_ui-to-default-on)
— nothing here supersedes it.

**Why this is explicitly last, restated from the plan (§1.2/§3.6, cited
per this task's brief):** flipping the verdict evidence gate before
acquisition (step 1) and verification (step 2) demonstrably populate real
evidence in production would permanently suppress empirical verdicts —
`wouldSuppress` would read ~100% on empirical-claim roots not because
evidence genuinely never exists, but because nothing upstream had ever
produced it. This flip-order discipline is the reason steps 1–2 are staged
before this one at all, and it is unaffected by this task's T16 findings —
the evidence-verification write-path gap this task closed affects the
**lifecycle policy's** categorical steering (step 4), not the verdict
gate's own `evidence_quality`/claim-type eligibility check
(`app/scoring/verdict.py`), which was already live in shadow mode and
already reads real (if until-now sparse) evidence signals from steps 1–2.

---

## Flags already default-ON from this branch

Operators should know the full surface, not just what's still off:

| Flag | Default | Note |
|---|---|---|
| `DIALECTICAL_SCORE_BEFORE_SYNTHESIS` | **ON** | This branch (T8/P4+P3.4). Synthesis defers until score-before-synthesis conditions are met; already live in production. |
| `DIALECTICAL_SYNTHESIZER_ROTATION` | **ON** | This branch (T8). Synthesizer model selection rotates rather than pinning the anchor; already live in production. |
| `DIALECTICAL_MODEL_FAILOVER` | **ON** | Pre-existing (not introduced by this branch), included here for completeness of the operator-facing surface. Cross-model failover ladder before a terminal branch failure. |

No default flip is proposed for any of the three above — they document the
current, already-live state so this document's staged list (which covers
only flags still at their OFF default) isn't mistaken for the complete
picture.

---

## Execution order summary

1. **`DIALECTICAL_EVIDENCE_ACQUISITION`** — after confirming a healthy
   Claude loop worker with WebSearch access.
2. **`DIALECTICAL_EVIDENCE_VERIFICATION`** — after step 1 is producing real
   `EVIDENCE` nodes (or accepting extractor-only coverage as a smaller
   first step).
3. **`DIALECTICAL_JUDGE_PANEL_MODELS` (+ optionally `DIALECTICAL_
   CALIBRATION_WEIGHTS`)** — independent timing; needs extra judge CLIs
   confirmed working in-coordinator first.
4. **`DIALECTICAL_ADAPTIVE_EXPANSION`** — after 1 + 2 are both healthy; run
   the soak the G-A doc describes before considering the `v2_pov` contract
   shrink it's designed to pair with.
5. **`DIALECTICAL_ADVERSARIAL_POV` / `DIALECTICAL_CROSS_EXAM`** — any time;
   independent and cost-bearing, size deliberately.
6. **`DIALECTICAL_VERDICT_EVIDENCE_GATE` + `NEXT_PUBLIC_VERDICT_FIRST_UI`**
   — LAST, only after `/api/ops/verdict-shadow` shows `wouldSuppress` is no
   longer ~100% on empirical-claim roots. Gate first, banner second (G-A
   doc).

Every flip above is an explicit operator decision made after reviewing the
corresponding evidence — this document schedules none of them.
