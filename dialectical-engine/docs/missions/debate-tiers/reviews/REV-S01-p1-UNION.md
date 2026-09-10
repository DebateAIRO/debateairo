# REV(S01) pass 1 — UNION of three blind lenses · verdict: **REWORK**

Slice head `f6c147cc` (`slice/tiers-s01`, base `7f89f7b7`) · package `.hermes/reports/debate-tiers/review-packages/S01-p1/` · unioned 2026-09-10 04:23 EEST by the orchestrator, mechanically: PASS only when every lens passed.

| Lens | Ticket | Verdict | Blocking | Non-blocking | Packet / package defects (against the orchestrator) |
|---|---|---|---|---|---|
| correctness/tests | `t_df524f91` | PASS | 0 | N1–N4 | N5, N6, R1 — fixed in `45294264` |
| security/data-safety | `t_660e86e5` | PASS | 0 | N1–N3 (V rows), T4 pre-existing | P1–P3 — fixed in `45294264` |
| product-truth | `t_8ea6c036` | **REWORK** | B1 | N1–N3 | N4 — fixed in `45294264`; D1 (DONE.md M7 omission, orchestrator) — corrected, rule in `7acdc95d` |

Every cluster command was re-run by every lens three times at `f6c147cc`: 36 cluster runs, all `CLUSTER_GREEN`. All three lenses measured the rendered DOM with the real compiled CSS in both modes against their own stub API + UI server; the wire carried `plan_tier` free/premium with 202 on every stack.

## Every finding of the pass, assigned

| Finding | Ticket | Fact (file:line) | Assigned to |
|---|---|---|---|
| product B1 (blocking) | `t_1bf44393` | `apps/ui/app/new/page.tsx:390-396` `min=128 max=4000 step=128` vs `:91`/`:129` value 800 → Chrome holds 768, prints 800 (4000 → 3968); `tests/render/tier01-new-plan-tier.test.tsx:346` green only in jsdom → DONE.md M10 unbacked | **FIX(S01) F1** |
| correctness N2 | `t_318c1522` | the same defect from the test side | FIX(S01) F1 (with B1) |
| product N3 | `t_7f4df45a` | `page.tsx:449`/`:451` the lock explanation is unreachable by keyboard (`disabled` leaves the tab order; `.ndHint` has no `aria-describedby`); the remedy stays invisible (DONE.md §5) | FIX(S01) F1 |
| correctness N3 | `t_1c27e245` | `page.tsx:65-70`, `:208-212` `modelIdentity` greys ids `modelMeta(id).dot` colours | FIX(S01) F1 |
| product N1 | `t_8f4927d4` | `globals.css` `.ndTierModel` lacks `white-space: nowrap` (all 14 artboards carry it; DONE.md M7 corrected) | **FIX(S01) F2** |
| correctness N1 | `t_6365fd82` | `tests/unit/tier01-style-contract.test.ts:153-189` pins token NAMES, not values | FIX(S01) F2 |
| correctness N4 | `t_3c762b9f` | `tier01-style-contract.test.ts:11-16`, `:73-78` unguarded region readers (`t_1e4fccc1` class) | FIX(S01) F2 |
| security N1 | `t_9a1c95b4` | the Free gauge set is enforced client-side only | row **V-20** (S02's: REQ-FIX(S02) SPEC-v3 before S02-C2) |
| security N2 | `t_b79ef27e` | a Premium ask writes `tier_provenance_ref: machine:plan-tier-free` (append-only column) | row **V-21** — the product-truth lens holds this is SPEC-v2 R7 by design; two lenses disagree on ONE finding and the disagreement IS the V question (R7 is frozen), so no re-check node: V rules at TEST(S01) |
| security N3 | `t_2eded532` | the displayed rosters govern no routing until S02 | row **V-22** (no push of S01 before S02) |
| product N2 | `t_15c43eda` | the Premium promise covers five OPTIONS knobs the app does not send | row **V-23** |
| security T4 | `t_77100e37` | pre-existing `500` on bodies over ~1 MB, out of S01's diff | repo residue (open) |
| correctness N5/N6/R1 · security P1–P3 · product N4 | closed | packet and package defects | fixed at the class in `45294264` |
| orchestrator D1 | `t_dcf9531e` (closed) | DONE.md M7 omitted `white-space: nowrap` | DONE.md corrected; rule in `7acdc95d` |

## Pass 2
- **FIX(S01) F1** (page surface: `apps/ui/app/new/page.tsx` + `tests/render/tier01-new-plan-tier.test.tsx`) ∥ **FIX(S01) F2** (stylesheet surface: the `globals.css` S01 block + `tests/unit/tier01-style-contract.test.ts`) — Codex Sol, the S01 lane at `f6c147cc`, disjoint write surfaces, each packet naming the other's paths as untouchable.
- **REV(S01) pass 2**, scoped to the findings above plus every promoted pass-1 probe (`.hermes/reports/debate-tiers/probes/REV-S01-p1-*`) re-run at the FIX head: lens correctness/tests (also re-running the security lens's probes — the FIX touches no API surface) and lens product-truth (the real DOM, both modes).
- If pass 2 passes: no code residue from this pass (everything is assigned); rows V-20…V-23 and T4 go to V at TEST(S01).
