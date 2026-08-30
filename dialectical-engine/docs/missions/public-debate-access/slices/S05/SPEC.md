# SPEC — S05 Public debate full fidelity: entry point + honest census

**Status:** FROZEN at creation (2026-08-30). No agent edits this file after
creation. Scope change = new SPEC version, ratified by V.

**Mission:** `public-debate-access` · **Traces to V's 2026-08-30 scope
correction (`t_e8c6c083`).**

**Authorship note:** written by ARCH-01 (Claude), not Requirements — this
ticket explicitly assigned SPEC authorship to Architecture because S05 has
no prior Requirements dispatch. Normal contract (SPEC frozen, Architecture
never edits it) resumes after this file is created.

## Intent

V's words, verbatim, ruled on below: *"This is how our UI looks, right?
Trees, maps, splits. I want to see the whole thing in the 'public' debates
screen. For now I see the result of the second screenshot. Add a button to
the second screenshot, cause the verdict and the debate state can be kept
for now. That button routes towards seeing the real debate publicly. All
nodes, all arguments, pros cons and verdict, same UI as if it was published
by the user. This is how done looks like in this case, if you guys thought
differently."*

**Ruling (item 1 — what the button means):** the owner-fidelity tree/map/
split/thread canvas V described in Screenshot 1 (sticky census header, "Show
set-aside paths" checkbox, zoom cluster +/−/Fit/1:1/%) already exists,
verbatim, on the public route today — it is the exact same `DebateCanvas` /
`CanvasViewport` component tree, already imported and mounted by
`PublicDebatePageClient.tsx`, already the default view (`useState<DebateView>
("tree")`). The public page is a single scrolling route, not two screens:
the verdict/summary cards (Screenshot 2) always render at the top; the
tree/map/split/thread block conditionally appends directly below them
whenever `debate.answer.tree_included === true`
(`PublicDebatePageClient.tsx:179`). The ONLY reason V has only ever seen
Screenshot 2 is that the sole existing publication predates commit
`56f46ab` ("publish a redacted argument tree to anonymous readers") and is
LEGACY — `tree_included` is not true for it, so the tree block renders
nothing and only the verdict cards show. This is a data-availability
accident, not a missing feature. V's own words support this reading
directly: *"the verdict and debate state can be kept for now"* describes
the current top section approvingly, asking for an ADDITION below it, not a
replacement or a second screen. This SPEC therefore rules **reading (a)**:
the mission's core ask (trees, maps, splits, at owner fidelity) is already
built; what is missing is (i) an explicit, literal button — because V asked
for one by name, and today reaching the tree section requires no click at
all, which is not the same thing as a discoverable entry point — and (ii)
two honesty defects that make the page look broken or thin even once a
tree-bearing publication exists. Per the explicit permission on this
ticket: this is a "prove it, mostly already built" case for the tree/map/
split/thread canvas specifically — it is **not** fully met for the
"pros cons" reading that maps to `SynthesisPanel` (see R6 and Out of
Scope: that panel needs data the public envelope does not carry, and
implementing it is forbidden by this ticket's own scope-discipline
instruction, so the two readings collapse to the same action here
regardless of which V meant).

## Ground truth this SPEC rests on

All entries below are Architecture's own reads, not the ticket's claims
taken on faith.

- `PublicDebatePageClient.tsx:40`: `const [view, setView] = useState
  <DebateView>("tree")` — tree is the default view, confirmed.
- `PublicDebatePageClient.tsx:131-160`: a single `debateTopControlRow`
  contains the four-button view switcher (`{tree ? (...) : null}`,
  lines 132-138), a Scoring diagnostics icon button, an Honesty button, and
  an Export link — all present regardless of `tree_included`.
- `PublicDebatePageClient.tsx:162-177`: the verdict/summary/badges/
  residual-objections/reversal-point cards — always rendered, this is
  exactly what V's Screenshot 2 shows.
- `PublicDebatePageClient.tsx:179-226`: `{tree ? (<section className=
  "debateMain" aria-label="Published argument tree">...)` — the entire
  Thread/Split/Map/Canvas render block, gated solely on `tree`
  (`treeProjection?.detail.tree ?? null`, itself gated on
  `debate.answer.tree_included !== true` returning `null`, line 57).
  This section has no `id` attribute today.
- `DebateCanvas.tsx:26`: imports `CanvasViewport` from
  `@/components/CanvasViewport`; `DebateCanvas.tsx:141-158,194`: renders it,
  passing the sticky census header (`meta.claims`/`meta.depth`/
  `meta.judged`/`meta.derivedStanding`/`meta.setAside`, line 147) and the
  "Show set-aside paths" checkbox (line 148-155) as `stickyControl`.
  `DebateCanvas.tsx`'s only other use of `meta.*` is line 334-340
  (per-card `claims`/`depth`/`decomposer` chip) — `judged`/
  `derivedStanding`/`setAside` are read in exactly one place, line 147.
- `CanvasViewport.tsx:598-639`: the full zoom cluster — Zoom in (`+`),
  Zoom out (`−`), Fit (`aria-label="Fit whole tree (overview)"`), 1:1
  (`aria-label="Reset zoom to 1:1"`), and a live `{Math.round(zoom * 100)}%`
  readout. `CanvasViewport` is imported by exactly one file,
  `DebateCanvas.tsx` — no separate owner-only zoom implementation exists.
- **The census bug (t_6b1e5db1, confirmed by own read):**
  `PublicDebatePageClient.tsx:217-219` passes `judged: 0, derivedStanding:
  0, setAside: 0` as literals. `DebatePageClient.tsx:1313-1315` (owner)
  passes `judged: canvasCensus?.judged ?? 0, derivedStanding: canvasCensus?.
  derivedStanding ?? 0, setAside: canvasCensus?.setAside ?? 0` — real
  computed values, falling back to 0 only when `canvasCensus` itself is
  `null` (loading/error state), not as a permanent design.
  `canvasCensus` comes from `projectCanvasCensus`
  (`apps/ui/lib/v3/census.ts`), which requires `answer.
  condition_mark_records` — an array of `{mark, scope: "answer"|"node",
  subject_ref, reason, lift_path, served_root_rule, call_site_key,
  planned_leg_count, ...}` (`packages/contract/src/index.ts:505-520`,
  own read) present on the owner `AnswerSchema` only.
- **`PublicDebateSchema.answer`'s complete field list, re-read this round
  in full** (`packages/contract/src/index.ts:465-484`): `terminal`,
  `verdict`, `verdict_available`, `confidence_band`, `summary_segments`,
  `badges`, `residual_objections`, `reversal_point`, `as_of`, `nodes`
  (optional), `edges` (optional), `tree_included` (optional). No
  `condition_mark_records` field. No `synthesis` field. This is exhaustive
  — the schema is `.strict()`, so nothing else can be present either.
  **Ruling (item 3 — the counts problem):** `judged`/`derivedStanding`/
  `setAside` cannot be truthfully computed from the public envelope. Even
  a per-node reconstruction using `PublicNodeSchema`'s surviving
  `condition_marks` array would be structurally incomplete for any
  `scope: "answer"` mark. The honest design is to OMIT these three counts
  publicly, not render zeros. A confidently wrong number is worse than an
  absent one, and shipping a placeholder that reads as a measurement is
  precisely the defect family this mission has catalogued repeatedly.
- **SynthesisPanel (own read, full file,
  `apps/ui/components/SynthesisPanel.tsx`):** requires `proClaim`,
  `conClaim`, `verdict`, `verdictGate`, `meta`, `lean`, `sections` — on the
  owner page (`DebatePageClient.tsx:1339-1359`) these are sourced from
  `debate.synthesis.{strongest_pro,strongest_con,model_id,worker_name,
  verdict_gate}` (lines 739-784, own grep) plus locally derived `lean`/
  `synthesisSections`. `debate.synthesis` has no counterpart anywhere in
  `PublicDebateSchema`. `SynthesisPanel` is entirely absent from
  `PublicDebatePageClient.tsx` today (confirmed, full-file read).
  **Ruling (item 2/5 — SynthesisPanel):** genuinely missing relative to
  the owner view, but blocked by envelope data this slice may not add
  (see Out of Scope). Not built here. Routed as a follow-up finding
  (DECISIONS.md).
- **QA-N2 (`t_8dedb631`), independently re-verified this round (own read,
  full file, `NodeDetailDrawer.tsx`):** the Regenerate button
  (lines 264-273) carries a bare, unconditional `disabled aria-disabled=
  "true"` JSX attribute — not gated by `token` or any prop — and is
  identical markup on the owner and public call sites today (both a
  `V3_MISSING_CAPABILITIES.nodeRegeneration` stub, not a real,
  ownership-gated action). The scoring-feedback UP/DOWN buttons
  (lines 465-484) are likewise unconditionally `disabled`. The genuinely
  owner-only affordances — the Challenge button and prose-select handler
  (lines 148-154, 255-263, gated on the optional `onChallenge` prop) and
  real generation history (line 308, gated on `!token`) — are correctly
  prop-gated already, and the public call site
  (`PublicDebatePageClient.tsx:229-239`) already passes `token={null}` and
  omits `onChallenge` entirely. **Ruling (item 4 — the invariant):** the
  invariant already holds structurally; no product-code change to
  `NodeDetailDrawer.tsx` is required. What is missing is a test: no
  fixture with `tree_included === true` has ever existed, so this drawer
  has never actually been mounted against an anonymous, tree-bearing
  reader in CI. QA-N2's risk was real as an *untested precondition*, not
  as a live defect.
- `tests/render/pda-s02-public-tree.test.tsx:196` (own read): already
  constructs `DebateCanvas`'s `meta` prop with literal `judged: 0,
  derivedStanding: 0, setAside: 0` as an unrelated Challenge-suppression
  fixture — it asserts nothing about the header text at those values.
  Widening the prop type to `number | null` keeps this literal-`0` fixture
  type-valid without editing the test (own re-verification: `0` satisfies
  `number | null`).

## Requirements

### R1 — Explicit "view full argument tree" entry point

When `debate.answer.tree_included === true`, the verdict/summary section
contains a control (accessible name containing "argument tree" or
equivalent) that navigates the reader to the tree/map/split/thread block
already rendered below it on the same page. When `tree_included !== true`
(legacy/downgraded publication), this control is not rendered at all — not
present-and-disabled.

### R2 — No fabricated census numbers on the public route

The public `DebateCanvas` invocation never passes literal `0` (or any other
fabricated number) for `judged`, `derivedStanding`, or `setAside`. When
these values are not truthfully computable (today: always, on the public
route, per the ground-truth ruling above), the sticky census header omits
that portion of its text entirely rather than displaying a number. `claims`
and `depth`, which ARE truthfully computable from `nodes`/`edges` alone,
continue to render exactly as today on both routes.

### R3 — Owner behavior unchanged

`DebateCanvas`'s `meta` prop type change (to accommodate R2) does not
change what the owner page passes or renders. The owner continues to pass
real computed `canvasCensus` values, unchanged, and its sticky header
continues to show all five figures exactly as today.

### R4 — QA-N2 closed with a test, not a code change

A new render test exercises `NodeDetailDrawer` mounted with a tree-bearing,
anonymous-reader configuration (`token={null}`, no `onChallenge` prop, a
node drawn from a `tree_included: true` fixture) and asserts: no Challenge
control is present; the Regenerate button is present and disabled/inert;
generation history shows the locked-state message, not real history data.
This precondition (anonymous + tree-bearing) has never been exercised in
CI before this slice.

### R5 — Contract, redaction, and publish path untouched

No change to `PublicDebateSchema`, `redactNodeForPublic`, or any
publish-path code (`packages/contract/src/index.ts`,
`apps/api/src/publications.ts`). If satisfying R1–R4 honestly surfaces a
need for public envelope data that does not exist today, that need is
NOT implemented in this slice — it is recorded in DECISIONS.md naming
exactly which field, and routed as a follow-up finding.

### R6 — SynthesisPanel is out of scope

The pros/cons synthesis widget (`SynthesisPanel.tsx`) is not built, stubbed,
or approximated with placeholder data in this slice, regardless of which
reading of V's "pros cons" is correct — R5 forbids the envelope widening
either reading would require.

## Out of scope (this slice)

- Envelope widening of any kind (S01's `.strict()`/schema boundary stays
  exactly as merged).
- `SynthesisPanel` (R6).
- Publish/unpublish owner controls.
- The owner-only `DebateCanvas` props already correctly omitted (not
  stubbed) on the public call site today: `scrutiny`, `scoringByNodeId`,
  `scoringErrorsByNodeId`, `scoreFilterNodeIds`, `lowStrengthThreshold`.
  No change to this pattern.
- The Challenge flow (already suppressed; unchanged by this slice).
- The "Show set-aside paths" checkbox and its underlying `isSetAsidePath`
  filter — these read node-level `path_status`/`stopping_status` fields
  already present in the redacted node, are unrelated to
  `condition_mark_records`, and already work correctly on the public route
  today. Not touched.

## Acceptance sketch

1. Tree-bearing publication: the verdict section shows a "View full
   argument tree" control; activating it lands the reader on the already-
   rendered tree section.
2. Legacy/downgraded publication: no such control renders.
3. Tree-bearing publication's `DebateCanvas` sticky header shows accurate
   `claims`/`depth` and contains none of "0 judged", "0 standing", "0 set
   aside" as if they were measurements.
4. `NodeDetailDrawer`, opened from an anonymous session against a
   tree-bearing publication, shows no Challenge control, a disabled
   Regenerate control, and the locked-history message.
5. `pnpm run typecheck` exits 0. Existing S01–S04 tests (including
   `tests/render/pda-s02-public-tree.test.tsx`) pass unchanged.
6. `packages/contract/src/index.ts` and `apps/api/src/publications.ts` are
   untouched by this slice's diff.
