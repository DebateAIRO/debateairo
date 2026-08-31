# SPEC — T4 New debate

**Version:** v1 (2026-08-31) · **Status:** FROZEN at creation.

**Mission:** `ui-overhaul` · **Design source:** TURN 4.

## Intent

Replace the new-debate form with TURN 4: question field, risk tier, composition
budget tier, tree depth, steering menu/annotations, options panel for V2-only
controls that are **not sent** on V3, and start/cancel — under Terracotta/
Chamber. Matches current local form fields (NewQuestionForm) with new shell.

## Screen inventory

| ID | Region | Notes |
|---|---|---|
| T4-S1 | Chrome | Dialectical Engine / dezbatere.ro / `New debate` / asker chip / mode / settings |
| T4-S2 | Question | `NEW QUESTION` / `What should we debate?` / textarea / helper about tiers then Start |
| T4-S3 | Risk tier | Casual / Standard / High stakes (asker-explicit) |
| T4-S4 | Composition budget tier | Low / Medium / High |
| T4-S5 | Tree depth | numeric depth control (sample `3`) |
| T4-S6 | Steering | menu selections (one per line) + annotations free text |
| T4-S7 | Provenance note | Tier source/provenance/machine as-of recorded automatically |
| T4-S8 | Options panel | Depth mode, depth of scrutiny, branching width, concurrency, max tokens — labeled as V2 controls with **no V3 run-contract slot — not sent** |
| T4-S9 | Actions | `Start run →` / `Cancel` / `⌃↵ to start` |
| T4-S10 | Mode + tokens | Terracotta ↔ Chamber |

## States

1. Default tier selections (ARCH documents defaults matching current product).
2. Options panel expanded/collapsed.
3. Validation: empty question cannot start.
4. Role overrides not user-editable — copy points to Settings.

## Copy (binding excerpts)

- `NEW QUESTION` · `What should we debate?`
- Risk / composition / depth helper lines from design
- Options disclosure: V2 controls have no V3 slot — they are not sent
- `Role overrides are not user-editable — model role assignment lives in Settings →`
- `Start run →` · `Cancel` · `⌃↵ to start`

## Requirements

### R1 — Form regions present

T4-S2…S6 and T4-S9 render for authenticated users on the new-debate route.

### R2 — Risk + budget + depth selectable

Asker can select risk tier, composition budget tier, and tree depth; values are
submitted with the run contract fields the product already uses (ARCH maps
names).

### R3 — Steering captured

Steering menu lines and annotation lines are captured and logged per existing
contract behavior.

### R4 — V2 options not sent

Options panel may display V2 controls for transparency but **must not** send
them on the V3 run contract (design binding). UI states they are not sent.

### R5 — Start / cancel / keyboard

Start run and Cancel exist; Ctrl/Cmd-Enter starts when valid.

### R6 — Mode toggle

Terracotta ↔ Chamber on new-debate.

### R7 — Render pins move

`tests/render/ux01-new-debate-form.test.tsx` (and any sibling pins) move to
NEW UI (**ARCH confirms full pin list**).

## NON-goals

- Inventing new V3 contract fields for V2 options.
- Making role overrides user-editable.
- Anonymous create (T9 OPEN QUESTION).

## OPEN QUESTIONS

1. **CTA label `Start run` vs library `Start debate` (ARCH/V-DECISION):** design
   uses both across turns — unify or keep per-screen strings?
2. **Options panel visibility (ARCH):** keep visible-but-not-sent vs hide V2
   controls entirely — design shows them with not-sent note; SPEC prefers
   **show with not-sent note** unless V says hide.

## Acceptance — V manual (browser)

1. Sign in → New debate. **Expect:** question, risk tiers, budget tiers, depth,
   steering, start/cancel, mode toggle.
2. Expand Options. **Expect:** V2 controls listed with not-sent explanation.
3. Clear question → Start. **Expect:** no run start.
4. Fill question + Start. **Expect:** run creation path succeeds (navigates to
   debate or shows in-progress per product).

## Acceptance — automated

- New-debate render tests assert tier controls + not-sent options copy.
- Test asserts V2 option values are omitted from submitted V3 payload.
- Pin migration; three-run law.
