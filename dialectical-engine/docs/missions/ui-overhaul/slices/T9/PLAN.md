# PLAN — T9 Landing page

> Packet REQ-01 binds Requirements to author WHAT-proves clusters here.
> Architecture still owns HOW (modules, token extraction, file surfaces).
> Quantifiability law binds both seats.

**Goal:** Anonymous `/` is the TURN 9 landing (translated app-vocab copy);
signed-in `/` stays library; stub nav; mode toggle; static placeholders;
anonymous `Start a debate` → auth → New debate.

**Spec:** `docs/missions/ui-overhaul/slices/T9/SPEC.md` v3

**Status:** ARCHITECTURE FILLED (ARCH-01, 2026-08-31). WHAT/acceptance columns
are Requirements' and are unchanged; every `HOW` block and every verification
command below is Architecture's.

**Architecture references** (read before claiming any cluster here):
`docs/missions/ui-overhaul/architecture/` — `token-inventory.md`,
`ADR-001-token-surface.md`, `ADR-002-mode-mechanism.md`,
`ADR-003-landing-route-split.md`, `ADR-004-auth-return-path.md`,
`ADR-005-contrast-pins.md`, `ADR-006-ui-test-contract.md`, `dispatch-order.md`.

**T9-C3 is the mission's Wave 0.** It is the sole writer of
`apps/ui/app/globals.css` and it ships before every other cluster in every
slice. Claim order inside T9 is therefore **C3 → C1 → C2 → C4 → C5**, not
numeric order.

## Quantifiability law

- Every step markable done / not-done with no judgement call.
- Forbidden acceptance words: the vague set banned by `heartbeat-requirements` §4 (do not use those adjectives in acceptance lines).
- Every step names: cluster id · acceptance test · file surface (ARCH fills
  surfaces).
- Every PLAN step traces to a SPEC sentence; every SPEC R has ≥1 step.
- Three-run law on each cluster verification command.
- UNVERIFIED is a valid answer.
- Acceptance cells name literal strings, controls, or measurable markers — never bare `Assert`.

## Clusters (WHAT each proves)

### T9-C1 — Route split: anonymous landing vs signed-in library

**Proves:** R1, R2 — `/` content depends on session presence as V ruled.

| Step | SPEC | WHAT | Acceptance (automatable) |
|---|---|---|---|
| T9-C1-1 | R1 | Logged-out `/` document contains hero headline `Find the weakest claim in your own argument.` | Render/route test: no-session `/` includes that exact string |
| T9-C1-2 | R2 | Signed-in `/` shows library chrome, not landing-only hero | Render/route test: session `/` includes `Your debates` or `+ New debate` AND excludes hero headline `Find the weakest claim in your own argument.` as primary body |

**HOW (ARCH).**

- **Modify** `apps/ui/app/page.tsx`. It is already `async`, already
  `export const dynamic = "force-dynamic"`, and its first statement already
  reads the cookie:
  `const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value ?? null;`
  Add one early return immediately after it:
  `if (token === null) return <LandingPage />;` — everything below that line is
  untouched.
- **Create** `apps/ui/components/landing/LandingPage.tsx`, a **server**
  component (no `"use client"`), so the landing is in the initial HTML and
  `renderToStaticMarkup` can assert it. Signature:
  `export function LandingPage(): JSX.Element` — composes `LandingChrome`,
  `LandingHero`, `LandingSample`, `LandingMethod`, `LandingPricing` in that
  order. C1 ships it with the five children as empty stubs; C2 and C4 fill them.
- **Do not** import `AuthGate` into `apps/ui/app/page.tsx` (T9 R1 forbids the
  login-replaces-landing behaviour). The mechanical guard is a source assertion
  in the new test that `apps/ui/app/page.tsx` contains no `AuthGate`.
- The branch predicate is cookie PRESENCE, not session validity — rationale and
  its known divergence from a literal reading of R2 in `ADR-003`, routed as
  `open-questions.md` Q-01.
- **Create** `tests/render/t9-landing.test.tsx` with exactly three empty
  `describe` blocks — `route split`, `chrome and CTAs`, `body content` — so C1,
  C2 and C4 own one block each and never edit the same hunk. C1 fills
  `route split`, mocking `next/headers` through the existing
  `tests/render/stubs/next-headers.ts` alias already wired in `vitest.config.ts`.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t9-landing.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/architecture/s8-publication-contract.test.ts
```

`pda-s03` renders `apps/ui/app/page.tsx` in jsdom and `s8-publication-contract`
reads it as source; both are in the command because they READ the file this
cluster WRITES (`architecture/test-migration.md`).

### T9-C2 — Landing chrome, CTAs, stub nav

**Proves:** R4, R5 — nav labels and CTAs exist; stubs do not hard-crash; anonymous Start path is auth→New debate.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C2-1 | R4 | Labels `Method`, `Transcripts`, `Pricing` are in the landing document | Assert all three strings present on anonymous `/` |
| T9-C2-2 | R5 | `Start a debate` and `Read a scored transcript` are present | Assert both strings on anonymous `/` |
| T9-C2-3 | R4 | Stub nav click does not hard-crash the document | Interaction test: click each of Method/Transcripts/Pricing; assert document still has `DebateAI` wordmark and no uncaught error boundary |
| T9-C2-4 | R5 | Logged-out `Start a debate` enters auth with return to New debate | Assert CTA target is sign-in or sign-up URL/route that includes a return path resolving to New debate after auth (ARCH documents param name); mutant `href="#"` alone without auth entry = RED |

**HOW (ARCH).**

- **Create** `apps/ui/components/landing/LandingChrome.tsx` — wordmark
  `DebateAI` in `--font-display`, the three stub anchors, the primary CTA, and
  `<ModeToggle />`. Stubs are `<a href="#method">`, `<a href="#transcripts">`,
  `<a href="#pricing">` — real in-document anchors, which is what "must not
  hard-crash" (R4) reduces to when there is nothing to navigate to.
- **Create** `apps/ui/lib/returnPath.ts` — the whole `?next=` contract:

  ```ts
  export const RETURN_PATH_ALLOW_LIST = ["/new", "/", "/settings"] as const;
  export const DEFAULT_RETURN_PATH = "/#start-a-debate";
  export function safeReturnPath(raw: string | null | undefined): string;
  ```

  `safeReturnPath` returns `DEFAULT_RETURN_PATH` unless `raw` is a string that
  begins `/`, whose second character is neither `/` nor `\`, contains no `\`,
  and whose path part (before any `?`/`#`) is either an exact member of
  `RETURN_PATH_ALLOW_LIST` or matches `/^\/public\/debate\/[A-Za-z0-9._~-]{1,128}$/`.
  Rationale, and why the shape checks are kept alongside the allow-list, in
  `ADR-004`.
- **Modify** `apps/ui/components/LoginFlow.tsx` — replace the module constant
  `const HOME_PATH = "/#start-a-debate"` with a read at navigation time inside
  `navigateHome`:
  `window.location.assign(safeReturnPath(new URLSearchParams(window.location.search).get("next")))`.
  **Keep the `onAuthenticated` prop and its default** — `web-auth-login` and
  `auth-flow-integration` inject their own callback, and removing the seam
  breaks both.
- **Modify** `apps/ui/components/SignUpFlow.tsx` — its
  `Already have one? Log in` link forwards the current `next` value.
- **Do not** thread `next` through MFA enrolment: enrolment is a mandatory gate
  (T8 R3) and a deep link must not survive an incomplete security ceremony.
- Landing CTA target: `/login?next=%2Fnew`.
- **Create** `tests/unit/t9-return-path.test.ts` — a hostile-input table over
  `safeReturnPath`, minimum cases: `"//evil.example"`, `"https://evil.example"`,
  `"/\\evil.example"`, `"javascript:alert(1)"`, `"/nope"`, `null`, `""`,
  `"/new"`, `"/new?x=1"`, `"/public/debate/abc-123"`,
  `"/public/debate/../../etc"`.

**New step (ARCH-added, traces to R5 and to `ADR-004`):**

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C2-5 | R5 | `safeReturnPath` rejects every off-origin and scheme-bearing input | For each of `//evil.example`, `https://evil.example`, `/\evil.example`, `javascript:alert(1)`, `/nope`: assert the return value is exactly `/#start-a-debate`. For `/new` and `/public/debate/abc-123`: assert the value is returned unchanged. A function that returns its input unmodified = RED |

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/unit/t9-return-path.test.ts tests/render/t9-landing.test.tsx tests/render/auth-flow-integration.test.tsx tests/architecture/auth-front-door-parity.test.ts
```

### T9-C3 — Mode toggle + design tokens applied

**Proves:** R3 — Terracotta ↔ Chamber toggle; named fonts/palette applied to landing surfaces.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C3-1 | R3 | A mode control exists on landing | Assert toggle control present (role/label ARCH pins) |
| T9-C3-2 | R3 | Activating toggle changes a measurable mode attribute/class/token set between Terracotta and Chamber | Assert before/after mode marker differs |
| T9-C3-3 | R3 | Named tokens are applied on landing surfaces (not orphan CSS) | Assert computed style or data-token on landing root/card uses Fraunces or Plus Jakarta Sans AND a palette value resolving to `#C15F3C` or `#3F7466` or `#E7E2D8`/`#f0eee6` or `#111111` (ARCH-documented aliases OK); orphan `tokens.css` unused by landing = RED |

**HOW (ARCH) — this is Wave 0. Every other cluster in every slice is gated on it.**

- **Modify** `apps/ui/app/globals.css`: write `:root { … }` (Terracotta) and
  `html[data-mode="chamber"] { … }` (Chamber) at the top of the file, both
  declaring the same key set, with the exact values in
  `architecture/token-inventory.md`. Keep all 69 existing variable NAMES and
  redefine their values; add the new names beside them. Not a separate
  `tokens.css` — `ADR-001` records why, and the reason is that jsdom does not
  follow `@import` and a standing test already injects this file by path.
- **Modify** `apps/ui/app/layout.tsx`: replace `Source_Serif_4` and
  `Hanken_Grotesk` with `Fraunces` (axes `["SOFT","WONK","opsz"]`, no `weight`)
  and `Plus_Jakarta_Sans`; keep `JetBrains_Mono`. Exact call in
  `token-inventory.md` §Fonts, verified against the installed
  `next/font` data. Add the no-flash `<head>` script from `ADR-002` — with its
  `try/catch`, which is required, not defensive padding. `<html>` and `<body>`
  already carry `suppressHydrationWarning`; do not remove them.
- **Create** `apps/ui/components/ModeToggle.tsx`:
  `export type Mode = "terracotta" | "chamber"; export function ModeToggle(): JSX.Element`.
  Renders one `<button type="button" className="modeToggle" data-mode-toggle
  aria-pressed={…} aria-label={…}>`; label `☾ Chamber` in Terracotta,
  `☀ Terracotta` in Chamber. Reads initial state from
  `document.documentElement.dataset.mode`, never from `localStorage` — the head
  script is storage's single reader, so the two cannot disagree.
- **Modify** `apps/ui/lib/debatePresentation.ts:268` — the hard-coded
  `"oklch(0.82 0.006 80)"` connector colour becomes `var(--line-strong)`.
- **Create** `tests/support/contrast.ts` and `tests/support/tokenContract.ts` —
  signatures in `ADR-005` and `ADR-006`. `tokenContract` loads the real
  `globals.css` into jsdom, exactly as
  `tests/unit/pda-s03-keyboard-accessibility.test.ts` already does.
- **Create** `tests/unit/t9-mode-tokens.test.ts`.

**Correction to the acceptance mechanism in T9-C3-3, and why it matters.**
Measured against this repo's jsdom on 2026-08-31:
`getComputedStyle(el).background` where the declared value is `var(--bg)`
returns the literal string `"var(--bg)"`, and `.backgroundColor` returns
`rgba(0, 0, 0, 0)`. **A "computed style resolves to `#C15F3C`" assertion cannot
pass in this harness for the right reason.** But
`getComputedStyle(document.documentElement).getPropertyValue("--con")` returns
`"#C15F3C"`, and setting `data-mode="chamber"` re-cascades it live. So
T9-C3-3's `data-token` branch is the one that works, read off the real
stylesheet. This is a *mechanism* choice inside an acceptance Requirements
already wrote as "computed style **or** data-token"; the WHAT is unchanged.

**New steps (ARCH-added; T9-C3-4 traces to R3 and `ADR-001`, T9-C3-5 to R3 and `ADR-005`):**

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C3-4 | R3 | No colour literal survives outside the two token blocks | Run the sweep command in `ADR-001` and quote its output verbatim; assert the residual count is `0`. A non-zero count is a colour that cannot respond to the mode switch, i.e. a Chamber bug that only appears in dark mode |
| T9-C3-5 | R3 | Every text token clears 4.5:1 and every meaning-bearing non-text token clears 3.0:1, against all four surface tokens, in both modes | Read each token with `getPropertyValue` off the real stylesheet, compute `contrastRatio`, assert the worst pair per token meets its floor. Values and floors in `ADR-005`; a test that hard-codes the palette and checks it against itself = RED |
| T9-C3-6 | R3 | Both blocks declare the same mode-bearing key set | Assert `declaredTokenNames()` and `chamberTokenNames()` agree on the mode-bearing subset. A token in one block only is the defect that produces exactly one wrong colour in dark mode |

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts
```

### T9-C4 — Method ledger, sample cards, placeholders

**Proves:** R6, R7, R8 — method 01–04, full R6 card anatomy, static placeholders.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C4-1 | R7 | Method steps include titles `Models argue`, `They review each other`, `You challenge`, `Verdict with receipts` | Assert all four strings on anonymous `/` |
| T9-C4-2 | R6 | Sample block shows full R6 anatomy on ≥1 card | Assert in landing sample region: stance or type chip (`PRO`/`CON`/`REASONING`), `BASE`, `FINAL`, a model attribution line (e.g. contains `·`), and `REVIEW AGREED BY:` or `REVIEW DISPUTED BY:` — BASE/FINAL alone = RED |
| T9-C4-3 | R8 | Placeholder slots remain static `[PLACEHOLDER]` glyphs this mission | Assert `[PLACEHOLDER] debates argued this week` AND pricing strip contains literal `[PLACEHOLDER]`; either missing or a live numeric counter without V DECISIONS closure = RED |
| T9-C4-4 | R7/copy | Binding marketing paragraphs + METHOD step bodies present (translated) | Assert hero body substring `softest point in your reasoning` AND closing `weakest claim` AND `Four steps, then you do it again tomorrow.` AND method bodies `Five frontier models build the tree — pro, con, and the reasoning that binds them.` AND `Every claim is cross-reviewed by a rival model: agree or dispute, on the record.` AND `Flag any sentence; the graph spawns a focused rebuttal where you pointed.` AND `Scores, condition marks, and replay handles — every number traces to its source.` |

**HOW (ARCH).**

- **Create** `apps/ui/components/landing/LandingHero.tsx` (eyebrow, headline,
  body, two CTAs, meta triple), `LandingSample.tsx` (`ONE DEBATE, FOUR TURNS`
  + the Pro/Con/Reasoning cards), `LandingMethod.tsx` (steps 01–04),
  `LandingPricing.tsx` (the strip). All server components; the only client
  island the landing mounts is `ModeToggle`.
- **Copy is verbatim from the SPEC, not paraphrased.** Every string in T9
  SPEC §Copy is a binding literal, including the hero body, the after-sample
  close, the method intro and arena lines, and the pricing CTA line. The
  vocabulary mapping (`round`→`debate`, `joint`→`claim`, `bench`→`the graph`)
  is CLOSED by V in `T9/DECISIONS.md`; the design's own words must NOT be
  copied through from the artboards.
- The sample cards use the **token and class vocabulary** of the canvas card
  (`data-bezel="shell"|"core"`, `data-stance`, the bezel classes) but are NOT
  the canvas component: `DebateCanvas`'s card is bound to a `DebateNode` and to
  live scoring state, and reusing it here would drag the scoring data layer onto
  an anonymous route. Sharing the vocabulary is what keeps them from drifting
  visually.
- `[PLACEHOLDER]` stays a literal string in the JSX. No counter, no price feed,
  no env lookup — V closed this on 2026-08-31 and `T9-C4-3` makes a live counter
  RED.
- Type scale: `--t-hero` is `clamp(44px, 9.2vw, 118px)` with
  `font-variation-settings: var(--fvs-display)` and `font-weight: var(--fw-display)`
  (480). The artboards are fixed 1280px compositions; `clamp()` anchored on the
  artboard value is how a 118px headline survives a 390px viewport.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t9-landing.test.tsx
```

### T9-C5 — Render-pin migration bind

**Proves:** R9 — OLD UI pins for this surface are not the mission bar.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C5-1 | R9 | ARCH names the `tests/render/**` files that pinned OLD `/` or home chrome for the replaced surface | DECISIONS or PLAN appendix lists those paths under `tests/render/` |
| T9-C5-2 | R9 | Those tests pass against NEW translated landing strings / signed-in split | Three-run vitest on the named files |

**HOW (ARCH) — the named pin files.**

T9's surface is `apps/ui/app/page.tsx`, `apps/ui/app/layout.tsx`,
`apps/ui/app/globals.css`. The standing tests that READ those files — the list
is complete, `4 of 4`, from `architecture/test-migration.md`:

| File | Class | What moves |
|---|---|---|
| `tests/unit/pda-s03-keyboard-accessibility.test.ts` | **RETARGET** | renders `app/page.tsx` in jsdom AND `readFileSync`s `app/globals.css`. Its tab labels `Your Debates` / `Public Debates` are recased by T3; its `?tab=` link contract, `tabIndex`, `aria-current` and no-`role="tab"` assertions are PRESERVED unchanged |
| `tests/architecture/s8-publication-contract.test.ts` | **RETARGET** | reads `app/page.tsx` as source |
| `tests/unit/v2ui-pages.test.ts` | **RETARGET** | 618 lines of page-source wiring guards |
| `tests/architecture/auth-front-door-parity.test.ts` | **RETARGET** | reads `LoginFlow.tsx` / `SignUpFlow.tsx`, both changed by T9-C2 |

**No `tests/render/**` file pins the OLD `/` landing chrome** — measured, not
assumed: no file under `tests/render/` asserts the home-page hero or the
library composer copy. The T9 pin migration is therefore entirely in
`tests/unit/` and `tests/architecture/`, which is *outside* the surface R9's
sentence names. Recorded in `T9/DECISIONS.md` and routed as
`open-questions.md` Q-10's sibling; the SPEC is frozen, so this PLAN names the
files R9 delegates to ARCH and does not edit R9.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/unit/pda-s03-keyboard-accessibility.test.ts tests/architecture/s8-publication-contract.test.ts tests/unit/v2ui-pages.test.ts tests/architecture/auth-front-door-parity.test.ts
```

## Open dependencies — CLOSED by Architecture

- Auth return-path parameter: **`next`**, validated by
  `apps/ui/lib/returnPath.ts` (`ADR-004`).
- Contrast threshold for R3: **4.5 : 1** text, **3.0 : 1** meaning-bearing
  non-text, worst pair over four surface tokens, both modes (`ADR-005`).
- T3 library markers used in T9-C1-2: the strings `Your debates` and
  `+ New debate`, matching T3 SPEC §Copy. T3-C1 ships them; T9-C1 asserts them.

## SPEC ↔ PLAN trace (both directions)

| SPEC | Covered by | | Step | Traces to |
|---|---|---|---|---|
| R1 | T9-C1-1 | | T9-C1-1 | R1 |
| R2 | T9-C1-2 | | T9-C1-2 | R2 |
| R3 | T9-C3-1, -2, -3, -4, -5, -6 | | T9-C2-1 | R4 |
| R4 | T9-C2-1, T9-C2-3 | | T9-C2-2 | R5 |
| R5 | T9-C2-2, T9-C2-4, T9-C2-5 | | T9-C2-3 | R4 |
| R6 | T9-C4-2 | | T9-C2-4 | R5 |
| R7 | T9-C4-1, T9-C4-4 | | T9-C2-5 | R5 |
| R8 | T9-C4-3 | | T9-C3-* | R3 |
| R9 | T9-C5-1, T9-C5-2 | | T9-C4-* | R6, R7, R8 |
| | | | T9-C5-* | R9 |

9 of 9 SPEC requirements covered; 17 of 17 steps trace to a requirement.

## Refutation (ARCH, `heartbeat-architecture` §3)

| Cluster | Mutant its command detects | Mutant it does NOT detect |
|---|---|---|
| T9-C1 | the early return deleted, so anonymous `/` renders the library; `AuthGate` added to `page.tsx`; `LandingPage` made a client component so the HTML ships empty | a landing that renders with the right strings but the wrong section ORDER — no step asserts DOM order on the landing |
| T9-C2 | CTA wired to `#`; CTA wired straight to `/new` (bounces off `AuthGate`); a missing `next` parameter; `safeReturnPath` returning its input unmodified | a `next` value that is on the allow-list but wrong for the user's journey — `/settings` is accepted and would be a bad landing after "Start a debate" |
| T9-C3 | a Chamber block never written, written under the wrong selector, or missing a key the `:root` block has; a token below its contrast floor in either mode; a surviving colour literal | `--muted` text placed on `--con-bg` by a component — that pair is not in the enumerated surface set, and catching it needs a real browser (V's manual step) |
| T9-C4 | any binding paragraph paraphrased; a method step missing; `[PLACEHOLDER]` replaced by a live counter; a sample card with BASE/FINAL but no review line | a sample card whose BASE/FINAL numbers are internally inconsistent — the assertion is on presence and anatomy, not on arithmetic |
| T9-C5 | any of the four standing tests going red from the T9 diff | a standing test that was ALREADY red before T9 — the worker's RED-before-GREEN evidence is what separates the two, and this command cannot |
