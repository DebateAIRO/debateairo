# DDD-00B: UX/Frontend Language Map & Validation Precheck

**Ticket:** t_7569987d  
**Agent:** Claude  
**Lane:** DDD-00B — UX/frontend DDD language and validation precheck  
**Status:** READY FOR HERMES REVIEW  
**Created:** 2026-06-28  

---

## Purpose

This document is the frontend/UX precheck for the DebateAI DDD refactor. It maps every surface where the current UI says "Node", "Generation", or "Score" and proposes the new DDD vocabulary (`ArgumentClaim`, `InvestigationPath`, etc.). It feeds directly into:

- **t_934dc78c** (DDD-06A): Frontend `ArgumentClaimView` model and language helpers
- **t_5f57131f** (DDD-06B): Visible abandoned/stopped path UX
- **t_201e1698** (DDD-10): Frontend/API DTO convergence

---

## 1. DDD Vocabulary Reference

| Current term | DDD term | Notes |
|---|---|---|
| `Node` / `DebateNode` | `ArgumentClaim` | Every node is a claim that can be argued |
| `Generation` | `ClaimGeneration` | One LLM-produced version of an ArgumentClaim's argument text |
| `node_id` | `argumentClaimId` | Primary identifier |
| `generation_id` | `claimGenerationId` | FK to a specific generated version |
| `active_generation` | `activeGeneration` | No rename needed for the concept; name the *relationship* clearly |
| `ExplorationPath` / `materialized_path` | `InvestigationPath` | The root→leaf path through the ArgumentClaim tree |
| `Score` / `NodeScore` | `ArgumentScore` | Scoring separate from tree structure |
| `status: "stale"` | `status: "abandoned"` | Explicit domain word for an inactive/stopped path |
| `status: "pending"` | `status: "pending"` | No change — still valid while queued |
| `ExplorationPolicy` | `ExplorationPolicy` | No rename; policy governs path continuation |
| `node_type: "ROOT_CLAIM"` | `claimType: "ROOT_CLAIM"` | field name changes; value labels may remain |

---

## 2. UI Language Surface Map

### 2.1 User-visible text (UI_LABEL)

These are strings a user can read. They must be updated to DDD vocabulary when the refactor ships. Priority: **HIGH** for labels the user reads, **MEDIUM** for aria-labels, **LOW** for dev-only labels.

| File | Line(s) | Current text | Proposed DDD text | Priority |
|---|---|---|---|---|
| `web/components/DebateCanvas.tsx` | 224 | `"Root claim"` (nodeEyebrow) | `"Root claim"` — **keep**; "claim" is already DDD-correct | — |
| `web/components/DebateCanvas.tsx` | 239–244 | `"No strong argument found."` | `"No argument generated for this claim."` | MEDIUM |
| `web/components/DebateCanvas.tsx` | 277 | CSS class `nodePending` | rename to `claimPending` (CSS only, not user-visible) | LOW |
| `web/components/DebateCanvas.tsx` | 282 | CSS class `nodeClaim streaming` | rename to `argumentText streaming` | LOW |
| `web/components/DebateTree.tsx` | 21–28 | `nodeLabel()` → "Root", "Pro", "Con", "Scientific POV" | Keep value labels; rename the function to `claimTypeLabel()` | MEDIUM |
| `web/components/DebateTree.tsx` | 134 | `"Queued"` (pending status text) | `"Queued"` — **keep** | — |
| `web/components/DebateTree.tsx` | 169 | `{node.status}` shown as badge | Must translate `"stale"` → `"Abandoned"`, `"pending"` → `"Queued"`, `"generating"` → `"Generating"` | HIGH |
| `web/components/DebateTree.tsx` | 197 | `"Expand/Collapse child arguments for: ${node.claim}"` | `"Expand/Collapse child claims for: ${claim.text}"` | MEDIUM |
| `web/components/DebateTree.tsx` | 209 | `"Regenerate argument: ${node.claim}"` | `"Re-generate argument for claim: ${claim.text}"` | MEDIUM |
| `web/components/DebateTree.tsx` | 217 | `"Show/Hide generation history for argument: ${node.claim}"` | `"Show/Hide generation history for: ${claim.text}"` | MEDIUM |
| `web/components/DebateTree.tsx` | 231 | `"No generations yet."` | `"No argument generated yet."` | MEDIUM |
| `web/components/NodeDetailDrawer.tsx` | 163 | `"Argument"` (nodeEyebrow) | `"Argument"` — **keep** (DDD-correct) | — |
| `web/components/NodeDetailDrawer.tsx` | 203 | `"Generation history"` | `"Generation history"` — keep for now; consider `"Argument versions"` in later pass | LOW |
| `web/components/NodeDetailDrawer.tsx` | 236 | `"Unlock actions to view generation history."` | `"Unlock to view argument versions."` | LOW |
| `web/components/DebateOutline.tsx` | 29 | `"Root claim"` | **keep** — already correct | — |
| `web/components/DebateOutline.tsx` | 71 | `"No strong argument found."` | `"No argument generated for this claim."` | MEDIUM |
| `web/components/ArgumentFocusView.tsx` | 62 | `"Debate topic"` (argumentFocusEyebrow) | `"Debate topic"` — **keep** | — |
| `web/components/ArgumentFocusView.tsx` | 66 | `"Argument path"` | `"Investigation path"` | HIGH |
| `web/components/ArgumentFocusView.tsx` | 74 | `"Select path argument ${index+1}: ${node.claim}"` | `"Select claim ${index+1} on investigation path: ${claim.text}"` | HIGH |
| `web/components/ArgumentFocusView.tsx` | 93 | `"Parent context"` / `"Root context"` | **keep** — semantically fine | — |
| `web/components/DebatePageClient.tsx` | 525 | `"Node generation failed"` | `"Argument generation failed"` | HIGH |
| `web/components/DebatePageClient.tsx` | 1265–1267 | `"Score-aware navigation filters"` / `"Score-aware navigation"` | **keep** — scoring is already DDD-correct terminology | — |
| `web/components/DebatePageClient.tsx` | 1622 | `node {compactNodeId(item.node_id)}` | `claim {compactId(item.argumentClaimId)}` | MEDIUM |
| `web/components/GuideModal.tsx` | 7 | `"Live generation"` | `"Live argument generation"` | LOW |
| `web/components/GuideModal.tsx` | 28 | `"Open any node for its generation history..."` | `"Open any claim to see its argument versions..."` | LOW |

### 2.2 Type names (TYPE_NAME)

These are TypeScript types. They are internal but pervasive. A rename here cascades to all imports.

| Current type | Proposed DDD name | Files affected | Risk |
|---|---|---|---|
| `DebateNode` | `ArgumentClaim` | All components, lib/ — 15+ files | **HIGH** — must be a single coordinated rename |
| `Generation` | `ClaimGeneration` | DebateTree, NodeDetailDrawer, DebatePageClient, api.ts | MEDIUM |
| `NodeScoringPayload` | `ArgumentScoringPayload` | lib/types.ts + DebatePageClient, DebateCanvas, DebateOutline | MEDIUM |
| `NodeScoringError` | `ArgumentScoringError` | lib/types.ts + components | LOW |
| `DebateScoringResponse` | `DebateScoringResponse` | **keep** — debate-scoped, not node-scoped | — |
| `NodeScore` | `ArgumentScore` | lib/types.ts | LOW |
| `PlacedNode` (debatePresentation.ts) | `PlacedClaim` | lib/debatePresentation.ts only | LOW |

### 2.3 Prop/parameter names (PROP_NAME)

These are React props and TS function signatures. Lower user impact but high rename surface.

| Current name | DDD name | File(s) | Notes |
|---|---|---|---|
| `node: DebateNode` | `claim: ArgumentClaim` | All components | Cascades with TYPE_NAME rename |
| `nodeId: string` | `claimId: string` | All components | All event handlers |
| `onOpenNode` | `onOpenClaim` | DebatePageClient, DebateCanvas | |
| `onChallengeNode` | `onChallengeClaim` | DebatePageClient, DebateCanvas | |
| `onRegenNode` | `onRegenClaim` | DebatePageClient, DebateCanvas | |
| `onToggleExpand(nodeId)` | `onToggleExpand(claimId)` | DebatePageClient, DebateCanvas | |
| `onSelectNode` | `onSelectClaim` | ArgumentFocusView, DebateTree | |
| `selectedNodeId` | `selectedClaimId` | DebatePageClient (state) | |
| `detailNodeId` | `detailClaimId` | DebatePageClient (state) | |
| `rootNode` | `rootClaim` | ArgumentFocusView | |
| `selectedNode` | `selectedClaim` | ArgumentFocusView | |
| `selectedPath: DebateNode[]` | `investigationPath: ArgumentClaim[]` | ArgumentFocusView | Explicit DDD name |
| `findNode(root, id)` | `findClaim(root, id)` | DebatePageClient, debateTreeUtils | |
| `findPathToNode(root, id)` | `findInvestigationPath(root, id)` | DebatePageClient | |

### 2.4 API field names (API_FIELD) — backend-locked

These come from the API and **cannot change without backend coordination**. They are listed for the DTO convergence ticket (DDD-10).

| Field | Location | Proposed DDD name | Convergence ticket |
|---|---|---|---|
| `node_id` | All scoring, investigation, adaptive-depth DTOs | `argument_claim_id` | t_201e1698 DDD-10 |
| `node_ids` | `DebateScoringResponse` | `argument_claim_ids` | t_201e1698 DDD-10 |
| `active_generation_id` | `DebateNode` DTO | `active_claim_generation_id` | t_201e1698 DDD-10 |
| `root_node_id` | `DebateBranch`, `DebateDetail` | `root_argument_claim_id` | t_201e1698 DDD-10 |
| `target_node_id` | `RecommendedInvestigation` | `target_claim_id` | t_201e1698 DDD-10 |
| `selected_node_ids` | Adaptive depth approval | `selected_claim_ids` | t_201e1698 DDD-10 |
| `queued_node_ids` | Adaptive depth approval response | `queued_claim_ids` | t_201e1698 DDD-10 |
| `node_type` | `DebateNode` DTO | `claim_type` | t_201e1698 DDD-10 |
| `materialized_path` | `DebateNode` DTO | `investigation_path` | t_201e1698 DDD-10 |
| `status: "stale"` | `Node` entity | `status: "abandoned"` | Requires backend migration + DDD-10 |

---

## 3. Candidate `ArgumentClaimView` Fields

This is the proposed view model for DDD-06A (`t_934dc78c`). It is derived from the current `DebateNode` DTO shape plus scoring and maps every field to a DDD-named equivalent.

```typescript
// Proposed ArgumentClaimView — feed into DDD-06A
type ArgumentClaimView = {
  // Core identity
  id: string;                          // was: node.id
  debateId: string;                    // was: node.debate_id
  parentId: string | null;             // was: node.parent_id
  claimType: ClaimType;                // was: node.node_type ("ROOT_CLAIM" | "PRO" | "CON" | POV...)
  depth: number;                       // unchanged
  position: number;                    // unchanged

  // Content
  claimText: string;                   // was: node.claim — the claim being argued
  activeArgument: ClaimGeneration | null; // was: node.active_generation

  // Path
  investigationPath: string;           // was: node.materialized_path — root→this path string
  children: ArgumentClaimView[];       // recursive

  // Lifecycle
  status: ArgumentClaimStatus;         // was: node.status; values: pending | generating | active | abandoned
  activeGenerationId: string | null;   // was: node.active_generation_id

  // Scoring (optional; from separate scoring response merged in)
  score?: ArgumentScore | null;        // was: node.score
};

type ArgumentClaimStatus = "pending" | "generating" | "active" | "abandoned";
//                                                                ^^^^^^^^^^
//                          was "stale" — DDD doctrine: never silently pruned, must be visible

type ClaimType =
  | "ROOT_CLAIM"
  | "PRO"
  | "CON"
  | "SCIENTIFIC_POV"
  | "STATISTICAL_POV"
  | "ETHICAL_POV"
  | "PRACTICAL_POV";
// Note: value strings may stay the same; only the field name changes (node_type → claimType)

type ClaimGeneration = {
  id: string;                          // was: generation.id
  jobId?: string;                      // was: generation.job_id (streaming only)
  modelId: string;                     // was: generation.model_id
  role: string;                        // unchanged
  argumentText: string;                // was: generation.argument — the generated prose
  workerId: string;                    // was: generation.worker_id
  workerName?: string;                 // was: generation.worker_name
  createdAt: string;                   // unchanged
  isActive?: boolean;                  // was: generation.is_active
  isStreaming?: boolean;               // was: generation.is_streaming (legacy flag; consider removing in DDD-10)
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number;
};
```

### ArgumentClaimView helper functions (for DDD-06A)

These map the current util functions to DDD names:

| Current function | DDD name | File | Returns |
|---|---|---|---|
| `findNodeById(tree, id)` | `findClaimById(tree, id)` | debateTreeUtils.ts | `ArgumentClaim \| null` |
| `findNodePathById(tree, id)` | `findInvestigationPathById(tree, id)` | debateTreeUtils.ts | `ArgumentClaim[]` |
| `partitionArgumentChildren(node)` | `partitionChildClaims(claim)` | debateTreeUtils.ts | `{proClaims, conClaims}` |
| `perspectiveChildren(node)` | `perspectiveChildClaims(claim)` | debateTreeUtils.ts | `ArgumentClaim[]` |
| `initialFocusedNodeId(tree)` | `initialFocusedClaimId(tree)` | debateTreeUtils.ts | `string` |
| `nearestExistingNodeId(tree, id)` | `nearestExistingClaimId(tree, id)` | debateTreeUtils.ts | `string` |
| `roleOf(node)` | `roleOf(claim)` | debatePresentation.ts | role string |
| `roleLabel(node)` | `roleLabel(claim)` | debatePresentation.ts | display string |
| `renderStateOf(node)` | `renderStateOf(claim)` | debatePresentation.ts | render state |
| `layoutTree(root, ...)` | `layoutClaimTree(root, ...)` | debatePresentation.ts | layout |
| `nodeLabel(node)` | `claimTypeLabel(claim)` | DebateTree.tsx | "Pro" / "Con" etc. |

---

## 4. Abandoned / Stopped Path UX Requirements

Per DDD doctrine: **Abandoned paths are collapsed/greyed + summarized + explained, never silently pruned.**

### 4.1 Current state

The current codebase has **partial** support for inactive nodes:

| Mechanism | Current behavior | DDD compliance gap |
|---|---|---|
| `status: "stale"` on Node | Explicitly filtered OUT in scoring queries (`serialization.py`) | **VIOLATION** — stale nodes are invisible to scoring and likely to the UI tree |
| Empty node card | Shows `"No strong argument found."` + `"∅"` symbol + sunken background | Partially correct; no explanation of WHY stopped |
| Connector opacity | Dashed line + opacity 0.45 for pending/streaming connectors | OK for in-progress; needs equivalent for abandoned |
| Score filter greying | Cards at opacity 0.38 when score filter doesn't match | This is a FILTER, not a permanent abandoned state |
| `is_active: bool` on Generation | Distinguishes which generation is canonical | Not surfaced in UI as "abandoned version" |
| No `"abandoned"` status value | `"stale"` is the closest, but filtered out before reaching frontend | **GAP** — frontend never sees `"stale"` nodes |

### 4.2 Required UX behaviors (input to DDD-06B)

1. **Abandoned claims MUST be visible in the tree.** They should not be pruned from the serialized tree. The `status: "stale"` → `status: "abandoned"` rename must be accompanied by removing the filter in `serialization.py` that excludes them.

2. **Abandoned claims MUST be visually distinct:**
   - Greyed-out card (opacity ~0.45, distinct from the score-filter grey of 0.38)
   - Dashed or dimmed connector to parent
   - An "Abandoned" status badge (currently the badge shows raw `node.status` — must translate `"stale"` → `"Abandoned"`)

3. **Abandoned claims MUST show a reason:**
   - The card or drawer must display WHY the path was abandoned (ExplorationPolicy decision reason)
   - Proposed field: `ArgumentClaimView.abandonReason?: string`
   - If no reason is available: show `"Investigation path was stopped."` as fallback

4. **Abandoned claims MUST be collapsible (not expandable by default):**
   - Their children should be collapsed by default
   - A "Show abandoned path" disclosure control must exist
   - Expanding an abandoned subtree is allowed but opt-in

5. **Abandoned claim content MUST still be readable:**
   - The `claimText` and last `activeArgument` text should remain visible even when abandoned
   - Score badges (if scored before abandonment) should remain visible, greyed

6. **ExplorationPolicy, not raw LLM output, owns the abandoned decision:**
   - The frontend must NOT infer abandonment from missing generation; it must read the explicit `status` field
   - If `status === "abandoned"` → show abandoned treatment regardless of whether a generation exists

### 4.3 Absent UX: what the current system doesn't have

| Missing | Gap | Ticket |
|---|---|---|
| Reason field for abandonment | No `abandon_reason` or equivalent on Node/DTO | DDD-06B |
| Summary of abandoned subtree | No collapsed summary view | DDD-06B |
| "Explore anyway" action on abandoned path | No re-activation affordance | Future |
| ExplorationPolicy decision display | Policy decisions not surfaced in UI | Future |

---

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `DebateNode` rename cascades to 15+ files | HIGH | Must be a single atomic PR; use TypeScript type alias as bridge during migration |
| `node_id` API field is in API contract — backend + frontend must rename together | HIGH | Defer API field rename to DDD-10 (t_201e1698); use adapter layer or aliased types temporarily |
| `status: "stale"` nodes filtered out in backend serialization | HIGH | DDD-06B must coordinate with Codex backend work to remove the filter and rename the status value |
| CSS class names (`nodeClaim`, `nodeEyebrow`, `nodePending`) — low priority but scattered | LOW | Separate CSS refactor pass after domain rename |
| `Generation` history panel labeled "Generation history" — user-facing | MEDIUM | Rename to "Argument versions" in a strings pass; not architecturally blocking |
| Score-aware navigation correctly uses "score" language — already DDD-correct | — | No change needed |
| `materialized_path` → `investigationPath` requires both DB column rename and DTO change | MEDIUM | Coordinate with Codex DDD-00A and DDD-10 |
| `is_streaming` flag is a legacy state mechanism — DDD models streaming as a transient status | LOW | Clean up in DDD-10; not blocking for UI refactor |

---

## 6. Files Needing Changes in Subsequent Tickets

### DDD-06A (t_934dc78c) — Frontend ArgumentClaimView model

Files to create/edit:
- `web/lib/types.ts` — add `ArgumentClaim`, `ClaimGeneration`, `ArgumentClaimStatus`, `ArgumentScore` types
- `web/lib/debateTreeUtils.ts` — rename exported functions per §3 helper table
- `web/lib/debatePresentation.ts` — rename `PlacedNode` → `PlacedClaim`, update param types
- `web/lib/scoringResponse.ts` — rename `nodeId` fields in summary types

### DDD-06B (t_5f57131f) — Visible abandoned/stopped path UX

Files to create/edit:
- `web/components/DebateCanvas.tsx` — abandoned card visual treatment
- `web/components/DebateTree.tsx` — status badge translation (`"stale"` → `"Abandoned"`)
- `web/components/ArgumentFocusView.tsx` — abandoned path disclosure control
- `web/components/NodeDetailDrawer.tsx` — show abandon reason if present
- `web/styles/*.css` (or CSS modules) — add `.claimAbandoned` variants

### DDD-10 (t_201e1698) — Frontend/API DTO convergence

Files to create/edit:
- `web/lib/types.ts` — rename API_FIELD-mapped types once backend changes land
- `web/lib/api.ts` — update endpoint paths if `/api/nodes/` → `/api/claims/`
- All components using `node_id` props from API payloads

---

## 7. Collision Check

- This ticket is **docs-only**; no production code was edited.
- Codex DDD-00A (`t_bd637c66`) owns backend domain context docs. This doc (`ddd-00b-ux-language-map.md`) is a **new file** in `docs/ddd/` — no collision.
- All audit work was **read-only** across `web/**` and coordinator files.
- No Codex-owned files were touched.

---

## 8. Verification Checklist

- [x] Doc created at `docs/ddd/ddd-00b-ux-language-map.md`
- [x] UI language map complete (§2): UI_LABEL, TYPE_NAME, PROP_NAME, API_FIELD
- [x] Candidate `ArgumentClaimView` fields documented (§3)
- [x] Helper function rename table complete (§3)
- [x] Abandoned/stopped path UX requirements documented (§4)
- [x] Risks documented (§5)
- [x] File contracts for subsequent tickets identified (§6)
- [x] Collision check: no Codex-owned files touched (§7)
- [x] No production code edits
- [x] No backend implementation
- [x] No migrations
- [x] Not marked Done (Hermes owns Done)
