# CODE-REV-CROSS-03 — round 2 — blind re-review of `4cc0f4b6` (seat CODE-CROSS-03-REWORK-R1, ticket `t_ed4c5e73`)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging`

`superpowers:receiving-code-review` — **not loaded this session; not needed** (COMMON §10.9's honest
form): no finding of mine has been contested, and this packet carries no prior verdict's findings
for ME to discharge (COMMON §10.39 binds the seat that discharges findings; here that was the
author). If any finding below is contested I load it before answering.
`superpowers:systematic-debugging` **was** loaded and used, on the one thing I had to root-cause:
my first M5 mutant printed `SURVIVED` because it changed an unused local and not the predicate — a
no-op, not a surviving mutant (TOOLING-TRAPS `:1682`, `:1520`).

**Round 2 of max 3.** This verdict is PASS, so no round-4 question arises.

---

## Verdict: **PASS**

**B1 is DISCHARGED**, in both directions and by three independent instruments (the round-1
reviewer's probe run byte-untouched, the shipped suite's two new cases replayed against the base
helper, and a mutant battery). **N1 is discharged** — measured, not read. **N2 is discharged** by
the route the packet allowed (kept, with a proof), and the proof is correct under the NEW
predicate, which is not the same statement as it was under the old one and which I re-derived.

0 blocking · **3 non-blocking (N1–N3)** · **8 packet findings (P1–P8**; P6–P8 are against MY OWN
packet and are disclosed here). Every non-blocking finding carries its ticketing line; none is
filed as a residual (`heartbeat-reviewer` §3).

Nothing in the shipped behaviour is wrong. Every N-finding is about a sentence — one in an ADR,
one in the shared helper's own doc comment, one premise a test declines to measure — and all
three are the same family as the finding this round existed to close: **prose that states a
property the code does not have, or a coverage the mutants do not support.**

---

## The shipped predicate, in one sentence (the packet's charge)

`apps/ui/components/consent/modalSemantics.ts:210`

```ts
    if (container === topContainer || !topContainer.contains(container)) continue;
```

**A lower entry replaces the incumbent only when its container is a STRICT descendant of the
incumbent's — `Node.contains` AND not the same node.** Strict, not descendant-or-self.

---

## B1 — discharged (`reviews/CODE-REV-CROSS-03-r1.md`, the requirement)

### 1. The round-1 probe, byte-untouched, three runs

`.hermes/reports/consent-ui/probes/code-rev-cross-03-r1-reflexive-contains.probe.test.tsx`,
`md5 8c8e33921e4450abee53b8dd1f0f978d` — identical to the promoted file, copied not edited, run
through a scratchpad-owned `--config` (COMMON §10.46; the runner is the promoted template with the
lane from `LANE`, COMMON §10.35). Zero files created in the lane, zero under `tests/`.

```
=== RUN 1 exit=0 HEAD=4cc0f4b6 ===        (runs 2 and 3 byte-identical)
 Test Files  1 passed (1)
      Tests  6 passed (6)
P3 RESULT firstClose=0 secondClose=1        <- was firstClose=1 secondClose=0
P4 RESULT closed=["c"]                      <- was closed=["a"]
P6 RESULT closed=["inner"]                  <- control, unchanged
```

### 2. The same probe with the identity term removed (`cp` snapshot / `cp` restore / `diff -q`)

```
M1-IDENTITY-TERM-REMOVED | exit=1 | CAUGHT | plant-landed=True restore-ok=True
   Test Files  1 failed (1)
   Tests  2 failed | 4 passed (6)
   FAIL  … > P3 THE QUESTION — two surfaces SHARING one container node: which onClose runs?
   FAIL  … > P4 THE QUESTION, three deep — three surfaces sharing ONE container node
```

Both of the packet's constants reproduce exactly: `6 passed (6)` at `4cc0f4b6`,
`2 failed | 4 passed (6)` with the term removed. The four controls never move, so the harness
discriminates and the change is specific to identity.

### 3. The CLASS — every member measured, not read

| member | at `4cc0f4b6` | verdict |
|---|---|---|
| the predicate, `modalSemantics.ts:210` | `container === topContainer \|\| !topContainer.contains(container)` | **STRICT** |
| the helper's doc comment, `:150-162` | "a STRICT DESCENDANT … AND the two are not the SAME node"; "**With the identity term, every replacement IS strictly deeper**" | corrected (but see **N2**) |
| the pass-2 comment, `:208-209` | "STRICT descendant: `Node.contains` is reflexive, so the identity term is what stops two surfaces that SHARE one container node from inverting open order" | corrected |
| the pass-1 `null` comment, `:195-196` | "nothing can be a **strict descendant** of it" — corrected too, and it is NOT on the packet's member list | corrected, and swept beyond the list |
| `CookieConsent.tsx:197-200` | "containment only where one surface's container is a **STRICT DESCENDANT** of the other's — two surfaces holding the SAME container node are not nested either way" | corrected |
| `ADR-0022:211-257` (the correction addendum) | strict; THREE named; the later-commit case green either way | corrected — verified by mutant below |
| `S02/DECISIONS.md` rows | deferred by my packet's read-FIRST clause | **see the appendix** — verified there, correct |

Stale-wording sweep over the tracked tree, `grep -rn` over `apps docs tests`:
`descendant-or-self` → **0** hits anywhere. `Pinned by four` → **2** hits, both lawful: `ADR-0022:191`
is the superseded (b′) addendum (ADR law: never edit the earlier text) and `ADR-0022:241` is the
correction quoting it in order to correct it. A **third** "four cases" at `ADR-0022:119` belongs to
a different decision and is **N1** below.

### 4. The termination argument — true now

The r1 verdict's "second, independent tell" was that the doc comment argued termination from a
property the reflexive predicate did not have. With the identity term, `topContainer.contains(c)`
**and** `c !== topContainer` is exactly "strict descendant", so every replacement is strictly
deeper and the single-pass argument ("anything nested in the new incumbent was nested in the old
one too") is sound. The comment now says so. One clause of it is still wrong — **N2**.

---

## N1 (non-blocking) — `ADR-0022:119-120`: the SAME FILE carries a second self-coverage claim, and it is also wrong

```
:113  … **The precedence is
:114  surviving-capture-first, not named-control-first** …
:119  … Pinned by four cases in `tests/render/consent-modal-semantics.test.tsx` and one in
:120  `tests/render/consent-policy-link.test.tsx`.
```

**Concrete inputs → wrong outcome.** A future seat implementing `A11Y-OVERLAYS` (`t_8962842f`)
from this ADR — which is what the ADR is for — reads "four and one", counts five, and deletes or
declines to write one of the cases that actually carries the precedence; or trusts a coverage that
is not there. This is verbatim the harm N1 was filed for, four screens higher in the same file.

**Evidence — my own mutants, `cp` snapshot / restore / `diff -q`, against
`consent-modal-semantics.test.tsx` + `consent-policy-link.test.tsx` (42 cases):**

```
M6-NAMED-FIRST   (the precedence inverted — the exact mutant the sentence exists to exclude)
   exit=1 | CAUGHT | Tests  2 failed | 40 passed (42)
   FAIL  consent-modal-semantics … > keeps the captured opener ahead of the named control while the opener is on the page
   FAIL  consent-policy-link    … > returns focus to the Settings opener when the card closes

M7-NO-NAMED-ARM  (the `returnFocusRef` arm removed entirely)
   exit=1 | CAUGHT | Tests  3 failed | 39 passed (42)
   FAIL  consent-modal-semantics … > returns focus to the named control when the opener was unmounted by the same commit
   FAIL  consent-modal-semantics … > returns focus to the named control when the captured opener has since left the page
   FAIL  consent-policy-link    … > returns focus to the RETURNED bar's opener when the card closes
```

Union across both mutants: **THREE** cases in `consent-modal-semantics.test.tsx` and **TWO** in
`consent-policy-link.test.tsx`. The file's own focus-return case list confirms the shape —
`consent-policy-link.test.tsx` holds exactly two (`:322`, `:339`), so "and one" is an undercount
whichever way you count, and no mutant makes four semantics cases red.

**CLASS (binding):** *an artifact stating its own coverage without running the mutant that would
establish it* — **the class of r1's own N1**, and this is a member the rework did not sweep.
`heartbeat-protocol` §2.2: a reported finding is a SAMPLE of a class.

**Co-cause, and it is the larger half: the packet scoped the class as an INSTANCE LIST.**
`CODE-CROSS-03-REWORK-R1.md:9` enumerates the members ("the helper's doc comment …, the second-pass
comment, ADR-0022's (b′) addendum …, and the `CookieConsent.tsx` sentence") and the author swept
exactly that list, plus one member the list omitted (the pass-1 `null` comment). Scoping a class
by enumeration is what §2.2 forbids. See **P2** for the packet charge.

**REMEDY: BINDING (measured — M6 and M7 above).** A dated correction line under the existing
correction addendum: the focus-return precedence is pinned by **three** cases in
`consent-modal-semantics.test.tsx` (`keeps the captured opener ahead of the named control while the
opener is on the page`, `returns focus to the named control when the opener was unmounted by the
same commit`, `returns focus to the named control when the captured opener has since left the
page`) and **two** in `consent-policy-link.test.tsx` (`returns focus to the Settings opener when
the card closes`, `returns focus to the RETURNED bar's opener when the card closes`), with the
mutant that establishes each named. Never edit `:119-120` in place — ADR law.

**VERDICT: non-blocking.** **CONFIDENCE: high** on the measurement (two mutants, every red named);
**medium** on the tier. **STRONGEST COUNTER:** the sentence is about a decision this commit did not
touch, in an addendum written by a different seat two commits ago, and the packet's class list did
not name it — so charging this rework with it is charging a seat for obeying an exhaustive
instruction. I answer: §2.2 binds the seat independently of the packet, and the two claims are
four screens apart in one file with the same author-facing consequence; but the apportionment
above puts the larger share on the packet, and I would accept the orchestrator moving this
finding wholly to P2 without changing a word of the remedy. **Ticket it the same day** — one
correction line in `ADR-0022`, no code.

## N2 (non-blocking) — `modalSemantics.ts:161-162`: the corrected termination argument names the wrong monotone quantity

```
:159  *    With the identity term, every replacement IS strictly deeper, so one pass reaches the
:160  *    innermost open surface: anything nested in the new incumbent was nested in the old one too,
:161  *    so nothing already scanned can be missed, and the depth strictly decreasing is what makes
:162  *    the single pass sufficient rather than merely terminating.
```

**Concrete inputs → wrong outcome.** Under the strict predicate the nesting depth of `topContainer`
strictly **increases** on every replacement; the quantity that strictly **decreases** is `index`,
and `index` decreasing is precisely what the same sentence calls "merely terminating". So the
clause attributes sufficiency to the one quantity it has just denied it to, and the sentence
contradicts its own first half ("every replacement IS strictly deeper") twelve words later. A seat
implementing `A11Y-OVERLAYS` from this comment cannot tell which monotone quantity it is being told
to preserve, which is the exact ambiguity that produced B1.

**Evidence.** No probe is needed and none exists — this is a self-contradiction inside one sentence,
readable at `:159` against `:161`. The code is correct; the argument for it is mis-stated.

**CLASS (binding):** *the corrected sentence in a SHARED contract's prose restating the property in a
second vocabulary* — B1's own class, in the fix for B1. This repo has the sibling on record
(TOOLING-TRAPS `:1049`: after a rework, grep the WHOLE artifact for every sentence that carried the
old rule).

**REMEDY: BINDING (measured — the reading is mechanical: `:159` and `:161` cannot both hold).**
"…and the depth strictly **increasing** is what makes the single pass sufficient rather than merely
terminating (the index decreasing is what makes it terminate)." One word, plus the parenthesis that
makes the contrast explicit.

**VERDICT: non-blocking. CONFIDENCE: high** on the contradiction, **medium** on it being worth a
ticket. **STRONGEST COUNTER:** "depth" can be read as "the remaining depth still to search", which
does decrease, and a reader who has the code in front of them will not be misled. I answer: the
same sentence has already used "deeper" in the nesting sense eleven words earlier, so the second
use cannot be a different sense without saying so — and this file's prose is a specification, not a
commentary. **Ticket it the same day**, one word.

## N3 (non-blocking) — `consent-modal-semantics.test.tsx:357-400`: the three-sharer case never measures the premise its whole claim rests on

The pair case at `:286-355` asserts **both** premises and says why:

```tsx
    expect(hosts.length, "the two surfaces share ONE container node").toBe(1);
    expect(hosts[0]!.contains(labelled("close-first"))).toBe(true);
    expect(hosts[0]!.contains(labelled("close-second"))).toBe(true);
    expect(order, "registration (open) order").toEqual(["first", "second"]);
```

Its three-surface twin asserts only `expect(hosts.length, …).toBe(1)`. It passes no
`registrations` array, so **open order is assumed, not measured** — while the case's own name and
its only assertion (`expect(closed, "exactly one onClose runs, and it is the last-opened surface")
.toEqual(["c"])`) are claims about which surface opened LAST.

**Concrete inputs → wrong outcome.** If React's sibling effect ordering ever stopped being tree
order — or if a future edit reorders the three `<SharedContainerSurface>` elements while leaving
the expectation `["c"]` — the case would pass or fail for a reason it never states, and the failure
frame would name the tiebreak. The infrastructure to prevent this is already in the file, is used
by the sibling case, and costs one prop.

**Evidence that the case is otherwise load-bearing** (so this is a hardening finding, not a
deletion one): mutant **M5b** — the identity guard applied only on the FIRST pass-2 iteration —

```
exit=1   Tests  1 failed | 27 passed (28)
 FAIL  … > delivers one Escape to the LAST-OPENED of three surfaces that SHARE one container node
```

the pair case stays green and only this one reds, so the case's own comment ("it is also the ONLY
case here that reds a fix which guards identity on the first pass-2 iteration alone") is **measured
correct** and the case must be kept.

**CLASS (binding):** *a fixture that asserts the outcome without asserting the precondition the
outcome depends on* — TOOLING-TRAPS `:1880` ("the fixture must assert the precondition … or the
case silently degrades … and passes for free") and `:1870` ("order the registry so the bad entry is
iterated LAST, or the case proves nothing"). **Sweep the class:** the two premise-asserting cases in
this file are the shared PAIR case (both premises) and the three-sharer case (one of two). No other
case in the file registers two surfaces against one node.

**REMEDY: ADVISORY** (the author may refute with output): pass `registrations={order}` to the three
`<SharedContainerSurface>` elements and add
`expect(order, "registration (open) order").toEqual(["a", "b", "c"]);` before the `Escape`. I have
not measured that this addition passes — it is a test edit outside my contract — so it is advisory
by COMMON §10.22, and the CLASS binds regardless of the wording.

**VERDICT: non-blocking. CONFIDENCE: high** that the premise is unasserted (read off the source),
**low** that it will ever bite. **STRONGEST COUNTER:** the sibling case measures the identical
mechanism with the identical component in the identical arrangement, so the premise IS measured in
the file — just not in this case; and adding an assertion moves no count, so it is free either way.
**Ticket it the same day.**

---

## Packet review (against the orchestrator; every constant re-derived — COMMON §10.24)

### Constants that are CORRECT — stated, because a review packet is only reviewed here

| Constant | Where | Re-derived |
|---|---|---|
| review package = 411 lines | my packet §1 | `wc -l` → **411** ✓ |
| four files; `230 insertions, 9 deletions`; one commit `4cc0f4b6` on `4ef2f7d3` | my packet §1 | `git diff --stat 4ef2f7d3..HEAD` → **4 files changed, 230 insertions(+), 9 deletions(-)**; `git log --oneline` → one commit ✓ |
| per-file stat (`modalSemantics.ts` +31, `ADR-0022` +47, the test file +156, `CookieConsent.tsx` 5 ±) | my packet §1 | matches the package's own stat ✓ |
| TOOLING-TRAPS skip = `:2816` to the end, 2880 lines at dispatch | my packet §5 | `wc -l` → **2880**; `grep -n '^## \['` → `2816:## [CODE-CROSS-03-REWORK-R1, 4cc0f4b6]` — the range is **exact** ✓ |
| ADR-0022 skip = `:211-257`; `## Options considered` at `:258` | my packet §5 | `:211` is the correction addendum's heading, `:257` its last line, `:258` is `## Options considered` — **exact** ✓ |
| `S02/DECISIONS.md` rows at `:217-219` | my packet §5 | `wc -l` → **219**; the rows are the file's last three lines ✓ |
| the consent SET is seventeen files, **195** at `4ef2f7d3` | my packet §4 | BASELINE `:48` says 195 at `4ef2f7d3`; measured **197** at `4cc0f4b6` (+2 = the two new `it()`s) ✓ |
| t9 = `2 failed \| 7 passed (9)`, ONE hit at `globals.css:6116` | my packet §4 | measured exactly, both failures by NAME ✓ |
| root typecheck: 8 in `s14-ui`, 0 outside | my packet §4 | `n_tcran=1`, `tt=1`, outside the pin **0** ✓ |
| `CMD-C6`'s S02 arms are vacuous AFTER the commit | my packet §4 | `slice/consent-s02` resolves to `4cc0f4b6` = HEAD, so `HEAD..HEAD` is empty and the working-tree diff is `none` ✓ |
| the live rework packet == its `.at-dispatch` snapshot | COMMON §10.32 | `diff` → **identical** ✓ |
| work packet `:7` cites `modalSemantics.ts:189-196` for pass 2 | work packet | at `4ef2f7d3` pass 2 is **exactly** `:189-196` ✓ |
| work packet `:7` cites probe cases at `:184-185`, `:215` | work packet | `:184-185` are P3's two `expect`s, `:215` is P4's — **exact** ✓ |
| work packet `:9` cites `ADR-0022:165`, `:186` | work packet | both quote the sentences named ✓ |
| work packet `:9`: "grep `contain` in `CookieConsent.tsx`; measured at `4ef2f7d3` it exists once" | work packet | `grep -c` → **1** ✓ |
| work packet `:11` cites `consent-card.test.tsx:489-492` and `consent-policy-link.test.tsx:384-391` | work packet | both ranges are the needle blocks, exactly ✓ |
| work packet `:21` `allowed` covers every mandated deliverable and the only ticket it orders posts to | work packet | commit, handoff on `t_ed4c5e73`, self-report, TRAPS append — all present; `t_ed4c5e73` is the only ticket named and the only one required (COMMON §10.64) ✓ |
| TOOLING-TRAPS at dispatch = 2814 lines (work packet `:6`) | work packet | **consistent, not refuted** — the r1 reviewer's last text line is `:2814` and `:2815` is the blank separator the author's append begins with. I cannot settle a one-line ambiguity in an untracked append-only file and I say so rather than charge it |

### P1 (charge (i)) — `CODE-CROSS-03-REWORK-R1.md:21` orders an assertion that CANNOT discriminate, and the probe it cites says so in its own comment

Verbatim `:21`: *"`tests/render/consent-modal-semantics.test.tsx` (ONE or TWO new cases: two
surfaces sharing one container node → the last-opened answers `Escape` **and traps Tab**; …)"*.

**RULING: the author's refusal is CORRECT, and it is now measured rather than argued.**
`trapTab` (`modalSemantics.ts:119-136`) reads the entry for exactly one purpose —
`focusableWithin(entry.read().containerRef.current)` at `:120` — so two entries sharing one
container yield one candidate list. My own probe
(`code-rev-cross-03-r2-tab-discrimination.probe.test.tsx`, built from the CLAIM, carrying the
`MODELS: / DOES NOT MODEL:` header COMMON requires) walks **every** starting position — each
control, a control outside the surface, and no focus at all — forwards and backwards, with the two
surfaces given DIFFERENT `initialFocusRef` targets so a divergence would show:

```
T1 TAB TRANSCRIPT (shared container)
start=close-first  shift=false -> close-second      start=close-first  shift=true -> close-second
start=close-second shift=false -> close-first       start=close-second shift=true -> close-first
start=outside      shift=false -> close-first       start=outside      shift=true -> close-second
start=nothing      shift=false -> close-first       start=nothing      shift=true -> close-second
```

Run again with the identity term removed, the `diff` of the two transcripts is **EMPTY**. Control
T2 (a genuinely NESTED pair, where the lists differ) behaves differently — `Tab from close-inner ->
close-inner` — which is the shape the shipped `traps Tab in the same surface Escape reaches` case
pins and which mutant M2 reds. **So the packet ordered, into a new case, an assertion that is
identical in both states of the code**: a fixture that cannot fail, which is this repo's oldest
recorded defect family arriving inside a mandated test.

**And the answer was already on disk.** The round-1 probe's P5 comment reads: *"Both surfaces share
ONE container, so the Tab trap's candidate list is identical either way: this case exists to show
the Tab branch is NOT a second, independent ranking."* COMMON §10.71 exists for exactly this and
was not applied.

**CLASS (binding):** COMMON §10.55 (a packet's mechanism is dry-run against the existing cases
before dispatch) + §10.71 (a probe cited as an oracle is read to its COMMENTS as well as its
assertions). **REMEDY: BINDING (measured — the transcript diff above).** A packet ordering an
assertion states the mutant that flips it; where the reviewer's own probe has already ruled the
assertion inert, the packet quotes that comment instead of contradicting it.

### P2 (charge (ii)) — `:26` predicts a count FIGURE in the same sentence that forbids predicting one

Verbatim `:26`: *"GREEN: your case(s), the probe `6 passed (6)`, the semantics + cross-slice pair
**`35/35` or `34/34` (state which and why)**, the SET by BASELINE's command (`17 files`, tests =
195 + your new cases — **measure, do not predict**) …"*.

COMMON §10.42 is unambiguous: *"Counting claims about a seat's tests are the seat's to measure,
never the packet's to predict … Packets say 're-run the row's command ×3 and state what moved'."*
The sentence applies the rule to the SET and breaks it for the pair, eleven words apart.
Measured answer: **35/35** (33 at `4ef2f7d3` + two new `it()`s), and the SET is **197**.

The **larger half of this charge is the CLASS SCOPE at `:9`**, which N1 above is the consequence of:
the packet enumerated the class members rather than naming the property, and the one member outside
the enumeration is still wrong at HEAD. `heartbeat-protocol` §2.2 and COMMON §10.27 both say a
rework packet scopes by CLASS and declares the ripple; an exhaustive list is the anti-pattern.

**CLASS (binding):** *a packet stating a class by enumeration, and a count by prediction.*
**REMEDY: BINDING (measured — 35 and 197 differ from the packet's offered pair, and `ADR-0022:119`
is the enumerated list's blind spot).** A disjunction plus "state which and why" is much weaker
anchoring than a point prediction, and I record that in the packet's favour; the class-scope half is
not mitigated.

### P3 (charge (iii)) — `:9` cites `modalSemantics.ts:148-156` where the charged text is `:150-154`

Measured at `4ef2f7d3` (the tree the seat read):

```
 148|  *    the walk continues to the entry below it; that is the one guard this function keeps from the
 149|  *    document-order version it replaces.                      <- these two are PASS 1's bullet
 150|  * 2. **The containment tiebreak** (V-20 (b′)). …              <- the charged bullet STARTS here
 152|  *    incumbent's — `Node.contains`. Because each replacement is strictly deeper, …
 154|  *    too, so nothing already scanned can be missed.           <- and ENDS here
 155|  *
 156|  * **There is no `FOLLOWING` arm …**                            <- a different paragraph
```

The cited range is wrong at both ends, and the sentence the packet quotes ("each replacement is
strictly deeper") is on `:152`. **CLASS:** COMMON §10.24. **REMEDY: BINDING (measured — the `awk`
dump above).** `:150-154`, and the quoted sentence pinned at `:152`.

### P4 (mine, beyond the charge list) — `:10` cites `modalSemantics.ts:191` for a line that is at `:192`

Verbatim `:10`: *"**N2 (advisory …)**: `modalSemantics.ts:191`'s `!container.isConnected` disjunct is
unreachable"*. Measured at `4ef2f7d3`:

```
 191|     const container = entry.read().containerRef.current;
 192|     if (container === null || !container.isConnected) continue;
```

**Origin, stated because it is mine:** the round-1 verdict's N2 heading says `:191` as well (its own
code block, correctly, shows the line under a `// :191` label that belongs to the line above). The
packet transcribed a wrong constant out of my seat's previous verdict. That is COMMON §10.24's
2026-09-07 addendum in its purest form — *never lift a `path:line` from captured output; produce
every citation with `grep -n` on the file at packet-write time* — and it is worth recording that the
rule now needs a second clause: **never lift a `path:line` from a previous VERDICT either.** The
author was unaffected (the shipped comment carries no line number), so the cost here was zero and
the class is what matters. **REMEDY: BINDING (measured).**

### P5 (charge (iv)) — the packet never says `CMD-C6` is legitimately RED for the whole working-tree phase

Verbatim `:12`: *"**Known-false doc constants, ticketed, not yours:** … `CMD-C6`'s S02 arms vacuous
in this lane (`t_38c6bbf2`)"* — and `:26` then orders `CMD-C6` among the GREEN gates. "Vacuous" is
true only once the commit exists. Measured in my own worktree, by planting an uncommitted edit in an
S02-owned file and running `CMD-C6`'s S02 arms alone (`cp` restore, `diff -q`, porcelain 0):

```
committed / clean tree :  CMD-C6 S02 arms only: verdict=0  st=0  n_s02c=0  working-tree diff='none'
uncommitted edit       :  CMD-C6 S02 arms only: verdict=1  st=0  n_s02c=0  working-tree diff=' …/modalSemantics.ts | 1 +'
```

A rework whose ONLY product edits are to `modalSemantics.ts` and `CookieConsent.tsx` therefore has
`CMD-C6` at `verdict=1` from its first keystroke to its commit, by construction. A seat not told so
files a false `BLOCKED` — which is exactly what COMMON §10.72 now records from the author's own P4.
**This verdict is a second, independent witness to that finding, measured rather than repeated.**
**CLASS (binding):** COMMON §10.72. **REMEDY: BINDING (measured above).** The next packet says
"`CMD-C6` prints `verdict=1` until your commit lands; run it AFTER the commit and report both."

### P6 (against MY OWN packet) — the read-FIRST clause orders me to skip bytes that the same clause orders me to read

`CODE-REV-CROSS-03-R2.md:5` says: skip *"ADR-0022 lines `:211-257` (the rework's correction
addendum)"* until the appendix step. The same paragraph orders the review package as a mandatory
ONE Read, and that package (`CROSS-03-r2.diff:140-185`) contains **the entire addendum verbatim** —
the diff hunk `@@ -201,20 +201,67 @@` produces new-file lines 211–257 exactly.

**DISCLOSURE: I read it, in the review package, before I measured anything.** Containment: my probe
was written, run ×3, mutated for its remedy and written to `<scratch>/MEASURED-FIRST.md` before any
of the author's CLAIMS (the ticket, the self-report, the DECISIONS rows, the TRAPS entries) was
opened, and nothing in the appendix changed a finding above.

This is r1's **P6(b)** class through a new door. COMMON §10.69 fixed the half it could see — skip
instructions now carry measured line ranges, and mine are exact — and left the half that matters:
**an artifact can be simultaneously the author's claim and the work under review, and a review
package that quotes it delivers it either way.** **CLASS (binding):** *a skip instruction whose
target is reachable through a mandatory read earlier in the same list.* **REMEDY: BINDING (measured
— the byte ranges coincide exactly).** Either (a) drop the ADR from the skip list and say plainly
that an ADR addendum inside the diff is the WORK, not a CLAIM, or (b) generate the review package
with that hunk elided and say it was elided. (a) is right: an ADR is a deliverable under review.

### P7 (against MY OWN packet) — the superseded `.review-scratch/` grant is STILL in the template, one round after it was reported

`CODE-REV-CROSS-03-R2.md:12` grants scratch under `<lane>/.review-scratch/`, and `:16` orders
*"render the component in jsdom yourself with a throwaway test in `.review-scratch/`"*. TOOLING-TRAPS
`:1785` and the 03:10 correction at `:2306` both record that a probe **cannot run** from there, and
COMMON §10.46 says so too. The round-1 reviewer filed this as P6(a) and wrote, at TRAPS `:2809-2814`,
***"Delete the grant from the template, or a seat will obey it."*** It was not deleted; the same two
sentences shipped again. Its only remaining effect is to invite files into the tree under review.

I used the scratchpad `--config` route; the lane's `git status --porcelain` was **0** at CLAIM, after
every one of the eight mutants, and at exit. **CLASS (binding):** *a remedy recorded in shared memory
and not applied to the template that generates the defect.* **REMEDY: BINDING (measured — the grant
is still at `:12` and `:16`).** Delete both sentences.

Sub-point, same paragraph: `:13` forbids git writes *"other than in-scratch probes you fully revert
(`git checkout HEAD -- <path>`…)"* while `:24` and `:29` order `cp` + `diff -q`. Both are lawful in a
DETACHED review worktree (COMMON §10.44), but a packet should name one idiom; I used `cp`
exclusively, never `git checkout`.

### P8 (against MY OWN packet) — a class member is simultaneously "check it" and "do not read it yet"

`:5` skips `S02/DECISIONS.md:217-219` until the appendix; `:25` lists "the DECISIONS rows" among the
class members and says *"A member still saying 'descendant-or-self' or 'four cases' is a finding"*.
The two instructions cannot both be obeyed before the appendix. I resolved it the only lawful way —
measured everything else first, verified the rows at the appendix step, and reported the result
there. **REMEDY: BINDING (measured — the two lines contradict).** A skipped section is not a charge;
either move the rows off the skip list (they are the author's DECLARATION about the work, which is
the same category as the ADR addendum — see P6) or move the charge into the appendix step explicitly.

---

## What I verified, and HOW (verbatim outputs)

**Setup.** Detached worktree `.worktrees/rev-cross-03-r2/dialectical-engine` @ `4cc0f4b6`,
`git status --porcelain` = **0** at CLAIM, after every mutant and at exit;
`pnpm run generate:contract` exit 0. Every probe ran through a scratchpad-owned `--config` whose
alias array mirrors the lane's `vitest.config.ts` including the `@` alias (COMMON §10.46, TRAPS
`:2440`); lane from `LANE`, never a hard-coded `.worktrees/` path (§10.35). **Zero files created in
the lane, zero under `tests/`.** Mutants: `cp` snapshot, `cp` restore, anchor asserted UNIQUE, plant
asserted LANDED (`filecmp` against the snapshot), restore asserted (`diff -q`) — never
`git checkout` (TRAPS `:2111`).

### 1. Mutant battery — classification is BROKEN / CAUGHT / SURVIVED, never zero-vs-nonzero

| id | mutant | target suite | result |
|---|---|---|---|
| **M1** | the identity term removed | the r1 probe (6) | **CAUGHT** — `2 failed \| 4 passed (6)`, P3 + P4 |
| **M2** | the whole (b′) pass-2 loop disabled | semantics + cross-slice (35) | **CAUGHT** — `3 failed \| 32 passed (35)`, and the three are **exactly** the three the ADR names |
| **M3** | N2's `!container.isConnected` disjunct removed | semantics + cross-slice (35) | **SURVIVED** — `35 passed (35)`; unchanged from r1's M6, consistent with the proof |
| **M4** | the identity term removed | semantics + cross-slice (35) | **CAUGHT** — `2 failed \| 33 passed (35)`: the two new cases, nothing else |
| **M5** | *(mine — a no-op: an unused local, predicate untouched)* | semantics (28) | **NO-OP, discarded** — printed `SURVIVED`; `plant-landed` proves bytes, not behaviour (TRAPS `:1682`) |
| **M5b** | the identity guard applied ONLY on the first pass-2 iteration | semantics (28) | **CAUGHT** — `1 failed \| 27 passed (28)`: **only** the three-sharer case. The deeper case is not a duplicate |
| **M6** | focus-return precedence inverted to named-first | semantics + policy-link (42) | **CAUGHT** — `2 failed \| 40 passed (42)` → **N1** |
| **M7** | the `returnFocusRef` arm removed | semantics + policy-link (42) | **CAUGHT** — `3 failed \| 39 passed (42)` → **N1** |
| **M8** | an uncommitted edit to an S02-owned file | `CMD-C6`'s S02 arms | **CAUGHT** — `verdict=1` → **P5** |

Target byte-identical to its snapshot after every one; `git status --porcelain` = 0 after the battery.

### 2. The ADR's THREE named cases — the mutant, and the red list held against the sentence

```
M2-NO-TIEBREAK | exit=1 | CAUGHT | Tests  3 failed | 32 passed (35)
   FAIL … > delivers one Escape to the nested INNER surface of a pair mounted in ONE commit
   FAIL … > delivers one Escape to exactly one of three surfaces, and it is the innermost
   FAIL … > traps Tab in the same surface Escape reaches, for the same nested pair
```

Exactly the three the correction names, and the fourth (`… a nested inner surface that opened in a
LATER commit`) is **not** in the list — green either way, exactly as the correction says. The two
NEW shared-container cases are also **not** in this list, which is correct: with the tiebreak gone
entirely, open order alone already reaches the last-opened surface.

### 3. Base-RED replay of both new cases (HEAD's test file against `4ef2f7d3`'s helper, `cp` swap)

```
=== BASE-RED REPLAY exit=1 ===
 Test Files  1 failed (1)
      Tests  2 failed | 26 passed (28)
 FAIL  … > delivers one Escape to the LAST-OPENED of two surfaces that SHARE one container node
 FAIL  … > delivers one Escape to the LAST-OPENED of three surfaces that SHARE one container node
   -> the surface opened LAST answers Escape: expected "vi.fn()" to be called 1 times, but got 0 times
   -> exactly one onClose runs, and it is the last-opened surface: expected [ 'a' ] to deeply equal [ 'c' ]
```

Both RED at the base helper, with the three-sharer frame showing `['a']` — the earliest-registered —
which is r1's measurement reproduced independently by a different instrument.

### 4. Boundaries — nothing else moved

* **Exactly four files**: `git diff --name-only 4ef2f7d3..HEAD` → 4, matching the package's stat
  (`230 insertions(+), 9 deletions(-)`); one commit.
* **Blob-hash equality** (`git rev-parse <rev>:<path>`, which FAILS LOUDLY on a wrong path rather
  than agreeing with you — TRAPS `:2509`): `consent-cross-slice.test.tsx`, `consent-card.test.tsx`,
  `consent-guards.test.tsx`, `consent-policy-link.test.tsx`, `CookiePreferencesCard.tsx`,
  `CookieBar.tsx`, `PrivacyPolicyModal.tsx`, **`apps/ui/app/globals.css`** — all **SAME**. The
  `globals.css` block discipline is therefore unchanged by construction, and the cross-slice suite is
  untouched and green (`35 passed (35)` as half of the PAIR run).
* **Semantics suite, `it()`-block structural diff** (each case hashed): base **26** → head **28**;
  **2 ADDED, 0 REMOVED, 0 CHANGED-IN-PLACE, 26 of 26 pre-existing cases BYTE-IDENTICAL.** The only
  prologue changes are one `useEffect` import and the new `SharedContainerSurface` helper. **No
  `expect` was deleted, no assertion loosened, no case renamed.**
* **Exported contract byte-identical** — declaration emit for both revisions (`--ignoreConfig`; the
  `TS2307` on `react` is expected and harmless, TRAPS `:2616`), NOT an `export` grep (TRAPS `:2566`):
  `diff base-out/modalSemantics.d.ts head-out/modalSemantics.d.ts` → **empty**. Same five members
  including the full `ModalSurface` body.
* **Registration request shape unchanged:**
  `git diff 4ef2f7d3..HEAD | grep -E 'register\(|adult_affirmed|privacy_accepted'` → **zero hits**.
* **No-touch surfaces:** the full `--name-only` list taken with **no pathspec**, then grepped (TRAPS
  `:1580`), contains no `apps/api`, `packages/`, `migrations/`, `tools/`, `apps/runner`,
  `apps/scheduler`, `tests/integration`, `BASELINE.md` or `PROGRESS.md` path.
* **Commit trailer** is the harness's (COMMON §10.63) — not a finding.

### 5. Gates as deltas — ×3 from a `.sh` under `/bin/bash`, all three runs BYTE-IDENTICAL (`md5 8a3cb6fc98ae5fa71b52e71732ebf847`), commit column `4cc0f4b6` throughout

```
### lane=…/.worktrees/rev-cross-03-r2/dialectical-engine  HEAD=4cc0f4b6  dirty=0
### grep: grep (BSD grep, GNU compatible) 2.6.0-FreeBSD
S01-C6 verdict=0   summary:      Tests  14 passed (14)  files: Test Files  1 passed (1)   S02-files: ref resolved 0, commits in 4cc0f4b6…..HEAD touching them: 0, working-tree diff: 'none'   tsc ran: 1 exit 1, outside the pin: 0
S01-C7 verdict=0   summary:      Tests  76 passed (76)  files: Test Files  6 passed (6)   hit-list: 1 (pinned: 1)  t9 failures: 2  S01 css blocks: 1   tsc ran: 1 exit 1, outside the pin: 0
 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
 FAIL  tests/unit/t9-mode-tokens.test.ts > T9-C3 … > renders one accessible toggle that reads the document mode, flips it, and persists it
 FAIL  tests/unit/t9-mode-tokens.test.ts > T9-C3 … > leaves no mode-inert colour literal in the four Wave-0 product files
    HIT +   "…/apps/ui/app/globals.css:6116:background: color-mix(in srgb, #0a0806 32%, transparent);",
S02-C9 | vt=0 guard=0 VERDICT=0 |       Tests  114 passed (114) |  Test Files  10 passed (10)
S02-C9 | mergeArms: --scrim:=1 (expect 2)  S02markers=1 (expect 2)
run_c9 VERDICT=1
SET exit=0
 Test Files  17 passed (17)
      Tests  197 passed (197)
PAIR | vt=0 guard=0 VERDICT=0 |       Tests  35 passed (35) |  Test Files  2 passed (2)
GUARDS | vt=0 guard=0 VERDICT=0 |       Tests  32 passed (32) |  Test Files  3 passed (3)
apps/ui tsc exit=0  diagnostics=0
### final dirty=0
```

| gate | pin | measured (worst of 3 = every run) | delta |
|---|---|---|---|
| `CMD-C6` | verdict 0, `1 passed (1)` | verdict **0**, `Tests 14 passed (14)` | at pin; S02 arms vacuous here (`slice/consent-s02` **is** HEAD) — and see **P5** |
| `CMD-C7` | verdict 0, `6 passed (6)` + t9 delta + one block | verdict **0**, `Tests 76 passed (76)` | at pin |
| t9 | `2 failed \| 7 passed (9)`, hit list = 1 at `:6116` | exactly that, both failures by NAME, hit list = 1 | at pin |
| `run_c9` vitest half | `Test Files 10 passed (10)` | `114 passed (114)` / `10 passed (10)`, `vt=0 guard=0 VERDICT=0` | **112 → 114** (the two new cases) |
| `run_c9` merge arms (PROPERTY) | known-false, `t_4f97ca86` | `--scrim:=1 (expect 2)`, `S02markers=1 (expect 2)` → `run_c9 VERDICT=1` | **unchanged and not this commit's**: `globals.css` is byte-identical at both revisions, so this commit neither caused nor could fix it |
| consent SET (BASELINE's command) | 17 files / **195** at `4ef2f7d3` | `Test Files 17 passed (17)` / `Tests 197 passed (197)`, exit 0 | **+2**, measured not predicted |
| semantics + cross-slice pair | — | `Tests 35 passed (35)` / `Test Files 2 passed (2)` | **33 → 35**, so the work packet's "35/35 or 34/34" resolves to **35/35**, because both new cases are new `it()`s (COMMON §10.42/§10.138) |
| the three source-text guard suites | 32/32 | `Tests 32 passed (32)` / `3 files` | at pin; **no guard weakened** — all three files are blob-identical at both revisions |
| root typecheck | 8 in `s14-ui`, 0 outside | `n_tcran=1`, `tt=1`, outside the pin **0** | at pin |
| `apps/ui` project tsc (§10.30) | exit 0 | **exit 0, 0 diagnostics** | at pin |

**The INLINE arm, done the way TRAPS `:2587` requires** — the guard's own terms typed into the tool
call, where `grep` is `ugrep 7.8.4` (confirmed in-call), **not** `zsh script.sh`:

```
term1 (Tests N passed, anchored) -> 0    GOOD -> 0   BAD "Tests 0 passed" -> 1   BAD title-pollution -> 1
term2 (no 'failed' in summary)   -> 1    fires on a failing summary -> 0
term3 (Test Files 2 passed (2))  -> 0    GOOD -> 0   BAD "1 passed (1)"   -> 1
t9 hit-list term                 -> GOOD 1, BAD 0
```

Every term is satisfiable in both directions and the two shells agree; no dialect split. My
`gates.sh` carries no glyph-placeholder idiom (`grep -nE '\[\[:space:\]\]\*\. '` → no match) and no
non-ASCII byte outside comments.

---

## What I did NOT verify

* **Anything in a real browser.** Every measurement is jsdom 30.0.1 / React 19.2.8. The Esc stack,
  the Tab trap and focus return in a real browser are V's acceptance steps, not mine — and my P1
  ruling ("a Tab assertion on a shared-container pair cannot discriminate") is a claim about **this
  environment**, which is where the test would live; TRAPS `:2017` records that "unpinnable" is a
  claim about the environment, and I did not try a conformance shim because `trapTab` reads only the
  container and no shim changes that.
* **Roles and `aria-*`.** No markup changed in this commit (`CookiePreferencesCard.tsx`,
  `PrivacyPolicyModal.tsx` and `CookieBar.tsx` are blob-identical), so I re-probed Esc, Tab and
  focus routing through the helper and did not re-probe `role="dialog"` / `aria-modal` /
  `aria-labelledby`.
* **Whether `t_4f97ca86` and `t_38c6bbf2` are still open.** Out of my posting contract; I did not
  read either ticket. If `t_38c6bbf2` already records P5's mechanism, P5 is a second witness rather
  than a new finding — which is how I have written it.
* **Whether the TOOLING-TRAPS dispatch count `2814` was exact.** The file is untracked and
  append-only; `:2815` is a blank line that could belong to either side. Recorded as consistent,
  not asserted (`heartbeat-protocol` §2.7).
* **The S01 lane, the author's lane, and the three `rev-grok-*` worktrees.** Untouched, unread.
* **The remedy for N3.** It is a test edit outside my contract; I did not run the case with the
  premise assertion added, which is why that remedy is ADVISORY.

---

## Predictions (falsifiable evidence that blindness held)

I expect the other lenses to have **confirmed B1's discharge and stopped there**, because the
discharge is genuinely clean and every charge in the packet points at it. Specifically: (1) I expect
**N1 to be missed by every lens** — the ADR's second self-coverage claim is four screens above the
one everybody was sent to check, it belongs to a decision this commit did not touch, and finding it
costs two mutants nobody was charged to run; a lens that greps `four cases` will see the two lawful
hits at `:191`/`:241`, tick the charge and never look at `:119`. (2) I expect **P1 to be ruled from
the author's REASONING rather than from a transcript** — the reasoning is correct, so a lens that
reads `trapTab` and agrees reaches the right answer by the wrong route, and the thing that makes the
ruling stick is the empty diff between two eight-row transcripts, which nobody was told to produce.
(3) I expect at least one lens to file the **`ADR-0022:191` "four cases"** hit as a finding against
the author, because it is still in the file and reads exactly like the defect N1 named — it is the
superseded text an ADR must not edit. (4) I expect **N2's single word to be missed universally**;
it survives because "strictly deeper" and "strictly decreasing" look like the same claim at reading
speed. (5) I expect **no other lens to have measured P5**, because measuring it means deliberately
dirtying the tree under review, and most lenses will (reasonably) take COMMON §10.72 on trust. The
first thing I would check in another lens's verdict is whether its Tab ruling cites a **measurement
or an agreement with the author's argument** — and if a measurement, whether it varied the starting
position or only tested one.

---

`comments read through: 1` on `t_956e450f` (the orchestrator's dispatch) at CLAIM; the appendix
below records the cursor on `t_ed4c5e73` at the moment it was opened.

---

---

## Appendix — the author's claims, opened AFTER everything above was on disk (COMMON §10.52)

Read at this point and not before: the `REWORK READY FOR REVIEW` comment on `t_ed4c5e73`
(comment index 9, 375 lines), `agent-reports/CODE-CROSS-03-REWORK-R1.md`,
`S02/DECISIONS.md:216-219`, and `TOOLING-TRAPS.md:2816-2880`. Cursor on `t_ed4c5e73` at the moment
it was opened: **11**. **Nothing in this section changed a finding above.** My probe was written,
run ×3, mutated for its remedy, and `<scratch>/MEASURED-FIRST.md` was on disk before any of it was
opened.

### The DECISIONS rows — the one class member my packet deferred to this step

`S02/DECISIONS.md` `:216` is a section heading; the three appended rows are `:217`, `:218`, `:219`,
which is exactly the range my packet named. **No member is stale.** `:217` rules the predicate
**STRICT DESCENDANT** and quotes the shipped line; it uses "descendant-**or-self**" only to name
what shipped at `4ef2f7d3`, which is the correct historical use. `:218` says THREE pin the tiebreak
and names them. `:219` records N2 as KEPT with the proof, and reproduces the proof correctly. A
literal sweep of the file for `descendant-or-self` and `four cases` returns **0** and **0**.

### Where we converge — and what the convergence is worth

| the author's | my independent measurement | status |
|---|---|---|
| §0/§2: the probe at BASE `2 failed \| 4 passed (6)` (P3 `firstClose=1 secondClose=0`, P4 `["a"]`), at HEAD `6 passed (6)` (P3 `0/1`, P4 `["c"]`), P6 control unmoved | identical, three runs | **convergence**, two instruments, two worktrees |
| §4 M1 (identity removed) → `2 failed \| 33 passed (35)`, exactly the two new cases | my **M4** → `2 failed \| 33 passed (35)`, same two | **convergence** |
| §4 M2 (pass 2 removed) → `3 failed \| 32 passed (35)`, the three nested pins, the later-commit case GREEN | my **M2** → identical red list | **convergence — this is N1's discharge, measured twice** |
| §4 M3 (`contains` inverted) → `10 failed \| 25 passed (35)`, cross-slice P2/P4/P6/P7 | my **M9** → `10 failed \| 25 passed (35)`, the same four cross-slice cases plus the same six semantics cases | **convergence, re-measured because I distrust a green** |
| §4 M4 (identity guarded on iteration 1 only) → caught by the THREE-sharer case ALONE | my **M5b** → `1 failed \| 27 passed (28)`, the triple alone | **convergence.** Their reasoning and mine were independent; both land on "the triple is not a duplicate" |
| §4 NEIGHBOUR (a De Morgan rewrite) correctly NOT caught | my **M10** → `35 passed (35)` SURVIVED | **convergence.** A positive control that behaves is worth stating |
| §6 every gate figure (`14/1`, `76/6`, t9 `2 failed \| 7 passed (9)` + one hit at `:6116`, `114/10`, `197/17`, `35/2`, `32/3`, typecheck 8-in-pin/0-outside, apps/ui tsc exit 0) | identical, in a different worktree, from a different `gates.sh` | **convergence on ten figures.** Two scripts, two trees, one answer |
| §7 P1 = the `:148-156` vs `:150-154` citation | my **P3**, measured with `awk` at `4ef2f7d3` | **independent convergence** — stop re-deriving |
| §7 P2 = the Tab assertion cannot discriminate | my **P1** | **convergence on the conclusion, and I add what it did not have: the RUN.** Their argument is structural (`trapTab` reads only the container); mine is an eight-row transcript that is byte-identical with and without the identity term. TOOLING-TRAPS `:2754` says exactly this about the round-1 finding — reasoning about a DOM predicate is cheap and running it is cheaper, and only the run settles it |
| §7 P3 = "35/35 or 34/34" beside "measure, do not predict" | my **P2** | **convergence** |
| §7 P4 = `CMD-C6` is actively RED before the commit | my **P5**, measured by planting an uncommitted edit and running the arm | **convergence, and mine is the second measurement** |
| §8 F2/F3 (`run_c9`'s merge arms; `t_457c9898` still `ready`) | `run_c9` merge arms `1/1` in my tree too; `globals.css` blob-identical at both revisions | **convergence on F2.** F3 is a board-state finding outside my probe surface; I did not read that ticket and I second it as stated |
| §9: TRAPS `2814 → 2880`, nothing grew under them | I could not settle `2814` from an untracked append-only file (`:2815` is a blank that could belong to either side) and said so above. Their measurement resolves it: `:2815` is their append's separator, so the packet's `2814` is **correct** | **their evidence closes an item I left open** — recorded as theirs, not re-badged as mine |

### Where I found what the author did not

* **N1 — `ADR-0022:119-120`, the file's SECOND self-coverage claim.** Their §3 states the class
  sweep honestly and gives its patterns: `grep -rn 'Node\.contains|\.contains\('` and
  `grep -rni descendant`. **Neither pattern can reach `:119`**, because that sentence is about the
  focus-return precedence and contains neither word. They swept the CONTAINMENT class thoroughly —
  finding one member the packet's list omitted (the pass-1 `null` comment) and correctly leaving one
  alone (`:61`'s "nested inside", already strict) — and did not sweep the class N1 itself belongs to.
  That is the honest description of the gap, and it is why my remedy is one correction line rather
  than a charge of carelessness.
* **N2 — and the appendix makes it sharper, not softer.** The author states the intended property
  three times in three artifacts, correctly: handoff §3 item 2 ("each replacement is strictly
  deeper … is FALSE for the reflexive predicate and TRUE for this one"), `DECISIONS.md:217` (same
  words), and `ADR-0022:163-164` (same words). **The only place it comes out as "the depth strictly
  DECREASING" is the shared helper's own doc comment at `:161`** — which is the artifact
  `A11Y-OVERLAYS` will implement from. So this is a transcription slip against the author's own
  thrice-stated intent, not a difference of opinion, and the fix is the word they used everywhere
  else.
* **N3 — the three-sharer case's unasserted premise.** Their §3 says, accurately, "The pair case
  asserts THREE premises before the outcome" and says nothing about the triple. The triple is the
  case their own M4 (= my M5b) proves is load-bearing, and it is the one that measures neither
  registration order nor the containment of its controls.
* **P4 — `:10`'s `modalSemantics.ts:191`.** They caught `:9`'s wrong range (their P1) and not `:10`'s,
  which is off by one for the disjunct they were asked to rule on. The constant came from my own
  seat's round-1 verdict, which is the part worth recording.

### Where the author found what I did not

* **F1, self-disclosed:** a HEARTBEAT posted with `comments read through: 7` against 8, because
  `k show`'s human output merges the audit log into the comment shape (their `grep -c '^  \[20'`
  returned 17 against 9). Disclosed, re-read, nothing lost — and COMMON §10.70 already carries the
  JSON command, which my own packet ordered and which I used before every marker. Correct behaviour;
  not a finding against the commit.
* **F4, cosmetic and self-disclosed:** their `gates.sh` header prints `shell=zsh` because it reads
  `$SHELL` rather than the running interpreter. Mine avoids the trap by printing `grep --version`
  instead, which is the only tell that actually discriminates (`BSD grep` in the script vs
  `ugrep 7.8.4` inline). Worth generalising: **a script cannot name its own interpreter from the
  environment; it must name a tool whose identity differs between the two shells.**
* Their §4 positive control on the surviving neighbour mutant (`PLANTED (diff vs green snapshot:
  differs)` printed BEFORE the suite) is the right discipline and is the reason my own no-op M5 was
  caught in one run rather than believed.

### The author's `SKILLS LOADED` line, checked against the worker floor (`heartbeat-reviewer` §5)

Declared: `superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker,
superpowers:receiving-code-review, superpowers:test-driven-development,
superpowers:verification-before-completion, superpowers:systematic-debugging` — "All seven loaded
in that order, in THIS session (COMMON §10.9)". The `heartbeat-protocol` §1 worker floor (TDD ·
verification-before-completion · systematic-debugging · receiving-code-review) is **met**; COMMON
§10.39's extra requirement (this packet carries a prior verdict's numbered findings) is satisfied
and named; and `systematic-debugging` is declared **loaded and not needed**, which is the honest
form rather than a silent omission. **No shortfall.**

I cannot grep another seat's transcript, so I check the line against the behaviour it should
produce, and it is consistent throughout: B1 was reproduced at BASE before it was implemented and
the RED frames are captured verbatim with the `❯ file:line` marker read rather than the assertion
text grepped (TDD, and TRAPS `:11`); every mutant restore is proved by `diff -q` and the one
survivor carries a positive control (verification-before-completion); the packet's Tab order was
refused with a stated mechanism rather than obeyed or ignored (receiving-code-review — §10.22's
"an advisory remedy the author refutes with output is not a NOT ADDRESSED", applied to a packet
order); and the class was swept by the seat's own greps rather than by transcribing the packet's
list. **Recorded as consistent, not as verified** — the transcript grep is the orchestrator's.

### One honest note against my own predictions

Prediction (2) said I expected P1 to be ruled from the author's reasoning rather than from a
transcript. The author's own handoff is the first confirmation, and lawfully so: they reasoned it
out correctly and did not run it, because running it means building a fixture for an assertion you
have already decided not to ship. Prediction (3) is already half-refuted here — the author did not
file `ADR-0022:191` as a defect and explicitly recorded the ADR append-only law instead, which is
the right call. Both are recorded before any other lens's verdict is read; I have read none.

`comments read through: 11` on `t_ed4c5e73` at the appendix step.
