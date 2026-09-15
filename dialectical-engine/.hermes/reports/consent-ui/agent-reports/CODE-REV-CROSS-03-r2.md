# CODE-REV-CROSS-03 r2 — self-report (a murder case, not a diary)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

Seat: CODE-REV-CROSS-03, round 2, Claude Opus 5, fresh blind session. Verdict **PASS**
(0 blocking · 3 non-blocking · 8 packet findings). Worktree `.worktrees/rev-cross-03-r2`,
`git status --porcelain` = 0 at CLAIM, after every one of ten mutants, and at exit.

---

## 1. The body on the floor: what this round actually cost, and who paid

**The round itself was cheap and correct.** B1 was a one-token fix; the author shipped it, swept
four prose members, wrote two base-RED cases, and their gate figures matched mine on ten numbers
across two worktrees and two independently-written scripts. **Nothing in the shipped behaviour is
wrong.** So the interesting question is not "what broke" but "what did we spend, and on what".

| line item | price | who paid |
|---|---|---|
| **Reading TOOLING-TRAPS in full at CLAIM** (2815 lines, 5 tool calls, ~60k tokens) | the single largest fixed cost of this seat | every seat, every round |
| **A skip instruction that could not be obeyed** (P6) | ~0 this time, because §10.52's ORDERING saved it; unbounded when it does not | the reviewer |
| **A packet ordering an assertion that cannot fail** (P1) | the author's refusal + my transcript to settle it: ~15 min across two seats | author + reviewer |
| **Two wrong `path:line` constants** (P3, P4) | ~4 min of `awk` each, twice, in two different sessions | author + reviewer |
| **A gate that is RED by construction for the whole working-tree phase** (P5) | "one re-derivation" (author's words); a false `BLOCKED` on a less careful seat | the author |
| **A class scoped by ENUMERATION** (P2/N1) | one class member still wrong at HEAD; one more round to fix a single sentence | the next round |
| **My own no-op mutant** (M5) | one wasted run, ~40s — caught immediately because the harness prints its own landing proof | me |

---

## 2. CAUSE, not symptom — the three that generalise

### 2.1 The most expensive thing in this harness is a DUPLICATED ARTIFACT, not a wrong one

P6 is the finding I would keep if I could keep one. My packet ordered me to skip
`ADR-0022:211-257` until the appendix; it also ordered a mandatory ONE Read of the review package,
which contains those bytes **verbatim** (`CROSS-03-r2.diff:140-185` → new-file lines 211-257,
exactly). The instruction is unsatisfiable by construction, and the previous round filed the same
class (r1 P6(b)); COMMON §10.69 was written in response and fixed only the half it could see
(missing line ranges — mine were exact, and I verified all three).

**The cause is a category error that the fix did not name:** an ADR addendum, a DECISIONS row, and
a TRAPS entry are simultaneously (a) the author's CLAIM about the work and (b) the WORK ITSELF.
Rule §10.52 treats them as (a) and the review package treats them as (b), and both are right.

**Upgrade, and it is one line in the packet template:** *a deliverable that appears in the diff is
WORK and is read; only a seat's REPORTS about the work (the ticket comment, the self-report,
figures in BASELINE) are the appendix.* Then delete the ADR and the DECISIONS rows from every skip
list. What actually preserved blindness this round was §10.52's ORDERING — measure, write to disk,
then open — and that is the mechanism worth investing in, because it works even when a skip list is
wrong. **A skip list is a promise; an ordering is a control.**

### 2.2 A class scoped by ENUMERATION produces a green rework with the class still open

This is N1 and P2, and it is the sharpest lesson of the round. The rework packet's §0 listed the
class members: *"the helper's doc comment …, the second-pass comment, ADR-0022's (b′) addendum …,
and the `CookieConsent.tsx` sentence."* The author swept **better than the list** — they ran their
own greps, found a fifth member the list omitted, and correctly left a sixth alone. And the class
was still open at HEAD, because their greps (`Node\.contains`, `descendant`) were aimed at the
CONTAINMENT class while the finding they were also discharging (N1) belongs to a different class:
*an artifact stating its own coverage without running the mutant that would establish it.*
`ADR-0022:119-120` is a member of that second class, four screens above the one they were sent to,
and it is measurably wrong (three cases and two, not four and one — my M6/M7).

**Cause:** the packet named the members instead of the PROPERTY, and a seat obeying an exhaustive
list has no way to discover that the list is the wrong shape. `heartbeat-protocol` §2.2 already
says a finding is a SAMPLE of a class; nothing in the packet template enforces it.

**Upgrade:** every rework packet states the class as a GREPPABLE PROPERTY and orders the seat to
run the sweep and paste it — *"sweep for every sentence in any artifact that states its own test
coverage; paste the grep and rule per hit"* — never as a member list. When a list is unavoidable,
it is labelled `SAMPLE, not exhaustive` in the packet itself.

### 2.3 An assertion nobody has RUN is a specification, not a test — and packets are ordering them

P1. The packet ordered "and traps Tab" into a new case. It cannot fail: `trapTab` derives its
candidate list from the entry's container alone, so two entries sharing one node yield one list.
The author refused, correctly, with a structural argument. I settled it with an eight-position Tab
transcript, run at HEAD and under the identity-removed mutant, whose `diff` is empty.

**And the answer was already on disk, in the very file the packet quoted as its oracle.** The
round-1 probe's P5 comment says, in as many words, *"this case exists to show the Tab branch is NOT
a second, independent ranking."* COMMON §10.71 was written for this and was not applied by the
packet that cites §10.71's own probe.

**Cause:** a packet can quote a probe's NAME and its SUMMARY without opening the case body. The
existing rules (§10.59, §10.71) tell the orchestrator to read the assertions and the comments; they
do not make it OBSERVABLE whether it did.

**Upgrade, cheap and mechanical:** any packet that names a probe case as an oracle **pastes that
case's comment block into the packet**. If the comment says "this demonstrates", the packet cannot
then order it pinned without contradicting text it is holding in its hand.

---

## 3. What repeatedly cost tokens — measured, with the fix

### 3.1 TOOLING-TRAPS is now a 2880-line prologue every seat pays for, in five tool calls

The file cannot be read in one call (26k tokens > the 25k Read cap), cannot be read in two, and
each chunk is dense enough that skimming defeats the purpose. **The request already on the board
(`t_38c6bbf2`, a 20-line index) is the right fix and is now two rounds old.** I would go further,
because an index still leaves the seat choosing:

* **Split the file by SUBJECT** — `TRAPS/grep-and-locale.md`, `TRAPS/git-restore.md`,
  `TRAPS/vitest-and-mutants.md`, `TRAPS/jsdom-react.md`, `TRAPS/source-text-guards.md`,
  `TRAPS/board-cli.md` — and have the packet name the two or three a seat's files touch, plus a
  mandatory `TRAPS/INDEX.md`. My round used entries from exactly four subjects and read six.
* **Mark every SUPERSEDED entry at its own line.** `:1602-1617` ("only `input[type=hidden]` is
  refused") is corrected at `:1819`; `:2248-2258` is corrected at `:2306`; `:1852-1879` is narrowed
  at `:2017`. A reader going top-down absorbs each wrong version first. Append-only forbids editing
  the text; it does not forbid appending a one-line `> SUPERSEDED BY :NNNN` marker **beneath** it,
  and a `grep -n '^> SUPERSEDED'` then gives the whole obsolescence map in one call.

### 3.2 The three-run gate law is right and its cost is in the WRONG PLACE

Three `.sh` runs of my `gates.sh` cost ~4 minutes of wall clock and produced three byte-identical
files (`md5 8a3cb6fc98ae5fa71b52e71732ebf847`). Every mutant, by contrast, produced a NEW fact, at
~7 seconds each against the smallest file carrying the case (TRAPS `:2429`).

**The ratio is backwards.** Three runs exist to catch flake; ten mutants exist to catch the defect.
**Upgrade:** run the CLUSTER command ×3 (the law), and budget the saved attention for mutants —
and put the mutant harness in the repo. **Four seats have now written the same ~40-line
snapshot/plant/assert-landed/restore/classify script** (`CODE-S02-C3C4`'s `mut.py`,
`CODE-S01-C6`'s, the r1 reviewer's, mine). It belongs at `tests/support/` or
`.hermes/reports/consent-ui/probes/mut.py` as a promoted tool with the classification table baked
in, because every seat that rewrites it re-earns the same three bugs (non-unique anchor, no-op
plant, restore-by-inversion).

### 3.3 The scratchpad probe-runner is the fifth independently-written copy of one file

`code-rev-s01-c6-r2-probe-runner.config.ts`, `code-rev-s02-c9-r1-probe-runner.config.ts`,
`code-rev-cross-01-r1-…`, `code-rev-cross-02-r1-…`, `code-rev-cross-03-r1-…`. I copied the last one
and edited `include`, which took 30 seconds — **because the r1 seat had already taken the lane from
`LANE` (COMMON §10.35) and mirrored the lane's alias array (TRAPS `:2440`).** That is the system
working. The remaining waste is that the file is still per-seat. **Upgrade:** one
`probes/probe-runner.config.ts` that reads `LANE` **and** `PROBE` from the environment, so a seat
copies nothing and edits nothing.

---

## 4. What I NEARLY got wrong

* **I nearly shipped a NO-OP mutant as evidence.** My first M5 ("identity guarded on the first
  pass-2 iteration only") added an unused local and left the predicate untouched. It printed
  `SURVIVED | Tests 28 passed (28)` — which reads exactly like "the three-sharer case is a
  duplicate", the opposite of the truth. What caught it was my harness printing `plant-landed=True`
  and my noticing that byte-landing is not behaviour-landing (TRAPS `:1682`, `:1520`). **The
  general rule the traps file has not quite stated: `plant-landed` must be a claim about the
  RUNTIME, not about the bytes.** A harness cannot check that automatically, but it can print the
  planted region so the author reads what they actually planted — mine now would.
* **I nearly filed `ADR-0022:191` ("Pinned by four cases") as an unfixed member.** It is the
  superseded (b′) addendum, which ADR law forbids editing; the correction at `:241` is the right
  shape. My round-1 predecessor predicted exactly this mistake in its own predictions paragraph,
  and I only avoided it because I read the ADR's structure before greping it. **A blind lens should
  be told, once, in COMMON: "in an ADR, a wrong sentence under a superseded heading is not a
  finding; a wrong sentence with no correction below it is."**
* **I nearly recorded the packet's `TOOLING-TRAPS at dispatch: 2814` as a defect.** My structural
  reading said the pre-append file ended at `:2814` with a blank at `:2815`, which is a one-line
  ambiguity in an untracked append-only file. I wrote it up as "consistent, not refuted" and let the
  author's own `wc -l` close it at the appendix step. **That is the shape §2.7 asks for and it cost
  one paragraph instead of one false finding** — TRAPS `:962`'s lesson (a refutation carries the
  same evidence bar as an assertion) working as intended.

---

## 5. DEAD ENDS — do not re-derive these

* **Do not try to make a `Tab` assertion discriminate the tiebreak for a shared-container pair.**
  `trapTab` reads `entry.read().containerRef.current` and nothing else (`modalSemantics.ts:120`),
  so the candidate list is a function of the CONTAINER, not of the entry. Measured over all eight
  starting positions, forwards and backwards, at HEAD and under the mutant: the transcripts are
  byte-identical. No shim helps (contrast TRAPS `:2017`, where shimming
  `compareDocumentPosition` DID rescue an "unpinnable" claim) — here the branch does not read a DOM
  primitive at all. **The nested pair is where Tab discriminates**, and that case already exists.
* **Do not write a fixture for `!container.isConnected` in pass 2.** It is unreachable, the proof is
  now in the comment, and removing it survives the whole suite (my M3 = r1's M6). r1's N2 said this;
  I re-derived it under the NEW predicate because the line it defers to changed, and it still holds.
  **That re-derivation is the part worth copying: a proof about line N is invalidated by any edit to
  line N+1, and nothing flags it.**
* **Do not "fix" `run_c9`'s two merge arms from a CROSS ticket.** `--scrim:` is mode-independent and
  declared once; the closing marker reads `=== end consent-ui S02 ===` so `'=== consent-ui S02 ==='`
  can never be 2. Ticketed (`t_4f97ca86`), diagnosed independently three times now, and
  `globals.css` is blob-identical at both revisions of this commit.

---

## 6. Where THIS packet was unclear — exactly

1. **`CODE-REV-CROSS-03-R2.md:5`** — the skip range for `ADR-0022:211-257` is exact and
   unsatisfiable, because `:10`'s mandatory review-package Read delivers the same bytes (P6).
2. **`:5` vs `:25`** — `S02/DECISIONS.md:217-219` is on the skip list AND on the class-member
   checklist, with "a member still saying … is a finding" (P8). Two instructions, one artifact,
   opposite verbs.
3. **`:12` and `:16`** — the `.review-scratch/` grant is still in the template one full round after
   the r1 reviewer filed it and wrote, at TRAPS `:2809-2814`, *"Delete the grant from the template,
   or a seat will obey it."* Its only effect is to invite files into the tree under review (P7).
4. **`:13` vs `:24`/`:29`** — `git checkout HEAD -- <path>` in the forbidden clause, `cp` + `diff -q`
   in the charges. Both lawful in a detached review worktree (§10.44); a packet should name one.
5. **What was EXCELLENT and should be copied verbatim into every review packet:** §4's per-charge
   structure with the expected figure beside each ("expected `6 passed (6)` … and `2 failed | 4
   passed (6)` with the identity term removed"), the md5 check ordered on the promoted probe, the
   explicit `RULE whether this reasoning is right` charge (which turned an argument into a
   measurement), and §3's requirement that every finding carry `VERDICT / CONFIDENCE / STRONGEST
   COUNTER`. Writing the strongest counter is what made me apportion N1 mostly to the packet
   instead of to the author.

---

## 7. Toward the one-prompt machine — five upgrades, ordered by measured value

1. **Make the ORDERING the control, not the skip list.** Every review packet's step 1 becomes:
   *"measure, write `<scratch>/MEASURED-FIRST.md`, THEN open anything a seat wrote."* Blindness then
   survives a wrong skip list, a leaked file, and a diff that quotes the author's own prose — all
   three of which have now happened in this mission. Delete the skip lists for artifacts that appear
   in the diff.
2. **Scope every class by a GREPPABLE PROPERTY and order the sweep to be pasted.** §2.2 is law and
   is discharged today by prose. One line — *"paste the sweep command and its full output, and rule
   per hit"* — turns it into something a reviewer checks mechanically. N1 exists because a list was
   used where a property was needed.
3. **Promote the shared tools.** `mut.py` (four independent copies) and the probe-runner config
   (five). Both are ~40 lines, both encode traps that cost real rounds, and both are re-derived by
   every seat. Ship them under `.hermes/reports/consent-ui/probes/` with a `MODELS: / DOES NOT
   MODEL:` header and a two-line usage note.
4. **Index and supersede-mark TOOLING-TRAPS.** It is the largest fixed cost per seat and it now
   contains at least four entries whose universal claims are corrected later in the same file. An
   index plus `> SUPERSEDED BY :NNNN` markers is one seat-hour and every seat after it pays less.
5. **Give the gates a `--since` mode.** Nine of my ten gate figures were "at pin" and could have been
   asserted by a single script that knows BASELINE's table. The reviewer's attention belongs on the
   two that MOVED (195 → 197, 112 → 114) and on the mutants. A `gates.sh` that prints
   `AT PIN (9) / MOVED (2): …` would cut a third of every review's output tokens without losing a
   single fact.

**One last observation about what is already working, because a case file that only lists wounds is
misleading.** The two most valuable pages of this round — the r1 probe run byte-untouched, and the
author's four TRAPS entries — existed because two previous seats wrote artifacts for a stranger
rather than for themselves. The probe inverted cleanly under a one-token fix; the traps entries
predicted three of my own findings. **Artifacts written for the next seat are the highest-yield
tokens this fleet spends**, and every mechanism above is a way of spending more of them on purpose.

---

## 8. Receipts

* Verdict: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/reviews/CODE-REV-CROSS-03-r2.md` (756 lines)
* Probe kit: `.hermes/reports/consent-ui/probes/code-rev-cross-03-r2-*`
* Scratch (not a deliverable): `<scratchpad>/CODE-REV-CROSS-03-r2/` — `MEASURED-FIRST.md`,
  `gates.sh`, `mut.py`, `logs/`, `snap/`, `probes/`
* Lane state: `git status --porcelain` = **0** at CLAIM, after each of ten mutants, and at exit.
  No git write of any kind; no file created in the lane; no file created under `tests/`.
* Sub-delegation: **none**. No `Explore` child, no subagent.
