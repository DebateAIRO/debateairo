# REV-S01-p3-security-data-safety — promoted probe

Written against slice head **`86b391a0`**. Scoped to the live finding **L1** (the API exited at
boot with `ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED`) and its fix, `migrations/0071`.

## One command

```bash
WORKTREE=<repo root> ./run.sh          # or: ./run.sh <repo root>
```

No repository file is mutated. `run.sh` copies the probe into `<root>/tests/integration/`, runs
it as a single quoted vitest target, and removes the copy on exit via a `trap`. It starts no
stack, binds no fixed port and touches no container: everything runs against the probe's own
ephemeral embedded Postgres. Logs land in `logs/`, or in `$PROBE_LOG_DIR`.

## Expected frame at `86b391a0` — 4/0, and all four PASS means the code is HEALTHY

| case | what it decides |
|---|---|
| **F1** | every assertion `apps/api/src/main.ts` runs in its start-up `Promise.all` (`:122-131`), each executed as its **real login principal** provisioned by the product's own `provisionDevelopmentDatabasePrincipals` — plus `assertSupportDatabaseRole` (`main.ts:574`), the start-up gate that is *not* in the `Promise.all` |
| **F2** | both exact-count attestations enumerated, not just counted: erasure = 20 over `identity`+`core`+`serve` (`account-erasure.ts:222-226`), content-provision = 6 over `core` (`index.ts:211-214`), and the count of functions in those schemas executable by **PUBLIC**, which must be 0 |
| **F3** | the runtime role still evaluates `core.run_is_free_public_bound`; the erasure principal gets `42501` directly but still reaches the predicate inside `core.prepare_private_run_erasure`, which must answer `NOT_FOUND` and never `42501` |
| **F4** | the mutant: re-grant the revoked EXECUTE and watch the boot assertion go RED |

## Mutation

**F4 only**, and only inside the probe's own ephemeral database. It captures
`pg_proc.proacl` for `core.run_is_free_public_bound` **at the head under test**, re-grants
EXECUTE to `debateai_erasure_runtime`, asserts `assertAccountErasureDatabaseRole` throws
`ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED` with the count at **21**, then revokes and asserts the
`proacl` is **byte-equal to the captured value** and the assertion is `OK` again. It restores
from the capture, never to a literal.

## Reading a RED

- **F2 counts** are the head's contract, not a constant of nature. If a later migration
  legitimately changes `ERASURE_FUNCTION_SIGNATURES` or `CONTENT_PROVISION_SIGNATURES`, the
  expected numbers move with the TypeScript arrays — re-derive from
  `packages/db/src/account-erasure.ts:13` and `packages/db/src/index.ts:129` before calling a
  RED a regression.
- **F2's PUBLIC set must stay empty.** A non-empty set means some migration created a function
  in `identity`/`core`/`serve` without `REVOKE ALL … FROM PUBLIC`, which inflates *both* exact
  counts without naming any role in a GRANT — the silent member of this class.
- **F3's `NOT_FOUND`** is the assertion that matters. A `42501` there means the erasure
  principal lost a privilege it still needs and bound deletion is broken for everyone.

## Fixture notes

`core.run_is_free_public_bound` returns **NULL**, not `false`, for a run id that does not exist
(the predicate selects from `core.run` and a missing row yields no row). Seed a real bound run
before asserting `true`.
