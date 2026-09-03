# PLAN — S05 Public debate full fidelity: entry point + honest census

> **For agentic workers:** Architecture seat fills steps. This round,
> Architecture also authored SPEC.md (ticket-assigned exception; see
> SPEC.md's authorship note).

**Goal:** A tree-bearing public debate exposes an explicit entry point into
its already-existing owner-fidelity canvas, with an honest (never
fabricated-zero) census header, and the owner-only-affordance invariant is
proven with a test against the precondition that has never existed before
now.

**Spec:** `docs/missions/public-debate-access/slices/S05/SPEC.md`

**Status:** STEPS AUTHORED by ARCH-01 (Claude, 2026-08-30).

## Quantifiability law (binding on Architecture)

- Every step is markable done / not-done by a stranger with no judgement
  call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test · file surface.
- SPEC↔PLAN coverage complete; three-run law on cluster verification.
- UNVERIFIED is a valid, respected answer.
- No executable command inside a table cell, ever (recurred twice on this
  mission already — CLASS-FIX round, `t_7539734e`/`t_b81ee2b2`). All
  verification commands below live in fenced blocks outside the cluster
  table.

## MEASURED ground truth this PLAN rests on

Restated from SPEC.md's own ground-truth section (all Architecture's own
reads) — the load-bearing facts that drive step design specifically:

- `DebateCanvas.tsx` reads `meta.judged`/`meta.derivedStanding`/
  `meta.setAside` in exactly ONE place: line 147, the sticky-header
  template string. No other consumer of those three fields exists in the
  file (own grep, `meta\.` — full match list is lines 147, 334, 336, 337,
  340; only 147 touches judged/derivedStanding/setAside). This means the
  fix is a single-render-site change, not a component-wide rewrite.
- The owner call site (`DebatePageClient.tsx:1300-1326`) and the public
  call site (`PublicDebatePageClient.tsx:209-223`) are the ONLY two
  callers of `DebateCanvas` (own grep, `<DebateCanvas` across
  `apps/ui/**/*.tsx`). A prop-type change has exactly two call sites to
  update/verify.
- `tests/render/pda-s02-public-tree.test.tsx:196` passes literal
  `judged: 0, derivedStanding: 0, setAside: 0` into `DebateCanvas`'s
  `meta` as an unrelated Challenge-suppression fixture, asserting nothing
  about the header text at those values. Widening the type from `number`
  to `number | null` keeps `0` (still a `number`) valid there — **this
  file needs no edit**, verified by re-reading its full assertion set
  (lines 175-216, quoted in SPEC.md), not assumed.
- `PublicDebatePageClient.tsx:180`'s tree section (`<section
  className="debateMain" aria-label="Published argument tree">`) has no
  `id` attribute today — an anchor-link entry point needs one added.
- The verdict card worth adding the entry-point button to is
  `PublicDebatePageClient.tsx:162-167` (`<section className="card">`,
  contains the verdict `<h2>`/confidence/summary segments) — the most
  natural place for "see the whole thing" to live, directly above the
  disclosure/badges/reversal cards.

## Architecture decisions (see DECISIONS.md for the formal entries)

1. **Item 1 ruling: reading (a).** The owner-fidelity canvas already
   exists on the public route; the button is a discoverability addition,
   not new UI construction. Full reasoning in SPEC.md's Intent section —
   not re-litigated here.
2. **Entry-point implementation: an in-page anchor link, not a new
   route.** Because the tree section already renders on the same page
   (SPEC.md ground truth), a `<Link href="#s05-public-tree">` (or plain
   `<a>`) that focuses/scrolls to the existing section is the entire
   mechanism — no client-side view-mode plumbing, no second URL. Rejected
   alternative: a distinct `/public/debate/[id]/tree` route mirroring the
   owner's full-bleed page. Rejected because it would duplicate a
   component tree that is already shared and already correct, would fork
   the "same UI as if published by the user" promise into two maintained
   surfaces instead of one, and SPEC.md's own re-read of V's words
   ("the verdict and debate state can be kept for now... that button
   routes towards seeing the real debate") describes ADDING a path from
   the existing page, not building a second screen.
3. **Census fix: nullable `meta` fields on `DebateCanvas`, not a separate
   "public" meta shape.** `judged`/`derivedStanding`/`setAside` become
   `number | null` on the ONE shared type
   (`DebateCanvasProps["meta"]`, also reused by `CanvasCardProps["meta"]`
   per the file's own type reuse). Rejected alternative: two separate meta
   types (owner vs. public). Rejected because `meta` is a single prop
   threaded through one component with one render site consuming the
   three fields (ground truth above) — a second type would duplicate that
   shape for a boundary the component itself doesn't otherwise have, and
   would not prevent a future caller from still passing `0`. `number |
   null` (not `number | undefined`, not making the fields optional) is
   chosen deliberately: an optional field can be silently omitted by a
   careless caller and default to `undefined` reading as falsy-but-absent
   in five different ways; a required, nullable field forces every caller
   to make an explicit, visible choice (`null` or a real number) at the
   call site, which is exactly the same "explicit sentinel, not silent
   omission" discipline `redactNodeForPublic` already applies elsewhere in
   this mission.
4. **Header text omits the whole census clause together, not
   field-by-field.** "32 claims across 4 levels · [nothing]" reads
   honestly; "32 claims across 4 levels · judged · standing on their
   arguments · set aside" (numbers silently missing but labels present)
   would not. The three fields are treated as a set: if any is `null`,
   the entire " · N judged · N standing on their arguments · N set aside"
   clause is omitted. In practice all three are null together on the
   public route and non-null together on the owner route, so this never
   produces a partially-elided string.
5. **QA-N2: a test, not a code change (item 4).** `NodeDetailDrawer`'s
   existing prop-gating (`onChallenge` optional, `token`-gated history)
   already enforces the invariant; SPEC.md's ground truth traces both
   paths by direct read. The only real gap is that no test has ever
   mounted this drawer against a `tree_included: true` fixture as an
   anonymous reader, because no such fixture previously had a reason to
   exist. S05-C3 adds exactly that fixture and assertion; it does not
   touch `NodeDetailDrawer.tsx`.
6. **SynthesisPanel and `condition_mark_records`: routed, not
   implemented (items 3, 5, 6).** Both require public envelope fields that
   do not exist (`debate.synthesis.*`; `answer.condition_mark_records`
   with `scope: "answer"|"node"`). This slice's own SPEC (R5, R6) forbids
   widening the envelope. DECISIONS.md entries name both fields precisely
   so a future contract-touching slice does not have to re-derive this
   investigation.

## Clusters

| Cluster | Steps | ONE verification command | File surface |
|---|---|---|---|
| S05-C1 | S05-C1-1..3 | **run block `S05-C1-verify` below** | `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`, `tests/render/pda-s05-tree-entry-button.test.tsx` |
| S05-C2 | S05-C2-1..5 | **run block `S05-C2-verify` below** | `apps/ui/components/DebateCanvas.tsx`, `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`, `tests/render/pda-s05-honest-census.test.tsx` |
| S05-C3 | S05-C3-1 | **run block `S05-C3-verify` below** | `tests/render/pda-s05-public-drawer-tree.test.tsx` |
| S05-C4 | S05-C4-1..2 | **run block `S05-C4-verify` below** | `docs/missions/public-debate-access/slices/S05/DECISIONS.md` (documentation only) |

```sh
# S05-C1-verify — entry-point button present iff tree_included.
pnpm exec vitest run tests/render/pda-s05-tree-entry-button.test.tsx
pnpm run typecheck
```

```sh
# S05-C2-verify — no fabricated census; owner unaffected; existing S02
# public-tree render test (which touches the same meta prop with a literal
# 0 fixture) stays green unedited.
pnpm exec vitest run tests/render/pda-s05-honest-census.test.tsx tests/render/pda-s02-public-tree.test.tsx
pnpm run typecheck
```

```sh
# S05-C3-verify — QA-N2 precondition (anonymous + tree-bearing) now tested.
pnpm exec vitest run tests/render/pda-s05-public-drawer-tree.test.tsx
```

```sh
# S05-C4-verify — DECISIONS.md carries both routed-finding entries, and the
# contract/publish-path files are untouched by this slice's diff.
grep -c "condition_mark_records\|debate.synthesis" docs/missions/public-debate-access/slices/S05/DECISIONS.md
git diff --quiet packages/contract/src/index.ts apps/api/src/publications.ts && echo "UNTOUCHED"
```

**Three-run law:** each cluster's verification command runs three times;
the worst run is the verdict. Green-green-red is RED.

---

### S05-C1-1 — Add a scroll target to the existing tree section

**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx:180`

**Change:** Add `id="s05-public-tree"` to the existing `<section
className="debateMain" aria-label="Published argument tree">` element. No
other change to that element.

**Acceptance test:**

```sh
grep -n 'id="s05-public-tree"' apps/ui/app/public/debate/\[id\]/PublicDebatePageClient.tsx
```

**Category:** REGRESSION-BASELINE + FEATURE-ASSERTION mix — the `grep`
itself only proves the attribute string exists; S05-C1-3's render test
proves the anchor target and the link agree.

**Failure it CATCHES:** the `id` attribute being renamed, removed, or
attached to the wrong element (the render test's `href`/target match would
then fail).

**Failure it MISSES:** does not catch a browser-level smooth-scroll
behavior regression (jsdom does not implement scroll position) — this step
proves the DOM wiring is correct, not the visual scroll animation.

---

### S05-C1-2 — Render the "View full argument tree" entry-point control

**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx:162-167`

**Change:** Inside the existing verdict `<section className="card">`
block, after the summary segments and before the closing `</section>`, add:

```tsx
{tree ? (
  <a href="#s05-public-tree" className="btn">
    View full argument tree
  </a>
) : null}
```

Gated on the same `tree` variable (`treeProjection?.detail.tree ?? null`)
that already gates the view-switcher and the tree/map/split/thread block —
no new gating logic introduced.

**Acceptance test:** covered by S05-C1-3 (a positive and a negative render
assertion in one file; see below — this step has no standalone command
because its correctness is only meaningful as "present when tree, absent
when not," which S05-C1-3 asserts both halves of).

**Category:** FEATURE-ASSERTION (verified via S05-C1-3).

**Failure it CATCHES:** N/A directly — see S05-C1-3.

**Failure it MISSES:** N/A directly — see S05-C1-3.

---

### S05-C1-3 — Entry-point control present iff `tree_included`, and its `href` matches the section `id`

**File surface:** new file `tests/render/pda-s05-tree-entry-button.test.tsx`

**Change:** New render test file, two cases:
1. A `PublicDebate` fixture with `answer.tree_included: true` and a
   minimal one-node `nodes`/`edges` pair (same fixture shape as
   `pda-s02-public-tree.test.tsx`'s existing tree fixture — reuse its
   construction, do not invent a new one). Render
   `PublicDebatePageClient`; assert `getByRole("link", { name: "View full
   argument tree" })` exists and its `href` attribute equals
   `"#s05-public-tree"`; assert an element with `id="s05-public-tree"`
   exists in the rendered output.
2. A `PublicDebate` fixture with `answer.tree_included` absent (or
   `false`) and no `nodes`/`edges` (the legacy shape). Render
   `PublicDebatePageClient`; assert `queryByRole("link", { name: "View
   full argument tree" })` is `null`.

**Acceptance test:**

```sh
pnpm exec vitest run tests/render/pda-s05-tree-entry-button.test.tsx
```

**Category:** FEATURE-ASSERTION — this test fails today (file does not
exist / control does not exist) and must pass once S05-C1-1 and S05-C1-2
land; it is written to fail before the change, per the RED-before-GREEN
law.

**Failure it CATCHES:** the control being absent when `tree_included` is
true (SPEC R1's affirmative half); the control being present when
`tree_included` is false or absent (SPEC R1's negative half — a
present-but-disabled control would also be caught here, since the assertion
is presence/absence, not enabled/disabled state); the `href` pointing at
the wrong fragment or the section missing its `id`.

**Failure it MISSES:** does not catch the control being present but
positioned somewhere a sighted user would not associate with "see the
whole debate" (visual/layout placement is not asserted by a DOM-text/role
query).

---

### S05-C2-1 — Widen `DebateCanvas`'s `meta` prop type to allow honest absence

**File surface:** `apps/ui/components/DebateCanvas.tsx` (the `meta` field
inside `DebateCanvasProps`, line ~79, and the identical field inside
`CanvasCardProps`, line ~208 — same literal type, both call sites)

**Change:** Change `judged: number; derivedStanding: number; setAside:
number` to `judged: number | null; derivedStanding: number | null;
setAside: number | null` in both locations. `claims: number; depth: number;
decomposer?: string` are unchanged.

**Acceptance test:**

```sh
pnpm run typecheck
```

**Category:** REGRESSION-BASELINE — this must stay green (proves the
owner's existing real-number call site and the S02 test's literal-`0`
fixture both still satisfy the widened type; a `number` is assignable to
`number | null`).

**Failure it CATCHES:** a caller passing something that is neither a
`number` nor `null` (e.g. `undefined`, a string) for these three fields.

**Failure it MISSES:** does not catch a caller passing `null` when a real
number was actually computable (a silent under-reporting bug) — that is
caught by S05-C2-4/S05-C2-5's assertion on the specific call sites, not by
the type checker.

---

### S05-C2-2 — Sticky header omits the census clause when the three fields are null

**File surface:** `apps/ui/components/DebateCanvas.tsx:145-157`

**Change:** Replace the single template-literal `<span>` (line 147) with:

```tsx
const censusKnown =
  meta.judged !== null && meta.derivedStanding !== null && meta.setAside !== null;
```

computed once above the `return`, and the span body becomes:

```tsx
<span>
  {meta.claims} claims across {meta.depth} levels
  {censusKnown ? (
    <> · {meta.judged} judged · {meta.derivedStanding} standing on their arguments · {meta.setAside} set aside</>
  ) : null}
</span>
```

No other markup in `stickyControl` changes (the "Show set-aside paths"
checkbox is untouched — SPEC's Out of Scope explicitly excludes it, it does
not read these three fields).

**Acceptance test:** covered by S05-C2-5 below.

**Category:** FEATURE-ASSERTION (verified via S05-C2-5).

**Failure it CATCHES:** N/A directly — see S05-C2-5.

**Failure it MISSES:** N/A directly — see S05-C2-5.

---

### S05-C2-3 — Owner call site passes real numbers, unchanged

**File surface:** `apps/ui/app/debate/[id]/DebatePageClient.tsx:1313-1315`
(no edit expected — this step is a regression confirmation, not a change)

**Change:** None. `judged: canvasCensus?.judged ?? 0, derivedStanding:
canvasCensus?.derivedStanding ?? 0, setAside: canvasCensus?.setAside ?? 0`
stays exactly as it is today — these already produce real `number` values
(the `?? 0` fallback fires only when `canvasCensus` itself is `null`
during loading, which is a `number`, still valid under the widened type).

**Acceptance test:**

```sh
git diff --quiet apps/ui/app/debate/\[id\]/DebatePageClient.tsx && echo "UNCHANGED"
```

**Category:** REGRESSION-BASELINE — must print `UNCHANGED`; this step
exists to make the "owner behavior is not touched" claim (SPEC R3)
mechanically checkable, not just asserted in prose.

**Failure it CATCHES:** any accidental edit to the owner call site while
implementing S05-C2-1/C2-2.

**Failure it MISSES:** does not catch a semantic regression introduced
elsewhere that changes what `canvasCensus` computes — this step only
proves the call site's own five lines are byte-identical to before.

---

### S05-C2-4 — Public call site stops passing fabricated zeros

**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx:217-219`

**Change:** `judged: 0, derivedStanding: 0, setAside: 0` becomes `judged:
null, derivedStanding: null, setAside: null`.

**Acceptance test:** covered by S05-C2-5 below.

**Category:** FEATURE-ASSERTION (verified via S05-C2-5).

**Failure it CATCHES:** N/A directly — see S05-C2-5.

**Failure it MISSES:** N/A directly — see S05-C2-5.

---

### S05-C2-5 — Public tree view's header never contains a fabricated census number

**File surface:** new file `tests/render/pda-s05-honest-census.test.tsx`

**Change:** New render test, reusing the same tree-bearing `PublicDebate`
fixture pattern as S05-C1-3. Render `PublicDebatePageClient` in `"tree"`
view (the default). Assert the rendered output:
- contains the exact substring `"1 claims across 1 levels"` (or whatever
  the fixture's real claims/depth numbers are — assert the real computed
  numbers, not a placeholder);
- does NOT contain `"0 judged"`, `"0 standing on their arguments"`, or `"0
  set aside"`;
- does NOT contain the string `"judged"` at all (since the fixture's
  census is unknown, the whole clause — including its labels — must be
  absent, not just its numbers).

A second case in the same file mounts `DebateCanvas` directly (unit-level,
not through the page) with `meta={{claims: 3, depth: 2, judged: 5,
derivedStanding: 4, setAside: 1}}` (all real numbers, simulating what the
owner page passes) and asserts the header DOES contain `"5 judged"`,
`"4 standing on their arguments"`, `"1 set aside"` — proving the
`censusKnown` branch still renders correctly when data is present (this is
the owner-fidelity regression check for S05-C2-2, run from the shared
component rather than re-mounting the whole owner page).

**Acceptance test:**

```sh
pnpm exec vitest run tests/render/pda-s05-honest-census.test.tsx tests/render/pda-s02-public-tree.test.tsx
```

Both files run together deliberately: `pda-s02-public-tree.test.tsx`'s
existing literal-`judged: 0` fixture (line 196) must stay green unedited,
proving the type widening in S05-C2-1 did not require touching a file
outside this slice's surface.

**Category:** FEATURE-ASSERTION — the public-view half fails today (the
literal `0`s currently render "0 judged"); the direct-`DebateCanvas` half
is REGRESSION-BASELINE for the `censusKnown === true` branch, which must
already behave correctly since it is the pre-existing render path,
unchanged by this slice's logic other than being reached through a new
conditional.

**Failure it CATCHES:** the census clause rendering with fabricated
numbers on the public route (SPEC R2); the census clause failing to render
real numbers when they ARE known (SPEC R3 — an over-eager omission that
would also hide the owner's real data); the S02 fixture breaking as a side
effect of this slice's type change.

**Failure it MISSES:** does not catch a case where `judged`/
`derivedStanding`/`setAside` are non-null but individually wrong (e.g. a
future caller passing a stale or miscomputed number) — this test only
proves presence/absence of the clause, not the arithmetic behind a real
number, which is `projectCanvasCensus`'s own existing test surface,
untouched by this slice.

---

### S05-C3-1 — `NodeDetailDrawer` against an anonymous, tree-bearing reader shows no owner-only affordance

**File surface:** new file `tests/render/pda-s05-public-drawer-tree.test.tsx`

**Change:** New render test. Build a tree-bearing `PublicDebate` fixture
(same construction as S05-C1-3), derive its node via the same
`debateDetailFromAnswer`/`contractNodesById` adapter path
`PublicDebatePageClient.tsx` itself uses, and mount:

```tsx
<NodeDetailDrawer
  node={publicNode}
  v3={publicContractNode}
  token={null}
  onClose={noOp}
  onFocusRecommendationNode={() => false}
  canFocusRecommendationNode={() => false}
  onQueued={noOp}
  onError={noOp}
  onAuthRejected={noOp}
/>
```

(no `onChallenge` prop passed — matching
`PublicDebatePageClient.tsx:229-239` exactly). Assert:
- `queryByRole("button", { name: /Challenge/i })` is `null`;
- `getByRole("button", { name: "↻ Regenerate" })` exists AND has
  `disabled` / `aria-disabled="true"`;
- rendered output contains `"Unlock actions to view generation history."`;
- rendered output does NOT contain any `historyCard` item text (no real
  generation history leaked).

**Acceptance test:**

```sh
pnpm exec vitest run tests/render/pda-s05-public-drawer-tree.test.tsx
```

**Category:** VERIFICATION-ONLY — this is SPEC R4's own acceptance test.
Per SPEC.md's own ruling (item 4), the existing prop-gating in
`NodeDetailDrawer.tsx` already enforces this invariant; this test is
expected to PASS on the first run, with no production-code change
accompanying it. It is written and kept anyway because the precondition it
exercises (anonymous + `tree_included: true`) has never been reachable in
any existing fixture, so the invariant was previously unproven for this
specific case, not merely untested by omission.

**Failure it CATCHES:** any future change that accidentally makes
`onChallenge` non-optional, or that drops the `token`-gate on generation
history, or that removes the `disabled` attribute from Regenerate without
also wiring real regeneration and real ownership checks behind it.

**Failure it MISSES:** does not catch a CSS-only "affordance looks
clickable" regression (e.g. `disabled` present but styled identically to
an enabled button) — this test asserts DOM attributes and text content,
not computed visual style.

---

### S05-C4-1 — Route the SynthesisPanel envelope gap

**File surface:** `docs/missions/public-debate-access/slices/S05/DECISIONS.md`

**Change:** Append a DECISIONS.md entry (see DECISIONS.md itself) naming
`debate.synthesis.{strongest_pro,strongest_con,model_id,worker_name,
verdict_gate}` as the exact fields a future slice would need to add to
`PublicDebateSchema` to render `SynthesisPanel` publicly, and stating this
slice does not add them. This is SPEC R6's own acceptance mechanism —
R6 requires SynthesisPanel not be built or stubbed; the mechanical proof
of "not built" is S05-C4-2's `git diff --quiet` check below, and this
step is the honest paper trail for why not.

**Acceptance test:** covered by S05-C4-verify (the cluster-level grep
count, checked once for both C4 steps together — see the fenced block
above the per-step entries).

**Category:** VERIFICATION-ONLY — a documentation presence check, not a
behavioral assertion.

**Failure it CATCHES:** the routed finding being written in a form that
doesn't name the actual fields (grep would miss both target strings).

**Failure it MISSES:** does not catch the entry being factually wrong
about which fields are needed — that can only be caught by a human/V
re-reading the entry against `SynthesisPanel.tsx`'s own prop usage.

---

### S05-C4-2 — Route the census envelope gap, and prove the contract/publish path is untouched

**File surface:** `docs/missions/public-debate-access/slices/S05/DECISIONS.md`,
`packages/contract/src/index.ts`, `apps/api/src/publications.ts`

**Change:** Append a DECISIONS.md entry naming
`answer.condition_mark_records` (with its `scope: "answer"|"node"` field)
as the exact field a future slice would need to add to
`PublicDebateSchema.answer` to compute a truthful `judged`/
`derivedStanding`/`setAside` publicly, and stating this slice omits those
counts instead. No edit to `packages/contract/src/index.ts` or
`apps/api/src/publications.ts` accompanies this slice.

**Acceptance test:**

```sh
grep -c "condition_mark_records\|debate.synthesis" docs/missions/public-debate-access/slices/S05/DECISIONS.md
git diff --quiet packages/contract/src/index.ts apps/api/src/publications.ts && echo "UNTOUCHED"
```

**Category:** VERIFICATION-ONLY — both a documentation presence check and
a scope-boundary check on the actual diff, mechanically checkable.

**Failure it CATCHES:** either DECISIONS.md entry from C4-1/C4-2 going
missing; any accidental edit to the two contract/publish-path files this
slice's SPEC R5 forbids touching.

**Failure it MISSES:** does not catch a scope violation made through a
DIFFERENT file that re-implements redaction or envelope logic elsewhere —
this check is textually scoped to the two named files, matching SPEC R5's
own named files exactly.
