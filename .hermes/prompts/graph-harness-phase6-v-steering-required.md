# V STEERING REQUIRED — Phase 6 acceptance gate (Task 6.4) held before the irreversible 6.5 push

Status: OPEN — awaiting V's ruling. Phase 6 is HELD at 6.4; it does NOT auto-proceed to 6.5 until V decides.
Raised by: acceptance-run worker (Task 6.4), on the Claude-Router acceptance directive.
Date: 2026-07-24
Spine commit under test: a320b63d676ea9cea9402fc335c1169c916de678 (branch lane/roadmap-p0-p3, pre-push, dirty with the migration snapshot)
Evidence artifact: C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-phase6-acceptance-evidence.md

## Why this note exists (plan Acceptance item 4)

Task 6.4's Acceptance says: "If any metric FAILs, Phase 6 stops here — do NOT proceed to 6.5; open a `V STEERING REQUIRED` note." Task 6.4 sits immediately before the IRREVERSIBLE `git push` of Task 6.5, so the gate must not be crossed on a partial run.

What actually happened on this acceptance run:

- The plan's 6.4 requires a **real, separate Tier-1 (routine feature) mission** run end-to-end **under the frozen new spine**, filling all three metrics from durable evidence, plus an independent-reviewer co-sign. The plan's Steps explicitly forbid using a Tier-0 docs mission or a Tier-2 architecture mission as the subject.
- **No such separate live mission exists to measure right now.** The only subject available is the graph-harness migration mission ITSELF, which is **docs-only** (Global Constraints "Scope constraint — docs only") and ran under the **progressively-installed** (not yet frozen) spine. Per the Claude-Router acceptance directive, 6.4 was executed against THIS mission's durable R8 evidence as a falsification-checklist + report-chain + void-polling check.
- **Result of the run available now:**
  - Falsification checklist (ruling R5): **PASS** — 0 of 9 criteria triggered (independently re-derived from the durable reports/files at a320b63; verifier round 1 confirmed every determination sound and every marker count exact).
  - Metric 3 (void-polling, target ZERO uncontrolled): **PASS** — chatter breaker never tripped; `rework_round` 0/3; `Blocked tasks` 0; event-driven wakes; "Escalations to V: None" across all three phase reports.
  - Metric 1 (V interactions ≤ 3): **DEFERRED-TO-FIRST-LIVE-MISSION** — V steered the design surface interactively by design throughout this migration (D1–D5, R1–R8, blanket per-phase approvals, a mid-Phase-3 preservation check), so a ≤3-interaction bound is not meaningfully testable on the mission that was installing the machinery.
  - Metric 2 (planning-diamond ≥ 30% faster than old serial): **DEFERRED-TO-FIRST-LIVE-MISSION** — the planning diamond was itself being installed during this mission (Task 4.1); there was no same-content old-serial control run, so no honest A/B delta can be computed here. The `delta = 0%` row in the evidence file is a self-declared placeholder to satisfy the schema grep, NOT a measured result.
  - Independent-reviewer co-sign of the FULL three-metric verdict: **PENDING** — cannot complete while two metrics are deferred; Hermes-Verifier confirmation and V's ratification are still outstanding.

Because two of the three headline metrics are DEFERRED (not PASS) and the full-verdict co-sign is pending, the **full 6.4 acceptance is NOT MET**. The falsification checklist and Metric 3 both PASS, but that is a proper subset of 6.4's acceptance. Per Acceptance item 4, the gate is HELD and escalated to V rather than crossed.

## Decision V is asked to make (choose ONE)

Smallest yes/no framing: "Which resolution — A or B?"

- **Option A — Order a real, separate non-docs Tier-1 mission under the frozen spine.** Run one routine-feature (Tier-1) mission end-to-end in full mode (H0 → G1 → H1 → C2 → {H2 ∥ G3} → H3 → C4/FinalPlan → G5 → H5 → H6 single batched lane-plan approval → C8 implementation → H9 acceptance) AFTER the spine is frozen, actually filling Metrics 1 and 2 with an independent-reviewer co-sign. Then re-run 6.4's acceptance and only then consider 6.5. This satisfies the plan's letter but pushes the migration snapshot behind a full extra mission and needs V's H0 intake to start it.

- **Option B — Formally ratify the deferral as an amendment to 6.4's acceptance criteria.** V explicitly rules that, for THIS migration only, the falsification-checklist PASS + Metric-3 PASS against the migration's own durable evidence is a sufficient acceptance gate, and that Metrics 1 and 2 are deferred to the FIRST real live mission run under the frozen spine (carried to V with the 6.5 push packet for post-push judgment). On this ratification, Phase 6 may proceed to 6.5 (the push still requires V's separate explicit push approval per 6.5).

## What does NOT change regardless of V's choice

- Nothing is pushed, closed, deleted, or archived by this note. Task 6.5 (push) and Task 6.6 (prune) remain separately V-gated.
- The mission is NOT marked closed. Closure (the `REQUIREMENTS SATISFIED` / `ARCHITECTURE SATISFIED` markers referencing the closure report, plus the closure report itself) is Claude-Router's job AFTER V's push decision, per ruling R8.
- The two deferred metrics remain routed to V with the push packet for judgment either way.

## Pointer

This note is the escalation surface for the held gate. The full re-derived evidence, per-criterion PASS/FAIL, and metric reasoning are in:
C:/Users/vladm/Desktop/debate/DebateV2/.hermes/prompts/graph-harness-phase6-acceptance-evidence.md
