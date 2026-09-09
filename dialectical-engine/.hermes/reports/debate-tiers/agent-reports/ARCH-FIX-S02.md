# Self-report — seat ARCH-FIX-S02 · node ARCH-FIX(S02) pass 2 of 3 · ticket `t_ffb56aba` · 2026-09-09

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886`, fresh Opus 5 subagent, no resume. Main tree HEAD
`59d64179`, 101 dirty at CLAIM (other missions'). Lane `slice/tiers-s02` @ `7f89f7b7`,
`git status --porcelain` **0 before and after every probe**. 27 tool calls end to end, ~3 wasted (§3).
Wall clock 23:05 → 23:35 EEST.

---

## 1. The body: one death, and it is not the one the verdict named

ARCH-REV(S02) pass 1 killed this plan for B1 — two of R15's seven RED tests authored after the fix.
That is real, it is three members deep, and it is fixed. But B1 is a **symptom**. The autopsy of all
thirteen findings this pass touched puts eleven of them in **two** causes, and neither is "the seat
was careless".

### Cause 1 — a document described a mechanism the author had not executed (7 of 13 findings)

B1(a), B1(b), B1(c), N2, N6, N7, F-6.

The through-line is exact. Every one of these is a place where the plan **narrates** what a command
or an expression will do, and the narration is wrong in a way that one execution would have exposed:

| Finding | The sentence | What executing it says |
|---|---|---|
| B1 (b) | "fails with the column absent" | `migrate(pool)` reads `migrations/` **from disk** (`packages/db/src/index.ts:767-796`). With `0061` written first, two of the four cases are green before they are authored. |
| B1 (a) | "S02-C2-S7 · No run on a refusal (**RED frame 6 of R15's list**)" | The step sits *after* three build steps. The plan named its own frame and then placed it where a frame cannot exist. |
| N7 | `roster.flatMap((modelId) => discoveredPanel.filter(...))` | Emits a member twice per duplicate model id, so `panelSize` exceeds the roster size and frozen R4's equality breaks. |
| F-6 | `grep -rn ': AskRequest = {\|as AskRequest' tests` — published as a verbatim REV command | **0 hits, rc=1.** A BRE pipe is literal, and `grep` here is `ugrep 7.8.4`. A REV seat would have passed R13's second half on an empty set and reported it as evidence. |

ARCH(S02)'s own self-report §5(d) diagnosed this class — *"a document that describes a mechanism the
author did not run"* — and prescribed the fix: *"every planning node runs at least one command
against the code it is describing, and pastes the output."* **That seat ran nine commands and still
shipped four members of the class**, because the nine were the ones it *chose* to run. The
prescription has no trigger.

**The upgrade, and it is mechanical.** The trigger is syntactic, not judgemental:

1. **Every `grep`, every `vitest` filter and every shell line a plan publishes for another seat to
   run is executed by the authoring seat, and its `rc` + first line of output is pasted beside it.**
   Not the commands the seat found useful — the commands the *document publishes*. F-6 was one
   invocation away for two passes and neither the author nor a blind reviewer ran it, because the
   reviewer re-ran the *cluster* commands (§5) and the ask-literal grep lives in §7.
2. **Every code snippet a plan puts in a fenced block is executed against one adversarial input
   before it ships.** N7 needed a four-member panel with one repeated `model_id`; the plan had
   already *written down* that the shape emits twice and then classified the consequence as out of
   scope rather than changing one word (`filter` → `find`).
3. **A step that names its own RED frame ("RED frame 6 of R15's list") must be reachable from the
   step ORDER, and that is checkable by a parser, not by a reader.** The frames are declared; the
   authoring step and the running step are declared; the order is declared. A 20-line script that
   asserts *authoring step index < first implementation step index, per cluster* would have caught
   all three members of B1 at freeze time, in under a second.

**Price of this class on this mission so far:** one full REWORK round — a blind ARCH-REV pass
(~35 min, ~60k tokens) plus this ARCH-FIX pass (~30 min, ~75k tokens) — plus the two RED frames a
BUILD seat would have failed to produce, which `REV(S02)` would have had to reject or excuse. Call it
**~2 h and ~135k tokens for defects that three commands would have surfaced.**

### Cause 2 — a citation was measured once, in one tree, and then carried (5 of 13)

N3, N4 (eight members), N5, F-7, and D-A3/D-A5's pointers.

Three distinct sub-causes, and they want three different fixes:

- **Lane vs main tree (N3, N5).** `.hermes/TOOLING-TRAPS.md:1041` exists in the main tree and not in
  the lane (3016 lines vs 1034). `ADR-0023` is free in the lane and taken in the main tree. Both are
  the *same* fault: **a seat measured a shared, append-only, main-tree-owned resource from inside its
  own worktree.** The remedy is a rule with a checkable shape: *TRAPS entries are cited by heading;
  ADR numbers are measured in the main tree; both facts belong in `COMMON.md`, not discovered per
  mission.*
- **Line drift inside a file that is still being written (N4.1, N4.2, N4.4, N4.5, N4.6, N4.8).** Six
  of the eight N4 members are ±1 to ±7 lines. Not one of them was a *wrong claim*; every one was a
  right claim with a stale pointer. **The cheapest structural fix is to stop citing lines for things
  that have names.** `tests/unit/api.test.ts:13` should have been "the `fixtureDiscoveredPanel`
  import"; `migrations/0040:4318` should have been "the `jsonb_array_length(p_run->'discoveredPanel')`
  expression". A grep-able token survives an edit; a line number does not. The exception — and it is
  the one N4.6 proves — is when the *position* is the fact: `$13` appearing **twice** in one VALUES
  list is not expressible as a name, and that is the member that would actually have cost a BUILD
  seat a debugging session.
- **A number computed against a base that another slice moves (F-7, mine to raise).** C2, C3 and C4
  all rebase onto S01 before they run, and S01's own cluster adds one case to `api.test.ts` and one
  to `contract.test.ts`. Pass 1's `53 passed (53)` and `41 passed (41)` were arithmetic over the
  pre-rebase base. A BUILD seat reaching `55` against a plan saying `53` either stops or fudges.
  **Nobody was wrong here** — the author's packet did not name S01's PLAN and the blind reviewer
  recorded reading S01's files as UNVERIFIED. The defect is in the *packet graph*: two lanes that
  serialize share a base, and no node owned the arithmetic across the seam.

**Price:** N4 alone is eight measurements. One of them (N4.1, the import specifier) was the costliest
by the reviewer's own reckoning — a seat copying `imported from apps/api/src/index.ts, as
tests/unit/api.test.ts:13 does` writes a relative import, gets a second module instance, and debugs a
phantom. Estimate one wasted cluster and ~40 min. F-7 would have cost one confused handoff per
post-rebase cluster: three clusters, ~30 min each.

### The finding that has no cause here, and is worth naming

**N8.** The plan wrote *"This plan does not guess them"* and then, six pages later, wrote
`<the roster export>[ask.plan_tier]` — an index signature — and compared `.free`/`.premium` with
`toEqual`. That is not a mechanism failure and not a citation failure: **it is a promise the document
made and then broke in its own body, and only a reader holding both pages at once can see it.** No
parser catches it. The remedy that does is to forbid the promise: a plan may not say "I do not know
X"; it must either pin X with a citation or name the step that blocks until X is read. Revision 2
pins `PLAN_TIER_ROSTERS` from `slices/S01/PLAN.md:226-236` **and** keeps S02-M4 as a BLOCKED-on-
mismatch gate — belt and braces, because S01's plan is not frozen either.

---

## 2. What I nearly got wrong

- **I nearly renumbered cluster C1's steps.** Putting the suite first *reads* like S1 should become
  the suite and S3 the migration. Every citation of `S02-C1-S1` in `DECISIONS.md`, in the two trace
  tables and in the ARCH-REV verdict would then have silently pointed at a different step — and the
  verdict is a frozen record, so half of them could not be fixed. **Reordering with the ids pinned
  costs one sentence in the cluster heading; renumbering costs a mission's citation graph.** The
  general rule: *ids are addresses, and an address that is reused is worse than an address that is
  out of order.*
- **I nearly left F-7 alone as out of scope.** My packet says "no step added beyond the findings",
  and F-7 is not in my finding list. It surfaced only because charge 6 (N8) authorized reading
  `slices/S01/PLAN.md` at cluster S01-C1 — and there, three lines apart, sat the two cases that move
  my green targets. **The honest test I applied: does closing it ADD scope, or make an existing step
  checkable?** It makes S02-M3 (which already existed) measure instead of assume, and it changes no
  cluster's delta. That is repair, not scope. If I had been wrong about that test, the cost would
  have been a finding against me at pass 3 — cheaper than a BUILD seat gating on a wrong number.
- **I nearly wrote the corrected grep into a markdown TABLE cell.** In a table the pipe must be
  escaped as `\|`, and every agent reads this file as raw text, not rendered — so the seat would have
  copied `\|` into a shell where `-E` makes it a literal backslash-pipe. Caught while typing it. The
  command now lives in a fenced block in `PLAN.md` §7 and the DECISIONS row points at it instead of
  repeating it. **This is the same family as F-6 itself, one layer up**, and this repo already has
  two TRAPS headings for it (`## The escaped pipe is CONSUMER-DEPENDENT …`, `## The escaped pipe does
  not just return the wrong answer …`).
- **I nearly accepted "C3 has two RED-at-base cases" as self-evident.** It is only true because the
  roster export does not exist yet; the *scans* (cases 2 and 3) are green at base and stay green
  forever. Writing the four-row base-state table forced me to notice that C3's RED-ness is S01's
  absence, not S02's work — which is exactly the sentence N6 asked for and is a different claim from
  the one I first drafted.

---

## 3. What cost tokens, measured

| What | Cost | Cause | Fix |
|---|---|---|---|
| One failed `Edit` — the S02-M3 block did not match because a closing parenthesis sat inside the sentence, not after it | 1 re-Read + 1 retry, ~4k tokens | I reconstructed a 17-line `old_string` from the earlier full-file Read instead of re-reading the eight lines I was about to replace. Over ~600 lines of context the eye normalises punctuation. | For an `old_string` longer than ~5 lines, re-Read that exact range first. One 300-token read beats one 4k-token failed edit, and the ratio gets worse as the block grows. |
| Two rounds on the trace table's R4 attribution | ~3k tokens | I fixed §3b's ranges (what N1 asked for) and only then noticed §3's R4 row still pointed at `S02-C4-S3`, a step whose content I had just moved out. **A trace table is a JOIN, and editing one side without re-deriving the other leaves a dangling row that the parser cannot see** — the parser checks *existence*, not *truth*. | The parser answers "is every step named?"; nothing answers "does the named step still do that?". A second 15-line check — for each forward row, assert the named step's TEXT contains the requirement id — would close it. Worth adding to the probe kit. |
| Writing the "Probes 8–12" block above the numbered list it belongs after | 1 corrective edit pair, ~3k tokens | I anchored the insert on the section header rather than on the last item of the list. | Anchor an append on the LAST line of the thing you are appending to, never on its first. |

**Nothing else was wasted.** What kept this run at 27 calls for a 668 → 1037-line revision, thirteen
findings and eleven DECISIONS rows:

- **One `.sh` file per purpose, each printing lane / HEAD / dirty on its first line and dirty on its
  last.** `measure.sh` answered eight findings in one call. `clusters.sh` re-ran six commands in one
  call, in 34 seconds. The receipts and the verification arrived together, and the byte-cleanliness
  proof came free. ARCH(S02) recommended this; it is worth making the packet template's default.
- **The reviewer left an executable parser in `probes/`.** Running `trace.py` against my own revision
  turned N1 from an argument into a diff — and it caught a defect the verdict had not named (the four
  merge steps were invisible to it because they used `**S02-M1.**` rather than the `**S02-M1 · …**`
  form every other step uses). **A verdict that ships a script is worth three verdicts that ship
  prose.**

---

## 4. The upgrade list, ordered by how much it saves

1. **Execute what you publish.** Any command, filter or snippet a planning document hands to another
   seat is run by the authoring seat, with `rc` and first output line pasted beside it. Catches F-6,
   B1(b), N7 — and it is the same prescription ARCH(S02) wrote and could not trigger, so make it a
   `packet-check.sh` gate: *count the fenced commands in the artifact; count the pasted rc lines;
   they must match.*
2. **A RED-order linter, ~20 lines.** Per cluster, assert `index(authoring step) < index(first
   implementation step)` and that every frame the SPEC names is attributed to an authoring step. All
   three members of B1 and all of N2 fall to it, at freeze time, for free. This is the single highest
   value item on this list: B1 is the only BLOCKING finding of this node and it is entirely
   mechanical.
3. **Cite by name, not by line, wherever the thing has a name.** Six of N4's eight members evaporate.
   Keep line citations only where POSITION is the fact (N4.6's twin `$13`) and say so.
4. **`COMMON.md` gains a five-line "measuring across trees" block**: TRAPS by heading; ADR numbers in
   the main tree; append-only files re-measured at use; **and the shell forms that work here** —
   `grep` is `ugrep`, a BRE pipe is literal, an ERE `{` must be escaped, `--include=*.ts` explodes
   under zsh. ARCH(S02) asked for the last one after paying for it twice; I paid for a new member of
   the same family (F-6) one pass later. **It is being rediscovered, not read, because the reading
   floor tells a seat to read TRAPS as an INDEX and an index line carries the name of the trap, not
   its fix.**
5. **Give the seam between two serialized slices an owner.** F-7 exists because S02's numbers depend
   on S01's cluster and no node held both. Either the orchestrator re-baselines at the merge (which
   is what Revision 2's S02-M3 item 4 now does) or the second slice's ARCH packet names the first
   slice's PLAN as an input. Today it names neither, and the cost lands on a BUILD seat mid-cluster.

---

## 5. Toward the one-prompt machine

**(a) The blind reviewer's most valuable output was not the verdict — it was `probes/`.** Six files:
a re-run script, its output, a trace parser, its output, a case-enumerator, its output. I consumed all
six and re-ran two of them. **The verdict told me what was wrong; the probes let me prove I had fixed
it, in the reviewer's own terms, without re-deriving the reviewer's method.** A one-prompt machine
should make this the contract: *a REV node's deliverable is a verdict AND the executable that produced
it*, and the FIX node's handoff quotes that executable's output before and after. That single rule
converts the review loop from argument to diff, and it is why this pass could answer N1 with a
parser dump instead of a paragraph.

**(b) The three-artifact split (SPEC frozen / PLAN revisable / DECISIONS append-only) works, and its
one sharp edge is worth naming.** Three findings this pass (N4.4, N4.7, N3) landed on `DECISIONS.md`
rows that are append-only by law. The right move is an appended correction block that names the row,
re-measures the pointer, and states that the row's CLAIM is unchanged — which is what I wrote. But
nothing in the skills says that, and the obvious wrong move (edit the row, it's just a line number)
is one keystroke away and destroys the record. **`heartbeat-architecture` should carry the sentence:
"a stale pointer in an append-only file is corrected by an appended re-measurement that names the row,
never by editing it."**

**(c) The most expensive thing in this repo is still a mechanism nobody ran.** ARCH(S02) said it about
`migrations/0040_account_erasure.sql`. This pass says it about four more: `migrate()` reading the
migrations directory from disk, `ugrep` masquerading as `grep`, `$13` appearing twice in a hand-numbered
VALUES list, and `ContractHttpError` prefixing the code onto the message. **Every one of them is
four lines of source that no document named and that changes what a plan means.** The pattern is
sharp enough to automate: *for every function a plan's step depends on, the plan quotes the four lines
that make its claim true.* Revision 2 does this in six places and it is the reason its steps are
falsifiable rather than plausible.

**(d) The cheapest gate in this whole system is a step-order check, and it does not exist.** RED-first
is stated in the spine (§3.5), stated in `heartbeat-worker`, stated in `heartbeat-architecture`,
restated at `PLAN.md:173-174` by the very plan that then broke it, and enforced by nothing. It is
**purely syntactic**: does the step that authors the test come before the step that writes the code?
Every seat re-reads the law; no seat can violate it invisibly if a script reads the plan. **A machine
that states a law five times and checks it zero times is paying five times for nothing.** If one thing
from this pass goes into the spine, it is that gates work and reminders do not — which this mission's
own memory already records from 2026-08-29, and which B1 proves again on a fresh mission six weeks
later.

**(e) On making it one prompt: the seam, not the seat, is where the cost is.** Nothing in this pass
was hard because a seat lacked skill. B1, N7 and F-6 are one-line fixes. N4 is eight `awk` calls.
What made them findings is that they crossed a boundary nobody owned — plan↔code (Cause 1),
lane↔main-tree (N3, N5), slice↔slice (F-7), page↔page inside one document (N8). **A one-prompt machine
gets cheaper by naming an owner for every seam, not by making the nodes smarter.** Four seams, four
owners, and this REWORK round does not happen.

---

## 6. Where THIS packet was unclear, exactly

- **Charge 6, N6: "names its two RED-at-base cases".** Ambiguous in a way that matters. Read one way
  it means "the two cases that are RED at base" (cases 1 and 4 — they read an export S01 has not
  merged); read the other it means "the two cases that are measurable at base" (cases 2 and 3 — the
  scans, both GREEN). I resolved it against the verdict's own measurement ("two of the four already
  hold") and wrote a four-row table stating all four, which answers both readings. **One clause would
  fix it: "…names which of its four cases are RED at base and why, given the verdict measured two of
  them GREEN."**
- **Charge 3, B1: "sweep C3 and C4 for the same shape (C4's S3 adds a case inside its build step —
  decide, and state it)".** "Decide" is right, but the packet does not say what the two options are,
  and one of them is not obviously available: moving the case out requires knowing it is RED at base,
  which needs a measurement the packet does not name. I measured it (`apps/api/src/index.ts:1293`
  does not contain `planTier`) and moved it. **A packet that says "decide" should name the
  measurement that settles the decision.**
- **The `allowed` list vs finding F-7.** My contract is exhaustive and my charges say "no step added
  beyond the findings", yet charge 6 sends me into `slices/S01/PLAN.md` — where a genuine defect in
  MY file is visible. The packet has no rule for "you were authorized to read X and X invalidates
  your own numbers". I treated it as repair (it makes an existing step measure instead of assume) and
  raised it as a finding with its own VERDICT/CONFIDENCE/COUNTER. **The packet template should say
  which of the two it wants: a finding raised and left, or a finding raised and closed.**
- **Not unclear, and rare enough to say:** charge 5 named `tests/unit/api.test.ts:5` / `:10` and the
  twin `$13` at `packages/db/src/index.ts:1250` *with the reason each mattered*. Both were exactly
  right, both were verifiable in one `awk`, and the twin `$13` is the single member of N4 that would
  have cost a BUILD seat real time. **A packet charge that carries the mechanism, not just the
  pointer, is worth five that carry the pointer.**
