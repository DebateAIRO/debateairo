# REV(S01) pass 3 (scoped to L1 — the LAST pass) — UNION (2026-09-21) · slice head `86b391a0` · base `5b6cc9b1`

- **verdict: PASS** (pass 3 of 3). Both dispatched lenses passed: security/data-safety = **PASS** · correctness/tests = **PASS**. product-truth was not re-dispatched (orchestrator ruling, LEDGER): its question for this pass — does the tree work served — was answered by the live launch on :3000 (`DEV_AUTH_STACK_READY`, API up, 73 migrations, the erasure role isolated).
- lens verdicts (each is the record): `reviews/REV-S01-p3-security-data-safety.md` · `reviews/REV-S01-p3-correctness-tests.md`. The orchestrator holds no verdict authority.

## L1 — the live finding (the API refused to boot: `ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED`)

Both lenses: **ADDRESSED**, each by its own probe under REAL login principals: the erasure role executes exactly 20 functions, `core.run_is_free_public_bound(uuid)` is not among them, every boot-path role assertion resolves (the six of `main.ts:122-131` and the three at `:573-576`), the re-grant mutant throws at count 21 and four detectors go RED, while delete-while-public stays 17/17 either way. Exactly one grant to the erasure role exists in 0066–0070 (`0066:21`) and `0071:4` revokes it. 21-suite gate twice per lens: CLUSTER_GREEN in both locales, 0 skipped; tsc 70 = base.

## New at pass 3 — non-blocking, ticketed; residue shown to V

| id | file:line | outcome |
|---|---|---|
| S-N10 = C N1-p3 | `tests/integration/fpd-s01-l1-boot-role-assertions.test.ts` (title at :46) vs `apps/api/src/main.ts:573-576` | the regression test covers the boot `Promise.all` but not the three role assertions that run before `listen` (support); the same defect one role over would leave it green |
| C N2-p3 | `tests/integration/s7-authorization-database.test.ts` 11/12 · `tests/integration/session-database.test.ts` 10/11 | two suites RED at BASE (identical with 0066–0071 held out) that have no baseline frame in the intake |
| (class, both lenses' self-reports) | — | why two passes missed L1: suites were selected by FILE while the defect was a GLOBAL privilege fact; no mutant ever touched a GRANT/REVOKE line; the boot was never measured. Orchestrator defect t_1d80200f |

## Next node

TEST(S01) — V's, on the stack served at https://localhost:3000 from integration/all (one commit). A Free debate needs a Free-tier model: both roster entries lack a key on this stack (V's to supply or re-roster).
