SKILLS LOADED: superpowers:test-driven-development, superpowers:verification-before-completion

# Task 2 — the service credential leaves the command line (F-CREDENTIAL-ON-ARGV)

## Status

DONE. All seven outcomes (O1–O7) met and measured. Base commit `7bae9806`; final tip
`382d9d0c` on `mission/2026-09-16-algorithm-live-loop-continuation`.

## Commits

| sha | subject |
| --- | --- |
| `9c51c8ab` | `fix(acceptance): the service credential is read from the environment, never from argv` |
| `382d9d0c` | `docs(acceptance): the operator exports the credential instead of passing it on argv` |

`9c51c8ab` touches six files, all mine: `acceptance/run-acceptance.ts`,
`acceptance/run-acceptance.test.ts`, `acceptance/pro01-depth2-proof.ts`,
`acceptance/panel01-depth1-proof.ts`, `acceptance/xrev01-depth1-proof.ts`,
`.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh`.
`382d9d0c` touches `acceptance/README.md` only. Both were staged by explicit path;
`git status --short` was read before each commit and showed only my paths in the
index (column 1), with the other two seats' files untouched in the worktree.

`acceptance/main.ts` was NOT modified. The grep the brief names shows its only
`service-credential` hit is `acceptance/main.ts:272`, the session-purpose string
`"acceptance-service-credential-not-login-capable"`, which is not argv; and
`acceptance/main.ts:766-767` already read the environment key. Nothing there was
credential-on-argv, so the file stayed closed — which also kept me clear of the
register seat's version constant.

## What changed

**`acceptance/run-acceptance.ts`**

- `acceptance/run-acceptance.ts:41` — new `const credentialArgument = "--service-credential"`,
  the name that is refused rather than parsed.
- `acceptance/run-acceptance.ts:44` — new `const credentialEnvironmentKey = "ACCEPTANCE_SERVICE_CREDENTIAL"`.
- `acceptance/run-acceptance.ts:46-56` — `--service-credential` is gone from `supportedArguments`.
- `acceptance/run-acceptance.ts:81-85` — the produced signature:
  `parseAcceptanceArguments(arguments_: readonly string[], now: Date = new Date(), environment: NodeJS.ProcessEnv = process.env)`.
- `acceptance/run-acceptance.ts:93-98` — the new typed refusal, decided FIRST, before
  the `--serve` duplication check, before `argumentMap` (so before both the
  unknown-argument and the missing-value checks), and never interpolating the
  offered value.
- `acceptance/run-acceptance.ts:103` — the credential is read from
  `environment[credentialEnvironmentKey]` and from nowhere else. The two existing
  codes and the `/^[A-Za-z0-9_-]{43}$/` pattern are unchanged
  (`:104-109`), so their readers keep working.
- `acceptance/run-acceptance.ts:125` — the return shape (`serviceCredential`, `ask`, `serve`) is unchanged.
- The `main()` caller at `acceptance/run-acceptance.ts:474` is unchanged: it still
  passes `process.argv.slice(2)` and now takes the environment from the default
  third parameter.

The test scans the RAW argument list with `arguments_.includes(credentialArgument)`,
so the token is refused in a value position too, not only in a name position. A
real credential can never equal the literal `--service-credential`, so this costs
nothing and closes the loudest hole.

**The three live proofs** (`pro01-depth2-proof.ts:16-18`, `panel01-depth1-proof.ts:11-13`,
`xrev01-depth1-proof.ts:11-13`) no longer carry a placeholder credential
(`"p".repeat(43)` / `"x".repeat(43)`) on argv; each now takes the credential from
the default `process.env`, with a one-line comment naming the ticket.

**`.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh`**

- `:3-4` — the usage is now the exported variable, then the command.
- `:7-11` — a new header paragraph stating why (prose, not a command).
- `:99` — `export ACCEPTANCE_SERVICE_CREDENTIAL` immediately after the existing
  presence and shape checks, so the child inherits it whether the operator
  exported it or set it only for this script's own run.
- `:108` — the `credential: present in the environment (length N); never logged`
  line is unchanged, as required.
- `:109-110` — the echoed command line no longer shows `--service-credential <env>`;
  the explanation moved to its own prose line beneath it, so the `$`-prefixed line
  stays a true, pasteable command.
- `:116` — the invocation is now
  `./node_modules/.bin/tsx acceptance/run-acceptance.ts "$@" >> "$LOG" 2>&1`.

`PREFLIGHT_ONLY=1` still exits at `:93-95`, above the dirty-tree refusal at `:114`,
so the preflight run works on a tree with tracked changes. Confirmed by reading
the script and by running it (below).

**`acceptance/README.md:228-250`** — the new command and the plain sentence why.

## The exact new operator command (verbatim, as it now appears in the README)

```text
export ACCEPTANCE_SERVICE_CREDENTIAL=REPLACE_WITH_THE_43_CHARACTER_CREDENTIAL
./node_modules/.bin/tsx acceptance/run-acceptance.ts
```

That block is safe to paste as written. The placeholder deliberately carries no
`<`, `>` or any other shell metacharacter, because the previous line
(`--service-credential <43-character-service-credential>`) was exactly the shape
that caused the 2026-09-17 truncation incident when a documentation line was
pasted into zsh. A reader who pastes this before minting a credential gets
`ACCEPTANCE_SERVICE_CREDENTIAL_INVALID` and nothing is written to. The same
placeholder is used in the tool's usage header at `closing-run.sh:3`.

The plain sentence, as it reads in the README:

> The credential is read from that environment variable and from nowhere else, and
> it is never a command-line argument, because a process's arguments are visible to
> every user of the machine through the process list for the whole of the run while
> its environment is not (`F-CREDENTIAL-ON-ARGV`, 2026-09-18).

## RED frames (verbatim)

Command: `pnpm exec vitest run acceptance/run-acceptance.test.ts`, against today's
parser (base `7bae9806`), before any production change. Exit 1.

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 9 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > reads the service credential from the environment and returns it
Error: ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED
 ❯ parseAcceptanceArguments acceptance/run-acceptance.ts:79:11
     77|   const serviceCredential = values.get("--service-credential");
     78|   if (serviceCredential === undefined || serviceCredential.trim().leng…
     79|     throw new Error("ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED");
       |           ^
     80|   }
     81|   if (!/^[A-Za-z0-9_-]{43}$/.test(serviceCredential)) {
 ❯ acceptance/run-acceptance.test.ts:26:12

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/9]⎯

 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > refuses an environment credential of 42 characters
AssertionError: expected [Function] to throw error including 'ACCEPTANCE_SERVICE_CREDENTIAL_INVALID' but got 'ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED'

Expected: "ACCEPTANCE_SERVICE_CREDENTIAL_INVALID"
Received: "ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED"

 ❯ acceptance/run-acceptance.test.ts:40:8
     38|   it("refuses an environment credential of 42 characters", () => {
     39|     expect(() => parseAcceptanceArguments([], asOf, { ACCEPTANCE_SERVI…
     40|       .toThrow("ACCEPTANCE_SERVICE_CREDENTIAL_INVALID");
       |        ^
     41|   });
     42|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/9]⎯

 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > refuses a credential offered on argv, 'alone'
AssertionError: expected [Function] to throw error including 'ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV…' but got 'ACCEPTANCE_ARGUMENT_VALUE_REQUIRED:--…'

Expected: "ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED"
Received: "ACCEPTANCE_ARGUMENT_VALUE_REQUIRED:--service-credential"

 ❯ acceptance/run-acceptance.test.ts:55:8
     53|   ])("refuses a credential offered on argv, $position", ({ argv }) => {
     54|     expect(() => parseAcceptanceArguments(argv, asOf, environment))
     55|       .toThrow("ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED");
       |        ^
     56|   });
     57|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/9]⎯

 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > refuses a credential offered on argv, 'with a value'
 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > refuses a credential offered on argv, 'before other arguments'
 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > refuses a credential offered on argv, 'after --serve'
AssertionError: expected [Function] to throw an error

- Expected:
null

+ Received:
undefined

 ❯ acceptance/run-acceptance.test.ts:55:8
     53|   ])("refuses a credential offered on argv, $position", ({ argv }) => {
     54|     expect(() => parseAcceptanceArguments(argv, asOf, environment))
     55|       .toThrow("ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED");
       |        ^
     56|   });
     57|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/9]⎯

 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > never repeats the offered value in the argv refusal
AssertionError: expected '' to contain 'ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV…'

- Expected
+ Received

- ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED

 ❯ acceptance/run-acceptance.test.ts:65:21
     63|       message = error instanceof Error ? error.message : String(error);
     64|     }
     65|     expect(message).toContain("ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_R…
       |                     ^
     66|     expect(message).not.toContain(offeredOnArgv);
     67|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/9]⎯

 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > documents and applies only asker-input defaults — the default question is self-contained (ACC-01 N1)
Error: ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED
 ❯ parseAcceptanceArguments acceptance/run-acceptance.ts:79:11
     77|   const serviceCredential = values.get("--service-credential");
     78|   if (serviceCredential === undefined || serviceCredential.trim().leng…
     79|     throw new Error("ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED");
       |           ^
     80|   }
     81|   if (!/^[A-Za-z0-9_-]{43}$/.test(serviceCredential)) {
 ❯ acceptance/run-acceptance.test.ts:70:20

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/9]⎯

 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > parses the --serve standing flag anywhere in the argument list
Error: ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED
 ❯ parseAcceptanceArguments acceptance/run-acceptance.ts:79:11
     77|   const serviceCredential = values.get("--service-credential");
     78|   if (serviceCredential === undefined || serviceCredential.trim().leng…
     79|     throw new Error("ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED");
       |           ^
     80|   }
     81|   if (!/^[A-Za-z0-9_-]{43}$/.test(serviceCredential)) {
 ❯ acceptance/run-acceptance.test.ts:101:12

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/9]⎯


 Test Files  1 failed (1)
      Tests  9 failed | 13 passed (22)
   Start at  01:24:37
   Duration  863ms (transform 390ms, setup 0ms, import 777ms, tests 10ms, environment 0ms)
```

Two notes on the RED, both honest:

- Vitest prints seven numbered frames for nine failures: the three later
  `it.each` argv cases share frame `[4/9]` with `'with a value'` because their
  assertion and message are identical. The nine are counted in the summary line.
- `[3/9]` (`'alone'`) is the proof that the refusal must precede the missing-value
  check: today's parser answered `ACCEPTANCE_ARGUMENT_VALUE_REQUIRED:--service-credential`.
  After GREEN it answers the credential refusal.

GREEN immediately after the parser change: `Tests  22 passed (22)`.

## O6 sweep

Command, run at the final tip `382d9d0c`:

`grep -rn "service-credential" . --include='*.ts' --include='*.sh' --include='*.md' | grep -v node_modules | grep -v '\.hermes/reports/.*/\(DECISIONS\|PROGRESS\|LEDGER\|RESUME\|V-DECISIONS-PACKET\|PLAIN-STATUS\)' | grep -v 'closing-runs/' | grep -v 'agent-reports/' | grep -v 'packets/'`

Output, every hit classified:

| hit | classification |
| --- | --- |
| `docs/superpowers/plans/2026-09-18-owner-rulings-d77.md:56` | the plan of record — a sentence specifying this task. Dated mission record; stays as written. |
| `docs/superpowers/plans/2026-09-18-owner-rulings-d77.md:57` | same. |
| `docs/superpowers/plans/2026-09-18-owner-rulings-d77.md:69` | same — O2, the sentence that defines the refusal. |
| `acceptance/main.ts:272` | NOT argv. The session-purpose literal `"acceptance-service-credential-not-login-capable"`; unrelated to the command line. |
| `acceptance/README.md:242` | a sentence explaining the refusal. |
| `acceptance/run-acceptance.test.ts:45` | the comment above the refusal's test. |
| `acceptance/run-acceptance.test.ts:49` | the refusal's test — argv case `alone`. |
| `acceptance/run-acceptance.test.ts:50` | the refusal's test — argv case `with a value`. |
| `acceptance/run-acceptance.test.ts:51` | the refusal's test — argv case `before other arguments`. |
| `acceptance/run-acceptance.test.ts:52` | the refusal's test — argv case `after --serve`. |
| `acceptance/run-acceptance.test.ts:61` | the refusal's test — the message does not repeat the offered value. |
| `acceptance/run-acceptance.ts:41` | the refusal itself: the name the parser refuses. |
| `.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh:9` | a sentence explaining the refusal. |
| `.hermes/reports/2026-09-01-algorithm-live-loop/board/F-CREDENTIAL-ON-ARGV.md:25` | the ticket describing the defect. Dated mission record; history, stays as written. |

No hit is a live use of the old shape.

## Mutant matrix

One mutant per new property, each applied at the final tip, measured, and restored
by copying back a byte-identical pristine file (`shasum c9357b3a35c4b9ee6943c0d174b6e307fe38d1eb`,
re-verified after every restore; `grep -c MUTANT` = 0 at the end).

| property | mutant | suite | result | restored |
| --- | --- | --- | --- | --- |
| an argv credential is refused at all | the `arguments_.includes(credentialArgument)` refusal block deleted | `acceptance/run-acceptance.test.ts` | RED 5 failed / 22 — the four argv-position cases and the no-value-in-message case; `Received: "UNKNOWN_ACCEPTANCE_ARGUMENT:--service-credential"` | yes |
| the refusal precedes the unknown-argument and missing-value checks | the refusal block moved below `argumentMap(...)` | `acceptance/run-acceptance.test.ts` | RED 5 failed / 22 — same five; `Received: "UNKNOWN_ACCEPTANCE_ARGUMENT:--service-credential"` | yes |
| the credential comes from the environment | `environment[credentialEnvironmentKey]` replaced by `values.get(credentialArgument)` | `acceptance/run-acceptance.test.ts` | RED 4 failed / 22 — `reads the service credential from the environment and returns it`, `refuses an environment credential of 42 characters` (`Expected: "…INVALID"` / `Received: "…REQUIRED"`), the defaults case, the `--serve` case | yes |
| the refusal never repeats the offered value | the argument after the flag interpolated into the message | `acceptance/run-acceptance.test.ts` | RED 1 failed / 22 — exactly `never repeats the offered value in the argv refusal`, at `acceptance/run-acceptance.test.ts:66:25`, the `expect(message).not.toContain(offeredOnArgv)` line | yes |

Mutant 4 is the sharpest: it is red at precisely one assertion, the one that exists
for it, and nothing else moved.

## Three-run gate (at the final tip `382d9d0c`)

| suite | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| `acceptance/run-acceptance.test.ts` | 22/22 | 22/22 | 22/22 |
| `acceptance/dod-facts.test.ts` | 35/35 | 35/35 | 35/35 |
| `acceptance/ceremony.test.ts` | 2/2 | 2/2 | 2/2 |
| `tests/architecture/s7-authorization-contract.test.ts` | 5/6 | 5/6 | 5/6 |
| `tests/unit/t15-eval-harness.test.ts` | 50/50 | 50/50 | 50/50 |

The s7 failure is the documented pre-existing red, not mine and not to be fixed:
`Accounts S7 ownership architecture > hardens every immutable memory scope carrier
and derives it from run ownership`, listed at
`.hermes/reports/2026-09-01-algorithm-live-loop/closing-runs/four-count-4f83405f-failures.txt:9`.
5/6 is exactly what the brief expects.

`acceptance/ceremony.test.ts` is 2/2 by design (the dry-run ceremony's two cases);
`ceremony.test.ts:369` still hands `serviceCredential:"a".repeat(43)` to
`createAcceptanceRuntime` as an object field, which is not argv and was not
touched — it passes unchanged, as required of a read-only file.

## Exit codes

| check | command | exit |
| --- | --- | --- |
| root typecheck | `pnpm run typecheck` | 0 |
| acceptance typecheck | `pnpm exec tsc -p acceptance/tsconfig.json --noEmit` | 0 |
| tool syntax | `bash -n .hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh` | 0 |
| preflight only | `PREFLIGHT_ONLY=1 bash .hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh` | 0 |

All four were re-run at the final tip. The root typecheck warns
`Unsupported engine: wanted: {"node":"22.23.1"} (current: {"node":"v26.5.0","pnpm":"11.20.0"})`,
which is the host's standing Node mismatch, not a result of this change.

The preflight run's output, for the record — it started nothing, spent nothing and
read no credential:

```
PREFLIGHT CLAUDE: OK /Users/stefannour/.local/bin/claude → /Users/stefannour/.local/share/claude/versions/2.1.274 · 2.1.274 (Claude Code)
PREFLIGHT CODEX: OK /opt/homebrew/bin/codex → /opt/homebrew/lib/node_modules/@openai/codex/bin/codex.js · codex-cli 0.154.0
PREFLIGHT GROK: OK /Users/stefannour/.local/bin/grok → /Users/stefannour/.grok/downloads/grok-1.0.34-macos-aarch64 · grok 1.0.34 (3736acbc8658) [stable]
PREFLIGHT CLAUDE LOGIN: OK
PREFLIGHT CODEX LOGIN: OK
PREFLIGHT GROK LOGIN: not checkable without a call (grok has login/logout, no status); the run's own handshake decides — a failure prints MAKER ABSENT xAI
PREFLIGHT: 3 of 3 maker binaries run; the ceremony may start (PREFLIGHT_ONLY=1 — nothing started, no credential read).
```

That output is a measurement, not a command, and is reproduced here as a fenced
block only because it contains no `$`-prompted line and no shell metacharacter that
a paste could act on. The arrows in it are the tool's own Unicode `→`.

## Credential handling in this seat

`ACCEPTANCE_SERVICE_CREDENTIAL` was never read, printed, logged or echoed from the
real environment. Every test supplies an explicit third argument, so no case in
`acceptance/run-acceptance.test.ts` touches `process.env`; the values used are the
fabricated strings `"s".repeat(43)`, `"s".repeat(42)`, `"   "` and `"z".repeat(43)`.
The ceremony was never started. The only run of the tool was `PREFLIGHT_ONLY=1`,
which exits above the credential check.

## Findings and concerns

1. **The three live proofs now require the operator to export the variable, and
   did not before.** `acceptance/pro01-depth2-proof.ts:16`,
   `acceptance/panel01-depth1-proof.ts:11`, `acceptance/xrev01-depth1-proof.ts:11`
   each used to bake a placeholder credential (`"p".repeat(43)` / `"x".repeat(43)`)
   into argv, so they ran with no credential in the environment at all. Reading the
   credential "from the environment and from nowhere else" (O1) necessarily ends
   that. The refusal is loud and typed (`ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED`),
   not silent, and the README now says the same variable supplies all three. This is
   intended behaviour, but it is a change to how those three scripts are launched
   and the operator should know it. The README fenced blocks for those proofs at
   `acceptance/README.md:189-198` and `:203-209` list environment keys and do NOT
   list `ACCEPTANCE_SERVICE_CREDENTIAL`; I left those blocks alone because the brief
   scopes my README writes to the run command and to lines showing
   `--service-credential`, and instead named the fact in one prose sentence at
   `acceptance/README.md:248-250`. If the orchestrator would rather the three
   blocks carry the key explicitly, that is a one-line addition to each.

2. **`packets/readiness-ask-2026-09-16.md` still shows the old command.** As
   instructed I did not touch it; it is the orchestrator's to update. It is excluded
   from the O6 sweep by the sweep's own `packets/` filter, so the sweep is clean
   while that file is still stale. Naming it here as owed.

3. **The refusal matches the token anywhere on argv, including in a value
   position.** `parseAcceptanceArguments(["--question", "--service-credential"])`
   is refused with the credential code rather than accepted as a question. I judged
   this correct — O2 says "anywhere on argv" and a real credential can never be the
   literal flag name — but it is a deliberate choice worth a reviewer's eye, at
   `acceptance/run-acceptance.ts:93`.

4. **`closing-run.sh:99` adds an explicit `export`.** The variable is already
   exported in both normal launch shapes (`export VAR` then `bash …`, or
   `VAR=… bash …`), so the line is belt-and-braces. It costs nothing, puts nothing
   on any command line, and removes the one failure mode where an operator set a
   plain shell variable. Flagging it because it is the one line in the tool that
   goes slightly beyond "delete the argument".

5. **The two other seats were active throughout and I never touched their files.**
   `git status --short` at my last commit showed their work in progress across
   `apps/ui/**`, `tests/render/t11-*`, `tests/unit/t11-*`,
   `packages/register/src/algorithm-policy.ts`, `tests/architecture/t16-*`,
   `tests/integration/t16-*`, `tests/support/t16PolicyScanner.ts`, plus the
   orchestrator's `V-DECISIONS-PACKET.md` and `packets/readiness-ask-2026-09-16.md`
   and two new board tickets. None of it was staged by me and none of it failed in
   the suites I gated. Both typechecks passed with their edits present in the
   worktree, so nothing of theirs was broken at my tip either.

6. **No ASCII `->` was introduced.** The only `->` anywhere in the files I touched
   is `acceptance/run-acceptance.ts:366`, the PostgreSQL JSON operator
   `envelope_basis->>'max_model_attempts'` inside a SQL string. That is executable
   code, pre-existing, and not a documentation arrow; it is untouched. Every arrow
   in `closing-run.sh` is the Unicode `→`.

## UNVERIFIED

- **The ceremony has not been run end to end with the new shape.** The rules forbid
  starting it, so the proof that the child process actually inherits
  `ACCEPTANCE_SERVICE_CREDENTIAL` from `closing-run.sh` rests on `bash -n`, on the
  explicit `export` at `closing-run.sh:99`, and on POSIX inheritance semantics —
  not on a witnessed run. The first real run is the witness. This is the one claim
  in this report that no command of mine measured.
- **The three live proofs were not executed** (they start real vendor CLIs and
  spend). Their argument change is typechecked and their parser path is the one the
  22 tests cover, but no proof was run.
- **`ps` was not used to observe a live process's arguments**, before or after. The
  ticket's own instruction is not to paste process listings into records, and the
  run that would have produced one is forbidden. The defect and the fix are
  established by reading the code and the tool, which is where argv is constructed.

---

## Fix round 1

Review verdict: spec MET, quality NEEDS FIXES — 0 Critical / 3 Important / 5 Minor,
all eight ruled in. All eight are closed. Two commits, code and script first, the
README last because the Task 1 seat held it.

| sha | subject | files |
| --- | --- | --- |
| `097cd35d` | `fix(acceptance): close the two paths that still wrote the credential to the run log` | `acceptance/run-acceptance.ts`, `acceptance/run-acceptance.test.ts`, `.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh` |
| `4b80482a` | `docs(acceptance): the proof commands work as printed, and no fenced block can redirect` | `acceptance/README.md` |

The review's tip was `382d9d0c`; commits by the other two seats landed between it
and mine (`8d41d4db`, `04406d03`, `91b887c7`, and `3a8193cb` between my two).
Neither of my commits contains a foreign hunk — verified below.

### Finding 1 (Important) — the `=`-joined spelling walked past the refusal

**Changed:** `acceptance/run-acceptance.ts:128-129`. The exact-token test became a
prefix test — the predicate now accepts the bare token OR any token beginning with
the name followed by `=`, which is the spelling an operator is likeliest to type.
`acceptance/run-acceptance.ts:121-126` records why in the comment. Tests:
`acceptance/run-acceptance.test.ts:81-84` adds three `=`-joined rows to the
`it.each` table (joined with a value, joined and empty, joined before other
arguments), and `:98-101` adds the value-absence assertions for that spelling to
the "never repeats the offered value" case, which was rewritten around a new
`refusalMessage` helper (`acceptance/run-acceptance.test.ts:27-38`) that returns
`""` when nothing was thrown, so no assertion can pass vacuously.

**RED frame** (verbatim, against the reviewed tip's parser):

```
 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > refuses a credential offered on argv, 'joined with ='
 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > refuses a credential offered on argv, 'joined with = before other arguments'
AssertionError: expected [Function] to throw error including 'ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV…' but got 'UNKNOWN_ACCEPTANCE_ARGUMENT:--service…'

Expected: "ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED"
Received: "UNKNOWN_ACCEPTANCE_ARGUMENT:--service-credential=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"

 ❯ acceptance/run-acceptance.test.ts:88:8
     86|   ])("refuses a credential offered on argv, $position", ({ argv }) => {
     87|     expect(() => parseAcceptanceArguments(argv, asOf, environment))
     88|       .toThrow("ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED");
       |        ^
     89|   });
     90|
```

And the empty-value spelling, same table:

```
 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > refuses a credential offered on argv, 'joined with = and empty'
AssertionError: expected [Function] to throw error including 'ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV…' but got 'UNKNOWN_ACCEPTANCE_ARGUMENT:--service…'

Expected: "ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED"
Received: "UNKNOWN_ACCEPTANCE_ARGUMENT:--service-credential="
```

That first `Received:` line is the defect itself: the whole fabricated credential,
in the message that would have reached the ceremony log.

**Mutant row:** mutant 5 in the matrix below.

### Finding 2 (Important) — the tool wrote its own argv into the log before refusing

**Changed:** `.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh:28-39`
— a refusal loop over `"$@"` immediately after `set -u`, above `M=`, `OUTDIR=`,
the preflight, and far above `mkdir -p "$OUTDIR"` (`:115`), the `$*` echo (`:124`)
and its flush (`:127`). Both spellings, exit 7, the offered value never printed.
The header at `:7-12` and the README record it.

**Measured** (the script run with a fabricated 43-character value of repeated `F`,
never a real credential):

| assertion | space-separated | `=`-joined |
| --- | --- | --- |
| exit code | 7 | 7 |
| occurrences of the offered value in the message | 0 | 0 |
| new files in `logs/closing-run/` | none (2 before, 2 after, `diff` of the listings exit 0) | none |

The refusal's own output, verbatim:

```
ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED: the credential is never a command-line argument, here or to the ceremony; export ACCEPTANCE_SERVICE_CREDENTIAL in your own shell instead. Nothing was started, and nothing was written to any log.
```

Both runs were made WITHOUT `PREFLIGHT_ONLY`, which is safe precisely because the
refusal is the script's first statement: nothing is started, no binary is touched,
no path is computed.

**On redirecting `OUTDIR`:** the script does not allow it. `OUTDIR=$M/logs/closing-run`
at `:41` has no environment override, so I could not point it at a temporary
directory, and I am saying so rather than having written into the mission's log
folder. It did not matter for this assertion: the refusal fires before `OUTDIR` is
assigned, so the correct behaviour is that no directory is even named, which the
unchanged listing shows.

**Mutant rows:** script mutants A and B below.

### Finding 3 (Important) — the proof commands no longer worked as printed

**Changed:** `acceptance/README.md:207`, `:222` — each proof block now opens with
the credential export line; `:228-241` adds the XREV-01 paragraph and block it
never had, in the same shape; `:236-239` a short paragraph saying all three read
the credential from the environment and that the export belongs in the operator's
own shell.

**RED frame:** none — this is documentation, and no test in this repository
executes a README block. The measurement that stands in for one is the reason the
finding exists: before the change the three blocks named every variable their
proof needs except the one it now needs, and `acceptance/pro01-depth2-proof.ts:16`,
`acceptance/panel01-depth1-proof.ts:11` and `acceptance/xrev01-depth1-proof.ts:11`
all reach `parseAcceptanceArguments` with the default `process.env`, whose empty
case is `ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED` — the code path already covered by
`acceptance/run-acceptance.test.ts:30`. I did not run the proofs; they start real
vendor CLIs and spend.

### Finding 4 (Minor) — the unknown-argument error quoted the raw token

**Changed:** `acceptance/run-acceptance.ts:58-85` adds the shared
`credentialPattern`, `longestSupportedArgumentLength` and `describeToken`; `:92`
routes the unknown-argument throw through it. A token matching the credential
pattern becomes `[redacted: looks like a credential]`; a token longer than any
supported argument name becomes a redaction naming its LENGTH only, never a prefix,
because the first characters are exactly what the process listing gave away in the
first place. Short, harmless unknown arguments are still named in full, which
`acceptance/run-acceptance.test.ts:125-127` pins so the redaction cannot grow into a
refusal that says nothing useful. `:143` now uses the same `credentialPattern`
constant the redactor uses, so the validator and the redactor cannot drift apart.

**RED frames** (verbatim, both cases the coordinator named):

```
 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > never quotes a credential-shaped token in the unknown-argument refusal
AssertionError: expected 'UNKNOWN_ACCEPTANCE_ARGUMENT:zzzzzzzzz…' not to contain 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz…'

Expected: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
Received: "UNKNOWN_ACCEPTANCE_ARGUMENT:zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"

 ❯ acceptance/run-acceptance.test.ts:115:25
    113|     const message = refusalMessage([offeredOnArgv]);
    114|     expect(message).toContain("UNKNOWN_ACCEPTANCE_ARGUMENT");
    115|     expect(message).not.toContain(offeredOnArgv);
       |                         ^
    116|   });
    117|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/6]⎯

 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > never quotes an over-long token in the unknown-argument refusal
AssertionError: expected 'UNKNOWN_ACCEPTANCE_ARGUMENT:--unknown…' not to contain 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz…'

Expected: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
Received: "UNKNOWN_ACCEPTANCE_ARGUMENT:--unknown=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"

 ❯ acceptance/run-acceptance.test.ts:121:25
    119|     const message = refusalMessage([`--unknown=${offeredOnArgv}`]);
    120|     expect(message).toContain("UNKNOWN_ACCEPTANCE_ARGUMENT");
    121|     expect(message).not.toContain(offeredOnArgv);
       |                         ^
    122|   });
    123|
```

**Mutant row:** mutant 6 below.

### Finding 5 (Minor) — the `export` comment overstated shell semantics

**Changed:** `.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh:105-108`.
The `export` stays. The sentence now says what is true: both normal launch shapes
already put the variable in this script's environment and therefore in its
children's; a variable set WITHOUT export never reaches this script at all, so the
`:?` check above it would already have refused; the line makes the inheritance
explicit at the point of use and covers the sourced case.

**RED frame:** none — a comment. Its truth is the assertion, and it was checked
against the two launch shapes and the `:101` refusal it now cites.

### Finding 6 (Minor) — fenced blocks still carried bare angle brackets

**Changed:** `acceptance/README.md:107`, `:208-215`, `:223-225`, `:230-233`,
`:252-256`, `:358-359`. Every angle-bracketed placeholder inside a fence became a
`REPLACE_WITH_…` word. `:284-288` adds a paragraph saying why, naming the
2026-09-17 incident, so the next editor does not reintroduce them.

**Before/after count** (same scan both times — `awk` over the file, toggling on
each fence line, counting body lines containing `<` or `>`):

| | fenced lines containing `<` or `>` |
| --- | --- |
| before | **13** (`:107`, `:209`, `:211`, `:212`, `:213`, `:224`, `:225`, `:238`, `:240`, `:241`, `:242`, `:340`, `:341`) |
| after | **0** |

**RED frame:** none — documentation. The count is the measurement.

### Finding 7 (Minor) — the two REQUIRED cases did not discriminate direction

**Changed:** `acceptance/run-acceptance.test.ts:40-52` adds
`requires the environment credential even when argv carries values`:
`parseAcceptanceArguments(["--question", "x"], asOf, {})` must throw `REQUIRED`
while argv carries values.

**RED frame:** none at introduction, and I will not claim one. The case passed the
moment it was written, because the parser was already correct — it is a regression
guard against a direction the code does not currently take, so the only honest
proof of its discriminating power is the mutant, which is exactly what the reviewer
asked for and what mutant 7 below shows: the mutant is red at this case and at
nothing else, while the two pre-existing REQUIRED cases stay green — the gap the
reviewer described, now closed.

### Finding 8 (Minor) — a trailing newline is INVALID, undocumented

**Changed:** `acceptance/README.md:270-277`. The 43-character sentence now says
"not exactly 43 characters", names the trailing-newline case, names the shape that
produces it, says to strip it, and says why the parser does not trim: a credential
is used exactly as given or not at all. No code changed — the behaviour is correct
as it stands.

### Mutant matrix (fix round 1)

Every mutant applied at the fixed tip, measured, restored by copying back a
byte-identical pristine file. Parser pristine `shasum 90d39d94aad8180af8795f98483eea144358e7c6`;
tool pristine `shasum ed5041be6dac46ece1531393caf96f87afc2a27e`; both re-verified
after each restore, and `grep -c MUTANT` = 0 in both files at the end.

| property | mutant | suite / command | result | restored |
| --- | --- | --- | --- | --- |
| the `=`-joined spelling is refused | the `startsWith` clause removed (mutant 5) | `acceptance/run-acceptance.test.ts` | RED 4 failed / 29 — the three `=`-joined rows and the message case. `Received: "UNKNOWN_ACCEPTANCE_ARGUMENT:[redacted: 64-character token]"` | yes |
| a credential-shaped or over-long token is never quoted | `describeToken` returns its argument unchanged (mutant 6) | `acceptance/run-acceptance.test.ts` | RED 2 failed / 29 — exactly `:115` and `:121`, the two `not.toContain` lines | yes |
| the credential comes from the environment even when argv has values | an argv-read fallback on the environment read (mutant 7) | `acceptance/run-acceptance.test.ts` | RED 1 failed / 29 — exactly `requires the environment credential even when argv carries values`; `Expected: "…REQUIRED"` / `Received: "…INVALID"`. The two older REQUIRED cases stayed GREEN, which is the reviewer's point made visible | yes |
| the tool refuses a credential on its own argv | the refusal loop deleted (script mutant A) | `PREFLIGHT_ONLY=1 bash .../closing-run.sh --service-credential <fabricated>` | RED — exit **0** instead of **7** | yes |
| the tool's refusal never names the offered token | the message interpolates the matched argument (script mutant B) | `bash .../closing-run.sh --service-credential=<fabricated>` | RED — the fabricated value appears **1** time in the message instead of **0** | yes |

One result is worth naming on its own. Under mutant 5 the leaked message read
`UNKNOWN_ACCEPTANCE_ARGUMENT:[redacted: 64-character token]`, not the credential —
because the finding-4 redaction was already in place. The two fixes are independent
layers over the same leak, and the mutant proves it rather than my asserting it.

### Three-run gate (at the new tip `4b80482a`)

| suite | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| `acceptance/run-acceptance.test.ts` | 29/29 | 29/29 | 29/29 |
| `acceptance/dod-facts.test.ts` | 35/35 | 35/35 | 35/35 |
| `acceptance/ceremony.test.ts` | 2/2 | 2/2 | 2/2 |
| `tests/architecture/s7-authorization-contract.test.ts` | 5/6 | 5/6 | 5/6 |
| `tests/unit/t15-eval-harness.test.ts` | 50/50 | 50/50 | 50/50 |

s7 is the same documented pre-existing red as before
(`.hermes/reports/2026-09-01-algorithm-live-loop/closing-runs/four-count-4f83405f-failures.txt:9`).
`run-acceptance.test.ts` grew from 22 to 29 cases: five new argv/redaction cases,
the discriminating REQUIRED case, and the short-unknown-argument case.

| check | command | exit |
| --- | --- | --- |
| root typecheck | `pnpm run typecheck` | 0 |
| acceptance typecheck | `pnpm exec tsc -p acceptance/tsconfig.json --noEmit` | 0 |
| tool syntax | `bash -n .../closing-run.sh` | 0 |
| preflight only | `PREFLIGHT_ONLY=1 bash .../closing-run.sh` | 0 |

The log directory holds the same 2 files it held before any of my script runs.

### Concurrency

`acceptance/README.md` was dirty with the Task 1 seat's work when I finished the
code fixes, so I committed code and script first (`097cd35d`), waited, and touched
the README only after `git status --short acceptance/README.md` came back empty —
which happened once that seat committed `3a8193cb`. I then re-read the file, made
the edits and committed immediately with no run in between. The commit reports one
file and 50 insertions / 19 deletions; its diff shows every hunk is a placeholder
swap, a credential export line, the XREV-01 block, or one of my two paragraphs.
**No foreign hunk.**

### Corrections to my round-0 report

- Round-0 Finding 2 said `packets/readiness-ask-2026-09-16.md` still showed the old
  command and was owed. The reviewer checked and it is **stale**: that file already
  shows the environment shape (`:160`) and already documents the refusal
  (`:258-259`). Nothing is owed there. I record the correction rather than leaving
  the wrong claim standing.
- Round-0 Finding 1 said I had left the proof blocks' environment lists alone
  deliberately. The reviewer was right that this made two printed commands fail on
  paste; finding 3 closes it, and XREV-01 now has the block it never had.

### Still open after this round

- **The ceremony has still not been run end to end.** The child's inheritance of
  `ACCEPTANCE_SERVICE_CREDENTIAL`, and the absence of the credential from a real
  ceremony log, rest on `bash -n`, the explicit `export`, the refusal's position
  above every write, and POSIX semantics — not on a witnessed run. Unchanged from
  round 0, and unchangeable under the rules.
- **The three live proofs were not executed.** Their README blocks are now complete
  and their argument handling is typechecked, but no proof was run.
- **`OUTDIR` is not redirectable** in `closing-run.sh` (`:41`), so the "no log was
  written" assertion is an unchanged-listing measurement rather than an isolated-
  directory one. Making `OUTDIR` overridable would be a change to a line this task
  was not asked to touch, so I did not make it; naming it as a possible follow-up.
- **`describeToken`'s length bound is a constant** (`acceptance/run-acceptance.ts:66`,
  32 characters) rather than derived from `supportedArguments`. Deriving it would
  couple the redactor to the set and make the bound self-maintaining; I judged the
  constant clearer, and the longest supported name today is 25 characters, so there
  is real headroom. Flagging the judgement call rather than burying it.

---

## Follow-up round — the re-check's two Minors

Re-check verdict: all eight round-1 findings ADDRESSED, spec MET, quality Approved,
with two new Minors in the fix diff. Both closed in one commit.

| sha | subject | files |
| --- | --- | --- |
| `169e413a` | `fix(acceptance): deduce the redaction bound, and stop a placeholder inviting an invented port` | `acceptance/run-acceptance.ts`, `acceptance/run-acceptance.test.ts`, `acceptance/README.md` |

### Minor 1 — the redaction bound was a literal, and an untrue one

**Changed:** `acceptance/run-acceptance.ts:61-73`. The literal `32` became

```
const longestSupportedArgumentLength = Math.max(
  ...[...supportedArguments].map((argument) => argument.length)
);
```

so the bound IS the longest name the parser supports (25 today,
`--composition-budget-tier`), read off the set itself. The comment cites V's rule
and names the drift in both directions: above the longest name it quotes tokens it
should redact, and the day a longer flag is added it redacts the operator's own
flag instead of naming it.

**One design change came with it.** `acceptance/run-acceptance.ts:101-106` routes
the missing-value and duplicate refusals through the same `describeToken` gate as
the unknown-argument one. Before, "a supported name is never redacted" was true
only by accident — those two throws interpolated the raw name and never consulted
the bound at all, so no bound, however wrong, could have been caught there. Now
every refusal that names a token names it through one gate, and the derived bound
is what makes the guarantee hold. That is also what gives the mutant something to
kill.

**RED frame** (verbatim). The discriminating length is 28 characters: longer than
every supported name, shorter than the literal `32` it replaced, so only a DERIVED
bound redacts it.

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  acceptance/run-acceptance.test.ts > ACC-01 one-shot ceremony arguments > redacts any token longer than the longest argument name it supports
AssertionError: expected 'UNKNOWN_ACCEPTANCE_ARGUMENT:--xxxxxxx…' not to contain '--xxxxxxxxxxxxxxxxxxxxxxxxxx'

Expected: "--xxxxxxxxxxxxxxxxxxxxxxxxxx"
Received: "UNKNOWN_ACCEPTANCE_ARGUMENT:--xxxxxxxxxxxxxxxxxxxxxxxxxx"

 ❯ acceptance/run-acceptance.test.ts:144:25
    142|     const message = refusalMessage([justOverTheBound]);
    143|     expect(message).toContain("UNKNOWN_ACCEPTANCE_ARGUMENT");
    144|     expect(message).not.toContain(justOverTheBound);
       |                         ^
    145|   });
    146|


 Test Files  1 failed (1)
      Tests  1 failed | 30 passed (31)
```

**The second case** the coordinator asked for is
`acceptance/run-acceptance.test.ts:157-172`: it enumerates `supportedArguments`
from the source — anchored on the symbol, never a line number, the same technique
the SOURCE-ORDER tests in this file already use — asserts the set is non-empty so
the loop cannot pass vacuously, and then asserts every member is reported by NAME
in both the missing-value and the duplicate refusal. Nothing is added to
production: the set stays private and un-exported. That case was green at
introduction, as a property test over already-correct behaviour must be; the mutant
is its proof.

**Mutant row:**

| property | mutant | suite | result | restored |
| --- | --- | --- | --- | --- |
| the bound is the longest supported name, not a number | `longestSupportedArgumentLength = 10` | `acceptance/run-acceptance.test.ts` | RED 3 failed / 31 — the new enumeration case (`Expected: "ACCEPTANCE_ARGUMENT_VALUE_REQUIRED:--risk-tier"` / `Received: "ACCEPTANCE_ARGUMENT_VALUE_REQUIRED:[redacted: 11-character token]"`) and the two retired-ownership cases, which are now redacted instead of named | yes |

Parser pristine `shasum 17304f0a92bc37956aa20a3eee10a7feb83137e6`, re-verified after
the restore; `grep -c MUTANT` = 0.

**One consequence worth stating.** The bound moved from 32 to 25, so an unsupported
token of 26–32 characters is now redacted by length where it used to be named. That
is the correct trade under this ticket — an over-long token in a name's place is a
value, and a value must not be quoted — but it is a real, if small, loss of
helpfulness for a long mistyped flag, and it is the direct consequence of deducing
the bound rather than choosing it.

### Minor 2 — a placeholder invited an invention the file forbids

**Changed:** `acceptance/README.md:213`.
`ACCEPTANCE_GROK_RELAY_PORT=REPLACE_WITH_A_FREE_PORT` became
`REPLACE_WITH_THE_PORT_V_SUPPLIED`. `acceptance/README.md:98-99` says GROK-01
"does not invent or seed a port number before V ratification", and my sweep had
told the reader to do exactly that, nine lines below the prohibition.

**The full audit** of every placeholder that sweep (`4b80482a`) rewrote, against
the wording it replaced. Four more had quietly dropped their attribution; two more
had weakened a cross-reference; four were faithful and are unchanged.

| line | before the sweep | after the sweep | verdict | now |
| --- | --- | --- | --- | --- |
| `:107` dual-maker DB port | `<port>` | `REPLACE_WITH_A_FREE_PORT` | no attribution to lose; the proof starts its own embedded database on a caller-chosen port, so "free" is true | unchanged |
| PRO-01 DB / API / SHIM | `<free port>` | `REPLACE_WITH_A_FREE_PORT` | faithful | unchanged |
| PRO-01 GROK relay | `<V/operator-supplied port>` | `REPLACE_WITH_A_FREE_PORT` | **the reported defect** — "V supplies it" became "pick any" | `REPLACE_WITH_THE_PORT_V_SUPPLIED` |
| PANEL-01 DB / API / SHIM | `<free port>` | `REPLACE_WITH_A_FREE_PORT` | faithful | unchanged |
| XREV-01 DB / API / SHIM | (block did not exist) | `REPLACE_WITH_A_FREE_PORT` | new in round 1, modelled on PANEL-01, an isolated proof | unchanged |
| runtime env DB port | `<V/operator-supplied fixed local port>` | `REPLACE_WITH_THE_FIXED_LOCAL_DATABASE_PORT` | attribution dropped | `REPLACE_WITH_THE_FIXED_LOCAL_DB_PORT_V_SUPPLIED` |
| runtime env API port | `<V/operator-supplied API port>` | `REPLACE_WITH_THE_API_PORT` | attribution dropped | `REPLACE_WITH_THE_API_PORT_V_SUPPLIED` |
| runtime env shim port | `<V/operator-supplied shim port>` | `REPLACE_WITH_THE_SHIM_PORT` | attribution dropped | `REPLACE_WITH_THE_SHIM_PORT_V_SUPPLIED` |
| runtime env sample rate | `<V/operator-supplied 0..1 rate>` | `REPLACE_WITH_A_RATE_BETWEEN_0_AND_1` | attribution dropped AND turned into "pick one in range" | `REPLACE_WITH_THE_0_TO_1_RATE_V_SUPPLIED` |
| UI `NEXT_PUBLIC_API_BASE` | `<ACCEPTANCE_API_PORT>` | `REPLACE_WITH_THE_API_PORT` | a cross-reference to the variable set above, weakened to a generic name | `REPLACE_WITH_THE_SAME_ACCEPTANCE_API_PORT` |
| UI `DIALECTICAL_API_BASE` | `<ACCEPTANCE_API_PORT>` | `REPLACE_WITH_THE_API_PORT` | same | `REPLACE_WITH_THE_SAME_ACCEPTANCE_API_PORT` |

Six corrections in all: the one reported, four dropped attributions, and the two
weakened cross-references (counted as one row each above).

**And a guard against the next sweep.** `acceptance/README.md:288-294` adds a
paragraph to the placeholder rules: a placeholder must keep the MEANING of what it
stands for, `_V_SUPPLIED` means V or the operator supplies the number and the
reader does not invent one, `A_FREE_PORT` means the opposite and is correct only
for the isolated proofs, and the one must not be simplified into the other. The
bracket rule alone did not prevent this; the meaning rule is what would have.

**RED frame:** none — documentation. The measurement is the audit table above, and
the fenced-block angle-bracket count is still **0**.

**Placeholder census at the new tip**, as a check that the correction is complete
and consistent:

| placeholder | occurrences |
| --- | --- |
| `REPLACE_WITH_A_FREE_PORT` | 10 — all isolated-proof ports (dual-maker 1, PRO-01 3, PANEL-01 3, XREV-01 3) |
| `REPLACE_WITH_THE_43_CHARACTER_CREDENTIAL` | 4 |
| `REPLACE_WITH_THE_SAME_ACCEPTANCE_API_PORT` | 2 |
| `REPLACE_WITH_THE_PORT_V_SUPPLIED` | 1 |
| `REPLACE_WITH_THE_FIXED_LOCAL_DB_PORT_V_SUPPLIED` | 1 |
| `REPLACE_WITH_THE_API_PORT_V_SUPPLIED` | 1 |
| `REPLACE_WITH_THE_SHIM_PORT_V_SUPPLIED` | 1 |
| `REPLACE_WITH_THE_0_TO_1_RATE_V_SUPPLIED` | 1 |

No `A_FREE_PORT` survives outside an isolated proof, which is the property the
defect violated.

### Gate (at the new tip `169e413a`)

| suite | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| `acceptance/run-acceptance.test.ts` | 31/31 | 31/31 | 31/31 |
| `acceptance/ceremony.test.ts` | 2/2 | 2/2 | 2/2 |
| `acceptance/dod-facts.test.ts` | 35/35 | 35/35 | 35/35 |

`run-acceptance.test.ts` went from 29 to 31: the discriminating-length case and the
supported-set enumeration.

| check | command | exit |
| --- | --- | --- |
| acceptance typecheck | `pnpm exec tsc -p acceptance/tsconfig.json --noEmit` | 0 |
| root typecheck | `pnpm run typecheck` | 0 |

### Concurrency

`git status --short acceptance/README.md` was empty before I opened the file and the
Task 1 seat's `3a8193cb` was already in. The commit reports three files
(75 insertions / 13 deletions) and its README diff is eleven placeholder lines plus
my one paragraph. **No foreign hunk.**

### Still open

Unchanged from round 1, and none of it is closable under the standing rules: the
ceremony has not been run end to end, so the child's inheritance of
`ACCEPTANCE_SERVICE_CREDENTIAL` and a real log's cleanliness remain reasoned rather
than witnessed; the three live proofs were not executed; and `OUTDIR` in
`closing-run.sh:41` is still not redirectable, so "no log was written" rests on an
unchanged directory listing. The round-1 note about `describeToken`'s bound being a
constant is now resolved by Minor 1 and is withdrawn.
