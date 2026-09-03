# PLAN — T5 Node detail drawer

**Goal:** TURN 5 drawer regions on existing drawer contract.

**Spec:** `slices/T5/SPEC.md` v2

**Status:** ARCHITECTURE FILLED (ARCH-01, 2026-08-31). WHAT/acceptance columns
are Requirements' and unchanged; `HOW` blocks and commands are Architecture's.

**Architecture references:** `docs/missions/ui-overhaul/architecture/` —
`component-map.md` (T5 row, with the field-order ruling),
`ADR-005-contrast-pins.md`, `ADR-006-ui-test-contract.md`, `test-migration.md`.

**Gated on T9-C3 and T1-C1.** C1 and C2 both write `NodeDetailDrawer.tsx` and
are serialised in numeric order.

**The whole slice is a retitle + reorder + re-skin.**
`apps/ui/components/NodeDetailDrawer.tsx` already carries every datum T5 needs;
what is missing is the design's uppercase labels, the design's vertical order,
and two state labels in the history list. No new API, no new scoring call —
T5's own DECISIONS row already ruled that out.

**Field order — closes SPEC OQ-1.** Ship the design's vertical order: header →
claim body → way of knowing → review verdict → scores → replay → restatement →
defeaters → judge disagreement → condition marks → actions → generation
history. No accessibility constraint forces otherwise: the drawer is a single
`role="dialog"` with a linear reading order, and the design's order is already
most-important-first.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T5-C1 — Open + core sections

**Proves:** R1, R2, R3, R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C1-1 | R1 | Details/open control opens drawer for a node | Click `Details ▸` (or ARCH open control); assert drawer/dialog present |
| T5-C1-2 | R2 | Score labels present | Required fixture: node with scores; assert `BASE SCORE` and `FINAL STRENGTH` present |
| T5-C1-3 | R3 | Review verdict line when fixture has cross-review | Required fixture with cross-review; assert `REVIEW AGREED BY:` or `REVIEW DISPUTED BY:` plus model line |
| T5-C1-4 | R3 | No fabricated review line without cross-review | Required fixture without cross-review; assert those labels absent |
| T5-C1-5 | R4 | Replay/Restatement/Defeaters/Judge disagreement labels | Assert `REPLAY`, `RESTATEMENT`, `DEFEATERS`, `JUDGE DISAGREEMENT` present |
| T5-C1-6 | R5 | Condition mark chips from fixture render | Assert ≥1 expected chip text (e.g. `Not falsified` / fixture chip) |

**HOW (ARCH).**

**Modify** `apps/ui/components/NodeDetailDrawer.tsx`. The mapping from what is
there today to what T5 binds — `10 of 10`, so a reviewer can check the sweep
mechanically instead of re-deriving it:

| T5 binding label | Present today as | Change |
|---|---|---|
| `WAY OF KNOWING · …` | `way of knowing`, inside the `drawerFindingList` | retitle + promote out of the list into its own section |
| `REVIEW AGREED BY:` / `REVIEW DISPUTED BY:` + reviewer model line | `second-maker review`, on `<li data-node-review={v3.review?.outcome ?? "absent"}>` | retitle; the copy is new, the datum and the typed-absence marker are not |
| `BASE SCORE` (with source) | score row | retitle |
| `FINAL STRENGTH` (with source) | score row | retitle |
| `REPLAY` | replay handle | retitle |
| `RESTATEMENT` | `stranger restatement` | retitle |
| `DEFEATERS` | `defeaters` | retitle |
| `JUDGE DISAGREEMENT` | `judge disagreement` | retitle |
| condition-mark chips | present | re-skin only |
| `GENERATION HISTORY` / `Compare versions` / `ACTIVE` / `ARCHIVED` | `drawerHistoryHead` + `Compare versions` present; **`ACTIVE`/`ARCHIVED` absent** | add the two state labels (T5-C2-3) |

- `T5-C1-3` / `T5-C1-4` — the review line. `data-node-review` already
  distinguishes `"AGREE"` / `"DISPUTE"` / `"absent"`. The no-fabrication step
  asserts **both** `data-node-review="absent"` **and** the two labels being
  absent — two independent signals, so a coder cannot satisfy it by deleting
  the attribute.
- Colours: `var(--agree-text)` / `var(--dispute-text)`, the text-role tokens,
  because the design's raw `agree` (`#3E7A4E`) measures 4.25 : 1 on `shell`
  (`ADR-005`).
- `T5-C1-1`'s open control is the canvas card's Details control from T1-C2; its
  accessible name is `Details`.
- **Create** `tests/render/t5-drawer.test.tsx` with two `describe` blocks,
  `core sections` (C1) and `actions and history` (C2).

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t5-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pol01-policy.test.ts
```

### T5-C2 — Actions + history + mode

**Proves:** R6, R7, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C2-1 | R6 | Owner drawer shows Challenge and Regenerate | Assert `⚐ Challenge` (or `Challenge`) and `↻ Regenerate` present for owner |
| T5-C2-2 | R6 | publicMode drawer locks mutate controls | Assert Challenge/Regenerate locked or absent on publicMode |
| T5-C2-3 | R7 | Generation history ACTIVE/ARCHIVED when fixture has both | Required multi-version fixture; assert `ACTIVE` and `ARCHIVED` present |
| T5-C2-4 | R8 | Mode toggle meets contrast threshold ARCH pins | Assert mode marker flips; contrast threshold check ARCH pins |

**HOW (ARCH).**

- `⚐ Challenge` and `↻ Regenerate` already exist verbatim in the drawer
  (`btn btnChallenge` and the regenerate button) and are already conditioned on
  `onChallenge` being supplied — which `publicMode` omits. `T5-C2-2` asserts
  absence or `data-public-locked="true"`; re-skin only.
- `T5-C2-3`: add `ACTIVE` and `ARCHIVED` labels to the generation-history
  entries. Required fixture is a node with ≥2 generations.
- `T5-C2-4`: **the drawer does not mount its own toggle.** It renders inside the
  debate document, so T1-C1's chrome toggle already switches it (`ADR-002`).
  The step asserts the drawer's tokens respond — i.e. that flipping
  `data-mode` on `<html>` changes the values the drawer's classes consume — plus
  the contrast floors from `ADR-005`. A drawer that mounts a second toggle is a
  finding: two toggles on one document can disagree.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t5-drawer.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/unit/t9-mode-tokens.test.ts
```

### T5-C3 — Render-pin migration

**Proves:** R9

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C3-1 | R9 | ARCH names drawer/honesty pins under `tests/render/` (e.g. `prov01-honesty-drawer`) | Named list |
| T5-C3-2 | R9 | Named tests pass (three runs) | Three-run vitest on named `tests/render/**` files |

**HOW (ARCH) — the named pin files, `5 of 5`, from `architecture/test-migration.md`.**

| File | Class | What moves |
|---|---|---|
| `tests/render/prov01-honesty-drawer.test.tsx` | KEEP | `Risk tier standard · MACHINE_DEFAULT` — data provenance, not chrome |
| `tests/render/ui02d-model-identity.test.tsx` | KEEP | imports `NodeDetailDrawer`; asserts the `modelDot` class |
| `tests/render/pda-s02-public-tree.test.tsx` | KEEP | imports `NodeDetailDrawer`; asserts `⚐ Challenge` and `Unlock actions to view generation history.` |
| `tests/unit/pol01-policy.test.ts` | **RETARGET** | reads `NodeDetailDrawer.tsx` as source |
| `tests/unit/pda-s02-affordance-drift.test.ts` | **RETARGET** | reads `AnswerHonestyDrawer.tsx` with anchor slicing and `occurrences()` counting |

`AnswerHonestyDrawer.tsx` is **not** in T5's write set — T5 changes
`NodeDetailDrawer.tsx`. `pda-s02-affordance-drift` is in the command anyway
because it reads `DebatePageClient.tsx`, which T1 edits and which hosts this
drawer; running it here is how a cross-cluster break is caught in the cluster
that can still fix it.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/prov01-honesty-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/unit/pol01-policy.test.ts tests/unit/pda-s02-affordance-drift.test.ts
```

## SPEC ↔ PLAN trace (both directions)

| SPEC | Covered by | | Step | Traces to |
|---|---|---|---|---|
| R1 | T5-C1-1 | | T5-C1-1 | R1 |
| R2 | T5-C1-2 | | T5-C1-2 | R2 |
| R3 | T5-C1-3, T5-C1-4 | | T5-C1-3 | R3 |
| R4 | T5-C1-5 | | T5-C1-4 | R3 |
| R5 | T5-C1-6 | | T5-C1-5 | R4 |
| R6 | T5-C2-1, T5-C2-2 | | T5-C1-6 | R5 |
| R7 | T5-C2-3 | | T5-C2-1 | R6 |
| R8 | T5-C2-4 | | T5-C2-2 | R6 |
| R9 | T5-C3-1, T5-C3-2 | | T5-C2-3 | R7 |
| | | | T5-C2-4 | R8 |
| | | | T5-C3-* | R9 |

9 of 9 requirements covered; 12 of 12 steps trace.

## Refutation (ARCH)

| Cluster | Mutant its command detects | Mutant it does NOT detect |
|---|---|---|
| T5-C1 | any binding label left lowercase; a `REVIEW AGREED BY:` line rendered on a node with no cross-review; `data-node-review` deleted to dodge the absence check | a review line that renders the right label with the WRONG reviewer model — the step asserts the label plus *a* model line, not that the model matches the record |
| T5-C2 | Challenge/Regenerate actionable in publicMode; a history list with no `ACTIVE`/`ARCHIVED`; a drawer whose tokens ignore the mode flip; a second toggle mounted in the drawer | a history list that labels the wrong entry `ACTIVE` — presence, not correctness of assignment |
| T5-C3 | `pol01` or `affordance-drift` anchors broken by the drawer edit | a standing file already red before T5 |
