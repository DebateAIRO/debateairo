# Self-report — seat ARCH-REV-S02-p2 · node ARCH-REV(S02) pass 2 of 3 · ticket `t_1dc7049a`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat ARCH-REV-S02-p2, 2026-09-09 23:39–00:0x EEST, session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886`
(subagent). Main tree `697ebf8a`, 97 dirty (untouched). Lane `slice/tiers-s02` @ `7f89f7b7`,
`git status --porcelain` = 0 before and after every probe. Verdict: **PASS, pass 2 of 3**, eight
non-blocking findings, zero blocking.

---

## 1. The body: what actually killed time on this pass

**Cause 1 — the freeze commit does not contain the artifact it is named for, so my first ten minutes
went to forensics instead of review.** My packet §1 states a rule: *"the freeze commits (COMMON §6 row
`freeze commits`; `git diff --stat <previous>..<latest> -- docs/missions/debate-tiers` is exactly what
the seat under review changed)"*. It is false at these commits. `697ebf8a` — the commit the DISPATCHED
comment names as the freeze, whose own subject line reads *"ARCH-FIX(S02) READY — PLAN S02 Revision 2
(1042 lines)"* — **contains no PLAN.md at all** (7 files, none of them the plan). The Revision-2
payload landed in `e7350ee4`, titled *"MOCK(S01) READY …"*, a commit for a different node of a
different slice. Diffing as the packet instructs mixes 205 lines of S01 `MOCK.md` into "what the seat
under review changed".

- **Price:** ~8 minutes and four extra git invocations to reconstruct the real boundary
  (`git log --oneline -- <path>`, then `git diff e6b24748..e7350ee4 -- slices/S02`). Then a second
  pass to confirm the seat had NOT written outside its `allowed` list, which was the actual question.
- **Root cause, and it is already a named trap:** `git add -A` in a tree two sessions are writing.
  `.hermes/TOOLING-TRAPS.md` carries it as *"## git add -A in a tree that two sessions are writing
  (2026-09-02, cost: three files committed under wrong messages)"*. The ARCH-FIX seat reported the
  live recurrence in its own handoff line 32 and correctly made no git writes. **The trap is written
  down and it fired anyway** — which is the finding that matters. A trap entry is not a control.
- **The upgrade:** the orchestrator's freeze step should `git add` the seat's `allowed` paths by name,
  never `-A`, and `packet-check.sh` should assert that the commit it is about to name as a freeze
  actually contains the artifact the packet sends the reviewer to read. That is one `git show --stat |
  grep -q` and it converts a ten-minute forensic detour into an error at dispatch.

**Cause 2 — `grep` on this machine is TWO different binaries, and which one you get depends on how
you run it.** This is the single most expensive thing I found, and it has been silently taxing this
mission for at least two passes.

- Inline in a harness Bash call, `grep` is a **shell function** installed by Claude Code's shell
  snapshot (`/Users/vladmihaimiron/.claude/shell-snapshots/snapshot-zsh-*.sh`) that execs
  `claude -G --ignore-files --hidden -I …` with `ARGV0=ugrep` → **ugrep 7.8.4**.
- From a `.sh` file — which **every packet in this mission requires** ("run the plan's cluster
  commands there from a `.sh` file") — the function is not inherited and `grep` is `/usr/bin/grep` →
  **BSD grep 2.6.0-FreeBSD**.
- So the ARCH-FIX seat measured `grep --version` and honestly recorded `ugrep 7.8.4`; I measured it
  honestly in the same lane at the same commit and got BSD grep. **Both measurements are correct.**
  The plan then published the ugrep-only half of the diagnosis as an unconditional fact about "this
  Mac", and one of its two consequences (`-E` with an unescaped `{` is a hard error) is simply false
  under the binary a `.sh`-running seat gets — I measured rc=0 and the same six hits.
- **Price to me:** ~15 minutes and three probes, because the first symptom I saw was a *contradiction*
  (`grep --version` disagreeing with the plan's measured claim), and a reviewer must resolve a
  contradiction before it can grade anything downstream of it. **Price to the fleet, unmeasured but
  larger:** every "your grep answered differently from mine" disagreement between a Claude seat and a
  Codex/Grok seat, and every command a seat validated inline and then published for someone to run
  from a script.
- **The upgrade, and it is cheap:** a TRAPS entry that names the split, not the binary — *the grep you
  get inline is not the grep you get from a `.sh` file* — plus one rule every published command obeys:
  **alternation is `-E` with braces backslash-escaped, or a BRE with backslash-escaped pipes, never a
  bare pipe.** That rule is safe under BOTH binaries; I verified it on a fixture with a ground truth I
  controlled. DECISIONS row D-F6 already states the rule correctly; only its stated cause is half a
  machine.

**Cause 3 — arithmetic done in prose is not evidence, and it slipped through a pass whose whole
subject was arithmetic.** `PLAN.md:810-811` sums five suites for S02-V1 and gets `3 failed | 63 passed
(66)`. Running the published command myself: `3 failed | 65 passed (68)`. The sum added the three
`s14-contract` failures to 63 and forgot `s14-contract`'s two *passes*. Every input was right —
BASELINE's five per-file rows are exact, I re-measured all five. Only the addition was wrong, and it
is wrong in the one verification item whose delta is ZERO, so the number is all the content there is.
The compounding detail: the plan's *post*-rebase figure for the same command is `68`, which is exactly
the true *pre*-rebase value — the two published numbers are one S01-delta out of phase, so each is
reachable at the wrong moment.

- **The upgrade:** a plan may not publish a multi-suite total it has not RUN. Four of the five §5
  rows were run as written this pass (finding N11's fix) and every one of them is exact; the one
  figure nobody ran is the one that is wrong. **Run it or don't print it** is a smaller rule than any
  arithmetic convention, and it would have caught this at the source.

**Cause 4 — a corroborating measurement that reproduces nowhere.** `PLAN.md:967` and `DECISIONS.md:161`
both certify the S02-M4 grep form with *"verified in the lane, it answers 8 lines on
`tests/unit/api.test.ts`"*. I ran it under both grep binaries: **0 lines, rc=1**. That file at
`7f89f7b7` contains zero occurrences of `PlanTier` and zero of `PLAN_TIER_ROSTERS`. I chased the
plausible mis-attributions before calling it — `slices/S01/PLAN.md` answers 14, `slices/S02/PLAN.md`
answers 9, the lane's whole `tests/` answers 0 — and none is 8. The *claim* it supports is true; I
proved it independently on a fixture whose ground truth is 2. The receipt is not.
- **Price:** ~10 minutes, four probes, one purpose-built fixture. **Cause:** a number written from
  memory of a run rather than pasted from one, inside the finding whose entire subject is *a published
  command that answers zero and looks like a pass*. **The upgrade is mechanical:** any figure a
  planning artifact prints must come from a file under the seat's probes directory, and the artifact
  cites the file. Prose numbers are the only kind that have been wrong in this mission.

---

## 2. What I nearly got wrong

**I nearly filed the grep discrepancy as a fabrication finding against the ARCH-FIX seat.** The plan
says ugrep; I measured BSD grep in the same lane at the same commit; the fast read is "the seat made
it up". I ran `which -a grep` and `type grep` before writing anything and found the shell function —
at which point the correct finding inverted from *"the seat's measurement is false"* to *"the
environment has two greps and neither seat can know that from inside its own execution mode"*. That
one command is the difference between a false accusation against a seat and a real trap for the fleet.
**Generalisable rule, and I would put it in the reviewer contract: when a measurement disagrees with
yours, measure the MEASURING INSTRUMENT before you grade the measurer.**

**I also nearly graded `S02-V1`'s wrong total as blocking.** It is an expected value in the slice
verification list on a HIGH-risk slice, which reads blocking. It is not: the step's own gate is the
ZERO delta against the base re-measured at S02-M3, and the plan says so in bold two lines above the
bad number. Reading the step to its end rather than to its first defect is what kept the verdict
honest — and a REWORK here would have burned the last lawful pass before a V row on an arithmetic slip
that a DECISIONS fold closes in one line.

---

## 3. Dead ends — nobody re-derives these

1. **"Did the revision break the trace by widening §3b's ranges instead of fixing the steps?"** No.
   `trace.py` derives the step set from §4's own headings, independently of both tables, and expands
   ranges properly (I read the expansion code before trusting the output). 40 steps, five checks, all
   `none`. The widened ranges are real coverage.
2. **"Does adding `plan_tier` to `core.run` break a suite that asserts an exact column set?"** No.
   The only `SELECT *` in the C1/C2 cluster commands hit `memory.question_key`; the single
   `FROM core.run` read in `evaluator-database.test.ts` is a two-column projection (`:1397`), and the
   sharpest whole-row-shaped assertion in the repo (`tests/integration/database.test.ts:1087-1093`) is
   a projection too. The plan's "its 21 cases stay 21" survives.
3. **"Can the RED frame at `S02-C1-S3` be reached now that the order is reversed?"** Yes, and the
   ordering is safe in both directions: `migrate(pool)` reads the directory from disk
   (`packages/db/src/index.ts:767-796`, `readdir` `:769`, `readFile` `:783`) on a fresh embedded
   Postgres per run, so with `0061` absent all four cases fail; and because `S02-C1-S1` adds
   `'planTier'` to `0040`'s extra-key allow-list (`:4270-4275`) **before** `S02-C1-S5` puts the key in
   the payload, there is no window where the encrypted path submits a key the SQL function rejects.
4. **"Is `PLAN.md:967`'s 8 attributable to a different file?"** No — checked S01's PLAN (14), S02's
   PLAN (9), the lane's `tests/` (0). Stop looking.
5. **"Is `roster.map(find).filter()` weaker than `flatMap(filter)` in any shape?"** No. I ran both over
   ten panels — including three-providers-on-one-id, two ids doubled at once, reverse probe order, and
   a duplicate on a *missing* id. Revision-2's shape: **0** R4 violations, roster order held in all
   ten. Pass-1's shape: 2 violations. Oracle at
   `probes/ARCH-REV-S02-p2/n7-filter-oracle.out`.

---

## 4. Where THIS packet fought me, exactly

1. **§3 charge 2, "all eight of R15's frames".** Frozen `SPEC-v2.md:159-162` says R15 has **seven**
   frames, "Seven in all"; the revised C2 suite has **nine** cases. The "eight" is pass 1's *case*
   count copied forward as a *frame* count, and by dispatch time it was stale in both directions. I
   answered the charge as it was meant (does one RED run cover every case the cluster authors — yes,
   nine of nine) and filed the constant as a packet finding. **A packet must quote a frozen document's
   count from the frozen document, and re-derive any count the rework moved.**
2. **§1's freeze-commit rule** — cause 1 above. The rule is stated as a fact and is false at these
   commits; a reviewer obeying it literally reviews another slice's mock work as this seat's output.
3. **§2 `allowed` vs the probes directory** — the scratch dir is
   `scratchpad/seats/ARCH-REV-S02` (no `-p2`) while the probes dir is `probes/ARCH-REV-S02-p2/`, so
   pass 1's and pass 2's scratch collide in one directory while their probes do not. I worked around
   it by giving every file a `-p2` suffix, but two blind passes sharing a scratch directory is a
   collision waiting for a longer mission. **Make the scratch dir per-PASS, like the probes dir.**
4. **What the packet got RIGHT, and it should be copied:** charge 4 named the folds by their heading
   in `DECISIONS.md` and told me exactly what "closed" means for each (verbatim text, a line number
   fixed, three rows present). Three checks, three commands, no judgement. That is the shape of a
   charge that costs a reviewer nothing to answer honestly. Charge 5's scope rule ("a finding outside
   pass 1's closures is legal only when the revision CREATED it") is also exactly right and is why
   this pass stayed cheap — I diffed `681bc09d..e7350ee4` to establish provenance before raising
   anything, and it settled two candidate findings in one command.

---

## 5. The one-prompt machine: four upgrades, ordered by what they would have saved here

1. **Make `packet-check.sh` verify the freeze.** Assert that the commit the packet names as the freeze
   contains the artifact the packet sends the reviewer to read (`git show --stat <sha> | grep -q
   <path>`), and freeze with named paths instead of `git add -A`. Cost: two lines. Saves: the whole of
   cause 1, permanently, for every reviewer of every slice.
2. **"Run it or don't print it."** No planning artifact prints a suite total it did not run; every
   printed figure cites the probe file it came from. Cost: nothing — the seats already run the
   commands. Saves: causes 3 and 4, which are the only two defects that reached this pass in a plan
   whose every *measured* number was exact.
3. **Record the instrument, not just the reading.** A TRAPS entry for the inline-vs-`.sh` grep split,
   and a habit in the reviewer contract: when a measurement disagrees with yours, measure the
   instrument first. Cost: one entry. Saves: an unbounded number of cross-seat disagreements between
   Claude seats (ugrep) and script/Codex seats (BSD grep) — this fleet runs both by design.
4. **Carry a machine-readable closure ledger between passes.** Pass 1 produced B1 + N1…N11; pass 2
   re-verified all twelve. I did it by reading two prose documents and re-deriving each claim. A
   `closures.json` written by the FIX seat — finding id, the file:line it changed, the command that
   proves it — would let the reviewer's first act be a script that re-runs twelve proofs, and reserve
   the expensive attention for the things a script cannot see (which is where all eight of my findings
   came from: an unrun sum, an unreproducible receipt, a two-binary environment, and a label that
   contradicts itself). **The passes are converging; the per-pass reading cost is not, and that is the
   next thing to attack.**

---

## 6. Skills, and my own floor

`SKILLS LOADED: superpowers:using-superpowers · dialectical-engine:heartbeat-protocol ·
dialectical-engine:heartbeat-reviewer · superpowers:verification-before-completion` — loaded in the
packet's order, before any file beyond the packet and COMMON was opened. The two heartbeat skills were
loaded as their `dialectical-engine`-scoped variants (`.claude/skills/heartbeat-*/SKILL.md`, the files
COMMON §1 names), because every file in scope is under `dialectical-engine/`.
`superpowers:receiving-code-review` is on the reviewer floor **only when an author contests a finding**
(`heartbeat-reviewer` §1); nobody contested anything during this pass — the node is blind and the
ARCH-FIX seat is not reachable — so I did not load it, and I am recording that rather than letting it
read as a shortfall. Nothing else in the Superpowers library fit a blind planning review better than
`verification-before-completion`, which is the one I actually leaned on: every number in this verdict
is from a run in `probes/ARCH-REV-S02-p2/`, and the two I could not reproduce are reported as
unreproduced rather than softened.
