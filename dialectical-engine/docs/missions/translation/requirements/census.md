# Census — translatable strings in `apps/ui` (mission `translation`)

Measured 2026-09-02 at `dev` @ `4f764037`. Raw rows: `census.json` beside this file.

## Method, and what it cannot see

**Tool.** A Node script walking the TypeScript AST — `ts.createSourceFile` from **TypeScript 5.9.3**, resolved by absolute path from `apps/ui/node_modules`. It is not `tsc`: no type checker, no program, purely syntactic. The repo root pins `typescript@7.0.2`, whose package ships **no `lib/typescript.js`** and therefore no JavaScript compiler API at all, so `pnpm exec tsx` at the root cannot load one; that is recorded in `.hermes/TOOLING-TRAPS.md`.

**Scope.** Every non-test `.ts`/`.tsx` under `apps/ui/app`, `apps/ui/components`, `apps/ui/lib` — 91 files. Excluded from the walk: `*.test.ts(x)`, `*.spec.ts(x)`, `*.source-test.mjs`, `*.d.ts`.

**Decision rule — this is the rule the hardcoded-string scanner transcribes (oracle O2.2); it is stated here in full so no seat re-derives it.**

1. **Position decides first, shape decides second.** A string in a *strong* position is user-visible whatever it looks like; a string in a *weak* position is user-visible only if it is prose-shaped. Getting this backwards is what made three of the four defects in the classifier's own development: `<span>depth {n}</span>` renders the word `depth`, and a shape test that calls it a kebab-case identifier throws away a real key.
2. **Strong positions:** a JSX text node · a JSX child expression · one of the user-visible attributes `aria-label` `title` `placeholder` `alt` `label` `content` `summary` `download` `aria-description` `aria-roledescription` `aria-valuetext` `aria-placeholder` `aria-keyshortcuts` `hint` `eyebrow` `description` `heading` `subtitle` `footer` `selectionLabel` `emptyMessage`.
3. **Weak positions** — a property value, a variable initialiser, a return, a call argument — pass only if prose-shaped: multi-word with two or more letters, or a capitalised word of three or more characters that is not SCREAMING_SNAKE, or a string ending in `.`, `?` or `!`.
4. **Negative rules that fire before either of the above, because they hold in every position:**
   - no ASCII or Cyrillic or Latin-1 letter at all → a glyph or punctuation;
   - **first token is a machine-code identifier — `/^`?[A-Z][A-Z0-9_]{5,}:/` — → a machine-code invariant, never copy.** The optional leading backtick matters: a `TemplateExpression`'s source text starts with one, and a rule without it misses 5 of the 15 sites. Translating these breaks the code that parses them: `lib/api.ts:310` composes `` `${code}: ${message}` `` and eight test assertions match on the code. Added in rework round 1 (finding B4).
   - **inside a `style={{…}}` attribute or an object literal cast `as CSSProperties` → a CSS value, never copy.** Added in rework round 1 (finding N2).
   - a module specifier, a type-level literal, a switch-case discriminant, an object-literal key, an operand of `===`/`!==`/`==`/`!=`/`in`/`instanceof`, an index into a lookup map, a URL, a route path, a brand mark, a model identifier, a colour literal, or the `"use client"` directive.

**A note on where B4's rule bites and where the reviewer's reason for it does not.** Fourteen of the fifteen machine-code strings are `throw new Error(...)` and are never rendered. The fifteenth, `app/new/page.tsx:95`, **is** rendered — `setSessionDefaultsError` reaches the screen at `app/new/page.tsx:250` inside `<div className="error">`. It is still excluded, because the exclusion is a property of the VALUE (a machine code is not a sentence a translator can translate without breaking the parser), not of whether the value is thrown. That a machine code reaches a reader is a pre-existing product defect; it is recorded here and is out of this mission's scope.

**Verification.** Two files were hand-read line by line against the script output: `apps/ui/components/ModeToggle.tsx` (4 of 4, exact, and both glyph-only branches `"☀"`/`"☾"` correctly excluded) and `apps/ui/components/TopBar.tsx` (12 of 12, exact, with `"Dialectical Engine"` and `"dezbatere.ro"` correctly excluded as brand and `"⚙"` as a glyph). No miss and no false positive in either.

**Class sweeps run in rework round 1 (finding B4/N2).** The blind review named 15 machine-code strings and 2 CSS values as samples. Sweeping the *class* rather than the sample removed **22** rows: 15 machine-code invariants and **7** CSS values — the 2 named plus `app/debate/[id]/DebatePageClient.tsx:1853` (`"8px 10px"`) and `:1854` (`"1px solid var(--line-strong)"`), `components/CanvasViewport.tsx:590` (`"0px 0px"`), `components/DebateMap.tsx:123` (`"opacity 0.15s"`) and `components/NodeDetailDrawer.tsx:202` (`"min(440px, 100vw)"`), none of which the review reached. 1371 - 22 = 1349.

**Known blind spots — state these before trusting a number.**
1. A string assembled at run time from parts that are individually not prose (`a + b + c`) is counted as its parts or not at all. No such site was found by hand in the four largest files, but the script cannot prove their absence — `UNVERIFIED`.
2. Strings arriving from `@debateai/contract` or the API and rendered verbatim are **not** in scope and are not counted; the mission translates the app's own words (intake C1, V-3).
3. The 18 JSX sentences split by inline markup are counted as their *fragments*, because that is what a key-per-literal extraction would produce. Four of them are true rich-text sentences and must become ONE key each with an embedded placeholder, which will REDUCE the key count by roughly 8. The number below is therefore an upper bound on keys, not a lower one.
4. Category assignment for a template literal follows its outermost node: a template containing markup counts as `f`, not `d`.
6. **Key identity (finding N7).** The 1349 sites carry **1091 distinct texts**: 153 English strings appear at more than one site, accounting for 258 repeat sites. **The policy is one key per SITE, not one key per distinct text.** Reason: two sites rendering the same English word can need different words in another language — `Close` is a button label in one place and a verb inside a sentence in another, and German splits them into `Schließen` and `Beenden`. A shared key makes that impossible to express, and the cost of a wrong word is higher than the cost of translating `Close` seven times. Cross-namespace consistency is enforced by the glossary rule (R43), which binds one English term to one word per language, not by key sharing. **Every language catalog therefore carries 1349 keys.**
5. `apps/ui/app/globals.css` carries no user-visible prose and is not in the string census; it enters the mission only through slice **I11** (right-to-left), measured separately below.

## Totals

| Measure | Count |
|---|---|
| Files scanned | 91 |
| Files carrying at least one translatable string | 73 |
| Files carrying none | 18 |
| **Translatable strings (total)** | **1349** |
| (a) JSX text nodes and JSX child expressions | 645 |
| (b) JSX attributes that reach the user | 167 |
| (c) String literals in copy modules and toast/error/message positions | 433 |
| (d) Template literals with interpolation | 101 |
| (f) Strings carrying markup, an entity or a link | 3 |
| (e) Lines building a plural by hand | 24 |
| (f-jsx) JSX sentences split by an inline element | 18 (4 true rich-text splits) |
| (g) Date / number / relative-time formatting sites | 16 (8 are `toLocale*` with no locale argument) |
| Strings examined and EXCLUDED with a reason | 6822 |

Categories (a)–(d) and (f) partition the 1371; (e), (f-jsx) and (g) are line-level findings that overlap them and are listed separately because each needs a different remedy.

## Per slice

| Slice | Namespace | Name | Strings | Files with strings | Files owned |
|---|---|---|---|---|---|
| I01 | `chrome` | Language foundation and the menu | 22 | 4 | 5 |
| I02 | `auth` | Auth screens | 117 | 5 | 11 |
| I03 | `account` | Settings and account | 90 | 4 | 4 |
| I04 | `landing` | Landing, library and new debate | 140 | 11 | 13 |
| I05 | `workspace` | Debate workspace shell | 187 | 5 | 9 |
| I06 | `views` | Debate views | 162 | 7 | 8 |
| I07 | `drawers` | Honesty and detail drawers | 205 | 4 | 4 |
| I08 | `panels` | Banners, panels and controls | 147 | 8 | 8 |
| I09 | `domain` | Domain copy modules | 215 | 18 | 20 |
| I10 | `public` | Public and admin routes, scanner at zero | 49 | 6 | 10 |
| I11 | `formats` | Locale formatting and right-to-left | 15 | 1 | 2 |
| **TOTAL** | | | **1349** | **73** | **94** |

Extraction slices are I02–I10; their spread is 49–229 with a mean of 143. I01 (22) is deliberately the smallest — it is the end-to-end proof and its cost is the foundation, not the strings. I10 (49) is small in strings and carries the scanner-at-zero gate for the whole app. I11 (15) is not an extraction slice: its work is 79 CSS declarations and 40 formatting/plural sites.

## Per category, per slice

| Slice | (a) JSX text | (b) attribute | (c) literal | (d) template | (f) markup |
|---|---|---|---|---|---|
| I01 | 9 | 8 | 5 | 0 | 0 |
| I02 | 61 | 11 | 44 | 1 | 0 |
| I03 | 52 | 5 | 27 | 5 | 1 |
| I04 | 66 | 24 | 45 | 5 | 0 |
| I05 | 86 | 44 | 49 | 8 | 0 |
| I06 | 93 | 18 | 19 | 32 | 0 |
| I07 | 145 | 38 | 11 | 9 | 2 |
| I08 | 98 | 10 | 36 | 3 | 0 |
| I09 | 0 | 0 | 183 | 32 | 0 |
| I10 | 35 | 9 | 3 | 2 | 0 |
| I11 | 0 | 0 | 11 | 4 | 0 |

## Per file

Every file below is owned by exactly one extraction slice; the map is exhaustive over the 73 string-bearing files and was checked mechanically for duplicates, orphans and non-existent paths.

| File (under `apps/ui/`) | Slice | Total | a | b | c | d | f |
|---|---|---|---|---|---|---|---|
| `app/debate/[id]/DebatePageClient.tsx` | I05 | 176 | 81 | 39 | 49 | 7 | 0 |
| `components/AnswerHonestyDrawer.tsx` | I07 | 109 | 82 | 23 | 0 | 3 | 1 |
| `components/NodeDetailDrawer.tsx` | I07 | 68 | 43 | 11 | 8 | 6 | 0 |
| `app/new/page.tsx` | I04 | 47 | 17 | 18 | 12 | 0 | 0 |
| `components/LoginFlow.tsx` | I02 | 47 | 20 | 3 | 24 | 0 | 0 |
| `components/DebateCanvas.tsx` | I06 | 44 | 27 | 2 | 3 | 12 | 0 |
| `components/PublicationControl.tsx` | I08 | 42 | 29 | 2 | 11 | 0 | 0 |
| `app/enroll-mfa/page.tsx` | I02 | 37 | 27 | 2 | 7 | 1 | 0 |
| `lib/v3/adapter.ts` | I09 | 36 | 0 | 0 | 26 | 10 | 0 |
| `lib/v3/labels.ts` | I09 | 36 | 0 | 0 | 36 | 0 | 0 |
| `components/EvaluatorDevMenu.tsx` | I08 | 34 | 31 | 0 | 2 | 1 | 0 |
| `app/settings/page.tsx` | I03 | 32 | 21 | 1 | 7 | 2 | 1 |
| `components/DebateSplit.tsx` | I06 | 32 | 26 | 0 | 6 | 0 | 0 |
| `components/ArgumentFocusView.tsx` | I06 | 31 | 10 | 11 | 2 | 8 | 0 |
| `components/SessionControls.tsx` | I03 | 31 | 17 | 2 | 10 | 2 | 0 |
| `components/SignUpFlow.tsx` | I02 | 29 | 11 | 6 | 12 | 0 | 0 |
| `components/VerdictBanner.tsx` | I08 | 28 | 13 | 1 | 13 | 1 | 0 |
| `components/DebateTree.tsx` | I06 | 27 | 10 | 5 | 6 | 6 | 0 |
| `components/PublicHonestyDrawer.tsx` | I10 | 27 | 19 | 8 | 0 | 0 | 0 |
| `lib/scoringResponse.ts` | I09 | 27 | 0 | 0 | 22 | 5 | 0 |
| `components/AccountErasureControls.tsx` | I03 | 25 | 14 | 2 | 8 | 1 | 0 |
| `lib/debatePresentation.ts` | I09 | 23 | 0 | 0 | 21 | 2 | 0 |
| `app/page.tsx` | I04 | 16 | 11 | 2 | 3 | 0 | 0 |
| `components/landing/cards.ts` | I04 | 16 | 0 | 0 | 16 | 0 | 0 |
| `lib/scrutiny.ts` | I09 | 16 | 0 | 0 | 16 | 0 | 0 |
| `lib/format.ts` | I11 | 15 | 0 | 0 | 11 | 4 | 0 |
| `lib/scoringStatusCopy.ts` | I09 | 15 | 0 | 0 | 13 | 2 | 0 |
| `components/DebateWorkspaceDrawer.tsx` | I07 | 14 | 12 | 2 | 0 | 0 | 0 |
| `components/InvestigationDrawer.tsx` | I07 | 14 | 8 | 2 | 3 | 0 | 1 |
| `components/SynthesisPanel.tsx` | I08 | 14 | 9 | 1 | 4 | 0 | 0 |
| `components/GuideModal.tsx` | I04 | 13 | 4 | 1 | 8 | 0 | 0 |
| `components/landing/LandingSample.tsx` | I04 | 13 | 12 | 0 | 0 | 1 | 0 |
| `lib/scoringFormat.ts` | I09 | 13 | 0 | 0 | 6 | 7 | 0 |
| `components/LegacyRunClaimControls.tsx` | I08 | 12 | 5 | 1 | 5 | 1 | 0 |
| `components/RecommendedInvestigations.tsx` | I08 | 12 | 10 | 1 | 1 | 0 | 0 |
| `components/TopBar.tsx` | I01 | 12 | 3 | 5 | 4 | 0 | 0 |
| `components/DebateOutline.tsx` | I06 | 11 | 4 | 0 | 2 | 5 | 0 |
| `components/DebateThread.tsx` | I06 | 10 | 10 | 0 | 0 | 0 | 0 |
| `lib/recommendation.ts` | I09 | 10 | 0 | 0 | 10 | 0 | 0 |
| `app/public/debate/[id]/PublicDebatePageClient.tsx` | I10 | 9 | 7 | 0 | 2 | 0 | 0 |
| `components/landing/LandingHero.tsx` | I04 | 9 | 8 | 1 | 0 | 0 | 0 |
| `lib/v3/tokenUnlock.ts` | I09 | 9 | 0 | 0 | 6 | 3 | 0 |
| `app/new/defaults.tsx` | I04 | 7 | 0 | 0 | 5 | 2 | 0 |
| `components/DebateMap.tsx` | I06 | 7 | 6 | 0 | 0 | 1 | 0 |
| `components/CanvasViewport.tsx` | I05 | 6 | 1 | 5 | 0 | 0 | 0 |
| `components/DebatesBuffer.tsx` | I04 | 6 | 3 | 0 | 1 | 2 | 0 |
| `components/PublicAnswerDisclosure.tsx` | I10 | 6 | 5 | 1 | 0 | 0 | 0 |
| `lib/scrutinyDepth.ts` | I09 | 6 | 0 | 0 | 6 | 0 | 0 |
| `lib/v3/answerExport.ts` | I09 | 6 | 0 | 0 | 5 | 1 | 0 |
| `components/landing/LandingChrome.tsx` | I01 | 5 | 4 | 1 | 0 | 0 | 0 |
| `components/LibraryComposer.tsx` | I04 | 5 | 3 | 2 | 0 | 0 | 0 |
| `app/admin/workers/page.tsx` | I10 | 4 | 4 | 0 | 0 | 0 | 0 |
| `components/landing/LandingMethod.tsx` | I04 | 4 | 4 | 0 | 0 | 0 | 0 |
| `components/landing/LandingPricing.tsx` | I04 | 4 | 4 | 0 | 0 | 0 | 0 |
| `components/ModelPresentation.tsx` | I08 | 4 | 0 | 4 | 0 | 0 | 0 |
| `components/ModeToggle.tsx` | I01 | 4 | 2 | 2 | 0 | 0 | 0 |
| `lib/observability/suspiciousScoring.ts` | I09 | 4 | 0 | 0 | 4 | 0 | 0 |
| `lib/v3/missingCapabilities.ts` | I09 | 4 | 0 | 0 | 4 | 0 | 0 |
| `app/debate/[id]/loading.tsx` | I05 | 3 | 3 | 0 | 0 | 0 | 0 |
| `components/AuthGate.tsx` | I02 | 3 | 3 | 0 | 0 | 0 | 0 |
| `lib/models.ts` | I09 | 3 | 0 | 0 | 3 | 0 | 0 |
| `lib/v3/liveEvents.ts` | I09 | 3 | 0 | 0 | 3 | 0 | 0 |
| `lib/api.ts` | I09 | 2 | 0 | 0 | 1 | 1 | 0 |
| `lib/serverApi.ts` | I03 | 2 | 0 | 0 | 2 | 0 | 0 |
| `lib/v3/census.ts` | I10 | 2 | 0 | 0 | 0 | 2 | 0 |
| `app/api/[...path]/route.ts` | I10 | 1 | 0 | 0 | 1 | 0 | 0 |
| `app/debate/[id]/page.tsx` | I05 | 1 | 0 | 0 | 0 | 1 | 0 |
| `app/layout.tsx` | I01 | 1 | 0 | 0 | 1 | 0 | 0 |
| `components/ChallengePopover.tsx` | I05 | 1 | 1 | 0 | 0 | 0 | 0 |
| `components/ScoringErrorBoundary.tsx` | I08 | 1 | 1 | 0 | 0 | 0 | 0 |
| `lib/makerIdentity.ts` | I09 | 1 | 0 | 0 | 1 | 0 | 0 |
| `lib/mfaEnrollment.ts` | I02 | 1 | 0 | 0 | 1 | 0 | 0 |
| `lib/observability/logger.ts` | I09 | 1 | 0 | 0 | 0 | 1 | 0 |

### The 18 files with zero translatable strings

v1 of this file named 11 and one of the 11 (`app/globals.css`) is not one of the 91 scanned files at all, because it is not a `.ts`/`.tsx`. Eight files were therefore listed nowhere and owned by nobody. Corrected in rework round 1 (finding N1); the set below is computed as the 91 scanned files minus the 73 carrying a string, and every one now has an owner assigned by import affinity.

| File | Slice | Why that slice |
|---|---|---|
| `app/debate/[id]/DebatePageGate.tsx` | I05 | the debate route it gates |
| `app/login/page.tsx` | I02 | renders `LoginFlow` |
| `app/public/debate/[id]/page.tsx` | I10 | renders `PublicDebatePageClient` |
| `app/sign-up/page.tsx` | I02 | renders `SignUpFlow` |
| `app/verify-email/page.tsx` | I02 | re-exports the enrolment page |
| `components/AuthShell.tsx` | I02 | receives every string it renders as a prop from `LoginFlow` and `SignUpFlow` |
| `components/Toast.tsx` | I04 | renders a `message` prop supplied by the landing and library screens |
| `components/landing/LandingPage.tsx` | I04 | composition only, over the landing components |
| `lib/authNavigationGuard.ts` | I01 | imported by `TopBar.tsx`, which I01 owns |
| `lib/canvasViewport.ts` | I05 | imported by `CanvasViewport.tsx` |
| `lib/debateHeaderOverflow.ts` | I05 | imported by `DebatePageClient.tsx` |
| `lib/debateTreeUtils.ts` | I06 | imported by the four tree and split views |
| `lib/observability/index.ts` | I09 | the observability barrel, beside `logger.ts` and `suspiciousScoring.ts` |
| `lib/returnPath.ts` | I02 | imported by `LoginFlow.tsx` |
| `lib/scoring/scoringResponseSpecification.ts` | I09 | imported by `lib/observability/suspiciousScoring.ts` |
| `lib/totpQr.ts` | I02 | the enrolment QR helper |
| `lib/types.ts` | I05 | imported by the debate route files |
| `lib/v3/publicAnswerExport.ts` | I10 | the public export helper |

18 files. They are owned so that an import change has a single owner; their only literals are the brand mark, route paths and type-level unions.

`apps/ui/app/globals.css` is owned by I11 and is not in the string census — it carries no prose. `apps/ui/app/not-found.tsx` and `apps/ui/app/global-error.tsx` do not exist yet and are authored by I10.

## (e) Hand-made plurals — 24 lines

Each is a place where English grammar is hard-coded into the code path. Every one must become a plural-category lookup, because Arabic needs six forms and Chinese, Japanese, Korean, Vietnamese and Indonesian need one.

| File:line | Source |
|---|---|
| `components/ArgumentFocusView.tsx:116` | `<span aria-label={`${perspectives.length} ${perspectives.length === 1 ? "perspective" : "perspectives"}`}>` |
| `components/ArgumentFocusView.tsx:142` | `<span aria-label={`${proChildren.length} pro ${proChildren.length === 1 ? "argument" : "arguments"}`}>` |
| `components/ArgumentFocusView.tsx:151` | `<span aria-label={`${conChildren.length} con ${conChildren.length === 1 ? "argument" : "arguments"}`}>` |
| `components/DebateCanvas.tsx:709` | `? `${fatalFlags.length} fatal ${fatalFlags.length === 1 ? "flag" : "flags"}`` |
| `components/DebateCanvas.tsx:712` | `? `${highPriorityHoles.length} high-priority ${highPriorityHoles.length === 1 ? "hole" : "holes"}`` |
| `components/DebateTree.tsx:287` | `<div className="abandonedPaths" aria-label={`${abandonedChildren.length} stopped path${abandonedChildren.length === 1 ? "" : "s"}`` |
| `components/DebateTree.tsx:289` | `⊗ {abandonedChildren.length} stopped path{abandonedChildren.length === 1 ? "" : "s"}` |
| `components/DebatesBuffer.tsx:66` | `? `${debate.models.length} model${debate.models.length === 1 ? "" : "s"}`` |
| `components/LegacyRunClaimControls.tsx:33` | `? `${result.claimed_count} legacy ${result.claimed_count === 1 ? "debate" : "debates"} added to this account.`` |
| `components/NodeDetailDrawer.tsx:637` | `{additionalRecommendations.length === 1 ? "" : "s"}` |
| `components/RecommendedInvestigations.tsx:87` | `{additionalRecommendations.length === 1 ? "" : "s"}` |
| `lib/format.ts:9` | `if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;` |
| `lib/format.ts:11` | `if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;` |
| `lib/format.ts:16` | `if (week < 5) return `${week} week${week === 1 ? "" : "s"} ago`;` |
| `lib/scoringFormat.ts:129` | ``${count} distinct source-domain/method pair${count === 1 ? "" : "s"}` +` |
| `lib/scoringResponse.ts:125` | `function pluralize(count: number, singular: string, plural = `${singular}s`): string {` |
| `lib/scoringResponse.ts:126` | `return `${count} ${count === 1 ? singular : plural}`;` |
| `lib/scoringResponse.ts:132` | `return `Showing ${pluralize(count, "persisted scored claim")} from the scoring response.`;` |
| `lib/scoringResponse.ts:138` | `return `Showing ${pluralize(count, "persisted scored claim")} while it completes.`;` |
| `lib/scoringResponse.ts:159` | `scoredCount > 0 ? `Showing ${pluralize(scoredCount, "persisted scored claim")}` : "No persisted scored claims";` |
| `lib/scoringResponse.ts:161` | `? `${scoredDetail}; ${pluralize(unavailableCount, "unavailable claim")}.`` |
| `lib/v3/adapter.ts:508` | `? `The model provider stopped responding; one final attempt is scheduled for ${new Date(run.hold_until).toLocaleString()} (${remai` |
| `lib/v3/liveEvents.ts:285` | `? `${settled} of ${total} ${total === 1 ? "node" : "nodes"} settled`` |
| `lib/v3/liveEvents.ts:286` | `: `${total} ${total === 1 ? "node" : "nodes"} in play`);` |

## (g) Date, number and relative-time formatting — 12 user-visible sites

v1 called this "16 sites" and slice I11 was told to make each of the 16 pass the active language to `Intl`. Four of the sixteen are not sites. Corrected in rework round 1 (finding N3); **I11-R01 is worded against the 12.**

| File:line | Source | In scope for I11? |
|---|---|---|
| `app/public/debate/[id]/PublicDebatePageClient.tsx:76` | `{new Date(debate.published_at).toLocaleDateString()}` | yes |
| `components/AccountErasureControls.tsx:109` | `{new Date(scheduled.execute_at).toLocaleString()}.` | yes |
| `components/CanvasViewport.tsx:119` | `surface.dataset.zoom = state.zoom.toFixed(4);` | no — writes a `data-zoom` attribute no reader sees |
| `components/CanvasViewport.tsx:573` | `data-zoom={zoom.toFixed(4)}` | no — writes a `data-zoom` attribute no reader sees |
| `components/DebatesBuffer.tsx:5` | `import { isComplete, relativeTime, statusLabel } from "@/lib/format";` | no — an `import` statement |
| `components/DebatesBuffer.tsx:64` | `? [relativeTime(debate.created_at),` | yes |
| `components/DebatesBuffer.tsx:103` | `meta={[relativeTime(debate.published_at), debate.confidence_band?.toLowerCase()]` | yes |
| `components/EvaluatorDevMenu.tsx:123` | `{profile.metric}: {profile.value === null ? "no value" : profile.value.toFixed(3)} · n={profile.n}` | yes |
| `components/PublicAnswerDisclosure.tsx:13` | `<p>Evidence as of {new Date(answer.as_of).toLocaleString()}.</p>` | yes |
| `components/PublicHonestyDrawer.tsx:29` | `<p>Evidence as of {new Date(answer.as_of).toLocaleString()}.</p>` | yes |
| `components/SessionControls.tsx:161` | `new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });` | yes |
| `components/SessionControls.tsx:191` | `Last seen {new Date(session.last_seen_at).toLocaleString()}` | yes |
| `lib/format.ts:1` | `export function relativeTime(input: string \| null \| undefined): string {` | no — a function signature |
| `lib/format.ts:17` | `return new Date(input).toLocaleDateString();` | yes |
| `lib/v3/adapter.ts:363` | `const decimal = rounded.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");` | yes |
| `lib/v3/adapter.ts:508` | `? `The model provider stopped responding; one final attempt is scheduled for ${new Date(run.hold_until).toLoca` | yes |

**12 in scope, 4 out.** Eight of the twelve are `toLocaleDateString` / `toLocaleString` called with **no locale argument**, so they follow the browser rather than the chosen language: `app/public/debate/[id]/PublicDebatePageClient.tsx:76`, `components/AccountErasureControls.tsx:109`, `components/PublicHonestyDrawer.tsx:29`, `components/SessionControls.tsx:161`, `components/SessionControls.tsx:191`, `components/PublicAnswerDisclosure.tsx:13`, `lib/format.ts:17`, `lib/v3/adapter.ts:508`. The rest are `relativeTime` call sites, one `toFixed` that renders a number (`components/EvaluatorDevMenu.tsx:123`) and the concatenated percentage at `lib/v3/adapter.ts:363`.

## (f) JSX sentences split by inline markup — 18 sites, 4 of them true splits

A "true split" is a sentence whose grammar runs through an inline element, so it cannot be one key unless the element becomes a placeholder. The other 14 are a label beside a decorative `aria-hidden` glyph or swatch and extract as a single key.

| File:line | True split? | Fragment |
|---|---|---|
| `app/debate/[id]/DebatePageClient.tsx:1112` | no — decorative glyph | `<button type="button" className="debateScoringPill" data-debate-scoring-pill aria-label="Open scoring diagnost` |
| `app/new/page.tsx:252` | no — decorative glyph | `<button type="button" className="ndOptionsToggle" aria-expanded={optionsOpen} aria-controls={optionsOpen ? "ad` |
| `app/new/page.tsx:318` | **yes** | `<p className="ndProvenance"> Role overrides are not user-editable — model role assignment lives in{" "} <butto` |
| `app/settings/page.tsx:126` | no — decorative glyph | `<div className="pill pillGen" style={{ marginTop: 24 }}> <span className="dot" /> Read-only </div>` |
| `components/AccountErasureControls.tsx:107` | **yes** | `<p className="setStatus" role="status"> Status: <strong>{scheduled.status}</strong>. Scheduled deletion time:{` |
| `components/DebateCanvas.tsx:556` | no — decorative glyph | `<button type="button" className="nodeCtrl" aria-label="Details" onClick={(event) => { event.stopPropagation();` |
| `components/DebateMap.tsx:102` | no — decorative glyph | `<span className="mapLegendItem"> <span className="mapLegendSwatch" style={{ background: "var(--pro-line)" }} /` |
| `components/DebateMap.tsx:106` | no — decorative glyph | `<span className="mapLegendItem"> <span className="mapLegendSwatch" style={{ background: "var(--con-line)" }} /` |
| `components/EvaluatorDevMenu.tsx:45` | no — decorative glyph | `<div className="pill pillGen"> <span className="dot" /> Developer surface </div>` |
| `components/InvestigationDrawer.tsx:95` | no — decorative glyph | `<div className="invWorking"> <span className="invWorkingDot" /> Awaiting your judgement… </div>` |
| `components/LoginFlow.tsx:144` | **yes** | `<p>No account yet? <Link href={signUpHref}>Create one</Link></p>` |
| `components/SignUpFlow.tsx:194` | **yes** | `<p className="authPanelFooter">Already have one? <Link href={loginHref}>Log in</Link></p>` |
| `components/landing/LandingChrome.tsx:39` | no — decorative glyph | `<a className="lpCta lpCtaNav" href="/login?next=%2Fnew"> Start a round <span className="lpArrow" aria-hidden="` |
| `components/landing/LandingHero.tsx:23` | no — decorative glyph | `<a className="lpCta lpCtaHero" href="/login?next=%2Fnew"> Start a round <span className="lpArrow" aria-hidden=` |
| `components/landing/LandingPricing.tsx:26` | no — decorative glyph | `<a className="lpCta lpCtaClosing" href="/login?next=%2Fnew"> Start a round <span className="lpArrow" aria-hidd` |
| `components/landing/LandingSample.tsx:25` | no — decorative glyph | `<span> <span className="lpSwatch" data-stance="pro" aria-hidden="true" /> Pro </span>` |
| `components/landing/LandingSample.tsx:29` | no — decorative glyph | `<span> <span className="lpSwatch" data-stance="con" aria-hidden="true" /> Con </span>` |
| `components/landing/LandingSample.tsx:33` | no — decorative glyph | `<span> <span className="lpSwatch" data-stance="reasoning" aria-hidden="true" /> Reasoning </span>` |

## Right-to-left surface (slice I11), measured separately

`apps/ui/app/globals.css` is 6266 lines and carries **79 physical direction declarations** that must become logical properties, plus 8 logical properties already in place:

| Declaration | Count |
|---|---|
| `left:` | 16 |
| `margin-left` | 14 |
| `border-left` | 9 |
| `text-align: left` | 8 |
| `right:` | 7 |
| `padding-left` | 7 |
| `text-align: right` | 6 |
| `padding-right` | 5 |
| `border-left-width` | 4 |
| `border-left-color` | 2 |
| `border-bottom-left-radius` | 1 |
| **Total** | **79** |

`margin-right`, `border-right` and `float` do not occur. `flex-direction` occurs 28 times and is direction-agnostic under `dir="rtl"` for `row`; it is not in the 79.

## What was EXCLUDED, and why

6822 literals were examined and rejected. Every one carries its reason in `census.json`. By reason, largest first:

| Reason | Count |
|---|---|
| empty/whitespace | 2640 |
| non-visible position (jsx-attr:className) | 1251 |
| type-level literal or switch-case discriminant | 529 |
| operand of an equality comparison (state value, not copy) | 461 |
| module specifier / import path | 279 |
| kebab-case identifier / key / test id | 238 |
| glyph or punctuation only (no letters) | 209 |
| not prose-shaped (identifier-like token in a weak position) | 134 |
| non-visible position (jsx-attr:type) | 121 |
| CSS value inside a style object / CSSProperties cast | 103 |
| SCREAMING_SNAKE enum value / status code | 81 |
| non-visible position (jsx-attr:id) | 55 |
| non-visible position (prop:status) | 48 |
| non-visible position (jsx-attr:role) | 48 |
| module directive | 39 |
| route path | 36 |
| non-visible position (prop:kind) | 35 |
| CSS value template (units only outside interpolation) | 33 |
| _(97 further reasons, 482 literals)_ | |

**The untranslatable classes, named.** Brand marks (`Dialectical Engine`, `DebateAI`, `dezbatere.ro`); model identifiers (`gpt-5.6-sol`, `claude-opus-5`, `gemini-3-ultra`); glyphs and dingbats carrying no letters (`☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`); CSS class names; route paths; cookie, storage and telemetry keys; `SCREAMING_SNAKE` vocabulary values from `@debateai/contract`; switch-case discriminants and type-level literals; module specifiers; and the `"use client"` directive.

