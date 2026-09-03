# PLAN — T7 Sign in, two-step & fleet

**Goal:** TURN 7 login shell, two-step, honest fleet stub.

**Spec:** `slices/T7/SPEC.md` v2

**Status:** ARCHITECTURE FILLED (ARCH-01, 2026-08-31). WHAT/acceptance columns
are Requirements' and unchanged; `HOW` blocks and commands are Architecture's.

**Architecture references:** `docs/missions/ui-overhaul/architecture/` —
`component-map.md` (T7 row), `ADR-004-auth-return-path.md`, `test-migration.md`,
`open-questions.md` Q-03.

**Gated on T9-C3, T3-C1 (the `authTopBar` toggle mount) and T9-C2** — T9-C2
changes `navigateHome`'s behaviour in `LoginFlow.tsx`; T7-C1 and T7-C2 change
copy in the same file and must land after it. Serial order for that file across
the mission: **T9-C2 → T7-C1 → T7-C2 → T8-C3.**

### READ THIS BEFORE RETARGETING ANY `web-auth-*` FILE

`tests/render/web-auth-login.test.tsx` imports
`../../web/components/LoginFlow.js` and `../../web/components/TopBar.js` — the
**`web/` tree, not the serving `apps/ui` tree**. Measured 2026-08-31:
`web-auth-login` has 0 references to `apps/ui` and 2 to `web/`.

T7's SPEC acceptance says *"Login + two-step render tests assert NEW strings"*.
Adding `WELCOME BACK` to `web-auth-login.test.tsx` would go RED, and the only
way to make it GREEN is to edit `web/components/LoginFlow.tsx` — a file this
mission does not ship. The suite would be green, the RED→GREEN evidence would
be genuine, and the product a user opens would be unchanged.

**T7's serving-tree pins are `tests/render/auth-flow-integration.test.tsx`
(which does import `apps/ui`) and the new `tests/render/t7-signin.test.tsx`.**
`web-auth-login.test.tsx` is carried in the commands below as an **unchanged
guard** that must stay green; it is not where T7's new strings go. Routed as
`architecture/open-questions.md` Q-03.

## Quantifiability law

Same as T9/PLAN.md.

## Clusters

### T7-C1 — Sign-in shell

**Proves:** R1

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C1-1 | R1 | Sign-in binding strings present | Assert `WELCOME BACK` and `Back to the graph.` present |
| T7-C1-2 | R1 | Email/password + mode | Assert email and password fields and mode toggle present |

**HOW (ARCH).**

- **Modify** `apps/ui/components/LoginFlow.tsx` and
  `apps/ui/components/AuthShell.tsx`. `AuthShell` already takes
  `eyebrow` / `title` / `description` and renders `.authEyebrow`,
  `.authHeadline`, `.authLede` — so T7-S1's three text regions are prop values,
  not new markup. Eyebrow `WELCOME BACK`, title `Back to the graph.`,
  description the binding policy sentence:
  `Sessions follow a fixed security policy. Every sign-in continues with your authenticator or a recovery code.`
- `Back to the graph.` is already asserted by
  `tests/render/auth-flow-integration.test.tsx` and
  `tests/render/web-auth-login.test.tsx` — the string is already the new one,
  so that assertion is already green and stays green.
- Password rule marks: pass/fail markers per rule, `aria-live="polite"` on the
  list so a screen reader hears the change without focus moving.
- `T7-C1-2`'s mode toggle is `TopBar`'s `authTopBar` mount from T3-C1
  (`/login` is in `AUTH_PATHS`). T7 adds no toggle.
- **Create** `tests/render/t7-signin.test.tsx` with three `describe` blocks:
  `shell` (C1), `two-step` (C2), `fleet` (C3). It imports from
  `apps/ui/components/LoginFlow.js` — **not** `web/`.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t7-signin.test.tsx tests/render/auth-flow-integration.test.tsx tests/architecture/auth-front-door-parity.test.ts
```

### T7-C2 — Two-step + recovery alternative

**Proves:** R2, R3

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C2-1 | R2 | Password continue lands on two-step | After valid password step, assert `TWO-STEP VERIFICATION` and 6-digit entry |
| T7-C2-2 | R3 | Recovery-code alternative + back | Assert `Use a recovery code` present; `← Back to sign in` returns to `WELCOME BACK` |

**HOW (ARCH).**

- **Modify** `apps/ui/components/LoginFlow.tsx` second step. The component
  already tracks `challengeToken` and `verificationMethod`
  (`"authenticator" | "recovery"`); the two-step screen is the existing branch
  with the design's copy: `TWO-STEP VERIFICATION`,
  `Enter your authentication code.`, `Use a recovery code`, `← Back to sign in`.
- `T7-C2-1` asserts the two-step screen appears **after** a valid password step,
  driven through the injected `client` prop the existing tests already use — so
  no network and no real credentials.
- `← Back to sign in` clears `challengeToken` and returns to the credentials
  step; the assertion is that `WELCOME BACK` is visible again.
- **No policy change.** T7 NON-goals forbid weakening two-step or recovery;
  R2's "session is not treated as fully signed-in until two-step completes" is
  existing behaviour that this slice must not disturb, and
  `auth-front-door-parity` is in the command because it reads `LoginFlow.tsx`
  as source.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t7-signin.test.tsx tests/render/auth-flow-integration.test.tsx
```

### T7-C3 — Fleet honesty

**Proves:** R4, R5

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C3-1 | R4 | Ordinary asker fleet shows unavailable copy | Required fixture: ARCH-named ordinary-asker fleet entry; assert copy contains `Deployment state is unavailable in the ordinary asker interface` (or SPEC binding); assert zero fabricated worker rows |
| T7-C3-2 | R5 | Operator fleet (if authorized) does not leak to asker chrome | Assert ordinary asker path cannot load operator worker table (ARCH pins probe) |

**HOW (ARCH) — this closes SPEC OQ-2 with a route that already exists.**

The ARCH-named ordinary-asker fleet entry is **`/admin/workers`**, i.e.
`apps/ui/app/admin/workers/page.tsx`. It already exists, has **no** `AuthGate`,
is reachable by an ordinary asker at that URL, issues **no** privileged request,
and already renders honest copy:

```
Operator-only view
Fleet status is unavailable in the ordinary asker interface. This page does not
request deployment state or infer worker counts from a refused operator response.
```

`TopBar`'s `SCREEN_TITLES` already maps `/admin/workers` → `Workers`.

- **Modify** that file so the first sentence is the SPEC's binding string:
  `Deployment state is unavailable in the ordinary asker interface. No privileged request is issued and no worker state is fabricated.`
  Keep the existing second sentence — it says something the binding string does
  not, and dropping it would lose the "does not infer from a refused response"
  claim.
- Add the eyebrow `FLEET` and heading `Execution state` per T7-S3.
- **Nothing else changes.** R5 forbids inventing privileged APIs, and the
  honest thing to build for a fleet artboard whose data an asker may not see is
  the page that already refuses to fetch it.
- `T7-C3-2`'s "operator fleet does not leak to asker chrome" is asserted as:
  the rendered markup contains **zero** worker rows (no `<tr>`, no
  `[data-worker]`) and the module issues no fetch — a source assertion that
  `admin/workers/page.tsx` contains no `fetch(`, no `contractClient`, and no
  `use client`.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t7-signin.test.tsx
```

### T7-C4 — Render-pin migration

**Proves:** R6

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T7-C4-1 | R6 | ARCH names login/two-step pins under `tests/render/` | Named list |
| T7-C4-2 | R6 | Named tests pass (three runs) | Three-run vitest on named files |

**HOW (ARCH) — the named pin files, `3 of 3`, from `architecture/test-migration.md`.**

| File | Class | What moves |
|---|---|---|
| `tests/render/auth-flow-integration.test.tsx` | **RETARGET** | the serving-tree auth pin (imports `apps/ui`). Already asserts `Back to the graph.` and the no-account-disclosure rule; add `WELCOME BACK` and `TWO-STEP VERIFICATION`. It injects its own `onAuthenticated`, so T9-C2's return-path change must preserve that seam. T7-C4 owns this file's sign-in `describe`s; T8-C4 owns the sign-up/enrolment ones |
| `tests/render/web-auth-login.test.tsx` | **KEEP — DO NOT RETARGET** | imports `web/`. Unchanged guard on the other app; must stay green |
| `tests/architecture/auth-front-door-parity.test.ts` | **RETARGET** | reads `LoginFlow.tsx` and `SignUpFlow.tsx` as source; both change |

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/auth-flow-integration.test.tsx tests/render/web-auth-login.test.tsx tests/architecture/auth-front-door-parity.test.ts
```

## SPEC ↔ PLAN trace (both directions)

| SPEC | Covered by | | Step | Traces to |
|---|---|---|---|---|
| R1 | T7-C1-1, T7-C1-2 | | T7-C1-1 | R1 |
| R2 | T7-C2-1 | | T7-C1-2 | R1 |
| R3 | T7-C2-2 | | T7-C2-1 | R2 |
| R4 | T7-C3-1 | | T7-C2-2 | R3 |
| R5 | T7-C3-2 | | T7-C3-1 | R4 |
| R6 | T7-C4-1, T7-C4-2 | | T7-C3-2 | R5 |
| | | | T7-C4-* | R6 |

6 of 6 requirements covered; 8 of 8 steps trace.

## Refutation (ARCH)

| Cluster | Mutant its command detects | Mutant it does NOT detect |
|---|---|---|
| T7-C1 | any binding sign-in string missing or paraphrased; `auth-front-door-parity`'s source guards broken | a sign-in form that renders correctly and posts to the wrong endpoint |
| T7-C2 | a password step that skips two-step; `Use a recovery code` missing; a back link that does not return to `WELCOME BACK` | a two-step screen that accepts a code the server would reject — client-side only |
| T7-C3 | fabricated worker rows; a `fetch(` added to the fleet page; the binding unavailable sentence missing | an operator-authorized route elsewhere leaking state — out of this slice's surface |
| T7-C4 | `auth-flow-integration` or `auth-front-door-parity` going red from the T7 diff; `web-auth-login` accidentally edited | a T7 change that is correct in `apps/ui` and leaves `web/` inconsistent — deliberately, `web/` is out of contract (`open-questions.md` Q-02) |
