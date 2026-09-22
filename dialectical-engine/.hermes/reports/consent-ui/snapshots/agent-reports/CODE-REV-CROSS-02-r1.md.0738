# Self-report — CODE-REV-CROSS-02, round 1 (mission `consent-ui`, ticket `t_b29567cd`)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn
> this into a one prompt machine even better.

Seat: blind Opus 5 reviewer of `c334136d` (CROSS-02), also round 2 of CODE-REV-S02-C9's B1.
Verdict: **PASS**, B1 **DISCHARGED**, 6 N-findings, 12 packet findings, 0 blocking.
Wall clock: ~05:41 → ~06:0x. Roughly 40 tool calls. No rework round opened, no seat blocked.

---

## 1. The body on the floor: what nearly went wrong, and what did

### 1.1 The blind was already broken before I read a line of code — twice, through MANDATORY reads

This is the finding I would fix first, and it is worth more than every code finding in my verdict.

COMMON §10.52 says the author's numbers go in an appendix a blind lens opens LAST. COMMON §10.54 was
written eight hours ago because a required read handed the CROSS-01 reviewer the author's unverified
figures. **Both were defeated again, by two different channels, before I could do anything about it:**

1. **`BASELINE.md`.** My packet's read-FIRST list (`:5`) says read it *in full*. The instruction to skip
   its `CLAIMED — UNVERIFIED` section is at `:36`, inside the **Appendix**, which by construction I open
   last. So I read `BASELINE.md:50` — *"claimed `Test Files 17 passed (17) / Tests 193 passed (193)`;
   `run_c9` vitest half claimed 110/110"* — as my fourth read of the session. Those are exactly the three
   figures I later measured.
2. **`TOOLING-TRAPS.md`.** COMMON §8 and §10.60 make it mandatory. The author appended two entries about
   **this very commit** at `:2600-2614` before I started, including their own analysis of the P4/P7
   oracle and the sentence *"the assertion the verdict quotes as RED-at-base … is not in the promoted
   file at all"*. I read the author's conclusion about the packet's central defect roughly twenty
   minutes before I measured it.

**CAUSE, not symptom.** §10.54's remedy was written as a *sentence in the packet* — "the review packet
says skip that section". A sentence placed after the reading order cannot govern the reading order. And
nobody modelled TOOLING-TRAPS at all: it is a shared, append-only, mandatory-read file that the author
under review writes to during the run. Blindness enforced by where a paragraph sits in a document is not
blindness.

**PRICE.** Zero rounds this time, because my figures matched — which is precisely the problem. Nobody
can now tell whether they matched because I measured correctly or because I was anchored. The evidential
value of this seat's three-run table is permanently reduced, and that cost is invisible and unrecoverable.

**UPGRADE — three changes, cheapest first.**
- **The exclusion moves INTO the read-FIRST list**, at the point of reading: "`BASELINE.md` — read
  §§1–4; do NOT open the `CLAIMED — UNVERIFIED` section until your appendix step." One line, in the
  right place.
- **Split the traps file: `TOOLING-TRAPS.md` (harness facts, mandatory) and `TOOLING-TRAPS-PENDING.md`
  (entries by seats whose work is still under review).** The orchestrator merges pending → main when the
  review closes. A seat may not append an entry about its own commit to a file its reviewer must read.
- **Mechanical, not procedural:** the orchestrator generates a per-seat *reading bundle* — the exact
  bytes the seat may read, with the appendix material stripped — instead of naming paths and trusting a
  reader to skip. Every §10.52/§10.54 recurrence dies here, and it costs one script.

### 1.2 The near-miss I actually caught: I almost recorded the inversion instead of testing it

My packet asked me to *"rule whether the explicit pin the author added is the right thing to ship or
whether a containment tiebreak should have stayed"*. The path of least resistance — and the one the
author took in their N-A — is to write a paragraph weighing it. I nearly did.

`heartbeat-reviewer` §2's last line stopped me: *"When a decision can be settled by a three-run experiment
instead of an argument, run the experiment."* I implemented the rival (open order + a containment-ONLY
tiebreak, never the `FOLLOWING` arm that caused B1) and ran it against everything. **190 of 193 tests in
the consent SET stay green; every cross-slice case stays green; only the three cases that exist to pin the
inversion go red.** That turned "the price of dropping the containment arm" from a claim into a costed
option V can rule on in one reading.

**Cost of the experiment: ~4 minutes and one mutant.** It is the single highest-value thing this seat did,
and both the author and — by my own prediction — the next lens would have skipped it.

**UPGRADE.** A review packet that asks a seat to *rule* on a design choice should say so in the imperative
that produces evidence: **"implement the rejected alternative and report what it costs"**, not "rule
whether X should have stayed". The words shape the output. Mine said "rule", and "rule" reads as "opine".

### 1.3 The two findings nobody else had, and why nobody had them

- **N1 — the `null`-container branch.** The shipped comment states it as a property; the mutant that
  skips instead of returning it survives all 46 of the author's cases. It is invisible to reading,
  because the line *looks* obviously right; only a mutant shows nothing holds it.
- **N3 — the promoted cross-slice suite is in NO cluster command.** COMMON §10.53 exists because B1 lived
  in the gap between single-slice suites. The fix created the integration suite — and `run_c9` still
  names ten files, none of them the new one. **The gate written to catch the class does not run the test
  written to catch the class.** It is caught only by a glob in a BASELINE command that is not a gate.

**CAUSE, common to both:** everyone diffs the CODE. Nobody diffs the *command's file list against the
files that exist*, and nobody mutates a branch that reads as self-evident. Green commands are never
audited for what they do not run.

**UPGRADE.** Add a standing, mechanical hygiene check to every cluster-gate review — three lines of
shell, no judgement required:
```
comm -13 <(cluster command's file list | sort) <(the SET's glob | sort)
```
Any file in the SET but in no cluster command is a finding at the moment it appears, not two reviews later.

---

## 2. What repeatedly cost tokens

| cause | price here | fix |
|---|---|---|
| **Mission docs live outside git.** `docs/missions/consent-ui/**` is untracked, so it does not exist in a detached review worktree. Every read is an absolute main-tree path, and one wrong relative path fails SILENTLY (COMMON §10.45's class). | 2 calls to establish which docs existed where | Say it once in COMMON §3 as a rule with the reason — "this mission's docs are untracked; in a lane they DO NOT EXIST, they are not merely stale" — beside §10.38's tracked-but-stale rule. The two cases are different and are currently one paragraph. |
| **Sprawling reading list vs. the 158-line COMMON.** COMMON has 62 numbered amendments. Most bind nobody in a given session; a reviewer reads all of them to find the four that do. | ~14k tokens of reading before the first measurement | **Tag every amendment with the roles it binds** (`[reviewer]`, `[orchestrator]`, `[worker]`) and let the packet say "COMMON §10, reviewer-tagged entries only". The content is good; the retrieval is O(n). |
| **`zsh` word-splitting and the ugrep shim.** COMMON §10.40 and TRAPS `:2587` both exist for this. I paid it once: `grep -rn 'x' --include=*.tsx` died on zsh globbing (`no matches found`). | 1 wasted call | The `--include=*.tsx` unquoted-glob failure is a *third* face of the same family (§10.40 zsh word-splitting, TRAPS `:2587` the grep function). One consolidated entry — "the tool shell is zsh with a grep FUNCTION; quote every glob, `${=VAR}` every list, and a `.sh` under `/bin/bash` is a different grep" — would retire three entries. |
| **`tsc` needs `--ignoreConfig` when files are named on the command line.** TS5112, one retry. | 1 wasted call | Worth a TRAPS line — the export-shape probe is now the *mandated* way to check a contract (TRAPS `:2565`), so every future seat that runs it will hit TS5112 exactly as I did. **I appended it.** |

**What cost nothing, and is worth copying:** the mutant harness. One `mutate.py` + one `mutants.sh` that
snapshots with `cp`, restores with `cp`, verifies with `diff -q`, and runs BOTH the author's suites and my
probe per mutant. Six mutants, one call, `git status --porcelain` = 0 throughout. Building it took longer
than running it and paid for itself at mutant three.

---

## 3. Where THIS packet was unclear, and exactly where

1. **`t_d36df457` is a mandatory deliverable that is not in the `allowed` list.** §4 orders the C9
   round-2 comment twice and the dispatch comment repeats it; §1's `allowed` names only `t_b29567cd` and
   `t_cde7254d`. I had to decide whether the enumeration or the imperative governs. **I posted, and
   declared it (P8)** — but a seat with a narrower reading of "exhaustive" would have stopped and cost a
   round. `heartbeat-reviewer` §1 already names this defect class; COMMON §10.41 already demands one
   exhaustive list. Two laws, still violated.
2. **No TOOLING-TRAPS line count at dispatch**, which COMMON §10.60 makes an orchestrator duty. "Re-read
   everything past that line" had no line. I read `:2440-2614` by inspection and guessed at the boundary.
3. **Two scratch locations in one packet.** §1 grants `.review-scratch/` inside my worktree *and* points
   at COMMON §10.11's scratchpad. §10.11 wins; the grant is dead text that invites a seat to dirty the
   worktree it must prove clean.
4. **`CMD-C6` is ordered as a gate but cannot discriminate in a detached review worktree.** Its two S02
   arms compare `slice/consent-s02` against `HEAD` — the same commit here — so both pass by construction.
   The packet should say which arms are evidence-free in the seat's own tree, or not order the gate.
5. **"the packet's ruling is (b) as stated — your ruling on the pin's wording is a finding, not a veto"**
   is the single clearest sentence in the packet and it saved me real time: it told me exactly how much
   authority I had before I spent any on deciding. **More packets should carry that sentence.**

**What the packet got RIGHT and other packets do not:** it described the work-under-review's stat
precisely — including calling `consent-policy-link.test.tsx` *"comment-only + one assertion MESSAGE"*
where the work packet said only "comment-only". A packet that is more precise than its predecessor about
the same file is how §10.61 actually lands.

---

## 4. Dead ends — do not re-derive these

- **`grep '^[-+]export'` as an exported-shape probe.** Refuted at TRAPS `:2565`. Use
  `tsc --ignoreConfig --declaration --emitDeclarationOnly --removeComments` on both revisions and `diff`
  the `.d.ts`. The `TS2307: Cannot find module 'react'` it emits from a scratch directory is **harmless**
  — React appears only in type positions and is printed verbatim into the declaration either way. Do not
  spend a call trying to resolve it.
- **The `Co-Authored-By: Claude Fable 5.1` trailer is NOT evidence of a roster violation.** It is a
  harness constant that my own Opus 5 session is instructed to emit. I spent ~10 minutes on it. Filed as
  N6 purely to close it for the next reader. **If the fleet wants model provenance in git, the seat must
  supply its own trailer; the CLI's cannot carry it.**
- **`run_c9`'s merge arms are unsatisfiable for two INDEPENDENT reasons**, not one. `--scrim` is a
  *mode-independent* token (`t9-mode-tokens.test.ts:308`), declared once in `:root`, so "2" was never
  derivable; and the S02 closing marker is spelled `=== end consent-ui S02 ===`, which does not contain
  the opening marker's literal, so that count can never reach 2 either. Both PROPERTIES hold
  (`globals.css:65`, `:7617`/`:8036`, `:7244`/`:7615`). `t_4f97ca86` is confirmed from a second seat —
  stop re-measuring it.
- **The original C9 probe's P4 and P6 do not discriminate the fix.** P4's only assertion is
  `dialogs().length === 1`, true under both rankings; P6 gives the same answer under both. **P7 is the
  oracle, and it goes RED against the fix.** Two seats have now paid for this; it is in TRAPS `:2600` and
  COMMON §10.59/§10.62.
- **`t_51101c72` IS the right home for the `CookieConsent.tsx` comment**, despite a title that reads like
  CROSS-01 residue. The orchestrator's 05:40 addendum put it there deliberately. I tried to refute the
  routing and failed.

---

## 5. Turning this into a one-prompt machine

Ranked by what each would have saved, here:

1. **Generate the reading bundle; stop naming paths.** Kills the §10.52/§10.54 recurrence class outright
   (§1.1), which is the most expensive failure in this session and the only one that damaged evidence
   rather than costing time. Everything else on this list is minutes; this one is credibility.
2. **Give every review packet a MEASUREMENT MANIFEST instead of prose charges.** My §4 was eight dense
   paragraphs; what I actually executed was a table — *gate ×3 · mutant → expected RED case · probe →
   expected outcome · constant → file:line to re-measure*. The orchestrator can emit that table
   mechanically from the work packet plus BASELINE, and a seat that receives it starts measuring on call
   three instead of call fifteen. **The prose is where the packet's own four defects hid.**
3. **Make "implement the rejected alternative" a first-class review instrument.** It is what separated my
   N2 from the author's N-A, and it is not in `heartbeat-reviewer` as a named move. Add it beside
   "probe, never read": *"when a packet makes a ruling binding, the reviewer's job is not to agree or
   disagree but to price the alternative."*
4. **Two mechanical sweeps in every cluster-gate review**, both three lines of shell, both would have
   found real defects here: (a) files in the SET but in no cluster command (**N3**); (b) every property
   asserted in a shipped comment has a mutant that reds a case (**N1**). Neither needs judgement, so
   neither should need a reviewer.
5. **Sweep the BOARD, not just the tree, when discharging a false-claim class.** `t_457c9898` is still
   `ready` and still orders a BINDING constraint whose premise died in this commit — and the false comment
   in `CookieConsent.tsx` cites that ticket as its authority. Two artefacts holding each other up, in two
   different systems. `heartbeat-protocol` §2.2 should say the class sweep covers open tickets.
6. **Keep the round cap and the blind-lens discipline exactly as they are.** Two blind seats independently
   produced the same four packet defects and identical figures on eight gates. That convergence is the
   loop's actual product, and every recommendation above is about protecting it — the anchoring leaks in
   §1.1 are dangerous precisely *because* they erode the one thing that is working.

---

## 6. Ledger

- **Artifacts:** `docs/missions/consent-ui/reviews/CODE-REV-CROSS-02-r1.md` (verdict, PASS) · this
  self-report · probe kit at `.hermes/reports/consent-ui/probes/code-rev-cross-02-r1-*` · one TOOLING-TRAPS
  entry (deduped first) · comments on `t_cde7254d`, `t_d36df457`, `t_b29567cd`.
- **Worktree:** `.worktrees/rev-cross-02/dialectical-engine` @ `c334136d`, `git status --porcelain` = 0
  entries at CLAIM and at handoff. Six mutants applied and restored by `cp` + `diff -q`; `git checkout --`
  never used. The author's lane and `rev-s02-c9` were never touched.
- **New tickets my verdict asks for:** N1 (pin the `null`-container branch) · N2 (a V-20 row, with the
  containment variant's measured cost) · N3 (`run_c9` → 11 files) · N4 (`DECISIONS.md:207`'s warrant) ·
  N5(b) (close or supersede `t_457c9898`). N5(a) is already routed on `t_51101c72`.
