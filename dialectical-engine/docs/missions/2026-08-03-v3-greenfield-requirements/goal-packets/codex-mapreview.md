# GOAL PACKET — Codex map-review lens: machine-executability / spec-precision

Mission: REQ-V3-GREENFIELD-R1 — V3 greenfield requirements (Heartbeat REQUIREMENTS loop)
Round: charting review — you review the wayfinder MAP, not the research.

## State (gist)

ticket: REQ-V3-GREENFIELD-R1 · risk_tier: low · authority_epoch: 1
your role: independent read-only reviewer · lens: machine-executability/spec-precision

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
- Upstream substrate: docs/missions/2026-08-02-battery-llm-vs-machine/reports/report-for-llm-agents.md and report-for-humans.md

NOTE: docs/missions/2026-08-03-v3-greenfield-requirements/research/ may be empty
or partially filled — research seats run in parallel with you. Review the
CHARTING, never research completeness.

## Your lens

Could the ARCHITECTURE loop start from this map with no guessing? Hunt:

- tickets that are not single-decision, or that overlap so two sittings could
  produce conflicting rulings;
- missing blocking edges — a ticket whose answer factually depends on another
  ticket's output but is not wired `Blocked by`;
- the coverage law's enforcement path (ticket 05 → 07 → 08): trace it and find
  any of the 62 questions / 9 rules that could fall through uncovered;
- each of the four destination artifacts: does a producing path of tickets
  actually lead to it?
- any phrase in map or tickets a spec author would have to interpret by guess.

## Allowed writes — exactly one file

docs/missions/2026-08-03-v3-greenfield-requirements/reviews/ReviewLens-Codex.md

## Artifact structure

```
REVIEW LENS HANDOFF COMPLETE
Lens: machine-executability/spec-precision (Codex)
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
