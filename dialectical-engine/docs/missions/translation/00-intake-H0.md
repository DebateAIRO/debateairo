# H0 INTAKE — mission `translation`

- **Date:** 2026-09-01 23:45 EEST · **Orchestrator:** Claude Code — Fable 5.1 until 2026-09-02 10:15, **Opus 5 from 2026-09-02 10:20 (V ruling: "restart the mission, with Opus 5 as orchestrator")** · **Spine:** v3.4.0 · **Board:** `translation` (Hermes Kanban :9119)
- **Siblings:** `observability-agents` is in flight in another session (its 12 dirty entries are untouchable). `ui-overhaul`'s turn waves have landed on `dev`; its T9 mode-token gate binds every CSS change made here.

## V's goal (verbatim, `/goal`, 2026-09-01)

> You are Fable on a translation mission. I want the application to be available in the most used languages across the globe. We need a UI element that allows the user to change languages whenever they feel like it. We need the application to actually be translated in those languages.
>
> What done looks like : All most important languages are shown inside the app.
> The language change menu is available at any given time within the app, and used.
>
> If needed, use /heartbeat.

## Reading of "done" (orchestrator; binding until V corrects it)

1. **"All most important languages are shown inside the app"** — the menu lists every language of row V-2, each in its own native name, on every route.
2. **"available at any given time within the app"** — every route, signed-in or anonymous, including the public debate page and the debate workspace (which suppresses the top bar and renders its own chrome — `apps/ui/components/TopBar.tsx:58`).
3. **"and used"** — the choice takes effect on every route rather than being a dead control: the page re-renders in the chosen language, `<html lang>` and text direction follow, and the choice survives reloads and navigation.
4. **"actually be translated"** — every string the app itself renders (buttons, titles, labels, aria-labels, placeholders, error and empty states, dates, relative times, plurals) comes from a per-language catalog, and nothing English leaks while another language is active. Model-generated debate content is not the app's own words (C1).

## Classification (set ONCE — spine §5.5)

```yaml
risk_tier: medium          # presentation layer only: no persistence, no migrations, no provider spend,
                           # no scoring semantics. Touches auth-screen COPY (never behaviour) → COMMON §3 zone rule.
planning_tier: 2
never_tierable_down: true
```

## R7 election — asked as explicit per-loop questions; **RULED by V 2026-09-02 (row V-1)**: "use Opus 5 subagents to do the work, and keep Fable 5.1 only as orchestrator"

```yaml
loop_ownership:
  orchestrator: claude-opus-5             # this session from 2026-09-02 10:20 (was claude-fable-5.1) — routes, launches, assembles; no verdicts, no code
  requirements: [claude-opus-5]           # REQ-01, one seat; blind reviewer REQ-REV-01
  architecture: [claude-opus-5]           # ARCH-01: the i18n contract + every slice PLAN; blind reviewer ARCH-REV-01
  programming:  [claude-opus-5]           # one worker per slice, inside that slice's worktree (V ruling 2026-09-02)
  translation:  [claude-opus-5]           # one seat per language; a programming-loop seat whose deliverable is a catalog
  review:       [claude-opus-5]           # blind, one worktree per lens
  qa:           [V]                       # developer veto is the only Done for a slice ticket
```

**Why not asked as a blocking question:** V is not in the loop mid-task (autonomous run under `/goal`); the roster is reversible per slice, so the mission proceeds on the default and V-1 carries the alternatives with their costs.

**Roster decorrelation (recorded):** from 2026-09-02 10:20 the orchestrator and every seat run on Opus 5 — packets, work and review share a base model. Decorrelation is by separate session, blind worktree, prompt, and probe-not-read ONLY; the cross-model check that existed while Fable wrote the packets is gone. V ruled both steps knowingly (2026-09-02: "use Opus 5 subagents to do the work", then "restart the mission, with Opus 5 as orchestrator"). **Consequence the fleet must carry: a reviewer's packet review is now the only cross-check on the orchestrator's packets, and it is same-model — REQ-REV-01 found 3 packet defects the author missed, which is the evidence that the check still bites.**

**Seat transport:** seats = Claude Code subagents on Opus 5 (Agent tool with `model: opus`, background, one session each, skills via the Skill tool). The first REQ-01 seat, launched on Fable 5.1 before the ruling, died on an API session-limit (HTTP 429) at ~00:05 having written nothing; re-dispatched on Opus 5. Their cwd is the git root `/Users/vladmihaimiron/Documents/DebateAIRO`, one level ABOVE the repo root — every packet says so. Hermes runs store-only (Kanban); no Hermes seat is elected, so **the orchestrator closes sub-tickets on consumed verdicts; slice tickets close only on V's veto.** Codex is not used unless V-1 says so (last probe 2026-09-01 `CODEX-SOL-OK`, codex-cli 0.148.0-alpha.9; launcher pattern `docs/missions/observability-agents/logs/launch-codex-seat.sh`).

## Measured state at intake (2026-09-01 23:50 EEST, `dev` @ `4f764037`)

- **The app:** `apps/ui` is the only Next app (Next 15.5.23, React 19, app router). Routes: `/`, `/new`, `/debate/[id]`, `/public/debate/[id]`, `/login`, `/sign-up`, `/verify-email`, `/enroll-mfa`, `/settings`, `/admin/workers`. 16,195 lines of ts/tsx under `app/`, `components/`, `lib/` (non-test).
- **i18n today: NONE.** No catalog, no `t()`, no locale state. `<html lang="en">` is hard-coded (`apps/ui/app/layout.tsx:36`). Every user-visible string is a literal in TSX or in a copy module (`lib/v3/labels.ts`, `lib/scoringStatusCopy.ts`, `lib/scoringResponse.ts`, `lib/recommendation.ts`, `lib/format.ts`, `lib/debatePresentation.ts`, `lib/scrutiny.ts`, `lib/scrutinyDepth.ts`, `lib/v3/adapter.ts`, `lib/v3/liveEvents.ts`, `components/landing/cards.ts`). Rough census: 283 JSX text nodes, plus attribute strings (aria-label / title / placeholder) and the copy modules → estimate 600–900 catalog keys. REQ-01 measures exactly.
- **Dates and times:** 8 call sites of `toLocaleDateString` / `toLocaleString` with no locale argument (`app/public/debate/[id]/PublicDebatePageClient.tsx:76`, `components/AccountErasureControls.tsx:109`, `components/PublicHonestyDrawer.tsx:29`, `components/SessionControls.tsx:161,191`, `components/PublicAnswerDisclosure.tsx:13`, `lib/format.ts:17`, `lib/v3/adapter.ts:508`); `lib/format.ts:relativeTime` builds English with hand-made plurals.
- **Chrome spots where a persistent control already renders (`ModeToggle`):** `components/TopBar.tsx:64` (auth top bar) · `components/TopBar.tsx:90` (app top bar) · `components/landing/LandingChrome.tsx:38` (anonymous landing) · `app/debate/[id]/DebatePageClient.tsx:1139` (debate toolbar, `compact`; the public debate page renders this same client in public mode — `app/public/debate/[id]/page.tsx:14`). The language menu goes adjacent to each = MENU EVERYWHERE.
- **Persistence precedent:** mode lives in `localStorage` plus a pre-hydration inline script (`layout.tsx:38-44`). Language needs a **cookie** because the SERVER must know it to render the right catalog and `lang`/`dir` without a flash. The API proxy forwards only the session and CSRF cookies (`app/api/[...path]/route.ts:82-96`), so a locale cookie never reaches the API.
- **Fonts:** `next/font/google` with `subsets: ["latin"]` for all three faces (`layout.tsx:5-25`) → 8 of the 16 target languages fall back to system fonts (row V-5).
- **CSP:** `font-src 'self'`, `connect-src 'self'` (`next.config.mjs:1`) — fonts and catalogs must be bundled/self-hosted.
- **Dev server honours `PORT`** (`apps/ui/server.mjs:10`) → seats run isolated dev servers per worktree.
- **Gates and baselines (the command the lane will run):** root `pnpm typecheck` → exit 1, 8 diagnostics, ALL in `tests/unit/s14-ui.test.ts` (references the deleted `web/` app — pre-existing since 2026-09-01) · `apps/ui` `pnpm typecheck` → exit 2, 1 diagnostic at `app/debate/[id]/DebatePageClient.tsx(1479,11)` (AnswerExport union; pre-existing) · full vitest suite NOT run at intake (exceeds the 600 s tool cap) — it runs in an external lane before the first code dispatch · `apps/ui` node suites `pnpm --filter dialectical-engine-v2ui test` (manifest of 4 `.mjs` files; `components/authRoutes.source-test.mjs` greps SOURCE for English copy).
- **Tests that read `apps/ui` SOURCE or assert English copy** (the class extraction must keep green or re-point): `tests/unit/{dr174-resilience,evaluator-dev-menu-ui,dr184-judged-standing,mfa-ui,pol01-policy,pda-s03-keyboard-accessibility,pda-s02-affordance-drift,v2ui-pages,s10-erasure-ui,t2-real-client-ip,t9-mode-tokens}.test.ts` · `tests/render/*.test.tsx` (20 files rendering real page components with fixtures — raw material for the snapshot oracle) · `apps/ui/components/authRoutes.source-test.mjs`.
- **Fleet:** zero seats of this mission alive. Port 3000 free; Kanban :9119 up. Board `translation` created 23:52 with `t_08abec96` (V-DECISIONS), `t_7bf7a8a4` (REQ-01), `t_81e24a2c` (REQ-REV-01).

## Contradiction check — orchestrator duty, resolved or routed NOW (one seat's cost, not N)

| # | Conflict | Disposition |
|---|---|---|
| C1 | "actually be translated" vs model-generated debate content, argued in whatever language the run used; DR-179 (no API keys) leaves no lawful run-time translation service | **RESOLVED by scope:** the app's own words only. **ROUTED row V-3** for a follow-up "debate language" product feature. |
| C2 | "available at any given time" vs the debate view suppresses the top bar (`TopBar.tsx:58`) | **RESOLVED:** the menu is placed in the debate toolbar next to `ModeToggle compact` (`DebatePageClient.tsx:1139`); the public page renders the same client. |
| C3 | "most used across the globe" vs the home market is Romanian (`dezbatere.ro`, `TopBar.tsx:30`) | **RESOLVED:** Romanian is included; the list is row V-2. |
| C4 | Arabic and Urdu (RTL) in the top list vs a stylesheet written with physical left/right properties | **ROUTED row V-4;** default: slice I07 mirrors the layout. |
| C5 | Design typography loaded Latin-only vs 8 non-Latin scripts | **ROUTED row V-5;** default: per-script system fallback stacks, no new font files. |
| C6 | Remembering the choice on the account vs the accounts/privacy program owning settings and account data | **ROUTED row V-6;** default: cookie only. |
| C7 | Tests that grep component SOURCE for English literals vs extraction moving literals into catalogs | **RESOLVED in-slice:** the ENGLISH IDENTITY law plus each such test re-pointed at the catalog or at rendered output; ARCH-01 enumerates the class (list above) and each extraction slice sweeps its members. |
| C8 | T9 mode-token gate (no colour literals outside the two token blocks) vs new menu styles | **RESOLVED:** constraint carried in COMMON §3; new tokens are registered in the test maps. |
| C9 | Same base model codes and reviews | **RECORDED** (decorrelation note above). |
| C10 | Vertical-slice law wants slice tickets at intake vs the slice cut being REQ-01's output | **RESOLVED:** the provisional cut below is REQ-01's input; slice tickets are created the moment REQ-REV-01 passes, with REQ-01's codes. |

## Orchestrator's provisional slice cut (REQ-01 confirms or re-cuts, with reasons)

- **I01 — Language menu + foundation.** The smallest complete end-to-end proof: the language registry, the cookie, server/client plumbing, `<html lang dir>`, the menu adjacent to every `ModeToggle`, and the CHROME strings (both top bars, landing nav, debate toolbar labels, the menu itself) translated into ALL V-2 languages. V's test: pick Español on any route → the chrome is Spanish; reload keeps it; every route shows the menu.
- **I02 — Extraction: auth + settings + account screens** (`/login`, `/sign-up`, `/verify-email`, `/enroll-mfa`, `/settings`; LoginFlow, SignUpFlow, AuthShell, AuthGate, SessionControls, AccountErasureControls, `lib/mfaEnrollment.ts` copy).
- **I03 — Extraction: landing + library + new debate** (`/`, `components/landing/*`, `cards.ts`, DebatesBuffer, LibraryComposer, `/new`, `defaults.tsx`, GuideModal, Toast).
- **I04 — Extraction: debate workspace page + views** (DebatePageClient, DebatePageGate, `loading.tsx`, DebateCanvas, DebateTree, DebateMap, DebateOutline, DebateSplit, DebateThread, CanvasViewport, ArgumentFocusView, ChallengePopover).
- **I05 — Extraction: drawers, banners, panels + copy modules** (NodeDetailDrawer, AnswerHonestyDrawer, InvestigationDrawer, DebateWorkspaceDrawer, VerdictBanner, SynthesisPanel, RecommendedInvestigations, ScoringErrorBoundary, PublicationControl, LegacyRunClaimControls, EvaluatorDevMenu, ModelPresentation; `lib/v3/labels.ts`, `lib/scoringStatusCopy.ts`, `lib/scoringResponse.ts`, `lib/recommendation.ts`, `lib/debatePresentation.ts`, `lib/scrutiny.ts`, `lib/scrutinyDepth.ts`, `lib/v3/adapter.ts`, `lib/v3/liveEvents.ts`, `lib/v3/tokenUnlock.ts`, `lib/v3/answerExport.ts`, `lib/v3/missingCapabilities.ts`).
- **I06 — Extraction: public debate + admin + leftovers, and the scanner at zero** (PublicDebatePageClient, PublicHonestyDrawer, PublicAnswerDisclosure, `/admin/workers`, `lib/v3/publicAnswerExport.ts`, `lib/v3/census.ts`, `lib/models.ts`; the "no hardcoded user-visible string" scanner reports 0 across `apps/ui`).
- **I07 — Locale-aware formatting + RTL** (`Intl` date/number/relative-time with the active locale, `dir="rtl"` for `ar`/`ur`, logical CSS properties, mirrored glyphs, per-script font fallbacks).
- **L-<code> × 16 — one slice per language:** the full catalog for that language. V's test: pick the language, walk every route, nothing English leaks.

**Dependencies:** I01 first (its API is the contract every extraction slice imports) → I02–I06 in parallel in separate worktrees (disjoint files; one catalog namespace per slice) → the English catalog is frozen → L-* × 16 in parallel; I07 in parallel with L-*. Integration on a mission branch; V test points after each slice and after the final local merge; V pushes.

## Intake completeness (spine v3.4.0; the v3.3.0 intake list, item 9)

`[x]` R7 election (explicit per-loop, defaults recorded, row V-1) · `[x]` contradiction check · `[x]` per-CLI probe (Claude subagents in-harness; Codex unused unless V-1) · `[x]` decorrelation recorded · `[x]` typed ticket per seat (wave 1) · `[x]` `rework rounds: max 3` in every packet · `[x]` self-report path in every `allowed` list · `[x]` `SKILLS LOADED` opening mandated · `[x]` watchdog armed at launch (`logs/watchdog.sh`) · `[ ]` compass + slice files (REQ-01, in flight) · `[ ]` slice tickets (on REQ-REV-01 PASS) · `[ ]` packet review by the review seat (REQ-REV-01 also reviews REQ-01's packet)

## Wave 1 dispatch — 2026-09-01

| Seat | Ticket | Role | Packet (absolute) |
|---|---|---|---|
| REQ-01 | `t_7bf7a8a4` | requirements | `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/translation/packets/REQ-01.md` |
| REQ-REV-01 | `t_81e24a2c` | reviewer (dispatched when REQ-01 hands off) | `…/packets/REQ-REV-01.md` |
| V-DECISIONS | `t_08abec96` | V | `docs/missions/translation/V-DECISIONS-PACKET.md` |

Wave 2: ARCH-01 (+ ARCH-REV-01) · slice tickets · Wave 3: CODE-I01 (+ CODE-REV-I01) · Wave 4: CODE-I02…I06 in parallel worktrees (+ reviewers) · Wave 5: LANG-* × 16 + CODE-I07 (+ reviewers) · integration → V test points → V merges and pushes.
