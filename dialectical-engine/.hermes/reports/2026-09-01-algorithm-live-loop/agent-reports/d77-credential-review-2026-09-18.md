SKILLS LOADED: superpowers:verification-before-completion

# Task 2 review — the service credential leaves the command line (F-CREDENTIAL-ON-ARGV)

Blind review of `7bae9806..382d9d0c` by an independent reviewer (Claude Opus 5). Read-only on the
checkout: nothing was edited, staged, stashed, or run against a real credential, and the ceremony was
never started. HEAD has since moved to `04406d03` (two other seats committed after this task); I
confirmed with `git diff --stat 382d9d0c..HEAD -- <the seven paths>` that **every file of this diff is
byte-identical to the reviewed tip**, so the file reads below are the reviewed content.

What I ran myself (read-only): `git log` / `git diff --stat` / `git status --porcelain` on the reviewed
paths; `bash -n` on the tool (exit **0**); the verbatim O6 sweep; four focused greps. I re-ran no
suite — the implementer's runs stand as reported, and the two claims I could cheaply falsify
(`bash -n`, the O6 sweep) I tried to falsify and they held.

---

### Spec Compliance

**O1 — the credential is read from the environment and nowhere else. ✅**
`acceptance/run-acceptance.ts:103` reads `environment[credentialEnvironmentKey]`; the key constant is
`acceptance/run-acceptance.ts:44`. Absent/blank → `ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED`
(`:104-106`, via `.trim().length === 0`); not 43 of `[A-Za-z0-9_-]` → `ACCEPTANCE_SERVICE_CREDENTIAL_INVALID`
(`:107-109`). Both codes and the regex are byte-identical to the old ones, so their readers keep
working. The third parameter defaults to `process.env` (`:84`) and, being a default parameter, is
evaluated per call — no module-load capture. `values.get("--service-credential")` is gone; the only
remaining read of the credential is the environment one.

**O2 — `--service-credential` on argv is refused, first, without the value. ✅**
`acceptance/run-acceptance.ts:93-97` is the **first statement of the function body** — above the
duplicate-`--serve` check (`:100-101`), above `argumentMap(...)` (`:102`), and therefore above both
the unknown-argument throw (`:62-63`) and the missing-value throw (`:66`). It scans the RAW argument
list, so the `--serve` filter at `:102` cannot hide a token from it: all four brief-named positions
(alone, with a value, before other arguments, after `--serve`) reach the same `includes` and are
refused. The message (`:94-96`) interpolates only the two literal constants `--service-credential` and
`ACCEPTANCE_SERVICE_CREDENTIAL`; there is no `{ cause }` and no template hole a runtime value could
reach. `--service-credential` is also removed from `supportedArguments` (`:46-56`), so even with the
refusal deleted the old shape cannot be parsed — the mutant matrix's `UNKNOWN_ACCEPTANCE_ARGUMENT`
receipt confirms that. *(The `=`-joined spelling is not one of the four positions the brief names, so
O2 is met; it is nevertheless a real hole — Important #1.)*

**O3 — `tools/closing-run.sh`. ✅**
No credential argument at the invocation (`:117`, now `"$@"` only). The child's inheritance is
guaranteed by a real `export` (`:99`), not a bare shell variable. Header `:3-5` shows the new two-line
shape; the echoed command at `:109` no longer shows `--service-credential <env>`; the
`credential: present in the environment (length N); never logged` line is untouched at `:108` and still
prints only a length. `PREFLIGHT_ONLY=1` exits at `:91-94`, **above** the first credential read at
`:95`, so the preflight genuinely needs no credential. `bash -n` exit 0 — I ran it. Every arrow in the
script is the Unicode `→` (`:52-58`); the only ASCII `->` anywhere in the seven files is
`acceptance/run-acceptance.ts:366`, the pre-existing PostgreSQL `->>` inside a SQL string, which is
executable code and not a documentation arrow. The new prose at `:7-11` and `:110` is prose, not a
measurement dressed as a command, and the one `$`-prefixed line (`:109`) is a true command.

**O4 — the README shows the new command and says why in plain words. ✅**
`acceptance/README.md:233-236` is the export-then-run block; `:238-243` is the plain sentence
("a process's arguments are visible to every user of the machine through the process list for the whole
of the run while its environment is not"). The block is safe to paste as-is: no `<`, `>`, `|`, `$` or any
other metacharacter, and the placeholder is 40 characters, so a premature paste ends in
`ACCEPTANCE_SERVICE_CREDENTIAL_INVALID` before anything is started or spent. This is the lesson of the
2026-09-17 incident applied correctly.

**O5 — tests, RED first. ✅ (the RED frames themselves ⚠️ not independently re-run)**
Every case the brief lists is present and, more importantly, every one of them *can fail*: `:26` env
accepted and returned (removing the env read throws `REQUIRED` → red); `:30` / `:34` absent and blank →
`REQUIRED`; `:39` 42 characters → `INVALID`; `:49-55` the four argv positions — with
`--service-credential` no longer in `supportedArguments`, deleting or demoting the refusal yields
`UNKNOWN_ACCEPTANCE_ARGUMENT:--service-credential` instead, so both the *existence* and the *precedence*
of the refusal are genuinely pinned, the "alone" case being the sharp one; `:58-67` the message case
initialises `message = ""` before the `try`, so a parser that does not throw at all fails the
`toContain` — it cannot pass vacuously. All five pre-existing cases (`:70`, `:88`, `:95`, `:101-103`,
`:109`) are re-expressed with the environment as the third parameter and still assert what they
asserted, including `--serve` first and `--serve` last. No test in the file touches the real
`process.env` — every call passes an explicit environment — so the suite can neither be polluted by nor
leak a real credential. ⚠️ Re-creating the RED frames would require mutating the checkout, which this
review is forbidden to do; I take them from the report.

**O6 — the sweep. ✅ (independently verified)**
I re-ran the brief's grep verbatim at the current tip. Fourteen hits, identical to the report's table,
and every one is the plan of record, the refusal constant (`run-acceptance.ts:41`), its tests
(`run-acceptance.test.ts:45,49-52,61`), a sentence explaining the refusal (`README.md:242`,
`closing-run.sh:9`), the dated board ticket, or `acceptance/main.ts:272` — the session-purpose literal
`"acceptance-service-credential-not-login-capable"`, which is not argv. No live use of the old shape
survives. I also checked the orchestrator-owned `packets/readiness-ask-2026-09-16.md`: it already shows
the environment shape (`:160`) and already documents the new refusal (`:258-259`), so the report's
Finding 2 ("still shows the old command") is stale — nothing is owed there.

**O7 — the gate. ⚠️ / ✅**
`bash -n` = 0, verified by me. The five suites × 3 runs, both typechecks and the `PREFLIGHT_ONLY=1` run
are ⚠️ as-reported: I was instructed not to re-run them, and re-running the preflight would execute real
maker binaries. The s7 5/6 is the documented pre-existing red and matches the brief's expectation. The
contract change was the right thing to check across the tree, and I did: `grep -rn
"parseAcceptanceArguments"` finds callers only in the three proofs, the test file, and `main()` at
`acceptance/run-acceptance.ts:488` — all updated or default-compatible. **No stale caller exists**, and
`acceptance/main.ts` never called the parser, so leaving that file closed was correct.

**⚠️ Could not verify from the diff:** the RED frames; the suite and typecheck numbers; that the ceremony
child really receives the variable in a live run (the implementer names this himself under UNVERIFIED —
the `export` at `:99` plus POSIX inheritance is sound reasoning, not a witnessed run).

---

### Strengths

- **The refusal is placed where it actually works.** First statement, over the raw list, before the
  `--serve` filter and before `argumentMap` — so position, spacing and the presence of other arguments
  cannot route around it. Dropping the name from `supportedArguments` as well means two independent
  mechanisms would have to fail before the old shape could be parsed again.
- **The message is clean by construction, not by care.** It interpolates two `const` literals. There is
  no path by which a runtime value reaches it, no `cause`, no stringified argv — I looked for exactly
  that and there is nothing to find.
- **The tests cannot pass vacuously.** The `try/catch` case seeds an empty message; the four positional
  cases now collide with a *different* error if the refusal moves or dies. That is a suite that earns
  its green.
- **The README block is the incident lesson applied properly** — a placeholder with no shell
  metacharacters, two genuinely pasteable lines, and a failure mode that costs nothing.
- **`PREFLIGHT_ONLY` ordering was preserved**, so the one safe way to exercise the tool still needs no
  credential. Easy to break; not broken.
- **The report is honest where it matters** — it names its UNVERIFIED items, it names the behaviour
  change it imposed on the three proofs, and it flags its own judgement calls (the `includes` match, the
  extra `export`) instead of burying them. Three of my findings started from its own disclosures.

---

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

**1. `acceptance/run-acceptance.ts:93` — the `=`-joined spelling walks past the refusal, and its value is
then printed into the run log.**
`arguments_.includes(credentialArgument)` is an exact-token test, so `--service-credential=<value>` — the
most common way a CLI user writes a flag — does not match. The token then reaches `argumentMap`, which
throws `UNKNOWN_ACCEPTANCE_ARGUMENT:<token>` at `acceptance/run-acceptance.ts:63` **with the whole token,
credential included**. `main()` (`:488`) has no `catch`, so Node prints that message to stderr, and
`closing-run.sh:117` redirects the child's stderr (`2>&1`) into the persisted ceremony log. The one
outcome this ticket exists to prevent — the credential's value coming to rest somewhere durable — still
happens, for a spelling the operator is likelier to reach for than the one that is refused. The operator
also gets a generic unknown-argument line instead of the specific reason, which is the exact failure O2
names.
*Fix:* match the prefix too — `arguments_.some((a) => a === credentialArgument || a.startsWith(credentialArgument + "="))` —
keeping the message value-free, and add a `{ position: "joined with =", argv: ["--service-credential=" + offeredOnArgv] }`
row to the `it.each` table at `acceptance/run-acceptance.test.ts:49-52` plus one line in the
"never repeats the offered value" case.

**2. `.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh:109` — the tool writes its own
argv into the log before the ceremony can refuse it.**
`echo "\$ ./node_modules/.bin/tsx acceptance/run-acceptance.ts $*"` interpolates `$*`, and the whole block
is flushed to `$LOG` at `:112` — *before* the ceremony starts at `:117`. So an operator who types
`bash closing-run.sh --service-credential <value>` (habit, or an old run record) has the credential
written verbatim into `logs/closing-run/ceremony-<stamp>.log`, a file this mission keeps as evidence, and
the new refusal fires too late to prevent it. The echo is pre-existing in shape, but this task rewrote
that exact line while closing this exact class of leak, and the honest answer to "are the tool's printed
lines still free of the value?" is currently "only if the operator does not make the mistake the ceremony
now anticipates".
*Fix:* refuse the token in `"$@"` at the top of the script, above `:103`, mirroring the parser (a `case`
over `" $* "` that exits with a typed message), or echo a fixed, argument-free line and record the extra
arguments separately after filtering.

**3. `acceptance/README.md:189-199` and `:204-208` — the change silently invalidated the two proof commands
the README tells the operator to run.**
Both blocks enumerate every environment variable their proof needs and end in the `tsx` invocation.
`ACCEPTANCE_SERVICE_CREDENTIAL` is not among them, because until this change the proofs carried their own
placeholder credential on argv. Pasted as written today, both die at `ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED`.
The compensating prose exists — `:247-250` says the same exported variable supplies the three proofs — but
it lives ~45 lines further down, in the ceremony section, after the blocks it corrects; XREV-01 has no
block of its own and is covered by that prose only. Nothing is spent and the error is loud and typed,
which is why this is not Critical; but an operator instruction that fails on paste is a defect this change
introduced, in a file it edited, and the fix is one line per block.
*Fix:* add the key to the env list in each block, or — better, and consistent with the new style — a
preceding `export ACCEPTANCE_SERVICE_CREDENTIAL=REPLACE_WITH_THE_43_CHARACTER_CREDENTIAL` line.

#### Minor (Nice to Have)

**4. `acceptance/run-acceptance.ts:63` — the generic unknown-argument error echoes the raw token.**
Pre-existing and outside the diff, but it is the channel Important #1 travels down, and it has a second
mouth: `tsx acceptance/run-acceptance.ts <bare credential>` puts the value at an even index, where it
becomes the "name" and is printed in full. Eliding over-long tokens, or describing rather than quoting
anything that matches `/^[A-Za-z0-9_-]{43}$/`, would close both at the source.

**5. `.hermes/.../closing-run.sh:97-98` — the comment's stated reason for the `export` is not quite true of
shell semantics.** A variable the operator set *without* exporting never reaches `bash closing-run.sh` at
all, so `:95` would already have refused; and the `VAR=… bash closing-run.sh` prefix form is already
exported for the child. The `export` is correct and worth keeping (it covers the sourced case and makes
the inheritance explicit at the point of use) — only the sentence overstates what it rescues.

**6. `acceptance/README.md:105-107`, `:189-199`, `:204-208`, `:218-226` — pre-existing fenced blocks still
carry unquoted `<…>` placeholders** (`ACCEPTANCE_DB_PORT=<free port> \`, `…<V/operator-supplied fixed local
port>`), i.e. bare `<` and `>` inside a `text` fence in a file this task touched. Not introduced here, and
the task's own new block at `:233-236` is exemplary — but the 2026-09-17 rule as the plan states it is
file-scoped, and a `>` followed by a line continuation is precisely the shape that truncates a file when
pasted. Worth sweeping in the same pass as Important #3, since it is the same two blocks.

**7. `acceptance/run-acceptance.test.ts:29-36` — the two `REQUIRED` cases do not discriminate direction.**
`{}` and `{ ACCEPTANCE_SERVICE_CREDENTIAL: "   " }` throw `REQUIRED` whether the credential is read from
the environment or from argv, so they survive an argv-read mutant; the whole weight of "from the
environment and from nowhere else" rests on `:26` and `:39`. The implementer's own mutant 3 shows this
honestly (4 reds, not 6). Nothing is wrong — the cases pin real behaviour — they just read stronger than
they are. One case asserting that `parseAcceptanceArguments(["--question","x"], asOf, {})` throws
`REQUIRED` *while argv carries values* would close the gap.

**8. The credential is never trimmed before validation** (`acceptance/run-acceptance.ts:103-109`): blank is
`REQUIRED`, but a trailing newline is `INVALID`. Correct and loud, and the regex guarantees no whitespace
survives into `serviceCredential` — but operators who build the variable from a file will meet it, and one
clause in the README's 43-character sentence would save a support round-trip.

---

### Assessment

**Task quality: Needs fixes.**

All seven outcomes are met, and the core of the change is genuinely well-built: the refusal is first, over
the raw list, immune to the `--serve` filter, backed by a second mechanism in `supportedArguments`, and
carries a message that cannot hold a value — with tests that fail if any of that is removed. But two paths
remain by which the credential's value still comes to rest in a persisted ceremony log (the `=`-joined
spelling that walks past the refusal into a token-echoing error, and the tool's own `$*` echo written
before the refusal can fire), and the README's two proof commands no longer work as printed. All three are
small, local fixes; none requires rethinking the design.

---

## Scoped re-check 1

Scope: verdict each of the eight findings, and inspect `097cd35d` + `4b80482a` for new breakage. Nothing
else. Still read-only: no edit, no mutant, no git state change. I confirmed with
`git diff --stat 4b80482a..HEAD` that the four fixed files are unchanged since the fix tip and clean in the
worktree, so my reads are the fixed content. The package's two commits contain no foreign hunk — every
README hunk is a placeholder swap, an export line, the XREV-01 block or one of the two new paragraphs;
none of `3a8193cb`'s register-version work appears.

Measured by me this round (read-only, no credential, nothing started): `/bin/bash` here is **3.2.57** and I
probed the new refusal loop's exact construct under it in the scratchpad; an awk scan of every fenced block
in the README; the longest supported argument name; Node's JSON `SyntaxError` text; zod 4.4.3's rejection
text. I did not re-run the suites.

### Finding Verdicts

**1 (Important) — the `=`-joined spelling walked past the refusal → ADDRESSED.**
`acceptance/run-acceptance.ts:128-129`: `arguments_.some((argument) => argument === credentialArgument ||
argument.startsWith(...))`. `--service-credential=<value>` and the empty `--service-credential=` now reach
the refusal, which is still the function's first statement and still interpolates only the two constants
(`:130-133`) — so the token that CARRIES the value inside itself is never named. Tests:
`acceptance/run-acceptance.test.ts:81-83` (three `=` rows) and the value-absence assertions for that
spelling at `:98-101`. The defect no longer exists, not merely "attempted".

**2 (Important) — the tool wrote its own argv into the log → ADDRESSED.**
`.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh:33-38`: a `for`/`case` over `"$@"`,
the first executable statement after `set -u` (`:27`) — above `M=`/`OUTDIR=` (`:40-41`), above
`mkdir -p "$OUTDIR"` (`:115`), and ~90 lines above the `$*` echo (`:124`) and its flush (`:127`). Both
spellings, `exit 7`, the message a fixed string on **stderr** with no `$a` in it. This is a structural
guarantee, not a timing one: after `exit 7` no path has been computed and no log has been named.

**3 (Important) — the proof commands did not work as printed → ADDRESSED.**
`acceptance/README.md:209` (PRO-01), `:225` (PANEL-01) and a new XREV-01 block at `:233-239` — each now
opens with `export ACCEPTANCE_SERVICE_CREDENTIAL=REPLACE_WITH_THE_43_CHARACTER_CREDENTIAL`, and `:241-244`
says plainly that the export belongs in the operator's own shell and is shown only to make the block
complete. Pasted verbatim, the placeholder is 40 characters, so a premature run ends in `…_INVALID` before
anything starts or spends. XREV-01 gained the block it never had.

**4 (Minor) — the unknown-argument error quoted the raw token → ADDRESSED.**
`describeToken` (`acceptance/run-acceptance.ts:79-84`) routed in at `:92`. Credential-shaped →
`[redacted: looks like a credential]`; longer than the bound → length only, never a prefix. I checked the
closure myself: any token that *contains* a 43-character credential is itself ≥43 characters, hence over the
32 bound, hence redacted by the second branch; a token of exactly 43 characters *is* the credential and is
caught by the first. The two remaining raw interpolations in the same function
(`ACCEPTANCE_ARGUMENT_VALUE_REQUIRED:${name}` at `:95`, `DUPLICATE_ACCEPTANCE_ARGUMENT:${name}` at `:96`)
are unreachable unless `supportedArguments.has(name)`, so `name` there is always one of the nine literals —
safe by construction, not by luck. `credentialPattern` (`:59`) is now the single constant the validator
(`:143`) and the redactor share, so they cannot drift.

**5 (Minor) — the `export` comment overstated shell semantics → ADDRESSED.**
`closing-run.sh:110-113`. The replacement sentence is true on all three counts: both normal launch shapes
already export it; an unexported variable never reaches the script (so `:108` would already have refused);
the line makes inheritance explicit and covers the sourced case. `export` at `:114` stays.

**6 (Minor) — fenced blocks still carried bare angle brackets → ADDRESSED.**
Verified by my own scan, not the report's: an awk pass toggling on each fence line over the on-disk
`acceptance/README.md` reports **zero** body lines containing `<` or `>`. The swaps are at `:107`,
`:210-214`, `:226-227`, `:236-237`, `:255-259`, `:371-372`, and `:296-300` adds a paragraph telling the next
editor why. (Angle brackets remain in prose, e.g. the `/debate/<run-id>` URL — correct; the rule is about
what a paste can execute.)

**7 (Minor) — the two REQUIRED cases did not discriminate direction → ADDRESSED.**
`acceptance/run-acceptance.test.ts:58-61` is the case I asked for, verbatim:
`parseAcceptanceArguments(["--question", "x"], asOf, {})` must throw `REQUIRED`. It discriminates against a
parser that takes the credential from *some argv value*, which — since the credential's own flag is now both
refused and absent from `supportedArguments` — is the only argv read that could still exist. The new
`refusalMessage` helper (`:27-38`) returns `""` when nothing was thrown, so the message assertions still
cannot pass vacuously.

**8 (Minor) — the trailing-newline case was undocumented → ADDRESSED.**
`acceptance/README.md:285-292`: names the case, names the shape that produces it
(`…=$(cat some-file)`), says to strip it, and says why the parser does not trim — "a credential is used
exactly as given or not at all". No code changed, correctly.

### The five judgement questions

**(a) Remaining spellings that could put a credential into a message, a `cause`, stderr or the log.**

| spelling | verdict |
| --- | --- |
| `--service-credential <value>` | **CLOSED** — refusal, constants only |
| `--service-credential=<value>`, `--service-credential=` | **CLOSED** — prefix match at `run-acceptance.ts:128-129` |
| bare 43-character token at an EVEN index (a name position) | **CLOSED** — `credentialPattern` branch, `describeToken:80` |
| `--unknown=<43 chars>`, and any token CONTAINING a credential | **CLOSED** — every such token is ≥43 chars, so the length branch (`:81-83`) redacts it without a prefix |
| `ACCEPTANCE_ARGUMENT_VALUE_REQUIRED:` / `DUPLICATE_ACCEPTANCE_ARGUMENT:` | **CLOSED by construction** — only reachable for a supported name |
| the credential as the VALUE of a legitimate flag | **OPEN — out of scope**, and not Important. See below. |

I measured the three sub-cases of the open one rather than guessing. `--question <credential>`: accepted,
becomes the question text, and is persisted and printed — the only *complete* disclosure, and it is an
accepted value, not an error echo. `--risk-tier <credential>`: rejected by zod **without** naming the value
(zod 4.4.3 prints `Invalid option: expected one of "casual"|"standard"|…` — I ran it). `--depth-params
<credential>`: `ACCEPTANCE_ARGUMENT_JSON_INVALID:--depth-params` whose `cause` is Node's `SyntaxError`,
which embeds the **first 10 characters** of the input (measured on Node 26.5.0) and is printed in the cause
chain of an uncaught error. None of this is Important for this task: any value on argv is already in the
process list for the life of the process whatever the parser does, no document suggests typing the
credential there, and `parseJson`'s `{ cause }` (`:106`) is pre-existing and untouched. One generalisation
would close the whole class — refuse ANY argv token matching `credentialPattern`, in any position, in the
parser and in the script's loop — and it belongs in a follow-up ticket rather than here, because it changes
the contract for legitimate 43-character values.

**(b) The script-level refusal.** Before anything is written: yes, structurally — `exit 7` at `:37` is ~78
lines above `mkdir -p "$OUTDIR"` (`:115`). Both spellings: yes (`:35`). Without echoing the value: yes —
the message at `:36` is a fixed string and `$a` appears nowhere in it; it goes to stderr. Reachable when the
token is not first: yes — it is a loop over all of `"$@"`, and I confirmed it by running the identical
construct with the token in last position, in both spellings: `exit=7` each time. `PREFLIGHT_ONLY=1` still
reads no credential: the loop reads no variable, and the preflight exit (`:104-106`) is still above the
first credential read (`:108`). **One trap I specifically went looking for and did not find:** `"$@"` under
`set -u` with zero positional parameters aborts on bash ≤ 4.3, and `/bin/bash` on this host is **3.2.57** —
but the `for a in "$@"` form survives it (probe: `LOOP-SURVIVED args=0`), so the no-argument and
`PREFLIGHT_ONLY` invocations are safe on the oldest interpreter here.

**(c) The README sweep.** Every fenced block is free of bare `<`/`>` (my scan: zero). The PRO-01, PANEL-01
and XREV-01 instructions work as printed. The sweep changed the meaning of one instruction — see New
Breakage #1.

**(d) The redaction's false positives.** None that matters. The longest supported argument name is
`--composition-budget-tier` at **25** characters (measured), seven under the bound, so no legitimate name
and no plausible typo of one is ever hidden; `acceptance/run-acceptance.test.ts:124-126` pins that a short
unknown argument is still named in full. A 43-character *name* would be redacted as credential-shaped, but
that is not a thing an operator types. The only real cost is an unknown flag longer than 32 characters,
which I do not consider realistic.

**(e) The `OUTDIR` proof.** Adequate — but because of where the refusal sits, not because of the listing.
"No log was written" follows structurally from `exit 7` preceding both `OUTDIR=` and `mkdir -p`; the
unchanged listing corroborates it. A name-only listing would be weak evidence on its own (it cannot show an
append to an existing file), though here the tool only ever creates a fresh `ceremony-$STAMP.log`, so "no
new file" is the right observable. An override IS worth a ticket: the same file already uses that idiom
twice — `R="${R:-…}"` at `:41` and the `ACCEPTANCE_*_BINARY` overrides at `:44-46` — so
`OUTDIR="${ACCEPTANCE_CLOSING_RUN_OUTDIR:-$M/logs/closing-run}"` would be consistent with the script's own
style and would let a future seat measure log behaviour without writing into the mission's evidence folder.
The implementer was right not to take that line unasked.

### New Breakage in the Fix Diff

**1. `acceptance/README.md:214` — the sweep changed one instruction's meaning. Severity: Minor.**
`ACCEPTANCE_GROK_RELAY_PORT=<V/operator-supplied port>` became `REPLACE_WITH_A_FREE_PORT`. The same file at
`:98-99` says Grok's relay port is operator-supplied and that "GROK-01 … does not invent or seed a port
number before V ratification". "A free port" invites exactly the invention that sentence forbids.
*Fix:* `REPLACE_WITH_THE_V_RATIFIED_GROK_RELAY_PORT`. Two further swaps drop the "V/operator-supplied"
provenance but keep a definite article and so still point at a given value (`:255`
`REPLACE_WITH_THE_FIXED_LOCAL_DATABASE_PORT`, `:257` `REPLACE_WITH_THE_API_PORT`); `:259`
`REPLACE_WITH_A_RATE_BETWEEN_0_AND_1` keeps the range. Those three are acceptable as written; only the Grok
one actively misleads.

**2. `acceptance/run-acceptance.ts:66` — `longestSupportedArgumentLength = 32` is a misnomer and a hand-set
bound. Severity: Minor.** No supported argument is 32 characters long — the longest is 25 — so the constant
asserts something untrue, and if a longer flag is ever added the redactor will silently stop naming it in
its own refusal. The implementer disclosed the judgement call.
*Fix:* derive it (`Math.max(...[...supportedArguments].map((a) => a.length))`) or rename it to what it is,
e.g. `maximumQuotableTokenLength`.

No Critical or Important breakage. I checked the two cross-cutting risks the fix creates: the changed
`UNKNOWN_ACCEPTANCE_ARGUMENT` message has no consumer outside `acceptance/run-acceptance.test.ts` (whose
cases all use short names) and one dated mission record; and nothing in the repository keys off
`closing-run.sh`'s exit codes, so the new `7` collides with nothing.

### Out-of-Scope Observations

- **One ticket would close the whole remaining class:** refuse any argv token matching `credentialPattern`
  in any position, in `parseAcceptanceArguments` and in the script's loop. That covers the credential typed
  as the value of `--question` or `--depth-params`, and the same mistake made at the script
  (`bash closing-run.sh --depth-params <credential>` still reaches `$*` at `closing-run.sh:124`). It is a
  contract change for legitimate 43-character values, which is why it is a ticket and not a fix here.
- **An `OUTDIR` override** in `closing-run.sh:41`, per (e) — small, idiomatic for that file, and it makes
  the tool measurable.
- **The new XREV-01 block copies PANEL-01's environment list** (`:236-237`: DB, API and shim ports only)
  while PRO-01's lists four more keys. If PANEL-01's shorter list is right, XREV-01's is too — both proofs
  reach the runtime the same way — but neither block was executed, and I did not verify the runtime's
  required-key set, which is outside this diff.
- `acceptance/run-acceptance.ts:92`'s `name === undefined ? "undefined"` branch is unreachable for a dense
  array; harmless, and it preserves the old `String(name)` output.

### FINAL VERDICT

**Spec: MET** — O1–O7 stand, and nothing in the fix round weakened them; the refusal is still first, the
codes and the return shape are still unchanged, and the O6 sweep still comes back clean.

**Quality: Approved.** All eight findings are closed at the code, not merely attempted: I re-derived each
one from the fixed files rather than from the report, and the two things I doubted most — the bash 3.2
`nounset` trap in the new loop, and whether the redaction really covers every token that contains a
credential — both came back clean when measured. The two new Minors are a documentation placeholder that
now says "a free port" where the file elsewhere requires a ratified one, and a constant whose name
overstates what it is; neither blocks the task.
