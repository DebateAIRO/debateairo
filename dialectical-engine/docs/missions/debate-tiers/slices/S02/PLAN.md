# PLAN — S02 · The tier picks the fleet (ticket `t_e4b4ab3a`)

**SCAFFOLD ONLY.** The REQ node leaves this shape; the architecture seat (`ARCH(S02)`) fills every
section and appends each choice to `DECISIONS.md`. No line cap.

## The quantifiability law

Every step is finite, categoric and markable done by a stranger. WRONG: "make the refusal clear".
RIGHT: "an ask with `plan_tier: free` and no healthy `claude-sonnet-5` target answers 422 with
`error: ASK_PLAN_TIER_MODEL_UNAVAILABLE` and a message containing `claude-sonnet-5`, and the test
asserting it passes." Banned in any step or criterion: improve, better, robust, handle, appropriate.
(The five words in the previous sentence are the ban list itself, quoted from
`heartbeat-requirements` §4 — they are not used as a criterion anywhere in this mission's files.)


## The dependency that shapes the order

`plan_tier` and the tier rosters arrive with S01. Before the first step, `ARCH(S02)` records which of
these the lane does: (a) rebase `slice/tiers-s02` onto S01's merged contract change, or (b) proceed
on a local declaration and resolve one conflict at merge. Row **V-12** in `DECISIONS.md` recommends
(a). Whichever is chosen, the repo ends with exactly ONE roster declaration (SPEC R1).

## SPEC → PLAN trace (every SPEC requirement is covered by at least one step)

| SPEC req | Covered by step(s) | Cluster |
|---|---|---|
| R1 reads S01's roster declaration | | |
| R2 rosters are data, not branches | | |
| R3 the filter, and everything downstream of it | | |
| R4 panel size = roster size, persisted panel | | |
| R5 two makers minimum, checked at the declaration — `assertMakerAdmission` throws only on an EMPTY panel; the one-maker consequence is `applyCriticUnavailableCap` (corrected at pass 2, N4) | | |
| R6 typed error through `markAskRefusal`, **raised immediately after the R3 filter and BEFORE `assertMakerAdmission` (`apps/api/src/index.ts:1216`)** — the order is the requirement, not a detail | | |
| R7 422 body naming every missing member | | |
| R8 no run row, no work item on refusal | | |
| R9 no substitution, no partial roster — swept | | |
| R10 the message reaches the form unchanged | | |
| R11 the run records its tier in plaintext | | |
| R12 the command V runs in acceptance step 9 — written in the implementing seat's own READY handoff and self-report; the orchestrator relays it into `PROGRESS.md` and the review package (corrected at pass 2, B4) | | |
| R13 named suites vs baseline | | |
| R14 no new typecheck diagnostic | | |
| R15 **seven** named RED tests — the all-members-missing refusal added at pass 2 (B1); it is the case today's Free tier already is | | |

## Clusters — BUILD units, one verification command each

| Cluster | Steps | What it builds | Verification command (one) | Depends on |
|---|---|---|---|---|
| S02-C1 | | | | |
| S02-C2 | | | | |
| S02-C3 | | | | |

## Boundaries — files this slice may write

Filled by `ARCH(S02)`. Known now: `apps/api/src/index.ts`, `apps/api/src/provider-discovery.ts` if
the filter lands there, `packages/db/src/**` if row V-11 rules for a column, `tests/**` for the
suites the SPEC names. Never `.local/**`. Never `packages/contract/src/index.ts` beyond reading it,
unless S01 has merged and `DECISIONS.md` records the reason.

## RED-first order

SPEC R15 names seven behaviours that need a failing test first (six at pass 1; the all-members-missing
refusal was added at pass 2, finding B1). Each cluster names its RED frame.

## Verification list for the whole slice

Filled by `ARCH(S02)`: the suites of SPEC R13–R14 with baseline numbers, the three-run table shape,
the typecheck delta command, and the read-back command of R12.

## ADRs

One per decision a later reader would otherwise re-derive — in particular the placement ruled by row
V-11 and the migration it may carry.
