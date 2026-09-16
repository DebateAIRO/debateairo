# REV(S03) pass 3 of 3 — UNION verdict: **REWORK** (the last lawful pass → rows V-47, V-48, V-49)

Unioned by the orchestrator on 2026-09-16 13:14 EEST from the three lens verdicts at the merged head **3f488b3f** (`integration/all` = the S03 lane 0fe14637 after FIX-S03-p2-F1, merged with every local branch). PASS only when every lens passes; two do not.

| Lens | Ticket | Verdict | Artifact |
|---|---|---|---|
| security-data-safety | t_005aaddc | **PASS** (lens verdict; N13/N14 flagged "blocking for the slice through product-truth") | `REV-S03-p3-security-data-safety.md` |
| product-truth | t_08142adf → re-check t_909dbfe1 | PASS, **reversed to REWORK** on the single-finding re-check (it had read comments through 1) | `REV-S03-p3-product-truth.md` (+ its dated Re-check section) |
| correctness-tests | t_f2e090a2 | **REWORK** — B1 blocking | `REV-S03-p3-correctness-tests.md` |

## What pass 3 settled
- **FIX-S03-p2-F1 is correct and complete for the seam it was given.** All three lenses: the wire of `GET /v1/plan-tiers` is exactly `{free, premium}` (security S2_WIRE_KEYS; product-truth's own publisher→projection→route→contract client→DOM join, mutant-confirmed `10 failed | 7 passed (17)` with the projection reverted; correctness's seven mutants incl. the re-derived pre-fix RED `unrecognized_keys ["kind"]`). Pass-2 B1 `t_16070253` is RESOLVED on a database whose register carries the row.
- **Every command of record matches the gate exactly** at 3f488b3f (C4 79/79; pins 40/41 with only the inherited obs pair; relay+panel 49/49; C3 89/91 and §5 186/188 with only the two inherited `register-support-publication` titles). S03's own route row is present in all three lists, checked by each lens.
- The merge cross-check (0fe14637..3f488b3f over the files S03 wrote): no hunk changes what pass 2 measured; `page.tsx` delta empty.

## The blocking finding (one class, reached by all three lenses; ticket `t_8bbb55e1`, with `t_9a808054` and `t_6b9ca826`)
S03 added its `planTierRosters` row to the row set that `seedDevelopmentDeploymentRegister` replays into the SEALED historical register version 4 (`apps/runner/src/dev-deployment-register.ts:334-352`, 13 → 14 rowKeys between the lane base 9a000c37 and 3f488b3f; `:708-716` replays v4 with the current set). The file's own comment `:640-650` says the bootstrap is sealed and capped at v4 and that growth "supersedes the old set by publication"; the repo's own passing test `tests/integration/register-support-publication.test.ts:902` asserts a changed v4 is refused. So on every dev database whose v4 was sealed before S03 — V's is one — `pnpm dev:auth:up` (the command SPEC-v3 §2 steps 6, 7, 8, 9 and 10 run) fails at `DEV_AUTH_DATA_PLANE_REGISTER_FAILED`; measured live by the orchestrator: PostgreSQL `REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift` (`logs/serve-merged-diag-seed-register.log`). The data plane seeds before any publication (`dev-auth-data-plane.ts:373-383`), so the prescribed path is never reached; the row is never published there; `readPlanTierRosters` finds no row → 500 → `/new` lists zero ids (product-truth's own pass-3 case 7 measured exactly that state). Second member of the class: a custody whose `api.env` predates S03 fails stage 1 with `DEV_API_ENVIRONMENT_DRIFT` (`dev-api-environment.ts:269-273`; the S03 transition is none of the predicates at :312/:344/:399), and after a move-aside the API exits `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH` against register v9 until v10 is published. **SPEC-v3 R32 ("the post-merge start on a machine with no keys… the dev stack does not become un-startable") is unmet on a merge-day database or custody.**

Why three passes of three lenses missed it: every measurement — the seats', the gate's, the cluster commands' — runs on fresh embedded postgres, where a pre-S03 seal cannot exist; "every suite builds its prior state with the current code" (correctness). Where it entered: an ARCH-level decision — PLAN S23 put the tier lists in the register row, and ARCH-FIX's F-ARCH-4 fold (`slices/S03/DECISIONS.md:476-483`) moved the pinned v4 digest as "the documented practice", rejecting the alternative of keeping the lists out of the register; nobody asked what a database sealed before S03 does.

The remedy all three lenses agree on weakens neither guard: **never lift the v4 seal cap, never widen the api.env predicates.** Move `planTierRosters` out of the sealed historical set and let it arrive by publication (`publishDevelopmentDeploymentRegisterProviderSet`), with a regression test that builds a PRE-S03 sealed v4; add the one-time custody step (a pre-S03 `api.env`) to SPEC-v3 §2. That is a code change inside S03 after the third pass — V's call (V-47).

## Non-blocking findings, ticketed (residue for TEST(S03), each lens says which of its earlier ones still hold)
- `t_f0767487` security N11 = `t_6f44048e` correctness N10: the row's `kind` discriminant is written by the publisher and validated by nobody — the only published row kind in the repo without a reader-side literal check; hardening (row V-48).
- `t_d2f82945` correctness N9: the projection stopped refusing 2 of the 11 malformed shapes the strict parse refused (an unknown top-level member dropped; a `__proto__` literal normalised away — measured safe).
- `t_1f84c179` correctness N11: the F1 handoff's class sweep names the wrong population for the class it names (right answer, uncheckable record).
- `t_39fcc4d4` product-truth N1: display-vs-execution roster drift — `/new` reads the register row (`dev:auth:up` refreshes it) while admission reads the compiled `PLAN_TIER_ROSTERS` (only `generate:contract` refreshes it); `dev:auth:up` runs no generator, so SPEC §2 steps 6/8b/10 move the card and not the run (row V-49). Its pass-2 N2 (steps never restore the file) is carried with its class corrected to three members.
- `t_ff8a497d` security N12, a packet defect against the orchestrator: the security packet (:25) told the seat to state P4's envelope keys "from the gate log" — a seat states only what it measured (law 3.6); class fix: a packet never delegates a measurement to a log the seat did not run. No other packet defect this pass (all three lenses checked every constant).
- Carried and still holding: security N8 (grok-relay argv), N9 (read scale); correctness N1–N7; pass-1's 17 and pass-2's open N tickets (`REV-S03-p2-UNION.md`).

## Rows for V (appended to `V-DECISIONS-PACKET.md`; the default binds until V rules)
- **V-47** — fix the pre-S03 database/custody start inside S03 before merge (a FIX node + one V-authorized scoped re-check beyond the three-pass cap) — default YES.
- **V-48** — add the reader-side `kind: z.literal("PLAN_TIER_ROSTERS")` on the row before projection, wire unchanged — default YES inside the same FIX.
- **V-49** — make `pnpm dev:auth:up` run `pnpm generate:contract` before it seeds, so the card and the run cannot separate — default YES (the prose alternative: add the generator to SPEC §2 steps 6/8b/10).

## The stack for V, meanwhile
Served from the merged tree only once V runs `.hermes/reports/debate-tiers/logs/serve-merged-publish.sh` (a hand publication of register v10, which the harness refused the orchestrator) — and, as product-truth notes, that hand-published version is undone by the next `dev:auth:up`, which steps 6/7/9/10 re-run. The board: t_f14b0ca0 (TEST(S03)) stays parked on V-47.
