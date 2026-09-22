# Self-report — CODE-REV-S02-C9, round 1 (blind code review, Claude Opus 5)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

**SKILLS LOADED:** `superpowers:using-superpowers`, `heartbeat-protocol`, `heartbeat-reviewer`,
`superpowers:verification-before-completion`, `superpowers:systematic-debugging`,
`superpowers:receiving-code-review`. All six loaded in that order, bodies read, before any measurement.
Reviewer floor (`heartbeat-protocol` §1) is `verification-before-completion` +
`receiving-code-review`; both loaded. `systematic-debugging` was loaded and USED (it is what stopped me
turning my own P4 probe failure into a wrong finding — see §3).

Session: fresh blind session, round 1 of max 3. Worktree `.worktrees/rev-s02-c9/dialectical-engine`
detached @ `2127c4ad`, `git status --porcelain` = 0 at CLAIM and 0 at every checkpoint after every
mutant restore. I never entered `.worktrees/consent-s02` and never wrote a product file.

---

## 1. THE BODY — what the review actually found

The commit under review is clean. Three test files, zero product files, one commit, no merge in the
range, purely additive except one sanctioned relaxation, and every claim in the author's handoff
reproduced in my worktree, digit for digit, in both shells, three runs each. If the charge had been
"check the author's arithmetic", the answer is PASS and it took two hours.

**The killing blow came from the ONE charge that could not be discharged by re-running the author's
commands: "render the sign-up card and the cookie surfaces in ONE document."** No test in this
mission does that. Every suite mounts one slice's surfaces. I wrote a seven-case fixture that mounts
`SignUpFlow` and `CookieConsent` together the way `layout.tsx:46-49` composes them, and case P4 found
that with the cookie preferences card open and the sign-up privacy policy opened over it, ONE
`Escape` closes the CARD UNDERNEATH and leaves the policy — the surface with the focus trap and the
higher z-index — open.

**Cause, named:** `modalSemantics.ts:105-127` resolves "topmost" by DOCUMENT position; the stylesheet
resolves it by Z-INDEX (`--z-consent-card: 76` vs `--z-policy-card: 78`, `globals.css:93-94`); and
`layout.tsx:46-49` mounts `<CookieConsent />` AFTER `{children}`, so on `/sign-up` the two orders
DISAGREE. S01's own pair agrees (its policy is rendered after its card, so document order and z-index
point the same way) — which is exactly why every existing test passes and why the defect is invisible
until both slices are in one document. **This is the class: a helper whose correctness depends on a
composition property that no single-slice test can express.**

Not caused by the diff. `git rev-parse 19cc8e77:<file>` = `HEAD:<file>` for all five product files.

---

## 2. WHAT MUST BE UPGRADED — ranked by what it would have saved

**U1 (highest). An integration cluster whose command runs N single-slice suites is not an
integration test.** `run_c9` runs ten files; not one of them mounts both slices. The cluster's own
mutant column says "one cluster's fix breaking another's" — but every listed mutant is
*within*-slice. **Rule to add:** a cluster whose stated purpose is cross-slice integration must own
at least ONE test file that MOUNTS both slices' entry components in a single document, composed in
the ORDER the real root layout composes them, and that file is named in the cluster command. Price if
this had existed: the defect would have been found at C9 by the author instead of by the reviewer,
and it would have been fixable inside a coding cluster instead of needing a new ticket after the
lane's last commit.

**U2. Two orderings of the same concept, in two files, with nothing asserting they agree.** The Esc
stack orders surfaces by document position; the stylesheet orders them by `--z-*`. Nothing anywhere
asserts those two orders produce the same ranking. **Rule to add:** when a product expresses one
ordering twice (paint order and interaction order), one test asserts the two rankings are equal over
every declared pair. That is a five-line test and it kills this whole class permanently.

**U3. `BASELINE.md` still has no pin for the sixteen-file set nor for `consent-signup-modal.test.tsx`.**
The author raised it (F4); it is still true. Every seat that touches this slice now re-derives
"which sixteen files" from prose. The author had to disclose the set as a CHOSEN constant (their D1)
— a reviewer then has to re-derive it too. I did: `ls tests/render/consent-*.test.tsx
tests/unit/consent-*.test.ts` = 14, plus `auth-flow-integration` + `v2ui-node-runner` = 16, 181 tests
at `2127c4ad`. **Rule already in COMMON §10.10 for COUNTS; extend it verbatim to SETS: a packet names
a set by the command that produces it, never by a prose name.** This is the third packet in a row
where the same sentence cost a seat a derivation.

**U4. The packet contradicted itself about a constant, and the correction was 15 lines below the
error.** `CODE-S02-C9.md` §2 states the merge arms as "2 and 2" with a *reason* ("S01's two token
blocks each declare `--scrim:` once") — measured false, it is 1 — and the "MEASURED TRUTH" block at
the bottom says so. A seat that reads top-down transcribes the wrong constant and its reason before
reaching the correction. **Rule:** a packet's MEASURED TRUTH block goes ABOVE the reading list, not
below it; and a constant that a later block corrects is DELETED from the earlier block, never left
standing beside its own refutation. The author said the same thing (their D4) from the other side —
"the MEASURED TRUTH block is the highest-value paragraph in the packet and it is last".

**U5. `PROGRESS.md` appears in the PLAN as a required output and in the packet as forbidden.**
`slices/S02/PLAN.md:1279-1280` says the seat records the merge "in `PROGRESS.md`'s handoff";
`CODE-S02-C9.md` §1 forbids `PROGRESS.md` and redirects to the ticket. The packet won, correctly, but
a seat that obeys the PLAN literally writes a forbidden file. **Rule:** when a packet overrides a PLAN
sentence, it QUOTES the sentence it is overriding. One line, and the conflict stops being a trap.

---

## 3. WHAT I NEARLY GOT WRONG — two near-misses, both cheap to institutionalise

**N1 — I nearly filed a FABRICATED B-finding against the contrast ladder.** I re-derived
`ratiosAt(0.7)` independently in Python and got **Terracotta 5.61**, where the suite asserts **5.54**.
5.61 is *the exact number the round-1 review found written wrongly in prose* — so for about ninety
seconds I had what looked like a confirmed regression with a matching historical fingerprint. It was
my bug: **Python's `round()` is banker's rounding (round-half-to-even) and JavaScript's `Math.round`
is round-half-up, and this rung is an exact `.5` tie** — `0.70·38 + (1-0.70)·233` is exactly `96.5`.
`round(96.5)` = 96 in Python, 97 in JS. Re-derived with `math.floor(x+0.5)` the whole ladder
reproduces the suite exactly, and the suite's own comment turns out to be accurate to the digit.
**Cost: ~6 minutes. Cost if I had filed it: a full rework round on a correct number.** Appended to
TOOLING-TRAPS. **Rule: a cross-language re-derivation of a rounding-sensitive constant is not
independent evidence until the rounding MODE matches; state the mode you used beside the number.**

**N2 — I nearly filed my own broken fixture as a product finding.** My probe's P4 failed on
"expected exactly one control labelled Preferences: expected +0 to be 1". The real label is `Choose
what to store`. `systematic-debugging` Phase 1 is the only reason I instrumented instead of
concluding: I added a `snap()` that prints `openSurfaceCount / dialogs / card / policyBezel` at every
step, and only THEN did the real defect appear — and it appeared with a different signature than my
first guess. **Had I written the assertion and trusted the first red, I would have reported "Escape
closes nothing" instead of "Escape closes the wrong surface".** The instrumentation is in the promoted
probe and is worth more than the assertions around it.

---

## 4. DEAD ENDS — do not re-derive these

- **A bare package specifier does not resolve from a scratchpad-rooted probe runner.** COMMON §10.46
  and TOOLING-TRAPS `:2440` cover *aliased* specifiers (`@`, `react`, `next/*`). They do not cover
  `import { JSDOM } from "jsdom"`, which dies with `Failed to resolve import "jsdom"` because the
  runner's `root` is the scratchpad and node resolution starts there. **Do not add a `jsdom` alias:**
  the probe already runs under `// @vitest-environment jsdom`, so the ambient `document` IS the
  parser — inject a `<style>` into `document.head`, read `document.styleSheets`, remove it. Cost me
  one run. Appended to TOOLING-TRAPS.
- **`git diff --quiet <a> <b> -- <path>` exits 0 for a path that does not exist.** The git root here
  is one level ABOVE the project root, so `git show --name-only` prints
  `dialectical-engine/tests/...` while a pathspec typed from inside `dialectical-engine/` must NOT
  carry that prefix. I ran a whole deletion sweep that printed "no deletions" in all three files —
  vacuously, because every pathspec resolved to `dialectical-engine/dialectical-engine/...`. **The
  non-vacuous form is `git rev-parse <rev>:<repo-relative-path>` on both revisions and compare the
  BLOB HASHES** — that fails loudly on a wrong path instead of silently agreeing with you. This is
  the exact shape of the "guard that cannot fail" class TOOLING-TRAPS already tracks, arriving
  through `git` instead of through `grep`. Cost me one round-trip and it nearly let a vacuous
  "no product file changed" proof into my verdict.
- **`grep -c` returning 0 exits 1**, which silently truncates an `&&` chain of checks. Two of my
  early combined commands lost their tail that way. Use `;` between independent checks, always.

---

## 5. WHAT REPEATEDLY COSTS TOKENS IN THIS HARNESS

1. **Re-deriving sets and constants a packet named in prose** (U3). Three seats have now paid for the
   same sentence.
2. **Reading a 144-line COMMON, a 30-line packet, a 100-line compass and a 45-line BASELINE before
   the first measurement.** That is the price of correctness and I would not cut it — but ~85% of
   what I needed came from four places: the packet's §4 charges, BASELINE's pin table, the PLAN's two
   fenced blocks, and the diff. **A packet could carry a "the four things you must read to start
   measuring" line and defer the rest to the point of use.** I read COMMON §§1-9 in full and used
   §7, §8 and §10.16/10.24/10.26/10.35/10.42/10.44/10.46 — the rest was context I did not act on.
3. **Vitest wall-clock.** `run_c9` ×3 in two shells + the sixteen-file set ×3 + eighteen mutant runs
   + the probe ×3 is ~40 vitest invocations. Each mutant needs only ONE file; running the ten-file
   set for a mutant would have quadrupled it. **Rule: a mutant's command is the narrowest file set
   that can observe the property, and the cluster command is run separately, once, at the end.**
4. **The three-run law applied to things that cannot vary.** Three identical runs of a pure text
   assertion (`grep -c` on a committed file) is three times the cost of one for zero information.
   **Proposal for V: the three-run law binds commands with a RUNTIME (vitest, tsc); a pure filesystem
   or grep arm states its value once and says why it cannot vary.** I still ran everything ×3 because
   the law as written says so.

---

## 6. TOWARD THE ONE-PROMPT MACHINE

- **The single highest-leverage change is U1.** "Integration cluster" is currently a label on a
  cluster that runs other clusters' tests. Make it a structural requirement — *one file, both slices,
  real composition order* — and the machine stops shipping cross-slice defects to V.
- **Make the reviewer's own-fixture charge produce a PERMANENT artifact.** My
  `code-rev-s02-c9-r1-crossslice.probe.test.tsx` found the defect and is now a promoted probe that
  nothing in CI will ever run again. **It should become `tests/render/consent-cross-slice.test.tsx`,
  owned by a coding cluster, with P4/P6/P7 as its cases.** A reviewer's fixture that found a real
  defect is a test the product needs; "promote to `probes/`" quietly throws away the best asset each
  review produces.
- **Packets should carry the ORDER the app composes surfaces in, whenever a seat is asked to reason
  about surfaces.** My packet said "render the sign-up card and the cookie surfaces in one document"
  and left the order to me. I got it right by reading `layout.tsx:46-49` — but the wrong order (cookie
  first) makes the defect DISAPPEAR, and a seat that guessed would have reported a clean PASS with a
  probe that looked identical.
- **The self-report snapshot rule (COMMON §10.33) worked.** Nothing was overwritten this round.
- **What did NOT cost anything, and is worth keeping:** the author's handoff was structured so that
  every claim carried its command; I could re-run eleven of them without asking a question. That is
  the standard.

---

## 7. WHERE MY PACKET FOUGHT ME — exactly

- **§2 says "`tests/support/tokenContract.ts`'s `styledDocument()` if it serves; else a byte scan".**
  It serves — `tests/support/tokenContract.ts:34` — but it builds its OWN detached JSDOM, so it
  cannot be used to render components; I needed a document with React mounted in it. The packet
  offered a tool for the wrong half of the job. It cost me nothing because I read the file first, but
  the sentence points a seat at a dead end.
- **§2's probe list is a paragraph of fourteen semicolon-separated charges.** I turned it into a
  checklist by hand and there is a real risk of dropping one. **Numbered charges, one per line.**
- **§4 tells me the author's claimed figures BEFORE I measure.** That is anchoring on a blind seat by
  construction. I ran everything from the PLAN's fenced blocks rather than from §4's numbers, and the
  agreement is therefore meaningful — but a blind lens would be blinder if the packet said "the
  author claims figures for X, Y, Z; measure them and compare AFTER" and put the numbers in an
  appendix the seat opens at the end. I would support that change.
- **What the packet got RIGHT and should be copied:** naming the mutant for each pin *and* the
  mutant's expected direction, so I could plant them without reading the author's evidence first.
  That is the single reason this review is independent rather than a re-read.

---

## 8. LEDGER

| item | value |
|---|---|
| worktree / commit | `.worktrees/rev-s02-c9/dialectical-engine` @ `2127c4ad`, porcelain 0 start→end |
| vitest invocations | ~40 (run_c9 ×3 ×2 shells, sixteen-file ×3, gates, 18 mutants, probe ×3) |
| mutants planted / restored | 18 — 7 product (`SignUpFlow.tsx`), 10 stylesheet (`globals.css`), 1 test; every one `cp`-snapshot, `cp`-restore, `diff -q` identical, porcelain 0 after each |
| `git checkout --` used | never (COMMON §10.44) |
| blocking findings | 1 (cross-slice Esc stack — not caused by the diff) |
| non-blocking findings | 5 |
| packet findings | 4 |
| near-misses that would have been wrong findings | 2 (§3) |
| TOOLING-TRAPS appended | 2 entries (banker's rounding; bare specifiers in a scratchpad runner) |
| files written | this report, the verdict, the TOOLING-TRAPS append, the probe kit, board comments |
