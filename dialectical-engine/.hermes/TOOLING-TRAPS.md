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

- **Vitest jsdom can expose `import.meta.url` with an HTTP scheme.** CODE-T1C3 used
  `fileURLToPath(new URL(..., import.meta.url))` in a jsdom render test and got
  `TypeError: The URL must be of scheme file` before the feature assertion ran. Cost:
  one broken RED run and one correction pass. When the acceptance command is explicitly
  pinned to the worktree root, resolve source fixtures from `process.cwd()` instead.
