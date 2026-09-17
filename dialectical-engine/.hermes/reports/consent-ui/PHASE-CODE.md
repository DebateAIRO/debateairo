# Phase report — PROGRAMMING loop, mission `consent-ui` (2026-09-06 22:17 → 2026-09-07 08:10; Grok element gates launched 08:13)

**Gate:** every cluster of both slices PASSED blind review (S01 C1–C7; S02 C1–C9; CROSS-01/02/03, the last at round 2) — final head `slice/consent-s02` @ `4cc0f4b6`. The three Grok 4.6 element gates (10a bar, 10b card, 10c modal + sign-up gate) ran on that head 08:13–08:35 per V's roster and all three PASSED with 0 blocking findings (verdicts `reviews/GROK-REV-S01-10A-r1.md`, `GROK-REV-S01-10B-r1.md`, `GROK-REV-S02-10C-r1.md`; skills verified in the Grok transcripts). **GATE REACHED 08:35.** V's test points follow (`V-TEST-POINT.md`); V-23/V-24 opened. Slice tickets `t_26efb70d` (S01) and `t_9ccf3598` (S02) close only under V's veto.

## Rounds and cost (Opus 5 seats; minutes are wall-clock from dispatch to handoff, tokens where the harness reported them)
| Cluster | Lane | Author | r1 verdict | Rework | r2 verdict |
|---|---|---|---|---|---|
| S01-C1C2 | consent-s01 | 28 min / 374k | **PASS** 19 min / 272k | — | — |
| S01-C3C4 | consent-s01 | 37 min / 399k | **PASS** 28 min / 299k | — | — |
| S01-C5 | consent-s01 | 36 min | **PASS** 31 min (0B/3N/5P) | — | — |
| S01-C6 | consent-s01 | 35 min | REWORK 23 min (B1 stranded `policyOpen` flag) | 19 min | **PASS** 25 min |
| S01-C7 | consent-s01 | 30 min | **PASS** 23 min (0B/4N/3P) | — | — |
| S02-C1C2 | consent-s02 | 29 min / 335k | REWORK 22 min / 290k (B1 child-first effect order) | 18 min | **PASS** 29 min / 297k |
| S02-C3C4 | sub-lane form | 24 min / 286k | **PASS** 22 min / 233k | — | — |
| S02-C5C6 | sub-lane modal | 28 min | **PASS** 32 min (0B/7N) | — | — |
| S02-C7 | consent-s02 | 37 min | **PASS** 28 min (0B/8N) | — | — |
| S02-C8 | sub-lane css | 32 min | REWORK 25 min (B1 the false `.70 → 5.61` figure) | 22 min | **PASS** 23 min |
| S02-C9 (integration) | consent-s02 | 22 min / 290k | REWORK 25 min / 293k (B1 cross-slice `Esc` on `/sign-up`) | → CROSS-02 | **closed on CROSS-02's verdict** |
| CROSS-01 (focus return, V-22) | consent-s02 | 27 min / 302k | **PASS** 25 min / 312k (0B/3N/9P) | — | — |
| CROSS-02 (open-order `Esc`, V-20 (b)) | consent-s02 | 31 min / 321k | **PASS** 28 min / 315k (0B/6N/12P) | — | — |
| CROSS-03 ((b′) tiebreak + residue) | consent-s02 | 31 min / 345k | REWORK 26 min / 391k (B1 the packet's reflexive `contains`) | 23 min / 374k | **PASS** 29 min / 416k (0B/3N/8P) |

Merges performed by the orchestrator (PLAN-named, no verdict authority exercised): form → S02 `68f3ea33`; modal → S02 `44744d8d`; S02 → S01 `92828aa5` (S01-S36); css → S02 `e8bf0658`; S01 → S02 `19cc8e77` (S02-S66; the one conflict, `globals.css` end-of-file, resolved S01 block then S02 block). Every seat filed its self-report before its handoff was acknowledged; every `SKILLS LOADED` line was verified against the transcript BODY (0 fabrication findings; two honest shortfalls declared by reviewers that did not need `receiving-code-review`).

## What the loop found that the plans' authors could not
- **B1 of C9 — the cross-slice `Escape` defect on `/sign-up`.** Nine clusters were green because no test mounted both slices in one document; the C9 reviewer built the fixture (COMMON §10.53 now demands one per merge cluster). It exposed V-20's default (document order) as wrong at the merged head: the layout mounts the cookie surfaces after the page while the sign-up policy renders inside it. Discharged by CROSS-02 (open order), refined by CROSS-03 (containment-only tiebreak) after the CROSS-02 reviewer implemented and priced the rival rule.
- **V-22's wording was unsatisfiable** (named-control-first regresses the Settings opener under S01-R14); the CROSS-01 seat measured it and shipped surviving-capture-first; its reviewer confirmed by mutant.
- **The `.70` contrast figure** (C8): the seat's "5.61" was false; 5.54 = the PLAN, decided by the spelling of `1 − α`.
- **The stranded `policyOpen` flag** (S01-C6) and the **tracker resync** (S02-C7, kept and pinned) — both invisible to the author's suites, both caught by reviewers' own fixtures.
- **The orchestrator's packets were the largest single source of findings** (see below).

## Orchestrator defects this loop (all priced in the ledger; the class fix for each is a COMMON §10 amendment)
Cited lines lifted from tool output (§10.24 addenda), count predictions (§10.42), three-section allowed lists (§10.41), a corrected constant left beside its refutation (§10.48), sets named in prose (§10.49), silent PLAN overrides (§10.50), a helper cited for half a charge (§10.51), the author's figures anchoring a blind lens (§10.52/54/65/69 — three rounds to close: appendix, then a CLAIMED section, then a sibling file with line-ranged skips), no cross-slice mount in the integration cluster (§10.53), a packet mechanism never dry-run against the existing cases (§10.55), the cursor transcribed from CLAIM (§10.56), a probe cited as an oracle without reading its assertions (§10.59), TRAPS freshness and the displaced full read (§10.60/66/67), "comment-only" asserted not measured (§10.61), a pair of cases described as one "flip" (§10.62), an allowed list missing a mandated ticket (§10.64), and a measured remedy transcribed into a reflexive API (§10.68 — CROSS-03's one blocking finding). Thirty-eight amendments (§10.30–10.67) in one loop is itself the finding: the packet template must carry these as checks, not as memory.

## V rows opened or amended this loop
V-9 … V-19 (earlier), V-20 (three addenda: document order failed at the merged head → (b); the single-commit inversion; (b′) taken as default), V-21 (the `receiving-code-review` floor), V-22 (one addendum: the corrected precedence). V-9 is EARLY; V-15/V-18/V-19/V-20/V-22 fold into one SPEC-v4 authorization at closure.

## Open residue (ticketed, running beside the fleet)
`t_4f97ca86` (S02 PLAN/docs: `run_c9` merge arms, file counts, PROGRESS wording, the cross-slice suite in no cluster command), `t_38c6bbf2` (S01 docs: `CMD-C6` moving ref → `2127c4ad`, TRAPS index), `t_8962842f` (A11Y-OVERLAYS inherits: helper `survived` = connected-not-focusable; z-ladder vs `Esc`-stack agreement assertion), `t_466c8034`, `t_bb70fa13`, `t_0f8688d8`, `t_8c256490`, `t_5fe1f90a`, `t_94c9010a` (RULED: a tests tsconfig project). `t_9f2dea04` and `t_51101c72` were discharged by CROSS-03 and closed at its round-2 PASS; `t_f9c52ced` carries the round-2 residue (ADR coverage claim, one-word termination slip, the three-sharer premise).

## S02-S69 — the dev-stack acceptance
`UNVERIFIED — dev stack not serving this branch` from every coding seat: the running stack (pid 5436) serves the main tree; ports are fixed; one stack at a time. `docs/missions/consent-ui/V-TEST-POINT.md` carries the copy-pasteable recipe (stop, copy the custody tree, never regenerate — the DB is shared, `pnpm dev:auth:up` from the lane) and the four unknowns the research could not settle.
