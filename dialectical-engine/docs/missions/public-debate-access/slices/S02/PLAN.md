# PLAN — S02 Public debate READ-parity UI

> **For agentic workers:** Architecture seat fills steps. Requirements authored
> skeleton + quantifiability law only.

**Goal:** Public debate page reaches READ-affordance parity with the owner UI
for anonymous and non-owner visitors; mutations stay off the public route.

**Spec:** `docs/missions/public-debate-access/slices/S02/SPEC.md` (v2 —
supersedes SPEC-v1.md; R6 is typed-absence-only, zero new scoring plumbing)

**Status:** STEPS AUTHORED by ARCH-01 (Claude, 2026-08-29). Depends on S01
(cannot start coding S02-C2/C3 field-consuming steps until S01-C1/C2 land —
see Single-writer / dependency note at the end).

## Quantifiability law (binding on Architecture)

- Every step is markable done / not-done by a stranger with no judgement call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test · file surface.
- Every PLAN step traces to a SPEC sentence; every SPEC requirement has ≥1 step.
- Three-run law on each cluster verification command.
- UNVERIFIED is a valid, respected answer.

## The core architecture decision: parallel component tree, not a flag on DebatePageClient

**Costed, both options (packet §4's explicit ask):**

- **Reuse `DebatePageClient.tsx` behind an `isPublic`/`readOnly` flag.**
  MEASURED (own Explore-agent survey, cross-checked by my own reads of
  `DebatePageGate.tsx` and `apps/ui/app/debate/[id]/page.tsx`): grepping
  `DebatePageClient.tsx` for `isOwner|isPublic|ownerOnly|readOnly|publicMode`
  returns zero matches — there is no existing seam. The component is
  wrapped unconditionally by `<AuthGate>` in `DebatePageGate.tsx:27`
  ("with a valid stored token it is invisible" — i.e. it never renders
  without a session), and internally calls `getDebateBundle(id,
  COOKIE_SESSION_MARKER, ...)` (`DebatePageClient.tsx:416`),
  `validateSession()` (`530-547`), `contractClient.readEvents`/
  `streamEvents` (`576-620`) — all cookie-authenticated, asker-scoped
  (`apps/ui/lib/api.ts:30-36` docstring). Making this component
  public-safe would mean auditing and gating every one of these call
  sites plus `PublicationControl` (mounted unconditionally at
  `DebatePageClient.tsx:1454-1457`, no ownership check at the call site —
  it self-authenticates via step-up) inside a single 1906-line file. A
  single inverted flag check is an easy, hard-to-review mutation to
  introduce and a hard one for a single verification command to catch
  with confidence across ~20 call sites. **Cost: HIGH review risk, MEDIUM
  line count.**
- **Parallel component tree, reusing only the already-pure presentational
  leaves.** MEASURED (own reads): `DebateThread`, `DebateSplit`,
  `DebateMap`, `DebateCanvas` (`apps/ui/components/`) take generic
  `root`/`onOpenNode`/`onChallengeNode` props with **zero** internal
  `contractClient`/`fetch`/`token` references (grepped, zero matches in
  all four files except `NodeDetailDrawer.tsx`, which nullably takes
  `token: string | null` and already has a graceful `!token` branch at
  line 128 and line 305 — "Unlock actions to view generation history").
  These can be mounted from a NEW, small public-only parent with
  compile-time-guaranteed absence of any mutation import (TypeScript
  cannot let a component read a field that was never imported). **Cost:
  MORE new files, but each is small, single-purpose, and the "no leaked
  mutation" property is a grep/import check, not a runtime-flag audit.**

**Decision: parallel component tree.** Recorded in DECISIONS.md. The
"same view components, same look" part of parity is delivered by literally
importing the same `DebateThread`/`DebateSplit`/`DebateMap`/`DebateCanvas`/
`NodeDetailDrawer` files — there is no visual drift risk, only the
data-fetching and mutation-affordance layers differ.

## Load-bearing structural fact: the tree adapter's real parameter needs 9 fields, not just nodes/edges

**MEASURED, own reads of `apps/ui/lib/v3/adapter.ts`:** `debateDetailFromAnswer`
(line 218) and the `projectGraph`/`synthesisFromAnswer`/`contractNodesById`
helpers it calls dereference exactly these `Answer` fields (grepped
`answer\.\w` across the whole file, cross-checked by reading lines 85-270):
`nodes`, `edges`, `condition_mark_records` (line 117, decorative only —
annotates HIDDEN-* nodes, tree still builds correctly if empty),
`answer_id` (used only as a synthetic id string, e.g.
`debate_id: answer.answer_id` — not rendered as text, not the forbidden
identity carrier's actual value), `answer_version`, `question_line`,
`terminal`, `composed_text`, `serve_state`.

Of these 9, `PublicDebate["answer"]` (post-S01) has only `nodes`, `edges`,
`terminal` under the SAME names — `question_line` doesn't exist under
`.answer` at all (the question text lives at the top-level
`PublicDebateSchema.question`), `composed_text` doesn't exist (the public
schema has the narrower but structurally-identical `summary_segments:
{text: string}[]`), and `answer_id`/`answer_version`/`serve_state`/
`condition_mark_records` don't exist on the public schema at all (three by
Architecture decision, one — `answer_id` — because it is explicitly
forbidden by SPEC S01 R2).

**Two ways to bridge this, costed:**
- **Cast a shim object to `Answer` (`as Answer`).** Cheapest to write,
  but LIES to the type checker: if a future edit to `adapter.ts` reads a
  10th field from `answer`, the cast silently hands it `undefined` at
  runtime with no compile error. **Cost: LOW now, unbounded later.**
- **Narrow the four functions' parameter type from `Answer` to an
  explicit `Pick<Answer, "nodes" | "edges" | "condition_mark_records" |
  "answer_id" | "answer_version" | "question_line" | "terminal" |
  "composed_text" | "serve_state">` (name it `TreeProjectableAnswer`,
  defined once near the top of `adapter.ts`).** `Answer` structurally
  satisfies a `Pick` of itself, so the OWNER call site
  (`debateDetailFromAnswer(answer)` where `answer: Answer`) needs zero
  change. A future edit that reads a 10th field inside these functions
  now fails `pnpm run typecheck` at the FUNCTION BODY (property does not
  exist on `TreeProjectableAnswer`) until the Pick list and both call
  sites are updated consciously. **Cost: one signature edit + one new
  type alias, zero owner-behavior change, and the safety property is
  enforced by the compiler, not by discipline.**

**Decision: narrow the signature (`TreeProjectableAnswer`).** Recorded in
DECISIONS.md. This is the load-bearing fact that would otherwise cost a
coding seat a debugging cycle discovering, mid-implementation, that the
"obvious" cast silently produces a tree with broken synthetic ids or a
runtime `undefined.map` crash inside `synthesisFromAnswer` the first time
`composed_text` is read on a shimmed object that forgot it.

## Clusters

| Cluster | Steps | ONE verification command | File surface |
|---|---|---|---|
| S02-C1 | S02-C1-1..5 (**REWORK ROUND 1, N2, `t_bc19eccb`**: corrected from "1..3" — steps 4 and 5 exist in this cluster's own step bodies, under the R2/R9 trace headings below; the cluster ID, not the SPEC trace section, is what determines membership) | `pnpm exec vitest run tests/render/pda-s02-public-page.test.tsx` | `apps/ui/app/public/debate/[id]/page.tsx`, new `PublicDebatePageClient.tsx` |
| S02-C2 | S02-C2-1..6 | `pnpm run typecheck && pnpm exec vitest run tests/render/pda-s02-public-tree.test.tsx` | `apps/ui/lib/v3/adapter.ts`, `apps/ui/components/DebateThread.tsx`, `DebateSplit.tsx`, `DebateCanvas.tsx`, `NodeDetailDrawer.tsx`, `PublicDebatePageClient.tsx` |
| S02-C3 | S02-C3-1..5 | `pnpm exec vitest run tests/render/pda-s02-honesty-export.test.tsx` | new `PublicHonestyDrawer.tsx`, new `apps/ui/lib/v3/publicAnswerExport.ts`, `apps/ui/components/PublicAnswerDisclosure.tsx` |
| S02-C4 | S02-C4-1..2 | `pnpm exec vitest run tests/render/pda-s02-scoring-chrome.test.tsx` | `apps/ui/app/debate/[id]/DebatePageClient.tsx` (export only), `PublicDebatePageClient.tsx` |
| S02-C5 | S02-C5-1..2 | `grep -rn "PublicationControl\|regenerateNode\|unlinkMemory\|recordInvestigation\|ChallengePopover\|InvestigationDrawer" apps/ui/app/public/debate/` | `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` |
| S02-C6 (**REWORK ROUND 1, N1, `t_575435c7`**, new) | S02-C6-1..2 | `pnpm exec vitest run tests/unit/pda-s02-affordance-drift.test.ts` | new `tests/unit/pda-s02-affordance-drift.test.ts` (read-only regression against `DebatePageClient.tsx` and `AnswerHonestyDrawer.tsx`, no production-code edit) |

**REWORK ROUND 4 (PLAN-03, blocking, `t_71699495`): every command above RUN,
not just edited.** `--reporter=basic` (`vitest 4.1.10` removed it — own
reproduction: `npx vitest run tests/unit/s8-publication.test.ts
--reporter=basic` → `Startup Error: Failed to load custom Reporter from
basic`, exit 1) was present on all 6 rows in round 0 and is stripped above.
**Unlike S01, none of S02's cluster commands needed a further fix**: every
`-t`-filter-and-multi-file defect class checked for in S01 does not apply
here, because every S02 cluster command targets exactly ONE file with no
name filter — there is no argument for vitest to silently drop and no
`-t` pattern that can vacuously match zero tests. Confirmed by actually
running each one (2026-08-29):

| Cluster | Category | Observed pre-fix result |
|---|---|---|
| S02-C1 | FEATURE-ASSERTION | **RED, genuinely:** `pnpm exec vitest run tests/render/pda-s02-public-page.test.tsx` → exit 1, `No test files found, exiting with code 1`. Single-file target, no vacuous-pass risk. |
| S02-C2 | FEATURE-ASSERTION | **RED, genuinely:** `pnpm run typecheck && pnpm exec vitest run tests/render/pda-s02-public-tree.test.tsx` → exit 1 (typecheck passes today since no S02 code exists to break it; the `&&` proceeds to vitest, which fails the same way as S02-C1 — single missing file, no filter). |
| S02-C3 | FEATURE-ASSERTION | **RED, genuinely:** same "No test files found" shape, exit 1. |
| S02-C4 | FEATURE-ASSERTION | **RED, genuinely:** same shape, exit 1. |
| S02-C5 | VERIFICATION-ONLY (Change: none on its constituent step) | **GREEN, correctly, and must stay GREEN:** `grep -rn "PublicationControl\|regenerateNode\|unlinkMemory\|recordInvestigation\|ChallengePopover\|InvestigationDrawer" apps/ui/app/public/debate/` → no output, exit 1 (grep convention: 1 = no match = the desired state). Not vacuous: this directory exists today (`page.tsx` only) and genuinely contains none of the forbidden imports; the check will keep discriminating once `PublicDebatePageClient.tsx` is added, since a real accidental import would produce real grep output. |
| S02-C6 | FEATURE-ASSERTION | **RED, genuinely:** same "No test files found" shape, exit 1. |

**ACCEPTANCE-COMMAND THREAD, ROUND 2 (PLAN-04, blocking, `t_eade6007`):
checked, no fix needed here.** Round 2's finding is that a LIVE-PIPED
`cmd | grep -q ...` guard can mask a crash in `cmd` (grep's exit status,
not the upstream command's) and can even EPIPE-crash the upstream writer
mid-run. **S02 has zero `| grep -q` occurrences** — every S02 command
above is a bare single-file vitest invocation, a bare `typecheck`, or a
bare `grep`/`curl` with its own exit code, never piped into a second
process whose exit status would replace the first's. Re-run 2026-08-29 to
confirm nothing changed: `pnpm exec vitest run
tests/render/pda-s02-public-page.test.tsx` → exit 1, `No test files
found, exiting with code 1` — same result as round 4, unaffected by this
round's fix because there was nothing to fix.

## SPEC trace — R1 Anonymous open works without an account

**SPEC:** S02 R1 · **Cluster:** S02-C1

### S02-C1-1 — Rewrite the public page as a server-fetch + client-shell split

**Cluster:** S02-C1
**File surface:** MODIFY `apps/ui/app/public/debate/[id]/page.tsx`; CREATE
`apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
**Change:** `page.tsx` keeps its existing server-side fetch
(`createServerContractClient().readPublicDebate(id)`, `notFound()` on
throw — unchanged, already anonymous per `serverApi.ts` called with zero
session args) but instead of rendering markup inline, passes the fetched
`debate: PublicDebate` as a prop to a new `"use client"` component
`PublicDebatePageClient`, which owns all interactive UI (view toggles,
drawers). This mirrors the owner's split (`page.tsx` → `DebatePageGate` →
`DebatePageClient`) minus the `AuthGate`/token layer, which this route
deliberately omits.
**Acceptance test:** logged-out browser (or `curl -sk
'https://localhost:3000/public/debate/d89b38a4-f188-4840-94bd-a2dece92f275'`)
returns HTTP 200 with the debate's question text in the body.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly.** Run 2026-08-29 against the live dev
server: `curl -sk -o /dev/null -w "%{http_code}" 'https://localhost:3000/public/debate/d89b38a4-f188-4840-94bd-a2dece92f275'`
→ `200`; body is 46241 bytes with `<title>Dialectical Engine</title>`
present, confirming substantive content, not an empty shell. This is
TODAY's pre-refactor `page.tsx` (inline markup, before C1-1 splits it) —
the baseline this step's refactor must not break, not a validation of the
new split component (which does not exist yet).
**Failure it CATCHES:** a route that starts requiring a session cookie
(a regression back toward the owner pattern) — the acceptance test is a
literal anonymous HTTP call, no cookie jar.
**Failure it MISSES:** does not catch a slow/hanging fetch (no timeout
assertion) — out of scope, matches existing `dynamic = "force-dynamic"`
behavior.

### S02-C1-2 — `notFound()` path unchanged, tested

**Cluster:** S02-C1
**File surface:** `apps/ui/app/public/debate/[id]/page.tsx`
**Change:** none (regression-only step — confirm the existing `try {
readPublicDebate } catch { notFound() }` block is untouched by C1-1's
refactor).
**Acceptance test:** `grep -n "notFound()" apps/ui/app/public/debate/\[id\]/page.tsx`
returns exactly one match.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly.** Run 2026-08-29: exit 0, 1 match
(`notFound();` at line 14 of today's page.tsx) — must survive C1-1's
refactor unchanged.
**Failure it CATCHES:** an accidental removal of the not-found guard
during the C1-1 refactor, which would turn an absent/unpublished id into
an unhandled server error instead of a 404.
**Failure it MISSES:** does not catch the WRONG http status being
returned by Next's `notFound()` helper itself — that is framework
behavior, out of this PLAN's control.

### S02-C1-3 — Regression: existing HTTP contract test for the public detail route still passes

**Cluster:** S02-C1
**File surface:** `tests/unit/s8-publication-http.test.ts` (no edit
expected)
**Change:** none.
**Acceptance test:** `pnpm exec vitest run tests/unit/s8-publication-http.test.ts`
exits 0.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly.** Run 2026-08-29: exit 0, 4/4 passed.
No `-t` filter, no missing-file argument — no vacuous-pass risk.
**Failure it CATCHES:** any S01/S02 change that alters the API-level
404-for-absent-ref behavior this page depends on.
**Failure it MISSES:** UI-level regressions — this test only covers the
API layer, not `page.tsx`/`PublicDebatePageClient.tsx`.

## SPEC trace — R2 Verdict and answer body remain visible

**SPEC:** S02 R2 · **Cluster:** S02-C1

### S02-C1-4 — `PublicDebatePageClient` renders question/pseudonym/date/verdict/confidence/summary/badges/residual/reversal at least at parity with today's page

**Cluster:** S02-C1
**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
**Change:** Port the existing markup from today's
`apps/ui/app/public/debate/[id]/page.tsx` (lines 16-32, quoted in full in
ARCH-01's own investigation — author pseudonym, question, published date,
`PublicAnswerDisclosure`, verdict heading, confidence, summary segments,
badges section, residual objections section, reversal-point section) into
the new client component verbatim as the base layer, THEN add the view
toggle / tree / honesty / export / scoring affordances from the other
clusters around it. Nothing existing is removed.
**Acceptance test:** new file `tests/render/pda-s02-public-page.test.tsx`,
following the existing pattern in `tests/render/s5-session-controls.test.tsx`
(own read, lines 3-9, 75): `import { act } from "react"; import {
createRoot } from "react-dom/client";` — no `@testing-library/react`
dependency exists in this codebase, confirmed by this being the only
render-testing pattern found under `tests/render/`. Mount
`PublicDebatePageClient` into a detached DOM container via
`createRoot(container).render(...)` inside `act(async () => {...})`, with
a fixture `PublicDebate` (verdict present, 2 badges, 1 residual
objection), and assert `container.textContent` contains the question
text, the pseudonym, the verdict string, both badge strings, and the
residual-objection string.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
covered by cluster S02-C1's own verification command (see Clusters
section); observed pre-fix RED there (file does not exist).**
**Failure it CATCHES:** any of R2's named surfaces silently regressing
during the C1-1 restructuring (e.g. badges section accidentally dropped
when the markup moved files).
**Failure it MISSES:** does not catch a CSS/visual regression (text
present but unreadable) — out of scope for a render-only test.

## SPEC trace — R3 Argument tree READ parity

**SPEC:** S02 R3 · **Cluster:** S02-C2 · **Depends on:** S01 R1 tree in
envelope

### S02-C2-1 — Narrow `adapter.ts`'s tree-building signature to `TreeProjectableAnswer`

**Cluster:** S02-C2
**File surface:** `apps/ui/lib/v3/adapter.ts`
**Change:** Near the top of the file (after the existing imports),
define:
```ts
type TreeProjectableAnswer = Pick<Answer,
  "nodes" | "edges" | "condition_mark_records" | "answer_id"
  | "answer_version" | "question_line" | "terminal" | "composed_text"
  | "serve_state">;
```
Change the parameter type of `debateDetailFromAnswer`, `projectGraph`, and
`synthesisFromAnswer` from `answer: Answer` to `answer:
TreeProjectableAnswer` (`contractNodesById`'s parameter can also narrow to
`Pick<Answer, "nodes">` since it only reads `.nodes`). Do not change
either function's body.
**Acceptance test:** `pnpm run typecheck` exits 0 (proves every existing
OWNER call site, which passes a real `Answer`, still satisfies the
narrower type with zero call-site edits — Pick-of-self is always
assignable).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly.** Run 2026-08-29: `pnpm run typecheck`
exits 0 today (nothing to narrow yet, so nothing to break) and must stay
0 once `TreeProjectableAnswer` is introduced — this is the SAME command
that will catch the drift this step names below, not a separate check.
**Failure it CATCHES:** exactly the drift risk named in the "load-bearing
structural fact" section above — a later edit inside these functions that
reads a 10th `answer.*` field now fails `typecheck` at the function body,
not silently at runtime on the public path.
**Failure it MISSES:** does not catch a field being read with the WRONG
type inside the Pick (e.g. treating `answer_version` as a string) — normal
typecheck coverage handles that regardless of this step.

### S02-C2-2 — Build the public tree-projection shim and mount the view-toggle UI

**Cluster:** S02-C2
**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
**Change:** Inside the component, when `debate.answer.tree_included ===
true` (post-S01 signal), build:
```ts
const projectable: TreeProjectableAnswer = {
  nodes: debate.answer.nodes ?? [],
  edges: debate.answer.edges ?? [],
  condition_mark_records: [],
  answer_id: debate.public_ref,
  answer_version: 1,
  question_line: debate.question,
  terminal: debate.answer.terminal,
  composed_text: debate.answer.summary_segments,
  serve_state: debate.answer.terminal === "COMPONENTS_ONLY" ? "COMPONENTS_ONLY" : "COMPOSED"
};
const detail = debateDetailFromAnswer(projectable);
const nodesById = contractNodesById({ nodes: debate.answer.nodes ?? [] });
```
(both imported from `@/lib/v3/adapter`), then port `DebatePageClient.tsx`'s
view-mode state (`type DebateView = "thread" | "split" | "tree" | "map"`,
`useState<DebateView>("tree")`, the four-button toggle group at
`DebatePageClient.tsx:1077-1092`, and the render ternary at `1265-1329`)
verbatim, substituting `detail.tree` for `debate.tree` and mounting
`DebateThread`/`DebateSplit`/`DebateMap`/`DebateCanvas` exactly as the
owner page does, `onOpenNode` wired to open a `NodeDetailDrawer`, and
`onChallengeNode` **omitted** (see S02-C2-4/5).
**Acceptance test:** new file `tests/render/pda-s02-public-tree.test.tsx`
renders `PublicDebatePageClient` with a fixture `PublicDebate` whose
`answer.nodes`/`.edges`/`.tree_included` are populated (≥3 nodes, ≥2
edges, `tree_included: true`), asserts all four view-toggle buttons are
present with `aria-pressed`, clicking each one changes which view
component's test-id/root marker is in the DOM, and at least one node's
`claim` text from the fixture is visible.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
covered by cluster S02-C2's own verification command (see Clusters
section); observed pre-fix RED there (file does not exist).**
**Failure it CATCHES:** a mis-wired shim (e.g. swapping `nodes`/`edges`)
that would produce an empty or malformed tree despite non-empty input —
caught by asserting the fixture's actual claim text renders.
**Failure it MISSES:** does not catch the DebateCanvas's pan/zoom/drag
interaction working correctly — render tests don't exercise canvas
gesture handling; that is unchanged shared code already covered (or not)
by the owner flow's own existing test coverage, out of this PLAN's scope
to re-verify.

### S02-C2-3 — When `tree_included !== true` (legacy publication), show no tree UI at all

**Cluster:** S02-C2
**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
**Change:** Gate the entire view-toggle-and-tree block behind
`debate.answer.tree_included === true`. When false/undefined, render
`PublicAnswerDisclosure`'s legacy-notice branch (S02-C3-5) instead of any
view toggle, node card, or tree.
**Acceptance test:** `tests/render/pda-s02-public-tree.test.tsx` (same file
as C2-2, additional `it()`) renders with a fixture where
`tree_included` is `undefined` and `nodes`/`edges` are `undefined`, and
asserts NONE of the four view-toggle buttons (`aria-pressed`) are present
in the DOM.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
same file/command as S02-C2-2 above (see Clusters section, S02-C2);
observed pre-fix RED there (file does not exist).**
**Failure it CATCHES:** a tree UI that renders an EMPTY tree (misleading —
"zero arguments" reads as a real but weak debate) instead of correctly
recognizing "no tree data at all" — directly implements S02's acceptance
sketch item 3 ("does not pretend a tree exists").
**Failure it MISSES:** does not catch `tree_included === true` with
genuinely empty `nodes`/`edges` arrays (a possible but currently
theoretical case — no real debate produces zero nodes) rendering an
empty-but-present tree UI; that combination is unreachable under today's
`publish()` since a served answer always has ≥1 node, so it is
UNVERIFIED rather than tested.

### S02-C2-4 — Make `onChallengeNode` optional on `DebateThread`/`DebateSplit`/`DebateCanvas`, gate the trigger element

**Cluster:** S02-C2
**File surface:** `apps/ui/components/DebateThread.tsx` (prop type at
line 12, call site at line 217), `apps/ui/components/DebateSplit.tsx`
(prop type at line 13, call sites at lines 141/333), `apps/ui/components/DebateCanvas.tsx`
(prop type at line 57, call site at line 454)
**Change:** In each file's `*Callbacks` type, change
`onChallengeNode: (node: DebateNode, anchor: HTMLElement) => void;` to
`onChallengeNode?: (node: DebateNode, anchor: HTMLElement) => void;`. At
each call site (the click handler that currently unconditionally invokes
`onChallengeNode(node, event.currentTarget)`), wrap the DOM element that
triggers it (the worker locates the exact challenge-trigger element at
each cited line — a click handler on selected text or a button, per the
grep evidence) so it is not rendered at all when `onChallengeNode` is
`undefined`, rather than rendered-but-inert. The owner call site
(`DebatePageClient.tsx`) continues passing a real `onChallengeNode`
unconditionally — zero behavior change there.
**Acceptance test:** new render test asserts that mounting each of
`DebateThread`/`DebateSplit`/`DebateCanvas` WITHOUT an `onChallengeNode`
prop produces DOM output containing no element with an
onClick handler that would call it — concretely, `aria-label` or visible
text `"Challenge"` (matching the owner's `⚐ Challenge` button copy pattern
from `NodeDetailDrawer.tsx:259`) is absent from the rendered output.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
covered by cluster S02-C2's own verification command (see Clusters
section); observed pre-fix RED there.**
**Failure it CATCHES:** exactly what SPEC S02 R7 forbids — "not merely
disabled-looking" — a mutation trigger present-but-inert in the DOM is a
FAIL for R7, and this test asserts absence, not merely non-function.
**Failure it MISSES:** does not catch a challenge trigger reachable via a
non-obvious interaction this test didn't simulate (e.g. a keyboard
shortcut bound at a higher level) — UNVERIFIED beyond the DOM-presence
check; no such shortcut was found in this investigation but the search
was not exhaustive across all three files' full contents.

### S02-C2-5 — Make `onChallenge` optional on `NodeDetailDrawer`, gate its Challenge button

**Cluster:** S02-C2
**File surface:** `apps/ui/components/NodeDetailDrawer.tsx:108`
(prop type), `:253-260` (the `⚐ Challenge` button)
**Change:** Change `onChallenge: (anchor: HTMLElement, text: string) =>
void;` to `onChallenge?: (...)`. Wrap the `<button className="btn
btnChallenge" onClick={(event) => onChallenge(event.currentTarget, "")}>
⚐ Challenge</button>` block (lines 253-260) in `{onChallenge ? (...) :
null}`. The already-hard-disabled `↻ Regenerate` button (lines 261-269,
`disabled` unconditionally, `V3_MISSING_CAPABILITIES.nodeRegeneration`)
needs no change — it is inert product-wide today, owner and public alike,
confirmed by its unconditional `disabled` attribute (own read).
**Acceptance test:** render test mounts `NodeDetailDrawer` without an
`onChallenge` prop and asserts no element with text `"⚐ Challenge"` is
present; a second assertion mounts it WITH `onChallenge` (matching today's
owner usage) and asserts the button IS present — proving the change is
additive, not a removal of owner functionality.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
covered by cluster S02-C2's own verification command (see Clusters
section); observed pre-fix RED there.**
**Failure it CATCHES:** same class as S02-C2-4, scoped to the node-detail
drawer specifically (SPEC R7's "challenge/investigation recording that
mutates server state" clause).
**Failure it MISSES:** does not catch the "Regenerate" button ever being
un-disabled in a future product change without a corresponding public-page
audit — flagged here as a DEAD-END-AVOIDANCE note for future sessions:
Regenerate is safe TODAY only because it is globally disabled, not because
of anything this PLAN adds.

### S02-C2-6 — `PublicDebatePageClient` passes `token={null}` and omits scoring props to `NodeDetailDrawer`

**Cluster:** S02-C2
**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
**Change:** Mount `NodeDetailDrawer` with `node={<tree node from
detail.tree>}`, `v3={nodesById.get(node.id)}`, `token={null}`, `onChallenge`
omitted (per C2-5), `scoring`/`scoringError`/`feedbackSummary`/
`currentUserFeedback`/`lifecycleDecision` all omitted (all optional per
`NodeDetailDrawer.tsx:100-105`), `onFocusRecommendationNode={() =>
false}`, `canFocusRecommendationNode={() => false}` (both required,
non-optional per the read signature — public page has no recommendation
graph to focus into, so these are honest no-ops returning `false`, not
fabricated success), `onQueued`/`onError`/`onAuthRejected` as no-op
functions (required but never invoked, since no token-gated action is
reachable from this page).
**Acceptance test:** `pnpm run typecheck` exits 0 for
`PublicDebatePageClient.tsx` (proves every required prop is actually
supplied with a compatible type — TypeScript itself is the acceptance
mechanism here, since `NodeDetailDrawer`'s prop list is otherwise
unchanged).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly.** Run 2026-08-29: `pnpm run typecheck`
exits 0 today (`PublicDebatePageClient.tsx` does not exist yet, so
there is nothing to fail this check — once created, a missing required
prop makes this same command fail by construction).
**Failure it CATCHES:** a missing required prop (compile error) — cheaper
than a runtime crash on first node-card open.
**Failure it MISSES:** does not catch `token={null}`'s "Unlock actions to
view generation history" fallback text (`NodeDetailDrawer.tsx:306`)
actually rendering correctly for a public visitor — covered instead by
S02-C2-2's render test opening a node card, if the worker extends that
test's assertions to include this text; flagged as a step the worker
should fold into C2-2's test rather than a wholly separate one (kept as a
FAILURE MISSES note here so it is not silently dropped).

## SPEC trace — R4 Honesty drawer

**SPEC:** S02 R4 · **Cluster:** S02-C3

### S02-C3-1 — New `PublicHonestyDrawer` component, typed strictly against the public schema

**Cluster:** S02-C3
**File surface:** CREATE `apps/ui/components/PublicHonestyDrawer.tsx`
**Change:** New component, prop `answer: PublicDebate["answer"]`
(imported type, post-S01). Sections, each rendering ONLY fields that
exist on this type:
- Answer state: `terminal`, `as_of` (formatted date).
- Verdict: `verdict`, `verdict_available`, `confidence_band`.
- Badges (conditional on `badges.length > 0`).
- Residual objections (conditional).
- What could reverse this: `reversal_point`.
Plus explicit typed-absence lines (plain text, no interactive control),
one per owner-only section this drawer deliberately omits: "Risk tier:
not included in this public snapshot.", "Cost envelope: not included in
this public snapshot.", "Memory disclosure: not applicable to public
snapshots.", "Execution ledger digest: not included in this public
snapshot — see Export for what is included.", "Authorized inspection:
owner-only, not available on the public page." This directly implements
SPEC R4's "must not imply ledger/inspection data is present when it is
not" — the drawer's own prop TYPE makes it structurally impossible to
reference any field these lines describe as absent (they are not on
`PublicDebate["answer"]` at all, so a future edit cannot accidentally
wire one up without first widening the public schema in a new SPEC
version — enforced by the type checker, not by review vigilance).
**Acceptance test:** new file `tests/render/pda-s02-honesty-export.test.tsx`
renders `PublicHonestyDrawer` with a fixture `PublicDebate["answer"]` and
asserts the rendered text contains "not included in this public snapshot"
at least twice (ledger digest + cost envelope) and contains the fixture's
`reversal_point` text.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
covered by cluster S02-C3's own verification command (see Clusters
section); observed pre-fix RED there (file does not exist).**
**Failure it CATCHES:** a future edit that tries to smuggle a forbidden
field into this drawer — fails at `pnpm run typecheck` before it fails
any test, since the prop type forbids it.
**Failure it MISSES:** does not catch WORDING regressions (e.g. copy that
implies presence without using the word "included") — a human/reviewer
judgment call on copy honesty, not mechanically checkable beyond the
literal string assertions above.

### S02-C3-2 — Wire the honesty trigger button into `PublicDebatePageClient`

**Cluster:** S02-C3
**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
**Change:** Add a button labeled for honesty (matching the owner's
existing pattern at `DebatePageClient.tsx:1121-1125`, `aria-label`/visible
text referencing "Honesty"), `onClick` sets `honestyOpen` state to `true`;
render `<PublicHonestyDrawer answer={debate.answer} />` when open, with a
close control.
**Acceptance test:** `tests/render/pda-s02-honesty-export.test.tsx`
(additional `it()`) renders `PublicDebatePageClient` with a fixture,
simulates a click on the honesty-labeled button, and asserts the
drawer's `reversal_point` text becomes visible in the DOM.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
same file/command as S02-C3-1 above (see Clusters section, S02-C3);
observed pre-fix RED there.**
**Failure it CATCHES:** the trigger existing but not actually opening the
drawer (a wiring bug, distinct from C3-1's content-correctness test).
**Failure it MISSES:** does not catch a second, hidden honesty-drawer
trigger elsewhere on the page that duplicates or conflicts with this one
— not applicable here since this is a new page with exactly one trigger
by construction.

## SPEC trace — R5 Export (public-envelope honesty)

**SPEC:** S02 R5 · **Cluster:** S02-C3

### S02-C3-3 — New `buildPublicAnswerExport`, no ledger-digest dependency

**Cluster:** S02-C3
**File surface:** CREATE `apps/ui/lib/v3/publicAnswerExport.ts`
**Change:** Pure function `buildPublicAnswerExport(debate: PublicDebate):
{ available: true; href: string; filename: string }`. Always returns
`available: true` (never a withheld/pending state — SPEC R5: "Owner-only
ledger digest dependency is not required for the public export to be
offered"). Packages `{ public_ref: debate.public_ref, question:
debate.question, author_pseudonym: debate.author_pseudonym, published_at:
debate.published_at, answer: debate.answer }` into a
`data:application/json;charset=utf-8,...` URI via
`encodeURIComponent(JSON.stringify(..., null, 2))`, mirroring
`apps/ui/lib/v3/answerExport.ts:75-91`'s existing encoding pattern (own
read) but with none of that function's withheld-reason branches, since
none apply here.
**Acceptance test:** new test decodes the returned `href`'s data URI and
asserts the parsed JSON's `answer.reversal_point` matches the fixture
input, and that the JSON does NOT contain any of the keys
`execution_ledger_digest`, `memory_disclosure`, `cost_envelope`,
`tier_provenance_ref`, `ledger_digest_handle`, `inspection_handle` (grep
the decoded JSON string for each).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
new test, no existing file to run yet (`apps/ui/lib/v3/publicAnswerExport.ts`
does not exist) — RED by construction, same as this cluster's own
verification command (see Clusters section, S02-C3).**
**Failure it CATCHES:** an export that accidentally spreads the WHOLE
`debate` object (which would be harmless today since `PublicDebate` has
no forbidden fields, but would silently start leaking if the public
schema is ever misused as a staging ground for owner data) — the negative
key-absence assertions catch that class even though today's schema alone
already prevents it.
**Failure it MISSES:** does not catch the download actually saving with
the correct filename in a real browser (jsdom/test-render environments
don't exercise the OS save-file dialog) — UNVERIFIED at the automated-test
layer, would need a real-browser check.

### S02-C3-4 — Wire the export button into `PublicDebatePageClient`

**Cluster:** S02-C3
**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
**Change:** Add an `<a href={exported.href} download={exported.filename}>
Export</a>` element, always rendered (never gated on a "pending" state,
per C3-3's `available: true` always).
**Acceptance test:** `tests/render/pda-s02-honesty-export.test.tsx`
(additional `it()`) renders `PublicDebatePageClient` and asserts an
element with `download` attribute and `href` starting
`data:application/json` is present in the DOM without any prior user
interaction (i.e. it does not wait on a pending network call — proving
R5's "not required" independence from any owner-only endpoint).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
same file/command as S02-C3-1 above (see Clusters section, S02-C3);
observed pre-fix RED there.**
**Failure it CATCHES:** an export button that renders in a perpetual
loading/pending state (the bug pattern `buildAnswerExport`'s
`LEDGER_DIGEST_PENDING` branch would produce if accidentally reused) —
this test's "present immediately, no interaction" assertion catches
exactly that regression.
**Failure it MISSES:** does not catch the exported file's content being
STALE relative to a since-updated publication — publications are
immutable snapshots (S01 ground truth), so staleness is not a reachable
bug class here.

### S02-C3-5 — Legacy-publication disclosure, additive to `PublicAnswerDisclosure`

**Cluster:** S02-C3
**File surface:** MODIFY `apps/ui/components/PublicAnswerDisclosure.tsx`
(12 lines today)
**Change:** Add one more conditional paragraph, gated on
`answer.tree_included !== true`: "This publication predates argument-tree
publishing; only the answer summary is available." Placed after the
existing "Verdict unavailable in this published serving mode" conditional
(line 7-9), before the "Evidence as of" line.
**Acceptance test:** `tests/render/pda-s02-honesty-export.test.tsx`
(additional `it()`) renders `PublicAnswerDisclosure` with a fixture where
`tree_included` is `undefined`, asserts the new sentence is present; a
second render with `tree_included: true` asserts it is ABSENT.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
same file/command as S02-C3-1 above (see Clusters section, S02-C3);
observed pre-fix RED there.**
**Failure it CATCHES:** exactly S02's acceptance sketch item 3 ("Answer-
only legacy publication... shows the disclosure and does not pretend a
tree exists") — this is the concrete, mechanically-checkable
implementation of that sketch line.
**Failure it MISSES:** does not catch the ONE real legacy publication
(`d89b38a4-...`) actually rendering this correctly end-to-end against the
live database — that is a manual/QA-level confirmation, not covered by a
component-level render test using a fixture.

## SPEC trace — R6 Scoring diagnostics (typed-absence parity)

**SPEC:** S02 R6 (v2) · **Cluster:** S02-C4 · **Zero new scoring plumbing**
(REV01-N2 / `t_68386dd8`, independently reconfirmed by this seat's own
read of `apps/ui/lib/api.ts:184-191` — `getDebateScoring` is
`Promise.resolve(scoringUnavailable(id))`, no network call, callable
identically from any component regardless of auth state).

### S02-C4-1 — Export `ScoringDiagnosticsDrawer` from `DebatePageClient.tsx`

**Cluster:** S02-C4
**File surface:** `apps/ui/app/debate/[id]/DebatePageClient.tsx:1645`
**Change:** One-word change: `function ScoringDiagnosticsDrawer({` →
`export function ScoringDiagnosticsDrawer({`. Also export whatever local
types its props reference (`ScoringAsyncState`, `ScoringRefreshState`) if
they are not already exported — worker confirms with `grep -n
"type ScoringAsyncState\|type ScoringRefreshState"
apps/ui/app/debate/\[id\]/DebatePageClient.tsx` and adds `export` to
each if missing. Zero other change to this file.
**Acceptance test:** `grep -c "^export function ScoringDiagnosticsDrawer"
apps/ui/app/debate/\[id\]/DebatePageClient.tsx` returns `1`; `pnpm run
typecheck` exits 0 (confirms the owner file's own usage of this now-exported
function, unchanged at its call site, still compiles).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED (grep half), correctly.** Run 2026-08-29:
`grep -c "^export function ScoringDiagnosticsDrawer" apps/ui/app/debate/\[id\]/DebatePageClient.tsx`
→ `0` (not yet exported); `pnpm run typecheck` → exit 0 (GREEN, nothing
broken yet — the owner file's existing usage still compiles unchanged).
The step's overall pass condition is genuinely RED today because the
grep half requires `1` and observes `0`.
**Failure it CATCHES:** a copy-paste duplication of this ~60-line
component into the public tree instead of reusing it (a DRY violation
that would let the two copies drift on future scoring-field changes) —
this step exists specifically to make duplication unnecessary.
**Failure it MISSES:** does not catch the owner behavior changing as a
side effect of the export (impossible here — `export` does not alter
runtime behavior — but flagged since the packet asks every step to name
what it misses, not just what it catches).

### S02-C4-2 — Mount the scoring "i" control and drawer in `PublicDebatePageClient`

**Cluster:** S02-C4
**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
**Change:** Add the same `aria-label="Open scoring diagnostics"` button
pattern as `DebatePageClient.tsx:1093-1106`, calling `getDebateScoring(id)`
(imported from `@/lib/api`, unchanged) in a `useEffect`, and rendering the
now-exported `<ScoringDiagnosticsDrawer scoringState={...}
refreshState={...} onClose={...} />` with the same typed-unavailable
state the owner sees.
**Acceptance test:** `tests/render/pda-s02-scoring-chrome.test.tsx` renders
`PublicDebatePageClient`, clicks the scoring "i" control, and asserts the
drawer opens and its rendered rows contain the same "not exposed by
scoring API" / unavailable-status copy the owner drawer shows (assert by
matching the literal string, since the underlying data source —
`scoringUnavailable(id)` — is identical for both callers by construction).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
covered by cluster S02-C4's own verification command (see Clusters
section); observed pre-fix RED there (file does not exist).**
**Failure it CATCHES:** a public page that fabricates a DIFFERENT
unavailability message than the owner sees (a parity violation SPEC R6
explicitly forbids: "the only correct parity behavior is the same DR-115
typed unavailability the owner already sees").
**Failure it MISSES:** does not catch a future backend scoring route
being added without a corresponding SPEC version bump — SPEC R6 already
requires a new SPEC version before promising live scores; this test would
need updating at that time regardless.

## SPEC trace — R7 Mutations absent (anonymous)

**SPEC:** S02 R7 · **Cluster:** S02-C5

### S02-C5-1 — Grep-verified absence of every forbidden control's import

**Cluster:** S02-C5
**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`,
`apps/ui/app/public/debate/[id]/page.tsx`
**Change:** none (verification-only step; C2-4/C2-5/C5-2 already ensure
this by construction — this step is the explicit, standalone proof).
**Acceptance test:** `grep -rn "PublicationControl\|regenerateNode\|unlinkMemory\|recordInvestigation\|ChallengePopover\|InvestigationDrawer" apps/ui/app/public/debate/`
returns no output (exit 1).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): VERIFICATION-ONLY —
observed pre-fix GREEN, correctly (same result as this cluster's own
command; see Clusters section, S02-C5).**
**Failure it CATCHES:** literally every control SPEC R7 names
(delete/unpublish/replay-generation lives inside `PublicationControl`;
challenge/investigation-recording lives inside `ChallengePopover`/
`InvestigationDrawer`/`recordInvestigation`; memory-unlink is
`unlinkMemory`) being imported anywhere under the public route — a single
grep, matching the cluster table's ONE-command requirement exactly.
**Failure it MISSES:** does not catch a mutation control reintroduced
under an alias import (`import { unlinkMemory as detachMemory }`) — a
determined evasion of this literal grep; Grok's review is expected to
probe exactly this, per packet §5's "expect it to probe for a step it
cannot mechanically verify" — flagged here rather than hidden.

### S02-C5-2 — Regression: signed-in non-owner sees the identical public component tree

**Cluster:** S02-C5, also traces R8 below
**File surface:** `apps/ui/app/public/debate/[id]/page.tsx`
**Change:** none beyond C1-1 (the route is not conditioned on session
state at all — this step is the explicit confirmation that it stays that
way).
**Acceptance test:** `grep -n "cookies()\|USER_TOKEN_COOKIE" apps/ui/app/public/debate/\[id\]/page.tsx`
returns no match (the public page never reads the session cookie, so a
signed-in visitor and an anonymous one receive byte-identical server
output).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly.** Run 2026-08-29: no match, exit 1 —
today's page.tsx never reads the session cookie, and must stay that way.
**Failure it CATCHES:** a future edit that starts branching on session
state for this route — the exact "owner mutations... not smuggled onto
the public route" risk SPEC R8 names, caught here at its cheapest possible
detection point (the route never even looks at who is asking).
**Failure it MISSES:** does not catch a mutation smuggled in via a
DIFFERENT signal than the session cookie (e.g. a query param) — no such
signal exists in this PLAN's design, but flagged as the general class
Grok should probe.

## SPEC trace — R8 Logged-in non-owner visitors get the same READ surface

**SPEC:** S02 R8 · **Cluster:** S02-C5 · **Steps:** S02-C5-2 above (the
route's session-blindness is the single mechanism that satisfies both R7
and R8 simultaneously — there is no separate "non-owner" code path to
test, by design).

## SPEC trace — R9 Disclosure of publication limits remains

**SPEC:** S02 R9 · **Cluster:** S02-C1

### S02-C1-5 — `PublicAnswerDisclosure` stays mounted unconditionally

**Cluster:** S02-C1
**File surface:** `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
**Change:** none beyond C1-4 (which already ports the existing
`<PublicAnswerDisclosure answer={debate.answer} />` mount verbatim).
**Acceptance test:** `tests/render/pda-s02-public-page.test.tsx` (from
C1-4) asserts the rendered output contains "may be indexed by search
engines" (the existing disclosure copy, `PublicAnswerDisclosure.tsx:5`).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
same file/command as S02-C1-4 above (see Clusters section, S02-C1);
observed pre-fix RED there.**
**Failure it CATCHES:** the disclosure being dropped during the C1-1
file-split refactor.
**Failure it MISSES:** nothing beyond C3-5's own coverage of the new
legacy-specific sentence — this step only re-confirms the PRE-EXISTING
sentence survives.

## SPEC trace — anti-drift for the parallel component tree (REWORK ROUND 1, N1, `t_575435c7`)

**Not a new SPEC requirement — a new cluster covering a gap in HOW the
existing R1-R9 requirements stay true over time.** Round 0 chose a
parallel component tree over reusing `DebatePageClient.tsx` behind a flag
(see the dedicated cost analysis above) specifically to make "no leaked
mutation" a compile-time/grep fact. That decision has a cost the review
correctly named: the OWNER page and the PUBLIC page are now two separate
top-level components that must independently stay in affordance parity —
nothing in round 0's plan FAILS when a future owner-side change (a new
button, a new drawer section, a new view mode) has no public-side
counterpart. Shared leaf components (`DebateThread`/`DebateSplit`/
`DebateCanvas`/`NodeDetailDrawer`) cannot drift from themselves — they are
literally the same file — but the ORCHESTRATION around them
(`DebatePageClient.tsx` vs `PublicDebatePageClient.tsx`) can.

### S02-C6-1 — Pin the owner page's affordance inventory as an explicit, countable list

**Cluster:** S02-C6 (new)
**File surface:** new `tests/unit/pda-s02-affordance-drift.test.ts`
**Change:** Write a test that reads `apps/ui/app/debate/[id]/DebatePageClient.tsx`'s
source text and asserts an EXPLICIT, hand-enumerated list of every
top-bar/overflow-menu interactive-element string is present, each with a
one-line comment stating whether it is a READ affordance (must have a
public-side counterpart) or a MUTATION (must NOT): view-toggle group
(`role="group" aria-label="View"`, 4 buttons), `aria-label="Open scoring
diagnostics"`, the honesty trigger (`setHonestyOpen`), the export trigger
(`answerExport.href`), `↻ Replay` (`setReplayNonce` — MUTATION, owner-only),
`⚐ Challenge` (via `onChallengeNode`/`onChallenge` — MUTATION, owner-only,
already gated absent on the public side per S02-C2-4/5), and
`<PublicationControl>` (MUTATION, owner-only). This list is the worker's
own count at implementation time — worker confirms it against the actual
file rather than trusting this PLAN's memory of exact line numbers, since
`DebatePageClient.tsx` may have shifted lines since ARCH-01's round-0/1
reads.
**Acceptance test:** the new test file passes, AND additionally asserts a
PINNED total count of top-bar + overflow-menu interactive elements in
`DebatePageClient.tsx` (worker fills in the exact number after counting)
— e.g. `expect(interactiveElementCount).toBe(N)`, not `toBeGreaterThanOrEqual`.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
covered by cluster S02-C6's own verification command (see Clusters
section); observed pre-fix RED there (file does not exist).**
**Failure it CATCHES:** a future owner-side change that adds an Nth+1
interactive element WITHOUT the developer noticing this test exists — the
exact-count assertion (not a range or a minimum) forces a build failure
the moment the count changes, at which point the developer must (a)
update the pinned number and (b) — because the enumerated-list assertion
right next to it is what the diff review will show — consciously classify
the new element as READ or MUTATION and, if READ, is prompted to check
whether `PublicDebatePageClient.tsx` needs the same addition. The test
does not AUTOMATE the public-side addition (that would require redesigning
this as a shared manifest both files import from, out of scope for a
rework-round fix); it makes silent drift IMPOSSIBLE rather than automatic
repair.
**Failure it MISSES:** does not catch drift in the OTHER direction — a
public-side affordance added that has no owner-side counterpart (a
smaller risk, since the public page is the newer, smaller surface being
actively built FROM the owner's list in this same mission, not evolving
independently yet) — and does not catch a CONTENT change to an existing
affordance (e.g. the honesty drawer gaining a new SECTION without a new
top-level button) — see S02-C6-2 for that narrower, honesty-drawer-specific
case.

### S02-C6-2 — Pin `AnswerHonestyDrawer`'s section count so a new owner section is a visible, not silent, event

**Cluster:** S02-C6
**File surface:** `tests/unit/pda-s02-affordance-drift.test.ts` (same
file, second `it()`)
**Change:** Write a test asserting a PINNED count of `<section
className="wsSection">` occurrences in `apps/ui/components/AnswerHonestyDrawer.tsx`
(21 sections, own count from this seat's round-0 Explore-agent survey —
worker re-confirms this exact number before pinning it, since the file may
have moved since that survey) alongside a comment listing each section by
name and whether `PublicHonestyDrawer.tsx` (S02-C3-1) renders it, omits it
with an explicit typed-absence line, or N/A (owner-only field, e.g.
Execution ledger digest — S02-C3-1 already lists this out explicitly).
**Acceptance test:** the section-count assertion passes at implementation
time; if `AnswerHonestyDrawer.tsx`'s section count ever changes, this test
fails, forcing the same conscious classification `PublicHonestyDrawer.tsx`
already went through once (S02-C3-1) to happen again for the new section
rather than silently leaving it unaddressed on the public side.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
same file/command as S02-C6-1 above (see Clusters section, S02-C6);
observed pre-fix RED there.**
**Failure it CATCHES:** exactly the review's stated risk — "nothing that
fails when they diverge," now scoped concretely to the ONE component
(`AnswerHonestyDrawer.tsx`) whose content this mission most carefully
audited field-by-field (S02-C3-1's typed-absence design), and which is
therefore the highest-value place for a silent future addition to go
unnoticed.
**Failure it MISSES:** a section that is ADDED AND REMOVED in the same
change (net-zero count) would not trip this test — an adversarial,
unlikely case, named here rather than silently assumed away.

## Boundaries / ADRs

- **No ADR filed for S02.** The parallel-component-tree decision and the
  `TreeProjectableAnswer` narrowing are both mission-local, recorded in
  DECISIONS.md — neither introduces a new dependency or a cross-mission
  protocol.
- Reuse-vs-parallel-tree cost analysis: see the dedicated section above.
- Export mechanism: new pure function, no owner ledger-digest dependency
  — see S02-C3-3.
- Scoring: DR-115 typed absence only, zero new plumbing — see S02-C4.
- **`web/` twin: S02 does not touch `web/` at all.** `web/`'s SPEC ground
  truth section never mentions `web/`; own read of
  `web/app/debate/[id]/DebatePageClient.tsx` (159 lines) confirms it has
  no view-toggle, no honesty drawer, no scoring-diagnostics chrome — only
  a single `DebateCanvas` (a DIFFERENT, older component under
  `web/components/`, not `apps/ui/components/DebateCanvas.tsx`), a node
  detail drawer, and an export requiring `ledgerDigest`. There is nothing
  on `web/`'s OWNER side for its public side to achieve parity WITH, so
  S02's parity mandate does not reach `web/` by its own Intent language
  ("the same READ affordances the owner sees on THEIR OWN debate page").
  The one standing constraint on `web/`'s public page
  (`tests/architecture/s8-publication-contract.test.ts:168-174`) checks
  only `readPublicDebate(id)`/`PublicAnswerDisclosure` presence and
  forbidden-string absence — S02 changes neither `web/app/public/debate/[id]/page.tsx`
  nor anything it depends on, so that test needs no edit for S02.

## Single-writer check

S02 touches: `apps/ui/app/public/debate/[id]/page.tsx` (MODIFY),
`apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` (NEW),
`apps/ui/lib/v3/adapter.ts` (MODIFY, signature-only), `apps/ui/components/DebateThread.tsx`,
`DebateSplit.tsx`, `DebateCanvas.tsx`, `NodeDetailDrawer.tsx` (all MODIFY,
additive optional-prop only), `apps/ui/components/PublicHonestyDrawer.tsx`
(NEW), `apps/ui/lib/v3/publicAnswerExport.ts` (NEW),
`apps/ui/components/PublicAnswerDisclosure.tsx` (MODIFY), `apps/ui/app/debate/[id]/DebatePageClient.tsx`
(MODIFY, `export` keyword only, two lines). **Verified (own grep) S03's
only file-surface claim is `apps/ui/app/page.tsx` — disjoint from every
path above.** S04 touches only
`tests/architecture/s8-publication-contract.test.ts` lines 120-138 and a
new QA verdict path — disjoint. S01 touches `packages/contract/src/index.ts`
and `apps/api/**` — disjoint (S02 only READS the contract's generated
types, never writes them). **S02 is hard-blocked on S01-C1 and S01-C2**
(cannot type `PublicDebate["answer"].nodes` or receive real tree data
until the schema and publish path are widened) but is NOT blocked by S03
or S04, and does not block them either.
