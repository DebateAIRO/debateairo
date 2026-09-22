# CODE-S01-C6 — self-report (murder case)

Seat CODE-S01-C6 · mission `consent-ui` · slice S01 cluster C6 + the C5 follow-up (`t_32d4afa2`) ·
model Opus 5 · lane `.worktrees/consent-s01/dialectical-engine`, branch `slice/consent-s01`,
base `92828aa5` (verified at CLAIM, `git status --short | wc -l` = 0) · commits `abcc388d`, `ab449cba`.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

---

## 1. The three things that actually cost time, each with its CAUSE

### 1.1 `git checkout -- <path>` deleted the whole cluster's uncommitted implementation — 4 mutants lost, ~12 min

**Symptom:** after mutant M1 I restored with `git checkout -- CookieConsent.tsx CookiePreferencesCard.tsx`.
Mutants M2/M3/M4 then reported `PLANT FAILED — anchor count 0`.
**Cause, named:** the cluster's own edits were still UNCOMMITTED, so `checkout --` restored the files to
**HEAD**, i.e. it reverted the mutant *and the entire C6 wiring* in one move. `git status --porcelain`
does not catch this — the files simply drop off the modified list, which reads exactly like a clean
restore. The trap already recorded in `heartbeat-worker` §6 is that `checkout <sha> -- path` *stages*;
the bigger and unrecorded one is this.
**Price:** ~12 minutes, one re-implementation from a scratch snapshot, four wasted vitest runs.
**Fix, now in `TOOLING-TRAPS.md`:** `cp` the GREEN file to the seat's scratch dir before the first
mutant, restore with `cp`, and verify with `diff -q`, never with `git status`.
**Upgrade for the machine:** the refutation duty in `heartbeat-worker` §2 says "print `git status
--porcelain` after every restore". That instruction is actively misleading for uncommitted work. It
should read: *snapshot the green file, restore from the snapshot, and prove the restore with `diff -q`.*

### 1.2 zsh does not word-split `$VAR`, so my CLAIM-time cross-slice measurement was WRONG — ~20 min and one false statement on the board

**Symptom:** at CLAIM I ran `git log --oneline "$s02tip"..HEAD -- $P` in the tool shell and reported
"0 commits either way". The same command from a `.sh` under `/bin/bash` returned **1**.
**Cause, named:** the tool shell is zsh, and **zsh does not split an unquoted parameter expansion**.
`-- $P` passed ONE argument containing four space-separated paths. After `--` git does not error on an
unmatched pathspec — it prints nothing and exits 0. So the wrong answer arrives as a *reassuring* one.
**Price:** ~20 minutes of diagnosis, and a wrong measurement posted to the board that I had to correct.
**Class:** this is `COMMON` §10.16 arriving through **git** instead of grep. §10.16 is written as a rule
about *grep terms and glyphs*; the real rule is broader: **any command that takes a LIST is
shell-dependent, and the dual-shell check binds it too.**
**Upgrade:** amend §10.16 to "every command that greps **or takes a list**", and add the one-line
detection: if a check's answer differs between `/bin/bash` and the tool shell, the `/bin/bash` answer is
the one CI, scripts and the three-run loop will see.

### 1.3 `CMD-C6` became unsatisfiable while I worked, because it pins a MOVING branch ref — ~15 min

`CMD-C6`'s first S02 arm is `git log --oneline "$(git rev-parse slice/consent-s02)"..HEAD -- <4 paths>`,
required to be 0. Measured:

| `A` in `A..HEAD` | `n_s02c` | is `A` an ancestor of HEAD? |
|---|---|---|
| `44744d8d` — the commit actually merged into this lane | **0** | yes |
| `e0666a79` / `511d30b6` / `9cc81351` — later S02 tips | **1** | no |

The single commit counted is **the merge commit `92828aa5` itself**, which is provably TREESAME to its
S02 parent for all four paths (`git diff --stat 44744d8d 92828aa5 -- <paths>` is empty). Cause: history
simplification normally drops a merge that is TREESAME to a parent and follows that parent — but when
that parent is EXCLUDED by the range, the merge is shown as a real change against the *remaining* parent,
where the files are new.
**So the arm is satisfiable only while the other lane makes no further commit.** S02 made three during
this seat's run. This is exactly `ARCH-REV-S01` **N6**'s class ("un-passable through no act of S01's"),
which was repaired for `CMD-C5` and not for `CMD-C6`.
**Upgrade:** a cross-slice guard pins the **SHA that was merged** — a value that never moves — never a
branch ref the other lane keeps advancing. `S01-S36` already makes the seat paste that SHA on the
ticket; the command should consume that constant instead of re-deriving a different one.

---

## 2. What I NEARLY got wrong

1. **I nearly shipped a line no test could pin.** `setPolicyOpen(false)` in `openCard` was written with
   the wiring, and the case I wrote for it passed *with the line removed* (mutant M8: 11/11 both ways).
   The honest reading of `heartbeat-worker` §2 is that a line whose mutant is unobservable is not
   defensive, it is unpinned — so I deleted it and wrote the reason into the component. It is safe
   because every exit the policy has runs through the one `onClose`.
2. **I nearly asserted a requirement that cannot hold.** S01-S41 orders "focus returns to the opener,
   asserted in both directions". The SETTINGS direction passes. The BAR direction cannot: the helper
   captures `document.activeElement` in an effect, and by then S01-R14 has removed the bar, so the
   captured opener is `document.body` and the returning bar is a fresh node. Had I written the
   assertion to match the requirement and then "fixed" it by focusing from the test, I would have
   shipped a green suite over a real accessibility defect. It is FINDING **C6-F1**.
3. **I nearly reported the M1 mutant as only half-proved.** Under the DOM-order swap the S01-S40 case
   fails at its document-order *precondition*, so the behavioural arms never run. One extra evidence
   run with that arm temporarily removed produced the frame the PLAN actually asks for —
   `(b) the preferences card is STILL in the document: expected null not to be null`.

---

## 3. DEAD ENDS — do not re-derive these

- **There is no way to satisfy R18's focus return from the bar inside C6's file surface.** All four
  routes are closed: the helper's `ModalSurface` has exactly three members and is S02's; a `.focus()`
  in any S01 consent file is banned by S01-S45's class; keeping the bar mounted contradicts R14 and the
  C5 pin; and a captured reference to the old button is a detached node anyway. Do not spend another
  seat's budget looking for a fifth route.
- **`mode="read"` needs no scroll-metric stubbing.** `PrivacyPolicyModal` returns early for read mode
  (`if (!open || mode !== "consent") return undefined;`), so the elaborate `HTMLElement.prototype`
  metric shadowing that S02's behaviour suite needs is dead weight in an S01 test.
- **`consent-mount.test.tsx`'s `CookiePreferencesCard` mock renders the REAL card**, so wiring the
  helper into the card really does change that file's behaviour. It is not a mock you can wire around.

---

## 4. Where THIS packet was unclear, exactly

1. **§1's constant `git log -1 --format=%h slice/consent-s02` = `44744d8d` was already stale at
   dispatch** (`e0666a79` at CLAIM, `9cc81351` by handoff). The packet presents it as a value to
   *verify*; it is a value that *moves*. Say instead: "the merged SHA is `44744d8d`; the ref will have
   moved — report both and use the merged SHA."
2. **§2(8) asserts `consent-mount` "stays 11/11 (plus the follow-up's new cases)" while the allowed list
   confines `consent-mount.test.tsx` to the FIRST commit.** Those two sentences cannot both hold: C6's
   required wiring makes the C5 measurement case "dispatches Escape into a lane that has no listener
   yet" go RED — and that case's own comment, written by CODE-S01-C5, says "this case is expected to
   CHANGE in C6". The packet should have carried that ripple explicitly (`COMMON` §10.27: the ripple the
   class forces is DECLARED, not forbidden).
3. **The review path in the reading list is wrong.** The packet says `reviews/CODE-REV-S01-C5-r1.md`
   §4 N1 lines 230–273; `.hermes/reports/consent-ui/reviews/` does not exist. The file is at
   `docs/missions/consent-ui/reviews/CODE-REV-S01-C5-r1.md` (there is also a *different*
   `agent-reports/CODE-REV-S01-C5-r1.md`, whose lines 230–273 are past its end). A packet that names
   two files by the same basename in two trees costs a seat two reads and risks it quoting the wrong one.
4. **§2(4)'s "no `Escape` even in a COMMENT in any file under `apps/ui/components/consent/` other than
   the helper" is broader than the PLAN's own rule.** `PrivacyPolicyModal.tsx` (S02's) contains
   `addEventListener` twice; `S01-S42`/`S01-S45` exclude S02's two files **by name**. The packet's
   looser wording would make C7 unpassable. Non-blocking here; a defect for C7's packet.

---

## 5. Toward the one-prompt machine — five changes, cheapest first

1. **Ship a `mutate.sh`/`mutate.py` harness with the packet.** Every coding seat re-invents plant →
   run → capture → restore, and every seat can lose its work to §1.1. A 30-line harness that snapshots
   green, plants by anchor with a `count == 1` assertion, runs, prints the FAIL names, and restores by
   `cp` would have saved this seat ~15 minutes and would make the mutant table a machine output.
2. **Make the dual-shell check a script, not an instruction.** `run-both-shells.sh <cmd-file>` printing
   two verdicts and shouting when they differ. Both of §1.2's classes die on contact with it.
3. **Every cross-artifact constant in a packet carries its VOLATILITY.** `92828aa5` (base commit) is
   frozen; `slice/consent-s02`'s tip is live. Marking each constant `FROZEN` or `LIVE — re-measure` is
   one word per row and removes a whole class of packet defect.
4. **Give every cluster command a BROKEN arm and an EXTERNAL arm.** `CMD-C6` cannot distinguish "S01
   touched an S02 file" from "the other lane committed something". A second echoed line —
   `external=<0|1>` — would have let the orchestrator read `verdict=1 external=1` and route it in
   seconds instead of requiring this analysis.
5. **Put "what the previous cluster's tests SAY will change" in the packet.** The single forced ripple
   in this cluster was written down, in English, by the previous seat, inside the test file — and the
   packet contradicted it. A one-line grep for `expected to CHANGE in <this cluster>` across the slice's
   tests, run at packet-write time, converts that from a surprise into a listed input.

---

## 6. Cost ledger

| Item | Price |
|---|---|
| Reading (packet, COMMON, INSTRUCTIONS, SPEC R18/R20 + states table, PLAN C6 + CMD-C5/C6 + Boundaries, BASELINE, S02 DECISIONS tail, C5 review N1, probe, five source files) | ~35 min, the single largest block, and none of it wasted |
| `git checkout --` data loss (§1.1) | ~12 min |
| zsh word-splitting (§1.2) | ~20 min |
| `CMD-C6` moving-ref diagnosis (§1.3) | ~15 min |
| 9 mutants + 1 neighbour + the extra M1 evidence run | ~18 min |
| 12 three-run cluster executions (2 commands × 2 shells × 3 runs) | ~22 min |

**The dominant avoidable cost was not thinking — it was three separate shell/VCS semantics traps, all
three of which are now one-line preventable.** Two are new entries in `TOOLING-TRAPS.md`; the third is a
command-design rule that belongs in the PLAN.

---

## 7. What I could NOT verify

- **Real-browser behaviour of C6-F1.** jsdom moves focus to `<body>` when the focused element is
  removed; so does every browser I know of, but I did not run the dev stack. V's acceptance steps 11
  and 17 are where this becomes a fact. `UNVERIFIED` by me.
- **Whether the policy modal visually sits above the card.** The Esc stack is DOM-order based and is
  asserted; the z-index ladder and the scrim dimming are CSS and are V's (acceptance step 17).
- **`prefersReducedMotion()` and `openSurfaceCount()`'s behaviour under a real `matchMedia`.** jsdom
  30.0.1 has no `window.matchMedia`; the helper guards it. S02's own suite owns that surface.

---

## 8. Addendum — `COMMON.md` grew §10.40-42 during this run (read at handoff time, 138 lines)

- **§10.40 is §1.2 of this report, found independently the same night by CODE-S02-C7 (F4).** Two blind
  seats hitting one shell semantic in one night is the signal §10.13 says to act on: **stop
  re-deriving it, make it a script.** My instance adds a strictly worse variant to theirs: theirs
  makes vitest run nothing and print an EMPTY summary, which is at least *visibly* broken; mine makes
  `git log … -- $VAR` print nothing and **exit 0**, which is indistinguishable from a true "no commits
  touch these paths". A guard that only checks for BROKEN-ness cannot see it. The rule that does:
  **any command taking a LIST gets the `/bin/bash` arm, and where the two shells disagree, bash wins.**
- **§10.42 lands on this packet.** Its §2(8) predicted `consent-mount` "stays 11/11 (plus the follow-up's
  new cases)". The follow-up added 20 new `it()`s (11 → 31), and C6 then forced a change to one
  existing case's assertions without moving the count. The packet predicted a count instead of ordering
  a measurement — exactly the class §10.42 names — and the prediction that was wrong was not the number
  but the word "stays".
- **§10.41 also lands on it:** this packet grants `consent-mount.test.tsx` "for the FIRST commit only",
  in a sentence inside §1, and then §2(8) constrains that same file after the SECOND commit. One
  exhaustive list tagged per commit would have surfaced the collision at packet-write time.
