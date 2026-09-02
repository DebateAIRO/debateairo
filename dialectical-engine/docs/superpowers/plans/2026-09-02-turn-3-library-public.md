# Turn 3 Library and Public Debate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the authenticated library and signed-out public debate match Turn 3 of the coded design document while preserving honest data and functional public navigation.

**Architecture:** Extend the public summary contract with optional authoritative model IDs, enrich the private SSR library rows from bounded asker-owned answer reads without changing the sealed serve contract, derive the presentation data in pure helpers, and add one dedicated public-overview component that DebatePageClient renders only for public Tree. Existing private debate rendering and the public Thread/Split/Map paths remain shared and unchanged.

**Tech Stack:** TypeScript 7, React 19, Next.js 15, Zod 4, Vitest 4, Node test runner, CSS.

**Spec:** `docs/superpowers/specs/2026-09-02-turn-3-library-public-design.md`

## Global Constraints

- Copy Turn 3 geometry, typography, colors, borders, radii, shadows, and spacing from `ui_designs/DebateAI Design Document.html`.
- Never fabricate scores, timestamps, models, reviews, or verdict metrics.
- Public Tree is the verdict-first overview; public Thread, Split, and Map remain functional and read-only.
- Private debate behavior and private Tree rendering remain unchanged.
- Preserve all unrelated dirty-worktree changes.

---

### Task 1: Summary model lineage contract

**Files:**
- Modify: `packages/contract/src/index.ts`
- Modify: `apps/api/src/publications.ts`
- Modify: `apps/ui/lib/serverApi.ts`
- Test: `tests/unit/v2ui-data-layer.test.ts`
- Test: `tests/unit/publications.test.ts` or the existing publication unit test containing list fixtures

**Interfaces:**
- Consumes: `Answer.nodes[].maker_lineage.model_id` and `PublicDebate.answer.nodes[].maker_lineage.model_id`.
- Produces: optional `models: string[]` on `PublicDebateSummarySchema`; `DebateSummary.models` populated for served answers by the private SSR library read.

- [ ] **Step 1: Write failing adapter and publication-list tests**

Add an asker-owned served-answer fixture containing repeated and distinct model lineages and assert the SSR library result contains unique model IDs in first-seen order:

```ts
expect(summaries[0]?.models).toEqual(["gpt-5.6-sol", "claude-opus-5"]);
```

Add a public list test whose decrypted snapshot contains the same model twice and assert:

```ts
expect(result.items[0]?.models).toEqual(["claude-opus-5"]);
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/s8-publication-http.test.ts`

Expected: failure because `models` is absent or remains `[]`.

- [ ] **Step 3: Extend schemas and populate authoritative models**

Add an optional array to the public summary so older published payload fixtures remain valid:

```ts
models: z.array(z.string().trim().min(1)).optional()
```

In the publication list, derive unique IDs from `debate.answer.nodes ?? []`. In `listDebatesPageServer`, hydrate completed private rows through the same authenticated contract client's asker-owned `readAnswer` calls and degrade an individually unavailable lineage read to the existing empty array. This keeps model dots authoritative without changing the sealed serve-contract hash.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/s8-publication-http.test.ts`

Expected: PASS.

### Task 2: Honest public-overview presentation model

**Files:**
- Create: `apps/ui/lib/publicDebatePresentation.ts`
- Create: `apps/ui/lib/publicDebatePresentation.test.mjs`
- Modify: `apps/ui/scripts/node-test-manifest.json`

**Interfaces:**
- Consumes: `PublicDebate`.
- Produces: `buildPublicDebatePresentation(debate)` returning summary text, caveat, counts, meter percentage, and strongest Pro/Con records.

- [ ] **Step 1: Write failing behavior tests**

Use complete `PublicDebate` fixtures and assert independently derived literals:

```ts
assert.deepEqual(view.models, ["gpt-5.6-sol", "claude-opus-5"]);
assert.equal(view.strongestPro?.nodeId, "pro-high");
assert.equal(view.strongestCon?.nodeId, "con-high");
assert.equal(view.metrics.reviewed, "2 / 3");
assert.equal(view.metrics.judged, "3 / 3");
```

Add cases for missing sides, no reviews, null final strengths, and repeated model IDs.

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test lib/publicDebatePresentation.test.mjs`

Expected: module-not-found failure because the helper does not exist.

- [ ] **Step 3: Implement the pure derivation helper**

Classify `support` edges as Pro and `attack`/`defeat` edges as Con. Rank by `final_strength?.value ?? base_score.value`, keep source order on ties, ignore shared-crux edges for the side meter, and return explicit absence for missing sides and unmeasured convergence.

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test lib/publicDebatePresentation.test.mjs`

Expected: PASS.

### Task 3: Turn 3 library rows

**Files:**
- Modify: `apps/ui/components/DebatesBuffer.tsx`
- Modify: `apps/ui/app/globals.css`
- Modify: `apps/ui/components/debateReferenceDesign.source-test.mjs`

**Interfaces:**
- Consumes: `DebateSummary.models` and `PublicDebateSummary.models`.
- Produces: both library tabs with identical Turn 3a row anatomy and complete metadata assembly.

- [ ] **Step 1: Add a failing UI contract test**

Assert public rows pass `debate.models ?? []`, both tabs use the same `LibraryRow`, and library tab font weight is `700`.

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter dialectical-engine-v2ui test`

Expected: failure because public rows currently pass `models={[]}` and inactive tabs are weight `600`.

- [ ] **Step 3: Implement the minimal library changes**

Build metadata with a shared `joinMeta` helper that removes empty parts, pass public models to `LibraryRow`, include the real model count, and align the remaining CSS values with Turn 3a.

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm --filter dialectical-engine-v2ui test`

Expected: PASS.

### Task 4: Turn 3b public verdict-first component

**Files:**
- Create: `apps/ui/components/PublicDebateOverview.tsx`
- Modify: `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
- Modify: `apps/ui/app/debate/[id]/DebatePageClient.tsx`
- Modify: `apps/ui/app/globals.css`
- Modify: `apps/ui/components/debateReferenceDesign.source-test.mjs`

**Interfaces:**
- Consumes: `PublicDebate`, `buildPublicDebatePresentation`, `onDetails`, and `onRead(nodeId)`.
- Produces: `publicOverview?: ReactNode` on DebatePageClient and the Turn 3b public Tree body.

- [ ] **Step 1: Add a failing UI wiring test**

Assert the public page renders `PublicDebateOverview`, DebatePageClient renders it only for `publicMode && view === "tree"`, and the normal Thread/Split/Map condition remains reachable.

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --filter dialectical-engine-v2ui test`

Expected: failure because `PublicDebateOverview` and `publicOverview` do not exist.

- [ ] **Step 3: Implement component and wiring**

Render the verdict bezel, honest metrics, support meter, strongest-side cards, locked challenge buttons, Read callbacks, and encoded login return link. Replace the old `publicationDetails` preamble. In public Tree, render the overview in place of the normal `debateMain`; preserve normal `debateMain` for all other cases.

- [ ] **Step 4: Add the exact Turn 3b CSS**

Use `publicOverview`, `publicVerdictShell`, `publicVerdictCore`, `publicSupportMeter`, `publicArgumentGrid`, and `publicArgumentCard` class families scoped beneath `.debateView[data-public-mode="true"]`. Implement the 960px body, double bezels, 5px meter, responsive card stack, locked controls, and mode-token-compatible colors.

- [ ] **Step 5: Run test to verify GREEN**

Run: `pnpm --filter dialectical-engine-v2ui test`

Expected: PASS.

### Task 5: Integration verification and visual calibration

**Files:**
- Modify only files from Tasks 1-4 if measurement reveals a mismatch.

**Interfaces:**
- Consumes: completed Turn 3 implementation.
- Produces: verified live library and public-debate surfaces.

- [ ] **Step 1: Run focused and repository checks**

Run:

```bash
pnpm --filter dialectical-engine-v2ui test
pnpm vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/s8-publication-http.test.ts
pnpm --filter dialectical-engine-v2ui typecheck
pnpm --filter dialectical-engine-v2ui build
```

Expected: all new tests pass; any known pre-existing failure is recorded with its exact unchanged diagnostic.

- [ ] **Step 2: Restart the full development stack**

Run: `pnpm dev:auth:up`

Expected: HTTPS UI at `https://localhost:3000` and healthy API/data-plane processes.

- [ ] **Step 3: Inspect Turn 3a in both modes**

Capture `/?tab=yours` and `/?tab=public` at desktop and narrow widths. Compare header height, 820px content width, composer bezel, 38px tab gap, 13px rows, model dots, status colors, and metadata rhythm against the coded reference.

- [ ] **Step 4: Inspect Turn 3b and interactions**

Open a real public debate and verify Tree shows the verdict-first overview; Thread, Split, and Map switch views; Details and Read open read-only drawers; Challenge is locked; the login URL contains the public return path.

- [ ] **Step 5: Calibrate and rerun verification**

Apply only measured CSS corrections, then rerun the UI test, focused root tests, typecheck, and build commands from Step 1.
