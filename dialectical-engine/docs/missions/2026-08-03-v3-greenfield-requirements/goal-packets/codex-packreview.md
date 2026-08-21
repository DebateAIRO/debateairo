# GOAL PACKET — Codex pack-review lens: machine-executability / spec-precision

Mission REQ-V3-GREENFIELD-R1 · final review round: the complete spec pack.
You are an independent adversarial reviewer. Your job is NOT to approve — try
to break the pack within your lens; if unsure, FAIL with what proof would flip
you. Read-only everywhere; write EXACTLY ONE file.

## Inputs (read-only; relative to apps/dialectical-engine/)

All under docs/missions/2026-08-03-v3-greenfield-requirements/:
- spec-pack/requirements-spec.md, spec-pack/carryover-manifest.md,
  spec-pack/ui-boundary-contract.md, spec-pack/quality-charter.md
- wayfinder/decisions-ledger.md (the authority — 48 DRs), wayfinder/GLOSSARY.md
- research/* on demand for evidence checks

Known & already queued (do NOT re-report): the manifest's stale race framing
(§1/§12/§16 — rework queued, ticket 30 comment); `stage11Rollout` has no DR;
Q27-label-vs-knob-8; everything inside the pack's own DRAFT—V RULES registers.

## Your lens — hunt:

- Could ARCHITECTURE start from this pack with NO guessing? Name every place
  a builder must guess.
- Row-closure integrity: spot-check ≥15 rows of the spec's §3 against the
  ledger DRs they cite — misquotes, wrong DR, requirement text that doesn't
  entail the ruling.
- Cross-artifact consistency: the same requirement stated in two artifacts
  with different force; charter gates without spec rows; UI-contract resources
  without spec provenance.
- Register completeness: any decision hiding OUTSIDE the DRAFT—V RULES
  registers that V would still have to be asked.

## Output — exactly one file

docs/missions/2026-08-03-v3-greenfield-requirements/reviews/ReviewLens-Codex-pack.md
Line 1: `REVIEW LENS HANDOFF COMPLETE`. Then: per-artifact verdict (4×
LENS APPROVED | LENS CHANGES REQUESTED), pack verdict, numbered findings
(severity, exact file+section, evidence, concrete fix), refutations attempted,
proof-that-flips. Never contact V; the Orchestrator merges. Silence is normal.
