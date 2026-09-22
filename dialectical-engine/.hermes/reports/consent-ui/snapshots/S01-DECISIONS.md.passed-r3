# S01 — DECISIONS (append-only)

Format: `- date · question · choice · reason · who ruled`. Never edited, never deleted, only
appended. **Before any seat asks V a question, it checks this file** — a question already
answered here is re-asked to nobody.

## Inherited: intake dispositions and V-row defaults that bind S01

- 2026-09-06 · Who writes requirements, plans, and per-cluster reviews? · All three are Opus 5 subagents in fresh sessions; Grok 4.6 judges each finished UI element · V named the coders and the finished-element reviewer and nobody else; the orchestrator filled the rest and routed it as row V-1 · orchestrator (intake), pending V-1
- 2026-09-06 · Where does the banner mount, given the design says "over the landing page" but signed-in users never see `/`? · App-wide in the root layout, on every route, until a decision is stored · A landing-only banner would never ask a signed-in user; "first visit" means no stored decision under the versioned key · orchestrator (intake C9), row V-7 default
- 2026-09-06 · The banner promises "change this any time in Settings", but Settings has no Privacy section · S01 adds a minimal Privacy panel with one `Cookie preferences` button, as its own cluster and sub-ticket so V can veto it alone · Shipping the copy without the surface would be a false promise · orchestrator (intake C5), row V-4 default
- 2026-09-06 · Telemetry and analytics preferences with no consumer anywhere in the product · Store the decision honestly; load nothing, unload nothing, gate nothing; the SPEC says so and forbids a fake gate · A UI never claims a capability the product lacks (standing V law) · orchestrator (intake C10), resolved
- 2026-09-06 · `Privacy notice` in 10b opens 10c, which S02 builds — a cross-slice dependency · Not a contradiction; S02 builds the modal first as a standalone prop-driven component, and S01's wiring cluster pulls `slice/consent-s02` into its lane · Sequencing belongs to architecture, not to a contradiction check · orchestrator (intake C8)

## REQ-01's own decisions

### Storage

- 2026-09-06 · What key and shape stores the decision? · One key `debateai.consent` holding `{"v":1,"essential":true,"quality":…,"analytics":…,"decidedAt":"<ISO>"}` · One key is atomic, inspectable in DevTools in one line (V performs QA personally), and clears in one action. **Rejected:** three keys per category (no atomicity, partial states possible); a packed string like `"1|1|0|1757178131"` (unreadable in the acceptance step) · REQ-01
- 2026-09-06 · Schema version in the key name (`debateai.consent.v1`) or inside the value? · Inside the value, as `v` · A versioned key name leaves stale keys behind forever and muddies "clear site data re-asks"; one key, one read, one clear · REQ-01
- 2026-09-06 · What happens to a stored decision whose `v` is not 1? · Treated as no decision: re-ask, and the next decision overwrites · There is no v0 to migrate from, so a migration path would be untested code for a case that cannot occur, and re-asking on a schema change is the conservative reading of consent. **Rejected:** silently carrying the booleans forward · REQ-01
- 2026-09-06 · `decidedAt` — first decision or most recent? · Most recent; a re-save from Settings rewrites it · Nothing consumes a first-decision timestamp, and two timestamps is YAGNI. **Rejected:** `firstDecidedAt` + `updatedAt` · REQ-01
- 2026-09-06 · Timestamp format? · UTC ISO-8601 via `new Date().toISOString()` · V inspects the stored value by eye in DevTools during acceptance; an epoch integer is smaller but unreadable · REQ-01
- 2026-09-06 · What if the value is corrupt, or `localStorage` throws? · A failed or corrupt READ re-asks; a failed WRITE still closes the surface and keeps the decision in React state for that page, re-asking on the next full load · Blocking a visitor because their browser refuses storage is worse than re-asking. **Rejected:** keeping the bar up forever on a write failure · REQ-01
- 2026-09-06 · Is `essential` stored even though it is always true? · Yes, explicitly · The object is then self-describing to a future consumer and V can see all three categories in one glance · REQ-01

### Mount and layering

- 2026-09-06 · Does a pre-paint inline script read the consent key, as the mode guard does? · No. The component renders `null` until a `useEffect` has read storage · The mode guard exists because a wrong THEME flashes visibly (`layout.tsx:36-42`); a consent bar that is briefly ABSENT is invisible. Copying the neighbouring precedent here would add a blocking script to every page and produce the one visible defect — a bar flashing for a returning visitor · REQ-01
- 2026-09-06 · Where exactly in `layout.tsx`? · As a sibling AFTER `{children}` inside `.appShell`, never between `.appShell` and `<TopBar />` · `tests/render/t3-library.test.tsx:236` asserts `/<div className="appShell">\s*<TopBar \/>/`; mounting between them fails it · REQ-01
- 2026-09-06 · What z-index does each consent surface take? · `--z-consent-bar: 45`, `--z-consent-scrim: 75`, `--z-consent-card: 76`, `--z-policy-scrim: 77`, `--z-policy-card: 78` · Measured ladder: topBar 30, tokenDock 40, drawer 54/55, popover 60/61, modal 70, toast 80. The bar must clear the top bar and the dock but must not cover an open drawer; the dialogs must clear the existing modal band; the policy modal must clear the preferences card because it opens from it; the toast keeps the ceiling · REQ-01

### The two surfaces

- 2026-09-06 · How does 10b open — replacing the bar, centred on the 10c scrim, or growing in place? · Centred modal dialog on the shared `--scrim`; the bar is not rendered while it is open · The Settings re-entry eliminates the other two: there is no bar in Settings to replace or grow from, so either would need a second layout for the same card. The design shows 10b as a context-free artboard, so it does not contradict this. Routed as contested row Q7-02 · REQ-01
- 2026-09-06 · Can the bar be dismissed without a decision? · No — no close control, Esc does nothing, it does not hide on scroll or navigation · The design gives 10a three buttons and no close affordance; row V-7 says it shows until they choose; `Essential only` is a one-click way out, so nothing is coerced · REQ-01
- 2026-09-06 · Does the bar trap focus? · No · A consent bar that traps focus makes the page unreadable, and the visitor must be able to read the page before deciding · REQ-01
- 2026-09-06 · Does the card get a `×`, which the design does not show? · No · The design's 10b footer has exactly three controls; Esc and a backdrop click are the exits that change nothing, and `Essential only` is a visible exit. Routed as contested row Q7-03 so V sees the a11y trade · REQ-01
- 2026-09-06 · What does Esc do to the card? · Closes it without storing; from the first-visit entry the bar returns, from Settings nothing returns · Esc on a dialog is a universal expectation, and "no decision stored" is safe because nothing was consented to · REQ-01
- 2026-09-06 · What breakpoint stacks the bar, which the design does not show? · 720px · Derived, not conventional: three buttons at the designed measure ≈ 391px, plus a readable 260px copy column, plus a 24px gap and 40px of core padding = 715px, so the designed row stops fitting just under 720. It also sits below the 768px tablet-portrait width. **Rejected:** reaching for 768 because it is a familiar number · REQ-01

### Tokens and copy

- 2026-09-06 · Which slice writes the CSS token blocks? · S01, exclusively, including the five tokens S02 consumes; S01 also solely owns `tests/unit/t9-mode-tokens.test.ts` · `tests/unit/t9-mode-tokens.test.ts:380-383` asserts EXACT set equality between the tokens declared in `:root` / the chamber block and the test's map keys, so every token addition forces a same-change test edit — two lanes doing that conflict on every addition · REQ-01
- 2026-09-06 · New tokens, or reuse existing `-bg`/`-border` pairs for the three tag pills? · Reuse `--ok-bg`/`--ok-border` and `--gold-bg`/`--gold-border`; add `--muted-bg`/`--muted-border` only for Product analytics · Those two roles already exist in the house vocabulary; the mute pair does not exist at all. Adding six tint tokens for exact `tint()` fidelity would cost twelve map entries for a difference that is under one perceptual step over `--core` · REQ-01
- 2026-09-06 · Names for the two new okC tints? · `--ok-soft` (the locked track fill) and `--ok-edge` (the accent border on toggles and check squares) · Avoids the `-line` suffix, which in this file names solid stance lines and is iterated by `LINE_TOKENS` in the token test · REQ-01
- 2026-09-06 · Where does the category copy live? · One exported constant `COOKIE_CATEGORIES` in `apps/ui/lib/consent.ts`; no copy string is inlined in a component · Byte-exactness becomes a single-file review, and the contested cookie-name ruling (Q7-01) becomes a one-line data edit rather than a component change · REQ-01
- 2026-09-06 · The design's mono detail lines name five cookies (`de_session`, `de_mfa`, `de_device`, `de_quality`, `de_analytics`) that do not exist; the product sets `__Host-debateai-session` and `__Host-debateai-csrf` · Pin the strings VERBATIM as the packet commands, contain them per the decision above, and route the conflict to V as contested row Q7-01 with a recommendation to correct them · A requirements seat does not overrule its packet on copy; but a GDPR consent card stating five false facts collides with the standing honesty law, so V must see it. Verified: grep over `apps packages tests migrations` = 0 hits; real names at `apps/api/src/index.ts:169-170` · REQ-01

### Added during the Q8 self-contradiction check, before handoff (recorded openly, not a silent edit)

- 2026-09-06 · The Q8 check found a collision the requirements draft had not stated: the bar is fixed bottom full-width at z 45, and `.tokenDock` is fixed bottom-right at z 40 on the owner debate route, so the bar covers it · The bar covers it; no route-aware offset is added and the dock is not moved. Added as S01-R29 · Measured: `.tokenDock` (`globals.css:3396-3403`) holds exactly one NON-interactive status pill (`DebatePageClient.tsx:1525-1529`), so the overlap blocks no control and ends at the visitor's first click. The alternative would teach a layout-level component which route it is on — permanent coupling traded for a temporary overlap of a status indicator · REQ-01
- 2026-09-06 · Is adding S01-R29 after writing a FROZEN SPEC legitimate? · Yes, and it is recorded here rather than done silently · The packet's charge Q8 orders a contradiction check on my own output, which is part of creation, not revision; the SPEC had not been handed off and no seat had consumed it. The edit is ADDITIVE — no existing requirement's text was changed — and the handoff names it explicitly so the blind reviewer can audit the sequence · REQ-01
- 2026-09-06 · BASELINE.md (orchestrator, 17:07, addendum 17:35) landed after the SPEC draft and records that `tests/unit/t9-mode-tokens.test.ts` is ITSELF red at base — exit 1, `Tests 2 failed | 6 passed (8)` — one failure being the colour-literal test with one pinned hit (`.drawerScrim[data-drawer-scrim]`) · S01-R24 and S01-R25's hooks corrected from "the suite passes" to a stated DELTA; the §Tests baseline paragraph and the PLAN's law now name BASELINE.md as the authority · A hook that tells a coding seat to make a suite pass when it cannot pass at base would send that seat chasing another mission's failures, and would invite the exact fabricated-green the protocol forbids. Additive correction of a factual error in a verification hook, made before handoff and recorded here rather than silently · REQ-01

### Rework round 1 — REQ-REV-01's verdict, applied (2026-09-06; `SPEC.md` is now v2, `SPEC-v1.md` is the archive)

- 2026-09-06 · Does the bar come back when the preferences card is closed without a decision? (REQ-REV-01 **B1**) · The discriminator is **whether a valid `v: 1` decision is stored**, never the entry point: the bar returns iff no valid stored decision exists, from the first-visit entry and the Settings entry alike. S01-R14 rewritten; a states-table row added (`Card (settings), no stored decision` → Bar) and the existing settings row narrowed to `valid stored decision`; a jsdom hook added (seed nothing, open from the Settings opener, Esc, assert the bar is in the document); V step 11 split into 11a/11b naming its storage precondition · v1 made the ENTRY POINT the condition, which contradicted R13, R05, R07 and row V-7 inside the same frozen file, and the state was reachable: deleting `debateai.consent` in DevTools leaves the HttpOnly session cookie intact, so a signed-in visitor reaches Settings → Privacy with nothing stored and one Esc dismisses a GDPR consent gate · REQ-01 rework R1
- 2026-09-06 · Is B1 an instance or a class? (`heartbeat-protocol` §2.2) · A class — "the entry point standing in as a proxy for 'a decision is stored'" — and the sweep found **two more members the review did not name**: S01-R17 ("when the card opens from Settings … both reflect the stored booleans" — no answer for the Settings entry with nothing stored) and S01-R21 ("opens the same card pre-filled from storage" — same gap). Both fixed with the same rule and both given hooks · Fixing only the reported instance would have shipped the same defect twice more · REQ-01 rework R1
- 2026-09-06 · With the policy modal open over the preferences card, which surface acts on `Esc`? (REQ-REV-01 **B3**) · **The topmost open surface consumes Esc and no other surface acts on the same event.** The sentence lives inside the shared interface paragraph that S01-R20 and S02-R14 carry byte-identically — the only text neither slice can change alone — plus one hook on each side · Neither SPEC had a stacking rule and no hook exercised it, so two independently written document-level keydown listeners (in two parallel lanes, on a codebase with zero precedent to copy) would both fire on one Esc and throw the visitor two surfaces back · REQ-01 rework R1, rule from REQ-REV-01 B3
- 2026-09-06 · Where does the ONE shared modal-semantics helper live and who owns it? (REQ-REV-01 **P4**) · `apps/ui/components/consent/modalSemantics.ts`, **owned and written by S02**, consumed unchanged by S01; it owns focus trap, initial focus, focus return, backdrop close, `prefers-reduced-motion` and the Esc stack. S01's "any other new file under `apps/ui/components/consent/`" rule now excludes it exactly as it excludes `PrivacyPolicyModal.tsx`, and it is in S01's "reads but never edits" list · Ruled by the orchestrator in `COMMON.md` §10.7 to close P4: v1's two SPECs and COMMON gave three different answers, so every placement broke one document · orchestrator (`COMMON.md` §10.7)
- 2026-09-06 · Two `R18` cross-references that meant the Settings re-entry (REQ-REV-01 **N1**) · Both now read `R21`; the CLASS was swept mechanically over both SPECs and both PLANs (125 references, script and full output in `requirements/REQ-01-rework-r1-handoff.md`) · v1 fixed one instance of this class before handoff and did not sweep it — exactly the failure `heartbeat-protocol` §2.2 names · REQ-01 rework R1
- 2026-09-06 · The set-equality assertion's line range in `tests/unit/t9-mode-tokens.test.ts` (REQ-REV-01 **N2**) · `:376-377` (inputs built at `:371-372`), not `:380-383`; `:379-384` is the separate raw VALUE loop, and the two places citing `:380,383` for the raw comparison are **correct and deliberately unchanged** · Measured: `:376` `expect(rootNames.sort(), ":root inventory names").toEqual(expectedRoot);`, `:377` the Chamber twin. The substance — set equality exists, so token additions are single-writer — was right; only the pointer was wrong · REQ-01 rework R1
- 2026-09-06 · The contrast helper's location (REQ-REV-01 **N3**) · Path resolved at `tests/unit/t9-mode-tokens.test.ts:40`, loaded by `contrastContract()` at `:324-326`, used at `:411` — not `:306-309`, which is a list of token-name literals inside `TEXT_TOKENS` · Measured · REQ-01 rework R1
- 2026-09-06 · S01-R28 was defined under `## Copy — verbatim`, after R29 (REQ-REV-01 **N4**) · **Moved into `## Requirements` in R-order, between R27 and R29; NOT renumbered.** §Copy keeps a pointer to it · Renumbering would break every existing `S01-R28` reference in the PLAN, this file, the contested table, `BASELINE.md` and the review itself; moving costs nothing and R28 is what makes row V-9's "one-line data edit" promise true · REQ-01 rework R1
- 2026-09-06 · How the design extract encodes `’` and what "byte-exact" therefore means (REQ-REV-01 **N8**) · `design-data.js:89` holds the **literal six-character escape**, not the character; a transcription is byte-exact when the DECODED character matches, which a `\uXXXX` escape copied into a JS/TS string literal achieves and the same escape copied into JSON or raw JSX text does not. Stated in both SPECs' §Copy · v1's parenthetical was a tautology and told a transcriber nothing, on a mission whose whole discipline is verbatim copy · REQ-01 rework R1
- 2026-09-06 · S01-R20's hook could not catch a missing read-mode `Close` button (REQ-REV-01 **N9**) · The `Close` button moved INTO the shared interface paragraph (so both slices own it) and the hook now asserts its presence alongside the absence of `I have read it` · S01's states table lists `Close` as a dismissal route, so S01 depends on a button only S02's tests pinned · REQ-01 rework R1
- 2026-09-06 · Does the earlier token-blocks decision line in THIS file — the one citing `tests/unit/t9-mode-tokens.test.ts:380-383` — still stand? · **In substance yes, in citation no.** The file is append-only, so that line stays exactly as written; read it together with the N2 correction above it. The assertion is at `:376-377`; the single-writer conclusion it draws is unchanged and still binding · A DECISIONS file that silently edits its own history stops being a record; a superseding line costs one line and keeps the audit trail · REQ-01 rework R1

### Rework round 2 — REQ-REV-01's round-2 verdict, applied (2026-09-06; `SPEC.md` is now v3, `SPEC-v2.md` is the archive)

- 2026-09-06 · R08's hook cited `(R21)` for the authority behind the `MODE_INDEPENDENT` map assertion (REQ-REV-01 **N10**) · **Corrected to `(R24)`**, and the sentence now names what each requirement is, so a reader who follows either pointer lands where the sentence claims · R21 is the Settings `Privacy` panel and says nothing about tokens; R24 is the single-writer rule for the two `globals.css` token blocks and for `tests/unit/t9-mode-tokens.test.ts`. A seat following the old pointer found nothing about tokens. **Third member of N1's class, and pre-existing** — the identical sentence is in `SPEC-v1.md`; the reviewer's round-1 sweep and my predecessor's rework sweep both missed it, and it surfaced only when the reviewer re-scripted with a *different* heuristic · REQ-01 rework R2
- 2026-09-06 · Is N10's class now closed? · **Swept with BOTH heuristics after the fix, not one** (`COMMON.md` §2.2, and the reviewer's own round-2 lesson that re-running the same heuristic finds the same things): `.hermes/reports/consent-ui/logs/xref_sweep.py` (topic-vocabulary) → `TOTAL REFERENCES: 204   UNRESOLVED: 0`, `TOPIC MISMATCHES: 7`; `.hermes/reports/consent-ui/probes/xref_r2.py` (zero-lexical-overlap) → `TOTAL REFERENCES: 257   UNRESOLVED: 0`, `LEXICAL-OVERLAP FLAGS: 44`. Every flag of both sets adjudicated by hand in `requirements/REQ-01-rework-r2-handoff.md`; **none is a mis-resolution**, and the N10 site is flagged by neither heuristic any more · Two heuristics agreeing is evidence; one heuristic re-run is a tautology · REQ-01 rework R2
- 2026-09-06 · What happens to the v2 supersession header's "swept mechanically (125 references …)"? (REQ-REV-01 **N11**) · **The number is REMOVED from the frozen file, not restated.** The rule instead: a sweep total measures a moving corpus and belongs in the round's handoff, where it can be re-run and re-read; a frozen SPEC states no count it cannot re-derive · Three numbers existed for one sweep — 125 in the header, 221 in the handoff it cited, 277 from the reviewer's own script — and **my re-run of the same script today returns 204**, because the corpus (the header rows themselves) changed underneath it. That is the whole argument: this class of number is stale the moment it is written · REQ-01 rework R2
- 2026-09-06 · Rejected alternative for the count above, recorded so nobody re-derives it (`COMMON.md` §10.1) · **Stating one counting rule and one number in the header** (the literal reading of N11's "state one rule and one number, or remove the number") · Measured against it: the number changes with every edit to the four files it counts, including edits to the header that carries it, so it would need re-measuring on every future version and would silently rot between versions. Removing it removes the class · REQ-01 rework R2
- 2026-09-06 · How many `\uXXXX` escapes does the design extract hold, and is U+00B7 among them? (REQ-REV-01 **N11**) · **15, of three codepoints: `—` ×12, `’` ×2, `→` ×1** — counting rule and command stated in §Copy beside the number. **U+00B7 is removed from the escaped-character list: it is NEVER escaped** (`grep -c -i 'u00b7' design-data.js` → `0`), appearing 4 times raw alongside 4 raw U+2014. §Copy now states the escaped and the not-escaped sets separately · v2 said "about twenty times" and listed U+00B7 among the characters involved. Both were wrong, and the second is the dangerous one: a transcriber told that middle dots are escaped would look for an escape that is not there · REQ-01 rework R2
- 2026-09-06 · v2's N8 sentence promised the literal six-character escape and printed the decoded character instead (found while fixing N11) · §Copy now prints `’` where it says escape and `’` where it says decoded · Measured: `SPEC-v2.md` contains the literal escape form **0** times and the raw U+2019 character 6 times. The sentence demonstrated the opposite of what it asserted, on the one page whose entire subject is that the two forms differ — and no reviewer caught it, because both forms render identically to a reader who is not counting bytes · REQ-01 rework R2
- 2026-09-06 · **Correction to the two lines immediately above, appended not edited** · The escape tally in the N11 line and the phrase "§Copy now prints `’` where it says escape" were themselves written with the **decoded characters** where they should show the escape form. Read them as: **`—` ×12, `’` ×2, `→` ×1**, and "§Copy now prints `’` where it says escape and `’` where it says decoded." The SPEC text and both supersession headers are correct; only these DECISIONS lines were not · This file is append-only, so the lines stay as written. Filed deliberately rather than quietly: I committed the exact defect I was in the middle of fixing, within ten minutes of naming it, in a document about that defect. **A rule stated in prose does not survive contact with a keyboard — the only thing that would have caught this is a mechanical check (`grep -c` for the escape form in any sentence containing the word "escape"), which is the class fix worth having** · REQ-01 rework R2

## ARCHITECTURE — ARCH-S01 (2026-09-06). HOW only; every WHAT below is already in the frozen `SPEC.md` v3 and is cited, never re-decided.

**Checked first, and deliberately NOT re-decided** (`heartbeat-architecture` §1; the packet's A5 warning): the
storage key and shape, `decidedAt` semantics, the `v!=1` re-ask with no migration code, the five z-index values,
the omitted `×`, the 720px breakpoint, the token names `--ok-soft`/`--ok-edge`, and where the category copy
lives. All eight are settled above by REQ-01 and by the intake. This section adds only what the SPEC left to HOW.

### Module decomposition

- 2026-09-06 · How is the slice cut into files? · Five: `apps/ui/lib/consent.ts` (pure domain — `COOKIE_CATEGORIES`, the storage codec, the cross-tree open-store), `apps/ui/components/consent/CookieBar.tsx` (10a, presentational), `.../CookiePreferencesCard.tsx` (10b, presentational + toggle state), `.../CookieConsent.tsx` (the ONE state machine + the layout mount), `.../ConsentSettingsPanel.tsx` (R21) · The SPEC's §States-and-transitions is ONE machine, so exactly one component owns it and the rest are prop-driven and independently mountable in jsdom. **Rejected:** a single `CookieConsent.tsx` holding bar + card + settings panel — the R21 panel would then only be testable by mounting the root layout through `AuthGate`, and a cluster whose test needs the whole app is not independently verifiable · ARCH-S01
- 2026-09-06 · How does the Settings panel (rendered under `{children}`) open the SAME card instance owned by `CookieConsent` (rendered as a SIBLING after `{children}`)? · A module-level typed subscribe/notify store exported from `apps/ui/lib/consent.ts`: `ConsentSettingsPanel` calls `requestPreferences(openerEl)`, `CookieConsent` subscribes in a `useEffect` · **React context cannot do this**: R07 pins the mount as a SIBLING placed after `{children}`, and a sibling provider cannot provide to `{children}`. **Rejected:** (a) wrapping `{children}` in a provider — it violates R07's placement and turns the whole app into a client subtree; (b) two card instances, one per entry point — it breaks R18's single focus trap and the R20 Esc stack, and the SPEC's §Out-of-scope bans a second implementation of either outright; (c) a `window` `CustomEvent` — it works, but it is untyped and needs a jsdom mount to test, where a 20-line store is typed and is unit-tested in the pure cluster · ARCH-S01
- 2026-09-06 · The residual risk that decomposition carries, stated rather than hidden · Two client components sharing module state rely on Next.js deduping `apps/ui/lib/consent.ts` into ONE instance in the client graph. jsdom mounts both in one module registry and therefore CANNOT observe a double-instance failure · It is recorded in the refutation table's "does NOT catch" column and handed to V acceptance steps 9-10, which cross the real bundle boundary · ARCH-S01
- 2026-09-06 · Does S01 need a scroll-to-end detection mechanism (the packet's A5 lists it)? · **No — S01 declares none.** The gate belongs to 10c in `mode="consent"`, which is S02's; R20 states that in `"read"` mode the modal "applies no scroll-to-end gate" · S01's card scrolls its category list under `max-height: 92vh` (R15), which is overflow, not a gate. Recorded so no seat builds one · ARCH-S01
- 2026-09-06 · Does S01 decide the jump-pill mapping (the packet's A5 lists it)? · **No — N/A to S01.** `policyJump` is 10c's, inside `apps/ui/lib/privacyPolicy.ts`, which S01's §Parallel-safety lists under "reads but never edits" · Recorded so the question is not re-opened here · ARCH-S01

### CSS vocabulary

- 2026-09-06 · COMMON §9 says extend the existing modal vocabulary "or name why not". Does the 10b card reuse `.modalScrim` / `.modalCard`? · **No — a `consent*`-prefixed vocabulary inside the S01 block. The reason is mechanical, not aesthetic.** `.modalScrim` is declared at `apps/ui/app/globals.css:3265` with `z-index: 70`; R08 requires the card scrim at `--z-consent-scrim: 75` so the policy modal can sit above it. Re-using the class means EDITING `.modalScrim` — outside the one delimited block S01 may append at the end of the file — and would move all seven existing overlays that share it · So the choice is between an unlawful edit with a seven-surface blast radius and a new prefixed vocabulary. **Rejected:** `.modalScrim` + a `data-consent` attribute override inside S01's block — it would still leave the base z-index cascading and makes the layer depend on selector specificity rather than on a token · ARCH-S01
- 2026-09-06 · Class-name convention for every selector this slice adds · Every one is prefixed `consent` (`.consentBar`, `.consentBarBezel`, `.consentBarCore`, `.consentTab`, `.consentEyebrow`, `.consentTitle`, `.consentBody`, `.consentActions`, `.consentGhost`, `.consentPrimary`, `.consentScrim`, `.consentCard`, `.consentCardCore`, `.consentCatRow`, `.consentCatName`, `.consentTag`, `.consentDesc`, `.consentDetail`, `.consentSwitch`, `.consentKnob`, `.consentFooter`, `.consentLink`) · A single deterministic prefix makes "every selector this slice added lives inside the one delimited block" a mechanical grep instead of a judgement call, which is what R25's own-file scan needs · ARCH-S01

### Verification mechanics

- 2026-09-06 · The SPEC's §Token-mapping orders `--muted` on `--muted-bg` over `--core` checked "with the repo's contrast helper against the 4.5:1 threshold", and marks it UNVERIFIED. Can that be done as written? · **No, not as written, and this is the reason it stayed UNVERIFIED for three review rounds.** `tests/support/contrast.ts:3-5` throws `TypeError` on any argument that is not `#RRGGBB`, and `--muted-bg` is `rgba(110,103,92,.1)`. **The value must be alpha-composited over its opaque surface first** — `c = round(alpha*fg + (1-alpha)*bg)` per channel — and only the composite may be passed to `contrastRatio` · Measured by me before planning it: Terracotta `rgba(110,103,92,.1)` over `#FDFBF6` = `#EFECE7`, ratio to `--muted` `#6E675C` = **4.743**; Chamber `rgba(156,144,122,.14)` over `#181410` = `#2A251F`, ratio to `#9C907A` = **4.833**. Both clear 4.5:1, so R24's values stand and no token changes. The composite helper is local to `tests/unit/t9-mode-tokens.test.ts` (S01-owned); **`tests/support/contrast.ts` is NOT in S01's allowed set and is not edited** · ARCH-S01
- 2026-09-06 · Do the ten new tokens join `TEXT_TOKENS` or `LINE_TOKENS` in the token test? · **No, none of them.** `tests/unit/t9-mode-tokens.test.ts:407` asserts `expect(measuredRows).toBe(34)` and `:428` asserts `rows` has exactly `names.length` entries — the count 34 = (12 TEXT + 5 LINE) x 2 modes is hard-pinned · Adding any token to either array breaks a test that is GREEN at base, which is this slice's failure by R24's own delta rule. The new contrast evidence goes in its own `it()` instead · ARCH-S01
- 2026-09-06 · What is the lawful verification idiom for a cluster whose suite is RED at base? · The capture-first shape of TOOLING-TRAPS is kept, but the guard asserts a **named failure set** instead of "no `failed`": exit code, plus the failing-test count, plus the count of failures whose name matches the pinned pair, plus the colour-literal hit count, plus the named must-be-green test appearing as a pass · COMMON §8's idiom requires a summary with no `failed`, which `tests/unit/t9-mode-tokens.test.ts` can never produce — it is red at base by two failures another mission owns. A guard that can never pass is the defect TOOLING-TRAPS:488 already records once in this harness. **Validated on a 7-case hostile matrix, including the known-GOOD input** (base output passes; a third failure, the inventory test breaking, a second colour literal, `No test files found`, and a fully-green suite all fail; S01 adding passing tests still passes) · ARCH-S01
- 2026-09-06 · Where does each cluster's verification command live in `PLAN.md`? · In a fenced code block under the cluster table, NEVER inside a table cell; the table carries only the command's id · A markdown table cell forces `|` to be escaped as `\|`, and TOOLING-TRAPS:483-497 measures the consequence: the shell then passes `|`, `grep`, `-E` and the pattern to `printf` as plain arguments, no pipeline is built, the guard is **permanently 1**, and the cluster can never pass in any state of the code. It happened to the previous mission inside the very idiom adopted to prevent it · ARCH-S01
- 2026-09-06 · Is the typecheck delta in every cluster command, per the packet's gap (e)? · Yes, in every cluster that adds TypeScript (C2-C7), as a captured second term of the same conjunction · Measured cost: `pnpm typecheck` runs in **2 seconds** at base (exit 1, 8 diagnostics, all in `tests/unit/s14-ui.test.ts`, zero outside). At that price there is no argument for deferring the delta to a final cluster and discovering a C2 type error in C7 · ARCH-S01
- 2026-09-06 · **A baseline the mission has not pinned, found while proving the commands run** · `tests/render/t3-library.test.tsx` is **RED at base**: exit 1, `Tests 4 failed | 11 passed (15)`, all four in its `lists` describe. `BASELINE.md` does not carry it, yet `SPEC.md` §Tests and `PLAN.md`'s Boundaries both order it "must stay GREEN". **Both tests S01 actually depends on are green at base** — `chrome > keeps the real layout TopBar as a direct appShell child` and `chrome > pins the real signed-in render to zero landing markers` · So C5's guard asserts those two by NAME plus a failure set frozen at the four `lists` names, never a whole-file pass count, which could never be satisfied. `tests/render/t9-landing.test.tsx` IS green at base (exit 0, `Tests 16 passed (16)`) and is guarded normally. Filed as a finding against `BASELINE.md` · ARCH-S01
- 2026-09-06 · Rejected alternative for the two regression files, recorded so nobody re-derives it (`COMMON.md` §10.1) · Giving C5 a *separate* command for `t3-library` and `t9-landing` · One cluster gets ONE command (`heartbeat-architecture` §2); vitest accepts several paths in one invocation, and a mixed invocation was measured to run the paths that exist and silently drop the ones that do not — which is itself a trap worth stating, because it means a typo'd path in a multi-path command does NOT announce itself as `No test files found` · ARCH-S01

### Sequencing and the cross-slice dependency

- 2026-09-06 · Cluster order, and which clusters may run at the same time · `S01-C1` (tokens) and `S01-C2` (the domain module) touch disjoint files and are CONCURRENT; `C3` -> `C4` are serial because both write the ONE delimited `globals.css` block; `C5` follows both; `C6` follows the orchestrator's merge of `slice/consent-s02`; `C7` is last · `C1` is first-committed regardless, because S02's CSS resolves to nothing until S01's tokens land (packet §4) — that ordering is the orchestrator's ruling and is recorded here rather than re-decided · ARCH-S01, following the packet §4 ruling
- 2026-09-06 · How does S01's lane obtain the two S02-owned files it consumes? · One explicit step, placed LAST before `C6`: the ORCHESTRATOR runs `git merge slice/consent-s02` into the S01 lane once S02-C1 is committed; the coding seat runs no merge and instead records `git log -1 --format=%h slice/consent-s02` in `PROGRESS.md` · A coding seat that merges is making a git write outside its branch contract; and the `globals.css` end-of-file block conflict is expected and accepted (vertical-slice law §6), so it needs a seat that may resolve it · ARCH-S01, mechanics from packet §4
- 2026-09-06 · Why is the card split across `C4` (body) and `C6` (modal semantics + policy link) rather than built once? · `C4` builds everything the card owns alone — categories, toggles, footer, the R04 writes — and takes `onRequestPolicy` as a prop it does not yet wire; `C6` adds the `modalSemantics.ts` import and the `PrivacyPolicyModal` mount after the merge · The alternative is to block ALL card work on S02's helper, which serialises two lanes that the vertical-slice law exists to run in parallel. **Rejected:** a temporary local focus trap in `C4`, replaced in `C6` — the SPEC's §Out-of-scope bans "a second focus-trap implementation of any kind", and a temporary one is still a second one · ARCH-S01

### ADR

- 2026-09-06 · Does anything here outlive the mission and warrant a repo-wide ADR? · **Yes, exactly one: the `debateai.consent` localStorage contract** (key, `v` integer, the five members, the re-ask-on-mismatch rule). A future analytics or telemetry consumer will read it long after this mission closes, and R23 guarantees nothing reads it today — so the first consumer will meet a schema with no repo-wide record · **Proposed ADR path: `docs/architecture/01-decisions/ADR-consent-storage-contract.md`.** I do NOT create it: `docs/architecture/**` is outside my `allowed` list. Routed to the orchestrator as a ticket. The other candidates were weighed and rejected: the `consent*` CSS vocabulary and the cluster-guard idiom are mission-local (DECISIONS + TOOLING-TRAPS are their right homes), and `modalSemantics.ts` is S02's to record · ARCH-S01

## ARCHITECTURE rework round 1 — ARCH-S01-REWORK-R1 (2026-09-06), answering `reviews/ARCH-REV-S01-r1.md`

Appended, never edited: where a line below corrects an earlier one, the earlier line stays exactly as
written and this one supersedes it. Every count and every verdict here carries the command that produced
it; the commands and their pasted output are in `PLAN.md` §A9 and in the `REWORK READY FOR REVIEW` comment.

### The guard machinery (B1, B2, N1, N6)

- 2026-09-06 · Three guard terms matched vitest's status glyph with a bare `.` and were therefore 0 in any
  script (ARCH-REV-S01 **B1**) · **No guard term in this plan matches a glyph.** `n_inv`, `n_keep` and
  `n_mount` are re-anchored on the test NAME (`<file> > <suite> > <name>` with an optional ` NNNms` tail),
  and every one of the seven commands was re-run from a `.sh` file under `/bin/bash` AND inline, both
  verdicts pasted · Measured, same input, same machine: OLD `n_inv` = 0 as a script / 1 inline; OLD
  `n_keep` = 0 / 2; NEW `n_inv` = 1 / 1, NEW `n_keep` = 2 / 2. `.` matches ONE BYTE under BSD grep in the C
  locale and `✓` is three bytes, `×` two. **Class swept mechanically, not by eye:** over all seven command
  blocks, raw non-ASCII bytes = 0 and the glyph-placeholder idiom `[[:space:]]*. ` = exactly the three
  sites the review named — no fourth · ARCH-S01-REWORK-R1
- 2026-09-06 · **A literal multibyte character inside a pattern is SAFE; a `.` standing in for one is not.**
  Recorded because the distinction is the whole of B1 and is easy to over-generalise · Measured on
  `PLAN.md`'s own `·` bullet (U+00B7 = `c2 b7`): `grep -cE '^· serves: S01-R'` returns 46 in both
  environments, `grep -cE '^. serves: S01-R'` returns 0 as a script and 46 inline · ARCH-S01-REWORK-R1
- 2026-09-06 · The colour-literal delta counted the PINNED line, so a second offending element was invisible
  (ARCH-REV-S01 **B2**) · **Every command that runs `t9-mode-tokens` now counts the received-array HIT LIST**
  — `n_hits` over `^\+   "/.*:[0-9]+:`, required exactly 1 — **and keeps** the pinned-line term `n_lit`, so
  the hit list cannot grow and the pin cannot silently vanish. **`CMD-C5` gains the `t9` run and both terms**,
  because C5 edits `apps/ui/app/layout.tsx`, which that test scans (`COMMON.md` §10.18) · Proved on a
  synthesized 2-hit capture: under the old terms `n_lit`=1, `n_tokfail`=2 and the summary arm were all
  SATISFIED; under the new term `n_hits`=2 and C1, C3, C4, C5 and C7 all flip to verdict 1. **Rejected:**
  asserting the summary line instead — a second element changes neither the summary nor the `FAIL` count · ARCH-S01-REWORK-R1
- 2026-09-06 · `tc=$(pnpm typecheck 2>&1)` passed vacuously when the script did not run (ARCH-REV-S01 **N1**)
  · Every command now captures `tt=$?` **and** asserts `n_tcran` — the count of the line `$ tsc --noEmit`,
  which pnpm echoes on every real run — is exactly 1, plus `[ "$tt" -le 1 ]` so a crash exit is not a pass ·
  Measured: `pnpm typechek` → exit 1, output `undefined` + `[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command
  "typechek" not found`, `n_tc`=0 (the old term SATISFIED, vacuously), `n_tcran`=0 (the new term violated).
  **Rejected:** asserting the pinned diagnostic total `-eq 8` — it is another mission's number and would
  break the day that mission repairs it, which is N6's defect wearing a different hat · ARCH-S01-REWORK-R1
- 2026-09-06 · `CMD-C5` hard-pinned `n_fail -eq 4` against another mission's failure set (ARCH-REV-S01 **N6**)
  · Replaced by a **monotone** shape: `n_newfail` counts `FAIL` lines whose name is NOT in `$PIN` and must be
  0; `n_keep` = 2 and `n_keepfail` = 0 name the two tests S01 must keep green; `n_mount` ≥ 1 with
  `n_mountfail` = 0; and `Test Files … (3)` proves no path was silently dropped. `n_fail` is now REPORTED,
  not asserted · Proved: a synthetic capture in which the owning mission has repaired all four `lists`
  failures (exit 0, `Tests 30 passed (30)`, `Test Files 3 passed (3)`) still gives **verdict 0** · ARCH-S01-REWORK-R1
- 2026-09-06 · Does folding the `t9` delta and the typecheck delta into every cluster guard violate
  `COMMON.md` §10.20 ("standing gates are REPORTED, never folded IN")? · **No, and the distinction is
  measurable:** §10.20 forbids folding in a gate that is RED at base *by design* — an arm asserting that
  `t9-mode-tokens` or `pnpm typecheck` PASSES can never be satisfied. Every folded arm here is a DELTA that
  IS satisfied at base: `n_tokfail` = 2 (the pinned pair), `n_hits` = 1, `n_lit` = 1, `n_tc` = 0 outside the
  pin · Demonstrated: `CMD-C1`'s verdict at base is **0**, in both environments, with all of those arms
  active. A gate that cannot pass is the defect; a delta that passes at base is the guard · ARCH-S01-REWORK-R1

### The plan's text (B3, B4, B5, B6, N3, N5, N7)

- 2026-09-06 · `S01-S16` ended with "Also wire the bar's three buttons to `writeConsent(decisionFor(...))`
  through their props' call sites" — no file, no acceptance, and no lawful home in C3 (ARCH-REV-S01 **B3**)
  · **The clause is DELETED, not promoted.** `S01-S29` already owns that behaviour with a file, a test and an
  acceptance observation (`PLAN.md`: "clicking `Accept all` on the bar stores …"), in the cluster that creates
  `CookieConsent.tsx`; promoting the clause would have produced two steps asserting one behaviour, which is
  the duplicate a reviewer must then adjudicate. `S01-S16` therefore stops serving `S01-R04`, and `R04`'s
  trace row drops `S01-S16` and keeps `S01-S09`, `S01-S23`, `S01-S29`. **Rejected:** promoting it to a new
  step in C5 (the review's other option) — measured against it, `S01-S29`'s acceptance already asserts all
  three bar controls, so the new step would have had no assertion of its own to add · ARCH-S01-REWORK-R1
- 2026-09-06 · `PLAN.md` §Concurrency and `mission-graph-S01.md` disagreed on the cluster edges (ARCH-REV-S01
  **N4**) · **Both are corrected, in opposite directions, because measurement says one edge is real and the
  other was the B3 clause's shadow.** `C1 → C3` is REAL and is added to §Concurrency: C3's CSS block
  references `--z-consent-bar` and the other tokens C1 declares. `C2 → C3` is NOT real and is removed from
  the graph and from its reading table: its stated justification was "its buttons call the codec C2 exports",
  which is precisely the clause B3 deletes. `CookieBar.tsx` is prop-driven (`S01-S13`: "no storage access of
  its own"), imports nothing from `apps/ui/lib/consent.ts`, and `consent-bar.test.tsx` uses the literal key
  string. The PLAN is the binding artifact and now carries every edge · ARCH-S01-REWORK-R1
- 2026-09-06 · **Correction to the line at `DECISIONS.md:113`, appended not edited** (ARCH-REV-S01 **B4**).
  That line says the coding seat "records `git log -1 --format=%h slice/consent-s02` in `PROGRESS.md`".
  **Read it as: the coding seat REPORTS that value on its ticket and writes no file.** `COMMON.md` §4 makes
  the orchestrator `PROGRESS.md`'s sole writer, `docs/missions/**` appears in no cluster's file surface, and
  `S01-S36`'s own next clause already said the seat reports rather than writes — the `files:` field
  contradicted the sentence beside it. `S01-S35` and `S01-S36` now read `files: none — this step writes
  nothing`, and the instruction lives in `accept:` as a report on the ticket · ARCH-S01-REWORK-R1
- 2026-09-06 · **Correction to the line at `DECISIONS.md:103`, appended not edited** (ARCH-REV-S01 **N3**).
  It cites `tests/unit/t9-mode-tokens.test.ts:407` for `expect(measuredRows).toBe(34)` and `:428` for the
  `names.length` assertion. **Read them as `:433` and `:426`.** Measured today, from the repo root:
  `grep -nE 'expect\(measuredRows\)\.toBe\(34\)|expect\(rows\)\.toHaveLength\(names\.length\)'` →
  `426:        expect(rows).toHaveLength(names.length);` and `433:    expect(measuredRows).toBe(34);`;
  `:407` is the `it("clears all 34 published contrast rows against all four surfaces", …)` line. The
  substance — both pins exist, so neither `TEXT_TOKENS` nor `LINE_TOKENS` may be extended — is unchanged · ARCH-S01-REWORK-R1
- 2026-09-06 · A count in `PLAN.md` was pasted as `46` from a command that outputs `0` (ARCH-REV-S01 **B5**)
  · The counting rule is now **`grep -A1 -E '^\*\*S01-S[0-9]{2}' PLAN.md | grep -cE 'serves: S01-R'`**, and
  **every** pasted count in the file was re-run and re-pasted. The old pipeline selected only the step TITLE
  lines, and `serves:` is on the following line · **The review's own suggested replacement was measured
  before being adopted and is NOT what is pinned:** written with a bare `.` for the `·` bullet it returns 0
  as a script and 46 inline — B1 again, inside B5's remedy. Written with the literal `·` it is correct
  (46/46). The ASCII-only, `-A1`-scoped form above is correct in both and depends on no byte outside 0x20-0x7E · ARCH-S01-REWORK-R1
- 2026-09-06 · One step appeared in no trace row and seven `serves:` claims were absent from the trace's step
  column (ARCH-REV-S01 **B6**) · The rows are corrected and the trace is now checked by a **both-ways
  script**, not by a pair of `grep -c`: direction 1 asserts every R-id a step claims lists that step;
  direction 2 asserts every step a row lists claims that R-id. `scratchpad/arch-s01-rework-r1/trace_both_ways.py`,
  exit 0 only when both directions and the "every step in ≥1 row" check are clean · Before: `steps in NO row
  = ['S01-S45']`, direction 1 = 7 gaps, direction 2 = 0. A count of rows proves nothing about the contents of
  the step column, which is why the earlier `grep -c` pair reported 29/29/46 and missed all eight · ARCH-S01-REWORK-R1
- 2026-09-06 · "The mechanism, placed LAST, as step `S01-S36`" was not where `S01-S36` is (ARCH-REV-S01 **N5**)
  · Reworded to **"last before the slice-wide guards"**, with the reason stated where it is claimed: `C7`
  must still follow because `S01-S45` asserts over `modalSemantics.ts`, a file this lane only holds AFTER the
  merge, and `S01-S46` is the whole-slice three-run gate over all six test files · ARCH-S01-REWORK-R1
- 2026-09-06 · Four grep-shaped guard steps said "RED first" with no mutant to watch the RED against
  (ARCH-REV-S01 **N7**) · `S01-S42`, `S01-S43`, `S01-S44` and `S01-S45` each carry a one-line mutant recipe —
  the exact edit to make, the failure to watch, and the removal — in the same form `S01-S31` and `S01-S40`
  already use · A guard written after the code it scans is already compliant passes the moment it is typed,
  and `PLAN.md`'s own law calls that a defect in the step · ARCH-S01-REWORK-R1

### Cross-slice and the ADR (orchestrator notes on the rework packet)

- 2026-09-06 · `S01-S38`/`S01-S39` consumed S02's shared helper without naming one signature, so the C6
  coding seat had nothing to call · **`PLAN.md` now cites S02's exported surface verbatim**
  (`docs/missions/consent-ui/slices/S02/PLAN.md:150-162`): `useModalSurface(open, {containerRef,
  initialFocusRef, onClose})`, `backdropCloseHandler(scrim, onClose)`, `prefersReducedMotion()`,
  `openSurfaceCount()`. **Consumed unchanged**; if S02's own rework renames any of them, the merge step
  `S01-S36` re-reads the file in the lane and the C6 packet is cut from what is there, not from this
  quotation · A signature quoted across a slice boundary is a copy, and a copy can go stale; naming the
  re-read is what keeps it honest · ARCH-S01-REWORK-R1, surface from S02's PLAN
- 2026-09-06 · Who writes the consent-storage ADR, and where? · **The C2 coding seat writes
  `docs/architecture/01-decisions/ADR-0019-consent-storage-contract.md`**, status **Proposed** (V ratifies),
  transcribing the contract from this file and `SPEC.md` R01-R05/R28. It is added to `S01-C2`'s file surface
  and to §Boundaries' Allowed set, and it is step **`S01-S47`**; `CMD-C2` asserts it mechanically
  (`n_adrst` = 1 over `^\| \*\*Status\*\* \| \*\*Proposed\*\*`, `n_adrkey` ≥ 1 over `debateai\.consent`) ·
  ARCH-S01 proposed the ADR and correctly did not create it; the orchestrator assigned the number and the
  writer. **0019 is the next free number** — `ls docs/architecture/01-decisions/` ends at
  `ADR-0018-deployment-topology.md`. The `| **Status** | … |` table row is the house shape, measured across
  all 18 existing ADRs · orchestrator ruling, recorded by ARCH-S01-REWORK-R1
- 2026-09-06 · No step is renumbered in this rework (packet §2) · The one new step is **`S01-S47`** (the ADR),
  placed in the cluster it serves, `S01-C2`. `S01-S01 … S01-S46` keep their ids and their meanings ·
  Renumbering would break every reference in the trace table, the refutation table, the cluster ranges, the
  review verdict and the board · ARCH-S01-REWORK-R1

### Measured, not asserted — two numbers this round re-derived and one it hands up

- 2026-09-06 · The review recorded the four contrast ratios and the eight `tint()` derivations as NOT
  re-verified (`ARCH-REV-S01-r1.md` §What I did NOT verify, items 2 and 3) · **Both re-run by me from the
  design data, not copied:** `--muted` on `--muted-bg` over `--core` = **4.743** Terracotta / **4.833**
  Chamber (≥ 4.5); toggle ON-vs-OFF track = **4.246** / **7.171** (≥ 3); and all eight tint-derived values
  reproduce from `design-data.js`'s own `tint()` with **0 mismatches** · The predecessor's probes were re-run
  in this round's scratch so the numbers are this session's, not a quotation · ARCH-S01-REWORK-R1
- 2026-09-06 · A measurement this plan does NOT act on, stated rather than dropped · The OFF toggle track's
  **border** composited over `--core` measures **1.714** Terracotta / **1.839** Chamber, under WCAG 1.4.11's
  3:1 for a UI component boundary. It is not a step's assertion and no step is added for it: the ten token
  VALUES are `S01-R24` in a frozen SPEC, so changing one is a SPEC question, not a HOW question
  (`heartbeat-architecture` §4). Recorded here, listed under "What no step in this plan can prove", and
  routed to the orchestrator as a candidate contested row · The alternative was to leave a measured
  sub-threshold number in a scratch file where the next lens re-derives it · ARCH-S01-REWORK-R1

## ARCHITECTURE rework round 2 — ARCH-S01-REWORK-R2 (2026-09-06), answering `reviews/ARCH-REV-S01-r2.md`

- 2026-09-06 · **Correction to the line at `DECISIONS.md:243`, appended not edited** (ORCHESTRATOR
  CORRECTION on `t_5490215a`, `COMMON.md` §10.23). That line says the C2 seat writes
  `ADR-0019-consent-storage-contract.md` and that **"0019 is the next free number"** because
  `ls docs/architecture/01-decisions/` ends at `ADR-0018-deployment-topology.md`. **Read it as
  `docs/architecture/01-decisions/ADR-0021-consent-storage-contract.md`**; S02's is
  `ADR-0022-shared-modal-semantics.md`. `PLAN.md` is corrected to match: `grep -c 'ADR-0019' PLAN.md`
  went 4 → 1 and `grep -c 'ADR-0021'` 0 → 4 (by OCCURRENCE, `grep -o … | grep -c`: 5 → 1 and 0 → 5; the
  one surviving `ADR-0019` is inside the sentence that explains the reservation), identical under
  `/bin/bash` and inline · **The rule the round-1 line got wrong is the one worth recording: a number read
  off `ls` is the last ADR WRITTEN, never the last one CLAIMED.** `ADR-0019` is claimed by the halted
  `translation` mission inside its own mission folder, which no `ls docs/architecture/01-decisions/` can
  see — `docs/missions/translation/INSTRUCTIONS.md:62` reads *"the next free number is **ADR-0019**"*.
  Measured by me, counting rule `grep -ro '<tok>' docs/missions/translation | grep -c '<tok>'` (occurrences,
  not lines), both shells: **`ADR-0019` = 23** across 12 files (`INSTRUCTIONS.md` + the eleven
  `slices/I*/DECISIONS.md`), bare `0019` = 24. **`ADR-0020` = 0.** Neither number matches the "37 + 14
  references" the correction states; `grep -ro 'ADR-0020' docs/missions/translation` finds nothing at all.
  (A repo-wide `ADR-0020` total is deliberately NOT pinned here: `consent-ui`'s own files — this entry
  included — are most of it, so the number moves every time a seat writes about S02. The stable, checkable
  fact is the one above: **zero** under `docs/missions/translation`. That is the durable form of the lesson
  in the round-1 CORRECTION comment — a count of a file or tree this seat does not solely own is stale the
  moment a parallel seat writes.) **The ALLOCATION binds regardless and is applied unchanged** — 0021 and 0022 are
  unwritten on disk and unclaimed by any mission I can see, so obeying it is strictly safe — but the
  JUSTIFICATION's counts are a stated fact with no re-run behind them, which is the class this round exists
  to close, so they are reported as a candidate finding rather than transcribed · **Rejected:** keeping the
  round-1 justification sentence in `PLAN.md` beside the new number — it would re-assert, three lines from
  the corrected filename, the very `ls`-is-the-allocator claim the correction overturns · orchestrator
  ruling on the number; counts and the `ls`-vs-claimed rule measured by ARCH-S01-REWORK-R2
