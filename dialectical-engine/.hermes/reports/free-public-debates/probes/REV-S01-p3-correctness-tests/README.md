# Probes — REV(S01) p3 lens correctness/tests (the LAST pass, scoped to L1)

Written against slice head `86b391a0`.

| file | what it is | how to run | expectation at `86b391a0` |
|---|---|---|---|
| `rev-s01-p3-boot-roles-probe.test.ts` | the reviewer's own L1 measurement: migrates an embedded Postgres to head, provisions the development LOGIN catalog, and connects as the **real** principals (never a superuser pool). Asserts the raw privilege facts behind `ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED` (exactly 20 executable functions, and `has_function_privilege` false for `core.run_is_free_public_bound(uuid)`), then runs **every** role assertion on the API boot path — the six of `apps/api/src/main.ts:123-131` **plus** `assertSupportDatabaseRole` ×2 and `assertSupportKeyCoverage` from `startup.run("support-attestation")` at `:573-576`, which the slice's own regression test does not cover. Two further cases carry the packet's charge 2. | copy to `<root>/tests/integration/`, then `pnpm exec vitest run tests/integration/rev-s01-p3-boot-roles-probe.test.ts` | **4/0** in the ambient locale and under `LANG=LC_ALL=en_US.UTF-8` |
| `mutant.sh` | mutation harness (unchanged from pass 2): captures the target's bytes, applies one unique literal replacement, runs the shared runner, **restores FROM the capture**, and fails if `git status --porcelain` is non-empty afterwards. | `WORKTREE=<root> MUTANT_OUT=<log dir> RUNNER=<abs run-suites.sh> ./mutant.sh <LABEL> <rel file> <old literal> <new literal> <suite:p:f>…` | — |

**Red-green at `86b391a0`** — `scratch/lit/L1.old` → `scratch/lit/L1.new` turns migration `0071`'s
`REVOKE EXECUTE … FROM debateai_erasure_runtime` back into the pre-fix `GRANT … TO`, restored
byte-equal afterwards (`scratch/L1.captured`, `scratch/mutant-L1.log`):

| suite under the revert | result |
|---|---|
| `rev-s01-p3-boot-roles-probe.test.ts` (mine) | 1 passed / **3 failed** |
| `fpd-s01-l1-boot-role-assertions.test.ts` (the slice's new regression test) | **1 failed** / 0 passed |
| `dev-database-principals.test.ts` | 15 passed / **1 failed** |
| `fpd-s01-c1-privileges.test.ts` | 2 passed / **1 failed** |
| `fpd-s01-c4-delete-published.test.ts` | **17 passed / 0 failed** — the delete path never depended on the direct grant |

`scratch/` holds the two-locale gate logs, the charge-6 class-sweep log, the attribution runs
(including the run with migrations 0066–0071 held out, which attributes two sweep failures to the
base), the mutant literals and the typecheck — evidence, not probes.
