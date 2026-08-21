# CONT-01 — Opus lens verdict

Ticket t_0b9a22a0, board debateai-v3. Author: Codex (GPT-5.6-Sol).
Lens: Opus 5. Reviewed against the live working tree on 2026-08-17.
The Grok lens verdict file existed at review time and was deliberately NOT read.

## VERDICT: GREENLIGHT

The ordered law is implemented, and it is implemented for real — proven by
mutation testing of the new regressions and by a real `codex_exec` rollout on
disk whose recorded `cwd` is the scratch directory. Three follow-up findings
(F-6, F-7, F-8) are non-blocking but F-6 should be fixed before this file is
touched again, and F-7 should become its own ticket before the next live
ceremony.

---

## What I ran (live world)

```
./node_modules/.bin/vitest run --config acceptance/vitest.config.ts \
    model-shim.test claude-relay.test grok-relay.test
→ Test Files 3 passed (3) | Tests 25 passed (25)   [11:11:00, 2.20s]
```

```
./node_modules/.bin/vitest run --config acceptance/vitest.config.ts   (full)
→ Test Files 2 failed | 9 passed (11) | Tests 2 failed | 48 passed (50)
   FAIL ceremony.test.ts        → ACCEPTANCE_EXECUTION_FAILED:NODE_REVIEW_UNAVAILABLE
   FAIL runtime-policy.test.ts  → max_model_attempts expected 74, received 88
```
Both failures are the two the packet pre-declares as pre-existing; neither
touches a CONT-01 file. No NEW failure was introduced. Not blocking on these.

```
./node_modules/.bin/tsc --noEmit    → clean, no diagnostics
/Applications/ChatGPT.app/Contents/Resources/codex exec --help   → see F-3
```

Plus four mutation runs against an isolated copy of `acceptance/` in the session
scratchpad (source tree never modified — verified: `git status --porcelain`
after review is byte-identical to the pre-review snapshot).

---

## Findings

### F-1 — CONFIRMED: every vendor-CLI spawn routes through the isolated spawn

There is exactly ONE process-spawn site in the whole acceptance tree:

- `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/acceptance/relay-core.ts:89` — the only `spawn(...)`.

`grep -rn -E "spawn|execFile|execSync|child_process|\bfork\(" acceptance/`
returns exactly two non-comment, non-test-name hits, both in `relay-core.ts`
(the `import` at line 2 and the call at line 89). No `exec`, no `execFile`, no
`execSync`, no `fork`, no shell-out anywhere else.

All FIVE `invokeCli` call sites — including every boot handshake — funnel into
that one spawn:

- `acceptance/model-shim.ts:171` — codex boot handshake
- `acceptance/claude-relay.ts:134` — claude boot handshake
- `acceptance/grok-relay.ts:110` — grok boot handshake
- `acceptance/relay-core.ts:175` — every relayed `/v1/chat/completions` call
- `acceptance/discovery.ts:88` — the discovery probe handshake (NOT named in
  the packet's claim list; I checked it independently and it is covered)

The three vendor binary constants (`/Applications/ChatGPT.app/.../codex`,
`~/.local/bin/claude`, `~/.grok/bin/grok`) are referenced in exactly three
files repo-wide — `model-shim.ts:15`, `claude-relay.ts:26`, `grok-relay.ts:12` —
all of which reach the CLI only through `invokeCli`. Claim 1 holds.

### F-2 — CONFIRMED: scratch dir is fresh, empty, outside the repo, never re-read

`acceptance/relay-core.ts:86-92`:
```ts
const makerSlug = adapter.maker.toLowerCase().replace(/[^a-z0-9]+/g, "-")...
const scratchDirectory = await mkdtemp(join(tmpdir(), `relay-${makerSlug}-`));
...
    cwd: scratchDirectory,
```
- Created **per `invokeCli` call** (per CLI process), not per relay — so the
  handshake and every later completion each get their own virgin directory.
- `tmpdir()` on this machine is `/var/folders/h7/.../T/` — outside both the
  project (`.../DebateAI-V3`) and the enclosing git repo (`.../DebateAIRO`).
- `scratchDirectory` appears nowhere else in the file: it is never read back,
  never listed, never passed to a parser. Verified by full read of the file.
- Live audit of `$TMPDIR/relay-*`: **344 directories, 0 non-empty.** (I hit 8
  non-empty ones mid-review and traced them to my own mutation-3 probe, not to
  the product; after removing my artifacts the real count of non-empty scratch
  dirs is **0**.) The packet's "all EMPTY" claim survives adversarial checking.

Maker slugs resolve to `relay-openai-*`, `relay-anthropic-*`, `relay-xai-*`,
matching the three test regexes exactly.

### F-3 — CONFIRMED: all four codex flags exist in the REAL installed binary

`/Applications/ChatGPT.app/Contents/Resources/codex exec --help` verbatim:
```
  -s, --sandbox <SANDBOX_MODE>   [possible values: read-only, workspace-write, danger-full-access]
      --skip-git-repo-check      Allow running Codex outside a Git repository
      --ignore-user-config       Do not load `$CODEX_HOME/config.toml`; auth still uses `CODEX_HOME`
      --ignore-rules             Do not load user or project execpolicy `.rules` files
      --json                     Print events to stdout as JSONL
```
All five flags used by `acceptance/model-shim.ts:146-154` are real, spelled
correctly, and `--sandbox read-only` uses a documented enum value.
`--skip-git-repo-check` is *required* by the change (the scratch dir is not a
git repo), so the two edits are correctly coupled.

**Lineage (DR-115) is intact — verified against a real rollout, not by
argument.** I was suspicious of `--ignore-user-config`, because
`~/.codex/config.toml:2` pins `model = "gpt-5.6-sol"`, and skipping that file
could silently swap which model plays the OpenAI seat. The live gate's own
rollout refutes it:

`~/.codex/sessions/.../rollout-2026-08-17T11-07-16-01a00ec2-....jsonl`
```
session_meta:  id=01a00ec2-... cwd=/private/var/folders/.../relay-openai-CO3xXO  originator=codex_exec
turn_context:  model=gpt-5.6-sol  cwd=/private/var/folders/.../relay-openai-CO3xXO
               approval=never  sandbox={'type': 'read-only'}
```
This single artifact independently proves three things at once: the real codex
binary ran (a) from the scratch directory, (b) under the read-only sandbox, and
(c) still resolved to `gpt-5.6-sol`. Rollout persistence under `CODEX_HOME` is
unaffected, so `parseCodexCompletion` (`model-shim.ts:130-139`) still finds its
rollout and reports a verbatim model id.

### F-4 — CONFIRMED: the new tests CANNOT pass for the wrong reason (F1 class refuted)

I did not take the assertions on faith. I copied `acceptance/` into the session
scratchpad, mutated the COPY, and ran the suite against each mutant. Each of the
three pinned properties fails independently and for the right reason:

| Mutation applied to the copy | Result |
|---|---|
| **M1** — delete `cwd: scratchDirectory,` from `relay-core.ts` (i.e. revert the fix) | **3 failed / 22 passed** — the three new tests, and only those: `expected '/private/tmp/.../mutant' to match /[/\\]relay-anthropic-[^/\\]+$/` (likewise openai, xai) |
| **M2** — `mkdtemp(join(process.cwd(), 'relay-…'))`, i.e. a correctly-named scratch dir *inside* the project | **1 failed / 4 passed** — `AssertionError: expected true to be false`. The "not inside the repo" clause fires on its own; the name regex alone is not load-bearing. |
| **M3** — write `leak.txt` into the scratch dir before spawn | **1 failed / 4 passed** — `AssertionError: expected [ 'leak.txt' ] to deeply equal []`. The emptiness clause fires on its own. |

Probe mechanics traced by hand and they are honest: the fake binary is
`process.execPath -e <script> --`, and the script reads `process.cwd()` and
`readdirSync(process.cwd())` **at runtime inside the child**. There is no
constant, no injected path, no way for it to print `relay-<maker>-*` unless the
child genuinely got that cwd — M1 is the direct proof (with `cwd` unset the
child printed the vitest root instead). The assertion
```ts
expect(fromProject === "" || (!fromProject.startsWith("..") && !isAbsolute(fromProject))).toBe(false);
```
(`model-shim.test.ts:54`, `claude-relay.test.ts:60`, `grok-relay.test.ts:54`)
decodes to "cwd is neither the project root itself nor any descendant of it" —
correct logic, and M2 proves it is live rather than vacuous. The three probes
also implicitly cover the boot handshake, since the relay cannot even start
unless the handshake spawn succeeds through the same code path.

Test count reconciles: 5 (model-shim) + 12 (claude) + 8 (grok) = **25**.

### F-5 — CONFIRMED: scope clean, envelope parsers byte-unchanged

`git diff --stat` (repo root `/Users/vladmihaimiron/Documents/DebateAIRO`):
```
 .claude/launch.json                         | 12 +++------
 DebateAI-V3/acceptance/claude-relay.test.ts | 27 +++++++++++++++++++
 DebateAI-V3/acceptance/grok-relay.test.ts   | 27 +++++++++++++++++++
 DebateAI-V3/acceptance/model-shim.test.ts   | 42 ++++++++++++++++++++++++++++-
 DebateAI-V3/acceptance/model-shim.ts        | 10 ++++++-
 DebateAI-V3/acceptance/relay-core.ts        |  8 ++++++
```
- No product package, no `packages/register`, no migration, no `apps/*`.
- `acceptance/claude-relay.ts` and `acceptance/grok-relay.ts` are **absent from
  the diff entirely** — envelope parsers byte-unchanged, claim 6 satisfied.
- `model-shim.ts` diff touches only `buildArguments` (lines 146-154);
  `parseCodexStdout`, `parseCodexRolloutModel`, `parseCodexCompletion`
  untouched.
- `relay-core.ts` diff is three imports + the `mkdtemp` line + `cwd:` + comment.
  Nothing else in the transport, timeout, or loud-failure law moved.
- `.claude/launch.json` lives OUTSIDE `DebateAI-V3` and is the orchestrator
  artifact the packet pre-declares; it only rewrites a dev-server invocation.
  Not attributed to the author.
- Untracked: `logs/CONT-01-packet.md`, `logs/run-cont01-grok.sh` (the Grok lens
  launcher), `reviews/CONT-01-review-packet.md` — all orchestrator artifacts.
  `logs/CONT-01-progress.log` carries the mandated CLAIMED/RED/GREEN/VERIFIED/
  READY entries.

---

## Non-blocking findings (fix-next, in priority order)

### F-6 — the codex argument assertion was WEAKENED and no longer pins order

`acceptance/model-shim.test.ts:99-106` replaced a positional check
(`expect(relayed.arguments.slice(0, 2)).toEqual(["exec", "--json"])`) with
`expect.arrayContaining([...])`, which is blind to both order and adjacency.
`codex exec` requires the subcommand FIRST and `--sandbox` immediately followed
by its value; neither is pinned any more.

Demonstrated, not asserted — **mutation M4**: I reordered `buildArguments` in
the copy to
```ts
["--json", "read-only", "--sandbox", "--ignore-user-config",
 "--ignore-rules", "--skip-git-repo-check", "exec", prompt]
```
— an argv that would break the real binary outright — and the suite still
reported **Tests 5 passed (5)**. This is a net loss of guard strength shipped by
this change.

Remedy (one line, in the same file):
```ts
expect(relayed.arguments).toEqual([
  "exec", "--skip-git-repo-check", "--sandbox", "read-only",
  "--ignore-rules", "--ignore-user-config", "--json", relayed.prompt
]);
```
I do not block on this: the production argv at `model-shim.ts:146-154` is
correct today and the 11:07 rollout proves the real binary accepted it.

### F-7 — `PWD`/`OLDPWD` still hand the project path to every vendor CLI

`relay-core.ts:89-96` passes only `cwd` and `stdio`; `env` is not supplied, so
the child inherits `process.env` verbatim. Node does **not** rewrite `PWD` when
`cwd` is set. Verified live:

```
$ node -e '<spawn with cwd=mkdtemp(tmpdir())>'
{"cwd":"/private/var/folders/.../relay-probe-il6IOf",
 "PWD":"/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3",
 "OLDPWD":"/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"}
```

Why it matters for codex specifically: `codex exec` still has a shell tool, and
`--sandbox read-only` forbids *writes*, not *reads*. The scratch-dir change
removes ambient discovery (no AGENTS.md, no project `.rules`, no git context) —
which is exactly what V ordered — but a model that runs `echo $PWD` is handed
the project path and can then read it by absolute path. Claude and Grok are not
exposed the same way (`--tools ""` on both, `--no-memory` on grok).

Remedy: `env: { ...process.env, PWD: scratchDirectory, OLDPWD: scratchDirectory }`
(and consider dropping `INIT_CWD` / `npm_config_local_prefix` / `npm_package_*`,
which the ceremony's `tsx`/`pnpm` entrypoints also populate with project paths).

I do not block, because the literal order — "spawn every relay CLI in an empty
scratch directory" — is fully delivered and this is strictly better than the
prior state. But if V reads the law's second sentence as "codex must be *unable*
to reach my project", this needs its own ticket BEFORE the next live ceremony.

### F-8 — scratch directories are never cleaned up

`mkdtemp` is called once per CLI process and nothing ever removes the directory.
Measured across my required test run alone: `$TMPDIR/relay-*` went **162 → 205**
(43 new dirs from 25 tests); the machine currently holds 344. Each is empty, so
this is litter rather than a defect, but a long ceremony creates one inode per
model call. Remedy: `rm -rf` the scratch dir in the `close`/`error` handlers, or
accept and document the reliance on OS temp reaping.

### F-9 — two observations, no action required

- The "not inside the repo" clause compares against the vitest worker's
  `process.cwd()`, which the run banner confirms is
  `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3` (the project) — not
  the enclosing git root `/Users/vladmihaimiron/Documents/DebateAIRO`. A scratch
  dir placed as a *sibling* of the project would satisfy both assertions. The
  implementation uses `tmpdir()`, so this is theoretical only.
- `--ignore-user-config` also drops `model_reasoning_effort = "medium"` from
  `~/.codex/config.toml:3`. `turn_context` does not persist that field in this
  codex build (it reads `None` in both the new-flag and old-flag rollouts), so I
  could neither confirm nor refute a change in effort. The *model id* is
  empirically unchanged, so DR-115 is safe either way; flagging only because a
  silent effort downgrade would subtly change GPT's answers in the ceremony.

---

## What would have made me BLOCK

For the record, since a GREENLIGHT should be falsifiable. Any one of these would
have flipped it:
1. A second `spawn`/`exec` reaching a vendor binary outside `invokeCli`
   (checked — none exists).
2. Mutation M1 leaving all 25 tests green, i.e. probes that pass with the fix
   reverted (checked — 3 fail).
3. Mutation M2 passing, i.e. an in-project scratch dir sliding through (checked
   — fails).
4. A codex flag absent from the real `--help`, or a rollout showing a model id
   other than `gpt-5.6-sol` after `--ignore-user-config` (checked — all present,
   model unchanged).
5. Any diff hunk in `claude-relay.ts` / `grok-relay.ts` parsers, or in a product
   package / register / migration (checked — none).
6. A new full-acceptance failure beyond the two pre-declared ones (checked —
   48/50, same two).

— Opus lens, 2026-08-17

---
---

# REWORK CONFIRMATION (Opus lens, P8 finder-confirms-own-finding)

Codex reworked CONT-01 in the same session and posted REWORK READY. I re-ran my
ORIGINAL falsification method — mutation of an isolated copy, live process
probes — against the CURRENT working tree. I did not confirm by reading the
author's diff and agreeing with it.

Method: `acceptance/` re-copied fresh from the current tree into the session
scratchpad, `node_modules` symlinked, baseline verified at **25/25** before any
mutation. Source tree never modified (`git status --porcelain` after this pass
is identical to before it).

## Overall: ALL THREE FINDINGS CONFIRMED FIXED. GREENLIGHT STANDS.

### F-6 — CONFIRMED FIXED (argv order now pinned)

`acceptance/model-shim.test.ts:106-114` now reads:
```ts
expect(relayed.arguments).toEqual([
  "exec", "--skip-git-repo-check", "--sandbox", "read-only",
  "--ignore-rules", "--ignore-user-config", "--json", relayed.prompt
]);
```
Falsification — I re-applied the **identical** scramble mutation (M4) that
previously passed 5/5:
```ts
["--json", "read-only", "--sandbox", "--ignore-user-config",
 "--ignore-rules", "--skip-git-repo-check", "exec", prompt]
```
```
BEFORE rework: Tests 5 passed (5)          ← the hole I reported
AFTER  rework: Tests 1 failed | 4 passed (5)
  AssertionError: expected [ '--json', 'read-only', …(6) ] to deeply equal [ 'exec', …(7) ]
```
The guard is now strictly stronger than the pre-CONT-01 baseline it replaced:
the old `slice(0, 2)` pinned only the first two arguments, the new `toEqual`
pins the complete argv including the trailing prompt position.

### F-7 — CONFIRMED FIXED (PWD/OLDPWD no longer leak the project; env not stripped)

`acceptance/relay-core.ts:93`:
```ts
env: { ...process.env, PWD: scratchDirectory, OLDPWD: scratchDirectory },
```
plus `relay-core.ts:87` now canonicalises the temp root so `PWD` and the real
cwd are the same string, not symlink aliases:
```ts
const scratchDirectory = await mkdtemp(join(await realpath(tmpdir()), `relay-${makerSlug}-`));
```

**Live probe** replicating the production spawn options exactly:
```
scratchDirectory = /private/var/folders/h7/.../T/relay-openai-gAeJ8O
cwd    = /private/var/folders/h7/.../T/relay-openai-gAeJ8O
PWD    = /private/var/folders/h7/.../T/relay-openai-gAeJ8O
OLDPWD = /private/var/folders/h7/.../T/relay-openai-gAeJ8O
PWD === cwd ? true | OLDPWD === cwd ? true
```
Compare my pre-rework probe, which returned
`PWD: "/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"`. The leak is
closed.

**Nothing is stripped.** Same probe: `parent env key count = 49, child = 49,
stripped = 0`; `HOME=/Users/vladmihaimiron`, `PATH` (2330 chars), `SHELL`,
`USER` all intact — which is what carries vendor auth (`~/.codex/auth.json`,
`~/.claude`, `~/.grok`). Explicit sentinel test for vendor auth variables:
```
CODEX_HOME=/tmp/fake-codex ANTHROPIC_API_KEY=sk-test-sentinel XAI_API_KEY=xai-sentinel
→ child saw {"CODEX_HOME":"/tmp/fake-codex","ANTHROPIC_API_KEY":"sk-test-sentinel","XAI_API_KEY":"xai-sentinel"}
```
The override is additive: `{ ...process.env, PWD, OLDPWD }`, so it cannot strip.

Two mutations prove the new test guard is load-bearing, not decorative:

| Mutation | Result |
|---|---|
| **M5** — delete the `env:` line | **3 failed / 22 passed** — all three probes: `expected '/private/tmp/.../mutant' to be '/private/var/folders/.../relay-openai-…'` |
| **M6** — drop `realpath()` from the mkdtemp path | **1 failed / 4 passed** — `expected '/var/folders/…' to be '/private/var/folders/…'`. So the assertion is exact-string and would catch a merely *aliased* PWD, not just a wrong one. |

All three probe tests now assert `probe.pwd === probe.cwd` and
`probe.oldpwd === probe.cwd` (`model-shim.test.ts:57-58`,
`claude-relay.test.ts` and `grok-relay.test.ts` equivalents).

### F-8 — CONFIRMED FIXED (litter reaped; cleanup cannot fail a completion)

`acceptance/relay-core.ts:110-114`, inside the `close` handler:
```ts
// Vendor litter is not relay input. Reap it after close without reading
// the directory and without making cleanup part of completion success.
void rm(scratchDirectory, { recursive: true, force: true }).catch(() => undefined);
```

**(a) Litter no longer accumulates.** Measured across the required focused run:
```
relay-* dirs BEFORE: 550
  → vitest run … model-shim.test claude-relay.test grok-relay.test  → 25 passed
relay-* dirs AFTER:  550     delta: 0
```
Pre-rework the same run produced **delta: +43**. Non-empty scratch dirs on the
machine: **0**.

**(b) The regression that pins it is real.** The codex probe now *writes*
`vendor-litter.txt` into the scratch dir before exiting
(`model-shim.test.ts:30`) and then asserts
`await expect.poll(() => existsSync(probe.cwd)).toBe(false)`
(`model-shim.test.ts:62`) — so the test exercises recursive removal of a
NON-empty directory, not the trivial case. Mutation **M7** (delete the cleanup
line) → **1 failed / 24 passed**, `AssertionError: expected true to be false`,
and litter delta jumped back to **+43** with `vendor-litter.txt` surviving in
the leaked dirs. The guard fires.

**(c) Cleanup failure cannot fail a completion.** Two-sided proof:

| Mutation | Result |
|---|---|
| **M8** — cleanup rejects (`.then(() => { throw new Error("CLEANUP_BOOM"); })`) with `.catch` kept | **Tests 25 passed (25)** — a failing reaper does not touch completion success |
| **M9** — same rejection with `.catch` REMOVED | vitest reports repeated `Unhandled Rejection: Error: CLEANUP_BOOM` — so `.catch(() => undefined)` is load-bearing, not cosmetic |

It is also correctly *not awaited* (`void`), so it adds no latency to the
completion, and it is placed before the timeout/exit-code branches so it runs on
the success, nonzero-exit and timeout paths alike.

**(d) Spawn-failure path checked (not asked for, checked anyway).** I was
suspicious that a spawn that never starts (`error` event) would leak, since the
cleanup lives only in the `close` handler. Live probe with a nonexistent binary:
```
spawn-failure event order : error -> close(code=-2)
close handler reached     : true
scratch dir after cleanup : removed
```
Node emits `close` after `error`, so cleanup runs there too. The second
`reject` from that `close` is a no-op on an already-settled promise. No leak.

## Re-verified gates

```
./node_modules/.bin/vitest run --config acceptance/vitest.config.ts \
    model-shim.test claude-relay.test grok-relay.test
→ Test Files 3 passed (3) | Tests 25 passed (25)      [11:29:50]

./node_modules/.bin/vitest run --config acceptance/vitest.config.ts   (full)
→ Tests 2 failed | 48 passed (50)
   FAIL acceptance/ceremony.test.ts        (NODE_REVIEW_UNAVAILABLE — pre-declared)
   FAIL acceptance/runtime-policy.test.ts  (max_model_attempts 74 vs 88 — pre-declared)
→ same two pre-existing failures, no new one

./node_modules/.bin/tsc --noEmit  → clean (covers the new `existsSync`,
                                    `realpath`, `rm` imports)
```

## Scope: no creep

`git diff --stat` is still the same six files, and the two untouched files stay
untouched:
```
 .claude/launch.json                         | 12 ++-----   (orchestrator artifact, outside DebateAI-V3)
 DebateAI-V3/acceptance/claude-relay.test.ts | 31 ++++++++++++++++++
 DebateAI-V3/acceptance/grok-relay.test.ts   | 31 ++++++++++++++++++
 DebateAI-V3/acceptance/model-shim.test.ts   | 50 ++++++++++++++++++++++++++++-
 DebateAI-V3/acceptance/model-shim.ts        | 10 +++++-
 DebateAI-V3/acceptance/relay-core.ts        | 12 +++++++
```
- `acceptance/claude-relay.ts` and `acceptance/grok-relay.ts` remain **absent
  from the diff** — envelope parsers still byte-unchanged.
- `model-shim.ts` still touches only `buildArguments`; the production argv was
  restored to the correct order after the author's own scramble experiment
  (verified by reading `model-shim.ts:146-154` and by the 25/25 run).
- `relay-core.ts` grew by 4 lines vs my first pass (`realpath` import + the
  `env:` line + the cleanup line + comment). Transport, timeout and
  loud-failure law otherwise unmoved.
- No product package, register, migration, or `apps/*` change. New untracked
  files are orchestrator/review artifacts only (rework packet, lens launcher
  scripts, the two verdicts).
- `logs/CONT-01-progress.log` carries F-6/F-7/F-8 RED→GREEN entries and
  REWORK VERIFIED / REWORK READY.

## Residual (informational, no action required)

The fix prevents NEW litter; it does not sweep the ~589 historical `relay-*`
directories already in `$TMPDIR` from pre-rework runs. All are empty and OS temp
reaping will clear them. Not a defect in this change.

**Rework verdict: GREENLIGHT — confirmed by mutation, not by reading.**

— Opus lens, 2026-08-17 (rework pass)
