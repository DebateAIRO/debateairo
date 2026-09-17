# Self-report — seat `ARCH-S01`, node `ARCH(S01)` pass 1, mission `debate-tiers`, ticket `t_dfd8f52d`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886`, 2026-09-09, model claude-opus-5. Lane
`.worktrees/tiers-s01/dialectical-engine` @ `7f89f7b7`, 0 dirty entries before and after every run.

---

## 1. The body: three facts that decide this slice were in none of the documents I was given

`SPEC-v2.md` had been through two REQ passes and two REQ-REV passes. `BASELINE.md` had been
re-measured four times. Between them they name every suite this slice touches, with counts. And the
three facts that actually determine how S01 can be built and verified were in neither, because
**neither document asks a question whose answer they are.**

| # | Fact | Where it was hiding | What it changes |
|---|---|---|---|
| **F1** | `tests/render/ux01-new-debate-form.test.tsx` cannot render `/new` at all. All 7 failures are one stderr — `Invalid hook call` — from the suite's own `vi.mock("react", …)` at `:57-61`. The only passing case is the one that renders nothing. | The suite's own log. Nobody had opened it; the count was in `BASELINE.md` (1/8) and read as "7 inherited failures". | R1, R2, R4–R6, R8–R10 are all rendered behaviour. The SPEC's primary verification instrument for this UI slice **does not work**. The plan moves every rendered case to a new suite on the `sup-04-widget` harness (8/8 at base). |
| **F2** | The guard SPEC R16 and a `DECISIONS.md` row both cite as the thing keeping the Free lock out of `submit` is **vacuous**: `v2ui-pages.test.ts:83` slices `indexOf("async function submit")`=4717 to `indexOf("return (")`=2191 → **length 0**. It asserts nothing, for any page. | A two-second `node -e`. | R16's first bullet has never been verified. Step S01-31 repairs it with the file's own `region()` helper, which throws on an empty region. |
| **F3** | The tail of `apps/ui/app/globals.css` is contractually closed. `consent-s02-style-contract.test.ts:248-249` (10/10 green) requires nothing but whitespace after the consent-S02 close marker at `:8980`; `consent-bar.test.tsx:270-280` (7/7 green) says the same from its side. | Two suites that appear in **no requirement of this mission**. | S01's CSS goes before `:8188`, not at end-of-file — which is what the two most recent slices in this repo both did, so the precedent is the trap. ADR-0023. |

And the fourth, which is the class the other three are instances of:

**F4 — seventeen standing suites read a file S01 writes, have no `BASELINE.md` row, and are named in
no requirement. Eight of them are RED at base for other missions' reasons.** A coding seat measuring
one of those eight for the first time mid-cluster reads inherited failures as its own.

---

## 2. Cause, not symptom

### Cause 1 — baselines are indexed by *suites a requirement names*, never by *files the slice writes*

This is structural, not an oversight. `R19` was written by asking "which suites does this slice's
behaviour touch?" — a question about *requirements*. The question that produces F3 and F4 is "which
standing tests READ the files this slice WRITES?" — a question about *the tree*. The second question
is a two-second sweep. Nobody had asked it, because nothing in the process asks it.

`.hermes/TOOLING-TRAPS.md` **already contains this exact lesson**, under §"Disjoint WRITE surfaces do
not imply independent EFFECTS", written 2026-08-29, with the sentence *"The missing question: which
STANDING tests READ the files each slice WRITES?"* It has been in the file for eleven days, it was
read this session (as an index), and the mission still shipped a SPEC and a BASELINE without it.
**A trap recorded in prose is not a control.** That is the single most important line in this report.

### Cause 2 — a suite's count is treated as its health, and a count cannot say "the harness is dead"

`ux01` is `1/8` in `BASELINE.md`, in `INSTRUCTIONS.md`'s baseline table, and in `SPEC-v2.md` R19.
Three documents, four re-measurements, three seats, one number — and the number is compatible with
both "seven known behavioural failures" and "the file can verify nothing". The REQ node then built
the verification of ten requirements on it. **Cost: two REQ passes and one REQ-REV pass reasoned
about a dead instrument.** No document was wrong; every one of them was silent in the same place.

### Cause 3 — guards are never run against input designed to make them lie

F2 is variant 9 of a family `TOOLING-TRAPS` has recorded eight variants of, with a standing summary
section. And **I produced variant 10 myself, in this session, after reading that file** — see §4.
The family is documented and unenforced.

---

## 3. Price

Wall-clock and runs are measured; token figures are a proxy (I cannot read my own meter), given as
the count of expensive operations, which is what actually drives spend here.

| Finding | Cost to FIND (this seat) | Cost if it had reached the coding seat |
|---|---|---|
| F1 harness dead | 1 background suite run (~90 s) + 1 `grep` of the log | The C3 seat writes 8 RED-first cases, all fail for a reason that is not its diff, and cannot tell RED from BROKEN. `TOOLING-TRAPS` records this shape costing "one seat's fifth block". Est. **1 cluster block + 1 rework round**. |
| F2 vacuous guard | one `node -e`, ~2 s | Never found. R16 stays "verified" by a case that cannot fail, permanently. Cost is silent and unbounded. |
| F3 closed CSS tail | reader sweep (~2 s) + 2 `grep`s | The C4 seat reds two green suites from another mission, in a file it legitimately owns, with no requirement mentioning either. Est. **1 cluster block**. |
| F4 seventeen unmeasured readers | 1 background run, ~4 min, 17 suites | Any of the 8 RED-at-base ones read as self-inflicted. Est. **1 block per occurrence**. |
| My own `run_suites` v1 defect (§4) | caught by running the checker on known-bad input, ~30 s | Cluster C3's command reports RED at base forever, on a correct tree. Est. **1 block, plus the seat disbelieving its own green tree**. |

**Total measurement spend for the whole pass: 4 background script runs, ~9 minutes wall-clock, 0
dirty entries.** That is the entire cost of the four findings. It is cheap because it is mechanical —
which is the argument for §6.

---

## 4. What I nearly got wrong — including one I should not have done at all

1. **I typed a stray token (`testsis-a-typo`) into cluster C2's command, and then wrote a paragraph
   explaining it as a deliberate marker instead of deleting it.** I caught it on re-read and removed
   both. This is the worst thing in this pass and it is not a tooling failure: a model that
   rationalises its own error into a feature will do it again where nobody re-reads. Recording it
   verbatim so it is on the record. **The general shape: when output contains something I did not
   intend, the reflex must be delete, never explain.**
2. **I nearly wrote every cluster command as one multi-path `vitest run`** — compact, readable, and
   silently drops a path that does not exist. `TOOLING-TRAPS:1102` stopped me. But I opened that
   section because it *looked* relevant, not because anything required it. That is luck.
3. **I nearly trusted R16's guard**, because the SPEC and `DECISIONS.md` both cite it as settled and
   the case is green. I only checked it because I was computing line offsets for a different step.
   Two documents agreeing is not evidence; both were quoting the same unverified thing.
4. **I nearly appended S01's CSS at the end of `globals.css`**, following the two most recent slices'
   precedent. The precedent is what the guards were written to close.
5. **`run_suites` v1: I defaulted the `failed` field to 0 and forgot the `passed` field.** vitest
   prints `Tests  2 failed (2)` with no `passed` field when nothing passes, so `sup-04-mounts` (0/2 at
   base, forever) parsed as `passed=`, and cluster C3 reported RED on a correct tree. Found only
   because I ran the checker against six inputs including known-bad ones before shipping it —
   `TOOLING-TRAPS` §"Validate a checker on known-GOOD input, not only known-bad", applied to my own
   work about twenty minutes after reading it.

---

## 5. Dead ends — named so nobody re-derives them

- **`s14-contract`'s FX-ORPH-04 failure is not fixable here and has nothing to do with tiers.**
  `tools/orphan-audit/src/index.ts:130` reads `web/lib/v3Presentation.ts`; `web/` was deleted
  2026-09-01. That is why the case is RED at base. Do not investigate it from a tier slice.
- **Adding `plan_tier` to `AskRequestSchema` cannot affect the orphan audit's
  `servedWithoutConsumer` / `consumedWithoutServed`.** `served` is `inventory.resources.AnswerSchema`
  and nothing else (`tools/orphan-audit/src/index.ts:132`). I checked because "S01 touches the
  contract, s14 is RED" invites the connection. There is none.
- **A new export in `packages/contract/src/index.ts` does reach `@debateai/contract`.** The package's
  `exports` field points at `./generated/client.ts`, which is generated as
  `export * from "../src/index.js"` (`packages/contract/src/generate.ts:34-40`). Worth the two
  minutes only because the `exports` field makes it look otherwise.
- **`grep -c` for the 13 ask literals is correct here**, because each `steering_annotations` marker is
  on its own line (verified with `-n`). `-c` counts lines, not occurrences — true in general, not a
  defect in this instance.
- **The `role-token-map` suite does not auto-enumerate selectors.** It carries a fixed
  `RoleExpectation[]`, so a new `.nd*` rule does not silently require a row. Its 3 base failures are
  DebateMap/DebateCanvas rows, unrelated.

---

## 6. What to upgrade — four mechanical controls, in cost order

Each replaces a prose trap with something that runs. All four are small.

1. **Put the reader sweep in lane setup.** `setup-worktrees.sh` already measures the SPEC-named
   suites. Add: for every file any SPEC names as a write surface, `grep -rl` it across `tests/` and
   `acceptance/`, and measure every suite found. ~2 seconds; it produces F3 and F4 with no human.
   This is the highest-value change in this report.
2. **Baseline rows carry a failure REASON class, one line, not just a count.** `ux01 1/8` becomes
   `ux01 1/8 — all 7 failures: "Invalid hook call", suite's own vi.mock("react") — the render harness
   is dead`. The measuring script can capture the first stderr line per failing suite automatically.
   This surfaces F1 at intake instead of at architecture, before a SPEC is written on top of it.
3. **A `guard-vacuity` audit.** Sweep `tests/` for `slice(indexOf(a), indexOf(b))` and assert the
   second index exceeds the first. Ten lines. It finds F2 and every future instance of the family
   whose eight recorded variants have not stopped a ninth.
4. **Teach `packet-check.sh` the three command laws that already exist in `TOOLING-TRAPS` and are
   enforced nowhere:** reject a multi-path `vitest run` in a cluster command; require the
   capture-first idiom (`out=$(...); rc=$?`); require a per-suite expected pair rather than a pooled
   total. All three are laws today and all three are honour-system.

**The through-line:** `TOOLING-TRAPS.md` is ~3000 lines and is read as an index by contract. It has
become a place where lessons are *stored* rather than *applied* — this session read it and then
reproduced one of its documented families anyway. Every recurring family in it should graduate to a
check that runs, and then leave the document. A trap that has recurred three times is not a trap any
more; it is a missing lint.

## 7. Toward one prompt

What this node actually needed that a single prompt could have supplied, in priority order:

1. **A measured tree, not a described one.** Every expensive thing here came from the gap between
   what documents said about the tree and what the tree does. The upgrades in §6 close that gap at
   intake, before any SPEC is frozen — which is the point in the pipeline where the correction is
   one edit instead of a supersession block.
2. **Baselines keyed by file, not by requirement.** One sweep at lane setup replaces the judgement
   call "which suites matter?" with an enumeration. Judgement calls are what a one-prompt machine
   cannot make reliably; enumerations are what it is good at.
3. **Verdict vocabulary in the runner, not in the seat's head.** GREEN / RED / BROKEN should come out
   of the command, per suite, with BROKEN reserved for "did not run". My `run_suites` does this and
   should be the mission's shared runner, emitted by the orchestrator into every packet rather than
   re-derived per seat — I re-derived it, and got it wrong once.
4. **An explicit rule for the TDD-vs-base contradiction.** A cluster command that names the test file
   its own first step creates cannot run at base. The packet ordered "run every cluster command at
   base and record RED vs BROKEN", which for a TDD cluster is unsatisfiable as written. I resolved it
   by running with the new-file paths omitted and saying so. The protocol should state the rule once.

---

## 8. Where THIS packet was unclear, exactly

| Where | The problem | What I did |
|---|---|---|
| Charge 5 | "Run every cluster command at base … record RED (TDD) vs BROKEN" — but each cluster's command names the test file that cluster's first step creates, and `TOOLING-TRAPS` classifies a missing path as BROKEN. So every TDD cluster is forced to a BROKEN verdict, or to a command that omits its own new suite. | Ran each command with the not-yet-existing paths omitted, and recorded in `PLAN.md` §4 exactly which path was omitted from which command and why. The protocol should rule this once. |
| §1 inputs vs charge 1 | §1 says "the code surface the SPEC names"; charge 1 enumerates a narrower list. The SPEC cites more than charge 1 lists — `apps/api/src/index.ts:288-297, :512-520, :905` for R14, and six test files. R14 is unplannable without them. | Read the SPEC's own citations and said so here. Suggest the floor read "the SPEC's citations are the floor" rather than a hand-copied subset that can drift from the SPEC it serves. |
| Nothing anywhere | Neither the packet, COMMON, nor `heartbeat-architecture` says whether the ARCH seat may open a V row, what number to use, or which file to write it in. The role contract says contested questions "go up as decision rows with your recommendation" without naming a destination. | Followed the REQ seat's precedent: wrote row **V-15** in full in `slices/S01/DECISIONS.md`, backtick-free per REQ-REV-p1 finding N1, for the orchestrator to transcribe. Suggest COMMON §2 state it. |
| Charge 3 | Asks the `## Screens` block to name "the locked state of every gauge" while `DONE.md` — which defines what locked looks like — does not exist yet. The line between "state the mock must draw" and "appearance V rules" is left to the seat. | Wrote the inventory (six screens × two modes, the components each reuses by path, the tokens each consumes) and a separate "what the app lacks" list, and made no appearance claim. Worth stating in the template. |
| Not a defect, worth keeping | Charge 4's instruction to assert the DELTA per case and never the absolute is the single most useful line in this packet. It is what forced the per-suite `passed:failed` pair, which is what caught my own runner bug. | — |

---

## 9. Addendum, 22:38 — §8's third row stopped being hypothetical while this report was being written

The gap I filed as "nothing says whether an ARCH seat may open a V row, at what number, in which
file" produced a live collision within the hour, twice, in two different global namespaces:

- **V-row ids.** `ARCH(S02)` wrote `V-ROW: V-15` and `V-16` (`slices/S02/DECISIONS.md:108, :123`);
  this node wrote `V-ROW: V-15` (`slices/S01/DECISIONS.md:141`). Both landed in the same orchestrator
  commit `681bc09d`. Neither seat did anything wrong: two concurrent architecture seats read the same
  `V-DECISIONS-PACKET.md` (highest `V-14`) and took the next number. Resolution proposed in an
  appended correction: S02 keeps `V-15`/`V-16`, S01's becomes `V-17`.
- **ADR numbers.** The orchestrator's note at 22:32 reported `ADR-0023` "TAKEN twice". Re-measured, it
  was not: `git log --all` for that path is empty, the file is untracked, its mtime is `22:29:08` —
  three minutes *before* the note — and it carries this seat's own authorship row. **The orchestrator
  was reading the file this seat had just written and counting it as a pre-existing occupant.**
  `ARCH(S02)`'s ADR had meanwhile been renumbered to `0024`, so the only real effect was a
  renumbering nobody needed.

**The cause is one thing, and it is not carelessness:** row ids and ADR numbers are scarce *global*
names, allocated by *discovery at write time*, by seats that run concurrently and cannot see each
other. Discovery-at-write-time is a read-modify-write with no lock; concurrency makes collisions
certain, not unlikely. This packet already got the ADR half right — it allocated `ADR-0023-*.md` at
dispatch — and the failure was the orchestrator not trusting its own allocation once a file appeared
at it.

**Upgrade, and it belongs in §6 as item 5:** the packet allocates every global name the seat may
need — its ADR number *and* its V-row ids — at dispatch, and a seat never scans a directory or a
packet to pick one. Cost: two lines per packet. Cost of not doing it, measured today: one spurious
renumber, one duplicate row id in a committed record, and one orchestrator note that had to be
disproved with `git log` before it could be answered.
