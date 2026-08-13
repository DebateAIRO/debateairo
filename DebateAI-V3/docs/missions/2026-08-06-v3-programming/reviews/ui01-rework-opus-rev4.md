# UI-01 rework (DR-146 + DR-160) — Opus 5 lens, rev 4

**Ticket:** `t_5f35d086` · **Prior:** `reviews/ui01-rework-opus-rev3.md` ·
**Handoff:** `handoffs/UI-01-rework-codex-handoff.md` · dual diamond (DR-153);
Grok has greenlit. V's visual verdict remains the final gate (DR-145).

**Scope of this rev, per the re-review scope I set in rev3:** B6 only, plus the
two corrected handoff rows and a no-regression spot-check. B1/B2/B4/B5 are
settled and were not re-litigated.

## VERDICT: APPROVED — B6 is closed

All four wiring mutations that survived rev3 now go RED, each through the
assertion that names it, applied to the **real** `DebatePageClient.tsx` and
restored md5-identical. The corrected handoff rows no longer let library-site
evidence stand in for the call site. Nothing that was right regressed.

---

## B6 — CLOSED. Four mutations, real file, real command, each killed

`npx vitest run tests/unit/v2ui-pages.test.ts`. Baseline **38 passed (38)**.
Each mutation applied on its own to
`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx`, restored from a byte copy
between runs, md5 `4189eb4babf8016dce77d1492d5bb9fb` verified after every
single one and again at the end — the same hash rev3 recorded as baseline.

| rev3 mutation | applied at | rev4 result | the assertion that kills it |
|---|---|---|---|
| `availableWidth: 1e9` — never collapses | `:778` | **RED — 1 failed \| 37 passed** | `v2ui-pages.test.ts:305` `toContain("availableWidth: header.clientWidth,")` |
| `titleIntrinsicWidth: 0 * debateHeaderElementIntrinsicWidth(titleMeasure)` — rev2's MUT-G relocated | `:784` | **RED — 1 \| 37** | `:307` `toContain("titleIntrinsicWidth: debateHeaderElementIntrinsicWidth(titleMeasure),")` |
| `setHeaderActionsCollapsed(false)` — **the bar never collapses at any width**; rev2's MUT-E, the one my prior instance applied live and got the crushed 282px-of-880 title back with the suite green | `:790` | **RED — 1 \| 37** | `:309` `toContain("setHeaderActionsCollapsed(fit.collapse);")` |
| `measure: () => {}` — observers wired, never re-decides after first paint | `:799` | **RED — 1 \| 37** | `:311` `toContain("measure: measureHeaderFit")` |

Failure trace shape, identical for all four (W3 shown):

```text
FAIL tests/unit/v2ui-pages.test.ts > UI-01 DR-146 rework … > uses DR-160 content-aware overflow instead of a fixed collapse breakpoint
AssertionError: expected '"use client";\n\nimport Link from "ne…' to contain 'setHeaderActionsCollapsed(fit.collaps…'
 ❯ tests/unit/v2ui-pages.test.ts:309:20
 Test Files  1 failed (1)
      Tests  1 failed | 37 passed (38)
```

Restored baseline afterwards: **38 passed (38)**, md5 `4189eb4b…`.

The worker's handoff claims exactly "1 failed / 37 passed" for each of W1–W4.
That is what I measured, mutation for mutation, line for line. The named
killers are accurate.

## A9 — the corrected rows are honest now

Rev3's complaint was that the acceptance table and the MUT-G killer row let
`debateHeaderOverflow.ts` evidence pass for `DebatePageClient.tsx` evidence.
Both are fixed:

- The killer table now says **"B5 library MUT-E / MUT-G / MUT-F / MUT-H"** with
  the reason column reading "The **library-site** mutant …", and adds four
  separate **"B6 wiring W1–W4"** rows whose reason column reads "The
  **call-site** mutant fails the named source assertion".
- The acceptance table's ratchet row now states plainly: *"Partly green:
  MUT-A/B/C were killed; B5's library-site MUT-E/G/F/H were later killed, but
  the same four defects still survived at the `DebatePageClient` wiring seam"*
  → *"B5 library mutants and B6 call-site W1–W4 now each make enforced Vitest
  RED"*.

That is the qualifier I asked for, and it is stated as a correction rather than
a re-description. A13 is also folded — the synthetic case is renamed
"synthetic intrinsic action-row arithmetic", no longer claiming to model the
real ≤640px phone DOM.

## Nothing else regressed

| check | rev3 | rev4 |
|---|---|---|
| `components/CanvasViewport.tsx` vs `apps/dialectical-engine/web` | byte-identical | **byte-identical** (`diff` exit 0) |
| `lib/canvasViewport.ts` vs same | byte-identical | **byte-identical** |
| `DebateCanvas.tsx` vs V2 | 85 added / 16 removed | **85 added / 16 removed** |
| `lib/v3/adapter.ts` control bytes | 0 of 25,492 | **0 of 25,492** |
| adapter mtime (frozen formatter) | 11:11:39 | **11:11:39 — untouched** |

**Rev4 really is test-only.** Against the four md5s rev3 recorded, three are
unchanged and one is not:

```text
debateHeaderOverflow.ts  4febd48aaab48675a985b1f914bc7c00   unchanged
DebatePageClient.tsx     4189eb4babf8016dce77d1492d5bb9fb   unchanged
app/globals.css          4c518c1797a0aa63879c62bce79158fd   unchanged
tests/unit/v2ui-pages.test.ts  41de3010… → bd9b5127…        the only change
```

So rev3's live B4 evidence — 640px/420px/641/660/1000/1280/1920, 6/6 actions
reachable, no horizontal document scroll — carries forward intact: not one byte
of product or library code moved under it.

**Gates re-run in this review, whole tree:**

```text
$ npx vitest run                                   65 files / 461 tests   exit 0
$ npx vitest run --config acceptance/vitest.config.ts    9 files / 35 tests
$ node --test app/debate/headerToolbarResilience.source-test.mjs \
    components/scoringFeedbackControls.source-test.mjs \
    lib/adaptiveDepthDryRun.source-test.mjs          pass 7  fail 0
$ npx tsc --noEmit --pretty false                   exit 0, no output
```

(The handoff's "63 files / 459 tests" predates POL-03 landing its two fixtures
in the same tree; the tree is green either way.)

---

## ADVISORY

- **A17 — the ratchet is lexical, and here is exactly how much that buys.** I
  offered the worker two options in rev3 and this is the one I explicitly
  permitted, so it is not blocking — but the residual should be on the record.
  Proven this session: insert a *second* call immediately after `:790`,

  ```ts
        setHeaderActionsCollapsed(fit.collapse);
        setHeaderActionsCollapsed(false);      // ← added
  ```

  and the suite is **38 passed (38)**. All four `toContain` strings are still
  present; the bar never collapses at any width — rev1/rev2's proven defect,
  green. The four assertions pin *that the correct text exists*, not *that
  nothing overrides it*. The stronger form remains the one rev3 named:
  extract the DOM read into a pure `readDebateHeaderGeometry(elements, styles)`
  in `debateHeaderOverflow.ts` and assert it with stub elements, which kills all
  four behaviourally. Worth a HYG-slice; not worth holding V's gate.

- **A16 (carried, still open, still not UI-01's doing).** The acceptance API on
  `127.0.0.1:8790` is **still pid 1014** — the same process rev3 flagged as
  having been booted *before* another lane regenerated `packages/contract`. It
  has not been restarted. `/debate/<id>` SSR shells answer `200` with no
  `INVALID_RESPONSE` marker in the HTML, but rev3's failure appeared
  post-hydration on the client fetch, and I could not reach that state here
  without entering the coordinator's user token into the auth gate, which I do
  not do. **Restart the acceptance API before V looks**, or V may see an error
  page and charge it to UI-01.

- **A18 — two cosmetic staleness items in the rev4 handoff.** The §Outcome
  "B5 closed" bullet still reads "Each of Opus's four mutations was applied
  separately and made the suite RED" without the *library-site* qualifier the
  tables below now carry correctly; and the "Verified canvas render preserved"
  bullet says "rev3 does not edit `DebateCanvas.tsx`" inside a rev4 handoff.
  Both are harmless given the corrected tables. Fix on the next touch.

- **A12 / A14 / A15 stand as written in rev3** — the ≤640px breakpoint
  fallback vs the content-aware rule, the 520px title cap at 1920px, and the
  completion chip that legitimately collapses the bar at 1280px for every
  question length. A14 and A15 are V's to rule at the visual gate; A12 is a
  sentence in the handoff, not a behaviour.

---

## Summary

| # | Item | Result |
|---|---|---|
| B6 | Four call-site wiring mutations each RED via a named enforced assertion (`:305`, `:307`, `:309`, `:311`), 1 failed / 37 passed each, file restored md5-identical | **CLOSED** |
| A9 | Corrected rows separate library-site from call-site evidence; no over-claim remains | **FOLDED** |
| A13 | Synthetic arithmetic case renamed; no longer claims phone-DOM fidelity | **FOLDED** |
| — | Viewport byte-identity, canvas merge shape, adapter control bytes, frozen formatter | **UNREGRESSED** |
| — | Root suite 65/461, acceptance 9/35, source contracts 7/7, typecheck exit 0 | **GREEN** |

**VERDICT: APPROVED.** With Grok's greenlight recorded, the UI-01 rework
diamond is complete and this goes to **V's visual gate (DR-145)** — after the
acceptance API is restarted (A16).

---

*Method note: every mutation claim above is `npx vitest run
tests/unit/v2ui-pages.test.ts` against the real
`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx`, restored byte-identical
between and after runs (md5 verified each time, final hash matches rev3's
baseline). No product, library or test file was left changed by this review; the
only file it writes is itself. No service was restarted, no token entered, no
DB row written, no git mutation performed.*
