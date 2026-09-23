SKILLS LOADED: superpowers:test-driven-development, superpowers:verification-before-completion

# Task 3 — the site says what the code decided: supported, contested, unsupported

## Status

DONE_WITH_CONCERNS. Every outcome O1–O6 is met and measured. The concerns are not defects in
this change: they are facts about the surface it lands on (the banner has no producer and no
stylesheet, and two fields it stopped reading now have no reader at all). They are listed under
**Findings and concerns** and none of them was fixable inside this task's allowed writes.

## Commits

| sha | subject |
| --- | --- |
| `02b42592` | `feat(ui): the verdict banner speaks the engine's own three words` |

One atomic commit, five files, staged by explicit path:

```
 .../apps/ui/components/VerdictBanner.tsx           | 53 +++++++-----
 dialectical-engine/apps/ui/lib/types.ts            | 13 ++-
 dialectical-engine/apps/ui/lib/v3/labels.ts        | 19 +++--
 .../tests/render/t11-verdict-banner.test.tsx       | 95 ++++++++++++++++------
 .../tests/unit/t11-verdict-label.test.ts           | 11 ++-
 5 files changed, 132 insertions(+), 59 deletions(-)
```

**Why one commit and not two.** Narrowing `VerdictSummary.verdictState` to the three new words
makes `verdict.verdictState === "suppressed_no_evidence"` in `VerdictBanner.tsx:35` a comparison
between non-overlapping types (TS2367). A commit that renamed the type without the banner would
therefore have a RED typecheck at its own tip, and a commit that changed the banner without the
rename would have a RED render suite. The three production files and their two tests are one
atomic change; splitting them would have left a broken bisect point. `git status --short` was
checked immediately before `git commit` and showed exactly the five files staged (`M ` in
column 1), with the other two seats' files unstaged (` M` in column 2).

Base commit for the work: `7bae9806` (as the dispatch instructed; the plan text's `6e8c2c8f` is
its parent). Branch `mission/2026-09-16-algorithm-live-loop-continuation`.

## Base measurement of the render test, before anything was touched

`tests/render/t11-verdict-banner.test.tsx` was **not** among tonight's Node 26.5.0 failures. At
`7bae9806`, with a clean working tree for my files, one run:

```
 ✓ tests/render/t11-verdict-banner.test.tsx > T11 · the live banner renders every mapped verdict state > renders SUPPORTED as the endorsed state, showing the claim language 3ms
 ✓ tests/render/t11-verdict-banner.test.tsx > T11 · the live banner renders every mapped verdict state > renders CONTESTED as the caveated state, showing the claim language 0ms
 ✓ tests/render/t11-verdict-banner.test.tsx > T11 · the live banner renders every mapped verdict state > renders UNSUPPORTED as the suppressed state, withholding the endorsement 0ms
 ✓ tests/render/t11-verdict-banner.test.tsx > T11 · the live banner renders every mapped verdict state > maps the three engine labels onto three DISTINCT banner states 0ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

**4 passed / 4 total.** Any red in this file after my change is attributable to me. The other
three gate suites at the same base: `tests/unit/t11-verdict-label.test.ts` 20/20,
`tests/unit/v2ui-pages.test.ts` 36 passed + 5 failed of 41, `tests/unit/v2ui-data-layer.test.ts`
59/59. Host: Node v26.5.0, pnpm 11.20.0, vitest 4.1.10 (the repo declares Node 22.23.1 and pnpm
warns `Unsupported engine` on every command).

## The RED frames, verbatim

RED was taken in two stages, because the mapping assertion in each render test fires before the
banner assertions and would otherwise have masked them. Stage 1 is RED against today's mapping;
stage 2 is RED against today's banner with the mapping already green.

### Stage 1 · RED against today's mapping — `tests/unit/t11-verdict-label.test.ts`

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/t11-verdict-label.test.ts > T11 · the three-state label ladder > live-UI vocabulary wiring (confirm-item 4) > maps each engine label to its own word, lower-cased
AssertionError: expected 'endorsed' to be 'supported' // Object.is equality

Expected: "supported"
Received: "endorsed"

 ❯ tests/unit/t11-verdict-label.test.ts:366:45
    364|       const { liveVerdictState } = await import("../../apps/ui/lib/v3/…
    365|
    366|       expect(liveVerdictState("SUPPORTED")).toBe("supported");
       |                                             ^
    367|       expect(liveVerdictState("CONTESTED")).toBe("contested");
    368|       expect(liveVerdictState("UNSUPPORTED")).toBe("unsupported");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### Stage 1 · RED against today's mapping — `tests/render/t11-verdict-banner.test.tsx`

```
 × tests/render/t11-verdict-banner.test.tsx > T11 · the live banner speaks the engine's own three words > renders SUPPORTED as the supported state, showing the claim language 6ms
   → expected 'endorsed' to be 'supported' // Object.is equality
 × tests/render/t11-verdict-banner.test.tsx > T11 · the live banner speaks the engine's own three words > renders CONTESTED as the contested state, with the sentence true of rungs 0, 2 and 4 1ms
   → expected 'endorsed_with_caveat' to be 'contested' // Object.is equality
 × tests/render/t11-verdict-banner.test.tsx > T11 · the live banner speaks the engine's own three words > renders UNSUPPORTED as the unsupported state, keeping the claim language and dropping the false evidence copy 0ms
   → expected 'suppressed_no_evidence' to be 'unsupported' // Object.is equality
 × tests/render/t11-verdict-banner.test.tsx > T11 · the live banner speaks the engine's own three words > maps the three engine labels onto three DISTINCT banner states 1ms
   → expected [ 'endorsed', …(2) ] to deeply equal [ 'supported', 'contested', …(1) ]
 ✓ tests/render/t11-verdict-banner.test.tsx > T11 · the live banner speaks the engine's own three words > renders a state-less summary exactly as before: claim language, no state, no sentence 0ms
```

with, for the fourth:

```
 FAIL  tests/render/t11-verdict-banner.test.tsx > T11 · the live banner speaks the engine's own three words > maps the three engine labels onto three DISTINCT banner states
AssertionError: expected [ 'endorsed', …(2) ] to deeply equal [ 'supported', 'contested', …(1) ]

- Expected
+ Received

  [
-   "supported",
-   "contested",
-   "unsupported",
+   "endorsed",
+   "endorsed_with_caveat",
+   "suppressed_no_evidence",
  ]

 ❯ tests/render/t11-verdict-banner.test.tsx:100:20
```

### Stage 2 · RED against today's banner, mapping already green

```
 × tests/render/t11-verdict-banner.test.tsx > … > renders SUPPORTED as the supported state, showing the claim language 6ms
   → expected '<section class="verdictBanner" aria-l…' to contain 'data-verdict-state="supported"'
 × tests/render/t11-verdict-banner.test.tsx > … > renders CONTESTED as the contested state, with the sentence true of rungs 0, 2 and 4 1ms
   → expected '<section class="verdictBanner" aria-l…' to contain 'data-verdict-state="contested"'
 × tests/render/t11-verdict-banner.test.tsx > … > renders UNSUPPORTED as the unsupported state, keeping the claim language and dropping the false evidence copy 1ms
   → expected '<section class="verdictBanner" aria-l…' to contain 'data-verdict-state="unsupported"'
      Tests  3 failed | 2 passed (5)
```

The first failure with its whole received markup — this is the banner as it was, and it is the
evidence that the attribute did not exist:

```
 FAIL  tests/render/t11-verdict-banner.test.tsx > T11 · the live banner speaks the engine's own three words > renders SUPPORTED as the supported state, showing the claim language
AssertionError: expected '<section class="verdictBanner" aria-l…' to contain 'data-verdict-state="supported"'

Expected: "data-verdict-state="supported""
Received: "<section class="verdictBanner" aria-label="Verdict" data-verdict-band="supported"><div class="verdictBannerHead"><span class="verdictBadge" data-verdict-band="supported">Strongly supported</span><span class="verdictThresholdsVersion">test-layer:t11</span></div><p class="verdictClaimLanguage">Engine label SUPPORTED reached the banner.</p><details class="verdictDetails"><summary>Details</summary><span class="verdictDetailRow">not available</span><span class="verdictDetailRow">verification status: not available</span><span class="verdictDetailRow">judge-score coverage: not available</span><span class="verdictDetailRow">convergence (dialectical, semantics version not available): not available</span></details></section>"

 ❯ tests/render/t11-verdict-banner.test.tsx:59:18
     57|
     58|     expect(liveVerdictState("SUPPORTED")).toBe("supported");
     59|     expect(html).toContain('data-verdict-state="supported"');
       |                  ^
     60|     expect(html).toContain("Strongly supported");
     61|     expect(html).toContain("Engine label SUPPORTED reached the banner.…
```

A note the owner may care about: by stage 2 the UNSUPPORTED render **already** showed the claim
language and neither retired sentence, because `verdict.verdictState === "suppressed_no_evidence"`
had become unreachable the moment the mapping stopped producing that word. The false copy was
killed by the rename; deleting the branch was then forced by the typecheck, not optional.

## THE FINAL BANNER SENTENCES, verbatim

They live in `apps/ui/components/VerdictBanner.tsx:31-37` (`STATE_SENTENCES`) and are pinned
character-for-character in `tests/render/t11-verdict-banner.test.tsx:24-28`.

### supported

*(no sentence at all)*

`STATE_SENTENCES.supported` is `null`. The band label above it already says the verdict; any
extra sentence would be a claim nobody asked the banner to make. This is asserted: the SUPPORTED
render must contain neither of the other two sentences.

### contested — covers rungs 0, 2 and 4

> The run did not settle this either way: the leading position was not strong enough, the positions were too close, the judges disagreed, or part of the comparison was missing.

Why it is true at each rung that can print CONTESTED:

| rung | what fired | the clause that carries it |
| --- | --- | --- |
| 0 | the margin is ABSENT, or the panel disagreement is ABSENT (`deriveVerdictLabel`, `packages/serve/src/index.ts:1338-1348`) → CONTESTED + `LABEL-BASIS-INCOMPLETE` | "part of the comparison was missing" — the number the comparison needed was not there to read |
| 2 | `margin <= gamma` (`packages/serve/src/index.ts:1359-1366`) | "the positions were too close" |
| 2 | `disagreement >= disagreementThreshold` (same guard) | "the judges disagreed" |
| 4 | the mid band: `lowCut <= winner < highCut`, with a clear margin and low disagreement (`packages/serve/src/index.ts:1375-1379`) | "the leading position was not strong enough" |

The lead clause, "The run did not settle this either way", is true at all three rungs by
construction: CONTESTED is exactly the label the ladder prints when it prints neither SUPPORTED
nor UNSUPPORTED. The four reasons are joined by "or" and the sentence asserts no more than that
one of them held — which is true at every rung. It does not say *which*, because the summary the
banner receives carries no rung (see Findings, concern 5). No number, no register key
(gamma, the cuts and the threshold are never named), no code name.

### unsupported — covers rung 1, which is the only rung that prints it

> Even the leading position here came out weak once the arguments were weighed against each other — a weak case, not a disproved one.

| rung | what fired | why the sentence is true |
| --- | --- | --- |
| 1 | `winner < lowCut` (`packages/serve/src/index.ts:1352-1357`) — and no other rung returns UNSUPPORTED | "the leading position" is the winning position the ladder measured; "came out weak" is the below-the-low-cut fact stated without its number; "once the arguments were weighed against each other" is the propagated strength, not a raw score; "a weak case, not a disproved one" keeps the reader from reading absence of support as refutation |

Critically, it says **nothing about evidence**. That is the whole point of the change: the
sentence it replaces ("No evidence was available in this run, so no endorsed verdict is shown for
this empirical claim…" plus "To unlock an endorsed verdict…") described the older evidence gate,
and was false for a label derived from propagated strength alone, whether or not any lookup ever
happened.

### What the banner does for every state now

`data-verdict-state` on the `<section>` carries the mapped word; the claim language is shown for
all three states (it is no longer swapped out for anything); the caveat paragraphs and the details
block are untouched. A summary with no `verdictState` renders exactly as it did before — claim
language, no attribute, no sentence — which is asserted by its own test.

## O5 sweep, with every remaining hit classified

Command, run at the final tip from the engine root:

```
grep -rn "endorsed_with_caveat\|suppressed_no_evidence\|\"endorsed\"" apps tests packages acceptance --include='*.ts' --include='*.tsx'
```

Four hits remain, all of them the older evidence gate:

| hit | classification |
| --- | --- |
| `apps/ui/components/SynthesisPanel.tsx:27` — `view.verdictGate?.state === "suppressed_no_evidence"` | OLDER EVIDENCE GATE. Reads `Synthesis["verdict_gate"]["state"]`, a different concept from the label. Untouched by this task, and it still typechecks (both typechecks exit 0). |
| `apps/ui/lib/types.ts:434` — `state: "endorsed" \| "endorsed_with_caveat" \| "suppressed_no_evidence";` | OLDER EVIDENCE GATE. The gate's own union inside `Synthesis.verdict_gate`, kept verbatim per O3. |
| `apps/ui/lib/types.ts:603` — `* now"). The retired words -- "endorsed", "endorsed_with_caveat",` | OLDER EVIDENCE GATE, as prose: my new doc comment on `LiveVerdictState`, which names the retired words and points at where they still live. No value, no type, no runtime use. Deliberate: someone who greps a retired word lands on the explanation of why it left. |
| `apps/ui/lib/types.ts:604` — `* "suppressed_no_evidence" -- belonged to the OLDER EVIDENCE GATE, which lives` | Same doc comment, second line. |

No hit remains in `tests/`, `packages/` or `acceptance/`. The render test names the retired
*sentences* ("no endorsed verdict is shown", "To unlock an endorsed verdict") in order to assert
their absence, and those strings do not match the sweep's patterns.

## Mutant matrix

Each new property was refuted by one mutant, red **at its own assertion**, then restored. All five
were applied to the working tree before the commit; the tree was verified back to its intended
content by reading the full `git diff` of the three production files afterwards, and the committed
tree passes.

| # | property | mutant | suite | result | restored |
| --- | --- | --- | --- | --- | --- |
| M1 | the third pairing is the engine's own word | `labels.ts` `case "UNSUPPORTED": return "suppressed_no_evidence" as LiveVerdictState;` | unit t11 + render t11 | RED. unit: `expected 'suppressed_no_evidence' to be 'unsupported'` (1 failed \| 19 passed). render: same frame plus the distinctness test, `2 failed \| 3 passed (5)` | yes |
| M2 | the false evidence copy never returns for `"unsupported"` | `STATE_SENTENCES.unsupported` = the honest sentence **plus** "No evidence was available in this run, so no endorsed verdict is shown." | render t11 | RED at `t11-verdict-banner.test.tsx:92` — `expected '<section class="verdictBanner" aria-l…' not to contain 'no endorsed verdict is shown'` (1 failed \| 4 passed) | yes |
| M2′ | the unsupported sentence is present for its state | `STATE_SENTENCES.unsupported` = the retired sentence instead of the honest one | render t11 | RED at `t11-verdict-banner.test.tsx:89` — `expected … to contain 'Even the leading position here came o…'` (1 failed \| 4 passed) | yes |
| M3 | the contested sentence is absent for the other states | `STATE_SENTENCES.supported` = the contested sentence | render t11 | RED at `t11-verdict-banner.test.tsx:63` — `expected … not to contain 'The run did not settle this either wa…'` (1 failed \| 4 passed) | yes |
| M4 | `data-verdict-state` carries the mapped word | the attribute deleted from the `<section>` | render t11 | RED at lines 59, 73 and 86, one per state — `expected … to contain 'data-verdict-state="supported"'` etc. (3 failed \| 2 passed) | yes |
| M5 | a state-less summary renders as before | `const stateSentence = STATE_SENTENCES[verdict.verdictState ?? "contested"];` | render t11 | RED at `t11-verdict-banner.test.tsx:110` — `expected … not to contain 'The run did not settle this either wa…'` (1 failed \| 4 passed) | yes |

(M2 and M2′ are the same property attacked from both sides: the honest sentence must appear and
the false one must not. M2′ was run first and masked the `not.toContain`, so M2 was constructed to
hit that assertion directly.)

## Three-run gate at the final tip

| suite | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| `tests/unit/t11-verdict-label.test.ts` | 20/20 | 20/20 | 20/20 |
| `tests/render/t11-verdict-banner.test.tsx` | 5/5 | 5/5 | 5/5 |
| `tests/unit/v2ui-pages.test.ts` | 36/41 | 36/41 | 36/41 |
| `tests/unit/v2ui-data-layer.test.ts` | 59/59 | 59/59 | 59/59 |

The render file went from 4 tests to 5 (the state-less case is new). The unit file's count is
unchanged at 20.

### The five pre-existing `v2ui-pages` reds, named, before and after

Identical names in all three runs after the change, in the base run before it, and in the record
of the four-count at `4f83405f`
(`.hermes/reports/2026-09-01-algorithm-live-loop/closing-runs/four-count-4f83405f-failures.txt:136-140`):

1. `UI-01 DR-146 rework keeps newer V2 chrome and honest V3 gaps > kills MUT-A: deleting the V3ScoreBadges JSX render site`
2. `UI-01 DR-146 rework keeps newer V2 chrome and honest V3 gaps > kills MUT-C: deleting the maker meta line from the contentful node header`
3. `UI-01 DR-146 rework keeps newer V2 chrome and honest V3 gaps > uses DR-160 content-aware overflow instead of a fixed collapse breakpoint`
4. `UI-02d — every non-canvas maker surface preserves its recorded maker prop > pins tree, thread, outline, split, map, and drawer at all eight call sites`
5. `XREV-01 — node review uses the existing V2 card and drawer vocabulary > shows typed review outcome and reviewer house on cards, including honest absence`

Same five, same names, before and after. None of them is mine and none was touched.

Post-commit confirmation run of my two suites together at `02b42592`: `Test Files 2 passed (2)`,
`Tests 25 passed (25)`.

After I committed, the register seat landed `8d41d4db` and `04406d03` on top of mine. My two
suites were re-run once at that later branch tip and still pass: `Test Files 2 passed (2)`,
`Tests 25 passed (25)`. My five files are committed and the working tree holds no change of mine.

## Typecheck exit codes

| command | exit code | output |
| --- | --- | --- |
| `pnpm run typecheck` | **0** | only `[WARN] Unsupported engine: wanted: {"node":"22.23.1"} (current: {"node":"v26.5.0","pnpm":"11.20.0"})` and `$ tsc --noEmit`; no diagnostics |
| `pnpm exec tsc -p acceptance/tsconfig.json --noEmit` | **0** | empty |

Both were run at the final tip, after the last edit. Neither reported a frame in any file — mine
or the other two seats'. No re-run was needed, and there is nothing to attribute to another seat.

## Findings and concerns

1. **Two fields now share three words, and the compiler cannot tell them apart.**
   `apps/ui/lib/types.ts:598` already defined
   `VerdictBand = "supported" | "contested" | "unsupported" | "unavailable" | "insufficient_scoring" | "suppressed"`,
   and `LiveVerdictState` (`apps/ui/lib/types.ts:609`) is now a strict subset of it. A future
   `verdictBand = verdictState` (or the reverse, in the three overlapping cases) typechecks
   silently. The banner keeps them apart by construction — `BAND_LABELS` is keyed on the band,
   `STATE_SENTENCES` on the state, and both attributes are emitted separately
   (`apps/ui/components/VerdictBanner.tsx:65-66`) — but a reviewer should know the type system is
   not guarding this. Fixing it would mean branding one of the two unions, which changes
   `VerdictBand`: outside this task's allowed writes.

2. **The banner has no producer, so nothing about this is visible in the running app.**
   `Debate.verdict?: VerdictSummary` (`apps/ui/lib/types.ts:732`) is never assigned anywhere in
   `apps/` — `apps/ui/lib/v3/adapter.ts:222` sets `Synthesis.verdict`, a plain string, a different
   field. The one render site is `apps/ui/app/debate/[id]/DebatePageClient.tsx:1218`, behind
   `NEXT_PUBLIC_VERDICT_FIRST_UI === "true"` and `!publicMode`, and with `debate.verdict`
   undefined `VerdictBanner` returns `null` at `apps/ui/components/VerdictBanner.tsx:54`. This
   matches the orchestrator's pre-dispatch measurement and `F-UI-VERDICT-LABEL-DRAWER-ONLY`. The
   value delivered here is exactly what the dispatch asked for: whoever wires it later inherits
   honest words.

3. **The banner has no stylesheet.** `apps/ui/app/globals.css` is the repo's only CSS file and
   contains no rule for `verdictBanner`, `verdictBadge`, `verdictClaimLanguage`, `verdictCaveat`,
   `verdictDetails` or `verdictUnlockHint`. The new sentence therefore reuses `verdictCaveat` (as
   the brief preferred) and **no CSS file was touched** — there was no existing class to extend
   and nothing that would have styled a new one. Consequence: `verdictUnlockHint` is now used by
   nobody, since its only use was the branch this change deleted. It is a dead class *name* in a
   file that never styled it; I left it alone rather than widen the diff.

4. **`suppressionReason` and `evidencePresence` now have no reader at all.** They stay in the type
   per O3 (`apps/ui/lib/types.ts:625-626`), and the deleted branch was their last consumer. The
   only remaining mention outside the type is my render fixture
   (`tests/render/t11-verdict-banner.test.tsx:45-48`), which sets `suppressionReason` precisely so
   the test proves the banner no longer speaks it. If an orphan audit later flags them, that is
   this fact and not a regression.

5. **The banner cannot say *which* reason made it contested.** `VerdictSummary` carries no rung and
   no trigger, though the engine computes both (`VerdictLabelDerivation.rung` / `.trigger`,
   `packages/serve/src/index.ts:1291-1300`). That is why the contested sentence is a disjunction
   of four reasons rather than the one that fired. If the owner would rather read one exact
   reason, the fix is to carry `rung`/`trigger` onto the summary when the banner is wired — a UI
   program ticket, not a copy change.

6. **The sentences are pinned as literals in two places.** `apps/ui/components/VerdictBanner.tsx:36-41`
   and `tests/render/t11-verdict-banner.test.tsx:24-28`. A veto of the wording means editing both.
   That is deliberate: importing the copy into its own test would make the test agree with
   whatever the banner said, and this copy is owner-vetted product language, so it is pinned as a
   fact instead.

7. **An older cached payload carrying a retired state word degrades honestly — measured, not
   assumed.** I added a temporary probe to the render test, ran it, and removed it before the
   commit (the committed file contains no probe; verified with `git show`). With
   `verdictState: "suppressed_no_evidence"` cast onto a summary, the banner renders the claim
   language, passes `data-verdict-state="suppressed_no_evidence"` through verbatim, shows **no**
   sentence (`STATE_SENTENCES[...]` is `undefined` → the paragraph is not rendered), does not
   crash, and does not print the retired false sentence. I did not keep the probe as a test: it
   would have put a retired word back into `tests/` and muddied the O5 sweep for the next
   reviewer, for a payload shape that has no producer in this repo.

8. **Commit trailer.** I used `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`, which is the
   plan's Global Constraints line verbatim and matches the two most recent Opus commits on this
   branch. The harness's own attribution reminder asks for a variant with "(1M context)"; the
   plan's line and the branch's history won. Say the word if the owner wants it the other way and
   it can be amended.

9. **Scope held.** Only the five files named in the brief were written. `SynthesisPanel.tsx` was
   read and not touched. No CSS. Nothing in `packages/`, `acceptance/`, or the other seats' files.
   `apps/ui/lib/types.ts:434` (the older gate's union) is unchanged.

## UNVERIFIED

- **The banner has not been seen by a human eye.** All rendering evidence is
  `renderToStaticMarkup` output. No dev server, no browser, no screenshot — and, per concern 2,
  the app cannot show this banner today anyway.
- **Node 22.23.1.** Everything here ran on Node v26.5.0 and pnpm warned `Unsupported engine` on
  every command. The suites in this task are pure string/markup assertions with no filesystem or
  DOM dependency, so a version difference is unlikely to change them, but I did not run them on
  the declared version.
- **The other two seats' work.** Both typechecks were clean at my final tip, which covers their
  files as they stood at that moment, but I did not run their suites and their trees moved during
  my task (the `git status --short` before my commit showed a different set of their files than
  the one I saw at the start). A later failure in `packages/register/**`,
  `apps/runner/src/dev-deployment-register.ts`, the t16 tests, or `acceptance/**` is theirs.
- **The wording itself is the orchestrator's default under V's veto window** (D77 (d) item 4: "The
  new words are the orchestrator's default, with a veto window"). The three sentences above are
  quoted verbatim so the owner can veto or amend them; nothing here claims they are approved.
- **Whether a live V2 payload ever carries `verdictState`.** I verified no producer exists in this
  repo (concern 2). I did not inspect the V2 coordinator on the Mac mini, which is a different
  tree (`origin/main`) and outside this worktree.

---

## Follow-up round — the review's Minors 1, 2, 3, 5

Blind review returned spec ✅ O1–O6, quality Approved, 0 Critical / 0 Important / 6 Minor. The
coordinator asked for four of the six in one follow-up commit; Minor 4 (a runtime test for a
retired word arriving) and Minor 6 (the orphaned `verdictUnlockHint` class, the unread
`suppressionReason` / `evidencePresence`) are deferred to the ledger and were not touched.

### Commit

| sha | subject |
| --- | --- |
| `91b887c7` | `fix(ui): the contested sentence leads with the reason that actually fires` |

Three files, staged by explicit path, `3 files changed, 22 insertions(+), 7 deletions(-)`:
`apps/ui/components/VerdictBanner.tsx`, `apps/ui/lib/types.ts`,
`tests/render/t11-verdict-banner.test.tsx`. `git status --short` before the commit showed exactly
those three in column 1; the Task 1 seat's `acceptance/runtime-policy.test.ts` and
`tests/integration/t16-algorithm-register.test.ts` were unstaged and untouched.

### Minor 1 — the contested sentence, reordered

The reviewer is right and the point is load-bearing. Rung 2 is tested **before** rung 3's high cut
(`packages/serve/src/index.ts:1359-1366`), so a winner far above the high cut still prints
CONTESTED when its margin is tie-adjacent. The real run of 2026-09-17 is exactly that case
(winner 0.97, margin 0.011), and under the old order its reader's first clause would have been
"the leading position was not strong enough" — false for that debate.

**The contested sentence now reads, verbatim** (`apps/ui/components/VerdictBanner.tsx:39-40`):

> The run did not settle this either way: the positions were too close, the judges disagreed, the leading position was not strong enough, or part of the comparison was missing.

Same four alternatives, same truth table as the version in the section above — only the order
changed, so the alternative that most often fires now leads. The unsupported sentence and the
supported state's silence are unchanged.

RED first: the test's constant was changed and the run watched to fail, then the banner.

```
 FAIL  tests/render/t11-verdict-banner.test.tsx > T11 · the live banner speaks the engine's own three words > renders CONTESTED as the contested state, with the sentence true of rungs 0, 2 and 4
AssertionError: expected '<section class="verdictBanner" aria-l…' to contain 'The run did not settle this either wa…'

Expected: "The run did not settle this either way: the positions were too close, the judges disagreed, the leading position was not strong enough, or part of the comparison was missing."
Received: "<section class="verdictBanner" aria-label="Verdict" data-verdict-band="contested" data-verdict-state="contested"><div class="verdictBannerHead"><span class="verdictBadge" data-verdict-band="contested">Contested</span><span class="verdictThresholdsVersion">test-layer:t11</span></div><p class="verdictClaimLanguage">Engine label CONTESTED reached the banner.</p><p class="verdictCaveat">The run did not settle this either way: the leading position was not strong enough, the positions were too close, the judges disagreed, or part of the comparison was missing.</p><details class="verdictDetails"><summary>Details</summary><span class="verdictDetailRow">not available</span><span class="verdictDetailRow">verification status: not available</span><span class="verdictDetailRow">judge-score coverage: not available</span><span class="verdictDetailRow">convergence (dialectical, semantics version not available): not available</span></details></section>"

 ❯ tests/render/t11-verdict-banner.test.tsx:83:18
     81|     expect(html).toContain("Contested");
     82|     expect(html).toContain("Engine label CONTESTED reached the banner.…
     83|     expect(html).toContain(CONTESTED_SENTENCE);
       |                  ^
     84|     expect(html).not.toContain(UNSUPPORTED_SENTENCE);
     85|     expect(html).not.toContain(RETIRED_WITHHELD_SENTENCE);
```

The ordering rationale is now recorded where the next editor will see it, in the banner's own doc
comment (`apps/ui/components/VerdictBanner.tsx:23-26`) and in the test's comment on the constant
(`tests/render/t11-verdict-banner.test.tsx:23-30`), so nobody "tidies" the clauses back.

### Minor 3 — the doc comment said something the type made impossible

`apps/ui/components/VerdictBanner.tsx:33-35` (was: "A state with no entry renders no sentence
rather than a fabricated one"). `Record<LiveVerdictState, string | null>` is total, so no state in
the union can lack an entry. It now says what is true: the record is total over the union, and a
value from **outside** the union — a retired word arriving in an older stored payload — renders no
sentence rather than a fabricated one. That is the behavior measured with the temporary probe in
concern 7 above.

### Minor 5 — the wire-shape comment

`apps/ui/lib/types.ts:592-594`. The comment claimed `VerdictSummary` matches
`coordinator/app/scoring/verdict.py`'s `verdict_summary()` wire shape *exactly*, six lines above
the field D77 narrowed. One clause was added — "except verdictState, which carries the engine's own
three words since V's ruling D77 of 2026-09-18" — and nothing else in the comment was reworded; the
remaining lines are the original words, re-wrapped only because the inserted clause shifted them.

### Minor 2 — the three unrefuted assertions

The review named `tests/render/t11-verdict-banner.test.tsx:76`, `:88` and `:109`. Minor 1's comment
on the constant added seven lines above them, so in the committed file they are **`:83`, `:95` and
`:116`** — same three assertions. Each mutant below was red at that exact line, with no earlier
assertion in the same test masking it, and each was restored byte-identical (verified by reading
the full `git diff` of both production files afterwards: only Minors 1/3/5 remain in it).

| # | property | mutant | suite | result | restored |
| --- | --- | --- | --- | --- | --- |
| M6 | the contested sentence is shown for its state (`:83`, review's `:76`) | `STATE_SENTENCES.contested = null` | render t11 | RED **at line 83** — `expected '<section class="verdictBanner" aria-l…' to contain 'The run did not settle this either wa…'` (1 failed \| 4 passed). Lines 79–82 (mapping, attribute, band label, claim language) are untouched by this mutant, so nothing masks it. | yes |
| M7 | the claim language survives for `"unsupported"` (`:95`, review's `:88`) | the claim-language paragraph swapped back to a canned string when the state is `"unsupported"`: `{verdict.verdictState === "unsupported" ? "No verdict is shown." : verdict.claimLanguage}` | render t11 | RED **at line 95** — `expected … to contain 'Engine label UNSUPPORTED reached the …'` (1 failed \| 4 passed). Lines 92–93 (mapping, attribute) pass under this mutant, so line 95 is the first to speak — this is the assertion that pins O2's "the claim language is shown for all three". | yes |
| M8 | a state-less summary emits no state attribute (`:116`, review's `:109`) | `data-verdict-state={verdict.verdictState ?? "unknown"}` | render t11 | RED **at line 116** — `expected … not to contain 'data-verdict-state'` (1 failed \| 4 passed). Line 115 (claim language) passes under this mutant; the three state tests also pass, since the attribute is unchanged for a known state, which is exactly why this assertion needed its own mutant. | yes |

No assertion had to be restructured: all three could be reached without masking.

### Gate at the new tip (`91b887c7`), three runs each

| suite | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| `tests/unit/t11-verdict-label.test.ts` | 20/20 | 20/20 | 20/20 |
| `tests/render/t11-verdict-banner.test.tsx` | 5/5 | 5/5 | 5/5 |
| `tests/unit/v2ui-pages.test.ts` | 36/41 | 36/41 | 36/41 |
| `tests/unit/v2ui-data-layer.test.ts` | 59/59 | 59/59 | 59/59 |

The five `v2ui-pages` reds are the same five, by name, in all three runs — identical to the base
measurement, to the first round's gate, and to
`.hermes/reports/2026-09-01-algorithm-live-loop/closing-runs/four-count-4f83405f-failures.txt:136-140`:

1. `UI-01 DR-146 rework keeps newer V2 chrome and honest V3 gaps > kills MUT-A: deleting the V3ScoreBadges JSX render site`
2. `UI-01 DR-146 rework keeps newer V2 chrome and honest V3 gaps > kills MUT-C: deleting the maker meta line from the contentful node header`
3. `UI-01 DR-146 rework keeps newer V2 chrome and honest V3 gaps > uses DR-160 content-aware overflow instead of a fixed collapse breakpoint`
4. `UI-02d — every non-canvas maker surface preserves its recorded maker prop > pins tree, thread, outline, split, map, and drawer at all eight call sites`
5. `XREV-01 — node review uses the existing V2 card and drawer vocabulary > shows typed review outcome and reviewer house on cards, including honest absence`

Typechecks at the same tip: `pnpm run typecheck` **exit 0** (no diagnostics, only the
`Unsupported engine` warning), `pnpm exec tsc -p acceptance/tsconfig.json --noEmit` **exit 0**
(empty). Post-commit confirmation of my two suites together at `91b887c7`:
`Test Files 2 passed (2)`, `Tests 25 passed (25)`. My five files are committed; the working tree
holds no change of mine.

### Still true after this round

Every finding, concern and UNVERIFIED item in the sections above stands unchanged, with one
sharpened: concern 5 (the banner cannot say *which* reason made it contested) is what forced the
disjunction whose order Minor 1 just fixed. Carrying the ladder's `rung`/`trigger` onto the summary
when the banner is wired would let it name the one reason that fired, and the ordering question
would disappear with it. That remains a UI-program ticket, not a copy change.
