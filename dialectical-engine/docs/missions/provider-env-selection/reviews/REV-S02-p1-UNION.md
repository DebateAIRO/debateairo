# REV(S02) pass 1 — UNION (orchestrator, 2026-09-25 20:1x EEST)

| lens | ticket | verdict |
|---|---|---|
| correctness-tests (Opus, a7e0677f0df588fee) | t_51b0d72f | PASS / confidence medium |
| security-data-safety (Opus) | t_757b953b | PASS / confidence high |

**UNION: PASS** at dfef0de94 → TEST(S02) is V's. Both lenses independently reached the same V5(e) reading: the gate's `55432` literal matches the R2.5a exclusion DATUM, not a connection; the gate text is replaced (below) — PLAN text only, no code change.

## V5(e) ruling (orchestrator fold of correctness 8b + security N1)
Gate (e) becomes: the grep `from "pg"|createPool|startTestDatabase|embedded-postgres|standing-db|testDatabase|value-import @debateai/db` over `acceptance/pes-s02-*`, filtered by the exclusion row's CONTENT, prints nothing (proved silent at the head and printing for 3 mutants by the correctness lens); companion gate (e2) = the module-graph probe `probes/REV-PES-S02-p1-correctness-tests/f10/run-f10.sh` (0 embedded-postgres / async-exit-hook / standing-db / pg modules; beforeExit listeners 0). F10 (t_758b03f9) is closed by that measurement for S02.

## Residue carried to TEST(S02) (N, ticketed)
- R1 (ct N1): 3 of 5 upgrade disjuncts in `dev-api-environment.ts:461-464` have no case (mutants U1–U3 survive), incl. a base-era api.env + relay refresh; the product is correct (probe 4/4).
- R2 (ct N2): hosted.ts / fake-vendor.ts outcome branches with no case (X1–X6, X9, F3c, F5b survive).
- R3 (ct N3 = sd prediction): lsof-then-bind port race with no retry — 6 of 12 concurrent processes failed at N=4; fails closed (`UNVERIFIED port bind-raced`), but can print RED on correct code when two runs overlap.
- R4 (sd N2): the fake vendor admits [right, wrong] duplicate `Authorization` headers → 200; use `headersDistinct`.
- R5 (sd N3 → V-19): the hosted loopback refusal checks the host as written; the default documents it in S03 README §11.
- R6 (orchestrator, packet class): BUILD-S02-C2/C3 preamble ranges, truncated allowed entry, README PID path outside allowed, duplicate charge numbering, untracked package frames, 498-file freeze pair, comment cursor (sd N5 a–d; ct N4–N8). setup-lane `L` unset (sd N4) fixed; the shared `.pnpm` store symlink into `.worktrees/i18n-turn12` is known (memory: never remove that tree).
- R7 (ct N9): origin/dev moved to a6d6382ba; S02 merges clean (merge-tree rc 0) but the suites were not re-proven on dev — MERGE(S02) runs the integrated suite.
