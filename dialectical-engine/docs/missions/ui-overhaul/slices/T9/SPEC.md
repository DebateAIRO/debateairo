# SPEC — T9 Landing page

**Version:** v1 (2026-08-31) · **Status:** FROZEN at creation. No agent edits
after issuance. Scope change = new SPEC version, ratified by V.

**Mission:** `ui-overhaul` · **Design source:** TURN 9 in
`docs/missions/ui-overhaul/design/design-document-text.txt` (and rendered HTML).

## Intent

Anonymous visitors hitting `/` see the Editorial Luxury landing (Terracotta /
Chamber) with approved cards, numbered method ledger, and mode toggle. Signed-in
users keep today's library at `/` (T3). Method / Transcripts / Pricing are stub
anchors only.

## Screen inventory

| ID | Screen / region | Who sees it |
|---|---|---|
| T9-S1 | Landing chrome: wordmark `DebateAI`, nav `Method` / `Transcripts` / `Pricing`, primary CTA `Start a round`, mode toggle | Anonymous at `/` |
| T9-S2 | Hero: eyebrow `PRACTICE, NOT PERFORMANCE`, headline `Find the weakest joint in your own argument.`, body copy, CTAs `Start a round` and `Read a scored transcript`, meta `Four turns per round` / `[PLACEHOLDER] rounds argued this week` / `No audience, no ranking board` | Anonymous |
| T9-S3 | Sample resolution card block: `ONE ROUND, FOUR TURNS`, sample RESOLUTION claim, Pro/Con/Reasoning cards with BASE/FINAL, model attribution, review agree/dispute lines, Turns 01–04 | Anonymous |
| T9-S4 | Method ledger: `METHOD` / `THE METHOD` steps 01–04 (`Models argue`, `They review each other`, `You challenge`, `Verdict with receipts`) plus closing line and tertiary `Start a round` | Anonymous |
| T9-S5 | Pricing strip: `First [PLACEHOLDER] rounds free, then [PLACEHOLDER] per month. Cancel whenever.` | Anonymous |
| T9-S6 | Mode: Terracotta (light) ↔ Chamber (dark) via toggle; fonts Fraunces + Plus Jakarta Sans; palette terracotta `#C15F3C`, green `#3F7466`, cream `#E7E2D8`/`#f0eee6`, ink `#111111` | Anonymous |

## States

1. **Anonymous `/`:** landing (T9-S1…S6) is the document.
2. **Signed-in `/`:** library (T3), not landing — V ruling.
3. **Mode Terracotta / Chamber:** toggle flips the whole landing between the two
   approved modes; choice persists for the browser session at minimum (persistence
   beyond session = ARCH).
4. **Stub nav:** Method / Transcripts / Pricing do not navigate to designed
   product pages this mission (anchors or no-op stubs only).

## Copy (binding strings from design)

- Wordmark: `DebateAI`
- Nav: `Method`, `Transcripts`, `Pricing`
- Primary CTA: `Start a round`
- Hero eyebrow: `PRACTICE, NOT PERFORMANCE`
- Hero headline: `Find the weakest joint in your own argument.`
- Secondary CTA: `Read a scored transcript`
- Meta lines: `Four turns per round`; `[PLACEHOLDER] rounds argued this week`;
  `No audience, no ranking board`
- Section: `ONE ROUND, FOUR TURNS` · `The pressure lands on the joint, not the wording.`
- Method steps 01–04 titles exactly as design
- Closing: `Your argument is only as strong as its weakest joint.`
- Pricing strip with two `[PLACEHOLDER]` slots

## Requirements

### R1 — Anonymous `/` serves landing

Logged-out GET `/` renders T9-S1…S6. No AuthGate redirect that replaces the
landing with login as the only view.

### R2 — Signed-in `/` keeps library

A session with a valid asker session at `/` renders the library surface (T3),
not the anonymous landing.

### R3 — Mode toggle present

Landing exposes a control that switches Terracotta ↔ Chamber. Both modes use
the named fonts and palette tokens above. Current app has no mode toggle —
this is new.

### R4 — Stub anchors only for unddesigned pages

`Method`, `Transcripts`, `Pricing` are present as labeled controls. This
mission does **not** require designed destination pages for them.

### R5 — Primary and secondary CTAs visible

`Start a round` (hero + chrome + method close) and `Read a scored transcript`
are visible. Destination behavior for anonymous `Start a round` is an OPEN
QUESTION (below) — do not invent a silent redirect policy.

### R6 — Sample card anatomy

Sample Pro / Con / Reasoning cards show type chip or stance, BASE/FINAL
percents, author model line, and review agree/dispute line matching TURN 9
sample content structure.

### R7 — Method ledger numbered 01–04

All four method steps render with numbers and titles from the design.

### R8 — Placeholders explicit

`[PLACEHOLDER] rounds argued this week` and pricing `[PLACEHOLDER]` strings
remain visibly placeholder **or** are replaced only after V-DECISION picks a
real data source (OPEN QUESTION). No fabricated live counts.

### R9 — Render pins move to NEW UI

Existing `tests/render/**` pins that assert OLD home/landing copy or chrome for
this surface must be updated to the NEW landing (or split so signed-in library
pins stay under T3). **Which exact pin files = ARCH.** This SPEC only binds
that OLD-UI-exact pins for the replaced surface must not remain as the mission's
passing bar.

## NON-goals

- Designing or implementing Method / Transcripts / Pricing pages.
- Choosing product vocabulary (`round` vs `debate`) — OPEN QUESTION.
- Implementing a billing system for the pricing strip.
- Changing signed-in library list behavior (T3).
- Token-system architecture / CSS variable extraction strategy (ARCH).

## OPEN QUESTIONS

1. **Vocabulary (V-DECISION):** Design uses `rounds` / `turns` / `joints` /
   `bench`; app uses `debates` / `claims` / `nodes`. Ship design copy verbatim,
   map to app terms, or dual-label? Requirements proposes: **ship design copy
   on marketing surfaces (T9); keep app domain terms on product surfaces
   (T1/T3/T4/T5)** — V must rule.
2. **Anonymous `Start a round` (V-DECISION):** CTA invites anonymous visitors to
   start; app today allows create only when signed in. Options: (a) CTA →
   sign-up/sign-in with return-to-new-debate; (b) CTA disabled/tooltip until
   signed in; (c) anonymous draft create (scope expansion — out unless V
   expands). Requirements proposes **(a)**.
3. **`[PLACEHOLDER] rounds argued this week` + pricing placeholders
   (V-DECISION):** Keep static placeholder text this mission, or wire a real
   count / pricing source? Requirements proposes **static placeholder strings
   matching the design glyphs** until a data owner exists.

## Acceptance — V manual (browser)

1. Open `/` in a logged-out browser. **Expect:** landing with `DebateAI`,
   Method/Transcripts/Pricing, `Start a round`, hero headline about weakest
   joint, method steps 01–04, pricing strip with `[PLACEHOLDER]` (or V-approved
   replacement).
2. Click the mode toggle. **Expect:** page flips between Terracotta (light) and
   Chamber (dark); wordmark and cards remain readable in both.
3. Click Method, Transcripts, Pricing. **Expect:** no crash; no claim that a
   full designed page shipped; stub/anchor behavior only.
4. Click `Start a round` while logged out. **Expect:** behavior matches the
   closed V-DECISION on OPEN QUESTION 2 (record actual URL/result).
5. Sign in, then open `/`. **Expect:** library (T3), not the anonymous landing.

## Acceptance — automated (requirements on checks)

- Render/unit tests cover anonymous `/` landing chrome strings and mode-toggle
  presence; signed-in `/` does not render landing-only hero headline.
- `tests/render/**` pins for this surface assert NEW copy (ARCH names files).
- Three-run law on the cluster verification command ARCH assigns.
