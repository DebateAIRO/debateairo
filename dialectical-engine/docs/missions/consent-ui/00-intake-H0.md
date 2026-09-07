# H0 INTAKE — mission `consent-ui`

- **Date:** 2026-09-06 · **Orchestrator:** Claude Code, Fable 5.1 (Claude-Router seat) · **Spine:** v3.4.0 · **Board:** `consent-ui` (Hermes Kanban, store only) · **Base:** `dev` @ `2b670d30`
- **Design of record:** `/Users/vladmihaimiron/Documents/DebateAIRO/ui_designs/DebateAI Design Document.html` (1.3 MB Claude-Design bundle, modified 2026-09-06 16:50). **Seats read the verbatim, unescaped extracts** under `docs/missions/consent-ui/design/`: `turn-10-cookie-consent.html` (artboards 10a/10b/10c markup), `turn-8a-signup.html` + `turn-8a-checkbox-group.html` (the sign-up card and its checkbox group), `design-data.js` (the token map for both modes, `mkCat`, the three cookie categories, the eight jump pills, the eleven policy sections — every string the UI must show).

## V's goal (verbatim, `/goal`, 2026-09-06)

> you are Fable orchestrating a front end mission. Your goal is to implement the cookie banner (10a) with its extended card (10b) and, on the register page, create another tickbox that states "I agree with the privacy policy". When the user clicks the tick, our modal (10c) appears to be read. User clicks "I agree", then the tickbox from the privacy policy modal gets ticket. if the User does not click the "I agree" button (or its equivalent idk how its written in the design), then the tickbox is not ticket. The user will not be able to register an account unless both "I am 18 or above" and the "privacy policy" tickboxes are checked.
>
> The design is here:
> '/Users/vladmihaimiron/Documents/DebateAIRO/ui_designs/DebateAI Design Document.html'
>
> If necessary, use /heartbeat. Coding agents will be Opus 5 agents. And a Grok 4.6 reviewer will be fired when each UI element is fully done. So only review a feature when it is truly done.

## Classification (set once — spine §5.5)

```yaml
risk_tier: medium        # UI only. Touches the sign-up flow (security-zone path in the observability mission's
                         # law) but changes NO auth logic: the request to /v1/auth/register keeps its exact shape.
planning_tier: 1
never_tierable_down: false
```

## R7 election — V answered the coding and UI-review seats inline; the rest is an orchestrator ruling (row V-1)

```yaml
loop_ownership:
  orchestrator: claude-fable-5.1        # this session — routes, launches, assembles; no verdicts, no code
  requirements: [claude-opus-5]         # RULING (V named none): Opus 5 subagent, one seat (mission is two slices)
  architecture: [claude-opus-5]         # RULING: Opus 5 subagents, one per slice, in parallel
  programming:  [claude-opus-5]         # V: "Coding agents will be Opus 5 agents"
  review:       [claude-opus-5, grok-4.6]   # Opus 5 = packet/plan/per-cluster task reviews (fresh blind sessions);
                                            # Grok 4.6 = the FINISHED-UI-ELEMENT gate per slice (V: "fired when each UI element is fully done")
  qa:           [V]                     # Done on a slice = V's veto after personally testing (vertical-slice law §6)
```

**Roster decorrelation (recorded):** requirements, architecture, code and their task reviews all share Opus 5 — decorrelation by prompt, fresh session and probe-not-read only, which is weaker than a cross-house diamond. The gate V cares about — the finished UI element — IS cross-house (Grok 4.6 reviews Opus 5 code). V chose the Grok seat knowingly; the Opus-reviews-Opus part is the orchestrator's default pending row V-1.

**Seat transport, probed 2026-09-06 17:05 EEST:** Opus 5 seats = Claude Code subagents (Agent tool, `model: opus`, background, one fresh session each; skills invoked via the Skill tool; transcripts at `~/.claude/projects/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/subagents/agent-<id>.jsonl` for the SKILLS-LOADED body check). Grok = `~/.grok/bin/grok -p … -m grok-4.6 --permission-mode bypassPermissions` (or `--prompt-file`), launched in a visible Terminal; `grok models` lists `grok-4.6 (default)`, `grok-4.5`; probe returned `ALIVE grok-4.6`. Hermes = Kanban store only, no agent seat → **the orchestrator closes sub-tickets on consumed verdicts; slice tickets `t_26efb70d` (S01) and `t_9ccf3598` (S02) close only on V's veto.**

## Measured state at intake (2026-09-06 ~17:00 EEST, `dev` @ `2b670d30`)

- Main tree: 87 dirty entries (other missions' docs; `apps/ui/components/NodeDetailDrawer.tsx`, `apps/ui/lib/v3/adapter.ts`) — untouched; slices branch from the committed HEAD.
- The https dev stack is UP on `:3000` (node pid 5436; `https://localhost:3000`, plain http answers nothing). Its dev server reads `apps/ui/app/globals.css` only at boot (memory: stop → `rm -rf apps/ui/.next` → restart when iterating on global CSS).
- **Sign-up today** — `apps/ui/components/SignUpFlow.tsx`: the 18+ checkbox exists as `<input name="adult-affirmed" type="checkbox" required>` with label "I affirm that I am at least 18 years old." (`.authCheck`, native 16px box, `accent-color: var(--pro)`); the submit button is disabled only while busy or after send (`disabled={busy || sent}`); gating today is the browser's `required` validation. `client.register(email, password, recoveryEmail, adultAffirmed)` — `packages/contract/src/client.ts:215-220`; the API records `adult_affirmed_at`. **No privacy-consent field exists anywhere** (grep `privacy_accepted|privacyAccepted|terms_accepted` over `*.ts,*.tsx` = 0 hits).
- **Cookie/consent UI:** none. **No analytics or telemetry consumer** exists in `apps/ui` — a stored preference gates nothing today (see C10).
- **Settings** (`apps/ui/app/settings/page.tsx`): identity panel only; no Privacy section (see C5).
- **Root layout** `apps/ui/app/layout.tsx`: `<div className="appShell"><TopBar />{children}</div>` + a pre-paint mode guard script — the natural app-wide mount for a consent surface.
- **Token contract:** `apps/ui/app/globals.css` (7,222 lines): exactly ONE `:root {` block (lines 5-97, Terracotta) and ONE `html[data-mode="chamber"] {` block (99-158). Gate `tests/unit/t9-mode-tokens.test.ts` → "leaves no mode-inert colour literal": any `#hex`/`rgb(a)`/`oklch` literal in `globals.css` OUTSIDE those two blocks fails; a second `:root` block is NOT recognised (`findIndex`); every new token must be registered in that test's `TERRACOTTA` / `CHAMBER` / `MODE_INDEPENDENT` maps with comma-tight values (jsdom normalises). Measured both-mode values for the tokens this mission needs are in `COMMON.md` §7.
- **Tests that touch sign-up** (all must stay green or be updated by S02 with the reason recorded): `tests/render/auth-flow-integration.test.tsx` (jsdom + `createRoot`; sets `adult-affirmed` then submits — it will need the privacy box ticked too), `tests/architecture/auth-front-door-parity.test.ts`, `tests/render/t9-landing.test.tsx`, `apps/ui/components/authRoutes.source-test.mjs` (runs only via `tests/unit/v2ui-node-runner.test.ts` → `apps/ui/scripts/run-node-tests.mjs`, from `apps/ui/`).
- **Typecheck baseline** at this HEAD is pinned by the observability mission (`docs/missions/observability-agents/TYPECHECK-BASELINE.md`): `pnpm typecheck` exit 1, **8 diagnostics, all in `tests/unit/s14-ui.test.ts`**, not ours to fix — every coding gate asserts the DELTA. Re-measured per lane in `.hermes/reports/consent-ui/logs/setup-consent-s0{1,2}.log`.
- **Fleet:** zero seats alive at intake. Worktrees created from `2b670d30`: `.worktrees/consent-s01` (branch `slice/consent-s01`) and `.worktrees/consent-s02` (branch `slice/consent-s02`); node_modules APFS-cloned from main, `generate:contract` run, baseline logged (setup script `.hermes/reports/consent-ui/logs/setup-worktrees.sh`).

## Design facts (verbatim from the extracts; the SPECs quote from the files, not from here)

- **TURN 10 intro:** "Consent surfaces: the cookie bar, and the privacy-policy modal (10c) opened from the sign-up checkboxes on 8a." — "Shown once, on first visit, over the landing page. Bottom-anchored bar in the bezel treatment; 'Choose what to store' expands the per-category panel (10b) with essential locked on. Both states follow the mode toggle."
- **10a** (1000×520 artboard): bottom-anchored bezel bar (`shell` frame, 7px padding, radius 16 → `core` panel, radius 10, gold tab 52×4 top-left), eyebrow `YOUR DATA, ON THE RECORD`, Fraunces title "We store only what keeps the bench running — unless you say otherwise.", body "Essential cookies hold your session, MFA state and device record. Analytics and model-quality telemetry are optional and never sold. You can change this any time in Settings.", buttons `Essential only` (ghost, mute) · `Choose what to store` (ghost, ink) · `Accept all` (ink pill, primary, hover scale 1.04).
- **10b** (520 wide card): eyebrow `CHOOSE WHAT TO STORE`, title "Cookie preferences", lede "Asked once. Revisit any time from Settings → Privacy.", three categories from `cookieCats` — Essential `ALWAYS ON` (on, locked, `not-allowed` cursor) · Model quality telemetry `OPTIONAL` (default on) · Product analytics `OPTIONAL` (default off) — each with tag pill, description, mono detail line (`de_session · de_mfa · de_device — 30 days` etc.) and a 38×22 toggle; footer `Privacy notice` (underlined link) · `Essential only` · `Save choices` (primary).
- **10c** (760×660 artboard; caption "opened from sign-up · scrollable, must reach the end"): dim overlay `rgba(10,8,6,.42)`, bezel modal inset 40/34; header eyebrow `PRIVACY POLICY · v2.1 · EFFECTIVE 12 AUG 2026`, title "What we store, and why", lede "Your rights and our obligations under the GDPR (EU) 2016/679, in plain language. Eleven sections — scroll to the end.", `×` close; 8 jump pills (`policyJump`); 11 sections (`policySections`, some with bullet lists); end marker `END OF POLICY · GDPR (EU) 2016/679 · v2.1`; footer "Questions: privacy@dezbatere.ro" · `Download PDF` · `I have read it` (primary).
- **8a checkbox group:** a bordered `shell` box holding two rows with 17px rounded check squares (fill `okC`, border `okBorder`): "I am 18 or over." and "I agree to the **Privacy Policy**, including that my debates may be published publicly." — the words "Privacy Policy" are the link to 10c.

## Contradiction check — resolved or routed NOW (one seat's cost, not N)

| # | Conflict | Disposition |
|---|---|---|
| C1 | V: a tickbox that states "I agree with the privacy policy" vs design 8a: "I agree to the Privacy Policy, including that my debates may be published publicly." | **RESOLVED — design wording, verbatim.** V deferred to the design in the same sentence ("idk how its written in the design"). |
| C2 | V: the user clicks "I agree" vs design 10c: the button is `I have read it`, and the caption says "scrollable, must reach the end" | **RESOLVED on the label (design); ROUTED on the behaviour — row V-2 (CONFIRM).** Default taken: `I have read it` stays disabled until the policy has been scrolled to its end marker; V did not mention this, the design requires it. |
| C3 | V: clicking the tick opens the modal vs design: the words "Privacy Policy" are the link | **RESOLVED — both entry points.** Clicking the UNCHECKED box, or the link, opens 10c without ticking; the box becomes checked ONLY through `I have read it`; `×`, Esc, or backdrop leaves it unchecked; a CHECKED box unchecks directly on click (no modal). |
| C4 | 10c shows `Download PDF`; no policy PDF exists in the repo | **ROUTED — row V-3.** Default: the button is NOT rendered (a download that fabricates a file is dishonest); the footer keeps the contact line and `I have read it`. |
| C5 | 10a copy "You can change this any time in Settings" and 10b "Revisit any time from Settings → Privacy" vs a Settings page with no Privacy section | **ROUTED — row V-4.** Default: S01 adds a minimal Settings "Privacy" panel with one `Cookie preferences` button that reopens 10b, as its own cluster and sub-ticket so V can veto it alone. Shipping the copy without the surface would be a false promise. |
| C6 | Front-end mission vs a GDPR consent record: no server field for privacy-policy acceptance or policy version | **ROUTED — row V-5 (non-blocking follow-up).** Default: UI gate only; the registration request keeps its exact shape; a follow-up ticket proposes `privacy_accepted_at` + policy version server-side. |
| C7 | Existing label "I affirm that I am at least 18 years old." (native checkbox) vs design 8a "I am 18 or over." in a bordered group with custom check squares | **RESOLVED — 8a is the design of record for the sign-up card; adopt its group and wording. Row V-6 (CONFIRM).** The backend field (`adult_affirmed`) is unchanged. |
| C8 | 10b's `Privacy notice` opens 10c, which S02 builds — a cross-slice dependency | **NOT a contradiction; sequencing is ARCH's.** Recommendation: S02-C1 builds the modal as a standalone, prop-driven component FIRST (read-only mode has no consent side effect); S01's wiring cluster pulls `slice/consent-s02` into its lane (seats may pull current state into their folder — orchestrator §6.4). |
| C9 | "Shown once, on first visit, over the landing page" vs signed-in users who never see the landing at `/` | **RESOLVED — app-wide mount in the root layout, every route, until a decision is stored.** "First visit" = no stored decision under the versioned key; clearing site data re-asks. Row V-7 (CONFIRM). |
| C10 | Telemetry / analytics preferences with no consumer in the product | **RESOLVED — store the decision honestly; load or unload nothing; the SPEC says so.** Future consumers read the stored decision; no fake script gating. |

## Intake completeness (spine v3.3.0 item 9)

`[x]` R7 election · `[x]` contradiction check · `[x]` per-CLI probe (grok-4.6 ALIVE 17:05; Opus subagents in-harness) · `[x]` decorrelation recorded · `[x]` typed tickets: S01 `t_26efb70d`, S02 `t_9ccf3598`, REQ-01 `t_5916299b`, REQ-REV-01 `t_12513808`, V-DECISIONS `t_419b393a` · `[x]` `rework rounds: max 3` in every packet · `[x]` self-report path in every `allowed` list · `[x]` `SKILLS LOADED` opening mandated · `[x]` watchdog armed at first dispatch 17:13 (`.hermes/reports/consent-ui/logs/watchdog.sh`, pid file beside it; board+disk monitor in-session) · `[ ]` compass + slice files (REQ-01) · `[ ]` packet review by the review seat (REQ-REV-01) · `[x]` one worktree per slice, baseline in progress.
