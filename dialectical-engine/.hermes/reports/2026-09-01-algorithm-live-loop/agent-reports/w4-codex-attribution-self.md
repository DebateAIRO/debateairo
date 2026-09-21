# W4 self-report — a case file

> *treat it like a murder case. What can be done better, what we must upgrade, what
> repeatedly cost us tokens, how to make the coding more efficient, how to turn this into a
> one-prompt machine.*

## The headline: the packet's stated cause was wrong, and the packet said so honestly

The ticket handed me a hypothesis — *codex's output format has drifted* — and labelled it a
hypothesis. That labelling is the single most valuable thing in the packet. It cost me one
live call to refute and I refuted it in the first twenty minutes instead of building on it.
**Keep doing this.** A packet that marks its inference as inference is worth more than a
packet that is right, because the seat can price the check.

But note *why* the hypothesis was wrong, because the pattern will recur: it was derived by
**reading the production call path** (`parseCodexStdout` → `findRollouts`) and reasoning that
the sound-looking half must mean the fault is in the other half. The actual fault was in
**neither** — it was in the *caller*, `runDualMakerProof`, which never passed the seam. Reading
a call path top-down finds bugs *in* the path; it structurally cannot find a bug in what the
path was *given*. The one command that would have found it in ten seconds —
`grep testOnlySessionsRoot` across the two files — is a search for an ABSENCE. **Upgrade: when
a value arrives wrong, grep for the seam that should have supplied it before tracing the code
that consumed it.**

## What cost the most, in order

**1. Two trees, two different failures, and the packet cited a line from the tree where its
own stated failure does not occur. (~25 min, the largest single cost.)**
The ticket cites `model-shim.ts:149`. On dev that statement is `:136`. I began at the
integration worktree because `:149` matched there — and integration fails at
`seed-register.ts:123` with a completely different error, before any provider call. For a
while I could not tell whether I was looking at my bug, a lane's in-flight state, or a stale
packet. Only diffing the two trees settled it.
**Upgrade — cheap and mechanical:** every `file:line` in a packet carries the **commit** it was
read at. `model-shim.ts:149 @7dda3cc0` would have cost the dispatcher four characters and
saved me the whole detour. The mission already enforces this discipline for gate records via
`stamp-check.sh`; **packet citations deserve the same stamp.** This is the highest-leverage
change I can name.

**2. Deciding which tree to work in. (~15 min of reasoning, zero tool calls, pure indecision.)**
The ticket said `worktree: tbd`. The landing zone (integration) cannot run the proof gate at
all because of another lane's regression; the tree where the gate is reachable (dev) is not
the landing zone. I went back and forth three times before choosing dev and separately proving
the patch applies to integration.
**Upgrade:** when a ticket's proof gate is a *named test*, the dispatcher should state the
tree that test is expected to pass in, and confirm it currently fails there **for the stated
reason**. A one-line pre-dispatch probe (`vitest run <file>` in the landing tree, failure
string pasted into the packet) would have converted my 15 minutes of deliberation into a fact
I could read. It would also have caught F-W4-1 before W4 was ever written.

**3. Rebuilding a mutant I had built wrong. (~4 min, and it was the most useful 4 minutes.)**
M2 was supposed to be "a wrong store" and I pointed it at `test-fixtures/` — the **parent** of
`codex-sessions/`. `findRollouts` recurses, so it was a superset, found the same rollout, and
passed. Had I only recorded "M2: expected RED, got GREEN" I would have reported a hole in my
own test. Reading what the traversal actually matched showed the mutant was wrong, not the
test. **This is the "read what the search matched" ruling landing in practice, and it landed
twice** — the second time it stopped me filing a false security finding (see below).

**4. Three small tool traps, ~10 min total, all now in `TOOLING-TRAPS.md`.** Running the
acceptance vitest config from the worktree root prints `No test files found` and exits 1,
which looks exactly like a failing suite in a gate record. A `.ts` probe in the scratchpad
compiles to CJS and rejects top-level `await`. And `git apply --check --3way` prints
`Applied patch … with conflicts` — I had to stop and verify the integration worktree was
untouched (it was; `--check` still suppressed the write, but the message does not say so).

## The near-miss I want on the record

**I almost filed a false security finding.** After discovering the real credential leak, I
swept the whole mission log tree with `grep -rlE "sk-[A-Za-z0-9_-]{16,}"` and got a hit in
another lane's committed review log. For about thirty seconds I had "a credential is sitting
in a committed mission record" written in my head as a fact. It was a minified CSS
property-name blob — `mask-composite`, `mask-size` — where `sk-` is the tail of `mask-`.
`grep -l` tells you a file matched; it does not tell you *what* matched, and a security
finding filed on a count rather than on the matched text is a false accusation against another
seat's work. **Upgrade: a secret scan must print its matches, never its file list.**

## The finding I did not go looking for

The credential leak (F-W4-2) surfaced only because I ran the proof **live** and the fake
Anthropic CLI echoed its whole environment into my terminal and into a durable log. Nothing in
the ticket pointed at it. Two observations:

- **The fake fixtures are a security surface, and they are treated as test scaffolding.** They
  echo `process.env` wholesale so tests can assert which keys crossed the seam — the exact
  "open key set with no semantic contract" shape router §2.2 says must be redacted rather than
  enumerated. The adapters' `authEnvironmentKeys` are a *deliberate* allow-list of secrets, and
  the fixtures then publish those values as artifact content that gets written to a database.
  Sweeping the class took one grep of three files and one of three adapters; the result is a
  three-row table where one row is exploitable today, one is exploitable wherever `XAI_API_KEY`
  is set, and one is safe. **That sweep should have been done when the fixtures were written.**
- **Running the thing live is what found it.** Every static reading of that code path is
  clean. This argues for at least one genuinely live execution per relay-touching lane, budgeted
  and expected rather than exceptional.

## Dead ends, so nobody re-derives them

- **The codex output-drift hypothesis is dead.** Codex emits `thread.started` with a
  well-formed `thread_id`; `parseCodexStdout`, `findRollouts` and `parseCodexRolloutModel` all
  work live end to end. Measured 2026-09-03, raw stdout in `logs/w4/live-probe-1.log`. Do not
  re-open this without new evidence.
- **`~/.codex/sessions` is not the problem** — it is populated, correctly laid out, and the
  recursion matches it. It was simply the wrong store to be searching for a *fake* CLI's id.
- **`M2` pointing at `test-fixtures/` is not a wrong store**, it is a superset; the recursion
  finds the fixture through it. Use the real sessions root for that mutant.
- **Committing the lane and re-running the gates is a false economy.** Every gate record stamps
  the tip it was taken at; committing after measurement makes `stamp-check.sh` report every
  record STALE. Leave lane work uncommitted, or re-run every gate after the commit. I chose the
  former, which also matches worker contract §7.

## Where the packet was unclear, precisely

- `allowed: []` — an empty contract on a ticket that mandates a fix, gate records and two
  reports. Every W-ticket on this board carries `allowed: []`. Either the field is dead and
  should be removed, or it must be filled; as it stands §1's "a packet whose `allowed` list
  omits a file you are required to produce is a defect" makes **every** seat start with a
  defect to report, which trains seats to skip the check.
- `worktree: { path: tbd, branch: tbd }` with no convention stated. Other lanes' branches sit
  0 commits ahead of the mission branch, which reads as "V merged and reset" — but a seat
  cannot tell that from the board, only by running `git rev-list --count`.
- **"round-trips one live call"** in both the ticket and the test name, when at base **neither**
  maker is live. The word "live" here means real HTTP relay + real child process + real
  Postgres, not a live vendor. That ambiguity is load-bearing for a mission whose whole point
  is real maker lineage, and it is exactly why I went and made the call live myself.

## Toward the one-prompt machine

1. **Stamp packet citations with a commit, exactly as gate records are stamped.** Highest
   leverage item here. `file:line @sha`. It would have removed my single largest cost, and the
   discipline and the vocabulary already exist in this mission.
2. **Pre-dispatch probe for any ticket whose gate is a named test:** run it in the landing tree,
   paste the verbatim failure into the packet. Cost: one command. It would have surfaced
   F-W4-1 — a regression that blocks the entire acceptance surface, including the ceremony the
   Global DoD depends on — before a seat was ever dispatched against a gate it could not reach.
3. **Teach the seat to grep for the missing seam first.** When a value is unresolved, the
   fastest question is not "what does the resolver do?" but "who was supposed to pass it, and
   did they?". One `grep <option-name> <caller> <caller-test>` beat a full call-path trace.
4. **Make `pnpm typecheck` cover `acceptance/`,** or add `pnpm typecheck:acceptance` to the gate
   list. A whole project is currently outside the type gate, and my own RED frame was invisible
   to the standard command.
5. **Secret scans print matches, never file lists** — and belong in the standard gate set, not
   in a seat's improvisation. I only ran one because I had just caused a leak.
6. **Budget one live execution per relay-touching lane.** The two findings that matter most here
   (live attribution actually works; the fixtures leak credentials) were both invisible to every
   static and fake-CLI path, and both cost about one minute of live execution.

## What I nearly got wrong

Two things, both caught, both worth naming:

- I nearly reported "M2 passed, so my test has a hole." It did not; my mutant did.
- I nearly reported a credential in another seat's committed log. It was CSS.

Both errors have the same shape — **trusting a tool's summary instead of its output** — and
both were caught by the same habit of printing the actual match. That habit is the cheapest
insurance in this harness and it should be a standing law, not a per-seat virtue.
