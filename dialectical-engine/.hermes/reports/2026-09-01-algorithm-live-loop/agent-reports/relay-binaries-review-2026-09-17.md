# Task 1 — Blind review: "Discovery by name, and a resolved path that must run"

SKILLS LOADED: superpowers:verification-before-completion

Reviewer did not write this code. Worktree
`/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16/dialectical-engine`,
tip `61432468`, base `9c439935`. Read-only review: every mutant below was
restored byte-identically (sha256 verified) and `git diff --stat -- acceptance`
is empty at the end.

**No `claude`, `codex`, `grok` or `hermes` binary was executed at any point, and
no real PATH was resolved in a way that could start anything.** Every behavioural
claim below is proven by the resolver's return value or thrown code against fake
files I created in `/var/folders/.../T/probe-path-*` (temporary directories,
deleted afterwards). The probe driver is scratch-only:
`/private/tmp/claude-501/-Users-stefannour-DebateAIRO/45ab9500-0991-4dbd-89ec-f04cc3082e67/scratchpad/probe.ts`.

---

## Verdicts

| | Verdict |
| --- | --- |
| **Spec compliance (O1–O5)** | ✅ **MET** — all five outcomes, with one documented discrepancy against the literal wording of O1's grep, which is a brief defect and not an implementation defect. |
| **Code quality** | ❌ **CHANGES REQUESTED** — 1 Critical, 4 Important, 8 Minor. |

Findings: **1 Critical, 4 Important, 8 Minor.**

---

## 1. Spec compliance

### O1 — order of resolution, no compiled-in path ✅

`acceptance/relay-core.ts:262-278` implements exactly the stated order.

| Arm | Code | Measured |
| --- | --- | --- |
| key present & non-blank | `:268`, `:272`, `:275` — `/[\\/]/u.test(named) ? named : discoverOnPath(named,…)` | key with a path wins over PATH; bare name in the key is looked up on PATH (`relay-core.test.ts:535`, `:547`, all four maker suites) |
| key present & blank | `:273` — `throw new Error(unresolvedCode)`, **bare code, nothing appended** | probe: `blank key, good binary on PATH → THROW -> PROBE_CLI_BINARY_UNRESOLVED` (anchored `/^CODE$/u` at `relay-core.test.ts:568`) |
| key absent | `:269-270` → `discoverOnPath(binaryName, …, source)` over `source.PATH` split on `path.delimiter`, first match wins (`:225-235`) | probe + `relay-core.test.ts:451`, `:458` |

The env `source` is honoured throughout; `process.env` is never read behind the
caller's back inside the resolver (only as the parameter default).

**The grep.** Run exactly as the orchestrator wrote it:

```
$ grep -rn '/Users/\|/Applications/' acceptance --include='*.ts' | grep -v test-fixtures | grep -v '\.test\.'
(no output — exit 1)
```

Run exactly as the *brief* (O1) writes it, with the `homedir()` clause:

```
$ grep -rn '/Users/\|/Applications/\|homedir()' acceptance --include='*.ts' | grep -v test-fixtures | grep -v '\.test\.'
acceptance/hermes-relay.ts:53:  const directory = join(homedir(),".hermes");
```

**Judgement on `hermes-relay.ts:53` — the implementer is right and I would not
change the line.** It is the Z.AI credential *directory* (`readGlmCredential`,
`:52-80`), not a binary path, so O2's admission rule has no bearing on it. The
owner's rule is "if it needs to be set to something local, it needs to be
deduced first, never set in stone" — `join(homedir(), ".hermes")` **is** the
deduction: it names no user, resolves per-machine, and is wrapped in uid +
mode-0700 + no-symlink custody checks at `:54-60`. It predates this task. The
decisive evidence that the grep tests its own spelling rather than the rule is
`acceptance/model-shim.ts:146` — `join(userInfo().homedir, ".codex")`, exactly
the same construct for the codex sessions root, which the brief's grep does
**not** match. Rewriting `:53` to `userInfo().homedir` to make the grep pass
would have been pure grep-dodging, and the implementer explicitly refused to do
it (PD-3). That refusal was the correct call. The remedy belongs to the brief:
adopt the orchestrator's spelling as the standing check.

Residue check, repo-wide TypeScript: `CLAUDE_BINARY`, `GROK_BINARY`,
`CODEX_BINARY`, `HERMES_BINARY` survive **only** in historical `.md` records
under `docs/` and `.hermes/`. No `.ts` file carries them. Verified.

### O2 — admission gate ✅

`acceptance/relay-core.ts:189-209`, `admitProgram`, in order: `statSync` (follows
symlinks) → `isFile()` → `size === 0` → `accessSync(X_OK)` → `hasProgramHeader`.
Every refusal is `${unresolvedCode}:${reason}:${path}` with the path in the
message; the five reasons are distinct and exported as `BINARY_REFUSAL_REASONS`
(`:138-141`).

Measured against fake files (probe output verbatim):

| Case | Result |
| --- | --- |
| symlink → 0-byte target (**the real `~/.local/bin/claude` shape**) | `…:EMPTY:<link path>` |
| symlink → plain text with exec bit (**the real `codex` shape**) | `…:NOT_A_PROGRAM:<link path>` |
| symlink → good shebang program | **OK**, returns the *link* path (correct: argv[0] identity preserved) |
| dangling symlink | `…:NOT_FOUND:<path>` |
| symlink loop (ELOOP) | `…:NOT_FOUND:<path>` |
| directory named like the binary | `…:NOT_A_PROGRAM:<path>` |
| 0-byte regular file | `…:EMPTY:<path>` |
| mode 0644 | `…:NOT_EXECUTABLE:<path>` |
| 1-byte `#` | `…:NOT_A_PROGRAM:<path>` |
| ELF binary | `…:NOT_A_PROGRAM:<path>` ← see I-1 |

**Reads only the first bytes.** `hasProgramHeader` (`:165-180`) is
`openSync(path,"r")` → `readSync(fd, buf, 0, 4, 0)` → `closeSync`. Four bytes at
offset 0, descriptor closed in `finally`. A 250 MB Mach-O is not read past byte 4.

**Executable check is per current user.** `accessSync(path, constants.X_OK)` at
`:202` — the real `access(2)`, not a mode-bit guess.

**Nothing can execute a candidate.** The resolver's entire syscall surface is
`statSync`/`lstatSync`/`accessSync`/`openSync`/`readSync`/`closeSync`. There is
exactly **one** `spawn` in all of `acceptance/` (`relay-core.ts:289`), it is not
reached from the resolver, and it carries no `shell` option. Grep for
`shell: true` / `sh -c` / `execSync` / `spawnSync` over `acceptance/**/*.ts`
returns only `#!/bin/sh` strings inside test *fixtures* and the forbidden-pattern
list of the pin test itself. `acceptance/fake-cli-environment.test.ts:107` uses
`execFile` (no shell) and is a pre-existing test file.

**Readers still work.** `acceptance/absent-makers.ts:62-66` passes
`start.reason.message` through verbatim for any `Error` and emits
`MAKER ABSENT ${maker} ${failureCode}` — the new `<CODE>:<REASON>:<path>` shape
survives unchanged. `run-acceptance.ts:192-218` collects relay starts with
`Promise.allSettled` and feeds them to `announceAbsentMakers`, so a resolver
refusal at relay-start time reaches stdout. I read `run-acceptance.test.ts:66-170`
line by line: **every** assertion constructs its own `new Error("…_CLI_FAILED")`,
so no existing pin observes a binary-resolution message and none needed
repinning. The implementer's F-4 is correct.

### O3 — tests over a constructed PATH ✅

All nine required cases present in `acceptance/relay-core.test.ts:424-620`, each
over `mkdtemp` directories on a hand-built `PATH`; the real `PATH` is never
consulted. Discovery `:451`; PATH order, both directions `:458`; `NOT_ON_PATH`
incl. no-PATH-at-all `:472`; dangling symlink `:481`; empty `:490`;
non-executable `:498`; not-a-program `:506`; first-bytes-only `:514`; Mach-O /
universal `:522`; key wins `:535`; bare name in key `:547`; key path held to the
same gate `:557`; blank key anchored `:568`; own key only `:580`; resolved
without running `:590`; no-shell pin `:599`.

"All four relays go through the one resolver" is pinned *behaviourally* rather
than in one place — and mutant B below proves it: deleting the shared
`hasProgramHeader` check turns all four makers' "corrupted launcher" arms red
simultaneously. That satisfies O3's "behavioural pin, your choice".

### O4 — README ✅

`acceptance/README.md:48-79`, new section "Which CLI a maker relay runs (D10)".
States key → PATH by name → refusal, in that order, in plain words; names all
four env keys; states the blank-key rule; states the admission check and all
five reasons; states the `MAKER ABSENT` line; states the no-interpreter rule and
the two 2026-09-17 failures. **No mention of a compiled-in default anywhere in
the file** (grep `compiled-in` → no hits). Pre-change the README said nothing
about binary resolution at all, so PD-1 is correct: O4 required adding, not
editing.

### O5 — gate ✅ (re-measured by me, single run each; see §4)

---

## 2. Quality findings

### CRITICAL

**C-1 — a non-absolute resolved path is admitted here and re-resolved somewhere
else at spawn, so the file that runs need not be the file that was admitted.**
`acceptance/relay-core.ts:227` (`join(directory, binaryName)`), `:275` (`named`
returned verbatim), `:207` (`return path`), against `:289`
(`spawn(command.binary, …, { cwd: scratchDirectory, env })`).

Nothing calls `path.resolve()`. Measured:

```
relative path in the key ('./probe-cli')   | OK -> ./probe-cli
relative PATH entry ('.')                  | OK -> probe-cli
```

`path.join(".", "claude")` collapses to the **bare** string `claude`.

Failure scenario. An operator sets `ACCEPTANCE_CLAUDE_BINARY=./bin/claude`, or
simply has `.` (or any relative entry) on `PATH`. `admitProgram` opens, stats and
header-checks that file *relative to the harness's own cwd* and admits it.
`invokeCli` then hands the same string to `spawn` with `cwd:` pointed at a fresh
`mkdtemp` scratch directory and a child env carrying `PATH`. libuv `chdir`s into
the scratch directory and calls `execvp`, so (a) a relative path now resolves
against a directory that contains nothing, and (b) a *bare* name re-enters a
PATH search **in the child** — landing on whatever file that search finds, which
was never admitted and may be the very launcher the gate exists to refuse. On
macOS, `execvp` retries a file that returns `ENOEXEC` through `/bin/sh`; that is
precisely the 2026-09-17 fork-bomb path. The gate's guarantee — "whatever was
resolved is a program" — silently does not apply to the thing actually started.

The code's own comment at `:217-218` says an empty PATH field is skipped because
"whatever the process is sitting in is not a deduction", but a literal `.` entry
is *not* skipped, so the stated principle is only half-enforced.

Fix: resolve the candidate to an absolute path before admission (or refuse a
non-absolute one with a typed reason) — one line in `discoverOnPath`/`admitProgram`.
Add the two probe cases above as tests.

*Honest caveat for the ruling:* the precondition is an operator-supplied
relative value or a relative `PATH` entry. It is not reachable with an ordinary
absolute `PATH`. I rank it Critical because the consequence is the exact
catastrophe the task was written to prevent, and the fix is trivial.

### IMPORTANT

**I-2 — ELF is missing from `PROGRAM_HEADERS`, and "runs on multiple computers"
is the owner's own stated reason for this task.** `acceptance/relay-core.ts:155-163`.
Measured: an ELF file (`7f 45 4c 46 …`, mode 0755) is refused
`…:NOT_A_PROGRAM:<path>`. On any Linux host, **every one of the four makers
refuses and the harness cannot start at all** — a hard, total failure whose
typed reason ("not a program") actively misdirects the operator toward a
corrupted file that is in fact fine. The implementer flagged this (F-2) rather
than fixing it, on the grounds that O2's list does not name ELF; but O2 says "the
exact vocabulary is yours", which reads as a floor, not a ceiling, and the
motivating rule is portability. Adding `[0x7f, 0x45, 0x4c, 0x46]` is one array
entry and cannot weaken the macOS behaviour — no shebang, Mach-O or universal
file begins with those bytes. Flagging was honest; fixing was cheaper.

**I-3 — symlink-following inside the gate is effectively unpinned, and the real
launcher shape has no test at all.** `acceptance/relay-core.ts:195`
(`statSync`) vs `acceptance/relay-core.test.ts:481-496`.

The suite covers a *dangling* symlink (`:481`) and a *direct* 0-byte file
(`:490`), but never a **live symlink to a broken target** — which is the shape
the brief itself describes (`~/.local/bin/claude` → a 0-byte
`…/versions/2.1.274`) and the shape essentially every real launcher has
(Homebrew's `/opt/homebrew/bin/*` and npm global bins are symlinks).

Mutant E (mine, not in the report): `statSync` → `lstatSync` at `:195`.
Result: **1 failed | 94 passed (95)**, and the one failure is the dangling-symlink
arm failing for the *wrong reason* (`NOT_A_PROGRAM` instead of `NOT_FOUND`).
So a one-character regression that makes the resolver refuse **every symlinked
launcher on the machine** — i.e. every real install — leaves 94/95 green. I
verified the shipped code is correct here (symlink → 0-byte target ⇒ `EMPTY`;
symlink → good program ⇒ admitted, returning the link path), so this is a
coverage defect, not a behaviour defect. Two tests close it.

**I-4 — `acceptance/claude-relay.ts:18-19` now makes a false empirical claim.**
The diff rewrote "Empirically verified on this machine (2026-08-10, claude
2.1.221 **at CLAUDE_BINARY**)" to "… **resolved by CLAUDE_BINARY_NAME**".
`CLAUDE_BINARY_NAME` did not exist on 2026-08-10; what was verified that day was
the compiled-in path. Worse, the sentence now asserts that discovery-by-name was
empirically verified on this machine — which the implementer's own report lists
under UNVERIFIED ("no test consults the real PATH… whether `/opt/homebrew/bin`
or `~/.local/bin` is reachable at ceremony time… is untested here"). A reader
will take this as evidence the new path was proven on the ceremony host. Restore
the historical wording, or drop the locator and keep only the version and the
observed CLI behaviour.

**I-5 — the hermes resolver's new throw reaches a caller outside `acceptance/`
that no suite in the O5 gate exercises.** `apps/runner/src/dev-auth-stack.ts:474`
(`startSupportModelRelay`) calls `startHermesSupportRelay` with no
`testOnlyCommand`, so the new lazy default thunk runs and `resolveHermesBinary()`
can now throw a plain `Error("HERMES_CLI_BINARY_UNRESOLVED:…")` at *start* time.
Before this change that call site could not fail at start — it always produced a
`CommandSpec` and failed later at spawn as a `CliRelayFailure`. Two consumers care
about that distinction: `acceptance/discovery.ts:101` re-throws anything that is
not a `CliRelayFailure` instead of recording an ABSENT probe, and the dev stack's
own startup path has no test in the gate list. Failure scenario: on a host with
no `hermes` on PATH, `pnpm dev`-style startup now dies with an unhandled typed
error at a point that used to degrade gracefully. Needs either a `CliRelayFailure`
wrapping at the dev-stack boundary or a measurement of that path. (The
implementer's F-4 says "`acceptance/discovery.ts:108` records `error.message` as
`failureCode`" without noting the `instanceof CliRelayFailure` guard immediately
above it — harmless for the relay-start path, but the omission is what hides I-5.)

### MINOR

**M-1 — an execute-only program is refused as `NOT_A_PROGRAM`.**
`acceptance/relay-core.ts:165-180`. Measured: a mode-0111 shebang script passes
`accessSync(X_OK)` at `:202`, then `openSync(path,"r")` throws `EACCES`, the
`catch` at `:172` returns `false`, and the file is refused "not a program". It is
a perfectly good program the user may run. Rare, but the reason sends the
operator hunting for corruption that does not exist. Distinguish "could not read
the header" from "the header is not a program".

**M-2 — the `!metadata.isFile()` branch has no test.** `relay-core.ts:199`.
A directory named `claude` on `PATH` refuses `NOT_A_PROGRAM` (I measured it), but
no assertion pins that, and `command -v` would have skipped it. One line of test.

**M-3 — the no-shell pin is narrower than its own name.**
`acceptance/relay-core.test.ts:599-620` says "anywhere in `acceptance/`" but
`readdir` is non-recursive and `.test.ts` files are filtered out, so
`acceptance/test-fixtures/evaluator-double.ts` is never scanned. Low impact today
(one fixture file), but the test name overstates its coverage.

**M-4 — two comments overclaim provenance, contradicting the report's own
UNVERIFIED section.** `acceptance/model-shim.test.ts:348` — "This IS the
2026-09-17 file: `/opt/homebrew/bin/codex` whose contents had been
overwritten…" — and `acceptance/relay-core.test.ts:421` — "The NOT_A_PROGRAM arm
below IS that file." The report states plainly that neither host file was ever
opened and that the arms reproduce the *shape*, not the file. Say "the same
shape as".

**M-5 — `acceptance/README.md:59-60` states the `command -v` rule and then
contradicts it one sentence later.** "…first match wins, the rule `command -v`
follows. A match that turns out to be broken is REPORTED, not skipped…". The
second sentence is the truth; the first invites an operator to expect
`command -v` semantics. Same shape in the source comment at
`acceptance/relay-core.ts:212` ("The `command -v` rule:"). Lead with the
deviation. See §3(a).

**M-6 — line-number citations in comments are already off by two.**
`acceptance/hermes-relay.ts:161` and `acceptance/hermes-relay.test.ts:191` both
cite "`relay-core.ts:108-116`" for the laziness rule; the doc block is actually
`110-119` (108-109 are a blank line and a closing brace). Cite the symbol
(`resolveTestGuardedCommand`) instead — line numbers rot on the next edit.

**M-7 — four near-identical test blocks.** Each maker suite repeats the same four
arms ("carries no compiled-in path", "discovers X on the PATH it is handed…",
"resolves from key ahead of PATH", "blank key") with only the name and code
varying, plus a private `temporaryDirectory()` helper duplicated in all four
files. Defensible — each suite must pin *its* name and code, and mutants M17–M20
depend on that — but a `describe.each` over a four-row table in one place would
say the same thing once. Not worth churn now; worth knowing before a fifth maker.

**M-8 — report inaccuracy.** The report says `spawn(command.binary, …)` is at
`acceptance/relay-core.ts:283`; it is at `:289`. All the report's other line
citations I checked (`:138-141`, `:155-163`, `:189-214`, `:220-243`, `:262-278`)
are correct.

**Positives worth recording.** The refusal vocabulary is exported and typed
(`BINARY_REFUSAL_REASONS`, `:138-141`) rather than stringly-typed at the throw
sites. `admitProgram` is one gate for both routes, so the key's own path is held
to the same standard as a discovered one (`:557` pins it; mutant M12 refutes it).
The `refuse` closure makes every message structurally identical. The descriptor
is closed in a `finally`. The resolver takes `source` as a parameter, which is
why every test can build its own PATH and none can touch the real one — that
design choice is what made this review safe to perform. The hermes thunk
conversion (`hermes-relay.ts:158-163`) is correct and necessary, not scope creep:
without it a blank key would pre-empt `resolveTestGuardedCommand`'s authority
over the test seam, and mutant M21 is a genuine regression arm for it.

---

## 3. The three flagged points

**(a) "First PATH entry that EXISTS under the name wins", vs `command -v`'s
skip-broken-and-continue — I endorse the deviation, with a documentation fix.**

On the merits, the implementer's argument is good but its stated justification is
slightly off. `command -v` skips entries that are **not executable**; both
2026-09-17 launchers *were* executable (a 0-byte file with its exec bit set, and
a text file with its exec bit set), so a literal `command -v` would have returned
them too. The divergence only bites for a non-executable entry. The deviation is
nonetheless the right call for two stronger reasons the source does not state:

1. It is *strictly* fail-safe and never fail-open — the difference between the two
   semantics is only ever "refuse loudly with a named path" vs "silently use a
   different install". A loud refusal naming the file is recoverable in seconds;
   a silent fallback is not diagnosable at all.
2. This is a debate engine whose whole output is model attribution. Silently
   running a *different* installation than the one at the front of the
   operator's PATH is a lineage hazard, not just an ergonomic one.

The cost is real and should be named: a stale, non-executable `claude` sitting in
an early PATH directory now stops the ceremony where `command -v claude` in the
operator's shell would answer cheerfully. That is the correct trade, but the
README (`:59-60`) and the source comment (`relay-core.ts:212`) currently announce
"the rule `command -v`" *first* and the deviation *second*. Invert that: lead
with "unlike `command -v`, a broken first match is reported, not skipped". See M-5.

**(b) ELF omission — a defect, not an acceptable scope line.** See I-2. The brief's
own motivating quote is "this code is run on multiple computers"; a resolver that
refuses 100% of binaries on Linux is the sharpest possible contradiction of it.
The omission costs one four-byte array entry, is provably safe on macOS, and the
flag-don't-fix decision left the failure mode carrying a misleading reason code.
Fix before merge.

**(c) The `homedir()` credential directory at `hermes-relay.ts:53` — not a
violation; the grep is the defect.** See O1 above for the full reasoning. In
short: it is a credential *directory*, not a binary path; `join(homedir(), …)` is
the deduction the owner's rule demands rather than a breach of it; it predates
this task; it carries uid/mode/no-symlink custody checks; and the identical
`join(userInfo().homedir, ".codex")` at `model-shim.ts:146` escapes the same grep
entirely, which proves the grep matches a spelling rather than the rule. The
implementer's refusal to rewrite the line purely to make the check pass was
correct and I would have flagged the rewrite as grep-dodging had it happened.
O1's literal acceptance criterion ("returns nothing") is therefore **not** met as
written, and the fix belongs in the brief: adopt the orchestrator's spelling
(`'/Users/\|/Applications/'`), which returns nothing at this tip.

---

## 4. What I re-ran (verbatim)

Command form: `./node_modules/.bin/vitest run --config acceptance/vitest.config.ts <file>`,
from `…/algo-loop-2026-09-16/dialectical-engine`, at tip `61432468`, one run each.

| Suite | Result |
| --- | --- |
| `acceptance/relay-core.test.ts` | `Test Files 1 passed (1)` / `Tests 21 passed (21)` |
| `acceptance/claude-relay.test.ts` | `Test Files 1 passed (1)` / `Tests 27 passed (27)` |
| `acceptance/grok-relay.test.ts` | `Test Files 1 passed (1)` / `Tests 24 passed (24)` |
| `acceptance/model-shim.test.ts` | `Test Files 1 passed (1)` / `Tests 15 passed (15)` |
| `acceptance/hermes-relay.test.ts` | `Test Files 1 passed (1)` / `Tests 8 passed (8)` |
| `acceptance/run-acceptance.test.ts` | `Test Files 1 passed (1)` / `Tests 14 passed (14)` |
| all six together, after every mutant was restored | `Test Files 6 passed (6)` / `Tests 109 passed (109)` |

Every figure matches the implementer's gate table. Typechecks:

```
./node_modules/.bin/tsc --noEmit                             → exit=0
./node_modules/.bin/tsc --noEmit -p acceptance/tsconfig.json → exit=0
```

I did **not** run the full suite, Docker, `boot-relays.test.ts`,
`fake-cli-environment.test.ts`, `s7-authorization-contract.test.ts` or
`t15-eval-harness.test.ts` (outside my remit), and I did not push anything.

## 5. Mutants I re-ran myself

Applied to the shipped source, run, then restored from an off-repo byte snapshot
(`cp`), sha256 re-verified as `bb546037…` after each; `git diff --stat -- acceptance`
and `git status --short -- acceptance` both empty at the end.

| # | Mutant | Report's claim | My measurement | Verdict |
| --- | --- | --- | --- | --- |
| A (= M5) | delete `if (metadata.size === 0) return refuse("EMPTY")` (`:200`) | "✔ only that test" | `× refuses with EMPTY for the 0-byte launcher…` — **1 failed \| 20 passed (21)** | **confirmed** |
| B (= M7) | neuter `if (!hasProgramHeader(path))` (`:206`) | "that test + first-bytes + key-path + all four makers' corrupted-launcher arms, 7/95 failed" | exactly those seven: relay-core `NOT_A_PROGRAM`, first-bytes, key-path; claude, grok, codex, hermes corrupted-launcher — **7 failed \| 88 passed (95)** | **confirmed verbatim** |
| C (= M3) | `lstatSync` → `statSync` in `discoverOnPath` (`:229`) | "✔ only that test" | `× refuses with NOT_FOUND when the name on PATH is a dangling symlink` → got `NOT_ON_PATH` — **1 failed \| 20 passed (21)** | **confirmed** |
| D (= M10) | read the key only when `source.PATH === undefined` (`:268`) | "all four makers' ahead-of-PATH arms, both spawn-level arms, key-wins, bare-name, blank-key; 9/95 failed" | exactly those nine — **9 failed \| 86 passed (95)** | **confirmed verbatim** |
| E (mine) | `statSync` → `lstatSync` in `admitProgram` (`:195`) | not in the report | **1 failed \| 94 passed (95)**, and the single failure is the dangling-symlink arm failing for the wrong reason | **gap — see I-3** |

The report's refutation matrix is trustworthy on the four rows I checked: the
failure counts and the named arms matched exactly, including the cross-suite
95-test totals. I found no evidence of a fabricated mutant row.

## 6. Cannot verify from diff

- **That the resolver finds and admits THIS machine's real `claude`, `codex`,
  `grok` or `hermes`.** Prohibited by the safety rule and correctly avoided by the
  implementer too. Every test builds its own PATH; nothing has ever been resolved
  against the real one. This is the single largest residual unknown: the whole
  point of the change is what happens at ceremony time on this host, and that is
  untested by construction. It needs an operator-run, one-shot check (resolve
  only, no spawn) before the ceremony.
- **The two 2026-09-17 host files themselves.** I reproduced their *shapes* with
  fake files and confirmed both are refused with the right reason, including via
  a symlink. Neither real file was opened.
- **End-to-end `MAKER ABSENT <maker> <CODE>:<REASON>:<path>` on stdout.**
  `run-acceptance.ts` was not run. Proven by composition only: resolver message
  (unit-tested) + `absent-makers.ts:62-66` (unit-tested pass-through) +
  `run-acceptance.ts:192-218` (`allSettled` → `announceAbsentMakers`), all three
  read but not executed together.
- **The dev-stack path in I-5** (`apps/runner/src/dev-auth-stack.ts:474`) — read,
  not run; no suite in the O5 list covers it.
- **Non-macOS behaviour** beyond the ELF header measurement in I-2.
- **`s7-authorization-contract.test.ts:98` being pre-existing.** Not re-measured at
  `9c439935` by me either. `git diff --name-only 9c439935..61432468` lists only
  the eleven `acceptance/` files, and the assertion reads
  `packages/memory/src/index.ts`, so the indirect argument holds.
- **The two intermediate commits** (`ea69a7ba`, `3770176d`) were not checked out
  and gated independently; only the tip was measured, by them and by me.
- **F-3's whitespace-in-path concern** — I confirmed by reading that no current
  reader field-splits the `MAKER ABSENT` line, but I did not construct a path
  with a space and run it through.

---

# Scoped re-check 1

Fix round 1: `61432468..fbb8cde5`, three commits (`9880e547` absolute-path,
`593e4c87` hermes CliRelayFailure, `fbb8cde5` docs). `git diff --name-only
61432468..fbb8cde5` lists **seven files, all under `acceptance/`** — nothing in
`apps/**` or `tests/**` was touched, as the coordinator scoped it.

Same rules honoured: read-only, no maker binary executed, no candidate routed
through a shell, no resolution against the real PATH that could start anything.
The one mutant I applied was restored byte-identically (sha256 `a49b4317…`
before and after); `git diff --stat -- acceptance` and
`git status --short -- acceptance` are both empty at the end. Probe driver:
`…/scratchpad/probe2.ts` (scratch only), fake files in `T/probe2-path-*`,
deleted afterwards.

## Per finding

| Finding | Verdict | Evidence |
| --- | --- | --- |
| **C-1** (Critical) | **CLOSED** | `relay-core.ts:262` `if (!isAbsolute(directory)) continue;` and `:322` `resolve(named)`. Measured, every admitted value `isAbsolute === true`: relative key value → `/var/…/probe2-path-XWEtr1/probe-cli`; `./probe-cli` → `…:NOT_FOUND:/Users/…/dialectical-engine/probe-cli` (the **absolute** path is named, so the refusal still says which file it looked for); `PATH="."` → `…:NOT_ON_PATH:probe-cli`; a relative PATH entry → skipped; `PATH=".:<empty>:<abs dir>"` → the absolute entry is still searched and wins. Pinned at `relay-core.test.ts:668-706` plus a new cross-maker suite `D10 every maker resolves to an ABSOLUTE path` (`:751-780`) asserting `isAbsolute` for all four resolvers from both routes. |
| **I-2** (ELF) | **CLOSED** | `[0x7f, 0x45, 0x4c, 0x46]` at `relay-core.ts:166`; measured, an ELF file is now **admitted** (was `NOT_A_PROGRAM` in round 0). Pinned in the magic-number loop at `relay-core.test.ts:595-611`. README updated to "Mach-O / universal-binary / ELF". |
| **I-3** (symlink coverage) | **CLOSED** | Three new arms at `relay-core.test.ts:504-543`: live symlink → 0-byte target ⇒ `EMPTY:<link>`; → text target ⇒ `NOT_A_PROGRAM:<link>`; → good target ⇒ **admitted, returning the link**. All three reproduced independently by probe. Mutant E now dies — see below. |
| **I-4** (false dated record) | **CLOSED** | `claude-relay.ts:18-21` now reads "2026-08-10, claude 2.1.221 — at the compiled-in absolute path this module carried until 2026-09-17; discovery by name did not exist on that date and this record makes no claim about it". Accurate, and no longer implies a verification that never happened. |
| **I-5** (hermes start class) | **CLOSED** (within the ruled scope) | `hermes-relay.ts:172-195` wraps a resolver refusal as `CliRelayFailure("FAILED", <typed message>)`; pinned at `hermes-relay.test.ts:203-232`, asserting `instanceof CliRelayFailure`, `kind === "FAILED"` and `message === "HERMES_CLI_BINARY_UNRESOLVED:NOT_ON_PATH:hermes"`. `discovery.ts:101` therefore records ABSENT instead of re-throwing, and `absent-makers.ts:63` still prints the same string because `CliRelayFailure` carries the code as its `.message`. `apps/**` untouched, as ruled. |
| **M-1** (execute-only) | **CLOSED** | New sixth reason `UNREADABLE` (`relay-core.ts:139`), `readProgramHeader` returns `Buffer \| null` (`:176-190`), `null ⇒ UNREADABLE` (`:230`). Measured: mode-0111 → `…:UNREADABLE:<path>` (was `NOT_A_PROGRAM`). Test at `relay-core.test.ts:570-585`, correctly `it.skipIf(process.getuid?.() === 0)`. |
| **M-2** (directory branch) | **CLOSED** | `relay-core.test.ts:560-567`; measured `…:NOT_A_PROGRAM:<path>`. |
| **M-3** (no-shell scan narrow) | **CLOSED** | `relay-core.test.ts:717-742` now `readdir(root, { recursive: true, withFileTypes: true })` over every file kind, excluding only `*.test.ts`, with positive assertions that it reached `test-fixtures/evaluator-double.ts` and `test-fixtures/fake-claude-cli.mjs` — the scope cannot silently re-narrow. |
| **M-4** (overclaimed provenance) | **CLOSED** | Both sites now say "the same SHAPE as" and state the host copy was never opened: `relay-core.test.ts:425-427`, `model-shim.test.ts:348-350`. |
| **M-5** (README/comment lead with `command -v`) | **CLOSED** | `relay-core.ts:245-255` and `README.md:59-69` both LEAD with the deviation in capitals, then contrast `command -v`, carry the lineage argument, and name the cost out loud ("a stale, non-executable launcher early on `PATH` now stops the ceremony where your shell would have answered cheerfully"). |
| **M-6** (rotting line citations) | **CLOSED** | `hermes-relay.ts:174` and `hermes-relay.test.ts:191` now cite `resolveTestGuardedCommand` by name. No `relay-core.ts:NNN` citation survives in `acceptance/**`. |
| **M-7** (four duplicated blocks) | **DEFERRED by ruling** | Unchanged, as directed. |
| **M-8** (report said spawn at `:283`) | **CLOSED** | Corrected in the report, and the correction is right: `grep -n "spawn(command.binary"` → **`relay-core.ts:337`** at this tip. |

**O1 grep, corrected spelling, run verbatim:**

```
$ grep -rn '/Users/\|/Applications/' acceptance --include='*.ts' | grep -v test-fixtures | grep -v '\.test\.'
(no output — exit 1)
```

## Mutant E, re-run

`statSync` → `lstatSync` in `admitProgram` (`relay-core.ts:219`), five suites:

| | Round 0 (`61432468`) | Round 1 (`fbb8cde5`) |
| --- | --- | --- |
| Result | **1 failed \| 94 passed (95)** | **3 failed \| 102 passed (105)** |
| Arms killed | dangling symlink only, and for the wrong reason | `refuses with NOT_FOUND when the name on PATH is a dangling symlink`; `follows a live symlink into an EMPTY target`; `admits a live symlink to a good program and keeps the LINK as the resolved path` |

**Mutant E is dead at 3 arms**, including the load-bearing one — "admits a live
symlink to a good program" is what catches a regression that would refuse every
Homebrew/npm launcher on the machine. Round 0's blind spot is gone.

One residue, noted not as a finding: `follows a live symlink into a target that is
not a program` is *insensitive* to this mutant, because an unfollowed symlink
fails `isFile()` and coincidentally yields the same `NOT_A_PROGRAM:<link>` string.
The other two arms cover it decisively, so the coverage is sound.

## Regressions

**None found.** Everything I re-probed that this round did not intend to change
behaves as it did at `61432468`:

| Regression guard | Round 1 result |
| --- | --- |
| blank key ⇒ bare code, no `:REASON:` suffix | `THROW -> PROBE_CLI_BINARY_UNRESOLVED` |
| no `PATH` at all | `…:NOT_ON_PATH:probe-cli` |
| empty `PATH` fields skipped, absolute entry still found | admitted, absolute |
| bare name in the key ⇒ PATH lookup | admitted, absolute |
| broken entry earlier on PATH than a good one ⇒ REPORTED, not skipped | `…:EMPTY:<path>` |
| shebang further down the file ⇒ not a header | `…:NOT_A_PROGRAM:<path>` |
| dangling symlink ⇒ `NOT_FOUND` | unchanged |

Also checked: still exactly one `spawn` in `acceptance/` and no `shell: true` /
`sh -c` / `execSync` / `spawnSync` in any non-test source; `BINARY_REFUSAL_REASONS`
has no consumer outside `relay-core.ts`, so growing it to six members breaks
nothing; the six suites run together without interference despite the new hermes
test temporarily reassigning `process.env.PATH` (restored in a `finally`, and
pointed at an EMPTY temp directory rather than resolving anything real).

One **accepted consequence**, not a defect: a *relative* `PATH` entry that
genuinely carries the binary is now skipped, so `PATH=bin:/usr/bin` with a real
`bin/claude` yields `NOT_ON_PATH` rather than running it. That is exactly the
ruling ("a relative PATH entry is SKIPPED — not a deduction"), it is stated in
both the source and the README, and it is the fail-safe direction.

## The two judgement calls

**Keeping the symlink as the spawn path (not `realpath`-ing through) — correct,
and for a reason stronger than the one stated.** The implementer's argument (it
is the name the operator installed, it is the CLI's `argv[0]`, and the target's
defects are caught anyway because the gate follows the link) is sound, and I
verified both halves: `EMPTY` and `NOT_A_PROGRAM` are raised off the *target*
while the *link* is what comes back. The stronger reason is lineage, the same one
that justifies first-existing-wins: several of these CLIs are version-managed
shims whose target is `…/versions/<v>`, so resolving through would make the relay
report a path that changes under the operator's feet on every update, for a
binary they never configured. Spawning the link also preserves any
version-selection the launcher itself performs. The one thing `realpath` might
buy — closing a TOCTOU window between check and spawn — it does not actually buy
(the link can be re-pointed just as easily as the target replaced), so no trade is
lost. Endorsed as written.

**Wrapping only hermes, leaving the other three unwrapped — sound, and
demonstrably not arbitrary.** I traced every production caller:

- `run-acceptance.ts:192-218` collects claude/grok/codex starts with
  `Promise.allSettled` and hands them to `announceAbsentMakers`, which accepts
  **any** `Error` and prints `.message` (`absent-makers.ts:61-66`).
- `apps/runner/src/dev-cli-provider-panel.ts:48` — the other dev-stack caller —
  also wraps those same three starts in `Promise.allSettled`, and a rejected
  outcome becomes an unavailable provider at `:69-74` **without the reason ever
  being inspected**.
- `apps/runner/src/dev-auth-stack.ts:473-481` awaits `startHermesSupportRelay`
  **bare** — no `allSettled`, no catch — and `discovery.ts:101` re-throws anything
  that is not a `CliRelayFailure`.

So hermes is the only maker whose start-time rejection is ever read for its class,
and it is the only one wrapped. The asymmetry tracks a real difference in the
callers rather than a taste, and it *preserves* that maker's pre-task failure
class (an unresolvable hermes used to reach `spawn` and surface as
`CliRelayFailure(FAILED, HERMES_CLI_FAILED)`), which is the conservative choice.

One reservation, offered as a note rather than a finding: the reason the other
three are safe lives only in the hermes comment. A future maker author reading
`claude-relay.ts` has nothing telling them that their start's rejection is
absorbed by an `allSettled` in another package, and the invariant is one
un-`allSettled` caller away from breaking silently. A one-line note at each of the
three start sites, or an architecture test pinning that every non-hermes relay
start is consumed by `allSettled`, would make the asymmetry self-evident. Not
blocking, and explicitly outside this round's `acceptance/`-only scope.

## Runs, verbatim

At tip `fbb8cde5`, `./node_modules/.bin/vitest run --config acceptance/vitest.config.ts <file>`:

| Suite | Round 0 | Round 1 |
| --- | --- | --- |
| `acceptance/relay-core.test.ts` | `Tests 21 passed (21)` | **`Test Files 1 passed (1)` / `Tests 30 passed (30)`** |
| `acceptance/claude-relay.test.ts` | `Tests 27 passed (27)` | **`Test Files 1 passed (1)` / `Tests 27 passed (27)`** |
| `acceptance/grok-relay.test.ts` | `Tests 24 passed (24)` | **`Test Files 1 passed (1)` / `Tests 24 passed (24)`** |
| `acceptance/model-shim.test.ts` | `Tests 15 passed (15)` | **`Test Files 1 passed (1)` / `Tests 15 passed (15)`** |
| `acceptance/hermes-relay.test.ts` | `Tests 8 passed (8)` | **`Test Files 1 passed (1)` / `Tests 9 passed (9)`** |
| `acceptance/run-acceptance.test.ts` | `Tests 14 passed (14)` | **`Test Files 1 passed (1)` / `Tests 14 passed (14)`** |
| all six together | `Tests 109 passed (109)` | **`Test Files 6 passed (6)` / `Tests 119 passed (119)`** |

Net +10 tests, 0 removed, 0 red. Typechecks:

```
./node_modules/.bin/tsc --noEmit                             → exit=0
./node_modules/.bin/tsc --noEmit -p acceptance/tsconfig.json → exit=0
```

Out of scope and therefore not re-run: the full suite, Docker, `boot-relays`,
`fake-cli-environment`, `s7-authorization-contract`, `t15-eval-harness`.

## Still cannot verify

Unchanged from round 0 and untouched by these commits: that the resolver finds
and admits THIS machine's real CLIs at ceremony time (prohibited, and correctly
avoided by the implementer too); the two 2026-09-17 host files themselves (shapes
reproduced, files never opened); the end-to-end `MAKER ABSENT` line on stdout
(composition only); non-macOS behaviour beyond the ELF header measurement, which
now passes; and `s7-authorization-contract.test.ts:98` being pre-existing.

---

**FINAL VERDICT: Spec compliance ✅ MET (O1–O5). Code quality ✅ APPROVED — all 13
findings closed or deferred by ruling (1 Critical CLOSED, 4 Important CLOSED, 7
Minor CLOSED, 1 Minor DEFERRED), mutant E dead at 3 arms, no regressions, 119/119
green across the six suites and both typechecks clean at `fbb8cde5`.**
