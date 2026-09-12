# REV(S02) pass 1 — UNION of three blind lenses · verdict: **REWORK**

Slice head `9ef275aa` (`slice/tiers-s02`; package base `3bf54957` for C2–C4, `7f89f7b7` for C1) · package `.hermes/reports/debate-tiers/review-packages/S02-p1/` · unioned 2026-09-12 11:55 EEST by the orchestrator, mechanically: PASS only when every lens passed.

| Lens | Ticket | Verdict | Blocking | Non-blocking | Packet / package defects (against the orchestrator) |
|---|---|---|---|---|---|
| correctness/tests | `t_edf20575` | **REWORK** | B1, B2 (= security N2) | N1 (= product N3), N2 (= product N4), N3, N4, N5 (= security N1) | N6 (PROGRESS relay), N7 (the REV packet's diff line + missing trap) |
| security/data-safety | `t_2061ade7` | PASS | 0 | N1, N2 | N3 (probes.md / V-19 cite the superseded migration line) |
| product-truth | `t_cb78a63d` | **REWORK** | B1 | N1 (→ V-28), N2 (→ V-29), N3, N4, N6, N7 | N5 (COMMON §6 vs the oracle on `grok-4.6`) |

Every cluster command was re-run by every lens at `9ef275aa` (security twice, the others three times) and every number matched `reverify-9ef275aa.txt`; the three `s14-contract` failures are pre-existing in every run. No lens found the built behaviour wrong at the admission face: every refusal shape names the tier and every missing member, R4's equality holds, R8 holds on a real database, R12 reads back for all four cells. What the pass found is (1) a real regression outside every cluster command, (2) guards and re-fixtures weaker than the requirements they carry, and (3) two questions for V.

## Every finding of the pass, assigned

| Finding | Ticket | Fact (file:line) | Assigned to |
|---|---|---|---|
| correctness B1 (blocking) | `t_ca11cffb` | `packages/db/src/index.ts:1248` names `plan_tier` in the INSERT unconditionally; 35 cases in three truncated-migration suites GREEN at base, RED at the head (42703); 76/76 with only that file reverted; class of 7 (artifact §3 B1, lines 146–205); probe `reports/probes/REV-S02-p1-correctness-tests-pre-0061-schema.sh` | **FIX(S02) p1 F1** `t_ee9362b5` |
| correctness B2 = security N2 (blocking) | `t_ca46998d` | `tests/integration/evaluator-database.test.ts:1446-1460` the FR-0.6 AC5 evaluator-isolation assertion cannot fail after the re-seed (mutant M12; two-cell mutant by the security lens) | **FIX(S02) p1 F2** `t_9d4e5e77` |
| product B1 (blocking) | `t_cc661b9e` | `tests/unit/tiers-s02-admission.test.ts:140/:176/:187` assert the code, never the message (SPEC R15); mutant M2 ships green; class of four members (artifact §4 B1, lines 192–229) | FIX(S02) p1 F2 |
| correctness N4 | `t_c38a3fdd` | `tests/unit/tiers-s02-admission.test.ts:213-267` (R8 case) accepts any early throw (M16/M17) | FIX(S02) p1 F2 |
| security N1 = correctness N5 | `t_d86b98ce` | `apps/api/src/index.ts:1207-1210` unguarded prototype-chain / out-of-vocabulary roster lookup → untyped TypeError → 500 (unreachable over HTTP) | FIX(S02) p1 F2 |
| correctness N3 | `t_51aa7ae5` | `tests/unit/tiers-s02-wire.test.ts:89-108` the single-caller guard walks only `apps/api/src/index.ts` + `packages/*/src` (M10 survives) | FIX(S02) p1 F2 |
| product N3 = correctness N1 | `t_bd8e3b18` | `tests/architecture/tiers-s02-rosters.test.ts:68-70` the R2 guard is line-local (M9b, M15, product M6 survive; a copy line naming both tiers beside `===` is condemned) | **FIX(S02) p1 F3** `t_780edb02` |
| product N4 = correctness N2 | `t_f2da2b9a` | `tests/architecture/tiers-s02-rosters.test.ts:90-103` absolute line pins into `apps/ui/components/landing/cards.ts` (M14: one comment line turns the guard RED) | FIX(S02) p1 F3 |
| product N1 | `t_2c95f424` | the `ASK_PLAN_TIER_MODEL_UNAVAILABLE:` prefix on the asker-facing refusal (`packages/contract/src/client.ts:88-91`) | row **V-28** (default: leave S02, route the copy change) |
| product N2 | `t_1ec7cae5` | the runner may shrink an admitted tier panel at claim time (`apps/runner/src/index.ts:1366-1421`), marked by `provider_ref` | row **V-29** (default: leave S02, open a slice) |
| product N7 | `t_0e696ff8` | `apps/ui/components/landing/cards.ts:29` shows `gemini-3-ultra`, in no roster — copy outside the diff | V's call, shown at TEST(S02) |
| product N6 | `t_018d588c` | SPEC-v2 R3/R4 line citations drifted under C1 (`schema.ts:123`→`:124`; `db/index.ts:973-979`→`974-980`) — SPEC frozen | note for the oracle handoff at TEST(S02) |
| product N5 · security N3 · correctness N6 · correctness N7 | `t_cf4f7f56` · `t_8f8520e6` · `t_42d46edd` · `t_512afe29` | orchestrator's: COMMON §6 wording (reconciled) · probes.md/V-19 migration line (corrected) · PROGRESS.md R12 relay (repaired) · the REV packet's diff line + missing trap (class-fixed in the p2 packets) | `t_cf4f7f56` `t_8f8520e6` `t_42d46edd` close at this tick's freeze; `t_512afe29` closes when the p2 REV packets pass packet-check carrying the class fix |
| C4 packet P1/P2 · C3 F1 · C2 F1/F2 | `t_5983f27a` `t_dbbb615b` `t_2e74f402` `t_ce7452ba` `t_1e99444c` | pre-review residue (packet/plan precision) | recorded; shown at TEST(S02) if still open |

## Pass 2
- **FIX(S02) p1 F1** (`packages/db/src/index.ts`, `packages/db/src/schema.ts`, `migrations/0061_plan_tier_on_run.sql`, `tests/integration/tiers-s02-run-plan-tier.test.ts`) ∥ **FIX(S02) p1 F3** (`tests/architecture/tiers-s02-rosters.test.ts`) — Codex Sol, the S02 lane at `9ef275aa`, disjoint write surfaces, fresh sessions. Then **FIX(S02) p1 F2** (`apps/api/src/index.ts`, `tests/unit/tiers-s02-admission.test.ts`, `tests/integration/evaluator-database.test.ts`, `tests/unit/tiers-s02-wire.test.ts`) AFTER F1 — its cluster commands run `evaluator-database` through the write path F1 edits.
- **REV(S02) pass 2**, scoped to the findings above plus every promoted pass-1 probe (`.hermes/reports/debate-tiers/probes/REV-S02-p1-*`) re-run at the FIX head: lens correctness/tests (also re-running the security lens's promoted probes — security PASSed at pass 1) and lens product-truth. Tickets `t_1a0293cc`, `t_37e841db`.
- If pass 2 passes: no code residue from this pass (everything is assigned); rows V-28/V-29 and product N6/N7 go to V at TEST(S02), with V-7 (the fleet) still ahead of steps 1–4 and 8.
