# PRD: Scoring Must Augment the Debate Tree, Not Replace It

## Status

Drafted by Hermes for Codex execution via Kanban.

## Problem

When scoring is enabled on the debate page, the visible UI becomes dominated by scoring metadata: issue summary, score-aware filters, and Recommended Investigations cards. In the latest screenshot, `Tree` mode is selected, but the actual debate tree/canvas is not visible in the viewport. From a user perspective, enabling scoring makes the core tree workflow feel disabled or replaced.

This fails the product contract. Scoring is valuable only if it helps users navigate, inspect, and improve the debate tree. It must not take over the page.

## User-facing product truth

Scoring should be an intelligence layer over the debate, not a new page mode that hides the debate.

The user should be able to:

1. Open a completed debate.
2. Enable scoring.
3. Still see and use the debate tree as the primary surface.
4. Read at-a-glance STR / UNC / IMP scoring on nodes.
5. Open details for a node score when needed.
6. Access scoring issue summary and recommended investigations without losing the tree.
7. Understand that current scores are model-judged over stored claim/generation text, not retrieval-grounded evidence, and that missing evidence is explicit.

## Current failed behavior

Evidence from V screenshot:

- Browser automation banner at top.
- Debate page header visible.
- Scoring enabled.
- Real scores displayed.
- Score issue summary visible.
- Score-aware navigation visible.
- Recommended Investigations fills nearly the entire viewport.
- `Tree` tab is selected.
- Actual tree/canvas is not visible.
- The user cannot meaningfully use the Tree workflow without first scrolling past scoring UI.

This is not just polish. It is a product failure: scoring displaced the core interaction.

## Product goal

Make scoring mode preserve Tree-first usability.

The debate tree/canvas must remain visible and interactive when scoring is enabled. Scoring panels should become secondary supporting UI: docked, collapsible, side-panelled, tabbed, below a preserved tree viewport, or otherwise non-blocking.

## Non-goals

- Do not implement retrieval-grounded evidence search in this PRD.
- Do not change provider/model scoring semantics.
- Do not fake evidence, fake scores, or scaffold runtime product data.
- Do not delete database data.
- Do not push to remote.
- Do not do a broad visual redesign unrelated to scoring/tree usability.

## Required UX contract

### 1. Tree remains primary

With scoring enabled and `Tree` selected:

- The tree/canvas is visible without scrolling past a wall of scoring panels.
- Node cards remain clickable/readable.
- Challenge / Read / score-chip interactions still work.
- Scoring data augments node cards rather than replacing the tree.

### 2. Scoring overview is secondary

Scoring issue summary, score-aware filters, and recommendations must not occupy the entire initial viewport above the tree.

Acceptable patterns include:

- collapsible scoring insights panel,
- right-side drawer / workspace panel,
- compact top summary with expand controls,
- sticky but small score rail,
- recommendations moved into Workspace or a dedicated insights drawer,
- below-tree section only after preserving the primary tree viewport.

### 3. Recommendations remain accessible

Recommended Investigations still matter, but they should not be a giant wall before the debate tree.

Minimum acceptable behavior:

- a compact summary tells the user how many recommendations exist,
- user can open/expand recommendations intentionally,
- `Open target` still navigates to the relevant node/claim,
- `Start investigation` stays disabled honestly when unavailable.

### 4. Header does not collapse under scoring state

The top bar must remain usable when scoring is enabled:

- scoring status can truncate gracefully,
- Tree / Outline buttons remain visible and clickable,
- Refresh scoring remains understandable,
- Workspace / Export / Help / Settings remain usable,
- no text/control overlap.

### 5. Truth copy remains honest

The UI must not imply retrieval-grounded evidence if evidence was not retrieved.

Required truth copy somewhere visible when scoring is enabled:

- model-assisted reasoning aid, not truth verdict,
- model-judged over available debate text / stored generation text,
- missing evidence is surfaced,
- not retrieval-grounded unless/until an evidence retrieval subsystem is wired.

## Vertical slices for Codex

### Slice A — Tree-first shell layout

Goal: restructure the page so Tree view remains visible and usable when scoring is enabled.

Owned likely files:

- `web/app/debate/[id]/DebatePageClient.tsx`
- `web/app/globals.css`

Acceptance:

- With scoring on, the initial viewport includes the debate tree/canvas area.
- Scoring overview no longer pushes the tree entirely below the fold.
- Tree / Outline switching remains usable.

### Slice B — Scoring insights containment

Goal: make scoring issue summary, filters, and recommendations a contained secondary experience.

Owned likely files:

- `web/components/RecommendedInvestigations.tsx`
- scoring summary/filter components if extracted
- focused CSS/classes
- source tests for component structure

Acceptance:

- Recommendations do not dominate the initial viewport.
- Issue pills wrap/truncate without overlap.
- User can intentionally expand/open scoring insights.

### Slice C — Header/toolbar resilience

Goal: make the header survive scoring state without overlap/cramping.

Owned likely files:

- `web/app/debate/[id]/DebatePageClient.tsx` if toolbar is inline
- `web/app/globals.css`
- possible extracted header/toolbar component if present

Acceptance:

- Status text truncates or wraps safely.
- View controls are always clickable.
- Refresh / scoring toggle / workspace controls remain understandable.

### Slice D — Tree interaction and score-chip regression checks

Goal: prove scoring does not break the actual tree interactions.

Owned likely files:

- frontend source tests / smoke tests under `web/`
- browser QA scripts if present
- no product semantics changes unless a discovered local bug requires it

Acceptance:

- Tree node interaction still works with scoring enabled.
- Score chip opens scoring details/drawer.
- `Open target` from recommendations brings the user to a node without losing tree context.
- Console/network checks are clean for the tested path.

### Slice E — Closure QA gate

Goal: prove the whole scoring-tree UX in browser/API/DB/devtools.

Acceptance:

- V can manually QA the feature.
- Tree is visible/usable with scoring enabled.
- Scoring remains truthful and accessible.
- Real scores still show STR / UNC / IMP.
- Missing evidence remains explicit.
- No fake runtime data.

## Done definition

This work is Done only when all are true:

- Tree mode remains visible and usable with scoring enabled.
- Scoring panels are secondary and do not replace the debate tree.
- Header controls remain usable.
- Real scoring data remains visible and honest.
- Recommendations remain accessible but not page-dominant.
- Browser QA confirms no console/runtime errors for the tested path.
- API/DB evidence still shows real scoring payloads, not fake/scaffolded data.
- V receives and passes a manual QA packet.

## QA environment convention

Use the active QA ports named in the current Kanban/handoff. If multiple dev stacks exist, every QA report must state the exact ports used.

Recent known QA surfaces:

- UI/proxy: `http://127.0.0.1:3010`
- Coordinator API: `http://127.0.0.1:8002`
- Chrome DevTools: `9224`

Do not mix evidence from `3000/8000` with `3010/8002` without saying so explicitly.
