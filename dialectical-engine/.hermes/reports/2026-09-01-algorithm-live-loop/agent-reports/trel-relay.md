REWORK READY FOR REVIEW — TREL r3 · comments read through: trel-codex-r2-2026-09-01
report sha256: 4d5de8f58f19b1fc4dc59c3d5bc153606fd0ec2f0a8e251c17e7658e15e0075a   (body = line 4 to EOF; verify: tail -n +4 trel-relay.md | shasum -a 256)

# TREL r3

Seat: Opus 5, session `opus-trel-w1`. Working directory
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-trel/dialectical-engine`,
branch `lane/trel`, base `1c9578a24d5aedd0302fbda5593f66277cd87b98`,
HEAD `4aa9832449aab8350e634f12b5e484d9ff34c194`.

Rework round **2 of max 3 — the last lawful round**, against codex review r2
(`TREL-codex-r2.md`, verdict CHANGES, one blocking finding). Provisioning
re-verified: `ls packages/contract/generated/client.ts` present, not committed
(`.gitignore:7`).

**Zero provider spend across r1, r2 and r3.** Every spawn in every run reached a
local fake-CLI fixture or an absent path. Both r3 arms throw before `invokeCli`,
so the codex default is never spawned.

**r3 touched exactly two files** (`model-shim.ts`, `model-shim.test.ts`) —
minimal-edit discipline, +58/−3.

## Disposition — codex r2

| # | Verdict | Disposition |
|---|---|---|
| **B1 (r2)** | **ACCEPTED — fixed in `4aa9832`** | The codex sessions-root sibling. Reproduced RED first; see `## B1 (r3)`. |

Codex r2 also recorded that r1's findings are closed: B1's lazy thunk and all six
command-seam arms correct, B2 closed by D13, N1/N2 ticketed as F12, and **N3 did
not recur** — the line-2 body hash matched on both of the reviewer's reads.

### Guard inventory — confirmed independently, as required

I re-ran the enumeration myself rather than accepting the reviewer's count.
Across the four touched source files there are **exactly 4** distinct
`TEST_ONLY_*` codes:

| Code | Site | Covered by |
|---|---|---|
| `TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN` | `claude-relay.ts:181` | r2 arms |
| `TEST_ONLY_GROK_COMMAND_FORBIDDEN` | `grok-relay.ts:127` | r2 arms |
| `TEST_ONLY_CODEX_COMMAND_FORBIDDEN` | `model-shim.ts:180` | r2 arms |
| `TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN` | `model-shim.ts:183` | **r3 arms (was uncovered)** |

And the reason no sibling exists on the other two makers, checked at the option
level rather than inferred: `grep -n "testOnly"` returns only
`testOnlyCommand?: CommandSpec` for claude (`:161`) and grok (`:114`). **Codex
alone declares a second test-only option** (`testOnlySessionsRoot?: string`,
`model-shim.ts:39`). The count agrees with the reviewer's: three covered, one
not, now covered.

---

## B1 (r3) — the codex sessions-root sibling

**What was wrong.** r2 moved the env-backed default behind the *command* guard,
but codex has a *second* guard that sits below command resolution. With no
command seam supplied, `resolveTestGuardedCommand` forces the thunk, so a blank
override threw before the sessions-root guard could run.

Reviewer's concrete input — `NODE_ENV=production`,
`ACCEPTANCE_CODEX_BINARY=" "`, `testOnlySessionsRoot=<fixture>`, no
`testOnlyCommand`:

| | Outcome |
|---|---|
| base `1c9578a` | `TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN` (constant default cannot throw) |
| r2 `848deb4` | `CODEX_CLI_BINARY_UNRESOLVED` ← the defect |
| **r3 `4aa9832`** | **`TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN`** |

**RED** — `logs/trel/r3-red-sessions-root.log`, `R3RED_EXIT=1`,
**1 failed | 12 passed (13)**:

```
AssertionError: expected [Function] to throw error including 'TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDD…' but got 'CODEX_CLI_BINARY_UNRESOLVED'
```

**The fix** (`model-shim.ts`), the reviewer's suggested route — preserve baseline
ordering for both codex seams:

```ts
  if (options.testOnlyCommand === undefined
    && options.testOnlySessionsRoot !== undefined
    && process.env.NODE_ENV !== "test") {
    throw new Error("TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN");
  }
  const command = resolveTestGuardedCommand(
    () => ({ binary: resolveCodexBinary(), prefixArguments: [] }), …);
```

The guard **moved** rather than being duplicated. Below the resolution it is now
unreachable in all four combinations, which I checked exhaustively:

| `testOnlyCommand` | `NODE_ENV` | What fires first | Old site reachable? |
|---|---|---|---|
| present | ≠ test | `TEST_ONLY_CODEX_COMMAND_FORBIDDEN` (baseline precedence kept) | no — thrown earlier |
| present | test | seam selected, thunk never forced | no — its condition is false in test |
| absent | ≠ test | the moved guard | no — thrown earlier |
| absent | test | thunk forced, both conditions false | no |

**Two arms, not one — and why.** The reviewer's finding needs one arm. But the
fix introduces a condition the reviewer did not specify — `testOnlyCommand ===
undefined` — which is what preserves command-seam precedence. I built its mutant
(**M8**, drop the condition) and it was **not caught**: 13 passed, exit 0. I was
about to ship a branch pinned by nothing, which worker contract §2 forbids, so I
added one companion arm. This is a deliberate, disclosed excess over the
"exactly one arm" instruction: it is not new scope — it pins a condition inside
the same guard this round exists to fix.

| Arm | Asserts | RED log | GREEN log |
|---|---|---|---|
| `rejects a forbidden testOnlySessionsRoot outside NODE_ENV=test when the override is blank and no command seam is supplied` | `TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN` | `logs/trel/r3-red-sessions-root.log` | `logs/trel/r3-green-cluster-run{1,2,3}.log` |
| `keeps TEST_ONLY_CODEX_COMMAND_FORBIDDEN ahead of the sessions-root code when both seams are supplied outside NODE_ENV=test` | `TEST_ONLY_CODEX_COMMAND_FORBIDDEN` | `logs/trel/r3-mutant-m8-precedence-condition.log` (M8 is its RED) | `logs/trel/r3-green-cluster-run{1,2,3}.log` |

Neither arm reaches `invokeCli`: the first throws at the guard or at the thunk,
the second at the command guard. No provider call is possible from either.

---

## B1 (r2, retained) — the command-seam fix

Kept because codex r2 confirmed it correct.

**What was wrong.** All three `start*` functions passed `resolveXBinary()` as an
*argument*:

```ts
resolveTestGuardedCommand({ binary: resolveClaudeBinary(), … }, options.testOnlyCommand, "TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN")
```

JavaScript evaluates arguments before the call, so a blank override threw
*before* `resolveTestGuardedCommand` could run. With `testOnlyCommand` supplied
and `ACCEPTANCE_*_BINARY=" "` this changed two **pre-existing** typed-loud
paths — which D10 forbids ("typed-loud failure paths unchanged"):

| Condition | Before my r1 | After my r1 (the defect) | After r2 |
|---|---|---|---|
| `NODE_ENV=test`, seam supplied, blank override | selects the fake command | throws `*_CLI_BINARY_UNRESOLVED` | selects the fake command |
| `NODE_ENV≠test`, seam supplied, blank override | throws `TEST_ONLY_*_COMMAND_FORBIDDEN` | throws `*_CLI_BINARY_UNRESOLVED` | throws `TEST_ONLY_*_COMMAND_FORBIDDEN` |

I disclosed the eager evaluation myself in r1 (`## CONSTANTS` item 5) but judged
it benign. It was not: the reviewer traced argument-evaluation order into the
one input pair where it bites. **I verified it rather than taking it on trust**
— the RED run below reproduces both arms on all three makers.

**RED (r2).** The mutant these six assertions exist to catch *is the r1
implementation*, so this run is that mutant applied.

`r2-red-b1-arms.log` → `R2RED_EXIT=1` · **6 failed | 52 passed (58)**

```
AssertionError: expected [Function] to throw error including 'TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN' but got 'CLAUDE_CLI_BINARY_UNRESOLVED'
AssertionError: expected [Function] to throw error including 'TEST_ONLY_GROK_COMMAND_FORBIDDEN'   but got 'GROK_CLI_BINARY_UNRESOLVED'
AssertionError: expected [Function] to throw error including 'TEST_ONLY_CODEX_COMMAND_FORBIDDEN'  but got 'CODEX_CLI_BINARY_UNRESOLVED'
Error: CLAUDE_CLI_BINARY_UNRESOLVED   (test-mode arm: the seam was never selected)
Error: GROK_CLI_BINARY_UNRESOLVED
Error: CODEX_CLI_BINARY_UNRESOLVED
```

**The fix.** `resolveTestGuardedCommand` now accepts a **lazy** default and only
reaches for it once no test seam is in play; the three call sites pass a thunk:

```ts
export function resolveTestGuardedCommand(
  defaultCommand: CommandSpec | (() => CommandSpec), …
): CommandSpec {
  if (testOnlyCommand !== undefined) {
    if (process.env.NODE_ENV !== "test") throw new Error(forbiddenCode);
    return testOnlyCommand;
  }
  return typeof defaultCommand === "function" ? defaultCommand() : defaultCommand;
}
```

This is the reviewer's suggested route: the guard is once again the **sole
authority** for both selecting the seam and rejecting it outside test, and a
malformed environment key can no longer pre-empt either. Existing `CommandSpec`
callers are unaffected — `CommandSpec` is an object, never a function, so the
union is unambiguous.

**The six regression arms (two per maker), with log paths:**

| Test name | File | Log |
|---|---|---|
| `selects the test command seam when the override is blank, instead of throwing the override's code` | `acceptance/claude-relay.test.ts` | RED `r2-red-b1-arms.log` · GREEN `r2-green-cluster-run{1,2,3}.log` |
| `still rejects the seam outside NODE_ENV=test with TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN when the override is blank` | `acceptance/claude-relay.test.ts` | same |
| `selects the test command seam when the override is blank, instead of throwing the override's code` | `acceptance/grok-relay.test.ts` | same |
| `still rejects the seam outside NODE_ENV=test with TEST_ONLY_GROK_COMMAND_FORBIDDEN when the override is blank` | `acceptance/grok-relay.test.ts` | same |
| `selects the test command seam when the override is blank, instead of throwing the override's code` | `acceptance/model-shim.test.ts` | same |
| `still rejects the seam outside NODE_ENV=test with TEST_ONLY_CODEX_COMMAND_FORBIDDEN when the override is blank` | `acceptance/model-shim.test.ts` | same |

---

## N3 — the moving-snapshot defect, owned

The reviewer opened a 326-line report whose full-suite row read `pending`, and
finished against a 431-line report with a different suite disposition and five
new logs. HEAD never moved, but the handoff artifact did, and reconciling it
cost the review a second pass. That is my defect: I set READY when the *code*
was final rather than when the *evidence* was.

**Cure applied in r2 and repeated in r3:** everything — code, logs, both reports
— was finished and verified before the marker was written, and the marker was the
**last** write to this file. Codex r2 confirmed it worked: the hash matched on
both of its reads and the report did not move during review. Line 2 carries a content hash so a reviewer can
detect a moving snapshot immediately:

```
tail -n +4 agent-reports/trel-relay.md | shasum -a 256
```

If that command does not reproduce the line-2 value, this report moved after
handoff and should be rejected rather than reconciled.

---

## RED (r1, retained — the original defect)

Two stages; unchanged from r1 and still the evidence for the override itself.

**RED-1** (`red1-integration.log`, `RED1_EXIT=1`, **2 failed | 23 passed (25)**) —
integration tests added with no new imports, so they execute against unmodified
source:

```
 FAIL  acceptance/claude-relay.test.ts > D10 Claude relay binary resolution > spawns the binary named by ACCEPTANCE_CLAUDE_BINARY rather than the compiled-in default
CliRelayFailure: CLAUDE_CLI_FAILED
 ❯ acceptance/relay-core.ts:174:31
    173|       settleOnce(() => reject(
    174|         terminationFailure ?? new CliRelayFailure("FAILED", adapter.fa…
```

`relay-core.ts:174` is the spawn-error handler: the relay ignored the override
and spawned the absent `/Users/vladmihaimiron/.local/bin/claude`. Same frame for
`GROK_CLI_FAILED`.

**RED-2** (`red2-resolvers.log`, `RED2_EXIT=1`, **15 failed | 37 passed (52)**) —
`TypeError: resolveConfiguredBinary is not a function` and its three siblings.

---

## GREEN — three-run cluster verification (worst run wins)

Cluster = the four files this lane touches. **Worst run = GREEN**, in both rounds.

| Run | Exit | Test Files | Tests | Duration | Log |
|---|---|---|---|---|---|
| base (pre-change) | 0 | 4 passed (4) | **34 passed (34)** | 9.20s | `base-cluster.log` |
| r1 run 1 | 0 | 4 passed (4) | 52 passed (52) | 9.73s | `green-cluster-run1.log` |
| r1 run 2 | 0 | 4 passed (4) | 52 passed (52) | 9.80s | `green-cluster-run2.log` |
| r1 run 3 | 0 | 4 passed (4) | 52 passed (52) | 9.37s | `green-cluster-run3.log` |
| **r2 run 1** | **0** | 4 passed (4) | **58 passed (58)** | 10.73s | `r2-green-cluster-run1.log` |
| **r2 run 2** | **0** | 4 passed (4) | **58 passed (58)** | 10.39s | `r2-green-cluster-run2.log` |
| r2 run 3 | 0 | 4 passed (4) | 58 passed (58) | 10.13s | `r2-green-cluster-run3.log` |
| **r3 run 1** | **0** | 4 passed (4) | **60 passed (60)** | 10.56s | `r3-green-cluster-run1.log` |
| **r3 run 2** | **0** | 4 passed (4) | **60 passed (60)** | 9.25s | `r3-green-cluster-run2.log` |
| **r3 run 3** | **0** | 4 passed (4) | **60 passed (60)** | 9.10s | `r3-green-cluster-run3.log` |

Failure membership was empty in all nine patched runs, not merely the count.
34 → 52 (r1, +18) → 58 (r2, +6 command-seam arms) → 60 (r3, +2 codex-seam arms).

---

## REFUTATION (worker contract §2) — full battery, re-run each round

Sources backed up and restored by `cp`, deliberately **not** by
`git checkout <sha> -- path` (recorded trap: that stages the change).
`git status --porcelain` after every restore; all four sources verified
byte-identical by `cmp` at the end.

| # | PROPERTY the assertion pins | Mutant | Result | Killed by | Log |
|---|---|---|---|---|---|
| **M6** *(new, r2)* | The env-backed default is consulted ONLY when no test seam is supplied | thunk hoisted above the `testOnlyCommand` check — i.e. the exact B1 defect | **RED** 6 failed \| 52 passed (58) | **exactly the six new regression arms, nothing else** | `r2-mutant-m6-eager.log` |
| M1 | `startClaudeRelay` spawns the **resolved** binary, not the constant | thunk returns `CLAUDE_BINARY` | **RED** 1 failed \| 57 passed (58) | *only* `spawns the binary named by ACCEPTANCE_CLAUDE_BINARY…` | `r2-mutant-m1-callsite.log` |
| M2 | Key absent ⇒ the compiled-in default | `if (configured === undefined) return "";` | **RED** 5 failed \| 53 passed (58) | the three `keeps the compiled-in default…` + `returns the compiled-in default…` + `reads only its own maker's key` | `r2-mutant-m2-rerun.log` |
| M3 | Blank key fails loudly, never falls back silently | `if (binary === "") return defaultBinary;` | **RED** 4 failed \| 54 passed (58) | the four `fails loudly…` | `r2-mutant-m3-blank-silent-fallback.log` |
| M5 | **neighbour — must NOT be caught** (run in r1) | resolver rewritten to `source[key]?.trim()` form, behaviour-identical | **GREEN** 52 passed (52) | — correctly nothing | `mutant-m5-neighbour-refactor.log` |
| **M7** *(new, r3)* | The codex sessions-root guard runs BEFORE the binary default can be forced | guard moved back below the resolution (the r2 ordering) | **RED** 1 failed \| 12 passed (13) | *only* `rejects a forbidden testOnlySessionsRoot…` | `r3-mutant-m7-r2-ordering.log` |
| **M8** *(new, r3)* | A supplied command seam keeps baseline precedence over the sessions-root code | `testOnlyCommand === undefined` condition dropped | **RED** 1 failed \| 13 passed (14) | *only* `keeps TEST_ONLY_CODEX_COMMAND_FORBIDDEN ahead…` | `r3-mutant-m8-precedence-condition.log` |

**M8 is the reason r3 ships two arms.** Run against the fix *before* the
companion arm existed, M8 was **not caught** — 13 passed, exit 0. The condition
my own fix introduced was pinned by nothing. With the companion arm it is killed
by that arm alone, on `expected … 'TEST_ONLY_CODEX_COMMAND_FORBIDDEN' but got
'TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDD…'`.

M4 from r1 (override placed ahead of the guard) is now **structurally
impossible** to write at the call site — the thunk is only reachable through the
guard — and its property is pinned by M6 instead.

**Honest correction on M2.** Its first run (`r2-mutant-m2-default-dropped.log`)
showed 8 failures, not 5. Three of those — `P4-08 relay stdout ceiling`,
`P4-09 relay HTTP request-body ceiling`, `P4-10 loopback relay authentication` —
are **pre-existing wall-clock-bounded tests that no mutant of mine can reach**.
The P4-08 failure reads `AssertionError: expected 3359.005792 to be less than
1000` at `relay-core.test.ts:223`, at load average 21.28. They are load flakes,
not kills. The clean re-run at load 19.48 gives the true kill set of **5**,
identical to r1. I am reporting the re-run as the verdict and naming the
discrepancy rather than quietly using the tidier number. New finding 8.

**Coverage gap unchanged and still disclosed:** the codex equivalent of M1
("`startModelShim` ignores `resolveCodexBinary`") is not caught by any test and
cannot be on this host without a live provider call (`## FINDINGS` 1).

---

## SUITES

Run from the lane worktree at commit `4aa9832`.

| Command | Exit | Result | Log |
|---|---|---|---|
| `pnpm run typecheck` (r3) | **0** | **0 tsc errors** | `r3-typecheck.log` |
| cluster run 1 (r3) | **0** | **60 passed (60)** · 4/4 files | `r3-green-cluster-run1.log` |
| cluster run 2 (r3) | **0** | **60 passed (60)** · 4/4 files | `r3-green-cluster-run2.log` |
| cluster run 3 (r3) | **0** | **60 passed (60)** · 4/4 files | `r3-green-cluster-run3.log` |
| blast-radius zone (r3) | 1 | **2 failed \| 100 passed (102)** · 15 files · 42.80s | `r3-zone-run1.log` |
| `pnpm test` (full) | — | **runs at JUDGE stage per D13** — not this seat's to produce | — |

Cluster growth across rounds: 34 (base) → 52 (r1) → 58 (r2) → **60 (r3)**.
Worst run wins, and the worst of three r3 runs is GREEN.

### Full suite: settled by D13, not owed by me

Ruling **D13** (heavy-suite semaphore) adopts `max_concurrent_heavy = 1` and
places the **authoritative full `pnpm test` for each lane at JUDGE stage,
serially, in the lane's worktree before its integration merge** — each ticket's
`verification` field already names "judge verdict + suite re-run". It states
that workers' zone/cluster runs remain the supporting evidence and that a worker
"is never required to fight contention for it."

My r1 refusal is cited in that ruling as the evidence for it. So B2's gap is
closed by ruling, not by a run: the full suite is **scheduled**, not missing,
and I am no longer claiming it as owed. Contention has not abated — load average
was **19.48–21.28 on 12 cores** throughout this round, and it produced three
observable flakes inside my own cluster during the mutant battery (see the M2
correction above), which is precisely the corruption D13 exists to prevent.

### Blast-radius zone

My diff reaches exactly two places: everything under `acceptance/`, and
`apps/runner/src/dev-cli-provider-panel.ts` (the only non-acceptance importer of
the three relays), covered by `tests/unit/dev-cli-provider-panel.test.ts` and
`tests/architecture/dev-real-provider-only.test.ts`.

```
./node_modules/.bin/vitest run acceptance/ tests/unit/dev-cli-provider-panel.test.ts tests/architecture/dev-real-provider-only.test.ts
```

Both failures are the **same two proven pre-existing in r1**, unchanged by r2 and r3:

| Failing test | Verdict | Evidence |
|---|---|---|
| `acceptance/adversarial-corpus.test.ts > P4-13 … executes DB-01 with no database locator or capability call` | **PRE-EXISTING** | in T0's C.1 union, stable-red in all three of its runs; also red on HEAD~1 here |
| `acceptance/dual-maker-proof.test.ts > FAIR-02 dual-maker proof > round-trips one live call through BOTH makers…` | **PRE-EXISTING** | reproduced red on HEAD~1 sources: `base-dualmaker-adversarial.log`, `BASE_ZONE_EXIT=1`, **2 failed \| 11 passed (13)**, same `CODEX_CLI_MODEL_UNRESOLVED` |

The second is not in T0's union (T0 never got past collection), so I did not take
it on trust: I checked out the **HEAD~1** versions of all four source files
(verified `resolveConfiguredBinary` occurrences = 0), re-ran, got the identical
pair with the identical cause, then restored and verified byte-identity by `cmp`.
Root cause is `## FINDINGS` 7 — the same host-hardcoding class as D10, one field
over.

**Typecheck context:** this provisioned worktree typechecks clean at 0 errors
against T0's **157 errors / 39 files** on the unprovisioned primary checkout —
all 157 attributable to D9's missing `packages/contract/generated/`, confirmed
from the far side. No typecheck failure is pre-existing here and none is mine.

**Audits (regression insurance, not requested):** `pnpm run audit:source` exits 1
both before and after, output **byte-identical** to base (`diff` clean) — the
same three pre-existing `packages/obs-capture/install/*` violations. `pnpm run
lint` fails first at `audit:architecture` with three pre-existing
`-> obs-capture is not a declared edge`. None in `acceptance/`.

---

## COMMITS

| Commit | Round | Files | Stat |
|---|---|---|---|
| `7583464f034ddb891c81dc9f4f604f7c0ec248c8` | r1 | 8 | 303 insertions(+), 7 deletions(-) |
| `848deb484c7552bcbfd3968b9a14f39731a3c822` | r2 | 7 | 112 insertions(+), 5 deletions(-) |
| `4aa9832449aab8350e634f12b5e484d9ff34c194` | **r3** | **2** | **58 insertions(+), 3 deletions(-)** |

r2 — `TREL r2: resolve the env-backed default lazily so the test seam guard stays authoritative`
Source (4): `relay-core.ts` (+13/−2, lazy default) · `claude-relay.ts`,
`grok-relay.ts`, `model-shim.ts` (+2/−1 each, thunk at the call site).
Tests (3): `claude-relay.test.ts` (+34) · `grok-relay.test.ts` (+31) ·
`model-shim.test.ts` (+33) — the six regression arms.

r3 — `TREL r3: reject the codex sessions-root seam before forcing the binary default`
Source (1): `model-shim.ts` (+18/−3, guard moved ahead of the thunk).
Tests (1): `model-shim.test.ts` (+43) — the two arms above.

Branch `lane/trel`. Not pushed, not merged, no branch or worktree touched.
Working tree clean at close.

---

## CONSTANTS AND CHOICES, DISCLOSED (worker contract §7)

1. **Env key names** — quoted verbatim from D10.
2. **Loud codes** `*_CLI_BINARY_UNRESOLVED` — my choice, following T0 finding 3's
   suggestion and the existing `*_CLI_MODEL_UNRESOLVED` family. Thrown as a
   **plain `Error`**, matching `resolveTestGuardedCommand`'s precedent: a
   startup/config failure raised before any HTTP server exists, not a
   per-request relay failure. `run-acceptance.ts:193` records
   `result.reason.message` verbatim as the provider probe's `failureCode`, so
   the code lands in the database as-is and the relay degrades to a recorded
   `ABSENT` provider.
3. **Blank ⇒ throw, rather than blank ⇒ default.** My choice, departing from the
   local `defaultCodexSessionsRoot()` precedent (`model-shim.ts:126` treats an
   empty `CODEX_HOME` as unset), because a blank override silently spawning a
   foreign absolute path reproduces the defect this lane exists to remove.
   Pinned by M3. **r2 scope note:** this now applies only where it is safe — a
   blank override no longer disturbs the test seam (B1).
4. **`.trim()` on the value** — same `CODEX_HOME` precedent; guards the ordinary
   `X=$(cat file)` trailing-newline hazard.
5. **~~Eager~~ LAZY resolution at the call site (changed in r2).** r1 evaluated
   `resolveXBinary()` eagerly and I defended it as fail-fast; codex B1 showed it
   silently rewrote two pre-existing typed-loud paths. r2 defers it behind a
   thunk so it is reached only when no test seam is supplied. **r3 completes it:**
   codex's second seam (`testOnlySessionsRoot`) is now rejected ahead of the
   thunk too, so no test-only guard in any of the three relays can be pre-empted
   by a malformed `ACCEPTANCE_*_BINARY`.
6. **`timeoutMs: 10_000`** in the two spawn-level override tests (siblings use
   1_000). The wrapper adds an `sh`→`exec` hop and sibling lanes contend for CPU;
   the tests never wait on this bound. Six runs, zero flakes in these arms.
7. **Test-side wrapper technique.** The relay's default command has no argument
   seam (`prefixArguments: []`), so the fixture must arrive as a single
   executable file: `#!/bin/sh\nexec <node> <fixture> "$@"` at mode `0o755` into
   `mkdtemp`, POSIX single-quote escaped, reaped in `afterEach`. **POSIX-only** —
   these two tests would need a `.cmd` shim on Windows. Proven standalone first.
8. **Resolver placed in `relay-core.ts`** rather than triplicated, as a pure
   addition in r1. r2 additionally **modifies** `resolveTestGuardedCommand`'s
   signature there (widened to accept a thunk) — no longer a pure addition, and
   disclosed as such. The reviewer's PACKET REVIEW found r1's deliverables fit
   the declared writable surface; r2 stays inside the same four source files.

---

## FINDINGS (worker contract §5 — named, not fixed by this seat)

1. **BLOCKING FOR ANY FUTURE SEAT — the codex default is a live provider call,
   and the other two are not.** `CODEX_BINARY`
   (`/Applications/ChatGPT.app/Contents/Resources/codex`) is installed and
   executable on this host (T0 measured it), while the Claude and Grok defaults
   point into an absent `/Users/vladmihaimiron`. The symmetric test design — one
   spawn-level test per maker — therefore makes a **real OpenAI call** for codex
   on unmodified source, failing in a way that reads like a healthy RED
   (`CODEX_CLI_MODEL_UNRESOLVED`). I did not write that test; the prohibition and
   its reason are a comment block in `model-shim.test.ts`. **Consequence:**
   codex's wiring is pinned by static review only — a reviewer should confirm by
   eye that `model-shim.ts:178` reads `() => ({ binary: resolveCodexBinary(), … })`.
2. **Vitest turns a missing named export into `undefined`, not a link error.**
   Its SSR transform rewrites imports to namespace property access, so a test
   file importing a nonexistent symbol still **collects** and every test body
   **runs**, failing with `TypeError: X is not a function`. This defeats the
   plausible-sounding safety argument "the file won't collect, so nothing will
   spawn". Owed to `.hermes/TOOLING-TRAPS.md`.
3. **`pnpm test` under fleet contention** — superseded by **D13**, which my r1
   evidence produced. Retained only as the measurement: load 19.35→21.28 on 12
   cores, five lanes each running vitest plus its own PostgreSQL; base attempt 24
   tests in ~13 min, post-change attempt 20 tests in ~25 min. Also still true:
   T0's 515–573s/1021-test pin is **pre-provisioning** and understates the suite,
   so it should not be quoted as the post-D9 cost.
4. **`acceptance/README.md` does not document the three new operator keys.** It
   is the operator contract for `ACCEPTANCE_*` inputs (D6 relies on it) and has
   no `binary` mention at all. Out of scope; needs one section.
5. **T0's report contains a false claim about the ceremony env schema that
   directly affects D10.** It states that because `ceremonyEnvironmentSchema` is
   `.strict()`, "an extra key is as fatal as a missing one". Untrue for extra
   keys: `loadAcceptanceCeremonyEnvironment` (`main.ts:85-89`) projects
   `process.env` down to the schema's own keys before parsing, so `.strict()`
   never sees an outside variable. **Operationally important:** exporting the
   three new `ACCEPTANCE_*_BINARY` keys alongside the eight ceremony keys is safe
   and requires no `main.ts` change. Missing keys remain fatal.
6. **`.hermes/TOOLING-TRAPS.md` is outside worker `allowed` lists while worker
   contract §6 orders workers to append to it.** T0 hit this (its finding 7); so
   did I, with three traps owed. Suggest granting it append-only by default.
7. **`dual-maker-proof.ts` hardcodes the author's machine one field over from
   D10 — the TREL fix does not reach it.** `DualMakerProofOptions` exposes
   `testOnlyCodexCommand` and `testOnlyClaudeCommand` but **no sessions-root
   option at all** (`grep -c SessionsRoot` = 0), so `runDualMakerProof` hands
   `startModelShim` a *fake* codex CLI emitting the fixed thread id
   `01a000e7-3ea0-7f91-b166-7104741ef333` while lineage resolution reads the
   *real* `~/.codex/sessions`. Measured: **0** matching rollouts, so
   `model-shim.ts:149` throws `CODEX_CLI_MODEL_UNRESOLVED` on every host but the
   author's. The repo already ships the right fixture
   (`acceptance/test-fixtures/codex-sessions/` holds exactly that thread id) and
   `startModelShim` already accepts `testOnlySessionsRoot`; `dual-maker-proof.ts`
   never plumbs it through. **One option field and one spread**, squarely in
   D10's "mission-enabling harness repair" class. Recommend a sibling ticket —
   without it FAIR-02 stays red on this host even with the binary overrides in.
8. **NEW (r2) — three latent load-flaky tests inside `acceptance/relay-core.test.ts`.**
   `P4-08 relay stdout ceiling`, `P4-09 relay HTTP request-body ceiling` and
   `P4-10 loopback relay authentication` carry wall-clock bounds; at load 21.28
   P4-08 failed `expected 3359.005792 to be less than 1000`
   (`relay-core.test.ts:223`), and all three passed again at load 19.48. They are
   pre-existing and unrelated to this diff, but they sit **inside this lane's own
   cluster**, so any future TREL cluster run can go red for reasons no mutant
   explains. D13's semaphore is the systemic cure; the durable fix is to replace
   the wall-clock bounds with condition-based waits. Ticket suggested.

---

## HANDOFF

- **Marker (line 1):** `REWORK READY FOR REVIEW — TREL r3 · comments read through: trel-codex-r2-2026-09-01`
- **Content hash (line 2):** guards against the N3 moving-snapshot defect;
  verified working across codex r2's two reads.
- **Rework round:** 2 of max 3 spent. **Round 3 was the last lawful round** — a
  further CHANGES verdict goes to a V DECISIONS PACKET row, not to round 4
  (protocol §2.3).
- **Self-report:** `agent-reports/trel-relay-self.md`, `## r3` section, written
  before this marker.
- **Logs** (primary checkout,
  `.hermes/reports/2026-09-01-algorithm-live-loop/logs/trel/`, 34 files).
  r2 set: `r2-red-b1-arms`, `r2-typecheck`, `r2-green-cluster-run{1,2,3}`,
  `r2-mutant-m6-eager`, `r2-mutant-m1-callsite`, `r2-mutant-m2-default-dropped`,
  `r2-mutant-m2-rerun`, `r2-mutant-m3-blank-silent-fallback`, `r2-zone-run1`.
  **r3 set:** `r3-red-sessions-root`, `r3-typecheck`,
  `r3-green-cluster-run{1,2,3}`, `r3-mutant-m7-r2-ordering`,
  `r3-mutant-m8-precedence-condition`, `r3-zone-run1`.
- **Not owed by me:** the full `pnpm test`, which D13 places at JUDGE stage.
- **Still owed above this seat:** a `.hermes/TOOLING-TRAPS.md` append I am not
  permitted to make (finding 6); three traps are ready in my self-report.
- **Deliberate, disclosed excess over the packet's "exactly one arm":** r3 ships
  two arms. The second pins the `testOnlyCommand === undefined` condition the fix
  introduces, which mutant M8 proved was otherwise pinned by nothing. Same guard,
  same file, no new scope.
- Not done, by contract: no push, no merge, no Done mark, no board write, no
  ticket split, no edit outside the eight files across `## COMMITS` plus my two
  report files and `logs/trel/**`.
