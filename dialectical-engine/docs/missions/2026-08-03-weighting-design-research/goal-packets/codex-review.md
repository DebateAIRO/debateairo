# GOAL PACKET — Codex GPT-5.6-Sol review seat: adversarial cross-review (R2)

Mission: WEIGHT-RESEARCH-R1 · Round: R2 cross-review

## State (gist)

ticket: WEIGHT-RESEARCH-R1/R2-codex · risk_tier: low · authority_epoch: 2
your role: independent adversarial reviewer · lens: computability / spec-precision

## Adversarial framing (spine §7 default)

You are an independent adversarial reviewer. Your job is NOT to approve.
Actively try to break, refute, or falsify this work within your assigned lens.
If you are unsure whether it holds, FAIL it and state exactly what proof would
change your verdict. Approve only when you have tried and failed to break it.
You are read-only for everything you review: report findings, never edit them.

## Inputs (read-only; paths relative to apps/dialectical-engine/)

- docs/missions/2026-08-03-weighting-design-research/00-intake-H0.md (the contract)
- docs/missions/2026-08-03-weighting-design-research/research/research-opus.md
- docs/missions/2026-08-03-weighting-design-research/research/research-grok.md

Do NOT re-read or defend your own R1 packet (research-codex.md); you review the
OTHER TWO seats only.

## Your lens

Computability / spec-precision. For each reviewed packet, hunt:

- any recommended factor that is NOT computable from graph+evidence alone as
  claimed (hidden inputs, oracle assumptions, undefined terms a spec author
  would have to guess);
- missing cost/complexity analysis, or costs that are wrong (e.g. pairwise
  sibling similarity is O(k²) per family — did they say what happens at k=50?);
- gaming and pathological cases they missed: duplicate-sibling double-count,
  circular corroboration, flip-sensitivity oscillation, weight-laundering
  through intermediate nodes;
- the unjudged-node gate: is it placed in an exact position in their formulas,
  or hand-waved? Hand-waved = blocker (fabricated-confidence defect class);
- recompute their worked-example arithmetic;
- (a)–(g) completeness against the intake contract;
- CROSS-PACKET CONTRADICTIONS between opus and grok packets: name each
  precisely; say which is right or mark it a genuine open decision.

## Allowed writes — exactly one file

docs/missions/2026-08-03-weighting-design-research/reviews/ReviewLens-Codex.md

## Artifact structure (first line exactly as shown)

```
REVIEW LENS HANDOFF COMPLETE
Lens: computability/spec-precision (Codex gpt-5.6-sol)
Verdict research-opus.md: LENS APPROVED | LENS CHANGES REQUESTED
Verdict research-grok.md: LENS APPROVED | LENS CHANGES REQUESTED
Findings: numbered; each with severity (blocker/major/minor), packet+section,
evidence, and the concrete change that would fix it
Cross-packet contradictions: numbered list
Citations checked: list with verification result each (best-effort if offline)
Refutations attempted: what you tried to break and could not
```

## Stop conditions and return rule

Missing/unreadable inputs → write the artifact with first line `REVIEW BLOCKED`
plus evidence, and stop. Never edit reviewed files; never touch other missions.
Do not come back to the Orchestrator unless blocked — work the goal to the
handoff marker. Silence is normal; the Orchestrator (Fable) merges the verdicts.
