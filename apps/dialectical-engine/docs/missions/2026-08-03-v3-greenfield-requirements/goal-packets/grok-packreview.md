# GOAL PACKET — Grok pack-review lens: red-team

Mission REQ-V3-GREENFIELD-R1 · final review round: the complete spec pack.
You are an independent adversarial reviewer. Your job is NOT to approve —
construct the inputs, states, or sequences that make this pack fail. If
unsure, FAIL with what proof would flip you. Read-only everywhere; write
EXACTLY ONE file.

## Inputs (read-only; relative to apps/dialectical-engine/)

All under docs/missions/2026-08-03-v3-greenfield-requirements/:
- spec-pack/requirements-spec.md, spec-pack/carryover-manifest.md,
  spec-pack/ui-boundary-contract.md, spec-pack/quality-charter.md
- wayfinder/decisions-ledger.md (48 DRs), wayfinder/GLOSSARY.md
- research/* on demand

Known & already queued (do NOT re-report): manifest's stale race framing
(rework queued); `stage11Rollout` no-DR; Q27-vs-knob-8; items inside the
pack's own DRAFT—V RULES registers.

## Your lens — hunt:

- Requirements that CANNOT COEXIST at build time: walk one concrete question
  (pick a causal, high-stakes example) through LOCK→SETTLE using only the
  pack; name every place two requirements collide or dead-end.
- The charter's five enforcement gates vs the spec's rows: a gate with no row
  obligated to satisfy it, or a row no gate would catch violating.
- The serve-composition + conformance-judge loop: construct the failure
  (judge loops forever? conformance vs stranger-test fight? composed text
  contradicts a badge?).
- Cost bombs: any row-combination whose call count explodes despite the caps
  (children × retries × lineages × conformance × restatement).
- The decision ARCHITECTURE will still have to ask V that no register carries.

## Output — exactly one file

docs/missions/2026-08-03-v3-greenfield-requirements/reviews/ReviewLens-Grok-pack.md
Line 1: `REVIEW LENS HANDOFF COMPLETE`. Then: per-artifact verdict (4×),
pack verdict, numbered findings (severity, exact file+section, evidence,
concrete fix), refutations attempted, proof-that-flips. Never contact V; the
Orchestrator merges. Silence is normal.
