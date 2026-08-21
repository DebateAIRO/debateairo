# S3d REWORK 2 — direct fresh Claude Opus review overlay

Ticket `t_cc197ed2`, board `accounts-phase1`. This packet is a routing overlay
for the technical contract in `reviews/S3d-r2-review-packet.md`.

## V/user continuity override — 2026-08-20

The user explicitly replaced the old Fable-relay/P8-continuity constraint:

- launch a **fresh Claude Opus reviewer directly in a visible local Terminal**;
- no Fable relay is required;
- write the Opus-family verdict to
  `reviews/S3d-r2-opus-verdict.md` so the existing diamond artifact names stay
  stable.

This overlay supersedes only the base packet's statements that the Opus lens
must resume P8 or be transported by Fable. Every technical scope, falsification
requirement, gate, gold-hash rule, single-heavy rule, no-commit/no-push rule,
and board-state prohibition in the base packet remains binding.

## Blindness and authority

Read this overlay and `reviews/S3d-r2-review-packet.md` in full. Do **not** read,
open, search for, or cite `reviews/S3d-r2-grok-verdict.md` or any sibling r2
verdict. The r1 verdicts named by the base packet are required historical input,
not sibling r2 verdicts.

Work as a reviewer, not an implementer. You may create a scratch harness and
apply one temporary mutation at a time only as the base packet permits. Restore
each mutation byte-identically and hash-check it before continuing. Do not make
product fixes, commit, push, or mutate kanban state.

The base packet contains a transcription defect in the identity integration
hash. The canonical 64-hex gold value is:

`tests/integration/identity-database.test.ts`
`05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432`

All other base-packet hashes remain unchanged.

## Required return

Independently attack every primary and secondary claim in the base packet,
including the real 5,000 ms grant-to-grant oracle on both routes, clean/load
stability, VR-10, derived-gate wrong-state attack, in-window send accounting,
availability bursts, frozen S3b 100/100, 18-second deadline channel, counted
aggregation, fixed-ceiling RSS plateau, reservation arithmetic, full gates, and
final gold restoration.

Write exactly one verdict to `reviews/S3d-r2-opus-verdict.md` with first-line
`GREENLIGHT` or `BLOCK`, numbered findings, measured evidence, and the required
SELF-REPORT. The availability trade remains `V DECISION REQUIRED`, not a
reviewer policy choice. Return only after the verdict exists and stdout clearly
states the verdict.

