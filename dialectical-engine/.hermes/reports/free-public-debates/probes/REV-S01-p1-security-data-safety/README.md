# REV-S01-p1-security-data-safety — promoted probes

Written against slice head **`db4758da`**. Added at pass 2 by the same seat: the pass-1
promotion shipped `run.sh` without this file, which BLOCKED FIX-S01-p1-B for one launch
(its self-report; orchestrator ruling: `run.sh:1-12` is the entry document; ticket
`t_ff155aeb`). The ruling stands — this file restates it so no seat has to re-derive it.

## One command

```bash
WORKTREE=<repo root> ./run.sh          # or: ./run.sh <repo root>
```

`run.sh` **does not mutate the repository**. It copies the four seat-named probe files into
`<root>/tests/{integration,unit}/`, runs each one through `pnpm exec vitest run` (one quoted
target per invocation — the zsh `$FILES`-is-one-token trap), and removes the copies on exit
via a `trap`, so the target worktree ends as it started. It forces `LANG=LC_ALL=en_US.UTF-8`
because `tests/integration/fpd-s01-c2-system-publication.test.ts` was locale-fragile at this
head (finding S-N5). Logs land in `logs/`, or in `$PROBE_LOG_DIR`.

## Mutation

Only `rev-s01-p1-sec-exposure.test.ts` case **B5** mutates anything, and only inside its own
ephemeral embedded-Postgres database — never a file, never a committed migration. It captures
`pg_get_functiondef('core.transition_system_run_publication')` **at the head under test**,
replaces the body three times, restores **from the captured text** (never from a literal), and
asserts the restored definition is byte-identical before the case ends.

## Expected frames at `db4758da` (all four PASS mean the code is HEALTHY, not that a defect exists)

| file | pair | what it decides |
|---|---|---|
| `rev-s01-p1-sec-privileges.test.ts` | 5/0 | EXECUTE grid + `search_path` pinning for every function 0066–0068 create or replace; table grid for the two event tables |
| `rev-s01-p1-sec-forge.test.ts` | 10/0 | forging the f1/f2 admissions under `SET ROLE`; A5/A6 are **characterisations, not assertions** at this head — A6 printed `NO_ERROR` because the f2 admission accepted a cross-run row (that is S-N3, the defect) |
| `rev-s01-p1-sec-exposure.test.ts` | 5/0 | snapshot identity scan (R-6/R-7), R-20 audit row, R-22 pre-slice snapshot, R-8, and the three guard mutants |
| `rev-s01-p1-sec-oracle.test.ts` | 4/0 | R-13 / R-14 / R-18 refusal byte-identity through `buildApi` |

## Reading a RED after a fix

A5 and A6 encode the **pre-fix** admissions. Once S-N1/S-N2/S-N3 are fixed the correct
outcomes invert (`55000 PUBLICATION_V2_REF_BINDING_REQUIRED` instead of `NO_ERROR`), so a
change there is the fix working, not a regression. The pass-2 re-derivation of exactly those
cases, with the inverted assertions, is
`../REV-S01-p2-security-data-safety/rev-s01-p2-sec-refix.test.ts` (D3b, D4, D5).
