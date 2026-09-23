# Task 1 — Discovery by name, and a resolved path that must run

SKILLS LOADED: superpowers:test-driven-development, superpowers:verification-before-completion

Worktree: `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine`
Branch `mission/2026-09-16-algorithm-live-loop-continuation`, base `9c439935`, tip `61432468`. Not pushed.

No `claude`, `codex`, `grok` or `hermes` binary was executed at any point, not with
`--version` and not indirectly. No candidate was ever routed through a shell. Every
refusal in this task is proven by the resolver's return value or by the code it throws.

---

## 1. What shipped

### Resolution order (`acceptance/relay-core.ts:262-278`, `resolveConfiguredBinary`)

The first parameter changed meaning: it was `defaultBinary` (a compiled-in absolute
path), it is now `binaryName` (the maker's CLI name). Signature, return type and throw
style are unchanged.

1. **The operator's key wins.** `source[environmentKey]` present and non-blank names the
   binary. A value containing a path separator (`/[\\/]/u`) is taken as a path; a bare
   name is looked up on PATH exactly as a discovered name would be. Surrounding
   whitespace is still trimmed.
2. **A present-but-blank key refuses loudly**, with the maker's **bare** code and nothing
   appended — unchanged from before this task, because `run-acceptance.ts` records that
   message verbatim and `absent-makers.ts` prints it.
3. **An absent key means discovery by NAME** over the PATH of the environment the
   resolver was *handed* (`source.PATH`, split on `path.delimiter`) — never
   `process.env` behind the caller's back. First match wins.

Then, for whatever 1 or 3 produced, one **admission gate**
(`acceptance/relay-core.ts:189-214`, `admitProgram`), symlinks followed, in this order:
regular file → non-empty → executable by this user → program by its first bytes.

### Refusal vocabulary

`<UNRESOLVED_CODE>:<REASON>:<path>` on a plain `Error`. `REASON` is one of
(`acceptance/relay-core.ts:138-141`, exported as `BINARY_REFUSAL_REASONS` /
`BinaryRefusalReason`):

| REASON | Meaning | `<path>` field carries |
| --- | --- | --- |
| `NOT_ON_PATH` | no PATH directory carries the name at all | the **name** searched for |
| `NOT_FOUND` | the name resolves to nothing (dangling symlink, absent path in the key) | the resolved path |
| `EMPTY` | a 0-byte file — the interrupted-update case | the resolved path |
| `NOT_EXECUTABLE` | `access(X_OK)` refuses it for this user | the resolved path |
| `NOT_A_PROGRAM` | not a regular file, or its first bytes are not a program header | the resolved path |

Program headers accepted (`acceptance/relay-core.ts:155-163`, `PROGRAM_HEADERS`):
`23 21` (`#!`), `cf fa ed fe`, `ce fa ed fe`, `fe ed fa cf`, `fe ed fa ce`
(Mach-O, both widths, both byte orders), `ca fe ba be`, `be ba fe ca` (universal).
The file is opened read-only, four bytes are read at **offset 0**, the descriptor is
closed. Nothing is started.

A blank key keeps the bare code (no `:REASON:` suffix) because there is no path to name
and because that string is what every existing reader already pins.

### The four call sites

| Maker | Name constant | Env key | Code |
| --- | --- | --- | --- |
| Anthropic | `CLAUDE_BINARY_NAME = "claude"` (`claude-relay.ts:30`) | `ACCEPTANCE_CLAUDE_BINARY` | `CLAUDE_CLI_BINARY_UNRESOLVED` |
| xAI | `GROK_BINARY_NAME = "grok"` (`grok-relay.ts:14`) | `ACCEPTANCE_GROK_BINARY` | `GROK_CLI_BINARY_UNRESOLVED` |
| OpenAI | `CODEX_BINARY_NAME = "codex"` (`model-shim.ts:17`) | `ACCEPTANCE_CODEX_BINARY` | `CODEX_CLI_BINARY_UNRESOLVED` |
| Z.AI | `HERMES_BINARY_NAME = "hermes"` (`hermes-relay.ts:24`) | `ACCEPTANCE_HERMES_BINARY` | `HERMES_CLI_BINARY_UNRESOLVED` |

`CLAUDE_BINARY`, `GROK_BINARY`, `CODEX_BINARY` and `HERMES_BINARY` no longer exist;
the four `resolve*Binary(source = process.env): string` names and their throw style do.
`acceptance/hermes-relay.ts:162` also changed from an eagerly built `CommandSpec` to a
thunk, for the reason `relay-core.ts:108-116` already states for the other three: a
resolver that can refuse on its own account must not be forced before
`resolveTestGuardedCommand` has decided whether a test seam is in play.

`spawn(command.binary, …)` at `acceptance/relay-core.ts:283` is untouched — still no
shell, still `stdio: ["ignore","pipe","pipe"]`.

### Two deliberate design choices (they are choices, not deductions — flagging for a ruling)

- **A broken match is reported, not stepped over.** O1 says "first match wins — the rule
  `command -v` applies"; O2 says whatever was resolved must be admitted or refused. A
  literal `command -v` *skips* a non-executable entry and keeps searching the next PATH
  directory. `discoverOnPath` (`relay-core.ts:220-243`) instead treats the first entry
  that EXISTS under the name (`lstatSync`, so a dangling symlink counts) as the match and
  then admits or refuses it. A corrupted `claude` earlier on PATH than a good one is
  therefore named out loud rather than silently bypassed — which is the whole argument of
  2026-09-17. Stated in the source and in the README.
- **An empty PATH field is skipped.** A shell reads `::` as the current directory.
  Whatever the process happens to be sitting in is not a deduction, so it is not searched.

### O4 — `acceptance/README.md:28-59`

A new section, *"Which CLI a maker relay runs (D10)"*, states the order in plain words
(key → PATH by name → refusal), the admission check, the five reasons, the
`MAKER ABSENT` line it becomes, and the two 2026-09-17 launcher failures that bought the
rule. It does not mention a compiled-in default, because none remains.

---

## 2. RED frames, verbatim

### RED A — `acceptance/relay-core.test.ts`, against behaviour not yet written

```
 Test Files  1 failed (1)
      Tests  13 failed | 8 passed (21)
```

```
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > finds the maker's CLI by NAME in the PATH of the environment it is handed 3ms
   → expected 'fixture-cli' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > takes the first PATH directory that carries the name, in PATH order 1ms
   → expected 'fixture-cli' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > refuses with NOT_ON_PATH when nothing on PATH carries the name, and when there is no PATH 1ms
   → expected [Function] to throw an error
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > refuses with NOT_FOUND when the name on PATH is a dangling symlink 1ms
   → expected [Function] to throw an error
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > refuses with EMPTY for the 0-byte launcher an interrupted update leaves behind 1ms
   → expected [Function] to throw an error
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > refuses with NOT_EXECUTABLE when the resolved file cannot be executed by this user 1ms
   → expected [Function] to throw an error
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > refuses with NOT_A_PROGRAM when the executable bit sits on plain text 1ms
   → expected [Function] to throw an error
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > reads only the FIRST bytes: a shebang further down the file is not a program header 1ms
   → expected [Function] to throw an error
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > accepts a Mach-O or universal executable, not only a shebang script 1ms
   → expected 'fixture-cli' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > looks a BARE name in the operator's key up on PATH 0ms
   → expected 'other-cli' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > holds the key's own path to the same program check as a discovered one 1ms
   → expected [Function] to throw an error
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > reads only its own maker's key 1ms
   → expected 'fixture-cli' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality
 × acceptance/relay-core.test.ts > D10 maker CLI binary resolution > resolves a program WITHOUT running it 1ms
   → expected 'fixture-cli' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality
```

Full frames (representative of the two failure shapes, and of every `[1/13]`…`[13/13]`
block in that run):

```
 FAIL  acceptance/relay-core.test.ts > D10 maker CLI binary resolution > finds the maker's CLI by NAME in the PATH of the environment it is handed
AssertionError: expected 'fixture-cli' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality

Expected: "/var/folders/g1/by5zh4k97q51qjs8mg6nnj180000gn/T/relay-path-ITzQRv/fixture-cli"
Received: "fixture-cli"

 ❯ acceptance/relay-core.test.ts:455:75
    453|     const program = await place(directory, SHEBANG);
    454|
    455|     expect(resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory …
       |                                                                           ^
    456|   });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/13]⎯
```

```
 FAIL  acceptance/relay-core.test.ts > D10 maker CLI binary resolution > refuses with NOT_A_PROGRAM when the executable bit sits on plain text
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ acceptance/relay-core.test.ts:511:8
    509|
    510|     expect(() => resolveConfiguredBinary(NAME, KEY, CODE, { PATH: dire…
    511|       .toThrow(`${CODE}:NOT_A_PROGRAM:${path}`);
       |        ^
    512|   });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/13]⎯
```

```
 FAIL  acceptance/relay-core.test.ts > D10 maker CLI binary resolution > resolves a program WITHOUT running it
AssertionError: expected 'fixture-cli' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality

Expected: "/var/folders/g1/by5zh4k97q51qjs8mg6nnj180000gn/T/relay-path-eHipOa/fixture-cli"
Received: "fixture-cli"

 ❯ acceptance/relay-core.test.ts:595:75
    593|     const program = await place(directory, `#!/bin/sh\n: > ${JSON.stri…
    594|
    595|     expect(resolveConfiguredBinary(NAME, KEY, CODE, { PATH: directory …
       |                                                                           ^
    596|     expect(existsSync(marker)).toBe(false);
    597|   });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/13]⎯
```

Eight assertions in that block were green from the first run and are recorded as such:
the blank-key arm and "lets the operator's key win over a PATH that carries the same
name" pin behaviour this task preserves rather than introduces, "never routes a candidate
binary through a shell anywhere in acceptance/" is a standing-law pin over existing
source, and the five pre-existing P4-* suites are untouched. Each is refuted by a mutant
below rather than by a RED-first frame.

### RED B — the four maker suites, against the same missing behaviour

```
 Test Files  4 failed (4)
      Tests  10 failed | 64 passed (74)
```

```
 × acceptance/claude-relay.test.ts > D10 Claude relay binary resolution > carries no compiled-in path: this maker is found by the NAME `claude` 2ms
   → expected undefined to be 'claude' // Object.is equality
 × acceptance/claude-relay.test.ts > D10 Claude relay binary resolution > discovers `claude` on the PATH it is handed, and refuses a corrupted launcher there 3ms
   → expected '/Users/vladmihaimiron/.local/bin/clau…' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality
 × acceptance/grok-relay.test.ts > D10 Grok relay binary resolution > carries no compiled-in path: this maker is found by the NAME `grok` 2ms
   → expected undefined to be 'grok' // Object.is equality
 × acceptance/grok-relay.test.ts > D10 Grok relay binary resolution > discovers `grok` on the PATH it is handed, and refuses a corrupted launcher there 2ms
   → expected '/Users/vladmihaimiron/.grok/bin/grok' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality
 × acceptance/model-shim.test.ts > D10 Codex shim binary resolution > carries no compiled-in path: this maker is found by the NAME `codex` 3ms
   → expected undefined to be 'codex' // Object.is equality
 × acceptance/model-shim.test.ts > D10 Codex shim binary resolution > discovers `codex` on the PATH it is handed, and refuses a corrupted launcher there 3ms
   → expected '/Applications/ChatGPT.app/Contents/Re…' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality
 × acceptance/hermes-relay.test.ts > D10 Hermes support relay binary resolution > carries no compiled-in path: this maker is found by the NAME `hermes` 2ms
   → expected undefined to be 'hermes' // Object.is equality
 × acceptance/hermes-relay.test.ts > D10 Hermes support relay binary resolution > discovers `hermes` on the PATH it is handed, and refuses a corrupted launcher there 1ms
   → resolveHermesBinary is not a function
 × acceptance/hermes-relay.test.ts > D10 Hermes support relay binary resolution > resolves this host's binary from ACCEPTANCE_HERMES_BINARY, ahead of PATH 1ms
   → resolveHermesBinary is not a function
 × acceptance/hermes-relay.test.ts > D10 Hermes support relay binary resolution > fails loudly with the bare typed code when ACCEPTANCE_HERMES_BINARY is present but blank 1ms
   → resolveHermesBinary is not a function
```

```
 FAIL  acceptance/claude-relay.test.ts > D10 Claude relay binary resolution > carries no compiled-in path: this maker is found by the NAME `claude`
AssertionError: expected undefined to be 'claude' // Object.is equality

- Expected:
"claude"

+ Received:
undefined

 ❯ acceptance/claude-relay.test.ts:381:32
    379|     // What is pinned now is the name searched for and the typed code …
    380|     // CLI refuses with; there is no path left to fall back to.
    381|     expect(CLAUDE_BINARY_NAME).toBe("claude");
```

The two `expected '/Users/vladmihaimiron/…'` frames are the defect stated in its own
words: the resolver was handing back one developer's home directory on this machine.

---

## 3. Refutation matrix

Every mutant was applied to the shipped source (or, for M15, to the test), the named
suites were run, and the source was restored from an in-memory snapshot in a `finally`.
Driver: `/private/tmp/claude-501/-Users-stefannour-DebateAIRO/45ab9500-0991-4dbd-89ec-f04cc3082e67/scratchpad/mutate.py`
(scratch only, not in the repo). Restoration verified afterwards by `git diff --stat` and
by a residue grep for every mutant literal — clean.

| # | Assertion it refutes | Mutant | Red at site | Restored |
| --- | --- | --- | --- | --- |
| M1 | finds the CLI by NAME in the PATH it is handed | `discoverOnPath`: join `${binaryName}-absent` instead of the name | ✔ that test (+10 others in the block) 11/21 failed | ✔ |
| M2 | takes the first PATH directory, in PATH order | iterate `PATH.split(delimiter).reverse()` | ✔ only that test, 1/21 failed | ✔ |
| M3 | a dangling symlink refuses `NOT_FOUND` | discovery matches with `statSync` instead of `lstatSync` | ✔ only that test | ✔ |
| M4 | nothing on PATH refuses `NOT_ON_PATH` | return `join("/nowhere", binaryName)` instead of throwing | ✔ only that test | ✔ |
| M5 | a 0-byte launcher refuses `EMPTY` | delete the `metadata.size === 0` check | ✔ only that test | ✔ |
| M6 | an unrunnable file refuses `NOT_EXECUTABLE` | delete the `accessSync(path, X_OK)` block | ✔ only that test | ✔ |
| M7 | plain text refuses `NOT_A_PROGRAM` | delete the `hasProgramHeader` check | ✔ that test + first-bytes + key-path + all four makers' "corrupted launcher" arms, 7/95 failed | ✔ |
| M8 | the header is read at offset 0, not searched for | `readSync(…, position 15)` | ✔ "reads only the FIRST bytes" (+7 others) | ✔ |
| M9 | a Mach-O / universal magic is a program header | `PROGRAM_HEADERS` reduced to `[0x23, 0x21]` | ✔ only that test | ✔ |
| M10 | the operator's key is consulted BEFORE PATH | key read only when `source.PATH === undefined` | ✔ all four makers' "ahead of PATH" arms, both spawn-level arms, key-wins, bare-name, blank-key; 9/95 failed | ✔ |
| M11 | a BARE name in the key is looked up on PATH | key branch always returns `named` | ✔ only that test | ✔ |
| M12 | the key's own path passes the same admission check | key branch skips `admitProgram` | ✔ only that test | ✔ |
| M13 | a blank key throws the BARE code | blank branch throws `${code}:BLANK:` | ✔ relay-core anchored arm + hermes blank arm | ✔ |
| M14 | only the maker's OWN key is read | `source[environmentKey] ?? source.ACCEPTANCE_OTHER_BINARY` | ✔ only that test | ✔ |
| M15 | "resolves a program WITHOUT running it" is live | test-side: pre-create the marker file before the call | ✔ only that test | ✔ |
| M16 | no acceptance runtime module routes through a shell | insert `// mutant: shell: true` into `relay-core.ts` | ✔ only that test | ✔ |
| M17 | the claude relay searches for the name `claude` | `CLAUDE_BINARY_NAME = "claude-code"` | ✔ both claude D10 arms | ✔ |
| M18 | the grok relay searches for the name `grok` | `GROK_BINARY_NAME = "grok-build"` | ✔ both grok D10 arms | ✔ |
| M19 | the codex shim searches for the name `codex` | `CODEX_BINARY_NAME = "codex-cli"` | ✔ both codex D10 arms | ✔ |
| M20 | the hermes relay searches for the name `hermes` | `HERMES_BINARY_NAME = "hermes-cli"` | ✔ both hermes D10 arms | ✔ |
| M21 | the hermes default command stays LAZY | revert the thunk to an eager `CommandSpec` | ✔ only "keeps the NODE_ENV=test command seam ahead of a blank override" | ✔ |

M15's refutation is test-side on purpose. The honest source mutant for "does not run the
candidate" would be *to run the candidate*, and this seat does not execute candidate
binaries under any circumstances. Pre-creating the marker proves the assertion is live
without anything being started.

---

## 4. Gate at the final tip (`61432468`), three runs each

Driver: `scratchpad/gate.py`; log `scratchpad/gate-final.log`. Worst run is the verdict;
all three runs agreed for every suite.

| Suite | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| `acceptance/relay-core.test.ts` | 21/21 | 21/21 | 21/21 |
| `acceptance/claude-relay.test.ts` | 27/27 | 27/27 | 27/27 |
| `acceptance/grok-relay.test.ts` | 24/24 | 24/24 | 24/24 |
| `acceptance/model-shim.test.ts` | 15/15 | 15/15 | 15/15 |
| `acceptance/hermes-relay.test.ts` | 8/8 | 8/8 | 8/8 |
| `acceptance/boot-relays.test.ts` | 3/3 | 3/3 | 3/3 |
| `acceptance/run-acceptance.test.ts` | 14/14 | 14/14 | 14/14 |
| `acceptance/fake-cli-environment.test.ts` | 6/6 | 6/6 | 6/6 |
| `tests/architecture/s7-authorization-contract.test.ts` | 5/6 | 5/6 | 5/6 |
| `tests/unit/t15-eval-harness.test.ts` | 50/50 | 50/50 | 50/50 |

The one red is the declared pre-existing `:98`:

```
 FAIL  tests/architecture/s7-authorization-contract.test.ts > Accounts S7 ownership architecture > hardens every immutable memory scope carrier and derives it from run ownership
AssertionError: expected -1 to be greater than -1
 ❯ tests/architecture/s7-authorization-contract.test.ts:98:26
```

It reads `packages/memory/src/index.ts` (`:81`). `git diff --name-only 9c439935..HEAD`
lists only the eleven `acceptance/` files of this task, so that file is untouched by this
branch — the red cannot be mine. (Not independently re-measured at the base; see
UNVERIFIED.)

**Typechecks, both clean at the tip:**

```
./node_modules/.bin/tsc --noEmit                            → exit 0
./node_modules/.bin/tsc --noEmit -p acceptance/tsconfig.json → exit 0
```

**The O1 grep, exactly as the packet writes it:**

```
$ grep -rn '/Users/\|/Applications/\|homedir()' acceptance --include='*.ts' \
    | grep -v test-fixtures | grep -v '\.test\.'
acceptance/hermes-relay.ts:53:  const directory = join(homedir(),".hermes");
```

**One line, and it is NOT a binary path** — it is the Z.AI credential directory read by
`readGlmCredential`, already deduced at runtime from the current user's home, with uid
and mode custody checks around it. It was never a compiled-in path and this task did not
create it. See packet defect PD-3. Dropping the over-matching `homedir()` clause:

```
$ grep -rn '/Users/\|/Applications/' acceptance --include='*.ts' \
    | grep -v test-fixtures | grep -v '\.test\.'
(no output)
```

`grep -rn '\bCLAUDE_BINARY\b\|\bGROK_BINARY\b\|\bCODEX_BINARY\b\|\bHERMES_BINARY\b' --include='*.ts' .`
(excluding `node_modules`) is likewise empty: no stale constant survives anywhere in the
repo's TypeScript.

---

## 5. Commits

| Hash | Subject | Files |
| --- | --- | --- |
| `ea69a7ba` | `feat(acceptance): deduce each maker CLI by name on PATH, never a compiled-in path` | `relay-core.{ts,test.ts}`, `claude-relay.{ts,test.ts}`, `grok-relay.{ts,test.ts}`, `model-shim.{ts,test.ts}` |
| `3770176d` | `feat(acceptance): give the hermes relay the same deduced binary resolver` | `hermes-relay.{ts,test.ts}` |
| `61432468` | `docs(acceptance): state how a maker binary is found, in order` | `acceptance/README.md` |

All three carry `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
Only files under `acceptance/` were staged. The orchestrator's uncommitted edits under
`.hermes/**` and `docs/**` were left exactly as found and never staged, reverted or read
as instructions.

---

## 6. Findings and packet defects

**PD-1 — `acceptance/README.md` had nothing to modify.** The packet says "Modify
`acceptance/README.md` — wherever it describes how a maker binary is found (grep
`ACCEPTANCE_CLAUDE_BINARY`, `compiled-in`)". Measured before the change,
`grep -n 'ACCEPTANCE_CLAUDE_BINARY\|compiled-in\|binary' acceptance/README.md` returned
nothing at all: the README never described binary resolution. O4 therefore required
*adding* the section, not editing one. Done at `acceptance/README.md:28-59`.

**PD-2 — "the same four `resolve*Binary()` names" — only three existed.**
`resolveClaudeBinary`, `resolveGrokBinary`, `resolveCodexBinary`. Hermes had none:
`acceptance/hermes-relay.ts:22` computed `join(homedir(),".local","bin","hermes")` once
at module load and `:140` handed the resulting `CommandSpec` to
`resolveTestGuardedCommand` **eagerly**. O1 says "for every maker", so I added
`resolveHermesBinary` (`hermes-relay.ts:34`), the key `ACCEPTANCE_HERMES_BINARY` and the
code `HERMES_CLI_BINARY_UNRESOLVED`, and converted the default command to a thunk
(`hermes-relay.ts:162`). Without the thunk, a host with no `hermes` — or a blank key —
would pre-empt `resolveTestGuardedCommand`'s authority over the test seam; M21 is that
regression arm.

**PD-3 — the O1 grep is not a consistent test of its own outcome.** Its `homedir()`
clause over-matches `acceptance/hermes-relay.ts:53`, a credential directory that is not a
binary path and is already deduced. It simultaneously *misses* the semantically identical
`join(userInfo().homedir, ".codex")` at `acceptance/model-shim.ts:147` (the codex sessions
root), which is not a binary path either. I did **not** rewrite line 53 to
`userInfo().homedir` to make the grep pass — that would be dodging the check while
changing nothing — so the grep as literally written returns one line. Proposed
replacement, which is empty at this tip:
`grep -rn '/Users/\|/Applications/' acceptance --include='*.ts' | grep -v test-fixtures | grep -v '\.test\.'`.

**F-1 — the codex "no live provider call" rule now binds all four makers.**
`acceptance/model-shim.test.ts:304-317` justified the rule by codex alone having a default
that resolves on developer machines. After discovery by name that is true of *every*
maker: any test that reaches the default command path on a machine with the CLI installed
makes a LIVE call. I widened the note and re-checked each arm — every D10 test either
hands the resolver an environment it built itself, or keeps `testOnlyCommand` supplied so
the thunk is never forced. The two spawn-level arms (`claude-relay.test.ts:452`,
`grok-relay.test.ts:369`) set the maker's key to a fixture before taking the default path;
their comments now say that the fake model id is the proof the key, not PATH, decided.

**F-2 — `PROGRAM_HEADERS` is macOS-only, by the packet's own list.** O2 names `#!`,
Mach-O and universal magics; ELF (`7f 45 4c 46`) is not among them and I did not add it
unasked. On a Linux host every maker would refuse `NOT_A_PROGRAM`. No test depends on the
host (the fixtures write their own headers), and the ceremony runs on this Mac — but if
the harness is ever run on Linux, the set needs ELF. Flagged rather than widened.

**F-3 — a refusal path containing a space would widen the `MAKER ABSENT` line.**
`acceptance/absent-makers.ts:65` emits `MAKER ABSENT ${maker} ${failureCode}`; with a code
of `<CODE>:<REASON>:<path>` the line stays four whitespace-separated tokens for ordinary
paths but not for a path with a space in it. I checked every reader —
`acceptance/run-acceptance.test.ts:93-96,132-135,154,168`,
`acceptance/boot-relays.test.ts:58-59,83-84`,
`.hermes/…/tools/closing-run.sh` (captures verbatim) — none splits the line into fields,
so nothing breaks today. Noting it because a future parser would.

**F-4 — no existing reader pinned the message shape, so none needed repinning.**
`acceptance/absent-makers.ts:62-66` passes `start.reason.message` through untouched and
`acceptance/discovery.ts:108` records `error.message` as `failureCode`. Every
`run-acceptance.test.ts:66-170` assertion constructs its own `new Error("…_CLI_FAILED")`,
so none of them observes a binary-resolution message. The one shape that *is* pinned by an
existing reader is the bare code for a blank key, and that is unchanged.

---

## 7. UNVERIFIED

- **That the shipped resolver finds and admits THIS machine's real CLIs.** By instruction,
  no real `claude`, `codex`, `grok` or `hermes` was executed, and no test consults the real
  `PATH`. Every test builds its own PATH out of temporary directories. Whether
  `/opt/homebrew/bin` or `~/.local/bin` is reachable at ceremony time, and what the
  resolver would say about the binaries there, is untested here.
- **The two 2026-09-17 host files themselves.** `~/.local/bin/claude` and
  `/opt/homebrew/bin/codex` were never opened by this seat. The `EMPTY` and
  `NOT_A_PROGRAM` arms reproduce the *shape* the packet describes (a 0-byte file; four
  lines of plain text with an executable bit), not the actual files.
- **End-to-end `MAKER ABSENT` output.** `run-acceptance.ts` was never run. That a
  refusal reaches the ceremony's stdout as
  `MAKER ABSENT Anthropic CLAUDE_CLI_BINARY_UNRESOLVED:NOT_ON_PATH:claude` is proven only
  by composition: the resolver's message (unit-tested) plus `absent-makers.ts:62-66`
  (unit-tested to pass an `Error.message` through verbatim).
- **Non-macOS hosts.** See F-2.
- **That `tests/architecture/s7-authorization-contract.test.ts:98` was red before this
  branch.** Not re-measured at `9c439935`. Evidence that it is not mine is indirect:
  the packet declares it pre-existing, the assertion reads `packages/memory/src/index.ts`,
  and that file is absent from `git diff --name-only 9c439935..HEAD`.
- **The two intermediate commits were not individually checked out and re-run.** Only the
  tip `61432468` was gated. `ea69a7ba` is argued green (it leaves `hermes-relay.ts` and
  `hermes-relay.test.ts` both at their original revisions, so the hermes suite is
  unchanged) and `3770176d` adds source and test together — but that is reasoning, not a
  measurement.
- **`acceptance/*.test.ts` files outside the O5 list** that import these modules were not
  swept; the gate list is the packet's.

---

## 8. Self-report

**What cost tokens.** The reading floor: five source modules plus five test suites, the
two message readers (`absent-makers.ts`, `discovery.ts`) and the 265-line README, before
a line was written — roughly a third of the session, and correctly spent, because two of
the decisions that mattered (keep the blank-key code bare; the `MAKER ABSENT` line has no
field parser) came straight out of it. The mutant sweep was the second cost: 21 mutants ×
a vitest run each. Batching them through one driver script that snapshots, patches, runs
and restores in a `finally` was much cheaper than 21 manual edit/run/revert cycles, and
safer — nothing could be left mutated by a mid-run interruption.

**What I nearly got wrong.**

1. *Making the grep pass instead of making the code right.* The obvious move on PD-3 was
   to rewrite `hermes-relay.ts:53` to `userInfo().homedir` — one token, grep clean,
   behaviour identical. I stopped because the only thing that change accomplishes is
   defeating the check, and `model-shim.ts:147` already does the same thing in the form
   the grep cannot see. Reporting the residual line honestly is the point of the gate.
2. *Leaving the hermes command eager.* I nearly added `resolveHermesBinary` and stopped
   there. `hermes-relay.ts:140` passed a `CommandSpec` **value**, not a thunk, so the
   moment the resolver could throw, a machine without `hermes` would have broken the
   hermes test suite's own seam — which every one of its tests relies on. The existing doc
   comment at `relay-core.ts:108-116` states exactly this rule for the other three makers;
   I caught it by reading that comment rather than by a failing test, then wrote M21 so it
   cannot come back.
3. *A test that would have made a live provider call.* My first sketch of the claude
   "discovers by name" arm was going to exercise `startClaudeRelay` with no key set, to
   prove discovery end to end. On this machine that resolves the **real** `claude` and
   calls it. I cut it to resolution-only and widened the standing note at
   `model-shim.test.ts:304` so the trap is written down for the next seat (F-1).

**Dead ends.** Two. First, a source-level pin that `resolve*Binary` "goes through the one
resolver" by reading each maker module and grepping for `resolveConfiguredBinary` — I
dropped it for behavioural pins (discovery + refusal, per maker), which survive a rename
and actually test the wiring. Second, an attempt to drive one file edit through a
`python3` heredoc was refused by the worktree guard as "too complex to verify"; I moved
to the Edit tool and to scripts written into the scratchpad, which the guard is happy
with. Worth knowing: the guard's complexity check is not limited to commands that mention
git.

**Where the brief was unclear.**

- *"first match wins — the rule `command -v` applies"* (O1) against *"whatever (1) or (3)
  resolved must … otherwise a typed refusal"* (O2). A literal `command -v` skips a
  non-executable entry and searches on, which would make `NOT_EXECUTABLE` unreachable from
  route (3) and would silently step past exactly the corrupted launcher this ticket is
  about. I read "first match wins" as fixing the ORDER and O2 as fixing what happens to
  the match, and implemented the loud reading. Documented in the source, in the README and
  in §1 above — but it deserves an explicit ruling.
- *What `<path>` should be for `NOT_ON_PATH`*, where no path was resolved. I put the NAME
  searched for, so the message is still three fields and still tells the operator what to
  install.
- *Whether a present-but-blank key should gain a `:REASON:`.* O1(2) says "as today", which
  I read as the bare code, and the existing readers agree. The anchored-regex arm in
  `relay-core.test.ts` now pins that, so it can no longer drift by accident.
- *"the same four `resolve*Binary()` names"* — there were three (PD-2). I treated the
  fourth as in scope because O1 says "for every maker" and the packet's own Files list
  names `hermes-relay.ts:22,140`.

---

# Fix round 1

SKILLS LOADED (this round): superpowers:test-driven-development, superpowers:verification-before-completion

Blind review verdict: spec compliance MET (O1–O5), code quality CHANGES REQUESTED
(1 Critical, 4 Important, 8 Minor). Review at
`.superpowers/sdd/2026-09-17-relay-binaries-deduced/task-1-review.md`.

New tip `fbb8cde5`, three commits on top of `61432468`. Nothing outside
`acceptance/` was touched; `apps/**` stays untouched even where I-5 names it.
Still no maker binary executed, still no candidate routed through a shell, still
no test resolved against the real `PATH` in a way that could start anything —
the one test that touches `process.env.PATH` (I-5) points it at an EMPTY
temporary directory and asserts a refusal.

All line numbers below are as of `fbb8cde5`. Where a comment used to cite a line,
it now cites the symbol, per M-6.

## Per finding

| Finding | What changed | Where |
| --- | --- | --- |
| **C-1** (Critical) | The string admitted is now always ABSOLUTE and is the string spawned. A relative key value is resolved against the process cwd at resolution time (`resolve(named)`); a relative PATH entry is SKIPPED, exactly as the empty field already was, so the code honours its own "what the process is sitting in is not a deduction" comment for `.` and for any non-absolute entry. | `relay-core.ts` — `resolveConfiguredBinary` (`:310-346`, the `resolve(named)` branch and its doc block), `discoverOnPath` (`:256-278`, `if (!isAbsolute(directory)) continue;`) |
| **I-2** | `[0x7f, 0x45, 0x4c, 0x46]` added to `PROGRAM_HEADERS`, with the reason stated where it lives: this harness runs on more than one computer, and refusing every Linux binary while saying `NOT_A_PROGRAM` is the most misleading refusal available. | `relay-core.ts:158-170` |
| **I-3** | Three new arms for a LIVE symlink whose target is the broken thing: → 0-byte target ⇒ `EMPTY`, → text target ⇒ `NOT_A_PROGRAM`, → good target ⇒ admitted. The dangling case (→ nothing ⇒ `NOT_FOUND`) was already pinned and stays. **The LINK is kept as the resolved path**, not the target: it is the name the operator installed and the argv[0] the CLI will see, and resolving through to `…/versions/<v>` would spawn a path nobody chose and change what the relay reports it ran — while the target's own defects are already caught, because the gate follows the link. Stated at `admitProgram` and in the test. | `relay-core.test.ts:493-534`; rationale at `relay-core.ts:199-212` |
| **I-4** | The dated record no longer names a constant that did not exist on that date, and no longer reads as if discovery-by-name had been verified on this host. It now says: "2026-08-10, claude 2.1.221 — at the compiled-in absolute path this module carried until 2026-09-17; discovery by name did not exist on that date and this record makes no claim about it". | `claude-relay.ts:18-21` |
| **I-5** | The hermes START path re-throws a resolver refusal as `CliRelayFailure("FAILED", <typed message>)`, so `probeProvider` in `discovery.ts` — which re-throws anything that is not a `CliRelayFailure` instead of recording an ABSENT probe — still records ABSENT, and `startSupportModelRelay` in the dev auth stack still degrades as it did before this task. The resolver itself still throws a plain `Error` to direct callers, which the maker tests pin. Nothing in `apps/**` was edited. | `hermes-relay.ts:172-195`; test `hermes-relay.test.ts:200-232` |
| **M-1** | `UNREADABLE` is now its own reason (`readProgramHeader` returns `Buffer \| null`; `null` ⇒ `UNREADABLE`). A mode-0111 script passes `access(X_OK)` and then refuses to `open`: it is a perfectly good program, and calling it corrupt sent the operator hunting for damage that is not there. The test is skipped as root, for whom `open(2)` succeeds regardless of the mode. | `relay-core.ts:138-141`, `:176-196`, `:213-241`; test `relay-core.test.ts:570-585` |
| **M-2** | A directory carrying the maker's name has a pinned refusal (`NOT_A_PROGRAM`) — the case `command -v` would have skipped. | `relay-core.test.ts:560-567` |
| **M-3** | The no-shell pin is now recursive and file-kind-agnostic (`readdir(root, { recursive: true, withFileTypes: true })`), excluding only `*.test.ts`, and asserts that it reached `test-fixtures/evaluator-double.ts` and `test-fixtures/fake-claude-cli.mjs` so the coverage cannot silently narrow again. | `relay-core.test.ts:713-742` |
| **M-4** | Both comments now say "the same SHAPE as" and state that neither host file was opened. | `relay-core.test.ts:416-423`, `model-shim.test.ts:345-348` |
| **M-5** | The deviation LEADS in both places: "THE FIRST PATH ENTRY THAT EXISTS UNDER THE NAME IS THE MATCH… a broken entry is never stepped over. Unlike `command -v`, which skips a non-executable entry and keeps searching…". Both now carry the reviewer's stronger reason (lineage, not ergonomics) and name the cost. | `relay-core.ts:256-275`; `README.md:59-69` |
| **M-6** | The two comments citing `relay-core.ts:108-116` now cite `resolveTestGuardedCommand` by name. | `hermes-relay.ts:172-175`, `hermes-relay.test.ts:188-193` |
| **M-7** | Deferred, as ruled. The four near-identical maker blocks stand. | — |
| **M-8** | Corrected below. | — |

**M-8 correction.** Round 0's report said `spawn(command.binary, …)` is at
`acceptance/relay-core.ts:283`. It was at `:289` at that tip (the reviewer is
right), and it is at **`:337`** at `fbb8cde5`. The brief's own anchor (`:167`) was
from the base. The line moves with every edit above it, which is exactly M-6's
point; the stable anchor is `invokeCli`.

**O1 grep — corrected spelling adopted.** The standing check is now:

```
$ grep -rn '/Users/\|/Applications/' acceptance --include='*.ts' \
    | grep -v test-fixtures | grep -v '\.test\.'
(no output)
```

The `homedir()` clause is dropped: a home-derived credential *directory* is a
deduction and is allowed. The README does not quote the grep, so no change was
needed there.

## RED frames, verbatim (before the round-1 fix)

```
 Test Files  2 failed (2)
      Tests  7 failed | 32 passed (39)
```

```
 FAIL  acceptance/hermes-relay.test.ts > D10 Hermes support relay binary resolution > refuses the START path as a CliRelayFailure carrying the typed resolver message
AssertionError: expected Error: HERMES_CLI_BINARY_UNRESOLVED:NOT_O… to be an instance of CliRelayFailure
 ❯ acceptance/hermes-relay.test.ts:226:25
    224|       }).then(() => null,(error: unknown) => error);
    225|
    226|       expect(rejection).toBeInstanceOf(CliRelayFailure);
       |                         ^
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/7]⎯

 FAIL  acceptance/relay-core.test.ts > D10 maker CLI binary resolution > says the header could not be READ, not that the file is not a program
AssertionError: expected [Function] to throw error including 'FIXTURE_CLI_BINARY_UNRESOLVED:UNREADA…' but got 'FIXTURE_CLI_BINARY_UNRESOLVED:NOT_A_P…'

Expected: "FIXTURE_CLI_BINARY_UNRESOLVED:UNREADABLE:/var/folders/g1/by5zh4k97q51qjs8mg6nnj180000gn/T/relay-path-mwC1hN/fixture-cli"
Received: "FIXTURE_CLI_BINARY_UNRESOLVED:NOT_A_PROGRAM:/var/folders/g1/by5zh4k97q51qjs8mg6nnj180000gn/T/relay-path-mwC1hN/fixture-cli"
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/7]⎯

 FAIL  acceptance/relay-core.test.ts > D10 maker CLI binary resolution > accepts a Mach-O, universal or ELF executable, not only a shebang script
Error: FIXTURE_CLI_BINARY_UNRESOLVED:NOT_A_PROGRAM:/var/folders/g1/by5zh4k97q51qjs8mg6nnj180000gn/T/relay-path-YZzETz/fixture-cli
 ❯ refuse acceptance/relay-core.ts:191:11
 ❯ admitProgram acceptance/relay-core.ts:206:39
 ❯ resolveConfiguredBinary acceptance/relay-core.ts:270:12
 ❯ acceptance/relay-core.test.ts:608:14
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/7]⎯
```

The two C-1 probes, red before the fix — the reviewer's exact cases:

```
 FAIL  acceptance/relay-core.test.ts > D10 maker CLI binary resolution > resolves a relative value in the operator's key to an absolute path
AssertionError: expected '../../../../../../../../var/folders/g…' to be '/var/folders/g1/by5zh4k97q51qjs8mg6nn…' // Object.is equality

Expected: "/var/folders/g1/by5zh4k97q51qjs8mg6nnj180000gn/T/relay-path-pCvQK3/fixture-cli"
Received: "../../../../../../../../var/folders/g1/by5zh4k97q51qjs8mg6nnj180000gn/T/relay-path-pCvQK3/fixture-cli"

 ❯ acceptance/relay-core.test.ts:683:80
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/7]⎯

 FAIL  acceptance/relay-core.test.ts > D10 maker CLI binary resolution > names the ABSOLUTE path when it refuses a relative value in the key
AssertionError: expected [Function] to throw error including 'FIXTURE_CLI_BINARY_UNRESOLVED:NOT_FOU…' but got 'FIXTURE_CLI_BINARY_UNRESOLVED:NOT_FOU…'

Expected: "FIXTURE_CLI_BINARY_UNRESOLVED:NOT_FOUND:/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine/probe-cli"
Received: "FIXTURE_CLI_BINARY_UNRESOLVED:NOT_FOUND:./probe-cli"

 ❯ acceptance/relay-core.test.ts:690:8
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/7]⎯

 FAIL  acceptance/relay-core.test.ts > D10 maker CLI binary resolution > skips a relative PATH entry exactly as it skips an empty one
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ acceptance/relay-core.test.ts:701:8
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/7]⎯

 FAIL  acceptance/relay-core.test.ts > D10 every maker resolves to an ABSOLUTE path > from PATH discovery and from a relative key alike, for all four
AssertionError: claude via a relative key: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ acceptance/relay-core.test.ts:775:70
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/7]⎯
```

The I-3 symlink arms, the M-2 directory arm and the M-3 recursive scan were GREEN
from the first run: the reviewer measured the shipped behaviour as already
correct on all three, so they are coverage, not behaviour change. Each is refuted
by a mutant below rather than by a RED-first frame — mutant E is the reviewer's
own, and it now takes three arms instead of one.

## Mutant matrix (round 1)

Driver `scratchpad/mutate2.py`; same contract as round 0 (snapshot → patch → run →
restore in a `finally`). Afterwards `git status --short -- acceptance` is clean
and a residue grep for every mutant literal returns nothing.

| # | Assertion it refutes | Mutant | Red at site | Restored |
| --- | --- | --- | --- | --- |
| **E** (reviewer's) | the gate FOLLOWS symlinks | `statSync` → `lstatSync` in `admitProgram` | **3 failed \| 27 passed (30)**: dangling-symlink `NOT_FOUND`, live-symlink-into-EMPTY, live-symlink-admitted-as-LINK. Was 1/95 before this round. | ✔ |
| F | a relative KEY value is resolved to an absolute path | `resolve(named)` → `named` | 3/30: relative-key-to-absolute, absolute-path-in-refusal, all-four-makers-absolute | ✔ |
| G | a relative PATH entry is SKIPPED | `!isAbsolute(directory)` → `directory === ""` | 1/30: "skips a relative PATH entry exactly as it skips an empty one" | ✔ |
| H | ELF is a program header | drop `[0x7f, 0x45, 0x4c, 0x46]` | 1/30: "accepts a Mach-O, universal or ELF executable…" | ✔ |
| I | an unreadable header is `UNREADABLE`, not `NOT_A_PROGRAM` | `readProgramHeader` catch returns `Buffer.alloc(0)` instead of `null` | 1/30: "says the header could not be READ…" | ✔ |
| J | a non-regular file is refused before the header is read | delete the `!metadata.isFile()` branch | 1/30: "refuses a DIRECTORY carrying the maker's name…" | ✔ |
| K | the no-shell scan reaches `test-fixtures/` | insert a forbidden literal into `test-fixtures/evaluator-double.ts` | 1/30: "never routes a candidate binary through a shell anywhere in acceptance/" | ✔ |
| L | the hermes START path refuses as a `CliRelayFailure` | re-throw the resolver error unwrapped | 1/9: "refuses the START path as a CliRelayFailure carrying the typed resolver message" | ✔ |

## Gate at `fbb8cde5`, three runs each

| Suite | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| `acceptance/relay-core.test.ts` | 30/30 | 30/30 | 30/30 |
| `acceptance/claude-relay.test.ts` | 27/27 | 27/27 | 27/27 |
| `acceptance/grok-relay.test.ts` | 24/24 | 24/24 | 24/24 |
| `acceptance/model-shim.test.ts` | 15/15 | 15/15 | 15/15 |
| `acceptance/hermes-relay.test.ts` | 9/9 | 9/9 | 9/9 |
| `acceptance/boot-relays.test.ts` | 3/3 | 3/3 | 3/3 |
| `acceptance/run-acceptance.test.ts` | 14/14 | 14/14 | 14/14 |
| `acceptance/fake-cli-environment.test.ts` | 6/6 | 6/6 | 6/6 |
| `tests/architecture/s7-authorization-contract.test.ts` | 5/6 | 5/6 | 5/6 |
| `tests/unit/t15-eval-harness.test.ts` | 50/50 | 50/50 | 50/50 |

The single red is the declared pre-existing `:98`, unchanged and unrelated (it
reads `packages/memory/src/index.ts`, absent from
`git diff --name-only 9c439935..fbb8cde5`). Typechecks at the tip:

```
./node_modules/.bin/tsc --noEmit                             → exit 0
./node_modules/.bin/tsc --noEmit -p acceptance/tsconfig.json → exit 0
```

## Commits (round 1)

| Hash | Subject | Findings |
| --- | --- | --- |
| `9880e547` | `fix(acceptance): admit only an absolute path, so the file checked is the file spawned` | C-1, I-2, I-3, M-1, M-2, M-3, M-5 |
| `593e4c87` | `fix(acceptance): keep the hermes start path failing as a CliRelayFailure` | I-5, M-6 |
| `fbb8cde5` | `docs(acceptance): stop a dated record and two comments from overclaiming` | I-4, M-4, README |

All carry `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Still open after this round

- **I-5 is closed only on the `acceptance/` side.** The refusal now arrives at
  `apps/runner/src/dev-auth-stack.ts` `startSupportModelRelay` as a
  `CliRelayFailure`, which is the class that call site saw before this task, so
  nothing there needs to change. But that path is still exercised by no suite in
  the gate list, and `apps/**` is outside the allowed set, so the dev-stack
  startup remains **read, not run**. The behaviour is pinned at the
  `startHermesSupportRelay` boundary instead.
- **The other three makers were deliberately NOT wrapped.** Their start paths are
  collected by `Promise.allSettled` and handed to `announceAbsentMakers`, which
  accepts any `Error` and prints its message — so a plain `Error` degrades
  correctly there. Wrapping them would have been change without a measured
  caller. If a future caller ever feeds a claude/grok/codex *start* into
  `probeProvider`, the same I-5 argument applies to it.
- **M-7 deferred**, as ruled.
- Everything in round 0's UNVERIFIED section still stands, except that the ELF
  half of F-2 is now fixed. In particular: no maker binary has been resolved
  against this machine's real `PATH`, and the operator-run, resolve-only check
  the reviewer asks for before the ceremony has not been performed.
