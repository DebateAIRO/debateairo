# Probes — REV(S01) p1 lens correctness/tests

Written against slice head `db4758da` (base `5b6cc9b1`). Every probe takes its checkout root from
`$WORKTREE` or from the path you copy it into — nothing here hard-codes a worktree.

| file | what it is | how to run |
|---|---|---|
| `mutant.sh` | mutation harness. Captures the target file's bytes, applies one literal replacement (refuses if the literal is not unique), runs the shared runner, **restores FROM the capture**, and fails loudly if `git status --porcelain` is non-empty afterwards. | `WORKTREE=<root> MUTANT_OUT=<log dir> RUNNER=<abs run-suites.sh> ./mutant.sh <LABEL> <rel file> <old literal file> <new literal file> <suite:p:f>…` |
| `rev-s01-p1-correctness-probe.test.ts` | integration fixture: two prepares racing one serve, NULL tier, pre-rule Free run, reconciler at 0 and above the batch cap, delete racing an in-flight/orphaned system publication intent, BLOCKED work clearing. Uses the repo's `startTestDatabase()` (UTF-8 pinned) and the product roles via `SET ROLE`. | copy to `<root>/tests/integration/`, then `pnpm exec vitest run tests/integration/rev-s01-p1-correctness-probe.test.ts` |
| `rev-s01-p1-snapshot-probe.test.ts` | unit fixture over the real `PostgresPublicationApplication`: R-6's snapshot-content check (the assertion SPEC-v2 names and no suite makes), R-9/R-10 fail-then-succeed, R-8 BLOCKED short-circuit. | copy to `<root>/tests/unit/`, then `pnpm exec vitest run tests/unit/rev-s01-p1-snapshot-probe.test.ts` |

At `db4758da` the integration fixture is **5 passed / 1 failed** — the failing case is finding B2
(`PUBLISHED` together with `publish_pending`). The unit fixture is **3 passed / 0 failed** at head and
goes RED under mutant `T10` (`lit/T10.*`), which is finding B1.

`scratch/` holds the run logs, the mutant literals (`scratch/lit/`), the per-mutant summaries
(`scratch/A/`, `scratch/B/`) and the batch drivers — evidence, not probes.
