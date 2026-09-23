# SELF-REPORT — cont-t8-stub-class · BUILD(CONT-T8) · pass 1 · comments read through: cont-t8-2026-09-16

SKILLS LOADED: `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-worker` ·
`superpowers:test-driven-development` · `superpowers:verification-before-completion` ·
`superpowers:systematic-debugging`

The question, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

---

## 0. The body, and the time of death

A three-line fix sat finished on `origin/lane/stub-class` for **seven days** (2026-09-09 →
2026-09-16). It was never reviewed, never reported, never merged. In those seven days its two
rows were counted as "known reds" in at least three separate attribution passes, and
`load01-run-projection` burned **120 seconds of every full-suite run** as a silent hang.

That is the murder. Not the bug — the bug was found, understood and fixed on day one. What
died is the **handoff**. Everything below is about the handoff.

---

## 1. Cause of death: a lane can be DONE and INVISIBLE at the same time

The lane's own packet (`packets/stub-class-worker.md:9`) names the report it must write:
`agent-reports/stub-class.md`. That file **never existed**. The lane committed `bf235c9f`,
did not report, and nothing in the system noticed — because the thing that would have noticed
is a human reading a report that was never written.

The board ticket still says `status: working` and `merge_status: none` seven days later
(`board/F-PG-STUB-QUERY-TEXT-CLASS.md:7, :10`). The ticket was right. Nobody read it.

**Cause, stated precisely:** the mission has no *liveness* check on a dispatched lane. It has a
board that records state and packets that assign work, but the transition `dispatched →
(silence)` has no timeout, no alarm and no owner. A lane that dies quietly is indistinguishable
from a lane that is still thinking.

**Upgrade (cheapest first):**
1. **A branch that exists and is unmerged is an ALARM, not a state.** One command,
   `git for-each-ref refs/remotes/origin/lane/* --format='%(refname) %(committerdate:relative)'`,
   run at every orchestrator wake, would have surfaced this on day two. It costs nothing and
   it is mechanical.
2. **A ticket in `status: working` with `wakes_since_transition` climbing is the same alarm.**
   The field already exists in the YAML (`:13`) and is stuck at `0` — it is written once and
   never incremented. A counter nobody increments is worse than no counter: it reads as fresh.
3. **Make the report path a merge precondition, not a packet sentence.** The orchestrator
   should refuse to consider a lane landed while `agent-reports/<lane>.md` is absent.

**Price of this one defect:** 7 days of calendar; ~2 minutes of wall clock per full-suite run
for every seat that ran one; and — the expensive part — **three independent attribution passes
re-derived the same diagnosis** of a bug that was already fixed on a branch in the same
repository. The verifier's §6 rows 20 and 37 and §10 item 4 are a careful, correct,
*completely redundant* re-derivation.

---

## 2. What repeatedly cost tokens

### 2.1 Re-deriving a known diagnosis (the largest single cost)
The `pg_try_advisory_lock` story is told, in full, in **at least five places** in this
repository: `.hermes/TOOLING-TRAPS.md:2374-2395`, `board/F-PG-STUB-QUERY-TEXT-CLASS.md:20-29`,
`packets/stub-class-worker.md:13-15`, the measurement of record §6 row 20 / §7 row 4 / §10
item 4, and `task-8-brief.md:3`. Each telling was written by a different seat that read the
evidence again. Four of the five are *correct*. That is four full diagnostic passes bought and
paid for, of which one was needed.

**Upgrade:** when a finding is filed with a fix already on a branch, the finding's canonical
text should be **one** location and every later mention a pointer. The mission already has that
rule for DECISIONS ("rulings are never duplicated", `INSTRUCTIONS.md:67`). It is not applied to
findings.

### 2.2 The packet told me to run a command this machine cannot run
Brief Step 1: `timeout 200 pnpm exec vitest run tests/unit/load01-run-projection.test.ts`.
macOS has no `timeout(1)`. Measured: `command -v timeout` → rc 1, `gtimeout` → rc 1; the
command exits **127** in 0 s with `timeout: command not found` and **no summary line at all**
(`logs/task-8/02-red-load01-a1.log`).

The bitter part: `.hermes/TOOLING-TRAPS.md:2398` already says, in this repository, in bold:
*"macOS has no `timeout(1)`. `timeout 40 cmd` fails with `command not found`."* It was written
by the orchestrator on 2026-09-02. The brief that dictated the command was written on
2026-09-16 by a seat that had the file.

**Upgrade:** the trap file is 4,485 lines and is read as a *heading index*. That is correct for
a reader — and useless for an author. **The traps that constrain COMMANDS should be a linted
list, not prose.** A twelve-line `tools/command-traps.txt` of forbidden command shapes
(`timeout `, `grep --include=`, bare `git stash`, `head -n -N`, `$PIPESTATUS`) checked against
every packet before dispatch would have caught this in milliseconds. Prose that everybody skims
is not a control.

**What saved me:** my runner script prints `(no summary line — BROKEN, not RED)` when no
`Test Files` line appears. Without it, `rc=127` after a command whose *expected* outcome is a
failure looks exactly like the RED the brief predicted. I would have pasted a 0-second
"reproduction" of a 120-second hang into a report. **That is the near-miss of this session.**

### 2.3 The compiler peels one layer per run
Removing the two `as never` casts from the s8 fixture took **three** full typecheck runs, not
one, because TypeScript reports the first structural mismatch per object and stops:

| run | what I removed | diagnostic |
|---|---|---|
| `09-RED-s8-compiler-cast-removed` | cast on `answer` | TS2739 `(1709,25)` — composed segment missing `segment_id`, `load_bearing`, `served_number_refs` |
| `10-s8-compile-after-builder` | cast on `authenticated` | TS2739 `(1703,9)` — `session` missing `asker_id`, `caller_scope`, `ownership_provenance`, `provisional_identity_model` |
| `11-s8-compile-both-casts-gone` | (completed `session`) | TS2739 `(1708,7)` — missing `tokenHash`, `csrfTokenHash`, `authKind` |

The standing trap at `.hermes/TOOLING-TRAPS.md:587` ("The error count that under-reports")
predicts exactly this and I still budgeted one run. **Upgrade:** when removing a cast, budget
*depth-of-nesting + 1* compile runs, and never quote a first-run diagnostic count as the size
of the job. The ticket's own qualification (codex N3) predicted `answer_id`/`answer_version`
would appear — they did not appear until the mutant run, which is why the ticket's estimate
read as wrong when it was merely early.

### 2.4 Line numbers in packets rot, and every seat pays to rediscover it
`packets/stub-class-worker.md` names the TLS control at `:479–:490`. At my tip the
byte-identical control is at `:505–:517` — +26 lines of drift from the dev merge. Nothing was
wrong with the packet when it was written. **Upgrade: a packet should cite a NAME plus a line,
and the name is the authority.** `it("leaves a DevTlsFrontDoorError raised by startFrontDoor
untouched, with no cause")` is stable across merges; `:482` is not. This costs a grep per
citation to author and saves a stop-and-ask per citation to consume.

---

## 3. What I nearly got wrong

**I nearly "swept" a member that has no branch to sweep.** The measurement's §10 item 4 says
`load01:10` and `xrev01:100` "still dispatch on `pg_advisory_lock`, **and so does the fake
client in `tests/integration/obs-l3-s06-runner-binding.test.ts:290`**". It does not. `:290` is
the `throw`. That client at `:273–:293` models `BEGIN`/`COMMIT`/`ROLLBACK`,
`ledger.allocate_sequence` and `INSERT INTO ledger.ledger_entry` — and **no lease query at
all**. The member is stale by **ABSENCE**, not by a stale branch, and the remedy is three ADDED
branches, not one edited branch.

Had I trusted the sentence, I would have gone looking for a `pg_advisory_lock` branch, not
found it, and either reported the packet as wrong about the file or "fixed" the wrong line.
§7 row 4 of the same document is correct (it calls `:290` the throw) — **the same document
contradicts itself two sections apart.**

**The general lesson, and it is the important one in this report:** a class is defined by the
PROPERTY it violates ("this fake client does not answer the query the product issues"), and a
sweep is usually written as a GREP for the SYMPTOM (`includes("pg_advisory_lock")`). The grep
finds every member that has the wrong branch and **zero** members that have no branch. The
lane's sweep was chartered as *"every `sql.includes(` dispatch under `tests/`"* — a grep over
symptoms — so the third member was invisible to the sweep by construction, not by carelessness.

**Upgrade — this is the one I would put in the spine:** *a sweep must enumerate over the
PRODUCT's surface, not over the TESTS' text.* Start from the query the product issues, find
every fake client that stands in front of that code path, and ask of each whether it answers.
One direction finds absences; the other cannot.

---

## 4. Dead ends, so nobody re-derives them

- **`timeout`/`gtimeout` do not exist on this Mac.** Do not look for a flag. Use the harness's
  own timeout, or vitest's `--testTimeout`.
- **`pnpm run typecheck` at `3e57f932` is rc=0 with ZERO diagnostics**, in 2 seconds, over
  1,868 files (278 under `tests/`), on `tsc 7.0.2`. The measurement's "43 typecheck errors"
  (§10 item 1) and "8 `s14-ui` typecheck diagnostics" (§10 item 11) do **not** reproduce at this
  tip. Do not budget a typecheck repair for this branch.
- **obs-l3 does not need a database and does not take minutes.** The packet predicts "embedded
  PostgreSQL; minutes" for the integration pair. obs-l3 alone: **1–2 s**. The pair, s8 included:
  **6 s**. Only s8 touches PostgreSQL. Do not background-and-wait on obs-l3.
- **Do not try to give the s8 row a real `band_ceiling`.** It is a six-field object with a
  `register_row_key`/`register_version`/`source_ref` triple (`packages/contract/src/index.ts:357-368`).
  The row asserts nothing about the band. The builder's `null` pair is correct.
- **The `authenticated` cast CAN be removed**, but it costs eight fields, seven of which are
  never read on this path. The three that the compiler pins to literals plus `tokenHash` from
  the fixture are the honest ones; the idiom already exists at
  `tests/integration/s7-authorization-database.test.ts:124`. Do not re-litigate it.

---

## 5. The finding this task produced that nobody asked for

After the class fix, `obs-l3 › captures one provider occurrence…` passes `:356` and `:357` and
fails at `:358`, `expect(captured).toHaveLength(1)` — **zero** capture entries. That is the
same failure shape as the two rows the verifier left *undetermined*:
`:135` (`expected ['terminal'] to deeply equal ['capture','terminal']`) and `:223`
(`chainContainsFailure: false`). All three read `installRecordingEmitter`
(`tests/integration/obs-l3-s06-runner-binding.test.ts:55-71`), whose queue `offer` is never
called in any of them.

So **§7 rows 4, 5 and 6 share one cause** in the `@debateai/obs-capture` emitter install, and
the attribution split them into "known red, class X" and "undetermined". Not a criticism of the
verifier — it could not see it, because row 4 died earlier, at the lease. **This is what fixing
a masking defect is FOR**, and it is the argument for fixing cheap loud reds first even when
they are "accepted": every red that stops a row early is hiding the next one behind it. The
trap file says it in one line at `:2395`: *"a red row inside an accepted known-red set stops
being read — the set is a place defects go to be forgotten."*

---

## 6. Toward the one-prompt machine

Ranked by expected saving per unit of work to build them.

1. **A pre-dispatch packet linter.** Three mechanical checks that together would have caught
   three of this task's four packet defects: (a) every `file:line` citation resolves and the
   cited line still matches its quoted text; (b) every command in the brief is decomposed and
   each executable checked with `command -v`; (c) every path in a multi-path test command
   exists. All three are `test -f`-grade. The seat currently performs them by hand, per packet,
   forever.
2. **Unmerged-lane liveness at every orchestrator wake.** One `git for-each-ref`. See §1.
3. **Make the trap file machine-readable where it constrains commands.** §2.2. The prose stays;
   the command shapes become a linted list.
4. **Cite names, not lines.** §2.4.
5. **Change the SWEEP contract from "grep the symptom" to "enumerate the product surface".**
   §3. This is the deepest of the five and the only one that changes what gets FOUND rather
   than how fast it is found.
6. **One canonical text per finding.** §2.1. Apply the existing DECISIONS non-duplication rule
   to findings.

What already works and should not be touched: **the loud throw**. Every one of the three
branches I added to the obs-l3 client was written *after* the client's own
`throw new Error("UNEXPECTED_CLIENT_QUERY:" + sql)` named the exact query it had to answer —
three iterations, zero guesses, each ~2 seconds. A stub that fails loudly is a stub that tells
you its own fix. The catch-all default that the lane deleted from `load01` is the opposite: it
answered a query it did not understand, plausibly, and cost 120 seconds a run for twelve days.
**That contrast is the whole engineering content of this ticket, and it generalizes far beyond
`pg`: a fallback that answers is a fallback that lies.**

---

## 7. Self-charges

- I widened the obs-l3 client's `query(sql: string)` signature to `query(sql: string, values?:
  readonly unknown[])` to key the liveness answer off the requested run id. That is one
  character beyond "the lease branch". I judged it inside the contract because the branch cannot
  be written correctly without it, and I disclose it here rather than hoping it passes.
- I did **not** do N2 of outcome 3 (the CORRECTION to `agent-reports/diag-tail.md`). My
  `allowed` list does not contain that path, and the `logs/diag-tail/r3-*` records it must be
  derived from are on the mission's original laptop and do not exist in this checkout. Reported,
  not absorbed, not faked. It remains open.
- I read `apps/api/src/publications.ts` (two greps, `:194-200` and the `authenticated.` uses) —
  beyond my packet's read list, inside the original packet's `readonly` list. I did it to answer
  a question outcome 2 explicitly asks ("say which type it is"). I state it rather than pretend
  the compiler told me everything.
- Three of my first four "gate" runs were not gates: `02-red-load01-a1` (rc 127, broken),
  and two obs-l3 runs that were deliberate probes. I named them by step and attempt and never
  overwrote one, so the record is auditable — but a reader skimming the log directory sees
  **28 files** for what is, in the end, three branches, one fixture and one rename. **Log
  volume is not evidence quality.**
