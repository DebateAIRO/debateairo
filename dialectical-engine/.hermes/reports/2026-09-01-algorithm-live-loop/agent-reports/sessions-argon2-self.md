# SELF-REPORT — worker seat `sessions-argon2` · 2026-09-07 · lane `lane/sessions-argon2` · tip `dd083666` (rework round 1 of max 3)

A murder case: who killed the S5 test, what the investigation cost, which corridors were
dead ends, and where my packet left me guessing.

## The victim and the cause

`tests/integration/session-database.test.ts` — "runs the password-to-TOTP challenge through
real Argon2 and creates one hash-only session". It died on **2026-09-06T10:00:00Z**, and
nobody pushed anything that day.

The cause is a **second clock nobody declared**. The fixture pinned `now` to
2026-08-23T10:00:00Z and injected it as the service clock. The session policy grants 14 days
of idle life, so the login's session expired — in the fixture's frame of reference — on
2026-09-06T10:00Z. The risk-signal scope query does not read the injected clock. It reads
`clock_timestamp()`, the database's. On the first wall-clock day past that instant, the
session the test had just created was already dead at the database, the scope resolved to no
row, and the login threw.

The murder weapon is ordinary and the reason it went unsolved for a week is the second
defect: `apps/api/src/sessions.ts:439` was `}catch{this.dependencies.onRiskSignalFailure();}`.
The error was caught and dropped. What surfaced was the test's own callback shouting
`UNEXPECTED_RISK_SIGNAL_FAILURE` — a fact about the test, not about the system. **A failure
was observable, its cause was not, and the two are not the same thing.**

## The price, itemised

The expensive part of this ticket was paid before I opened it.

- **A previous seat attributed this by EXPERIMENT** because it could not read a log: it
  restored base manifests, removed the Argon2 alias from both manifests and `node_modules`,
  re-ran, saw the identical failure, then restored the tip. That is a careful, well-recorded
  experiment, and it was the right move given what was visible. It also cost a full
  investigation cycle and produced a conclusion pointing at the environment. **One
  `catch(error)` would have replaced the whole experiment with one line of output.** That is
  the single highest-leverage lesson in this lane.
- **The test's own NAME misdirected the investigation.** It says "real Argon2". Argon2 was in
  the title, not in the mechanism — password hashing and TOTP both succeeded and the failure
  is three statements later. Two seats reached for the native binding first. A date-dependent
  failure and an environment-dependent one present identically: *fails here, passed there.*
- **My own share: about 14 minutes of avoidable re-runs**, both self-inflicted, both already
  written down in the file I had read:
  - I took gate records 04–09 on a dirty tree. `stamp-check.sh` calls those STALE and D41
    makes them inadmissible. Cost ~6 min to re-take at the clean tip.
  - I ran the whole mutation campaign at `68815250` and then committed the traps, so all four
    transcripts stamped a commit that was no longer the tip — the exact "campaign spanning two
    commits" `TOOLING-TRAPS.md` warns about, which I had read an hour earlier. Worse,
    `mutate.sh` APPENDS, so re-running left two records per file and `stamp-check`'s `grep -m1`
    still read the stale one. I had to delete the logs and run the campaign once, clean. ~8 min.

## What I nearly got wrong

- **I nearly shipped the mutation campaign as if it proved the whole lane.** Mutants A1/A2 pin
  the fixture repair cleanly. B1 and B2 — reverting each catch to discard the error again —
  **survive**, at 11/11 and 3/3. Once the fixture is fixed the catch is never entered, so the
  diagnostic improvement is protected by nothing. It would have been very easy to report "four
  mutants, campaign clean" and let the reader assume all four killed. The suite summary line
  cannot tell those apart; only reading which mutant survived can.
- **I nearly wrote a contradiction into my own report.** I claimed the identity projection means
  "bound parameters cannot reach the log", while two sections later listing "a driver `message`
  might echo a bind parameter" as an open residual. `universal-sweep.sh` surfaced the sentence
  and I split the claim: the projection bounds the FIELDS, not the CONTENT of the three it keeps.
- **I nearly cited four wrong line numbers.** The packet's `:431`, my `:56`, my `:156` and three
  assertion ranges were all off by one to ten lines — some because the packet quoted the `it(`
  line rather than the literal, some because my own edit shifted the file under me. I re-grepped
  every number before filing. Every one of those would have been a reviewer finding.

## Dead ends — do not re-derive these

1. **The Argon2 native binding is not involved.** Already established by the previous seat's
   alias-removal experiment, and independently confirmed here: mutant A1 changes the DATE alone,
   with the Argon2 pool untouched, and reproduces the failure exactly.
2. **`tests/integration/recovery-database.test.ts` does not exist.** The packet asks for "that
   or whichever integration test exercises recovery.ts's catch". There is **no integration test
   for it**: `grep -rln RecoveryStartService tests/` returns exactly one file, the unit test
   `tests/unit/p2-recovery-start.test.ts`. Do not go looking again.
3. **Aligning `now` to a 30-second TOTP boundary is unnecessary.** I considered truncating the
   database clock to a step boundary to mirror the old fixture, which was step-aligned because
   10:00:00.000Z happens to be. It buys nothing: `floor((t+30000)/30000) === floor(t/30000)+1`
   for every `t`, so the `step + 1` advance survives an unaligned `now`. Mutant A2 confirms it.
4. **No migration constrains these columns against the database clock.** I checked before
   moving `created_at`/`adult_affirmed_at` from a past date to ≈now: no `CHECK` in `migrations/`
   references `now()` or `clock_timestamp()`. Nothing requires those values to be in the past.

## Where the packet was unclear, exactly

The packet was unusually good — it named the mechanism, the files, the constraints and the
artifacts, and it was right about all of them. Four small things:

1. **`session-database.test.ts:431` is the `it(` line; the literal is `:432`.** Codex's F2 had
   `:432`. Off by one, cost a minute of confusion, worth fixing at the source so the next reader
   of either document sees the same number.
2. **"`tests/integration/recovery-database.test.ts` or whichever integration test exercises
   recovery.ts's catch (name it)"** — the parenthetical saved this. The honest answer is *none*,
   and the packet's phrasing let me say so instead of forcing a file to fit. More packets should
   be written with that escape hatch.
3. **The FIRST ACTION gate and the provisioning log disagree.** The gate demands `exit=0` for
   both install and `generate:contract`. The log shows `exit=` (empty) for install — the zsh
   `$PIPESTATUS` trap, already in `TOOLING-TRAPS.md` — and its own last line waives it with
   `PROVISIONED OK`. A worker reading the gate literally must BLOCK on a lane that is fine. I
   proceeded on the packet's parenthetical ("Provisioned: the log ends with `PROVISIONED OK`")
   and recorded the gap. **The provisioning script should use `gate-run.sh`, which captures an
   exit code correctly, rather than a pipeline whose status zsh discards.**
4. **The packet asked me to surface the error but did not say whether to PIN it.** Outcome 1(b)
   defines this ticket's RED as a log line, which is historical evidence, not a regression guard.
   Whether to add a standing test was left to me, and adding one means duplicating an 81-line
   login fixture inside a file the same packet requires to be green three runs running. I left it
   as a finding rather than deciding it alone. **A packet that asks for a behaviour change should
   say in one clause whether a regression pin is in scope.**

## Round 1 — the finding I earned, and what it cost

Codex returned CHANGES with one blocking finding: both services needed a standing assertion
that the caught cause reaches the observer. I had measured that gap myself, reported it
accurately as mutants B1/B2 surviving, and then **filed it instead of fixing it**. Codex was
right and my reasoning was wrong on a checkable fact.

**The bad decision, traced.** I declined to write the pin because I believed it required
duplicating the 81-line Argon2 login fixture into a file that must stay green three runs
running. I never checked that belief. `completeLogin`'s TOTP branch calls `decrypt` and
`matchTotpStep` — AES-GCM and HMAC — and calls Argon2 **only** on the recovery-code branch;
`SessionService.create` hashes a dummy password only when `dummyPasswordHash` is omitted.
So the real pin is a new 175-line unit file with small stubs whose two cases run in 19 ms and
2 ms. **I estimated the cost of the honest option, did not measure it, and let the estimate
make the decision** — in a lane whose entire subject is trusting a visible artefact over the
path that produces it.

**The false claim, traced.** I wrote that the existing recovery unit test's second case was
"the only place in the suite that drives `recovery.ts:84`'s catch". It drives nothing. That
case's `repository.start()` throws `DATABASE_UNAVAILABLE`, and the risk-signal block sits
inside `if(outcome.status==="created")`, so it is unreachable and the recorder stub beneath it
is dead code. I had **read that file** — I quoted its line numbers — and still concluded
coverage from the presence of a stub rather than from the path reaching it. The mutant result
(B2 surviving at 3/3) was sitting in my own evidence table and is exactly what an unreachable
catch looks like; I read it as "no assertion on the value" when it also meant "the code never
runs". One measurement, two conclusions, and I took the smaller one.

**Price of round 1:** one review cycle. Everything else was cheap — the pins, the mutant
re-runs and all the re-taken gates came to about 25 minutes.

**And I repeated round 0's sequencing mistake inside round 1.** I measured everything at
`b8d37952`, then committed the traps entry, moving the tip to `dd083666` and invalidating
13 records in one commit. I had written the self-charge for this exact error two hours
earlier. That is the clearest evidence in this lane that a lesson recorded in a report does
not change behaviour: **the fix has to be a step in the packet or a hook, not a paragraph
I wrote and agreed with.** Concretely: commit everything committable, THEN measure, and run
`stamp-check.sh` as the last action before writing the report.

**What I did right and would repeat:** I reported the surviving mutants plainly instead of
presenting "four mutants, campaign clean". That honest line is the entire reason this became
a one-round correction rather than a silent regression six weeks from now.

## What to upgrade — toward the one-prompt machine

1. **Ban the zero-argument failure notifier.** The defect class here is not "bare catch" — that
   matches 134 sites, nearly all legitimate. It is *a bare catch whose body is a zero-argument
   notifier call*, which matched exactly 3. That is a one-line `audit:source` rule
   (`grep -rnE "catch *\{[^}]*\(\) *;? *\}"`), it is mechanically checkable, it has zero false
   positives on this corpus, and it would have prevented both this ticket and the week of
   misattribution ahead of it. **This is the cheapest permanent win in the lane.**
2. **Ban absolute date literals in integration fixtures, or require them to declare the clock.**
   A fixture that pins a calendar date while its assertion path crosses into SQL is a time bomb
   with a printed fuse date. A lint rule over `tests/integration/` for `new Date("20…")` would
   have caught this on the day it was written. If a test genuinely needs a fixed date, it should
   have to say so in a comment naming which clock it is fixing.
3. **Make a "deliberately historical" record a first-class thing.** `stamp-check.sh` reports my
   RED records and my typecheck baseline as STALE. They MUST be stale — a RED record stamped to
   the fix's own commit would be a contradiction. Every seat will keep explaining this in prose.
   A `BASELINE:` or `HISTORICAL:` line in the record that the comparator honours would remove a
   recurring paragraph from every report and a recurring false alarm from every review.
4. **Have `mutate.sh` truncate its output file, or refuse to append to one that already has a
   stamp.** Appending silently produced a two-record file that reads STALE forever because the
   comparator takes the first stamp. The tool is otherwise excellent — it restored on every path
   and gated hashes and porcelain every time.
5. **Give the worker packet a machine-checked "records must stamp the tip" step.** Both of my
   self-inflicted costs were the same mistake in two costumes: evidence taken at a moment that
   was not a commit. A single line in the packet — *run `stamp-check.sh` before you write the
   report* — would have caught both, and it is one command.
6. **A surviving mutant is a finding to FIX, not a finding to FILE — and the seat is the wrong
   judge of whether the pin is affordable.** My cost estimate was wrong by an order of magnitude
   and I did not spend two minutes checking it. Cheap rule: before declining work on cost grounds,
   measure the cost. If a seat writes "I did not do X because X is expensive", the packet should
   require a number next to "expensive".
7. **Ask "what does this test actually reach?", not "what does this test mention".** A stub that
   is never called looks identical, in the source, to one that carries the whole case. The
   mechanical check is the one codex ran: trace from the assertion back to the branch that
   reaches it. A coverage claim should name the BRANCH it enters, not the stub it supplies —
   and a reviewer should be able to falsify it by reading one `if`.
