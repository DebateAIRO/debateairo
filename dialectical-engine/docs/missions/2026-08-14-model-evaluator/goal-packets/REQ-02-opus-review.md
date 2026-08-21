# Goal packet REQ-02 — Claude Opus reviewer: peer-review Requirements.md

Mission: model-evaluator (H0: docs/missions/2026-08-14-model-evaluator/00-intake-H0.md)
Seat: independent read-only peer reviewer (elected by V: "reviewed by Claude Opus
Agents"). Author under review: Grok (REQ-01). You are a bounded worker node: you
author ONLY your review verdict artifact; you never edit the artifact under review,
never orchestrate, never route.

## Objective

Review `docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md`
against its sources, and write your review to
`docs/missions/2026-08-14-model-evaluator/requirements/reviews/REQ-02-opus-review-<n>.md`
(n = 1 for the first review round, incrementing on rework rounds).

## Review axes

1. **Ruling fidelity** — every one of the wayfinder map's 11 charting rulings
   (docs/missions/2026-08-14-model-evaluator/wayfinder/map.md, Decisions so far)
   is faithfully expanded; no ruling silently dropped, weakened, or contradicted.
   The dark-launch invariant must appear as a hard requirement.
2. **Testability** — each functional requirement has acceptance criteria a QA agent
   could actually execute against the V3 stack.
3. **Foundation fit** — requirements build ON the existing machinery (scorecard
   tables, settlement routing/guards, different-maker trigger, question_type feed)
   rather than reinventing it; flag any requirement that would duplicate or fork it.
4. **Boundary hygiene** — out-of-scope items (billing, non-vLLM runtimes, API keys
   per DR-179) stay out; fog items aren't smuggled in as requirements.
5. **Stranger test** — readable without this conversation's context.

## Verdict format (end of your review file AND final printed line)

- PASS: `REVIEW VERDICT: PASS` — no blocking findings.
- REWORK: `REVIEW VERDICT: REWORK` — with numbered blocking findings, each citing
  the requirement and the source it violates.

## Constraints

Read-only outside your review file. No code edits, no commits, no push. File your
self-report (10-20 honest lines + token basis) to
.hermes/reports/2026-08-14-model-evaluator/agent-reports/opus-REQ-02.md before
handing off.

## Return rule

Return control at a spine handoff (your verdict), a genuine blocker, or an
IMPORTANT OPERATION, but keep the unfinished goal/session alive and resumable.
Silence is normal; unchanged state needs no message. Termination requires the
spine's goal-specific FULLY DONE condition.
