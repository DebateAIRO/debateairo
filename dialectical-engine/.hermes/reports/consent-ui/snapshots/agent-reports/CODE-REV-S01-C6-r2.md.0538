# CODE-REV-S01-C6-r2 — self-report (mission `consent-ui`, slice S01, cluster C6, review round 2)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging`

`superpowers:receiving-code-review` — **not loaded this session, not needed: no finding of mine
was contested** (COMMON §10.9's honest form). COMMON §10.39 binds a seat whose packet carries a
prior verdict's numbered findings *as requirements*; mine carries my own round-1 B1 as the
**subject of measurement**, not as work to discharge — I wrote it, so re-reading it is not
receiving review. Declared rather than padded.

Answering V's question verbatim: *treat it like a murder case … what can be done better, what we
must upgrade, what repeatedly costed us tokens, how to make this a one-prompt machine.*

---

## 1. The case — the round-2 review found the code right and the RECORD wrong

The rework is the cleanest commit this cluster has produced: **every removed line in both files
is a comment**, the only executable change is one added line, and the two new cases are real
pins. I could not refute B1's discharge and I tried four ways (oracle inversion, mutant deletion,
a route the author did not model, and a per-route counterfeit fix).

**What I did find is a documentation defect that will cost the next seat real time**, and it is
the most transferable thing in this report: the author appended a new TOOLING-TRAPS entry
(`:2248-2258`) whose central claim — that a promoted probe *"can only"* be run by copying it into
a transient `tests/<dir>/` — is **refuted by an entry 283 lines above it in the same file**
(`:1965-1974`, written by CODE-REV-S01-C3C4 r1), and by my own measurement. The author cited
`:1570` for the `include` fact and did not find `:1965`.

**CAUSE:** TOOLING-TRAPS is 2267 lines with no index and no contradiction check. A seat greps it
for the SYMPTOM it just hit (`include`, `probes/`) and lands on whichever entry uses its words.
The entry that solves the problem was filed under a different symptom vocabulary
("run verbatim from the scratchpad"), so the grep missed it and the seat re-derived a worse
answer, then wrote it down as law.

**PRICE:** ~12 min of mine to detect and refute; the real price is forward — the recommended
remedy ("packets should grant one scratch path under `tests/`") would put a never-committed file
inside the product test tree on every future rework, where `vitest.config.ts`'s `include`
**does** glob it, and any concurrently-running whole-suite command would pick it up.

---

## 2. What repeatedly costs tokens — priced

1. **Every review re-derives "how do I run the promoted probe".** Third seat in a row
   (C3C4 r1, C6 rework r1, me). ~10–15 min each. **UPGRADE:** ship the runner, not the advice —
   `probes/code-rev-s01-c6-r2-probe-runner.config.ts` is now in the probes directory and takes
   `LANE` from the environment. A packet naming a probe should name the runner beside it. Nobody
   should ever write a fourth vitest config for this.
2. **`$?` after a pipe in zsh, and `${PIPESTATUS[0]}`.** My first `generate:contract` printed
   `EXIT=` (empty) because zsh spells it `$pipestatus[1]`; a later `vitest … | tail` printed
   `EXIT=0` while **vitest had said "exiting with code 1"**. Cost ~4 min and it is a
   *false-green* generator, which is the expensive direction. **UPGRADE:** redirect to a file and
   read `$?` immediately — never pipe a command whose exit code is the evidence.
3. **Reading a 2267-line traps file and a 143-line COMMON before touching anything.** Necessary,
   but ~25% of my context before the first measurement. **UPGRADE:** COMMON §10 is now 46
   numbered amendments, several superseded in place (§10.36 carries its own correction inline).
   Split it into "binding law" and "superseded/history" so a seat reads ~60 lines, not 143.

## 3. Where I NEARLY got it wrong — the masked remount

My first draft of the route-3 probe called `root.render()` a second time with a **different root
element** to bring the Settings panel in. That remounts `CookieConsent`, which resets `policyOpen`
for free — so two of my four cases were **passing for the wrong reason and would have passed
against the very mutant they existed to catch.** I only saw it because I ran them against mutant
MR-E and the failure count was 1 where I predicted 3.

**This is the reviewer version of the author's original sin in round 1** (a mutant that survives
because no case drives the transition). I nearly filed "the author's two pins are adequate" on
the strength of a fixture that could not tell. **UPGRADE, and I think this is the single highest-
value line in this report:** *a new test's first run must be against the mutant it is written to
catch, not against HEAD.* Green-at-HEAD tells you nothing about a fixture; RED-at-mutant is the
only thing that does. `heartbeat-worker` §2 says "derive mutants from the property"; it should
also say **"run the mutant before you believe the case."**

## 4. What to upgrade — for the one-prompt machine

1. **A route-class enumeration beats N route pins.** The rework pins two card-close routes; the
   card has three. A per-route counterfeit fix (my mutant MR-E) scores **13/13 on the shipped
   suite** while leaving `Essential only` broken. The fix that shipped is right for a structural
   reason — `setSurface("card")` occurs exactly once, so `openCard` is the sole entry — and *that*
   is what a test should assert. **Packets should ask for the invariant's SOLE-ENTRY proof, not a
   list of routes**, whenever the fix is "reset at the entry point".
2. **A verdict's remedy should name the property, not the position.** My round-1 B1 said "restore
   it as the FIRST statement". Measured this round: moving it to the LAST statement is an
   **equivalent mutant** (React batches the four setState calls into one commit) — 13/13 and 4/4
   on both suites. The author caught this and declared it correctly. My wording invited a test
   nobody should write. **Reviewers: state the observable, and say explicitly which orderings are
   equivalent.**
3. **`CMD-C6` has now been RED for three consecutive seats through a defect three seats have each
   independently measured** (my r1 N1, the rework seat's §8, me again today). Every one of them
   spent runs proving it is the command's fault. It is one character-range in `PLAN.md`
   (`slice/consent-s02` → `44744d8d`). **A finding that three seats re-measure is not a residual;
   it is an unpaid tax** — ~15 min per seat, three seats, and it will bill C7 too.
4. **The self-report path law (§10.33) worked.** `CODE-REV-S01-C6-r2.md` did not exist; I checked
   before writing. Keep it.

## 5. Where THIS packet fought me — exactly

- **Good:** it is the most precise packet I have been given in this mission. Every constant I
  checked resolves (219-line package, B1 at `:87-152`, one commit, two files, `44744d8d`), and
  §4's four numbered B1 elements are directly measurable. Nothing to charge.
- **One gap:** it orders me to run the round-1 oracle and grants `.review-scratch/`, but
  `vitest.config.ts` cannot run anything from there — the same collision the author reported as
  P1, inherited one seat later. It cost me ~8 min to solve. **It is now solved for good** (§2.1),
  but the packet should have carried the runner.
- **§10.44 vs my `allowed` list:** the packet says restore with `cp` + `diff -q` *and* that
  `git checkout HEAD -- <path>` is safe in a detached review worktree. Both true; I used `cp`
  throughout and never `git checkout`, because the two-rule form makes a reader think for a
  moment about which applies. **One rule — always `cp` + `diff -q`** — would be cheaper than a
  correct rule with an exception.

## 6. Dead ends — do not re-derive

- **`pnpm exec vitest run <path outside include>` does not run the file.** The positional is a
  *filter* against `include`, not a path. It prints `No test files found … filter: <your path>`
  and exits 1. There is no flag that changes this; use `--config`.
- **Do not "strengthen" a test to catch the reset moved to the end of `openCard`.** Equivalent
  mutant, measured on two independent suites (§4.2).
- **Do not file `Essential only` as a code defect.** The shipped reset covers it; it is a
  *coverage* gap in the regression net and a wrong sentence in the record, nothing more. I
  measured all three routes green at HEAD before writing it up.
- **`n_s02c` measured from the tool shell against the live ref still reads 1.** It is the merge
  commit `92828aa5` surfacing against its non-TREESAME parent. Do not re-measure the five range
  boundaries; the table is in my r1 verdict §N1 and reproduced in my r2 verdict.

## 7. Evidence index

Probe kit (10 files) at `.hermes/reports/consent-ui/probes/code-rev-s01-c6-r2-*`:
`route-class.test.tsx` (my 4 cases) · `vitest.review.config.ts` (in-lane runner) ·
`probe-runner.config.ts` (**out-of-lane runner, `LANE` from env — the reusable one**) ·
`mutate.py` + `mutant-run.sh` (the MK/MN/MD/MRE matrix) · `css-premise.sh` · `guards.sh` ·
`cmd-c6.sh` / `cmd-c5.sh` / `cmd-c6-n1repaired.sh` (extracted verbatim from `PLAN.md`, 0
non-ASCII bytes). Verdict: `docs/missions/consent-ui/reviews/CODE-REV-S01-C6-r2.md`.
