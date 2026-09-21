# Promoted probes — REV(S01) pass 1, lens product-truth

Written against slice head `db4758da` (base `5b6cc9b1`), from `SPEC-v2.md` §4 and V's intake words, not from the
author's tests. **None of these is wrapped** — each runs bare, with no mutant runner and no restore step; they
mutate nothing, start no process and bind no port.

To run, copy each file into the same-named directory of ANY worktree at or after `db4758da` and run it from that
worktree's root. Nothing below hard-codes a repository root.

| file | copy to | run |
|---|---|---|
| `rev-s01-p1-product-truth.test.ts` | `<worktree>/tests/unit/` | `pnpm exec vitest run tests/unit/rev-s01-p1-product-truth.test.ts` |
| `rev-s01-p1-product-truth-ui.test.tsx` | `<worktree>/tests/render/` | `pnpm exec vitest run tests/render/rev-s01-p1-product-truth-ui.test.tsx` |
| `rev-s01-p1-product-truth-db.test.ts` | `<worktree>/tests/integration/` | `LC_ALL=en_US.UTF-8 pnpm exec vitest run tests/integration/rev-s01-p1-product-truth-db.test.ts` |

Preconditions: `pnpm install` and `pnpm run generate:contract` in that worktree (PLAN §6 SV-0). The integration
probe starts the repo's own throwaway embedded Postgres via `tests/support/testDatabase.ts` and stops it in
`afterAll`; it reads `core.run_is_free_public_bound` under `SET ROLE debateai_runtime`, never as a superuser
(TOOLING-TRAPS, "Embedded postgres with a superuser pool is privilege-blind").

Measured at `db4758da`, three runs each, worst counts: unit **16/16**, render **3/3**, integration **4/4**.

What each one pins (verdict `docs/missions/free-public-debates/reviews/REV-S01-p1-product-truth.md`):

- `PT-3` is finding **B2** — `GET /v1/answers/{id}` serves the owner the full Answer with no auto-publish attempt.
- `PT-4` / `PT-5` are finding **B3** — a throw inside `tryAutoPublish` writes no outstanding record; `PT-6` is the
  control that shows a `return null` does write one.
- `UI-2` is finding **B1** — the real `PublicationControl`, mounted with visibility `PUBLISHED`, renders no delete
  control; `UI-1` is the control that shows it renders one while `PRIVATE`.
- `PTDB-4` is finding **N1** — a failed auto-publish is re-armed for immediate re-claim, with no backoff.
- `PT-1`, `PT-2`, `PT-7`…`PT-14`, `PTDB-1`…`PTDB-3` are the executed half of the `SPEC-v2` §4 acceptance walk.

`scratch/` holds the raw run logs (`unit-run{1,2,3}.log`, `int-run{1,2,3}.log`, `int-c2-utf8*.log`,
`db-run{1,2,3}.log`, `typecheck-head.log`). They are evidence text, not probes.
