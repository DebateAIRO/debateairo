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

### Acceptance defaults — every cluster, in addition to the command in its row

**COMPILE GATE (added 2026-08-31, AM2/C).** Every cluster that writes any file
under `apps/ui/` also runs the workspace compile gate at **0-new**. That is every
cluster below except the pure test-migration ones that write only under `tests/`
(T9-C5, T1-C4, T3-C4, T4-C4, T5-C3, T6-C4, T7-C4, T8-C4):

```sh
pnpm exec tsc --noEmit -p apps/ui/tsconfig.json 2>&1 \
  | grep -E 'error TS' \
  | grep -v -e 'app/debate/\[id\]/DebatePageClient\.tsx(1488,11): error TS2322' \
          -e 'app/layout\.tsx(3,8): error TS2882' \
  | tee /dev/stderr \
  | wc -l          # required: 0
```

`pnpm run typecheck` is **NOT** this gate and must never be cited as one for
`apps/ui` work: root `tsconfig.json` excludes `apps/ui` and `web`, so it exits 0
without opening a single file this mission writes. That blindness is how a
non-compiling `ModeToggle.tsx` passed every named gate in Wave 0. Full law, the
two baselined errors and their evidence: `ADR-006` §"Compile-gate law".

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
| 2 | **T9-C1** — anonymous `/` vs signed-in `/` **+ mode control on the anonymous landing** | `apps/ui/app/page.tsx` · `apps/ui/components/landing/LandingPage.tsx` · `apps/ui/components/landing/LandingChrome.tsx` (the `ModeToggle` mount only) · `apps/ui/components/landing/LandingHero.tsx` · `LandingSample.tsx` · `LandingMethod.tsx` · `LandingPricing.tsx` (**empty stubs only — content is T9-C4's**; see the stub rule below) · `tests/render/t9-landing.test.tsx` | `pnpm exec vitest run tests/render/t9-landing.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/architecture/s8-publication-contract.test.ts` |
| 3 | **T3-C1** — signed-in library chrome + ☾ mount in `TopBar` | `apps/ui/components/TopBar.tsx` · `apps/ui/app/page.tsx` (library half) · `apps/ui/components/LibraryComposer.tsx` · `tests/render/t3-library.test.tsx` | `pnpm exec vitest run tests/render/t3-library.test.tsx tests/render/auth-flow-integration.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts` |

#### T9-C1 stub rule (added 2026-08-31, AM4)

`LandingPage.tsx` composes five children. T9's PLAN HOW rules: *"C1 ships it with
the five children as empty stubs; C2 and C4 fill them."* A contract-obedient C1
therefore **must create all five files**, or `LandingPage`'s imports do not
resolve, the ADR-006 compile gate goes red on module-not-found, and the seat
correctly refuses to proceed.

- `LandingChrome.tsx` — created by C1, which also mounts `<ModeToggle />` in it
  (AM2/D). Its chrome copy is **T9-C2's** (row 4).
- `LandingHero.tsx`, `LandingSample.tsx`, `LandingMethod.tsx`,
  `LandingPricing.tsx` — created by C1 as **empty stubs**. Their content is
  **T9-C4's** (row 5).

**One exception, forced by C1's own acceptance:** the hero stub is not empty. It
must render the exact string `Find the weakest claim in your own argument.`,
because `T9-C1-1` asserts that headline on the no-session `/` render. A literally
empty `LandingHero` makes T9-C1's own acceptance unsatisfiable — the AF-1 shape
again, one file down.

Everything else in the four stubs is T9-C4's to write. C1 adding copy beyond the
headline is a contract violation in the other direction, and row 5 owns it.

#### T9-C1 additional acceptance — CH1, the anonymous-landing mode control (added 2026-08-31, AM2/D)

SPEC T9 **R3** requires the mode control on the **anonymous landing**. Nothing in
the plan pinned it there: T9-C3 proves `ModeToggle` in isolation (both mounts are
outside its contract), T3-C1-3 pins it on the **signed-in library**, and T9-C1's
existing rows assert only the hero headline and the route split. The control
could therefore have been absent from the one surface R3 actually names, with
every cluster green. Same uncovered-acceptance class as AF-1; found by the Wave-0
blind review (`t_4ccac5c4`, "coverage hole, flagged not resolved").

SPEC and PLAN are frozen, so the pin lives here in the cluster contract, which is
the dispatch source of truth.

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **T9-C1-3** | R3 | The anonymous landing renders the mode control | In `tests/render/t9-landing.test.tsx` (owned by T9-C1): render the anonymous `/` document — the same no-session render as T9-C1-1 — and assert the markup contains an element carrying `data-mode-toggle` whose accessible name matches `/Switch to (Chamber\|Terracotta) mode/`. Asserting the `☾` glyph alone = RED (the glyph is decoration, the label is the contract). Asserting that `ModeToggle` is merely imported = RED — the assertion is on the RENDERED anonymous-landing output |

**V QA line (human-runnable, for the manual acceptance):**

> Open `/` in a private window, logged out. **Expect:** the mode control is
> visible in the landing chrome. Click it. **Expect:** the landing switches
> between Terracotta and Chamber, and `<html>` carries `data-mode="chamber"`
> after the first click. Reload the page. **Expect:** the chosen mode persists
> and there is no flash of the other mode before paint.

`LandingChrome.tsx` is created by T9-C2 for its chrome copy, but **T9-C1 owns the
`ModeToggle` mount inside it**, so the pin and the thing it pins land in the same
cluster. A pin whose subject is created by a later cluster is not a pin.

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

```sh
# The token region is TWO intervals. Both found BY SYNTAX at run time.
RANGES=$(awk '
  /^:root[[:space:]]*\{/                       {s1=NR; f=1; next}
  f==1 && /^\}/                                {e1=NR; f=0; next}
  /^html\[data-mode="chamber"\][[:space:]]*\{/ {s2=NR; g=1; next}
  g==1 && /^\}/                                {e2=NR; g=0; next}
  END { if (s1 && e1 && s2 && e2) printf "%d,%d,%d,%d", s1, e1, s2, e2 }
' apps/ui/app/globals.css)
[ -n "$RANGES" ] || { echo "FAIL: globals.css token blocks not found or unclosed"; exit 2; }
rg -n --no-heading -e 'oklch\(' -e '#[0-9a-fA-F]{6}\b' -e '\brgba?\(' \
  --glob '!*.disabled' --glob '!*.svg' \
  apps/ui/app apps/ui/lib apps/ui/components \
  | awk -v r="$RANGES" -F: 'BEGIN{split(r,a,",")} !($1 ~ /globals\.css$/ && (($2+0>=a[1] && $2+0<=a[2]) || ($2+0>=a[3] && $2+0<=a[4])))' \
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

---

## Changelog

### 2026-08-31 — AM4: T9-C1's write surface omitted the four landing stubs it is required to create (trigger: orchestrator pre-dispatch validation, ticket `t_40a227bb`)

**What was wrong.** Row 2 listed `page.tsx`, `LandingPage.tsx`,
`LandingChrome.tsx` and the test file — but not `LandingHero.tsx`,
`LandingSample.tsx`, `LandingMethod.tsx` or `LandingPricing.tsx`, which T9's PLAN
HOW requires C1 to create as stubs. A contract-obedient C1 could not create them,
`LandingPage`'s imports would not resolve, and the compile gate would go red on
module-not-found. AF-1 class: a write surface that contradicts the acceptance it
has to satisfy — **caught pre-dispatch this time, before the seat burned a
preflight block on it.**

**Cross-check, run in this edit:**

| Source | Says |
|---|---|
| `slices/T9/PLAN.md:64` (HOW) | *"C1 ships it with the five children as empty stubs; C2 and C4 fill them."* |
| `dispatch-order.md` row 4 (T9-C2) | writes `LandingChrome.tsx` — the chrome copy |
| `dispatch-order.md` row 5 (T9-C4) | writes `LandingHero/Sample/Method/Pricing` — the content |
| `dispatch-order.md` row 2 (T9-C1), **before** | listed neither the four stubs nor any creation duty |
| `dispatch-order.md` row 2, **after** | lists all four, annotated *empty stubs only — content is T9-C4's* |

No contradiction remains: C1 **creates** five files, C2 fills chrome, C4 fills
the other four. The hero-stub exception is stated in the stub rule above.

**Rest of row 2, re-checked against PLAN in the same edit as charged:**

- Verification command — matches T9-C1's PLAN HOW command exactly. ✓
- Serialisation note (`T9-C1` before `T3-C1` on `app/page.tsx`) — matches. ✓
- `tests/render/t9-landing.test.tsx` created by C1 with three empty `describe`
  blocks — present in row 2 and in rows 4 and 5. ✓
- The AM2/C compile gate applies to row 2 (it writes under `apps/ui/`) and is an
  acceptance default, not a per-row entry. ✓

**Class sweep — every `**Create**` target in every PLAN vs its OWN creating
cluster's dispatch row.** 32 rows parsed, 19 targets checked, **0 genuine
mismatches** (two apparent hits were a regex over-reach on
`slices/T9/PLAN.md:75`, which names `tests/render/stubs/next-headers.ts` and
`vitest.config.ts` as *existing* infrastructure — "already wired" — not as
creation targets).

**Why the sweep would not have found this one, which is the transferable
lesson.** The four stubs are invisible to a `**Create**`-marker sweep because
T9's PLAN expresses the obligation in **prose** — *"ships it with the five
children as empty stubs"* — not as a `**Create**` line with backticked paths. A
machine-checkable contract that depends on a human noticing a sentence is not
machine-checkable. Creation duties should be stated in the marked form the sweep
can see.

### 2026-08-31 — AM4 (beyond charge): the mission-final oracle still carried the AM2 prefix filter

Flagged as an open residual at the end of AM3 and left unfixed there because
`dispatch-order.md` was outside AM3's allowed writes. It is inside AM4's, and
leaving a known-blind gate in a file being edited is not defensible, so it is
closed here and declared rather than done quietly.

The mission-final oracle (cluster #32, `T8-C4`) now uses the **range-pair**
membership filter from `ADR-001` §(a) — the same one the per-cluster oracles
already use. Before this edit it used AM2's one-sided `$2+0 <= b`, which REV2
proved blind to mutants M4 (gap between the token blocks), M5 (above `:root`) and
M6 (chamber block legally relocated to EOF, which exempts the entire stylesheet).
`1 of 1` occurrence replaced; `grep -rn '\$2+0 <= b' docs/missions/ui-overhaul/`
now returns nothing.
