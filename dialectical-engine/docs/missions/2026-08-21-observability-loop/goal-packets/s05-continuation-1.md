# S05 — CONTINUATION 1. Four items, from a completed three-lens blind diamond.

## 0. READ THIS FIRST: ROUNDS ARE NO LONGER COUNTED FOR THIS SLICE

V ruled on 2026-08-27, verbatim: *"its just a blocker, continue as you are until it is fixed. Ask me any necessary question. no need for more rounds if new blockers are found. Just questions."*

The 3-round cap and the round-4 extension are both spent and both dissolved. There is no round budget, no last-chance framing, and no ceremony to spend. The instruction is simply: **fix it, and keep going until it is fixed.** If a further defect is found after you finish, that is not a crisis and not a new authorisation — it is more work.

What this does **not** dissolve: you still do reproduce-first RED, you still disclose every constant, you still commit when green, and you still stop at READY FOR PEER REVIEW rather than declaring your own work correct. And **you may raise a genuine question** — a real design fork where proceeding either way would be a guess — through Router. You may not use that to ask permission to do what this packet already orders.

## 1. What you are working on

Worktree `.worktrees/obs-lane-2/dialectical-engine`, branch `obs-lane-2-capture`. **Your base is a commit now**: `14965fc1bfe83017ffce6b62a01060abd3f625a3`, itself on `7afdbe5`. The tree is clean. Work on top of `14965fc` and commit again when green — round-over-round diffing finally works, do not break it by leaving work uncommitted.

`packages/obs-capture/install/{api,runner,scheduler}.ts` still enters S05b's `contract.forbidden` when this slice closes. That is a real constraint on WHERE fixes can live, not a countdown.

## 2. CHARGED — B-1. A catastrophic-backtracking regex on the synchronous boot path of three production runtimes.

`install/{api,runner,scheduler}.ts:54`

```ts
const finalComponentPath = value.replace(/\/+$/u, "") || "/";
```

`\/+$` is quadratic when the separator run is not at end-of-string: the engine starts a match at every `/`, consumes the run greedily, fails `$`, and backtracks one character at a time. **This cost did not exist before the B1 repair** — the previous code returned `undefined` on a zero-length segment before reaching any normalisation.

Measured in this worktree, regex alone:

```
n slashes   5000    10000   20000   40000   60000   120000
replace()   35.1ms  140.4   561.3   2265.7  5079.8  20246.5
split+some   0.3ms    0.3     0.5      0.8     1.5      3.0
```

End to end, real installers, application code blocked until it finishes:

```
valid dir, no separators             app code reached after      4 ms
unset                                app code reached after      3 ms
api,       150000 embedded slashes   app code reached after  31536 ms
runner,    150000 embedded slashes   app code reached after  31996 ms
scheduler, 150000 embedded slashes   app code reached after  32730 ms
```

Three properties make this a blocker. It runs **before** the `spoolDirectory !== undefined` guard, so a path that is ultimately rejected still stalls the boot — in the 150 KB case the path fails `lstat` with `ENAMETOOLONG` anyway, so the process spent 31 seconds to decide to do nothing. It is **completely silent**: nothing throws, nothing logs, stderr stays byte-identical. And it is in **all three** production runtimes.

Reachability, with the reviewing lens's own honest ceilings: a shell cannot express it — zsh truncated the variable at 65,541 bytes here, capping a shell repro at ~6 s. Set **programmatically**, which is how a container runtime, a systemd unit or a k8s pod spec sets an environment variable, `execve` accepted 150 KB and stalled 31.6 s. Linux `MAX_ARG_STRLEN` 128 KB extrapolates to ~23 s; macOS `ARG_MAX` 1,048,576 extrapolates to ~23 minutes.

**What it breaks:** `L2-ADDENDUM-PLAN.md` §2.4, a stated non-negotiable — *"Failure to open degrades silently to 'no exit sink' and must not throw, log, or **delay boot** (OBS-R055: capture is total)"* — and the property nine prior lenses certified as *"degradation is silent: no throw, no log, no boot delay."*

**What is ordered:** make the normalisation linear in the length of the value. The lens measured `split`+`some` at 3.0 ms where `replace` took 20,246 ms on the same input, so a linear formulation exists and is three orders of magnitude cheaper; you are not required to use that one. **Pin it with a test that fails on a quadratic implementation** — a wall-clock bound on a large-separator-run input, chosen so it cannot flake on a slow machine but cannot pass at n² either. State the bound and how you chose it. Do not simply cap the input length and call it fixed unless you also state what an over-length value now does and prove it is silent.

## 3. CHARGED — B-2. A write that fails after committing bytes destroys the record. Found independently by TWO blind lenses, by different injections.

`writeComplete` resumes from `offset` after a short write, but `fatalBoundaryRecordAttempted` is set only **after** `exitSink()` returns, and the Tier-0 fallback branch is skipped when the sink **is** Tier 0. So a write that fails after committing bytes leaves the flag `false`, and `process.on("exit")` re-runs the **whole** record through the `O_APPEND` descriptor on top of the bytes already there. The truncated prefix carries no newline, so prefix and retry fuse into a single line.

```
lens A, chunk 1 commits 567 then chunk 2 throws (ENOSPC shape):
  spool bytes 1701   lines 1   parseable JSON 0
lens B, writeSync halves call 1 then throws EIO on call 2 then recovers:
  bytes on disk 1662 (554-byte truncated prefix + full 1108-byte record)
  lines on disk 1   ["UNPARSEABLE"]
```

**The neighbouring paths are correct and must stay correct** — both lenses confirmed them: a first-call failure that then succeeds writes exactly one good record (the retry is right there), all-writes-throw yields 0 bytes, short-write-zero yields 0 bytes with no livelock, and exit status and stderr are unchanged in every arm. **A naive fix breaks these.** Setting the flag before the attempt kills the first-call-failure rescue, which currently works. Neither lens prescribed a remedy and neither will you be given one; the property to achieve is stated below.

**Downstream consequence, traced by one lens and the reason this is a blocker rather than an untidiness:** §3.8's drain splits on `\n` and `JSON.parse`s. The fused line fails validation, is counted as a `REDACTOR_FAILURE` gap, and is **skipped**. So the fatal record is not merely corrupt — it is silently lost *and* misattributed to the redactor. A human reading the gap table would diagnose the wrong subsystem.

**Why no test caught it,** established independently by both lenses: the committed `partialWriteProbe` halves every write but never *fails* one, and the envelope-cap test throws **before** any bytes are committed, so it exercises the double-attempt path with no observable difference.

**The property to achieve:** after any single fatal event, the spool file contains **either exactly one parseable record or no bytes at all** — never a fused or torn line — across the full matrix of write outcomes: success, short-write-then-success, first-call-failure-then-success, mid-record-failure-then-success, and all-calls-fail. Pin every arm. Both lenses used the `node:fs` injection technique your own suite already uses; that technique is available to you.

## 4. CHARGED — R-1. The filesystem root is now accepted, where it previously was not.

```
OBS_SPOOL_DIR="/"       lstat("/") ok, realpath("/") -> /, openSync("//api-<pid>-<uuid>.spool") -> EROFS
OBS_SPOOL_DIR="/////"   same, realpath("/////") -> /
```

`EROFS` only because this machine's root volume is read-only. **On Linux as root this creates a `0600` file at `/`.** `"/".split("/").slice(1)` is `[""]`, a zero-length segment, so the previous code refused all three spellings and the current code accepts them. Realistic route: `OBS_SPOOL_DIR="${SPOOL_BASE}/"` with `SPOOL_BASE` unset collapses to `/`. Refuse the root, silently, and pin it.

## 5. CHARGED — S-1. The B1 defect class survives in another spelling, and the guard that should stop it guards nothing.

Measured against one physical writable directory, counting spool files actually created:

```
delta 1 : plain · trailing slash · doubled · tripled · interior doubled · interior tripled · leading doubled
delta 0 : ".../plain/."     ".../b1/./plain"     ".../plain/sub/.."
delta 0 : "/" · "//" · "///" · "" · " "
```

`/dir/.` and `/a/./b` are absolute, non-traversing, exactly-equivalent spellings of the same physical directory, and they produce the identical B1 symptom: exit 1, stderr byte-identical to the no-spool run, zero capture, permanent blackout, zero signal.

And the `.` half of the rejection is **dead weight**. A lens mutated `s === "." || s === ".."` down to `s === ".."` alone: **43 passed (43)**, every ordered rejection still holding — relative paths, `../../../escaped`, and a symlinked final component were all still refused — and `/dir/.` began capturing. The `..` rejection was explicitly ordered and stays. Accept `.` segments; keep `..` refused. Pin both directions.

## 6. NOT YOURS

**Under V decision, do not touch:** the TOCTOU window between the `lstat` at `install/*.ts:56` and the `realpathSync` at `:57`. A lens won that race 2 times in 40,000 unassisted attempts and demonstrated the write-through deterministically. It **predates** this work and Router has put the question of whether to fix it to V directly, because the answer changes what these files are allowed to become. If V rules that it is fixed, you will get it as a separate charge. Do not pre-empt that ruling, and do not restructure the path resolution in a way that forecloses it.

**Already routed, do not fix and do not report:** the three `audit:source` `process.env` rows (V decision row `t_d821f99e`; §3.7 *mandates* env-only config so these files cannot satisfy that rule, and the remedy is under `tools/`, which is floor-deny); the `switch`/`exhaustive` row on S02's registry file (`t_8e040ec2`); the 0-byte clean-boot spool, §3.6's "exactly one macrotask" wording, §3.8's drain race, and the four Tier-1 sink misbehaviours (all on S05b's seam contract, `t_3a04cc06`).

## 7. WHAT THREE BLIND LENSES RE-PROVED BY EXECUTION. Do not redo it, and do not break it.

Byte-identical stderr between control and installed across all paired arms (the installer contributes **zero** bytes to stderr in every configuration). A clean shutdown writes nothing; a crash on the normal path writes exactly one parseable record. No leak survived six secret classes plus seven markers across message, a two-level `cause` chain, three own properties, a **poisoned `toJSON`**, and stack-frame text, under a hostile ambient environment — raw bytes byte-searched across 3 runtimes × Tier 0 × Tier 1 armed × Tier-1-sink-throws, zero hits. The Tier-1 sink received `{"argc":0,"args":[]}`, proving zero-arity structurally. The excluded zone is untouched — zero zone-adjacent specifiers in a 96-specifier resolve trace. All five ref fields carry `UNKNOWN:DECLARED_KIND_REQUIRED`; the three `FINGERPRINTS` reproduce from the redactor's own formula. The path boundary holds across a 39-spelling matrix with syscall traces; flags are `2825` = `O_WRONLY|O_APPEND|O_CREAT|O_EXCL|O_NOFOLLOW`, mode `384` = `0600`. Module-eval fs calls are contained: a mode-0500 dir, a child of a mode-0000 parent, a FIFO, `/dev/null`, `/dev`, `/dev/fd` and a deep-nonexistent path all give exit 0 with empty stderr. The envelope cap never truncates across 27 spellings; the check precedes the first `writeSync`. The arm probe is deterministic at 30/30 then 24/24 under 6-way parallel load, and still fails both ordered mutants.

**Re-prove after your edits: byte-identical stderr, the no-leak result, exactly-one-record on the normal path, and arm determinism.** Re-derivation of the rest is not required.

## 8. ALSO FIX — one wording defect and one coverage gap, both small

**C-1.** The last handoff's heading *"ALL SEVEN SEEDS REACHABLE"* is overstated and two lenses caught the same seed. Six are genuinely pinned. `SPOOL_ENVELOPE_MAX_BYTES_SEED` is not: the fixture sets `OBS_ENVELOPE_MAX_BYTES=16384` and the cap test sets it to `1`, so both **override** the seed and the constant is never read. Records measure 1108/1120/1132 bytes, so **any mutant seed at or above ~1132 is byte-for-byte invisible** — `16384 → 32768` and `16384 → 1200` both survive at 43/43. Pin the seed itself, and confirm by mutation that a wrong seed value now fails.

**C-2.** The handoff sentence *"all full-suite failures pre-date round 4; none is in a changed file or caused by this diff"* is false: `process.env` occurrences went 0/0/0 at `7afdbe5` to 4/4/4 at `14965fc`, so the three `audit:source` rows **are** in changed files and **are** produced by this diff. The handoff's own accurate sentence sits three lines above it. Do not repeat the blanket claim; state routed-but-caused-by-this-diff as exactly that.

## 9. Standing law, unchanged

**Excluded zone** — never modified, never imported, and **no filesystem metadata of any kind**: `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`. **No user-linked identifiers, no free text** in anything durable; ids are **declared kinds, never shape-inferred**.

**Typecheck §6.1** at base `7afdbe5`: count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. **The count-0 pin at `80362d0` is VOID** — measured in a dirty checkout; do not cite it. **T-5 is fail-closed:** run `pnpm generate:contract` first and say you did, then **positively assert zero module-resolution escape** from the worktree root; escape is silent and a matching count is not evidence of containment.

**No push, no merge, no Done, no ticket split, no branch or worktree operation, no database action.** V performs every merge.

## 10. RED is mandatory and reproduce-first

Before any edit, demonstrate against the current tree: the boot-stall (show the app-reached-after milliseconds growing with separator count, and note that it happens even when the path is ultimately rejected); the fused unparseable line from a mid-record write failure; `/` accepted; `/dir/.` silently not capturing. Paste each frame.

## 11. Where to stop

Commit on `obs-lane-2-capture` when green. End at **READY FOR PEER REVIEW** on `t_6e99d607`, with every RED frame, the suite result as `passed/total` with any failures named and attributed, the TBP figures including T-5's positive assertion, and **every constant you chose disclosed** — including the wall-clock bound from §2 and how you chose it. Then stop.
