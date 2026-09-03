# I01 — Language foundation and the menu · SPEC

> **SPEC v2 — supersedes `SPEC-v1.md`, 2026-09-02, REQ-01 rework round 1.**
>
> Written in answer to the blind review `docs/missions/translation/reviews/REQ-REV-01.md`. This is a **defect correction with no scope change**, so it needs no V ratification; v1 is archived beside this file and remains the record of what was frozen first.
>
> **What changed:** B2 — added `I01-R21` covering mission requirements R10 and R12, which no slice traced (coverage was 54/56, reported as 56/56). N9 — the owned-files section now separates extraction ownership from write concurrency and names `app/globals.css` and `tests/unit/t9-mode-tokens.test.ts` as conditional writes. N1 — `lib/authNavigationGuard.ts` assigned here. R55 (`layout.tsx` metadata) moved here from I10, which does not own that file.

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I01` · catalog namespace `chrome` · census **22** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Build the language machinery and the menu, and prove the whole idea end to end on the chrome alone: a registry of seventeen languages, a cookie that carries the choice, first-visit negotiation from the browser, server-rendered `lang` and `dir`, a menu beside every mode toggle, and the twenty-two chrome strings translated into all seventeen languages.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I01-R01` | A module exports the seventeen languages of `requirements/translation.md` §Q2, each with its BCP-47 code, native name, English name, script, direction and CLDR cardinal categories read from `Intl.PluralRules` at module load rather than hard-coded. | R04, R40 |
| `I01-R02` | A `LanguageMenu` component renders as a native `<button>` with `tabIndex` 0, a non-empty accessible name containing the active language's native name, no `disabled` attribute, no `aria-disabled="true"`, and neither `role="tab"` nor `role="tablist"`. | R05, R07 |
| `I01-R03` | With the list open, ArrowDown and ArrowUp move the highlighted option, Enter and Space choose the highlighted one, Escape closes without changing the language, and focus returns to the button. | R06 |
| `I01-R04` | The active language's option carries `aria-current="true"` and every option is labelled by the native name from the registry. | R04, R07 |
| `I01-R05` | `LanguageMenu` renders as a sibling of `<ModeToggle` inside the same parent element at all four sites: `components/TopBar.tsx:64`, `components/TopBar.tsx:90`, `components/landing/LandingChrome.tsx:38`, `app/debate/[id]/DebatePageClient.tsx:1139`. | R01, R02, R08 |
| `I01-R06` | In the debate toolbar the component renders its compact variant, which is one focusable element. | R03 |
| `I01-R07` | Choosing a language writes the cookie `__Host-debateai-locale` with `Path=/`, `Secure`, `SameSite=Lax`, `Max-Age=31536000` and no `Domain`, and its value is one of the seventeen codes. | R13, R14 |
| `I01-R08` | The choice handler calls none of `window.location.assign`, `window.location.replace`, `window.location.href =`, `window.location.reload`, and the URL is byte-identical before and after a choice. | R09, R11 |
| `I01-R09` | The choice is written nowhere but that cookie: no `localStorage`, no `sessionStorage`, no account record, no API request. | R17 |
| `I01-R10` | `filteredSessionCookies` in `app/api/[...path]/route.ts` still admits exactly `__Host-debateai-session` and `__Host-debateai-csrf` after this slice, and the locale cookie never reaches the API. | R15 |
| `I01-R11` | A pure negotiation function maps an `Accept-Language` header to a language code and has a committed test table containing at least the twelve rows of R19. | R18, R19 |
| `I01-R12` | A request with no locale cookie is served in the negotiated language and no cookie is written by negotiation. | R20 |
| `I01-R13` | A request whose locale cookie value is not one of the seventeen codes is served in English, and the rejected value appears nowhere in the response body or headers. | R16 |
| `I01-R14` | The `<html>` element carries `lang` equal to the active code and `dir` equal to `rtl` for `ar` and `ur` and `ltr` otherwise, present in the first bytes of the server response before any script runs. | R21, R22 |
| `I01-R15` | `locales/<code>/chrome.json` exists for all seventeen codes, carries the identical key set, has no empty value, and preserves every `{placeholder}` name. | R25, R26, R27, R28 |
| `I01-R16` | Every one of the 22 chrome strings in `components/TopBar.tsx`, `components/ModeToggle.tsx`, `components/landing/LandingChrome.tsx` and `app/layout.tsx` is read from `chrome.json`, and the brand marks `Dialectical Engine`, `DebateAI` and `dezbatere.ro` and the glyphs `☀ ☾ → ⚙` remain literals. | R23, R31 |
| `I01-R17` | Rendering the four owned files in English after this slice produces HTML byte-identical to the baseline captured from `4f764037` with the same fixtures. | R34, R35 |
| `I01-R18` | The menu introduces no colour literal outside the first `:root {` and `html[data-mode="chamber"] {` blocks of `app/globals.css`, and every new token is registered in the `TERRACOTTA`, `CHAMBER` or `MODE_INDEPENDENT` map of `tests/unit/t9-mode-tokens.test.ts` with comma-tight values. | R44 |
| `I01-R19` | At a 390px-wide viewport the control is visible in the top bar and in the debate toolbar with no horizontal scrolling of the page body. | R45 |
| `I01-R20` | The menu introduces no new font family. | R46 |
| `I01-R21` | `app/layout.tsx`'s `metadata.description` is read from `chrome.json` and `metadata.title` is not, because the title is the brand mark. | R55 |
| `I01-R22` | Catalogs are files committed to the repository: this slice adds no run-time translation call and no translation service dependency. | R24 |
| `I01-R23` | A key present in English and absent at run time renders the English value and never renders empty and never renders the key name. | R29 |
| `I01-R24` | The JavaScript delivered for a route in language X contains no catalog value belonging to another language, and the transferred JavaScript for a cold load of `/` in any of the seventeen languages exceeds the English baseline by no more than 25 KB after gzip, measured with the same command before and after. | R30 |
| `I01-R25` | A choice made on one route survives a browser reload of that route and of every other route, and every subsequent route rendered in that browser is in the chosen language until another choice is made or the cookie is cleared — proven by a server-render assertion per route, not only by the browser walk. | R10, R12 |
| `I01-R26` | No file under `apps/api`, `packages/crypto`, `packages/db` or `migrations` changes — a fence that binds every slice of this mission, stated here because I01 is the only slice that builds new infrastructure. | R50 |

## States

- **Closed** — the control shows the active language's native name and, in the compact variant, its code.
- **Open** — the seventeen options are listed, the active one carries `aria-current="true"`, one option is highlighted.
- **Choosing** — the cookie is written and the route re-renders; the control stays mounted and focused.
- **No cookie (first visit)** — the negotiated language is active and no cookie exists yet.
- **Invalid cookie** — English is active and the invalid value is discarded.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | Open `https://localhost:3000/` in a fresh private window. | The landing page renders. A language control sits next to the ☀/☾ mode toggle in the floating nav. |
| 2 | Click the language control. | A list opens showing seventeen entries, each in its own script: English, 简体中文, हिन्दी, Español, العربية, Français, বাংলা, Português (Brasil), Русский, اردو, Bahasa Indonesia, Deutsch, 日本語, 한국어, Türkçe, Tiếng Việt, Română. |
| 3 | Choose **Español**. | The list closes and the nav reads in Spanish — Método, Transcripciones, Precios and the call to action. The address bar is unchanged: still `https://localhost:3000/`. The page does not scroll to the top. |
| 4 | Press F5 to reload. | The page comes back in Spanish. There is no visible flash of English first. |
| 5 | Right-click the page and choose View Page Source. | The first line contains `<html lang="es" dir="ltr"`. |
| 6 | Navigate to `/login`, then `/new`, then `/settings`, then open any debate, then open a published debate URL. | On every one of those five routes a language control is present next to the mode toggle, and the chrome — top bar titles, Account, + New debate, Settings, the debate toolbar's Library / Replay / Workspace / Honesty labels — is in Spanish. |
| 7 | Return to the landing page, open the control and choose **العربية**. | The chrome renders in Arabic and the page mirrors: the call to action moves to the left side of the nav. |
| 8 | View Page Source again. | The first line contains `<html lang="ar" dir="rtl"`. |
| 9 | Open the control, press Escape. | The list closes, the language is still Arabic, and the keyboard focus ring is on the control. |
| 10 | With focus on the control press Enter, then ArrowDown four times, then Enter. | The list opens, the highlight moves down four entries, and the language changes to the highlighted one. |
| 11 | Open a new private window and set the browser's preferred language to German before visiting `https://localhost:3000/`. | The chrome renders in German on the first paint, with no cookie yet set. |
| 12 | Switch the mode toggle to ☾ Chamber and open the language list. | The list renders in the dark palette with the same type and border treatment as the rest of the chrome. |
| 13 | Narrow the browser window to 390px wide and look at the top bar and at a debate's toolbar. | The language control is visible in both, and the page body does not scroll sideways. |

## Out of scope

- Extracting any string outside the four owned files — every other file keeps its literals until its own slice.
- Dates, numbers and plurals (slice I11).
- Right-to-left CSS mirroring beyond `dir` on `<html>` (slice I11).
- The hardcoded-string scanner reaching zero (slice I10).
- Any change to authentication, session, CSRF or proxy behaviour.

## Owned files — exhaustive

**Extraction ownership** — this slice moves these files' strings into the catalog, and no other slice does. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/components/TopBar.tsx` | 12 |
| `apps/ui/components/ModeToggle.tsx` | 4 |
| `apps/ui/components/landing/LandingChrome.tsx` | 5 |
| `apps/ui/app/layout.tsx` | 1 |
| `apps/ui/lib/authNavigationGuard.ts` | 0 |
| `apps/ui/lib/i18n/**` (new: registry, negotiation, cookie, lookup) | — |
| `apps/ui/components/LanguageMenu.tsx` (new) | — |
| `apps/ui/locales/<17 codes>/chrome.json` (new) | — |
| the mount edit — one import and one element — in `components/TopBar.tsx`, `components/landing/LandingChrome.tsx` and `app/debate/[id]/DebatePageClient.tsx` | — |
| **Total** | **22** |

**Write concurrency** — a different property from extraction ownership, and this section is the one that satisfies the SINGLE WRITER law. This slice writes the files below without owning them for extraction; each row names the wave rule that makes the write safe.

| Also written | What this slice does to it | Why it is not a concurrent write |
|---|---|---|
| `apps/ui/app/debate/[id]/DebatePageClient.tsx` | mount edit only — one import and one `<LanguageMenu compact />` element | I05 owns it for extraction. I01 merges before I05 starts, so the two writes are sequential, never concurrent. |
| `apps/ui/app/globals.css` | conditional — only if the menu needs a new mode token | I11 owns it. I01 merges before I11 starts (I11 now runs last of the code slices). |
| `tests/unit/t9-mode-tokens.test.ts` | conditional — only if the menu adds a token, which must be registered in the TERRACOTTA / CHAMBER / MODE_INDEPENDENT maps | No slice owns this test. It is base-RED at `4f764037`, so it supplies no evidence; registering a token is a required edit under the T9 gate, not a green-signal claim. |

