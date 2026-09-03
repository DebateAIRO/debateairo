# PLAN — T4 New debate

**Goal:** TURN 4 new-debate form shell; V2 options not sent.

**Spec:** `slices/T4/SPEC.md` v2

**Status:** ARCHITECTURE FILLED (ARCH-01, 2026-08-31). WHAT/acceptance columns
are Requirements' and unchanged; `HOW` blocks and commands are Architecture's.

**Architecture references:** `docs/missions/ui-overhaul/architecture/` —
`component-map.md` (T4 row), `ADR-002-mode-mechanism.md`, `test-migration.md`.

**Gated on T9-C3 and T3-C1** (the `TopBar` toggle mount). C1, C2 and C3 all
write `apps/ui/app/new/page.tsx` and are serialised in numeric order.

**Frozen surface:** `tests/unit/v2ui-pages.test.ts` is 618 lines of
page-SOURCE wiring guards over `apps/ui/app/new/page.tsx`, protecting DR-180
(risk, budget and depth stay asker-facing while the five machine-owned values
are derived and submitted without controls). T4 changes copy and wrappers; it
does not restructure the submit path. `class="optionsToggle"` with
`aria-expanded` is pinned verbatim by `tests/render/ux01-new-debate-form.test.tsx`
and is **not renamed**.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T4-C1 — Form regions + mode

**Proves:** R1, R2, R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C1-1 | R1 | Question + chrome regions present | Assert `NEW QUESTION` or `What should we debate?` and mode control on new-debate route |
| T4-C1-2 | R2 | Risk, budget, depth selectable | Assert risk labels `Casual`/`Standard`/`High stakes` (or design set), composition `Low`/`Medium`/`High`, and a depth control present |
| T4-C1-3 | R6 | Mode toggle flips Terracotta/Chamber | Assert before/after mode marker differs |

**HOW (ARCH).**

- **Modify** `apps/ui/app/new/page.tsx`: section eyebrow `NEW QUESTION`,
  headline `What should we debate?` above the existing textarea. The
  `.eyebrow` / `.display` classes already exist and already consume tokens.
- Risk tier, composition budget tier and tree depth are existing controls —
  re-skin plus the design's label copy. Their submitted field names are
  unchanged; `v2ui-pages` guards that they stay asker-facing.
- `T4-C1-3`'s mode toggle is the `TopBar` mount from T3-C1. T4 adds no toggle.
  `/new` is wrapped in `AuthGate`, which renders inside the layout, so `TopBar`
  — and therefore the toggle — is present on this route.
- **Create** `tests/render/t4-new-debate.test.tsx` with three `describe` blocks:
  `form regions` (C1), `steering and start` (C2), `v2 options` (C3).

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t4-new-debate.test.tsx tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts
```

### T4-C2 — Steering + start/cancel

**Proves:** R3, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C2-1 | R3 | Steering menu + annotations captured | Assert steering controls present; submit includes steering fields per existing contract (ARCH maps names) |
| T4-C2-2 | R5 | Start/Cancel/keyboard affordances | Assert `Start run →` or closed-label CTA, `Cancel`, and documented ⌃↵ start when valid |
| T4-C2-3 | R5 | Empty question cannot start | Clear question; activate Start; assert no run-create navigation/success |

**HOW (ARCH).**

- Steering menu lines and annotations: existing controls, re-skin. `T4-C2-1`'s
  "submit includes steering fields per existing contract (ARCH maps names)" —
  the mapped names are the ones already sent by the shipped `createDebate`
  call in `apps/ui/lib/api.ts`; this slice adds no field and renames none. The
  assertion is that the submitted payload's steering keys are unchanged from
  the pre-T4 baseline, captured in the worker's RED evidence.
- `T4-C2-2`: `Start run →`, `Cancel`, and the hint `⌃↵ to start`. The CTA label
  stays `Start run →` and is deliberately NOT unified with the library's
  `Start debate →` or the landing's `Start a debate` — three different acts,
  three strings, all three binding in their own SPEC
  (`architecture/open-questions.md` Q-04, routed to V; the default that ships is
  the design's three strings).
- Keyboard: `Ctrl/Cmd + Enter` submits when the question is non-empty. Bind on
  the form, not the document, so the shortcut does not fire from unrelated
  focus.
- `T4-C2-3`: empty question must not start a run — assert no navigation and no
  create call, not merely a disabled attribute, because a disabled button that
  a keyboard shortcut bypasses is the bug this step exists to catch.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t4-new-debate.test.tsx tests/unit/v2ui-pages.test.ts
```

### T4-C3 — V2 options not sent

**Proves:** R4

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C3-1 | R4 | Options panel shows not-sent explanation | Assert copy that V2 controls have no V3 slot / are not sent |
| T4-C3-2 | R4 | V2 option values omitted from V3 payload | Set V2 option values; submit; assert those keys absent from V3 run-contract payload |

**HOW (ARCH).**

- Keep the options panel VISIBLE with the not-sent note, per the design
  artboard and the SPEC's stated preference. Hiding them would remove exactly
  the transparency the design is making a point of
  (`architecture/open-questions.md` Q-05, routed to V; show is the default that
  ships).
- **Modify** `apps/ui/app/new/page.tsx` and `apps/ui/app/new/defaults.tsx`:
  every V2-only control inside `.optionsToggle`'s panel carries
  `data-v2-only="true"` — depth mode, depth of scrutiny, branching width,
  concurrency, max tokens. The attribute is the machine-readable list; the
  copy is the human-readable one, and `T4-C3-2` asserts against the attribute
  so it cannot drift from the prose.
- `T4-C3-2` is a **payload** assertion, not a copy assertion: collect every
  `[data-v2-only="true"]` control's field name, set each to a non-default
  value, submit, and assert the V3 create payload's key set contains **none**
  of them. A test that only asserts the not-sent *sentence* is green while the
  values ship.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t4-new-debate.test.tsx tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts
```

### T4-C4 — Render-pin migration

**Proves:** R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T4-C4-1 | R7 | ARCH names `tests/render/**` pins (e.g. `ux01-new-debate-form`) | Named list under `tests/render/` |
| T4-C4-2 | R7 | Named tests pass (three runs) | Three-run vitest on named files |

**HOW (ARCH) — the named pin files, `2 of 2`, from `architecture/test-migration.md`.**

| File | Class | What moves |
|---|---|---|
| `tests/render/ux01-new-debate-form.test.tsx` | **RETARGET** | pins `<button class="optionsToggle" aria-expanded="false">Options`. The class and the `aria-expanded` contract are FROZEN; the label and the not-sent copy change, and the `data-v2-only` payload assertion is added |
| `tests/unit/v2ui-pages.test.ts` | **RETARGET** | 618 lines of page-source wiring guards over `new/page.tsx` |

`v2ui-pages` is not under `tests/render/**` and so is outside the surface R7's
sentence names — but it reads the file this slice writes, so it is named here
under R7's `ARCH names pins` delegation and carried in every T4 command.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts
```

## SPEC ↔ PLAN trace (both directions)

| SPEC | Covered by | | Step | Traces to |
|---|---|---|---|---|
| R1 | T4-C1-1 | | T4-C1-1 | R1 |
| R2 | T4-C1-2 | | T4-C1-2 | R2 |
| R3 | T4-C2-1 | | T4-C1-3 | R6 |
| R4 | T4-C3-1, T4-C3-2 | | T4-C2-1 | R3 |
| R5 | T4-C2-2, T4-C2-3 | | T4-C2-2 | R5 |
| R6 | T4-C1-3 | | T4-C2-3 | R5 |
| R7 | T4-C4-1, T4-C4-2 | | T4-C3-1 | R4 |
| | | | T4-C3-2 | R4 |
| | | | T4-C4-* | R7 |

7 of 7 requirements covered; 10 of 10 steps trace.

## Refutation (ARCH)

| Cluster | Mutant its command detects | Mutant it does NOT detect |
|---|---|---|
| T4-C1 | a missing tier group; a renamed `optionsToggle`; a `v2ui-pages` source guard broken by restructuring | a tier control that renders three options but submits a fourth, hard-coded value |
| T4-C2 | `Start`/`Cancel` missing; a run starting on an empty question; the ⌃↵ shortcut bypassing validation | a steering annotation captured in the DOM but dropped before submit — the step asserts the payload's steering keys are unchanged, not that a typed annotation reaches them |
| T4-C3 | any `data-v2-only` field appearing in the V3 payload; the not-sent copy removed; a control marked `data-v2-only` that is actually a V3 field | a V3 field that SHOULD be sent and is silently dropped — the assertion is one-directional by design |
| T4-C4 | either standing file going red from the T4 diff | a standing file already red before T4 |
