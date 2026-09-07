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
