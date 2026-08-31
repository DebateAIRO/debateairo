# DISPATCH ORDER — 32 clusters, dependency-ordered, one Codex seat each

## Reading this table

- **Wave** — clusters in the same wave have disjoint write surfaces AND
  disjoint regression sets; they may run concurrently subject to
  `max_concurrent_heavy` (laptop = 1, spine `## Parallelism and file ownership`).
- **Writes** — the cluster's `contract.allowed`. Anything not listed is
  `forbidden` for that cluster.
- **Verify** — a real shell command whose first token resolves. Each is run
  **three times** and the WORST run is the verdict (spine v3.3.0 item 12).
  Every command bundles the slice's regression set from `test-migration.md`,
  because surface-disjointness does not imply effect-disjointness.

`globals.css` has exactly ONE writer for the whole mission: **T9-C3**. Every
other cluster's `forbidden` set names the `:root` and `html[data-mode="chamber"]`
blocks explicitly.

## Wave 0 — the foundation. One seat. Everything else is gated on it.

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 1 | **T9-C3** — tokens, fonts, mode mechanism | `apps/ui/app/globals.css` · `apps/ui/app/layout.tsx` · `apps/ui/components/ModeToggle.tsx` · `apps/ui/lib/debatePresentation.ts` · `tests/support/contrast.ts` · `tests/support/tokenContract.ts` · `tests/unit/t9-mode-tokens.test.ts` | `pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts` |

T9-C3 also carries ADR-001's colour-literal sweep — **scoped to its own four
product files**, not repo-wide. Baseline **113** (`globals.css` 111 +
`debatePresentation.ts` 2; `layout.tsx` 0; `ModeToggle.tsx` new). Its acceptance
is that the **WAVE-0 ORACLE** in `ADR-001` §(a) reaches residual **0**, with the
command's output quoted verbatim — not a spot check, and not the repo-wide
sweep.

> **AMENDED 2026-08-31 (AF-1).** The original row demanded the REPO-WIDE sweep
> reach 0. That was unsatisfiable: 45 further literals live in files owned by
> later clusters, so T9-C3 could only have reached 0 by violating
> one-writer-per-file. Caught by the wave-0 coder at preflight, before any edit
> (`t_4ccac5c4`). The remaining 45 are enumerated and owned in `ADR-001` §(b);
> the repo-wide sweep survives as the **mission-final** oracle, owned by
> cluster #32 (`T8-C4`) and repeated as a QA line for V.

Nothing in waves 1–5 starts before T9-C3 is Hermes-approved. A slice that
re-skins against tokens that do not exist yet produces a diff no reviewer can
evaluate and a mode toggle that flips nothing.

## Wave 1 — chrome and route split (the two shared mount points)

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 2 | **T9-C1** — anonymous `/` vs signed-in `/` | `apps/ui/app/page.tsx` · `apps/ui/components/landing/LandingPage.tsx` · `tests/render/t9-landing.test.tsx` | `pnpm exec vitest run tests/render/t9-landing.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/architecture/s8-publication-contract.test.ts` |
| 3 | **T3-C1** — signed-in library chrome + ☾ mount in `TopBar` | `apps/ui/components/TopBar.tsx` · `apps/ui/app/page.tsx` (library half) · `apps/ui/components/LibraryComposer.tsx` · `tests/render/t3-library.test.tsx` | `pnpm exec vitest run tests/render/t3-library.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts` |

T9-C1 and T3-C1 both write `apps/ui/app/page.tsx` — **they are serialised**,
T9-C1 first. T9-C1 adds the early return; T3-C1 edits the body below it. This is
the one unavoidable shared file in the mission and it is why they are numbered
rather than parallel. `auth-flow-integration.test.tsx` is in T3-C1's set because
it imports `TopBar`.

## Wave 2 — landing body (no shared surfaces; fully parallel)

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 4 | **T9-C2** — chrome labels, CTAs, stub nav, return path | `apps/ui/components/landing/LandingChrome.tsx` · `apps/ui/lib/returnPath.ts` · `apps/ui/components/LoginFlow.tsx` · `apps/ui/components/SignUpFlow.tsx` · `tests/unit/t9-return-path.test.ts` · `tests/render/t9-landing.test.tsx` | `pnpm exec vitest run tests/unit/t9-return-path.test.ts tests/render/t9-landing.test.tsx tests/render/auth-flow-integration.test.tsx tests/architecture/auth-front-door-parity.test.ts` |
| 5 | **T9-C4** — method ledger, sample cards, placeholders | `apps/ui/components/landing/LandingHero.tsx` · `LandingSample.tsx` · `LandingMethod.tsx` · `LandingPricing.tsx` · `tests/render/t9-landing.test.tsx` | `pnpm exec vitest run tests/render/t9-landing.test.tsx` |
| 6 | **T9-C5** — render-pin migration bind for T9 | `tests/unit/pda-s03-keyboard-accessibility.test.ts` | `pnpm exec vitest run tests/unit/pda-s03-keyboard-accessibility.test.ts tests/architecture/s8-publication-contract.test.ts tests/unit/v2ui-pages.test.ts tests/architecture/auth-front-door-parity.test.ts` |

T9-C2 and T9-C4 both touch `tests/render/t9-landing.test.tsx`. Split it by
`describe` block at creation — T9-C1 creates the file with three empty
`describe`s (`route split`, `chrome and CTAs`, `body content`) so the three
clusters own one block each and never edit the same hunk.

## Wave 3 — debate surfaces

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 7 | **T1-C1** — debate chrome, view toggles, ☾ mount | `apps/ui/app/debate/[id]/DebatePageClient.tsx` · `apps/ui/components/GuideModal.tsx` · `tests/render/t1-canvas.test.tsx` | `pnpm exec vitest run tests/render/t1-canvas.test.tsx tests/render/load01-debate-page.test.tsx tests/render/bug02-debate-effects.test.tsx tests/unit/pol01-policy.test.ts tests/unit/pda-s02-affordance-drift.test.ts` |
| 8 | **T1-C2** — card anatomy, stance tab, connectors | `apps/ui/components/DebateCanvas.tsx` · `DebateTree.tsx` · `DebateMap.tsx` · `DebateSplit.tsx` · `DebateThread.tsx` · `DebateOutline.tsx` · `ModelPresentation.tsx` · `apps/ui/lib/debatePresentation.ts` · `apps/ui/lib/scrutiny.ts` · `tests/render/t1-canvas.test.tsx` | `pnpm exec vitest run tests/render/t1-canvas.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pol01-policy.test.ts` |
| 9 | **T1-C3** — set-aside, synthesis, publicMode | `apps/ui/components/DebateCanvas.tsx` · `apps/ui/components/SynthesisPanel.tsx` · `tests/render/t1-canvas.test.tsx` | `pnpm exec vitest run tests/render/t1-canvas.test.tsx tests/render/pda-s02-public-tree.test.tsx` |
| 10 | **T1-C4** — render-pin migration for T1 | `tests/render/ui02e-debate-canvas.test.tsx` | `pnpm exec vitest run tests/render/ui02e-debate-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/unit/pol01-policy.test.ts tests/unit/pda-s02-affordance-drift.test.ts` |
| 11 | **T5-C1** — drawer open + core sections | `apps/ui/components/NodeDetailDrawer.tsx` · `tests/render/t5-drawer.test.tsx` | `pnpm exec vitest run tests/render/t5-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pol01-policy.test.ts` |
| 12 | **T5-C2** — actions, history, mode | `apps/ui/components/NodeDetailDrawer.tsx` · `tests/render/t5-drawer.test.tsx` | `pnpm exec vitest run tests/render/t5-drawer.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/unit/t9-mode-tokens.test.ts` |
| 13 | **T5-C3** — render-pin migration for T5 | `tests/render/prov01-honesty-drawer.test.tsx` | `pnpm exec vitest run tests/render/prov01-honesty-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/unit/pol01-policy.test.ts tests/unit/pda-s02-affordance-drift.test.ts` |

T1-C2 and T1-C3 both write `DebateCanvas.tsx`; T5-C1 and T5-C2 both write
`NodeDetailDrawer.tsx`. **Serialised in the order shown** — same file, same
hunks, and the spine's single-writer rule is per file, not per cluster.

> **WRITE SURFACES WIDENED 2026-08-31 (AF-1).** T1-C1 gains `GuideModal.tsx`;
> T1-C2 gains `DebateMap.tsx`, `DebateSplit.tsx`, `DebateThread.tsx`,
> `DebateOutline.tsx`, `ModelPresentation.tsx` and `lib/scrutiny.ts`. These six
> files carry 28 of the 45 non-wave-0 colour literals and previously belonged to
> **no cluster at all** — the second half of the AF-1 defect. Ownership is
> evidence-based, not assigned by theme: each was traced to its importer
> (`rg -l '/(components|lib)/<name>"' apps/ui`). **All 45 non-wave-0 residuals
> fall inside T1**; no other slice inherits any. `ADR-001` §(b) has the full
> `10 of 10` table. `DebateOutline.tsx` has no app importer — test-referenced
> only; flagged for the orphan audit, not deleted here.

## Wave 4 — library lists and public 3b

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 14 | **T3-C2** — Your/Public selectors, `4 TOTAL`, bezel rows | `apps/ui/app/page.tsx` · `apps/ui/components/DebatesBuffer.tsx` · `tests/render/t3-library.test.tsx` | `pnpm exec vitest run tests/render/t3-library.test.tsx tests/render/bug03-home-buffer.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/architecture/s8-publication-contract.test.ts` |
| 15 | **T3-C3** — public 3b verdict-first + locks | `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` · `apps/ui/components/public/PublicVerdictBlock.tsx` · `PublicStrongestCases.tsx` · `PublicLockBanner.tsx` · `tests/render/t3-public-3b.test.tsx` | `pnpm exec vitest run tests/render/t3-public-3b.test.tsx tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/architecture/s8-publication-contract.test.ts` |
| 16 | **T3-C4** — render-pin migration for T3 | `tests/render/pda-s02-public-page.test.tsx` · `tests/render/bug03-home-buffer.test.tsx` | `pnpm exec vitest run tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/render/bug03-home-buffer.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/s8-publication-ui.test.tsx tests/architecture/s8-publication-contract.test.ts` |

T3-C3 depends on T1-C1 (both render inside `DebatePageClient`'s chrome) and on
T1-C3 (publicMode locks are shared with the canvas). Wave 4 runs after wave 3.

## Wave 5 — forms and auth (mutually independent; parallel)

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 17 | **T4-C1** — form regions + mode | `apps/ui/app/new/page.tsx` · `tests/render/t4-new-debate.test.tsx` | `pnpm exec vitest run tests/render/t4-new-debate.test.tsx tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts` |
| 18 | **T4-C2** — steering + start/cancel + ⌃↵ | `apps/ui/app/new/page.tsx` · `tests/render/t4-new-debate.test.tsx` | `pnpm exec vitest run tests/render/t4-new-debate.test.tsx tests/unit/v2ui-pages.test.ts` |
| 19 | **T4-C3** — V2 options not sent | `apps/ui/app/new/page.tsx` · `apps/ui/app/new/defaults.tsx` · `tests/render/t4-new-debate.test.tsx` | `pnpm exec vitest run tests/render/t4-new-debate.test.tsx tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts` |
| 20 | **T4-C4** — render-pin migration for T4 | `tests/render/ux01-new-debate-form.test.tsx` | `pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts` |
| 21 | **T6-C1** — settings chrome + identity + mode | `apps/ui/app/settings/page.tsx` · `tests/render/t6-settings.test.tsx` | `pnpm exec vitest run tests/render/t6-settings.test.tsx tests/architecture/s9-dev-token-retirement-contract.test.ts` |
| 22 | **T6-C2** — sessions + revoke | `apps/ui/components/SessionControls.tsx` · `tests/render/t6-settings.test.tsx` | `pnpm exec vitest run tests/render/t6-settings.test.tsx tests/render/s5-session-controls.test.tsx` |
| 23 | **T6-C3** — step-up, legacy claim, deletion | `apps/ui/components/LegacyRunClaimControls.tsx` · `apps/ui/components/AccountErasureControls.tsx` · `tests/render/t6-settings.test.tsx` | `pnpm exec vitest run tests/render/t6-settings.test.tsx tests/render/s9-legacy-claim-controls.test.tsx tests/unit/s10-erasure-ui.test.ts tests/unit/s10-erasure-ui-render.test.tsx tests/architecture/s9-dev-token-retirement-contract.test.ts` |
| 24 | **T6-C4** — render-pin migration for T6 | `tests/render/s5-session-controls.test.tsx` | `pnpm exec vitest run tests/render/s5-session-controls.test.tsx tests/render/s9-legacy-claim-controls.test.tsx tests/unit/s10-erasure-ui.test.ts tests/unit/s10-erasure-ui-render.test.tsx tests/architecture/s9-dev-token-retirement-contract.test.ts` |
| 25 | **T7-C1** — sign-in shell | `apps/ui/components/LoginFlow.tsx` · `apps/ui/components/AuthShell.tsx` · `tests/render/t7-signin.test.tsx` | `pnpm exec vitest run tests/render/t7-signin.test.tsx tests/render/auth-flow-integration.test.tsx tests/architecture/auth-front-door-parity.test.ts` |
| 26 | **T7-C2** — two-step + recovery alternative | `apps/ui/components/LoginFlow.tsx` · `tests/render/t7-signin.test.tsx` | `pnpm exec vitest run tests/render/t7-signin.test.tsx tests/render/auth-flow-integration.test.tsx` |
| 27 | **T7-C3** — fleet honesty | `apps/ui/app/admin/workers/page.tsx` · `tests/render/t7-signin.test.tsx` | `pnpm exec vitest run tests/render/t7-signin.test.tsx` |
| 28 | **T7-C4** — render-pin migration for T7 | `tests/render/auth-flow-integration.test.tsx` | `pnpm exec vitest run tests/render/auth-flow-integration.test.tsx tests/render/web-auth-login.test.tsx tests/architecture/auth-front-door-parity.test.ts` |
| 29 | **T8-C1** — sign-up shell + validation | `apps/ui/components/SignUpFlow.tsx` · `tests/render/t8-signup.test.tsx` | `pnpm exec vitest run tests/render/t8-signup.test.tsx tests/render/auth-flow-integration.test.tsx tests/architecture/auth-front-door-parity.test.ts` |
| 30 | **T8-C2** — three-step MFA + activate gate | `apps/ui/app/enroll-mfa/page.tsx` · `tests/render/t8-signup.test.tsx` | `pnpm exec vitest run tests/render/t8-signup.test.tsx tests/architecture/s4-mfa-contract.test.ts tests/unit/mfa-ui.test.ts tests/render/web-auth-enrollment.test.tsx` |
| 31 | **T8-C3** — recovery replacement gate | `apps/ui/components/LoginFlow.tsx` · `apps/ui/lib/authNavigationGuard.ts` · `tests/render/t8-signup.test.tsx` | `pnpm exec vitest run tests/render/t8-signup.test.tsx tests/render/auth-flow-integration.test.tsx` |
| 32 | **T8-C4** — mode on auth shell + render-pin migration for T8 + **MISSION-FINAL colour-literal sweep** | `tests/render/auth-flow-integration.test.tsx` | `pnpm exec vitest run tests/render/auth-flow-integration.test.tsx tests/render/web-auth-sign-up.test.tsx tests/render/web-auth-enrollment.test.tsx tests/architecture/s4-mfa-contract.test.ts tests/architecture/auth-front-door-parity.test.ts tests/unit/mfa-ui.test.ts` |

### The `LoginFlow.tsx` contention — read this before dispatching wave 5

Four clusters write `apps/ui/components/LoginFlow.tsx`: **T9-C2** (return path),
**T7-C1** (shell copy), **T7-C2** (two-step copy), **T8-C3** (recovery gate).
That is the mission's worst single-writer hazard.

They are ordered **T9-C2 → T7-C1 → T7-C2 → T8-C3** and run strictly serially.
T9-C2 goes first because it changes `navigateHome`'s *behaviour*; the other
three change copy inside JSX that the behaviour change does not touch. Reversing
the order means three copy diffs get rebased around a behaviour change, which is
where a `next` parameter quietly gets dropped.

`tests/render/auth-flow-integration.test.tsx` is written by both T7-C4 and
T8-C4. Split it the same way as `t9-landing`: T7-C4 owns the sign-in
`describe`s, T8-C4 owns the sign-up/enrolment `describe`s.

## Ordering rationale in one line each

1. **T9-C3 first** — nothing can be re-skinned against tokens that do not exist.
2. **Route split and `TopBar` next** — they are the two shared mount points; every later cluster assumes the ☾ control already exists and only mounts it.
3. **Landing body** — the only fully greenfield work; parallel because it shares no file with the product.
4. **Debate before public** — `PublicDebatePageClient` renders `DebatePageClient`; restyling the parent after the child means restyling twice.
5. **Forms and auth last** — they are the least coupled to the token/chrome work and the most coupled to security tests, so they get the most stable base to land on.

## Mission-final colour-literal sweep (AF-1, owner: cluster #32 `T8-C4`)

As the LAST cluster in this order, `T8-C4` additionally runs the **MISSION-FINAL
ORACLE** from `ADR-001` §(c) — the repo-wide sweep — and it must return `0`:

```
rg -n --no-heading -e 'oklch\(' -e '#[0-9a-fA-F]{6}\b' -e '\brgba?\(' \
  --glob '!*.disabled' --glob '!*.svg' \
  apps/ui/app apps/ui/lib apps/ui/components \
  | grep -v -E 'globals\.css:[1-9][0-9]?:|globals\.css:1[0-9][0-9]:' \
  | wc -l
```

This is **verification-only**: T8-C4 writes no product code for it. A non-zero
result is routed to whichever cluster owns the file per `ADR-001` §(b) — never
absorbed by T8-C4, which owns none of those surfaces. The same command is a
**QA line for V** at the closure gate: per-cluster greens prove each seat cleaned
its own surface; only this one proves the union is clean.

## Three-run law

Every command above is run three times; **the worst run is the verdict**.
Green-green-red is RED, and re-running until green is falsification under R5.
`vitest.config.ts` sets `fileParallelism: false`, so runs are already
deterministic in ordering; a flake here is a real flake, not a scheduling
artefact.
