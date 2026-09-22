# CODE-REV-S02-C1C2 — self-report (murder-case form)

---

# PART I — round 1 · **DESTROYED BY ME, 2026-09-06 23:58 EEST. NOT RECOVERABLE.**

**What happened, stated plainly and without excuse.** My packet's `allowed` list reads
*"the self-report (`agent-reports/CODE-REV-S02-C1C2.md`, **append Part II**)"*. I called `Write`
on this path instead of reading it and appending. The round-1 lens's Part I — a file I never
read — was overwritten in one call. `.hermes/reports/` is **untracked** in git
(`git status --porcelain` shows the directory as `??`), so there is no object to restore; the
only APFS local snapshots on this machine are `com.apple.os.update-*` and predate today's work;
no editor backup, no copy in any scratch tree (searched `/Users/vladmihaimiron/Documents/DebateAIRO`
and `/private/tmp/claude-501` for `*CODE-REV-S02-C1C2*`). **It is gone. I destroyed it, I am
reporting it in the first line of my own report, and I raised it on `t_d2cce8be` before writing
my verdict rather than at handoff.**

**Proof that a Part I existed** (so the loss is on the record, not merely asserted): the round-1
lens's own `REVIEW COMPLETE` comment on ticket `t_0b1a0110` says
*"Self-report (filed BEFORE the verdict): `.hermes/reports/consent-ui/agent-reports/CODE-REV-S02-C1C2.md`"*.

**What survives of round 1, for whoever needs it** — none of this is the self-report, but it is
every round-1 artefact that still exists:
- the verdict itself, 501 lines, with its own disclosures (the 69-mismatch extractor bug it
  found in its own probe; the corrected focus-cache mutant): `docs/missions/consent-ui/reviews/CODE-REV-S02-C1C2-r1.md`
- its verdict comment on `t_eab0c89f` (comment 4) and its `CLAIM` / `HEARTBEAT` / `REVIEW COMPLETE`
  on `t_0b1a0110`
- its promoted probe kit, 8 files, byte-untouched: `.hermes/reports/consent-ui/probes/code-rev-s02-c1c2-r1-*`
- its scratch, which survives and contains no report:
  `…/scratchpad/CODE-REV-S02-C1C2-r1/` (`cluster.sh`, `copy-diff.mjs`, `mutants.sh`,
  `surface-check.py`, `surface-check2.py`, `verdict-comment.txt`)

**The cause is mechanical, not a lapse of attention, and it will recur.** Two seats of the same
NAME in different rounds share one self-report path, `Write` on an existing file is silent and
irreversible, and the only thing standing between them is one word in a packet (`append`). The
same collision is live right now for `CODE-S02-C1C2` (Part I + Part II in one file) and for every
`-REWORK-R<n>` seat in this mission.
**UPGRADE — pick either, both are cheap:** (a) one file per seat-round,
`agent-reports/<SEAT>-r<n>.md`, and the orchestrator concatenates at mission close; or (b) the
orchestrator writes `snapshots/agent-reports/<SEAT>.md.pre-r<n>` at dispatch exactly as COMMON
§10.26 already mandates for artifacts a rework packet may change and §10.32 does for packets —
the gap is that a **self-report** is neither. I have added the same charge to my verdict as a
finding against myself (`S1`).

---

# PART II — round 2 (this seat, fresh session)

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

**Seat:** CODE-REV-S02-C1C2, reviewer, `claude-opus-5`, round 2 of max 3, blind fresh session.
**Ticket:** `t_d2cce8be`. **Under review:** `06ab1da4` (parent `91877847`) on `slice/consent-s02`.
**Worktree:** `.worktrees/rev-s02-c1c2-r2/dialectical-engine`, detached, `git status --porcelain`
= 0 tracked entries at CLAIM and at handoff. `pnpm run generate:contract` exit 0 first.
**Verdict:** PASS. Round-1 B1/N1/N2/N3/N4 all ADDRESSED; four new non-blocking findings.
Part I above is the round-1 lens's, and I destroyed it — see the notice at the top of this file
and finding `S1` in the verdict.

---

## 1. The one thing this round proves, and it is not the fix

The fix is right. What this round actually exposes is a **second-order failure mode the fleet has
no rule for yet: a seat measures an environment, finds a limit, writes the limit into shared
memory as a law — and the law is wrong because the measurement was a sample.**

The author measured jsdom's `focus()` against six element shapes, correctly found that only
`input[type=hidden]` is refused, and wrote into `.hermes/TOOLING-TRAPS.md` (the file COMMON §8
orders every seat to read FIRST):

> `### jsdom 30.0.1: focus() lands on almost everything a browser would refuse — only input[type=hidden] is refused`
> "So a focus-trap test in jsdom can discriminate **exactly one** unfocusable element type."

I ran the same probe over eleven more shapes (`code-rev-s02-c1c2-r2-focusability.probe.tsx`) and
found a **second**: any focusable control inside `<fieldset disabled>`. The selector admits it
(`button:not([disabled])` matches — the *button* carries no `disabled` attribute), the new filter
keeps it, and jsdom refuses focus on it, exactly as a browser does.

The consequence is not academic. Because "exactly one" was believed, the N1 remedy's **advance
loop shipped with no test**, and the author reported that honestly as an unpinnable overlap
(F3). It was pinnable the whole time: a two-line fixture turns it RED
(`code-rev-s02-c1c2-r2-advance-loop-discriminates.sh` — shipped `Tests 1 passed (1)`, advance loop
removed `Tests 1 failed (1)` with `activeElement = close`, i.e. **Tab is a dead key**).

**CAUSE — the rule the fleet is missing:** COMMON §2.2 says *a reported finding is a SAMPLE of a
class, never the whole class*, and it says it about **code**. Nobody has said it about
**measurements**. An environment probe is a sample too, and *"exactly one X exists"* is a
universal claim that a finite table cannot support. **PRICE:** one unpinned shipped branch, one
false entry in the mission's shared memory, and — had I not probed it — a later seat deleting the
advance loop with a green suite, which is the N2 defect class the same round was fixing.

**UPGRADE (concrete, one sentence for COMMON §10):** *An environment measurement enters
TOOLING-TRAPS as an enumeration of what WAS tested and its result, never as "only X" / "exactly
N" / "cannot be done" — a negative universal needs a mechanism (the spec sentence, the engine's
source), not a table.* The author's own table would have been perfect under that rule.

---

## 2. What repeatedly costs tokens (priced, in order)

1. **Re-deriving another seat's harness because scratch is discarded and probes are promoted by
   hand. (~25 min of my ~75.)** The r1 kit was promoted, and it saved me the whole B1
   reproduction — 4 seconds to a RED/GREEN oracle. But the r1 *mutation harness*
   (`code-rev-s02-c1c2-r1-mutants.sh`) hard-codes `.worktrees/rev-s02-c1c2/…`, and COMMON §10.10
   forbids me to edit a promoted probe, so I wrote a 19-mutant harness from scratch to re-run
   ten mutants that already existed. The author hit the identical wall from the other side (their
   F6, their TOOLING-TRAPS entry). **Two seats, two rounds, same literal path.**
   **UPGRADE:** make it mechanical, not cultural — *a file under `probes/` that hard-codes an
   absolute path under `.worktrees/` is rejected at promotion time*; the orchestrator's promotion
   step greps for `\.worktrees/` and refuses. Every probe takes its root from `$1` /
   `argv[1]` / `git rev-parse --show-toplevel`. My r2 kit does, and its README says so.
2. **A count-based acceptance string over a GLOB. (~8 min, and it produced a wrong number I
   nearly reported.)** My packet says the kit "must print `Tests 29 passed (29)`". The kit's
   vitest config globs `.review-scratch/**/*.probe.tsx` — so the moment I added my own probes to
   the same directory the kit printed `31`, and the RED reproduction printed
   `2 failed | 29 passed (31)`. Nothing was broken; the acceptance constant simply is not a
   property of the kit, it is a property of the directory.
   **UPGRADE:** *an acceptance count belongs to an explicit file list, never to a glob a later
   seat writes into* — or the reviewer's probes live in a sibling directory the config does not
   glob. One line in the kit README (I added it) or, better, `include` naming the three files.
3. **A BINDING remedy that spans several artifacts loses the members outside the author's
   `allowed` list, silently. (Found, not paid — but it is a round waiting to happen.)** The
   round-1 verdict's B1 remedy ordered `ADR-0022` §Decision **and** `PLAN.md` S02-S01 corrected.
   The rework packet's `allowed` list carries the ADR and not the PLAN, and routed nothing. It
   also never looked at `S02/DECISIONS.md:101`, which is the row `ADR-0022` names as its own
   *source of record* and which still reads *"only the LAST entry's `onClose` is invoked"* — the
   false sentence, still live, in the artifact the ADR was transcribed from.
   **UPGRADE:** *a rework packet lists every artifact the verdict's remedy names, and for each one
   either puts it in `allowed` or names the ticket that carries it. A remedy member with neither
   is a packet defect the reviewer files* — which is what my P1 does.
4. **Reading order that front-loads 1,900 lines before the first measurement. (~15 min.)** COMMON
   (129 lines) + two packets + the r1 verdict (501 lines) + the diff (378) + the handoff (21 KB)
   before I ran one command. The r1 verdict was worth every line; the rest I could have
   *measured* faster than I read it. **UPGRADE:** a re-review packet should open with the
   three-line state (`HEAD`, cluster command + expected `<n>`, kit + expected string) so the seat
   can be RED/GREEN inside 90 seconds and read the prose while it runs.

---

## 3. What I nearly got wrong

1. **I nearly filed the out-of-DOM-order sibling rule (the author's disclosed addition F1) as a
   finding.** It is an unforced semantic choice — "topmost = last in *document* order" rather than
   "most recently opened" — pinned by a new test, for a shape the mission never builds. Then I
   read the round-1 verdict's remedy again: `CONTAINED_BY || FOLLOWING` is the *reviewer's own
   prescribed code*, quoted verbatim. **Charging an author for implementing a BINDING remedy
   exactly as written would have been the worst finding of this mission.** COMMON §10.22 exists
   for the opposite direction (authors refuting advisory remedies); it needs the mirror line:
   *a reviewer does not open a finding against the letter of a previous round's BINDING remedy —
   it re-opens against the remedy's author, or not at all.*
2. **I nearly reported "the exported surface diverges from the PLAN" from my own broken
   extractor.** My first regex captured up to the `{` of the function body, which swallowed a
   trailing space, and three of five signatures compared `False`. The divergence was mine. I
   re-modelled with a brace-depth scan before writing anything down. **A negative result from a
   tool you wrote in the last five minutes is a finding about your tool until proven otherwise.**
   (Exactly the shape of the r1 lens's own disclosed 69-mismatch extractor bug — the same trap,
   two rounds apart, which is itself evidence it should be a rule: *every extractor ships with a
   discriminator that must come out False before its True is believed*. Mine has three.)
3. **I nearly called the detached-container branch unreachable** after seeing React null the ref
   on unmount. It nulls it for two of three ref idioms; React 19's cleanup-returning callback ref
   keeps the stale detached node (`W3b` measured). Reachability is per-idiom, not per-framework.

---

## 4. Dead ends — do not re-derive

- **`Node.DOCUMENT_POSITION_CONTAINED_BY` is redundant beside `DOCUMENT_POSITION_FOLLOWING`.**
  Confirmed independently by mutant `MB1c` (drop `CONTAINED_BY` → `17 passed (17)`). The author
  recorded the same. It is documentation, not logic; leave it.
- **The hidden-input filter cannot be pinned alone, and that is not a gap.** Every element the
  filter removes is either already skipped by the advance loop (`input[type=hidden]`) or already
  pinned by the `tabindex="-1"` case. Only the *advance loop* half is separately pinnable — via
  `<fieldset disabled>`, §1. Do not hunt for a hidden-input-only fixture; it does not exist.
- **`[hidden]`, `display:none`, `visibility:hidden`, `inert`, `disabled+tabindex="0"` all take
  programmatic focus in jsdom 30.0.1.** Measured over 17 shapes
  (`code-rev-s02-c1c2-r2-focusability.probe.tsx`). The two refusals are `input[type=hidden]` and
  `<fieldset disabled>` descendants. Nothing else.
- **Passing explicit file paths alongside `--config` to vitest silently matches nothing here**
  (`exit=1`, no summary line at all). To run a subset of a glob-config kit, move the other files
  out of the glob — do not add positional filters.

---

## 5. Toward the one-prompt machine

- **The highest-leverage artifact in this whole slice is the round-1 probe kit.** It converted a
  501-line verdict into a four-second oracle and it is why round 2 cost ~75 minutes instead of a
  re-derivation. Promotion must be automatic at seat exit (COMMON §10.26 deleted the "orchestrator
  promotes from scratch" step precisely because it never happened without a reminder — the
  replacement is each seat copying its own, which worked here for two seats running).
  **The missing half is a promotion GATE**: lane-independent path, a README with the expected
  strings, and at least one discriminator per checker.
- **A re-review packet should carry the author's claimed constants as a checklist, not as prose.**
  Mine did this well (`Tests 29 passed (29)`, `<n>` rose, exported surface byte-identical, apps/ui
  arm exit 0, delta 0 outside the pin) and every one of the five was mechanically checkable — that
  is the whole reason this verdict is short and this round did not need a third.
- **The single cheapest upgrade available right now:** teach the fleet that *the cluster's own
  suite is the only gate that survives the seat*. Round 1's N2 was "shipped, pinned by the ADR,
  asserted by nothing"; my N5 is the same defect one layer down (shipped, disclosed, asserted by
  nothing). Both were found by mutating a shipped line and watching a green suite. **A cluster
  handoff should carry a one-line mutation score against its OWN suite** — the author's did
  (10 mutants) and mine corroborated it (19, 16 killed). That number, in the handoff, is worth
  more than any prose claim about coverage, and it is what let me PASS this in one pass.

---

## 6. Where THIS packet fought me (exact lines)

- `CODE-REV-S02-C1C2-R2.md` §4: *"the round-1 probe kit … (byte-untouched; copy only the vitest
  config into your worktree's `.review-scratch/`)"*. Taken literally the kit cannot run: the
  config's `include` globs `.review-scratch/**/*.probe.tsx`, so the three probes must be copied
  there too (renamed), and they must sit exactly one level under the package root because they
  import `../apps/ui/…`. Same class as the author's F5 from the other side. ~4 min.
- Same line: *"must print `Tests 29 passed (29)`"* — true only if no other `*.probe.tsx` is in
  that directory. See §2.2. ~8 min.
- §1's `allowed` list is otherwise exact, every constant in both packets verified against the
  artifact it quotes (table in the verdict §1), and both packets are byte-identical to their
  `snapshots/packets/*.at-dispatch` copies — which is round-1 N4 discharged and worth saying
  plainly: **it is the first packet review in this mission that could prove what the seat read.**
