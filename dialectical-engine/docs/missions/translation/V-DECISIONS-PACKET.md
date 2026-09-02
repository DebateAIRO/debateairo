# V DECISIONS PACKET — mission `translation`

**How this works.** Each row is one question only V can settle. Every row already has a DEFAULT the mission is proceeding on, so nothing waits on this file. To rule, reply in chat with the row id and your choice (or your own answer); the orchestrator appends the ruling to the affected slices' `DECISIONS.md` and re-routes work if the ruling changes it. Rows are written so that a reader who knows nothing about the codebase can answer them.

| Row | Question | Default in force | Status |
|---|---|---|---|
| V-1 | Who does the coding and the translating | **RULED 2026-09-02: Opus 5 subagents for every seat; Fable 5.1 only as orchestrator; V is QA** | RULED |
| V-2 | Which languages | English + 16 (table below) | OPEN — proceeding on default |
| V-3 | What gets translated | The app's own words only; model-written debate content stays as argued | OPEN — proceeding on default |
| V-4 | Right-to-left languages (Arabic, Urdu) | Full mirrored layout in this mission | OPEN — proceeding on default |
| V-5 | Fonts for non-Latin scripts | System fallback fonts per script; no new font files | OPEN — proceeding on default |
| V-6 | Where the chosen language is remembered | Browser cookie, one year; not on the account | OPEN — proceeding on default |
| V-7 | First visit, before any choice | Use the browser's own language if we have it, else English | OPEN — proceeding on default |
| V-8 | In-house i18n layer vs the `next-intl` package | Architecture seat decides and records an ADR; shown here for information | PENDING ARCH |
| T-1 | Which brand name: `DebateAI` (landing) or `Dialectical Engine` (app) | Leave both as they are; both untranslatable tokens (REQ-01 recommends `Dialectical Engine` everywhere) | OPEN — proceeding on default |
| T-2 | Are the mode names Terracotta / Chamber translated | Kept in English in every language | OPEN — proceeding on default |
| T-3 | Designed language panel vs the browser's own dropdown | Designed panel (button + listbox) with a written keyboard contract; ARCH-01 settles the mechanics | OPEN — proceeding on default |
| T-4 | Cookie name: `__Host-debateai-locale` (HTTPS-only, repo convention) vs plain | `__Host-` prefix, matching the two existing cookies; plain-HTTP dev mode loses memory, documented | OPEN — proceeding on default |
| T-5 | A Traditional-Chinese browser gets Simplified Chinese or English | English | OPEN — proceeding on default |
| T-6 | Arabic digits `123` or `١٢٣` | Western digits `123` | OPEN — proceeding on default |
| T-7 | Debate content inside a right-to-left page: mark its own direction? | Yes, `dir="auto"` per content block | OPEN — proceeding on default |
| T-8 | All 17 languages now, or 7 now + 10 later | **All 17 now** — V's words are "the most used languages across the globe"; REQ-01's pick was 7-now (low confidence) | OPEN — proceeding on default |

---

## V-1 — Who does the coding and the translating

**What this is.** The mission runs as a fleet of seats. Seats write the requirements, plan the build, do the coding (moving every English sentence out of the code into catalog files, and adding the language menu), author the translations, and review each other's work. V tests the finished slices.

**Why it matters.** Your last two missions used Codex (gpt-5.6-sol) for coding and Fable 5.1 for planning and review. Your prompt this time named Fable as the actor ("You are Fable on a translation mission") and named no coder. Translation quality is the core deliverable and it is a language-model skill; Fable 5.1 is the strongest translator available in the harness. Codex seats each need a visible Terminal window and 30–90 minutes per run; Fable subagents run inside this session, many at once.

**The weakness of the default, recorded honestly.** The same base model (Fable 5.1) will write code and review it. Reviews are decorrelated only by separate sessions, blind worktrees, and probe-not-read discipline — weaker than a cross-house review (Codex writes, Fable reviews).

**Example.** Slice I01 adds the language menu. Default: a Fable worker builds it in its own worktree; a different Fable session reviews it blind and tries to break it. Alternative: a Codex seat builds it in a Terminal window you can watch; a Fable session reviews it.

**Options.** (a) Fable 5.1 everywhere. (b) Codex gpt-5.6-sol for the code slices (I01–I07), Fable for translations and reviews. (c) Codex for everything except translations and reviews.

**V's ruling (2026-09-02, verbatim):** "ok, if you have the plan for this, use Opus 5 subagents to do the work, and keep Fable 5.1 only as orchestrator" → every seat runs on Opus 5; the orchestrator stays Fable 5.1. Recorded in H0 and in every packet.

---

## V-2 — Which languages

**What this is.** The list of languages the menu offers and the app is translated into. "Most used across the globe" was measured two ways: total speakers (native + second language) and internet users by language. Both rankings agree on the top block. Romanian is added because the product's home market is `dezbatere.ro`, not because of global rank.

| # | Language (native name) | Code | Script · direction | Why it is in |
|---|---|---|---|---|
| 1 | English | `en` | Latin · LTR | source language |
| 2 | 简体中文 (Chinese, Simplified) | `zh-CN` | Han · LTR | #2 speakers, #2 internet users |
| 3 | हिन्दी (Hindi) | `hi` | Devanagari · LTR | #3 speakers |
| 4 | Español (Spanish) | `es` | Latin · LTR | #4 speakers, #3 internet users |
| 5 | العربية (Arabic) | `ar` | Arabic · **RTL** | #5 speakers, #4 internet users |
| 6 | Français (French) | `fr` | Latin · LTR | #6 speakers |
| 7 | বাংলা (Bengali) | `bn` | Bengali · LTR | #7 speakers |
| 8 | Português (Brasil) | `pt-BR` | Latin · LTR | #8 speakers, #5 internet users |
| 9 | Русский (Russian) | `ru` | Cyrillic · LTR | #9 speakers, top-10 internet |
| 10 | اردو (Urdu) | `ur` | Arabic · **RTL** | #10 speakers |
| 11 | Bahasa Indonesia | `id` | Latin · LTR | #11 speakers, #6 internet users |
| 12 | Deutsch (German) | `de` | Latin · LTR | #12 speakers, top-10 internet |
| 13 | 日本語 (Japanese) | `ja` | Kana/Kanji · LTR | top-10 internet users |
| 14 | 한국어 (Korean) | `ko` | Hangul · LTR | top-15 internet users |
| 15 | Türkçe (Turkish) | `tr` | Latin · LTR | top-15 internet users |
| 16 | Tiếng Việt (Vietnamese) | `vi` | Latin · LTR | top-15 internet users |
| 17 | Română (Romanian) | `ro` | Latin · LTR | home market (dezbatere.ro) |

**Cost of changing it.** Striking a language deletes one folder. Adding one costs one translation seat plus one review seat (about an hour, in parallel with the others). Candidates you might add: Italiano, Polski, Nederlands, فارسی (Persian, RTL), Kiswahili, मराठी, తెలుగు, தமிழ், Bahasa Melayu, ไทย.

**Options.** (a) **Default — the 17 above.** (b) Strike some. (c) Add some from the candidate list or your own.

---

## V-3 — What gets translated

**What this is.** Two kinds of text appear on screen: the app's own words (buttons, titles, menus, error messages, dates, empty states — written by us) and the debate content (the question you typed, the arguments and verdicts the models wrote — produced at run time).

**Why the split exists.** The app's words are a fixed set; seats translate them once and commit the files. Debate content is different on every run and translating it at run time would need a live language-model call. DR-179 (your no-API-keys hold) leaves the CLI relay as the only lawful model access, so run-time translation is not built here.

**Example.** You switch to Español. "New debate", "Start run", "Scoring", the dates and the error banners are all in Spanish. A debate the models argued in English is still shown in English, word for word.

**Options.** (a) **Default — app words only; content stays as argued.** (b) Also queue a follow-up mission "debate language": a field on the New debate screen that asks the models to argue in the chosen language (a product feature, not a translation). (c) Something else you have in mind.

---

## V-4 — Right-to-left languages

**What this is.** Arabic and Urdu are written right-to-left. Correct support does two things: the text runs right-to-left (cheap, one attribute on the page), and the layout mirrors — menus and buttons move to the other side, arrows point the other way, margins flip.

**Why it costs.** The app's stylesheet was written with left/right instructions (margin-left, text-align: left…). Mirroring means auditing those and converting them to start/end instructions, then checking every screen in Arabic. That is its own slice (I07): one worker plus one blind reviewer, roughly 2–3 hours.

**Example.** In Arabic, the "New debate" button should sit at the top-LEFT (the mirror of its English top-right position) and the "←" back arrow becomes "→".

**Options.** (a) **Default — full mirroring in this mission.** (b) Ship Arabic and Urdu with right-to-left text but the layout unmirrored, and fix later. (c) Drop Arabic and Urdu from V-2.

---

## V-5 — Fonts for non-Latin scripts

**What this is.** The design uses three fonts (Fraunces for headlines, Plus Jakarta Sans for text, JetBrains Mono for code), loaded with Latin characters only. Chinese, Japanese, Korean, Arabic, Hindi, Bengali, Urdu and Russian letters do not exist in those files, so the browser falls back to whatever the operating system has.

**Why it matters.** With the default, those languages look native and readable but not "Terracotta-designed" (system fonts differ per device). The alternative bundles a designed font per script (Google's Noto family, self-hosted so the security policy stays as it is), adding several megabytes of font files and one slice of work.

**Example.** On a Mac, Japanese text would show in Hiragino Sans by default; with the alternative it would show in Noto Sans JP everywhere.

**Options.** (a) **Default — per-script system fallbacks, declared in the stylesheet.** (b) Add Noto per script now. (c) Add Noto later as a follow-up slice.

---

## V-6 — Where the chosen language is remembered

**What this is.** When you pick a language from the menu, the choice has to be stored somewhere so it survives reloads and returns. Default: a cookie in the browser (`debateai.locale`, one year). It works before sign-in, after sign-in, and on the public debate pages, and it never leaves the browser — the API proxy forwards only the session and CSRF cookies (`apps/ui/app/api/[...path]/route.ts:82-96`).

**Why not the account.** Storing it on the account would follow you across devices, but it touches the settings screen and the account data, which belong to the accounts/privacy program and its own review rules. That is a later phase, not this mission.

**Example.** You pick Deutsch on your laptop; every visit from that laptop is in German. Your phone starts from its own browser language (see V-7) until you pick there too.

**Options.** (a) **Default — cookie only.** (b) Cookie now, account setting queued as a follow-up mission. (c) Account setting in this mission (crosses into the accounts program; needs your explicit say).

---

## V-7 — First visit, before any choice

**What this is.** Browsers send a preferred-languages list with every request. On a first visit with no cookie yet, the app can either read that list and pick the best match we have, or ignore it and show English until the visitor picks.

**Example.** A visitor whose browser is set to Portuguese (Brazil) opens the landing page: default shows it in Portuguese immediately; the alternative shows English with the menu available.

**Options.** (a) **Default — best match from the browser's list, else English.** (b) Always English until chosen.

---

## V-8 — In-house i18n layer vs the `next-intl` package (information row)

**What this is.** The code needs a small machine that, given the chosen language and a text key, returns the right sentence, fills in variables ("{count} models"), picks plural forms, and lets links sit inside sentences. Two ways: write it ourselves (about 250 lines, no new dependency) or add the `next-intl` package (widely used with this app framework, adds a dependency and a build plugin).

**Who decides.** The architecture seat, recording an ADR under `docs/architecture/01-decisions/`. This row exists so you see the choice; if you have a preference, say it before ARCH-01 hands off (roughly one hour after REQ-01 lands).

**Options.** (a) In-house layer. (b) `next-intl`. (c) No preference — architecture seat decides (default).

---

# Rows T-1 … T-8 — collected by REQ-01 (2026-09-02), defaults set by the orchestrator

These come from the requirements seat's `requirements/translation.md` §Q8, copied verbatim so this file stays self-contained. "My pick" is REQ-01's; the **default in force** is in the summary table at the top of this file — it differs from REQ-01's pick only on T-1 (left as is: a brand decision, not a translation one) and T-8 (all 17: your verbatim goal).

| Row | The question, in plain words | Options | REQ-01's pick | Confidence | Strongest counter |
|---|---|---|---|---|---|
| **T-1** | The product calls itself two different things on screen. The landing page's logo says **DebateAI**; the top bar inside the app says **Dialectical Engine** above the address `dezbatere.ro`. Both are untranslatable brand marks, so whichever we keep will appear identically in all 17 languages. Which is the name? | (a) `Dialectical Engine` everywhere; (b) `DebateAI` everywhere; (c) leave both as they are | (a) — the standing naming law says the product is `dialectical-engine`, and the auth screens, the browser tab title and the top bar already use it; the landing page is the outlier | medium | The landing page is the only screen an unsigned visitor sees, and `DebateAI` may be the deliberate public-facing mark; changing it is a marketing decision, not a translation one. A one-word fix is also outside this mission's scope, which is why it is a row and not a requirement |
| **T-2** | The two display modes are named **Terracotta** (light) and **Chamber** (dark). Are these product names that stay in English in all 17 languages, or ordinary words a translator should render (Spanish *Terracota* / *Cámara*, Japanese テラコッタ / チェンバー)? | (a) keep both in English everywhere; (b) translate both; (c) keep `Terracotta`, translate `Chamber` | (a) — they name two specific designed appearances, not a colour and a room, and a reader who switches languages should still recognise the control | medium | In non-Latin scripts an untransliterated Latin word inside otherwise-Japanese chrome reads as untranslated, which is exactly what the leak rule exists to prevent; option (b) with a glossary cell per language would look more finished |
| **T-3** | The language menu can be a plain browser dropdown or a designed panel. The plain one gets full keyboard and mobile behaviour for free from the browser and can never have a keyboard defect; the designed one matches the rest of the interface but every keyboard behaviour must be written and tested by hand. | (a) designed panel (button + listbox) with a written keyboard contract; (b) native `<select>`; (c) native `<select>` on small screens, designed panel above 640px | (a) — the chrome is bespoke and a browser dropdown would be the only unstyled control on the page | medium | (b) removes a whole class of accessibility defect at zero cost, and 17 native names in a system dropdown is genuinely usable. Every keyboard bug we ship in (a) is one we chose to be able to have |
| **T-4** | The cookie that remembers the language can be named `__Host-debateai-locale`, which forces the browser to send it only over HTTPS and only for the whole site. That matches the two cookies the app already uses. But if any environment ever serves plain HTTP, the cookie silently does nothing and every visit falls back to the browser's language. | (a) `__Host-debateai-locale`, HTTPS-only; (b) plain `debateai.locale`, works over HTTP too; (c) `__Host-` in production, plain name in development | (a) — the dev stack is already HTTPS on port 3000, and the `__Host-` prefix is this repo's convention | high | A future preview deployment or a proxy terminating TLS elsewhere would break language memory with no error message anywhere; (c) costs one conditional and removes the failure mode |
| **T-5** | A visitor whose browser is set to Traditional Chinese (Taiwan, Hong Kong) asks for `zh-Hant`. We will only have Simplified Chinese. Do we serve them Simplified, or English? | (a) English; (b) Simplified Chinese; (c) add Traditional Chinese as an 18th language | (a) — serving Simplified to a Traditional reader is a recognisable mistake and reads as carelessness; English is neutral | medium | A Traditional reader can usually read Simplified, and Chinese-of-any-kind is more useful to them than English; option (b) is what most products do |
| **T-6** | Arabic can display numbers as `123` or as `١٢٣`. The default gives `123`. Which does the Arabic edition use? | (a) `123` (Western digits, the default); (b) `١٢٣` (Arabic-Indic digits) | (a) — most Arabic-language software and the web at large use Western digits, and scores and percentages stay comparable across languages | medium | For a reader in the Gulf, `١٢٣` is the natural form and its absence is the first thing that marks a page as machine-localised. It costs one locale extension (`ar-u-nu-arab`), not a slice |
| **T-7** | Debate content — the question the asker typed and the arguments the models wrote — stays in the language it was argued in (V-3). In an Arabic session the page mirrors right-to-left, but an English argument inside it is still left-to-right text. Do we mark each piece of content with its own direction so it renders correctly, or let it inherit the page's direction? | (a) mark content with `dir="auto"` so the browser decides per block; (b) let it inherit; (c) store and render a per-debate language | (a) — one attribute, and without it English paragraphs inside an Arabic page render with their punctuation in the wrong place | high | `dir="auto"` guesses from the first strong character and gets short or mixed strings wrong; (c) is correct but is the "debate language" product feature already routed to V-3 |
| **T-8** | Seventeen languages is 27 slices and 27 test points for you. We could ship the machinery plus a first tranche (say English, Spanish, French, German, Romanian, Chinese, Arabic — seven), prove the whole system end to end, and add the other ten as a follow-up wave. | (a) all 17 in this mission; (b) 7 now, 10 in a follow-up wave; (c) machinery only, languages one at a time on demand | (b) — the risky, reviewable work is the machinery and the right-to-left slice; languages after the first seven are repetition, and a smaller first mission gets to your hands sooner | low | You asked for "the most used languages across the globe" and a half-list is not that; every language deferred is a slice that has to be re-planned later, and the marginal cost of language eleven is the lowest cost in the mission |
