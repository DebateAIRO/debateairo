# Loop report 03 — S02 · Graph and the cycle law (2026-08-08 mid-morning)

Per DR-123 clause 4. Compare loop-reports 01 (S00: a night) and 02 (S01: 57m).

## Wall-clock accounting

| Phase | Window (EEST) | Duration |
|---|---|---|
| Continuous session claims S02 (self-service, thin dispatch) | ~09:57 | — |
| Build → submitted to review | 10:12 | ~15m build |
| Gate round 1 → REAL DDL gap (NULL-strength edge accepted; P17) | 10:14 → blocked 10:15 | 2m |
| Codex self-pickup → migration fix → resubmit | 10:19 | 4m |
| Gate round 2: first run RACED Codex mid-write (313s spurious fail), clean rerun 82/82 | 10:21 → 10:27 | 6m (≈5 wasted) |
| Diamond dispatched | 10:28 | — |
| **MACHINE SLEEP (battery ran out)** — both reviewers died mid-read; Codex session + board survived | ~10:28 → ~10:35 | ~7m + recovery |
| Recovery: reviewers relaunched; ORIGINALS then revived post-wake and delivered; duplicates killed | 10:35 → 10:47 | ~12m |
| Verdicts: GROK APPROVED + CLAUDE APPROVED (0 blocking) | ~10:45 | — |
| **Total cycle** | **~09:57 → ~10:50** | **~53 minutes** (incl. the sleep) |

## What the loop caught (all real)

1. Gate r1: **a P17 violation only a real database can expose** — raw SQL
   accepted a NULL-strength edge; the invariant was app-layer-only. Fixed IN
   the migration; the Opus reviewer later proved it from the server log
   (edge_check4) and audited every sibling limb as database-enforced.
2. Diamond: 12 non-blocking findings; **two promoted to S03 ENTRY
   CONDITIONS** (snapshot INNER JOIN drops judgement-less nodes → the
   02 §5.5(5) forbidden state; snapshot reads lack one transaction) — placed
   directly on the S03 ticket as a comment so the worker hits them first.
3. S01 carry-forwards 5 (migration idempotency) and 10 (Drizzle drift) were
   fixed by Codex inside this cycle and PROVEN by the reviewer — the
   carry-forward hygiene channel works.

## Incidents & fixes

- **Gate raced the worker** (one spurious 313s run): the gate ran while Codex
  was still writing its fix. ADOPTED: gate runs only after the ticket status
  is `review` AND the progress log shows the resubmission entry (quiescence
  check) — costs nothing, kills the race.
- **Machine sleep from battery**: killed both reviewers mid-flight; Codex
  CLI session and board survived; the revived originals delivered after wake
  (duplicates I'd relaunched were killed — small wasted cost). Lesson
  ADOPTED: after any wake/recovery, check for revived originals BEFORE
  relaunching replacements. (V: a plugged-in laptop is the cheap fix.)

## Cadence

S00: one night (env bring-up + wedge). S01: 57m. S02: ~53m including a
machine sleep. Steady state ≈ 45-55m/ticket with two quality gates in the
path. Thirteen tickets remain → ~10-12 working hours of loop time at current
cadence, excluding V-gated tails (live model, Docker phase).

## Next cycle (S03 · Scoring engine)

DF-QuAD, both operators, ruled lifting + collapse + pending arithmetic — the
mathematical heart. Entry conditions posted on the ticket. Watch: purity
fence pressure (scoring must stay in the pure core), no invented constants
(every operator parameter must trace to a ruled source or register row).
