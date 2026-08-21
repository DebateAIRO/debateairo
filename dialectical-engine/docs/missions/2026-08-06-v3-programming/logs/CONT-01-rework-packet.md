# CONT-01 rework packet — diamond findings F-6 / F-7 / F-8

Ticket t_0b9a22a0. Both lenses GREENLIT the first pass; these findings were
non-blocking but F-7 touches the SPIRIT of V's security law, so the
orchestrator routes them as in-ticket rework before close. Same session, same
file contract as the original packet. Reproduce-first is MANDATORY: each fix
starts with a RED test demonstrating the exact reported defect against
current code.

## F-7 (security-relevant — do this first): child env still names the project

Node `spawn({cwd})` changes the POSIX cwd but does NOT rewrite inherited
`env.PWD`/`env.OLDPWD` — a live probe showed child `process.cwd()` = scratch
dir while `process.env.PWD` = `/Users/.../DebateAI-V3`. Codex keeps a shell
tool under `--sandbox read-only` (reads allowed), so a misbehaving model can
be HANDED the project path via `$PWD`.

Fix: pass an explicit `env` to the spawn in `acceptance/relay-core.ts`:
`{ ...process.env, PWD: scratchDirectory, OLDPWD: scratchDirectory }`.
Do NOT strip other variables (HOME and vendor auth stores stay — DR-179).

RED first: extend the cwd-probe (or add a sibling probe) so the fake binary
also prints `process.env.PWD` and `process.env.OLDPWD`; assert both equal the
scratch directory. This test must FAIL against current code before the fix.

## F-6: the argv guard was weakened — restore exact-order pinning

`acceptance/model-shim.test.ts` (~lines 99-106) swapped a positional check
for `expect.arrayContaining`, which is order- and adjacency-blind: a
scrambled `buildArguments` (e.g. `["--json","read-only","--sandbox",…]`)
that would break the real binary still passes. Restore an exact
`toEqual([...])` on the full argv (flags AND prompt position).

## F-8: scratch-dir litter

`mkdtemp` dirs accumulate (~200 per test run, never cleaned). After the
child process closes (in the existing close/exit handling path), best-effort
`rm(scratchDirectory, { recursive: true, force: true })` — swallow errors,
never block or fail a completion on cleanup. The "relay never READS the
scratch dir" law stands; deletion is not reading.

## Gates before REWORK READY

- The focused relay suites green (now 25+N tests).
- Root unit suite green.
- Post `REWORK READY FOR HERMES REVIEW` as a ticket comment with the RED→GREEN
  evidence per finding, then return control.

Out of scope: everything else. No new flags, no product files.
