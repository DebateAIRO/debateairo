# Probes — REV(S01) p2 lens correctness/tests

Written against slice head `c358d494`. These are the pass-1 probes **re-derived**; do not run the
`REV-S01-p1-correctness-tests` copies against this head — they encode the pre-fix behaviour and the
pre-`ensureAutoPublishWork` repository interface. What changed, and why, is in each file's header.

| file | what it is | how to run | expectation at `c358d494` |
|---|---|---|---|
| `mutant.sh` | mutation harness; captures the target file's bytes, applies one unique literal replacement, runs the shared runner, **restores FROM the capture**, and fails if `git status --porcelain` is non-empty afterwards. | `WORKTREE=<root> MUTANT_OUT=<log dir> RUNNER=<abs run-suites.sh> ./mutant.sh <LABEL> <rel file> <old literal> <new literal> <suite:p:f>…` | — |
| `rev-s01-p2-correctness-probe.test.ts` | integration fixture: a stale work row beside `PUBLISHED`, NULL tier, pre-rule Free run, reconciler at 0 / above the batch cap / under the new backoff, delete racing a live system-publication intent, BLOCKED work clearing. Reads visibility through the **product's** `PostgresPublicationRepository`, not a transcribed copy of its SQL. | copy to `<root>/tests/integration/`, then `pnpm exec vitest run tests/integration/rev-s01-p2-correctness-probe.test.ts` | **6/0** in the ambient locale and under `LANG=LC_ALL=en_US.UTF-8` |
| `rev-s01-p2-snapshot-probe.test.ts` | unit fixture over the real `PostgresPublicationApplication`: R-6's snapshot-content check, R-9/R-10 fail-then-succeed, R-8's BLOCKED short-circuit after the bound check. | copy to `<root>/tests/unit/`, then `pnpm exec vitest run tests/unit/rev-s01-p2-snapshot-probe.test.ts` | **3/0** in both locales |

Red-green at `c358d494`, each mutant restored from its capture:

| mutant | literal | probe case that turns RED |
|---|---|---|
| `G2` | `packages/db/src/publication.ts` — the `latest.state IS DISTINCT FROM 'PUBLISHED'` projection guard removed | "a stale work row never projects publish_pending beside PUBLISHED" → `expected { state: 'PUBLISHED', pending: true } to strictly equal { state: 'PUBLISHED', pending: false }` |
| `G5` | `migrations/0069…sql` — the contended erasure reverted to its early return | "delete … CONTENDED and QUEUES the erasure" → `expected 'PUBLISHED' to be 'PRIVATE'` |
| `T10` | `apps/api/src/publications.ts` — the system snapshot built from `input.ownerRef` | "encrypts the account pseudonym and no owner-naming value" |

`scratch/` holds the two-locale slice-list logs, the mutant literals (`scratch/lit/`), the per-mutant
summaries (`scratch/M/`) and the batch driver — evidence, not probes.
