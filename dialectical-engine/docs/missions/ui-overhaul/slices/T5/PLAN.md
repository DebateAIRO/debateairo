# PLAN — T5 Node detail drawer

**Goal:** TURN 5 drawer regions on existing drawer contract.

**Spec:** `slices/T5/SPEC.md` v2

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW.

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

**Cluster verification command (ARCH finalizes):** three runs of T5 drawer core-section tests; worst run is verdict.

### T5-C2 — Actions + history + mode

**Proves:** R6, R7, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C2-1 | R6 | Owner drawer shows Challenge and Regenerate | Assert `⚐ Challenge` (or `Challenge`) and `↻ Regenerate` present for owner |
| T5-C2-2 | R6 | publicMode drawer locks mutate controls | Assert Challenge/Regenerate locked or absent on publicMode |
| T5-C2-3 | R7 | Generation history ACTIVE/ARCHIVED when fixture has both | Required multi-version fixture; assert `ACTIVE` and `ARCHIVED` present |
| T5-C2-4 | R8 | Mode toggle meets contrast threshold ARCH pins | Assert mode marker flips; contrast threshold check ARCH pins |

**Cluster verification command (ARCH finalizes):** three runs of T5 actions/history/mode tests; worst run is verdict.

### T5-C3 — Render-pin migration

**Proves:** R9

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T5-C3-1 | R9 | ARCH names drawer/honesty pins under `tests/render/` (e.g. `prov01-honesty-drawer`) | Named list |
| T5-C3-2 | R9 | Named tests pass (three runs) | Three-run vitest on named `tests/render/**` files |

**Cluster verification command (ARCH finalizes):** three runs of the named `tests/render/**` files; worst run is verdict.
