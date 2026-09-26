# REV(S03) pass 2 — UNION (orchestrator, 2026-09-25 16:37 EEST)

| lens | ticket | verdict |
|---|---|---|
| correctness-tests (Opus) | t_b2ed2eae | PASS — F1 closed |
| security-data-safety (Opus) | t_e2a75414 | PASS — F1 closed |

**UNION: PASS.** F1 (pass 1) closed by FIX S03 p1 (60993d2db): every pass-1 mutant now RED; the retype residual is not a finding (source mutants catch it).

## Residue carried to TEST(S03) (N, ticketed)
- R1: the V-8 exclusion is pinned only in the table's FIRST column — a run-time spend code in a Meaning cell, in prose inside the refusal span, or in a second table stays green (both lenses).
- R2: a row's Meaning cell is not tied to its code (swap/empty stays green); nine first-column codes pinned to a literal list rather than to source (both lenses).
- R3 (V-18): origin/dev (a6d6382ba) rewrote deploy/vps/README.md (873 → 1344 lines, its own 17-code table); six of the slice's eight README hunks overlap it; the slice's v9 suite on dev's README: 8 failed / 23 passed. Merge is not clean.
- R4 (orchestrator, fixed going forward): p2 packet freeze pair degenerate; p2 package lacked the FIX-range diff + scope block; FIX packet cited :453 for the pin at :437; pass-1 probes hard-code worktree paths.
