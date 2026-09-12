# REV(S01) pass 3 — UNION (the cap) · head `9ddbb1ef` · 2026-09-10 07:22 EEST · orchestrator

Pass 3 of 3. Two lenses, scoped to the pass-2 findings plus every promoted probe of passes 1 and 2 (`review-packages/S01-p3/README.md`); security/data-safety was not re-run at pass 3 (PASS at pass 1, its probes re-run by the correctness lens: 3 pre-existing reds = T4 `t_77100e37` and the two out-of-diff items already ticketed).

| Lens | Ticket | Verdict | B | N | Against the orchestrator / the seat |
|---|---|---|---|---|---|
| correctness/tests (+ the security probes) | `t_479e4751` | REWORK | B1 | N1 | N2, N3, PD1, PD2 — fixed in `27e24e24` |
| product-truth | `t_19085d3f` | REWORK | B1 | N2 (pre-existing, consent-ui) | N1, N3, P1 — fixed in `cc2e1e13` |

Both lenses re-ran every cluster command three times at `9ddbb1ef`: 24 cluster runs, all `CLUSTER_GREEN`, every pair at its declared passed:failed. Both verified all six findings assigned to FIX(S01) pass 2 FIXED (correctness §1.3 M1–M5 at the attribute and stylesheet level; product-truth §2–§3 in the real DOM, both modes): product-p2 B1 `t_07ba5757`, correctness-p2 B1 `t_cd86bced`, N1 `t_16b00d0e`, N2 `t_6312c7ca`, N3 `t_759ceb20`, product-p2 N1 `t_5675766d` — all closed with the verifying artifact cited.

## The two blocking findings — both V rows (3.3: pass 4 does not exist)

| Finding | Ticket | What | Row |
|---|---|---|---|
| correctness-p3 B1 | `t_94f82f12` | FIX pass 2 deleted the four `if (planTier === "free") return;` handler guards (`page.tsx:290,309,500,551`) and the three S01-29 assertions that measured them, and reported "activation state unchanged" — false at the scripted-event level. The browser still stops a real user (product-truth confirms: trusted click, keys, type-ahead all refused, both modes). The render suite is blind in both directions. | **V-25** (belt and braces) |
| product-p3 B1 | `t_9740cdb4` | `apps/ui/app/new/defaults.tsx:74` switched `machine:deployment-floor` → `machine:plan-tier-free` for BOTH tiers (branch on `riskTierWasEdited`, not `planTier`): a Premium ask with an untouched risk tier posts `tier_provenance_ref: "machine:plan-tier-free"` (three real browser asks) and the honesty drawer renders "machine default from the deployment floor · machine:plan-tier-free" (`AnswerHonestyDrawer.tsx:86` + `labels.ts:6`); `tests/unit/tier01-ask-wire.test.ts:63-68` pins it for premium. Supersedes pass-1 security N2 `t_b79ef27e`. | **V-21** (raised to BLOCKING; the lens's default = the row's default) |

## Non-blocking residue at TEST(S01) (V's, not re-judged)

| Finding | Ticket | Disposition |
|---|---|---|
| correctness-p3 N1 | `t_0d714096` | S01-29 measures focus, not activation — renamed or re-armed in the post-veto FIX |
| product-p3 N2 | `t_ec9ca195` | `.consentBar` (fixed, 132px) covers `/new`'s action row; `Start run` clickable only at scroll 522–543 of 588 at 1440×900 — pre-existing, NOT S01's (revert-mutant attributed); consent-ui surface — V decides where it is fixed |
| product-p2 N2 | `t_b82271c7` | only 2 of 10 hints explain the lock (row V-24's mechanism question decides the wording) |
| correctness-p2 N4 | `t_2288b5e7` | the region-reader guard is diagnostic, not detective |
| security T4 | `t_77100e37` | pre-existing, out of diff: `POST /v1/asks` 500 on a >1 MB body |
| pass-1 correctness N2 | `t_318c1522` | `#maxTokens.value` 800 vs Chrome 768 at the old step — moot at step 32 (B1 closed); closes with V's test |
| pass-1 product N3 | `t_7f4df45a` | keyboard reach of the lock explanation — reverted under V-24's default; V's question |
| pass-1 security N1/N3 | `t_9a1c95b4`, `t_2eded532` | rows V-20 / V-22 |
| BUILD-S01-C1 F4 | `t_1e4fccc1` | pre-existing unsafe region helpers — class residue |

Orchestrator/seat findings of this pass — correctness N2/N3/PD1/PD2 (`27e24e24`), product N1/N3/P1 (`cc2e1e13`) — are fixed at the class and closed.

## Union verdict

**REWORK at the cap → V.** The lock the slice exists for is confirmed in the real DOM in both modes; the two blocking findings are a deleted second line of defence (V-25) and one provenance literal (V-21). Under row V-26's default, TEST(S01) proceeds now as built at `9ddbb1ef`; whatever V rules on V-21/V-24/V-25 lands in ONE post-veto FIX before MERGE(S01), checked by the integrated suite at merge.

- The one step V verifies personally at TEST(S01): Free chosen → `⚙ OPTIONS` → click `Fixed ▾` (nothing opens, no ring) — then SPEC-v2 §2 step 12: the `POST /v1/asks` body carries `"plan_tier"` and, today, `"tier_provenance_ref":"machine:plan-tier-free"` on BOTH tiers (V-21).
- The seat's self-reported `pkill -f 'server.mjs --dev'` (P1 `t_978dfce7`): nothing of V's was listening (`:3000`/`:8790` at the assembly baseline and now); the class fix is the PID file in the recipe.
