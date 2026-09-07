# CODE-CROSS-03 — self-report (mission `consent-ui`, ticket `t_ed4c5e73`, commit `4ef2f7d3`)

**Seat:** CODE-CROSS-03 · worker · Claude Opus 5, fresh session · round 1 of max 3.
**Lane:** `.worktrees/consent-s02/dialectical-engine`, branch `slice/consent-s02`, BASE `c334136d`
(HEAD and porcelain 0 verified at CLAIM), ONE commit `4ef2f7d3`, nine files, porcelain 0 at exit.

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

---

## 1. The one thing that actually went wrong, and its cause

**Symptom.** After the whole change was written and GREEN on the three suites I was iterating on,
the first full gate battery came back with a failure that was not one of the three flips the
packet authorised: `tests/render/consent-card.test.tsx > S01-C4 … > announces itself as a modal
dialog named by its own visible title`, `the card reaches the document: expected true to be false`.

**Proximate cause.** `CODE-REV-CROSS-01 r1` N3's remedy is a sentence written for a human:
*"…when the captured opener is not a usable element at close — because the opening commit removed
it, or because it left the document while the surface was open"*. My packet
(`CODE-CROSS-03.md:19`) ordered that reword into
`apps/ui/components/consent/CookiePreferencesCard.tsx`. **That file is governed by a grep-shaped
source-text guard that bans the bare word `document`, comments included**
(`tests/render/consent-card.test.tsx:491`).

**ROOT CAUSE, and it is worse and more useful than the proximate one: this trap was already in
`TOOLING-TRAPS.md`, at `:2537-2545`, with my exact failure string and my exact fix in it.**

> ### A one-word JSDoc addition trips a source-text guard that bans a COMMON English word
> … the failure reads `the card reaches the document: expected true to be false`, which sounds
> like a behavioural regression and is a comment. … **Rule: before adding a comment to any file
> under `apps/ui/components/consent/`, run the banned-token sweep for that file — the tokens
> differ per file** … and prefer "on the page" to "in the document" in prose there.
> Cost here: one 10.6s 16-file run, ~2 min.

I independently re-derived the same remedy ("the page", not "the document") after paying the same
price a second time. **So the failure is not that the knowledge was missing. It is that I never
read the file.**

**Why I never read it — and this is a systemic defect, not a personal one.** My packet's §0 says:

> **TOOLING-TRAPS at dispatch: 2651 lines** (COMMON §10.66). **Read everything past that line at
> CLAIM and again at handoff**; a guard refuted by a newer entry is reported, not obeyed.

The file is exactly 2651 lines, so "everything past that line" is the empty set. I discharged that
instruction in one `wc -l` and moved on. **COMMON §10.60/§10.66's delta-read silently DISPLACED
`heartbeat-worker` §6's full read** (*"Read `.hermes/TOOLING-TRAPS.md` before you start"*) — it is
the only TRAPS instruction in the packet, it is phrased as a complete obligation, and it is
trivially satisfiable. §10.66 was written to solve a real problem (a file growing under a running
seat, CROSS-02's N-E) and in solving it created a way to satisfy the letter of the TRAPS duty
while reading none of it.

**This is the single highest-value finding of my run**, because it explains a whole class:
every trap in that file is worth exactly nothing to a seat whose packet only orders the delta.

**The secondary class, which the existing trap entry names but does not enumerate: three
overlapping grep guards, three different needle sets, one directory.** `:2537` says "the tokens
differ per file" and gives one contrast (`CookiePreferencesCard.tsx` bans `\bdocument\b`,
`CookieBar.tsx` does not). The full matrix, measured here, is worse than that — the same token is
banned in two *different spellings* by two guards over overlapping file sets:

| guard | files scanned | needles | direction |
|---|---|---|---|
| `tests/render/consent-card.test.tsx:489-492` | `CookiePreferencesCard.tsx` **only** | `addEventListener` · `.focus()` · `/\bdocument\b/` · `/["']Escape["']/` | must be **ABSENT** |
| `tests/render/consent-policy-link.test.tsx:384-391` | `CookiePreferencesCard.tsx` **+** `CookieConsent.tsx` | `addEventListener` · `.focus()` · `Escape` (**bare substring**, stricter than the others) | must be **ABSENT** |
| `tests/render/consent-guards.test.tsx` S01-S45 arm 1 | every `consent/*.ts(x)` **except** `modalSemantics.ts`, read from the DIRECTORY | `addEventListener("keydown"` · `addEventListener('keydown'` · `"Escape"` · `'Escape'` · `.focus()` | must be **ABSENT** |
| `tests/render/consent-guards.test.tsx` S01-S45 arm 2 | `modalSemantics.ts` | the same three | must be **PRESENT** |

Only ONE of the four bans `document`, and it is the one that scans a single file. `Escape` is
banned as a **bare substring** by `consent-policy-link` but only in its **quoted** forms by
S01-S45 — so a comment saying the word `Escape` is legal under one guard and illegal under
another, over the same two files. Three seats have now written round this in prose ("Spelled
without the word this file's own source-text guard bans…", `CookiePreferencesCard.tsx`; "Written
without spelling that key…", `CookieConsent.tsx`; COMMON §8), each in a different file, none of
them a list.

**Price: one full gate cycle.** ~4 minutes of `pnpm exec vitest` plus the class sweep — 6-8
minutes and one battery re-run. Small in isolation; it is the **fourth** seat to pay this family
(`CODE-S01-C5` F1, a `.focus()` JSDoc; `CODE-S02-C7`, a `<form>` inside a JSX comment; the
`:2537` entry's own author; me) and the **second** to pay this exact instance.

**Sweep, per member, as `heartbeat-protocol` §2.2 requires** (counts measured at `4ef2f7d3`, not
asserted):

| file I edited | bare `document` | `addEventListener` | `.focus()` | `Escape` (bare) | verdict |
|---|---|---|---|---|---|
| `CookiePreferencesCard.tsx` | 0 | 0 | 0 | 0 | clean (was **1** before the fix — the break) |
| `CookieConsent.tsx` | 0 | 0 | 0 | 0 | clean; my rewrite deliberately says "the dismiss key" |
| `modalSemantics.ts` | 19 | 1 | 1 | 7 | required PRESENT by S01-S45 arm 2 — all three present |
| `tests/support/consentMarkers.ts` (new) | — | — | — | — | outside every guard's scan list (not under `consent/`) |
| `ADR-0022-shared-modal-semantics.md` | — | — | — | — | no test greps it (`grep -rln 'ADR-0022' tests` → empty) |

**THE UPGRADE (§3.1 below): the banned-token set is a FACT a packet must carry, not folklore.**

---

## 2. What I nearly got wrong, and did not

**`Node.contains` is REFLEXIVE; the ruling's word is "DESCENDANT". They differ, and the packet
picked the API that differs.** `CODE-REV-CROSS-02 r1` N2 measured its rival with
`compareDocumentPosition` + `CONTAINED_BY`, which is **irreflexive** — a node is not
`CONTAINED_BY` itself. `CODE-CROSS-03.md:8` re-words the same rule as
"`incumbent.contains(lower)` — `Node.contains`, **not** `compareDocumentPosition`" while keeping
the normative word "a **DESCENDANT** of the incumbent's container". `a.contains(a)` is `true`.
So two registered entries whose `containerRef.current` is the SAME node would let the
**earlier-registered** one displace the later one — a fresh open-order inversion, in a different
shape, introduced by the very fix that removes one.

I shipped the packet's literal mechanism and filed the divergence as a finding instead of
silently patching it, for two reasons I want on the record because the reasoning generalises:

1. **Adding `topContainer !== container &&` would be an unpinned line.** My packet grants exactly
   ONE new test case (the `null`-container branch). A guard I cannot pin is a mutation survivor a
   reviewer will find, and "I added it because it felt right" is not evidence.
2. **Silently shipping the reflexive form would be a design change hidden in an execution.** The
   difference between the reviewer's measured rival and the packet's wording is the orchestrator's
   to close, not mine.

Unreachable today (two consumers, two distinct containers) — which is exactly what was said about
the nested shape one round ago, and that is the whole argument of N2.

**I also nearly ran the cluster command and stopped.** `run_c9`'s ten files do **not** include
`consent-card.test.tsx`; neither do the three suites the (b′) work touches. My break was invisible
to both. It surfaced only in `CMD-C7` and the SET. See §3.2.

---

## 3. What to upgrade — the one-prompt machine

### 3.0 THE BIG ONE — "read everything past line N" must not be the only TRAPS instruction

COMMON §10.60/§10.66 tell a packet to record the TRAPS line count at dispatch and tell the seat to
read past it. That is correct and it solved a real failure. **But in a packet it is the ONLY TRAPS
sentence, and when the count has not moved it is satisfiable by a `wc -l`.** I satisfied it, read
zero traps, and walked into one the file already documented with my exact failure string.

**Remedy — three words in COMMON, and a matching three in every packet template:**

> **TOOLING-TRAPS at dispatch: N lines. Read the file IN FULL at CLAIM; re-read everything past
> line N at handoff.**

The delta is the *handoff* obligation (it exists to catch a file growing under a running seat).
The *CLAIM* obligation is and always was the whole file. `heartbeat-worker` §6 already says so;
the packet's §0 is what overrides it in practice, because §0 is declared to override the documents
it lists. **A seat reads its packet top-down and obeys the most specific instruction it finds.**

Second-order remedy, cheaper still: **TRAPS needs an index.** 2,651 lines is a real read. A
20-line table of contents at the top — one line per entry, grouped by subject (`grep`/locale ·
`git` restore · vitest · source-text guards · jsdom · board CLI) — turns "read the file" into
"read the index, then the four entries that touch my files". Cost to build: one seat-hour, once.
Value: every seat after it.

### 3.1 A guarded file's banned-token set travels WITH the permission to edit it

COMMON §10.43 already says *"guards are transcribed from the PLAN verbatim, never paraphrased"* —
that rule points at the seat WRITING a guard. The missing half points at the seat editing a
**guarded** file: **when a packet's `allowed` list names a file that any source-text test scans,
the packet states that test's needle set beside the permission.** One line would have cost the
orchestrator a `grep -rln` and saved me a cycle:

> `CookiePreferencesCard.tsx` (prop doc only) — **banned tokens, comments included:**
> `addEventListener`, `.focus()`, `\bdocument\b`, `Escape`. Guards: `consent-card.test.tsx:489-492`,
> `consent-policy-link.test.tsx:384-391`, `consent-guards.test.tsx` S01-S45.

**And the deeper fix, for the repo rather than the packet:** `consent-guards.test.tsx` already
derives its file list from the DIRECTORY (S01-S42) so a sixth file is scanned without editing the
test. The other two guards hard-code both their files and their needles. Unify them onto one
exported constant — `tests/support/consentSourceGuards.ts`, the same move this commit just made
for the four CSS markers (`tests/support/consentMarkers.ts`, `CODE-REV-S02-C9 r1` N3) — and the
banned set becomes ONE fact a packet can quote instead of three that drift. Same class, same
remedy, one directory over.

### 3.2 Run the SET once immediately after the first GREEN, not once at the end

Measured this run: the change was GREEN on `consent-modal-semantics` + `consent-policy-link` +
`consent-cross-slice` (47/47) and on `consent-bar` + `consent-s02-style-contract` (17/17) while
the SET was RED. The failure lived in a sixth file, `consent-card.test.tsx`, that appears in
**no** command any of this work's clusters own. `run_c9` names ten files; `CMD-C7` names six;
`consent-card` is only in `CMD-C7`, which a seat working on S02's helper has no reason to reach
for first.

**Cheap, mechanical rule:** the first thing a seat runs after its first GREEN is the SET command
from `BASELINE.md`, not its cluster command. It is ~40 s, it covers 17 files, and it is the only
command in the mission that sees a cross-file regression. `CODE-REV-CROSS-02 r1` N3 already
reports the structural half of this (the cross-slice suite is in no cluster command,
`t_4f97ca86`); this is the seat-behaviour half.

### 3.3 A reviewer's remedy is PROSE until someone checks it compiles in its destination

`COMMON` §10.22 grades remedies `BINDING (measured: …)` / `ADVISORY`. Neither grade says whether
the remedy's *words* are legal where they land. CROSS-01 r1 N3's remedy was correct, measured,
and unlawful in one of the three files it named. **Proposed line for COMMON §10:** *a remedy that
prescribes TEXT names the destination file's source-text guards, or the packet that transcribes
it does. A reviewer who cannot edit the file can still `grep` the guard that scans it.*

### 3.4 Verify a claim about a text-scanning test WITHOUT mutating the scanned file

I had to prove a sentence I was writing into two test comments: *"under mutant GX3 (S02's block
nested inside S01's), `consent-bar`'s relaxed case stays GREEN and `consent-s02-style-contract`'s
S02-S59 REDs on `after.trim()`."* Reproducing GX3 the reviewer's way means mutating
`apps/ui/app/globals.css` — **in my packet's `forbidden` list**, even transiently.

Instead: a 30-line node script that reads `globals.css` **read-only**, builds the GX3 arrangement
as a STRING in memory, and re-implements the two cases' predicates over it. Output:

```
--- HEAD (control)
   consent-bar relaxed case : GREEN
   style-contract S02-S59   : GREEN
--- GX3 (S02 nested inside S01)
   consent-bar relaxed case : GREEN
   style-contract S02-S59   : RED  ["after.trim() === \"\" (got \"/* Slice S01 — cookie consent: the bar (10a)\")"]
```

Cost ~3 minutes, zero writes to the lane, and it reproduced the reviewer's GX3 result exactly.
**Generalise it:** a test whose subject is FILE TEXT does not need the file mutated to be
mutation-tested — it needs its predicate re-run over a mutated string. That removes the single
most common reason a seat reaches outside its `allowed` list. Appended to TOOLING-TRAPS.

### 3.5 Prove "one pass is enough" before writing the loop, then pin the proof with a NEIGHBOUR mutant

The containment descent could have been written as a fixed-point loop (re-scan the whole stack
after every replacement). I argued the single downward pass is complete — *anything nested in the
new incumbent was nested in the old one, so no already-scanned entry can become eligible later* —
**and then planted the fixed-point rewrite as the neighbouring mutant my pins must NOT catch.**
47/47, correctly not caught. That is the argument turned into evidence at the cost of one run, and
it is the shape `heartbeat-worker` §2.4 asks for: the neighbour mutant is where a *reasoning* step
gets pinned, not just a code step.

---

## 4. Dead ends and refusals, so nobody re-derives them

1. **Do NOT try to make `run_c9`'s two merge arms pass.** `--scrim:` is declared **once**
   (mode-independent, `globals.css:65`) where the arm expects 2, and
   `grep -c '=== consent-ui S02 ==='` can never be 2 because the closing marker reads
   `=== end consent-ui S02 ===` and does not contain the opening literal. Measured again here,
   six times. It is `t_4f97ca86`, confirmed now by a **fourth** independent seat
   (CODE-S02-C9 F1, CODE-REV-S02-C9 N5, CODE-REV-CROSS-01 P8, CODE-REV-CROSS-02, and this).
   Evaluate the PROPERTY (`scrim>=1`, each of the four markers exactly once), never the arm.
2. **Do NOT expect `CMD-C6`'s two S02 arms to mean anything in this lane.** `slice/consent-s02`
   resolves to HEAD, so `git log HEAD..HEAD` is empty and `git diff --stat HEAD` on a clean tree
   is empty: both arms pass by construction. Reported by CROSS-01 r1 **P5** and CROSS-02 r1
   **P12**; **still ordered as a gate by my packet's §2.6.** Third report. See §5.
3. **Do NOT read `.hermes/TOOLING-TRAPS.md` from inside the lane.** The lane's tracked copy is
   **1034 lines**; the main tree's is **2651** (COMMON §10.36's correction, verified here).
4. **`docs/missions/consent-ui/**` does not exist in any lane** — untracked. `BASELINE.md` and
   `S02/DECISIONS.md` are main-tree edits and cannot ride the lane commit. `ADR-0022` **is**
   tracked and therefore does ride it. The packet got this exactly right by using absolute paths
   for the first two and a relative one for the third; that is a pattern worth keeping.

---

## 5. Packet findings — against the orchestrator, with file:line

**P1 — `CODE-CROSS-03.md:8` states the mechanism with an API whose semantics differ from the
ruling's own word.** "a LOWER entry wins … ONLY when the lower entry's container is a DESCENDANT
of the incumbent's container (`incumbent.contains(lower)`)". `Node.contains` returns `true` for
the node itself; "descendant" excludes it; the reviewer's measured rival used `CONTAINED_BY`,
which also excludes it. **Reachable consequence: none today.** **Remedy:** the packet says either
`contains` **and** "at-or-inside", or "descendant" **and** an identity guard. Detail in §2.

**P2 — `CODE-CROSS-03.md:19` orders a gate two prior verdicts have already filed as vacuous.**
`CMD-C6`'s `n_s02c` and working-tree arms (CROSS-01 r1 P5, CROSS-02 r1 P12). Not harmful — I ran
it and reported the caveat — but a defect reported twice and still transcribed a third time is a
routing failure, not a wording one. **Remedy:** when a verdict files a gate arm as structurally
vacuous, the arm's *recorded sha* baseline (`c334136d..HEAD`, which counts **1** here) replaces
the moving branch ref in the PLAN, once, and every later packet inherits the fix.

**P3 — `CODE-CROSS-03.md:23` names a narrower blast radius for mutant M2 than the measurement.**
Packet: "M2 a FOLLOWING arm added back → `consent-cross-slice.test.tsx` RED". Measured: cross-slice
`P4` and `P7` RED **plus** `consent-modal-semantics.test.tsx > delivers one Escape by OPEN order
when two surfaces opened out of DOM order`. The prediction is true and incomplete; COMMON §10.62's
class ("a packet describes what a case SET discriminates") applied to mutants. Naming one suite
invites a seat to stop counting at that suite.

**P4 — `CODE-CROSS-03.md:19` authorises a comment edit to a grep-guarded file without naming the
guard**, and **`CODE-CROSS-03.md:6` makes the TRAPS obligation a delta that a `wc -l` discharges.**
These are one defect with two halves: the packet knew the file was at 2651 lines, the trap it
needed was at `:2537`, and the packet's own wording is what stopped me reading it. **This is the
finding I would fix first.** Full analysis in §1 and §3.0.

**Packet items that were CORRECT and should be copied.** Stated because the good half is invisible
otherwise:
- **Every `path:line` in the packet resolved on the first try** (COMMON §10.24 obeyed):
  `consent-modal-semantics.test.tsx:154/:216/:421`, `consent-policy-link.test.tsx:253`,
  `consent-bar.test.tsx:229` and `:254-…`, `consent-s02-style-contract.test.ts:223`,
  `CookieConsent.tsx:192-198`. Zero minutes hunting. This is the single highest-leverage packet
  habit in the mission.
- **The BASELINE edit was written as a CONDITIONAL with the grep attached** ("ONLY the line naming
  the renamed consent-bar case, **if one exists — grep first; report if none**"). Measured:
  **none exists.** `grep -rn "ships R09's geometry inside ONE delimited S01 block" docs .hermes`
  returns six hits — one verdict, two packets, two `.at-dispatch` snapshots, one review-package
  diff — **and none in `BASELINE.md` or in any `PLAN.md`**, so the rename gates nothing and
  `BASELINE.md` is untouched. A packet that pre-authorises an edit AND orders the measurement that
  may cancel it is the right shape; copy it.
- **§0's MEASURED TRUTH block sits ABOVE the reading list** (COMMON §10.48). Every one of its
  constants reproduced: `topmostSurface()` at `:143-150`, the `:147` guard, the three pin lines,
  the sibling-mount sweep, TRAPS at 2651 lines (unchanged at handoff), and the reviewer's
  `3 failed | 190 passed (193)` dry-run — which is what let me say "exactly three flips, no more"
  as a *prediction I could falsify* rather than as a hope.

---

## 6. Findings outside my contract (named, not fixed)

1. **`t_457c9898` is still `ready` with a dead premise.** Its body orders a **BINDING** DOM-order
   constraint that `c334136d` dissolved, and `CookieConsent.tsx` cited it as authority — I removed
   the citation, but the ticket still dispatches seats. CROSS-02 r1 N5 (b) already routed it; it
   is unclosed as of this handoff. Orchestrator's.
2. **`BASELINE.md` has no `CLAIMED — UNVERIFIED` row for `4ef2f7d3`.** My packet authorises exactly
   one BASELINE line and it turned out not to exist, so I added nothing (COMMON §10.54's row is the
   orchestrator's to write). The SET moved `193 → 195` at this head; without a row the next seat's
   delta is against a stale figure.
3. **`consent-cross-slice.test.tsx` is still in no cluster command** (CROSS-02 r1 N3,
   `t_4f97ca86`). It is the only test that would have caught B1 and it is caught today only by the
   SET's glob. `PLAN.md` is forbidden to me.

---

## 7. Cost ledger

| item | price | avoidable? |
|---|---|---|
| Reading: packet, COMMON, INSTRUCTIONS, BASELINE, three verdicts (~1,700 lines), two tickets, four source files, two PLAN fenced blocks | the largest single block of the run | Partly — the three verdicts are the requirements and had to be read; the `path:line` discipline meant no file was read twice. |
| The `document` grep-guard break | ~1 gate cycle (~6-8 min) + the class sweep | **Yes, entirely, and for free** — the fix was already written at `TOOLING-TRAPS.md:2537`. Cost of NOT reading a 2,651-line file: the second payment of a trap somebody already paid for. §3.0 |
| Reading TOOLING-TRAPS in full at CLAIM (what I should have done) | est. 10-15 min | It would have paid for itself once in this run and, on the evidence of §4, probably four times |
| Mutant battery (6 mutants + control, 2 suites each) | ~7 vitest runs | No. It is the job, and M5/M6 are the only evidence the two base-GREEN additions pin anything. |
| Gate battery ×3 bash + ×3 inline + 2 pre-commit | 8 batteries | No — COMMON §10.16 and §3 of the worker contract. But see §3.2: running the SET early would have moved one of the pre-commit batteries earlier and made it useful instead of merely repeated. |
| GX3 verification without mutating a forbidden file | ~3 min | No, and it is now a reusable pattern (§3.4). |
| Re-derivations avoided by prior seats' work | — | `run_c9`'s arms, `CMD-C6`'s vacuity, the lane/main-tree split, the declaration-emit idiom: four dead ends I did not walk into, all because a previous seat wrote them down. **This is the mechanism that works.** |

---

## 8. Honest limits of this run

- **Everything is jsdom.** No dev stack serves this branch and I started none. Whether the innermost
  surface is *visibly* on top is V's acceptance, not mine — though for the containment case the DOM
  and the paint agree by construction, which is the whole argument for `CONTAINED_BY` over
  `FOLLOWING`.
- **I did not measure the seven `A11Y-OVERLAYS` overlays** (`t_8962842f`). They have no focus trap
  and no Esc, so they cannot be on the stack, but the tiebreak is a contract change to a module
  that ticket will put them on.
- **I did not test a nested pair in the real product**, because none exists — the pins are
  synthetic `TestSurface`s, and their premise (`outer.contains(inner)`) is asserted in the case
  rather than assumed.
- **The reflexive-`contains` case is unpinned**, deliberately (§2). If the orchestrator rules for
  the identity guard, that is one line and one case, and it is round-2 work.

---

## 9. The belated TRAPS read — what else it caught, and what it did not

Having found the root cause in §1, I read the file's 83 entry headings and opened every one that
could touch this run. **Nothing else here violates a recorded trap**, and three of them I had
independently satisfied — which is worth recording, because "the traps that did NOT fire" is the
only evidence the file is working:

- **`:2587` — "`zsh script.sh` is NOT the inline arm of COMMON §10.16".** My ARM B is genuinely
  inline in the tool's shell, and the two arms printed different greps, which is the whole point:
  ARM A `grep (BSD grep, GNU compatible) 2.6.0-FreeBSD`, ARM B `ugrep 7.8.4 … +neon/AArch64`.
  Had I run my own `.sh` under zsh, both arms would have printed BSD grep and the exercise would
  have proved nothing.
- **`:2310` — "a mutant harness that ABORTS prints the UNMUTATED result, which reads exactly like
  'the mutant was not caught'".** My one GREEN mutant (`NEIGHBOUR`, 47/47) is the exact shape that
  trap describes. Positive control run afterwards: re-plant, `diff` against the head snapshot →
  **20 differing lines**, then restore. The survival is real, not an aborted plant.
- **`:2558` — "a test that exercises a NEW optional member is GREEN at base for the wrong reason,
  and that is not a RED".** Both of my base-GREEN additions (the `null`-container case, the
  `activeElement` assertion) are declared as such in the handoff with their RED coming from a
  mutant (`M5 NONULL`, `M6 CAPTURE-SKIPPED`), which is what that entry demands.
- **`:2154` / `:2298` / `:2231` / `:2060`** — backwards-replay restores, whole-file `grep -c`
  after a mutant, `2>&1 >` ordering, and count-moves from an added assertion: all avoided, the
  last one measured (`consent-policy-link` stayed at 14 cases).

**The uncomfortable conclusion:** I satisfied four traps I had not read, by following the worker
contract and Superpowers. I broke the one that is *specific to this directory and impossible to
derive*. That is exactly the split the file exists for, and exactly why §3.0 matters more than any
other line in this report: general discipline is transferable, and local facts are not.
