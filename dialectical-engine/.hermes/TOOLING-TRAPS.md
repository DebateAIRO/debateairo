# TOOLING-TRAPS — append-only. Read before you start; append what cost you time.

Format: one bullet per trap — the trap, the symptom, the fix. Newest at the bottom.
Every entry below was paid for at least once. Do not pay for it again.

- `git checkout <sha> -- <path>` **STAGES** the change; a follow-up `git checkout -- <path>`
  restores from the index — the WRONG version — and porcelain shows an easy-to-skim `M `.
  Use `git checkout HEAD -- <path>` or `git reset --hard HEAD`, and print
  `git status --porcelain` after EVERY restore. (verify-c5-lens; nearly dirtied a tree
  three review lenses depended on)
- vitest **deduplicates identical assertion errors** across tests and prints the shared
  error once. Grepping output for an assertion string names the WRONG assertion — the code
  frame is not the failure. Read the `❯ file:line` marker; only that names what fired.
  (verify-c5-lens; a mutant was mis-attributed to the wrong arm)
- `hermes kanban --board <slug> show <ticket>` **truncates** long text and JSON. Long
  comment threads need repeated indexed `jq` slices. Board flag goes BEFORE the verb;
  `comment` takes the body as a positional arg (no `--file`); `edit` requires `--result`.
  (s02-exhaustive-1; 32 comments read in slices)
- macOS: **no `timeout`** command · **`rg` may be absent** from PATH (use grep) · BSD
  `awk` treats `index` as a **builtin** — using it as a variable name is a syntax error.
  (three seats, three missions)
- `codex exec` **hangs awaiting EOF** unless stdin is closed (`< /dev/null`), and **echoes
  its prompt**, so marker-counting monitors false-positive on the echo. Count marker
  OCCURRENCES or use colon-suffixed forms; better, watch the board's comment count.
  (responsive-ui; two monitor false positives)
- Heredoc-generated launchers: an unquoted delimiter **eats `$vars`** silently — three
  reviewers once never launched. NEVER generate a launcher without reading it back and
  confirming its log file appears within 2 minutes. Verify per-lane log paths are
  DISTINCT — an inherited log path blinded a watchdog. (responsive-ui)
- zsh: `K="cmd with args"; $K more` does **no word splitting** — the whole string is one
  word. Repeat the full command or use an array. (observability-loop) Same trap with
  `set -- $var` in a loop: `$1` gets the WHOLE string, `$2` is empty (bash splits; zsh does
  not). Use `${=var}` or pass args explicitly. **Tell:** a tool rejects an id that `show`
  accepts, and its error quotes several of your arguments joined by spaces as ONE token —
  that is the shell, not the tool, so print your argv before theorising. (Cost 3 probes and
  2 wrong hypotheses on 2026-08-29 because the Router did not read THIS FILE first.)
- tsx treats a scratchpad `.ts` file outside a package as **CJS** — top-level await fails.
  Name scratch files `.mts`. (observability-loop)
- Relative packet paths break silently: lane launchers `cd` into worktrees that carry
  STALE packet copies, and a colliding name loads the wrong packet with no error. Packet
  paths are ABSOLUTE, with an existence guard, verified to resolve from the seat's cwd.
  (observability-loop; measured blast radius zero by luck alone)
- `stderr` byte counts are **not tree pins**: every probe carries its own error-token
  length, so three lenses measured three different values and all were correct. The
  durable property is paired-arm byte identity, never an absolute count. (S05)
- **A worktree makes a blind lens blind to FILES, not to the BOARD.** REV-00 (public-debate-access,
  2026-08-29) had a provably clean worktree and still saw a sibling seat's ticket via
  `hermes kanban --board <slug> show <other-ticket>`; it disclosed the leak and discounted its
  own predictions, which is the right behaviour but is not containment. If blindness matters,
  say in the packet WHICH ticket ids the lens may read (its own) and that `list`/`show` on
  sibling tickets is out of contract — the filesystem cannot enforce this for you.
- **`pgrep -f` is not a reliable liveness probe for agent seats, and 0-byte logs are not death.**
  (public-debate-access, 2026-08-29.) Two healthy `claude` seats read as DEAD on both signals
  at once: `pgrep -fc 'claude -p|claude --continue'` returned 0 while `ps -Ao command | grep`
  showed both pids running, and their tee'd logs sat at 0 bytes because `claude -p` writes its
  output at COMPLETION, not incrementally. Either signal alone would have justified killing a
  working seat. Causes: agent argv is enormous (the whole prompt is an argument), and pgrep's
  pattern matching against very long argument lists is unreliable.
  **Probe liveness with `ps -Ao pid,etime,command | grep '[c]laude'` and treat an empty log as
  NO EVIDENCE, never as failure.** Corollary, and it is the real fix: keep big prompts OFF
  argv — pass a short goal pointer naming an absolute packet path, the way the grok seats are
  launched. A prompt on argv is visible in `ps` to every user on the box, too.
- **A stagnation watchdog must distinguish HUNG from PARKED-AT-A-HUMAN-GATE.** (public-debate-access,
  2026-08-29.) The 20-minute law fired correctly — zero change across logs, mission docs, board and
  pids — but the cause was that every seat had exited cleanly and the mission was waiting on V's
  approval of the mission graph. That is the DESIGNED resting state, not a stall: there was no
  unfinished session to preserve and nothing to kill. Firing the full alarm there teaches the human
  to ignore the alarm, which costs you the one time it is real.
  **Fix:** before alarming, check (a) are any agent processes alive, and (b) are there open rows on
  the mission's V-DECISIONS-PACKET. Zero agents + open V rows = PARKED, report it and keep watching.
  Agents alive, or no open V row = real dead air, alarm and halt. Verify the row-counting probe
  returns a NONZERO count before trusting it — a silently-broken grep restores the false alarm.
  **Verify the PID probe in BOTH directions with a positive control.** `pgrep -x grok` / `-x codex`
  also match an unrelated user grok session and ChatGPT.app's bundled `codex`, neither of which ever
  exits — that made "agents alive" permanently true and turned the PARKED branch into dead code.
  Scope the probe to the mission slug in the seat's own command line, then prove it fires positive
  (`exec -a "claude -p ... mission <slug>" sleep 25` and confirm a hit) AND negative. An always-empty
  probe is the mirror failure: it reports PARKED forever and never alarms at all.
  **And verify the kill took.** Replacing a watchdog left the OLD one running beside the new one, both
  writing the same status file; a plain `kill` on a process sleeping inside `perl select` did not land.
  Re-list by PID after killing and escalate to `-KILL` — never assume a kill succeeded.
- **A blind lens's worktree strands its receipts.** (public-debate-access, 2026-08-29.) Two review
  seats correctly filed self-reports to `.hermes/reports/<mission>/agent-reports/` — inside their own
  worktrees. The main tree showed them MISSING, and the standing janitor duty ("worktrees" between
  attempts) would have deleted both, turning the ledger into a floor with no warning. Isolation that
  is good for blindness is bad for receipts.
  **Fix:** collect every seat's artifacts back to the main tree AT SEAT EXIT, before any janitor pass —
  the orchestrator contract already says receipts are cheapest the moment a seat reports; this is why.
  Never run worktree cleanup before the ledger is verified complete in the MAIN tree, by name, per seat.
- **READ THE CLOCK ON YOUR EVIDENCE. Three false diagnoses in one session, same root cause.**
  (public-debate-access, 2026-08-29 — the Router's most expensive habit that day.)
  1. Declared an architecture seat had SKIPPED its mandated skills — sampled it MID-FLIGHT at 6m40s,
     before it reached them. It complied fully. The false figure was already written into permanent
     protocol law across 12 files before the correction.
  2. Declared two seats DEAD — their `claude -p` logs were 0 bytes because claude writes at
     completion, and `pgrep -f` missed them on long argv. Both were alive and working.
  3. Declared a watchdog probe BLIND — its status file was written 2 minutes BEFORE the seat
     launched. The probe was correct; the file was stale. "Fixed" something that was not broken.
  **Every one was a snapshot whose timing went unchecked.** A periodic reporter has a clock IN its
  output — read the timestamp and compare it to the event before you believe the content. A running
  process has a start time (`ps -o lstart=`) — compare it. A seat that has not exited has not
  finished; never conclude compliance, liveness or completeness from one that is still running.
  **Rule: before reporting any negative finding from an observation, state when the observation was
  taken and when the thing it describes happened. If you cannot, the finding is not ready.**
- **Symlinking the ROOT `node_modules` into a git worktree does NOT give you a working pnpm
  workspace — and a narrow baseline test will not reveal it.** (public-debate-access, 2026-08-29.)
  The Router linked the main tree's 923M `node_modules` into two coding worktrees to avoid two
  reinstalls, then "verified a clean baseline" by running ONE architecture test file, which passed.
  It passed because that file imports nothing from a sibling workspace package. The first coding
  seat to run a repo-wide `tsc --noEmit` was blocked immediately by `TS2307: Cannot find module
  '@debateai/evaluator'` on UNTOUCHED code, while the same command in the main tree was clean.
  Cause: pnpm's workspace links live in PER-PACKAGE `node_modules` link farms, not only at the root,
  so a root-level symlink reproduces none of them.
  **Also dangerous:** running `pnpm install` in a worktree whose `node_modules` is still a symlink
  writes into the MAIN tree. Remove the symlink first, then install, then confirm the main tree is
  undamaged.
  **Rule: a baseline is only a baseline if the command you ran is the command the lane will run.**
  Run the repo-wide check (`tsc --noEmit`, the real suite), not a convenient subset — a subset that
  passes for a reason unrelated to your change is an unrepresentative positive control, and it will
  send a seat into a wall you already had the means to find.
- **`codex exec resume` accepts NO sandbox flag — options belong to `exec`, before the subcommand.**
  `codex exec resume "$SID" "<prompt>" -s danger-full-access` AND
  `codex exec resume -s danger-full-access "$SID" "<prompt>"` both die with
  `error: unexpected argument '-s' found`; `codex exec resume --help` lists no `-s/--sandbox` at all.
  The working form is **`codex exec -s danger-full-access resume "$SID" "<prompt>"`** — verified by
  live probe, not inferred from the usage string. Note this differs from the non-resume form, where
  a trailing `-s danger-full-access` IS accepted, which is exactly why the wrong form looks right.
  **The launcher still exits 0** (that is `tee`'s status, not codex's), and the only evidence is a
  usage message where the transcript should be. **Read the seat's LOG after every launch — an exit
  code of 0 through a pipe proves nothing.** Cost three launch attempts on 2026-08-29 because the
  first two fixes were inferred from `Usage:` rather than probed.
- **Validate the artifact the SEAT will read, not the one you have open.** (public-debate-access,
  2026-08-29 — the Router made this mistake twice in one hour, the second time WITH a gate running.)
  The orchestrator edits the main tree; a worktree does not see those edits until they are copied.
  A rework landed a corrected PLAN in the main tree; the Router told the seat "PLAN FIXED, re-read
  it" and resumed — the seat's worktree copy was 91 lines behind and still contained the exact
  defect that had blocked it. It blocked again, correctly, and also caught that the ticket had been
  commented on but never actually moved out of `blocked` state.
  **Three rules, all cheap:** (1) after ANY rework, sync the corrected artifacts into every
  worktree that will read them, and diff to prove it; (2) run the pre-dispatch gate against the
  SEAT'S paths — validating your own copy certifies a wall as clear; (3) a comment is not a state
  change — if a ticket says `blocked`, `unblock` it, because the seat reads the board, not your
  prose. Never tell a seat a precondition holds unless you have just checked it AT THE SEAT'S PATH.
- **A command that CRASHES exits nonzero too — "RED" means nothing until you prove the command RAN.**
  (public-debate-access, 2026-08-29. The Router's worst self-inflicted wound of the mission.)
  `vitest 4.1.10` removed `--reporter=basic`; it dies with `Startup Error: Failed to load custom
  Reporter from basic` before executing a single test. All four mission PLANs used that flag **32
  times** (17/6/7/2), including every cluster verification command. The Router's own pre-dispatch
  gate ran them, saw nonzero exits, and scored them **"pre-fix RED (discriminates)" — certifying
  broken commands as healthy evidence.** That is false confidence, which is strictly worse than no
  gate at all.
  **Compounding failure, and the real lesson:** the Router had hit this identical error personally,
  an hour earlier, running the baseline. It fixed its OWN invocation and moved on without asking
  "what else uses this flag?" — fixing the instance, not the class, hours after ratifying
  fix-the-class as spine law.
  **Rules:** (1) classify a command's outcome as BROKEN / GREEN / RED, never just zero-vs-nonzero —
  grep the output for `startup error`, `unexpected argument`, `failed to load`, `usage:`,
  `command not found`, `cannot find module`; (2) when a tool rejects YOUR invocation, immediately
  grep the whole repo for that flag before moving on; (3) an acceptance command must be RUN by its
  AUTHOR at authoring time, not merely written down.


## A guard that steals the exit status (2026-08-29, cost: one seat's fifth block)
`cmd | grep -q PATTERN` is not a test assertion. `grep -q` exits on first match and closes
the pipe; the producer then writes to a closed pipe. Node dies with an unhandled `EPIPE`
error event — and the PIPELINE STILL EXITS 0, because the status belongs to grep. Measured
on vitest 4.1.10: stderr carried `node:events:497 throw er; // Unhandled 'error' event`
plus two EPIPE mentions while `$?` was 0. The command cannot tell a pass from a crash.
The one idiom, in every acceptance command:
    out=$(pnpm exec vitest run <file> 2>&1); rc=$?
    printf '%s' "$out" | grep -qE 'Tests +[0-9]+ passed'
Assert on BOTH `$rc` and the summary match. Capture first, then assert — the consumer reads
a string, so it can neither close a pipe nor steal a status.

## Do not let the gate condemn the fix it mandates (same day, caught before dispatch)
The first version of the pre-dispatch STOLEN check flagged any command whose last pipe stage
was `grep -q`/`head`/`wc`. Tested against eight known cases, it flagged the CORRECT
capture-first idiom too — it would have blocked the seat for doing exactly what it was told.
The discriminator is not "ends in grep -q", it is "is the runner UPSTREAM OF A LIVE PIPE".
Commands that capture first (`out=$(...)`, `rc=$?`) are exempt. General rule: **before
shipping a checker, run it against known-good input, not only known-bad.** A checker
validated only on failures has never been shown to pass anything.

## Silent caps are how a gate reports coverage it never had
The same gate ran `head -10` over the acceptance commands with no notice. On a PLAN with more
than ten it would print a clean bill of health for a set it never examined. Now it counts the
total, honours `PDG_CAP` (default 40), and WARNS with the exact number skipped. If a check
bounds its own coverage, it must say so in its output — an unstated bound reads as
"everything passed".

## The worktree root is NOT the project root here (2026-08-29)
This repo's git root is `DebateAIRO/`, one level ABOVE `dialectical-engine/`. So a worktree
at `.worktrees/prog-a-s01` contains the project at
`.worktrees/prog-a-s01/dialectical-engine/`. Running an acceptance command at the worktree
ROOT gives `No test files found, exiting with code 1` for EVERY command — which is
indistinguishable, at a glance, from a uniform healthy pre-fix RED. The Router hit this and
came within one step of filing a false finding against a seat whose commands were correct.
Resolve the level holding `package.json` before running anything; the gate now does this and
FAILs if it cannot find one.

## "Ran and failed" is not the same as "ran" (the gate's second false-RED)
Measured on vitest 4.1.10 in this repo:
  - nonexistent test file  -> exit 1, `No test files found` — ran ZERO tests
  - `-t` filter matching nothing -> **exit 0**, `Tests 19 skipped (19)` — ran zero tests and
    SUCCEEDED, so the exit code alone blesses a vacuous run
The gate's BROKEN signature list did not contain `no test files found`, so case 1 was scored
"RED — ran, and failed — discriminates." It discriminated nothing. Signature list widened to
include `no test files found|no tests found|0 passed (0)`.
Case 2 is why the `Tests +[0-9]+ passed` guard is load-bearing rather than decorative: vitest
returns 0 for a filter that matches nothing, and only the summary-line assertion catches it.
**Two independent signals — the runner's own status AND the summary — because each one alone
has a blind spot the other covers.**

## Validate a checker on known-GOOD input, not only known-bad
Stated once already above and re-earned the same day: the STOLEN check, the BROKEN signature
list, and the run-directory resolution were each wrong in a way that only showed up when run
against inputs that were CORRECT. A checker exercised only on defects has never been shown to
pass anything, and its first false positive lands on a seat that did the work right.

## READ THE CLOCK ON YOUR SNAPSHOT, not just its name (2026-08-29, second instance)
The Router "verified" that a rework round had left S01/S02 untouched by byte-comparing all
four PLANs against copies in a review worktree, described in its own head as a PRE-ROUND
SNAPSHOT. The copies were taken at 15:05:30 — about ninety seconds INTO a round dispatched at
15:04, and AFTER the seat had already written S03 (15:05:14) and S04 (15:05:22). The
comparison reported all four identical, which is exactly what it would report whether or not
the seat had changed anything, because it was comparing the post-edit state to itself. It was
structurally incapable of detecting the change it appeared to rule out.
`stat -f '%Sm'` on the four files against the round's dispatch and exit times settled it in one
command: S01 14:57 and S02 14:58 predate the round (genuinely untouched), S03/S04 fall inside
it (correctly edited).
This is the same shape as the three acceptance-command variants that cost this mission three
rounds — a check that looks like verification and verifies nothing. **Naming an artifact
"baseline" or "pre-round" does not make it one. Timestamp it against the event it is supposed
to bracket, before you draw a conclusion from it.**

## `grep -c` counts LINES, not occurrences (residual, not currently a defect)
Server-rendered HTML often puts an entire list on one line, so `curl ... | grep -c MARKER`
returns 1 whether the page contains one item or fifty. Sound for a NEGATIVE assertion ("must
return 0") — which is how S03-C3-3 uses it. Unsound the moment someone reuses the idiom for a
positive count claim. Measured here: `grep -c '/public/debate/'` returned 1 while
`grep -o '/public/debate/' | wc -l` returned 2 on the same response.

## Variant 4: an UNANCHORED guard matches text that is not the summary (2026-08-29)
`grep -qE 'Tests +[0-9]+ passed'` searches the ENTIRE captured output. Vitest prints skipped
test TITLES on their own lines. So a test whose title contains the substring `Tests <n> passed`
satisfies the guard on a run that executed nothing:

    it("Tests 1 passed is in the title")  +  -t "feature-not-written-zzzz"
    observed: vt=0 guard=0  -> COMPOUND PASSES
    real summary: "Tests  2 skipped (2)"
    guard matched: "↓ …/pollution.test.ts > router B1 probe > Tests 1 passed is in the title"

Clean control with no polluting title: `vt=0 guard=1` -> correctly fails.

The working form, verified against a 7-case hostile matrix:

    out=$(pnpm exec vitest run <file> [-t "<pat>"] 2>&1); vt=$?
    sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
    printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
      && ! printf '%s' "$sum" | grep -q 'failed'; guard=$?
    [ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]

Three properties, each load-bearing: ANCHOR to the summary line; require a NONZERO pass count;
reject a summary containing `failed`.

## The family, four variants deep — the actual through-line
1. gitignored path — could never observe its own change
2. `--reporter=basic` (removed in vitest 4.1.10) — crashed BEFORE running anything
3. `| grep -q` on a live pipe — crashed DURING the run and stole the exit status
4. unanchored guard — read text that was not the summary

Each fix was correct. Each left a different way for a command to look like verification and
verify nothing. Naming the variants is not the lesson; the lesson is that **an acceptance
command must be tested against inputs designed to make it lie**, not merely run once and seen
to be green. Every one of these four was found by someone running the command in a hostile
configuration — a vacuous filter, a missing file, a polluted title — never by reading it.
The pre-dispatch gate now carries checks for all four, and the hostile matrix lives with it.

## The gate condemned a correct plan — third instance of the same authoring mistake (2026-08-29)
After widening the BROKEN signature list to include `no test files found`, the gate would have
flagged EVERY S02 cluster as BROKEN and blocked the slice. S02's work IS writing the render
tests, so a missing test file is its legitimate pre-fix RED — the PLAN says so explicitly
("RED, genuinely: same 'No test files found' shape, exit 1").
The rule had been validated against S01, where the file SHOULD already exist, and never against
S02, where it MUST NOT yet. Correct distinction, now implemented: `no test files found` is
BROKEN only when the missing path is **not declared anywhere in the PLAN**. If the PLAN names
the file, its absence is the expected RED; if it does not, the path is wrong or the working
directory is.
Third time in one session that a checker I wrote was wrong in a way only correct input revealed
(STOLEN flagged the mandated idiom; the "pre-fix" label was printed on a dirty tree; this).
**Validate every checker on known-GOOD input. A checker exercised only on defects has never been
shown to pass anything, and its first false positive lands on someone who did the work right.**

## A lens worktree needs `pnpm run generate:contract`, not just `pnpm install` (2026-08-29)
REV-03 could not run `tests/unit/s8-publication.test.ts` at all: `@debateai/contract/generated/
client.ts` was missing, because `packages/contract/generated/**` is GITIGNORED and therefore
absent from a fresh worktree checkout. A real `pnpm install` does not create it — the generator
does. The reviewer worked around it honestly (architecture-file runs plus title simulation) and
said plainly what it could not do, but it lost the strongest available evidence.
**Lens/worktree setup is: `pnpm install` THEN `pnpm run generate:contract`.** Verify by
`test -f packages/contract/generated/client.ts` before dispatching, not after the seat blocks.

## Two seats independently reached the same two conclusions (worth trusting, 2026-08-29)
Without contact, the Router and the Grok lens both concluded: (1) a raw `| grep -q` COUNT is a
broken completeness metric because it RISES when the correct capture-first idiom is added — a
provenance matcher is needed instead; and (2) `curl | grep -c` must NOT be condemned as
status-stealing, because for a COUNT probe the exit status belonging to grep is the design, and
the class under review was a test RUNNER's status being stolen. Convergence from two blind
positions is the strongest signal this harness produces; when it happens, stop re-deriving.

## A fix can introduce the next variant of the family it is fixing (2026-08-29)
The architecture seat's own ledger addendum, unprompted and unsoftened: round 3 of the
acceptance-command thread closed variant 4 (the unanchored guard) AND, in the same pass,
introduced variant 5. Its non-blocking fix added new multi-pattern presence arms, written with
the PLAN's established `\|` escaping convention, **without running them live**. One of those new
arms — the five-pattern S01-C2 presence arm — was not merely fragile but UNPASSABLE, measured at
`Tests 21 skipped (21)` against a finished implementation.
The seat's own words on the irony: the exclusive-provenance invariant it wrote that same round
was violated by its own output before the DECISIONS entry was saved.
**Two rules fall out.** (1) A round that fixes a verification defect must run the verification it
just wrote — the RED-before-GREEN discipline applies to the fix, not only to the thing fixed.
(2) Copying an established convention into new code is not a safe default when the convention
itself has never been executed; conventions inherit whatever was wrong with their first use.
Router note on provenance: the mission docs are untracked, so there is no git history to date
when the `\|` convention originated. The seat's account is consistent with the measurement that
C2's five-pattern arm was new in round 3, but the convention's own origin is UNVERIFIED here —
recorded as unverified rather than assumed.

## Variant 6: an acceptance pinned to ABSOLUTE LINE NUMBERS (2026-08-29)
`sed -n '153,220p' file | grep -c SYMBOL` is an acceptance whose correctness depends on the file
NOT CHANGING, whose entire purpose is to verify that the file DID change. It is the purest member
of this family. Both directions of it are live in this repo:
  - POSITIVE assertion drifts and FAILS LOUDLY: the map-redact calls moved to lines 236-237 when
    an explicit-projection remedy expanded the file; the acceptance returned 0 against a CORRECT
    implementation. A seat caught this.
  - NEGATIVE assertion drifts and **PASSES VACUOUSLY**: "forbidden fields must be absent from
    lines 153-175" returned 0 and passed — but that range had become unrelated code
    (`auditPreflightDenial`) while the envelope construction moved to ~226-240. A negative
    assertion over the wrong region ALWAYS succeeds. Nothing would ever have flagged it.
**The negative case is the one that ships.** Whenever a range-pinned assertion is a NEGATIVE
("must not contain"), drift converts it silently into a permanent pass.
Worst detail: one broken range (`contract 252,260`) was invalidated by a relocation THE SAME PLAN
mandated. The document pinned a coordinate and, elsewhere, required the edit that moved it.
Remedy shape: anchor on the SYMBOL, not the line. And any negative assertion must be shown
capable of failing — make it fail on purpose once, or it is not a test.

## The family, six variants — the standing summary
1. gitignored path — could never observe its own change
2. `--reporter=basic` (removed in vitest 4.1.10) — crashed BEFORE running
3. `| grep -q` on a live pipe — crashed DURING the run and stole the exit status
4. unanchored guard — matched a skipped test's TITLE, not the summary
5. markdown-escaped `\|` in `-t` — a JS-regex literal pipe matching nothing; "fixed" downstream
   by naming tests with literal pipes, so the PASS came from a test's NAME
6. absolute line ranges — observes the wrong place; silent when the assertion is negative
Variants 1 and 6 are mirrors: one cannot see its target, the other sees something else and
reports on it. **Every one was found by RUNNING the command in a hostile configuration, never by
reading it.** Five of six were found by a seat other than the one that wrote it.

## Do not invent the assertion you are auditing (2026-08-29, Router error, caught by a seat)
Auditing 8 line-range acceptances for drift, the Router ran ITS OWN invented grep pattern against
each range and reported any range returning 0 as "drifted". One of those ranges,
`contract 252,260`, holds `PublicDebateSummarySchema` — a perfectly coherent block that the
invented pattern simply did not mention. The Router had never read what that acceptance actually
asserts. It went into a dispatch brief as a measured defect.
The architecture seat re-measured, found it did not reproduce, and **reported that plainly rather
than silently "fixing" a defect that did not exist** — refutation duty working exactly as designed.
Two smaller errors in the same brief: a step mislabelled `S01-C4-2` when it is `S01-C2-3`, and
"four files" when it is three.
**Rule: to audit an assertion, run THE ASSERTION. The moment you substitute your own pattern for
the one under test, you are measuring your pattern, not the acceptance.** Same family as every
other defect this mission chased — a check whose result traces to something other than the fact
it claims.

## The gate caught the Router's own signature failure, unprompted (same day)
Re-running the pre-dispatch gate after an architecture round, check 2b reported: worktree PLAN
DIFFERS from the one being validated, 1921 vs 2147 lines. The Router had edited the main-tree PLAN
and not synced it to the seat's path — which is verbatim the defect the S01-CODE self-report
charged it with ("assertion without readback at the seat's exact path and execution context") and
which had already cost two separate blocks earlier in this mission.
It cost nothing this time because the check fired first. **This is what mechanizing a recurring
human error buys: the third occurrence is caught by a script instead of by a blocked seat.**

## A RECURSIVE rule applied in ONE PASS (2026-08-29) — the subtlest defect of this mission
The redaction rule, correct as written: *a field is REDACTED iff its producer assigns it a value
identical to, or derivable from, **an already-redacted field's** source value or any owner-only
ledger pointer.*
The phrase "an already-redacted field's" makes the redacted SET an INPUT to the rule. So the rule
is recursive, and redacting a field can pull further fields into the class.
What happened: round 1 redacted `node.provenance_ref` — correctly. The instant it did,
`base_score.source` became a class member, because the judgement producer sets
`source_ref = rawArtifactRef`, the same value. Nothing re-ran the sweep against the enlarged set,
so `base_score.source` shipped still carrying the secret while all three of its siblings were
redacted.
**At the time of the round-1 sweep, `base_score.source` genuinely was NOT in the class. It became
a member as a consequence of round 1's own decision.** That is what makes this invisible to a
careful one-pass reviewer: the field was correctly classified when it was classified.
**Rule: when a classification rule references its own output, applying it once is not applying it.
Iterate to a FIXED POINT — sweep, and if the set grew, sweep again, until a pass adds nothing —
and record how many passes it took and what each added. That count is the evidence the rule was
applied recursively rather than once.**
Generalises well past redaction: taint analysis, permission inheritance, cache invalidation,
dependency closure, "which tests are affected by this change". Any rule whose premise mentions
its own conclusion has this shape. Also note the process lesson: the rule itself was written down
correctly and still failed, because its APPLICATION PROCEDURE was never stated. An unstated
procedure is not a safeguard.

---

## VARIANT 7 of the acceptance-command family: the "command" is not a command
Found 2026-08-29, in the PRE-DISPATCH GATE ITSELF — the instrument built to catch the other six.
The gate extracted acceptance commands with `grep -oE 'Acceptance test:\*\* `[^`]+`'`. That
assumes every backticked string in that position is runnable. It is not. A PLAN legitimately uses
the same position two ways:
  **Acceptance test:** `pnpm exec vitest run tests/unit/x.test.ts`     <- a command
  **Acceptance test:** `tests/render/y.test.tsx` renders the drawer... <- the FILE the assertion lives in
Four of nine extracted "commands" for S02 were bare `.test.tsx` paths. The gate ran each through
`zsh -lc`, got `no such file or directory` (nonzero), and printed:
    RED  pre-fix RED (ran, and failed — discriminates)
It never ran and it discriminates nothing.
**This is strictly worse than variant 1.** A gitignored path could at least turn green for the
wrong reason. A `.tsx` file is never executable, so this reports RED in EVERY state of the code —
including a perfectly correct implementation. It would have gone on "confirming" the four most
important feature-assertion clusters were properly RED, and then masked a genuinely broken build
later, because its answer never changes.
**Rule: before trusting a nonzero exit as evidence, confirm the thing you ran was a COMMAND.**
First token resolvable via `command -v`, unless the string carries shell syntax (`=`, `$(`, `&&`,
`|`, `;`) in which case the test does not apply. Generalises: any harness that harvests commands
out of prose must verify it harvested a command. "It exited nonzero" and "it ran" are different claims.

## The coverage number that describes only what it could see
Same gate, same day, found by patching it. It printed:
    NOTE  9 distinct acceptance commands found; running 9
"9 of 9" reads as total coverage. The PLAN has **22** `Acceptance test:` steps. Ten of them state
their acceptance in PROSE ("the new test file passes, AND additionally asserts a pinned count of
..."), so they produced no command, never entered the set, and were never counted as missing.
The denominator was silently redefined to the subset the tool could parse.
**Rule: a coverage count must be stated against the count of things that EXIST, not the count of
things the tool managed to extract.** Report `N of M`, and NAME the M−N it could not handle. Same
family as the `head -10` silent cap recorded earlier in this file: both are tools describing their
own reach while sounding like they describe the work.

## Do not let the gate condemn the well-formed input (recurrence #2)
When variant-7 detection was added it initially set the BLOCKING flag. That would have failed
closed on every correctly-written PLAN, because a PLAN backticking the file an assertion lives in
is not a defect. But the gate genuinely CANNOT distinguish its own extraction artifact from a real
unrunnable acceptance. Resolution: make it **loud and named, non-blocking**, and say explicitly
that it cannot tell the difference and the cluster command must be run by hand.
**Silence was the bug. Blocking is not automatically the fix.** A check that cannot discriminate
should say so, not vote.

---

## Blindness is a property of the COMMIT, not of what you copied
Found 2026-08-29 by REV-05, **filed against the Router, and disclosed rather than exploited.**
Building a blind lens: worktree cut at `4138f72`, then only the two files under review copied in.
The author's self-report was deliberately not copied. But `S03-CODE-codex.md` had been **committed
at `4138f72`** as part of the mission-record commit, so an 8KB copy of the author's reasoning was
sitting in the lens tree from the moment it was created. Not copying a file does not withhold it.
**And the blindness check I ran PASSED.** It was:
    git status --porcelain | grep -q 'agent-reports'   # → no match → "OK: no self-report in lens"
A committed, unmodified file is *clean* in `git status`. The check asked **"was it modified?"**
when the question was **"does it exist?"** — it returned the right-looking answer for a reason
entirely unrelated to the property it claimed to verify. Same family as everything else in this
file, now in the review setup rather than in an acceptance command.
**Rule: verify blindness by PRESENCE, not by diff status** — `test -e` / `git ls-tree` the path in
the lens, and prefer cutting the lens from a commit that predates the artifact, or deleting the
artifact from the lens after creation. Generalises: any "X is absent" guarantee must be checked
with an existence test, never with a change-detection test. `git status` answers a question about
*change*; absence is a question about *state*.

---

## The escaped pipe is CONSUMER-DEPENDENT — the same escape is correct in one place and fatal in another
Measured 2026-08-29, sweeping all four PLANs after variant 5 reappeared (variant 9). This is the
class rule that two earlier rounds missed, and it is **not** "never escape pipes":

| Consumer | `\|` means | Verdict |
|---|---|---|
| `grep` **BRE** (its default) | **alternation** | **CORRECT** — measured: escaped matched 2 lines, bare `\|` matched 0 |
| `vitest -t` (a **JS regex**) | a literal pipe | **BROKEN** — matches nothing (variant 5) |
| `node -e` (**JS source**) | `\|\|` → `Expression expected` | **BROKEN** — SyntaxError (variant 9) |
| a **shell pipeline** | an escaped literal argument | **BROKEN, AND SILENT** — no pipeline is built at all |

**A blanket unescape breaks five currently-correct `grep` commands. A blanket "leave them" leaves
three broken ones.** Any fix must ask what consumes the string.

### The worst instance: the mission's own "safe" idiom was permanently red
S01's cluster acceptance — the capture-first pattern this mission adopted *because* it was safe —
has its shell pipes escaped in the PLAN. The shell then passes `|`, `grep`, `-E` and the pattern to
`printf` as plain arguments and builds no pipeline. Measured on both arms:

    passing summary → escaped guard=1 ; correct guard=0
    failing summary → escaped guard=1 ; correct guard=1

The escaped guard is **permanently 1** — the trailing `! printf … | grep -q 'failed'` term is always
false, so the summary is never examined. The cluster ends `[ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]`,
so the acceptance can never pass in any state of the code. **Variant 7's signature delivered through
variant 5's mechanism, inside the pattern adopted to prevent exactly this.**

### The generating condition, which is the actual thing to fix
A raw `|` breaks a markdown table cell. So every command stored in a table cell is under pressure to
escape, and **the escape is invisible in rendered markdown** — a reader sees `||` and a correct
pipeline. Only *extraction and execution* reveals it. Hence: do not store executable commands in
table cells (use labelled fenced blocks, as S01's clusters were later moved to), and make the gate
extract-and-run rather than eyeball. Removing the existing occurrences was never a class fix,
because it left the pressure that generates them untouched.

## Fixing one instance of a leak is not fixing the leak
Immediate recurrence of the blindness trap above, same day, in the fix for it. The remedy applied
to the round-2 lens deleted the ONE file named in the finding — the author's self-report. Eleven
agent-reports were tracked at the lens's base commit, so ten others (Architecture's full reasoning,
three prior reviewers' findings, another coder's self-report) stayed readable for the first minutes
of the re-review.
**A leak is a CLASS — every artifact of that kind at that path — not the instance that was
reported.** Sanitize by glob at lens creation and verify by existence; then state, in the receipt,
that the window existed and ask the lens whether it read anything, because from outside you cannot
tell. Same lesson as "fix the CLASS not the instance," here applied to a review-setup guarantee
rather than to code.

---

## Disjoint WRITE surfaces do not imply independent EFFECTS
Found 2026-08-29 when S02's coding seat blocked for the third time. All four PLANs verified their
write surfaces were mutually disjoint, and that verification was **correct** — the Router re-checked
it when a suspected S02/S03 collision turned out to be a false alarm. S02 then wrote *only* files it
owns and still broke `tests/architecture/s8-publication-contract.test.ts:170`, which asserts a string
lives in a file S02 legitimately refactored. **Nobody owned that assertion**: S04 owns lines 120–138,
S03's PLAN says its design avoids the 140–175 block.
**The missing question: which STANDING tests READ the files each slice WRITES?** Surface-disjointness
answers "will two seats collide," not "will one seat break something that watches it." Those are
different questions and only the first was asked.
Router sweep of every standing test reading the S02/S03 surfaces (full paths, no cap): S02's only
breakage is `s8-publication-contract`; `dr184-judged-standing` 6/6, `pol01-policy` 8/8,
`v2ui-pages` 42/42, `s10-erasure-ui` 3/3, `v2ui-export` 5/5 all pass. S03 is clean across all five
including `s8-publication-contract` 5/5.

## The silent cap, a THIRD time, in the tool built to find silent caps
Building the diagnostic above, the Router wrote `... | head -4` and matched on **basenames**. The
result omitted `s8-publication-contract.test.ts` — *the very test whose breakage motivated the
diagnostic*. The output looked like a complete answer.
Two compounding errors, both previously recorded in this file: a truncating cap presented as a
result, and a **loose matcher** (`page.tsx` as a basename) that produces noise while missing the
precise hit. Re-run with full paths and explicit counts, the answer was both smaller and correct.
**Rule: a diagnostic must report `N of N` with N measured, and match on the identifier that is
actually unique.** If the tool cannot show everything, it must say how much it hid. Third recurrence
of this exact shape — `head -10` in the gate, "9 of 9" coverage, now `head -4` here — which is itself
the evidence that naming a trap once does not prevent it.

## Checking half a loop is not checking the loop
Architecture's own admission when ruling the "standing tests that read this slice's writes" class,
2026-08-29, and it is the sharpest statement of the gap: **`S02/PLAN.md had already done half this
check and stopped at the wrong half of a two-element loop.`**

The standing assertion was `for (const page of [applicationPublic, webPublic])`. The PLAN's boundary
analysis considered the `web/` target — which S02 never touches, so it concluded "unaffected" — and
did not carry the same question to `applicationPublic`, which S02 refactors. The conclusion drawn
from one iteration was recorded as a conclusion about the loop.

**Rule: when a check iterates, check EVERY target it iterates, not the one that looks relevant.**
A loop's safety is the conjunction over its targets; establishing it for one member proves nothing
about the others, and "the other one is out of scope" is precisely the reasoning that hides the
in-scope one. Generalises to parameterised tests, `describe.each`, matrix CI jobs, and any
fixture list — the shape is "we verified the case we were thinking about."

## The escaped pipe does not just return the wrong answer — it performs a DIFFERENT OPERATION
Physical evidence found in the main tree 2026-08-30: an untracked 131-byte file literally named
`Sign in to start\|Your debate workspace\|tabEmptyHint`, containing
`# Netscape HTTP Cookie File ... generated by libcurl!`.

Its origin is S03's probe:

    curl -sk 'https://localhost:3000/?tab=yours' | grep -c "Sign in to start\|Your debate workspace\|tabEmptyHint"

With the shell pipe escaped as `\|`, no pipeline is built, so `curl` receives `|`, `grep`, `-c`, and
the pattern as its own arguments — and **`-c <file>` is curl's COOKIE-JAR flag.** curl therefore
wrote a cookie jar named after the grep pattern, `grep` never ran, and the "count" was never taken.
The command exited 0.

**This is the sharpest available statement of why exit codes are not evidence.** Earlier entries
recorded that an escaped pipe yields a wrong `guard` value. It is worse than that: the surviving
arguments are re-interpreted by the *first* command, which can silently take a completely different
action — write a file, set an option, change a target. A defect that only *fails* is a good defect;
this one succeeded at something nobody asked for.
Corollary for janitors: an unexplained file with a bizarre name is not noise. It is a receipt for a
command that ran differently than it read.

## The error count that under-reports: TypeScript stops at the FIRST excess property

**Measured on this repo, 2026-08-30, not inferred.**

`tests/unit/s8-publication.test.ts` constructs a `stranger_restatement` object literal carrying **two**
properties the type does not declare:

```ts
stranger_restatement: {
  check_status: "PASS",
  secret_extra: "LEAK-ME-RESTATEMENT",   // line 126
  owner_note:   "do-not-publish"         // line 127
},
```

After `NodeSchema.stranger_restatement` was changed from `.passthrough()` to `.strict()`,
`npx tsc --noEmit` exited 1 and printed **exactly one error**:

```
tests/unit/s8-publication.test.ts(126,9): error TS2353: Object literal may only specify
known properties, and 'secret_extra' does not exist in type '{ check_status: ... }'.
```

`owner_note` is equally excess and equally broken. It is not reported, because TypeScript's excess
property check reports the first offending key per object literal and stops.

**Why this belongs here.** The whole mission has been governed by counting: *how many errors, how many
findings, how many tests*. This is the compiler doing the same thing three of our own instruments did
— the `| head -4` cap, the coverage number that described only what it could see, the scan root not
tied to its artifact. **An error count is a count of REPORTS, never a count of PROBLEMS.** A seat told
"make the one error go away" will fix line 126, re-run, and meet a *new* error it was never warned
about — and if it is near its rework cap, that surprise costs a round.

**The rule:** when a type-level change breaks a literal, never brief a seat on the reported error
count. Brief it on the *shape* of the breakage and tell it to expect more of the same kind behind the
first one. Fix the whole literal, then re-run to discover what was hidden — a clean second run is the
evidence, not the first run's count.

**The trap under the trap, and it is worse.** The fix that satisfies `tsc` fastest here is to delete
`secret_extra` and `owner_note`. That turns the error count to zero and **silently destroys the only
property the test exists to prove** — that a leak-shaped key never reaches an anonymous reader. It
would be variant 11 of the acceptance-defect family: a check that now returns the right answer for a
reason unrelated to the property it claims. When a type change breaks a *deliberately invalid*
fixture, the fixture is usually the point; widen the construction (a cast), never narrow the fixture.

## Reading a document that is actively being repaired

**Happened to the Router, 2026-08-30, and it published a false alarm before it was caught.**

The Router needed to know which node fields reach an anonymous reader. It read `S04/PLAN.md`'s
checklist items 3 and 3b, which flagged `maker_lineage.provider_ref` and
`abstention.register_row_key`/`register_version`/`register_source_ref` as **UNVERIFIED**, with
`provider_ref` possibly being "an account-scoped API routing key." It wrote that into the QA packet as
the sharpest open risk in the mission, and filed a ticket saying so.

None of it was true any more. `S01/PLAN.md`'s S01-C2-0B field table had already classified both as
**COPIED (VERIFIED)** with real producer traces — `provider_ref` resolved to a static per-deployment
provider slot with literal values `"development:codex-cli"` and `"development:claude-cli"`, and the
register fields to a versioned policy table structurally identical to already-public fields. Both rows
end with the words "no longer open."

**The part that makes this a trap rather than ordinary carelessness:** the Router *knew* the checklist
was stale. A ticket existed for it (`t_5d00506b`, "S04's checklist items 3/3b are stale now that the
classification is settled upstream"). The Router had *dispatched the seat to fix it*, and that seat
was editing the file at the moment the Router was reading it. The staleness was not hidden, not
subtle, and not forgotten — it was on the Router's own work list.

**Knowing a document is stale is not the same as remembering it while reading.** The knowledge and the
read happened in different tasks, and nothing connected them.

**The rule:** before quoting a planning document as current state, check whether an open ticket
targets that document — and if a seat is running against it right now, read the seat's output instead,
or wait. A file under active repair is not evidence; it is a work in progress that happens to be
readable.

**Cheap mechanical form:** `grep` the open ticket list for the file path you are about to cite. If it
appears, the file is a hypothesis, not a fact.

**Related, and the reason this one stung:** the mission's standing lesson is *"a fixture that cannot
fail against production pins nothing."* Its sibling is this — **a document that is mid-correction
cannot support a claim, and citing it launders a stale assertion into a fresh one.** The alarm reached
a QA packet and a ticket before the seat's own output refuted it.

## Dispatching a seat against a spec that exists only in your own working tree

**Router defect, 2026-08-30. The seat caught it; nothing mechanical did.**

Architecture designed a schema split and wrote it into `docs/.../S01/PLAN.md` as step `S01-C1-7`.
The Router then moved the coding seat's worktree to commit `e879f87` and dispatched it to implement
that step. The seat came back in two minutes:

```
CODEX BLOCKED: required upstream artifact missing.
S01 PLAN ends at S01-C1-6; S01-C1-7 and t_83df0d9c are absent.
Repository-wide and all-ref searches found no authored step.
Please land or provide the complete S01-C1-7 plan step. I will not
reconstruct Architecture's specification from the dispatch summary.
```

**Architecture's edit was uncommitted.** It ran in the main tree; the worktree was checked out at a
commit that predated the edit by minutes. The 280 lines of specification existed on exactly one
filesystem path, and it was not the one the seat could see.

**Why this is a trap and not simple carelessness.** The dispatch packet *summarised* the design
accurately — the shape of the split, the file surface, the mutant. A more accommodating seat would
have implemented from the summary and produced something plausible, unreviewable against the real
spec, and subtly different from what Architecture actually ruled. **The failure would have been
invisible.** It surfaced only because the seat refused to work from a second-hand description.

**This is SYNC-01's class again.** That finding — a PLAN diverging in both directions between main
and a worktree, caught by a manual diff seconds before a merge that would have destroyed reviewed
work — produced a recommendation for sync-time snapshots and a pre-merge diff gate. Neither was
built. The recurrence is not the same *instance* (that was divergence after copying; this is absence
from never copying) but it is the same *cause*: **a worktree's planning documents and the main
tree's are related by nothing.** No mechanism keeps them in step and no gate notices.

**The rule, and it is structural rather than procedural:** a seat must obtain its specification **by
checkout, from a commit** — never by a file the Router copies in, and never by prose in the dispatch
packet. Commit the design first, move the worktree to that commit, then verify the spec file is
byte-identical between worktree and main before dispatching. If the design is too provisional to
commit, it is too provisional to implement.

**Corollary worth keeping:** *"I will not reconstruct the specification from the dispatch summary"*
is correct seat behaviour and should be praised, not smoothed over. A seat that helpfully fills the
gap converts a loud, cheap, two-minute failure into a silent one that survives review.

## The baseline that moves when you look at it

**Measured 2026-08-30. Found by a coding seat contradicting the Router, not by the Router.**

The Router had been gating merges on: *"architecture suite must show 7 failed / 263 passed, identical
failing files — not merely an identical count."* Careful-sounding, and it caught nothing, because the
baseline itself was an artifact.

A coding seat measured **6 failed / 264 passed**, three runs each side, and **reported the
discrepancy instead of adopting the Router's number.** Both measurements were correct. The Router
measured in the main tree, which contains `.worktrees/`. The seat measured inside a worktree, which
does not contain nested worktrees.

`tests/architecture/s9-dev-token-retirement-contract.test.ts` walks into `.worktrees/` — **a directory
`git check-ignore` confirms is ignored** — and counts every file there as an offender. Its failure
count therefore rises and falls with how many worktrees happen to exist on the machine at that
moment. This mission created and destroyed a dozen. **The number was a function of the Router's own
tooling, not of the code under test.**

(It also counts 37 *tracked* files under `docs/missions/2026-08-06-v3-programming/` — historical
handoffs from a previous mission. The test's own name is *"removes the header from every
**non-historical** source"*, so it has the concept and simply fails to apply it to mission docs. The
product code is genuinely clean: `git grep` finds the retired header in no non-doc source.)

**Two distinct lessons, and the second is the one that generalises.**

*First:* a scan root that walks gitignored directories polices whatever happens to be lying around —
variant 8 of the family, recurring in a standing test rather than a mission instrument.

*Second, and worse:* **"compare against the baseline" is only as sound as the baseline's own
stability, and nothing was checking that.** The Router's gate compared main-tree runs to main-tree
runs, so its conclusions held by luck of internal consistency — but it was anchoring on a number that
changed whenever a worktree was created. A baseline captured once and quoted thereafter is a
**stale-record defect wearing the costume of rigour.**

**The rule:** before gating on a baseline, establish that it is *reproducible* — same value from two
different working directories, or two runs with unrelated state changed in between. If it moves,
you have measured your environment, not the code. And when a seat contradicts your number, **check
before correcting it**: on this mission the seat was right, and the disagreement was the only thing
that surfaced the defect.

## `git checkout` said "Aborting" and I never read it

**Router defect, 2026-08-30, twenty minutes after recording the sibling lesson.**

Preparing a seat, the Router ran `git checkout -q --detach <commit>` in a worktree, then immediately
dispatched against it. The checkout had printed **`Aborting`** — it refused because leftover *staged*
files would have been overwritten — and left the worktree at a commit from hours earlier with 89
dirty entries. The seat launched against a stale, dirty tree.

**Why it slipped through, and it is not "I forgot to check".** The word `Aborting` appeared in the
output. The Router had piped the command through `tail -1` inside a larger script whose *other* lines
printed reassuring facts — the HEAD it went on to print was read from the same broken worktree, so it
faithfully reported the stale commit as though it were the intended one. **The verification and the
failure were reading the same corrupted source.** A line saying `HEAD: 4138f72` looks like evidence
until you notice nobody compared it to the commit that was requested.

**The general shape, which is this mission's whole subject:** `git checkout`, `git stash pop`,
`cp`, `sed -i` and friends fail *quietly enough* that a script wrapping them keeps going, and any
"verification" that reads state afterwards without comparing it to the *intended* state will
cheerfully confirm the failure. **Asserting a fact is not the same as asserting the fact you meant.**

**The rule:** after any command that moves a tree — checkout, reset, stash pop, clean — assert the
post-condition **against the value you asked for**, not merely that some value exists:

```
git checkout --detach "$WANT" || exit 1
[ "$(git rev-parse HEAD)" = "$(git rev-parse "$WANT")" ] || { echo "FATAL: not at $WANT"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "FATAL: tree dirty"; exit 1; }
```

**And the part that is easy to skip once you are annoyed with yourself:** before resetting the dirty
tree, the Router first checked whether those 89 staged files contained anything not already merged —
`git diff --name-only <commit>` returned **zero**. Only then was the reset performed. Standing law
here is *do not discard another mission's in-flight work*; "it looked like leftovers" is not the same
as knowing it was, and the check costs one command.

**Related:** the sibling trap recorded minutes earlier — *dispatching a seat against a spec that
exists only in your own working tree* — was about the specification. This is the same failure applied
to the **tree**: verify that the setup you performed actually took effect, not merely that you issued
it.

## claude -p buffers stdout — a silent tee log is NOT a hang (2026-08-31)
Same class as `hermes --yolo -z`. The ARCH-01 stagnation alarm fired at 20 min
on a log that structurally cannot grow before exit. Ground truth for claude -p
seats: the session transcript under ~/.claude/projects/<encoded-cwd>/*.jsonl
(grows every tool call), output-file mtimes, and process CPU time — never the
tee'd stdout log. Fingerprint those.

## Codex workspace-write cannot reach ~/.hermes — and an unassigned card is a refusable card (2026-08-31)
T9-C3 attempt 1: the seat read the spine, found its card had no assignee and no
HERMES AUTHORIZED marker, could not post WORKER CLAIM (kanban lock lives under
~/.hermes, outside workspace-write), and BLOCKED — 175k tokens, zero files, and
it was RIGHT both times. Router defects: probed CLI liveness but not the
board-write from inside the seat's sandbox (F1 class, second recurrence);
dispatched a card without assign + authorize.
Fixes that hold: assign + HERMES AUTHORIZED NEXT comment before dispatch, and
`-c sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]` —
strictly narrower than the 2026-08 danger-full-access precedent, which the
permission classifier (correctly) refused to relaunch.

- **`tee /dev/stderr` is blocked inside codex workspace-write sandboxes** ("Operation not permitted") even though the pipeline's final count still emits — a packet that quotes ADR-006's 0-new gate verbatim will print the scary tee error while the number stays correct. Workers should run the capture-first variant (redirect to a file, grep the file) and say so; reviewers must not read the tee error as a gate failure. (Found by CODE-T9C3-RW1, 2026-08-31; the gate's verbatim form stays canonical for non-sandboxed seats because /dev/stderr visibility is deliberate.)

- **This repo contains TWO TypeScript compilers and `pnpm exec` resolves the nearest one** (root pins typescript 7.0.2; apps/ui pins ^5.6.0 -> 5.9.3). Same tsconfig, same tree, DIFFERENT diagnostics: TS7 reports the side-effect `import "./globals.css"` as TS2882; TS 5.9.3 stays silent on it. Every compile gate must therefore pin the INVOCATION DIRECTORY (repo root is canonical for the ADR-006 gate), and a seat that reproduces a "phantom" baseline error should first check `pnpm exec tsc --version` from its own cwd. (Found by CODE-T9C3-REV2 N9, 2026-08-31 — the reviewer's own round-0 "layout.tsx CLEAN" record fell to exactly this.)

## zsh: loop variable `path` shadows $path (PATH array)
Found by CODE-T9C4-N1 (2026-09-01): a zsh `for path in ...` loop overwrites the special
$path array (mirror of $PATH), making commands appear missing for the rest of the shell.
Use any other variable name in zsh loops (`p`, `f`, `file`).

## codex sandbox: pnpm exec tsx -e fails with listen EPERM
Found by CODE-T1C2 (2026-09-01): `pnpm exec tsx -e '<expr>'` attempts an IPC listen the
sandbox denies. Workaround (established T9-C2): `node --import tsx -e` or write the
expression to a scratch file and run it.

## codex workspace-write blocks real loopback HTTP fixtures
Found by CODE-T1C2-RW1 (2026-09-01): the amended row-8 gate adds
`tests/unit/v2ui-ownership.test.ts`, whose `beforeAll` must bind a real HTTP server to
`127.0.0.1`. In the Codex workspace-write sandbox it crashes before assertions with
`EPERM listen 127.0.0.1`; an isolated test run and a minimal Node `createServer` positive
control reproduce it. Do not count this as a product RED or replace the socket with a mock:
run this gate in Hermes/non-sandboxed verification, or dispatch the worker in an environment
whose approved permissions allow loopback listeners.

## zsh does not word-split unquoted variables — silent watchdog false-positive
Found by the orchestrator (2026-09-01): a watchdog looping `for f in $LANES` (LANES a
space-separated string) ran ONCE with the whole string as `f` under zsh, so every `stat`
failed, the fingerprint never changed, and it reported STAGNATION while all four lanes
were actively writing. bash word-splits here; zsh does not. Use an explicit list or a
real array (`LANES=(a b c)` + `"${LANES[@]}"`) in any polling loop.

- **Vitest jsdom can expose `import.meta.url` with an HTTP scheme.** CODE-T1C3 used
  `fileURLToPath(new URL(..., import.meta.url))` in a jsdom render test and got
  `TypeError: The URL must be of scheme file` before the feature assertion ran. Cost:
  one broken RED run and one correction pass. When the acceptance command is explicitly
  pinned to the worktree root, resolve source fixtures from `process.cwd()` instead.

## Vitest can trip opaque-origin localStorage while formatting failed JSDOM element assertions
Found by CODE-T3C2 (2026-09-01): a failed equality assertion whose received value was an
array of JSDOM elements made Vitest's formatter inspect the owning opaque-origin window;
that inspection reached `localStorage` and replaced the useful mismatch with a
`SecurityError`. Assert scalar evidence from that document (counts, text, attributes, or
booleans) so a failure remains printable. This is a reporting-harness failure, not proof
that application code accessed browser storage.

## Vitest may rewrite `import.meta.url` to a non-file module URL
Found by CODE-T5C1 (2026-09-01): a jsdom dump test passed a URL derived from
`import.meta.url` to `mkdirSync` and failed with `ERR_INVALID_URL_SCHEME` before writing
the artifact. For repo-local throwaway artifacts, resolve the authorized destination from
the test command's pinned `process.cwd()` with `node:path`; this cost one failed dump run.

## zsh + vitest: an unquoted `$FILES` is ONE filter token — "No test files found" is BROKEN, not RED (2026-09-01, AUDIT-STATE)
Third recurrence of the no-word-split trap already recorded above, in a new costume: `pnpm vitest run $FILES`
(seven space-separated paths in one variable) under zsh hands vitest a single filter string. vitest 4.1.10
prints `No test files found, exiting with code 1` and its `filter:` line echoes ALL seven paths joined —
that echo is the tell. The run cost one wasted suite round and would have been filed as RED by a
zero-vs-nonzero classifier. Pass the paths literally, or use `${=FILES}`, and treat `No test files found`
as BROKEN every time (it is already in the BROKEN signature list above; the gate rule reads: never RED
until you prove the command RAN).

## `git diff/log/ls-tree -- <pathspec>` from inside `dialectical-engine/`: a git-root-relative path matches NOTHING and returns an EMPTY diff that reads as "unchanged" (2026-09-01, AUDIT-STATE)
`git show --format= --name-only <sha>` prints paths from the GIT ROOT (`dialectical-engine/apps/...`). Feeding
those back into `git diff <a>..<b> -- dialectical-engine/apps/runner/src/index.ts` while your cwd already IS
`dialectical-engine/` makes git look for `dialectical-engine/dialectical-engine/apps/...`, find nothing, and print
nothing — indistinguishable from "no change". This produced a false "dev did not move under lane-3" for one
round; the corrected run (`git -C <git-root> diff ... -- dialectical-engine/...`, or `./apps/...` from the
subdirectory) showed 166+/115- on the very file. Tell: a numstat that is EMPTY for a file you know was
touched. Rule: when a pathspec comes from `--name-only`, run the follow-up from the git root or strip the prefix.

## Claude Code Bash outputs over ~30 KB are PERSISTED with a 2 KB preview — and re-reading the persisted file overflows again (REQ-SUP, 2026-09-01)
Symptom: a `cat -n` of a 400-line file returns "Output too large … saved to …/tool-results/<id>.txt"
with a 2 KB preview; a plain `cat` of that persisted file produces a SECOND persisted file with
another 2 KB preview. Paid three times in one seat (TOOLING-TRAPS itself, a 330-line synthesis
section, three template files in one call) ≈ 6k tokens of previews and three round trips.
Fix: chunk by BYTES, not lines, under ~25 KB per call — `head -c 25000 <file>` then
`tail -c +25001 <file> | head -c 25000` — or `sed -n 'a,bp'` on ranges you know are short.
Rule of thumb: ≈ 170 bytes/line for dense markdown, so ~150 lines per call is the ceiling.

- **`hermes kanban --board <slug> show <ticket> --json` wraps the ticket under `.task`** — `.title`,
  `.status`, `.body` at the top level are `null`; use `.task.title`, `.task.status`, `.task.body`;
  comments are `.comments[]` with `.author`/`.body`/`.created_at`, and Router comments carry
  `author: "default"` (pass `--author` or the record cannot say who wrote). (REQ-FIX, 2026-09-01;
  one wasted probe)
- **`psql` is NOT on this Mac's PATH.** Every "V pastes a Postgres query" step must go through the
  container: `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "<sql>"`
  (credentials from `compose.dev.yaml`). A SPEC that says `psql …` is unrunnable by V. (REQ-FIX,
  2026-09-01; caught before 16 SPECs were written against it)
- **The obs lane worktrees live under `dialectical-engine/.worktrees/obs-lane-N`**, not under the
  git root `DebateAIRO/.worktrees/` — `git worktree list` is the only reliable map, and the intake's
  "obs-lane-3 carries UNCOMMITTED S06 work" was stale: that work was checkpointed as `e8d99d33` and
  merged by `1c9578a2`. **Grep before you believe an intake's ABSENT/UNCOMMITTED:** the same intake
  said every binding was absent while `apps/runner/src/main.ts:1` already imported the installer.
  (REQ-FIX, 2026-09-01; one failed probe, one near mis-cut slice)

## The root `typescript@7.0.2` package ships NO JavaScript compiler API (REQ-01, translation, 2026-09-02)
The existing entry above says the repo has two TypeScript installs and `pnpm exec` resolves the
nearest — true, and it describes a DIAGNOSTICS difference, which sends you looking for a version
mismatch. The sharper fact: `node_modules/typescript/lib/` at the repo ROOT contains only
`getExePath.{js,d.ts}`, `tsc.js`, `version.cjs` and `version.d.cts` — **there is no
`lib/typescript.js`**, so `import ts from "typescript"` / `require("typescript")` cannot work at the
root at all. It is a native-binary wrapper, not a library.
Symptom: a scratch script dies with `ERR_MODULE_NOT_FOUND` inside tsx's `resolveTsPathsSync`, which
reads like a path problem and is not.
Fix: the full API lives at
`node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js` (pinned by
`apps/ui`). Load it by ABSOLUTE path with `createRequire(import.meta.url)` from a plain `.mjs`
script run with `node` — not with `pnpm exec tsx`, because tsx resolves modules from the SCRIPT's
directory, so a scratch file outside the repo resolves nothing regardless of the cwd. Naming the
scratch file `.mts` (the earlier entry) is necessary and not sufficient.
Cost: three probes, ~8 minutes.

## `grep 'direction *:'` over `globals.css` counts `flex-direction`, not text direction (REQ-01, 2026-09-02)
An RTL audit that greps for `direction:` gets 28 hits in `apps/ui/app/globals.css` and every one is
`flex-direction:`. Zero are the CSS `direction` property. A seat sizing the right-to-left work from
that number is sizing flex rows.
The real physical-direction surface is **79** declarations, itemised: `left:` 16, `margin-left` 14,
`border-left` 9, `text-align: left` 8, `right:` 7, `padding-left` 7, `text-align: right` 6,
`padding-right` 5, `border-left-width` 4, `border-left-color` 2, `border-bottom-left-radius` 1.
`margin-right`, `border-right` and `float` do not occur. Table in
`docs/missions/translation/requirements/census.md`.
General rule, and it is the family this file keeps recording: **a bare property-name grep matches
every compound property that ends in it.** Anchor on `[; {]` or on the exact declaration.

## A string classifier's error rate is invisible in what it KEPT (REQ-01, 2026-09-02)
Building the translatable-string census, four successive versions of the AST classifier all produced
output that read as clean. Every defect was found by reading the **EXCLUDED** set, never the included
one: single-word JSX text (`<span>depth {n}</span>`) thrown away as a "kebab-case identifier";
`{"true"}` counted as rendered text when it was the right operand of `process.env.X === "true"`;
`new Error("API_UPSTREAM_UNREACHABLE")` counted as user-visible copy; `` `${n}px` `` counted as prose.
Three of the four share ONE rule that was never written down: **a string's POSITION decides whether
shape heuristics may fire at all** — a JSX text node or a JSX child expression is on screen whatever
it looks like, and shape tests apply only to strings in weak positions.
Rule: when you build a filter, sample the rejected set with a query designed to find things that
should have been kept (here: "rejected entries that contain a space", then "rejected entries in a
strong position"). A filter validated only on what it accepted has never been shown to reject
correctly — the mirror of this file's standing "validate a checker on known-GOOD input".
Cost: four full runs, ~35 minutes.

## `--include=*.tsx` on a `grep -r` explodes under zsh before grep sees it (REQ-REV-01, 2026-09-02)
`grep -rn '<ModeToggle' apps/ui --include=*.tsx` fails with `(eval):2: no matches found: --include=*.tsx`.
zsh globs every unquoted word on the line, including the value glued to a long option, and there is no
`*.tsx` in the cwd to match. bash would have passed it through unexpanded. It is not a grep problem and
the error message names the flag, so it reads like an unsupported option.
Fix: quote it (`--include='*.tsx'`) or drop it and pass directories
(`grep -rn '<ModeToggle' apps/ui/app apps/ui/components`).
Same shape bites `--exclude=*.log`, `--exclude-dir=node_modules/*`, `find -name *.ts` and any
`--opt=<glob>`. **Rule: in this harness's shell, every glob that is an ARGUMENT rather than a path is
quoted.** Cost: one failed call and a wrong first hypothesis (that the flag was unsupported).

## Counting mission-requirement citations with a bare id regex counts the slice-local ids (REQ-REV-01, 2026-09-02)
A requirements artifact defines mission ids `R01…R56` and its slice SPECs define slice-local ids
`I01-R01…`, `L-ar-R16…`. A coverage check that greps a slice SPEC for `/R\d\d/` matches `R10` **inside**
`I01-R10`, so every mission id from R01 to the slice's own requirement count appears "cited" whether or
not anything traces to it. Measured live: the check reported 56 of 56 mission requirements covered; the
true figure was 54, and the two orphans (R10, R12) were the two that encoded the user's own acceptance
criterion. The report was wrong in three places because the number had been copied into three documents.
Fix: anchor on the trace COLUMN, not the body —
`^\|\s*` + backtick-id-backtick + `\s*\|.*\|([^|]*)\|\s*$` — and take the ids from that capture only.
General rule, and this file already holds its sibling: **a verifier is validated against an input that
must FAIL it.** One document with a deliberately-orphaned requirement, run once, exposes this in a
second. A verifier that has only ever seen conforming input has not been shown to report a violation.

## A logical-CSS-property audit must match the SHORTHANDS, not only `-start`/`-end` (REQ-REV-01, 2026-09-02)
Probing `apps/ui/app/globals.css` for logical properties with
`/(margin|padding|border|inset)-(inline|block)-(start|end)/` returns **0** and the file genuinely has
**8**: `padding-inline:` × 7 and `padding-block:` × 1. The shorthand forms carry no `-start`/`-end`
segment, so the obvious regex reports a clean sweep on a stylesheet that is already partly converted.
I nearly filed a refutation of a correct measurement on this. Include the shorthands
(`margin-inline`, `padding-inline`, `inset-inline`, `border-inline`, and their `-block` twins) and
`text-align: start|end`.
Rule for reviewers: **a negative finding about a COUNT is produced by two differently-shaped probes
before it is written down.** A confirmation that fails is loud; a refutation that fails is silent.
- **A provider session limit kills EVERY subagent on that model at once, mid-sentence — plan the fleet so one
  account cannot stop the mission.** (observability-agents, 2026-09-02 00:11.) Three Claude subagents on the same
  model died within seconds of each other on HTTP 429 "You've hit your session limit · resets 2:30am"; the
  notification's `result` field carried each seat's last narration ("Next I need the remaining twelve SPECs…"),
  which is how far it got, not what it delivered. **Nothing was lost, and the reason is worth copying:** every
  packet named ABSOLUTE output paths and put the self-report BEFORE the handoff, so two of three seats had already
  filed their case files, and all their artifacts were on disk. Only the handoff COMMENTS died with the seats.
  **Rules:** (1) mandate artifact-first, handoff-last ordering in every packet — never let a deliverable exist only
  in a seat's final message; (2) before re-running a killed seat, INVENTORY ITS OUTPUT — re-running a seat whose
  work is complete is the expensive mistake, and its own review will catch anything missing; (3) spread lanes
  across providers (Codex on a separate account was untouched), and (4) `hermes kanban` state is unaffected by the
  provider outage, so the board is the recovery record — reconstruct the handoff onto it from disk plus transcript.
- **`hermes kanban complete` on a `todo` ticket fails with "unknown id or terminal state" — a message that names
  neither the real cause nor the real state.** (observability-agents, 2026-09-02.) The id was valid and the state
  was `todo`, not terminal. The true cause appears only if you run `promote` on the same ticket:
  `unsatisfied parent dependencies: t_xxxxxxxx (use --force to override)`. **Diagnose a refused `complete` by
  running `promote` and reading ITS error.** And note what the chain is protecting: closing a child whose parent
  still has open work would assert something false about the parent. `--force` exists; wanting a tidier board is
  not a reason to use it. Related: a batch `complete t_a t_b t_c` completes what it can and errors on the rest —
  read every line, because the success and the failures are interleaved. Completing a parent AUTO-PROMOTES its
  children `todo → ready`, so the board moves under you as you reconcile it; re-list after every closure.
- **`codex exec -c sandbox_mode='"workspace-write"'` blocks `~/.hermes`, so the Kanban CLI cannot take its init
  lock and EVERY board write fails.** (observability-agents, 2026-09-02.) Two Codex review seats spent ~100k tokens
  each and stopped before their CLAIM with `Operation not permitted:
  ~/.hermes/kanban/boards/<slug>/kanban.db.init.lock`. Both behaved correctly — they tried a fallback, changed
  nothing, and said so — but the whole launch was wasted. **Fix: grant the board directory explicitly with
  `-c sandbox_workspace_write.writable_roots='["/Users/vladmihaimiron/.hermes"]'`**, which is far narrower than
  `danger-full-access` and is what a review seat actually needs. The general rule: a seat's sandbox must cover
  every path its MANDATED duties touch, and the board is outside the repo. Probe one board write before launching
  a fleet — the failure is silent until the seat is deep into its budget.

## `git add -A` in a tree that two sessions are writing (2026-09-02, cost: three files committed under wrong messages)
Two missions were writing the same checkout. A consolidation commit staged with `git add -A` swept three
half-written packet files belonging to the OTHER mission into commits whose messages describe unrelated
work — a SupportAgent review packet landed under "supplier requirements packet". No content was lost, but
the history now attributes files to the wrong mission, and a half-written file can be committed mid-edit.
**Rule: stage by path, always, in any repo where more than one session may be writing.** `git add -A` and
`git commit -a` are never correct here. Before committing, run `git status --porcelain` and confirm every
staged path belongs to the work you are describing. When you see untracked directories belonging to another
mission (`docs/missions/<other>/`, `.hermes/planning/<other>/`, `.hermes/reports/<other>/`), they are not
yours to stage, clean, stash, or revert.
Reported cross-session by the observability-agents orchestrator; verified against the commit.

## An "empty" directory that a deletion commit left behind reads as a live app (2026-09-02)
`dialectical-engine/web/` looks present — `ls -d web` succeeds — but commit `3e7d83e9` deleted all 50 of its
tracked files (6278 lines) and left one UNTRACKED stray, `web/next.config.mjs`. `git ls-files web` returns
zero, which is the probe that tells the truth; `ls` does not. `tests/unit/s14-ui.test.ts:19,230` still import
`web/lib/v3Presentation.js` and `web/lib/api.js`, so root `pnpm typecheck` exits 1 with 8 diagnostics and
`pnpm build` is red with it. **Rule: to ask whether a directory still exists as part of the project, ask git
(`git ls-files <dir>`), not the filesystem.** A deletion commit does not remove untracked leftovers.

- perl `s{...}{...}` **mangles a JSX replacement containing braces** (`rows={3}`): it dies
  with "Missing right curly" on stderr, leaves the file UNTOUCHED, and the mutant run then
  reads as a clean GREEN — i.e. "my test failed to catch the mutant" when the mutant was
  never applied. Two of six mutants were silently void this way. Use python3 (or any
  literal-string writer) for JSX mutants, assert the anchor was found, and **print
  `git diff --stat` of the applied mutant before believing any mutant verdict.** (T2)
- Root `pnpm run typecheck` is **blind to the legacy UI**: tsconfig.json:20 excludes `web`
  and `apps/ui`, and its include list carries `tests/**/*.ts` but **not** `.tsx`. A web/
  edit and a new `.test.tsx` are typechecked by NOTHING at repo level, so a green root
  typecheck is not evidence for either. Gate web/ with `tsc --noEmit -p web/tsconfig.json`
  — which carries 1 pre-existing error (TS2882, `globals.css` side-effect import in
  web/app/layout.tsx) because Next's `.next/types` shim is not generated. (T2)
- The vitest `@` alias resolves to **apps/ui** (vitest.config.ts:8) for EVERY test, so a
  `web/` component's `@/lib/api` import loads apps/ui's module under test, not web's. Mock
  the specifier or you are asserting against the wrong app's client. (T2)
- Concurrent lane worktrees each running the full suite **serialize on this host**: with
  three `vitest run` processes live (lane-t2, lane-t4, primary), `pnpm test` took 2984s vs
  T0's 515s — 5.8x. Budget suite wall-clock by counting concurrent lanes before promising
  a three-run cluster on the FULL suite, and never read a slow run as a hang. (T2)
- An acceptance **provider double that classifies a request on a QUOTED fragment of the
  rendered prompt never matches**: the packet is JSON-encoded onto the wire, so
  `"statement": non-empty string` arrives as `\"statement\": non-empty string`.
  `acceptance/ceremony.test.ts` carries exactly this dead check and survives only because
  its fixed FIFO falls back to popping index 0 — i.e. **a FIFO queue masks a broken
  classifier**. Key on escape-safe fragments (`restatement_text`, `served_number_refs`,
  `conforms,findings`) and make the double **refuse to guess**: record the unclassified
  body and answer 500, or a fixture gap surfaces as a bogus production error
  (`JUDGE_SCHEMA_FAILURE`) and a RED that proves nothing. (T3)
- **Adding one provider call site is a repo-wide event.** Before wiring a new model call,
  grep `call_site_key LIKE` across `migrations/*.sql` AND tests: expansion legs are
  enumerated by pattern (`JUDGE:%:root%:r1:p%` in acceptance/ceremony.test.ts:511,
  `JUDGE:%:root%:r%` in tests/integration/database.test.ts:1824), so a new call that reuses
  the `JUDGE:` prefix is silently counted as an authoring leg. Give a new call class its
  own namespace (`PANEL:`) rather than editing the assertions. Also check fixed-queue
  provider doubles and the sealed envelope basis. (T3)
- `tools/orphan-audit`'s **`neverCalled` list is hand-declared with no cross-check against
  `reachableCallables`** — wiring a listed surface makes the entry a silent lie, and no
  test fails. (`s04Surface`/`s05Surface` are safe: their attachment is derived.) After
  attaching any surface, edit `neverCalled` by hand. (T3)
- In `tests/integration/database.test.ts` a runner fixture is one of TWO species and the
  choice is not a continuum: it either **terminates on its envelope** (pin a tight
  `maxModelAttempts`; script only judgements + reviews; the serve gate takes the
  envelope-terminal path with zero composer calls) or it **serves** (generous ceiling;
  you MUST script compose + two conformance + R9 on the PRIMARY maker's double). A
  ceiling between the two fails as an unscripted-composer schema error or a hard
  `RUN_COST_ENVELOPE_EXHAUSTED` throw, and neither message names the real cause. Decide
  the species before choosing the number. (T3 r2)
- A provider double that pops `index 0` when a RECOGNISED request class has no scripted
  response of its own class serves a wrong-class answer (a review body to a judge call),
  which surfaces as a bogus production schema failure. Refuse by name for recognised
  classes; keep FIFO only for genuinely untyped requests such as health probes. Fixing
  the guess in `ceremony.test.ts` and `database.test.ts` left all their fixtures green,
  so the fallback was masking, not load-bearing. (T3 r2)
- Adding a member to a CLOSED VOCABULARY has a fixed shape in this repo, and skipping any
  step ships a FACSIMILE — a string that looks like a canonical value but is rejected by
  the parser that is supposed to disclose it. The full chain: `packages/kernel`
  CONDITION_MARKS (**insert MID-LIST** — the DR-176 tail is read positionally by
  `CONDITION_MARKS.slice(-4)` in `tests/unit/t4-way-of-knowing.test.ts`,
  `tests/unit/dr174-resilience.test.ts` and the runner's required-record gate) →
  `packages/contract` `z.enum(CONDITION_MARKS)` (automatic, but PROVE it with
  `ConditionMarkSchema.parse`) → the `ConditionMarkRecord.mark` union in
  `packages/serve/src/index.ts` (NOT automatic) → a runner projection that actually emits
  it → the deliberately-exhaustive UI switches `apps/ui/lib/v3/labels.ts` and
  `web/lib/v3Presentation.ts` (these fail typecheck by design — one forced line each) →
  `pnpm run generate:contract` → both D16 surface gates. Write the two-line admission
  test (`CONDITION_MARKS` contains it; the schema parses it) FIRST: a behavioural test
  that asserts against your own untyped JSON will pass while the mark is still a
  facsimile. (T3 r3)
- A scope claim like "my diff does not touch packages/kernel, so D16 does not gate" is a
  DERIVED fact with an expiry — it silently becomes false when a later round edits the
  kernel. Re-run the gate greps immediately before freezing a report, never once at the
  start. (T3 r3)
- `git stash push -u` is NOT a time machine once your work is COMMITTED: it stashes only the
  uncommitted delta, so a "base classification" run done after a checkpoint commit still runs
  YOUR tip and will happily tell you your own regression is pre-existing. Use
  `git checkout <base-sha>` (detached), and make every base-classification command print
  `git rev-parse HEAD` in its own output so the log proves which tree was tested. (T7 r1)
- Under `zsh`, `grep -rn "x" --include=*.ts .` dies with `no matches found` before grep ever
  runs — the shell expands `--include=*.ts`. Quote it: `--include='*.ts'`. (T7 r1)
- A vitest spy declared `vi.fn(async () => undefined)` has no parameter type, so
  `spy.mock.calls.map(([entry]) => entry.someField)` fails `tsc` with TS2493/TS2352 even
  though the test runs. Declare the parameter on the mock:
  `vi.fn(async (_entry: { readonly actionKind: string }) => undefined)`. (T7 r1)
- `buildMultiMakerExpansionPlan` (`apps/runner/src/index.ts`) emits legs ROOT-MAJOR —
  `rootIndex` OUTER, `round` INNER — so `leg.round` RESETS at every root and the consumption
  loop's `activeExpansionRound` is a per-root index, not a global round counter. It is safe
  for its existing job (triggering reviews) and wrong for anything that must happen "once per
  round". Read the PRODUCER's loop nesting before attaching to the consumer. (T7 r1)
- `buildMultiMakerExpansionPlan(depth, effectiveMakerCount)` takes **DEPTH FIRST**
  (apps/runner/src/index.ts:1183-1186). Both arguments are small positive integers, so
  the reversed call builds a perfectly legal plan for a DIFFERENT shape and every
  assertion about it is quietly about the wrong tree — only the symmetric `(2,2)` case
  is safe from the confusion. Symptom: a generalisation loop over `(M, depth)` pairs
  fails on the shapes you did not hand-check. Print `legs.length` and the distinct
  `rootIndex` set before asserting. (t07 r3; two false RED failures + one diagnostic run)
- zsh does **no word splitting on a plain scalar**, so `Z="a.ts b.ts"; vitest run $Z`
  passes ONE argument and vitest answers `No test files found, exiting with code 1` —
  instantly, three runs in a row, looking exactly like a broken zone. Use an array:
  `Z=(a.ts b.ts); vitest run "${Z[@]}"`. (t07 r3; the generic form of this trap was
  already recorded and it still cost a cluster round — the fix is the ARRAY, write it down)
- A mutant harness that restores with `git checkout HEAD -- <file>` **destroys
  uncommitted implementation work**, because HEAD is whatever you inherited. COMMIT the
  GREEN state before the first mutant, then mutate against your own commit. (t07 r3;
  caught before it fired, one harness rewrite)
- **zsh does NOT word-split an unquoted variable.** `ZONE="a.test.ts b.test.ts"; npx vitest
  run $ZONE` passes the whole string as ONE filter; vitest answers `No test files found,
  exiting with code 1` — which reads like a broken glob, not like a shell difference, and
  the run looks superficially normal (exit 1, no failures). Pass the paths as literal
  arguments, or use `${=ZONE}`. Cost: one wasted zone run. (T6 r1)
- **Reverting source WITHOUT touching the index**, for the paired base↔HEAD classification
  the fleet keeps needing: `git show <sha>:<repo-relative-path> > <path>`, run, then
  `git checkout -- <path>`. Unlike `git checkout <sha> -- <path>` (already recorded above)
  this stages nothing, so `git status --porcelain` after the restore is genuinely empty.
  It is what settled T6's `staleness_state ARCHIVED_REVIVED` failure as pre-existing in
  one run instead of an argument. Note the repo-relative path inside a worktree still
  carries the `dialectical-engine/` prefix even when your cwd IS `dialectical-engine`. (T6 r1)
- **CORRECTION to the index-free base revert above (T6 r1) — it is only safe on COMMITTED
  work.** `git checkout -- <path>` restores from the INDEX, so if the file you overwrote with
  `git show <sha>:<path> > <path>` held UNCOMMITTED edits, the "restore" silently replaces
  them with the last committed version and `git status --porcelain` then looks *clean*, which
  reads as success. T6 r2 lost three product files this way while running the D16 base pair
  mid-change; only a content grep (`grep -c review_outcome`) caught it, not git. COMMIT (or
  `git stash`) BEFORE any base-pair revert, and verify the restore by grepping for a token
  your change introduced — never by `git status` alone. (T6 r2)
- **One vitest FILE = one embedded Postgres = ONE monotonic `ledger.allocate_sequence()`
  counter shared by every test in it.** A fixture that hard-codes an `at_seq` /
  `created_at_seq` literal is therefore a LANDMINE with a fuse: it detonates the moment
  the file's own allocations climb to that number, and it detonates in *other people's*
  tests, at setup, with `duplicate key value violates unique constraint
  "run_created_at_seq_key"`. `database.test.ts` carried literals at 10001/10002/10005 with
  only a few hundred allocations of headroom; adding ONE production scenario tripped it and
  took out 23 unrelated tests, all failing in 1–2 ms. The symptom points at your change and
  the cause is a decade-old constant. Diagnose by reading the DETAIL line (`Key
  (created_at_seq)=(10001) already exists` — a suspiciously round number is the tell) and
  `grep -oE "'s00',[0-9]+\)"`, then bisect PRODUCT vs TEST by running the file with the
  previous round's test file against the new product code. (T6 r3)
- **Base-pair classification: `git checkout --detach <base>` inside the lane worktree is
  the safe form**, once the tree is committed and clean — run the gates, then `git checkout
  <branch>`. It moves the whole tree coherently, so nothing half-reverted can compile-fail
  in a way you then misread as a finding, and it cannot silently eat uncommitted work the
  way the per-file `git show <sha>:<path> > <path>` form can. Verify the return by grepping
  a token your change introduced, not by `git status`. (T6 r3)
- **A parameterised INSERT built from string fragments must reference EVERY `$n` you bind.**
  Postgres rejects the round trip with `bind message supplies 6 parameters, but prepared
  statement "" requires 3` — which reads like a driver bug, not like a probe that varies its
  own SQL. Pass the varying values as parameters (`$4,$5,$6`) and let them be NULL, instead
  of interpolating `NULL` / `'literal'` into the statement text. (T6 r3)
- **The scratchpad ROOT is shared between concurrent seats — one seat's tool file silently
  replaces another's.** Reaching for this lane's r3 mutant harness at `<scratchpad>/mutant.sh`,
  T6 r4 found the S06 seat's harness under the same name: hard-coded to `.worktrees/lane-s06`
  and appending to `logs/s06/`. Invoking it blind — the natural move, since the path was
  "mine" — would have mutated ANOTHER LANE'S WORKTREE and written into another lane's evidence
  directory, from a seat with no contract over either. Put seat tooling under a seat-scoped
  subdirectory (`<scratchpad>/t06-r4/…`), and `cat` any remembered scratch script before you
  run it. (T6 r4)
- **`assert t.count(old) == N` before a multi-site replace is NOT a safety check.** It proves N
  occurrences exist; it proves nothing about whether they MEAN the same thing — and textual
  identity is precisely what a HOMONYM has. T6 r3 narrowed a column type with a
  `count == 2` assertion and hit two different columns whose annotations were spelled
  identically (`ledger.node_review.outcome`, three lawful values, and
  `serve.condition_mark.review_outcome`, one), shipping a copied comment that cited the wrong
  constraint as justification. When a selector matches more than once, the count is a
  REQUIREMENT TO DISAMBIGUATE: read every site, and if two are textually identical and
  semantically different, make them textually different (name one) rather than being careful.
  No type can express "narrowed in the right query" — a source assertion counting the narrowed
  reads can. (T6 r4)
- **Gate logs need a captured `EXIT STATUS:` line, not just clean output.** A typecheck log
  containing the command and no diagnostics proves a command RAN; it does not prove it exited
  0 (a crashed or filtered run looks identical). Wrap gates as
  `{ echo "\$ cmd"; cmd 2>&1; echo "EXIT STATUS: $?"; } > log`. A static reviewer correctly
  downgraded T6 r3's typecheck evidence to testimony-grade for exactly this. (T6 r4)

- **zsh's no-word-splitting trap has a SILENT second form: a list of FILE ARGUMENTS.** The
  recorded entry covers `K="cmd with args"; $K more`. The same rule ruins
  `FILES=$(tr '\n' ' ' < list.txt); vitest run $FILES` — vitest receives ONE argument, the whole
  space-joined string, matches nothing, and prints **`No test files found, exiting with code 1`**.
  That is not an obvious quoting error: it reads like the files are missing, and I checked the
  files existed (they did) before suspecting the shell. Two wasted gate runs. `vitest run <one
  file>` and `<two files>` both work, which makes the many-file case look like a vitest limit
  rather than a shell one. Fix: build a real array in **bash** — `while IFS= read -r l; do
  F+=("$l"); done < list.txt; cmd "${F[@]}"` — and note macOS bash 3.2 has **no `mapfile`**.
  (algorithm-live-loop, W5 dev-sync)
- **A vitest `-t` filter that matches NOTHING reports `Tests N skipped (N)` and exits 0.** It is
  indistinguishable from a pass at a glance, and every downstream gate treats exit 0 as evidence.
  T1B ran five mutation probes that tested nothing this way: the filter was
  `-t "laid out as (multiline zod chain)"` while `it.each` had interpolated `$spelling` into the
  name **with quotes**, `laid out as 'multiline zod chain'`. **`N skipped` with `0 passed` is a
  FAILED MEASUREMENT, not a green run** — assert that a filtered run passed at least one test
  before you believe its verdict. (T1B)
- **`gate-run.sh` stamps `git rev-parse HEAD`, which is the WRONG commit whenever the working
  tree is dirty.** Run a gate before committing your fix and the record binds to the *previous*
  commit while measuring code that is not in any commit. The record even prints the dirt on its
  `porcelain BEFORE` line — it just does not draw the conclusion, so nothing fails. `stamp-check`
  then reports STALE much later, after the run is expensive to repeat. Commit first, then gate;
  T1B re-ran five gates for this. (T1B)
- **Verify a merge by comparing diff LINE SETS in both directions, not by reading hunks.** For
  each file both sides touched: `diff(base,lane)` must equal `diff(integration,merged)`, and
  `diff(base,integration)` must equal `diff(lane,merged)` — take `git diff -U0 … | grep '^[+-][^+-]' | sort`
  and compare. Two `diff` calls per file prove neither side's contribution was dropped, which
  no amount of reading the merged file does. A clean auto-merge resolves by POSITION and is the
  case that most needs this. (T1B)


## `pnpm typecheck` is BLIND to `acceptance/` — that project has its own tsconfig
Found by W4 (2026-09-03): the root `tsconfig.json` `include` list is
`apps/ packages/ tools/ tests/ vitest.config.ts drizzle.config.ts` — `acceptance/` is not
in it. `acceptance/tsconfig.json` covers that tree separately. An unknown-property error in
an acceptance file therefore does not appear in `tsc --noEmit`; it needs
`tsc --noEmit -p acceptance/tsconfig.json`. W4's RED signal (`TS2353 … 'testOnlyCodexSessionsRoot'
does not exist`) was invisible to the root run, which instead printed only the pre-existing
`tests/unit/s14-ui.test.ts` errors from the absent `web/` tree. Typecheck BOTH projects, or a
type-level RED frame silently reads as green.

## The acceptance vitest config must be run from `dialectical-engine/`, not the worktree root
Found by W4 (2026-09-03): `acceptance/vitest.config.ts` sets `include:
["acceptance/**/*.test.ts"]`, resolved against the config's own root. Invoked from the
worktree root — which is what `gate-run.sh <worktree>` does if you pass the repo root — vitest
prints `No test files found, exiting with code 1` and the gate records exit=1. That is
indistinguishable at a glance from a failing suite. Pass the PACKAGE root
(`<worktree>/dialectical-engine`) as gate-run.sh's first argument; it stamps the same commit
because `git -C` still resolves inside the repo. Cost: one wasted gate record.

## A scratchpad `.ts` file runs as CJS under tsx — top-level `await` dies
Found by W4 (2026-09-03): `tsx /tmp/.../probe.ts` fails with `Top-level await is currently
not supported with the "cjs" output format`, because the scratch directory has no
`package.json` declaring `"type": "module"`. Name throwaway probes `.mts`. Cost: one failed
probe run before a live call was made (no live call was wasted).

## A loose secret-scan regex matches CSS property names — read the match, never the count
Found by W4 (2026-09-03): `grep -rlE "sk-[A-Za-z0-9_-]{16,}"` over the mission log tree
reported a hit in a codex review log, which looked like a leaked API key in a committed
record. The actual matched text was a minified CSS property-name blob —
`…mask-composite`, `mask-size`, `mask-position…` — where `sk-` is the tail of `mask-`.
Printing the match with `grep -oE` instead of trusting `-l` prevented a false security
finding. Scan for the KEY NAME with its value (`"ANTHROPIC_API_KEY":"…"`) or a
vendor-prefixed form (`sk-ant-`), and always print what matched.

## `tools/mutate.sh` cannot express any mutant that ADDS JSX
Found by W5 r3 (2026-09-05): the script applies its edit with
`perl -0pi -e "s/\Q$OLD\E/$NEW/g"`, so a `/` in OLD or NEW terminates the
substitution's pattern. **Every JSX element needs a `/`** — `<x />` or `</x>` —
so no mutant that adds a control, a component, or any element can go through it.
Measured: passing `<input id="guidance" type="text" />` as NEW aborts with
`Search pattern not terminated at -e line 1.` and `ABORT: apply failed` (exit 5).
It fails SAFE — the file is restored and the gates hold — but a packet that
mandates mutate.sh custody for a JSX mutant is asking for something the tool
cannot do, and you will burn time discovering that. Slash-free mutants (attribute
values, identifier renames, call-site rewrites, `{ ...config, key: value }`
spreads) work fine and should still go through it. For JSX, run the same gate
sequence — clean-tree precondition, pre-count 0, sha BEFORE, apply, applied
count > 0, command + exit, restore, post-count 0, sha AFTER equal, empty
porcelain — with a substitution that is not a perl `s///`, and say in the
transcript that you did and why. Cost here: ~40 minutes of trying to encode a
`/`-free JSX element before measuring the tool's actual failure.
(algorithm-live-loop, W5 dev-sync r3)

## A merge that deletes a tree silently DISABLES the incoming tests that import it
Found by W5 r3 (2026-09-05): the incoming branch added
`tests/unit/s1-1-depth-contract.test.ts`, which imports `../../web/lib/api.js`.
This lane had deleted `web/`. The merge is textually clean — no conflict, no
marker, the file-level audits pass — and the suite reports
`Test Files 1 failed (1)` with **`Tests: no tests`**. All 44 assertions in the
incoming oracle were silent, including the one the round's packet named as the
check on the resolution. **`Tests: no tests` next to a failed file is not a
failing test — it is a suite that never ran, and a per-test-NAME failure
partition cannot see it at all.** Grep every incoming test file for imports of
paths your side deleted BEFORE trusting a gate, and count suite-load failures as
their own category. Both parents were green; only the combination is broken.
(algorithm-live-loop, W5 dev-sync r3)

## `git rev-parse <sha>:<path>` echoes its argument when the path is ABSENT
Found by W5 r3 (2026-09-05), re-confirming round 1's finding from the other
direction: comparing blob ids across commits to decide "did this merge change
the file" gives a false CHANGED for any path missing on one side, because
`rev-parse` prints the literal `<sha>:<path>` string instead of failing. Guard
with `|| echo ABSENT` and compare, or use `git ls-tree`. Related and worse: a
file that EXISTS at both commits can still differ in the line you care about —
here `apps/ui/components/LoginFlow.tsx` exists at base, lane and integration, so
"the file exists on both sides" read as "not a merge-caused difference", when the
lane's blob had added the six-slot code array that tripped an incoming oracle.
**Compare blob ids, never existence.** Cost: one wrong hypothesis, caught by
checking the blob before writing it down.
(algorithm-live-loop, W5 dev-sync r3)

## A receipt's PRODUCER and its PARSER restate the same invariant in two packages
Found by T17T9-3 (2026-09-05). `computeStructuralCeilingBasis`
(`packages/register/src/index.ts`) decides two things about the serve leg —
`serveSites = max(compositionSites, synthesisLoopSites)` and
`selected = compositionSites >= synthesisLoopSites ? COMPOSITION : SYNTHESIS_LOOP`.
`parseCostEnvelopeBasis` (`packages/budget/src/index.ts`) re-derives BOTH from the
persisted receipt and rejects any basis that disagrees — deliberately, and its
comment says so: "These two guards restate the constructor's own two decisions,
and they are INDEPENDENT of the one above." **A ticket scoped to the producer
therefore cannot change the producer's decision at all**: the parser refuses
every receipt the new producer would mint, and the refusal surfaces at the run
head, not at compile time. Cost here: the whole ticket, blocked at the contract
boundary. **Before scoping a lane to a value-producing function, grep for a
parser/validator that re-derives its invariants and put it in the same contract.**
The cheap probe is 12 lines — build the basis the new rule would mint, feed it to
the parser, read the rejection — and it is worth running BEFORE the design, not
after. (algorithm-live-loop, T17T9-3)

## zsh eats an unquoted `--include=*.ts`, and reports it as "no matches found"
Found by T17T9-3 (2026-09-05). `grep -rn "pattern" DIR --include=*.ts` fails in
zsh with `(eval):2: no matches found: --include=*.ts` — zsh tries to glob the
flag's value against the CWD before grep ever runs, and there are no `.ts` files
next to a report directory. The message names the flag, not the search, so it
reads like a grep problem. Quote it: `--include='*.ts'`. Same shape as the
already-recorded macOS `awk`/`rg` traps: the harness's shell is zsh, not bash.
Cost: one wasted call per occurrence. (algorithm-live-loop, T17T9-3)

## An induced experiment can produce the right SYMPTOM by the wrong PATH
Found by T17T9-3's B1 evidence round (2026-09-05). A probe shortened one queue deadline to force a
timeout; the run failed with the expected label and a clean tip/parent parity table, and the write-up
called the mechanism proven. It was not: the override only moved the SHARED default (18 000 ms), while
the reservations that mattered were registration calls carrying their own explicit 28 000 ms deadline
(`apps/api/src/registration.ts:1073` reads `request.waitDeadlineMs ?? channel...`, and `:1394` supplies
the registration value). The wrong population expired, an earlier gate became unsatisfiable, and the
episode under investigation was never entered. **The tell was in the probe's own output — 28.1 s
creation→rejection against a "1.5 s" override — and nobody read it because the summary line agreed
with the hypothesis.** After any induced experiment, check that the mechanism you INTENDED is the one
that fired: compare the observed latency against the deadline you think you set, and confirm the run
REACHED the phase you are studying rather than failing before it. A parity table produced by the wrong
path is more expensive than no experiment, because it looks like proof. Cost: one full review round.
(algorithm-live-loop, T17T9-3 B1)

## Load generators that spawn processes cannot be combined with a fixed burner count
Found by T17T9-3's B1 evidence round (2026-09-05). Four concurrent vitest integration suites (each
spawning workers plus an embedded PostgreSQL) sat at loadavg ~8. Adding 12 CPU burners took the same
machine to **188**, and the subject test never started. The suites' own parallelism multiplies with
the burners rather than adding to them, so "N burners" is not a dial you can turn while another
process pool is running. Calibrate contention with ONE model, and measure a cheap latency-vs-load
curve before spending full test runs bisecting blind. Related: a repo on OneDrive gets an uncontrolled
third load source — `OneDrive`/`FileProvider` reindexing after test churn held a core at 100 % and
drove loadavg past 100 on its own. (algorithm-live-loop, T17T9-3 B1)


## Appended 2026-09-07 by the orchestrator (D70): this machine's uncommitted trap appends (2026-09-01 → 09-07), captured before the dev merges, unioned here in order

- `codex exec resume` accepts only a SUBSET of `codex exec` flags: `-s`/`--add-dir` are
  rejected ("unexpected argument"). Pass sandbox via config keys instead:
  `-c sandbox_mode="workspace-write" -c 'sandbox_workspace_write.writable_roots=[...]'`.
  Also resume's session lookup is cwd-filtered — `cd` into the seat's worktree first (or
  `--all`). (algorithm-correctness; one dead relaunch)
- Codex workspace-write sandbox DENIES pnpm's `~/Library/pnpm/.tools` mkdir, local tsx
  is absent in fresh worktrees (no install), and Corepack is not installed: dynamic
  verification dies three ways before one assertion runs. Declare static-only in the
  packet, or hand the seat a verification command proven to run in that sandbox.
  (algorithm-correctness; 6–8 min, zero dynamic evidence)
- `pnpm run typecheck`, `pnpm test`, and the acceptance ceremony ALL die on a fresh/synced
  checkout because `packages/contract/generated/` (gitignored build output of
  `generate:contract`, which only `build` runs) is absent: 157 tsc errors, 83 dead test
  files, ceremony ERR_MODULE_NOT_FOUND — one cause. Provision worktrees with install AND
  generate:contract. (algorithm-live-loop T0; three suite runs spent proving it)
- `git check-ignore <dir>` on a directory that DOES NOT EXIST YET can report not-ignored
  even when the .gitignore rule is real — verify at file level after the dir exists.
  (algorithm-live-loop; one wrong "tree defect" alarm)
- Acceptance relay binaries are HARDCODED absolute paths from a developer machine
  (claude-relay.ts:27, grok-relay.ts:12) — no PATH lookup, no env override: any other host
  discovers a 1-maker panel and FAIR-01 fails. TREL lane adds ACCEPTANCE_*_BINARY
  overrides. (algorithm-live-loop T0; one ceremony attempt spent for zero provider cost)
- A background launcher ending in `|| echo FAIL` converts every failure into exit 0 — the
  completion notification lies. End launchers with the real command (let the exit code
  propagate) and verify the marker LINE in the output, not the exit line.
  (algorithm-live-loop orchestrator; one silently dead install, caught by path audit)
- An "unidentified" background shell with an EMPTY output file is not a zombie when its
  command redirects output into files — and subagent-spawned shells appear in the parent
  orchestrator's task list. Decode the command preview BEFORE any TaskStop; killing by id
  without identification is killing by name in disguise. (algorithm-live-loop
  orchestrator; killed a live seat's test run ~1 min in)
- Process cleanup keyed on a WORKTREE PATH (`pgrep -f "lane-x.*vitest"`) is unsafe: under
  judge-stage/batched suites, a lane worktree is no longer exclusively its worker's, and
  in an in-process agent fleet EVERY seat's shell shares one ancestor (the orchestrator
  session PID) — ancestry cannot discriminate seats. Identify by the direct parent
  shell's command/cwd, and when in doubt, don't kill. (algorithm-live-loop T1 seat;
  correctly declined to "clean up" a run its own handoff depended on)
- `git merge` in a FRESHLY-ADDED worktree under OneDrive can die with a bare
  `fatal: stash failed` (merge internally runs `git stash create` while the sync storm
  from checkout is still settling). Nothing is wrong with the branches: wait a beat and
  retry; the same merge then completes. GIT_TRACE=1 is what names the internal stash
  call. (algorithm-live-loop orchestrator; two "failed" merges that were fine)
- OneDrive also FLIPS EXECUTABLE BITS (644→755) on random source files; with
  core.fileMode=true git reports them modified and `merge` aborts on "local changes".
  Diagnose with `git diff --stat` (0 insertions/0 deletions but files listed = mode-only;
  the diff header shows old/new mode); cure with `git checkout -- <paths>` after proving
  content-identity. Never `reset --hard` on reflex. (algorithm-live-loop orchestrator;
  one blocked flagship merge)
- vitest 4 **removed `--reporter=basic`**. Passing it is not a warning: the run dies in
  startup with `Failed to load custom Reporter from basic` / `ERR_LOAD_URL`, ~40 lines of
  Vite module-runner stack and NO test output, which reads like a broken test file. Use
  the default reporter. (algorithm-live-loop T8; one wasted RED run)
- The zsh no-word-splitting trap has a SECOND face that fails SILENTLY-GREEN-ADJACENT:
  `FILES="a.test.ts b.test.ts"; npx vitest run $FILES` passes the whole string as ONE
  filter, and vitest answers `No test files found, exiting with code 1` — an exit 1 that
  looks like a test failure, and a `grep 'Tests '` over the log finds nothing, so a
  three-run loop can print three empty verdicts and be mistaken for three green runs.
  Use an array: `F=(a b); npx vitest run "${F[@]}"`. (algorithm-live-loop T8; one wasted
  three-run cluster loop)
- Restoring a worker's own edits with `git checkout HEAD -- <path>` DESTROYS them — HEAD
  is the base, not your work. To run a suite against the unmodified base mid-lane:
  `git diff > work.patch`, move UNTRACKED artifacts aside too (they survive the checkout
  and silently contaminate the "base" run), `git checkout HEAD -- <dirs>`, run, then
  `git apply work.patch` and prove restoration with `diff -q work.patch <(git diff)` —
  porcelain alone only proves files are dirty, not that they are dirty in the right way.
  (algorithm-live-loop T8; used five times, zero loss)
- Root `pnpm run typecheck` passing is NOT evidence that a shared CONTRACT change is safe:
  tsconfig.json:20 excludes web/ and apps/ui, so narrowing a zod discriminated union can
  leave both Next apps with dead branches typed `never` while root typecheck exits 0.
  D14's workspace-local gates are the only thing that sees it — run them whenever you
  change a schema those apps consume, not only when you edit their files.
  (algorithm-live-loop T8; 5 real errors invisible to the root gate)
## `git diff <sha> -- <path>` is silent AND exit 0 when the pathspec matches nothing (F-TINT1-7, 2026-09-01)
"Empty diff output" is not a byte-identity proof: a mistyped or moved path yields the same
empty output and the same exit 0 as a genuine no-change, and `--exit-code` does not help.
A packet that makes "prints nothing" the success criterion has written a check that cannot
fail. Cure: precede it with `git ls-tree --name-only <sha> -- <path>` (must print the path)
and compare two INDEPENDENT hashes (`git show <sha>:<path> | shasum -a 256` vs
`shasum -a 256 <path>`). Drafted by the TINT1 seat; appended by the orchestrator (F32b).
## `codex exec resume` rejects `--sandbox` after the subcommand (exit 2, usage text) (2026-09-01)
`codex exec resume --last --sandbox workspace-write …` fails instantly with the usage line
`Usage: codex exec resume --last --model <MODEL> [SESSION_ID] [PROMPT]`. `--sandbox` is an
`exec`-level option: place it BEFORE `resume` (`codex exec --sandbox workspace-write
resume --last -m <model> -c key=value "<prompt>"`); `-c`/`-m` are accepted on either side.
A launcher with a fresh-`exec` fallback hides this (the review still runs, but as a NEW
session — the lane's prior-round context is lost). Verify `RESUME FAILED` is absent from
the log before trusting that a round was reviewed in-session. Drafted by the orchestrator.
## zsh again: `for f in $files` over a multi-line variable runs ONCE (2026-09-01, orchestrator)
Same class as the vitest-filter word-splitting trap, second bite: under zsh an unquoted
`$files` holding newline-separated paths is ONE word, so the loop ran a single vitest
invocation with a 21-line argument (exit 1, no summary, "DONE" printed anyway). Cure: write
the list to a file and `while IFS= read -r f; do …; done < list`, or `setopt shwordsplit`,
or run the launcher under `bash`. Print the per-file line INSIDE the loop and count the
lines afterwards — a launcher whose "DONE" cannot fail is the same defect as `|| echo FAIL`.
## CORRECTION to the resume trap above: `-c sandbox_workspace_write.writable_roots` before `resume` is NOT honored (2026-09-02 00:05)
`codex exec --sandbox workspace-write -c 'sandbox_workspace_write.writable_roots=[…]' resume --last …`
resumes the session (no usage error) but the resumed turn's patch to the extra root is
"rejected: writing outside of the project" — the review ran ~40 min and its verdict
survived only in the log. Until a working resume form is proven by a successful out-of-tree
write, use a FRESH `codex exec` (all `-c` after `exec`) for every codex round and hand the
prior round's verdict path in the packet instead of relying on session memory. Verify every
codex launcher by the verdict FILE's existence, never by exit 0 (exit was 0 here).
## OneDrive exec-bit flips get COMMITTED, not just seen (T6 codex r2 N3, 2026-09-02)
The flip trap has a second bite: a seat that `git add -A`s after OneDrive flips a source file
to 755 commits `mode 100644 -> 100755` on a .ts file inside its real change. Cure, two layers:
(1) `git config core.fileMode false` in every worktree on this OneDrive path (set by the
orchestrator on integration + lane-t6/t7/s06/s07/s08 at 00:4x on 2026-09-02) so flips are
invisible to status/diff/add; (2) before filing, `git diff --summary <base>..HEAD | grep -c
"mode change"` must print 0 — quote it. An already-committed flip is reverted with
`git update-index --chmod=-x <path>` + a mode-only commit (content diff 0/0).
- `cmd 2>&1 > file` sends **stderr to the terminal and stdout to the file** — the exact
  opposite of `cmd > file 2>&1`. vitest prints its FAIL blocks on **stderr**, so a base-run
  log captured that way contains the summary and NONE of the failures; a base-vs-head
  failure diff then reports "0 baseline failures" and every head failure looks like yours.
  Always `> file 2>&1`, and sanity-check the base log with `grep -c "^ FAIL "` before
  trusting a comparison. (algorithm-live-loop S06; one 7-minute zone re-run)
- A mutant can be **accidentally equivalent**, and a green suite then reads exactly like a
  test gap — the reflex is to go weaken the test that was never wrong. Two examples from
  one campaign: a rung hoisted above another but guarded on the condition that made the
  hoist unreachable; a register value replaced by a default while the loud stop that
  refuses before reading it was left in place. Before touching a test because a mutant
  survived, ask "is this mutation observable at the seam at all?" and record the
  non-discriminating mutant rather than deleting it. (algorithm-live-loop S06)
- D24's transcript shape (token grep 0 → 1 → 0) presumes the mutation ADDS a token. For a
  DELETION mutant the counts read 1 → absent → 1 and look like a violation. Shape deletion
  mutants as a replacement with a MARKED constant (`/* MUTANT_X_REMOVED */`) so the marker
  is added and the counts read in the intended direction. (algorithm-live-loop S06)
- OneDrive's 644 → 755 flip rides into COMMITS, and setting `core.fileMode=false` afterwards
  hides it from `git status` while leaving it in the history. The only check that sees it is
  `git diff --summary <base>..HEAD | grep -c "mode change"` (must be 0). Cure without
  touching content: `git update-index --chmod=-x <paths>` + a mode-only commit, proven by
  that commit's own `--stat` reading `0 insertions(+), 0 deletions(-)`.
  (algorithm-live-loop S06; two files, caught only by the coordinator's check)
- A mutant harness that restores with `git checkout HEAD -- <path>` **destroys uncommitted
  work** and leaves porcelain clean, which is exactly what a correct restore looks like. It
  encodes an unchecked invariant — *HEAD is my work* — that holds only if you commit before
  every mutant. Make the harness refuse a dirty tree, or snapshot the file itself (`cp` out,
  `cp` back) instead of trusting git. (algorithm-live-loop S06 r2; deleted a blocking fix
  mid-round, caught only because the next grep came back 0)
## zsh word-splitting, fourth bite: a test-name filter built in a variable (S08 seat, 2026-09-02)
Drafted by the S08 seat, appended by the orchestrator (F32b — seats may not write this file).
Building a vitest `-t` filter or a file list in a shell variable and passing it unquoted under
zsh collapses it into one word, so the command runs against a filter that matches nothing and
reports a green run over zero tests. Cure: pass the filter as a single quoted argument, or
write the list to a file and read it with `while IFS= read -r`. Always assert the reported test
COUNT, not just the exit code — a run of zero tests exits 0.
## vitest's ` FAIL ` lines are not a usable oracle from captured output (S09 seat, 2026-09-02)
Drafted by the S09 seat, appended by the orchestrator (F32b). Grepping captured vitest output
for ` FAIL ` returned zero matches for every mutant while the `Tests N failed` summary was
correct, which made a whole mutation campaign report NOT_CAUGHT and nearly filed that as
evidence. Cure: classify from the `Tests N failed | M passed` summary, or from the JSON
reporter; if you parse per-test lines (` FAIL ` or the `×` marker), assert that the number of
parsed names EQUALS the summary count and refuse to classify when they disagree — otherwise a
zero-match parse looks exactly like a clean run. The mission's own D15 launcher was hardened
this way on the same day.
## A mutant gate that cannot tell "violated" from "my measurement is broken" (2026-09-02, S07)
Two independent bugs in one D24 harness, and BOTH looked exactly like a real
violation, so all ten mutants aborted on a clean tree:
(1) `grep -F -c "$MULTILINE"` treats the pattern as MANY patterns and counts lines
matching ANY of them — a pre-count of 214 on a file containing the token zero times.
(2) `PRE=$(grep -F -c "$TOK" file || echo 0)` produces the string `"0\n0"` when grep
matches nothing (grep prints `0` AND exits 1, so the fallback appends a second `0`);
`[ "$PRE" -eq 0 ]` then errors and the gate fails closed.
Cures: pass an explicit SINGLE-LINE token (the marker comment inside the mutation —
D24 ADDENDUM's "the token is NEW" is satisfied by a marker carried by NEW, and the
full (OLD,NEW) pair is still recorded as the mutation diff); and write
`count() { grep -F -c -- "$1" "$2" 2>/dev/null | head -1 || printf '0'; }` so the
fallback can never concatenate onto a real answer. Cost: one whole campaign run.
Generalisation: before trusting a gate that ABORTS, prove it aborts on a real
violation AND passes on a known-clean input — an abort-only gate is untested.
## A provider double that dispatches by RESPONSE CLASS silently serves the wrong organ (2026-09-02, S07)
`tests/integration/database.test.ts`'s `startProviderDouble` classifies each scripted
response (`"statement"`→JUDGE, `"segments"`→COMPOSE, `"conforms"`→CONFORMANCE …) and
picks the first PENDING entry whose class matches the REQUEST. Introduce a new organ
without adding its class and the request falls to `GENERAL`, whose branch pops
`pending[0]` — so the new organ is handed a JUDGEMENT and dies on its own schema, in a
fixture whose subject is something else entirely. The failure reads like a product bug
(a Zod error naming your new fields) and is a queue-routing bug. When you add an organ,
add BOTH halves: a response discriminator and a request discriminator, and order the
request checks so a more specific prompt is tested before a more general one.
(Found while retiring the CONFORMANCE and post-compose-R9 organs for T9.)
## A substring-counting mutant gate miscounts a 4-space fragment inside its 8-space twin (S08 seat, 2026-09-02)
Drafted by the S08 seat, appended by the orchestrator. A mutation harness that counts OLD-text
occurrences by substring will read an indented fragment as occurring inside a more deeply
indented copy of itself, so the gate aborts with "OLD text occurs 2 times" — which is the gate
working, but only by luck: without it the campaign would have mutated the wrong arm and credited
the kill to another lane's code. Cure: match on the full line including its exact leading
whitespace, or anchor the pattern; and keep the abort — the same gate caught a neighbour mutant
whose own construction was broken (a dropped `.length`), which was fixed in the mutant, not in
the test.
## A vitest `-t` filter is part of the assertion, and a wrong one reports green over nothing (S07 seat, 2026-09-02)
Drafted by the S07 seat, appended by the orchestrator. Running `vitest -t "at claim"` to check a
new arm matched a pre-existing test plus an unrelated arm and never executed the new one, so the
green looked like proof the reasoning was wrong. The correct filter produced the real failure.
Cure: after any filtered run, assert the NUMBER of tests the filter matched (vitest prints it),
and prefer naming the file plus the exact full test title over a substring. A filter that matches
zero of the tests you meant is indistinguishable from a pass.
## `grep -cF "$MULTILINE"` counts lines matching ANY line of the pattern (S08 seat, 2026-09-02)
Drafted by the S08 seat, appended by the orchestrator. A multi-line token passed to `grep -cF`
is treated as a set of alternative line patterns, so a file containing merely one of its lines
reports a non-zero count — a mutation gate reading "the NEW token is already present" in a file
that does not contain it. The mission's own tools/mutate.sh had this defect and now counts
substring occurrences in python instead. Related limit, same source: a substitution that
interpolates the replacement cannot carry `$ @ \ /` in either half; fit the token to the tool and
say so, rather than editing the tool mid-campaign.
## grep's `--include=*.ts` dies unquoted in zsh (T6B seat, F-T6B-2; the orchestrator hit it the same day)
`grep -rn "X" --include=*.ts path/` fails with `(eval):3: no matches found: --include=*.ts` because
zsh expands the bare glob BEFORE grep sees it, and with no matching file in the CWD it aborts the
whole command. It is not a grep error and the message names the wrong culprit. Quote it —
`--include='*.ts'` — or drop it and filter with a second grep. Same family as the other four
word-splitting bites already listed here: in this harness the shell edits your command before the
tool does.
Cost: one wasted round trip each time, and it looks like a missing file rather than a quoting bug,
so the natural next move is to go hunting for the file.
## A mutant transcript with EXIT 127 is counted as a KILL by the index (S11 seat, 2026-09-02)
Appended by the S11 seat under D32. Building the discriminating command in a shell variable and
passing it unquoted (`... "$OUT" $T`) is the zsh no-word-splitting bite in its fourth shape: zsh
hands the whole string to `mutate.sh` as ONE argv entry, the binary is never found, and every
transcript records `EXIT = 127`. Every gate inside `mutate.sh` still passes — pre-count 0,
applied 1, restored 0, hashes match, porcelain empty — because those gates are about the
MUTATION, and the mutation was flawless. `tools/mutant-index.sh` then classified all eight as
`THREW` and printed `exit-nonzero(killed)=8 · exit-zero(survived)=0`: a perfect campaign that
never ran a single test. Caught only by reading `EXIT` in the index, never by a check.
Cures, both cheap: (1) pass the test command as SEPARATE argv words, never as one variable —
`run() { mutate.sh "$L" "$2" "$3" "$4" "$OUT" ./node_modules/.bin/vitest run <file>; }`;
(2) exit 126/127 is `MEASUREMENT-BROKEN`, never a kill, and the TALLY should refuse to print
while any transcript carries one. Same class as the S07 entry above — a gate that cannot tell
"violated" from "my measurement is broken" — so this is its SECOND occurrence in the index rather
than in the harness. Cost: one entire campaign.
## Never edit a shell script while another process may be executing it
bash does NOT read a script into memory up front — it reads incrementally, seeking by byte
offset as it goes. Rewriting the file underneath a running instance makes it resume at the old
offset in the new bytes: it executes a fragment of a line, or silently skips a block, and the
failure looks like a logic bug in the script rather than what it is. The mission's shared tools
(`gate-run.sh`, `stamp-check.sh`, `mutate.sh`) are executed BY SEATS, concurrently and without
announcement, so any orchestrator edit to one is a live-patch of code another process is
running.
RULE: before amending a shared tool, confirm no seat is mid-gate; otherwise queue the change
until the run lands. Writing a NEW file (a `.py` alongside, a `v3` name) is always safe; editing
in place is not. Held a version-stamp change to `gate-run.sh` for exactly this reason on
2026-09-02 while a seat was running its merge gates.
## A counter that silently drops entries AGREES with the pin, and reads as confirmation (T9B seat)
The T9B seat's first mark-counter returned 33 by dropping four identifiers containing underscores
from its pattern. Integration's pin is 33. So the broken counter produced the EXPECTED number and
would have been filed as a successful cross-check; the true merged count is 37. The seat caught it
only by self-testing the counter against a deletion and an empty file first.
This is the D56 shape at its most dangerous: a check that is wrong in the direction of agreement.
A disagreeing check gets investigated; an agreeing one gets cited. When a counter, grep or filter
reproduces a number you already expected, that is the moment to test it against a known-bad input
— not the moment to relax.
Routed by the orchestrator: the seat could not write this file, correctly, as it is outside its
allowed list.
## zsh does NOT word-split unquoted parameter expansions — the root cause of two false campaigns
Diagnosed by the T9B seat after being caught twice by the SAME mechanism in different clothes.
In bash, `cmd $VAR` with `VAR="a b c"` passes THREE arguments. **In zsh it passes ONE** — the whole
string, spaces included. So:
 · `$U` holding three log paths arrived as a single argument matching no file;
 · `$4` holding `… -t producer` arrived as one argument, so vitest's file filter matched NOTHING,
   the run selected zero tests, exited 1, and EVERY mutant — including both neighbours that were
   supposed to survive — scored as KILLED.
Both times the run "worked": a command ran, an exit code came back, transcripts were written. The
campaign read 6/6 and was entirely fictional. **Both times the expected manifest caught it, not
the seat and not the orchestrator.** This is also the same family as the `--include=*.ts` entry
above: in this shell the argument list you think you wrote is not the one the tool receives.
FIX: quote every expansion (`"$U"`), or build an explicit array and expand with `"${arr[@]}"`.
And note the deeper lesson, which is not about quoting: a filter that matches nothing does not
announce itself. `vitest -t nothing` exits 0 on some paths and 1 on others, and either way it
proves NOTHING about the code. Any campaign or gate driven by a filter must assert the COUNT of
tests it selected, not merely the exit code.
## stamp-check.sh takes a PREFIX, not a glob — an expanded glob silently checks ONE file
Found by the lane/sealedrows seat, 2026-09-03. Verified by reading `tools/stamp-check.sh:12-16`.
Its contract is `stamp-check.sh <lane-worktree> <log-glob-prefix>` and it iterates
`for f in "$PREFIX"*`. Pass an UNQUOTED glob and the shell expands it first, so `$2` becomes only
the first matching file and `"$PREFIX"*` then matches that one file alone:
# WRONG — checks r4-d16-ui-base.log and nothing else
tools/stamp-check.sh .worktrees/lane-t6 $M/logs/t06/r4-*.log
  records compared: 1 · failures: 0        # reads as a pass over 21 records
# RIGHT — the prefix, quoted
tools/stamp-check.sh .worktrees/lane-t6 "$M/logs/t06/r4-"
The tool's own zero-match refusal does not catch this: one file is not zero files, so the guard
that was built to reject an empty result passes a result of one. **`records compared: N` must be
read against the number of records you expected**, every time.
This is the same failure the D41/D45 stamping rules exist to prevent, arriving through the
comparator instead of the producer, and it is plausibly how the T6 r4 provenance gap
(F-T6B-1) went unnoticed.
## `git diff --stat` hides untracked files — a new test file is invisible in the count
Found by the lane/sealedrows seat, 2026-09-04, after it reported `221 insertions` where the truth
was `527`. The 306-line gap was two ADDED test files, still untracked when the statistic was taken.
git diff --stat <base>..HEAD        # tracked modifications only
git status --porcelain              # the '??' rows are the ones the stat above cannot see
The orchestrator then copied that number into a reviewer packet constant, which its own contract
requires it to re-read from source at packet-write time. Codex caught it (P1). **A diff statistic
taken over a working tree is not a handoff constant — derive it from committed tips, or add the
untracked files first.**
## A mutation driver that classifies on EXIT STATUS scores an aborted mutation as a kill
Found by the same seat, same day, in its own driver — caught by a mismatched restore column, not
by the gate. `mutate.sh` refuses at its pre-gate when the NEW token is already present in the
file, and exits non-zero. A driver reading "non-zero means the test failed" records that abort as
a KILLED mutant: a mutation that never ran, scored as evidence that it was caught.
**Classify on whether the GATE actually applied, never on exit status** — this is D46/D50's rule
arriving through a hand-rolled driver rather than through `mutant-index.py`. Retain the aborted
run as its own transcript instead of dropping it; a NOT-RUN row is a finding, and a missing row is
a silence.
## `git checkout <base> -- <paths>` rejects the WHOLE command when any pathspec is absent at base
Found by the lane/sealedrows seat, 2026-09-04, while proving a failure pre-existed the lane. It
ran `git checkout <base> -- <paths>` to revert its files to the base tree, then ran the test and
printed `AT BASE: 1 failed`. **Nothing had been reverted.** Three of the lane's test files are NEW
— absent at base — and git rejects the entire checkout when any single pathspec does not match,
exiting non-zero without touching the files that DO exist. A script that does not check the exit
status, or checks it and continues, reports a base-tree result from the lane tree.
The seat caught it only because the line above said `porcelain lines: 0` where the revert should
have produced twelve. **A base-tree comparison must gate on the porcelain count the revert is
expected to produce, not on the checkout's silence.** Better: build the base comparison in a
separate worktree at the base tip, where there is nothing to revert and nothing to restore.
This is the same shape as the stamp-check prefix trap — a tool doing less than asked while looking
like it did the whole job — arriving through git instead of a mission script.
## A set-equality key that truncates can MERGE two failures — and hide a new one behind a known one
Found 2026-09-05 diagnosing why D15 batch b12 refused a verdict (`summary says 48 failed; parsed
47 names`). The classifier's key normalised each failure name and then cut it at 120 characters.
Two NEW t16 failures — `…leaves a base-shaped sealed dev v4 byte-identical…` and `…leaves a
base-shaped sealed acceptance v1 byte-identical…` — are identical up to character 120 and differ
only after it. The key merged them; 48 became 47; the refusal guard fired.
The refusal was the tool working. The hazard is the case where it would NOT fire: a NEW failure
whose first 120 characters match a KNOWN-RED name is keyed onto the known one, counted once, and
the set comparison reports "no new failure" while one landed. Long vitest names with a shared
describe-block prefix make this likely, not rare.
**A key used for set equality must be injective over the names it will see.** Use the full
normalised name, or a hash of it — never a prefix. The classifier is now `tools/d15-classify.py`
(D60), keyed on the full name, standalone so a filed log can be re-classified without re-running.
Suite-level `FAIL path [ path ]` lines are counted separately and never as tests: a suite that
could not load has tests that never ran, and they are not in the count.
**Second half of the same trap, found fixing the first.** The v1 classifier scoped the authority
with hard-coded line numbers (`t0[187:210]`, `t0[213:231]`), which happened to be right. The
replacement's first version parsed the WHOLE baseline file — and `t00-baseline.md` retains the
pre-provisioning r1 record as a later h1 section under D9. Result: the authority grew from 23+5
to 28+7, and both b11 and b12 reported five tests as VANISHED that provisioning had fixed and
that were never in the baseline of record. **A retained historical section is data for humans
and poison for a parser that does not know where the current record ends.** Anchor on the
heading, stop at the next h1, and refuse on an empty parse. Confirmed by regression: b11 back
to exactly its original verdict.
## zsh: `grep --include=*.ts` dies before grep ever runs
Found by lane/h-diag (F-SEALEDROWS-H, 2026-09-05). `grep -rn PATTERN . --include=*.ts` fails
with `(eval):2: no matches found: --include=*.ts` — zsh tries to GLOB the unquoted `*.ts`
against the current directory, finds no `.ts` file there, and aborts the command. grep is never
invoked, so the failure looks like a grep error and is not one. Nothing is searched, and a seat
reading the message as "no matches" concludes the symbol is absent when it was never looked for.
Quote it (`--include='*.ts'`) or use `--exclude-dir=node_modules` with a path list. This file
already records two zsh word-splitting/shadowing traps; this is the same family — zsh expands
what bash passes through. Cost: three calls.
## Two background gate-runs in ONE worktree, writing ONE log, silently corrupt each other
Found by lane/h-diag (F-H-2, 2026-09-05). I launched an instrumented `gate-run.sh` in the
background, spotted a defect in the wrapper, patched it and launched again — to the SAME output
path, while the first was still running. Both `vitest` processes then ran in the same worktree,
each creating and deleting its own scratch test file, and both appended to the same log. The
result read as a coherent record and was not: it showed the FIRST run's assertion (the one the
patch was meant to fix), so the patch looked ineffective when it had applied correctly. I nearly
re-patched code that was already right.
**What caught it:** `gate-run.sh`'s `CLEAN-STATE: CHANGED — this measurement is suspect` line —
each run saw the other's scratch file in porcelain. That is D45/D49 doing exactly the job they
were written for; without the porcelain bracket this would have been an invisible bad
measurement.
**Rules.** One gate-run per worktree at a time — a background launch is a lock you must wait on.
Never reuse an output path for a second attempt; name it `-v2` so the first record survives as
evidence. Before relaunching, check `ps` for a live run in your worktree. Retained the corrupted
record as `f-h-2-r0-CORRUPTED-two-runs-one-log.log` rather than deleting it (D60:
capture-before-destroy applies to a tool's output).
## A probe inserted past the first failing assertion never runs
Same seat, same session. I instrumented the staleness block at `database.test.ts:3990` and got
zero probe output: vitest aborts a test at its FIRST failed `expect`, and an unrelated stale
expectation at `:3908` was stopping execution ~80 lines earlier. A probe below a known failure
is dead code. When instrumenting a long integration test, either apply the known upstream fix in
the same scratch copy, or place the probe above the first failure — and always assert the probe
FIRED (count the lines) before concluding anything from its silence.
## A test appended to a shared-database suite inherits the WHOLE file's state
Found by lane/h-diag (F-H-2 fix, 2026-09-05). Integration suites like
`tests/integration/database.test.ts` share ONE embedded-postgres instance across ~87 tests, and
vitest executes tests in DECLARATION order. So a new test with a global side effect — mine calls
`LivenessRepository.sweep`, which archives every qualifying run in the register version, not just
its own — will silently corrupt every test declared AFTER it. Declaring it last makes the side
effect unreachable, but **"it runs last" is an assumption, not a fact, until you run the whole
file**: a filtered `-t` run proves nothing about ordering because it skips the other 85 tests.
Rule: a test with cross-test side effects goes at the END of the file, and the whole file is run
once before handoff. The filtered run is for the RED/GREEN loop; the whole-file run is what
licenses the claim that you disturbed nothing.
## `register.register_row` is APPEND-ONLY: a test that mutates a seeded row dies in its own restore
Found by lane/t17t9 (2026-09-05). To give the acceptance policy reader a row with another
deployment's provenance I seeded the register normally and then `UPDATE`d one row's `source_ref`.
Postgres refused: `error: append-only or immutable table register_row rejects UPDATE`, raised by
`core.reject_mutation()`. The damage is not the refusal — it is WHERE it lands. My `UPDATE` sat in
a `try`, and the matching restore sat in the `finally`, so the failure vitest reported was the
RESTORE line, not the subject line. The test looked like a broken teardown when the real message
was "this table cannot be mutated at all".
Seeding a deliberately-bad row is also blocked from the other side: `seedAcceptanceRegister`
re-reads every row it wrote and throws `ACCEPTANCE_REGISTER_CONFLICT:<rowKey>` on a mismatch, so
pre-inserting the bad row before seeding fails too. Both guards are the system working correctly.
**What to do instead:** start a second embedded database and INSERT the row set directly, with the
one row's provenance swapped, without calling the deployment's seeder — the seeder is exactly the
thing whose absence the scenario models. Assert that exactly one row differs from what the seeder
would have written, or the fixture can drift into testing nothing. Cost: one gate-run.
## An empty variable turns `sed -n "${n},+30p"` into a sed SYNTAX error, not a "not found"
Same seat, same session, twice. `n=$(grep -n 'function foo' file | cut -d: -f1)` returns EMPTY when
the symbol is not in that file, and the next line becomes `sed -n ",+30p"`, which prints
`sed: 1: ",+30p": invalid command code ,`. That message names sed and a comma, so it reads as a
quoting or dialect problem in the sed command — and I went looking for one. It is neither: the
grep found nothing and the range lost its start address.
**I checked before recording this, and BSD sed on macOS DOES support the `addr,+N` form** —
`sed -n '2,+2p'` works here. So do not "fix" this by rewriting the range syntax; the syntax was
never the problem. Guard the lookup instead: `[ -n "$n" ] || { echo "SYMBOL NOT FOUND"; exit 1; }`.
Same family as this file's zsh `--include=*.ts` entry: a command that never ran, reported as a
command that ran and failed.
## `gate-run.sh <worktree>` runs the command in the WORKTREE ROOT, not the package root
The script computes `PKG` ("the package root the gate actually runs in (this repo nests the engine
one level down)") and uses it for the PROVISIONING block only. The command itself runs
`( cd "$WT" && "$@" )`. In this repo the git root is `.worktrees/lane-X` and the engine is one level
down, so `gate-run.sh .worktrees/lane-X out.log label pnpm typecheck` runs pnpm where there is no
`package.json` and records:
`ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND … was found in "…/.worktrees/lane-w3"`, `EXIT = 1`.
That is a well-formed gate record of a FAILING GATE, and nothing in it says the gate never ran —
I read it as a real typecheck failure first. Pass the ENGINE directory as `<worktree>`
(`.worktrees/lane-X/dialectical-engine`); `git -C` still resolves the same commit and tree from
there, and `git status --porcelain` still prints repo-root-relative paths, so the record is
unaffected. (W3 r1)
## A gate whose CWD has no package.json makes `npx` create an UNIGNORED `node_modules/` at the git root
Direct consequence of the trap above, and it corrupts every LATER record in the lane.
`.gitignore` ignores `dialectical-engine/node_modules/`, `dialectical-engine/web/node_modules/` and
`dialectical-engine/apps/**/node_modules/` — it does NOT ignore `node_modules/` at the git root,
which is a directory that exists in no other lane. My first `npx vitest` gate ran with CWD at the
git root, vite wrote its cache to `<git-root>/node_modules/.vite`, and the record closed with
`CLEAN-STATE: CHANGED — this measurement is suspect`. Every subsequent porcelain then carried
`?? node_modules/` in BOTH halves, which reads as clean-but-dirty and quietly devalues the record.
Check `git status --porcelain` for a bare `?? node_modules/` after any gate; if it is only
`.vite`, it is yours, and removing it restores a pristine porcelain. (W3 r1)
## A MISSING named export does not make a vitest file error — it binds `undefined` and the suite runs
Importing `EXPANSION_DEPTH_MAX` from `@debateai/contract` when the tree has no such export did not
throw `SyntaxError: … does not provide an export named …` the way native ESM would. Vitest's
transform bound it to `undefined`, the file loaded, and the run reported an ordinary
`Tests 15 failed | 31 passed (46)`. Read naively that says "the oracle disagrees with this tree";
what it actually said is "the symbol this oracle is about is not in this tree at all", which is a
different finding with a different owner. The check that NAMES it is the compiler:
`tsc --noEmit` → `error TS2305: Module '"@debateai/contract"' has no exported member
'EXPANSION_DEPTH_MAX'`. Run the typecheck before interpreting a cross-tree test result. (W3 r1)
## `git grep <rev> -- <pathspec>` takes a CWD-RELATIVE pathspec and reports a miss as "absent"
`git grep` and `git show` disagree about what a path means at a revision, and only one of them
says so:
- `git grep <rev> -- packages/contract/src/index.ts` — pathspec is **relative to CWD**.
- `git show <rev>:tools/orphan-audit/src/index.ts` — path is **relative to the REPO ROOT**;
  `<rev>:./tools/...` is the CWD-relative form.
In this nested repo (git root `V5/`, engine at `dialectical-engine/`) I was in the engine
directory and wrote the repo-root spelling for BOTH. `git show` refused loudly and printed the
fix (`fatal: path '…' exists, but not '…'  hint: Did you mean '<rev>:./tools/…'`). `git grep`
matched no path, found nothing, and exited non-zero — which my `&& PRESENT || absent` loop
rendered as **"absent"** for every commit checked. That output was indistinguishable from the
real finding it sat next to, and I nearly used it to contradict a coordinator amendment that was
correct. The verification that caught it: re-run with **no pathspec at all** and count matching
files per commit (`git grep -l <sym> <rev> | wc -l`) — 0 vs 5 is unambiguous where a filtered
miss is not. Never let a pathspec'd `git grep` be the sole evidence for a NEGATIVE claim about a
commit. (W3 r1)
## `pnpm lint` is `audit:architecture && audit:source` — a PRE-EXISTING architecture failure hides the source audit entirely
The root script is `pnpm run audit:architecture && pnpm run audit:source`. At this mission's
integration tip the architecture audit already exits 1 (three `-> obs-capture is not a declared
edge` violations that predate every current lane), so the `&&` short-circuits and **the source
audit never runs**. The gate record looks complete: the command, a JSON body listing three
violations, `EXIT = 1`. Nothing in it says a second audit was skipped.
I was one step from reporting "the numeric-literal-export rule is satisfied" on the strength of a
run that never evaluated that rule. Run `pnpm run audit:source` SEPARATELY whenever the
architecture half is red, and never read a green/absent source-rule result out of a `pnpm lint`
record whose architecture half failed. Same family as this file's existing entries: a command
that never ran, reported as a command that ran and passed. (W3 r2)
## A fallback that answers unrecognised requests makes the discriminator above it UNTESTABLE (lane/demo-path, 2026-09-05)
Follow-on to this file's S07 entry on class-dispatching provider doubles. That entry names the
SYMPTOM — an unrecognised organ falls to `GENERAL` and is handed the wrong scripted answer. This
is about the repair, and it is worse: after you add the missing discriminator, the same fallback
can keep the suite green when your discriminator does nothing at all.
`acceptance/ceremony.test.ts` enforced "never guess across classes" in ONE direction only. A
RECOGNISED request with no scripted response of its class refused by name; an UNRECOGNISED one
still took `pending[0]`, whatever class sat there. I added the EVALUATOR discriminator, the suite
went green, and I would have shipped it — except the mutant that deliberately breaks the
discriminator (`includes(TEXT + "DRIFTED")`) left ceremony at **2 passed**. The call fell through
to `GENERAL`, the fallback served the evaluator entry anyway, and the classification I had just
added was carrying no weight. Green, and pinning nothing.
Two things to take from it:
- **Test the discriminator, not only the response.** A double has two halves and they fail
  independently. The mutant that breaks the RESPONSE shape killed all three suites immediately;
  the mutant that breaks the REQUEST match killed only the suite whose fallback could not cover
  for it. Run both, and pair each with a neighbour that is still live (I weakened the match to a
  shorter substring: it must survive, or the mutant is testing the wrong thing).
- **A queue fallback is a class, so hold it to the same rule.** The cure was two lines: every
  request class, `GENERAL` included, consumes the first scripted entry of ITS OWN class or
  refuses by name. FIFO still works, within the class, which is all the health probes ever
  needed. Asymmetric enforcement is how the wrong-organ answer happened in the first place.
Transcripts: `logs/demo-path/r1-mut-M3-dead-discriminator-ceremony.log` (survived, before) and
`r1-FINALMUT-M3-dead-discriminator-ceremony.log` (killed, after).
## `tools/mutate.sh` cannot mutate a file that is not yet committed (lane/demo-path, 2026-09-05)
Its first gate refuses a dirty tree and its restore is `git checkout -- <path>`, so a NEW file —
a shared fixture you just wrote, say — is unmutatable while untracked: the tool aborts before it
starts, and if it did not, `git checkout --` could not put an untracked file back. Commit the
lane's work first, then mutate. Related but distinct from this file's `git diff --stat` entry:
that one is about not SEEING an untracked file, this one is about not being able to RESTORE it.
Also: re-run the campaign after any later fix. Eight of my transcripts were taken at the first
commit; the fix that came out of the surviving mutant moved the tip, and `stamp-check.sh`
correctly called all eight STALE. Mutant transcripts bind the tree they measured exactly as gate
records do (D41), and a campaign spanning two commits is a campaign nobody can read.
## A mutant killed ONLY by a planted control looks identical, in the suite summary, to one killed by real code
Both read `1 failed | 45 passed (46)` with a green-to-red transition and a clean mutate.sh
transcript. The summary line cannot tell you WHICH kind of kill you got, and a D24 transcript
records the command's exit, not the identity of the assertion that produced it. So a mutation
campaign can report full kill coverage while every kill is a fixture defending a fixture.
Read the `FAIL >` test NAMES, not the counts. The discriminator is whether a WHOLE-TREE assertion
(one that reads real files from disk) is among the dead. In this lane, mutating the conjunct rule
two ways gave: the shallower-rule mutant → 1 failure, a planted string control; removing the
boundary entirely → 7 failures INCLUDING both whole-tree assertions, naming a real file. Same
tool, same shape of transcript, completely different strength of evidence. (W3 r4)
## Before claiming "no real code exercises this rule", prove your instrument can SEE the difference
I scanned every shipped file under both the current rule and the mutant and got "no real file
differs" — which is the answer that closes a ticket, and is exactly the answer a BROKEN scanner
also returns. The check that makes it admissible costs one extra run: feed the instrument the
input the difference is KNOWN to exist on (here, the control the mutant kills) and confirm it
reports a difference there. Mine did — `current=0 shallow=1` on the control, `same` on the real
statement-level shape — which is what made the negative finding evidence rather than an absence
of evidence. A negative result from an unvalidated instrument is not a measurement. (W3 r4)
## zsh: `${PIPESTATUS[0]}` is EMPTY — the array is `$pipestatus` and it is 1-indexed
The Bash tool's shell here is zsh. `cmd | tail -3; echo "EXIT=${PIPESTATUS[0]}"` prints `EXIT=`
with no number and no error, so a gate that looks like it reports an exit code reports nothing at
all — and an empty string is falsy in most comparisons that follow. zsh's equivalent is
`${pipestatus[1]}` (lowercase, 1-indexed); bash's `${PIPESTATUS[0]}` works only under bash.
Safest: don't pipe the command whose status you need, or run the gate through `gate-run.sh`, which
captures the command's own exit properly. Same family as this file's other entries: a measurement
that silently reports nothing while looking like it reported something. (W3 r4)
## BSD `head -n -N` (all but the last N lines) is not supported on macOS
`head -n -12 file` fails with `head: illegal line count -- -12` rather than trimming the tail.
GNU head supports the negative form; the macOS one does not. Use `sed '$d'` repeatedly, awk with
a line count, or just regenerate the file from its source rather than trimming it. (W3 r4)

## zsh has no `$PIPESTATUS` — a logged `exit=` with an empty value is this trap, not a missing exit (orchestrator, 2026-09-07)

`cmd | tail -3; echo "exit=${PIPESTATUS[0]}"` prints `exit=` under zsh (the array is `$pipestatus`, lowercase, in zsh; `PIPESTATUS` is bash). A provisioning log written this way showed `exit=` for both steps, and a worker packet that gated on "`exit=0` for both steps" became unpassable on a healthy lane (the seat read it literally and charged the packet). Either run the command unpiped and read `$?`, or use `${pipestatus[1]}` (zsh is 1-indexed) — and never gate a seat on a value you have not seen in the file.

## Lane lane/sessions-argon2 appends carried across the dev merge (2026-09-07; union, nothing removed)

## A fixture pinned to a fixed CALENDAR DATE dies on a date, and blames the wrong thing (lane/sessions-argon2, 2026-09-07)
`tests/integration/session-database.test.ts` fixed `now` at `2026-08-23T10:00:00Z` and injected
it as the service clock. The session policy's idle TTL is 14 days, so the login created a session
with idle expiry `2026-09-06T10:00:00Z`. The risk-signal scope query does NOT use that injected
clock: `identity.prepare_authentication_risk_signal_for_session` (migrations/0046:83) filters on
`clock_timestamp()`, the DATABASE clock. From 2026-09-06T10:00Z the session was already expired
at the database, the scope resolved to no row, and the login failed. Nothing in the diff changed;
the date did. The test had passed for weeks and would have passed on any earlier day.
Two things to take from it:
- **An injected clock only covers the code that reads it.** The moment an assertion path crosses
  into SQL, `clock_timestamp()` / `now()` is a SECOND clock the fixture does not control. Grep the
  functions your assertion path calls for `clock_timestamp` before you pin a date. The repair is
  to read the time from the pool (`SELECT (extract(epoch FROM clock_timestamp())*1000)::bigint`)
  and keep every advance relative to it — not to widen a policy and not to sleep.
- **The failing test's NAME sent two seats after the wrong cause.** This one is titled "runs the
  password-to-TOTP challenge through real Argon2 …", so the first diagnosis was a native Argon2
  binding on this machine, and it was pursued as far as removing the alias from both manifests and
  node_modules. Argon2 was in the title, not in the mechanism. A date-dependent failure looks
  exactly like an environment-dependent one — both are "fails here, passed there". Before you
  reach for the environment, check whether the fixture names an absolute date.
## Fixing a DISCARDED error makes the failure readable, and is itself pinned by nothing (lane/sessions-argon2, 2026-09-07)
`apps/api/src/sessions.ts:439` and `apps/api/src/recovery.ts:84` were `}catch{onRiskSignalFailure();}`
— the failure was observable, its cause was not, which is why the fixture defect above could only
be attributed by experiment instead of by reading a log. Passing the caught error to the callback
turned `UNEXPECTED_RISK_SIGNAL_FAILURE` into `UNEXPECTED_RISK_SIGNAL_FAILURE (TypeError:
LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED)` and named the cause in one run.
The trap is what happens NEXT. Once the underlying defect is fixed, the catch is not entered on a
healthy tip, so the mutant that re-discards the error (`}catch{onRiskSignalFailure();}`) SURVIVES:
measured here at `11 passed (11)` on the whole session file, and `3 passed (3)` on
`tests/unit/p2-recovery-start.test.ts` for the recovery half. A diagnostic improvement is invisible
to a green suite by construction — the only test that can pin it is one that deliberately drives
the failure path and asserts on what the callback RECEIVED. If you add one, add it in the same
round; a diagnostic with no pin is one refactor away from being discarded again.
Also worth knowing when you sweep this class: search for the SHAPE, not the keyword. On the tree
BEFORE this fix, `grep -rnE "catch *\{" apps packages` returned 134 sites, most of them legitimate
control flow (`try{JSON.parse(x)}catch{return null}` and the like) — too coarse to be a class. The
shape that loses a cause is a bare catch whose body is a ZERO-ARGUMENT notifier call:
`grep -rnE "catch *\{[^}]*\(\) *;? *\}" apps packages` returned exactly 3 — `sessions.ts:439`,
`recovery.ts:84`, and `packages/db/src/auth-risk.ts:212` (`}catch{poisoned();}`). After this fix the
same two greps return 132 and 1, the one remaining being auth-risk.ts:212, which replaces a
decrypt/parse cause with a fixed `AUTH_RISK_SIGNAL_POISONED` and is still open (it is in
`packages/`, outside this lane's contract).
## FOLLOW-UP to the entry above: the pin was cheap, and the reason I thought it wasn't (lane/sessions-argon2 r1, 2026-09-07)
The entry above ends "if you add one, add it in the same round". I did not, and codex returned
CHANGES with that as the blocking finding. Correcting the record, because the numbers in it are
round-0 state: B1/B2 are now **KILLED**, not surviving (`logs/sessions-argon2/14-mut-B1-killed.log`,
`15-mut-B2-killed.log`), by two new failure-path cases per service.
The useful part is WHY I skipped it. I believed pinning `sessions.ts`'s catch meant duplicating the
81-line Argon2 worker-pool fixture from `tests/integration/session-database.test.ts` into a file
that has to stay green three runs running. That was wrong, and checkable in two minutes:
- `completeLogin`'s **TOTP branch** reaches the risk-signal catch using `decrypt` (AES-GCM) and
  `matchTotpStep` (HMAC) only. Argon2 appears on the **recovery-code** branch (`verifyRecoveryCode`)
  and in `SessionService.create` — and `create` hashes a dummy password ONLY when you omit
  `dummyPasswordHash`. Pass a syntactically valid argon2id string (`parseEncodedArgon2id` parses it
  before `verifyPassword` delegates) and a stub `Argon2Executor`, and no Argon2 runs at all.
- So the pin is a plain unit test with small stubs: two cases, 19 ms and 2 ms.
Two transferable tricks from writing it:
- **Capture the binding hash from the service, don't re-derive it.** `beginLogin` computes
  `bindingHash` and hands it to `repository.createLoginChallenge`; capture it there and feed it back
  through the `readLoginChallenge` stub. Re-deriving the HMAC in the test duplicates production
  logic and would let a change to that derivation pass silently.
- **`dekStore.load` must return a FRESH copy each call** (`Buffer.from(dek)`): `totpStep` zeroes the
  buffer it is handed in its `finally`, so a shared buffer decrypts once and then fails.
And the estimating lesson, which is the real one: **before declining work because it is expensive,
measure the cost.** I let an unchecked estimate decide, and the estimate was wrong by an order of
magnitude. A sentence of the form "I did not do X because X is expensive" needs a number in it.
## A stub that is never reached looks exactly like a stub that carries the case (lane/sessions-argon2 r1, 2026-09-07)
I claimed `tests/unit/p2-recovery-start.test.ts`'s second case exercised the risk-signal catch in
`recovery.ts`, and cited its line numbers. It exercises nothing: that case's `repository.start()`
throws `DATABASE_UNAVAILABLE`, and the catch sits inside `if(outcome.status==="created")`, so the
block is unreachable and the `recordForRecovery` stub below it is dead code. The stub is right
there in the source, three lines under the thing that makes it unreachable.
The tell was already in my own evidence: the mutant on that catch survived at `3 passed (3)`. I read
that as "no assertion on the delivered value" when it equally meant "this code never runs" — one
measurement, two possible conclusions, and I recorded only the smaller one. When a mutant on a
branch survives, rule out "the branch is never entered" BEFORE concluding "the assertion is weak";
they need different fixes and only one of them is a missing assertion.
State coverage as the BRANCH a test enters, never as the stub it supplies. "This case drives the
`status==="created"` path into the catch" is falsifiable by reading one `if`; "this case supplies a
scope_unresolved recorder" is not a claim about coverage at all.

## `codex exec --sandbox workspace-write` cannot `listen()` — a full suite run inside it is not a gate (orchestrator, 2026-09-07)

The codex sandbox (macOS seatbelt) refuses `listen` on 127.0.0.1: `Error: listen EPERM: operation not permitted 127.0.0.1`. Every embedded-PostgreSQL, relay and HTTP test then fails identically (97 `listen EPERM` in one run; 85 files red instead of 35), and `fourcount5` rejects the log (exit 5, identity mismatch). Seen first in the sessions codex review (it could not run one integration test), then in the evaluator implementer's closing suite. Rule: a Codex seat that implements in the sandbox files its unit/selected gates and STATES that the full suite is the orchestrator's; the orchestrator takes it outside the sandbox with `tools/gate-run.sh` at the seat's final tip and attributes it. A seat that instead reports a sandboxed full suite as a gate has reported a different environment's result as this one's.

## Lane lane/t1-oracle-evaluator appends carried across the dev merge (2026-09-07; union, nothing removed)


## Lane lane/t1-oracle-evaluator appends carried across the dev merge (2026-09-07; union, nothing removed)


## A fresh lane worktree has NO `node_modules`, so "baselines FIRST" collides with a single-install grant
Found by F-T1-ORACLE-EVALUATOR round 0 (2026-09-06) in `.worktrees/lane-t1-oracle-evaluator`.
The packet ordered baselines on the clean base BEFORE the one authorised `pnpm install`. But the
worktree had no `node_modules` at all (`ls -ld node_modules` -> No such file or directory), so
`pnpm exec vitest` and `pnpm typecheck` could not run at all until something installed. A seat
reading "one install" literally either burns its single grant on setup or reports itself blocked.
**The resolution, and it is provable rather than a judgement call:** `pnpm install --frozen-lockfile`
CANNOT modify `package.json` or `pnpm-lock.yaml`, so it is setup, not the granted dependency change —
run it, then print `git status --porcelain` to show both manifests untouched. The grant's install is
the one WITHOUT `--frozen-lockfile`. Also required before any suite run: `pnpm run generate:contract`
(`packages/contract/generated/client.ts` is gitignored and absent from every fresh worktree — already
recorded above, and it bit again here).
**Rule for packet authors: when a packet says "baselines first" and also "exactly one install", it must
say which command establishes the toolchain.** Cost here: one analysis detour before any command ran.

## An aliased dependency can produce a lockfile delta with NO `packages:` entry — that is correct, not incomplete
Same round. Adding `"typescript-classic": "npm:typescript@5.9.3"` produced a **3-line, 0-removal**
`pnpm-lock.yaml` delta consisting only of the root importer stanza (`typescript-classic:` / `specifier:
npm:typescript@5.9.3` / `version: typescript@5.9.3`). No `packages:` block was added **because
`typescript@5.9.3` was already resolved in the lockfile** (apps/ui pins `^5.6.0`), so the alias reuses
the existing resolution. A reviewer expecting a new `packages:` entry can read this as a truncated or
partial delta and send the round back.
**State it affirmatively in the report, with the pre-existing `typescript@5.9.3:` lockfile line numbers
quoted.** The strong evidence that no unrelated upgrade rode along is the **zero-removal** count: an
upgrade rewrites an existing line and therefore always produces a removal.

## CORRECTION to the two entries above (F-T1-ORACLE-EVALUATOR r1, after codex r0 F4/F5)
The two entries I appended in round 0 taught two slogans that are stronger than the evidence. Both are
narrowed here rather than edited, per this file's append-only rule.

- **"`pnpm install --frozen-lockfile` CANNOT modify package.json or pnpm-lock.yaml" — too strong.** The
  flag is not an immutability boundary; a frozen install still resolves a store and **executes package
  scripts** (my own round-0 setup log shows it). What actually discharged the question was the
  *observed state*: `git status --porcelain` empty afterwards, plus the complete recorded diff. **Rule:
  cite the observed state and the diff, never the flag's promise.**
- **"a zero-removal lockfile delta cannot contain an upgrade" — not a sufficient general proof.** It
  held for the case I measured (one aliased devDependency reusing a resolution already in the file),
  and it is good corroboration, but a lockfile format can express a change without a removed line, so
  it must not be used as a standalone upgrade proof. **Rule: inspect the actual changed content and the
  resulting resolved versions; use the removal count as corroboration only.**
- **Evidence tools must be hardened BEFORE they are promoted.** A four-count parser that prints
  `MISMATCH` without a nonzero exit, or a mutation harness that checks an anchor *exists* rather than
  matching a declared multiplicity and does not enforce restoration on interrupt, is fine under a human
  eye and unsafe as an unattended gate. Prefer the mission's `tools/mutate.sh` v2, which gates
  pre/applied/restored, sha equality and empty porcelain.

## Extracting code between files: COPY it, never retype it from a partial read
Found by F-T1-ORACLE-EVALUATOR r1 (2026-09-06), and it cost a RED gate. Moving the depth oracle's
ceiling arms into a new module, I reproduced `declarationUnits` from the first ~12 lines I had read on
screen. The real function is ~60 lines and also handles line comments, block comments, string literals,
template literals with nested `${}`, braces as unit boundaries, closing brackets below the start depth,
commas as separators, and — the load-bearing part — splits conjuncts at `&&`/`||`/`??` at **any**
bracket depth. My reconstruction split only at the unit's own depth, which silently widened the
exclusive-six window and turned the inherited control
`does not pair a six with a depth in another conjunct of the same condition` RED.
**The control caught it, which is exactly why that floor exists.** Two lessons: (1) extract by copying
the exact byte range and then assert byte-identity mechanically — I now diff every moved function
against its source and print `verbatim: True` before trusting it; (2) a behaviour-preserving extraction
must be proven by the inherited controls, so migrate them in the SAME step and run them.

## vitest also TRUNCATES a long `it.each` name — a second way to miscount a suite
Found by F-T1-ORACLE-EVALUATOR r1 (2026-09-06). The recorded `-t` trap above covers `it.each`
interpolating `$var` **in quotes**. There is a second half: vitest also **truncates** a long rendered
name with a `…`. A title of `` `addresses $id` `` with a 48-character `$id` prints as
`addresses 'A1 — ASI: the owning statement begins…'`.
So `grep -cF 'addresses A'` returned **0** while ten such tests existed and passed — I nearly filed a
selected-group inventory that was ten short. `grep -cF "addresses 'A"` returns 10.
**Rule: never count tests by grepping a name you composed in source; count the names the RUNNER
printed, and match a prefix short enough to survive both the quoting and the truncation.** A `-t`
filter is safe if its pattern is a substring of the *visible* prefix (`-t "A1 — ASI"` matched).

## A RED that says "X is not a function" is a MISSING-SYMBOL frame, not the defect
Found by lane/risk-signal-diagnostics r0 (2026-09-07), on a ticket whose whole content was
"make an internal distinction VISIBLE" (decrypt-vs-parse behind one `AUTH_RISK_SIGNAL_POISONED`).
I wrote the test against a reader that did not exist yet, ran it, and got three red tests whose
message was `TypeError: authenticationRiskSignalPoisonCategory is not a function`. That transcript
proves the reader is absent. It does **not** prove the two stages are collapsed — which is the
thing the ticket exists to fix — so it is not admissible RED for this ticket, and a reviewer
comparing it against the fix cannot tell whether the fix changed behaviour or only added a symbol.
**Rule: when the defect is "an existing failure carries no distinguishing information", land the
READ side first — the pure inspector that returns `null`/`undefined` when the information is
missing — and take the RED against it.** The frame then reads `expected null to be 'context-decrypt'`,
which is the defect stated in the runner's own words. The read side changes no behaviour, so it is
not a fix smuggled in ahead of the test. Cost here: one extra capture, ~4 minutes, because I
noticed. Uncaught it would have shipped a RED record that pins nothing.

## zsh eats an unquoted `--include=*.ts`
Same family as the recorded macOS `timeout`/`rg`/`awk` traps. In `zsh`, `grep -rn foo dir/ --include=*.ts`
dies with `no matches found: --include=*.ts` before grep ever runs, because zsh tries to glob the
argument itself and `nomatch` is on. Bash users never see it. Quote it: `--include='*.ts'`.

## `sed -E 's/…/\1/'` KEEPS the lines it fails to match — a generated allow-list silently grows source lines
Found by lane/diag-bounded r0 (2026-09-07), building a 215-entry allow-list of failure constants by
grepping the tree. `grep … | sed -E "s/.*'([A-Z][A-Z0-9_]*)'/\1/" | sort -u` looks like an extractor.
It is not: `s///` rewrites the lines that match and **passes the rest through untouched**, so every
line the pattern missed stayed in the output as a whole line of source — and `sort -u | wc -l` counted
those as constants. Two pipelines over the same 122 matches disagreed, 85 against 79, and the six
"extra" were `migrations/0037_run_ownership.sql:161:    RAISE EXCEPTION USING ERRCODE = '55000', …`
in full. Nothing failed; the list was just wrong, and it was about to be pasted into two source files.
(The BSD-grep half of the cause: `\s` is not a character class in `grep -E` on macOS, so
`MESSAGE\s*=` matched nothing and every one of those lines fell through the `sed`.)
**Rule: extract with a matcher that can only emit matches — `grep -o` and then split — never with a
substitution. And when a list is going into source, cross-check the count two independent ways and
`grep -v` the result against the shape you expect (`grep -vE '^[A-Z][A-Z0-9_]{1,63}$'` must be empty).**
Cost here: ~6 minutes and one near-miss, caught only because I printed the list and read it.

## `mutate.sh` runs your test command at the LANE ROOT, not in the package
Same family as the recorded path traps. `mutate.sh` does `cd "$LANE"`, and `$LANE` is the worktree
root (`.worktrees/lane-<x>`), one level ABOVE `dialectical-engine/`. So both arguments change shape:
the target file is `dialectical-engine/apps/api/src/index.ts`, and a bare
`pnpm exec vitest run tests/unit/x.test.ts` runs where there is no `package.json` and fails for a
reason that has nothing to do with the mutant. Wrap it:
`bash -c 'cd dialectical-engine && pnpm exec vitest run …'`.

## A negative lookahead after `\s*` matches everything multi-line — 180 false "dynamic" sites
Found by lane/diag-bounded r1 (2026-09-07), enumerating which `new TypedDomainError(...)` calls pass a
literal code and which pass a variable. The literal probe was
`new TypedDomainError\(\s*"([A-Z][A-Z0-9_]*)"` and the complement was
`new TypedDomainError\(\s*(?!")(...)`. The complement reported **180** dynamic sites; the true number is
**13**. Cause: `\s*` is greedy but backtracks to ZERO width, so on a wrapped call —
`new TypedDomainError(\n        "MAKER_POSITION_UNAVAILABLE",` — the engine tries `\s*` = empty, the
lookahead then inspects `\n`, which is not `"`, and the "not a literal" branch matches every multi-line
call in the file. The two patterns are not complements even though they read as though they are.
**Rule: never put a negative lookahead directly after a variable-width whitespace match.** Anchor the
lookahead to a fixed position instead — match what you DO want (`\s*(?:"[^"]*"|\`[^\`]*\`|[A-Za-z_$][\w$.]*)`)
and classify the capture afterwards, which is the same "only emit matches" rule the `sed` trap above states.
Cheap self-check: the two branch counts must sum to the total call count — 419 + 180 against 432 calls
was the tell, and it was visible for free.
Cost here: ~5 minutes, and it would have put ~170 phantom entries in a hand-audited citation table.

## Splicing an array literal by `index("[")` hits the `[]` of `readonly string[]` first
Found by lane/diag-bounded r2 (2026-09-07), replacing the body of
`const KNOWN_DOMAIN_CODES: readonly string[] = Object.freeze([ … ]);` in two files. The splice was
`a = block.index("[", block.index("const KNOWN_DOMAIN_CODES"))` — which finds the `[` of the TYPE
ANNOTATION `string[]`, not the array literal eleven characters later. The result was syntactically
broken TypeScript written to both files, and the failure surfaced as an oxc
`[PARSE_ERROR] Expected ] but found ,` pointing at the FIRST ARRAY ELEMENT, ~50 lines below the real
damage and in a file the message made look corrupt.
**Rule: anchor a structural splice on the longest unambiguous literal that ends where you want to cut —
here `const NAME: readonly string[] = Object.freeze([` — never on a bare bracket after a name.** Then
assert the element count before AND after (`399 -> 398`); the assertion is one line and it converts this
class of bug from a confusing parse error into a message that names the count.
Recovery is `git checkout -- <files>` and redo; nothing is salvageable from a bad splice.
Cost here: ~4 minutes, all of it spent reading a parse error that pointed at the wrong place.

## A `grep` that finds nothing (exit 1) silently kills the rest of an `&&`-chained diagnostic script
Found by lane/diag-class-a (2026-09-07) while sweeping producer files. A multi-section sweep written
as `echo A && grep X && echo B && grep Y && echo C` printed sections A and B and then STOPPED — not
because the remaining greps found nothing, but because the FIRST grep with no match exited 1 and the
`&&` chain aborted. The output reads exactly like "the remaining patterns are absent from the tree",
which is the opposite of what happened: they were never searched. In this lane the missing sections
were "is `DEV_` ever an env var?" and "what do the `fixedStep` wrappers do?" — two questions whose
false "no" would have put a wrong alphabet into a shipped source file.
**Rule: join the sections of a diagnostic script with `;` or newlines, never `&&`.** `&&` is for
"only if the previous step succeeded"; a grep's exit code is an ANSWER, not a failure. Where you do
want the answer, capture it explicitly (`grep …; echo "rc=$?"`) rather than letting the shell branch
on it. Cost here: ~3 minutes and one re-run, plus the near-miss of reading an aborted chain as evidence.

## zsh expands `--include=*.ts` before `grep` sees it: `no matches found`
Same lane, same day. `grep -rn "name" --include=*.ts .` fails in zsh with
`(eval):1: no matches found: --include=*.ts` — zsh treats the `*.ts` inside the option as a glob to
expand against the CURRENT directory and errors when nothing matches, so grep never runs. bash does
not do this, so the idiom is copied in from bash notes and dies here. It is not a grep error and the
message does not name grep.
**Rule: quote the pattern in every `--include` / `--exclude`: `--include='*.ts'`.** Same for
`--exclude-dir='node_modules'`. Cost here: ~1 minute, but the failure mode is worth knowing because
the message blames the shell, not the command you were debugging.

## An identity gate compared against a SORTED derivative reports a false break
Found by lane/diag-class-a rework round 1 (2026-09-07). The typecheck identity gate compares the
diagnostic lines at the tip against the untouched-lane baseline. Round 0 saved the baseline as raw
`grep` output (file order); round 1 re-extracted the tip's lines through `... | sort`. `diff` then
exited 1 and the console read `identical-to-baseline exit=1` — which on an IDENTITY gate looks
exactly like "your diff changed the diagnostics", the one thing that gate exists to catch. Both files
had 8 lines and the same sha256 once compared like-for-like.
**Rule: an identity gate must compare artifacts produced by the SAME pipeline, and should compare a
HASH, not a diff exit code.** Save the baseline and the tip extract with identical commands, print
both sha256 values beside the verdict, and let the hash be the claim. A diff exit of 1 tells you the
files differ, not whether the DIAGNOSTICS differ. Cost here: ~1 minute, and a few seconds of believing
a gate had broken.

## `mutate.sh` APPENDS to its output path: re-running a mutant on a rework round hides the new stamp
Found by lane/diag-class-a rework round 1 (2026-09-07). The round-1 tip re-ran the six round-0
mutants into their existing numbered log paths. mutate.sh writes its transcript with `>>`, so each
file ended up holding BOTH transcripts, round-0's first. `stamp-check.sh` reads the stamp with
`grep -m1 -oiE 'commit[=: ]+[0-9a-f]{40}'` — the FIRST match — so all six re-taken records were
reported STALE against the round-0 tip even though a correct round-1 transcript sat lower in the very
same file. The comparator went from 6 expected failures to 14, and the six extra ones look exactly
like "the worker forgot to re-run the mutants".
**Rule: on any rework round, `rm` the mutant transcript (or write to a fresh path) BEFORE re-running
mutate.sh.** If you have already appended, split at the second `^commit=<40 hex> tree=` line rather
than re-running: the two transcripts are intact and separable. Keeping superseded transcripts is
still worth doing — move them to a SUBDIRECTORY, which the comparator skips (`[ -f "$f" ] || continue`
matches files only, and the glob does not recurse). Same trick keeps unstamped supplemental artifacts
out of the population. Cost here: ~4 minutes, and one full re-measure cycle to re-stamp at the tip.

## `x as Record<Union, T>` is NOT an exhaustiveness check — it silences the very error you wanted
Found by lane/diag-class-a rework round 2 (2026-09-07), while building a private vocabulary that had
to stay in step with an exported union. The literal was written
`{ A: 0, B: 0, ... } as Record<Kind, 0>` and the comment above it claimed that adding or removing a
member of `Kind` would be a compile error. Measured on this repo's tsc 7.0.2:

    { A: 0, B: 0 } as Record<"A"|"B"|"C", 0>          -> NO ERROR        (missing C silenced)
    const x: Record<"A"|"B"|"C", 0> = { A: 0, B: 0 }  -> TS2741 missing 'C'
    { A: 0, B: 0 } satisfies Record<"A"|"B"|"C", 0>   -> TS2741 missing 'C'
    { A:0,B:0,C:0,D:0 } satisfies Record<"A"|"B"|"C",0> -> TS2353 excess 'D'

`as` is an ASSERTION: it tells the compiler to stop checking. A typed const declaration or a
`satisfies` clause CHECKS. Only the latter two catch drift in both directions.
**Rule: never write `as` where you mean "and the compiler will hold me to this" — use `satisfies`
(or a typed declaration), and PROVE the guard fires by breaking it once and reading the error code
before you write a comment claiming it.** A guard nobody has seen fire is a comment, not a guard.
Cost here: ~3 minutes, and it came within one commit of shipping a source comment that promised a
guarantee the code did not provide — the exact class of defect this lane's review has been finding.

## "Restore the default" is NOT a mutant for "this parameter is now REQUIRED"
Found by lane/dev-health (2026-09-07). The ticket removed a defaulted parameter
(`poisoned(category = "signal-shape")`) and made all five call sites name their category.
The packet prescribed the obvious mutant — restore the default, expect typecheck or a test to
fail. Measured on the fixed tip: it fails NOTHING. `pnpm typecheck` returned the same 8
inherited s14-ui diagnostics and nothing else; `tests/unit/p2-auth-risk.test.ts` returned
12/12 passed; mutate.sh recorded `RESULT: ok … cmd_exit=0`.

The reason is structural, not a gap in the tests: once EVERY call site passes the argument, the
default is dead code, and re-adding dead code is unobservable by construction. A mutant on the
DECLARATION cannot discriminate a property whose whole content is what the CALL SITES do.
**Rule: to pin "this parameter is required", mutate a CALL SITE — strip the argument and read
tsc.** Measured: `packages/db/src/auth-risk.ts(91,51): error TS2554: Expected 1 arguments, but
got 0`, a diagnostic that exists only because the default is gone. Cost here: ~4 minutes and
one extra mutate.sh cycle, but the expensive version of this mistake is reporting the
prescribed mutant as "expected failure" without running it, or quietly swapping in a different
mutant and calling it the packet's.

Related, same lane: **you cannot delete a line with mutate.sh by mutating it to the empty
string.** Its pre-gate counts NEW as a substring via python `str.count`, and `"abc".count("")`
is 4, not 0 — so an empty NEW always trips `RESULT: FAIL pre-gate` no matter what the file
holds. To remove a manifest entry, mutate it into something inert instead (prefixing `#` works
when the reader skips comment lines). STRENGTH: entailed, read from mutate.sh's own `count()`
heredoc, not measured by a deliberate failing run.

## An identity gate whose extractor greps the log it wrote its own header into
Found by lane/dev-health (2026-09-07), one entry below the SORTED-derivative trap and the same
false break by a different mechanism. The typecheck identity gate writes a header, appends
`pnpm typecheck` output to the same file, then extracts the diagnostics with `grep 'error TS'`.
One header line explained the method and CONTAINED the token it was about. The extract came back
with 9 lines against the baseline's 8, the sha256 differed, and the gate printed
`VERDICT: DIFFERENT` — which on an identity gate reads exactly like "your diff changed the
diagnostics". The ninth line was the comment. The same extraction taken minutes earlier from a
file with no header was byte-identical to the baseline.
**Rule: an extractor must not be able to match the prose in its own artifact. Grep a pattern only
real output can satisfy (`'): error TS'`, anchored to the compiler's `file(line,col):` shape),
and drop comment lines explicitly (`grep -v '^#'`). Better still, keep the raw command output in
its own file and let the annotated record cite it.** And when an identity gate breaks, DIFF the
two extracts and read the added line before touching the code — the line names the cause in one
look. Cost here: ~2 minutes, and a few seconds of believing a clean typecheck had regressed.

## CORRECTION to "Restore the default is NOT a mutant for REQUIRED" — the impossibility claim was too broad
Filed by lane/dev-health rework round 1 (2026-09-07), correcting the entry above, which is left
standing because this file is append-only. Codex r1 (R1) refuted its universal half and is right.

What the entry got right, and what it overstated. RIGHT: no RUNTIME row can observe a restored
default, because a default is only visible at a call site that omits the argument, and once every
call site names its category no such call site exists. Mutant b really does survive every runtime
check, and that measurement stands. **OVERSTATED: "a mutant on a DECLARATION cannot discriminate a
property whose whole content is what the CALL SITES do."** It cannot be discriminated at RUNTIME.
It is perfectly observable at the TYPE level, and the entry should not have generalised from one
layer to the language.

The observer that works, and that the entry should have reached for: a **compile-negative contract
check** living in the ordinary test file. Read the module's committed source, append one call that
omits the argument, compile that virtual source in memory with `typescript-classic`, and require a
TS2554 whose position lies past the end of the real source. Restore the default and the arity error
disappears, so the check goes red. The helper stays private, nothing is exported for testing, and
no invalid call is ever executed. Implemented at `tests/unit/p2-auth-risk.test.ts`.

Two guards that check needs, both learned here. (1) Filter the arity diagnostic by POSITION, or a
stray arity error inside the module can pass for the probe's. (2) Assert that no "cannot find name"
diagnostic mentions the helper — if it stopped resolving there would be no arity error either, and
"no arity error" would read exactly like a restored default. Measured with `noResolve: true`: the
omitting probe yields 85 semantic diagnostics of which exactly 1 is TS2554, and the naming probe
yields 84 of which 0 are; the rest is unresolved-import noise that the filters drop.

**Rule, restated: before writing "X cannot be pinned", name the LAYER — runtime, type, or build —
and check the other two.** A mutant that survives every runtime check is evidence that the runtime
layer is blind to it, never evidence that nothing can see it. Cost of the overstatement: one review
round. Mutating a call site (the earlier entry's rule) remains the right way to show the SHIPPED
compiler agrees — the contract check and that mutant are complementary, not alternatives.

## A "shape-legal synthetic" copied from a sibling test can be illegal for YOUR regex
Found by lane/diag-tail (F-DIAG-DEV-API-CLI, 2026-09-07). The bounded-vocabulary tests in this
corpus all use a synthetic message that is deliberately SHAPE-LEGAL for the rule being removed, so
the row proves the vocabulary is doing the work and not the shape. The established constant is
`DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER`, written against the joiner's
`/^DEV_[A-Z0-9_]+$/u` (apps/runner/src/dev-auth-stack.ts:312). I reused its shape for a DIFFERENT
rule — the dev API CLI's `/^DEV_API_ENVIRONMENT_[A-Z_]+$/u` — whose class carries **no digits**.
`PW_42` therefore never matched, the synthetic reached the fallback under the shape rule and under
the vocabulary alike, and the row pinned nothing while reading as if it pinned everything. Its
comment asserted the opposite in prose.

**Nothing caught it except the mutant.** The suite was green, the RED capture was red for the right
reason (the classifier did not exist yet, so every row failed), and the restored-shape-rule mutant
came back `EXIT = 0`. A green suite plus a red RED capture is not evidence that a row discriminates.

**Rule.** A synthetic that exists to be admitted by a rule must be checked AGAINST THAT RULE before
the assertion is written — one line settles it:
`node -e 'console.log(/^DEV_API_ENVIRONMENT_[A-Z_]+$/u.test("<synthetic>"))'`. Character classes
differ between sibling rules in this repo (`[A-Z_]` vs `[A-Z0-9_]`), so "it works in the other
test" is not transitive. Cost: one full re-take of every final-head gate and mutant record, because
the fix moved the tip after the records were already stamped.

**Second-order rule, same round.** Append to this file and stage every other artifact BEFORE taking
the final record set, not after: a trap append is a tracked edit, so it moves the tip and invalidates
every record already stamped. Two re-takes in this lane, both avoidable by ordering.
- **Applying CPU load BEFORE an embedded-PostgreSQL start starves `initdb`, not the code
  under test.** (lane/flakes, F-FLAKE-POL03, 2026-09-07.) The first reproduction attempt put
  16 busy-loop processes on a 12-core machine and then ran `vitest run <integration file>`
  in a loop. Load average went to 180; `startTestDatabase()` never finished in ten minutes
  and the loop produced ZERO samples — the probe measured nothing at all, and a 10-minute
  tool timeout was the only signal. **Start the database first, apply the load after it is
  up, and keep the load at roughly 1x cores (8 burners on 12 was enough).** Same run, done
  that way: 30 failures in 120 child runs versus 0 in 40 unloaded.
- **For a race inside a spawned child, loop the CHILD, not the test file.** (lane/flakes,
  2026-09-07.) `vitest run tests/integration/pol03-pool-resilience.test.ts` costs ~24 s per
  sample and ~21 s of that is embedded-PostgreSQL startup plus module import; the actual
  child runs for ~0.8 s. A driver that starts ONE database and then loops the child through
  the existing test-support harness gives ~30x the sample rate for the same wall clock and
  isolates the mechanism instead of the file. Name it `.mts` (the tsx/CJS trap above).
- **A promise held across an `await` has no rejection handler for the whole window, and
  Node kills the process for it.** (lane/flakes, F-FLAKE-POL03, 2026-09-07.) `const p =
  client.query(...); await somethingThatMakesPReject(); await expectFailure(p);` attaches
  the handler only at the third line. If the rejection is processed in an earlier tick than
  the second line's reply, `processPromiseRejections` sees it unhandled and the default
  `--unhandled-rejections=throw` ends the process — a crash whose stack points at the
  library that TYPED the error, not at the call site that failed to attach a handler. The
  fix is to attach in the same synchronous turn: `const p = expectFailure(client.query(...))`
  then `await p` later. Read such a stack as "who was holding this promise", not "who threw".
- **zsh expands an unquoted `--include=*.ts` argument.** `grep -rn "x" . --include=*.ts`
  fails with `no matches found` before grep ever runs. Quote it: `--include='*.ts'`.
  (lane/flakes, 2026-09-07; two wasted probes.)

## `ERR_UNHANDLED_REJECTION` is NOT what Node prints when an Error goes unhandled
Found by lane/small-trio (F-T9-UNATTENDED-PROMISES, 2026-09-08). The positive control for the
unattended-promise class asserted that a child killed by an unhandled rejection prints
`ERR_UNHANDLED_REJECTION`. It does not. Under the default `--unhandled-rejections=throw`, Node
RE-THROWS an Error-typed reason as an ordinary uncaught exception and prints the error and its
stack; the `ERR_UNHANDLED_REJECTION` code appears only when the reason is NOT an Error (Node
wraps a non-Error reason to have something to throw). Measured on node v25.7.0: rejecting with
`new TypeError("X")` printed `TypeError: X` and exited 1, with the string
`ERR_UNHANDLED_REJECTION` nowhere in stdout or stderr.
**Rule: for "the process died of an unhandled rejection", assert the DEATH, not a code string —
nonzero exit, the marker AFTER the join never printed, the join's own catch never printed, and
the reason's text on stderr. Reserve the code assertion for reasons you know are not Errors.**
Cost here: one red row and one debugging cycle, caught by the control itself — which is the
argument for writing the positive control at all: a probe that cannot go red proves nothing, and
this one went red for a reason that was mine, not the code's.

## Node runs the TypeScript source of a test region verbatim, which turns a source-text check into a behavioural one
Same lane and ticket. The defect being fixed lives inside a 22-second, database-backed
integration window, so the obvious unit-sized test is a hand-written COPY of the loop's shape —
which pins nothing, because the copy stays green whatever the real loop does. Instead the row
slices the region's OWN text out of `tests/integration/registration-database.test.ts` between two
stable anchors and runs it in `node --input-type=module-typescript -e <preamble + region>` against
stubs. Type annotations, `!` non-null assertions and generic arrows are all erasable, so the
region runs unmodified and unknown type names (`T9Score`, `ResendObservation`) cost nothing.
**Rule: when the property is a SHAPE of a region you cannot execute in place, execute the region's
text. Guard it: assert the anchors were found, assert the slice still contains the call the stubs
replace, and ship a positive control that mutates the slice and requires the child to die — that
control is the only thing standing between this and a check that passes on an empty string.**

## A `sql.includes("<query text>")` stub is pinned to a product STRING, and it rots silently
Found by lane/known-reds (F-PRO01-RUNNER-TREE-RED, 2026-09-09). `acquireRunContentLease`
acquired with `SELECT pg_advisory_lock(hashtextextended($1,0))` when the unit stubs around it
were written (970870f3). Commit 7b3a3063 changed it to
`SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired` plus an unlock-and-retry
loop. `"pg_try_advisory_lock"` does NOT contain `"pg_advisory_lock"`, so every stub matching on
the old substring stopped answering the lease's first query. Three unit rows broke at once and
each broke DIFFERENTLY:
- `tests/unit/pro01-runner-tree.test.ts` and `tests/unit/xrev01-node-review.test.ts` fell
  through to their `throw new Error("UNEXPECTED_CLIENT_QUERY:" + sql)` — loud, correct, and
  still unfixed 12 days later because a loud red in a known-red set is invisible.
- `tests/unit/load01-run-projection.test.ts` returned `{ rows: [] }` from a branch that no
  longer matched, which the try-lock reads as CONTENTION (`rows[0]?.acquired !== true`), so the
  lease unlocked, slept 10 ms and retried FOREVER: 120005 ms, a timeout with no error text
  naming the cause (`logs/dev-merge/16-full-suite-dev-169941c6.log:2639`).
`tests/unit/evaluator-addon.test.ts` survived only because it happened to answer BOTH forms.
**Rules: (1) when you change a query's text, `grep -rn 'includes("<the old text>")' tests/` in
the same commit — the compiler cannot see a string match. (2) A stub branch that returns a shape
the caller reads as "retry" turns a fixture defect into a hang, not a failure; prefer answering
the real query and letting everything else throw loudly. (3) A red row inside an accepted
known-red set stops being read — the set is a place defects go to be forgotten.**

## 2026-09-02 — orchestrator (war-plan session, Fable 5.1)
- **macOS has no `timeout(1)`.** `timeout 40 cmd` fails with `command not found`. Use the Bash tool's `timeout` parameter, `gtimeout` (coreutils, not installed), or `perl -e 'alarm 40; exec @ARGV' -- cmd`.
- **zsh aborts the WHOLE command line on one failed glob** — `grep -rl x .hermes/planning/*/logs/*.sh docs/missions/*/logs/*.sh` printed `no matches found` and ran nothing, because `.hermes/planning/*/logs/` has no `.sh` files. Use `find … -name '*.sh' | xargs grep -l`, or `setopt nullglob` first.
- **`gh` is authenticated on this Mac (account VanillaMint02).** `gh pr view/list/checks` and `gh api repos/DebateAIRO/debateairo/...` work read-only; the security-hardening PR is #8. `git merge-tree --write-tree --name-only dev <ref>` gives a dry-run conflict list without touching the working tree.
- **`embedded-postgres` ships no `psql`** (`native/bin` = `initdb pg_ctl postgres`), and there is no `psql` on PATH: the only SQL shells are `docker exec debateai-v3-postgres-1 psql …` (LIVE dev DB — never point tests at 55432) or a `pg`-backed tsx one-shot.
- **`acceptance/standing-db.ts` adopts and MIGRATES any server answering on its port.** `acceptance/runtime-policy.test.ts` passes `ACCEPTANCE_DB_PORT=55432`. With compose up, that migrates the live dev database. Treat as a hazard until the Foundry fence (FIX-17) lands.

## 2026-09-02 — REV-WARPLAN (Grok 4.6)
- **`pnpm exec tsx /private/tmp/….mts` cannot resolve workspace packages.** Even with a `.mts` extension (the standing CJS/top-level-await trap), Node resolves `embedded-postgres` from the *script's* directory, not from the repo you `cd`'d into. Symptom: `ERR_MODULE_NOT_FOUND: Cannot find package 'embedded-postgres' imported from /private/tmp/rev-warplan/foundry-probe.mts`. Fix: in the scratch dir write `{"type":"module"}` as `package.json` and `ln -s <repo>/node_modules node_modules`. Do not `pnpm install` there (review packets forbid it). Then `pnpm exec tsx /private/tmp/…/file.mts` from the repo works.
- **`gh pr view --json commits` truncates at 100.** PR #8 is 130 commits ahead of `dev` by `git rev-list --count origin/dev..origin/security/2026-09-01-hardening`; the JSON `commits` array length is 100. Use `git rev-list`, not the GraphQL commits field, for ahead-counts over 100.
- **macOS `cat` has no `-A`.** `git rev-list --left-right --count` prints `0\t0`; `cat -A` errors. Use `python3 -c 'import subprocess; print(repr(subprocess.check_output(cmd.split())))'`.
- **`grok -p` keeps running AFTER its handoff.** Twice on 2026-09-02 the REV-WARPLAN seat posted `READY FOR HERMES REVIEW`, wrote its verdict + self-report, and then stayed alive at ~0% CPU for 10+ minutes running an internal "verify the objective is met" self-audit — which also noticed the plan file changing under it. Its outputs were final at the handoff comment (freeze law). Treat the READY comment as the exit: verify the verdict file size is stable, then `kill -TERM <pid>` (by PID, never by name) and append your own `[exit]` sentinel to the log so watchdogs close. Resume for the next round works fine afterwards: `~/.grok/bin/grok -r <session-uuid> -p "<round prompt>" -m grok-4.6 --permission-mode bypassPermissions`.
- **Line counts: quote `wc -l`, not a script's newline count + 1.** A file ending in a newline has `wc -l` = N and `text.count("\n")+1` = N+1; a reviewer will catch the mismatch (REV-WARPLAN N14).
- **After a rework, grep the WHOLE artifact for every sentence that carried the old rule.** Editing the cited location and leaving a duplicate sentence elsewhere (§9 child worktrees, risk 7 hash) cost a full review round (REV-WARPLAN N10/N11). The reviewer predicted the class in its round-1 predictions paragraph.

## 2026-09-02 — REQ-REV-FIX (Grok 4.6)
- **`git show <sha>:<path>` fails with a nested-prefix hint when that commit stored the tree under `dialectical-engine/`.** Symptom: `fatal: path 'dialectical-engine/packages/obs-capture/package.json' exists, but not 'packages/obs-capture/package.json'`. Fix: `git show '<sha>:./packages/obs-capture/package.json'` (the `./` form). Do not `git checkout` the sha — review packets forbid git writes. Cost: one false "file missing at cited tree" before the hint was followed.

## 2026-09-02 — REQ-OBS-FINISH (Codex Sol Max)
- **A sandbox-blocked Hermes `show` can still be read without widening permissions when the packet forbids expansion.** The CLI initializes `kanban.db.init.lock` even for `show`, so it failed before returning comments. A read-only fallback worked without a lock or sidecar: `sqlite3 -readonly 'file:/Users/vladmihaimiron/.hermes/kanban/boards/<board>/kanban.db?immutable=1' ...`. Query `task_comments` ordered by `created_at,id`, and treat it strictly as a snapshot: it cannot post the required handoff. Cost here: two failed CLI reads and one schema probe; recovered both comment cursors in under one minute.

## 2026-09-02 — REQ-REV-OBS (Grok 4.6)
- **`hermes kanban list --json` is a top-level array, not `{tasks:[…]}`.** `show --json` is an object (`task`, `comments`, …). A SPEC that pipes `list --json` to `jq '.tasks[]'` fails on the real CLI (`Cannot index array with string "tasks"`). Probe the verb you cite; do not copy the `show` shape onto `list`. Cost: one stranger-test finding (OBS-07 step 4) that a nod at the author's command would have missed.
- **Plan.md table citations: the header line is not the first data row.** `Plan.md:238` is `| Stays on host | Why it may not move into compose |`; Hermes Kanban 9119 is `:240`. Postgres in the ruled-service table is `:203`, not `:199` (preamble). Cite the data row. Cost: two off-by-header pins in Q1.

## 2026-09-06 — REQ-01 (Claude Opus 5, mission `consent-ui`)
- **zsh globs `--include=*.ts` before grep sees it.** `grep -rn "pat" --include=*.ts dir` dies with `(eval):1: no matches found: --include=*.ts` — the shell is zsh, and the unquoted `*.ts` is expanded against the *current* directory, not passed through. Fix: quote it, `--include="*.ts"`, or drop the flag and pipe: `grep -rn pat dir | grep -v node_modules`. Cost: one wasted call plus a retry, three times before it stuck.
- **`tests/architecture/auth-front-door-parity.test.ts` is RED at `dev` @ `2b670d30` and it is NOT your diff.** Measured: `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts` → exit 1, `Tests  2 failed (2)`, both `ENOENT` on `web/package.json` and `web/components/LoginFlow.tsx`. `web/` holds exactly one tracked file (`git ls-files web/` → `web/next.config.mjs`); the suite's `read` helper at `:11` has no error handling, so it throws before any assertion runs. Consequence worth knowing: **its `terms` ban at `:86` is therefore unenforceable right now** — the live guard on the same copy is `apps/ui/components/authRoutes.source-test.mjs:48`, reached via `tests/unit/v2ui-node-runner.test.ts` (measured GREEN, exit 0, `Tests  2 passed (2)`).
- **Adding ANY custom property to `globals.css` forces a same-change edit to `tests/unit/t9-mode-tokens.test.ts`.** `:380-383` asserts EXACT set equality between the tokens declared in `:root` / `html[data-mode="chamber"]` and `Object.keys(TERRACOTTA) ∪ Object.keys(MODE_INDEPENDENT)` / `Object.keys(CHAMBER)`. A new token without its map entry fails the suite; a map entry without the declaration fails it too. `TERRACOTTA` and `CHAMBER` are compared **raw** (`:380,383`) so values must be byte-identical and comma-tight; only `MODE_INDEPENDENT` is normalised (`canonicalCssValue`, `:329-335`). Corollary for parallel lanes: **exactly one slice may own token additions**, or every lane conflicts on the same two files.
- **`.appShell` has a direct-child guard.** `tests/render/t3-library.test.tsx:236` asserts `layoutSource` matches `/<div className="appShell">\s*<TopBar \/>/`, because `globals.css:307` (`.appShell:has([data-landing-section]) > .topBar`) depends on the shape. Anything mounted app-wide goes AFTER `{children}`, never between `.appShell` and `<TopBar />`.
- **A bare `form.dispatchEvent(new Event("submit"))` bypasses HTML constraint validation in jsdom.** `tests/render/auth-flow-integration.test.tsx:41-48` submits this way, so adding `required` to an input gates nothing in that suite. If a gate must be tested, it has to live in the submit handler, not in the attribute.
- **`vitest.config.ts:19` sets `fileParallelism: false` and there is no shared setup file** (no `setupFiles`, no `globalSetup`). A `localStorage` key leaked by one test file survives into later files in the same worker. Any test touching a `debateai.*` key clears it in both `beforeEach` and `afterEach` — precedent at `tests/render/t1-canvas.test.tsx:105-133`.

## 2026-09-06 — REQ-REV-01 (Claude Opus 5, mission `consent-ui`, blind review)
- **CORRECTION to the REQ-01 trap above: the set-equality assertion in `tests/unit/t9-mode-tokens.test.ts` is at `:376-377`, NOT `:380-383`.** Measured: `:376` `expect(rootNames.sort(), ":root inventory names").toEqual(expectedRoot);` and `:377` the Chamber twin, with their inputs built at `:371-372`. Lines `:379-384` are the *raw value* loops — so the same trap's other claim, "`TERRACOTTA` and `CHAMBER` are compared raw (`:380,383`)", **is correct and must not be "fixed"**. The substance (any token addition forces a same-change test edit; exactly one slice may own token additions) is unaffected. Cost of the conflation: it propagated to 7 places across two SPECs, a DECISIONS file, a handoff, this traps file and `COMMON.md` §10.8 before a lens caught it — **a wrong line range replicates as fast as a right one, so verify a citation the first time it is written, not the seventh.**
- **`globalThis.navigator = dom.window.navigator` throws on Node 22.** `TypeError: Cannot set property navigator of #<Object> which has only a getter` — Node 22 defines `navigator` as an accessor-only global. Standing up jsdom by hand outside vitest (worth doing when you need to prove a React/DOM semantic and cannot write a test file into the repo) needs `Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true })` for every global. Cost: one round-trip. Recipe that works: `import { JSDOM } from '<repo>/node_modules/jsdom/lib/api.js'`, defineProperty the globals, set `globalThis.IS_REACT_ACT_ENVIRONMENT = true`, then `import('<repo>/apps/ui/node_modules/react/index.js')` and `react-dom/client.js` and build the tree with `React.createElement` (no JSX, so no transpiler needed).
- **`field(name).checked = true` — the house idiom in `tests/render/auth-flow-integration.test.tsx:35-39` — silently stops working the moment an input becomes React-CONTROLLED.** Assigning the DOM property fires no React `change`, so state stays stale: measured over three runs, a controlled checkbox reaches the submit handler as `false` and `register()` is never called, while an uncontrolled input + `onChange` mirror works. It also never enables a `disabled={!state}` button in EITHER shape. Any assertion about a *button's* enabled state must dispatch a real click/`change` inside `act()`. Before writing "make the checkbox controlled" into a spec, check every existing test that ticks it by property assignment.
- **`grep -c` returning 0 exits 1 and will kill a `&&` chain or a `set -e` script mid-probe.** Cost one truncated probe run whose later lines silently never executed. Use `grep -c … || true`, or `; ` between probe steps.

## Rework cannot return to a subagent's session when SendMessage is disabled (consent-ui, 2026-09-06)
The heartbeat law says rework returns to the SAME seat session. In this Claude Code session `SendMessage` is
disabled ("SendMessage is disabled for this session, in subagents as well as here"), so a finished Agent-tool
subagent cannot be resumed — the first rework attempt failed with `No such tool available: SendMessage`.
**Fix, and it is the fallback `superpowers:subagent-driven-development` already prescribes:** dispatch a FRESH
seat on the same role carrying (1) the original packet, (2) the predecessor's handoff and self-report as its
memory, (3) the verdict, (4) the rework ticket — and say in the packet that it continues the existing
self-report. Design every packet so disk is the memory (COMMON §4b write-as-you-go); a seat whose state lives
only in its context cannot be reworked here at all. Probe `SendMessage` availability at intake, not at the
first rework.

## 2026-09-06 — REQ-01, rework round 1 (Claude Opus 5, mission `consent-ui`)
- **CORRECTION to my own trap at `:1064`, re-measured and confirmed** (the file is append-only, so the wrong line stays where it is and this entry supersedes it): the set-equality assertion in `tests/unit/t9-mode-tokens.test.ts` is at **`:376-377`**, with its expected lists built at `:371-372`; `:379-384` is the separate raw VALUE loop. REQ-REV-01 already recorded this at `:1070` and I re-ran it rather than taking it on trust — `:376` is `expect(rootNames.sort(), ":root inventory names").toEqual(expectedRoot);`. **The same trap's other claim — "`TERRACOTTA` and `CHAMBER` are compared raw (`:380,383`)" — is CORRECT and must not be "fixed".** The substance of `:1064` (any token addition forces a same-change test edit; exactly one slice owns token additions) is unaffected.
- **Line-range citations are wrong in BOTH directions, at roughly one in six.** Across this mission's requirements round: the reviewer found six wrong ranges of mine, and I found one wrong range of the reviewer's (they cited `tests/unit/v2ui-node-runner.test.ts:21` for the manifest-equality assertion; measured in the main tree AND in lane `.worktrees/consent-s01`, same md5 `dae7cd12705f1d7c885030ceefdbd433`, 35-line file: `:16` is the `.map(...)`, `:19` IS `expect(activeTests).toEqual([...manifest].sort());`, `:21` is blank). Seven errors in ~40 load-bearing pointers, ~17%, from two careful seats. **The only defence that works is re-measuring the pointer at the moment you cite it** — `awk 'NR>=A && NR<=B{printf "%4d| %s\n", NR, $0}' FILE` and paste what it prints. A `sed -n 'A,Bp'` with a hand-counted offset is how both directions of this error happen.
- **`field(x).checked = true` fires NO React `change` event, so it can never move a `disabled` attribute computed from React state.** This repo's house idiom for the sign-up suite (`tests/render/auth-flow-integration.test.tsx:324,448,466`) assigns the DOM property directly. That works today only because `apps/ui/components/SignUpFlow.tsx:186` is an **uncontrolled** input and the handler reads `FormData` at `:63,:72` — the DOM is the truth on both ends. Two consequences, both measured by REQ-REV-01's standalone jsdom+React probe (three runs each, deterministic): (1) if you make such an input **controlled**, the three existing cases stop calling `register()` at all (suite 14/17) because React state never sees the assignment; (2) **any** assertion about a button whose `disabled` derives from React state must dispatch a real event inside `act` — `el.click()` or `el.dispatchEvent(new Event("change", { bubbles: true }))` — because the assignment idiom leaves the button untouched. A test that gets this wrong fails looking exactly like an implementation bug.
- **A per-slice SPEC has a structural blind spot: behaviour that only exists when two slices are on screen at once has no owner in either document.** Found here as an unspecified `Esc` precedence between a modal and the card underneath it — two parallel lanes would each have written a document-level keydown listener and both would fire on one keypress. **The device that fixes it, and it is cheap: one paragraph carried BYTE-IDENTICALLY in both SPECs (verify with `md5`), stating the cross-surface rule, plus a hook on each side.** It is the only text neither slice can change alone. Verify it mechanically at every handoff, not once at authoring.
- **When a review hands you one finding, the class it belongs to usually has members the reviewer did not see.** Measured here: the reviewer named ONE requirement that used "which entry point did the user come from" as a proxy for "is a decision stored". Sweeping the class found **two more** in the same file. `heartbeat-protocol` §2.2 says this; the concrete technique that found them is to name the PROXY (not the symptom) and grep for every sentence that branches on it.

## 2026-09-06 — REQ-REV-01, round 2 (Claude Opus 5, mission `consent-ui`, scoped re-review)

- **jsdom + React: `el.dispatchEvent(new Event("change", { bubbles: true }))` does NOTHING to a checkbox.** React routes `onChange` for `type="checkbox"` and `type="radio"` through the **click** event, not `change`. Measured React 19.2.8 / jsdom 30.0.1, three runs, four idioms: `.click()` → onChange fires ✓ · `new MouseEvent("click", {bubbles:true})` → fires ✓ · `new Event("change", {bubbles:true})` → **nothing** · `new Event("click", {bubbles:true})` → **nothing** (React wants a real `MouseEvent`). If a test asserts on state driven by a checkbox's `onChange`, only the two click forms work. This is the trap that produced two blocking findings in `consent-ui` after the SPEC offered the `change` form as an equal alternative.
- **`.click()` TOGGLES — so `el.checked = true; el.click();` leaves it FALSE.** The pattern "assign the DOM property, then dispatch a real event to announce it" is wrong for checkboxes: the click flips the value you just assigned. To go from an assigned-but-unannounced state to an announced `true`, reset to `false` first and then `click()`, or start from a fresh mount. Measured the same way; all four idioms fail the assign-then-dispatch sequence.
- **`field(x).checked = true` is still CORRECT for anything that reads `FormData` at submit** — the existing `tests/render/auth-flow-integration.test.tsx` idiom (`:324`, `:448`, `:466` with the submit helper at `:41-48`) works because a bare `form.dispatchEvent(new Event("submit"))` reads the DOM, which the assignment set. The rule is: **assignment for handler/`FormData` claims, `.click()` for anything about a control's rendered state.**
- **A finding proved by a probe is discharged only by re-running that probe against the fix.** Measured cost in this mission: a rework packet quoted the reviewer's *conclusion* ("pin the implementation that survives the probe") without naming the probe file to run. The author pinned the implementation correctly and, in the same sentence, prescribed a test idiom it never executed — reproducing the original defect and costing a further rework round. Put the probe path in the rework packet and print its output in the handoff.
- **A single-heuristic cross-reference sweep must never be reported as an exhaustive class sweep.** Round 1 swept `Rnn` references with a topic-classification heuristic and declared the class closed at two members. Round 2 swept the same corpus with a different heuristic (zero lexical overlap between the referencing line and the target requirement's own heading) and found a third, pre-existing, that both the round-1 sweep and the author's rework sweep had missed. Two heuristics, one unique find each.
- **Seats share one scratchpad namespace.** Another seat's working script sat at `<scratchpad>/xref_sweep.py` while the blind lens worked in `<scratchpad>/req-rev-01-r2/`. Blindness enforced only by good manners is not blindness — use `<scratchpad>/<seat>-<round>/` and put nothing at the root.

## A multi-path `vitest run` SILENTLY DROPS paths that do not exist — no `No test files found` (2026-09-06, ARCH-S01, mission `consent-ui`)
Single-path is loud, multi-path is silent, and that asymmetry is the trap:

    $ pnpm exec vitest run tests/render/consent-mount.test.tsx          # does not exist
      exit 1   "No test files found, exiting with code 1"   filter: tests/render/consent-mount.test.tsx

    $ pnpm exec vitest run tests/render/t3-library.test.tsx tests/render/consent-mount.test.tsx
      exit 1   "Test Files  1 failed (1)"   "Tests  4 failed | 11 passed (15)"
      # the missing path is not mentioned ANYWHERE in the output.

So a cluster command that lists several paths **cannot announce a typo'd path, a renamed file, or a file
the seat forgot to write.** It reports on whatever subset happens to exist and the exit code reflects only
those. A seat that renames one test file mid-cluster gets a green multi-path command that no longer runs
the test it was written for.
**Remedy: any command listing more than one path must also assert the FILE COUNT**, e.g.
`printf '%s' "$files" | grep -qE '^[[:space:]]*Test Files[[:space:]]+6 passed \(6\)'`. An exit code and a
`Tests N passed` summary are both satisfied by a proper subset; only the file count is not.
This is variant 8 of the same family as variants 1-4 (`## The family, four variants deep` above): another
way for a command to look like verification and verify less than it names. Same generating condition —
**the command was never run against an input designed to make it lie.**

## A "must stay GREEN" file that is RED at base, and not in the mission's BASELINE (2026-09-06, ARCH-S01)
`docs/missions/consent-ui/BASELINE.md` pins four suites. It does **not** pin
`tests/render/t3-library.test.tsx`, while `slices/S01/SPEC.md` §Tests and `slices/S01/PLAN.md` §Boundaries
both order it "must stay GREEN". Measured in a clean lane at `dev` @ `2b670d30`:

    $ pnpm exec vitest run tests/render/t3-library.test.tsx
      exit 1   Tests  4 failed | 11 passed (15)     # all four inside its `lists` describe
    $ pnpm exec vitest run tests/render/t9-landing.test.tsx
      exit 0   Tests  16 passed (16)

**The two tests the slice actually depends on are GREEN at base** (`chrome > keeps the real layout TopBar as
a direct appShell child`, `chrome > pins the real signed-in render to zero landing markers`). So the SPEC's
instruction is true of the TESTS and false of the FILE — and a seat that translated "must stay green" into
`Tests N passed` with no `failed` would have written a guard that can never pass, then gone hunting another
mission's four failures. That is the same shape as the `t9-mode-tokens` trap the mission already knew about,
in a file nobody thought to measure because no requirement told anyone to EDIT it.
**Class rule, not an instance fix: a baseline must be measured for every file a plan CONSTRAINS, not only
for every file it CHANGES.** "Must stay green" is a claim about a measurement, and an unmeasured claim in a
baseline document is the most expensive kind, because every downstream seat inherits it as fact.

## `tests/support/contrast.ts` cannot measure any `rgba()` token — it throws (2026-09-06, ARCH-S01)
`relativeLuminance` at `tests/support/contrast.ts:3-5` rejects anything that is not `#RRGGBB`:

    contrastRatio("rgba(110,103,92,.1)", "#FDFBF6")
      -> TypeError: Expected an #RRGGBB colour, received rgba(110,103,92,.1)

Three review rounds carried "contrast unmeasured" as an open item without anyone finding out **why** it kept
not getting measured: the instruction ("check it with the repo's contrast helper") was not executable as
written. A translucent tint must be **alpha-composited over its opaque surface first** —
`c = round(alpha*fg + (1-alpha)*bg)` per channel — and only the composite passed in.
**The general lesson is about verdicts, not about colour:** an item that stays in `## Not verified` across
three rounds is evidence that the instruction is impossible, not that everyone was busy. The cheapest move
on the third sighting is to spend two minutes trying to RUN it.

## 2026-09-06 — ARCH-S02 (Claude Opus 5, mission `consent-ui`, architecture)

### VARIANT 7 of the acceptance-command family: a filter that matched NOTHING is silently dropped, and the command still exits 0
`pnpm exec vitest run <file-that-exists> <file-that-does-not>` runs **only the existing file**,
prints ` Test Files  1 passed (1)` / `      Tests  17 passed (17)`, and **exits 0**. No warning,
no mention of the unmatched filter. Measured on vitest 4.1.10 in `.worktrees/consent-s02` at
`2b670d30`. Contrast with the case already in this file: when *every* filter misses you get
`No test files found, exiting with code 1` — loud. **A partial miss is silent.**
**Consequence for a PLAN:** a cluster whose ONE command names three test files, one of which
the seat never created, reports GREEN having never executed it. Variants 1 and 6 are "the
command cannot see its target" and "the command sees the wrong place"; **this is "the command
sees only PART of its target and says nothing"** — and it is the shape a multi-file cluster
command takes by default.
**Remedy, and it is one line:** add a third arm asserting the FILE COUNT, anchored:
```sh
out=$(pnpm exec vitest run F1 F2 F3 2>&1); vt=$?
sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
fil=$(printf '%s' "$out" | grep -E '^[[:space:]]*Test Files[[:space:]]+' | tail -1)
printf '%s' "$sum" | grep -qE '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]* passed' \
  && ! printf '%s' "$sum" | grep -q 'failed' \
  && printf '%s' "$fil" | grep -qE '^[[:space:]]*Test Files[[:space:]]+3 passed \(3\)'; guard=$?
[ "$vt" -eq 0 ] && [ "$guard" -eq 0 ]
```
`grep -E '^[[:space:]]*Tests[[:space:]]+'` does NOT match the ` Test Files ` line — `Tests`
requires the `s` immediately after `Test` — so the two arms read different lines, which is what
makes them independent.
**Validated on known-GOOD input as well as known-bad** (the standing rule three seats have now
re-earned): 1 real file/expect 1 → VERDICT 0 · 2 real/expect 2 → VERDICT 0 · 1 real + 1
missing/expect 2 → VERDICT 1 (caught) · a RED suite/expect 1 → VERDICT 1.

### jsdom 30.0.1 in this repo has NO `window.matchMedia` and NO `Element.prototype.scrollIntoView`
Measured directly (`typeof` on a fresh `JSDOM` window from the lane's own `node_modules`):
`window.matchMedia` → `undefined`, `el.scrollIntoView` → `undefined`. Neither is a
"limited implementation"; the property does not exist.
**Both throw a `TypeError` that names the DOM API, so the failure reads as an environment bug
rather than as the seat's design.** Any component implementing `prefers-reduced-motion` or
`scrollIntoView`-based in-page navigation must guard —
`typeof window.matchMedia === "function" ? … : false` and `target?.scrollIntoView?.(…)` — and
the test supplies a stub when it wants to assert the true branch. Stubbing `scrollIntoView` per
element also turns "we cannot test scrolling in jsdom" into a real assertion about **which
target the handler resolved and with what arguments**, which is strictly more than a mapping
check and still claims nothing about scrolling.

### `Object.defineProperty` DOES drive jsdom's scroll metrics, and `configurable: true` is load-bearing
`Object.defineProperty(el, "scrollTop"|"clientHeight"|"scrollHeight", { value, configurable: true, writable: true })`
shadows jsdom's prototype getters (all of which return `0`) and, with `configurable: true`, can
be **redefined between assertions** — which is the only way to test a "scroll to the end, then
scroll back up" latch. Without `configurable`, the second definition throws and the latch case
cannot be written at all. Measured: `291+200 >= 500-8` → `false`, `292+200 >= 500-8` → `true`.

### `tests/support/contrast.ts` takes `#RRGGBB` only — composite in the test, not in the helper
`relativeLuminance` throws `TypeError` on anything that is not `#RRGGBB`, so a contrast claim
about an element rendered at `opacity: α` must flatten it first: `α·fg + (1-α)·bg` per channel,
against the ground the element actually sits on. Doing this made the one contrast ratio three
review rounds had left UNVERIFIED into a one-line assertion — and showed that the obvious
`opacity: .6` fails 4.5:1 in Terracotta (4.13) while `.65` clears it (4.79). **An untested
"reduced opacity" is a coin flip; the composite takes two minutes to compute.**

### The harness's session cwd is not necessarily the packet's cwd
This seat's packet named the main tree as cwd; the harness reported the session cwd as a
*different lane* (`.worktrees/consent-s01/...`) when a background command was launched. Nothing
was written to the wrong place because every command in this session carried an absolute
`cd <path> &&` prefix — which is the rule this repo already has for agent threads, and this is
the concrete reason for it. **Never launch a background command that depends on an inherited
cwd; print `pwd` if you are about to.**

## 2026-09-06 — ARCH-REV-S02 (Claude Opus 5, mission `consent-ui`, review)

### `preventDefault()` on a checkbox reverts the DOM property but NOT React's `onChange`

A row-level `onClick` that calls `event.preventDefault()` to stop a checkbox ticking **does not
stop React's `onChange` from firing with `checked === true`**. Measured, React 19.2.8 / jsdom
30.0.1, three identical runs:

```
click the UNCHECKED input, row handler calls preventDefault():
  DOM .checked after the click : false      <- what every "the box stays unchecked" test asserts
  React state set by onChange  : true       <- what nothing asserts
```

**Mechanism.** The pre-click activation steps set `.checked = true` *before* the click event
dispatches. React routes a checkbox's `onChange` through that click event, so it fires during
dispatch, while `.checked` is still `true`. jsdom's canceled-activation steps revert `.checked`
*after* dispatch completes. React's state keeps the pre-revert value.

**Why this is expensive.** Any UI that (a) mirrors a checkbox into React state and (b) cancels
the click to do something else instead now has two sources of truth that disagree, and the
usual test — "assert the DOM box is still unchecked" — passes. The button, badge or gate
computed from the mirror is the thing that is wrong, and no test looks at it.

**The assertion that catches it:** after any click you cancel, assert **both** the DOM property
**and** whatever the mirror drives (a `disabled` attribute, a count, a class). Asserting the DOM
alone is asserting the half that behaved.

**Fix shapes:** set the mirror back explicitly in the cancelling branch, or stop mirroring and
recompute from `input.checked` after the handler runs. Either way, pin it.

### A probe answers the question for the world it MODELS, and probes do not say what that is

`.hermes/reports/consent-ui/probes/v3-r17-cases-probe.mjs` is this mission's checkbox oracle.
Three seats re-ran it, got "all six cases PASS", and read that as "the planned component is
correct". Its `makeApp` has **no click handler on the privacy row** — so it settles the
component at cluster C4 and says nothing about the component at C7, which is where the defect
was. The probe was not wrong; the inference from it was.

**Rule:** every probe copied into a mission's probe directory carries a header line
`MODELS: … · DOES NOT MODEL: …`. Without it a probe is reused as an alibi for questions it
never asked, and a re-run prints PASS while the thing you care about is untested.

### `.` matches ONE BYTE in a script, so a guard term standing in for vitest's `✓`/`×` is 0 forever there

Measured 2026-09-06 (mission `consent-ui`, ARCH-REV-S01 **B1**, reproduced and fixed by ARCH-S01-REWORK-R1),
same input file, same machine, two shells:

```
                                                            as a .sh under /bin/bash     inline in the tool shell
grep -cE '^[[:space:]]*. tests/unit/t9-mode-tokens…'                    0                          1
grep -cE 'tests/unit/t9-mode-tokens\.test\.ts > … name( [0-9]+ms)?$'    1                          1
$ grep --version   (script)   grep (BSD grep, GNU compatible) 2.6.0-FreeBSD    LC_ALL/LANG unset -> C locale
$ grep --version   (inline)   ugrep 7.8.4      <- a shell FUNCTION from ~/.claude/shell-snapshots/snapshot-zsh-*.sh
$ sed -n '4p' t9.out | head -c 8 | xxd     20e2 9c93 2074 6573      # " ✓ tes"  — U+2713 is THREE bytes
```

**Why it is invisible.** The command runs perfectly and the summary line is right; only the guard is
unsatisfiable. A BROKEN-signature check (`startup error|unexpected argument|…`) tests whether the COMMAND
ran, never whether the GUARD can pass, so an author who runs each command once, in the tool shell, sees
nothing. The cluster is then permanently red in a `.sh` file, a `Makefile`, CI, another machine, or a
three-run loop, and the coding seat goes hunting a defect in its own correct code.

**Two rules, and the second one is the half people get wrong:**
1. **Never match a status glyph.** Anchor on the test NAME (`<file> > <suite> > <name>` with an optional
   ` NNNms` tail) or on ASCII-only lines (`FAIL`, `Tests`, `Test Files`).
2. **A LITERAL multibyte character in a pattern is SAFE; a `.` standing in for one is not.** Byte-oriented
   matching compares the pattern's own bytes, so `grep -cE '^· serves:'` is correct in both shells (46/46
   measured on a `·` = U+00B7 bullet) while `grep -cE '^. serves:'` gives 0 as a script and 46 inline. The
   defect is the WILDCARD, not the character — and a remedy transcribed with a wildcard reintroduces the bug
   it was written to fix. That happened: the review verdict's own prescribed replacement for a broken count
   carried this exact defect.

**The check that finds it in seconds**, over every fenced command block in a plan:
`LC_ALL=C grep -n '[^ -~<TAB>]' <blocks>` (raw non-ASCII bytes) and `grep -nE "\[\[:space:\]\]\*\. " <blocks>`
(the glyph-placeholder idiom). Both must exit 1.

### `tc=$(pnpm typecheck 2>&1)` with no exit-code capture passes VACUOUSLY when the script does not run

Measured 2026-09-06 in the same mission (ARCH-REV-S01 **N1**):

```
$ tcbad=$(pnpm typechek 2>&1); echo $?          -> 1
$ printf '%s\n' "$tcbad"
undefined
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command "typechek" not found
$ printf '%s\n' "$tcbad" | grep -E 'error TS[0-9]+' | grep -vc '<the pinned file>'   -> 0   # term SATISFIED
```

A guard whose only typecheck arm is "zero diagnostics outside the pin" cannot tell a clean run from a run
that never happened. **Capture `tt=$?` AND assert the run's own fingerprint:** pnpm echoes `$ tsc --noEmit`
on every real run, so `n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')` must be 1. Do **not**
assert the pinned diagnostic TOTAL instead — that is another mission's number and the guard dies the day
they repair it (the monotone-delta rule: assert what must not appear, never what must remain broken).

## React fires a parent's `onClick` BEFORE the checkbox's own `onChange` — and `preventDefault` is already visible there (ARCH-S02-REWORK-R1, 2026-09-06)
Measured, React 19.2.8 + jsdom 30.0.1, `apps/ui/node_modules`, deterministic across runs. For a
click on an `<input type="checkbox">` inside a parent with an `onClick`:
```
onClick(mirror=false,domChecked=true)  ->  onChange(checked=true,defaultPrevented=true)
```
Three facts, each of which has cost or nearly cost a round in this repo:
1. **The parent's `onClick` runs FIRST.** So any state a parent handler writes about the box is
   **overwritten** by the `onChange` that follows. "Set the mirror to false next to
   `preventDefault()`" does not work, and the failure is silent.
2. **`onChange` still fires even when the click was cancelled**, with
   `currentTarget.checked === true` — jsdom sets `.checked` in the pre-click activation steps and
   reverts it in the canceled-activation steps, i.e. **after** the whole dispatch. A mirror
   written from `currentTarget.checked` therefore records a state the DOM never reaches.
3. **`event.nativeEvent.defaultPrevented` IS already `true` inside that `onChange`** — because of
   fact 1. That is the cheap, synchronous fix: mirror
   `checked && !nativeEvent.defaultPrevented`, the SETTLED value.
**Two things that look like fixes and are not, both measured:** a `useEffect` resync reads
`checked === true`, because React flushes a discrete update *inside* the dispatch, before the
revert; a `queueMicrotask` resync reaches the right end state but renders **one frame with the
button enabled**. Probes:
`.hermes/reports/consent-ui/probes/arch-s02-rework-r1-c7-mirror-fixed.mjs`.

## jsdom does not implement Space-activates-checkbox (ARCH-S02-REWORK-R1, 2026-09-06)
jsdom 30.0.1, focused `<input type="checkbox">`, `keydown` + `keypress` + `keyup` with
`key: " "`, `code: "Space"`, `keyCode: 32`, `which: 32`, all bubbling and cancelable:
```
after keydown+keypress+keyup ' ': checked=false clickEventsSeen=0
after a real .click()           : checked=true  clickEventsSeen=1
```
**A test written as "dispatch Space and assert the box toggles" is RED forever against a correct
implementation.** There is no stub worth writing — stubbing the activation behaviour IS
`.click()`. Assert the two halves jsdom can see (the element is focusable; activation from the
focused state does the right thing) and hand the keystroke to human acceptance. Same defect class
as the `Event("change")` idiom already recorded here: an idiom prescribed without being executed.

## A markdown-parsing probe is a formatting contract — conform the document, do not loosen the probe (ARCH-S02-REWORK-R1, 2026-09-06)
`arch-rev-s02-trace.py` resolves a step's title with `^- \*\*(S02-S\d{2}) · (.*?)\*\*`, which
requires the title to close on the SAME line. Two newly-added steps wrapped their titles and were
reported `<UNDEFINED>` although both were correctly defined and correctly counted everywhere
else — a FALSE finding that costs the next reader real time. The fix is to conform the document
(one-line titles) and to STATE the convention in the file the probe reads, not to relax the
regex: a convention a tool enforces survives; one a human remembers does not.

## 2026-09-06 — ARCH-REV-S02 round 2 (Claude Opus 5, mission `consent-ui`, review)

### A REVIEWER re-typing someone's `·` as a regex `.` gets `0` and thinks the count is fabricated
The author's N8 commands are `grep -c '^- 2026-09-06 · .*· ARCH-S02$'`. Re-typing them with `.`
in place of `·` — which reads as harmless "any character" — returns **0** from a `.sh` under
`/bin/bash` with `LC_ALL=C`, because `·` (U+00B7) is **two bytes** and `.` matches one. The
author's own pattern is correct: the middot there is a **literal byte sequence**, not a
metacharacter. Measured side by side on the same file: author's form `28 / 4 / 14`; my
`.`-substituted form `0 / 0 / 0`; an ASCII-only equivalent `28 / 4 / 14`.
**The rule COMMON §10.16/§10.21 states for AUTHORS binds REVIEWERS re-running their commands:
paste the command, never retype it.** A reviewer who retypes it is one substitution away from
filing a fabrication finding against a correct count — the most expensive false positive
available in this harness.

### `pnpm typecheck` in a slice lane writes NOTHING, so a read-only reviewer can run gate G1
`packages/contract/generated/` is gitignored (`dialectical-engine/.gitignore:7`) **and already
present** in `.worktrees/consent-s02/dialectical-engine`, so `pnpm typecheck` needs no
`generate:contract` and leaves `git status --porcelain` at `0`. Measured: exit 1, 8 diagnostics,
all in the pinned `tests/unit/s14-ui.test.ts`, porcelain `0` after. Reviewers have been skipping
G1 as a "write"; it is not one when `generated/` exists. Check `ls packages/contract/generated/`
first — on a FRESH worktree it is absent and `generate:contract` does write.

### A cluster chain arm moves a defect earlier; it does not prevent one — and it can DEADLOCK a seat
Adding cluster A's test file to cluster B's verification command (the "chain rule") is correct
and it is how a regression stops being invisible until integration. But it silently promotes
**every expected value A pinned** into B's acceptance, and an expected value written against the
component as A leaves it need not survive B's change. Measured in this mission: C4 pinned
"clicking both boxes enables the submit button"; C7 makes the same click open a modal instead;
C7's command now runs C4's file; and C7's boundary row forbids C7 from editing it. The seat is
deadlocked by construction and can only file a finding and stop.
**When you add a chain arm, state per assertion in the added file whether its expected value
survives — per case, not per cluster.** A cluster-level "runs the earlier file" is a promise
about cases, and cases are what break.

### A step's cluster label and the trace probe's cluster grouping are two different facts
`.hermes/reports/consent-ui/probes/arch-rev-s02-trace.py` prints `steps per cluster (by document
position)`: it groups a step by the `### Cluster S02-Cn` heading the step sits UNDER, not by the
`Cluster **Cn**` sentence in the step's own body. Both are load-bearing — the body is what a
coding seat reads, the heading is what the count arm measures — and they can disagree silently.
**Measured 2026-09-06:** moving two steps between clusters by editing only their body sentences
would have left the probe printing the OLD counts while every human-readable statement said the
new ones, which is the "two formulations of one rule" defect the same plan names five times.
**Rule: move the step's TEXT into the target cluster's section.** The plan already had the
convention — steps appended in a rework (`S02-S70`/`S02-S71`/`S02-S72`) live at the end of their
own cluster's section, not at the end of the file. A range like `S02-C7 13 S02-S49 .. S02-S29`
is not a numeric span; it is first-and-last by document position, and it is correct.

### A sweep claim counted as raw occurrences can never reach zero once you write the correction
Round 1 claimed a class of "bare pre-edit line numbers used as edit instructions" was fully
swept; one member was not. The obvious guard — `grep -c ':324\|:448\|:466' PLAN.md` → expect 0 —
is **unsatisfiable by construction**: the authoritative step legitimately retains the numbers as
a declared reading aid, and the correction paragraph must quote them in order to say they were
removed. Writing the fix makes the raw count go UP (measured 7 → 9 while the defect went to 0).
**Anchor the guard on the property, not on the string:** count the lines mentioning the numbers
that carry NO qualifier from a fixed, greppable vocabulary (`reading aid`, `pre-edit`,
`base position`, `measured at base`, plus `grep `/`printf ` for the lines that ARE the command),
target 0; report the raw count beside it, never assert it. Prove it discriminates by feeding it
the defective row's own text — it must return 1. **A qualifier vocabulary is line-based**: a
quote that wraps onto a second line leaves that second line unqualified, so keep the quoted
string and its qualifier on the same line. That cost three iterations here.

## Node 22 makes `globalThis.navigator` getter-only — a jsdom harness that ASSIGNS globals dies at import
*(ARCH-REV-S02, mission `consent-ui`, round 3, 2026-09-06 — measured, cost 2 iterations)*

The standard jsdom-into-Node harness every probe in this mission uses copies window globals
into `globalThis`. Writing it the obvious way:

```js
for (const k of [...,"navigator",...]) globalThis[k] = dom.window[k];   // throws on Node 22
```

fails on `node v22.23.1` with `TypeError: Cannot set property navigator of #<Object> which has
only a getter` — before a single line of the probe runs, so the failure looks like a broken
probe rather than a broken idiom. The working form, and the one every existing probe in
`.hermes/reports/consent-ui/probes/` already uses, is:

```js
Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
```

**Copy the global-installation block from an existing probe rather than retyping it** — the same
applies to the module root, which is `apps/ui/node_modules/`, NOT the repo-root `node_modules/`
(react resolves only under the app).

## A React checkbox row handler reads the IN-FLIGHT `.checked`, so "if the box is checked" inverts
*(ARCH-REV-S02, mission `consent-ui`, round 3, 2026-09-06 — measured, 3 runs, and it is the mechanism behind B1)*

When a row `onClick` wraps a checkbox, the DOM's pre-click activation has ALREADY flipped
`input.checked` by the time the handler runs. Measured trace on a component built from
`slices/S02/PLAN.md`'s own prose, jsdom 30.0.1 / React 19.2.8:

```
TRACE rowClick: domChecked=true mirror=false -> isChecked=false   (predicate = React mirror: correct)
TRACE rowClick: domChecked=true mirror=false -> isChecked=true    (predicate = input.checked: INVERTED)
      pinned            : after one bare click  box=false dialog=true
      predicate=DOM read: after one bare click  box=true  dialog=false
```

So a rule worded *"if the box is CHECKED, do not preventDefault … if it is UNCHECKED,
preventDefault and open the modal"* takes the WRONG branch when implemented as
`if (inputRef.current.checked)`: the modal never opens, the box ticks on a bare click, and two
clicks reach an enabled submit button with the policy never shown. **The predicate must name the
value it reads — the settled React mirror, never the DOM property** — in the same sentence as
the rule. Same in-flight-vs-settled distinction as the `onChange` mirror; a plan that pins one
and leaves the other to the reader has pinned half a rule.

## 2026-09-06 — CODE-S01-C1C2 (Claude Opus 5, mission `consent-ui`, coding seat, slice S01 clusters C1+C2)

### `git checkout HEAD -- <path>` is the WRONG mutant-restore while your own work is uncommitted
The standing entry at the top of this file warns that `git checkout <sha> -- path` **stages**
the change. The case that nearly bit me is the sibling it does not name: during the refutation
duty both files under mutation were **uncommitted work in progress**, so
`git checkout HEAD -- apps/ui/app/globals.css` would have silently destroyed the whole cluster
implementation and left a tree that looks clean and passes nothing it should.
**The safe restore for a mutant applied to uncommitted work is a filesystem copy plus a hash
check, never git:** `cp <file> $SP/<file>.pristine` before the first mutant, then after each one
`cp $SP/<file>.pristine <file>` and assert `md5 -q` equality on both sides before printing
`git status --porcelain`. The porcelain print is the protocol's requirement; the md5 is what
actually proves the restore, because porcelain says `M` both when the file is correctly restored
to a modified state and when it is wrongly restored to something else. **For a NEW file the trap
is worse:** an untracked file has no git version at all, so every git-based restore is a
deletion. Applies to every TDD-first cluster, which is all of them.

### Root `tsc --noEmit` in this repo does NOT cover `apps/ui/**` or `tests/**/*.tsx`
`tsconfig.json` at the root **includes** `tests/**/*.ts` (not `.tsx`) and **excludes** `apps/ui`.
It reaches an `apps/ui/lib/*.ts` file only when something in the included set imports it — 17 of
them are pulled in that way today, which is exactly why the gap is invisible. Measured:
`pnpm exec tsc --noEmit --listFiles | grep -c 'lib/consent.ts\|consent-storage.test.tsx'` → **0**
with both files present and green. So a cluster whose new module is imported only by a new
`.tsx` render test has **neither file typechecked by the cluster's own typecheck arm**, while the
arm still reports "zero diagnostics outside the pin" and looks like coverage.
**The compensating check exists and costs one command:** `apps/ui` has its own project
(`cd apps/ui && pnpm exec tsc --noEmit -p tsconfig.json`, `include: ["**/*.ts","**/*.tsx"]`),
measured exit 0 / 0 diagnostics both before and after this cluster, and `--listFiles | grep -c`
confirms `lib/consent.ts` is a member. `tests/render/*.tsx` is in **no** project and is checked by
nothing — vitest transpiles without type-checking. Same family as this file's standing lesson: a
gate that reports on the subset it can see, in the voice of the whole.

### A "each string appears once" containment assertion is unsatisfiable when the data shares a value
Writing S01-R28's containment hook as "every one of the twelve category strings occurs exactly
once in the module" fails against a **correct** implementation, because two of the three
categories carry the same `tag`, `OPTIONAL`. The guard has to count the expected occurrences from
the data itself — `strings.filter(c => c === value).length` — not assume 1. Caught before it was
run in anger, but it is the same shape as the sweep-count trap recorded at the end of this file:
**a count assertion has to derive its expected number from the artifact, never from the sentence
that describes the artifact.**

### Extract byte-exact copy from the SPEC with a codepoint dump, do not retype it
Three distinct non-ASCII characters live in this mission's category strings and two of them look
identical in a terminal: U+00B7 MIDDLE DOT (raw, ×4), U+2014 EM DASH (×3 in the data), U+2019
RIGHT SINGLE QUOTATION MARK (×1). A one-shot
`python3 -c "print([(i,ch,hex(ord(ch))) for i,ch in enumerate(s) if ord(ch)>127])"` over the SPEC's
own table lines settles all of them in one call, and a second dump over the finished module proves
what shipped (`literal backslash-u escapes: 0`). Cost of not doing it, per this mission's own
record: the escape-vs-decoded confusion has already been paid for twice here.

## 2026-09-06 — CODE-S02-C1C2 (Claude Opus 5, mission `consent-ui`, coding, slice S02 clusters C1+C2)

### A `\uXXXX` escape copied into a `.ts` module is a NO-OP, so the obvious "undecoded escape" MUTANT is green — and that green means nothing
*(measured in lane `.worktrees/consent-s02`, vitest 4.1.10; cost ~6 minutes and would have cost a
review round if I had believed the first result)*

The `S02-S16` property is *"the strings ship DECODED characters, never six-character escapes"*,
and its guard is `expect(value).not.toMatch(/\\u[0-9A-Fa-f]{4}/)` on every runtime string. To
refute it I mutated `apps/ui/lib/privacyPolicy.ts` so a body carried `children\u2019s` instead of
`children’s`. **All six tests stayed green** — because TypeScript DECODES `\u2019` in a string
literal, so the runtime string was byte-identical to the original. The mutant was a no-op, not a
weak guard.

**The mutant that actually models the defect writes a DOUBLE backslash into the `.ts` source**
(`children\\u2019s`), which is what a value round-tripped through a `.json` file or pasted into
raw JSX becomes. Under that one, the guard fires and names the offending string:

```
AssertionError: undecoded escape shipped in The service is for adults; ... children\u2019s data...:
expected 'The service is for adults; accounts r…' not to match /\\u[0-9A-Fa-f]{4}/
```

**The class, and it is bigger than escapes: a mutant applied to SOURCE text is only a mutant if it
changes the RUNTIME value.** Anything the compiler normalises — string escapes, numeric
separators, `as const`, whitespace, TypeScript-only type annotations — mutates the file and not the
program. Before concluding "my assertion is redundant", print the runtime value the mutated build
produces; if it equals the original, you mutated nothing.

### jsdom implements NO sequential focus navigation, so the CLASSIC end-only focus trap cannot satisfy "Tab reaches the newly enabled control"
A focus trap that only intervenes at the two ends (`preventDefault` + wrap on first/last) leaves
every other `Tab` to the browser. **jsdom moves focus for none of them**, so a step worded *"remove
`disabled` from the trailing button, Tab from the last enabled control, assert focus reaches the
newly enabled one"* is RED against that design and can only be satisfied by a trap that computes
and sets the next focusable **on every Tab** from a live `querySelectorAll`. Both designs are
lawful in a real browser; only one is pinnable here. Same family as the `Space`-activates-checkbox
and `matchMedia` findings: **a keyboard behaviour the browser supplies is a behaviour jsdom does
not have, and a plan that pins it must pin the HANDLER, not the browser.**

### An ADR whose acceptance arm is `grep -c 'Status: Proposed'` cannot use this repo's own ADR format
Every existing ADR under `docs/architecture/01-decisions/` puts status in a metadata table
(`| **Status** | **Proposed** …`). That contains no `Status: Proposed` substring, so the arm
returns **0** against a correctly-written ADR. Either the arm greps the table form, or the file
carries a literal `**Status: Proposed**` line — pick one when the step is WRITTEN, because the
seat discovers it only when the acceptance is run. (I hoisted a `Status: Proposed` line above the
table and removed the table row, so the count is exactly 1 and cannot double.)

### `git status --porcelain` in a `.worktrees/<lane>/dialectical-engine` lane prints GIT-ROOT-relative paths
The git root is one level above the project root, so the porcelain reads
`?? dialectical-engine/apps/ui/...`, never `?? apps/ui/...`. Harmless to read, fatal to grep: a
guard written `grep '^?? apps/ui'` is `0` forever — the same shape as the `✓`-glyph trap, one
directory level instead of one locale.

### A reviewer probe cannot live outside `tests/**` — `vitest.config.ts`'s `include` decides, not your `allowed` list
`consent-ui` review packets grant scratch under `<lane>/.review-scratch/`. A *runnable* probe put
there returns `No test files found, exiting with code 1` with `include: tests/**/*.test.ts,
tests/**/*.test.tsx, acceptance/**/*.test.ts` printed underneath — because the filter is applied
*after* the include glob, so a path outside it is silently no-matched rather than run. Costs one
full vitest boot plus a round-trip to notice. **A probe you must RUN goes to
`<lane>/tests/render/zz-<seat>-probe.test.tsx`, untracked, deleted before handoff (`git status
--porcelain` = 0 proves it); `.review-scratch/` is for files you only read.** Same family as the
"run from the level holding `package.json`" trap: the tool's own path law outranks the packet's.

### Never verify a NEGATIVE with a `git` pathspec in a `.worktrees/<lane>` tree
The git root is one level above the project root, so `git diff --name-only <range>` returns
`dialectical-engine/apps/api/...`, but a **pathspec is resolved relative to `cwd`**. Run from
inside `dialectical-engine/`, `git diff --stat <range> -- dialectical-engine/apps/api/` matches
nothing and prints **empty** — which reads exactly like "this no-touch surface was not touched".
A reviewer nearly shipped that as a verified negative. **For any "X was not touched" claim: take
the full list with NO pathspec (`git diff --name-only <range>`), then `grep` it.** A pathspec that
silently matches nothing is the same defect class as `COMMON.md` §10.13's multi-path vitest drop
and §10.16's glyph terms: *a filter that can be 0 for the wrong reason is not evidence.*

### `exclude` in a `tsconfig.json` does NOT prune the transitive import graph — only the `include` glob
Root `tsconfig.json` here has `"exclude": ["node_modules","web","apps/ui",...]`, and yet
`tsc --noEmit --listFiles` lists **17** `apps/ui/lib/*.ts` files: they are reached through
`tests/**/*.ts` importers, and `exclude` cannot remove a file the graph pulls in. The practical
consequence is a guard that looks healthy and is blind: a new module whose *only* importer is a
`.tsx` file (root `include` takes `tests/**/*.ts`, not `.tsx`) is in **no** project, so
`pnpm typecheck` reports "0 diagnostics outside the pin" with a live `TS2322` sitting in it —
measured: a cluster command returned `verdict=0` with `lib/consent.ts(202,3): error TS2322` present.
**A coverage claim about a typechecker is never readable off its config. `tsc --noEmit --listFiles
| grep -c '<your file>$'` is one command and the only honest answer.** Corollary measured at the
same time: `tests/render/*.tsx` is in **neither** project — render-test types are checked by nothing.

### jsdom 30.0.1: `focus()` lands on almost everything a browser would refuse — only `input[type=hidden]` is refused
Measured in this repo (seat `CODE-S02-C1C2-REWORK-R1`, 2026-09-06), one element per row, each
`focus()`ed and then compared against `document.activeElement`:

```
{"plain":true,"tabindex=-1":true,"input[type=hidden]":false,
 "[hidden] attribute":true,"display:none":true,"visibility:hidden":true}
```

So a focus-trap test in jsdom can discriminate **exactly one** unfocusable element type. Any
attempt to write a jsdom regression test for the `display:none` / `visibility:hidden` / `[hidden]`
members of a focusability bug is unsatisfiable — it belongs to a real browser. The inverse trap is
worse: a trap that `preventDefault()`s Tab and then calls `focus()` on an element the platform
refuses makes **Tab a dead key inside the dialog**, and jsdom *does* show that one (the hidden
input), so the one case you can write is the one worth writing. **Measure the environment before
designing the fixture; reasoning about jsdom's focusability rules costs more than the probe.**

### Two remedies for one defect class can hide each other — price each with the other removed
A filter (drop unfocusable candidates) and a fallback (advance past whatever `focus()` did not
land on) both fix the same symptom. With both shipped, deleting **either one alone** leaves the
suite green; only deleting **both** turns it red (measured: `17 passed` / `17 passed` /
`1 failed | 16 passed`). Reporting "the test pins the fix" is then false for each half. **Mutate
the remedies pairwise — each alone, then together — and report the overlap explicitly**, or a
later seat deletes the half the environment cannot see and the suite stays green.

### A promoted probe kit with a hard-coded worktree path is not re-runnable
`.hermes/reports/consent-ui/probes/code-rev-s02-c1c2-r1-cluster.sh` and `-surface-check.py` both
hard-code `.worktrees/rev-s02-c1c2/…`. COMMON §10.10 makes re-running a probe the discharge of a
finding, but re-running these requires editing them — the one thing the author must not do to a
reviewer's probe. **Probes take their root from `git rev-parse --show-toplevel` or `$1`, never
from a literal path.** Related: probes that import the product by a relative path
(`../apps/ui/...`) can only be executed from a directory one level under the package root, which
is inside the lane and inside nobody's `allowed` list — grant that path in the packet, or resolve
through the vitest alias instead.

## A BROKEN run inside a MUTANT harness reads as "the mutant was not caught" (2026-09-06, CODE-S02-C3C4, mission `consent-ui`)

The zsh word-splitting trap already recorded above ("zsh + vitest: an unquoted `$FILES` is ONE
filter token") has a second, worse consequence when the command sits inside a mutation-testing
harness rather than in an acceptance command. Measured this session:

```
F4="tests/render/a.test.tsx tests/render/b.test.tsx tests/render/c.test.tsx tests/unit/d.test.ts"
python3 mut.py <snap> "<id>" <target> '<old>' '<new>' $F4     # zsh: $F4 is ONE argv entry
  -> vitest: No test files found, exiting with code 1
  -> harness printed:  exit=1 ... CAUGHT BY: (nothing)
```

**`CAUGHT BY: (nothing)` is the harness's way of saying "this mutant survives", which is the
exact conclusion `heartbeat-worker` §2 step 4 is looking for.** A BROKEN run therefore
manufactures a *false negative that looks like a finding*: the seat concludes its test suite has
a blind spot it does not have, or — worse, in the other direction — concludes a real blind spot
is fine because a genuinely-surviving mutant was never distinguished from a run that never
happened. Re-run literally, the same two mutants gave `exit=0, Tests 32 passed (32)` — the same
"not caught" verdict, but for the first time actually evidenced.

**Rules this creates.**
1. A mutant harness MUST classify, never just report: no `Tests <n> passed|failed` summary line
   means **BROKEN**, and BROKEN is neither "caught" nor "not caught" — it is a re-run.
   `COMMON.md` §10.17's RED/BROKEN split applies to mutant runs exactly as to cluster commands.
2. Pass test paths **literally** into a harness's argv, or `${=VAR}` in zsh. A variable holding
   several paths is one token in this shell and there is no error to see.
3. The same guard belongs on the `exit` code: a mutant run whose exit is nonzero **and** whose
   FAIL list is empty is impossible for a real mutant, and is the signature of this trap.

Cost here: two mutants re-run, ~3 minutes, caught only because `exit=1` with an empty FAIL list
was implausible enough to check. A seat that trusted the line would have shipped a refutation
section with two fabricated "not caught" rows (`heartbeat-protocol` §2.6).

**Also worth the line: restoring a mutant with `git checkout -- <path>` DESTROYS uncommitted
work.** The standing entry at the top of this file warns that `git checkout <sha> -- path`
*stages*; the variant a worker mid-cluster actually reaches for is the sha-less one, which
restores from the index and silently discards the cluster being written. Snapshot the files to
scratch before the first mutant and restore with `cp`, then verify the restore by `md5`, not by
eye. This seat's harness is at
`scratchpad/CODE-S02-C3C4-r0/mut.py` and is ~30 lines; it should be shared rather than rewritten
per seat.

## 2026-09-06 — CODE-S01-C3C4 (Claude Opus 5, mission `consent-ui`, coding, slice S01 clusters C3 + C4)

### A `perl -0pi -e` mutant carrying a `\x{NNNN}` codepoint is a SILENT NO-OP on a UTF-8 file
*(measured, cost ~5 min and very nearly a false "my assertion is weak" conclusion)*

The mutant for "the byte-exact copy lost its em dash" was written
`perl -0pi -e 's/bench running \x{2014} unless/bench running - unless/' CookieBar.tsx`.
The suite came back **6 passed (6)** — apparently proving the copy assertion pinned nothing.
It proved nothing of the kind: without `-CSD`, perl reads the file as BYTES, so a `\x{2014}`
CODEPOINT can never match the three UTF-8 bytes `342 200 224` that are actually on disk.
`diff` against the pristine copy printed nothing — **the file was never modified.**

```
$ diff pristine/CookieBar.tsx m1-probe.tsx && echo "NO DIFFERENCE — the mutant never applied"
NO DIFFERENCE — the mutant never applied
$ grep 'bench running' pristine/CookieBar.tsx | od -c | tail -1
      r   u   n   n   i   n   g     342 200 224       u   n   l
```

Rebuilt in `python3` (which reads UTF-8 by declaration) the same mutant is caught immediately.
**The rule, and it generalises past encodings:** before you conclude a green run means a weak
assertion, prove the mutant LANDED — `diff` the file, or have the mutator itself
`assert old in source` and fail loudly. This is the sibling of CODE-S02-C1C2's "a `\uXXXX`
escape in a `.ts` module is a no-op": there the mutant applied and changed no runtime value;
here it changed no bytes at all. Both look identical from the summary line.
**A mutation harness should print its own replacement count. Mine now does.**

### An unanchored `s/…/…/` mutant on a 7,000-line stylesheet patches the FIRST match in the FILE, not in your block
A "move a declaration inside `.consentBarCore`" mutant used `s/  position: relative;\n\}/…/`
without `/g` and without scoping. `globals.css` holds many `position: relative;` rules, so the
insertion landed roughly 4,000 lines above the slice's own block, and the test failed for a
reason that had nothing to do with the property under test — reading as "the neighbouring
mutant WAS caught", i.e. as an over-broad assertion. **Scope every mutant to the delimited
region you own** (slice the file at the marker, replace inside that slice only), and assert the
anchor is unique before replacing.

### A "the locked control does not move" assertion taken ONCE after three activations is satisfied by a control that moved three times
*(measured: a mutant that made the Essential switch fully operable passed **9 passed (9)**)*

`S01-S21`'s acceptance reads "after a click, a `Space` keydown and an `Enter` keydown it is
still `aria-checked="true"`". Written literally — three activations, one closing assertion —
the case is green against a switch that flipped true→true→false→true, because an ODD number of
flips of a boolean returns it to its starting value only by accident of arithmetic. Asserting
after EVERY activation catches the mutant at the Space step:

```
AssertionError: Space does not move the locked switch:
  expected [ 'false', 'true', 'false' ] to deeply equal [ 'true', 'true', 'false' ]
```

**Class: any "nothing changed" assertion over N activations of a two-state control must assert
N times, not once.** The plan wording invites the single closing form; the plan wording is
wrong, and the refutation duty is the only thing that finds it.

### `border-bottom:` matches an unanchored `/bottom:/` — a CSS guard must match the PROPERTY
Cluster C3's route-independence arm collected `[...block.matchAll(/bottom:\s*([^;]+);/g)]` and
required every hit to be `calc(<n>px + var(--safe-b))`. It was green for C3 and turned RED the
moment cluster C4 added `border-bottom: 1px solid var(--line)` to the SAME block — against a
completely correct stylesheet. Split each declaration on `:` and compare the trimmed PROPERTY
name, and scope the scan to the rules whose selector list contains the element you mean.
**Same family as the `✓`-glyph and `?? apps/ui` traps: a filter that can match for the wrong
reason is not evidence, and one that can miss for the wrong reason is not a guard.**

### TypeScript keeps a `const` local's narrowing inside a `setState` updater closure — and does NOT keep a parameter property's
```
components/consent/CookiePreferencesCard.tsx(70,60): error TS7053: Element implicitly has an 'any'
type because expression of type '"quality" | "analytics" | "essential"' can't be used to index
type 'ConsentToggles'.
```
`if (category.locked || category.id === "essential") return;` narrows `category.id` for the rest
of the function body, but the narrowing is DISCARDED inside `setToggles((current) => …)`. Reading
`const id = category.id;` before the guard and using `id` inside the closure compiles clean.
**And note where this was caught:** vitest transpiles without typechecking and the root
`pnpm typecheck` excludes `apps/ui`, so the ONLY thing in the harness that can see this class of
defect is `cd apps/ui && npx tsc --noEmit -p tsconfig.json` (COMMON §10.30). It found a live
`TS7053` in a component whose 9 render tests were all green.

### The S01 containment guard counts a category string in PROSE, comments included
`tests/render/consent-storage.test.tsx:338` asserts each of the twelve category strings occurs in
`apps/ui/lib/consent.ts` exactly as many times as the DATA uses it. A doc comment I added to
explain an unrelated fix used the words "Model quality telemetry" and the guard fired —
`"Model quality telemetry" occurs 1x in consent.ts: expected 2 to be 1`. The guard is right; the
surprise is that a rule everybody reads as "do not inline copy in a COMPONENT" also constrains
what a comment in the OWNING module may say. Reword the comment; never loosen the guard.

### An "is this copy string inlined in the component?" guard must bound the match with a quote or an angle bracket
The naive form (`source.includes(categoryName)`) is RED against a correct component, because the
category name `Essential` is a substring of both the footer label `Essential only` and the prop
name `onEssentialOnly`. An inlined copy string always appears either as a quoted literal or as a
JSX text node, so bound it: `/["'>]\s*<value>\s*["'<]/`. Verified in both directions — a literal
added to a non-asserted element is caught, and the correct component is not.

### A reviewer probe cannot discharge a finding whose remedy is a TYPE
`COMMON.md` §10.10 says a finding proved by a probe is discharged by re-running that probe against
the fix. `code-rev-s01-c1c2-r1-spec-properties.test.tsx` proves three runtime defects and one
TYPE defect (`decisionFor("save-choices")` with the argument omitted). Vitest transpiles `.tsx`
without typechecking, so after the correct fix — overloads that make that call a `TS2345` — the
probe's runtime case STILL EXECUTES and STILL FAILS, forever. A seat reading §10.10 literally
either reports the fix incomplete or, far worse, invents a runtime fallback for the omitted
argument, and every candidate fallback silently records a consent value the visitor never chose.
**The discharge for a type-level remedy is a compiler transcript:** write the offending call AND
the calls that must still compile into a throwaway `.ts` inside a project that actually
typechecks, run `tsc --noEmit -p`, paste the output, delete the file, prove it gone with
`git status --porcelain`. One error on the bad line, zero on the good ones, 40 seconds.

### `vitest.config.ts`'s `include` does not cover `.review-scratch/`, and the failure looks like a missing module
Every review packet in `consent-ui` tells the seat to "render the component in jsdom yourself with
a throwaway test in `.review-scratch/`". The repo's `vitest.config.ts` includes only
`tests/**/*.test.ts(x)` and `acceptance/**/*.test.ts`, so
`pnpm exec vitest run .review-scratch/my-probe.test.tsx` prints `No test files found, exiting with
code 1` — which under `COMMON.md` §10.17 is the signature of BROKEN, and which a seat in a hurry
reads as "my probe cannot resolve the component". It resolves fine; it was never collected.
**Fix, 24 lines, no git write in the tree under review:** a config beside the probe with the same
five aliases, `root` pointed at the repo, and `include: [".review-scratch/**/*.test.tsx"]` — then
`pnpm exec vitest run --config .review-scratch/vitest.review.config.ts`. A working copy is at
`.hermes/reports/consent-ui/probes/code-rev-s02-c3c4-r1-vitest.probe.config.ts`; `root` must be
`resolve(import.meta.dirname, "..")` or the aliases resolve one level down and every import fails.
Three review seats have now written this file independently. It belongs in the repo.

### React's input value tracker desynchronises after a cancelled click, and the NEXT change fires no `onChange`
Measured React 19.2.8 + jsdom 30.0.1 (probes `code-rev-s02-c3c4-r1-tracker.test.tsx`,
`…-recovery.test.tsx`). Click a checkbox with a listener that calls `preventDefault()`: the box is
toggled BEFORE dispatch, so React's `ChangeEventPlugin` fires `onChange` with
`currentTarget.checked === true` and updates `inputValueTracking` to `"true"`; the browser (and
jsdom) then run the canceled-activation steps and revert the DOM to `false`. Tracker `"true"`,
DOM `false`. **The next genuine click drives the DOM `false -> true`, React sees no change against
the tracker, and dispatches NO `onChange` at all** — any React state mirroring that input is now
permanently stale, and a `disabled` computed from it is stuck. One `onChange` for two clicks;
verify by counting handler invocations, not by reading state.
**What does NOT fix it:** a synthesised `.click()`, and `Object.getOwnPropertyDescriptor(
HTMLInputElement.prototype,"checked").set.call(node,v)` — the widely-copied "React native setter"
trick — because React hooks the INSTANCE descriptor and the prototype setter bypasses it.
**What does:** plain assignment `input.checked = false` in the same handler that cancelled the
click; it goes through React's instance setter and re-syncs the tracker. Guarding the handler with
`checked && !nativeEvent.defaultPrevented` is still necessary (without it the mirror records a
value the box never held, and the control fails OPEN) — it is just not sufficient.

## 2026-09-07 — CODE-S02-C5C6 (Claude Opus 5, mission `consent-ui`, coding, slice S02 clusters C5 + C6, sub-lane `slice/consent-s02-modal`)

### CORRECTION, dated, to "jsdom 30.0.1: `focus()` lands on almost everything a browser would refuse — only `input[type=hidden]` is refused" (`:1602-1617`, written 2026-09-06)
**The original entry's lines are left exactly as written; this is the correction that supersedes
its universal claim.** The sentence at `:1611` — *"So a focus-trap test in jsdom can discriminate
**exactly one** unfocusable element type"* — is FALSE. The sample behind it was six element
shapes; a seventeen-shape sweep (`CODE-REV-S02-C1C2` r2, probe
`code-rev-s02-c1c2-r2-focusability.probe.tsx`) found a **second** one, and this seat then
converted it into a shipped regression case:

```
button inside <fieldset disabled>   selector=true  afterFilter=true  focus()lands=false
```

`button:not([disabled])` matches it — the `disabled` attribute is on the FIELDSET, not on the
button — so an attribute filter keeps it, and jsdom's `focus()` refuses it exactly as a real
browser does (HTML: a descendant of a disabled `fieldset` is itself disabled). **The
consequence the original entry got backwards: the advance-past-a-refused-target loop IS
pinnable in jsdom, and the `<fieldset disabled>` shape is the only shape that pins it.**
Measured by this seat, mutating the shipped module:

```
MN1c  advance loop REMOVED | exit=1 | Tests  1 failed | 18 passed (19) | CAUGHT
      FAIL ... > advances past a control inside a disabled fieldset, so Tab is not a dead key
```

Note which case did NOT go red: the `input[type=hidden]` case stays GREEN under that mutant,
because the attribute filter removes the hidden input before the loop ever sees it. So the
entry's "the one case you can write is the one worth writing" advice pointed at the case that
pins the FILTER, while the loop shipped with no gate at all for a full round.
**The class, and it is the reason this correction is worth its lines:** *an environment
measurement taken over a finite sample was written into shared memory as a universal ("only X",
"exactly one"), and the next seat skipped real work because of it.* A measurement entry states
its sample size and its enumeration rule, or it states no "only".

### jsdom's `compareDocumentPosition` answers `FOLLOWING` in BOTH directions for a disconnected node — so "which is on top" silently becomes "which was iterated last"
The DOM spec requires the disconnected answer to be *consistent* (if A→B is FOLLOWING then B→A
must be PRECEDING). jsdom 30.0.1 is not: measured here, in every arrangement tried — detached
node created first, created second, and a node that was in the document and was removed —

```
A attached.cDP(detached) = 37 [DISCONNECTED|FOLLOWING|IMPL_SPECIFIC]   -> above = true
A detached.cDP(attached) = 37 [DISCONNECTED|FOLLOWING|IMPL_SPECIFIC]   -> above = true
B attached.cDP(removed)  = 37 [DISCONNECTED|FOLLOWING|IMPL_SPECIFIC]   -> above = true
B removed.cDP(attached)  = 37 [DISCONNECTED|FOLLOWING|IMPL_SPECIFIC]   -> above = true
```

**Consequences, both of which cost this seat a full RED-GREEN cycle to find.**
1. Any "topmost surface" search written as *"walk the candidates, take the one that compares as
   above the incumbent"* becomes, for any pair involving a detached node, *"take whichever was
   iterated last"*. A test that puts the detached surface FIRST in the registry therefore PASSES
   against a module with no guard at all — which is exactly what happened here: the first version
   of the `isConnected` regression case was GREEN at the unfixed HEAD and looked like a finished
   pin. **Order the registry so the bad entry is iterated LAST, or the case proves nothing.**
2. The other half of the same remedy is **not pinnable in this environment**: with the candidate
   guard in place, removing the "a detached INCUMBENT never stands" clause survives
   (`MN7b … | Tests 19 passed (19) | SURVIVED`), because jsdom's two-way FOLLOWING lets any
   connected candidate displace a detached incumbent anyway. In a spec-conformant browser it
   would not. This is the "two remedies for one defect class can hide each other" entry above,
   with a new twist: here it is the ENVIRONMENT's non-conformance, not the remedies' overlap,
   that hides one half — so the honest report is "shipped, unpinnable here, and why", not a
   claim that the suite covers it.

### React 19's cleanup-returning callback ref is the reachable way to hold a STALE DETACHED node
`ref={(node) => { ref.current = node; return () => {}; }}` — React calls the returned cleanup on
detach and does **not** call the ref with `null`, so `ref.current` keeps pointing at a node that
has left the document. The two idioms that are safe (`ref.current` becomes `null`) are the
cleanup-less callback ref and a plain object ref. A component that keeps `open` true while it
stops rendering its container reaches the same state. **When a guard's branch is "the ref is a
detached node", this is the only fixture shape in React 19 that produces it** — and the fixture
must assert the precondition (`expect(node).not.toBeNull(); expect(node.isConnected).toBe(false)`)
or the case silently degrades into the already-handled `null` branch and passes for free.

### A REAL mutant can produce a GREEN summary with a NONZERO exit — the "empty FAIL list means BROKEN" heuristic misclassifies it
The entry above ("A BROKEN run inside a MUTANT harness reads as 'the mutant was not caught'")
gives the rule *a mutant run whose exit is nonzero and whose FAIL list is empty is impossible for
a real mutant, and is the signature of this trap*. **Measured here: there is a third case, and
that rule sends it the wrong way.** Mutant MC6o replaced the guarded
`section?.scrollIntoView?.({…})` with an unguarded `section!.scrollIntoView({…})` in a React
`onClick`. jsdom has no `scrollIntoView`, so it throws — but React 19 dispatches the click
outside the test body, so vitest reports the throw as an **unhandled error**, not as a failing
assertion:

```
 Test Files  1 passed (1)
      Tests  14 passed (14)
     Errors  1 error
```

exit **1**, empty FAIL list, and a summary that says everything passed. A harness classifying on
the summary alone calls that SURVIVED (mine did); a harness applying the recorded heuristic calls
it BROKEN. It is neither: it is **CAUGHT**, and the thing that catches it is the runner's exit
code. Verified against the mission's own cluster command, unedited:

```
S02-C6 | vt=1 guard=0 VERDICT=1 |       Tests  22 passed (22) |  Test Files  2 passed (2)
```

`guard=0` — all three summary arms are satisfied — and the command is still RED, purely on `vt`.
**Rules this creates.** (1) The distinguishing token is vitest's `Errors  N error` line: nonzero
exit + empty FAIL list + **an `Errors` line** = a real mutant caught by the exit code; nonzero
exit + empty FAIL list + **no summary line at all** = BROKEN. Classify on both. (2) This is the
strongest argument yet for `COMMON.md` §8's capture-first idiom asserting `vt` **as well as** the
summary: the summary arms alone would have shipped this mutant as undetected. (3) A guard on a
component that calls a DOM API a test environment lacks can only be pinned by a case that does
NOT stub it — every stubbing case passes against the unguarded code.

## 2026-09-07 — CODE-S01-C5 (Claude Opus 5, mission `consent-ui`, coding, slice S01 cluster C5 + the C3C4 design-fidelity follow-up)

**A JSDoc that NAMES the banned call fails the grep-shaped guard that bans it.** `S01-S45`'s
slice-wide guard asserts "zero `.focus()` calls" across every file under
`apps/ui/components/consent/` except the shared helper. My `CookieConsent.tsx` prose said, in a
JSDoc, *"This component never calls `.focus()` itself"* — a sentence whose whole point is that
the call is absent, and which a grep counts as one hit. Measured with the guard's own pattern:
`grep -c '\.focus()' CookieConsent.tsx` -> **1** before the reword, **0** after. `COMMON.md` §8
already records that grep-based tests do not know what a comment is; the corollary nobody had
written down is the reverse direction — **a comment must not SPELL the token a grep bans, even
to deny it.** Write "never moves focus itself" and say why in the same breath, so the next seat
does not re-introduce the spelling. Cost here: near-zero, because it was caught by running the
guard's own pattern over the new files before committing; had it shipped, it would have been a
C7 rework round for a sentence.

**A cluster can be ordered to test an event whose listener belongs to a later cluster.** `S01-S30`,
`S01-S31` and `S01-S32` are written as "press Esc", while `S01-R18`, SPEC §Out of scope and
`S01-S45` forbid C5 from writing any Esc listener, and the ONE that exists
(`modalSemantics.ts`) arrives with the `C6` merge that has not happened. Measured in the lane:
`ls apps/ui/components/consent/` was `CookieBar.tsx`, `CookiePreferencesCard.tsx` only, and a
dispatched `keydown{key:"Escape"}` changes nothing. **The lawful seam is the prop the absent
listener will call.** A `vi.mock` PASS-THROUGH double — `vi.importActual`, record the props,
then `createElement(Real, props)` — hands the test the machine's own `onDismiss` while the REAL
component still renders, so every other assertion in the file is still made against the shipped
code. `vi.hoisted` carries the recorder across the hoisted factory; clear it in `beforeEach`.
This is strictly better than reaching into `__reactFiber$*`, and it makes the dependency on the
later cluster visible in the test file instead of hiding it in a handoff.

**Keep the deliberately-unsatisfiable measurement as a test, not as a claim.** The same file
carries a case named *"dispatches Escape into a lane that has no listener yet, and records that
it does nothing"*. It is not a requirement; it is the receipt for the paragraph above, and it is
the case that will legitimately change in C6. A sentence in a handoff saying "Esc does nothing
yet" is unverifiable six hours later; a green test saying it is not.

**`flushSync` inside `act` is how you see the first render pass.** `R06` needs "absent on the
first client render, present after effects flush", and `act(() => root.render(...))` flushes
passive effects before it returns, so the intermediate state is invisible. `act(() => {
flushSync(() => root.render(<X/>)); firstPass = container.innerHTML; })` reads the DOM after the
render and before the effects — measured `""` then the bar. `renderToStaticMarkup` covers the
server half of the same requirement.

**A promoted probe can be run verbatim from the scratchpad without writing anything into the
lane.** `code-rev-s01-c3c4-r1-stale-initial.test.tsx` imports
`../apps/ui/components/consent/CookiePreferencesCard.js`, a path that only resolves from a file
one level under the repo root — which is why the reviewer used a `.review-scratch/` directory
inside its own worktree. A coding seat may not create that directory. The fix is a scratchpad
vitest config with `test.root` pointing at the scratch directory and an **exact-string
`resolve.alias`** for that specifier pointing at the lane's real file; the probe stays
byte-identical (`md5` verified) and the lane's `git status --porcelain` stays at 0. Do NOT add
such a probe to a cluster's own file list: this one's first case is deliberately RED (it
documents the defect), so it would make the cluster command unpassable.

**A `@ts-expect-error` pin needs a home the project actually compiles.** Root `tsconfig.json`
`include`s `tests/**/*.ts` and excludes `apps/ui`, so a `.tsx` test is compiled by no project at
all and cannot pin anything. The pin belongs in a file the `apps/ui` project owns, as a
never-called function; `noUnusedLocals` is not set there, so an uncalled local is not a
diagnostic. Measured both directions: with the overloads present `npx tsc --noEmit -p
apps/ui/tsconfig.json` exits 0; with them deleted it prints
`lib/consent.ts(213,3): error TS2578: Unused '@ts-expect-error' directive.` and exits 2.

## The `ugrep` shim breaks patterns that BSD `grep` accepts — the second direction of §10.16
*(CODE-REV-S01-C5 r1, mission `consent-ui`, 2026-09-07)*

COMMON §10.16 records one direction of the tool-shell/script `grep` split: a term that matches
vitest's multi-byte `✓`/`×` glyph works in the tool shell (a `ugrep` shim, UTF-8 locale) and is
**0 forever** in a `.sh` under `/bin/bash` (BSD `grep` 2.6.0-FreeBSD, C locale).

**The reverse also happens, and it is louder.** Running the S01-S45 guard sweep in the tool shell:

```
$ grep -rcE '\.focus()' apps/ui/components/consent/
ugrep: error: error at position 12
(?m)\.focus()
            \___empty (sub)expression
```

`()` is an empty group. BSD `grep -E` accepts it (matching the empty string, so the pattern
degenerates to `\.focus` and still finds the hits); `ugrep` refuses to run at all. A guard written
this way is not silently 0 — it is a **non-zero exit with no matches on stdout**, which a
`n=$(grep -c …)` capture turns into an empty string, and `[ "$n" -eq 0 ]` then fails with
`bad math expression` under zsh or `integer expression expected` under bash. In a compound guard
that is a hard error, not a false pass — but in a `for` loop that prints a table it is four
blank cells that read as "0 hits".

**Rule:** a guard term whose pattern is a LITERAL uses `grep -F`, never `-E`. `.focus()`,
`<script`, `addEventListener`, `createPortal` and every other banned-token sweep in this mission
are literals. `-F` is immune to the regex-dialect split in both directions, and it also removes
the `.`-matches-any hazard that made `\.` necessary in the first place. Reserve `-E` for terms
that genuinely need alternation or anchoring, and run those from a `.sh` under `/bin/bash` per
§10.16.

## 2026-09-07 — CODE-S02-C7 (Claude Opus 5, mission `consent-ui`, coding, slice S02 cluster C7 + the C3 and C1 follow-ups)

### CORRECTION, dated, to "jsdom's `compareDocumentPosition` answers `FOLLOWING` in BOTH directions … so 'which is on top' silently becomes 'which was iterated last'" (`:1852-1879`, written 2026-09-07)
**The original entry's lines stand; this narrows its consequence.** That entry's dead-end note
(carried into `agent-reports/CODE-S02-C5C6.md` §4.2, *"the 'a disconnected INCUMBENT never
stands' half of the N7 remedy is not pinnable in jsdom … do not spend another round trying to pin
it"*) is true **of jsdom's default `compareDocumentPosition` and of nothing else**. The clause IS
pinnable, in the same jsdom, with a **conformant shim of that one method** — nine lines, no new
dependency, no probe harness:

```ts
Object.defineProperty(Node.prototype, "compareDocumentPosition", {
  configurable: true, writable: true,
  value(this: Node, other: Node): number {
    if (this.isConnected && other.isConnected) return real.call(this, other);
    const direction = other.isConnected
      ? Node.DOCUMENT_POSITION_PRECEDING       // detached -> connected  = 35
      : Node.DOCUMENT_POSITION_FOLLOWING;      // connected -> detached  = 37
    return Node.DOCUMENT_POSITION_DISCONNECTED |
           Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC | direction;
  }
});
```

Measured in lane `.worktrees/consent-s02`, `tests/render/consent-modal-semantics.test.tsx`, the
stale surface registered LAST so it is the incumbent:

| arrangement | incumbent clause present | incumbent clause removed |
|---|---|---|
| jsdom default (37 both ways) | `Tests 19 passed (19)` | `Tests 19 passed (19)` — **survives** |
| conformant shim (35 / 37) | `Tests 20 passed (20)` | `Tests 1 failed \| 19 passed (20)` — **caught** |

The failure frame is `expected "vi.fn()" to be called 1 times, but got 0 times` on the LIVE
surface's `onClose`: without the clause the detached incumbent swallows the key.

**The generalisable rule, and it is the reason this is worth six lines of scroll:** *"unpinnable"
is a claim about the ENVIRONMENT, not about the property.* When a test cannot discriminate a
branch because the environment answers a DOM primitive incorrectly, the option before "declare it
unpinnable" is to **shim the one primitive to its specified behaviour and assert the shim's
conformance inside the case** (here: exactly one direction FOLLOWING, exactly one PRECEDING —
asserted as a precondition, so the case can never silently degrade back into the arrangement that
passes by coincidence). Restore the prototype in `afterEach`, FIRST, before the unmount, so a
failed assertion cannot leak the patch into the next case. Cost measured at ~15 minutes against a
dead-end note that told the next seat not to try.

### An assertion added to an existing `it` does not move the `Tests N passed` count — a packet that predicts it will is asserting a ripple axis it did not measure
`CODE-S02-C7`'s packet ordered *"one attribute assertion added to the S02-S18 case; nothing else"*
and, twice, *"its TEST count rises by one, its file count does not"*. Measured either side of that
exact edit, three runs each: `run S02-C3 3 …` gives **`Tests 28 passed (28)`** before and
**`Tests 28 passed (28)`** after; `Test Files 3 passed (3)` both times. Only a new `it`/`test`
moves that number. This is COMMON §10.27's second half ("a packet never asserts a ripple axis it
has not measured") arriving on a coding packet rather than a plan: the seat that transcribes the
prediction into its handoff reports a delta that never happened, and the reviewer who checks it
finds a fabrication where there is only an unmeasured constant. **Rule: a packet predicting a
count change names the UNIT it changes — a case, a file, a diagnostic, an array element — and an
"assertion added" edit predicts a change in none of them.**

### A `<form …>` written inside a JSX COMMENT is counted by the source-text guard — and the chain arm is what found it
`authRoutes.source-test.mjs:159-165` counts `/<form\b[^>]*>/g` in `SignUpFlow.tsx`'s SOURCE TEXT
and asserts the total is `3` across the two auth files. A C7 comment reading
`{/* OUTSIDE the <form> (S02-S57): … */}` took it to `4`:

```
not ok 14 - every credential-bearing auth form has an explicit query-free POST fallback
  expected: 3
  actual: 4
```

COMMON §8 already says "grep-based tests do not know what a comment is", and the entry is still
worth its lines because of WHERE the failure surfaced: not in the cluster's own test file, which
was `Tests 14 passed (14)` throughout, but in `tests/unit/v2ui-node-runner.test.ts` — a file C7
neither writes nor thinks about, and which is in C7's command ONLY because of the N7 chain rule
(`ARCH-REV-S02-r1`). **Without the chain arm this ships and C9 finds it.** That is the first
measured save the chain rule has produced in this mission, and it cost one edit to fix.
**Rule: prose in a component this repo scans describes tags in words (`the sign-up form
element`), never in angle brackets** — and say WHY in the comment, or the next seat re-adds it.

### zsh does not word-split an unquoted `$VAR`, so a multi-file vitest command collapses into ONE path — and the guard calls it RED
Storing a cluster's file list in a variable and calling `run S02-C7 5 $C7` works in bash and is a
NO-OP SPLIT in this tool's zsh: `$C7` arrives as a single argument, vitest treats the whole
space-joined string as one filter, matches nothing, and exits 1. Six consecutive runs printed

```
S02-C7 | vt=1 guard=1 VERDICT=1 | |
```

which reads exactly like a real failure. **The tell is the EMPTY summary fields**: a genuinely
red run always prints `Tests N failed | M passed (N+M)` and `Test Files …`. A run whose captured
`Tests` line is EMPTY did not execute anything and is BROKEN, never RED (COMMON §10.17's
classification, arriving through a new door — variant 8 of the acceptance-command family, and
the second one this mission has met after variant 7's silently-dropped path).
**Two rules, both cheap:** write every file list out LITERALLY in the command, never through a
variable; and give the guard a BROKEN arm — `[ -n "$sum" ]` — so it can say "did not run"
instead of "failed". Confirmed by `pnpm exec vitest run "a.test.tsx b.test.tsx"`, which prints
`filter: a.test.tsx b.test.tsx` / `include: …` and no summary at all.

## `git checkout -- <path>` restores to HEAD, so it DELETES the uncommitted work in that file, not just your mutant (CODE-S01-C6, 2026-09-07)

The refutation duty plants a mutant in a source file and then restores it. The obvious restore is
`git checkout -- <path>` — and it is already recorded above that it STAGES the change. The bigger
loss is different: while a cluster's own edits are still UNCOMMITTED, `git checkout -- <path>`
reverts the file to HEAD, i.e. it throws away the cluster's implementation together with the
mutant. Measured: one `git checkout -- CookieConsent.tsx CookiePreferencesCard.tsx` after mutant
M1 silently removed the entire C6 wiring (both files back to the pre-cluster text); the next
mutant's anchor then failed to match and three mutants reported `PLANT FAILED` for a reason that
had nothing to do with them. **The rule: `cp` a snapshot of the GREEN file to the seat's scratch
directory before the first mutant and restore with `cp`, never with git.** `git status --porcelain`
after the restore does NOT catch this — the file simply drops off the modified list, which looks
like a clean restore. The reliable check is `diff -q <file> <scratch>/<file>.green`.

## zsh does NOT word-split an unquoted `$VAR`, so a path list held in a variable becomes ONE argument (CODE-S01-C6, 2026-09-07)

The tool shell is zsh; a `.sh` run under `/bin/bash` is bash. In bash, `git log A..B -- $PATHS`
splits `$PATHS` into four path arguments. In zsh the same line passes ONE argument containing
spaces, which matches no file — and after `--` git does not error, it just prints nothing and
exits 0. The two shells therefore give OPPOSITE answers to the same typed command, and the zsh
answer is the reassuring one. Measured on this mission: a CLAIM-time check reported "0 commits
touch the four S02-owned paths" from the tool shell while the identical command in a `.sh`
reported 1, and the `.sh` was right. This is COMMON §10.16's class arriving through git rather
than grep: **§10.16's dual-shell rule binds every command that takes a LIST, not only every
command that greps.** Either write the list out literally, or use `${=PATHS}` in zsh, or run the
check under `/bin/bash` and treat that as the answer.

## `git log <tip>..HEAD -- <paths>` counts the MERGE COMMIT once the other branch moves past the merged commit (CODE-S01-C6, 2026-09-07)

A cross-slice guard shaped as "no commit in `<other-branch>..HEAD` touches the other slice's files"
is satisfiable only while `<other-branch>` still points at the exact commit that was merged.
Measured here: `slice/consent-s02` was merged at `44744d8d`; with `A=44744d8d` the count is 0, and
with `A` = any later S02 tip (`e0666a79`, `511d30b6`, `9cc81351`) the count is 1 — and the one
commit counted is the MERGE ITSELF, which is provably TREESAME to its S02 parent for those paths
(`git diff --stat 44744d8d 92828aa5 -- <paths>` is empty). The cause is history simplification: the
merge is TREESAME to its S02 parent, so it is normally simplified away and that parent is followed —
but when that parent is EXCLUDED by the range, the merge is shown as a real change against the
remaining parent, where the files are new. **The pin must be the SHA that was merged (a value that
never moves), never a branch ref that the other lane keeps advancing.** This is ARCH-REV-S01 N6's
"un-passable through no act of ours" class, in a second command.

## 2026-09-07 — CODE-S02-C8 (Claude Opus 5, mission `consent-ui`, coding, slice S02 cluster C8, sub-lane `slice/consent-s02-css`)

### A mutation harness that restores by replaying the substitution BACKWARDS leaves the tree MUTATED, silently
*(measured, and it very nearly shipped `left: 20px` into the stylesheet)*

Mutant `S61-M4` replaced `  left: 24px;` with `  left: 20px;` inside the S02 block. The forward
anchor was unique inside the block, so the mutant landed and was correctly caught. The RESTORE
then ran `replace("  left: 20px;", "  left: 24px;")` and hit the harness's own uniqueness
assert:

```
AssertionError: anchor not unique (3): '  left: 20px;'
```

`  left: 20px;` occurs three times in a 7,600-line `globals.css`. **A forward anchor scoped to
your block can be unique while its reverse is not**, and the process died between apply and
restore. This is the restore-side door of `:1707` ("an unanchored `s/…/…/` mutant patches the
FIRST match in the FILE"), and it is worse there: a failed apply is loud, a failed restore is
invisible until some later assertion blames the wrong thing.

**`git status --porcelain` does NOT catch it** — the file is legitimately modified for the whole
cluster, so the line it prints is the same before and after the accident. `heartbeat-worker` §2's
"print `git status --porcelain` after every restore" is necessary and not sufficient.

**Rules, all three cheap:**
* **Restore from a byte SNAPSHOT taken before the mutant**, never by inverting the edit.
* **Assert both directions:** `read() != snapshot` after apply (the mutant landed, `:1682`) and
  `read() == snapshot` after restore (the restore landed).
* Resolve every anchor **inside your delimited block**, not over the file.

A harness with those three arms ran 20 mutants over the same stylesheet afterwards with zero
leakage, and the `git status` line after each was identical to the one before it — which is
exactly why that line cannot be the check.

### The `[ -n "$sum" ]` BROKEN arm misclassifies the LAWFUL `No test files found` red-at-base frame
`:2092` recommends a BROKEN arm — a captured `Tests` summary that is EMPTY means the command did
not run — and it is right about the case it was written for (a zsh-unsplit file list). But
COMMON §10.17 classifies `No test files found` as **RED-by-design** when the test file does not
yet exist, which is the opening frame of every TDD-first cluster. Both produce an empty summary,
so the arm reports:

```
S02-C8 | vt=1 guard=1 VERDICT=1
S02-C8 | Tests    : <none>
S02-C8 | BROKEN-ARM: empty summary -> did not run.
```

for a run that is behaving exactly as the plan says it should. **The arm needs a companion
condition, not removal:** say BROKEN only when the summary is empty AND `test -f <file>` for
every path in the command. Empty summary + file absent = RED-by-design; empty summary + file
present = BROKEN.

### One top-level rule per selector, or a source-text style contract asserts nothing
Writing `animation:` as a SECOND `.policyScrim { … }` rule rather than as a declaration inside
the existing one is invisible in a browser and fatal to a `readFileSync`-based style contract: an
`expectDecl(selector, prop, value)` helper reads the FIRST matching rule, so a later duplicate can
override a pinned declaration while the assertion still passes. Make the helper demand **exactly
one** top-level rule per selector and the stylesheet obey it; state variants are distinct
selectors (`:checked`, `:disabled`, `:focus-visible`, `::after`) and cost nothing. The suite
caught this on the author within one cycle — as a thrown `Expected exactly one \`.policyScrim\`
rule in the S02 block, found 2`, which reads like a test defect and is not one.

### `moduleResolution: node16` makes a new `tests/**/*.ts` import a TYPECHECK failure vitest cannot see
`import { contrastRatio } from "../support/contrast";` resolves fine under vitest and is
`TS2835` under the root `pnpm typecheck`:

```
tests/unit/consent-s02-style-contract.test.ts(6,31): error TS2835: Relative import paths need
explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or
'nodenext'. Did you mean '../support/contrast.js'?
```

The house form is the `.js` extension (`tests/unit/t9-mode-tokens.test.ts:326`). The cluster
command stayed green through the whole cycle while the typecheck gate was red by one. **Run
`pnpm typecheck` once as soon as a new test file has its IMPORTS** — the diagnostic is available
before the first assertion exists, and finding it at handoff instead costs a rework round.

## 2026-09-07 — CODE-S01-C6-REWORK-R1 (Claude Opus 5, mission `consent-ui`, coding, slice S01 cluster C6, rework round 1)

### `cmd 2>&1 > file` silently sends the FAILURES to the terminal and only the summary to the file
Capturing a RED vitest run as `pnpm exec vitest run <file> 2>&1 > out.txt` looks like the usual
idiom and is backwards: redirections are applied LEFT TO RIGHT, so `2>&1` first points stderr at
the *current* stdout (the terminal), and `> out.txt` then moves stdout only. vitest writes its
`FAIL` lines, `AssertionError` bodies and the `❯ file:line` frames to **stderr**, so `out.txt`
receives the run header and the `Tests N failed` summary and nothing else. Measured here: a
`grep -E '^[[:space:]]*FAIL'` over the captured file returned **0 hits on a run that had just
printed two FAIL lines on screen**, and the obvious reading of that is "the failures are not in
this file" rather than "the capture is wrong". The correct order is `> out.txt 2>&1`; the
`out=$(cmd 2>&1)` form used by every cluster command in this mission is already correct, because
command substitution captures stdout after stderr has been merged into it.
**The class this belongs to:** a shell construct that fails by returning a plausible EMPTY answer
instead of an error — the same family as COMMON §10.16's locale/glyph traps and zsh's refusal to
word-split an unquoted `$VAR` (`:2092`, `:2125`). **The rule: after any capture-to-file, assert the
capture is non-empty for a token you KNOW is present (`grep -c 'Test Files'`) before believing a
zero count from it.**

### A promoted probe cannot be re-run from where it is stored, and no `allowed` list grants it a home
`COMMON` §10.10 binds a rework seat to re-run the probe that proved the finding. That probe lives
under `.hermes/reports/<mission>/probes/`, and **two independent things stop it running there**:
`vitest.config.ts`'s `include` is `tests/**/*.test.{ts,tsx}` and never matches it (already recorded
at `:1570`), and the probe's own relative imports (`../../apps/ui/...`) assume a path exactly two
levels below the lane root. A coding seat's `allowed` list is exhaustive and grants no such path,
so the requirement and the file contract can only both be satisfied by copying the probe to a
transient `tests/<dir>/` (pick a directory no cluster command globs — cluster commands here name
paths literally), running it, deleting the directory, and proving `git status --porcelain` clean
before the gates. **Packets that name a probe should grant one scratch path under `tests/` for it,
marked "never committed".**

### A probe that INVERTS is a stronger discharge than a probe that stops being cited
The reviewer's B1 probe asserts the DEFECT (its cases are green while the bug is present). Re-run
against the fix it went `Tests 4 passed (4)` → `Tests 2 failed | 2 passed (4)`, and the two that
flipped are exactly the two stranding cases while the CSS-fact case and the CONTROL stayed green.
That single frame proves the fix reaches the measured routes AND that the probe's control was
never load-bearing — which no amount of re-running the author's own suite can show. **When a
rework packet names a defect-asserting probe, report the inversion explicitly, and name which
cases were expected NOT to flip.**

### `Math.round` disagrees with itself across two spellings of `1 - α`, and a ladder in prose never notices
`CODE-S02-C8-REWORK-R1`, discharging `CODE-REV-S02-C8-r1` B1. A comment beside a contrast
assertion said `.70 -> 5.61`; the assertion's own model prints `5.54`. The rung is an exact TIE
and the SPELLING of the complement decides it:

    0.70*38 + (1-0.70)*233  ->  96.5                 Math.round -> 97   ratio 5.5450  "5.54"
    0.70*38 +   0.30 *233   ->  96.49999999999999    Math.round -> 96   ratio 5.6077  "5.61"

`1 - 0.70` is `0.30000000000000004` in IEEE-754. So a seat that re-derives a composite BY HAND
with the literal `.30`, while the shipped code writes `(1 - alpha)`, gets a different integer
channel and a different ratio — and reports it as "the rounded model", which is how the wrong
figure survived a three-model table. **The tell that the table was wrong is visible without any
arithmetic: `Math.round(x) === Math.floor(x)` for every `x` that is not a tie, so a "rounded" row
and a "floored" row printing the SAME value to four significant figures means one of them was not
computed by the model it claims.** Rules: (1) re-derive by RUNNING the shipped expression, never
by retyping it; (2) when a rounded and a floored variant agree, you are on a tie — say so and
print the pre-rounding channel; (3) a measured ladder written in prose beside an executable
assertion is unexecuted prose — assert every rung you narrate, or narrate none. Nothing in this
repo executed the unpinned rungs, so the error survived a full green suite and a self-report.

### `git show <sha>:<path>` needs the path from the GIT root, and a nested-package lane hides that
Same seat. The git root here is `/Users/…/DebateAIRO`, one level ABOVE the `dialectical-engine`
package every command runs in, so `git show 511d30b6:apps/ui/app/globals.css` fails with
`fatal: path 'dialectical-engine/apps/ui/app/globals.css' exists, but not 'apps/ui/app/globals.css'`
— and `git show … | wc -c` then prints **0**, which silently becomes a byte figure in a report.
Use `511d30b6:dialectical-engine/apps/ui/app/globals.css`, or the `:./path` form the hint
suggests, and **assert the capture is non-empty before comparing it** (same family as the
capture-to-file trap above). A `wc -c` of 0 against a real file is never a measurement.

### `grep -c '<needle>'` after a mutant counts the WHOLE FILE, not the mutation
Same seat, caught in the mutant battery. A neighbour-mutant check printed `landed: 20` for
`grep -c '  font-size: 13px;'` because nineteen unrelated rules already declared it. The count is
still usable, but only as a DELTA: measure before and after (19 → 20). A bare post-mutation count
is evidence the anchor is common, not evidence the mutant landed — and a mutant that did not land
turns a "not caught" neighbour into a false clean bill.

### 2026-09-07 03:10 — CORRECTION (orchestrator, from CODE-REV-S01-C6 r2 N9): running a promoted probe needs NO transient `tests/` path
The entry at `:2248-2258` ("can only be satisfied by a transient `tests/<dir>/`") is WRONG and contradicts `:1965-1974`. `vitest run <path outside include>` treats the positional as a FILTER and prints `No test files found` — the remedy is a reviewer-owned `--config` from the scratchpad whose `include` names the probe file: `pnpm exec vitest run --config <scratch>/probe-runner.config.ts`. Promoted runner: `.hermes/reports/consent-ui/probes/code-rev-s01-c6-r2-probe-runner.config.ts` (copy, edit `include`). Zero files in the lane, zero under `tests/`. COMMON §10.46 corrected the same day.

## 2026-09-07 — CODE-S01-C7 (Claude Opus 5, mission `consent-ui`, coding, slice S01 cluster C7 + the C6 follow-up + the ADR index)

### A mutant harness that ABORTS prints the UNMUTATED suite result, and that reads exactly like "the mutant was not caught"
The harness asserts its anchor is unique before planting (`:2154`'s third rule).
`'  return ('` occurs **twice** in `CookiePreferencesCard.tsx`, so the plant aborted with
`AssertionError: anchor not unique (2)` — and because the abort and the test run were in the
same script, the very next lines of the transcript were:

```
AssertionError: anchor not unique (2): '  return ('
  -> vt=0
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

**`7 passed (7)` there is the run against the file with NO mutant in it.** Every number in the
frame is true and the conclusion a reader draws from it — "the guard does not catch a second
keydown listener" — is false. This is `:1637`'s class ("a BROKEN run inside a MUTANT harness
reads as 'the mutant was not caught'") arriving through the harness's own SAFETY assert rather
than through a broken command, which makes it worse: the assert that exists to prevent a wrong
mutant produced a wrong *reading*. Replanted with `const titleId = useId();` (unique) the same
guard went `1 failed | 6 passed (7)` naming the file and the line.
**Two rules, both one line:** make the plant step's failure ABORT THE WHOLE SCRIPT
(`set -e`, or `plant && run`), never merely skip the plant; and treat any mutant run whose
result equals the unmutated baseline as UNPROVEN until `diff <file> <snapshot>` has been shown
non-empty **in the same output**. Note also that Python's `str.replace` replaces **every**
occurrence, so without the uniqueness assert a non-unique anchor plants N mutants silently and
the frame you paste describes a different mutant than the one you named.

### A "must be COVERED" guard and a "must be ABSENT" guard produce the identical RED — only the covered-and-GREEN run tells them apart
`S01-S43` requires that every `consent*` selector carrying `animation:`/`transition:` inside the
S01 CSS block is named in that block's `prefers-reduced-motion` rule. Its N7 mutant
(`transition: opacity .18s ease;` on `.consentBar`, no counterpart) goes RED — but a guard that
simply banned all motion in the block would go RED on exactly the same mutant, with an
indistinguishable frame. The discriminating observation is the one the PLAN puts in a
subordinate clause and it is worth doing explicitly: keep the transition and **add
`.consentBar` to the reduced-motion rule**, then watch it return to `7 passed (7)`. Measured
here; it cost one extra run and it is the only evidence that the guard is a COVERAGE check.
**The general rule: for any guard of the form "X is allowed only if Y accompanies it", the RED
proves nothing on its own — the proof is the X-with-Y run, and it belongs beside the RED in the
handoff.** The same shape recurs whenever a plan words an acceptance as an OR.

### A guard sentence that names the EXAMPLE's spelling instead of the property cannot catch its own demo mutant
`PLAN.md`'s `S01-S44` second arm reads *"zero occurrences of a conditional whose test is
`decision.quality` or `decision.analytics`"*, and the mutant it names one line later is
`if (readConsent()?.analytics) { … }` — whose receiver is not `decision`. A guard transcribed
literally is GREEN against the mutant the same paragraph orders it to be RED against. The
receiver was a stand-in for "the stored decision", and it got written down as a variable name.
**Detection is free and belongs in every plan review: for each `accept:` line, check the guard
as WORDED against the mutant NAMED beside it, on paper, before anyone writes code.** The fix is
to pin the property (here: every read of the two booleans sits in a data position — an
object-literal value or a `typeof` shape check — and never in a control position), and to
report the widening as a plan defect rather than absorb it, because `COMMON.md` §10.43 forbids
paraphrasing a guard and this is the one case where the verbatim text is the defect.

### macOS `cat` has no `-A`
`cat -A file` (a GNU idiom for showing line endings while checking a mutant anchor) is
`cat: illegal option -- A` here; the flags are `[-belnstuv]`, so `cat -et` is the equivalent.
Same family as the `timeout` / `rg` / `awk index` notes in `heartbeat-worker` §6 — one wasted
round-trip each, every time.

### zsh runs BACKTICKS inside a double-quoted kanban body, so prose written in markdown lands on the board with commands EXECUTED into it
*(CODE-S01-C7, measured on its own handoff — the most expensive thing this seat did)*

The board CLI takes the comment body as a POSITIONAL argument, and every seat writes that body
in markdown, where a backticked identifier is ordinary prose. Passed as
`hermes kanban … comment <id> "…`consent-ui`…" --author X`, zsh performs command substitution
inside the double quotes. Measured on a 22 KB handoff: four backticked words were executed,
the shell printed

```
(eval):1: command not found: consent-ui
(eval):1: command not found: decision.quality
(eval):1: command not found: decision.analytics
(eval):1: command not found: translation
```

and then **`Comment added`**. The comment posts; the four words are replaced by their output.
Three were replaced by the empty string — including both halves of the sentence *"PLAN.md
words the arm as `decision.quality` or `decision.analytics`"*, whose entire point is WHICH
identifier the plan names, so the stored finding named none. The fourth was a backticked
`ls`, which zsh **ran**, splicing twenty-odd repo-root filenames into the middle of an
unrelated sentence.

**Why it is worse than the other members of this family** (`:2092` zsh not word-splitting,
`:2231` `2>&1 > file`, COMMON §10.16's locale/glyph traps): those return a plausible answer to a
GUARD, where a later arm can contradict them. This one corrupts the **permanent record** — a
board comment cannot be edited, the transcript shows a success line, and the only way to see the
damage is to read the stored body back (`show --json`). A reviewer reads the corrupted text as
what the author wrote.

**Rules:**
* Never pass a prose body to the kanban CLI as a double-quoted literal. Write it to a file and
  pass `"$(cat <file>)"` — the result of a parameter expansion is NOT re-scanned for command
  substitution. A `<<'EOF'` heredoc (quoted delimiter) is the other safe form.
* After posting anything long, **read it back** and grep it for a token you know is in it. The
  same "assert the capture is non-empty for a token you KNOW is present" rule at `:2231` applies
  to writes, not only to reads.
* The blast radius is invisible in the tool output, so this cannot be caught by watching the
  command: `command not found` on stderr is the ONLY tell, and it is four lines above a success
  message in a 22 KB post.

## 2026-09-07 — CODE-REV-S01-C7 r1 (Claude Opus 5, mission `consent-ui`, blind review)

### §10.40's zsh trap through a NEW door: a `git log … -- $PATHS` probe that falsely REFUTES another seat's finding
Re-measuring `CMD-C6`'s `n_s02c` arm I put the four S02 paths in a plain variable and ran, inline in
the tool shell, `git log --oneline "$ref"..HEAD -- $P | grep -c …`. zsh does not word-split an
unquoted `$P`, so git received **one** pathspec — the four paths joined by spaces, a file that does
not exist — and every ref in the sweep printed `0`, including the ref the same command had printed
`1` for three lines earlier. Re-run from a `.sh` under `/bin/bash` with `P=(…)` and `"${P[@]}"`, the
sweep is `0` for the merged sha and `1` for every later S02 commit.
**Why this door is worse than the cluster-command door at `:2092`:** a guard that reads `1` when it
should read `0` fails LOUDLY and someone investigates. A reviewer's probe that reads `0` when it
should read `1` produces a *finding against another seat* — "F1 is not reproducible, the arm is clean
against every ref" — and the seat whose measurement was correct pays for it. The tell was an internal
contradiction inside my own transcript, not an error message.
**Rule:** any probe whose output is a NUMBER runs from a `.sh` under `/bin/bash` with array
pathspecs. COMMON §10.21 already says this for greps that count; it is not about greps, it is about
counts. And when a probe contradicts a finding you are reviewing, re-run it the other way before you
write it down — a refutation is a claim and carries the same evidence bar as an assertion.

### Cheap: a mutant is 4× cheaper against the CASE's file than against the cluster command
`CMD-C7` (six render files + `t9` + `pnpm typecheck`) is ~9 s; `pnpm exec vitest run
tests/render/consent-guards.test.tsx` is ~2 s, and it carries the whole frame a mutant is evidence
for. 22 mutants × 7 s is 2.5 min and a third of the output tokens. Run the CLUSTER command ×3 as the
gate the plan names; run each MUTANT against the smallest file that carries its case.
Corollary for macOS/zsh: `${PIPESTATUS[0]}` is empty in zsh (it is `$pipestatus[1]`), so an
exit-code capture written the GNU way prints `exit=` and reads as "no output" rather than "wrong shell".

### 2026-09-07 04:05 — DEDUPE NOTE (orchestrator, from CODE-REV-S01-C7 r1 N4): the "macOS cat has no -A" entry appears twice in this file
Both entries say the same thing; the LATER one is the duplicate (the append ritual had no dedupe step). Rule for every future append: `grep -n -i '<the entry's key phrase>' .hermes/TOOLING-TRAPS.md` FIRST; if it exists, append a dated cross-reference, not a second entry. No lines above are edited (append-only law).

### 2026-09-07 04:25 — CODE-S02-C9: the promoted probe-runner config at `:2306` needs the LANE's alias list, not just `react`/`react-dom`
Cross-reference, not a second entry: `:2306`'s remedy (a scratchpad-owned `--config` whose `include`
names the probe) is correct and is what I used. What it does not say is that the runner's `resolve.alias`
must MIRROR the lane's own `vitest.config.ts`. The promoted template
(`probes/code-rev-s01-c6-r2-probe-runner.config.ts`) aliases only the probe's relative specifiers plus
`react`/`react-dom`, because S01's probe imported modules with no path alias. `code-rev-s02-c7-r1-probe.test.tsx`
imports `SignUpFlow.tsx`, which imports `@/components/AuthShell`, `@/components/consent/PrivacyPolicyModal`
and `@/lib/api`. The run then dies at TRANSFORM time:

```
 FAIL  probes/code-rev-s02-c7-r1-probe.test.tsx [ probes/code-rev-s02-c7-r1-probe.test.tsx ]
Error: Failed to resolve import "@/components/AuthShell" from "apps/ui/components/SignUpFlow.tsx". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

**Why it costs a round if you skim it:** the summary reads `Tests  no tests`, which looks like the
`No test files found` FILTER problem `:2306` is about, so the instinct is to fix `include` — which is
already right. The real fix is four more alias entries copied from the lane's `vitest.config.ts`:
`next/headers`, `next/navigation`, `@` -> `$LANE/apps/ui`, plus `react-dom/client`. **Rule:** a
scratchpad probe-runner starts as a COPY of the lane's `vitest.config.ts` alias array with
`import.meta.dirname` replaced by `$LANE`, and only then adds the probe's own relative specifiers.
Classify by CAUSE first (COMMON §10.17): a resolve error inside a PRODUCT file is a runner-config
defect; `No test files found` is an `include`/filter defect. Cost here: one wasted run, ~2 min.

### 2026-09-07 — CODE-REV-S02-C9 r1: re-deriving a JS `Math.round` ladder in PYTHON gives a different number at every exact `.5` tie
**Cross-reference to `:2269`, not a second entry.** That entry is about two spellings of `1 - α`
*inside JS*. This is the same tie arriving from the other side: a reviewer who re-derives the ladder
in another language to get INDEPENDENT evidence. Python's `round()` is **banker's rounding**
(round-half-to-EVEN); JavaScript's `Math.round` is **round-half-UP**. The `.70` Terracotta rung is an
exact tie — `0.70*38 + (1-0.70)*233 === 96.5`:

```
python3 -c "print(round(96.5))"      -> 96      => ratio 5.6077, prints "5.61"
node    -e "console.log(Math.round(96.5))" -> 97 => ratio 5.5450, prints "5.54"
```

**Why it costs a ROUND and not a minute:** `5.61` is the exact wrong number a previous review found
written in prose (`CODE-REV-S02-C8-r1` B1), so the Python result arrives wearing the fingerprint of a
known real regression. A reviewer holding "the suite asserts 5.54, my independent derivation says
5.61, and 5.61 is the number that was wrong before" has a fully-formed, completely false B-finding.
**Remedy:** in Python use `math.floor(x + 0.5)`, never `round()`, when reproducing JS `Math.round`;
and **state the rounding MODE beside any re-derived constant** — a cross-language re-derivation is not
independent evidence until the modes match. Cost here: ~6 min and one near-miss finding.

### 2026-09-07 — CODE-REV-S02-C9 r1: a scratchpad-rooted probe runner resolves ALIASED specifiers but not BARE package names
**Cross-reference to `:2440` (which is itself a cross-reference to `:2306`).** `:2440`'s rule — copy
the lane's `vitest.config.ts` alias array with `import.meta.dirname` replaced by `$LANE` — is correct
and sufficient for `@`, `react`, `react-dom`, `next/*`. It does NOT cover a **bare package specifier
the PROBE ITSELF imports**. A probe that does `import { JSDOM } from "jsdom"` dies at transform time:

```
Error: Failed to resolve import "jsdom" from ".../code-rev-s02-c9-r1-crossslice.probe.test.tsx"
 Test Files  1 failed (1)
      Tests  no tests
```

because the runner's `root` is the scratchpad and node resolution starts THERE, not in the lane —
`jsdom` is a lane devDependency and there is no `node_modules` above the scratchpad. Same
`Tests no tests` summary as the `include` problem at `:2306`, same skim-trap, different cause.
**Remedy — do NOT add a `jsdom` alias:** a probe with `// @vitest-environment jsdom` is ALREADY
running inside jsdom, so the ambient document is the parser. Append a `<style>` to `document.head`,
read `document.styleSheets[document.styleSheets.length - 1]`, then `style.remove()`. For any OTHER
bare devDependency, alias it to `resolve(LANE, "node_modules/<pkg>")` in the runner. Cost: one wasted
run, ~1 min. **Rule (extending `:2440`): the runner mirrors the lane's aliases AND every bare
specifier the probe imports; classify by CAUSE (COMMON §10.17) — a resolve failure naming a PACKAGE is
a root/resolution defect, one naming a PATH ALIAS is a missing alias, `No test files found` is
`include`.**

**Third, folded in here rather than filed again — `:873` / `:1580` already own the class.** Their
remedies are avoidance ("run from the git root", "list with no pathspec, then grep"). The POSITIVE
proof they do not give, for the specific claim "this named file is byte-identical across two commits",
is `git rev-parse <rev>:<repo-relative-path>` on both revisions and compare the BLOB HASHES: a wrong
path makes it FAIL LOUDLY (`fatal: path ... does not exist`) instead of agreeing with you, which is
exactly what `git diff --quiet -- <wrong-path>` does at exit 0. I ran a whole deletion sweep that
reported "no deletions" in three files, vacuously, before catching it.

## 2026-09-07 — CODE-CROSS-01 (Claude Opus 5, mission `consent-ui`, coding, the V-22 cross-slice change)

### A precedence stated in a V row, a review remedy and a packet is still an UNMEASURED design — and three copies of it read as corroboration
V-22's default, `CODE-REV-S01-C6 r1`'s BINDING remedy and packet `CODE-CROSS-01.md` §2.1 all word the
new focus-return rule the same way: *"focus the named control if it is on the page, else the original
opener"*. Implemented literally it takes a PRE-EXISTING case RED —
`consent-policy-link.test.tsx:308 "returns focus to the Settings opener when the card closes"`, received
`Choose what to store`, expected `Cookie preferences` — because the OTHER slice's requirement (S01-R14:
the bar returns whenever no valid decision is stored, from EITHER entry) puts the named control back on
the page for an entry the row believed it could not reach. The packet even asserts the safety as a fact
("For the Settings entry the ref is null/disconnected"), and its own gate sentence ("Keep the Settings
direction green") contradicts its mechanism sentence. The r1 reviewer HAD measured — but measured the
easy half (is the ref attached and connected at cleanup? yes) and stated the ORDER as though it followed.
**Rules this creates.** (1) When a row's default or a remedy names an ORDER OF PREFERENCE, it carries the
case analysis that order implies — one line per reachable combination — or it is marked `ORDER
UNMEASURED`; here that is four lines (bar/Settings × stored/not stored) and the third line is the defect.
(2) Three documents agreeing is not three measurements when two of them copied the first. (3) The thing
that caught it was running the WHOLE FILE rather than the new case: never narrow a cluster command to the
case under construction.

### A one-word JSDoc addition trips a source-text guard that bans a COMMON English word
`tests/render/consent-card.test.tsx:491` asserts `/\bdocument\b/.test(CookiePreferencesCard.tsx source)`
is `false` — the token is banned because the card must not reach the page-wide object. A new prop's JSDoc
saying "…while the node it names is in the document" is one hit, and the failure reads
`the card reaches the document: expected true to be false`, which sounds like a behavioural regression and
is a comment. This is the `COMMON.md` §8 family (`CODE-S01-C5` F1's `.focus()` JSDoc, `CODE-S02-C7`'s
`<form>` inside a JSX comment) arriving through an ORDINARY WORD rather than a code token — the previous
members were all spellings a reader would recognise as code. **Rule: before adding a comment to any file
under `apps/ui/components/consent/`, run the banned-token sweep for that file — the tokens differ per
file** (`CookiePreferencesCard.tsx` also bans `\bdocument\b`, `CookieBar.tsx` does not) — and prefer
"on the page" to "in the document" in prose there. Cost here: one 10.6s 16-file run, ~2 min.

### A guard whose two branches are observationally identical can only be pinned by a spy — say so in the case
`focusElement(detachedNode)` and `focusElement(null)` leave `document.activeElement` byte-identical in
jsdom (and in a browser): focusing a node that has left the page is a no-op. So an `isConnected` guard on
a candidate that has NO fallback behind it cannot be discriminated behaviourally, and a case that asserts
only on `document.activeElement` passes against the mutant. The honest pin is `vi.spyOn(node, "focus")`
plus an assertion that it was never called — and the case must SAY that the spy is the discriminator, or
the next reviewer reads it as an accidental assert-on-a-mock. Measured: the mutant that drops the guard is
caught by exactly that case and by nothing else in a 38-case suite.

### A test that exercises a NEW optional member is GREEN at base for the wrong reason, and that is not a RED
A case asserting "the helper does X with `returnFocusRef`" passes against a base helper that reads no such
member at all, whenever X's expected outcome coincides with the base's fallback. Its lawful RED is the
MUTANT, not the base, and the difference has to be declared: `heartbeat-protocol` §2.5's "reproduce first"
is satisfied by the mutant RED here, and a handoff that folds such a case into a base-RED claim is
overstating its evidence. Two of this seat's four new cases were base-RED; two were mutant-RED, and the
handoff separates them.

### 2026-09-07 05:30 — CODE-REV-CROSS-01 r1: `grep '^[-+]export'` is not a signature-change probe
A review packet asked for the helper's contract change to be ruled on with
`git diff <base> <head> -- <file> | grep '^[-+]export'`. That command printed NOTHING for a commit that
DID change the contract: the added member sits inside a `type X = Readonly<{ … }>` body, and no line in a
type body carries an `export` prefix. **The same empty output means "no signature changed" and "a member
was added to an exported type"**, so the probe cannot tell a pass from its own blind spot. Rule the
contract on a comment-stripped structural diff of the whole file (strip `/* */` and `//`, collapse blank
lines, `diff -u`) or on `tsc --declaration --emitDeclarationOnly` for both revisions — and print the type
BODIES side by side, never just the `export` lines. Cost here: nil, because the type bodies were printed
anyway; the cost if they had not been is a wrong PASS on the one thing the ticket existed to check.

### 2026-09-07 05:30 — CODE-REV-CROSS-01 r1: COMMON §10.35's pre-copy grep matches its own compliance note
§10.35 says a promoting seat greps its probe kit for `\.worktrees/` before copying. A kit that is fully
compliant still returns hits — from the COMMENT in which the author records the compliance
(`# Lane from argv (COMMON 10.35: no hard-coded .worktrees/ path)`). A `grep … && echo FOUND || echo clean`
guard around it therefore reports FOUND on a clean kit, and a seat that trusts the guard will not promote a
kit it should promote (or, worse, will delete the honest comment to make the grep quiet). COMMON §8's
family — a grep does not know what a comment is — arriving in a HYGIENE gate rather than in a product
guard. Use a comment-excluding form (`grep -vE ':\s*(#|//|\*|/\*)'`) and paste the surviving hits, or grep
for an actual path shape (`/\.worktrees/[a-z0-9-]+/dialectical-engine`) instead of the bare substring.

### 2026-09-07 05:35 — CODE-CROSS-02: `zsh script.sh` is NOT the "inline" arm of COMMON §10.16
Corollary of the entry at `:1268-1290`, which records that the tool shell's `grep` is ugrep 7.8.4
supplied as a shell FUNCTION from `~/.claude/shell-snapshots/snapshot-zsh-*.sh`. A function is not
inherited by any child shell, **its own shell included**: running the same verification file as
`zsh verify.sh` printed `grep (BSD grep, GNU compatible) 2.6.0-FreeBSD` in its header, identical to
the `/bin/bash verify.sh` arm. Three "inline" runs done that way are three MORE script runs, and the
ugrep direction of §10.16 (`:1984` — patterns BSD grep accepts and ugrep refuses) stays untested
while the handoff claims both arms. Measured here: `grep --version` in the tool call itself printed
ugrep 7.8.4; the same command inside a script under either shell printed BSD grep. **The inline arm
is the guard's own terms typed into the tool call** — capture the vitest output once, then run each
`grep -qE` term against it in the call, plus one known-GOOD and one known-BAD literal per term. Cost
here: three redundant runs (~90s) and a near-miss on a handoff sentence that would have been false.

### 2026-09-07 05:35 — CODE-CROSS-02: a promoted probe that pins a DEFECT must go RED when the defect is fixed
COMMON §10.10 ("a finding proved by a probe is discharged only by re-running that probe against the
fix") does not say which DIRECTION each case should move, and for a probe written to DEMONSTRATE a
defect the direction is inverted: `probes/code-rev-s02-c9-r1-crossslice.probe.test.tsx` asserts, in
its P7, `expect(policy(), "the policy the visitor is looking at is still open").not.toBeNull()` —
the aftermath of the bug. Against the fix it goes RED (`1 failed | 6 passed (7)`), and that red IS
the discharge. Its P4, meanwhile, was reduced to a `console.log` before promotion, so the assertion
the verdict quotes as RED-at-base (`the cookie card is the one left: expected null not to be null`)
is not in the promoted file at all and the whole kit is `7 passed (7)` at the base commit — a packet
that names "P4 RED at base, GREEN after" as the oracle is naming something that cannot happen. Rule:
**a packet that names a probe as an oracle states the expected direction PER CASE, and a promoting
seat keeps the RED assertion or records in the file that it was replaced.** Read the probe's
diagnostic lines as the oracle when its assertions were softened: here `P4 03 after ONE Escape:
card=false policyBezel=true` at base became `card=true policyBezel=false` after, which is the finding
discharged in one line. Cost here: ~10 minutes and one wrong expectation carried into a heartbeat.

### 2026-09-07 06:00 — CODE-REV-CROSS-02 r1: the declaration-emit contract probe needs `--ignoreConfig`, and its `TS2307` is harmless
**Cross-reference to `:2565-2578`, not a second entry.** That entry (CODE-REV-CROSS-01 r1) rules
`grep '^[-+]export'` blind and prescribes `tsc --declaration --emitDeclarationOnly` for both revisions as
the remedy. Running that remedy as written fails twice before it works, and both failures look like the
probe's fault rather than the invocation's:

```
$ npx tsc --declaration --emitDeclarationOnly --removeComments --outDir <out> <file>.ts
error TS5112: tsconfig.json is present but will not be loaded if files are specified on commandline.
             Use '--ignoreConfig' to skip this error.
```
Nothing is emitted, so the next step (`cat` the `.d.ts`) reports `No such file or directory` and reads as
"the probe produced nothing". **Add `--ignoreConfig`.** Then, with the two revisions copied OUTSIDE the
lane (which is the point — they must not be written into the tree under review):

```
<file>.ts(15,24): error TS2307: Cannot find module 'react' or its corresponding type declarations.
```
**That error is harmless and must not be chased.** `React` appears only in TYPE positions
(`React.RefObject<HTMLElement | null>`), and declaration emit prints those specifiers verbatim, so the
`.d.ts` files are complete and the two revisions are still compared like for like. Measured on
`apps/ui/components/consent/modalSemantics.ts` at `bd314084` vs `c334136d`: both emit the identical
five-member surface including the full `type ModalSurface = Readonly<{ … }>` body, and `diff` is empty.

Working invocation, per revision:
```
git show <rev>:<path> > <scratch>/<rev>/<name>.ts
npx tsc --ignoreConfig --declaration --emitDeclarationOnly --removeComments \
        --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --strict \
        --outDir <scratch>/<rev>-out <scratch>/<rev>/<name>.ts
diff <scratch>/base-out/<name>.d.ts <scratch>/head-out/<name>.d.ts
```
Cost here: two wasted calls. The cost of NOT recording it is higher than it looks — `:2565` makes this
probe the MANDATED way to rule on a contract change, so every future seat that obeys it walks into the
same two errors, and the second one (`TS2307`) invites a seat to start aliasing `react` into a throwaway
config, which is 15 minutes for nothing.

## [CODE-CROSS-03, 4ef2f7d3]

### "TOOLING-TRAPS at dispatch: N lines — read everything past that line" is discharged by `wc -l`, and it displaces reading the file
COMMON §10.60/§10.66 tell a packet to pin the TRAPS line count at dispatch and tell the seat to read
everything past it. In `CODE-CROSS-03.md:6` that was the ONLY TRAPS sentence in the packet, the file had
not grown (2651 at dispatch, 2651 at CLAIM), so "everything past that line" was the empty set and I
discharged the whole TRAPS duty with one `wc -l`. **I then paid, in full, for the trap recorded at
`:2537-2545`** — a one-word JSDoc addition tripping `consent-card.test.tsx:491`'s `\bdocument\b` ban — and
independently re-derived that entry's own remedy ("prefer 'on the page' to 'in the document'"). Price: one
16-file gate cycle plus the class sweep, ~6-8 minutes, for knowledge that was already on disk.
`heartbeat-worker` §6 does say "read `.hermes/TOOLING-TRAPS.md` before you start", but a seat reads its
PACKET top-down and obeys the most specific instruction it finds, and §0 is declared to override the
documents it lists. **Rule: a packet's TRAPS line reads "read the file IN FULL at CLAIM; re-read
everything past line N at handoff." The delta is the HANDOFF obligation — it exists to catch a file
growing under a running seat — and it is not a substitute for the CLAIM read.** Second remedy, cheaper:
this file needs a 20-line index at the top, grouped by subject (grep/locale · git restore · vitest ·
source-text guards · jsdom · board CLI), so "read the file" becomes "read the index, then the four entries
that touch my files". One seat-hour once; every seat after it pays less than I did.

### The consent directory's banned-token guards: three of them, three different needle sets, over overlapping file sets
Extends `:2537` ("the tokens differ per file") with the matrix, because the differences are not only
per-file — the SAME token is banned in two different SPELLINGS by two guards that both scan
`CookiePreferencesCard.tsx`. Measured at `4ef2f7d3`:

| guard | files it scans | needles | direction |
|---|---|---|---|
| `tests/render/consent-card.test.tsx:489-492` | `CookiePreferencesCard.tsx` only | `addEventListener` · `.focus()` · `/\bdocument\b/` · `/["']Escape["']/` | ABSENT |
| `tests/render/consent-policy-link.test.tsx:384-391` | `CookiePreferencesCard.tsx` + `CookieConsent.tsx` | `addEventListener` · `.focus()` · **`Escape` as a BARE substring** | ABSENT |
| `tests/render/consent-guards.test.tsx` S01-S45 arm 1 | every `consent/*.ts(x)` except `modalSemantics.ts`, listed from the DIRECTORY | `addEventListener("keydown"` · `addEventListener('keydown'` · `"Escape"` · `'Escape'` · `.focus()` | ABSENT |
| `tests/render/consent-guards.test.tsx` S01-S45 arm 2 | `modalSemantics.ts` | the same three | **PRESENT** |

So the bare word `Escape` in a comment is legal under guards 1 and 3 and illegal under guard 2; the word
`document` is illegal under guard 1 alone; `modalSemantics.ts` is the one file where their absence FAILS
the suite. **`run_c9`'s ten files include none of the three guard suites** — the break surfaces only in
`CMD-C7` and in the BASELINE SET. Repo-level remedy: guard 3 already derives its file list from the
directory (S01-S42); hoist all three needle sets into one exported constant under `tests/support/` — the
move this commit just made for the four CSS markers — so a packet can quote ONE fact.

### Mutation-test a TEXT-SCANNING test without mutating the file it scans
A test whose subject is file TEXT (a stylesheet's block markers, a source-text guard) does not need that
file mutated to be mutation-tested: re-run its PREDICATE over a mutated STRING. I had to prove "under
mutant GX3 (S02's `globals.css` block nested inside S01's), `consent-bar`'s relaxed case stays GREEN and
`consent-s02-style-contract`'s S02-S59 REDs on `after.trim()`" before writing that sentence into two test
comments — but `apps/ui/app/globals.css` was in my packet's `forbidden` list. A ~30-line node script read
the file READ-ONLY, built the GX3 arrangement in memory, and re-implemented both cases' predicates:
```
--- HEAD (control)                 consent-bar: GREEN   style-contract S02-S59: GREEN
--- GX3 (S02 nested inside S01)    consent-bar: GREEN   style-contract S02-S59: RED  (after.trim() !== "")
```
Three minutes, zero writes to the lane, and it reproduced `CODE-REV-S02-C9 r1` N4's GX3 result exactly.
**This removes the most common reason a seat reaches outside its `allowed` list**, and it is strictly
safer than `cp`-snapshot-and-restore because nothing is ever written.

### `Node.contains` is REFLEXIVE; `compareDocumentPosition` + `CONTAINED_BY` is not — and "descendant" means the second
`a.contains(a)` is `true`; `a.compareDocumentPosition(a)` is `0`, so the `DOCUMENT_POSITION_CONTAINED_BY`
bit is clear. Any rule worded "X only when it is a **DESCENDANT** of Y" that is then implemented as
`y.contains(x)` silently also fires when `x === y`. Hit in `CODE-CROSS-03.md:8`, which prescribes
`incumbent.contains(lower)` for a tiebreak whose ruling says "descendant", while the reviewer who measured
the rival (`CODE-REV-CROSS-02 r1` N2) used `CONTAINED_BY`. Consequence in `topmostSurface()`: two stack
entries sharing ONE container node would let the EARLIER-registered one win, inverting open order for a
shape the fix exists to protect. Unreachable in this product (two consumers, two containers) and reported
rather than patched, because the packet grants no test case to pin the identity guard. **Rule: when a
packet swaps the API in a measured remedy, it re-states the boundary case the swap changes — reflexivity,
`null` handling, and short-circuiting are where two "equivalent" DOM predicates differ.**

## [CODE-REV-CROSS-03, 4ef2f7d3]

### 2026-09-07 — a "skip this section until later" instruction with NO LINE RANGE cannot be obeyed, and I broke both of mine
COMMON §10.54 and §10.65 tell a review packet to name the sections a blind lens must not read yet —
BASELINE's `CLAIMED — UNVERIFIED` block, a seat-under-review's own `[<seat>, <commit>]` TRAPS entries.
`CODE-REV-CROSS-03-R1.md:5` and `:23` name both correctly and give **no line numbers**. Both files are
append-only, so **the boundary of the section you must skip is discoverable only by reading past it**.
I read `BASELINE.md` top-to-bottom (52 lines) and saw the author's `195/195` before I had measured
anything; I read this file in full as §10.67 orders and reached `:2653` the same way. The instruction
is not merely hard — it is *unsatisfiable by a reader who does not already know the answer*, which is
this file's oldest class (variant 1: a check that cannot see its own target) pointed at a human.
**Two remedies, both one line.** (1) Every skip instruction carries a `grep -n`-measured range —
"skip `BASELINE.md:49-51`", "skip `TOOLING-TRAPS.md:2653-2716`" — which is §10.24's rule applied to
an exclusion instead of a citation. (2) Better, for BASELINE: the orchestrator writes that block, so
it can write it into a sibling file (`BASELINE-CLAIMED.md`) the review packet simply does not list.
**A section that must not be read should not live in a file that must be read.**
Containment that saved this round: §10.52's ordering. My probe was written, run ×3, mutated for its
remedy and written to disk *before* either section was opened, so the finding is independent and the
exposure is disclosed in the verdict rather than hidden. Blindness held by ordering, not by design.

### 2026-09-07 — CROSS-REFERENCE to `:2706` (`Node.contains` is REFLEXIVE), not a second entry: what the identity case actually DOES
`:2706` (CODE-CROSS-03's own entry) states the mechanism correctly and calls the consequence
"two stack entries sharing ONE container node would let the EARLIER-registered one win". **Measured
here with a probe, three runs, registration order asserted rather than assumed — it is worse than a
single swap.** With TWO sharers the earlier one wins; with THREE, pass 2 keeps matching reflexively
and reassigning `topContainer` to the same node, so it walks past both and delivers `Escape` to the
**earliest-registered** entry — the bottom of the group, not the one below the top:
```
P3 (two sharers, [first, second])  firstClose=1 secondClose=0     rule requires second
P4 (three sharers, [a, b, c])      closed=["a"]                   rule requires ["c"]
```
Controls in the same probe (two unrelated containers; a strict descendant; a shared pair plus a real
descendant) all behave correctly, so the harness discriminates. **The remedy is one token and costs
nothing**: `if (container === topContainer || !topContainer.contains(container)) continue;` takes the
probe from `2 failed | 4 passed (6)` to `6 passed (6)` and leaves the whole consent SET at
`Test Files 17 passed (17) / Tests 195 passed (195)`.
**The rule worth keeping is about EVIDENCE, not about the DOM:** `:2706` was written from the API
docs and was right; it still could not say whether the inversion was one step or a walk, and the tier
ruling turns on exactly that. **A reflexivity/`null`/short-circuit divergence between two "equivalent"
predicates is cheap to reason about and cheaper to RUN — and only the run tells you how far it goes.**

### 2026-09-07 — an artifact that states its own PIN COUNT is refuted by the very mutant that establishes the pins
ADR-0022's (b′) addendum says the tiebreak is *"Pinned by four cases in
`tests/render/consent-modal-semantics.test.tsx`"* and names them. The mutant that removes the tiebreak
reds **three**:
```
M1-NO-TIEBREAK | exit=1 | CAUGHT | Tests  3 failed | 30 passed (33)
```
The fourth — "a nested inner surface that opened in a LATER commit" — is green with the tiebreak gone,
correctly, because there the inner surface is already the last registered and plain open order reaches
it. The test file's own comment says so (*"Nesting neither helps nor hinders it"*); only the ADR
overstates. Neither the author's charge list nor mine asked anyone to compare the two.
**The check is free and belongs in every review that runs a removal mutant: hold the mutant's RED LIST
beside every sentence in the artifacts that claims coverage, and require the two to be the same set.**
Same family as this file's `head -10` / "9 of 9" / `head -4` entries — *a tool or a document describing
its own reach in the voice of the whole* — arriving in an ADR, where it is worse than in a script,
because an ADR is the specification the NEXT implementation is written from (here `A11Y-OVERLAYS`,
`t_8962842f`, seven overlays). A wrong coverage sentence invites a future seat to delete a case that
is load-bearing, or to keep one that is not.

### 2026-09-07 — a guard term in PRODUCT code that cannot fail, found by a mutant nobody charged
`modalSemantics.ts:191` reads `if (container === null || !container.isConnected) continue;` inside the
tiebreak pass. The `!container.isConnected` half is **unreachable**: that pass runs only while
`topContainer !== null`, and a non-null `topContainer` was selected by `container === null ||
container.isConnected`, so it IS connected — and every node a connected element `contains()` is
connected. Removing the term survives the whole suite:
```
M6-PASS2-KEEPS-DETACHED | exit=0 | SURVIVED | Tests  33 passed (33)
```
This file has six recorded variants of "an acceptance command that looks like verification and
verifies nothing". **This is that class inside the product**: a defensive clause that reads as a
safety net, is covered by no test, and cannot be covered by one. It is harmless here and the point is
the METHOD, which cost one mutant: *for each `||`/`&&` term in a guard, ask what the CALLER's
precondition already implies; if the term is implied, no fixture exists and writing one is a wasted
round.* Do not "add a test for it" — either delete it, or write the implication into the comment so
the next reader stops. Related: `:2549` (a guard whose two branches are observationally identical can
only be pinned by a spy) is the sibling case where a fixture DOES exist but not a behavioural one.

### 2026-09-07 — three small ones, each paid for once this session
* **A background `for` loop's log file is not final until the task notification arrives.** I diffed
  run 3 of a three-run gate against run 1 while run 3 was still being written, and the diff read as a
  20-line truncation — i.e. as a *different result on the worst run*, which is exactly the signal the
  three-run law exists to catch. Third recurrence of `:90` ("read the clock on your evidence"), in a
  new door: the evidence was not stale, it was **unfinished**. Wait for the notification, or `wc -l`
  the log against its siblings before comparing.
* **`grep -c '\"Escape\"'` inside a `"$( … )"` gives 0 for a needle that is present.** The escapes
  survive into the pattern, so grep looks for a literal backslash. The tell is a 0 next to a suite
  that passes a guard requiring the token PRESENT. Use `grep -c '"Escape"'` in single quotes with no
  escaping, and never build a quoted needle inside a double-quoted command substitution. Same family
  as `:2369` (zsh runs backticks inside a double-quoted board body): **the shell rewrites your
  pattern before the tool sees it, and the tool reports honestly on what it received.**
* **A review packet's `.review-scratch/` grant is superseded and still shipping in the template.**
  `:1785` and the 03:10 correction at `:2306` both establish that a probe cannot RUN from a lane's
  `.review-scratch/` and that the scratchpad-owned `--config` is the route; COMMON §10.46 says so too.
  Review packets still grant the lane path, whose only remaining effect is to invite files into the
  tree under review. I used the scratchpad route: lane `git status --porcelain` = 0 at CLAIM, after
  every mutant, and at exit. **Delete the grant from the template**, or a seat will obey it.

## [CODE-CROSS-03-REWORK-R1, 4cc0f4b6]

### The comment CURSOR cannot be counted from `hermes kanban show`'s human output — every grep over it is wrong
COMMON §10.56 says the cursor is measured at POSTING time and does not say WITH WHAT, so a seat
reaches for the obvious `k show <ticket> | grep -c '^  \['`. That count is wrong in two directions
at once, measured here on `t_ed4c5e73`:
* the human output ends with an AUDIT LOG whose lines have the same `  [YYYY-MM-DD HH:MM] ` shape
  (`commented {...}`, `created {...}`), so they are counted as comments — my `grep -c '^  \[20'`
  returned **17** against **9** real comments;
* a comment whose first line WRAPS contributes a bare `  [` continuation line, and a header that
  says `Comments (6)` is the only trustworthy thing on screen — and it is not greppable as a number.
The correct probe is the JSON one, and it belongs in COMMON §10.56 as a literal command:
```
~/.local/bin/hermes kanban --board <b> show <ticket> --json | python3 -c "import json,sys; print(len(json.load(sys.stdin)['comments']))"
```
**Cost here: a HEARTBEAT posted with `comments read through: 7` when the ticket held 8, and — worse —
a comment (`ORCHESTRATOR VERDICT CONSUMED`) that landed between my `k show` and my CLAIM post and
was therefore never in my count.** Nothing was lost because I re-read it minutes later, but "the
board is the state" (`heartbeat-protocol` §2.4) is enforced by a number every seat computes with a
broken tool. Cross-reference, not a second entry: `:1058` records the `list --json` vs `show --json`
SHAPE difference; this is about COUNTING with the non-JSON output at all.

### Two test cases that go RED under the same mutant are not necessarily redundant — build the mutant that SEPARATES them
The packet made my second case ("three surfaces sharing one container" beside "two surfaces sharing
one container") optional, and both go red under the obvious mutant (the identity term removed), so
the second one reads as scroll. Before deleting it I built the mutant that discriminates: **the
identity guard applied on the FIRST pass-2 iteration only.** With TWO sharers pass 2 runs exactly
once, so that half-fix is GREEN against the pair; with THREE it is wrong. Measured, same file, same
run:
```
M1 identity term removed          | CAUGHT | Tests  2 failed | 33 passed (35)   <- both cases
M4 identity guarded on iteration 1| CAUGHT | Tests  1 failed | 34 passed (35)   <- the TRIPLE alone
```
**Rule: when two cases look redundant, do not argue — construct the mutant that separates them. If
none exists, delete one; if one exists, you have just written the sentence that justifies both.**
Cost: one 7-second run. This is the CONVERSE of `:1619` ("two remedies for one defect class can hide
each other — price each with the other removed"): there two fixes made one case look redundant, here
two cases looked redundant until a third mutant priced them apart. Same instrument, opposite
direction.

### A shape that cannot vary the OUTPUT cannot pin a second mechanism — and a packet can order the assertion anyway
`CODE-CROSS-03-REWORK-R1.md:21` charges "two surfaces sharing one container node -> the last-opened
answers `Escape` **and traps Tab**". The Tab half pins NOTHING and cannot: `trapTab(entry)` builds
its candidate list from `entry.read().containerRef.current`, and when both entries hold the SAME
node the list is byte-identical whichever entry `topmostSurface()` returned. No mutation of the
tiebreak can move it. The reviewer's own probe says so in its P5 comment — that case exists to
DEMONSTRATE that Tab is not a second ranking, not to pin one — and the packet quoted the probe as
its oracle without carrying that sentence.
**Rule, extending `:2600`/`:1254` (a probe cited as an oracle is READ to its assertions first):
read it to its COMMENTS too. A demonstration case and a pinning case are indistinguishable from
their names, and a packet that promotes the first into a charge orders a green assertion with no
discriminating mutant** — the acceptance-defect family arriving inside a TEST instead of a command.
The honest move is `heartbeat-worker` §2's: say the assertion pins nothing and do not ship it. I
recorded the omission in the case body so the next reader does not "fix" it back in.

### `CMD-C6`'s verdict is legitimately `1` for the whole working-tree phase of an S02 lane
`CMD-C6`'s `s02` arm is `git diff --stat HEAD -- <the four S02-owned paths>` and it exists to catch
S01 editing S02's files. Run inside `.worktrees/consent-s02` while a coding seat's own work is
uncommitted, those paths are exactly what is modified, so the arm is non-empty and the whole
command prints `verdict=1` — measured here, `working-tree diff: ' .../modalSemantics.ts | 31 ++++...'`.
The instant the work is COMMITTED the diff goes empty and the verdict is `0`
(`4cc0f4b6`: `verdict=0 ... working-tree diff: 'none'`). A packet that lists `CMD-C6` for an S02
seat should say this, because "a gate is red" is exactly the shape of a `BLOCKED`. Related and
already recorded: in this lane BOTH of its S02 arms are then vacuous, since `slice/consent-s02`
resolves to HEAD (`t_38c6bbf2`).

## [CODE-REV-CROSS-03-r2, 4cc0f4b6]

### A "skip this until the appendix" instruction is defeated by the REVIEW PACKAGE, even when its line range is exact
**Cross-reference to `:2720-2736`, not a second entry.** That entry (my own seat's round 1) found
that a skip instruction with NO LINE RANGE is unsatisfiable, and COMMON §10.69 fixed it: skip
ranges are now `grep -n`-measured. Mine were **exact** — `ADR-0022:211-257` is precisely the
correction addendum, `:258` is `## Options considered`, `TOOLING-TRAPS:2816` is precisely the
author's heading, `S02/DECISIONS.md:217-219` is precisely the three rows. **And the ADR range was
still delivered to me before I measured anything, by the packet's own mandatory ONE Read of the
review package**: `review-packages/CROSS-03-r2.diff:140-185` is the hunk `@@ -201,20 +201,67 @@`,
whose added lines ARE new-file `:211-257`, byte for byte.
**The cause is a category error the §10.69 fix did not name.** An ADR addendum, a DECISIONS row and
a TRAPS entry are simultaneously (a) the author's CLAIM about the work and (b) the WORK ITSELF.
§10.52 treats them as (a); the review package treats them as (b); both are correct, so no skip list
can be consistent. **Rule: a deliverable that appears in the DIFF is WORK and is read. Only a
seat's REPORTS about the work — the ticket comment, the self-report, claimed figures — are the
appendix.** Delete ADRs, DECISIONS rows and product comments from every skip list.
**And the thing that actually preserved blindness here was not the skip list at all**: it was
§10.52's ORDERING — measure, write `<scratch>/MEASURED-FIRST.md` to disk, then open anything a seat
wrote. **A skip list is a promise; an ordering is a control**, and the ordering survives a wrong
skip list, a leaked file and a diff that quotes the author's prose — all three of which have now
happened in this mission.

### A mutant harness's `plant-landed` proves BYTES changed, never that the RUNTIME changed — and a no-op prints `SURVIVED`
**Cross-reference to `:1520` and `:1682`, adding the third member.** `:1682` is a mutant that
changed no bytes (perl codepoint vs UTF-8); `:1520` is one that changed bytes and no runtime value
(a `\uXXXX` the compiler decodes). **The third is a mutant that changes bytes, changes no
behaviour, and does it INSIDE a harness whose whole purpose is to catch that** — which is worse,
because the harness prints a reassuring line. Measured here: to test "the identity guard applied on
the FIRST pass-2 iteration only" I added a `firstPass2` local and forgot to put it in the
predicate. My harness's `filecmp` arm printed `plant-landed=True` and the run printed
`SURVIVED | Tests 28 passed (28)` — which reads exactly as "the three-sharer case is a duplicate of
the pair", the OPPOSITE of the truth (re-planted properly: `1 failed | 27 passed (28)`, the triple
alone).
**Rule: a harness must print the PLANTED REGION, not only a boolean.** `filecmp` answers "did the
file change"; the question is "did the program change", and no harness can answer that
automatically — but three lines of context around the replacement, pasted into the transcript,
makes a human answer it in one second. `:2330`'s rule ("treat any mutant run whose result equals
the unmutated baseline as UNPROVEN until `diff` has been shown non-empty in the same output") is
necessary and, as this shows, **not sufficient**.

### A rework packet that scopes a CLASS by ENUMERATION ships green with the class still open
**Cross-reference to `:1091`, from the other side.** `:1091` is the finding-receiver's lesson (the
class a reviewer names usually has members the reviewer did not see). This is the PACKET's:
`CODE-CROSS-03-REWORK-R1.md:9` listed the class members by name ("the helper's doc comment …, the
second-pass comment, ADR-0022's (b′) addendum …, and the `CookieConsent.tsx` sentence"). The author
swept BETTER than the list — their own `grep -rn 'Node\.contains|\.contains\('` and
`grep -rni descendant` found a fifth member the list omitted and correctly left a sixth alone —
**and the class was still open at HEAD**, because those patterns are aimed at the CONTAINMENT class
while the SECOND finding they were discharging (an ADR overstating its own pin count) belongs to a
different class: *an artifact stating its own coverage without running the mutant that would
establish it.* `ADR-0022:119-120` is a member of that class, four screens above the one everybody
was sent to, and it is measurably wrong (measured: 3 cases and 2, not "four … and one").
**Rule: a packet states a class as a GREPPABLE PROPERTY and orders the sweep to be PASTED — never
as a member list. When a list is unavoidable it is labelled `SAMPLE, not exhaustive`.** A seat
obeying an exhaustive list has no way to discover that the list is the wrong shape, and neither
does its reviewer without re-deriving the property.

### A proof written into a comment is invalidated by an edit to the LINE IT DEFERS TO, and nothing flags it
CODE-REV-CROSS-03 r1's N2 proved that `modalSemantics.ts`'s `!container.isConnected` disjunct is
unreachable, and the proof's last step is *"…so a disconnected `container` already fails THE NEXT
LINE."* The same commit that wrote the proof into the comment **changed that next line** (the
tiebreak gained its identity term). The proof still holds — I re-derived it rather than
transcribing it, and so did the author — but it holds for a new reason, and nothing in the harness
would have said a word if it had not: no test can fail, because the branch is unreachable in both
versions.
**Rule: a comment that proves something about a NEIGHBOURING line names that line's content in the
proof, and any edit to that line re-runs the derivation.** The cheap form is to state the
implication rather than the location — "a disconnected container is not `===` a connected
`topContainer` and is not `contains()`ed by one" survives the edit; "already fails the next line"
does not. Same family as `:329` (an acceptance pinned to absolute line numbers), arriving in a
PROOF instead of in a command, where the silent direction is the only direction.

### `$SHELL` names the LOGIN shell, so a script cannot report the interpreter it is running under
Small, and it cost a line of disclosure in another seat's handoff (`CODE-CROSS-03-REWORK-R1` F4): a
`gates.sh` header that prints `shell=$SHELL` prints `zsh` while genuinely running under
`/bin/bash`, which reads as a violation of COMMON §10.16's dual-shell rule. `$0` is unreliable
under `bash file.sh`, and `$BASH_VERSION` only answers one direction.
**Print a TOOL whose identity differs between the two shells instead** — `grep --version` gives
`grep (BSD grep, GNU compatible) 2.6.0-FreeBSD` in any script and `ugrep 7.8.4` in this harness's
tool call (`:2587`), which is the fact §10.16 actually cares about. My own `gates.sh` header does
this and it is one line.

## [GROK-REV-S01-10A, 4cc0f4b6]

### `FORCE_COLOR` wraps pnpm's `$ tsc --noEmit` echo, so every `n_tcran` arm is 0
S01's `CMD-C1`…`CMD-C7` all require `n_tcran=$(printf '%s\n' "$tc" | grep -cE '^\$ tsc --noEmit$')` equal to 1.
The Grok tool shell exports `FORCE_COLOR`; `pnpm typecheck` then prints
`\x1b[2m$ tsc --noEmit\x1b[22m` (CSI dim), and the anchored grep is 0 forever. Typecheck DID run
(`tt=1`, the eight `s14-ui.test.ts` diagnostics, `n_tc=0`). Symptom: every cluster command
`verdict=1` with `tsc ran: 0` while the vitest/hit-list/file-count arms are green. `NO_COLOR=1`
does **not** win: the process prints `The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env
being set.` **Fix:** `env -u FORCE_COLOR -u FORCE_COLOR_DEPTH NO_COLOR=1 /bin/bash CMD-C*.sh`.
Measured here ×3: with the wrap, verdict=1 on all seven; without it, verdict=0 on all seven.
Cost: one full 21-run table (~90s) plus a hexdump of the typecheck capture. Class: any guard that
fingerprints a pnpm script-echo line is ANSI-fragile in this harness. Same family as COMMON §10.16
(glyph / locale) arriving through colour, not through grep's `.`.

## [GROK-REV-S02-10C, 4cc0f4b6]

### jsdom's zeros satisfy the scroll-to-end gate at mount
`scrollTop + clientHeight >= scrollHeight - 8` with jsdom's three zeros is `0 >= -8`, true. A
probe that mounts `PrivacyPolicyModal` without stubbing those metrics on `HTMLElement.prototype`
**before the first render** sees `I have read it` enabled and `opacity` 1 (the `:disabled` rule
never applies). `Object.defineProperty` on the element is too late — the mount evaluation already
ran. Stub the prototype, restore with `delete`. Cost: two false RED probe runs.

### PLAN `run_c9` marker grep cannot see the closing delimiter
`grep -c -- '=== consent-ui S02 ==='` matches the opening `/* === consent-ui S02 === */` and not
`/* === end consent-ui S02 === */` (the `end ` sits inside the `===` pair). `--scrim:` is
MODE_INDEPENDENT, declared once in `:root` (`globals.css:65`), so that arm is 1 not 2. Both arms
RED at a correct merge. Ticket `t_4f97ca86`. Do not REWORK the product over this grep.

### A Grok-element packet that names `CODE-REV-<slice>-10C-*.md` matches nothing
Per-cluster verdicts are `CODE-REV-S02-C*.md` and `CODE-REV-CROSS-*.md`. Produce the glob from
`ls` at dispatch. Same class as COMMON §10.13 (a path that does not exist silently drops).

## [GROK-REV-S01-10B, 4cc0f4b6]

Cross-reference to `:2965` (`FORCE_COLOR` / `n_tcran`), not a second entry: reproduced independently on the 10b seat. Same 21-run table, same hexdump `\x1b[2m$ tsc --noEmit\x1b[22m`, same `env -u FORCE_COLOR` remedy (`verdict=0` ×3 on CMD-C1…C7).

Cross-reference to `:2995` (element-review glob matches nothing): `CODE-REV-S01-10B-*.md` is **0 files**. Actual names are `CODE-REV-S01-C*.md` and `CODE-REV-CROSS-*.md`. Produce the glob from `ls` at dispatch.

Cross-reference to `:2982` (jsdom zeros latch the scroll-to-end gate): reproduced on 10c opened from 10b's `Privacy notice`. Stub `HTMLElement.prototype` **before** the first render.

### jsdom reads custom properties and does not substitute `var()` onto used `backgroundColor`
Injecting `apps/ui/app/globals.css` as a `<style>` in the test's own document (CODE-REV-S02-C9 r1 P4) makes `getComputedStyle(document.documentElement).getPropertyValue('--shell')` return the declared hex (`#EFE9E0` / `#221D17`). `getComputedStyle(.consentCard).backgroundColor` stays `rgba(0, 0, 0, 0)` because jsdom does not resolve `background: var(--shell)`. Assert the declared token string and the `var(--token)` reference; used-pixel colour is V's browser QA. Cost: two false RED probe runs.

## vitest summary line shapes (2026-09-09, ARCH-S01 F8)
- `Tests  2 failed (2)` has NO passed field when nothing passes; `Tests  8 passed (8)` has no failed field; `Tests  2 failed | 7 passed (9)` has both. A parser that defaults only one field reads a 0-passed suite as `passed=` (empty) and reports a correct tree as RED. Default both (`ap=${ap:-0}`, `af=${af:-0}`) and treat an EMPTY summary line as BROKEN, never as 0/0.
- vitest silently DROPS a filter that matches no file and exits 0 with the remaining files — every green verdict pins the `Test Files` count as well as the test count (ARCH-S02, same day).

## codex-cli 0.146 logs `failed to load models cache: missing field base_instructions` and still runs (2026-09-09)
- Two ERROR lines from `codex_models_manager` at startup (load / renew cache TTL) come from a stale `~/.codex/models_cache.json` schema; the CLI rewrites the cache and answers normally. NOT a dead-transport signal — judge a Codex seat by its disk output and the board, never by that line. Do not delete or edit the cache on a seat's behalf; the CLI owns it.

## `renderToStaticMarkup` returns "" silently when a page calls a hook the `next-navigation` stub lacks (2026-09-09, MOCK-S01 F3)
- `tests/render/stubs/next-navigation.ts` has no `useRouter` / `useSearchParams`; `apps/ui/app/new/page.tsx:65-66` calls both. The render does not throw — it yields the empty string, and a probe that only checks "no error" reads as green. Every render fixture asserts the markup is non-empty (and names the stub it extends) before anything else. Cost: one run + one debug round trip per seat that meets it.

## `grep` on this Mac is ugrep 7.8.4 — a BRE `\|` alternation is LITERAL (2026-09-09, ARCH-FIX-S02 F-6)
- The published S02 R13 ask-literal grep answered ZERO as written (rc=1) because ugrep reads the escaped pipe literally; a seat running it verbatim "passes" a requirement on an empty set. Use `grep -E 'a|b'` (or `-e a -e b`) and prove every published grep on a KNOWN hit before quoting its count. Same family as the earlier escaped-pipe entries.

## `grep` on this Mac is TWO binaries (2026-09-10, ARCH-REV-S02-p2 N2/N3 — refines the ugrep entry above)
- Inline in a harness Bash call, `grep` is a Claude Code shell FUNCTION that runs ugrep 7.8.4 (a BRE `\|` is literal there). From a `.sh` file — the way every seat runs commands — it is `/usr/bin/grep`, BSD grep (a BRE `\|` alternates). The same command therefore answers differently by how it is run. Rule: every published grep names the binary it was proved under and is proved on a KNOWN hit (a fixture with one line per alternative) before its count is quoted; a receipt no run reproduces ("answers 8 lines") is a §3.6 defect even when the gate is sound.


## zsh expands `$VAR:A`, `$VAR:h`, `$VAR:t`, `$VAR:l` as PATH MODIFIERS inside double quotes (2026-09-10, orchestrator, BUILD-S02-C1 closures)
- `"$F10_F1:ARCH.md …"` became `"<cwd>/t_a02cca8bRCH.md …"` (`:A` = absolute path), `"$F10_F4:heartbeat"` became `".eartbeat"` (`:h` = dirname), `:t` ate the `t` of "the", `:l` the `l` of "line" — five of six ticket ids were mangled and their `complete` calls hit "unknown task" while the loop printed "closed". Rule: a variable followed by a colon is ALWAYS braced (`"${VAR}:…"`), and a loop that mutates the board checks each command's exit before printing success. Same family as the unquoted-`$4` word-split trap (zsh does not split) — zsh's parameter syntax is not bash's.

## Under `// @vitest-environment jsdom`, `fileURLToPath(import.meta.url)` fails collection with ERR_INVALID_URL_SCHEME (2026-09-10, BUILD-S01-C3)
- A render suite that resolves a source file from its own location dies before any case runs. Read the file from the packet-pinned cwd (`readFile("apps/ui/app/new/page.tsx")` from the lane root, the `sup-04-widget` idiom) instead of from `import.meta.url`. Priced by the seat at one collection failure + one diagnosis round trip.

## Kill by port or PID, never `pkill -f` a filename every seat shares (2026-09-10, REV(S01) p1)
- Three parallel lenses followed one dev-stack recipe and each ran a `stub-api.mjs`; one lens's teardown `pkill -f "stub-api.mjs"` could kill the others' stubs (the security lens's server vanished at 04:07 while it was still working). Name per-seat files `<seat>-stub-api.mjs`, record the PID at launch, kill that PID; `lsof -nP -iTCP:<port> -sTCP:LISTEN` proves a port is yours before any kill.

## A Codex seat measures a real browser with headless Chrome over CDP — no Playwright package is installed (2026-09-10, FIX-S01-p1-F2)
- `node_modules` carries no `playwright`/`playwright-core`; a seat that needs a rendered DOM starts the installed Google Chrome headless (`--headless=new --remote-debugging-port=<free port>`) and drives it over CDP from a scratch script, logging to a file — never a headed window (heartbeat-protocol §3.9). The Claude lenses use the harness's in-app Browser pane instead.

## A shell heredoc with lines over ~1,000 characters can split a multibyte character (2026-09-10)
- A `python3 - <<'PY'` heredoc carrying 1,500-character lines with `→`/`·` died with "Non-UTF-8 code starting with '\xe2'" — the long line was cut mid-character before Python saw it. Write long generators to a file first, keep lines short (build long strings from a list), and `iconv -f utf-8 -t utf-8 file >/dev/null` before running.

## zsh arrays are 1-INDEXED — `${IDS[0]}` is empty and every later slot is off by one (2026-09-12, orchestrator, debate-tiers)
- A `declare -a IDS; IDS+=(…)` loop then `printf … "${IDS[0]}" "${IDS[1]}" "${IDS[2]}"` wrote the S02 lens ids into `tickets.env` one slot late (CORRECTNESS empty, SECURITY holding correctness's id). Caught by reading the file back against the `create` output; cost one fix line. Rule: in zsh use `${IDS[1]}`…, or `${IDS[@]}` positionally, or write the registry line inside the loop from the command's own output — never index a zsh array from 0.

## A Hermes seat's transcript is the sqlite store `~/.hermes/state.db`, not a file — dump it read-only for `skills-check.sh` (2026-09-12, orchestrator, debate-tiers)
- `hermes --yolo -z` writes no jsonl; the session's turns live in `~/.hermes/state.db` tables `sessions` (id, created_at, model) and `messages` (session_id, role, content, tool_calls, timestamp). The session id is in the seat's CLAIM comment (`20260912_141630_d2141d` shape). Dump with `sqlite3 -readonly -json ~/.hermes/state.db "select role, content, tool_calls from messages where session_id='<id>' order by timestamp"` to a scratch jsonl and run `scripts/skills-check.sh <dump> <skills…>` on that — the BODY phrases are in `content`. Never open the db read-write while a seat runs (the CLI holds it). Costs if skipped: the SKILLS LOADED gate is unverifiable and the exit cannot be consumed.
- The one-shot session ends at a context cutoff (~75% into a whole-feature review, 100 tool calls) with the honest state printed and NO verdict; resume the SAME session with `hermes --yolo --resume <id> -z "<pointer>"` (orchestrator §7) — it finished in one more turn. V (2026-09-12): a Hermes limit hit is fine.

## A CRASHED audit does not report ZERO violations — it reports NOTHING, and every count quoted from that state is a guess (2026-09-16, BUILD(CONT-T1))
- `pnpm run audit:architecture` had been dying on `ENOENT … web/package.json` at `tools/orphan-audit/src/index.ts:52` for the whole merge window. Three separate records — the gate report's §10 fixer note, the continuation plan and the task brief — all predicted that removing the `web` edge row would expose "the three F31 `obs-capture` edge violations". It exposed **five**: the three obs-capture rows *plus* `apps/api -> support-kb` and `apps/runner -> support-kb`, which no ticket names and no record had ever counted, because nothing had ever seen the audit finish.
- The generating condition is the same one this file keeps recording: a number copied forward from a run that never produced it. A violation list measured while the tool throws is not a short list, it is an ABSENT list. Rule: when a gate crashes, write `UNKNOWN` for everything downstream of the crash — never a count inherited from an older green, an adjacent ticket, or another seat's expectation — and re-measure the moment it runs to a verdict. Cost here: zero (the surprise was caught by pasting the verdict verbatim instead of confirming the expected three), but a seat that had asserted the expected list would have filed two real architecture violations as "nothing new".

## `git cat-file -e <sha>:<path>` exits 128, not 1, when the PATH is absent from an existing tree (2026-09-16, BUILD(CONT-T1))
- A brief specified `git cat-file -e 5e617776^1:dialectical-engine/web/package.json; echo $?` and predicted `1`. The real result is `fatal: path 'dialectical-engine/web/package.json' does not exist in '5e617776^1'` with **rc=128**; `1` is what you get for a missing *object*, not a missing *path*. The substance was right (the file is on neither parent) and only the constant was wrong, so a zero-vs-nonzero reading survives — but a probe classifying `rc == 1` as "absent" and anything else as "probe broken" inverts the answer.
- Same family as `## git rev-parse <sha>:<path> echoes its argument when the path is ABSENT` above: git's absence signals differ per plumbing command. Rule: for path presence use `git cat-file -e` and test `rc != 0`, or better `git ls-tree -r --name-only <sha> -- <path>` and test for EMPTY output, which has one meaning.

## Deleting a test file is a FILE-level verdict over an ASSERTION-level question (2026-09-16, BUILD(CONT-T1) fix round 1)
- A retirement brief said: delete `tests/unit/s14-ui.test.ts` entirely "unless an `apps/ui` equivalent of EVERY assertion exists — never port assertions by analogy". The file mixed four assertions whose subject was the retired `web/lib/*` tree with seven whose subjects are live, unchanged modules (`@debateai/serve`, `@debateai/contract`, `@debateai/kernel`, `apps/ui/lib/v3/labels.ts`). The unanimity the wording assumes was never checked, and the delete took `projectServeEdge` and `projectNodeMakerLineage` — whose ONLY test it was — down with the dead ones. Caught at review; a whole fix round.
- Rule: the unit of a retirement is `(assertion, subject module)`, not the file. Before deleting a condemned test file, list its imports and classify each by whether the module still exists; only assertions whose subject is gone may retire. A file-level verdict is correct only when that classification comes back unanimous. And when a brief's wording and "never lose a live pin" disagree, that is a packet defect to hand up, not a consequence to file as a finding afterwards.

## A suite that has never LOADED has assertions that have never RUN — re-homing them is a first run, not a move (same day)
- The deleted suite had been a collection failure on every merge parent, so all twelve of its assertions were dead, not failing. Four of the seven re-homed ones therefore executed for the first time in the fix commit — including `expect(CONDITION_MARKS).toHaveLength(37)`, a number that until then existed only as arithmetic in the test's own comment. They passed, so the "lost coverage" everyone was protecting turned out to be real; had they failed, it would have been imaginary and the whole rescue misconceived.
- Rule: never call re-homing a dead assertion "preserving coverage" before it has gone green once. State it as UNVERIFIED until the run exists. Corollary for the typecheck half: map each of the dead file's diagnostics to the ARM that produced it before moving anything — two `'label' is of type 'unknown'` diagnostics here sat on the exact arms being re-homed and vanished only because a union of one typed and one untyped renderer collapsed to the single typed one. Knowing that in advance is the difference between "gains no diagnostic" as a plan and as a coin flip.

## A TS2741 count is a CALL-SITE count, not an edit-site count (2026-09-16, BUILD(CONT-T2))
- The brief sized this task as "35 errors in 16 files". TypeScript reports `Property 'x' is missing` at the OBJECT LITERAL that is passed, so a shared helper that omits the property emits one diagnostic per CALLER, not one at the helper. Here 35 diagnostics were 24 insertion points (measured: `git show <tip> -- tests/ | grep -c '^+.*repoRoot: observationRepoRoot()'`): `tests/unit/obs-agent-05-lifecycle.test.ts` showed five errors (75,78,80,82,84) for ONE `input()` builder, and `tests/unit/obs-agent-01-discovery.test.ts` showed three (763,769,775) for ONE spread `const input`. Eleven of the "35" were echoes.
- Rule: before planning edits from a diagnostic count, resolve each `(line, col)` to the expression it names and de-duplicate by the DEFINITION that omits the property. A plan that budgets one edit per diagnostic over-estimates; worse, a seat that "fixes 35 sites" has added the property at call sites where the helper should have carried it, and the next caller re-opens the class.
- Corollary for the reverse direction: the count also UNDER-states the file surface. A file can hold a pre-existing, typecheck-CLEAN site of the same property (`obs-agent-01-discovery.test.ts:707,734` supply `repoRoot: "/tmp/repository"`) that no diagnostic will ever point at. Grep the property name across the whole test tree before believing the error list describes the class.

## A fixture value that mirrors a product constant has FOUR idioms here, and only one cannot drift (2026-09-16, BUILD(CONT-T2))
- `ProbeContext.repoRoot` is produced in production by exactly one call, `observationRepoRoot()` (`apps/observation-agent/src/core/paths.ts:11`, a module-location-derived constant), read once at `apps/observation-agent/src/main.ts:61` and threaded into `ModuleRuntime.run` and `createOwnedSignalRouter`. The obs-agent test tree supplies the same field four different ways, measured by `grep -rn 'repoRoot: <idiom>' tests/ | wc -l`: `process.cwd()` (17 sites), `resolve(".")` (3), `resolve(import.meta.dirname, "../..")` (1), and hard-coded `/tmp/...` strings (5). Three of the four agree with the product only because vitest happens to run from `dialectical-engine/`; the fourth never agrees at all.
- Rule: when a fixture must reproduce a product value, IMPORT the product's own accessor rather than re-deriving the value, even when the re-derivation is currently equal. `resolve(".")` is a bet on the runner's cwd, and a cwd change turns every such fixture silently wrong rather than red. The two `oactl` call sites derive their own root (`commands.ts:127`, `job-witness/oactl/support/command.ts:63`) — so "the production caller" is ambiguous until you name which module the test under test actually reads.

## A merge-attribution verdict must be proved against the blob the FAILING ASSERTION reads, not the file the report names (2026-09-16, BUILD(CONT-T3))
- The measurement of record attributed `role-token-map` rows 3–5 to `apps/ui/app/globals.css` ("merge-caused regression against the first parent … red on `^2`, green on `^1`"), and the task brief inherited that and put only `globals.css` + `ModeToggle.tsx` in the seat's `allowed` list. The three failing rows read neither file: `'DebateMap root hub'` reads `apps/ui/components/DebateMap.tsx:138-139`, and the two `'DebateCanvas … review mark'` rows read `apps/ui/components/DebateCanvas.tsx`. `grep -c 'HUB_R\|compactReview' apps/ui/app/globals.css` → **0**.
- The oracle reads NINE sources at module scope (`role-token-map.test.ts:14-36`); `globals.css` feeds exactly one row (`.synthCardLabel.verdict`), which passes. Naming "the file the suite reads" as the cause is a file-level claim about an assertion-level question — the same shape already recorded at §"Deleting a test file is a FILE-level verdict over an ASSERTION-level question".
- All three blobs are byte-identical on both parents and at HEAD: `git rev-parse 5e617776^1:<p> 5e617776^2:<p> HEAD:<p>` returns one hash for the test (`ba296026`), for `DebateMap.tsx` (`a85c0bed`) and for `DebateCanvas.tsx` (`aec019cc`). So the rows were RED ON BOTH PARENTS and are not merge debt at all. Same result for `pda-s03`'s `inactive link control weight`: `.libTab { font-weight: 700 }` is identical in all three `globals.css` blobs, so nothing was "dropped by the merge" to restore.
- **Rule: attribute per ASSERTION. Resolve which source the failing assertion actually reads, then compare that path's blob hash on `^1`, `^2` and HEAD.** Three hashes equal ⇒ the merge cannot be the cause, whatever the suite's other inputs did. Cost here: a packet whose `allowed` list could not reach 3 of its own 7 required rows, found only after the seat read the oracle.
- Corollary on cheapness: `git rev-parse <rev>:<path>` for the three revisions is one command and settles the question before any diff is read. The verifier had saved 345 KB of stylesheet diffs for rows that no stylesheet line controls.

## Variant 9 of the multi-path `vitest run` silent drop: the packet itself carried the wrong directory (2026-09-16, BUILD(CONT-T3))
- The neighbour command dictated by the brief names `tests/unit/t9-landing.test.tsx`. That path does not exist; the file is `tests/render/t9-landing.test.tsx`. Run as written, vitest printed `Test Files 1 failed | 2 passed (3)` — **three** files for **four** paths — and never mentioned the missing one. The drop is invisible unless you count.
- This is the `## A multi-path vitest run SILENTLY DROPS paths that do not exist` entry realized from a new direction: previously the risk was a seat renaming its own file mid-cluster; here the bad path was authored INTO the packet, so no amount of care inside the lane would have surfaced it. Running the corrected path added a 16th pre-existing failure (`t9-landing › keeps the route branch immediate and the landing a server component`) that the packet's command would have hidden from every report.
- **Rule: before running any multi-path command a packet dictates, `[ -f "$p" ]` every path and stop on the first miss.** Then assert the `Test Files N (N)` count matches. An exit code and a `Tests N passed` line are both satisfied by a proper subset; the file count is the only field that is not.

## CORRECTION to "A `sql.includes(\"<query text>\")` stub is pinned to a product STRING" (:2374): load01 hung on the DEFAULT branch, not on a `{ rows: [] }` branch
Filed by lane/stub-class (F-PG-STUB-QUERY-TEXT-CLASS, 2026-09-09), from codex known-reds r1
N2/N4. The entry above says at `:2385-2386` that `tests/unit/load01-run-projection.test.ts`
"returned `{ rows: [] }` from a branch that no longer matched". That is not the path the run
took. Read from the file at dev `e2adf68ba4202d576246349e792463523e94449a`:
`if (text.includes("pg_advisory_lock")) return { rows: [] };` sat at `:10`, and
`"SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired"` does not contain
`"pg_advisory_lock"` — so that branch did not run AT ALL. The try-lock text matched none of the
four named branches (`:10`, `:11`, `:12`, `:15`) and fell THROUGH to the stub's catch-all
DEFAULT at `:18-:26`, which returned a run row (`run_id`, `question_line`,
`content_ciphertext`, `state`, `terminal_reason`) carrying no `acquired` field. The lease reads
`result.rows[0]?.acquired !== true` (`packages/db/src/index.ts:305`), and `undefined !== true`,
so it took the contention path, unlocked, slept 10 ms and retried without limit
(`:311-:314`). The observable was `Test timed out in 120000ms.` at 120,010 ms
(`logs/stub-class/02-RED-load01-mine.log`, gate `RED-load01-worker-at-base`, EXIT 1).
The distinction is not cosmetic. A stale branch that RETURNS a wrong shape is a one-line fix
at that branch. A stale branch that stops matching hands the query to whatever the stub does
LAST — and a catch-all default is what converts a dead branch into a hang. xrev01 had no
catch-all, so the same rot surfaced in 5 ms as `UNEXPECTED_CLIENT_QUERY:<sql>`; load01 had one,
so it burned 120 seconds and named nothing.
**Rule: a fake client's LAST branch decides what a rot looks like. Give a stub no catch-all
default — dispatch every query it models by name and throw on the rest — or the next changed
query text is answered plausibly instead of loudly.**

## The lane worktree and the main checkout differ by ONE path segment, and an edit lands silently in the wrong one
Found by lane/stub-class (2026-09-09). The engine lives at `<repo>/dialectical-engine` in the
main checkout and at `<repo>/.worktrees/lane-<name>/dialectical-engine` in every lane, so the
two paths differ only by `.worktrees/lane-<name>/`. A seat that sets `W=<repo>/dialectical-engine`
for its read-only greps — which is legitimate when the main checkout sits at the same commit as
the lane base — and then reuses `$W` for the edit writes the patch to the MAIN checkout, on
`dev`. Nothing complains: the write succeeds, `git status` is only consulted in the lane, and the
lane's own test run still shows the ORIGINAL red, which reads as "my fix did not work" rather
than "my fix is not here". The cost is one full verification cycle plus the revert.
Recovering is not automatic either: `git checkout -- <path>` may be refused by a harness that
blocks destructive restores, so the reverse patch has to be applied textually and then proved
byte-identical with `git diff --stat HEAD -- <paths>` returning empty.
**Rule: bind the lane worktree path to ONE variable at the top of the session, never to the same
name used for read-only work in another checkout, and make the first line of every edit script
assert its own location (`assert os.getcwd().endswith("/.worktrees/lane-<name>/dialectical-engine")`).
An edit script that cannot say where it is standing is one variable away from editing dev.**

## A class member can be stale by ABSENCE, and a sweep that greps the SYMPTOM cannot see it (2026-09-16, BUILD(CONT-T8))
`F-PG-STUB-QUERY-TEXT-CLASS` was chartered as a sweep of "every fake-client `sql.includes(`
dispatch under `tests/`" — a grep over the wrong branch text. Its third member,
`tests/integration/obs-l3-s06-runner-binding.test.ts`, has **no** advisory-lock dispatch at all:
that client modelled `BEGIN`/`COMMIT`/`ROLLBACK`, `ledger.allocate_sequence` and
`INSERT INTO ledger.ledger_entry` and nothing else, so the lease's first query walked straight
into its `throw` at `:290`. A grep for the stale STRING finds every member that has the wrong
branch and ZERO members that have no branch. The verifier's own §10 item 4 inherited the error
and wrote that `:290` "dispatches on pg_advisory_lock"; `:290` is the throw, and §7 row 4 of the
same document says so correctly — one document, two sections, two answers.
Also: `pg_advisory_lock` in a stub is NOT automatically stale. The product still issues the
BLOCKING form at six sites (`packages/db/src/index.ts:938`, `account-erasure.ts:138, :333`,
`publication-lease.ts:57`, `production-database-principals.ts:235, :239`) and the try-lock at two
(`db/index.ts:331`, `evaluator/index.ts:656`). Which form is stale depends on which lease the
test's code path takes, never on the string alone.
**Rule: enumerate a sweep over the PRODUCT's surface, not over the tests' text.** Start from the
query the product issues, find every fake client standing in front of that code path, and ask of
each whether it answers. One direction finds absences; the other cannot.

## Removing a cast costs one compile run per nesting level, not one (2026-09-16, BUILD(CONT-T8))
Refines `## The error count that under-reports: TypeScript stops at the FIRST excess property`
(`:587`) for the REMOVAL direction. Deleting the two `as never` casts from
`tests/integration/s8-publication-database.test.ts` took THREE full `pnpm run typecheck` runs,
because the compiler reports the first structural mismatch per object and then stops:
`(1709,25)` composed segment → `(1703,9)` `session` fields → `(1708,7)` top-level `tokenHash`,
`csrfTokenHash`, `authKind`. The ticket's own codex qualification predicted `answer_id` and
`answer_version` would appear; they did not appear until the mutant run, which made a correct
prediction read as wrong when it was merely early.
**Rule: budget depth-of-nesting + 1 compile runs per cast removed, and never quote a first-run
diagnostic count as the size of the job.** The size is visible only from the other end: with the
cast restored and a two-field literal, the compiler says NOTHING (rc 0); with the cast gone it
says `TS2740 … missing answer_id, answer_version, question_line, verdict_state, and 30 more`.
34 required fields, and the cast showed the compiler none of them.

## A parsed builder catches an illegal COMBINATION; a required-field audit never will (2026-09-16, BUILD(CONT-T8))
The s8 transport-ambiguous row carried `confidence_band: "moderate"` with no `band_ceiling`.
`AnswerSchema` refuses that pair (`packages/contract/src/index.ts:647-648`, "confidence_band and
band_ceiling must be present together"), so the row's authored answer had been contract-INVALID
since it was written — under `as never` it was never parsed, and every review of it asked only
"which required fields are missing". No field was missing from that pair; the pair itself was
illegal. Only `AnswerSchema.parse`, via `buildFairShapedAnswer`, found it.
**Rule: a fixture built by a parsing builder is checked by the CONTRACT's refinements, not just
its field list. Prefer the builder over a literal even when the literal looks complete — and when
a builder rejects your override, read the refinement before you invent a value to satisfy it.**
(Here the honest move was to DROP `confidence_band`, because supplying a real `band_ceiling`
means inventing a `register_row_key`/`register_version`/`source_ref` triple for a row that
asserts nothing about the band.)

## A brief can dictate a command the machine cannot run, and rc=127 reads exactly like the RED it predicted (2026-09-16, BUILD(CONT-T8))
`task-8-brief.md:14` dictates `timeout 200 pnpm exec vitest run tests/unit/load01-run-projection.test.ts`
and predicts "the 120 s timeout". Run as written: **rc 127**, `timeout: command not found`, 0 s,
and NO `Test Files` line at all. `command -v timeout` rc 1, `command -v gtimeout` rc 1. The trap
was already in this file at `:2398`, written by the orchestrator on 2026-09-02.
The danger is not the missing binary; it is that the expected outcome of this command was a
FAILURE, so a non-zero exit is exactly what the reader is braced for. A 0-second "reproduction"
of a 120-second hang would have gone into the report unchallenged.
**Rule: a runner must treat an ABSENT summary line as BROKEN, never as RED** (print
`(no summary line — BROKEN, not RED)`), and a packet linter should `command -v` every executable
a brief names before dispatch. The traps that constrain COMMAND SHAPES belong in a linted list,
not in 4 000 lines of prose every author skims.

## `git rev-parse <rev>:<path>` from `dialectical-engine/` needs `./`, and it ECHOES the miss (2026-09-16, BUILD(CONT-T5))
- The blob-hash comparison that §"A merge-attribution verdict must be proved against the blob the
  FAILING ASSERTION reads" mandates is the FIRST thing a reconciliation seat runs. Run as
  `git rev-parse 5e617776^1:apps/api/src/main.ts` from inside `dialectical-engine/`, it returns the
  ARGUMENT STRING, not a hash, for all 14 paths — the repo root is the worktree root and the
  pathspec is root-relative. A classifier that asks "is this 40 hex?" then prints `ABSENT` for
  every path, which reads exactly like "the merge deleted everything".
- Cure: `git rev-parse "<rev>:./<path>"` (the `./` makes it CWD-relative), or prefix with
  `dialectical-engine/`. This is the `<rev>:<path>` half of the already-recorded `git diff -- <pathspec>`
  trap at `:873`; both have the same generating condition and they are one rule:
  **every git pathspec in this repo is ROOT-relative unless you write `./`.**
- Never accept a uniform ABSENT/empty answer as data. One known-present control path per batch
  (e.g. the test file the failure names) turns the silent miss into an obvious one.

## A merge can DETACH a call-graph edge without touching the caller, the callee, or the analyzer (2026-09-16, BUILD(CONT-T5))
- `scaffold.test.ts` read `packages/graph.GraphRepository.readNodeLifecycleEvents` as UNATTACHED.
  Caller (`apps/api/src/index.ts`, `const projected = await this.#splitLifecycle.read(runId)`),
  callee, and the forwarder in `packages/battery/src/split.ts` are byte-identical on `5e617776^1`
  and at HEAD, and the merge's own hunk in `tools/orphan-audit/src/index.ts` is SQL parsing only.
- Cause: the reachability walk's last resort resolves an unqualified `name(` **only while that name
  is UNIQUE in the tree** (`if (candidates.length === 1)`). The second parent brought three support
  repositories and `ThresholdPolicyCache`, all declaring `read(`, so `.read` went from one candidate
  to five and the edge was dropped with NO diagnostic. `SplitLifecycleProjection.constructor` stayed
  reachable while `.read` did not — that asymmetry is the tell.
- **Rule: a static analyzer whose resolution DEGRADES with tree size produces verdicts that are a
  function of what else got merged in.** Resolve the receiver (a class body's
  `this.<field> = … new ClassName(` map, dropped when a field is assigned two classes) instead of
  guessing from a global name, and treat "ambiguous, so skip" as a silent cap to be reported.
- Cheap probe before touching anything: import the analyzer and print `declared=` / `reachable=` for
  the row plus its caller. Two booleans located the defect; reading the 145-line merge diff did not.

## "Inventory drift" can be a PRIVILEGE WIDENING wearing a row-count costume (2026-09-16, BUILD(CONT-T5))
- The measurement of record and the brief both filed `obs-l1-s01-foundation.test.ts:725` and `:872`
  as "database role inventory drift — the grant matrix now has one more role", naming
  `debateai_dev_support*` / `debateai_support*`. Measured, neither row is about a support role.
  `:725` gained `debateai_observation_agent`; `:872` is not an inventory row at all — the view owner
  went from the FIVE safe columns of `core.run` to all 18, including `content_ciphertext`,
  `question_line`, `question_blind_index`, `caller_scope` and `session_id`.
- Cause: `0034_obs_foundation.sql:274-275` grants a COLUMN list; `0060_observation_throughput_views.sql:23`
  issues a TABLE-level `GRANT SELECT ON core.run` that supersedes it. The views are
  `security_invoker = false`, so the owner's reach IS the chokepoint's floor. The widening buys
  nothing: 0060's own view reads only `run_id` and `created_at_seq`, both already granted.
- **Rule: read the failing assertion's DIFF VALUES, never its cardinality summary.** `expected
  [ { …(2) } ] to deeply equal [ { …(2) } ]` looks like a one-element mismatch and is in fact
  thirteen extra column privileges. A seat that trusted the brief's framing here would have
  blanket-updated a security pin.

## A `perl -0pi -e 's/…/…/'` mutant lands in the DOC COMMENT first (2026-09-16, BUILD(CONT-T5))
- Slurp mode plus no `/g` replaces the FIRST occurrence in the whole file. The intended mutant
  (`CREATE ROLE … NOLOGIN` -> `LOGIN`) hit the twenty-line docstring that QUOTED the statement,
  not the `pool.query(...)` call. The suite then stayed GREEN, which reads exactly like
  "the assertion does not catch this mutant" — the most expensive possible misreading in a
  refutation round.
- **Rule: anchor a mutant on syntax only code can carry** (`query("CREATE ROLE …")`, not
  `CREATE ROLE …`) **and print the mutated line back before running anything.** A mutant you have
  not SEEN land is not a mutant; and in a codebase whose comments quote their own invariants,
  every prose citation is a decoy for a text-substitution mutator.

## A REMEDY inherited from the archive can be wrong in the opposite direction, and it costs nothing to check (2026-09-16, BUILD(CONT-T6))
- `board/F18-scaffold-edge-rows.md:20-21` prescribed the fix for the `packages/serve/src/synthesis.ts`
  source-purity row: the file *"owes a `GOAL_RULED_LAW_CARRIERS` entry"*. Two records repeated it.
  One `git grep` showed the symbol it names, `DIGEST_EMPHASIS_OBJECTION_COUNT`, has exactly TWO
  occurrences in the whole repository — its declaration and its single call site, both in that file.
  Nothing imports it. The prescribed remedy would have widened a deliberately narrow exemption to
  admit a symbol that never needed to be exported; the correct fix was the opposite one, and smaller:
  stop exporting it.
- The prescription would also have falsified a live pin nobody had connected to it:
  `tests/unit/s1-1-depth-contract.test.ts:2153` is named *"exempts exactly the two ruled depth exports,
  in exactly one file"*, and its assertions (a 400-character window around the map) would have stayed
  GREEN while its name and stated PROPERTY became false. A test that keeps passing while its subject
  changes is worse than one that breaks.
- Generating condition: the archive recorded a DIAGNOSIS (`this row is the law-carrier class`) and a
  REMEDY (`add the map entry`) in one breath, and every later reader carried the remedy forward as if
  it had been measured. **Rule: a remedy quoted from a record is a hypothesis. Before implementing it,
  measure the one fact it rests on — here, "who imports this?" — which is one `git grep` and decides
  between two opposite fixes.** Cost avoided: an out-of-contract edit to a file this seat could only
  touch in two named regions, plus a silently-falsified test.

## The source-purity law is defeated by a TYPE ANNOTATION, and by wrapping (2026-09-16, BUILD(CONT-T6))
- The rule at `tools/orphan-audit/src/index.ts:656` is
  `/export\s+const\s+([A-Z][A-Z0-9_]*)\s*=\s*-?\d+(?:\.\d+)?\s*[;\n]/`. MEASURED with a mutant:
  `export const DIGEST_EMPHASIS_OBJECTION_COUNT: number = 2;` — a fully exported numeric literal —
  produces NO blocking row, because the regex leaves no room for `: number`. `Object.freeze([...])`
  and a lower-case name evade it the same way; `DIGEST_COMPRESSION_LEVELS` (five exported numbers,
  same file, same species) has always been invisible to it for exactly that reason.
- So the law's verdict is a statement about DECLARATION SYNTAX, not about exported numbers. It is
  still worth obeying — but a seat fixing one of its rows must not conclude the file is now clean,
  and a seat *satisfying* it must not reach for the annotation, which passes while changing nothing.
- **Rule: before treating an audit row as the measure of a property, mutate the property in a way the
  rule's TEXT cannot see. If the audit stays green, you have measured the regex, not the law.** Same
  family as `## Do not invent the assertion you are auditing` and `## Before claiming "no real code
  exercises this rule", prove your instrument can SEE the difference`.

## The dependency-edge table checks `actual ⊆ allowed` only — an OVER-declared edge is invisible (2026-09-16, BUILD(CONT-T6))
- `auditArchitecture` walks each row's real manifest and reports every dependency not in `allowed`.
  Nothing walks the other direction. MEASURED: adding `"no-such-package"` to `apps/api`'s allowed
  list changed the verdict by nothing — not a violation, not a warning, not a count.
- The consequence for anyone DECLARING an edge (as this task did for the two shipped `support-kb`
  dependencies): the audit can confirm you did not under-declare, and can never tell you that you
  over-declared. A row that quietly permits an edge the product does not have looks exactly like a
  correct row forever, and the table is the only record of the intended architecture.
- **Rule: when you add a name to an `allowed` list, the manifest is the evidence, not the audit
  going green — read the dependency out of the `package.json` and cite the commit that put it
  there.** An unused-declaration check belongs in the audit; until it exists, this is manual.

## A JSON dependency probe must not assume the manifest's FORMATTING (2026-09-16, BUILD(CONT-T6))
- `grep -o '"@debateai/support-kb":"[^"]*"'` over `apps/api/package.json apps/runner/package.json`
  printed one hit and read as "the runner does not depend on it" — which directly contradicted the
  audit, whose violation list named `apps/runner -> support-kb`. The cause: `apps/api/package.json`
  is minified onto one line (`":"`), `apps/runner/package.json` is pretty-printed (`": "`). The
  pattern encoded the first file's whitespace.
- The tell was that the probe disagreed with a verdict already measured. **Rule: never grep a
  key-value pair out of JSON with a pattern that spans the colon; grep the KEY alone, or parse it.
  And when a cheap probe contradicts a gate you have already run, the probe is wrong until proved
  otherwise.** Cost here: one minute, because the contradiction was loud; in a case where the probe
  had merely *agreed* with an expectation, it would have been invisible.

## A migration audit's verdict is about its KEYWORD LIST, not about replayability (2026-09-16, BUILD(CONT-T6), fix round 1)
- `auditMigrationReplaySafety` (`tools/orphan-audit/src/index.ts:576-596`) checks four things:
  `ADD COLUMN`, `ADD CONSTRAINT`, `CREATE FUNCTION`, `CREATE [UNIQUE] INDEX`. There is **no
  `CREATE TRIGGER` member.** `migrations/0061_algorithm_publication_profiles.sql` had a bare
  `CREATE FUNCTION` *and* a bare `CREATE TRIGGER`. Fixing the function emptied the file's blocking
  list; three gate runs agreed; the migration still died on its second application with
  `trigger "…" for relation "…" already exists` (SQLSTATE `42710`, `CreateTriggerFiringOn`).
- The gap had already been WRITTEN DOWN by the same seat, as an out-of-contract finding, in the same
  handoff that reported the cluster green. Knowing the gate is incomplete and still quoting its green
  is the failure — not the incomplete gate.
- **Rule: state the property in words, then ask whether the gate's MECHANISM can reach it.** "The
  audit lists nothing for this file" and "this file is replay-safe" are different claims; a
  text-scanning rule can only ever support the first. Where the property is runtime behaviour, run
  it: `startTestDatabase()` + the real `migrate(pool)` + re-applying one file's bytes
  (`tests/integration/migration-0061-replay.test.ts`, modelled on
  `tests/integration/tint1-upgrade-migration.test.ts:108`) costs about ninety seconds.
- Why nothing had ever caught it: the production migrator keys its ledger on the file NAME and skips
  a recorded one (`packages/db/src/index.ts:730-732`), so a non-replayable migration is SILENT in
  normal operation and only surfaces on a restore, a branch database or a squashed chain. Before this
  round, **no test in this repository applied any migration twice.**
- Companion finding for anyone fixing the class: `DROP TRIGGER IF EXISTS <name> ON <table>;` before
  `CREATE TRIGGER` is this repo's settled pattern (nine migrations, e.g. `0002_s02.sql:73`);
  `CREATE OR REPLACE TRIGGER` also works on the embedded server here and closes the brief
  no-trigger window that drop-first opens.

## A privilege floor specified by CITING a migration is scoped to the wrong set of readers (2026-09-16, BUILD(CONT-T5B))
- The packet's outcome said: narrow `debateai_obs_view_owner` on `core.work_item` and
  `ledger.raw_artifact` "to exactly what **0060's own views** READ". Measured, a SECOND landed
  migration widens the same table — `migrations/0058_observation_safe_views.sql:23` issues a
  table-level `GRANT SELECT ON core.work_item,core.run_progress_event` — and its own view
  `obs.work_item_liveness_v` (`0058:1-10`) reads `claimed_by`, `claim_deadline` and
  `settled_artifact_ref`, which **no 0060 view reads**. Implemented literally, the fix breaks that view.
- Built as the neighbour mutant (drop `claimed_by` from the new column list) and run:
  `obs.work_item_liveness_v: FAILED 42501 permission denied for table work_item`, while
  `obs-l1-s01-foundation.test.ts` stayed **12 passed (12)** and
  `obs-agent-06-{views,status}.test.ts` stayed **8 passed (8)**. **No committed test in this
  repository catches a wrong column list on `core.work_item` or `ledger.raw_artifact`** — the two
  guard rows pin `core.run` only. A seat that followed the packet's sentence and ran its prescribed
  verification would have shipped a broken production view under a fully green board.
- **Rule: enumerate the readers of a privilege FROM THE DATABASE, never from the migration a finding
  cites.** A finding names the migration that BROKE the floor; it never names the migrations that
  DEPEND on it. The query that answers it, for any owner:

      SELECT tn.nspname, t.relname, array_agg(DISTINCT a.attname ORDER BY a.attname)
      FROM pg_rewrite r JOIN pg_class v ON v.oid=r.ev_class
      JOIN pg_depend d ON d.objid=r.oid AND d.classid='pg_rewrite'::regclass
      JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=t.relnamespace
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
      WHERE pg_get_userbyid(v.relowner)='<role>' AND t.relkind='r' AND d.refobjsubid>0
      GROUP BY tn.nspname, t.relname

- Corollary for refutation rounds: **build the neighbour mutant out of the packet's own scoping rule.**
  If the packet says "exactly what Y reads", mutate the code to exactly that and see what breaks. This
  is the cheapest test of a packet's premise that exists, and it is what surfaced the defect here.

## `REVOKE SELECT ON <table>` also clears that table's COLUMN-level grants (2026-09-16, BUILD(CONT-T5B))
- So a "narrow the table-level grant back to a column list" repair is necessarily REVOKE-then-GRANT,
  in that order, and it must RE-ISSUE the original column list even though an earlier migration
  already granted it. Measured after `migrations/0062_obs_view_owner_column_floor.sql`:
  `has_table_privilege` false on all three tables, `core.run` back to exactly its 5 columns.
- `GRANT`/`REVOKE` are outside `auditMigrationReplaySafety`'s keyword list entirely
  (`tools/orphan-audit/src/index.ts:613-633` knows only `ADD COLUMN`, `ADD CONSTRAINT`,
  `CREATE FUNCTION`, `CREATE [UNIQUE] INDEX`). Its silence is not evidence of replay-safety — see
  `:4665`. Proof costs ~35 s: re-apply the file's own bytes twice against the live chain, then
  re-read both `information_schema.column_privileges` and every dependent view's row count.

## A scratchpad `.mts` probe can drive this repo's REAL test database without entering the write contract (2026-09-16, BUILD(CONT-T5B))
- `pnpm exec tsx /abs/path/probe.mts` from `dialectical-engine/`, importing
  `tests/support/testDatabase.ts` and `packages/db/src/index.ts` **by absolute path**: the project's
  own files resolve their bare specifiers (`@debateai/db`, `embedded-postgres`) from their own
  directory, so a probe living outside the repo still gets `startTestDatabase()` + the real
  `migrate(pool)`. `.mts` avoids the CJS top-level-`await` death at `:1258`.
- The owner role here is `NOLOGIN`, so "connect as the role" is closed. Two routes work:
  query a `security_invoker = false` view as ANYONE (PostgreSQL checks the view OWNER's base-table
  privileges, so the read exercises the floor), and `SET ROLE <owner>` from the superuser pool for a
  direct per-column boundary read. Neither needs `configureRolePasswords`.
- This is the instrument "measure before you speculate" has been missing for database work: it
  produced the before-table, the after-table, the per-column boundary rows and the view-liveness
  proof in one run, and it writes nothing inside `allowed`.

## Three prose copies of a cardinality, all wrong (2026-09-16, BUILD(CONT-T5B))
- `task-5-report.md:366` (F1), the `NOT UPDATED` comment at `obs-l1-s01-foundation.test.ts:884` and
  the trap at `:4579` each say the widening gave the owner **"all 18"** columns of `core.run`.
  Measured on the chain, and printed by the RED diff itself: **25**. Nothing depended on the number,
  which is exactly why it drifted three times.
- **Rule: a security finding carries the QUERY that measures the state, not an adjective and not a
  count.** The next seat then runs one command instead of reconciling three narrations — and the
  count cannot be wrong, because nobody types it.

## A DIFFERING blob hash is not restore-justification — only the STRING is (2026-09-16, BUILD(CONT-T4))
- The scope amendment (`plans/2026-09-16-algorithm-live-loop-continuation.md:101`) gives a verdict for
  the EQUAL case only: three equal hashes on `^1`/`^2`/HEAD ⇒ the merge cannot be the cause. It gives
  no verdict for the DIFFERS case, and that is precisely where a seat invents work, because a
  differing hash reads as evidence of a merge-dropped site.
- Measured here on `s8-publication-contract.test.ts:169`: `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
  is `913fc863` on `^1` and `4ec000f1` on `^2` and at HEAD — a real reconcile toward `^2`. It still is
  NOT a dropped render site: `git show '5e617776^1:./<path>' | grep -c PublicAnswerDisclosure` → **0**.
  The whole `^1`→HEAD delta is six inserted lines adding `SupportWidget`. The expected string was
  absent on both parents; `PublicAnswerDisclosure` is defined at
  `apps/ui/components/PublicAnswerDisclosure.tsx:3` and imported by nothing on `^1`, `^2` or HEAD.
- **Rule, two steps, and the second decides:** (1) hashes equal ⇒ EXCLUDED; (2) hashes differ ⇒ grep
  the `^1` BLOB for the expectation string — present on `^1` and absent at HEAD ⇒ RESTORE, absent on
  `^1` ⇒ EXCLUDED exactly like (1). Cost of the missing step: one seat-hour and, had it been skipped,
  an invented "restore" of a component neither parent ever composed.

## Bound the merge's blast radius ONCE per zone, before decomposing anything (2026-09-16, BUILD(CONT-T4))
- `git diff --name-only 5e617776^1 HEAD -- ./apps/ui` prints **26** paths. Any failing row whose
  source is not one of those 26 cannot be merge debt, whatever the suite is called and however the
  directory as a whole was resolved. That one command settles §10 item 6's entire 16-row "UI
  ownership" block before a packet exists.
- All eight rows dispatched to BUILD(CONT-T4) read sources outside that list (or inside it without
  the string), so all eight were RED ON BOTH PARENTS and the node wrote zero lines of product code.
  Seven of the eleven sources are byte-identical triples, including `DebateCanvas.tsx` `aec019cc`,
  `DebatePageClient.tsx` `10608541`, `DebateThread.tsx` `a36c6de4`, `lib/types.ts` `8bdfc0b8`,
  `lib/recommendation.ts` `539c5341`.
- This is the ZONE-level form of the ASSERTION-level rule at `:4434`. That entry says attribute per
  assertion; this one says you can often skip the per-assertion work entirely, because the zone diff
  is one command and it excludes rows wholesale. **A verdict row must therefore be keyed by the
  SOURCE PATH its failing assertion reads, not by its suite name** — a row keyed by a path can be
  checked against the blast-radius list mechanically; a row keyed by a suite name cannot, and that is
  how §6's prose survived two seats.

## Prove the instrument can still say YES before reporting eight NOs (2026-09-16, BUILD(CONT-T4))
- An attribution that returns EXCLUDED for every row it is given is indistinguishable, from the
  outside, from an attribution that is simply broken. Before writing "no work here", run one POSITIVE
  CONTROL inside your own read surface: a string the merge really did drop.
- Control used here: `apps/ui/app/page.tsx` is `3d43ab3b` on `^1` and `d004d0fb` at HEAD, and
  `grep -c 'return <LandingPage />'` is **1** on `^1` and **0** at HEAD — the method returns RESTORE
  for it, so its eight EXCLUDEDs are measurements and not a dead instrument.
- Same generating condition as `:1887` ("Before claiming 'no real code exercises this rule', prove
  your instrument can SEE the difference"), reached from attribution instead of from mutation
  testing. A null verdict ships with its control or it is not evidence.

## The S1-1 depth oracle's ceiling arm scans RAW PHYSICAL LINES, so a COMMENT that quotes the bound is a violation (2026-09-16, BUILD(CONT-T7))
- `ceilingSites` (`tests/support/depthOracle.ts:1243`) runs `kindOfCeilingLiteral` over
  `source.split("\n")` BEFORE it runs `declarationUnits`. `declarationUnits` strips comments; the
  raw-line pass does not. So any physical line matching `/depth/i` **and** a bare `5`
  (`/(?<![\w.$])5(?![\w.$])/`) is a `DEPTH_BOUND_LITERAL`, including a JSDoc line.
- Measured: `packages/serve/src/synthesis.ts:109`, ` * goal ORDERS to be exported and imported
  elsewhere (T1's 1-5 depth bound);` — the `5` in `1-5` is bare, and the row reads as a second
  definition of the ruled ceiling. `dcd2f89c` wrote that sentence in a commit whose own message
  argues about "the narrowness property s1-1-depth-contract pins": the seat reasoned about the
  oracle and never ran it (3.0 s).
- **The fix is the ruling's own mechanism applied to prose: NAME the constant, never restate its
  value.** `(T1's EXPANSION_DEPTH_MAX)` matches `/depth/i` and carries no bare 5 — measured clean.
- **Rule: a commit that touches any path in `tests/support/shipped-corpus.manifest.txt` runs
  `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`, including a comment-only commit.**

## The same oracle's DOMAIN arm reports an UNDETERMINED numeric array, which is NOT a depth duplicate (same seat, same day)
- `domainSites` keeps every candidate whose verdict is not `OTHER` — i.e. `RULED` (the literal IS
  `[1,2,3,4,5]`) **or `UNDETERMINED`** (the evaluator could not decide). A numeric array literal
  consumed by a call the evaluator does not model is UNDETERMINED, so it is reported.
- Measured at `56c91618`: `apps/api/src/support/keys.ts:402/444/489` — three AES-GCM **envelope
  version bytes**, `Buffer.from([1])` / `Buffer.from([2])`. They have nothing to do with depth, and
  the ticket's instruction to "route each site to `EXPANSION_DEPTH_MAX`" would have written byte 5
  into every wrapped support DEK and broken `parseWrappedEnvelope`'s `bytes[0] !== 1` guard.
- Neighbour control, measured: `const X = [1];` alone is **green** (EXACT -> OTHER). So the arm
  pins "an occurrence I cannot decide", not "an array containing a small number". The row's NAME
  ("leaves no duplicate definition of the ruled ceiling") mispredicts this every time.
- **Remedy that works and is honest: name the element.** `isNumericElement`
  (`tests/support/depthOracle.ts:176`) accepts only numeric literals, so `Buffer.from([VERSION_TAG])`
  is not a candidate at all. A false positive and a true positive get the SAME edit here, because
  the allow-list (`OWNING_DECLARATION`) is inside the test file and no worker may touch it.
- **Rule: before acting on an oracle row, read the classifier and probe it. Never infer the remedy
  from the ruling the oracle serves.**

## Import a TypeScript oracle module straight from the scratchpad with plain `node` — no tsx, no repo write (same seat)
- `await import("file:///…/dialectical-engine/tests/support/depthOracle.ts")` from a `.mjs` in the
  scratchpad works under Node 26.5.0 type-stripping. The module's own `import ts from
  "typescript-classic"` resolves from **its** directory, so the repo's node_modules is found even
  though the script is outside the repo.
- This sidesteps `:907` ("the root `typescript@7.0.2` package ships NO JavaScript compiler API")
  entirely — you never import typescript yourself — and `:2005`/`:1258` (tsx resolving from the
  script's directory).
- One 2-second run classified eight synthetic shapes. The alternative was eight 3-second suite runs
  and eight assertion-diff reads. **Rule: when a gate's verdict is a pure function exported by a
  module, call the function; do not re-run the gate to ask it questions.**

## VARIANT 10 of the multi-path `vitest run` family: a packet GLOB that matches nothing never reaches the runner (same seat)
- The brief dictated `pnpm exec vitest run tests/unit/t1-*.test.ts tests/unit/register-s09.test.ts`.
  No file matches `tests/unit/t1-*.test.ts` in this tree (it holds `t10-`, `t11-`, `t12-`, `t15-`,
  `t17-`; the only literal `t1-` file is `tests/architecture/t1-argon2-worker-contract.test.ts`).
- zsh aborts at expansion: `(eval):1: no matches found: tests/unit/t1-*.test.ts`, **rc=1, and the
  redirected log file is never created** because nothing ran. Variants 8 and 9 (`:2462`, `:4441`)
  both assume vitest RAN and dropped a path silently; this one is louder but classifies the same
  way — any harness that reads exit status sees "suite failed".
- **Rule: a packet carries no unexpanded glob. A seat expands every glob with `ls -1` first, `[ -f ]`
  every literal path, and asserts `Test Files N (N)` against the path count.**

## Revert a mutant from a byte-identical BACKUP, never by reverse substitution — the fix's own doc comment can contain the mutant's text (same seat)
- Refines `:4595` ("a `perl -0pi -e` mutant lands in the DOC COMMENT first") from the opposite
  direction: there the forward mutant hit a comment; here the **comment I added to explain the fix**
  contains the literal string `Buffer.from([1])`, so the reverse substitution
  `s/Buffer\.from\(\[1\]\)/Buffer.from([WRAPPED_KEY_VERSION_TAG])/` would have edited the
  explanation and left the mutant standing — a green restore over a still-mutated file.
- **Rule: `cp <backup> <file>` then assert `md5 -q` equality and print `git status --porcelain`.
  A revert that is a regex is a second mutation.**

## vitest's jsdom environment SKIPS any global the runtime already defines (2026-09-16, BUILD(CONT-T9))
- 100 of the 122 `tests/render` reds were `TypeError: Cannot read properties of undefined (reading 'clear')`
  — the bare `localStorage` global. jsdom 30.0.1 *does* supply `window.localStorage`; it never arrives.
- Cause, read out of the installed runner (`vitest/dist/chunks/index.DC7d2Pf8.js:243-248`, `getWindowKeys`):
  `if (k in global) return keysArray.includes(k);` — a key already present on `globalThis` is copied ONLY
  if it is in vitest's explicit `KEYS`/`additionalKeys` list. `localStorage` appears NOWHERE in that file
  (`grep '"localStorage"'` → rc=1), so it is filtered out of the copy set.
- Node 26.5.0 defines the key and leaves it `undefined`:
  `node -e "console.log('localStorage' in globalThis, typeof globalThis.localStorage)"` → `true undefined`,
  with `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided`.
  On the declared Node 22.23.1 the key does not exist, so vitest copies jsdom's and the block is green.
- **Rule: when a jsdom global is missing under vitest, check `'<key>' in globalThis` under the bare runtime
  FIRST. A newer Node that merely DECLARES a web global silently disables vitest's jsdom copy of it.**
  Priced here: the block reproduces standalone in 13 s, and the whole diagnosis is two greps and one probe.

## An environment defect is a LOWER bound on the red count, never an upper one (same seat, same day)
- Supplying the missing global as a pure measurement — `NODE_OPTIONS=--localstorage-file=<scratch>` , no repo
  edit, no install — took `tests/render` from `115 failed | 219 passed` to `19 failed | 315 passed`.
- 96 rows were pure environment. But **4 rows that had been counted inside the 100 were real, independent
  failures** that the `TypeError` had been masking: `t1-canvas` › *renders nested shell/core bezels…*,
  › *keeps BASE, FINAL, and an accessible Details control…*, › *maps all completed review outcomes…*,
  › *uses a structural line token for the DebateMap hub ring*. All read blobs identical on both parents.
- **Rule: before filing "N rows are environment", REMOVE the environment defect and re-measure. A row that
  throws in setup never reaches its assertion, so its verdict is unknown, not green.** Fixing the host will
  RAISE this suite's red count by 4, and a report that promised "100 rows go green" would have been wrong.

## An ABLATION settles attribution that three blob hashes cannot (same seat, same day)
- Six rows read files the merge resolved toward `^2`, which is the textbook "merge-caused regression against
  the first parent" shape. The hashes support it; they do not prove it.
- Cheap decisive step: `git show '<parent>:./<path>' > f` , `cp f <path>`, re-run the covering files, restore
  from a byte-identical backup. `PublicDebatePageClient.tsx` and `DebatePageGate.tsx` differ from `^1` by
  exactly one thing each — a fragment wrap adding `<SupportWidget />`. Ablated to `^1`, all six rows stayed
  RED (`4 failed | 2 passed (6)` and `2 failed | 8 passed (10)`), so the merge is NOT the cause of any of them.
- **Rule: a differing blob is a hypothesis. Restore the parent's blob, re-run, and let the suite answer.**
  Pairs with the existing entry `A merge-attribution verdict must be proved against the blob the FAILING
  ASSERTION reads` — that one narrows WHICH file; this one tests WHETHER that file matters.

## An oracle can pin a vocabulary that existed on NEITHER parent (same seat, same day)
- `t3-library` ×4 query `[data-library-row]` and `[data-library-row][data-bezel="shell"]`. The attribute
  occurs **zero** times in `apps/ui` at HEAD, and `git grep -c data-library-row <rev> -- ./apps/ui/` exits 1
  on `5e617776^1` AND on `5e617776^2`. The rows cannot ever have passed on either side of the merge.
- The measured text — `.count` reads `'41 TOTAL'` where the test wants `'4 TOTAL'` — looks like a count
  regression and reads as merge debt. It is a selector that matches a different element entirely.
- **Rule: when an assertion fails on a SELECTOR, grep the selector across both parents before attributing.
  Absence on both is entailed pre-existing, and it is one grep.** Same family as `A class member can be
  stale by ABSENCE, and a sweep that greps the SYMPTOM cannot see it`.

## `pnpm test -- --reporter=json --outputFile=X` runs the whole suite and writes NO JSON (2026-09-16, BUILD(CONT-T9))
- pnpm 11.20.0 forwards the bare `--` **literally**, so the script line becomes
  `vitest run -- --reporter=default --reporter=json --outputFile=…`. vitest reads everything after a bare
  `--` as positional **filename filters**, not flags. No JSON reporter is installed, no `outputFile` is
  honoured, and the run still executes all 419 files and prints a correct-looking summary.
- Cost here: **one wasted 45-minute full-suite gate**, because the four-count must be read from the JSON.
  The console summary was right; the required artifact simply did not exist.
- Correct form — no `--`: `pnpm test --reporter=default --reporter=json --outputFile=<path>`
  (or `pnpm exec vitest run --reporter=…`). Proved on one file in ~1 s before re-spending the 45 minutes.
- **Rule: a long gate is smoke-tested in a ONE-FILE form first, and its artifact asserted to exist
  (`[ -s "$OUT" ] || fail`) before the real run.** Same family as `Prove the instrument can still say YES
  before reporting eight NOs` — applied to a reporter instead of an audit. The exit code, the `Tests N`
  line and the `Test Files N` line are ALL satisfied by a run whose reporter never loaded.

## A gate taken over a tree the seat is still editing is not a gate (same seat, same day)
- `tests/unit/text-control-bytes.test.ts` scans *"cached or untracked repository text sources"*, and
  `tests/unit/s1-1-depth-contract.test.ts` scans the shipped corpus. Writing a report file into
  `.hermes/` while the full suite runs puts the seat's own prose inside the measurement.
- **Rule: commit (or otherwise freeze) every file you intend to write BEFORE launching a long gate, and
  touch nothing in the worktree until it exits.** Scratchpad writes are free; repo writes are not.
- Corollary worth keeping: to count control bytes, use `perl -ne '… /[\x00-\x08\x0B\x0C\x0E-\x1F]/'`.
  A bracket expression with `\xNN` escapes is NOT interpreted by the `grep` on this Mac — it matched the
  literal characters `x`, `0`, `8`, `B`, `C`, `E`, `F` and reported 3886 "control bytes" in a clean file.

## A clean MERGE and a compiling merge are different claims — vitest never typechecks (2026-09-16, BUILD(CONT-T10))
- Fold-lane FL-1 merged a 2026-09-02 security handoff onto a tree that T6/T7/S06/T9/T12/T13 had
  rewritten. `git merge --no-ff` was textually clean, the incoming integration test went 2/2, and the
  six-file gate was 90/90 — while `pnpm run typecheck` was **RED**: the handoff's own
  `ServeGateResult` fixture predated T9's four new required fields (`digest`, `loopRounds`,
  `standingObjection`, `crashClass`), one `TS2739`. vitest transpiles and does not typecheck, so no
  number in any suite summary can see this.
- Measured, not argued: 0 diagnostics at the base `a30c549f`, 1 after the merge, 0 after the fix.
  Getting a baseline needs no new worktree — `git checkout --quiet <base>` in your OWN worktree, run,
  `git checkout --quiet <branch>` back, with `git status --porcelain` empty on both sides.
- **Rule: a fold's gate is the SUITE PLUS THE COMPILER, and both are read against a measured base.**
  The reconcile everyone predicted (product regions) was a no-op here; the whole cost was in a test
  fixture's TYPE, which is the one surface a green suite cannot speak about.
- The prediction that failed the other way: the brief named the three product regions the patch
  "assumed" and said T9 had rewritten them. Measured, the `answer_form` site set is IDENTICAL at the
  patch base and at HEAD — same four roles, +880 lines of drift, no fifth site. A file moving a lot is
  not the same as its site set moving at all; diff the SITE SET, not the file.

## A mutant can be killed by the DATABASE instead of the assertion, and the transcript looks the same (same seat, same day)
- Mutant M1 bypassed the encryption at the write site. Expected RED at the test's
  "stored row contains no plaintext" assertion (`:268`). Observed RED at `:264` — the *persist call* —
  because `core.enforce_content_ciphertext()` raised `CONTENT_PLAINTEXT_WRITE_FORBIDDEN` inside the
  INSERT. The plaintext row never existed to be asserted about.
- Both outcomes print `Tests 1 failed | 1 passed`. A mutant index that records only RED/GREEN cannot
  tell "the application preserved the invariant" from "the application broke it and a trigger caught
  it" — which are different findings about different layers.
- **Rule: record the KILL LAYER (assertion id, or the raising function) beside every kill.** Here it is
  the good news — defence in depth — but read as an app-level kill it would have overstated the code.

## The migration number a brief predicts is stale the moment another lane lands (same seat, same day)
- The brief said, three times, that the placeholder migration must become `0062`. Measured at write
  time, `0062_obs_view_owner_column_floor.sql` already existed on this branch, so the free slot was
  `0063`. Nothing inside the file depends on the number and the tests locate it by suffix
  (`/^\d+_serve_answer_content_carrier\.sql$/`), which is why the mismatch was cheap — by design.
- **Rule: `ls migrations | tail -3` at write time is the number; a number in a brief is a timestamp.**
  Check both directions afterwards: the collision you were avoiding (`ls migrations | grep -c '^0057_'`
  still 2) AND the slot you took (`grep -c '^0063_'` = 1).
