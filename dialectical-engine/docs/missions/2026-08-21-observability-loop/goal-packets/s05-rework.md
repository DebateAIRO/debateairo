# GOAL PACKET — S05 REWORK (L2 ADDENDUM) — ticket t_6e99d607

**DEFECT RETURN. `rework_round: 1 of 3`. CHARGED.**

## 0. Read these first, in this order
1. **`docs/missions/2026-08-21-observability-loop/planning/L2-ADDENDUM-PLAN.md` §2 (your contract) and §6.1 (typecheck).** That artifact is authoritative and **overrides every summary in this packet**.
2. Your ticket, and in particular the routing comment answering your CODEX BLOCKED:
   `hermes kanban --board observability-loop show t_6e99d607`
   Always put `--board observability-loop` **before** the verb. Never run `boards switch`.

## 1. Your blocker was correct, and it is resolved
You refused to skip a predecessor on a packet's say-so. That was right — the board is the source of truth for loop state and a launch packet cannot silently supersede an adopted plan. **The Router had posted the supersession on the wrong ticket.** It is now on yours, durably. Nothing is charged for that blocked run.

**§6's order is amended to `S03a -> S05 -> S02 -> S05b`.** No S02 addendum commit is expected before you; `git rev-list --count 7afdbe5..HEAD = 0` is the correct state. Both of the plan's stated ordering reasons are preserved — S02 still precedes S05b, S05 still precedes S05b — and neither concerned S02 vs S05. S05 has no factual dependency on S02: your fatal-boundary record carries `OBS_CAPTURE_SELF`, an AUTHORED code untouched by the `declared_gap` re-pin. The operative cause is that step 2 is gated on **RP-0**, a custodian act reserved to V that no seat may perform.

**§6's "nothing is dispatched before its predecessor is reviewed" still binds and is satisfied:** your S03a addendum `7afdbe5` PASSED an independent Claude Opus review with **zero blockers**.

## 2. Why this is charged
The defective assertion is `expect(result.status, ...).toBe(0)` at `tests/architecture/obs-l2-s05-boot-capture.test.ts:97` — a file S05 authored and owns. Mission law (V-4): a criterion defect is **uncharged** in a plan artifact outside the worker's `allowed:` set, **charged** inside the worker's own `tests:` glob. Mitigating facts stand on the record and are not erased: your GREEN text never named exit-code preservation, three Grok lenses passed it, and the installer was unreachable until S06's first-import made it live.

## 3. The defect, measured by two independent architecture seats
`process.on("unhandledRejection")` in `install/runner.ts` **supersedes Node's crash-on-rejection**. Without the installer a boot failure prints a stack and exits 1; with it the **process survives, exits 0, prints nothing**. Meanwhile the `uncaughtExceptionMonitor` path preserves exit 1 but **records nothing**, because the capture is an async lazy `import()` that provably never gets a turn before process death — not even a bare microtask runs.

So today: one path crashes correctly and records nothing; the other records into a queue that drops everything and destroys the crash.

**The fix is smaller than it sounds, and it is already mandated.** `uncaughtExceptionMonitor` **already receives** unhandled rejections, with `origin === "unhandledRejection"`, and cannot suppress anything. So: **delete the `unhandledRejection` registration, and make the capture synchronous.** `FinalPlan.md:96`, `Plan.md:83` and `VerticalSlices.md:128` already require `fs.writeSync` on a **pre-opened fd** as the only sink reachable from `process.on('exit')`, and `packages/obs-capture/src/spool.ts` already ships `prepare()` + `appendOnExit()` with **zero production callers**. You are wiring a requirement that was written and never wired.

## 4. The GREEN clause that is STRUCK — in full, not replaced by a weaker form
> the `@debateai/db`-throws-at-import fixture showing handlers installed and **the boot throw captured to the spool**, *as evidenced by a surviving process*.

Struck because it is satisfiable only by a process that survived a boot failure, and **a process that survives a boot failure is the defect**.

**A SURVIVING PROCESS IS NEVER AGAIN ACCEPTABLE EVIDENCE OF CAPTURE ON ANY BOUNDARY PATH IN THIS MISSION.**

Note also: your current fixture uses a **dynamic** import while the real `main.ts` uses a **static** one — it exercises a path production never takes. Fix that too.

## 5. RED — mandatory, first, three frames, all behavioural, none reading source text
- **RED-1 · semantics destroyed.** Spawn runner-shaped ESM whose **static** import graph throws at evaluation, with and without the installer; then repeat with a **dynamic** import. Required signature: dynamic **without** installer → status 1, stderr non-empty; dynamic **with** installer → **status 0, stderr empty, process survived**.
- **RED-2 · nothing recorded where it matters.** With the installer present and the pre-opened fd on **fd 3**, the **static** probe terminates status 1 and **fd 3 receives zero bytes**.
- **RED-3 · the criterion itself.** Quote `obs-l2-s05-boot-capture.test.ts:97` verbatim and state that this is the assertion being deleted.

## 6. GREEN — five conjuncts (§2.3)
- **G5-1** For each of `api`, `runner`, `scheduler`: `listenerCount("unhandledRejection") === 0` **and** `listenerCount("uncaughtExceptionMonitor") >= 1`. Assert no production file in `packages/obs-capture/**` registers `unhandledRejection` **with a tree scan over the shipped package, not over the diff**.
- **G5-2** Failure semantics **byte-identical to the uninstrumented control** — same status and same stderr byte length, with and without the installer, for **both** the static and dynamic fixtures, in all three runtimes. **The equality between arms is the criterion, never the absolute byte count.**
- **G5-3** The static probe writes **exactly one** line to its spool file; it parses as JSON; `code`/`taxonomy_class`/`capture_point`/`disposition`/`fallback_minimized` are `OBS_CAPTURE_SELF`/`CAPTURE_SELF`/`self`/`SELF`/`true`; it contains **no** substring of the fixture's error message and **no** stack frame (assert on the message token and on `"    at "`).
- **G5-4** That JSON object, after deleting `occurred_at` and `source_event_ref`, is **deeply equal** to what the real `createSharedRedactor` produces for the same config. This pins your builtins-only serializer to the one real redactor and makes the duplication auditable instead of silent.
- **G5-5** IC-1 survives, three parts: module-evaluation-reachable imports are Node builtins only; a process that imports the installer and **exits promptly never loads** the runtime module; one that **stays alive does** load it within one macrotask.

## 7. Non-negotiable implementation constraints (§2.4 — contract, not suggestion)
- The three process installers stay **byte-identical apart from the `RUNTIME` literal**; assert it with a normalised-source comparison in your own glob.
- **No** `unhandledRejection` registration. **No** `process.exit()`. **No** `process.exitCode` assignment. **No** re-throw from inside a handler — re-throwing rewrites the stack and changes stderr, and G5-2 forbids it.
- The fd is opened **once, at module evaluation, inside a try/catch**, and only when `OBS_SPOOL_DIR` is set. Failure to open **degrades silently** to "no exit sink" and must not throw, log, or delay boot.
- The record is written with `fs.writeSync` on that fd and nothing else. **No `openSync` inside a handler** — the disk-full case is exactly when it fails.
- **No free text and no user-linked identifier ever reaches the fd.** Assemble from constants, `process.env` config, an ISO timestamp and a random UUID. **The caught error object is never serialised — only the fact of it.** All five ref fields are the literal `UNKNOWN:DECLARED_KIND_REQUIRED`; no id is ever inferred from a string's shape.

## 8. Contract deltas
- **`allowed`** unchanged: `packages/obs-capture/install/*.ts`. It gains **no new file** in this rework.
- **`tests:`** unchanged globs; both files **rewritten in place**; no new glob, no new suite.
- **`readonly`** gains `packages/obs-capture/src/runtime/**` (new slice S05b) — you may **read** the arming contract you must satisfy, and must not author it.
- **`forbidden`** gains that same path, and `packages/obs-capture/package.json` (S03a's).

## 9. Typecheck (§6.1) — measure at your lane base, now `7afdbe5`
Pin: **count 9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`.
**`TYPECHECK-BASELINE.md`'s pin of count 0 at `80362d0` is VOID — measured in a dirty checkout. Do not cite it.**
**T-5 is FAIL-CLOSED:** run `pnpm generate:contract` before measuring and say you did; then **positively assert zero module-resolution escape from the worktree root**. Escape is silent and a matching diagnostic count is **not** evidence of containment. If you cannot perform either check, fail closed and post a blocker rather than report a number you cannot defend.

## 10. Where you stop
No push, no merge, no Done, no ticket-split, no worktree or branch operation, no database action. End at **READY FOR PEER REVIEW** on `t_6e99d607` with all three RED frames and all five GREEN conjuncts pasted. Then stop.
