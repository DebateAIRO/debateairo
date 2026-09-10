# Review package S01-p3 — slice S01 of `debate-tiers`, REV pass 3 (the LAST pass; scoped)

Assembled mechanically by the orchestrator on 2026-09-10 06:44 EEST. The FIX head under review is `9ddbb1ef` = `16252e46` (`53b903d2` + the `.codex` mirror sync) + FIX(S01) pass 2 `9ddbb1ef`. Four files, +69/−57 (`diffstat.txt`; `diff-53b903d2..9ddbb1ef.patch`; `commits.txt`). Pass 4 does not exist: a REWORK here is a V row.

## Scope of pass 3
1. The pass-2 findings assigned to FIX(S01) pass 2 (`union-p2.md`, the table): product-p2 B1 `t_07ba5757`, correctness-p2 B1 `t_cd86bced`, N1 `t_16b00d0e`, N2 `t_6312c7ca`, N3 `t_759ceb20`, product-p2 N1 `t_5675766d`. The seat's READY comment (`board/FIX-S01-p2.t_62644380.txt` — the comment whose AUTHOR is `FIX-S01-p2` and which opens with `SKILLS LOADED`) claims each ADDRESSED with RED→GREEN under row V-24's default: native `disabled` on all 14 Free-locked controls, no `aria-disabled`, no inline paint, the stylesheet's `:disabled` rules the only paint, `.ndSelect select:disabled { cursor: not-allowed }` added (`globals.css`, the S01 block), the render suite pinning the four families 6/4/2/2, all four slider grids and the five real roster ids.
2. Every promoted probe of passes 1 and 2 (`probes-p1p2.txt`, 25 entries) re-run at `9ddbb1ef`, re-pathed to YOUR worktree (they hard-code other worktrees — pass-2 N5). The pass-2 seam probes (`REV-S01-p2-product-truth/seam-lock-mutant.js`, `trusted-input-rollback.js`, `REV-S01-p2-correctness-tests-seam.test.tsx`) must now show the OPPOSITE of pass 2: a trusted click on the `Fixed ▾` box under Free reaches a disabled `<select>`, no focus ring, `document.activeElement` unchanged; ArrowRight on `#treeDepth` changes nothing; the `:disabled` rules are matched by 14 elements.
3. The oracle in the real DOM, both modes (product-truth): DONE.md M8 — `opacity: 0.45; cursor: not-allowed` on the hit element of every locked control INCLUDING the two dropdowns (product-p2 N1), and "nothing else" (no ring, no glyph); M9–M12; SPEC-v2 §2 steps 1–12 once more, step 6 above all ("the dropdowns will not open and the three sliders will not move").
4. Residue you do NOT re-judge (V's, at TEST(S01)): rows V-20…V-24; product-p2 N2 (hints); correctness-p2 N4; security T4; pass-1 product N3 reverted under V-24.
5. The seat's own UNVERIFIED: the reviewer's `seam.test.tsx` probe was BROKEN from the lane (`No test files found` under four configurations) and its assertions re-derived inside the official suites; the seat ran no trusted-browser check — the browser is the product-truth lens's.

## Re-verification by the orchestrator at 9ddbb1ef
`reverify-9ddbb1ef.txt` (06:44, the S01 lane, 0 dirty, `generate:contract` rc 0): the four cluster commands with the pairs restated (`tier01-new-plan-tier.test.tsx:22:0`, `tier01-style-contract.test.ts:8:0`): CLUSTER_GREEN CLUSTER_GREEN CLUSTER_GREEN CLUSTER_GREEN; raw output per cluster in `reverify-C<n>.log` beside it.

## What stands
`../S01-p1/README.md` (the oracle, the cluster map, `dev-stack.md` with the listener baseline and the per-seat recipe), `../S01-p2/README.md` (the seam's history). DONE.md carries the dated M7 correction.

## The two lenses of pass 3
- correctness/tests (`t_479e4751`): items 1, 2 and 5 at the test level, plus the security probes.
- product-truth (`t_19085d3f`): items 2 (the seam probes in the DOM) and 3, both modes, on your own stub + UI server.
