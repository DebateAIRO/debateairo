# Brief: Should Claude (Fable) Become the Main Orchestrator?

**For:** V + senior discussion. **Author:** Claude Fable, 2026-07-24. **Status:** **RESOLVED under V's authority, 2026-07-24** — V answered all five questions directly and added a sixth ruling (the Grand Loop law); binding record in blueprint §6.3.2 (R1–R6). The senior discussion, if held, reviews rather than decides. **Disclosure:** the author is the candidate that was evaluated; every claim below is checkable against the cited artifacts.

## The question

Move the Main Orchestrator role (launch everything, route everything, run the One-Prompt Machine) from Hermes to Claude Code running Fable, with Hermes re-seated at the programming-orchestration → QA corner.

## Reframe

This is a **harness** question more than a model question. The incident record (45 dated postmortems in one week; the "cockpit rot" self-diagnosis; the Hermes↔GPT void-polling) traces to hand-rolled orchestration infrastructure — cron watchers, PTY fleets, fingerprint scripts — not to model quality. Compare harness capabilities first, models second.

## Case FOR Claude-as-orchestrator

1. **Event-driven, not poll-driven.** Claude Code's runtime re-invokes the orchestrator when background work completes. The void-polling failure class is structurally impossible for harness-tracked work. Evidence: the graph-harness mission itself — 43 agents across 6 fleets (11-agent audit, 4-agent panel, 4-agent sweep, 8+2+1 plan composition), zero polling incidents, zero manual steering beyond V's actual decisions.
2. **Orchestration-as-code is native.** Dynamic workflows (deterministic fan-out/merge/pipeline, schema-validated subagent outputs, per-node model tiering, worktree isolation) are shipped runtime features here; Hermes approximates them with ~1,900 lines of prose law + 135 reference files across two skills. Less hand-rolled machinery = less rot surface.
3. **Router-quality reasoning.** Intake, risk-tiering, adjudicating reviewer disagreements, and synthesis are frontier-reasoning tasks; Fable is the strongest tier in the current stack.
4. **The proposed shape implements the blueprint's Router/Verifier split with REAL independence.** Blueprint §3.2 splits Hermes into Router and Verifier; assigning Router=Claude and Verifier=Hermes puts the two powers in different model families. The entity that routes work is no longer the entity that certifies it.

## Case AGAINST / open risks

1. **Board custody + residency.** Hermes owns the Kanban natively (dispatcher, kanban_* tools, authority epochs, compare-before-write) and runs as an always-on resident with phone delivery. Claude Code has scheduled tasks/background loops but no deep Kanban integration today. Cheapest fix: Hermes keeps board custody inside the Verifier/QA seat.
2. **Family concentration.** Claude orchestrating + Claude planning + Claude reviewing correlates errors. Mitigation already in law: Codex (GPT) keeps coding, Grok keeps reviewing, Hermes (GPT) verifies QA.
3. **Unproven at multi-day resident scale.** This mission proves burst orchestration, not week-long operation, outage behavior, or sustained cost.
4. **Cost.** Fleet orchestration spends the Anthropic budget; Hermes runs on existing infra. Price both before deciding.

## Impact on the migration plan (2026-07-24-graph-harness-migration-plan-v1.md)

Small and contained. The One-Prompt Machine law is identity-agnostic (the three V-facing surfaces are unchanged). The spine defines roles, not identities. Only three tasks reword: 3.7 (Hermes contract → Verifier/QA/board-custody), 3.8 (new Claude skill → Main Orchestrator contract, fulfilling ruling D1), 6.3 (full-mode text names the launcher). Phases 1–5 are orchestrator-agnostic and can start regardless.

## Recommendation

Decide by pilot, not argument: run Phase 6's acceptance mission twice — once Hermes-orchestrated, once Claude-orchestrated with Hermes as QA gate — same Tier-1 mission, comparing V-interaction count, wall-clock, token cost, and incident count. Start Phase 1 now; the cockpit decision only needs to land before Phase 6.

## Questions the senior should press

1. Does board custody stay with Hermes (Verifier seat) or migrate? (Migration = rebuilding epoch/race machinery in a new home — cost, risk.)
2. What is the acceptable monthly token budget for a resident Claude orchestrator, and what happens at plan limits mid-mission?
3. Outage semantics: if the Claude session/harness is down, who holds the board and how do missions freeze safely?
4. Does the Codex-only coding law survive unchanged? (Recommended: yes — worker diversity is the correlation hedge.)
5. What would falsify the pilot — which metric difference is decisive?
