# ARCH-S02-HYGIENE — self-report (mission `consent-ui`, slice S02, ticket `t_3f776526`)

Seat: architecture, docs-only, one round, no rework. Claimed 2026-09-06 at HEAD `2b670d30`,
dirty 90 (unchanged at exit — the whole `docs/missions/consent-ui/` tree is untracked, so this
seat adds no `git status` entry). Wall clock ≈ 35 min. Retries 0. Blockers 0.
Deliverable: 3 line-preserving edits to `slices/S02/PLAN.md` + 1 appended `DECISIONS.md` entry.

## The case

**CAUSE 1 — the remedy I was told to apply carried a count that does not reproduce, and
transcribing it would have shipped the very defect it was fixing.**
N15's remedy reads "give the sentence its command (`grep -c 'GREEN before and after' PLAN.md`
— the reviewer measured 4 hits)". Measured here, in the tool shell and in a `/bin/bash`
script, both: **5**. The fifth is the refutation-table row for `S02-S32` at `:2151`; the
reviewer's `grep -n` listing shows four line numbers and stops before the tables. Had I
written "4" into the plan I would have committed **the exact N14 class inside the fix for
N15** — a count transcribed instead of re-run — in the same session that corrects four of
them. Price of catching it: one `grep -n`, ~90 seconds. Price of not catching it: a rework
round on a plan the coding fleet is already reading. This is the **third** measured instance
in this mission of a reviewer's remedy CONSTANT being wrong (`COMMON.md` §10.21, §10.22);
the class is not "reviewers are careless", it is **constants travel and measurements do not**.

**CAUSE 2 — the packet offered two options and one of them is unlawful under a standing rule
in the same packet.** N15: "give the sentence its command … **or** drop the count and keep the
rule." Option A cannot be taken: the command string *contains* the phrase `GREEN before and
after`, so writing it into `PLAN.md` raises the count the sentence states from 5 to 6 — the
literal §10.28 trap ("a grep for `:407` prints nothing" written into the file makes it print
one line"). Only option B is lawful. Cost here: ~5 min of reasoning that the packet could have
spent one clause on. **Upgrade:** when a packet offers alternatives, it marks any branch that a
standing law forbids, or it does not offer it.

**CAUSE 3 — line-count preservation was a hard constraint that nothing stated.**
`PLAN.md` is cited by line number by the packet (`:2068`, `:291`, `:126-127`), by the verdict
(~15 more), by `DECISIONS.md`, and by the coding packets the fleet is reading **right now**.
Inserting one line into a 2224-line plan silently invalidates every citation below it, with no
error anywhere. I inferred the constraint and met it (2224 → 2224; the DECISIONS diff is a pure
append, `190a191,192`), which cost ≈ 10 min of fitting a rewritten sentence into exactly the
3 lines it replaced and a rewritten rule into exactly 2. **Proposed `COMMON.md` §10.30:** an
edit to a document that other live documents cite by line number is line-count-preserving, or
the orchestrator re-measures every citation to it before the next seat reads it. State it in
the packet, and the seat stops re-deriving it.

**CAUSE 4 — the packet enumerated the lines to change but not the lines that DESCRIBE those
lines.** Fixing `:2068` (N13) falsifies `PLAN.md:300-304`, the paragraph that declares this very
residual "reported and **NOT repaired here** … carried to the handoff as a candidate finding
rather than fixed". §10.27 says the ripple a class forces is DECLARED, not forbidden — but the
packet AND the dispatch both said, twice and emphatically, "never edit any step text beyond the
named lines". I obeyed the narrower instruction and filed the staleness as a finding rather than
taking authorisation I was not given. **Cost: one follow-up ticket that a five-word clause in
the packet would have avoided.** Rule: *a packet that orders a residual repaired also names the
paragraph that declared the residual.*

**CAUSE 5 — the verdict swept the finding it named, not the class beside it.** N14 named two
wrong counts in the ADR CORRECTION entry. There are **four**, plus a wrong command attribution:
`ADR-0020` in `PLAN.md` measures **1** (the entry claims `0`), and the mission-graph claim
"`ADR-0022` → 2, `ADR-0020` → 0" measures **4** and **3**. The class is *every count in that
entry*, not *the counts a reader happened to check*. §2.2 exists for this and the reviewer half-
applied it. All four are corrected in the one appended entry, each beside its command.

**NEAR MISS.** The packet says "the surviving mention at `:291` is prose about reservations —
rewrite that sentence". That sentence is soft-wrapped across `:291-293`, and its third line
carries the clause "this plan's original `0019`/`0020` pair was a collision", which is *also*
false under the corrected measurement (`0019` collided; `0020`, with 0 references, did not). A
seat that edited only the cited line would have left a false clause two lines below the fix.
**Rule: cite a wrapped sentence by its full range, measured (§10.24), never by its first line.**

## Dead ends (do not re-derive)

- `ADR-0020` cannot be purged from `PLAN.md`: the corrected reservation sentence must name it to
  say the `translation` mission does **not** reserve it. `grep -c 'ADR-0020' PLAN.md` → **1** is
  the correct steady state, not `0`. The round-2 entry's "`0` after" was never achievable.
- `.hermes/reports/consent-ui/mission-graph-S02.md`: its three `ADR-0020` mentions are all
  "renumbered FROM `0020` TO `0022`" prose and are correct as text — do not "fix" them. Its
  `:158` row is what needs an edit (false "`ADR-0019`/`ADR-0020` are reserved" premise + the
  stale "8 references in `PLAN.md` and 2 here"). Outside this seat's `allowed` list.
- Splitting a shell command across a soft line break in `PLAN.md` prose (the file already does
  it at `:288-289` for `ls`) makes the command uncopyable — a newline terminates it in bash.
  Every command I wrote sits on one physical line, which is why two lines run to ~135 chars
  (in family: 48 prose lines already exceed 100, the longest is 262).

## What repeatedly costs tokens, and the one-prompt-machine upgrade

The single largest cost in this seat — and the cause of three of this mission's findings — is
**re-deriving numbers that the packet states as constants.** Every seat pays it, and the seats
that skip it ship the N8/N14 class.

**Upgrade, concrete and cheap:** the packet ships its constants as an executable file, not as
prose. I wrote exactly that in ~4 minutes —
`scratchpad/arch-s02-hygiene-r1/counts.sh` — twelve `grep`s, ASCII-anchored, run once inline and
once via `/bin/bash` per §10.16, printing a labelled table. One run, under a second, caught
**two** wrong numbers that the packet and the verdict had both handed me as facts. Make it law:

1. Every packet that states a count ships `packets/<SEAT>-constants.sh` containing the command
   for each one, and the seat's **first** action after `CLAIM` is to run it and paste the table.
   A constant that fails to reproduce is a finding before a single edit is made.
2. The seat's exit copies that script to `.hermes/reports/consent-ui/probes/` (§10.11), so the
   re-reviewer re-runs the *same* file rather than re-typing the greps (§10.10).
3. §10.28 grows a positive half: counts over a file live in the handoff **and in that script**,
   never in the file.

That turns "did the numbers move?" from a judgement every seat re-makes into a one-line command
every seat runs — which is the difference between a fleet and a one-prompt machine.

## Where THIS packet was unclear (exactly)

1. §The edits item 3 offers an option (`give the sentence its command`) that §10.28 forbids —
   see CAUSE 2. It should name option B as the only lawful one.
2. It cites `:291` for a sentence that spans `:291-293` — see NEAR MISS.
3. It is silent on line-count preservation, which is the binding constraint on every edit it
   orders — see CAUSE 3.
4. It orders `:2068` repaired without naming `:300-304`, the paragraph that declares that repair
   undone — see CAUSE 4.
5. Ordering conflict, harmless here but worth fixing once: the dispatch says "post `CLAIM`
   BEFORE reading anything else"; the packet says "board `consent-ui` · ticket `t_3f776526` ·
   slice `t_9ccf3598` · **read both before CLAIM**". I followed the dispatch (§10.29 is the
   newer law) and read the slice ticket immediately after. §10.29 should be amended to
   "CLAIM is step 0; the two tickets are read immediately after it, and the CLAIM says so."

Everything else in the packet was exact, and the pre-edit snapshots (§10.26) made "nothing else
changed" a two-line `diff` instead of a grep argument. Keep both.
