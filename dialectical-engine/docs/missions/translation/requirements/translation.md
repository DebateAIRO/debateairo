# Translation — requirements (mission translation)

## Verdict summary

- **Surface: 1349 translatable strings in 73 of 91 files** — measured by a TypeScript AST walk, hand-verified against two files, and corrected in rework round 1 by two class sweeps that removed 22 rows (15 machine-code invariants, 7 CSS values). The intake's 600–900 estimate was low by roughly half.
- **Languages: 17** (English + 16, V-2's default, unchanged). Plural categories, direction and numbering systems are read from ICU, not recalled.
- **Slices: 27** — 11 that build and extract (I01–I11) and 16 that translate (`L-<code>`), one catalog namespace per code slice. Extraction ownership is a partition of all 91 scanned files; **write concurrency is stated separately in every SPEC**, because they are different properties and only the second satisfies SINGLE WRITER.
- **First proof: I01, 22 strings.** Registry, cookie, negotiation, server-rendered `lang`/`dir`, the menu beside all four `ModeToggle` sites, and the chrome translated into all 17 languages. V picks Español on any route, the chrome is Spanish, a reload keeps it, the menu is everywhere.
- **Four things the intake did not know:** there is no `not-found.tsx` or `error.tsx` anywhere under `apps/ui/app`, so Next's English 404 leaks; ten test files read `apps/ui` source text from disk and four assert English copy against it; the stylesheet carries 79 physical direction declarations; and `LandingChrome.tsx:30` says `DebateAI` where `TopBar.tsx:30` says `Dialectical Engine`.

## Q1 Census

Method, per-file rows, exclusions with reasons and the raw data are in `census.md` and `census.json` beside this file. Summary:

| Measure | Count |
|---|---|
| Non-test `.ts`/`.tsx` scanned under `apps/ui/{app,components,lib}` | 91 |
| Files carrying ≥1 translatable string | 73 |
| **Translatable strings** | **1349** |
| (a) JSX text nodes and JSX child expressions | 645 |
| (b) JSX attributes reaching the user (`aria-label` `title` `placeholder` `alt` `label` …) | 167 |
| (c) String literals in copy modules and toast/error/message positions | 433 |
| (d) Template literals with interpolation | 101 |
| (f) Strings carrying markup, an HTML entity or a link | 3 |
| (e) Lines building an English plural by hand | 24 |
| (f-jsx) JSX sentences split by an inline element | 18, of which 4 are true rich-text splits |
| (g) Date / number / relative-time formatting sites | **12 user-visible**, of which 8 are `toLocale*` with no locale argument (4 further rows of the census table are an import line, a function signature and two `data-zoom` writes — not sites) |
| Literals examined and excluded, each with a written reason | 6822 |
| Physical left/right CSS declarations in `globals.css` (6266 lines) | 79 |
| Distinct English texts behind the 1349 sites | 1091 — see the key-identity policy below |

**Tool and its limits.** Node + the **TypeScript 5.9.3** compiler API resolved by absolute path out of `apps/ui/node_modules`; syntactic only, no type checker. The repo root pins `typescript@7.0.2`, whose package ships no `lib/typescript.js` — there is no JavaScript compiler API at the root and `pnpm exec tsx` cannot load one. Hand-verified against two files read line by line: `ModeToggle.tsx` 4 of 4 and `TopBar.tsx` 12 of 12, exact, no miss and no false positive. Blind spots are named in `census.md` §Method; the one that matters is that a sentence assembled from non-prose parts at run time would be counted as its parts or not at all, and the script cannot prove no such site exists — `UNVERIFIED`.

**Key identity — one key per site (finding N7).** The 1349 sites carry **1091 distinct texts**; 153 English strings appear at more than one site, accounting for 258 repeats. **Each site gets its own key.** Two sites rendering the same English word can need different words elsewhere — `Close` is a button in one place and a verb inside a sentence in another, and German splits them into `Schließen` and `Beenden` — and a shared key makes that impossible to express. The cost of a wrong word is higher than the cost of translating `Close` seven times. Cross-namespace consistency is enforced by the glossary rule (R43), which binds one English term to one word per language, not by key sharing. **Every language catalog carries 1349 keys**, and every `L-*` SPEC states that number.

The four true rich-text splits are the one place a key count differs from a site count: each becomes one key with an embedded placeholder rather than the ~3 fragments it is counted as, so a worker should expect roughly **1341** committed keys and reconcile the difference against the four sites named in `census.md` §(f), not against a round number.

## Q2 Languages

Seventeen, V-2's default, unchanged. Plural categories, direction, numbering system and maximized script below are **measured**, not recalled: `Intl.PluralRules`, `Intl.Locale`, `Intl.NumberFormat` and `Intl.DisplayNames` on Node v22.23.1 with full ICU, probed on 2026-09-02.

| # | Code | Native name | English name | Script | Dir | CLDR cardinal categories | Ordinal categories | Default numbering | Register decision, and why |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `en` | English | English | Latn | ltr | one, other | one, two, few, other | latn | The source register: direct second person, no honorific system. |
| 2 | `zh-CN` | 简体中文 | Chinese (Simplified) | Hans | ltr | other | other | latn | Plain register, 你-free and 您-free where the sentence allows; 您 only in account-security warnings. Simplified-Chinese product UI is neutral, not honorific. |
| 3 | `hi` | हिन्दी | Hindi | Deva | ltr | one, other | one, two, few, many, other | latn | आप throughout. तुम is familiar and reads as condescending from a product. |
| 4 | `es` | Español | Spanish | Latn | ltr | one, many, other | other | latn | tú. The product is a personal reasoning instrument addressed to one reader, matching English's direct address; usted would read institutional. |
| 5 | `ar` | العربية | Arabic | Arab | **rtl** | zero, one, two, few, many, other | other | latn | Modern Standard Arabic, masculine-singular أنت address, no dialect. |
| 6 | `fr` | Français | French | Latn | ltr | one, many, other | one, other | latn | vous. French product UI convention; tu reads as consumer-social and undercuts a bench that scores your argument. |
| 7 | `bn` | বাংলা | Bengali | Beng | ltr | one, other | one, two, few, many, other | **beng** | আপনি throughout. |
| 8 | `pt-BR` | Português (Brasil) | Portuguese (Brazil) | Latn | ltr | one, many, other | other | latn | você — the standard Brazilian address, neither formal nor familiar. |
| 9 | `ru` | Русский | Russian | Cyrl | ltr | one, few, many, other | other | latn | вы, lowercase. Capitalised Вы is letter-writing register and is wrong in an interface. |
| 10 | `ur` | اردو | Urdu | Arab | **rtl** | one, other | other | latn | آپ throughout. |
| 11 | `id` | Bahasa Indonesia | Indonesian | Latn | ltr | other | other | latn | Anda — standard for Indonesian product UI. |
| 12 | `de` | Deutsch | German | Latn | ltr | one, other | other | latn | Sie. German product UI outside consumer-social apps; du would clash with the auth and account screens. |
| 13 | `ja` | 日本語 | Japanese | Jpan | ltr | other | other | latn | です・ます polite form. No 敬語 honorifics, and no 体言止め for action labels — a button says 開始する, not 開始. |
| 14 | `ko` | 한국어 | Korean | Kore | ltr | other | other | latn | 해요체 polite (…해요 / …하세요). 하십시오체 reads as officialese. |
| 15 | `tr` | Türkçe | Turkish | Latn | ltr | one, other | other | latn | siz (formal second person plural). |
| 16 | `vi` | Tiếng Việt | Vietnamese | Latn | ltr | other | one, other | latn | bạn — the standard Vietnamese UI address. |
| 17 | `ro` | Română | Romanian | Latn | ltr | one, few, other | one, other | latn | tu. The home market, and `dezbatere.ro` addresses its readers directly; dumneavoastră would be a different product's voice. |

**Technical consequences, per language, that cost work rather than words.**

- **`ar`, `ur` — right to left.** Slice I11 converts 79 physical CSS declarations to logical ones and mirrors directional glyphs. `ar` is the only language with all six cardinal categories, so any plural key that is wrong will be wrong in Arabic first.
- **`ar` digits.** ICU resolves `ar` to the **`latn`** numbering system by default on this Node build (measured), so Arabic-Indic digits are **not** automatic; if V wants ١٢٣ the locale must carry `-u-nu-arab`. Left as `latn`; recorded as contested row **T-6**.
- **`bn` digits.** Bengali resolves to the **`beng`** numbering system by default (measured), so numbers will render as ১২৩ with no extra work. That is a change in appearance the identity oracle must not be pointed at.
- **`hi` grouping.** `Intl.NumberFormat('hi').format(1234567.89)` is `12,34,567.89` (lakh/crore), measured. Any assertion on a formatted number must be locale-parameterised.
- **`de`, `ro`, and the other comma-decimal locales.** `1.234.567,89` — a test asserting `1,234,567.89` is an English-only assertion.
- **`zh-CN`, `ja`, `ko` — no spaces.** Line breaking happens between characters; a layout that relies on a word boundary to wrap will not wrap. The menu's own list is the first place this shows.
- **`ja`, `ko`, `zh-CN`, `vi`, `id` — one plural category.** A catalog for these must carry exactly the `other` form; carrying `one` as well fails parity (R40).
- **Eight of the seventeen are non-Latin** (`zh-CN` `hi` `ar` `bn` `ru` `ur` `ja` `ko`) against three Latin-subset webfonts, so all eight fall back to system fonts — V-5's default, and R43.
- **`tr` — dotted and dotless i.** Any `toUpperCase()`/`toLowerCase()` on user-visible text must pass the locale or `i` becomes `I` instead of `İ`. The design uses uppercase eyebrows, so this is live.

**Ranking basis.** `UNVERIFIED` — this seat has no network access and did not reach a source. The ordering is the intake's, taken from V-2, which cites "total speakers (native + second language)" and "internet users by language" without naming a publication. The figures this seat recalls (Ethnologue-style speaker totals; W3Techs-style content-language shares) agree with the shape of that list but are **recalled, not measured**, and are not reproduced here as if they were. The ordering does not change any requirement: nothing below depends on rank, only on the set.

## Q3 Requirements R01…

Each is one testable sentence. `UNVERIFIED` is a valid answer to any of them.

### The menu, and its reach

- **R01** — The language menu renders on every route of `apps/ui`: `/`, `/new`, `/debate/[id]`, `/public/debate/[id]`, `/login`, `/sign-up`, `/verify-email`, `/enroll-mfa`, `/settings`, `/admin/workers`, for a signed-in visitor and for an anonymous one.
- **R02** — Every JSX site that renders `<ModeToggle` renders a language control as a sibling inside the same parent element; the four sites today are `components/TopBar.tsx:64`, `components/TopBar.tsx:90`, `components/landing/LandingChrome.tsx:38`, `app/debate/[id]/DebatePageClient.tsx:1139`.
- **R03** — In the debate toolbar the control renders in a compact variant that is a single focusable element, the same shape `<ModeToggle compact />` presents today.
- **R04** — Each language is listed by the native name written in the Q2 table, and no language is listed by its English name alone.
- **R05** — The control is a native `<button>`, has `tabIndex` 0, has a non-empty accessible name, is not `aria-disabled="true"`, has no `disabled` attribute, and claims neither `tab` nor `tablist` semantics — the bar `tests/unit/pda-s03-keyboard-accessibility.test.ts` applies to it as written.
- **R06** — With the list open, ArrowDown and ArrowUp move the highlighted language, Enter and Space choose the highlighted one, Escape closes the list without changing the language, and focus returns to the control that opened it.
- **R07** — The active language's option carries `aria-current="true"`, and the control's accessible name contains the active language's native name.
- **R08** — The control renders inside the debate workspace and inside the public debate page, both of which suppress the top bar at `components/TopBar.tsx:58`.

### What a choice does

- **R09** — Choosing a language re-renders the current route in that language without a full document load: the choice handler calls none of `window.location.assign`, `window.location.replace`, `window.location.href =`, `window.location.reload`.
- **R10** — After a choice, every subsequent route rendered in that browser is in the chosen language until another choice is made or the carrier is cleared.
- **R11** — The URL is byte-identical before and after a choice: no path segment, no query parameter and no fragment encodes the language.
- **R12** — A choice made on one route survives a browser reload of that route and of any other route.

### The carrier

- **R13** — The choice is carried in a cookie named `__Host-debateai-locale`, with `Path=/`, `Secure`, `SameSite=Lax`, `Max-Age=31536000`, no `Domain` attribute, and **no `HttpOnly` attribute** — the menu writes the cookie from the browser, so `HttpOnly` would make R09's no-reload requirement unsatisfiable. The absence is a decision on the record, not an omission: in a mission whose security-zone rule fences security attributes, an attribute left to inference is an attribute nobody owns.
- **R14** — The cookie's value is one of the seventeen Q2 codes and nothing else.
- **R15** — The API proxy forwards no locale cookie: after this mission `filteredSessionCookies` in `app/api/[...path]/route.ts` still admits exactly `__Host-debateai-session` and `__Host-debateai-csrf` and drops every other cookie name.
- **R16** — A request carrying a locale cookie whose value is not a Q2 code is served in English, and the rejected value appears nowhere in the response body or headers.
- **R17** — The choice is stored nowhere else: no `localStorage`, no `sessionStorage`, no account record, no API call (V-6).

### First visit

- **R18** — On a request with no locale cookie, the server selects the language by matching `Accept-Language` against the Q2 codes: exact tag first, then primary subtag, then the mission's single region default for that subtag; English when nothing matches (V-7).
- **R19** — The selection is a pure function with a committed test table containing at least: `pt-PT` → `pt-BR`; `pt` → `pt-BR`; `zh` → `zh-CN`; `zh-Hans` → `zh-CN`; `zh-Hant` → `en`; `zh-TW` → `en`; `es-MX` → `es`; `en-GB` → `en`; `sw` → `en`; `*` → `en`; empty header → `en`; a header with q-values ordering `de;q=0.9, fr;q=1.0` → `fr`.
- **R20** — Negotiation writes no cookie; a cookie is written only by a choice from the menu.

### Server rendering, and no flash

- **R21** — The `<html>` element carries `lang` equal to the active language's code and `dir` equal to `rtl` for `ar` and `ur` and `ltr` for the other fifteen, present in the first bytes of the server response before any script runs.
- **R22** — No screen renders text in one language and then replaces it with another after hydration.

### Catalogs

- **R23** — Every string counted in `census.md` is read from a catalog at render time and no longer appears as a literal in `apps/ui/app`, `apps/ui/components` or `apps/ui/lib`, except the tokens named in R31 and the two classes `census.md` §Method excludes by rule: a **machine-code invariant** (a value whose first token matches `` /^`?[A-Z][A-Z0-9_]{5,}:/ ``, which `lib/api.ts:310` re-parses and eight test assertions match on) and a **CSS value** inside a `style={{…}}` attribute or an object literal cast `as CSSProperties`. Neither is translated, in any language.
- **R24** — Catalogs are files committed to the repository; no translation is produced at run time and no translation service is called (DR-179).
- **R25** — Catalog files live at `apps/ui/locales/<code>/<namespace>.json`, one namespace per extraction slice, so no two slices write one file.
- **R26** — For every language and namespace, the key set equals the English key set exactly: no key missing, no key extra.
- **R27** — For every key, the set of `{placeholder}` names in the translated value equals the set in the English value.
- **R28** — No catalog value is the empty string, and no catalog value is whitespace only.
- **R29** — A key that is present in English and absent at run time renders the English value and never renders empty or renders the key.
- **R30** — The JavaScript delivered to the browser for a route in language X contains no catalog value belonging to any language other than X, and the transferred JavaScript for a cold load of `/` in any one of the seventeen languages exceeds the English baseline by no more than 25 KB after gzip.

### Untranslatable tokens

- **R31** — These are never translated, in any language, including inside right-to-left text: the brand marks `Dialectical Engine`, `DebateAI` and `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; and keyboard shortcut names.
- **R32** — The untranslatable list is one file, and the hardcoded-string scanner reads it as its allowlist, so adding a token is one edit in one place.
- **R33** — A brand mark or model identifier embedded in a sentence stays in Latin script and left-to-right inside `ar` and `ur` text, and is not visually reordered.

### English identity

- **R34** — For every route and component covered by the identity oracle, the HTML rendered in English after extraction is byte-identical to the HTML rendered from the same fixtures at the slice's base commit.
- **R35** — Leading and trailing whitespace of a JSX text node survives extraction: `{" "}` separators and the spaces around inline elements are part of the identity.

### The leak rule

- **R36** — With language X active, no rendered route contains, as a complete text node or as a complete attribute value, an English catalog value whose X translation differs from the English value.
- **R37** — A string whose X translation is deliberately identical to English — a proper noun, a kept word from `glossary.md`, `OK`, a bare numeral — is listed in that language's `identical-values` file with a one-line reason, and the leak scan reads that file; the scan is never weakened by loosening its matcher.

### Dates, numbers and plurals

- **R38** — Every date, time, relative time, number and percentage that `apps/ui` renders is produced by `Intl` with the active language as its locale argument; the eight `toLocale*` calls with no locale argument listed in `census.md` are the closing set.
- **R39** — Every plural is chosen by CLDR cardinal category through `Intl.PluralRules` for the active language; the 24 hand-made plural lines listed in `census.md` are the closing set.
- **R40** — A plural key in language X carries exactly the CLDR cardinal categories for X — six for `ar`, four for `ru`, three for `ro`, two for the eight `one, other` languages, one for `zh-CN` `ja` `ko` `vi` `id` — and a category the language does not use fails parity.
- **R41** — No number, date or plural is assembled by string concatenation at any of these sites, which are the closing set: `lib/v3/adapter.ts:363-368` (a percentage built by `toFixed` and `replace`), `components/landing/LandingSample.tsx:70` and `:72` (`BASE {n}%` and `FINAL {n}%`), the 24 plural lines of `census.md` §(e), and the 12 formatting sites of `census.md` §(g). An absolute over the whole app with no enumerated set is not checkable and is not what this requirement says.
- **R42** — Any case transform on user-visible text passes the active language, so Turkish `i` becomes `İ` and not `I`.

### The vocabulary

- **R43** — Every term in `glossary.md` has a filled cell in a language's column before that language's catalog is reviewed, and one English term maps to one word in that language across every namespace.

### Design fit

- **R44** — The menu renders in Terracotta and in Chamber, and introduces no colour literal outside the first `:root {` and `html[data-mode="chamber"] {` blocks of `apps/ui/app/globals.css`; every new token is registered in the `TERRACOTTA`, `CHAMBER` or `MODE_INDEPENDENT` maps of `tests/unit/t9-mode-tokens.test.ts` with comma-tight values.
- **R45** — At a 390px-wide viewport the control is visible in the top bar and in the debate toolbar with no horizontal scrolling of the page body, and the open list scrolls inside itself rather than scrolling the page.
- **R46** — The menu introduces no new font family and takes its type, spacing, radius and border from the tokens `ModeToggle` and the `lpNav` cluster already use.

### Right to left, and fonts

- **R47** — With `ar` or `ur` active, the 79 physical direction declarations listed in `census.md` are logical properties, so the layout mirrors rather than only the text.
- **R48** — Directional glyphs point toward reading direction in right-to-left languages: `→` becomes `←` and the back arrow flips.
- **R49** — Each non-Latin script has a declared system fallback stack in `globals.css` and no font file is added to the repository (V-5).

### Fences that must not move

- **R50** — No file under `apps/api`, `packages/crypto`, `packages/db` or `migrations` changes in this mission.
- **R51** — On the sign-in, sign-up, verify-email, MFA-enrolment, settings, sessions and account-erasure screens only text changes: no control flow, validation, request, cookie, storage, redirect or security attribute is altered, and the diff touches only string positions and their imports.
- **R52** — The ten test files that read `apps/ui` source text from disk keep passing, or are re-pointed at the catalog or at rendered output inside the same slice that breaks them; `apps/ui/components/authRoutes.source-test.mjs`'s six English copy regexes over `LoginFlow.tsx` are re-pointed in slice I02. **And every test that asserts a copy module's RETURN VALUE is re-pointed in the slice that extracts that module** — `apps/ui/lib/scoringResponse.test.mjs` (57 assertions over `lib/scoringResponse.ts`) is one, it reads no source from disk so it is not among the ten, and no oracle covers it because O1 renders component HTML rather than module return values.
- **R53** — No test file listed as base-RED at `4f764037` — `tests/unit/t9-mode-tokens.test.ts`, `tests/unit/v2ui-pages.test.ts`, `tests/render/t3-library.test.tsx`, `tests/render/load01-debate-page.test.tsx`, and the 21 non-UI files in the ledger's list — is used as evidence by any oracle of this mission.

### The gaps the intake did not know about

- **R54** — `apps/ui/app` contains no `not-found.tsx`, no `error.tsx` and no `global-error.tsx`, so Next's built-in English pages render today when a debate is missing; slice I10 adds a `not-found.tsx` and a `global-error.tsx` that render from the catalog in the active language.
- **R55** — `app/layout.tsx`'s `metadata.description` is a user-visible string and is translated; `metadata.title` is the brand mark and is not.
- **R56** — A single mechanical check enumerates the route files under `apps/ui/app` from the file system and asserts a language control renders for each, so a route added later without a menu fails it.

## Q4 Vertical slices

Ownership was checked mechanically: no file is owned twice, every one of the 73 string-bearing files is owned, and no owned path is missing from disk. The counts sum to 1371.

**Two kinds of touch, and why the distinction matters.** A slice *owns* a file when it extracts that file's strings. I01 additionally performs a **mount edit** — an import plus one JSX element — in `TopBar.tsx`, `LandingChrome.tsx` and `DebatePageClient.tsx`. `DebatePageClient.tsx` is owned by I05 for extraction. There is no single-writer violation because **I01 is merged before any of I02–I11 starts**; single-writer forbids two *concurrent* writers, and these are sequential. The same logic governs catalogs: I01 ships `<code>/chrome.json` for all seventeen languages, and a language slice `L-<code>` takes ownership of the whole of `locales/<code>/` only after every extraction slice has merged.

| Code | Name | Owns (files) | Census | What V sees at the end | V-runnable acceptance, one line | Depends on | Parallel-safe with |
|---|---|---|---|---|---|---|---|
| **I01** | Language foundation and the menu | `components/TopBar.tsx`, `components/ModeToggle.tsx`, `components/landing/LandingChrome.tsx`, `app/layout.tsx` + new: language registry, cookie module, negotiation module, `LanguageMenu.tsx`, `locales/<17>/chrome.json` | 22 | A language menu beside the mode toggle on every route, listing 17 native names; picking Español turns the chrome Spanish everywhere and a reload keeps it | Open `/`, choose **Español**, see the nav and buttons in Spanish; go to `/login`, `/new`, a debate and the public debate page and see the menu on each with Spanish chrome; reload and it is still Spanish | — | nothing (it is the contract) |
| **I02** | Auth screens | `app/{login,sign-up,verify-email,enroll-mfa}/page.tsx`, `components/{LoginFlow,SignUpFlow,AuthShell,AuthGate}.tsx`, `lib/{mfaEnrollment,totpQr}.ts`, `locales/en/auth.json` | 117 | Sign-in, sign-up, e-mail verification and authenticator enrolment fully in the chosen language | Choose Deutsch, walk `/sign-up` → `/verify-email` → `/enroll-mfa` → `/login` and read every label, hint and error in German; sign in successfully | I01 | I03–I11 |
| **I03** | Settings and account | `app/settings/page.tsx`, `components/{SessionControls,AccountErasureControls}.tsx`, `lib/serverApi.ts`, `locales/en/account.json` | 90 | Settings, the session list and the erasure controls in the chosen language | Choose Français, open `/settings`, read the session rows and the deletion controls in French; the dates are French too | I01 | I02, I04–I11 |
| **I04** | Landing, library and new debate | `app/page.tsx`, `app/new/{page,defaults}.tsx`, `components/landing/*` (6 files), `components/{DebatesBuffer,LibraryComposer,GuideModal,Toast}.tsx`, `locales/en/landing.json` | 143 | The anonymous landing, the signed-in library and the new-debate form in the chosen language | Choose Português (Brasil), read the landing hero, method ledger and pricing line in Portuguese; sign in, read the library; open `/new` and read every field label and helper | I01 | I02, I03, I05–I11 |
| **I05** | Debate workspace shell | `app/debate/[id]/{DebatePageClient,DebatePageGate,loading,page}.tsx`, `components/{CanvasViewport,ChallengePopover}.tsx`, `locales/en/workspace.json` | 190 | The debate page's own chrome — toolbar, view switcher, overflow actions, status strip, error and loading states | Choose Русский, open a debate, read the toolbar, the four view buttons and the utility actions in Russian; trigger the challenge popover and read it | I01 | I02–I04, I06–I11 |
| **I06** | Debate views | `components/{DebateCanvas,DebateTree,DebateMap,DebateOutline,DebateSplit,DebateThread,ArgumentFocusView}.tsx`, `locales/en/views.json` | 163 | All five views of a debate — tree, thread, split, map, outline — plus the focus view | Choose 日本語, open a debate and switch through Thread, Split, Tree and Map, reading each view's labels, badges and empty states in Japanese | I01 | I02–I05, I07–I11 |
| **I07** | Honesty and detail drawers | `components/{AnswerHonestyDrawer,NodeDetailDrawer,InvestigationDrawer,DebateWorkspaceDrawer}.tsx`, `locales/en/drawers.json` | 206 | Every drawer that opens over the debate — honesty and provenance, node detail, investigations, workspace artifacts | Choose العربية, open a debate, open each of the four drawers and read them in Arabic with the layout mirrored | I01 | I02–I06, I08–I11 |
| **I08** | Banners, panels and controls | `components/{VerdictBanner,SynthesisPanel,RecommendedInvestigations,PublicationControl,LegacyRunClaimControls,EvaluatorDevMenu,ModelPresentation,ScoringErrorBoundary}.tsx`, `locales/en/panels.json` | 147 | The verdict banner, the synthesis panel, recommendations, publication and claim controls | Choose Türkçe, open a finished debate, read the verdict banner and synthesis panel in Turkish, open the publication control and read its two states | I01 | I02–I07, I09–I11 |
| **I09** | Domain copy modules | `lib/v3/{labels,adapter,liveEvents,tokenUnlock,answerExport,missingCapabilities}.ts`, `lib/{scoringResponse,scoringStatusCopy,scoringFormat,debatePresentation,recommendation,scrutiny,scrutinyDepth,api,models,makerIdentity}.ts`, `lib/observability/{suspiciousScoring,logger}.ts`, `locales/en/domain.json` | 229 | Every condition mark, abstention kind, scoring status, scrutiny label and live-event sentence in the chosen language | Choose 한국어, open a debate with condition marks, read the honesty vocabulary and the live-run status line in Korean | I01 | I02–I08, I10, I11 |
| **I10** | Public and admin routes, scanner at zero | `app/public/debate/[id]/{page,PublicDebatePageClient}.tsx`, `components/{PublicHonestyDrawer,PublicAnswerDisclosure}.tsx`, `app/admin/workers/page.tsx`, `app/api/[...path]/route.ts`, `lib/v3/{census,publicAnswerExport}.ts` + new `app/not-found.tsx`, `app/global-error.tsx`, `locales/en/public.json` | 49 | A published debate readable in any language by a signed-out visitor, a translated 404, and the hardcoded-string scanner reporting zero across `apps/ui` | In a private window choose हिन्दी, open a published debate URL, read the page and its honesty drawer in Hindi; open a made-up debate id and read the not-found page in Hindi | I01, and merged after I02–I09 for the scanner gate | I11 |
| **I11** | Locale formatting and right-to-left | `lib/format.ts`, `app/globals.css` (79 declarations), the 16 formatting sites and 24 plural lines listed in `census.md`, `locales/en/formats.json` | 15 | Dates, times, relative times, numbers and plurals in the chosen language, and a mirrored layout in Arabic and Urdu | Choose العربية and open the library: the whole layout is mirrored, the "New debate" button sits top-left, arrows point the other way, and the dates read in Arabic; switch to हिन्दी and see numbers grouped 12,34,567 | I01 | I02–I10 |
| **L-`<code>` × 16** | One catalog per language | `locales/<code>/**` (all eleven namespaces) + that language's `glossary.md` column and `identical-values` file | ≈1360 keys each | The whole application in that language, with nothing English left | Choose that language and walk landing → library → new debate → a debate → all four views → all four drawers → settings → sign-out → sign-in; report any English word seen | I01–I11 all merged, English catalogs frozen | every other `L-*` |

**Balance.** Extraction slices I02–I10 span 49–229 strings, mean 143. I01 (22) is deliberately smallest — it is the end-to-end proof and its cost is the plumbing, not the words. I10 (49) is small in strings and carries the whole-app scanner gate. I11 (15) is not an extraction slice: its work is 79 CSS declarations, 16 formatting sites and 24 plural lines.

**Wave order.** I01 alone → I02…I09 and I11 in parallel worktrees → I10 last of the code slices, because its scanner gate is a claim about every other slice → English catalogs frozen → sixteen `L-*` in parallel. V tests at the end of each slice; V performs every merge and every push.

**Single-writer proof.** Extraction ownership is a partition of the 73 string-bearing files (checked mechanically). Catalog ownership is a partition by namespace file. The only cross-slice writes are I01's three mount edits, which happen while nothing else is running.

## Q6 Oracles

Each is stated as a requirement with a mechanically checkable criterion. The architecture seat designs the implementation and writes the commands. Two standing constraints bind all six: **no oracle may use a base-RED test file as evidence** (R53), and **every acceptance command must be run by its author at authoring time**, classified BROKEN / GREEN / RED rather than by exit code alone (`.hermes/TOOLING-TRAPS.md`, the acceptance-defect family).

### O1 — English identity

- **O1.1** — For each file a slice owns, a baseline HTML rendering exists, captured from that slice's base commit with fixed fixtures and committed inside the slice, before any extraction edit lands.
- **O1.2** — After extraction, rendering the same component from the same fixtures with the language forced to `en` produces HTML byte-identical to the baseline, and the failure output prints the first differing byte offset with 80 characters of context either side.
- **O1.3** — Coverage: every route component (10 routes) and every component owned by an extraction slice that renders at least one string — 73 files minus the 18 with none. Where a component cannot be rendered in isolation, the slice records that file as `UNVERIFIED — not independently renderable` and names the route-level snapshot that covers it instead. The count of `UNVERIFIED` files is reported, not hidden.
- **O1.4** — Fixtures come from the 18 render test files that are GREEN at `4f764037`; `tests/render/t3-library.test.tsx` and `tests/render/load01-debate-page.test.tsx` are base-RED and supply no fixture and no assertion.
- **O1.5** — The oracle is shown able to fail: a deliberate one-character change to one catalog value makes it RED, demonstrated once per slice and recorded.
- **O1.6** — Three runs, worst run is the verdict.

### O2 — Hardcoded-string scanner

- **O2.1** — The scanner runs the same AST walk this census used over `apps/ui/{app,components,lib}` and reports every string in a user-visible position that is not a catalog lookup.
- **O2.2** — "User-visible position" is exactly the census's strong-position definition: a JSX text node, a JSX child expression, or one of the enumerated user-visible attributes; plus a prose-shaped literal in a copy module. The definition lives in one file shared by the scanner and this census, so the two cannot drift.
- **O2.3** — The allowlist is the single untranslatable-token file of R32, plus per-file suppressions each carrying a one-line reason; a suppression with no reason fails the scanner.
- **O2.4** — The target is **0** across `apps/ui` at the end of slice I10. Every earlier slice reports its own owned-file count falling to 0 and the whole-app count as a decreasing number, never as a pass.
- **O2.5** — It runs as a vitest file in the root suite so it is in `pnpm vitest run`, and it prints `N of M` where M is the number of files scanned — never a silently capped subset.
- **O2.6** — Three runs, worst run is the verdict.

### O3 — Catalog parity

- **O3.1** — For every language and namespace, the key set equals the English key set; the failure names the missing and the extra keys, not a count.
- **O3.2** — For every key, the `{placeholder}` name set equals English's; the failure names the key and both sets.
- **O3.3** — No value is empty or whitespace-only.
- **O3.4** — No key exists in a language that does not exist in English.
- **O3.5** — Plural keys carry exactly the CLDR cardinal categories for their language, taken at test time from `Intl.PluralRules(<code>).resolvedOptions().pluralCategories` rather than from a hand-written table, so the test cannot drift from ICU.
- **O3.6** — Every namespace file is valid JSON and parses; a syntax error is reported as the file and line.
- **O3.7** — Three runs, worst run is the verdict.

### O4 — Leak scan

- **O4.1** — For each language and each covered route, the route is rendered with that language active and the rendered output is searched for English catalog values.
- **O4.2** — The match is on a **complete text node or a complete attribute value**, never on a substring, so "Map" inside "Roadmap" is not a hit.
- **O4.3** — A key whose translation equals its English value is skipped only if it appears in that language's `identical-values` file with a reason; an unlisted identical value is a finding against the translation, not against the scan.
- **O4.4** — The failure names the language, the route, the key and the leaked value.
- **O4.5** — Coverage is the same route list as O1.3, and the number of routes actually rendered is printed as `N of M`.
- **O4.6** — Three runs, worst run is the verdict.

### O5 — Menu everywhere

- **O5.1** — The route list is enumerated from the file system — every `page.tsx` under `apps/ui/app` — not from a hand-written array, so a new route without a menu fails.
- **O5.2** — For each route, rendering it produces exactly one language control, identified by a stable hook rather than by its visible text (which changes with the language).
- **O5.3** — A source-level companion asserts that every JSX site rendering `<ModeToggle` has a language control as a sibling in the same parent element, and that the count of `<ModeToggle` sites equals the count of language-control sites — four and four today.
- **O5.4** — The control satisfies the `pda-s03` bar on every route: native `<button>`, `tabIndex` 0, non-empty accessible name, no `disabled`, no `aria-disabled="true"`, no `role="tab"`.
- **O5.5** — The negative arm is shown able to fail: deleting the control from one route makes it RED, demonstrated once.
- **O5.6** — Three runs, worst run is the verdict.

### O6 — The three-run law, stated once for all five

Each oracle's verification command runs three times in the same lane, and the **worst** run is the verdict: green-green-red is RED. The cause is fixed; re-running until green is falsification. Each oracle's PLAN cluster records all three outcomes and the wall-clock of each, so a reviewer can see whether a run was long enough to be real.

## Q8 Contested decisions for V

Rows beyond V-1…V-8. Each is written for a reader who knows nothing of the codebase. None of these blocks the mission: each has a default the work proceeds on.

| Row | The question, in plain words | Options | My pick | Confidence | Strongest counter |
|---|---|---|---|---|---|
| **T-1** | The product calls itself two different things on screen. The landing page's logo says **DebateAI**; the top bar inside the app says **Dialectical Engine** above the address `dezbatere.ro`. Both are untranslatable brand marks, so whichever we keep will appear identically in all 17 languages. Which is the name? | (a) `Dialectical Engine` everywhere; (b) `DebateAI` everywhere; (c) leave both as they are | (a) — the standing naming law says the product is `dialectical-engine`, and the auth screens, the browser tab title and the top bar already use it; the landing page is the outlier | medium | The landing page is the only screen an unsigned visitor sees, and `DebateAI` may be the deliberate public-facing mark; changing it is a marketing decision, not a translation one. A one-word fix is also outside this mission's scope, which is why it is a row and not a requirement |
| **T-2** | The two display modes are named **Terracotta** (light) and **Chamber** (dark). Are these product names that stay in English in all 17 languages, or ordinary words a translator should render (Spanish *Terracota* / *Cámara*, Japanese テラコッタ / チェンバー)? | (a) keep both in English everywhere; (b) translate both; (c) keep `Terracotta`, translate `Chamber` | (a) — they name two specific designed appearances, not a colour and a room, and a reader who switches languages should still recognise the control | medium | In non-Latin scripts an untransliterated Latin word inside otherwise-Japanese chrome reads as untranslated, which is exactly what the leak rule exists to prevent; option (b) with a glossary cell per language would look more finished |
| **T-3** | The language menu can be a plain browser dropdown or a designed panel. The plain one gets full keyboard and mobile behaviour for free from the browser and can never have a keyboard defect; the designed one matches the rest of the interface but every keyboard behaviour must be written and tested by hand. | (a) designed panel (button + listbox) with a written keyboard contract; (b) native `<select>`; (c) native `<select>` on small screens, designed panel above 640px | (a) — the chrome is bespoke and a browser dropdown would be the only unstyled control on the page | medium | (b) removes a whole class of accessibility defect at zero cost, and 17 native names in a system dropdown is genuinely usable. Every keyboard bug we ship in (a) is one we chose to be able to have |
| **T-4** | The cookie that remembers the language can be named `__Host-debateai-locale`, which forces the browser to send it only over HTTPS and only for the whole site. That matches the two cookies the app already uses. But if any environment ever serves plain HTTP, the cookie silently does nothing and every visit falls back to the browser's language. | (a) `__Host-debateai-locale`, HTTPS-only; (b) plain `debateai.locale`, works over HTTP too; (c) `__Host-` in production, plain name in development | (a) — the dev stack is already HTTPS on port 3000, and the `__Host-` prefix is this repo's convention | high | A future preview deployment or a proxy terminating TLS elsewhere would break language memory with no error message anywhere; (c) costs one conditional and removes the failure mode |
| **T-5** | A visitor whose browser is set to Traditional Chinese (Taiwan, Hong Kong) asks for `zh-Hant`. We will only have Simplified Chinese. Do we serve them Simplified, or English? | (a) English; (b) Simplified Chinese; (c) add Traditional Chinese as an 18th language | (a) — serving Simplified to a Traditional reader is a recognisable mistake and reads as carelessness; English is neutral | medium | A Traditional reader can usually read Simplified, and Chinese-of-any-kind is more useful to them than English; option (b) is what most products do |
| **T-6** | Arabic can display numbers as `123` or as `١٢٣`. The default gives `123`. Which does the Arabic edition use? | (a) `123` (Western digits, the default); (b) `١٢٣` (Arabic-Indic digits) | (a) — most Arabic-language software and the web at large use Western digits, and scores and percentages stay comparable across languages | medium | For a reader in the Gulf, `١٢٣` is the natural form and its absence is the first thing that marks a page as machine-localised. It costs one locale extension (`ar-u-nu-arab`), not a slice |
| **T-7** | Debate content — the question the asker typed and the arguments the models wrote — stays in the language it was argued in (V-3). In an Arabic session the page mirrors right-to-left, but an English argument inside it is still left-to-right text. Do we mark each piece of content with its own direction so it renders correctly, or let it inherit the page's direction? | (a) mark content with `dir="auto"` so the browser decides per block; (b) let it inherit; (c) store and render a per-debate language | (a) — one attribute, and without it English paragraphs inside an Arabic page render with their punctuation in the wrong place | high | `dir="auto"` guesses from the first strong character and gets short or mixed strings wrong; (c) is correct but is the "debate language" product feature already routed to V-3 |
| **T-8** | Seventeen languages is 27 slices and 27 test points for you. We could ship the machinery plus a first tranche (say English, Spanish, French, German, Romanian, Chinese, Arabic — seven), prove the whole system end to end, and add the other ten as a follow-up wave. | (a) all 17 in this mission; (b) 7 now, 10 in a follow-up wave; (c) machinery only, languages one at a time on demand | (b) — the risky, reviewable work is the machinery and the right-to-left slice; languages after the first seven are repetition, and a smaller first mission gets to your hands sooner | low | You asked for "the most used languages across the globe" and a half-list is not that; every language deferred is a slice that has to be re-planned later, and the marginal cost of language eleven is the lowest cost in the mission |

## Ranked recommendations

1. **Ship I01 to V before anything else is dispatched, and let V veto it in a browser.** VERDICT: the foundation is the only irreversible decision in this mission — the cookie name, the negotiation rule, the lookup API and the menu's shape are imported by ten later slices. CONFIDENCE: high. STRONGEST COUNTER: it serialises the mission's first hour, when eight extraction slices could already be running against a provisional API.
2. **Make the hardcoded-string scanner and this census share one definition file.** VERDICT: two implementations of "user-visible string" will disagree, and the disagreement will be discovered as a leak in a language slice, six waves later. CONFIDENCE: high. STRONGEST COUNTER: the census is a one-off measurement and the scanner is a standing gate; coupling them means every scanner change re-opens the census.
3. **Capture every identity baseline BEFORE the extraction edit, inside the same slice, and prove it can fail.** VERDICT: a snapshot captured after the change certifies the change against itself — the exact shape recorded four times in `TOOLING-TRAPS.md`. CONFIDENCE: high. STRONGEST COUNTER: baselines committed per slice add a large volume of generated HTML to the repository.
4. **Re-point the four source-grepping copy assertions in the slice that breaks them, never in a later cleanup.** VERDICT: `authRoutes.source-test.mjs` (six regexes over `LoginFlow.tsx`), `pda-s03-keyboard-accessibility.test.ts`, `t9-landing.test.tsx` and `t3-library.test.tsx` are a class, enumerated in `census.md`; a slice that leaves one red hands the next slice a failure it did not cause. CONFIDENCE: high. STRONGEST COUNTER: `t3-library` is already base-RED, so re-pointing it mixes a pre-existing failure into a slice's evidence — it must be re-pointed and left RED with the reason stated.
5. **Decide T-3 (designed panel versus native `<select>`) before ARCH-01 writes the menu's PLAN.** VERDICT: it changes the keyboard contract, the test surface and roughly a day of work, and it is the one design decision that cannot be reversed cheaply once ten slices import the component. CONFIDENCE: medium. STRONGEST COUNTER: the component's public shape is identical either way, so ARCH can specify the interface now and defer the implementation.
6. **Put the four true rich-text splits on the record as one key each with an embedded placeholder, not as fragments.** VERDICT: `LoginFlow.tsx:144`, `SignUpFlow.tsx:194`, `new/page.tsx:318` and `AccountErasureControls.tsx:107` are sentences whose grammar runs through a link or a `<strong>`; extracting them as fragments produces word order that is wrong in German, Japanese and Arabic and that no oracle detects. CONFIDENCE: high. STRONGEST COUNTER: rich-text interpolation is the most complex part of any i18n layer and four sentences may not be worth it — the alternative is four full sentences with the link wrapping the whole thing.
7. **Add `not-found.tsx` and `global-error.tsx` in I10 rather than treating the 404 as out of scope.** VERDICT: `/public/debate/<any wrong id>` calls `notFound()` today and Next renders its built-in English page; a visitor in Hindi meets English on the most linkable URL the product has. CONFIDENCE: high. STRONGEST COUNTER: it is new product surface in a translation mission, and a design for those two pages does not exist in the ui-overhaul document.
8. **Run the leak scan on complete text nodes, and keep an explicit `identical-values` list per language.** VERDICT: a substring matcher makes the scan noisy, and the first response to a noisy scan is to loosen it, which is how the gate stops gating. CONFIDENCE: high. STRONGEST COUNTER: maintaining seventeen `identical-values` files is real work that a substring matcher with a short deny-list would avoid.
9. **Freeze the English catalogs before a single language slice starts.** VERDICT: sixteen seats translating a moving key set will produce sixteen different parity failures, and each costs a rework round. CONFIDENCE: high. STRONGEST COUNTER: it forces the language wave to wait for the slowest extraction slice, when fifteen of the sixteen namespaces might already be stable.
10. **Take T-8 seriously before wave 5.** VERDICT: seven languages proves every mechanism this mission builds — right-to-left, six plural categories, a non-Latin script, a comma-decimal locale and the home market — and reaches V in half the wall-clock. CONFIDENCE: low, because it trades against V's own words. STRONGEST COUNTER: V asked for the most used languages across the globe, and seven is not that.

## UNVERIFIED / gaps

- **The speaker and internet-user ranking behind V-2 is UNVERIFIED.** No network access from this seat; the figures this seat recalls are consistent with the list's shape but are not cited as measurement. Nothing in the requirements depends on the ordering.
- **Whether any user-visible sentence is assembled at run time from non-prose parts is UNVERIFIED.** The AST walk cannot see it and the four largest files were read by hand without finding one; absence is not proven.
- **Whether the 25 KB gzipped bound in R30 is achievable is UNVERIFIED.** It is a stated target derived from the largest namespace (I09, 229 strings) at roughly 60 bytes per string; no build was run to measure it. ARCH must either measure it or replace the number.
- **`components/Toast.tsx` and `components/AuthShell.tsx` carry zero strings** because every string they render arrives as a prop. Their callers own those strings. If the identity oracle renders them in isolation it will render nothing meaningful; O1.3's `UNVERIFIED — not independently renderable` path exists for exactly this.
- **The full vitest suite was not run by this seat.** The baseline is the orchestrator's, recorded in `logs/orchestrator-ledger.md`: 25 of 230 files RED at `4f764037`, 36 of 1911 tests, all pre-existing. R53 is written against that list and no oracle may lean on it.
- **The design document says nothing about a menu.** `docs/missions/ui-overhaul/design/design-document-text.txt` has no top-bar-control specification beyond the mode toggle. R46 therefore binds the menu to the tokens `ModeToggle` and `lpNav` already use, which is derived from the code, not from the design document — if V wants the menu drawn, that is a design turn this mission does not contain.
- **Two `toFixed` sites are excluded from R38 on purpose:** `components/CanvasViewport.tsx:119` and `:573` write a `data-zoom` attribute that no reader sees.
- **Whether `apps/ui/app/__visual` and `apps/ui/app/visual-debate-preview` will ever hold routes is UNVERIFIED** — both directories are empty today, so O5.1's filesystem enumeration finds nothing in them.

## Handoff

`READY FOR PEER REVIEW` — posted as a comment on `t_7bf7a8a4`, reproduced here.

SKILLS LOADED: superpowers:using-superpowers, dialectical-engine:heartbeat-protocol, dialectical-engine:heartbeat-requirements, superpowers:brainstorming, superpowers:verification-before-completion

| Measure | Value |
|---|---|
| `INSTRUCTIONS.md` line count | **90** (cap 100) — `wc -l` |
| Slices | 11 code (I01–I11) + 16 language (`L-<code>`) + `LANG-TEMPLATE` = 28 directories, 112 files |
| Census by slice | I01 22 · I02 117 · I03 90 · I04 143 · I05 190 · I06 163 · I07 206 · I08 147 · I09 229 · I10 49 · I11 15 = **1371** |
| Ownership | partition verified mechanically: 0 duplicate owners, 0 string-bearing files unowned, 0 owned paths missing from disk |
| SPEC→PLAN scaffold trace | **equal in all 28 slices** (I01 24/24, I02 14/14, I03 13/13, I04 14/14, I05 14/14, I06 13/13, I07 14/14, I08 14/14, I09 15/15, I10 16/16, I11 13/13, LANG-TEMPLATE 15/15, and each `L-*` 15 or 16 both sides) |
| Mission requirement coverage | 56 defined, **56 cited by ≥1 slice SPEC**, 0 slice-cited requirement undefined |
| Banned words | 0 in any requirement row or acceptance row across all 28 SPECs; the five words appear only inside the PLAN law statement that forbids them |
| Census totals | 1371 strings in 73 of 91 files · 645 JSX text · 167 attributes · 450 literals · 106 templates · 3 markup · 24 plural lines · 18 markup-split sentences (4 true) · 16 formatting sites · 6800 exclusions with reasons · 79 physical CSS direction declarations |
| Contradictions found | **1** — T-1, quoted below. It does not block. |
| Contested rows collected for V | T-1 … T-8 (§Q8), none asked of V by this seat |

**The one contradiction, both sides quoted.** `apps/ui/components/landing/LandingChrome.tsx:30`
renders `<a …>DebateAI</a>`; `apps/ui/components/TopBar.tsx:30` renders
`<span className="brandName">Dialectical Engine</span>`. The standing naming law
(`COMMON.md` §3) says "the product is `dialectical-engine`". Both strings are untranslatable tokens
under R31 whichever way V rules, so no requirement changes; it is contested row **T-1** and the
untranslatable-token list carries both marks until it is ruled.

**Packet defects found in `REQ-01.md`** — the full list with fixes is in
`.hermes/reports/translation/agent-reports/REQ-01.md` §5. In short: the dispatch cursor is stated as
3 in the packet and as 2 in the orchestrator's own ticket comment; the ticket body still says
"Fable 5.1 subagent" against V-1's Opus 5 ruling; Q1 names seven categories without naming the
discriminator that decides them (three iteration rounds); Q4 uses "own" for two different properties
(extraction ownership and write-concurrency) and the gap is exactly where I01's mount edit lives;
Q7 gives no cluster-header count; the mandated `superpowers:brainstorming` skill has an interactive
approval gate a background subagent cannot execute; and §3's "measurement scripts only READ the
repo" is in tension with Q7's instruction to *generate* sixteen SPECs.

`comments read through: 5`
