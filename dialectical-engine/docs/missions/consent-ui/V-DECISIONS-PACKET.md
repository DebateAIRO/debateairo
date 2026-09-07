# V DECISIONS PACKET — mission `consent-ui` (ticket `t_419b393a`)

Rows only V can rule. Each row is self-contained: what the thing IS, why it exists, one example, then the options. Reply on the ticket or in chat with the row id and a choice. Rows marked CONFIRM need one word. **Until V rules, the orchestrator's default in each row is what the seats build** — so a late "no" costs a rework round, never a re-plan.

## V-1 · CONFIRM — who writes the requirements and plans, and who reviews the code cluster by cluster

**What it is.** You named the coders (Opus 5) and the reviewer of each finished UI element (Grok 4.6). Three other seats exist in the heartbeat loop and you named nobody for them: the requirements seat (turns your goal into a frozen spec with numbered steps you can test), the architecture seat (turns the spec into a step-by-step plan with one verification command per cluster), and the per-cluster reviewer (checks each coder's small unit of work before the next unit starts, so a wrong foundation is caught early).
**Default taken.** All three are Opus 5 subagents, each in a fresh session that has seen nothing of the author's work. Grok 4.6 is reserved for what you asked: judging each UI element once it is truly done.
**Example.** The coder finishes the cookie banner's storage logic. An Opus 5 reviewer probes it (clears storage, reloads, checks the banner returns). Only when the whole banner + preferences card is done does Grok 4.6 review the finished element in a browser-shaped probe.
**Options.** (a) CONFIRM · (b) Grok 4.6 also reviews requirements and plans (costs Grok turns before any UI exists) · (c) skip per-cluster reviews and rely on Grok only at the end (cheaper, later defects).
**Recommendation:** (a).

## V-2 · CONFIRM — "I have read it" is disabled until the policy has been scrolled to its end

**What it is.** In the design the privacy-policy modal (10c) has a footer button `I have read it` (this is the "I agree" button you described) and the artboard's caption says "scrollable, must reach the end". You did not mention scrolling.
**Default taken.** The button is greyed out until the reader has scrolled the policy so that its last line ("END OF POLICY · GDPR (EU) 2016/679 · v2.1") has come into view; then it enables, and clicking it ticks the sign-up checkbox and closes the modal.
**Example.** A user clicks the privacy checkbox, the modal opens, they immediately look for a button — it is disabled; they scroll to the bottom, it enables, they click it, the box is ticked.
**Options.** (a) CONFIRM · (b) the button is always enabled (design's caption ignored) · (c) enable after a time delay instead of scrolling.
**Recommendation:** (a) — it is what the design says and it is the usual "you were shown the whole text" evidence for consent.

## V-3 · The `Download PDF` button in the privacy modal — there is no PDF

**What it is.** The design's modal footer has `Download PDF` next to `I have read it`. The repository has no policy PDF, and nothing generates one.
**Default taken.** The button is not rendered. Everything else in the footer (the `privacy@dezbatere.ro` contact line and `I have read it`) is.
**Example.** With the default, the modal footer shows the contact line on the left and `I have read it` on the right. With option (b) a click would open the browser's print dialog on a print-styled policy, which the user can save as PDF.
**Options.** (a) not rendered until a PDF exists · (b) render it as "Print / save as PDF" using the browser's print dialog · (c) you supply a PDF file to ship at a fixed path.
**Recommendation:** (a) now; (b) is a small follow-up slice if you want the button.

## V-4 · The banner promises "change this any time in Settings" — Settings has no Privacy section

**What it is.** The banner copy (10a) says "You can change this any time in Settings." and the preferences card (10b) says "Revisit any time from Settings → Privacy." The Settings page today shows only the identity panel.
**Default taken.** Slice S01 adds a minimal "Privacy" panel to Settings with one button, `Cookie preferences`, which reopens the 10b card with the stored choices pre-filled. It is its own sub-ticket, so you can veto it separately.
**Example.** A user who chose "Essential only" last week opens Settings, sees Privacy → `Cookie preferences`, clicks it, turns on Product analytics, saves.
**Options.** (a) build the minimal re-entry (default) · (b) ship without it and change the two sentences so they do not promise it · (c) defer the re-entry to a later mission and leave the copy as designed (a promise the product cannot keep).
**Recommendation:** (a).

## V-5 · Should the server record that the user accepted the privacy policy? (follow-up, not this mission)

**What it is.** Today the server stores when a user affirmed being 18+ (`adult_affirmed_at`). Nothing stores that they accepted the privacy policy, or which version (the design says v2.1). Your goal is front-end only, so this mission gates the form in the browser and sends the registration request unchanged.
**Why it matters.** Under the GDPR a controller should be able to show what a user consented to and when. A browser-only gate proves nothing later.
**Example.** A user disputes that they agreed to publishing. With a server record: "accepted policy v2.1 on 2026-09-06 18:02 from the sign-up form." Without: no evidence beyond the fact that registration requires the box.
**Options.** (a) open a follow-up ticket for a server-side `privacy_accepted_at` + policy version (touches the registration contract, the API and a migration — the security zone) · (b) include it in this mission (adds a backend slice and a contract change) · (c) not needed.
**Recommendation:** (a).

## V-6 · CONFIRM — the 18+ checkbox takes the design's wording and look

**What it is.** The live sign-up page says "I affirm that I am at least 18 years old." with a plain browser checkbox. The design (8a) shows a bordered box holding two rows with custom check squares: "I am 18 or over." and the new privacy row.
**Default taken.** The existing checkbox is restyled and reworded to the design; what is sent to the server (`adult_affirmed: true`) does not change.
**Options.** (a) CONFIRM · (b) keep the current wording, only add the privacy row.
**Recommendation:** (a).

## V-7 · CONFIRM — the cookie banner shows on every page until a choice is made, not only on the landing page

**What it is.** The design says "Shown once, on first visit, over the landing page." Signed-in users never see the landing page (they land on the library), so a landing-only banner would never ask them.
**Default taken.** The banner is mounted app-wide and shows on whatever page a visitor first opens, until they choose; the choice is stored in the browser (`localStorage`), so clearing site data asks again. It never shows a second time after a choice.
**Options.** (a) CONFIRM · (b) landing page only, exactly as the sentence reads.
**Recommendation:** (a).

## V-8 · CONFIRM — the fleet starts coding without waiting for your yes on the planning graph

**What it is.** The heartbeat spine has a "planning-graph gate": the architecture seat draws the mission graph (clusters, lanes, review seats, merge order) and your yes on the image gates programming. You fired this mission autonomously and are not at the keyboard.
**Default taken.** Each architecture seat draws its graph (`.hermes/reports/consent-ui/mission-graph-S0x.md`, mermaid) and coding starts as soon as the plan passes its blind review. You can veto at any point; a veto after coding started costs at most the clusters already coded.
**Example.** ARCH-S01 plans four clusters; the reviewer passes it at 19:00; coding seats launch at 19:05 without a pause for you. If you dislike the cluster cut at 21:00, the affected cluster is re-planned and re-coded.
**Options.** (a) CONFIRM · (b) pause for your yes on each graph (adds one human round-trip per slice).
**Recommendation:** (a).

---
# Rows routed from REQ-01's contested decisions (2026-09-06 17:45). Full reasoning per row: `docs/missions/consent-ui/requirements/contested-decisions.md`. Each default is already what the slices build.

## V-9 · EARLY — the cookie-preferences card names five cookies that do not exist

**What it is.** The design's "Cookie preferences" card (10b) prints a small monospace line under each category naming the cookies it covers: `de_session · de_mfa · de_device — 30 days`, `de_quality — 90 days · first-party`, `de_analytics — 90 days · first-party`. The product sets exactly two cookies, `__Host-debateai-session` and `__Host-debateai-csrf`, and the two optional categories store nothing yet. A consent card under the GDPR would be stating five things that are not true about the reader's machine.
**Default taken.** The design's lines ship verbatim (your packet law: copy from the design), but the three strings are pinned as ONE data constant (`COOKIE_CATEGORIES` in `apps/ui/lib/consent.ts`), so whichever you choose is a one-line data edit.
**Example.** With (b) the Essential line reads `__Host-debateai-session · __Host-debateai-csrf — session` and the two optional lines say the category is not in use yet.
**Options.** (a) the design's five names, verbatim (default) · (b) correct the lines to the truth · (c) ship (a) now and rename the product's real cookies to the designed names later.
**Recommendation:** (b) — the requirements seat and the orchestrator both recommend it; this is the one surface where a false line is a regulatory problem, not a cosmetic one.

## V-10 · CONFIRM — the preferences card opens as a centred dialog over a dim overlay

**What it is.** The design draws the preferences card (10b) alone on its artboard and never shows how it appears. It can be reached from the bar ("Choose what to store") and from Settings → Privacy, where there is no bar.
**Default taken.** One presentation for both entry points: the card opens centred over the same dim overlay the privacy-policy modal uses; the bar is hidden while it is open.
**Options.** (a) CONFIRM · (b) the card replaces the bar in place (and needs a second, centred layout for Settings) · (c) the card grows out of the bar (same second layout needed).
**Recommendation:** (a).

## V-11 · CONFIRM — the preferences card has no close button, exactly as designed

**What it is.** The card's footer has three controls — `Privacy notice`, `Essential only`, `Save choices` — and no `×`. Opened from Settings, a visitor who wants to leave without changing anything has only the Esc key or a click on the dim area; `Essential only` would overwrite their stored choice.
**Default taken.** No `×`; Esc and a click on the dim area close without changing anything.
**Options.** (a) CONFIRM · (b) add a `×` in the card's header, matching the policy modal's.
**Recommendation:** (a) because the design is explicit; (b) is the stronger accessibility answer for touch users and the orchestrator would not object to it.

## V-12 · CONFIRM — the policy modal's read-only footer gets one word the design does not contain: `Close`

**What it is.** The privacy-policy modal (10c) is opened from two places: the sign-up checkbox (its `I have read it` button ticks the box) and the preferences card's `Privacy notice` link (read only, nothing to tick). The design only draws the sign-up case. A button saying `I have read it` that agrees to nothing would claim a thing it does not do.
**Default taken.** In read-only mode the footer shows the contact line and a single `Close` button — the one string this mission adds beyond the design.
**Options.** (a) CONFIRM · (b) contact line only; the `×`, Esc and the dim area are the exits (no new string) · (c) keep `I have read it` in both modes, where read-only it just closes.
**Recommendation:** (a); (b) if you want zero invented strings; never (c).

## V-13 · CONFIRM — wording for the Settings → Privacy panel (the design never wrote any)

**What it is.** Row V-4 adds a Privacy panel to Settings with a `Cookie preferences` button. The design has no such panel, so its title and hint line have no source.
**Default taken.** Title `Privacy`; hint `Choose what this browser stores. Asked once; change it here any time.`; button `Cookie preferences` (matches the card's own title).
**Options.** (a) CONFIRM · (b) you write the sentence · (c) title and button only, no hint line.
**Recommendation:** (a) unless you want to write it yourself.

## V-14 · CONFIRM — the cookie bar also appears over the debate canvas

**What it is.** Row V-7 mounts the bar on every route. The debate view is the most immersive page (it hides the global top bar and draws its own chrome), so a first-time visitor who arrives on a shared public debate link meets the consent bar over the debate.
**Default taken.** Every route, debate canvas included. Measured consequence: on the owner debate view the bar covers the token dock, which holds one non-interactive status pill — no control is blocked, and one click on the bar ends it.
**Options.** (a) CONFIRM · (b) every route except the debate views, where the ask waits until the visitor navigates away (a reader who never navigates is then never asked).
**Recommendation:** (a).

## V-15 · Two small wording defects sit inside the frozen sign-up SPEC after its last lawful review round

**What it is.** The requirements for the sign-up gate went through three review rounds (the cap) and passed. The final review still found two non-blocking wording defects inside the now-frozen document: (1) a sentence in the test rules says "never assign `.checked` and then assert on the button", while two of the six test cases the same document requires do exactly that on purpose (they assert the button did NOT change); (2) a copy note names one location for two escaped apostrophes in the design data. Neither blocks the build; a fourth author round is not authorized by the protocol.
**Default taken.** The architecture seats plan against the specific test cases (the specific governs the general) and record that in DECISIONS; the coding seat writes all six cases as written. The SPEC keeps saying two things at once until you rule.
**Example.** With option (a), a requirements seat spends ~15 minutes writing SPEC-v4 with three clause edits and no other change; the orchestrator byte-diffs it; no review round. With (b), the plan carries the clarification and the SPEC stays contradictory on the record.
**Options.** (a) authorize one narrow SPEC-v4 (three clauses, byte-diffed, no re-review) · (b) leave the SPEC as is; the PLAN carries the clarification (the default) · (c) ticket it to the coding seat with the reviewer's ruling as authority.
**Recommendation:** (a) — fifteen minutes against a defect the reviewer priced at a possible coding round.

## V-16 · CONFIRM — pressing `Space` on the empty privacy checkbox opens the policy instead of ticking it

**What it is.** A keyboard user tabs to the "I agree with the privacy policy" box and presses `Space`. In every ordinary form, `Space` ticks a checkbox. Here the box may only be ticked by reading the policy and pressing `I have read it`, so the architecture seat made `Space` on the EMPTY box do what a mouse click does: open the policy modal and leave the box empty. On the 18+ box, and on the privacy box once it is ticked, `Space` toggles normally. The frozen requirement R03 still says both boxes are "toggled by `Space`", so its sentence is now imprecise for one direction of one box; the plan and the tests pin the modal behaviour (a step is being added this round so it is mechanically tested — ARCH-REV-S02 N3).
**Default taken.** `Space` on the empty privacy box opens the modal; the box stays empty; the SPEC sentence is left as is and the PLAN carries the precise rule. Nothing about the mouse path changes.
**Example.** Keyboard only: Tab to the privacy box, press `Space` → the policy opens, focus lands on its close button; scroll to the end, activate `I have read it` → the modal closes and the box is ticked; press `Space` again → the box unticks (no modal). Tab to the 18+ box, press `Space` → it ticks.
**Options.** (a) the default above · (b) let `Space` tick the privacy box directly (a keyboard-only route around the read gate — this is the one thing your goal forbids) · (c) (a) plus a SPEC-v4 wording fix to R03 (folds into V-15's option (a) at no extra cost).
**Recommendation:** (a) now, (c) if you authorize V-15 (a). Cost if wrong: one coding round on the sign-up cluster.

## V-17 · CONFIRM — the cookie-preferences toggles keep the design's border colour even though it measures under the accessibility line

**What it is.** Each category on the preferences card has an on/off switch. When it is OFF, its outline is drawn with the design's hairline-strong colour on the card surface. The architecture rework measured that outline at about 1.7:1 against the card (WCAG's non-text-contrast rule 1.4.11 asks 3:1 for a control's boundary). The ON/OFF state itself is still clear: the track fills with the gold-green "ok" colour when ON (4.2:1 Terracotta / 7.2:1 Chamber, passes), so the state does not depend on the outline. The colour values are the design's own tokens, pinned in the frozen SPEC (R24), so changing them means deviating from the design of record.
**Default taken.** Ship the design's values unchanged (design fidelity); the state is carried by the track colour, and the measurement is recorded in DECISIONS and ticket `t_b3c73a92`.
**Example.** In Terracotta mode, an OFF toggle shows a faint outline on the cream card; you can still tell it is OFF because the track is not filled. Under option (b) the outline would be a visibly darker grey than the design draws.
**Options.** (a) as designed (the default) · (b) darken the OFF-state outline to reach 3:1 in both modes (a one-line token change in S01's block, deviating from the design) · (c) keep (a) and fold the outline into the existing overlays accessibility retrofit ticket for a later pass.
**Recommendation:** (a) now; (c) if you want every control to clear 1.4.11 eventually without touching this mission. Cost if wrong: one token edit and a re-run of the S01 contrast test.

## V-18 · The frozen sign-up requirements contain two test cases that can only pass if a bare click ticks the privacy box — which your goal forbids

**What it is.** Requirement R17 (the hook that proves `Create account` is gated on both boxes) lists six test cases. Cases 4 and 5 say: click both boxes, then the button is enabled. But your goal says the privacy box may only be ticked by pressing `I have read it` inside the policy, never by clicking the box itself — and the plan's checkbox rule (R05) implements exactly that: a bare click on the empty privacy box opens the policy and leaves the box empty. So cases 4 and 5, read literally, expect the forbidden behaviour. Nobody noticed until this round because a bug in the first version of the plan (the button's state getting out of sync with the box) made the two cases pass by accident; fixing that bug correctly is what exposed them (ticket `t_d12339f3`, measured three runs).
**Default taken.** The two cases reach the "both boxes ticked" state the only lawful way: open the policy, scroll to the end, press `I have read it`, then click the 18+ box — and assert the button enables. The property R17 states ("both ticked → not disabled") is still tested; only the route changes. The frozen SPEC text is left as is, the PLAN carries the precise cases, and the DECISIONS file records the contradiction.
**Example.** In the test: mount the form → click `Privacy Policy` → scroll the policy to the end → press `I have read it` (the box ticks) → click the 18+ box → `Create account` is enabled. A bare click on the empty privacy box, by contrast, opens the policy and the button stays disabled.
**Options.** (a) the default above · (b) (a) plus a narrow SPEC-v4 edit rewriting cases 4 and 5 (folds into V-15's option (a) — the same fifteen-minute authorization now covers three clauses) · (c) keep the literal cases (impossible without letting a bare click tick the box).
**Recommendation:** (a) now, (b) with V-15 (a). Cost if wrong: one coding round on the sign-up gate cluster.

## V-19 · CONFIRM — what counts as a stored cookie decision (strict shape) — proposed by the S01 code reviewer

**What it is.** The cookie preferences are stored in the browser under one key. Two frozen requirements describe the stored record from different sides: R01 says exactly what a valid record looks like (five named members and nothing else, with the timestamp in the exact format the browser produces), and R03 says when to ignore a record and ask again (absent, unreadable, not an object, or missing one of the five). They do not compose: a record with a sixth member, or a hand-edited timestamp, passes R03's test and violates R01's shape. Nothing in the product writes such a record; it can only arrive from DevTools, a hand edit or an extension. The code as reviewed accepts those two shapes; the reviewer measured it (ticket `t_117e7f43`).
**Default taken.** Extending the ruling already made for one member (a record that says essential is off is not a decision) to the whole shape: a stored value is a decision only if it parses to an object with exactly the five members, version 1, essential true, the two optional flags boolean, and the timestamp in the exact ISO form. Anything else re-asks. Implemented as the first commit of the next S01 coding seat; the ADR restates the predicate once.
**Example.** A visitor whose stored record was corrupted by an extension (say a sixth field appended) sees the cookie bar again on their next visit instead of the product silently treating a malformed record as consent.
**Options.** (a) the strict shape above (the default) · (b) keep R03's looser test and accept extra members or odd timestamps · (c) (a) plus a SPEC-v4 wording fix to R03 (folds into V-15's option (a)).
**Recommendation:** (a) now, (c) with V-15 (a). Cost if wrong: about four lines and two tests.

## V-20 · CONFIRM — when two overlays are open side by side, which one does `Esc` close: the one opened LAST, or the one that comes LATER in the page?

**What it is.** Both slices share one helper that decides which open overlay "is on top" and therefore answers `Esc`. The rule it was built with says: an overlay nested INSIDE another is on top; otherwise the one that comes later in the page's document order. The ruling recorded earlier (ticket `t_eab0c89f`, DECISIONS) said "otherwise the one opened most recently". The two agree on the only stack this mission builds — the cookie preferences card with the privacy policy opened from its `Privacy notice` link — PROVIDED the policy element sits after the card in the page (the S02 code reviewer measured both arrangements: the other way round, one `Esc` closes the card and leaves the policy open). The mechanism is a one-line choice: keep document order (and pin the arrangement in S01-C6), or resolve by open order (drop one arm of the comparison).
**Default taken.** Keep the shipped mechanism (document order) and make the arrangement a binding constant of S01-C6 with a test: card open, policy over it, ONE `Esc` → the policy closes, the card stays. The DECISIONS wording is corrected to say what the code does.
**Example.** From the cookie card, open `Privacy notice`, press `Esc` once → only the policy closes and the card is still there with its switches untouched. Press `Esc` again → the card closes.
**Options.** (a) the default (document order + the pinned arrangement) · (b) switch the helper to open order in one line (a later coding seat; no rendering-order constraint anywhere) · (c) (a) now and (b) whenever a third overlay pair appears.
**Recommendation:** (a) now; (b) if you would rather nobody has to remember the ordering rule. Cost if wrong: one line in the helper and one test.

**Addendum 2026-09-07 05:15 — the default FAILED at the merged head (CODE-REV-S02-C9 r1 B1).** On `/sign-up`, where both slices' overlays coexist, the layout mounts the cookie surfaces AFTER the page content while the sign-up policy renders inside the page — so document order says "card on top" while paint (`--z-policy-card: 78` over `--z-consent-card: 76`) says "policy on top", and ONE `Esc` closes the CARD underneath the open policy, discarding the visitor's unsaved category choices. The orchestrator switched the default to option (b) — open order, the last-opened surface answers `Esc` — in cluster CODE-CROSS-02 (`t_cde7254d`, blind review `t_b29567cd`), with a new test that mounts both slices in one document. The S01 arrangement pin stays as a recorded constraint. **You rule** whether (b) stands; cost of undoing: one function.

**Second addendum 2026-09-07 05:45 — (b) shipped at `c334136d` (CODE-CROSS-02), and it INVERTS one unreachable behaviour.** For two overlays mounted in the SAME render commit, one inside the other, React registers the inner one first, so under open order the OUTER one answers `Esc`. No overlay pair in the product has that shape (both policy modals mount only after a click), so nothing a visitor can reach changes; the seat pinned the behaviour explicitly in the tests, the ADR and the helper's comment rather than hide it. **You rule** whether that pin is acceptable or a containment tiebreak should return; cost: one clause in one function.

**Third addendum 2026-09-07 06:15 — (b′) taken as the default.** The CROSS-02 reviewer implemented and measured the narrower rule — open order plus a CONTAINMENT-ONLY tiebreak (a surface nested inside another open surface answers `Esc` first; the `FOLLOWING` arm that caused the `/sign-up` defect never returns): the whole consent test set stays green except the three cases that existed only to pin the inversion, and every cross-slice case stays green. The orchestrator ruled (b′) and dispatched CODE-CROSS-03 (`t_ed4c5e73`, review `t_5d7078fe`) to ship it with the remaining non-blocking review residue. **You rule** (b) or (b′); cost of undoing: the same clause.


## V-21 · CONFIRM — the worker skill floor should name `receiving-code-review` for any seat that discharges another reviewer's findings, not only "on rework"

**What it is.** Every coding seat must load a fixed set of Superpowers skills (its "floor"). One of them, `receiving-code-review`, is listed as required "on rework" — when a seat's own work was sent back. This mission routes reviewer findings differently: they ride as the FIRST commit of the NEXT seat's packet, so a fresh seat discharges six numbered findings from another reviewer on round 0, and the floor as written gives it no reason to load that skill (the S01 code reviewer noticed; the seat was honest and complete under the wording).
**Default taken.** For this mission, COMMON §10.39 raises the floor: a seat whose packet carries a prior verdict's findings loads the skill before discharging them. The protocol docs and the skill itself are yours to change; the wording proposed is "on rework, or when your packet carries another reviewer's numbered findings as requirements".
**Example.** The S01-C5 seat implemented the C3C4 reviewer's six findings first (padding, border, token, motion, JSDoc, compiler pin) and never loaded the skill that says "verify a finding before implementing it".
**Options.** (a) the default (mission-scoped now, spine + skill in one commit at the next protocol edit) · (b) leave the floor as is and rely on packets · (c) (a) plus folding the follow-up-commit pattern itself into the spine as the standard route for non-blocking findings.
**Recommendation:** (a) now, (c) at the closure report. Cost if wrong: one sentence in two files.

## V-22 · CONFIRM — where keyboard focus lands after the cookie card is closed without a decision from the banner

**What it is.** The shared overlay helper returns keyboard focus, on close, to whatever control opened the overlay. From Settings that works: `Cookie preferences` is still on the page. From the banner it cannot: opening the card REPLACES the banner (your R14 rule), so by the time the helper looks for the opener it is gone, and when the banner comes back after a dismissal it is a brand-new element. Today a keyboard user who opens the card from the banner and backs out lands on the page body, not on `Choose what to store` (requirement R18 says the latter). Measured by the S01-C6 coding seat and recorded as a test that documents the gap; ticket `t_c1068d6f`.
**Default taken.** Give the helper an OPTIONAL fourth input — a reference to the control focus should return to — and have the cookie machine pass it the banner's `Choose what to store` button; on close the helper focuses that control if it is on the page, else the original opener, else nothing. One small cross-slice change after both slices are merged (the helper is S02's file), with one test per slice.
**Example.** Keyboard only: Tab to `Choose what to store`, press Enter → the card opens with focus on `Model quality telemetry`; press Esc → the banner returns and focus is on `Choose what to store` again. From Settings, focus returns to `Cookie preferences` (already true).
**Options.** (a) the default · (b) let the returning banner focus its own button when it reappears after a dismissal (a focus call inside the banner, which the slice's no-second-focus-implementation guard would have to exempt) · (c) accept focus on the page body and record it as a known gap.
**Recommendation:** (a); cost if wrong: one optional field, one reference, two tests.

**Addendum 2026-09-07 05:15 — the default's WORDING was wrong, the mechanism shipped corrected (CODE-CROSS-01, `bd314084`).** "Focus the named control if it is on the page, else the original opener" regresses the Settings entry with nothing stored: your R14 rule brings the bar back on dismissal from EITHER entry, so the bar's button is on the page and would steal focus from the still-mounted `Cookie preferences` opener. What shipped is the reverse precedence — the captured opener wins whenever it is a real element still on the page; the named control serves only when the opener did not survive (the banner case). Both sentences of the example above hold under it; under the literal wording the second fails (measured: a pre-existing test went RED). Blind review pending (`t_3315d8b1`). **You rule** whether the corrected precedence is the one you want.


## V-23 · The privacy policy's section 08 promises Settings capabilities the product does not offer (GROK-REV-S02-10C r1 N1)

**What it is.** The modal's policy text (transcribed byte-exact from the design, as the frozen SPEC requires) tells the reader they can export their data as JSON from Settings, request rectification, restrict or object to processing, and take their debates and account data in a machine-readable form. Settings today offers identity, sessions, cookie preferences, the legacy-run claim and account deletion — erasure and consent withdrawal are real; the other four are not.
**Default taken.** None — this is your copy and your product promise. The code ships the design's words unchanged; the Grok reviewer rated it non-blocking because the defect is in the frozen copy, not in its implementation.
**Example.** A visitor reads section 08 during sign-up, later opens Settings to download their data, and finds no such control.
**Options.** (a) qualify or drop the four bullets in a SPEC-v4 and re-transcribe (one coding seat, copy only) · (b) keep the words and build a Settings data export + rectification as a follow-up mission · (c) ship as designed and record the gap.
**Recommendation:** (a) now if the launch is near, (b) scheduled either way. Cost if wrong: a paragraph of copy, or a mission.

## V-24 · AUTHORIZE — one SPEC-v4 that folds the defaults this loop took, so you rule once

**What it is.** Nine rows were opened while the fleet coded, each with a default already in the product: V-15 (two wording defects in the frozen sign-up SPEC), V-18 (two frozen test cases that assume a bare click ticks the box — the code opens the modal instead, as you asked), V-19 (the strict stored-decision shape), V-20 (`Esc` reaches the surface opened last; a nested surface first — after the merged product proved the original "document order" rule wrong on `/sign-up`), V-22 (focus returns to the banner's `Choose what to store`; the opener you came from keeps focus when it is still on the page), plus the Grok gate's R24 wording ("exactly ten tokens" — the block also carries the mode-independent knob shadow) and V-23 above.
**Default taken.** All of them are in the code and pinned by tests; the SPECs still carry the old sentences. A SPEC-v4 is a docs-only seat (no product change) that rewrites those sentences to what shipped, citing each DECISIONS row.
**Example.** You read SPEC-v4 once, veto or accept each folded default in one sitting, and the docs stop contradicting the product.
**Options.** (a) authorize the SPEC-v4 docs seat now · (b) rule the rows one by one first · (c) leave the SPECs as history and rely on DECISIONS.
**Recommendation:** (a). Cost if wrong: one docs seat, one review.
