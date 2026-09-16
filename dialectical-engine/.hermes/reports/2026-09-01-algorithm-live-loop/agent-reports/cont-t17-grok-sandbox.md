READY FOR PEER REVIEW · comments read through: closing-run-2026-09-08

# BUILD(CONT-T17) — cont-t17-grok-sandbox · self-report (case file)

Seat: `cont-t17-grok-sandbox`, Opus 5, mission `2026-09-01-algorithm-live-loop` (continuation of
2026-09-16). Ticket F-GROK-SANDBOX-PROFILE = plan Task 17.
Base `a38dde4a` → product commit `d0400bc9` → this commit. Worktree
`.claude/worktrees/algo-loop-2026-09-16`. Pass 1 of 3, rework round 0.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

---

## 1. The victim, and who actually killed it

The closing run of 2026-09-08 debated on two of three configured makers and its own log could not
say so. The board ticket names the proximate cause — grok refused `--sandbox read-only` because
`/var/run/docker.sock` is a dangling symlink — and that framing is a **red herring for the
engineering**. Two distinct defects were bundled under one ticket, and only one of them is about
Docker:

1. **A silent channel.** `run-acceptance.ts` recorded a rejected relay start as an ABSENT provider
   probe in a **temporary** database and printed nothing. The database was thrown away with the
   run. So the defect was not "grok failed" — it was **"the only witness to the failure was
   destroyed by design."** Docker could have been running and this defect would still be there,
   waiting for the next maker to fall over.
2. **A host-coupled constant.** `buildArguments` carried a fixed `--sandbox read-only` written
   against another machine, in the same file as a compiled-in binary path
   (`/Users/vladmihaimiron/.grok/bin/grok`) that a previous ticket had already had to make
   configurable (D10). The *class* was known and half-fixed: **WHICH binary** was made a host fact,
   **HOW it is sandboxed** was left a source constant. The second half of a known class was left
   standing and it fired eight days later.

**Cause to fix, not symptom:** a degradation that is only recorded where the record does not
survive is not a record. Every "we recorded it" in this harness should be read as "in what, and
does that outlive the run?"

## 2. What nearly went wrong here — three near misses, in cost order

**(a) The design was nearly wrong before the first line of code.** `acceptance/adversarial-corpus.test.ts:653`
pins the exact Grok argument list including `"--sandbox", "read-only"` — and that file is **outside
this ticket's write contract**. Had I made the flag conditional on anything the shared fixture also
takes, that pin would have gone red and the only two remedies available would have been a contract
breach or a weakened assertion. I found it because WHO-READS-THIS-STRING was run **before the
design**, not before the edit. It cost one grep and it changed the implementation (default path
byte-identical; flag removed only on a proven-degraded path). Run late, it would have cost a
rewrite plus a rework round. **Price avoided: ~1 pass.**

**(b) An assertion that pinned nothing, and passed at base.** The property "when the profile-less
probe ALSO fails, re-throw the ORIGINAL failure" was first written against a double that exited 1
both ways. Both failures serialise to `GROK_CLI_FAILED`, so the assertion was satisfied by either
behaviour — it was green at base, green after, and the mutant that deletes the re-throw **survived
it**. Only building that mutant exposed it. Fix: the profile-less arm now HANGS, so it is
`GROK_CLI_TIMEOUT` and the two are distinguishable. **This is the single most valuable thing the
refutation duty did on this task, and it was invisible to every other gate.**

**(c) A RED that was green.** The RED-first assertion `expect(relay.sandboxProfile).toBe(GROK_SANDBOX_PROFILE)`
**passed at base** — because `GROK_SANDBOX_PROFILE` was not exported yet, so both sides were
`undefined`. `:1807` covers the missing-export-binds-undefined half; this is the worse half, where
the comparison itself is vacuous. Caught only by reading *which* assertion the RED frame named.

## 3. The dead ends — do not re-derive these

- **Do not try to read the vendor's error text.** `relay-core.ts:202` is `child.stderr.resume()`:
  stderr is drained and discarded, and `:229` rejects with one flat constant per adapter. The
  brief and the packet both quote grok's `could not apply the 'read-only' sandbox profile`, which
  reads as "match on this". Nothing in this process can ever see it, and `relay-core.ts` is
  read-only under this ticket. **The classifier has to be differential.** (Appended to TOOLING-TRAPS.)
- **Do not add `SANDBOX-PROFILE-UNAVAILABLE` to the kernel vocabulary.** `CONDITION_MARKS` is
  closed, 37 members, pinned by `tests/unit/s14-live-projections.test.ts:41` and
  `tests/unit/dr174-resilience.test.ts:208`, with a UI-label uniqueness pin at
  `tests/unit/v2ui-data-layer.test.ts:481` and **positional** tail pins at
  `tests/unit/t4-way-of-knowing.test.ts:165` and `tests/unit/t03-judge-panel.test.ts:168`. Five
  suites and two packages, all forbidden. And the semantic argument is the stronger one: every
  member describes a **debate that ran**; this describes a **transport decided before any run
  exists**. It would have been the wrong home even with an open contract.
- **Do not invent a cheaper "no-op probe".** The brief asks for one. Any zero-cost probe needs a
  grok flag combination (`--version`, a bare `--sandbox` check) that cannot be verified without
  invoking the real CLI, which is forbidden. The GROK-01 handshake **is** the no-op probe — its
  prompt asks for a single word — and it uses only flags the closing run already proved work here.

## 4. What repeatedly cost tokens on this seat

| Cost | What | Fix |
|---|---|---|
| ~32 KB, one wasted call | Extracting every TOOLING-TRAPS section matching `grok\|relay\|sandbox\|acceptance\|vitest` — 5 headings matched on the word "acceptance" alone in an unrelated sense ("an acceptance pinned to ABSOLUTE LINE NUMBERS"). The output was persisted and unusable. | The packet should name trap sections **by line number**, as it already does elsewhere (`:1239`, `:2462`). A keyword sweep over a 5,500-line file is not a reading floor, it is a lottery. |
| 2 refused Bash calls | A heredoc + `chmod` in one command, and a `for` loop computing `sed` ranges, were both refused by the worktree-isolation guard as "too complex to verify". | Write scripts with the Write tool; keep Bash calls to one plain command. Worth one line in the packet — every seat in this worktree will hit it. |
| 1 wasted grep | `grep -rn ... --include='*.ts'` unquoted → ugrep warnings, includes silently ignored, `rc=2`. This is TOOLING-TRAPS `:2091`, `:1715`, `:1338`, `:5580` — **the same trap is in the file at least six times** and it still fires. | The packet's own binding WHO-READS-THIS-STRING command carries the unquoted form verbatim. **Fix the packet template, not the seat.** A trap recorded six times and still fired is a template defect, not a knowledge gap. |

## 5. What to upgrade — ranked, concrete

1. **Fix the packet's WHO-READS-THIS-STRING command.** It is quoted verbatim into every packet with
   `--include='*.ts'` unquoted, which is a documented six-time trap in this very repo. One edit to
   the template retires it for every future seat.
2. **Make "record the degradation" mean "in something that outlives the run".** This ticket's whole
   existence is a record written to a temporary database. A standing rule — *every ABSENT/DEGRADED
   record is also emitted on the ceremony's stdout, which is the artefact that is kept* — would have
   made this ticket unnecessary. It is now true for two cases; it should be a law, not two cases.
3. **Sweep the class, not the instance (§3.2).** The identical silent-drop exists at
   `acceptance/main.ts:694-700`, and it is **worse**: that entry point drops a rejected relay start
   with *no* provider probe and *no* print at all. It is outside my contract, so it is named, not
   fixed. A ticket that fixes one of two call sites of the same defect is a ticket that will be
   re-opened. **The contract should be drawn around the CLASS the sweep finds, not around the file
   the bug was found in.**
4. **Teach the packet template to ask "what does the wrapper discard?"** Two of this task's three
   real design constraints came from reading `relay-core.ts` (stderr discarded; one failure code
   per adapter). Both are invisible from the ticket, the brief and the diff. A one-line prompt in
   the worker contract — *before designing a branch on WHY something failed, read what the caller
   keeps* — is cheap and would have saved the first design.

## 6. Toward a one-prompt machine

The parts of this task that ran without a human in the loop were the parts with a **mechanical
oracle**: RED-first, the mutant table, the three-run law, the byte-identical restore check. The
parts that needed judgement were all **contract-vs-brief conflicts**, and they are automatable:

- **The brief said `--sandbox` handling is "a new branch in the fixture's argument parsing"** —
  but `acceptance/test-fixtures/fake-grok-cli.mjs` is not in the `allowed` list. I reached the
  outcome with a test-local double instead. **A machine can check this**: every noun a brief tells
  a seat to modify should be diffed against `allowed` at dispatch time. This is the second
  `allowed`-omits-a-deliverable defect in this mission's continuation; it should be a lint on the
  packet, not a judgement call at the seat.
- **The brief named a kernel vocabulary member; the packet's read-surface rule overrode it.** That
  override was written *because someone expected the conflict*. When the packet already predicts
  the conflict and states the tie-breaker, the seat needs no round-trip — this worked, and it is
  the pattern to generalise: **predict the conflict in the packet and rule it in advance.**
- **What still cannot be one-prompted here:** the ordering claim "before the debate starts". The
  only end-to-end witness is `runAcceptanceCeremony`, which starts an embedded PostgreSQL, an API,
  and three real vendor CLIs. It cannot be run by a seat forbidden to invoke them. Until the
  ceremony grows a seam that injects relay starters, that property is argued from the call site,
  not measured. **That seam is the highest-value unbuilt thing in this file.**

## 7. Where the packet was unclear or wrong

- **PACKET DEFECT (contract).** The packet's prose directs the Grok fake's `--sandbox` handling into
  `acceptance/test-fixtures/fake-grok-cli.mjs`, which the exhaustive `allowed` list omits. Resolved
  in favour of `allowed` (heartbeat-worker §4); the sandbox-rejecting double is built inline in
  `grok-relay.test.ts`. Side benefit: the shared fixture stays untouched, so `adversarial-corpus`
  keeps proving the admitted boundary for free.
- **BRIEF DEFECT (mechanism).** "a fake grok binary that rejects `--sandbox read-only` **with the
  closing run's error text**" implies the error text is load-bearing. It cannot be: stderr is
  discarded before it leaves `relay-core.ts`. The double still emits the real 1.0.13 text, for the
  transcript, but nothing reads it.
- **BRIEF DEFECT (vocabulary).** "record a visible condition mark `SANDBOX-PROFILE-UNAVAILABLE` on
  the run" names a kernel `ConditionMark` that does not and should not exist. The packet's
  read-surface rule anticipated this and ruled it; the token is kept, its home is not.
- **Unclear, cost ~1 call:** the packet's TOOLING-TRAPS instruction (headings, then bullets under
  headings naming five keywords) selects on words with unrelated senses. Name the line numbers.

## 8. Findings for the board (not fixed here)

- `acceptance/main.ts:694-700` — a second `Promise.allSettled` relay start that drops a rejected
  start entirely: no provider probe, no stdout. Strictly worse than the defect this ticket fixes.
  **Same class, out of contract. Needs its own ticket.**
- `acceptance/grok-relay.ts:13` — `GROK_BINARY = "/Users/vladmihaimiron/.grok/bin/grok"`, another
  machine's home directory, still the compiled-in default (D10 makes it overridable, not correct).
  Named, not touched.
- The degraded path costs **two** real CLI invocations at ceremony time (the closing run priced one
  Grok handshake at 0.0066 USD). Only the degraded path pays it. Disclosed, not optimised.
