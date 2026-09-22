# REQ-01 self-report — mission `consent-ui` (seat: requirements, Opus 5)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

**Status: FINAL** — written early per COMMON §4b and updated three times as the run proceeded;
sections 7-11 were appended after the deliverables were on disk.
Seat: REQ-01 · model `claude-opus-5[1m]` · main tree @ `2b670d30`, 90 dirty entries at CLAIM ·
no git writes, no code, no CSS, no test changes.

---

## 1. The body on the floor: what this seat nearly shipped wrong

### F1 — The design states five cookie names that do not exist. Nobody flagged it. (HIGH)

`design-data.js:88-90` gives each cookie category a mono detail line naming actual cookies:
`de_session · de_mfa · de_device — 30 days`, `de_quality — 90 days · first-party`,
`de_analytics — 90 days · first-party`. The product sets exactly two cookies —
`__Host-debateai-session` (`apps/api/src/index.ts:169`) and `__Host-debateai-csrf`
(`apps/api/src/index.ts:170`). A repo-wide grep for `de_session|de_mfa|de_device|de_quality|de_analytics`
across `apps packages tests migrations` returns **zero** hits (the one near-match,
`packages/evaluator/src/index.ts:2265`, is an unrelated metric id).

**Why this is a murder and not a scratch.** Two binding instructions collide and neither side
knows it: my packet says "quote copy … VERBATIM (every visible string, every tag label, **every mono
detail line**)"; COMMON §36 carries the standing V law that "a UI never claims a capability the
product lacks", and intake C10 makes honesty this mission's theme. The collision lands in a **GDPR
consent surface** — the single worst place in a product to state a false fact about what is stored.

**Cause, not symptom.** The intake ran a ten-row contradiction check (C1–C10) that compared the
design against the product on *behaviour* (does Settings have a Privacy section? is there an
analytics consumer? is there a PDF?) and never once against the product on *asserted fact*. C10 got
within one inch of it — "telemetry preferences with no consumer" — and stopped at the consumer.
Nobody grepped the five cookie names. The check had a shape: it asked "does the thing the design
points at exist?" for every *control* and no *claim*.

**Price.** ~6 minutes of my run to find (one grep once I thought to run it), and it would have been
~0 if the intake had run it. Had it shipped: a Grok finished-element review or V's own QA finds a
false GDPR statement in a consent card, after two slices of code exist — a rework round across S01
plus a copy re-ruling, conservatively 2–4 hours of fleet time, and the kind of defect that is
embarrassing rather than merely expensive.

**Upgrade (concrete, cheap).** Add one row to the intake contradiction-check template:
> *Every proper noun, identifier, count, date, version and file name that the design displays as
> fact — grep it in the product. Each one is a row: EXISTS / DOES NOT EXIST / DIFFERENT.*

For this design that is a ~15-minute pass and it would have caught: the five cookie names, and it
would have *confirmed* the ones that do check out (see F2). The general rule: **the contradiction
check must cover displayed FACTS, not only promised BEHAVIOURS.** Behaviours are what a reader
notices; facts are what a regulator notices.

I did not resolve it unilaterally — a requirements seat does not overrule its packet on copy. It is
contested row `Q7-01` with my pick, my confidence and the strongest counter, and the SPEC pins the
strings as **data in one exported constant** so that whichever way V rules, the fix is a one-line
data edit and not a component change. That containment decision is the deliverable, not the opinion.

### F2 — The other displayed facts, checked (so nobody re-derives this)

Having found one, I swept the class rather than stopping at the named lead (`heartbeat-protocol`
§2.2). Checked and **true**: `privacy@dezbatere.ro` matches the domain the brand mark shows
(`apps/ui/components/TopBar.tsx:31`, `brandDomain` = `dezbatere.ro`); the 18-or-over affirmation the
policy's §11 claims accounts require does exist (`apps/ui/components/SignUpFlow.tsx:186`); MFA being
"mandatory" (policy §10) matches `apps/ui/app/settings/page.tsx:49`. Checked and **unverifiable from
this repo** — flagged in the SPEC as claims whose truth lives outside the codebase, not defects:
the retention periods (30/90 days), the sub-processor page `dezbatere.ro/subprocessors`, the
controller entity "DebateAIRO SRL", and the policy version/date `v2.1 · EFFECTIVE 12 AUG 2026`.
**Dead end, do not re-run:** grepping the repo for retention periods or the subprocessors URL. They
are business facts; the repo cannot confirm or refute them, and `UNVERIFIED` is the honest verdict.

---

## 2. What repeatedly cost tokens

### T1 — Reading whole files to quote four lines of them (MEDIUM, recurring, fixable today)

`apps/ui/app/settings/page.tsx` is 245 lines; I needed lines 37-39 (the `AuthGate` wrapper) and the
`.set*` class vocabulary. I read all 245. Same shape on `SignUpFlow.tsx` (205 lines read for the
checkbox at 185-188 and the submit at 60-81 — though here the whole file genuinely earned it).

**Cause:** the packet cites files by `path:line` for *some* facts ("`adult-affirmed` checkbox at
lines 185-188") and by bare path for others ("`apps/ui/app/settings/page.tsx` (where the Privacy
re-entry lands)"). The cited ones cost a `sed -n`; the uncited ones cost a whole file.

**Upgrade:** the orchestrator already measures these files at intake — the intake record proves it
(it quotes `SignUpFlow.tsx` line numbers, the two `globals.css` token-block ranges, and the
`client.ts` range). **Every product-file pointer in a packet should carry the line range that made
it worth citing.** It costs the orchestrator nothing (it already knows) and saves each downstream
seat one full-file read. With four coding seats and two architecture seats reading the same files,
that is the same waste six times.

### T2 — `zsh` ate a grep and cost a round-trip (LOW, but free to fix)

`grep -rn "pattern" --include=*.ts dir` fails under this shell with `no matches found: --include=*.ts`
— zsh globs the unquoted `*.ts` before `grep` sees it. It cost one wasted call and one retry.
**This belongs in TOOLING-TRAPS and I have appended it** (`.hermes/TOOLING-TRAPS.md`): quote the
pattern — `--include="*.ts"` — or use `grep -rn pat dir | grep -v node_modules`.

### T3 — The one-prompt machine's real tax here: nothing (a note in the other direction)

Worth recording because self-reports over-index on complaints: the `COMMON.md` §7 pre-measured
design→token table saved this seat a full `globals.css` token extraction pass, and its §8 harness
facts saved a vitest/dev-stack rediscovery. Both were measured once by the orchestrator and consumed
by N seats. **That is the pattern that makes this a one-prompt machine, and it should be extended,
not admired** — the natural next member of that family is a pre-measured `--z-*` / stacking table
(see F3), which every seat that mounts anything app-wide will otherwise re-derive.

---

## 3. Where THIS packet was unclear — exactly

1. **§3 Q2 leaves the 10b presentation genuinely open ("replacing the bar, centred on the same scrim
   used by 10c, or growing in place — decide one") but §3 Q2's Settings bullet independently requires
   the same card to open from Settings, where there is no bar to replace or grow.** Two of the three
   offered options are therefore not actually available without specifying a *second* layout for the
   Settings entry, which the packet never asks for. The constraint silently eliminates the options.
   **Fix:** when a packet offers a menu, it should state the constraints that already narrow it, or
   say "one of these is eliminated by a later bullet — find it." I found it; a faster seat picks
   "replace the bar" in ten seconds and discovers the Settings hole two slices later.

2. **§3 Q2 asks for "the narrow-viewport behaviour the design does not show (pick a breakpoint)" and
   §4 bans unquantified criteria — but gives no guidance on whether a *derived* number beats a
   *conventional* one.** I derived 720px from the measured content widths rather than reaching for
   768. Both satisfy the letter of the law; only one is defensible to a reviewer. **Fix:** one line
   in COMMON §4 — "a pinned number carries its derivation in the same sentence" — turns an arbitrary
   pin into a checkable one and pre-empts a whole class of reviewer findings.

3. **The packet mandates `superpowers:brainstorming` as my floor, and that skill's hard gate is
   "present the design to your human partner and wait for an explicit yes."** This seat has no human
   partner in-session and the packet forbids asking V ("Take your pick as the SPEC default; do not
   ask V"). The gate is discharged instead by the contested-decisions table + the blind REQ-REV-01
   review + SPEC freezing. That is a reasonable adaptation, but I had to invent it. **Fix:** one
   sentence in COMMON §1 — "for fleet seats, `brainstorming`'s approval gate is discharged by the
   contested-decisions table and the blind peer review; do not block waiting for a human." Every
   requirements and architecture seat in every future mission hits this same wall.

4. **Not a defect, a commendation worth copying:** §3 Q8 ("contradiction check on your own output")
   made me diff S01's required modal interface against S02's declaration sentence-for-sentence and it
   caught a real skew (S01 needed a `mode` prop that S02's first draft did not declare). **A
   self-contradiction charge should be a standing item in every multi-artifact packet**, not a
   per-mission nicety.

---

## 4. What I nearly got wrong

- **Nearly copied the mode-guard pattern for consent.** `apps/ui/app/layout.tsx:36-42` runs a
  pre-paint inline `<script>` that reads `localStorage['debateai.mode']`, because a wrong *theme*
  flashes visibly. The reflex is to do the same for the consent decision. It is wrong: a consent bar
  that is briefly *absent* is invisible, so consent needs no pre-paint script — it needs the
  opposite, a render of `null` until an effect has read storage, so a returning visitor never sees
  the bar flash. Same storage, opposite conclusion, and the wrong one adds a blocking script to
  every page in the app. The SPEC states the contrast explicitly so a coder cannot reason from the
  neighbouring precedent to the wrong answer.
- **Nearly specified `IntersectionObserver` for the scroll-to-end rule** because it reads better.
  jsdom does not implement it, so every pin would need a stub with async callback timing — a flake
  factory. The arithmetic form (`scrollTop + clientHeight >= scrollHeight - 8`) is synchronous,
  pinnable by defining three properties, and gives the "policy too short to scroll" case the right
  answer for free.
- **Nearly made the scroll-to-end state un-latched.** Recomputing it on every scroll event means a
  reader who reaches the end and then scrolls back up to re-read section 3 finds the consent button
  disabled again. The requirement latches on first satisfaction.

## 5. Dead ends — do not re-derive

- Repo greps for the design's retention periods, `dezbatere.ro/subprocessors`, or "DebateAIRO SRL":
  business facts, not code facts. `UNVERIFIED` is the answer.
- Looking for an existing focus-trap / scroll-lock / Esc helper to reuse: see F3 below for the
  measured verdict; do not re-survey.
- `hermes kanban ... comment` with a body containing a bare `:` before a newline is fine, but a body
  over the shell argument limit is not — the handoff goes in the file and the comment points at it.
  (Already law in COMMON §2; restating because it is the kind of thing a seat rediscovers.)

## 6. How to make this more of a one-prompt machine

1. **Extend the pre-measured COMMON tables to stacking.** §7's token table is the single
   highest-leverage artifact in this packet set. The same treatment for `--z-*` tokens and the
   fixed/overlay inventory would serve every seat that mounts anything app-wide, in this mission and
   the next three.
2. **Make the intake's contradiction check cover displayed facts** (F1). One template row.
3. **Put line ranges on every product-file pointer in every packet** (T1). Zero orchestrator cost.
4. **State the derivation next to every pinned number** (§3.2). One line in COMMON §4.
5. **Resolve `brainstorming`'s human gate for fleet seats once, in COMMON** (§3.3), rather than
   letting each seat improvise it.

---

## 7. F3 — Seven overlays declare `aria-modal` and not one implements it (HIGH, systemic)

Measured by grep over `apps/ui/**/*.ts,*.tsx`, every count re-run by me, not taken on trust:
`createPortal` **0**, `Escape` **0**, `focusTrap` **0**, `.focus()` **0**, `document.body` **0**,
`addEventListener("keydown"` **0**. The app has seven overlay surfaces — `GuideModal`
(`apps/ui/components/GuideModal.tsx:32-45`), five drawers, and a popover — and each one renders
`role="dialog" aria-modal` while implementing **no** focus trap, **no** Esc-to-close, **no**
focus restore and **no** body scroll lock. `aria-modal="true"` is a promise to a screen reader
that everything outside the dialog is inert. Nothing outside is inert. The attribute is
currently false on seven surfaces.

**Why it lands on this mission.** Both my slices need exactly that machinery — a consent card
and a policy modal that a keyboard user can escape from — so this mission will *build* it. If
it is built twice, privately, inside two consent components, the seven existing dialogs stay
broken and the eighth and ninth implementations arrive with the next mission.

**Upgrade:** ARCH should site one shared helper (Esc + trap + restore + scroll lock) where both
slices consume it, and a separate ticket should retrofit the seven existing overlays. I have
put the measurement in both SPECs' Accessibility sections so neither architecture seat has to
re-derive it, and flagged the shared-helper placement as ARCH's call rather than pre-empting it.
**Price if ignored:** two divergent trap implementations in one mission, plus a standing
accessibility defect that a Grok finished-element review is fairly likely to raise anyway —
at which point it is a rework round instead of a design decision.

## 8. F4 — The measured baseline raced the requirements seat, and won by 28 minutes (HIGH, process)

This is the most instructive failure in the run, because nobody did anything wrong.

My packet lists four test files as "tests that pin the surfaces you touch" and tells me to name,
in each SPEC, which the slice must update. It gives their paths. **It does not give their
measured state.** So I measured, and found
`tests/architecture/auth-front-door-parity.test.ts` red at base (exit 1, `Tests 2 failed (2)`,
ENOENT on five `web/` files deleted on 2026-09-01). I reported it in my HEARTBEAT. The
orchestrator re-measured it in a clean lane and wrote it into `BASELINE.md` as an addendum
timestamped 17:35 — along with a fact **I did not have and had guessed wrong about**:
`tests/unit/t9-mode-tokens.test.ts` is *itself* red at base, exit 1,
`Tests 2 failed | 6 passed (8)`, one of the two failures being the colour-literal test.

I had already written two verification hooks in the S01 SPEC saying that suite "passes". That
is exactly the fabricated-green the protocol exists to prevent — and it would have been
*mine*, shipped in a frozen SPEC, sending a coding seat to chase another mission's failures.
I caught it only because I re-listed the mission directory before handing off and noticed a
`BASELINE.md` that had not existed when I started.

**Cause.** `BASELINE.md` was measured at 17:07 and the addendum written at 17:35; I claimed the
ticket and began reading at roughly the same time. The requirements seat and the baseline
measurement ran **concurrently**, and the packet — written before either finished — pointed at
neither. There is no mechanism that makes a seat re-read the mission directory before handoff.

**Price here:** ~10 minutes and three corrective edits, all before handoff, so the cost was
near zero. **Price in the counterfactual:** a frozen SPEC instructing a coding seat to make a
suite pass that cannot pass, discovered by that seat mid-slice, costing a rework round plus a
SPEC-v2 supersession — because a frozen SPEC cannot simply be edited later, which is the whole
point of freezing it.

**Upgrades, in order of leverage:**
1. **Baseline before requirements, as a dispatch precondition.** The requirements seat cannot
   write a verification hook without the measured state of the suite the hook names. Sequence
   it: measure → then dispatch REQ. This is a scheduling change, not new work — the
   measurement already happens.
2. **If they must overlap, the packet says so and names the file:** "`BASELINE.md` is being
   measured concurrently; re-read it before your handoff." One sentence.
3. **A standing handoff item for every seat: re-list your mission directory before you hand
   off, and diff it against what you read at CLAIM.** Cheap, mechanical, and it catches every
   artifact that lands mid-run — not just this one.

## 9. Two edits I made to a FROZEN SPEC, and why each is defensible

Recorded here because a blind reviewer will and should check the sequence. Both are in
`slices/S01/DECISIONS.md` with the same reasoning, and both happened **before handoff, with no
seat having consumed the file**.

1. **Added S01-R29** (the bar overlays the debate token dock). Found by charge Q8 — the packet's
   own order to run a contradiction check on my output. Q8 is part of creation, not revision.
   The edit is **additive**: no existing requirement's text changed.
2. **Corrected the hooks of S01-R24 and S01-R25** from "the suite passes" to a stated delta,
   per F4. This one *did* change existing text, and I want to be plain about that rather than
   bury it: I judged that a hook asserting a falsehood is worse than a hook edited fifteen
   minutes after it was written, when the alternative is shipping the falsehood into a frozen
   document. If the reviewer disagrees, the remedy is a SPEC-v2 header, and I would not contest
   it.

**The general lesson:** "frozen at creation" has no defined boundary for *when creation ends*.
For a seat that writes, then self-checks, then hands off, three different moments could count.
**Upgrade:** define it — creation ends at the handoff marker. Then Q8 findings and
late-arriving baselines are unambiguously in scope, and everything after the handoff is
unambiguously a SPEC-v2. One sentence in COMMON §4 removes a judgement call from every future
requirements seat.

## 10. Cost accounting

| Item | Cost | Avoidable? |
|---|---|---|
| Two read-only `Explore` children (z-index/overlay survey; test-surface survey) | ~197k subagent tokens, ~9 min wall-clock, run in parallel with my own reading | **No — this was the best spend of the run.** The test survey alone produced four constraints the packet did not carry (the `terms`/`privacy notice` ban, the `<form>` count, the `appShell > TopBar` shape, the exact-arity `toHaveBeenCalledWith`), each of which would otherwise have surfaced as a coding-seat surprise. |
| Re-verifying every child claim at `path:line` myself | ~8 min | No. Two of their line citations needed tightening and one negative claim needed independent confirmation before it could justify "net-new machinery" in a SPEC. Trust-but-verify is the contract. |
| Running two vitest suites for evidence | ~3 min | No. It converted "the packet implies this is green" into a measured `exit 1, Tests 2 failed (2)` that the orchestrator then adopted into `BASELINE.md`. |
| Reading whole files to quote four lines (T1) | ~5 min | **Yes** — line ranges in packet pointers. |
| The zsh `--include` glob (T2) | ~2 min | **Yes** — now in TOOLING-TRAPS. |
| Correcting the two hooks after `BASELINE.md` landed (F4) | ~10 min | **Yes** — sequence the baseline before the requirements seat. |

**Deliverables:** 1 compass (92 lines), 2 frozen SPECs (29 + 24 requirements, both fully
traced), 2 PLAN scaffolds, 2 PROGRESS skeletons, 2 DECISIONS files, 1 contested-decisions table
(6 rows), 1 handoff, this report, 6 appended tooling traps. **No git writes, no code, no CSS,
no test changes** — contract held.

## 11. The five upgrades, ranked

1. **Measure the baseline before dispatching requirements** (F4). Highest leverage in this
   report: it is a scheduling change with zero added work, and it removes a whole class of
   fabricated-green hooks from frozen documents.
2. **Make the intake contradiction check cover displayed FACTS, not only promised behaviours**
   (F1). One template row would have caught five false cookie names in a GDPR surface.
3. **Define when "creation" ends — at the handoff marker** (§9). One sentence; removes a
   judgement call from every requirements seat forever.
4. **Extend COMMON's pre-measured tables to stacking and to the overlay inventory** (F3, §2.T3).
   The §7 token table is the best artifact in this packet set; the same treatment for `--z-*`
   and for "what modal machinery exists" serves every future UI mission.
5. **Line ranges on every product-file pointer, and a derivation beside every pinned number**
   (T1, §3.2). Both are free at authoring time and paid for N times over at reading time.

---

# PART II — REWORK ROUND 1 (fresh session, 2026-09-06 18:08→ EEST)

**Status: IN PROGRESS, written as I go.** Same seat name, different session: the harness could
not resume the original REQ-01 session (SendMessage disabled), so everything Part I knew had to
be re-read from disk. Answering `docs/missions/consent-ui/reviews/REQ-REV-01.md` — REWORK, B1-B3
blocking, N1-N9 non-blocking, P1-P5 packet findings. Main tree `2b670d30`, 90 dirty entries,
branch `dev`, no git writes.

## 12. What the review caught that I missed, priced

### F5 — B1: I let the ENTRY POINT be the discriminator for a security-shaped state. (CRITICAL)

The review is right and the defect is mine. S01-R14 v1 said "on close without a decision from
the FIRST-VISIT entry the bar returns; from the SETTINGS entry nothing returns", and the states
table said the same. R13, R05, R07 and row V-7 all say the bar cannot leave without a decision.
Both sentences were in one frozen file, 200 lines apart.

**Cause, not symptom.** I wrote R14 while thinking about the *Settings* use case — someone who
already decided, tweaking their choice — and encoded that ASSUMPTION as a *condition*. The
assumption ("if they came from Settings, a decision exists") is true in the common path and
false in the reachable one. **The class is: a proxy condition standing in for the real one.**
When I swept for the class I found the same substitution twice more in the same file, both
missed by the reviewer: **R17** ("when the card opens from Settings … both reflect the stored
booleans" — no answer for Settings with nothing stored) and **R21** ("opens the same card
pre-filled from storage" — same gap). v2 fixes all three with one rule: *the discriminator is
whether a valid `v: 1` decision is stored, never where the card was opened from.*

**Price.** One rework round for the mission (~2h of fleet time across the review seat and this
seat). Had it shipped: a one-keystroke bypass of a GDPR consent gate, found by V or by Grok
after two slices of code existed.

**Upgrade — the cheapest mechanism that would have caught it.** My charge Q8 (self-contradiction
check) told me to diff my artifacts against *each other*. It did not tell me to check one
artifact against *itself*. The state table was total against the requirements' vocabulary and
non-total against the reachable state space. **A standing charge worth adding to every
requirements packet: enumerate the REACHABLE states as the cross-product of the state variables
you pinned (here: {stored decision: valid | none} × {surface: bar | card | modal | silent} ×
{entry: first-visit | settings}) and show a row for each cell, or say why the cell cannot
occur.** That is mechanical, it is cheap, and it is exactly what the reviewer did by hand.

### F6 — B2: I specified an implementation and a test remedy that cannot both be true. (HIGH)

S02-R17 v1 said the component "holds both in React state rather than reading them only from
FormData at submit time" — i.e. controlled inputs. §Tests then told the slice to keep the house
idiom `field(x).checked = true`. Those cannot coexist: assigning the DOM property fires no React
`change`, so a controlled input's state stays false. The reviewer proved it with a standalone
jsdom+React probe rather than arguing it — controlled → `register()` 0 calls, uncontrolled +
`onChange` mirror → 1 call. I re-verified the premises myself at `SignUpFlow.tsx:186` (no
`checked`/`onChange` prop → uncontrolled) and `:63,:72` (FormData is the truth), and the three
idiom sites at `auth-flow-integration.test.tsx:324,448,466`.

**Cause.** I reasoned about the REQUIREMENT ("the button must reflect the boxes live") and
inferred an IMPLEMENTATION ("so the component holds them in state") in the same sentence,
without running anything. The inference was one word too strong: the button needs a *mirror*,
not *ownership*. One word of over-specification made the rest of the SPEC unbuildable.

**Upgrade.** A requirements seat should never write "which means the component does X" about a
framework's data flow unless it has executed X. The honest form is to state the observable and
name the constraint the test idiom imposes; the SPEC now pins the implementation only because a
probe measured it. **Concrete packet upgrade: when a SPEC prescribes an implementation detail
that an EXISTING test's idiom depends on, that pairing is a mandatory probe, not a judgement.**

### F7 — B3: two slices, two Esc listeners, one keypress. (HIGH, and it is the parallel-lane
tax nobody priced)

Neither SPEC said which surface consumes Esc when the policy modal sits over the preferences
card, because each SPEC only ever describes *its own* surface. This is not carelessness about
Esc — it is a structural blind spot of per-slice specs: **a behaviour that only exists when two
slices are on screen together has no owner in either document.** COMMON §10.7 (written after my
handoff) named a shared helper; the review's B3 named the rule it must implement. v2 puts the
rule inside the one paragraph both SPECs carry byte-identically, which is the only text with two
owners.

**Upgrade:** every multi-slice mission should carry a short "interactions between slices"
section in each SPEC, or one shared file both cite, enumerating what happens when both surfaces
are live at once. The byte-identical-paragraph device works and should be reused; it is the only
construct in this mission that made a cross-slice rule impossible to change unilaterally.

## 13. What I contest, and the evidence

**N5 — CONTESTED (measurement, not opinion).** The review says
`tests/unit/v2ui-node-runner.test.ts:19` is a `.map(...)` and the manifest-equality assertion is
at `:21`. Measured by me in the main tree AND in the clean lane `.worktrees/consent-s01`, same
md5 `dae7cd12705f1d7c885030ceefdbd433`, file is 35 lines:

```
 16|       .map((entry) => relative(v2UiDirectory, join(entry.parentPath, entry.name))…)
 17|       .sort();
 18|
 19|     expect(activeTests).toEqual([...manifest].sort());   <- the assertion
 20|   });
 21|                                                          <- blank
```

`:19` **is** the assertion; the citation in `slices/S02/SPEC.md` was correct and is unchanged.
I have added a one-clause note beside it recording the re-measurement, so a third seat does not
"correct" it back. Everything else in N5's substance (the constraint is real; the manifest must
be updated if a `consent/*.source-test.mjs` is added) is accepted and unchanged.

**The instructive part is not that a reviewer was off by two.** It is that *this* review caught
six wrong line ranges of mine and I caught one of theirs — seven citation errors in ~40 pointers
across two seats, ~17%. **Line-range citations are the highest-error-rate artefact this mission
produces, in both directions, and the only defence that works is re-measuring the ones that are
load-bearing.** A cheap upgrade with real leverage: a mission-level script that resolves every
`path:line` in every mission document against the file and prints the cited line, run by the
orchestrator once per handoff. It is ~30 lines of Python and it would have caught all seven.

## 14. The one thing this round proves about the machine

**I reproduced the exact defect class I was sent to fix, while fixing it, and only a script
caught it.** Correcting N1 (two `R18` references that meant `R21`), I wrote two NEW bare `R18`
references inside S02 documents that mean **S01**-R18 — in an S02 file a bare `Rnn` resolves to
S02's own requirement, so both pointed a reader at the submit-handler requirement instead of
the card's focus trap. `slices/S02/SPEC.md` and `slices/S02/PLAN.md`. I did not notice either
while writing them; the topic-guard pass found both.

**That is the argument for mechanical sweeps over careful reading, stated as cheaply as it can
be:** a seat fixing a class of reference error introduced two more instances of that class in
the same hour. Reading harder would not have helped — I had just read the finding.

**The sweep that caught it is ~90 lines of Python** and it does three things worth making
standing equipment for every multi-artifact mission:
1. resolve every `Rnn` mention to the requirement it names, and print the pair;
2. cross-check SPEC requirement ids against PLAN trace rows in both directions;
3. classify the referencing sentence and the target's body into a fixed topic vocabulary and
   flag only disjoint pairs — which is the *shape* of "resolves to a real requirement, the
   wrong one", with almost no noise. A generic word-overlap heuristic flagged 71 pairs and was
   useless; the topic version flagged 8, of which 2 were real.

**Upgrade, ranked first for the next mission:** ship that script (and a `path:line` resolver
for product-file citations, §13) as a mission-level tool the orchestrator runs at every
handoff, not as something each requirements seat rebuilds. It would have caught, in this
mission alone: N1's two originals, my two new ones, N2's seven wrong occurrences, N3, and
N5's mis-measurement.

## 15. Round-1 cost accounting

| Item | Cost | Avoidable? |
|---|---|---|
| Re-reading the whole mission from disk in a fresh session (packet, COMMON, original packet, predecessor handoff + self-report, verdict, 8 artifacts) | ~25 min, ~120k tokens | **Partly.** Unavoidable while `SendMessage` is disabled — but it cost near-nothing extra *because* the predecessor wrote everything to disk as it went (COMMON §4b). A seat that had batched its writes would have been unrecoverable. §4b is the load-bearing rule of this harness and it is currently one line. |
| Re-verifying every finding's premise before editing (`SignUpFlow.tsx`, the test idioms, the two t9 line ranges, the v2ui runner, `design-data.js:89`) | ~12 min | **No.** It produced the one contested finding and confirmed the three blocking ones. `receiving-code-review`'s "verify before implementing" earned its place. |
| Building the xref sweep, twice (the first heuristic was useless) | ~15 min | **Partly** — see §14: it should be standing equipment, not per-mission work. The wasted half is the generic-overlap version; **dead end, do not re-derive: word-overlap between a sentence and a heading flags a third of all references and finds nothing.** |
| Correcting ~25 line ranges in my own handoff after writing it from memory | ~8 min | **Yes, entirely.** I wrote the handoff's citations from memory and then resolved every anchor mechanically — 25 of them were wrong. Had I not checked, this handoff would have shipped a worse citation error rate than the one it complains about. **Never write a `path:line` you have not just printed.** |
| Two `hermes kanban comment` posts | ~2 min | No |

**Deliverables this round:** 2 SPEC archives, 2 SPEC v2s with supersession headers, 2 PLAN
scaffold updates, 2 DECISIONS appends (20 lines), 1 compass edit (96 lines, cap 100), 1 append
to the superseded handoff, 1 rework handoff, this report's Part II, 5 appended tooling traps.
**No git writes, no code, no CSS, no test changes** — contract held.

---

# PART III — REWORK ROUND 2 (fresh session, 2026-09-06 ~19:2x EEST). The last round before V.

Continued, not restarted. Parts I and II are my predecessors' sessions; this part is mine.
The question V asked is unchanged, and round 2 answers it more sharply than round 1 could,
because round 2 has a **priced counterfactual**: an experiment that was skipped, and the exact
bill for skipping it.

## 16. THE MURDER: what the unrun probe cost, priced

**The victim.** Rework round 1 fixed B2 exactly as ordered, correctly, and provably. In the
same sentence it wrote the remedy into, it prescribed a second test idiom — `dispatchEvent(new
Event("change", { bubbles: true }))` — **that does nothing**. And it wrote a fifth hook case
that **cannot pass under any idiom at all**, against the correct implementation.

**The murder weapon is not ignorance.** Round 1's author understood the mechanism and wrote it
down correctly: *"`field(x).checked = true` fires no change event."* True. It then drew an
operational conclusion from that true premise — "so dispatch a change instead" — and never ran
it. React routes a checkbox's `onChange` through the **click** event. The premise was right and
the conclusion was backwards, and no amount of re-reading separates them.

**The bill, itemised.**

| Line item | Cost |
|---|---|
| Round-1 seat's time writing the two defective sentences | ~4 min |
| Reviewer round 2: building `b2-idiom-matrix.mjs` + running it 3× | ~25 min |
| Reviewer round 2: writing up B4 + B5 with the class sweep | ~20 min |
| Orchestrator: triage, R2 packet, R2 ticket | ~15 min |
| **This session** (read-in, 5 probe runs, edits, 2 sweeps, bookkeeping, handoff) | ~95 min |
| **A whole rework round consumed: round 2 of 3.** One round left before V's packet | **the real cost** |
| Downstream, if it had shipped: ARCH + a coding seat debugging a red mechanism pin against a CORRECT `SignUpFlow.tsx` | est. 1-2 hours, and the SPEC tells them to blame the component |

**Total measurable: ~2.6 hours of fleet time, plus one of three rework rounds, to un-write two
sentences.** The experiment that would have prevented all of it — running the probe that was
already on disk, by absolute path, in the reviewer's own verdict — costs **about one second of
CPU**. Measured this session with `/usr/bin/time -p`, three samples each:
`b2-idiom-matrix.mjs` → `real 0.63 / 0.49 / 0.47`; `b2-repin-probe.mjs` (3 runs × 3 variants
internally) → `real 0.53 / 0.51 / 0.53`. **Both probes together: under 1.2 seconds.**

**Two ratios, both honest.** Against raw command time: ~9,400 seconds of fleet time against
1.2 seconds = **~7,800 : 1**. Against the realistic figure — reading each probe first, running
it, and reading the matrix, which took me **~3 minutes** — **~52 : 1**. Use the second number
with V; it is the one that survives challenge, and it is still fifty to one.

## 17. The cause, named precisely — and it is NOT "the seat was careless"

Round 1's packet quoted the reviewer's **conclusion** (*"pin the only implementation that
survives the reviewer's probe"*) and never named the probe as a thing to **run**. The seat did
exactly what it was told, re-measured every *premise* at `path:line` — visibly, correctly — and
never executed the *remedy*. **A packet that quotes a probe's conclusion converts executable
evidence into prose, and prose is re-derivable by reasoning. Reasoning is what produced the
defect.**

`COMMON.md` §10.10 now states the class fix, and my packet named both probes by absolute path.
That is the right fix and it worked: I ran them **before** editing, which is what turned B4/B5
from a claim I was obeying into a RED baseline I could see. **Order matters more than the rule.**
Running the probe after the fix would have proved nothing, because the probes measure React, not
the SPEC — their output is byte-identical before and after my edit (I diffed it). The value is
entirely in what the matrix lets you *write*.

## 18. What I nearly got wrong THIS round — and it would have been round 3's finding

My packet ordered a specific B5 remedy: reset `.checked = false`, then `click()`. I could have
written that sentence in ninety seconds and been done. Instead I wrote a scratch probe that
executed it first — because that is the entire lesson of the round I was fixing — and it
returned something the packet did not anticipate:

**The ordered remedy is green under all four implementation variants, including the controlled
one.** It is satisfiable, so B5's literal charge is discharged — but the SPEC sentence claims
that case exists *"so a future seat that switches to controlled inputs breaks a test that names
the reason"*, and measured, **it would not break**. I would have shipped a hook whose stated
purpose is false: `writing-good-tests.md`'s gate function in one line — *name the production
change that would make this test fail*. There isn't one.

So I measured which pin does discriminate (4 candidate pins × 4 variants × 3 runs) and found it:
assign `.checked` on one box without dispatching, click the **other** to force a React
re-render, then assert the first box's `.checked` is still `true`. RED under exactly the two
controlled variants. That is v3's **case 6**.

**Priced:** the extra probe cost ~12 minutes. Not writing it would have cost a round-3 finding
in a mission that has no round 4 — i.e. a V DECISIONS PACKET row. **The lesson generalises past
this mission: "execute the remedy" is not enough. Execute the remedy AND the claim the remedy
makes.** A test that passes is not the same as a test that catches anything, and a SPEC sentence
that says what a hook protects is itself a falsifiable claim.

## 19. The most embarrassing finding in this file, kept deliberately

While fixing N11 — *"stop estimating counts"* — I discovered that v2's §Copy sentence, whose
entire subject is that a `\uXXXX` escape and the character it decodes to are **different
things**, printed the decoded character in **both** slots. Measured: `SPEC-v2.md` contains the
literal escape form **zero** times. Two seats and a reviewer read that page and nobody saw it,
because both forms render identically to a reader who is not counting bytes.

Then, within ten minutes of naming that defect, **I committed it myself** — twice, in
`S01/DECISIONS.md`, in the very lines recording the fix. `DECISIONS.md` is append-only, so the
wrong lines stay on the record with an appended correction beneath them. I also shipped a wrong
`awk` counting command into the appended supersession note (`/^\| \*\*/` over the whole file
returned 8 and 11 instead of 7 and 9, because states-table rows also start with `| **`) and
caught it only by running it. Both are on the record with the wrong first attempt intact.

**The cause is not sloppiness, and treating it as sloppiness is how it recurs.** It is that
**a rule stated in prose has no enforcement surface.** "Byte-exact means the decoded character"
is unenforceable; `grep -c` for the escape form inside any sentence containing the word
"escape" is enforceable. **Every N11-class rule this mission has written is prose. That is the
upgrade.**

## 20. Where THIS packet was unclear — exactly

1. **`REQ-01-REWORK-R2.md:7` says "comments 1-16 on `t_5916299b`".** The ticket has **9**
   (measured: `hermes kanban show t_5916299b --json | jq '.comments | length'` → 9; the events
   array holds 11 entries, 9 of them `commented`). I read all 9, plus the 1 on `t_579bcf46` and
   the 0 on `t_aad8b3f2` / `t_27e5bc12`. **Cost: ~4 minutes** hunting for seven comments that do
   not exist and second-guessing whether the board had truncated. **Fix: the orchestrator should
   emit the cursor from the board (`| length`), never from memory** — it is the same defect class
   as N11, in the packet rather than in the artifact.
2. **The packet's B5 remedy is stated as a settled answer** (*"Rewrite it so the second half
   starts from a known state… or split into two cases"*), which invites exactly the behaviour
   that caused B4/B5: implement the wording, do not test it. It would be stronger as *"here is a
   candidate remedy; prove it against the probe before writing it, and report if it fails."*
   **A packet that hands down a remedy inherits the duty to have run it.**
3. **§2 asks me to confirm "every idiom the v3 SPEC names appears in the matrix as `OK`".** The
   repin probe's `R17-h5b` case is hard-coded to test the very idiom I was ordered to delete, so
   it FAILS after a correct fix, forever. That is not a defect — it is now the standing proof
   that the deleted idiom is dead — but the packet's phrasing does not anticipate a probe whose
   red is the evidence. **Say instead: "state, per probe case, whether its verdict is expected
   and why."** (I did.)

## 21. What repeatedly cost tokens, round 2

- **Re-reading 3,249 lines of artifacts and verdicts to change ~40 lines.** Unavoidable in a
  fresh session, but the ratio (81:1 read:write) is the strongest argument in this whole report
  for the durable-memory upgrade below.
- **Line numbers move under edits.** Every citation I made had to be re-derived after the header
  rewrite shifted S01 by +1 and S02 by +3. I stopped quoting line numbers from earlier reads and
  started locating blocks by md5 and by anchor grep — the interface paragraph moved from
  `S01:324-335` to `S01:325-336` and from `S02:226-237` to `S02:229-240`, and **only the md5
  (`a00b4e7620e47a0bfe47ebbbc16b5330`, unchanged in both) proved it was the same text.** **Recommendation: cite artifacts by ANCHOR TEXT, not by line, inside the
  mission's own documents; keep line numbers for product files, which this mission does not
  edit.**
- **The board's comment body is a positional shell argument.** Every marker is a multi-KB
  `hermes kanban comment` call with embedded backticks that must be escaped. **This session's
  posts went through first try** — I pre-escaped every backtick — but the escaping is hand-work
  on a multi-KB body and one mistake posts a mangled marker that cannot be edited.
  **`--file` on `hermes kanban comment` would pay for itself in a single mission** (noted in
  Part I; still true, and this round it cost care rather than retries).

## 22. How to make this more of a one-prompt machine — round 2's three

1. **Make the probe a GATE, not a citation.** A rework packet that names a probe should be
   unable to close without that probe's output in the handoff — the orchestrator can enforce this
   mechanically: grep the handoff for the probe's own header line (`react 19.2.8 · jsdom 30.0.1`)
   before accepting the marker. `COMMON.md` §10.10 states the rule; **nothing enforces it.**
   Measured this mission: **rules stated in prose were violated by the very next seat, twice
   (brainstorming §3b, and §10.10's ancestor). Gates were violated zero times.**
2. **Ship a `spec-lint` script beside the sweeps.** Three of this mission's five non-blocking
   findings are mechanical and would have been caught by one script run at handoff:
   counts-without-a-command (N11), escape-form-vs-character in any sentence containing "escape"
   (§19), and cross-reference topic drift (N1/N10, already scripted twice). The two xref scripts
   already exist and both live in `.hermes/reports/consent-ui/`. **Promote them to
   `tools/spec-lint/` and make the handoff marker require a clean run.** Estimated cost: 1 hour
   once. Estimated saving on the evidence so far: **two rework rounds per requirements mission.**
3. **Give each seat a durable per-seat memory file, not a fresh session with a reading list.**
   Three sessions of one seat have now each spent 25-40% of their budget re-reading the same
   corpus. The handoff+self-report pattern works — nothing was lost across two session deaths —
   but it is paid for three times. **A `SEAT-STATE.md` the seat appends to and reads first, with
   the artifact md5s it last verified, would cut the re-read to the DIFF.**

## 23. Dead ends, round 2 — do not re-derive

- **Do not "fix" `R17-h5b` in `b2-repin-probe.mjs`.** It is meant to fail. It is the standing
  proof that the `change` dispatch is dead, and its logic must not be adapted (my packet says so;
  I confirm it after reading the probe).
- **Do not add `MouseEvent("click")` to the SPEC as an alternative.** It is measured to work. It
  is deliberately not offered, because two idioms presented as equivalent is what caused B4. The
  measurement is recorded so the next seat does not re-run it to "discover" it.
- **Do not split R17's case 5 into two fresh-mount cases.** Measured: it passes, and its second
  half becomes byte-identical to case 4. It buys nothing.
- **Do not assert only the button's `disabled` state in case 6.** Measured green under all four
  variants — no discriminating power. The `.checked`-survives-a-re-render assertion is the whole
  point of the case.
- **Do not re-count the cross-reference sweep and expect a stable number.** Three scripts, three
  numbers (125 / 221 / 277), and my re-run of the round-1 script today returns **204** — because
  the corpus includes the header that carries the count. `UNRESOLVED: 0` is the property that
  matters; the total is noise.

## 24. Round-2 cost accounting

| Activity | Wall clock | Avoidable? |
|---|---|---|
| Read-in (packet, COMMON, verdict, 2 handoffs, 4 artifacts, board) | ~30 min | Partly — see §22.3 |
| Running the two mandated probes as a RED baseline | ~3 min | **No — this is the round's whole point** |
| Writing + running 3 scratch probes (B5 remedy, discriminator, the six v3 cases) | ~25 min | No — it caught §18 |
| Editing 2 SPECs, 2 PLANs, 2 DECISIONS, compass, superseded handoff | ~25 min | No |
| Both xref sweeps + adjudicating 44 + 7 flags by hand | ~12 min | Scriptable (§22.2) |
| Self-inflicted escape/awk defects, found and recorded | ~8 min | **Yes — §22.2** |
| Handoff, self-report, board posts | ~20 min | Partly |

**Deliverables this round:** 2 SPEC archives (`SPEC-v2.md` ×2, byte-identical, md5s recorded),
2 SPEC v3s with supersession headers, 2 PLAN version-tracking updates + 1 PLAN idiom rewrite,
2 DECISIONS appends (13 lines), 1 compass edit (99 lines, cap 100), 1 appended SUPERSEDED block
on the round-1 handoff, 1 round-2 handoff, this Part III, 3 scratch probes left on disk under
`scratchpad/req-01-r2/` for the re-reviewer. **No git writes, no code, no CSS, no test changes,
no edit to any archived file** — contract held.

## 25. The one sentence for V

**Two rounds of this mission were spent on the same defect in two costumes — a test idiom
written down without being executed — and the fix that finally holds is not a better sentence,
it is a probe that runs; the machine gets one-prompt-shaped exactly to the degree that its rules
become commands somebody runs rather than prose somebody reads.**
