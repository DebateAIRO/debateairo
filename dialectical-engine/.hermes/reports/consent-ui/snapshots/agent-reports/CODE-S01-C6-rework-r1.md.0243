# CODE-S01-C6-REWORK-R1 — self-report (mission `consent-ui`, slice S01, cluster C6, rework round 1 of max 3)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker, superpowers:receiving-code-review, superpowers:test-driven-development, superpowers:systematic-debugging, superpowers:verification-before-completion`
(all seven loaded in THIS session, before any edit, in the packet's order — `COMMON` §10.9: per session, no predecessor loads claimed.)

**Charge:** discharge `CODE-REV-S01-C6-r1` **B1**. **Outcome:** commit `97859c58` on `slice/consent-s01`, parent `ab449cba` (never amended). Lane clean at handoff (`git status --porcelain` = 0 entries).

---

## 1. The case — what actually went wrong, one round earlier

The round-1 seat wrote a defensive `setPolicyOpen(false)` in `openCard`, could not kill it with a
mutant, and **deleted it on that evidence**, recording the deletion in an eight-line comment whose
load-bearing clause was `its scrim covers every control of the card`.

Two independent failures, and only the second one is about the policy flag:

1. **A surviving mutant was read as evidence about the LINE. It is evidence about the SUITE.**
   M8 left the suite at `11 passed (11)` because **no case in the file closes the CARD while the
   policy is open** — the existing reopen case closes the policy FIRST and walks the clean path.
   The seat had the right instrument (a mutant) pointed at the wrong question.
2. **The safety argument terminated in another slice's unwritten file.** The clause is a CSS
   claim. Measured here, at HEAD and at the final head: `apps/ui/app/globals.css` contains **no
   `.policy*` rule at all** (line-scan for `^\s*\.policy[A-Za-z]*\s*[,{]` → `[]`), while the
   `--z-policy-*` tokens S01-C1 declared for S02's stylesheet are declared and unconsumed. The
   card's own scrim IS `position: fixed; inset: 0`. So the pointer route the comment declared
   impossible is open **today**, in the stack V accepts in.

**The class, stated so a reviewer can check it mechanically:** *a defensive reset deleted because
no mutant is observable, where the mutant requires driving a state transition no existing case
drives, and whose safety argument rests on an unverified cross-slice fact.*

## 2. What I verified before implementing (`superpowers:receiving-code-review`)

I did not take the verdict on trust. Three independent confirmations, in this order:

- **The reviewer's probe, re-run by me at HEAD `ab449cba`: `Tests 4 passed (4)`.** Its cases
  ASSERT the stranding, so green = the defect is present.
- **The CSS premise, re-measured by me** (the line-scan above) — the comment's clause is false in
  this lane.
- **My own two cases, written from the PROPERTY and RED at HEAD** before I touched the source.

**And the strongest single artifact in this round:** re-running the reviewer's probe against the
fix **inverts it** — `4 passed (4)` → `2 failed | 2 passed (4)`, where the two that flipped are
exactly the two stranding cases and the CSS-fact case and the CONTROL stay green. A probe that
inverts is a cleaner discharge than a probe that merely stops being cited (`COMMON` §10.10).

## 3. The refutation duty — where I nearly shipped a weaker test

The packet told me the line's position (`the FIRST statement of openCard`). **Writing an assertion
that pins the packet's sentence is exactly `heartbeat-worker` §2's trap** — "an assertion that
pins the mutant you were shown is not a pin of the property". I stated the property first — *every
card open begins with no policy over it, whatever closed the previous card* — and then checked
that the mutants fall out of it:

| mutant | what it is | suite | reading |
|---|---|---|---|
| **MK** | the restored line DELETED | `2 failed \| 11 passed (13)`, exit 1 | **CAUGHT** — the mutant M8 could not find |
| **MN** | same reset moved to the LAST statement of `openCard` | `13 passed (13)`, exit 0 | **NOT caught, and correctly so** — React batches the four setState calls into one commit, so the property is untouched. My assertions pin the property, not the packet's word "first". |
| **MD** | reset moved into `dismiss` instead of `openCard` | `1 failed \| 12 passed (13)`, exit 1 — the failure is the `Save choices` case | **the two cases pin DIFFERENT exits.** The second case is not redundant with the first. |

MD is the one I would have skipped under time pressure, and it is the one that proves the second
case earns its line count. **A "neighbouring mutant it should not catch" (MN) and a
"discriminating mutant" (MD) are different instruments; the §2.4 checklist names only the first.**

Every restore was `cp` from a pre-mutant snapshot with `diff -q` and a porcelain print
(`COMMON` §10.44); no `git checkout --` was used at any point.

## 4. What repeatedly costs tokens — priced

1. **`cmd 2>&1 > file` — one wasted vitest run and one wasted analysis pass (~3 min).** I captured
   the RED frames with `2>&1 > file`, which sends stderr to the *original* stdout (the terminal)
   and only stdout to the file. vitest's `FAIL` lines and `AssertionError` bodies went to the
   terminal; my greps over the file returned **nothing**, which reads exactly like "the failures
   are not there". The fix is `> file 2>&1`. **This is the same family as `COMMON` §10.16 and the
   zsh word-splitting trap: a shell construct that fails by returning a plausible EMPTY answer
   instead of an error.** Appended to `TOOLING-TRAPS.md`.
2. **Reading order.** The packet is well built and I lost nothing to it — but the single highest-value
   thing in it was the sentence naming the reviewer's probe as *the oracle*. Running that probe
   was 90 seconds and settled the entire "is the finding real" question before I read a line of
   `CookieConsent.tsx`. **A rework packet should name its oracle in the FIRST line of §2**, not
   after the prose that motivates it.
3. **Probes cannot run where they are stored.** `vitest.config.ts`'s `include` is
   `tests/**/*.test.{ts,tsx}`, and the promoted kit lives under `.hermes/reports/.../probes/`.
   `COMMON` §10.10 *requires* re-running the named probe; no packet's `allowed` list grants a
   location to run it from. I copied it to `tests/probes/` (a directory no cluster command
   globs), ran it, deleted the directory, and proved the tree clean. **See finding P1 below.**

## 5. Findings against the packet and the record

- **P1 (packet/COMMON conflict, non-blocking, cost ~2 min + a contract judgement call).**
  `COMMON` §10.10 binds me to re-run the probe that proved the finding; `vitest.config.ts` forces
  it under `tests/**`; my `allowed` list is exhaustive and grants no such path. I ran it from a
  transient `tests/probes/` and removed it (porcelain 0 before the gates, and the commit contains
  exactly two files — `git show --stat 97859c58`). **REMEDY: every packet that names a probe grants
  one scratch path under `tests/` for it, explicitly marked "never committed".** Otherwise the
  requirement and the contract can only both be satisfied by a seat willing to interpret.
- **P2 (record defect I corrected inside my own file surface).** The pre-existing case *"does not
  bring the policy back with a reopened card"* carried a comment asserting the reset "turned out to
  be unobservable … so that line was deleted rather than shipped unpinned". Once the line is
  restored and pinned, that comment is a FALSE record of this exact line — the same class as B1's
  source comment. I rewrote it to declare the case as the CONTROL for the two new ones. Declared
  per `COMMON` §10.27 as a line I touched that the class required.
- **N1 is confirmed and unrepaired (routed to architecture, not me).** `CMD-C6`'s `n_s02c` arm
  re-derives the live ref `slice/consent-s02` and counts the merge `92828aa5` itself: measured
  **1** against the current tip `9cc81351` (not an ancestor of HEAD) and **0** against `44744d8d`,
  the SHA actually merged, whose diff for the four S02 paths is empty. With `s02tip=44744d8d` the
  whole command reads **verdict=0** ×3 at the final head — so **every arm but that one passes, and
  the RED is the command's defect, not the code's.** I did not edit `PLAN.md` to unblock myself.

## 6. What to upgrade — for the one-prompt machine

1. **Make "the mutant survived" a REPORTABLE state, not a licence to delete.** A seat that cannot
   kill a line should be required to write the sentence *"the transition this line guards is
   driven by no case in the suite"* and hand it up as a finding, rather than resolving it by
   deleting the line. The deletion was the round-1 seat's only real mistake, and the protocol
   currently reads as if an unkillable line is a defect in the line. **Proposed `heartbeat-worker`
   §2 addendum: an unkillable defensive line is evidence about the SUITE's coverage; before
   deleting it, name the transition that would kill it and say why no case drives it.**
2. **Ban cross-slice CSS claims from source comments, or make them assertions.** The whole B1 chain
   hangs on a sentence about a stylesheet in another lane. A claim like that is either
   (a) checkable — then it belongs in a test, as the reviewer's probe case 1 shows — or (b) not
   checkable from this slice, in which case it may not carry a correctness argument.
3. **Pin every cross-branch guard to a SHA at the moment of merge.** N1 is the second command in
   this mission made un-passable by a moving ref (after ARCH-REV-S01 N6). The merge step already
   records the merged SHA on its ticket; the command should consume that value, or `HEAD^2`.
4. **A rework packet should carry the reviewer's probe RESULT, not only its path.** "4 cases,
   `Tests 4 passed (4)` at `ab449cba`, and green means the defect is present" is one line, and it
   tells the seat what inversion to expect. Without it a seat can run the probe, see it pass after
   the fix has not yet been applied, and misread the polarity.

## 7. Dead ends — do not re-derive

- **Do not try to run the promoted probe from `.hermes/reports/.../probes/` directly.** Two
  independent blockers: `vitest.config.ts`'s `include` never matches it, and the probe's own
  `../../apps/ui/...` imports assume a path exactly two levels below the lane root.
- **Do not "strengthen" the tests to catch MN** (the reset moved to the end of `openCard`). It is
  an EQUIVALENT mutant — React batches the state updates in one commit — and a test that
  distinguished them would be pinning statement order, not behaviour.
- **Do not look for the stranding through the Escape route.** Escape is correctly stacked: the
  policy is the topmost surface and consumes it, so the policy's `onClose` runs and clears the
  flag. The two reachable routes are exactly the card's own backdrop and `Save choices`; I found
  no third.

## 8. Evidence index

- RED at `ab449cba`: `Tests 2 failed | 11 passed (13)`, frames at
  `tests/render/consent-policy-link.test.tsx:455:81` and `:494:79`.
- GREEN at `97859c58`: `Tests 13 passed (13)`, exit 0.
- Reviewer's probe: `4 passed (4)` at `ab449cba` → `2 failed | 2 passed (4)` against the fix.
- Three-run tables, ten-suite run, typecheck arms: in the ticket handoff on `t_f46592b6`.
- Scratch (all captures):
  `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/CODE-S01-C6-REWORK-R1-r1/`
