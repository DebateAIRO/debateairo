# REV(S01) pass 2 — UNION of two scoped lenses · verdict: **REWORK**

FIX head `53b903d2` (`f6c147cc` + F2 `f9b40d0f` + F1 `53b903d2`) · package `review-packages/S01-p2/` · unioned 2026-09-10 05:57 EEST by the orchestrator, mechanically.

| Lens | Ticket | Verdict | Blocking | Non-blocking | Packet defects (against the orchestrator) |
|---|---|---|---|---|---|
| correctness/tests (+ the security probes) | `t_f8494fff` | REWORK | B1 | N1–N6 | PD1–PD3 — fixed in `f55f771c`, COMMON:3 |
| product-truth | `t_4fcba563` | REWORK | B1 | N1–N3 | none |

Both lenses re-ran every cluster command three times at `53b903d2`: 24 cluster runs, all `CLUSTER_GREEN`. Both verified the pass-1 findings B1 (max tokens), product N1 (nowrap), correctness N1/N3/N4 FIXED.
Both B1s have ONE cause: F1's remedy for pass-1 product N3 replaced the ratified native `disabled` with `aria-disabled` + inline paint, so the two Free-locked dropdowns are live `<select>`s under Free (a trusted click focuses one and paints the `--focus` ring), SPEC-v2 §2 step 6 fails, DONE.md M8's "nothing else" breaks, and the stylesheet's four `:disabled` lock selectors match nothing while the style contract still pins them.

## Every finding of the pass, assigned

| Finding | Ticket | Fact | Assigned to |
|---|---|---|---|
| product-p2 B1 (blocking) | `t_07ba5757` | the Free lock is no longer a lock (live selects, focus ring, step 6 fails, dead `:disabled` CSS) | **FIX(S01) pass 2** `t_62644380` under the V-24 default (native `disabled`; convergence) |
| correctness-p2 B1 (blocking) | `t_cd86bced` | three mechanisms; the contract pins CSS nothing matches (mutants bite backwards) | same node |
| correctness-p2 N1 | `t_16b00d0e` | SPEC §2 step 6 pinned by no test | same node (the native-family assertion returns) |
| correctness-p2 N2 | `t_6312c7ca` | the grid assertion pins one slider, not the class of four | same node |
| correctness-p2 N3 | `t_759ceb20` | the five real roster ids unpinned against M7 | same node |
| product-p2 N1 (pre-existing) | `t_5675766d` | `cursor: pointer` on the select overlay wins at the hit point | same node (one declaration in the S01 block) |
| correctness-p2 N4 | `t_2288b5e7` | the region guard is diagnostic only | recorded, no change |
| product-p2 N2 | `t_b82271c7` | 8 of 10 hints never say why the control is unavailable | residue under V-24 (moot under native `disabled`) |
| product-p2 N3 | `t_e352a782` (closed: folded) | the Free keyboard path grew 5 → 20 stops | **row V-24** (with the lens's two `V-ROW: NEW` blocks, §8) |
| pass-1 product N3 | `t_7f4df45a` | keyboard reach of the lock explanation | REVERTED under V-24's default — V's question |
| correctness-p2 N5/N6, PD1–PD3 | closed | mine | fixed (`f55f771c`, COMMON:3, lane `16252e46`) |

## Pass 3 — the last
- **FIX(S01) pass 2 = ONE node** (`heartbeat-orchestrator` §6 as amended: the finding surface spans `page.tsx`, the `globals.css` S01 block, the render suite and the style contract): Codex Sol in the S01 lane at `16252e46` (= `53b903d2` + the `.codex` mirror sync).
- **REV(S01) pass 3**, scoped to the pass-2 findings + every promoted probe of passes 1–2: correctness/tests `t_479e4751` (+ the security probes) and product-truth `t_19085d3f`. Pass 4 does not exist: a pass-3 REWORK is a V row.
- The one step V verifies personally at TEST(S01): Free chosen → ⚙ OPTIONS → click `Fixed ▾`.
