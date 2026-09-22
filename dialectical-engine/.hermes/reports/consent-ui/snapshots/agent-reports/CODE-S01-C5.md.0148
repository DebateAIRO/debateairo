# CODE-S01-C5 — self-report (case file)

**Seat** CODE-S01-C5 · worker · Claude Opus 5 · mission `consent-ui` · ticket `t_480db823`
(+ the follow-up ticket `t_9ad87d52`) · lane `.worktrees/consent-s01/dialectical-engine`,
branch `slice/consent-s01` · base `9dd8042e` (verified at CLAIM) · commits `fd8250c0`
(C3C4 design-fidelity follow-up) and `d5e217f7` (cluster C5) · rework rounds used: 0.

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How
> can we turn this into a one prompt machine even better.

---

## 1. The one finding that would have cost a round, and its CAUSE

**A cluster was ordered to test an event whose only lawful listener belongs to a later cluster.**

`S01-S30`, `S01-S31` and `S01-S32` all say *"press Esc"*. Three other binding sentences say I may
not make Esc do anything: `S01-R18` ("the card does not write its own focus trap, **Esc listener**
or focus restore"), SPEC §Out of scope ("no second document-level Esc listener … of any kind"),
and `S01-S45`'s slice-wide guard, which asserts that **no file under
`apps/ui/components/consent/`** except `modalSemantics.ts` contains `addEventListener` or the
quoted string `Escape`. The ONE listener lives in `modalSemantics.ts`, which S02 owns and which
arrives with the merge that `S01-C6` waits on — measured in the lane: that directory held two
files, and a dispatched `keydown{key:"Escape"}` changed nothing.

So the acceptance text of three steps is unsatisfiable **as written** at the moment the cluster
runs, and every way of satisfying it literally is a contract violation. This is not a wrong
requirement — the PROPERTY behind each step is right and I pinned all three — it is a **step
whose acceptance names a MECHANISM from a different cluster's timeline**.

**CAUSE, named precisely:** the PLAN's dependency graph knows that `C6` follows the merge
(`§Concurrency statement` says so explicitly), but the step text of `C5` was written in the
vocabulary of the finished product rather than of the lane state `C5` actually runs in. The
concurrency statement and the step acceptance were not diffed against each other.

**PRICE here:** ~25 minutes of design deliberation and one dead end (see §3), no rework round,
because I caught it before writing code. **PRICE if absorbed silently:** a seat that "made Esc
work" would have shipped a second document-level listener, passed its own cluster, and been
caught by `S01-S45` in `C7` — a rework round in a different cluster, against a different seat,
with the defect's author already gone.

**UPGRADE (cheap, mechanical):** in the PLAN's step schema, add one field to any step whose
acceptance names a gesture, an event or an API — `mechanism owner:`. If the owner is not this
cluster, the step's acceptance is written against the SEAM (the prop, the callback, the exported
function) and the gesture is named as the later cluster's step id. `S01-S30` would then read
"…invoke the card's `onDismiss` — the callback `useModalSurface` drives; the Esc EVENT is
`S01-S40`". That is a two-word change to a template and it removes the whole class.

## 2. What I did about it, and why the remedy is reusable

The lawful seam is **the prop the absent listener will call**. A `vi.mock` PASS-THROUGH double —
`vi.importActual`, record the props, then `createElement(Real, props)` — hands the test the
machine's own `onDismiss` while the **real** card still renders, so every other assertion in the
file (the scrim, the three `role="switch"` controls, the footer labels, the twelve strings' host)
is still made against shipped code. `vi.hoisted` carries the recorder across the hoisted factory.

I also kept a case named *"dispatches Escape into a lane that has no listener yet, and records
that it does nothing"*. It is not a requirement; it is the **receipt** for the paragraph above,
and it is the case that legitimately changes in `C6`. A handoff sentence saying "Esc does nothing
yet" is unverifiable six hours later; a green test saying it is, is not.

**UPGRADE:** make "a deliberately-unsatisfiable premise gets a test, not a sentence" a standing
rule. It costs four lines and converts an unauditable claim into a measurement that the next
cluster is forced to update.

## 3. Dead ends — do not re-derive these

1. **Reaching `onDismiss` through React internals** (`__reactFiber$*` / `__reactProps$*` on a DOM
   node). It works in dev builds and is version-fragile; the props of a COMPONENT are not on the
   DOM node anyway, so it needs a fiber walk. `vi.mock` pass-through is strictly better and is a
   documented API.
2. **Adding a test-only prop to `CookieConsent`.** Banned by `test-driven-development`'s own
   `writing-good-tests` rule (test-only code stays out of production classes), and it would have
   been a legitimate review finding.
3. **Wiring backdrop-close in `C5` to get a DOM route to dismissal.** `S01-R18`/`R20` give
   backdrop close to the shared helper too; it is the same violation wearing a different gesture.
4. **Running the reviewer's probe by creating `.review-scratch/` inside the lane.** That is what
   the reviewer did, lawfully, in its own detached worktree; a coding seat may not write outside
   its `allowed` list. The scratchpad-config route in §5 does the same job with the lane's
   `git status --porcelain` still at 0.
5. **A `key`-only mutant for the fresh-mount property.** I tried to construct one and it cannot
   exist: the card is CONDITIONALLY mounted, so it is destroyed between opens whatever the `key`
   says. The `key={opens}` is belt-and-braces against a future refactor that keeps the card
   mounted, and the mutant that actually models the N6 defect is removing the per-open
   `setInitial(togglesFor(readConsent()))` — which I built, and which turns two cases red. Said
   plainly here rather than implied, per `heartbeat-worker` §2.

## 4. The near-miss

**A JSDoc that NAMES a banned call fails the grep-shaped guard that bans it.** My
`CookieConsent.tsx` prose read *"This component never calls `.focus()` itself"* — a sentence
whose entire meaning is that the call is absent, and which `S01-S45`'s guard counts as one hit.
Measured with the guard's own pattern: `grep -c '\.focus()'` → **1** before the reword, **0**
after. `COMMON.md` §8 records that a grep does not know what a comment is; the corollary nobody
had written down is the reverse direction — **a comment must not spell the token a grep bans,
even to deny it.**

I caught it only because I ran the *future* cluster's guard patterns over my new files before
committing, which was not asked for. **UPGRADE:** every cluster's packet should carry the
grep patterns of any LATER slice-wide guard that will scan the files it creates, as a
"pre-flight" line. C7's three greps are known today; running them costs one second and this
class of defect costs a round.

## 5. What cost tokens, and the cheapest fix for each

| What | Cost | Cause | Fix |
|---|---|---|---|
| Reading `PLAN.md` (1193 lines) to find eleven steps and one fenced block | ~35k tokens | The steps, the cluster row, the command, §A9, §Boundaries and the refutation rows for one cluster are in six places hundreds of lines apart | A per-cluster EXTRACT written by the orchestrator at dispatch: steps + the fenced command + the cluster's refutation rows + its boundary lines, one file, cited back to `PLAN.md:<n>`. Every coding seat pays this tax; it is the single largest fixed cost in the run |
| Deciding how `--shadow-knob` is declared | ~10 min | The packet's §28 headline says "BOTH token blocks" and its own parenthesis then says ":root only if that is how the C1 mode-independent six are declared". Two rules in one sentence | A packet states the CONCLUSION when it can measure it. The orchestrator could have run `grep -n 'shadow-thumb' globals.css` once and written ":root only" |
| Re-measuring seven neighbouring suites twice (before and after the `settings/page.tsx` edit) | ~6 min of wall clock | Necessary and I would do it again — but the "before" figures for the four settings-page consumers existed nowhere | `BASELINE.md` should carry a row per file that any cluster's `allowed` list EDITS, not only per file a command runs. `settings/page.tsx` has five test consumers and none was pinned |
| Building 14 mutants one Bash call at a time | ~12 min | No shared mutant runner in the mission | The three-line `mutate.py` + `run-mutant.sh` I wrote are in the scratchpad and are mission-agnostic; promote them to `.hermes/reports/consent-ui/probes/` so the next seat does not rewrite them |

## 6. Toward the one-prompt machine — five concrete changes

1. **Ship a per-cluster PLAN extract at dispatch.** (§5, row 1.) Biggest single saving available;
   it is pure mechanical assembly the orchestrator can do with `sed -n`.
2. **Add `mechanism owner:` to the step schema.** (§1.) Removes the "test an event another
   cluster owns" class entirely.
3. **Pre-flight the later guards.** (§4.) Give each cluster the grep patterns of the slice-wide
   guards that will scan its files. One second per commit; one round saved per occurrence.
4. **Baseline every file a cluster may EDIT, not only every file a command RUNS.** (§5, row 3.)
   This is `COMMON.md` §10.14's own class, applied one step further out; `CODE-REV-S01-C3C4` N9
   made the same argument about the stylesheet and it was accepted.
5. **A packet that can measure its own constant must measure it.** (§5, row 2.) "Follow C1's
   pattern exactly" is a research task handed to a seat; ":root only, beside `--shadow-thumb`" is
   a constant.

## 7. What I could NOT verify, stated plainly

- **`S01-S35` / `R22`** — UNVERIFIED by test, by the PLAN's own instruction. Evidence is a read
  fact: `git diff --stat HEAD -- apps/ui/components/AuthGate.tsx` empty; `settings/page.tsx`
  changed by exactly the two lines of `S01-S33`; `settings/page.tsx:39` is
  `<AuthGate>{() => <AccountSettingsScreen />}</AuthGate>` and `AuthGate.tsx:22` is
  `if (!checking && !authenticated) window.location.replace("/login")`. V's acceptance step 10b.
- **Every rendered pixel.** jsdom computes no layout. The 2px the N1/N2 fixes recover, the hover
  spring, the knob shadow and the reduced-motion branch are all asserted as declared rule TEXT.
  V's acceptance steps 1-2, 6, 14, 18.
- **The flash R06 exists to prevent.** jsdom has no paint; `renderToStaticMarkup` = `""` and the
  empty first client pass are the strongest jsdom can say. V's acceptance step 1.
- **`--shadow-thumb`'s other consumers.** I did not run the `.ndSlider` surface; I asserted only
  that the S01 block no longer references the token and that its value is unchanged.

## 8. Verbatim evidence index (for the reviewer)

RED frames, mutant tables, three-run tables and gate output are in the `READY FOR PEER REVIEW`
comment on `t_480db823`. Scratch (mutator, cluster scripts, the probe runner, the pristine
copies) is at
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/CODE-S01-C5-r1/`.
Traps appended to `.hermes/TOOLING-TRAPS.md` (1922 → 1982 lines; prior bytes intact).
