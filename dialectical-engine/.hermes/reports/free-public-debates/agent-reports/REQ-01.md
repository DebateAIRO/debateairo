# SELF-REPORT — REQ-01 · mission `free-public-debates` · node REQ, pass 1

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REQ-01, `claude-opus-5`, Agent-tool background subagent, fresh session. Wall clock from packet
open to READY: ~22 minutes. 4 skills, 15 file reads, 6 shell calls, 2 of them refused by the harness.

---

## 1. The body: where the time and the tokens actually went

**CAUSE, not symptom: the same facts are written down in four places, and a seat reads all four.**
The roster is in the intake (§R7 election), in `COMMON.md` (§6 and the laws), in my packet (§1 Node)
and now in `INSTRUCTIONS.md` (§3) because the contract told me to put it there. The baseline suite
table is in the intake, cited by `COMMON.md` §6, and the SPEC's §3 reproduces thirteen of its rows
because a SPEC must say how each suite is asserted. I read the roster three times and copied the
baseline table once. Price: ~4k tokens of re-reading here, and the same again at ARCH, at every BUILD
and at three REV lenses — call it ~25k tokens across the slice for facts that changed zero decisions.
It also guarantees drift: the first time a baseline moves, four files disagree and nobody knows which
is the record.

**The single most expensive read was one the packet ordered.** `docs/architecture/02-data-model.md:1237-1268`
is §7.6 `answer` — verdict state, confidence band, `band_ceiling`, the serve-time projection of the
envelope. It constrains nothing about tiers, publication or visibility. It is a clean DEAD END:
32 lines read, zero requirements produced, and a reviewer who re-reads my inputs will spend the same
tokens discovering the same nothing. Price: ~1.2k tokens, ~1 minute, and it is one of six inputs, so
17% of my input budget bought nothing.

**The second cost was reading the product at all.** Nine of my fifteen reads were product files, done
for one reason: to find out what this system can *observe* — which status codes exist, which typed
error strings, which table carries visibility state, what an audit row already records. That is ~9k
tokens of reading, and it is the bulk of what a REQ node does. It is also completely repeatable
work: the next REQ node on this repo will read `apps/api/src/index.ts`'s route table, the publish and
unpublish route implementations, the delete route and `transition_run_publication` again, for the
same reason.

**Two tool calls were refused outright.** `find ~/.claude -name '*.jsonl'` and `ls -d ~/.claude/projects/*/`
were both blocked by the harness permission classifier ("PII Data Handling"). I needed them only to
satisfy `COMMON.md` §2, which requires the CLAIM comment to name my own transcript file. Price: 2
round trips, ~600 tokens, and a CLAIM comment carrying a five-line explanation of why a required
field is UNVERIFIED — which every reader of that ticket now pays to read.

## 2. What I nearly got wrong

1. **I nearly put the Free-tier refusal in front of the grant preflight.** "Unpublish is refused for
   Free runs" reads like a guard at the top of the route. Putting it there turns
   `POST /v1/runs/{id}/unpublish` into an oracle: any signed-in user aims it at any run id and reads
   a typed Free refusal where today every non-owner gets an identical 404. I caught it only by
   reading `apps/api/src/index.ts:1161-1172` and noticing the 404 is deliberately uniform and paired
   with `auditPreflightDenial`. It is now SPEC R-13, with the cost stated (V must mint a grant before
   step 7 of the walk). Had it shipped, it would have been a security-lens REWORK at `REV(S01)`: one
   FIX node plus one more REV pass, i.e. two dispatches, on my estimate 40-60k tokens.
2. **I nearly wrote "`s7-authorization` stays RED" and stopped.** That assertion is satisfiable by a
   slice that adds three routes: still RED, different numbers. The SPEC now pins the same
   expected/actual pair (expects 50, finds 52) and R-23 pins the table at 52 entries. Without it, a
   real regression hides inside a moved baseline and nobody sees it until V does.
3. **I nearly required a new value in the visibility response's `state` field** to express "published
   is pending, this is not private by choice" (row V-2). That is exactly the back-compat class
   `docs/missions/public-debate-access/INTAKE.md:71-75` documents — a reader that parses two values
   meets a third. R-11 now demands the distinction *without* changing the meaning of `PRIVATE` and
   `PUBLISHED`.
4. **I nearly treated `plan_tier IS NULL` as Free.** ADR-0024 decision 1 and
   `migrations/0061_plan_tier_on_run.sql` make the column nullable on purpose; legacy-principal and
   pre-0061 runs read NULL. Treating NULL as Free would have published historical private debates —
   the precise thing V forbade at I-2. This is the one place the packet's input list earned its keep.

## 3. Where THIS packet was unclear — exactly

- **§1 line 10, `docs/architecture/02-data-model.md:1237-1268`.** Named as an input; decides nothing
  in this slice. An input that yields no requirement should not be in a packet, because the reading
  floor makes a seat pay for it and a reviewer pay again.
- **§1 line 10, "the product files the intake cites, at the lines it cites."** The intake cites about
  twenty `path:line` sites. Read literally, that is twenty one-line reads — and one line of a
  400-line plpgsql function tells you nothing. I read spans around each site. That was the only way
  to do the job, and it is not what the packet authorised. Packets should name spans.
- **`COMMON.md` §2, the CLAIM transcript field.** It requires an Agent-tool seat to name its
  `subagents/agent-<id>.jsonl`. A background subagent is not told its agent id, and enumerating the
  transcript directory is blocked by the harness. The law asks for a value the seat cannot legally
  obtain.
- **Charge 5.** The walk it sketches includes "see unpublish refused" but no step for the step-up
  grant that reaching the refusal requires. The packet's own acceptance sketch is not runnable as
  written; SPEC §4 steps 7-8 repair it.
- **Charge 1 vs §1 output list.** Charge 1 says a dissent goes in "the slice's DECISIONS file"; §1
  lists `DECISIONS.md` as an output to create. Both are consistent, but only because I created the
  file first. A packet that tells you to write into a file it also tells you to create should say so
  in one place.

## 4. Upgrades, ranked by tokens saved

1. **One machine-readable FACTS file per mission, and every other file cites it.**
   `.hermes/planning/<mission>/facts.md` holding: base commit, lane, the baseline suite table, the
   typecheck count, the route-table count, the listener list. `COMMON.md` §6, the intake, the SPEC
   and every packet point at it and copy nothing. *Saves:* the ~25k tokens of four-way restatement
   across this slice, and removes the drift class entirely. Biggest single win.
2. **An observables catalogue per repo.** One file listing what a test here can actually decide:
   every typed error string and its route and status, the tables that carry run visibility and audit
   rows, the public list and read endpoints, the step-up grant shape. That is 80% of what my nine
   product reads were for. *Saves:* ~9k tokens per REQ node, and more at REV, where three lenses
   re-derive the same map. This is the single change that most moves the mission toward one prompt:
   REQ could write checkable requirements without opening the product tree.
3. **Packets name SPANS and say what each input is expected to decide** ("ADR-0024:32-45 — tells you
   whether NULL binds"). An input with no stated job gets deleted at packet-check. *Saves:* the
   dead-end read, ~1.2k tokens per seat, and it makes packet-check mechanical rather than a judgement.
4. **Drop or soften the CLAIM transcript field** to `SESSION CORRELATE: <any id the harness exposes>`.
   *Saves:* two refused calls and a paragraph per Agent-tool seat, and stops an honest seat looking
   like a non-compliant one.
5. **Let a SPEC cite baseline rows by id instead of reproducing the table.** SPEC §3 exists because a
   SPEC must say how each suite is asserted — but only five of its thirteen rows carry a decision
   (the four DELTAs and the typecheck rule). The rest are "GREEN" and could be one line: "every suite
   not named below is asserted green." *Saves:* ~800 tokens per slice and one drift surface.
6. **Give REQ a worked example of a `ui: no` acceptance walk.** I spent real thought on the shape of
   §4 — how V mints grants, how a step whose outcome is unknown is phrased ("record it; a guess is
   not an outcome"). One canonical example in `heartbeat-requirements` makes that free.

## 5. What I did not verify

My own transcript path (§1, §3). I did not run any suite — REQ makes no git writes and runs no
product code, and the baselines I lean on are the orchestrator's measurement, cited not re-measured.
The route-table count of 52 is the one number I measured myself, and the command is in SPEC R-23.
