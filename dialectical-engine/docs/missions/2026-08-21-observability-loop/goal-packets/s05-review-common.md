# S05 REWORK — CODE REVIEW, SHARED BRIEF (read this, then your lens)

You are ONE OF THREE BLIND PARALLEL LENSES reviewing the S05 rework. You do not know what the other two examine and must not look for their work. All three return simultaneously; no lens sees another's findings. **Do not read any Kanban comment on `t_6e99d607` posted after `2026-08-26 22:01`.**

**YOU ARE READ-ONLY.** No edit, create, delete, stage, commit, push, merge, or any git write. No Kanban writes. Running tests, typecheck and probes is expected. Probe scripts go to a scratch dir **outside** the repo. Return findings to your caller; post nothing.

## What you are reviewing
The S05 rework — a **charged defect return, rework 1 of 3** — in worktree:
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-2/dialectical-engine`
Branch `obs-lane-2-capture`, base commit `7afdbe5`. **The changes are UNCOMMITTED.** See them with:
`cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-2 && git status --porcelain && git diff HEAD`
Expected change set, and nothing else: `packages/obs-capture/install/{api,runner,scheduler}.ts` and `tests/architecture/obs-l2-s05-{boot-capture,import-graph}.test.ts`.

## Authoritative sources — read both
- **Contract:** `docs/missions/2026-08-21-observability-loop/planning/L2-ADDENDUM-PLAN.md` §2 (contract, struck clause, RED, GREEN, non-negotiables) and §6.1 (typecheck). This **overrides** any summary.
- **The packet the seat was given:** `docs/missions/2026-08-21-observability-loop/goal-packets/s05-rework.md`
- The ticket: `hermes kanban --board observability-loop show t_6e99d607` — always put `--board observability-loop` **before** the verb; never run `boards switch`.

## The defect being fixed
`process.on("unhandledRejection")` in the installers **supersedes Node's crash-on-rejection**: without the installer a boot failure prints a stack and exits 1; with it the **process survives, exits 0, prints nothing**. Separately, the `uncaughtExceptionMonitor` path preserved exit 1 but **recorded nothing**, because the capture was an async lazy `import()` that never gets a turn before process death. The mandated repair: **delete the `unhandledRejection` registration** (`uncaughtExceptionMonitor` already receives rejections with `origin === "unhandledRejection"` and cannot suppress anything) and make the capture **synchronous** — `fs.writeSync` on a pre-opened fd from `process.on('exit')`, per RT-02, which `spool.ts` already shipped with zero callers.

**The struck GREEN clause, which must not reappear in any weakened form:** the old criterion accepted *a surviving process* as evidence of capture. **A SURVIVING PROCESS IS NEVER AGAIN ACCEPTABLE EVIDENCE OF CAPTURE ON ANY BOUNDARY PATH IN THIS MISSION.** The old test asserted `expect(result.status).toBe(0)` at `obs-l2-s05-boot-capture.test.ts:97` and its fixture used a **dynamic** import while real `main.ts` uses a **static** one — it exercised a path production never takes.

## Standing law that binds every lens
- **Excluded zone** — never modified, never imported, and **NO filesystem metadata of any kind** (no content read, import, directory listing, hash, size, mtime, mode, no SQL against the identity schema): `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`.
- **No user-linked identifiers and no free text** in anything durable. Ids are **declared kinds, never inferred from a string's shape**. A prior review here found a pattern named "safe" that admitted a string containing a password and a card number — assume nothing from a name.
- **Typecheck (§6.1):** pin is the lane base — count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. **`TYPECHECK-BASELINE.md`'s pin of count 0 at `80362d0` is VOID** — measured in a dirty checkout. Do not use it. **T-5 is fail-closed:** `pnpm generate:contract` before measuring, **and** a positive assertion that zero module resolutions escaped the worktree root. Escape is silent; a matching diagnostic count is **not** evidence of containment.
- No push, no merge, no self-Done, no ticket split, no worktree/branch operation, no database action.

## Method
Reproduce before you conclude — the seat's handoff is the artifact under review, not evidence. Label **CONFIRMED** (you executed it) vs **PLAUSIBLE** (you reasoned it). "No defects in this lens" is a legitimate and valuable verdict; do not manufacture findings, and do not soften a real one. In this mission a false evidence claim is itself a blocker, treated as more serious than a code defect.

## Return format
- **VERDICT:** PASS or BLOCK
- **BLOCKERS:** numbered; each with `file:line`, the concrete failing scenario, and CONFIRMED/PLAUSIBLE
- **NON-BLOCKING OBSERVATIONS**
- **WHAT I RAN:** exact commands, exact results
- **WHAT I COULD NOT CHECK, and why**
