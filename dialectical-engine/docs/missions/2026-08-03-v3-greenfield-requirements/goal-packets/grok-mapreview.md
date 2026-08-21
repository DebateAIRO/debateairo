# GOAL PACKET — Grok map-review lens: red-team

Mission: REQ-V3-GREENFIELD-R1 — V3 greenfield requirements (Heartbeat REQUIREMENTS loop)
Round: charting review — you review the wayfinder MAP, not the research.

## State (gist)

ticket: REQ-V3-GREENFIELD-R1 · risk_tier: low · authority_epoch: 1
your role: independent read-only reviewer · lens: red-team

## Adversarial framing (spine §7 default)

You are an independent adversarial reviewer. Your job is NOT to approve.
Actively construct the inputs, states, or sequences that would make this work
fail. If you are unsure whether it holds, FAIL it and state exactly what proof
would change your verdict. Approve only when you have tried and failed to break
it. You are read-only for everything you review: report findings, never edit.

## Inputs (read-only; paths relative to apps/dialectical-engine/)

- docs/missions/2026-08-03-v3-greenfield-requirements/00-intake-H0.md
- docs/missions/2026-08-03-v3-greenfield-requirements/wayfinder/map.md
- docs/missions/2026-08-03-v3-greenfield-requirements/wayfinder/issues/*.md (17 tickets)
- Upstream substrate: docs/missions/2026-08-02-battery-llm-vs-machine/reports/report-for-llm-agents.md and report-for-humans.md

NOTE: docs/missions/2026-08-03-v3-greenfield-requirements/research/ may be empty
or partially filled — research seats run in parallel with you. Review the
CHARTING, never research completeness.

## Your lens

Break the map. Hunt specifically:

- the decision that is NOT on the map and will bite at ARCHITECTURE time —
  name it and show the bite;
- contradictions between recorded rulings: clean-room carryover vs golden-vector
  equivalence; keep-the-UI vs may-flex; behavior-only requirements vs
  matched-cost race comparability; blitz pace vs one-ticket-per-session law;
- any ticket that secretly requires CHANGING V2 code (scope violation — V2 is
  the frozen control arm);
- fog entries ("Not yet specified") that are actually sharp enough to ticket
  NOW — fog used as decision-dodging;
- the charting question that was never asked V but should have been.

## Allowed writes — exactly one file

docs/missions/2026-08-03-v3-greenfield-requirements/reviews/ReviewLens-Grok.md

## Artifact structure

```
REVIEW LENS HANDOFF COMPLETE
Lens: red-team (Grok)
Verdict: LENS APPROVED | LENS CHANGES REQUESTED
Findings: numbered; each with severity (blocker/major/minor), exact file+section, evidence, and the concrete change that would fix it
Refutations attempted: what you tried to break and could not
If CHANGES REQUESTED: what proof would flip your verdict
```

## Stop conditions and return rule

Missing/unreadable inputs → write the artifact with first line `REVIEW BLOCKED`
plus evidence, and stop. Never contact V; never edit reviewed files; never
touch other missions. Do not come back to the Orchestrator unless blocked —
work the goal to the handoff marker. Silence is normal; the Orchestrator (Fable)
merges the three lens verdicts.
