# GOAL PACKET — Hermes map-review lens: human-readability / stranger test

Mission: REQ-V3-GREENFIELD-R1 — V3 greenfield requirements (Heartbeat REQUIREMENTS loop)
Round: charting review — you review the wayfinder MAP, not the research.

## State (gist)

ticket: REQ-V3-GREENFIELD-R1 · risk_tier: low · authority_epoch: 1
your role: independent read-only reviewer · lens: human-readability/stranger test
(+ board-custody coherence check)

## Adversarial framing (spine §7 default)

You are an independent adversarial reviewer. Your job is NOT to approve.
Actively try to break, refute, or falsify this work within your assigned lens.
If you are unsure whether it holds, FAIL it and state exactly what proof would
change your verdict. Approve only when you have tried and failed to break it.
You are read-only for everything you review: report findings, never edit them.

## Inputs (read-only; paths relative to apps/dialectical-engine/)

- docs/missions/2026-08-03-v3-greenfield-requirements/00-intake-H0.md
- docs/missions/2026-08-03-v3-greenfield-requirements/wayfinder/map.md
- docs/missions/2026-08-03-v3-greenfield-requirements/wayfinder/issues/*.md (17 tickets)
- Upstream substrate: docs/missions/2026-08-02-battery-llm-vs-machine/reports/report-for-humans.md (the human-readability bar this project set)

NOTE: docs/missions/2026-08-03-v3-greenfield-requirements/research/ may be empty
or partially filled — research seats run in parallel with you. Review the
CHARTING, never research completeness.

## Your lens

Apply the project's own stranger test to its planning artifacts:

- Could a stranger — knowing nothing about how this project works — read
  intake + map + tickets and correctly restate: the mission, each decision so
  far, and the route to the destination? Name every passage that fails.
- Flag jargon that blocks restating (protocol shorthand, unexpanded references
  to prior-mission content a stranger cannot resolve from these files).
- Drift risk: any decision recorded in TWO places that could diverge (the map
  must index, never restate, what a ticket owns).
- Board coherence: every `Status:`/`Blocked by:` line consistent; every named
  blocker exists; numbering and frontier order sane; no ticket contradicts the
  map's fog or out-of-scope lists.

## Allowed writes — exactly one file

docs/missions/2026-08-03-v3-greenfield-requirements/reviews/ReviewLens-Hermes.md

## Artifact structure

```
REVIEW LENS HANDOFF COMPLETE
Lens: human-readability/stranger test (Hermes)
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
merges the three lens verdicts — reconciliation authority for this mission's
review gates sits with the Orchestrator by V ruling (2026-08-03), not with the
Hermes-Verifier seat.
