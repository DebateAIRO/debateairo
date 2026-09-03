# PLAN — T6 Settings — identity & account

**Goal:** TURN 6 settings: identity, sessions, step-up, legacy claim, scheduled delete.

**Spec:** `slices/T6/SPEC.md` v2

**Status:** ARCHITECTURE FILLED (ARCH-01, 2026-08-31). WHAT/acceptance columns
are Requirements' and unchanged; `HOW` blocks and commands are Architecture's.

**Architecture references:** `docs/missions/ui-overhaul/architecture/` —
`component-map.md` (T6 row), `ADR-002-mode-mechanism.md`, `test-migration.md`.

**Gated on T9-C3 and T3-C1.** C1–C3 write different files and may run in
parallel subject to `max_concurrent_heavy`.

**Presentation only.** T6's NON-goals put the cookie/MFA security model, the
seven-day schedule and the step-up policy out of contract. Every security
behaviour asserted below already ships; this slice changes labels, layout and
tokens. `tests/unit/s10-erasure-ui.test.ts` and
`tests/architecture/s9-dev-token-retirement-contract.test.ts` must stay green
without being edited.

**`dezbatere.ro` stays** — it already ships in
`apps/ui/components/TopBar.tsx` (`<span className="brandDomain">`) and the
design draws it on every artboard. Closes SPEC OQ-1
(`architecture/open-questions.md` Q-06, routed to V; keep is what ships).

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T6-C1 — Chrome + identity + mode

**Proves:** R1, R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C1-1 | R1 | Settings chrome + identity panel | Assert `Settings` chrome and identity model line containing `HttpOnly` (or SPEC binding cookie/MFA sentence) |
| T6-C1-2 | R1 | Asker id and scope visible | Assert ASKER/SCOPE (or ARCH-pinned identity fields) present |
| T6-C1-3 | R6 | Mode toggle flips Terracotta/Chamber | Assert before/after mode marker differs |

**HOW (ARCH).**

- **Modify** `apps/ui/app/settings/page.tsx`: add the T6-S2 identity panel —
  eyebrow `IDENTITY`, heading `Your asker scope`, an `ASKER` row carrying the
  asker id already available from `getSettingsView`, a `SCOPE` row, and the
  binding identity-model sentence verbatim:
  `Sessions use server-set HttpOnly cookies and mandatory MFA. Browser scripts never receive the session credential.`
- `T6-C1-3`'s mode toggle is the `TopBar` mount from T3-C1. T6 adds no toggle;
  `/settings` renders inside the layout, so `TopBar` is present.
- **Create** `tests/render/t6-settings.test.tsx` with three `describe` blocks:
  `identity` (C1), `sessions` (C2), `sensitive actions` (C3).

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t6-settings.test.tsx tests/architecture/s9-dev-token-retirement-contract.test.ts
```

### T6-C2 — Sessions list + revoke

**Proves:** R2

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C2-1 | R2 | Current vs other session labeling | Assert a session row labeled current (or SPEC binding) |
| T6-C2-2 | R2 | Revoke affordances present | Assert per-row Revoke and `Revoke all sessions` or `Sign out` controls present |

**HOW (ARCH).**

- **Modify** `apps/ui/components/SessionControls.tsx` — re-skin plus additive
  copy. The strings `Active sessions`, `Current session` and
  `Fresh authentication complete` already ship and are pinned by
  `tests/render/s5-session-controls.test.tsx`; they are **kept verbatim**, and
  the design's device/last-seen columns are added around them.
- Per-row `Revoke`, plus `Revoke all sessions` and `Sign out` — existing
  controls, re-skin.
- Current-vs-other must not be colour-only: the current row carries
  `aria-current="true"` and a text label, so the distinction survives Chamber
  and survives a colour-blind reader.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t6-settings.test.tsx tests/render/s5-session-controls.test.tsx
```

### T6-C3 — Step-up, legacy claim, deletion

**Proves:** R3, R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C3-1 | R3 | Sensitive mutates require fresh password + authenticator | Assert step-up fields present before legacy claim / schedule deletion succeeds |
| T6-C3-2 | R4 | Legacy claim control + not-saved copy | Assert `Claim legacy debates` (or SPEC label) and copy that token is not saved |
| T6-C3-3 | R5 | Typed `DELETE MY ACCOUNT` required | Assert schedule path blocked without exact string `DELETE MY ACCOUNT`; seven-day copy present |

**HOW (ARCH).**

- **Modify** `apps/ui/components/LegacyRunClaimControls.tsx` — re-skin plus the
  design's not-saved paragraph. The existing no-storage assertions
  (`tests/render/s9-legacy-claim-controls.test.tsx` matches
  `/localStorage|sessionStorage|console\./` and expects no hit) must keep
  passing: the token is never written anywhere, and adding a copy line about
  that must not add a place to write it.
- **Modify** `apps/ui/components/AccountErasureControls.tsx` — re-skin plus the
  seven-day paragraphs and the typed confirm. `DELETE MY ACCOUNT` is an exact,
  case-sensitive string comparison; `T6-C3-3` asserts the schedule path is
  blocked without it.
- `T6-C3-1` step-up: the fresh password + authenticator gate already exists in
  `SessionControls`. This step asserts the gate is present *before* the two
  sensitive mutates, and does not re-implement it — T6 NON-goals forbid
  changing the security model.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t6-settings.test.tsx tests/render/s9-legacy-claim-controls.test.tsx tests/unit/s10-erasure-ui.test.ts tests/unit/s10-erasure-ui-render.test.tsx tests/architecture/s9-dev-token-retirement-contract.test.ts
```

### T6-C4 — Render-pin migration

**Proves:** R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T6-C4-1 | R7 | ARCH names settings/session/legacy pins under `tests/render/` | Named list |
| T6-C4-2 | R7 | Named tests pass (three runs) | Three-run vitest on named files |

**HOW (ARCH) — the named pin files, `5 of 5`, from `architecture/test-migration.md`.**

| File | Class | What moves |
|---|---|---|
| `tests/render/s5-session-controls.test.tsx` | **RETARGET** | `Active sessions`, `Current session`, `Fresh authentication complete` survive; the T6-S2 identity line is added. Note this file references **both** `apps/ui` and `web/` — only its `apps/ui` assertions move |
| `tests/render/s9-legacy-claim-controls.test.tsx` | KEEP | not-saved / no-storage assertions; also references `web/`, untouched |
| `tests/unit/s10-erasure-ui.test.ts` | KEEP | reads `apps/ui/lib/api.ts` as source; T6 does not touch it |
| `tests/unit/s10-erasure-ui-render.test.tsx` | KEEP | imports `AccountErasureControls` |
| `tests/architecture/s9-dev-token-retirement-contract.test.ts` | KEEP (verify) | reads `settings/page.tsx` and `LegacyRunClaimControls.tsx` as source — both edited here, so it is in every T6 command |

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/s5-session-controls.test.tsx tests/render/s9-legacy-claim-controls.test.tsx tests/unit/s10-erasure-ui.test.ts tests/unit/s10-erasure-ui-render.test.tsx tests/architecture/s9-dev-token-retirement-contract.test.ts
```

## SPEC ↔ PLAN trace (both directions)

| SPEC | Covered by | | Step | Traces to |
|---|---|---|---|---|
| R1 | T6-C1-1, T6-C1-2 | | T6-C1-1 | R1 |
| R2 | T6-C2-1, T6-C2-2 | | T6-C1-2 | R1 |
| R3 | T6-C3-1 | | T6-C1-3 | R6 |
| R4 | T6-C3-2 | | T6-C2-1 | R2 |
| R5 | T6-C3-3 | | T6-C2-2 | R2 |
| R6 | T6-C1-3 | | T6-C3-1 | R3 |
| R7 | T6-C4-1, T6-C4-2 | | T6-C3-2 | R4 |
| | | | T6-C3-3 | R5 |
| | | | T6-C4-* | R7 |

7 of 7 requirements covered; 10 of 10 steps trace.

## Refutation (ARCH)

| Cluster | Mutant its command detects | Mutant it does NOT detect |
|---|---|---|
| T6-C1 | the identity sentence paraphrased; asker id or scope missing; `s9-dev-token` source guards broken | an identity panel showing a *stale* asker id — presence, not freshness |
| T6-C2 | a session list with no current-vs-other distinction; missing revoke affordances; a current row distinguished by colour alone | a `Revoke` button that renders but calls the wrong session id |
| T6-C3 | the schedule path proceeding without the exact `DELETE MY ACCOUNT`; step-up fields absent; a legacy-claim change that introduces a storage write | a step-up form that renders and is then not actually enforced server-side — that is API behaviour, out of this slice's contract |
| T6-C4 | any of the five standing files going red from the T6 diff | a standing file already red before T6 |
