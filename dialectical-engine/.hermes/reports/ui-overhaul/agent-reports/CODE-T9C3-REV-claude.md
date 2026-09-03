# CODE-T9C3-REV case file — Opus 5 blind review of Wave 0 (commit 55b18ee)

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

**Verdict issued:** REWORK — 1 blocking (B1), 7 non-blocking (N1–N7).
**Seat:** review only. Wrote this file and one board comment. No product edit survived.

## 1. Cause of death, named

The body is not the worker's code. The worker's code is, on every axis I could
measure, correct: 89 mode-bearing tokens x 2 modes plus 24 mode-independent
tokens match `token-inventory.md` to the character; all 69 pre-existing custom
property names survive; the RED claim reproduces byte-for-byte.

**The cause of death is that the mission's gates do not cover the mission's
code.** Three of my four highest-value findings are the same defect wearing
three costumes:

- `pnpm run typecheck` was mandated as the compile gate. The root `tsconfig.json`
  carries `"exclude": [..., "web", "apps/ui", ...]`. **Both TSX files this
  cluster wrote are outside the typechecked graph.** The gate returns 0 for a
  file it never opened. That is how a new component that does not compile
  (`TS2503: Cannot find namespace 'JSX'`) shipped past a green board.
- ADR-001's oracle excludes `globals.css` lines **1–199**. The token region it
  is protecting ends at line **114**. Eighty-five lines of the file are exempt
  from the colour-literal law for no reason but the round number in a regex.
- The no-flash guard's acceptance is `source.indexOf("<head>") <
  source.indexOf("{children}")`. It pins the position of a *string in a source
  file*, not the position of a *script relative to first paint*.

Generalised: **every one of these gates asserts a proxy that was cheap to write,
and the proxy's failure mode is silence.** A gate whose blind spot is invisible
is worse than a missing gate, because it converts "nobody checked" into "checked,
green".

## 2. What I nearly got wrong

**I nearly filed a false blocking finding.** `debatePresentation.ts` converts an
SVG connector colour from `oklch(0.82 0.006 80)` to `var(--line-strong)`, and
`DebateCanvas.tsx:165` consumes it as `stroke={c.color}` — a **presentation
attribute**, not a style declaration. I was confident from memory that browsers
do not resolve `var()` in SVG presentation attributes, which would have rendered
every empty/abandoned connector solid black. I had the finding drafted.

I ran it in a real browser instead. Chrome 152 resolves it correctly
(`stroke="var(--line-strong)"` -> computed `rgba(41, 38, 31, 0.2)`). **The
finding was wrong and would have cost the worker a rework round against correct
code.** Cost of the probe: one HTML fixture, one `python3 -m http.server`, two
tool calls, under two minutes. Cost of skipping it: a full round and a seat's
trust.

This is the single most transferable thing in this report: *reviewer memory
about browser behaviour is not evidence.* The harness already has Playwright
wired in. Any finding that turns on "does the platform do X" must be settled by
running X.

## 3. Dead ends — do not re-derive these

- **`var()` in SVG presentation attributes.** Works. Chrome 152, verified.
  Refuted above. `debatePresentation.ts` is clean.
- **Dropped custom-property names.** I hypothesised the token rewrite dropped a
  name the 4119-line stylesheet still references. It did not: all 69 old `:root`
  names are declared in the new file, and only 4 `var()` references across
  `apps/ui` resolve to nothing — three next/font injections
  (`--font-fraunces`, `--font-jakarta`, `--font-mono-src`) and `--dot`, which
  components set inline with a documented fallback. Zero orphans.
- **"The test hard-codes the palette, which ADR-005 calls RED."** It does not.
  The contrast test reads every value off the real stylesheet through jsdom and
  computes ratios on what was read; the hard-coded maps are the *inventory
  transcription* used as the fidelity oracle, which is a different and correct
  job. I checked the transcription independently against the inventory markdown
  and it is exact.
- **A literal hiding in the oracle's blind window (lines 115–199).** The window
  is real (N2) but is currently empty. The mutant had to be planted.
- **Chamber-block cascade order.** `html[data-mode="chamber"]` is specificity
  (0,1,1) against `:root`'s (0,1,0); it wins regardless of source order, so a
  reorder is not a live defect. The worker's specificity probe covered this.

## 4. What repeatedly cost tokens

**The 2,006-line spine, read in full, before a single line of the diff.** My
packet's §0 mandates it. The spine's own router says: *"If you are reading more
than ~200 lines of protocol before starting work, something is wrong — say so."*
I am saying so. The spine and the router contradict each other in the packet's
own read order. Of those 2,006 lines, the ones that changed a single action I
took were §9 (review-lane), §11 (preserved laws), the v3.3.0 amendments, and the
79-line reviewer contract — roughly 350 lines. The other ~1,650 were routing law
for seats I am not. The worker's self-report independently reports the same tax
("a 2,006-line spine plus overlapping adapters and skill copies; version labels
drift between 3.0, 3.1, and 3.3"). **Two consecutive seats paid the same toll and
both filed it. That is a measurement, not an opinion.**

**Second cost: reconciling three documents that each state the token inventory.**
`token-inventory.md` (markdown tables), `globals.css` (the CSS), and
`t9-mode-tokens.test.ts` (a hand-transcribed TS object literal). To review token
fidelity I had to write a parser for the markdown tables — including a special
case for the combined `--m-*-bg / -border` rows — because no machine-readable
form exists. The worker names the same fix in its own report. Independently
reached, same conclusion: **one structured token artifact, everything else
generated.**

## 5. Where the packet fought me

1. **Wrong requirement IDs.** Packet §1 sends me to "T9/SPEC v3 **R7-R8**" as
   ground truth for the mode toggle. T9's mode-toggle requirement is **R3**. R7
   is the method ledger; R8 is placeholder statics. The worker's packet carries
   the identical error ("read R7/R8 for what the mode toggle must observably
   do"). A reviewer who trusted the packet over the SPEC would have graded wave 0
   against the wrong two requirements. Filed as N4.
2. **The isolation bound is self-contradictory.** §5 forbids git write commands,
   so `git worktree add` is unavailable; the reviewer contract makes one worktree
   per lens *law*; and §2 orders me to apply mutants in the working tree. The
   three cannot all hold. I complied by taking file-level backups and restoring
   by `cp`, verifying `git diff` empty per path — but I mutated the shared main
   workdir, which is what the worktree law exists to prevent.
3. **"Verify clean with `git status`" presumed a clean baseline that never
   existed.** The tree carried another lane's uncommitted
   `web/app/public/debate/[id]/page.tsx` before I was dispatched. Under the
   spine's pre-existing-dirt attribution I left it untouched and named it. But
   the packet's rule as written ("a dirty tree at verdict time is your defect")
   would have convicted me at t=0.
4. **`--fix`-shaped instruction with a read-only bound.** §2 says "run at least
   two mutants of YOUR OWN devising"; §5 says "Read-only repo except your
   self-report + board comments". Resolvable, but only by inference.

## 6. What to upgrade — concrete, ranked by payback

1. **Make every acceptance command name the tsconfig it compiles under.** Wave-0's
   compile gate must be `pnpm exec tsc --noEmit -p apps/ui/tsconfig.json`, with
   the known pre-existing `DebatePageClient.tsx(1488)` error baselined and
   ticketed to its owner. "Repo-wide typecheck" is a phrase that was false in
   this repo and nobody checked it. **This one change catches B1 before dispatch.**
2. **Pre-dispatch packet validator.** The worker asked for this too, from the
   other side of the same wall. It should mechanically check, before a packet
   goes out: every SPEC requirement ID quoted resolves to that ID in the frozen
   SPEC (would have caught N4 twice); every acceptance command's file scope is
   a subset of the `allowed` list (this is the AF-1 defect that cost ~175k tokens
   and a whole attempt); every exclusion regex's boundary matches the artifact it
   claims to bound (would have caught N2); every quoted count re-measures.
   **Three of my eight findings are pre-dispatch-detectable by a script.**
3. **One structured token artifact.** `tokens.json` -> generated CSS blocks,
   generated test fixtures, generated contrast rows, generated inventory tables.
   Today's three hand-maintained copies are three chances to drift and one
   guaranteed parser-writing tax on every reviewer.
4. **Anchor exclusions on syntax, not line numbers.** The oracle should exclude
   "everything up to the closing brace of the `html[data-mode="chamber"]` block",
   which is computable, instead of `lines 1-199`, which is a guess that was
   already 85 lines stale on the day it was written.
5. **Refutation duty needs a placement clause.** v3.3.0 item 5 tells the worker
   to build the mutant the assertion exists to catch. The worker built four good
   mutants and one negative control — genuinely above the bar. All five mutated
   *values*. Every one of my three mutants moved or removed something *positional
   or structural* and all three stayed green. Add to the law: **for any assertion
   whose property is "X happens before Y" or "X is present at Z", the required
   mutant is a MOVE, not an edit.**
6. **Split the spine by seat.** Ship `spine-reviewer.md` (~350 lines) and
   `spine-worker.md` alongside the full document. Two consecutive seats have now
   priced the full read. The full spine stays normative; the per-seat cut is what
   gets loaded.

## 7. Toward a one-prompt machine

The machine already did the hardest thing correctly, and it should be said
plainly: **the worker's preflight block on AF-1 was the system working.** A
coding seat refused an unsatisfiable acceptance *before writing a line*,
escalated with a grouped enumeration, and architecture amended the ADR rather
than pressuring the seat. That is the loop functioning exactly as designed, and
it cost one authority-epoch bump instead of a shipped-and-reverted wave.

What still needs a human in the loop is narrower than the ceremony implies. Of my
eight findings, **five are mechanically detectable without judgement**: B1 (run
the right tsc), N2 (compare a regex boundary to a brace position), N4 (resolve a
requirement ID), N5 (read a tsconfig `exclude`), N7 (compare a commit's file list
to the packet's `allowed` list). Only N1, N3, and N6 needed a model to notice.

So the honest shape of the upgrade is: **stop spending model tokens on things a
50-line validator does better, and spend the saved budget on placement mutants
and browser probes, which is where both of this review's real findings came
from.** The blocking finding came from running a compiler the packet did not
name. The most instructive non-finding came from running a browser instead of
trusting my own recall. Neither is expensive. Both were optional under the packet
as written, and that is the last thing to fix: **the packet should have ordered
both.**

## 8. Prices

| Item | Price |
|---|---|
| Spine read in full before any diff | ~2,006 lines; ~350 acted on |
| Markdown-table parser for token fidelity | one throwaway script; unavoidable without a structured artifact |
| Near-miss false blocking finding (SVG `var()`) | ~2 min to refute; would have cost 1 full rework round if filed |
| AF-1 packet defect (inherited, pre-dispatch detectable) | ~175k tokens + 1 failed attempt, per the board record |
| Mutants M1–M3 | 3 apply/revert cycles, ~30s each; 3 for 3 green |
| Runs executed | acceptance x3, render suite x2, root typecheck x1, workspace typecheck x1, wave-0 oracle x3, RED reproduction x1 |

---

# REV2 — re-review of rework round 1 (frozen target: 94c3bcf)

**Verdict issued:** REWORK round 2 — 1 blocking (B2). All four round-1 findings CONFIRMED FIXED.

## 9. What the rework got right, and it is worth naming

Round 1 is the best-disciplined work I have reviewed in this mission. The worker
did not just satisfy my findings, it **reproduced each one first**: for N1, N2 and
N3 it re-applied my mutant, showed the acceptance still GREEN under it (the defect
demonstrated against current code), *then* wrote the assertion, *then* showed RED,
then reverted. That is the spine's reproduce-first law executed literally, on a
reviewer's mutant rather than its own. It also ran three neighbour controls; I
spot-checked two independently and both behaved as claimed.

I verified all three of my mutants go RED, plus the `<body>` half of the N3 class
that I did not ask for and the worker swept anyway. F-B1 is fixed under **both**
compilers present in this repo.

## 10. Where I was wrong, and the correction matters more than the finding

ADR-006's AM2 changelog states flatly that my round-0 record *"layout.tsx CLEAN"*
was wrong, and that the workspace typecheck emits **three** error lines at
`55b18ee`, not two. I opened this re-review believing ARCH had baselined a
non-existent error, and I had the finding half-drafted.

**ARCH is right and I was wrong.** The cause is one I did not know was there:

```
repo root   → pnpm exec tsc --version → 7.0.2  → 2 errors (TS2322 + TS2882)
apps/ui     → pnpm exec tsc --version → 5.9.3  → 1 error  (TS2322 only)
```

**This repo contains two TypeScript compilers**, root-pinned `7.0.2` and
`apps/ui`-pinned `^5.6.0` → 5.9.3, and `pnpm exec` resolves whichever is nearest
the cwd. I ran the workspace typecheck from inside `apps/ui` in round 0; ARCH ran
it from the repo root, which is how ADR-006 publishes it. Same tsconfig, same
tree, different compiler, different answer. TS 7 reports the unresolved
side-effect import of `./globals.css` as TS2882 by default; TS 5.9.3 does not
report it at all (and under `--noUncheckedSideEffectImports` reports it as
**TS2307**, a different code again).

The baseline entry is therefore **correct and load-bearing**: I confirmed that
dropping it makes the 0-new gate return 1, not 0. My round-0 line was a
measurement taken in a different directory and stated as a property of the tree.

**The transferable lesson, and it is the same shape as my round-0 near-miss:**
last round I nearly filed a false finding because I trusted my memory of browser
behaviour instead of running a browser. This round I nearly filed a false finding
because I trusted my memory of *my own earlier command* without re-checking which
binary it had run. **A command is not a measurement until you know which binary
executed it and from where.** ADR-006's law says an acceptance gate must name the
tsconfig; on this repo that is necessary but not sufficient — it must also name
the invocation directory, because here the tsconfig does not determine the answer.
Filed as N9.

## 11. The blocking finding: the fix kept the wrong SHAPE

My N2 said the exclusion window was 85 lines too wide. The rework replaced the
literal `199` with `tokenBlockBoundary(css)`, computed from syntax, throwing when
not found. Every word of that is an improvement and it closes M2 exactly.

But the exclusion is still `lineNumber <= boundary` — **a one-sided prefix range**.
The boundary now comes from the right place; the *shape* is unchanged. ADR-001
AM2 states the property in its own words — *"the exemption covers the token region
itself … and nothing beyond it"* — and a prefix range cannot express that, because
the token region is not a prefix. It is two intervals with everything else outside.

Three live members of the surviving class, all verified GREEN on the frozen tree:

| Mutant | Placement | Boundary | Oracle | Suite |
|---|---|---|---|---|
| M4 | literal at line 73, in the **gap between** `:root` (ends 72) and chamber (starts 74) | 115 | 0 | 8/8 green |
| M5 | literal at line 4, **above** `:root`, in the comment banner | 115 | 0 | 8/8 green |
| M6 | **chamber block relocated to EOF** + literal at 150 | **4122** | 0 | 8/8 green |

M6 is why I am blocking rather than filing this as N. Moving the Chamber block to
the bottom of the file is a *semantically legal* refactor — ADR-002 itself records
that `html[data-mode="chamber"]` (0,1,1) beats `:root` (0,1,0) regardless of source
order, so nothing else in the suite objects. That single move pushes the computed
boundary to 4122 and **exempts the entire 4119-line stylesheet**. The colour-literal
law — the acceptance all 32 clusters inherit — is silently switched off for the one
file every one of them consumes, and `globals.css` has exactly ONE authorised
writer for the whole mission, so no later seat may repair it.

This is the spine's own corollary, playing out one round later on the same finding:
*naming a risk and neutralising it are different acts, and only the second one
ships.* Choose the remedy by the SHAPE of the thing, not by the source of the
number that was wrong.

**Remedy, verified before I required it** (scratch copies, no repo write): return
the two block ranges and exempt a line iff it falls inside one of them.

```
CLEAN                     ranges=[(5,72),(74,114)]     hits=0   <- no false positives
M4 gap between blocks     ranges=[(5,72),(75,115)]     hits=1
M5 above :root            ranges=[(6,73),(75,115)]     hits=1
M6 chamber moved to EOF   ranges=[(5,72),(4082,4122)]  hits=1
```

The same change is owed to the shell oracle in ADR-001 §(a), which has the
identical one-sided `$2+0 <= b` filter. As with B1, the worker implemented the
ADR's published helper character-for-character, so **the ADR is again the source
and the worker is again not at fault.**

## 12. What this round cost, and what would have prevented it

Round 1 cost one full seat cycle to fix four findings, three of which were
assertion-strength defects that a **placement-mutant requirement** would have
surfaced before first handoff. I recommended exactly that in §6.5 of this report
last round; it has now paid for itself twice, because B2 is *also* a placement
defect — this time in the guard rather than in the guarded.

The generalisation I would now add to that recommendation: **when a finding is
about a boundary, the fix must be re-mutated on BOTH sides of it.** The worker
re-ran my M2, which probes below the boundary, and stopped. Nobody probed above
it, or asked what happens when the boundary itself moves. One mutant per side and
one for "the landmark relocates" would have caught all three of M4/M5/M6 in the
same round for a few minutes of work.

## 13. Prices — REV2

| Item | Price |
|---|---|
| Near-miss #2: false finding against ADR-006's TS2882 baseline | ~4 tool calls to refute; would have wrongly charged ARCH and defended a wrong round-0 record |
| Discovering the dual-TypeScript split (7.0.2 root / 5.9.3 workspace) | 1 call; explains a discrepancy that would otherwise recur every round |
| Mutants re-run (M1, M2, M3, M3b) + 2 neighbour controls | 6 apply/revert cycles, all clean |
| New structural mutants (M4, M5, M6) | 3 cycles; 3 for 3 GREEN — the class was not closed |
| Remedy pre-verified out-of-tree before being required | 1 script; turns "fix it" into "fix it this way, here is the proof it works" |
| Gates run | acceptance x3 (13/13), render x1 (78/78), root typecheck x1, workspace tsc x4 (two cwds, one flag probe), syntax oracle x6 |

---

# REV3 — review of rework round 2 (frozen target: 77441de)

**Verdict issued:** PASS — Wave 0 merged-ready. B2 CONFIRMED FIXED and its whole class closed.
Two non-blocking findings filed with tickets (N10, N11). Round 3 of 3 deliberately NOT spent.

## 14. The tiering decision, which is the only hard part of this round

Round 3 was the last lawful round. A REWORK from me would have consumed it and put
Wave 0 in front of V. So the question was not "did I find something" — I did — but
"is what I found worth that, and worth blocking 31 downstream clusters."

I found P1: indenting `:root`'s closing brace (legal CSS, whitespace is
insignificant) makes the line-anchored `^}` scan in `tokenBlockRanges` skip the
real close and run on to the next column-0 brace. The `:root` range widens from
(5,72) to (5,115), the gap at line 73 falls inside it, and a planted magenta
literal passes 8/8 green.

**I passed anyway, and the reasoning is the part worth keeping.** Three things
separate P1 from B2, and I had to be honest about each rather than treat "found a
green mutant" as automatically decisive:

1. **B2's class is genuinely, completely closed.** B2 said the exemption's SHAPE
   was a prefix when it needed to be set membership. That is fixed. M2, M4, M5 and
   M6 — every fixture I built across two rounds — now go RED naming the exact
   planted line. P1 is not a surviving member of that class; it is a *different*
   defect, in the range FINDER's brace matching rather than in the exemption's
   shape.
2. **The severity gap is enormous and I should not blur it.** M6 exempted all
   4,119 lines under a *conventional* refactor that ADR-002 itself certifies as
   semantically legal ("put the dark-mode overrides at the bottom"). P1 exempts
   **two lines** (73 and 115) under a hand-edit that nothing in this repo
   encourages — every top-level brace in `globals.css` is at column 0, and any
   formatter would keep it there. Treating those as the same tier would be
   theatre.
3. **The reviewer failure mode I was walking into.** I escalated three rounds
   running. There is a real trap where a reviewer keeps producing progressively
   smaller variants of the same probe and never passes anything, and the only
   discipline against it is proportionality. My own round-2 verdict said the tier
   "depends on how real you judge the single-writer lock to be." Here the trigger
   is not something any downstream cluster could do — none of them may edit
   `globals.css` at all.

So P1 is N10 with a mandatory ticket, not a fourth blocking round.

## 15. N10's remedy was already in the repo, which is the actual finding

The fix for P1 is to stop scanning for a column-0 `}` and count brace depth
instead. **That parser already exists**, twenty lines away, in
`tests/support/tokenContract.ts:18-23`, where `declarationBlock()` has done
depth counting since Wave 0 shipped. The repo has **two parsers for one job**, and
the acceptance guard is wired to the weaker one.

Verified before requiring it (scratch copies, no repo write):

```
CLEAN   line-anchored (shipped)  ranges=[(5,72),(74,114)]  hits=0
CLEAN   depth-counting           ranges=[(5,72),(74,114)]  hits=0   <- identical, no false positives
P1      line-anchored (shipped)  ranges=[(5,115),(75,115)] hits=0   <- MISS
P1      depth-counting           ranges=[(5,72),(75,115)]  hits=1   <- caught, line 73
```

The finding to record is not "regex weaker than parser". It is: **the mission
built a second, weaker implementation of a routine it already had, because the ADR
published a self-contained code block instead of pointing at the existing helper.**
Three rounds of ADR amendments each published a fresh snippet for the worker to
mirror verbatim. That is a good mechanism for making a contract unambiguous, and it
is exactly how it produces duplicate implementations that drift. When an ADR
publishes an algorithm the codebase already contains, the contract should be
*"export and reuse `declarationBlock`"*, not a new listing.

## 16. Where the ADR's own claim did not hold — N11

ADR-001 AM3's helper carries the comment *"Throws if either block is absent or
unclosed."* The **absent** half is true and I proved it: renaming `:root` produced
`:root token block not found in globals.css` and failed four tests.

The **unclosed** half is not reachable. I deleted the Chamber block's closing brace
at line 114. `find()` did not throw — it ran on to the next column-0 `}` at line
117 and returned `[74,117]`. In a 4,119-line stylesheet there is always a later
`^}`, so the "not closed" throw path can essentially never fire; silent
over-extension is what actually happens.

**The suite still failed, and I want to be precise about why, because the packet
asked for fail-loud and fail-loud is what happened — via a different mechanism than
the ADR claims.** `tokenContract.ts`'s depth-counting `declarationBlock()` threw
`TOKEN_BLOCK_UNCLOSED:html[data-mode="chamber"]` from the first test. The safety
net is real and not coincidental — a depth counter cannot mistake a later
unrelated brace for the close — but it is not the net the ADR names. Same root
cause as N10, same one-line fix, and it closes both: with depth counting, the
"unclosed" throw becomes genuinely reachable.

## 17. What the worker did, said plainly

Round 2 repeated round 1's discipline exactly: it re-applied MY fixtures (M4, M5,
M6 — the last one described in its handoff as "exact reviewer fixture"), showed the
pre-fix guard still GREEN under each, then installed the AM3 helpers, then showed
RED with the exact planted line, then reverted and re-ran clean. Net change: one
file, 25 insertions. `git show --stat 77441de` touches exactly
`tests/unit/t9-mode-tokens.test.ts` and nothing else. Skills floor met on every
round.

Across three rounds this seat was handed nine findings, closed nine, and introduced
none. Both blocking findings (B1, B2) originated in ADR text the worker implemented
faithfully — the failure was upstream both times, and the seat was the thing that
kept working.

## 18. The one-prompt-machine lesson from three rounds of the same finding

N2 → B2 → N10 is one defect examined at three depths: a wrong *number* (199), then
a wrong *shape* (prefix vs intervals), then a wrong *parser* (regex vs depth). Each
round fixed the layer above and exposed the one below. That is not waste — each
round's fix was correct — but three seat cycles for one guard is the price of
finding the layers serially.

What would have collapsed it into one: **when a finding is about a boundary, the
required refutation is a mutant on each side of it, one that moves the landmark,
and one that reformats it.** I wrote the first two into round 2's report; the third
is the one I only reached this round. All three are cheap, all three are
mechanical, and together they would have surfaced M4, M5, M6 and P1 in the first
rework. That belongs in the refutation-duty law, next to the existing
"build the mutant the assertion exists to catch".

## 19. Prices — REV3

| Item | Price |
|---|---|
| Mutants re-run (M2, M4, M5, M6) | 4 apply/revert cycles; 4 for 4 RED, each naming the planted line |
| Fail-loud probes (FL1 rename, FL2 unclosed) | 2 cycles; both ERROR — one of them for a reason the ADR does not claim |
| New boundary probes (P1 indented brace, P2 decoy third block) | 2 cycles; P2 caught, P1 GREEN |
| Remedy pre-verified out-of-tree | 1 script; and it found the duplicate parser, which is the real N10 |
| Gates | acceptance x3 (13/13), render (78/78), ADR-006 root gate (0, tsc 7.0.2), AM3 shell oracle (RANGES=5,72,74,114 → 0) |
| Round 3 of 3 | NOT consumed — the whole point of tiering P1 honestly |
