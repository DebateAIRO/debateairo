# Dev-stack recipe for the REV(S02) lenses — S02 is a `ui: no` slice: no browser, no dev server, no live database

## What you need
- Your OWN detached worktree at the slice head (the packet names it: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-p1-<lens>/dialectical-engine`, READ-ONLY for git), with `node_modules` present and `pnpm run generate:contract` run once (rc 0; the generated directory is gitignored) — TOOLING-TRAPS "A lens worktree needs `pnpm run generate:contract`, not just `pnpm install`".
- The cluster commands are plain `pnpm exec vitest run <files>` from the worktree root; the HTTP face is exercised in-process through `buildApi(...).inject(...)` (`tests/unit/api.test.ts:31-40`), never over a socket.
- `tests/integration/evaluator-database.test.ts` and `tests/integration/tiers-s02-run-plan-tier.test.ts` run on an EMBEDDED Postgres that `tests/support/testDatabase.ts` starts per run in a fresh `mkdtemp` directory on a port it reserves from the OS (`reservePort()`, `testDatabase.ts:41-52`; the embedded instance at `:85-87`). Two lenses running at once do not collide, and nothing you run touches the dev database.

## What you never touch (the listener baseline is recorded in README.md at assembly time)
- `:3000` (V's https front door), `:3001` (its UI upstream), `:8790` (V's API), `:8791`–`:8793` (the CLI provider relays), `127.0.0.1:55432` (the live dev database, Docker) — never started, stopped, probed with writes, or reconfigured by a lens. If a probe of yours needs a port, take one from the OS (as `reservePort()` does) and name it in your verdict.
- `.local/**` (provider config with authorization headers — never read, never printed), the main tree, the S02 lane itself (`.worktrees/tiers-s02`), the other lenses' worktrees and outputs.

## Process hygiene
- Every process you start writes its PID to `<your scratch>/<seat>.<proc>.pid` at launch (`$!`), and you kill by that PID (or by the port you took) — never `pkill -f` a filename another seat may share (TOOLING-TRAPS "Kill by port or PID").
- A temporary mutant lives only in YOUR worktree and is restored before your handoff; `git status --porcelain` printed after every restore. No git write of any kind (no commit, stash, checkout of another ref, branch).
