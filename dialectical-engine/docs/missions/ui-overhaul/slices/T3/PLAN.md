# PLAN — T3 Library & public debate view

**Goal:** Signed-in library (3a) + publicMode 3b reading (verdict-first, locks).

**Spec:** `slices/T3/SPEC.md` v2

**Status:** ARCHITECTURE FILLED (ARCH-01, 2026-08-31). WHAT/acceptance columns
are Requirements' and unchanged; `HOW` blocks and commands are Architecture's.

**Architecture references:** `docs/missions/ui-overhaul/architecture/` —
`component-map.md` (T3 composition), `ADR-003-landing-route-split.md`,
`ADR-004-auth-return-path.md`, `test-migration.md`, `dispatch-order.md`.

**Gated on T9-C3** (tokens/mode) and, for C1, on **T9-C1** — both clusters write
`apps/ui/app/page.tsx`, T9-C1 first.

## Quantifiability law

Same as T9/PLAN.md (literal acceptance cells; one verification command per cluster).

## Clusters

### T3-C1 — Signed-in library chrome + mode

**Proves:** R1, R2, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C1-1 | R1 | Signed-in `/` shows library not landing hero | Assert `Your debates` or `+ New debate` present AND hero `Find the weakest claim in your own argument.` absent |
| T3-C1-2 | R2 | Composer + Start debate visible | Assert `Type a debatable claim or question…` and `Start debate →` present |
| T3-C1-3 | R8 | Mode toggle present on library | Assert mode control present; toggle flips Terracotta/Chamber marker |

**HOW (ARCH).**

- **Modify** `apps/ui/components/TopBar.tsx`: mount `<ModeToggle />` in
  `topBarActions` AND in the `authTopBar` branch. This is one of exactly two
  mount points in the whole mission (`ADR-002`); every other slice's mode step
  is "the toggle is already here", not "add a toggle". Add the asker chip
  beside the existing `⚙` link.
- **Modify** `apps/ui/app/page.tsx`, library half only (below T9-C1's early
  return): eyebrow `A REASONING INSTRUMENT`, headline
  `What should we debate?`, and the existing lede paragraph. The `.eyebrow`,
  `.display`, `.lede` classes already exist and already consume tokens — this
  is copy, not structure.
- **Modify** `apps/ui/components/LibraryComposer.tsx`: input placeholder
  `Type a debatable claim or question…`, helper `Models argue · you judge`,
  submit `Start debate →`.
- `Start debate →` here and `Start a debate` on the landing and `Start run →` on
  the form are three deliberately different strings — see
  `architecture/open-questions.md` Q-04. Do not unify them.
- **Create** `tests/render/t3-library.test.tsx` with two `describe` blocks,
  `chrome` (C1) and `lists` (C2), so the two clusters never edit the same hunk.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t3-library.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts
```

`auth-flow-integration` imports `TopBar`; `pda-s03` renders `app/page.tsx`.
Both READ what this cluster WRITES.

### T3-C2 — Your / Public lists + 4 TOTAL

**Proves:** R3, R4

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C2-1 | R3 | Both selectors exist with `4 TOTAL` chip | Assert strings `Your debates`, `Public debates`, and `4 TOTAL` present |
| T3-C2-2 | R3 | Selectors show distinct membership or empty-state | Fixture with differing Your vs Public membership (required); assert visible row titles or empty-state string differ after switching selectors — identical hardcoded empty under both = RED |
| T3-C2-3 | R4 | Library rows use bezel-card markers ARCH documents | Assert bezel marker/class on ≥1 library row |

**HOW (ARCH).**

- **Modify** `apps/ui/app/page.tsx` `sectionHead` block: recase the two link
  labels to `Your debates` and `Public debates`, and change the `.count` chip to
  the design's `N TOTAL` form (`4 TOTAL` in the design sample; the number is
  live, the word `TOTAL` is literal and uppercase).
- **PRESERVE, do not "improve":** both selectors stay native `<a>` elements
  with real `href="/?tab=yours"` / `href="/?tab=public"`, `tabIndex` 0,
  `aria-current="page"` on the active one, and **no** `role="tab"`, **no**
  `aria-selected`, **no** `role="tablist"` on the container.
  `tests/unit/pda-s03-keyboard-accessibility.test.ts` asserts every one of
  those, deliberately, from a prior mission. Converting them to buttons or to
  client state destroys an accessibility invariant and is not in this slice's
  scope.
- The distinct-membership requirement (`T3-C2-2`) is already true in the
  shipped code: `tab === "yours"` renders `<DebatesBuffer debates={debates}/>`
  from `listDebatesPageServer`, `tab === "public"` renders `published.items`
  from `readPublicDebates`, and the logged-out `yours` branch renders the
  `tabEmptyHint` copy `Sign in or create an account above to see your debates.`
  — which `pda-s03` pins and which must survive verbatim.
- **Modify** `apps/ui/components/DebatesBuffer.tsx` and the inline
  `article.debateCard` list: add `data-bezel="shell"` on the row wrapper and
  `data-bezel="core"` on its inner body, sharing the T1 card vocabulary. Row
  status strings are `Complete` and `Generating` (T3 R3).

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t3-library.test.tsx tests/render/bug03-home-buffer.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/architecture/s8-publication-contract.test.ts
```

### T3-C3 — Public 3b verdict-first + locks

**Proves:** R5, R6, R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C3-1 | R5 | Public URL mounts shared workspace publicMode | Assert view toggles `Thread`/`Split`/`Tree`/`Map` present on public debate URL |
| T3-C3-2 | R6 | Verdict-first + `Details ▾` + case `Read ▾` | Assert verdict/status precedes strongest-case pair in DOM order; assert `Details ▾` and `Read ▾` present |
| T3-C3-3 | R7 | Mutations locked + unlock path | Assert public banner string present; Challenge locked/absent; `Unlock actions` present |

**HOW (ARCH) — this closes SPEC OQ-1 and OQ-3.**

**OQ-1 is not a conflict.** Read the design's own reading order,
`design-document-text.txt:436-475`: the view toggles `Thread Split Tree Map`
appear ABOVE the verdict block, and the strongest-case pair appears BELOW it.
"Verdict-first" therefore means *verdict precedes the strongest-case pair* —
which is exactly how T3 R6 words it ("before or above the strongest-case
pair"). Nothing has to be dropped and the shared `publicMode` workspace stays.

The composition uses the `publicHeader` slot that already exists.
`DebatePageClient` renders `{publicMode && publicHeader ? publicHeader : null}`
directly after `debateTopBar` and before `debateMain`:

```
debateTopBar   title · Thread/Split/Tree/Map · ☾        <- existing (T1-C1)
publicHeader   PublicLockBanner       data-public-locked="true"
               PublicVerdictBlock     data-verdict-block
               PublicStrongestCases   data-strongest-case
               <details className="publicationDetails">  <- existing, moved below
debateMain     Thread / Split / Tree / Map               <- existing, UNTOUCHED
```

R5 holds because nothing below `publicHeader` changes.

- **Create** `apps/ui/components/public/PublicVerdictBlock.tsx` —
  `export function PublicVerdictBlock({ answer }: { answer: PublicDebate["answer"] }): JSX.Element`.
  Status chip (e.g. `CONTESTED`), thresholds line, `<details><summary>Details ▾</summary>`,
  verdict paragraph, caveat when present, metric line
  (`DIALECTICAL SUPPORT` / `VERIFICATION` / `JUDGE COVERAGE` / `CONVERGENCE`).
  A closed `<details>` keeps its children in the DOM, which is why the existing
  code uses that element and why assertions still reach the content.
- **Create** `apps/ui/components/public/PublicStrongestCases.tsx` —
  `↑ THE CASE FOR · n` / `n · THE CASE AGAINST ↓`, subtitle
  `The strongest surviving argument on each side`, one card per side with
  `↑ PRO` / `↓ CON`, `base → final`, model line, text, `🔒 Challenge`, `Read ▾`.
- **Create** `apps/ui/components/public/PublicLockBanner.tsx` — the strings
  `🔒 Public view · actions locked`,
  `🔒 Viewing publicly — sign in to challenge, regenerate, or flag claims.`,
  and `Unlock actions`.
- **OQ-3 — `Unlock actions` goes to `/login?next=%2Fpublic%2Fdebate%2F<public_ref>`**,
  i.e. back to the same public debate. A non-owner has no owner route to reach;
  `/debate/<id>` would 404 or be denied. `safeReturnPath`'s public-debate shape
  rule exists for exactly this href (`ADR-004`).
- **Modify** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`: the
  `publicHeader` fragment now renders the three components above, then the
  existing `<details className="publicationDetails">` with its pseudonym,
  badges, residual objections and reversal point **kept** — the design gives
  them no position, and dropping them removes their only public home.
- Every locked control carries `data-public-locked="true"`, so `T3-C3-3`
  asserts an attribute rather than matching prose.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t3-public-3b.test.tsx tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/architecture/s8-publication-contract.test.ts
```

### T3-C4 — Render-pin migration

**Proves:** R9

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T3-C4-1 | R9 | ARCH names library/public pins under `tests/render/` | Named list includes `pda-s02-*` / home buffer as applicable |
| T3-C4-2 | R9 | Named tests pass (three runs) | Three-run vitest on named files |

**HOW (ARCH) — the named pin files, `8 of 8`, from `architecture/test-migration.md`.**

| File | Class | What moves |
|---|---|---|
| `tests/render/pda-s02-public-page.test.tsx` | **RETARGET** | asserts `SUPPORTED`, `Evidence checked`, `Countercase preserved`, `may be indexed by search engines` inside the public header. The header is restructured; the same strings must still be present, re-anchored to the new blocks |
| `tests/render/bug03-home-buffer.test.tsx` | **RETARGET** | `Generating` / `Failed` survive; add `Complete` |
| `tests/render/pda-s02-public-tree.test.tsx` | KEEP | `⚐ Challenge`, `Unlock actions to view generation history.` |
| `tests/render/pda-s02-scoring-chrome.test.tsx` | KEEP | `Not exposed by scoring API` |
| `tests/render/pda-s02-honesty-export.test.tsx` | KEEP | export label/bytes gate |
| `tests/unit/pda-s03-keyboard-accessibility.test.ts` | **RETARGET** | tab label recasing only; the link/ARIA contract is preserved |
| `tests/unit/s8-publication-ui.test.tsx` | KEEP (verify) | imports `PublicationControl` |
| `tests/architecture/s8-publication-contract.test.ts` | **RETARGET** | reads `app/page.tsx`, `public/debate/[id]/page.tsx`, `PublicDebatePageClient.tsx` as source. Its test *"ships the same deliberate controls and public-only reader in both UI compositions"* compares `apps/ui` against `web/` — see `test-migration.md` §`web/` |

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/render/bug03-home-buffer.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/s8-publication-ui.test.tsx tests/architecture/s8-publication-contract.test.ts
```

## SPEC ↔ PLAN trace (both directions)

| SPEC | Covered by | | Step | Traces to |
|---|---|---|---|---|
| R1 | T3-C1-1 | | T3-C1-1 | R1 |
| R2 | T3-C1-2 | | T3-C1-2 | R2 |
| R3 | T3-C2-1, T3-C2-2 | | T3-C1-3 | R8 |
| R4 | T3-C2-3 | | T3-C2-1 | R3 |
| R5 | T3-C3-1 | | T3-C2-2 | R3 |
| R6 | T3-C3-2 | | T3-C2-3 | R4 |
| R7 | T3-C3-3 | | T3-C3-1 | R5 |
| R8 | T3-C1-3 | | T3-C3-2 | R6 |
| R9 | T3-C4-1, T3-C4-2 | | T3-C3-3 | R7 |
| | | | T3-C4-* | R9 |

9 of 9 requirements covered; 11 of 11 steps trace.

## Refutation (ARCH)

| Cluster | Mutant its command detects | Mutant it does NOT detect |
|---|---|---|
| T3-C1 | library chrome missing; the landing hero leaking into the signed-in view; the toggle absent from `TopBar` | a signed-in `/` that renders the library AND the landing (both present) — the step asserts the hero is absent, so this one IS caught; not caught is a library whose composer submits to the wrong endpoint |
| T3-C2 | both selectors rendering the same hardcoded list; the `TOTAL` chip missing; the selectors converted to `role="tab"` buttons | a `4 TOTAL` chip whose number does not match the rows shown — the assertion is on the literal word and the presence of a count, not on arithmetic |
| T3-C3 | verdict rendered after the strongest cases; a lock banner without `data-public-locked`; view toggles dropped from the public route; `Unlock actions` pointing at the owner route | a verdict block that renders the RIGHT structure with the WRONG debate's data — no step cross-checks the payload identity |
| T3-C4 | any of the eight standing files going red from the T3 diff | a standing file already red before T3 |
