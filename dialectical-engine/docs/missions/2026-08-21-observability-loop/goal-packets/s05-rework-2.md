# GOAL PACKET — S05 REWORK 2 — ticket `t_6e99d607`

**`rework_round: 2 of 3`. ONE item is a CHARGED defect; the rest are UNCHARGED contract amendments. One packet, one pass.**

## 0. Read first
1. `docs/missions/2026-08-21-observability-loop/planning/L2-ADDENDUM-PLAN.md` — **§2** (your contract) and **§3.5, §3.6, §3.8** (the Tier-0 obligations §3.5 assigns to *you*), and **§6.1** (typecheck). Authoritative; overrides this packet.
2. Your ticket: `hermes kanban --board observability-loop show t_6e99d607` — `--board observability-loop` **before** the verb; never `boards switch`.

## 1. What was certified, and is NOT reopened
Three blind Claude Opus lenses reviewed your rework. **The crash-semantics repair is correct and is certified by execution**, independently by two lenses:
- 12 paired arms (3 runtimes × static/dynamic × spool set/unset): exit codes equal and **stderr byte-identical**, not merely equal-length.
- The record is written on the **static** path production takes; a clean shutdown writes nothing.
- The three installers normalise to one hash apart from the `RUNTIME` literal.
- G5-4's serializer pin holds — deep equality with the real redactor, 31 keys, all three runtimes.
- G5-1, G5-2, G5-3 and G5-5 parts 1–2 all reproduce independently.
- TBP exact: count 9, sha256 `98c8eb42…a422c2`, zero in touched paths, **T-5 zero escapes**.
- File contract clean, readonly files byte-verified, guard-rails clean.
- One lens planted a password, a `password=` DSN, a card number, an email, an API key and a session id across the error's message, cause **and stack-frame text**, then read the **raw bytes** off disk in all three runtimes: **nothing leaked.** The zero-arity handler makes the error structurally unreachable from the serializer. Keep that property exactly as it is.

**Do not redo any of the above.** Everything below is additive.

---

## 2. CHARGED DEFECT — D1 · the deferred arm is 25 ms, and the test measures the wrong property

`packages/obs-capture/install/{api,runner,scheduler}.ts:77-80` — `setTimeout(…, 25)`.

**§2.3 G5-5 part 3 is in your own contract, verbatim:** *"a process that imports the installer and stays alive **does** load it within one macrotask."* §3.5 gives the mandated form: `setTimeout(…, 0)` with `handle.unref?.()`. Measured by two lenses independently: `setImmediate`, `setTimeout 0`, `1`, `10` → **not loaded**; `24`/`50` → loaded. The arm fires at ~25 ms — **many macrotasks**, not one.

**Why this is charged rather than amended.** `tests/architecture/obs-l2-s05-import-graph.test.ts:341-342` waits **50 ms of wall clock** and then throws under the identifier `RUNTIME_NOT_LOADED_WITHIN_ONE_MACROTASK`. **The test names one property and measures another, and the name is the one the criterion is graded on.** A lens proved it blind by substituting a 40 ms arm — suite still green, 3 passed. That is a criterion inside your own `tests:` glob certifying a property the code does not have — **the identical failure class this whole rework exists to remediate**, and mission law (V-4) charges exactly that. The `25` is also disclosed nowhere in your handoff, while the handoff states the module loads *"within the first scheduled macrotask"* — an overstatement on the record.

**The deviation was not forced.** A lens ran the same arm shape parameterised by delay: at **0 ms**, part 2 (prompt exit → not loaded) **and** part 3 (one macrotask → loaded) **both pass**. The plan's own value satisfies both halves.

**Required:** set the delay to `0`, keep `.unref()`, and **re-key the test to measure the property it names** — assert loading after exactly one scheduled macrotask (e.g. a single `setTimeout(…, 0)` turn), not after a wall-clock sleep. The test must FAIL against a 25 ms arm. Demonstrate that it does.

**Downstream, in the adopted plan:** §3.6's *"between module evaluation and Tier 1 there is exactly one macrotask"* is currently false — the blind window where `emit()` calls are dropped-and-counted is ~25 ms — and `S05b-acc-7(a)` asserts that bound and would fail as written.

---

## 3. UNCHARGED CONTRACT AMENDMENTS — the Tier-0 seam §3.5 assigns to you

**You are charged nothing for these.** A lens established, and the Router verified, that **every clause of your §2.3 and §2.4 is met** — §2.4 is simply silent on the filename, the exit registration and the swap slot. These are §3.5 obligations the earlier packet's summary omitted. This mission's standing precedent applies verbatim: *"S05 built exactly what its contract said. The contract was incomplete."* Your `rework_round` is incremented once, by D1 alone.

**§3.5 states Tier 0 is "Owned by S05" and enumerates it. Delivered vs required, Router-verified by direct read:**

| §3.5 obligation | delivered today |
|---|---|
| spool path `${RUNTIME}-${process.pid}-${bootId}.spool` | `obs-capture-<runtime>-fatal.ndjson` — **no pid, no bootId, wrong extension** (`runner.ts:22`) |
| register `uncaughtExceptionMonitor` **and `exit`** | only `uncaughtExceptionMonitor` (`:74`); no `exit` handler in any of the three |
| **one mutable slot** Tier 1 swaps for a Tier-1 closure | **absent** — `writeFatalBoundaryRecord` hard-wired at `:74` |
| `.then((m) => m.startCaptureRuntime({ runtime: RUNTIME, spoolFd, installExitSink }))` | **absent** — `:78` is a bare `void import(…).catch(…)` passing nothing |
| `spoolFd` reachable by the runtime | **no** — `let exitSpoolFd` (`:17`) is module-private; only exports are `INSTALLER_RUNTIME`, `PROCESS_HANDLERS_INSTALLED` (`:82-83`) |

**Why this cannot wait for the next slice.** `packages/obs-capture/install/*.ts` is in S05b's **`contract.forbidden`** (§3.2 R-3). S05b therefore can never add the seam itself, and without it S05b cannot: build §3.5's Tier-1 exit sink (`createPreopenedSpool({ fd: spoolFd })` needs an fd it can never obtain); perform §3.5's *"swaps the installer's Tier-0 slot for a Tier-1 closure"* (there is no slot, so the fatal path would stay permanently minimized even after arming, writing **two** records per crash); or **find the Tier-0 records at all** — §3.8's drain globs `*.spool` while you write `*.ndjson`, so `S05b-acc-3(c)/(d)` fail.

**A2 · The filename must carry pid and bootId.** Beyond matching §3.5, the shared per-runtime name destroys §3.8's stated safety property — *"this process's file is drained by the next process — never by itself, so a live append can never race a read."* Two concurrent `runner` processes share one file today, so a drain would rename a file a live process still holds an fd on; on POSIX that process keeps appending into the renamed `.ingested` file and those records are never re-read. Two lenses reached this independently.

**A3 · Register `exit` as well as `uncaughtExceptionMonitor`, per §3.5 point 2** — and preserve the property a lens certified: a **clean shutdown must still write nothing**. Choosing the monitor was right for that reason; adding `exit` must not reintroduce a record on every graceful stop.

**A4 · Expose the seam:** the mutable Tier-0 slot, the fd, and the `startCaptureRuntime({ runtime, spoolFd, installExitSink })` call in the arm's `.then`. Keep the `.catch` — the module does not exist yet (S05b authors it), so today the arm must still fail silently.

**A5 · Short-write safety.** `writeSync(fd, string)` at `install/*.ts:34` ignores its return value. The repo's own `packages/obs-capture/src/spool.ts:70-92`, written for this exact requirement, loops until complete, guards with `SPOOL_WRITE_INCOMPLETE`, and caps with `envelopeMaxBytes`. A short write here silently lands a truncated, unparseable NDJSON line — **precisely in the disk-full case, which is when the record matters most.** Two lenses raised this. Match the spool module's discipline; G5-4 pins the serializer's *shape*, and this pins the *write*.

**A6 · `O_NOFOLLOW` on the spool open.** The open uses `"a"` with no `O_NOFOLLOW`. A lens confirmed both directions: a symlink planted at the spool filename causes the crash record to be written **outside the spool directory** — appended to an existing file, or creating one wherever the link points. It requires write access to the spool directory, which is exactly the shared-spool-directory case. Add the flag; keep the silent-degradation contract if the open then fails.

**A7 · Mode is creation-only.** `0600` is correct on create, but a pre-existing `0666` file stays `0666` and is appended to. Decide and implement the safe behaviour, and state which you chose and why.

## 4. Do NOT change
The zero-arity handler shape (`() => writeFatalBoundaryRecord()`) — it is what makes the caught error **structurally unreachable** from the serializer, and it is certified. The G5-4 deep-equality pin. The struck clause stays struck: **a surviving process is never acceptable evidence of capture on any boundary path.** No `unhandledRejection`, no `process.exit()`, no `process.exitCode`, no re-throw from a handler, no `openSync` inside a handler. No free text and no user-linked identifier ever reaches the fd; ids stay declared kinds.

## 5. Also fix, in your own glob
`obs-l2-s05-import-graph.test.ts:301,349` spread `...process.env` without clearing `OBS_SPOOL_DIR`, so on any machine or CI runner with that variable set the architecture probes create spool files as a side effect. Clear it.

## 6. RED — reproduce-first, mandatory
- **RED-D1:** against the current tree, show the arm is not one macrotask — a probe waiting exactly one `setTimeout(…, 0)` turn observes the runtime module **not loaded** — and show the current test **passes anyway** at 25 ms (and at 40 ms). That green-while-wrong is the defect.
- **RED-A2/A4:** show the delivered filename has no pid/bootId and the wrong extension against §3.8's `*.spool` glob, and that no `startCaptureRuntime`, `installExitSink` or `spoolFd` symbol exists anywhere in the repo.
- **RED-A5:** demonstrate the unchecked `writeSync` return value.
- **RED-A6:** demonstrate the symlink redirect.

## 7. Typecheck (§6.1) — base `7afdbe5`
Pin: count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. **`TYPECHECK-BASELINE.md`'s count-0 pin at `80362d0` is VOID — do not cite it.** T-5 fail-closed: `pnpm generate:contract` first, then **positively assert zero module-resolution escape** from the worktree root. A reviewer measured **5,057** resolutions on your tree with zero escapes and could not reconcile an 11-module gap against an earlier 5,059 figure taken on a different tree; **report your own number and do not absorb a discrepancy** — zero escapes is the criterion, not the count.

## 8. Where you stop
No push, no merge, no Done, no ticket-split, no worktree or branch operation, no database action. End at **READY FOR PEER REVIEW** on `t_6e99d607` with every RED frame and every changed criterion pasted. **Disclose every tuning constant you choose** — the undisclosed `25` is half of why D1 is charged. Then stop.
