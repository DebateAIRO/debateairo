# TEST MIGRATION — all 44 standing test files that read `apps/ui`

## The headline the SPECs cannot see

Every slice's R9-class requirement is scoped to `tests/render/**`. That is
**18 files / 78 tests**, measured 2026-08-31:

```
node_modules/.bin/vitest list tests/render/   # 78 test names, 18 files
```

*(The ARCH-01 packet says "72 tests". The measured count is 78. Recorded, not
argued — see `open-questions.md` Q-09.)*

But **44 test files reference `apps/ui`** — only 15 of them under
`tests/render/` — and **17 of those 44 read it as raw source text** via
`readFile`/`readFileSync`, including five under `tests/architecture/` and one,
`tests/unit/pol01-policy.test.ts`, that reads `DebatePageClient.tsx`,
`DebateTree.tsx`, `NodeDetailDrawer.tsx` and `AuthGate.tsx` as strings.
The remaining 3 of the 18 render files reference `web/` instead — see the
warning under the render table; that asymmetry is the mission's sharpest trap.

```
grep -rl "apps/ui" tests/ acceptance/ | wc -l                                    # 44
grep -lE '\breadFile(Sync)?\(' $(grep -rl "apps/ui" tests/ acceptance/) | wc -l  # 17
```

This is TOOLING-TRAPS' *"Disjoint WRITE surfaces do not imply independent
EFFECTS"* in its exact recorded shape: the question that matters is not "will
two clusters collide" but **"which standing tests READ the files each cluster
WRITES"**. The table below answers it for all 44, with no cap and no sampling.

**Every cluster's verification command must therefore run its slice's REGRESSION
set as well as its own tests.** `dispatch-order.md` carries both in each
command; a cluster that runs only its own new file is not verified.

## Classification

- **KEEP** — assertions survive the overhaul untouched. Must still be RUN.
- **RETARGET** — the file survives; specific assertions are updated to the new
  strings/markers. Never rewritten wholesale.
- **REPLACE** — no meaningful assertion survives; a new file supersedes it.

**There are zero REPLACE files.** Every existing pin is either behavioural (so
it survives a re-skin) or copy-coupled in a way a named edit fixes. That is a
consequence of ADR-006's frozen class names, and it is the mission's single
largest cost saving — a REPLACE column would have meant re-deriving 78
assertions.

### `tests/render/**` — the 18 the SPECs name

| File | Tests | Slice | Class | What moves |
|---|---|---|---|---|
| `ui02e-debate-canvas.test.tsx` | 4 | T1 | **RETARGET** | `BASE 62%` / `FINAL 41%` and the meta line `3 claims across 1 levels · 1 judged · 1 standing on their arguments · 1 set aside` are OLD card copy. Update to the TURN 1 anatomy; add `data-bezel` / `data-stance` assertions |
| `ui02d-model-identity.test.tsx` | 7 | T1, T5 | **KEEP** | asserts `modelDot` class and identity strings across 7 components — class name frozen, so nothing moves |
| `bug02-debate-effects.test.tsx` | 4 | T1 | **KEEP** | error-taxonomy and streamed-claim behaviour |
| `load01-debate-page.test.tsx` | 10 | T1 | **KEEP** | progress semantics + `progressStrip` / `progressTrack` / `progressFillIndeterminate` class names — frozen |
| `pda-s02-public-tree.test.tsx` | 4 | T3, T5 | **KEEP** | `⚐ Challenge`, `Unlock actions to view generation history.` — both survive; `Unlock actions` is a T3 binding string |
| `pda-s02-public-page.test.tsx` | 1 | T3 | **RETARGET** | asserts `SUPPORTED`, `Evidence checked`, `Countercase preserved` inside the public header. The header is restructured into verdict-block + strongest-cases; the same strings must still be present, re-anchored |
| `pda-s02-scoring-chrome.test.tsx` | 1 | T3 | **KEEP** | `Not exposed by scoring API` honesty copy |
| `pda-s02-honesty-export.test.tsx` | 4 | T3 | **KEEP** | export label/bytes gate |
| `bug03-home-buffer.test.tsx` | 1 | T3 | **RETARGET** | `Generating` / `Failed` survive; add `Complete` per T3 R3 |
| `prov01-honesty-drawer.test.tsx` | 1 | T5 | **KEEP** | `Risk tier standard · MACHINE_DEFAULT` — data provenance, not chrome |
| `ux01-new-debate-form.test.tsx` | 6 | T4 | **RETARGET** | pins `<button class="optionsToggle" aria-expanded="false">Options` — class frozen, but the label and the not-sent copy change; add the `data-v2-only` payload assertion |
| `s5-session-controls.test.tsx` | 3 | T6 | **RETARGET** | `Active sessions`, `Current session`, `Fresh authentication complete` survive; add the T6-S2 identity/HttpOnly line |
| `s9-legacy-claim-controls.test.tsx` | 5 | T6 | **KEEP** | not-saved / no-storage assertions; also reads `settings/page.tsx` as source — see the source-text warning below |
| `auth-flow-integration.test.tsx` | 14 | T7, T8 | **RETARGET** | imports `apps/ui` — the real serving-tree auth pin. Already asserts `Back to the graph.` (the NEW string) and no-account-disclosure. Add `WELCOME BACK`, `TWO-STEP VERIFICATION`; `navigateHome` becomes return-path aware, and this file injects its own `onAuthenticated`, so that injection point must be preserved |
| `web-auth-login.test.tsx` | 5 | — | **KEEP, DO NOT RETARGET** | imports `web/components/LoginFlow.js` — the **other** app. See the warning below |
| `web-auth-sign-up.test.tsx` | 4 | — | **KEEP, DO NOT RETARGET** | imports `web/` |
| `web-auth-enrollment.test.tsx` | 3 | — | **KEEP, DO NOT RETARGET** | imports `web/app/enroll-mfa/page.js`; also asserts `export { default } from "../enroll-mfa/page"` verbatim for the `web/` alias |
| `evaluator-dev-menu-controls.test.tsx` | 1 | — | **KEEP** | dev menu, no designed surface |

**18 of 18 classified: 6 RETARGET, 12 KEEP (3 of them KEEP-DO-NOT-RETARGET), 0 REPLACE.**

### WARNING — 12 of the 78 "render pins" test the app this mission does not ship

Measured 2026-08-31, per file, `apps/ui` references vs `web/` references:

```
web-auth-enrollment.test.tsx   apps/ui:0  web:4     (3 tests)
web-auth-login.test.tsx        apps/ui:0  web:2     (5 tests)
web-auth-sign-up.test.tsx      apps/ui:0  web:1     (4 tests)
```

These three files import `web/components/LoginFlow.js`,
`web/components/TopBar.js` and `web/app/enroll-mfa/page.js`. **`web/` is not the
serving tree** — `INSTRUCTIONS.md` pins `apps/ui`, and
`apps/runner/src/dev-ui-process.ts` launches `apps/ui`.

T7's and T8's SPEC acceptance sections name these files by shape
(*"Existing web-auth sign-up / enrolment render tests updated to NEW strings"*).
Following that literally is a **false green of the worst kind**: a seat would
add `WELCOME BACK` to `web-auth-login.test.tsx`, watch it go RED, edit
`web/components/LoginFlow.tsx` to make it GREEN, and ship a mission where the
suite is green, the report is honest, and the product a user opens is
unchanged. The assertion would be real, the RED would be real, and the
conclusion would be false.

**ARCH ruling:** the three `web-auth-*` files are NOT retargeted. They stay
green, unchanged, as guards on the other app. The serving-tree auth pins for
T7/T8 are `auth-flow-integration.test.tsx` (which does import `apps/ui`) plus
the new `tests/render/t7-signin.test.tsx` and `tests/render/t8-signup.test.tsx`.
Routed to REQ/V as `open-questions.md` Q-03, because the SPEC sentence that
names them is frozen and only REQ may re-version it.

`s5-session-controls.test.tsx` (apps/ui:3, web:2) and
`s9-legacy-claim-controls.test.tsx` (apps/ui:4, web:3) reference **both** trees;
their `apps/ui` assertions are the ones T6 retargets, and their `web/`
assertions are left alone.

### The 26 the SPECs do not name

| File | Reads | Slice at risk | Class |
|---|---|---|---|
| `tests/unit/pol01-policy.test.ts` | **source**: `DebatePageClient.tsx`, `AuthGate.tsx`, `DebateTree.tsx`, `NodeDetailDrawer.tsx`, `lib/api.ts` | T1, T3, T5, T9 | **RETARGET (highest risk)** — 7 source reads across the four most-edited files |
| `tests/unit/pda-s02-affordance-drift.test.ts` | **source**: `DebatePageClient.tsx`, `AnswerHonestyDrawer.tsx`, with `between(start,end)` anchor slicing and `occurrences(token)` counting | T1, T3, T5 | **RETARGET** — anchor-based slicing is the classic stale-anchor break |
| `tests/unit/pda-s03-keyboard-accessibility.test.ts` | **source**: `app/globals.css`; renders `app/page.tsx` in jsdom | T3, T9 | **RETARGET** — asserts tab labels `Your Debates` / `Public Debates`, which T3 recases to `Your debates` / `Public debates`. Also the file the whole token-test pattern is lifted from |
| `tests/unit/v2ui-pages.test.ts` | **source**: `apps/ui/**` page files (618 lines of page-wiring guards) | T4, T3, T9 | **RETARGET** |
| `tests/architecture/s8-publication-contract.test.ts` | **source**: `app/page.tsx`, `public/debate/[id]/page.tsx`, `PublicDebatePageClient.tsx`, `PublicationControl.tsx` | T3, T9 | **RETARGET** — this is the exact file TOOLING-TRAPS records S02 breaking through a legitimate refactor |
| `tests/architecture/auth-front-door-parity.test.ts` | **source**: `enroll-mfa/page.tsx`, `verify-email/page.tsx`, `LoginFlow.tsx`, `SignUpFlow.tsx`, `package.json` | T7, T8, T9 | **RETARGET** — `LoginFlow` changes for the return path |
| `tests/architecture/s4-mfa-contract.test.ts` | **source**: `enroll-mfa/page.tsx`, `lib/mfaEnrollment.ts`, `lib/totpQr.ts` | T8 | **KEEP** (verify) |
| `tests/architecture/s9-dev-token-retirement-contract.test.ts` | **source**: `settings/page.tsx`, `LegacyRunClaimControls.tsx` | T6 | **KEEP** (verify) |
| `tests/architecture/dev-local-auth-topology-spec.test.ts` | **source**: `apps/ui/server.mjs` | none | **KEEP** |
| `tests/unit/mfa-ui.test.ts` | **source**: `apps/ui/app/**/page.tsx` | T8 | **KEEP** (verify) |
| `tests/unit/s10-erasure-ui.test.ts` | **source**: `lib/api.ts` | T6 | **KEEP** |
| `tests/unit/t2-real-client-ip.test.ts` | **source**: `server.mjs`, `app/api/[...path]/route.ts` | none | **KEEP** |
| `tests/unit/dr184-judged-standing.test.ts` | **source**: `lib/v3/adapter.ts` | none | **KEEP** |
| `tests/unit/dr174-resilience.test.ts` | **source**: runner; imports `lib/debateTreeUtils`, `lib/v3/adapter` | none | **KEEP** |
| `tests/unit/evaluator-dev-menu-ui.test.ts` | **source**: `apps/ui/**` | none | **KEEP** |
| `tests/unit/ui-census.test.ts` | imports `lib/v3/census` | none | **KEEP** |
| `tests/unit/s14-ui.test.ts` | imports `web/lib/v3Presentation` **and** `apps/ui/lib/v3/labels` | none | **KEEP** — cross-tree parity, see the `web/` note below |
| `tests/unit/v2ui-data-layer.test.ts` | imports `lib/**` | none | **KEEP** |
| `tests/unit/v2ui-export.test.ts` | imports `lib/v3/answerExport` | none | **KEEP** |
| `tests/unit/v2ui-live-events.test.ts` | imports `lib/v3/liveEvents` | none | **KEEP** |
| `tests/unit/v2ui-ownership.test.ts` | imports `lib/**` | none | **KEEP** |
| `tests/unit/v2ui-proxy.test.ts` | imports `lib/sessionProxy` | none | **KEEP** |
| `tests/unit/s5-session-http.test.ts` | imports `lib/api` | none | **KEEP** |
| `tests/unit/load01-live-proof.test.ts` | imports `lib/v3/liveEvents` | none | **KEEP** |
| `tests/unit/s8-publication-ui.test.tsx` | imports `PublicationControl` | T3 | **KEEP** (verify) |
| `tests/unit/s10-erasure-ui-render.test.tsx` | imports `AccountErasureControls` | T6 | **KEEP** |
| `tests/unit/mfa.test.ts` | imports `lib/mfaEnrollment` | none | **KEEP** |
| `tests/integration/database.test.ts`, `tests/integration/s5-ui-security-smoke.mjs` | path references only | none | **KEEP** |

**Six of the 26 are RETARGET.** They are named in the slice PLANs that break
them, with the breaking cluster owning the fix. Nothing here is "filed as a
residual": a RETARGET with no owning cluster is a finding dropped on the floor,
which is the loss class the spine abolished.

## Per-slice REGRESSION set — run these, every cluster, every slice

| Slice | Regression command |
|---|---|
| T1 | `pnpm exec vitest run tests/render/ui02e-debate-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/unit/pol01-policy.test.ts tests/unit/pda-s02-affordance-drift.test.ts` |
| T3 | `pnpm exec vitest run tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/render/bug03-home-buffer.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/s8-publication-ui.test.tsx tests/architecture/s8-publication-contract.test.ts` |
| T4 | `pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts` |
| T5 | `pnpm exec vitest run tests/render/prov01-honesty-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/unit/pol01-policy.test.ts tests/unit/pda-s02-affordance-drift.test.ts` |
| T6 | `pnpm exec vitest run tests/render/s5-session-controls.test.tsx tests/render/s9-legacy-claim-controls.test.tsx tests/unit/s10-erasure-ui.test.ts tests/unit/s10-erasure-ui-render.test.tsx tests/architecture/s9-dev-token-retirement-contract.test.ts` |
| T7 | `pnpm exec vitest run tests/render/auth-flow-integration.test.tsx tests/render/web-auth-login.test.tsx tests/architecture/auth-front-door-parity.test.ts` — `web-auth-login` is present as an **unchanged** guard: it must stay green, and it is not where T7's new strings go |
| T8 | `pnpm exec vitest run tests/render/auth-flow-integration.test.tsx tests/render/web-auth-sign-up.test.tsx tests/render/web-auth-enrollment.test.tsx tests/architecture/s4-mfa-contract.test.ts tests/architecture/auth-front-door-parity.test.ts tests/unit/mfa-ui.test.ts` — the two `web-auth-*` files are **unchanged** guards |
| T9 | `pnpm exec vitest run tests/unit/pda-s03-keyboard-accessibility.test.ts tests/architecture/s8-publication-contract.test.ts tests/architecture/auth-front-door-parity.test.ts tests/unit/v2ui-pages.test.ts` |

Every command above was resolved on 2026-08-31 with
`node_modules/.bin/vitest list <paths>` — every path exists and the runner
accepts the invocation. Whether they are GREEN today is not an ARCH claim:
`heartbeat-architecture` §4 forbids this seat from running product tests, so
each command's current colour is the worker's RED-before-GREEN evidence, and
each is marked **UNVERIFIED for colour** here on purpose.

## New test files this mission creates

| File | Owner cluster | Purpose |
|---|---|---|
| `tests/support/contrast.ts` | T9-C3 | WCAG luminance + ratio (ADR-005) |
| `tests/support/tokenContract.ts` | T9-C3 | jsdom stylesheet loader + token readers (ADR-006) |
| `tests/render/t9-landing.test.tsx` | T9-C1/C2/C4 | landing chrome, CTAs, method, sample, placeholders, route split |
| `tests/unit/t9-mode-tokens.test.ts` | T9-C3 | token parity, mode switch, contrast floors |
| `tests/unit/t9-return-path.test.ts` | T9-C2 | `safeReturnPath` hostile-input table |
| `tests/render/t3-library.test.tsx` | T3-C1/C2 | library chrome, selectors, `4 TOTAL` |
| `tests/render/t3-public-3b.test.tsx` | T3-C3 | verdict-first order, `Details ▾`, `Read ▾`, locks |
| `tests/render/t1-canvas.test.tsx` | T1-C1/C2/C3 | bezel, stance, connectors, set-aside, synthesis |
| `tests/render/t5-drawer.test.tsx` | T5-C1/C2 | drawer labels, review line, history |
| `tests/render/t4-new-debate.test.tsx` | T4-C1/C2/C3 | form regions, V2-not-sent payload |
| `tests/render/t6-settings.test.tsx` | T6-C1/C2/C3 | identity, sessions, step-up, deletion |
| `tests/render/t7-signin.test.tsx` | T7-C1/C2/C3 | sign-in, two-step, fleet honesty |
| `tests/render/t8-signup.test.tsx` | T8-C1/C2/C3 | sign-up, MFA steps, recovery gate |

## The `web/` tree — named, not touched

`web/` is a second Next application (`dialectical-engine-web`) with its own copy
of `app/page.tsx`, `app/login`, `app/settings` and friends. `INSTRUCTIONS.md`
pins **`apps/ui` as the serving UI tree**, and
`apps/runner/src/dev-ui-process.ts` confirms it
(`const uiCwd = resolve(repositoryRoot, "apps", "ui")`).

But the repo-root `build` script is
`pnpm --filter dialectical-engine-web build` — it builds **`web`**, not
`apps/ui`. And `tests/unit/s14-ui.test.ts` asserts parity between
`web/lib/v3Presentation` and `apps/ui/lib/v3/labels`.

So this overhaul, executed exactly as specified, leaves `web/` on the old
visual language while the root build script still points at it. **That is out
of this mission's contract and is not fixed here.** It is routed as
`open-questions.md` Q-02 rather than absorbed, because "also restyle the second
app" is a scope expansion and scope expansion is V's, not ARCH's.
