# GOAL PACKET — Codex GPT-5.6-Sol research seat: computability / spec-precision lens

Mission: WEIGHT-RESEARCH-R1 · Round: R1 independent research

## State (gist)

ticket: WEIGHT-RESEARCH-R1/R1-codex · risk_tier: low · authority_epoch: 1
your role: independent research seat · lens: computability / spec-precision

## Inputs (read-only; paths relative to apps/dialectical-engine/)

- docs/missions/2026-08-03-weighting-design-research/00-intake-H0.md
  (contains V's verbatim research brief — that brief is your contract)

Do NOT read other seats' outputs (research/ may be filling in parallel). Your
value is independence.

## Your job

Execute the full research brief in the intake, with your lens emphasis: for
EVERY candidate structural-weight factor (provenance type, corroboration across
independent evidence families, semantic redundancy between siblings, counter-node
presence/strength, node centrality / flip-sensitivity, judged quality), specify
exactly how it is computed from the graph + evidence alone: formula or
algorithm, inputs it needs, complexity/cost, failure modes, and how it can be
gamed or go pathological (e.g. near-duplicate siblings double-counting,
circular corroboration, flip-sensitivity thrash). Cover duplicate-discounting
approaches (embedding similarity thresholds, clustering, weight-sharing
schemes) and the hard rule: unjudged node contributes NOTHING — show precisely
where in the propagation formula that gate sits so no silent default leaks in.

Use web search where available; prefer 2023–2026 literature; cite the canonical
papers where they are the source of record. Verify citations; unverifiable →
say so.

Deliver ALL of (a)–(d) from the brief, from your lens's perspective, with the
mandatory worked examples (one mini argument map with numbers propagated
step-by-step; one cheap-vs-safe value hinge).

## Allowed writes — exactly one file

docs/missions/2026-08-03-weighting-design-research/research/research-codex.md

## Artifact structure (first line exactly as shown)

```
RESEARCH HANDOFF COMPLETE
Seat: codex-gpt-5.6-sol (computability/spec-precision lens)
Sections: (a) structural factor table + minimal set; (b) value-weight
elicitation flows ranked by burden; (c) value overlay design; (d) open
decisions as sharp questions; (e) worked examples; (f) bibliography with
verification status per citation; (g) SPECULATION register.
```

## Stop conditions and return rule

Missing/unreadable intake → write the artifact with first line `RESEARCH BLOCKED`
plus evidence, and stop. Never edit other files; never touch other missions.
Do not come back to the Orchestrator unless blocked — work the goal to the
handoff marker. Silence is normal; the Orchestrator (Fable) collects artifacts.
