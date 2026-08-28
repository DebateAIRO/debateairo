# S05 REWORK 2 — CODE REVIEW, SHARED BRIEF (read this, then your lens)

You are ONE OF THREE BLIND PARALLEL LENSES. You do not know what the other two examine and must not look for their work. All three return simultaneously. **Do not read any Kanban comment on `t_6e99d607` posted after `2026-08-26 22:55`.**

**YOU ARE READ-ONLY.** No edit, create, delete, stage, commit, push, merge, or any git write. No Kanban writes. Tests, typecheck and probes are expected. Probe scripts go to a scratch dir **outside** the repo. **Scope every search** — do not run repo-wide recursive greps over `apps/` or `packages/`; a prior lens inadvertently read excluded-zone files that way and had to report itself.

## What you are reviewing
**S05 rework round 2 of 3 — one round remains after this.** Worktree:
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-2/dialectical-engine`
Branch `obs-lane-2-capture`, base `7afdbe5`. **Changes are UNCOMMITTED.**
`cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-2 && git status --porcelain && git diff HEAD`
Expected set and nothing else: `packages/obs-capture/install/{api,runner,scheduler}.ts`, `tests/architecture/obs-l2-s05-{boot-capture,import-graph}.test.ts` (996 insertions, 108 deletions).

## Authoritative sources
- `docs/missions/2026-08-21-observability-loop/planning/L2-ADDENDUM-PLAN.md` **§2** (contract), **§3.5 / §3.6 / §3.8** (the Tier-0 seam obligations assigned to S05), **§6.1** (typecheck). Overrides any summary.
- The packet the seat was given: `docs/missions/2026-08-21-observability-loop/goal-packets/s05-rework-2.md`
- Ticket: `hermes kanban --board observability-loop show t_6e99d607` — `--board observability-loop` **before** the verb; never `boards switch`.

## Round 1 was reviewed by a three-lens diamond. What it certified, and what it blocked.
**CERTIFIED in round 1 — these properties must still hold, and your job includes confirming the new code did not break them:**
- Paired-control equality: with and without the installer as first import, across 3 runtimes × static/dynamic fixtures, **exit codes equal and stderr BYTE-IDENTICAL**.
- The record is written on the **static** path production takes.
- **A clean shutdown writes NOTHING.** Round 1 achieved this by using only `uncaughtExceptionMonitor`. **Round 2 adds a `process.on("exit")` handler — the single most likely way to break this property.**
- The three installers are byte-identical apart from the `RUNTIME` literal.
- **The handler is ZERO-ARITY** — `() => writeFatalBoundaryRecord()` — which makes the caught error *structurally* unreachable from the serializer. A lens proved no planted secret reaches disk. **This property must survive round 2.**
- G5-4: the written record, minus `occurred_at` and `source_event_ref`, is **deeply equal** to the real `createSharedRedactor` output.

**BLOCKED in round 1 — what round 2 was ordered to fix:**
- **D1 (CHARGED):** the deferred arm was `setTimeout(…, 25)` while the contract says **within one macrotask**, and the test waited 50 ms of wall clock while throwing under the identifier `RUNTIME_NOT_LOADED_WITHIN_ONE_MACROTASK` — naming one property, measuring another. A lens proved it blind with a 40 ms arm. Required: delay `0`, keep `.unref()`, and **re-key the test to measure the property it names** so it FAILS against a 25 ms arm.
- **D2 + A2–A7 (UNCHARGED amendments):** expose the Tier-0 seam §3.5 assigns to S05 — spool filename `${RUNTIME}-${pid}-${bootId}.spool`, register `exit` as well as the monitor, a **mutable slot** Tier 1 can swap, the arm calling `.then(m => m.startCaptureRuntime({ runtime, spoolFd, installExitSink }))`; plus short-write safety (loop until complete, guard, cap), `O_NOFOLLOW` on the open, a decision on create-only file mode, and clearing `OBS_SPOOL_DIR` in two test env spreads.

## Standing law
- **Excluded zone** — never modified, never imported, and **NO filesystem metadata of any kind**: `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`.
- **No user-linked identifiers and no free text** in anything durable. Ids are **declared kinds, never shape-inferred**.
- **Typecheck (§6.1):** pin is base `7afdbe5` — count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. **`TYPECHECK-BASELINE.md`'s count-0 pin at `80362d0` is VOID.** T-5 fail-closed: `pnpm generate:contract` first, **and** a positive assertion of zero module-resolution escape from the worktree root — escape is silent, and a matching count is not evidence of containment.
- No push, no merge, no self-Done, no ticket split, no worktree/branch operation, no database action.

## Method
Reproduce before concluding — the handoff is the artifact under review, not evidence. Label **CONFIRMED** (executed) vs **PLAUSIBLE** (reasoned). "No defects in this lens" is a legitimate verdict; do not manufacture findings and do not soften a real one. A false evidence claim is itself a blocker here, treated as more serious than a code defect. **Report any undisclosed tuning constant you find** — an undisclosed `25` is half of why round 2 was charged.

## Return format
- **VERDICT:** PASS or BLOCK
- **BLOCKERS:** numbered; `file:line`, concrete failing scenario, CONFIRMED/PLAUSIBLE
- **NON-BLOCKING OBSERVATIONS**
- **WHAT I RAN:** exact commands, exact results
- **WHAT I COULD NOT CHECK, and why**
