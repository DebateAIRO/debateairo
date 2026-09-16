# cont-final-review — self-report (REV(WHOLE-BRANCH), blind second lens)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: `cont-final-review` · node REV(WHOLE-BRANCH) · pass 1 of 1 · Opus 5 · tip `bb5faade`.
Vantage: I read all 88 product+test files of the range before opening any record, so what follows is the view from the *outside* of the process that produced them.

---

## The body: where this mission actually bled

I counted the causes named in the ledger's own 19 task entries. The distribution is not close.

| cause | fix rounds it forced | share |
|---|---|---|
| **a defect in the packet the seat was handed** | ~60 charged defects across 19 tasks; 11 of the 13 fix rounds | dominant |
| a defect in the worker's own code | 2 (T15's mid-round claim-guard regressions, self-caught) | marginal |
| the environment (Node 26 vs declared 22.23.1) | 0 rounds, but **100 of the 141 gate reds** | dominant, silent |

**The workers were not the problem. The instructions were.** That is the finding, and everything below is a consequence of it.

---

## CAUSE 1 — the packet asserted measurements as constants

Not "the packet had typos". The packet repeatedly told the seat *what it would find*: "three sites", "the audit lists 3 violations", "0061 line 10", "four members", "no double keys on round", "`numTotalTestSuites` is the file count", "the dry run names a laptop path". Each was a number or a fact the orchestrator had not re-measured at that base. Each cost one dispatch, one gate and one review.

The orchestrator diagnosed this correctly at Task 1 (ledger `:24`): *"expectations are MEASUREMENTS to take, never values to confirm."* **And packet defects continued at the same rate through Task 19.** A rule adopted in prose did not change behaviour across eighteen more packets.

**Price.** Conservatively 11 fix rounds × (packet rewrite + dispatch + cluster gate + review) — the largest single line item in the mission's wall clock and token spend, larger than the gates.

**Upgrade — mechanical, not cultural.** `packet-lint` already exists and already checks paths. Extend it to **refuse any packet containing a bare cardinal, a `:LINE` anchor, or an "there are N …" claim unless it is tagged `MEASURE:`**. A packet that says `MEASURE: how many members the class has` cannot be wrong; a packet that says "four members" was wrong six times. This is a ~40-line change to an existing script and it is the highest-ROI item in this document.

---

## CAUSE 2 — "who reads this string" is keyed on names; the readers that bite are keyed on shapes

Four separate fix rounds, one class:

- **T11** — a prompt *sentence* was a provider double's dispatch key. Changing the sentence misrouted 23 fixtures in one file. The grep was for the symbol, not for the sentence.
- **T13** — a **new emission** joined a collection that suites pin exactly. No name changed, so no grep fired.
- **T15 round 2** — a **count pin** (`toHaveLength(47)`) carries no name at all. The WHO-READS law's two limbs are name-keyed; a count is nameless. This one cost a full extra 47-minute gate.
- **T16** — a **field-name pin reached through a CLI fixture**, outside the reader set built from direct importers.

The T15 seat wrote the missing limb in a trap: *"grep the PRODUCER, then check each hit for a size assertion."* That is the right answer and it is buried in `TOOLING-TRAPS.md`.

**Upgrade.** Make it a tool, not a trap. `who-reads <symbol|literal|emission>` with three limbs: (1) name references, (2) collections the thing joins → every exact pin of that collection, (3) the producer's size/shape assertions. Every packet's reader set is then generated, not hand-grepped. This class alone is ~4 fix rounds.

---

## CAUSE 3 — 71% of the gate is one unfixed environment fact

Every task carried the named fact *"Node 26.5.0 (declared 22.23.1; unverified there)"*. **100 of the 141 reds at the gate of record are `localStorage` rows in `tests/render`** — Node 26's web-storage global shadowing jsdom. Nobody could act on it; every seat had to carry it, attribute around it, and exclude it.

The cost is not the 100 rows. The cost is that **Task 9 exists** — a whole task about attribution, ablation, three-hash rules and undetermined rows, most of which is work created by not being able to trust the gate. And ~4 real reds stay masked behind those 100.

**Upgrade.** Run the declared runtime. This is the single highest-leverage change available and it is an afternoon of operator time, not engineering.

---

## CAUSE 4 — the mission ran serial because of a harness limitation, not a design choice

Ledger `:20`: lanes were abandoned at 04:2x. Subagents inherit the parent's worktree-isolation pin (Bash *and* Write refused in sibling worktrees); the harness's own `isolation: worktree` would have branched from `origin/main` (V2, the wrong tree) unless `worktree.baseRef=head`; that settings write was denied as self-modification. **Nineteen tasks then ran one at a time.**

This is the biggest structural cost in the range and none of it was avoidable *in-run*.

**Upgrade for the one-prompt machine.** Pre-create the lane worktrees from the correct base **before** the run starts, as part of mission setup, and hand each seat a worktree it already owns. No in-run settings change, no isolation conflict, and the disjoint-cluster law in `heartbeat-orchestrator §1` becomes usable instead of aspirational. Tasks 2, 3 and 8 were provably disjoint and ran serially for no reason but plumbing.

---

## CAUSE 5 — the gate is 47 minutes and was paid at least four times

Full-suite gates at `96e3c91c`, `78e89ea4`, `6cdc14b2`, `c1c08bd7` ≈ **3 hours of wall clock**, plus one entirely wasted 45-minute run because `pnpm test -- --reporter` forwards a bare `--` (Task 9's trap).

**Upgrade.** Two tiers. Per task: the *affected* suites, derived from `who-reads` (Cause 2), minutes not hours. Per phase: one full gate. And wrap the invocation — `pnpm run gate` — so the flag form that silently swallows the reporter cannot be typed.

---

## What I nearly got wrong (three, honestly)

1. **A false Critical, one command from being filed.** I checked `ls web/` at the *repo root*, got "No such file or directory", and was about to report `tests/support/shipped-corpus.manifest.txt:398` as listing a deleted file. The manifest is rooted at `dialectical-engine/`, where `web/next.config.mjs` is tracked — and the plan's Global Constraints explicitly reserve it ("the single leftover `web/next.config.mjs` stays"). **Lesson: resolve a manifest entry from the manifest's own root, never from your cwd.**
2. **A false behaviour-change finding.** I flagged `ServeRepository.persist`'s move from `COALESCE(priorAnswer?.answer_id, gen_random_uuid())` to a pre-computed `answerId`, reasoning that `supersedes` with no prior row would now reuse the caller's id. It cannot: `SUPERSEDED_ANSWER_NOT_FOUND` at `packages/serve/src/index.ts:2061-2063` refuses first. **I only saw the guard because I read 14 lines above what the diff showed me — the `-U6` package was too narrow at that hunk.** A security-relevant diff should ship at `-U15` or with whole-function context.
3. **A severity I would have overstated.** I had the Grok sandbox downgrade at Critical before reading the ledger. It is a *ruled* outcome (F-GROK outcome 2), loud, on the handle, and already a V veto row; only the missing retry is unowned, which is Important. **The packet's blind-then-reconcile order — package first, ledger second — is what corrected me.** Keep that order; it works.

---

## Dead ends, so nobody re-derives them

- **Do not re-run a suite to compute a gate delta.** `comm -23 / -13` over the two `*-failures.txt` files is exact and takes one second. I re-derived the entire `6cdc14b2 → c1c08bd7` delta this way and it matched the ledger name-for-name.
- **Do not try to alias a module to reach the W6 fixtures.** They are **spawned by path**, not imported; no `resolve.alias` reaches them. Copy the test file plus its fixtures into a scratch directory and run `vitest run --root <scratch>` — one command, under a minute, and the shipped assertions run unmodified against the mutant.
- **`bash tools/board-lint.sh` from `dialectical-engine/` does not exist.** The instrument is at `.hermes/reports/<mission>/tools/board-lint.sh` and the board is `.hermes/reports/<mission>/board/`.
- **`git status --porcelain` is not enough to prove a mutant was safe.** Do it before *and* after, and keep the mutant in the scratchpad tree, never in a worktree path.

---

## Where this packet fought me

1. **Lens 6 named `tools/board-lint.sh` over `board/`.** Neither path resolves from the seat's cwd. The records seat charged the orchestrator this exact defect at ledger `:156` and it survived into the next packet — which is Cause 1 happening to the reviewer.
2. **Lens 6 treats `board-lint` rc=0 as the guarantee.** It skips every `F*-*.md`: **173 of 226 tickets unvalidated**, while printing `OK (226 files)`. A packet that names an instrument should name its blind spot, or the reviewer inherits a false floor.
3. **The rubric puts Quality last, which is wrong for a clean branch.** Lenses 1–6 are all satisfied here. Both of my most useful findings (F1 the missing sandbox retry, F3 the non-recursive coverage counter) came from lens 7. A reviewer facing a clean branch should be told to spend the *tail* of the budget on quality, not to treat it as the leftover.

---

## The one-prompt machine: six upgrades, ranked by return

1. **`packet-lint` refuses untagged numerals and line anchors** (`MEASURE:` or nothing). Kills ~60 packet defects and most of 11 fix rounds. ~40 lines.
2. **Run the declared Node 22.23.1.** Removes 71% of gate noise and un-masks ~4 real reds. Operator time, no code.
3. **`who-reads` as a tool with three limbs** (names · collections-joined · producer size assertions). Kills the 4-fix-round reader-set class. Half a day.
4. **Pre-created lane worktrees at mission setup.** Restores parallelism the harness blocked in-run. Setup change only.
5. **Two-tier gating** (affected suites per task, full suite per phase) + a `pnpm run gate` wrapper. Recovers ~2 of the ~3 gate hours.
6. **Ship review packages at `-U15`** for any hunk under `packages/crypto`, `packages/db`, `migrations/` or a `persist`/`read` path. One flag; it nearly cost me a false finding and could just as easily hide a real one.

**The through-line:** every one of these converts a rule that currently lives in prose — in a packet, a trap file or a decision record — into something a machine enforces. This mission proved that the seats obey rules reliably and that *writing a rule down does not make the next packet obey it*. The upgrade is not more discipline. It is fewer places where discipline is the only guard.

---

comments read through: 0 (no Hermes board in this continuation; the SDD ledger is the board and carries no comment threads).
