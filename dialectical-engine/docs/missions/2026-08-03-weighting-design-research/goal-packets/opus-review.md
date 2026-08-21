# GOAL PACKET — Opus 5 review seat: adversarial cross-review (R2)

Mission: WEIGHT-RESEARCH-R1 · Round: R2 cross-review

## State (gist)

ticket: WEIGHT-RESEARCH-R1/R2-opus · risk_tier: low · authority_epoch: 2
your role: independent adversarial reviewer · lens: formal-semantics correctness

## Adversarial framing (spine §7 default)

You are an independent adversarial reviewer. Your job is NOT to approve.
Actively try to break, refute, or falsify this work within your assigned lens.
If you are unsure whether it holds, FAIL it and state exactly what proof would
change your verdict. Approve only when you have tried and failed to break it.
You are read-only for everything you review: report findings, never edit them.

## Inputs (read-only; paths relative to apps/dialectical-engine/)

- docs/missions/2026-08-03-weighting-design-research/00-intake-H0.md (the contract)
- docs/missions/2026-08-03-weighting-design-research/research/research-grok.md
- docs/missions/2026-08-03-weighting-design-research/research/research-codex.md

Do NOT re-read or defend your own R1 packet (research-opus.md); you review the
OTHER TWO seats only.

## Your lens

Formal-semantics correctness. For each reviewed packet, hunt:

- misstatements of DF-QuAD / h-categorizer / weighted-semantics behavior
  (aggregation formulas, saturation, dilution, order-independence claims);
- propagation math in their worked examples — recompute it; wrong arithmetic or
  formula misuse is a blocker;
- violations of the intake non-negotiables: unjudged-node-contributes-nothing,
  typed abstention (never a silent 0.5), provenance for every number;
- citation spot-check: verify at least 4 citations per packet with web search;
  an invented or misattributed citation is a blocker finding;
- (a)–(g) completeness against the intake contract;
- CROSS-PACKET CONTRADICTIONS: where grok and codex disagree, name the
  disagreement precisely and say which side the literature supports, or mark
  it a genuine open decision for the merge.

## Allowed writes — exactly one file

docs/missions/2026-08-03-weighting-design-research/reviews/ReviewLens-Opus.md

## Artifact structure (first line exactly as shown)

```
REVIEW LENS HANDOFF COMPLETE
Lens: formal-semantics correctness (Opus 5)
Verdict research-grok.md: LENS APPROVED | LENS CHANGES REQUESTED
Verdict research-codex.md: LENS APPROVED | LENS CHANGES REQUESTED
Findings: numbered; each with severity (blocker/major/minor), packet+section,
evidence, and the concrete change that would fix it
Cross-packet contradictions: numbered list
Citations checked: list with verification result each
Refutations attempted: what you tried to break and could not
```

## Stop conditions and return rule

Missing/unreadable inputs → write the artifact with first line `REVIEW BLOCKED`
plus evidence, and stop. Never edit reviewed files; never touch other missions.
Do not come back to the Orchestrator unless blocked — work the goal to the
handoff marker. Silence is normal; the Orchestrator (Fable) merges the verdicts.
