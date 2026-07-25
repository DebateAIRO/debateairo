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

## How to set a coordinator flag so it survives (READ FIRST)

**Editing the live `~/Library/LaunchAgents/com.dialectical.coordinator.plist`
directly does NOT persist.** The `com.dialectical.watchdog` service, on seeing
the coordinator briefly down (e.g. during your restart), calls
`install_core_services()` → `make install-services`, which **regenerates the
live plist from the git-tracked template
`deploy/launchd/coordinator.plist`** (verified 2026-07-23: a `PlistBuddy` edit
adding the evidence flags was reverted within seconds, and the watchdog
respawned the coordinator from the clean template with the flags absent).

To flip a coordinator env flag durably:
1. Add the `<key>`/`<string>` pair to the `EnvironmentVariables` dict in
   `deploy/launchd/coordinator.plist` (the template — NOT the installed copy).
2. `cd apps/dialectical-engine && make install-services` (regenerates the live
   plist from the template and reloads the service).
3. Verify the **running** daemon actually has it (SIP hides daemon env from
   `ps eww`, so confirm behaviorally — start a debate and observe the flag's
   effect, e.g. `v2_evidence` jobs appearing — not by inspecting the plist).
Rollback is the reverse: remove the pair from the template, `make
install-services`. The subscription-loop workers are tmux/shell, not launchd —
their env is set where the loop is launched, not here.

> The individual steps below say "flip … and restart the coordinator" — do that
> via this template path, never by editing the installed plist in place.

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
| 7 | `DIALECTICAL_HIERARCHICAL_SYNTHESIS` → `DIALECTICAL_FIELD_DISAGREEMENT` → `DIALECTICAL_ADAPTIVE_EXPANSION` | P1 contested frontier; 7c supersedes row 4 |

Row 7 is P1's three-flag stage, added after this table's original six were
written. It **supersedes row 4**: `DIALECTICAL_ADAPTIVE_EXPANSION` must not
be flipped on its own any more — it is now stage 7c and has two P1
preconditions of its own (7a and 7b) on top of row 4's steps 1 + 2.

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

### 7. P1 contested frontier — `DIALECTICAL_HIERARCHICAL_SYNTHESIS`, `DIALECTICAL_FIELD_DISAGREEMENT`, `DIALECTICAL_ADAPTIVE_EXPANSION`

Plan: [`docs/superpowers/plans/2026-07-24-p1-contested-frontier.md`](./superpowers/plans/2026-07-24-p1-contested-frontier.md).
Design: `docs/superpowers/specs/2026-07-24-contested-frontier-deliberation-design.md` (repo root).

**What P1 changed, and why these three flags are one stage.** The engine had
adaptive expansion available but had never spawned a single categorical
decision in production (all-time count before P1: **0**). P1 makes the engine
spend its budget where model families disagree: a hard depth guardrail, a
bounded synthesis payload, a signal-class classification fix, per-field
cross-family disagreement detection, frontier priority ranking with a
12-wide wave, and convergence / wall-clock stop conditions. The three flags
below are the only P1 behaviour that is not already live, and they are
ordered because **turning expansion on before bounded synthesis is verified
is the exact failure this phase exists to prevent** — a run that grows for
hours and then dies at the final synthesis step.

**Budgets were raised in code by this stage's own commit** (`app/exploration/
expansion_dispatch.py`): `DIALECTICAL_EXPANSION_MAX_ROUNDS` 2 → **12**,
`_PER_NODE` 2 → **3**, `_PER_DEBATE` 6 → **150** (and `BUDGET_BOUNDS
["max_per_debate"]` 100 → 200, so an operator override can actually reach the
new default). These raises are **inert while 7c is off** — nothing dispatches
at all with `DIALECTICAL_ADAPTIVE_EXPANSION` unset. They are the outer rails,
not the intended stopping point: the frontier's real bound is the priority
floor plus convergence hysteresis, which is why a `stopped_because` of
`budget_exhausted` is a **finding**, not a success (see verification below).

**The template ships these three COMMENTED OUT, on purpose.**
`deploy/launchd/coordinator.plist` carries all three key/string pairs inside
XML comments, one clearly-labelled block per sub-step. This is not an
oversight and re-commenting is the rollback. The reason is the watchdog:
`com.dialectical.watchdog` calls `make install-services` **on its own**
whenever a launchd service check fails, regenerating the live plist from the
git-tracked template — so an active key committed to the template reaches the
running coordinator with no operator action at all. Uncomment exactly one
block, `make install-services`, verify, then move on.

#### 7a. `DIALECTICAL_HIERARCHICAL_SYNTHESIS` — FIRST

**What it does.** Default OFF. ON: the v2 synthesis prompt stops serialising
every node with its full argument text (O(nodes × argument length), uncapped)
and renders a bounded payload instead — one summary per POV branch, the top-K
load-bearing nodes in full (`DIALECTICAL_SYNTHESIS_LOAD_BEARING_K`, default
20), the top-C contested nodes in full ranked by widest cross-family field
spread (`DIALECTICAL_SYNTHESIS_CONTESTED_K`, default 30), and an honest
`omitted_count`. Flag OFF renders the historical every-node list
byte-identically. See `app/synthesis/branch_summary.py`.

**Precondition.** None beyond a working synthesis path. This is the flag that
makes the other two safe, so it goes first.

**Verification.**
1. Uncomment the 7a block, `make install-services`.
2. Run one **normal-size** debate (not a frontier run) end to end and confirm
   it synthesises correctly — the synthesis is coherent and references real
   claims, not a truncated or empty tree.
3. Confirm the conservation identity holds on the rendered payload:
   `len(load_bearing) + len(contested) + len(branches) + omitted_count`
   equals the debate's node count. A node is never silently dropped; if the
   caps bind, the remainder must show up in `omitted_count`.
4. Sanity-check the omission rate: on a small debate `omitted_count` should
   be small or zero. A large `omitted_count` on a 20-node debate means the
   ranking is reading the wrong scoring run.

**Rollback.** Re-comment the block, `make install-services`. Flag-off is the
historical payload byte-for-byte; no persisted data is written by this flag
in either direction.

#### 7b. `DIALECTICAL_FIELD_DISAGREEMENT` — SECOND

**What it does.** Default OFF. ON: cross-judge disagreement is detected
**per rubric field** (`critic.logical_validity`, `steelman.charitable_
strength`, `evidence.evidence_quality`, `context.impact`) at a 0.25 spread
threshold, replacing a gate that compared a five-field weighted *composite*
at 0.35. Averaging across fields shrinks spread: the largest composite spread
observed across 26 live nodes was 0.11, i.e. the old gate sat **above the
data's ceiling and could never fire**, which is why production has zero
contested nodes today. The new gate also becomes a categorical `challenge`
ground in `app/exploration/policy.py`. See `app/scoring/disagreement.py`.

**Why it is separately flagged** (project-owner ruling during P1 Task 5): the
judge panel is live in production, so shipping this unflagged would move
`score_provenance.disagreement_status` for every scored node the instant the
code deployed, before any deliberate flip.

**Precondition — 7a verified.** This flag is what makes the contested section
of the synthesis payload non-empty. Flipping it before 7a puts contested
nodes into the *unbounded* legacy payload, which is the wrong direction.
It also wants step 3 (`DIALECTICAL_JUDGE_PANEL_MODELS`) genuinely
participating: with a single judge there is no cross-family spread to
measure and this flag is a silent no-op.

**Expect this to change numbers, not just add them.** Measured on the live
panel across 26 nodes of debate `f67ad244`, the 0.25 threshold marks **13 of
26 nodes (50%)** contested, against 0 under the composite gate. That is the
intended effect. Nodes scored *before* the flip keep whatever
`disagreement_status` they were persisted with — the column will hold a mix.

**Verification.**
1. Uncomment the 7b block, `make install-services`.
2. Score a debate and confirm `disagreement_status: "present"` appears on
   **≥3 nodes** (the P1 acceptance number; smoke4 had 0).
3. Confirm the synthesis payload's `contested` section is non-empty and
   still ≤ `DIALECTICAL_SYNTHESIS_CONTESTED_K`, with the remainder counted
   into `omitted_count` — i.e. 7a's cap is doing its job under real load.
4. Confirm no `LifecycleDecisionRecord` spawned anything yet: 7c is still
   off, so every categorical decision must annotate only.

**Rollback.** Re-comment, `make install-services`. The flag gates both the
detection and its consumption (`judges_disagree_from_provenance` returns
False when off), so no lifecycle decision can move on a stale label.
Already-persisted `disagreement_status` values are left exactly as written.

#### 7c. `DIALECTICAL_ADAPTIVE_EXPANSION` — LAST

**This is row 4 of the table above, re-staged.** Everything in [step
4](#4-dialectical_adaptive_expansion) still applies — including its steps 1 +
2 precondition (verification is the sole source of grounded evidence signals,
so with `DIALECTICAL_EVIDENCE_VERIFICATION` off no authenticated decision can
exist at all) and its documented synthesis-race interaction. P1 adds the
guardrails that make it safe to actually spend a budget, and two more
preconditions: **7a and 7b verified**.

**What P1 added around it.** Hard depth guardrail on v2 expansion; frontier
priority ranking (`impact × uncertainty × dispersion`) with a priority floor
(0.15) and a 12-wide wave; convergence hysteresis (two consecutive settled
waves) and a wall-clock stop (`DIALECTICAL_DEBATE_WALL_CLOCK_SECONDS`,
default 4h). Every refusal is annotated on the audited
`LifecycleDecisionRecord` — never a silent drop — with a distinct outcome per
reason (`wave_full` is deliberately *not* `budget_exhausted`, because a
full wave does not mean the debate's budget was reached).

**Where to read all of this.** `GET /api/ops/expansion?debate_id=<id>`
(bearer user token, read-only) serves the `adaptive_expansion` state
(`roundsCompleted`, `stoppedBecause`, `convergedWaves`, `growthStartedAt`),
the `dispatch_outcome` histogram, the persisted frontier priority
distribution and PRO:CON wave split, and the top records by
`frontier_priority` — i.e. steps 3 and 4 below without hand-querying SQLite.
In the log, one structured line per dispatch pass carries the same census:

```
grep expansion.census  /tmp/dialectical-coordinator.{out,err}.log   # per-pass decisions
grep expansion.stop    /tmp/dialectical-coordinator.{out,err}.log   # WHY growth ended (also WARNING)
grep scoring.cache     /tmp/dialectical-coordinator.{out,err}.log   # re-judge volume = the CLI bill
```

**Verification** (this is the P1 acceptance list; record the actual numbers,
P2's plan depends on them):
1. Uncomment the 7c block, `make install-services`.
2. Run one frontier debate. Confirm at least one branch reaches **depth ≥8**
   and at least one terminates at **depth ≤3** — an even depth profile means
   the priority ranking is not discriminating.
3. Confirm `debate.config["adaptive_expansion"]["stopped_because"]` is
   `converged` or `below_priority_floor` — **not** `budget_exhausted`. A
   `budget_exhausted` stop means the frontier ran out of rails before it ran
   out of disagreement, and is a finding to feed back into P2, not a pass.
4. Confirm at least one `LifecycleDecisionRecord` has `signal_class ==
   "categorical"` **and** `dispatch_outcome == "spawned"` (all-time
   production count before P1: **0**).
5. Confirm the synthesis at the end of that run completes — the whole point
   of ordering 7a first.
6. Confirm no `database is locked` errors in
   `/tmp/dialectical-coordinator.err.log` during the run.

**Rollback.** Re-comment, `make install-services`. No new dispatch occurs;
already-spawned nodes, jobs, and audited records are left exactly as
persisted. The raised budgets stay in code and stay inert.

#### Recorded rule change: `lifecycle_decision_records.signal_class` holds a MIX of two classification rules

**This shipped unflagged and changes a persisted value**, so it is recorded
here rather than staged. The project owner ratified the deviation on the
condition that this boundary is written down.

P1 Task 4 fixed a real bug in `app/exploration/policy.py`: a decision's
`signal_class` was computed with `all()` over its grounding reasons, so a
single *scalar* reason attached alongside a *categorical* one downgraded the
whole decision to `scalar`. Under the categorical-only steering law that
silently stripped spawn authority from correctly-grounded categorical
decisions. The fix computes it with `any()` — a decision is categorical when
**at least one** of its grounding reasons is categorical, each being
independently sufficient to fire the action. Blockers (reasons *not* to
abandon) no longer participate in the classification at all.

**The boundary, plainly — and it is a RESTART, not a date.** The coordinator
runs source straight from the working tree (`Makefile:388` seds `__ROOT__` →
`$(CURDIR)`; there is no build artifact and no separate deployment), so the
new rule takes effect **at the coordinator's first restart that picked up
commit `1dad2f5`** — not at the moment the commit was authored. Nothing has
been deployed as of this writing, so that restart has **not happened yet** and
every row in the table is still on the old side of it.

- Rows written **before** that restart: classified with the old `all()` rule.
- Rows written **after** it: classified with `any()`.

The column therefore holds a mix of two rules and `signal_class` is **not
comparable across that restart**. Rows are never retroactively reclassified.

**Operators: record the restart instant when you do the P1 deploy**, and write
it in here. Until it is recorded, the only safe reading is "every row predates
the change" — which is true today (see below) but stops being true silently the
moment the coordinator comes back up on this branch.

Why the distinction is not pedantic: dating the boundary to 2026-07-25 would
mislabel any row written on 2026-07-25 *before* the restart as `any()`-classified
when it was in fact `all()`-classified. Impact is bounded — as of this writing
only **6 rows exist** (all `signal_class = 'scalar'`, all written 2026-07-24,
all therefore pre-boundary under either reading) — but the rule for
interpreting the column has to be stated correctly for the rows that come next,
which is the entire point of recording it.

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
7. **P1 contested frontier, in three sub-steps, never together:**
   **7a `DIALECTICAL_HIERARCHICAL_SYNTHESIS`** (verify one normal-size debate
   synthesises) → **7b `DIALECTICAL_FIELD_DISAGREEMENT`** (verify
   `disagreement_status: "present"` on ≥3 nodes and the contested cap
   holding) → **7c `DIALECTICAL_ADAPTIVE_EXPANSION`** (verify a
   `converged`/`below_priority_floor` stop, not `budget_exhausted`). 7c
   replaces item 4 above; do not flip item 4 separately. All three ship
   commented out in `deploy/launchd/coordinator.plist` — the watchdog
   installs the template unattended, so an active key there is a deployment.

Every flip above is an explicit operator decision made after reviewing the
corresponding evidence — this document schedules none of them.
