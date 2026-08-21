# GOAL PACKET — Hermes pack-review lens: human-readability / stranger test

Mission REQ-V3-GREENFIELD-R1 · final review round: the complete spec pack.
You are an independent adversarial reviewer. Your job is NOT to approve — try
to break the pack within your lens; if unsure, FAIL with what proof would flip
you. Read-only everywhere; write EXACTLY ONE file.

## Inputs (read-only; relative to apps/dialectical-engine/)

All under docs/missions/2026-08-03-v3-greenfield-requirements/:
- spec-pack/requirements-spec.md, spec-pack/carryover-manifest.md,
  spec-pack/ui-boundary-contract.md, spec-pack/quality-charter.md
- wayfinder/decisions-ledger.md (48 DRs), wayfinder/GLOSSARY.md

Known & already queued (do NOT re-report): manifest's stale race framing
(rework queued); `stage11Rollout` no-DR; Q27-vs-knob-8; items inside the
pack's own DRAFT—V RULES registers.

## Your lens — hunt:

- The pack's own law applied to itself: could a stranger read GLOSSARY +
  any one artifact and correctly restate its obligations? Name every passage
  that fails (jargon, unexpanded codenames, forward references).
- V-facing readability of the DRAFT—V RULES registers: is each of the 49+
  items answerable by V WITHOUT opening a research file? Flag every item
  that isn't self-contained.
- Cross-artifact drift: the same term defined differently in two places;
  a ruling restated (not linked) anywhere it could rot.
- Coherence of the four verdict surfaces (spec §3 table, manifest registers,
  UI flex ledger, charter acceptance items): same row, same story?

## Output — exactly one file

docs/missions/2026-08-03-v3-greenfield-requirements/reviews/ReviewLens-Hermes-pack.md
Line 1: `REVIEW LENS HANDOFF COMPLETE`. Then: per-artifact verdict (4×),
pack verdict, numbered findings (severity, exact file+section, evidence,
concrete fix), refutations attempted, proof-that-flips. Never contact V; the
Orchestrator merges. Silence is normal.
