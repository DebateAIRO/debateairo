# SPEC — T9 Landing page

**Version:** v2 (2026-08-31) · **Status:** FROZEN at v2. Supersedes v1.
Scope change = new SPEC version, ratified by V.

**Mission:** `ui-overhaul` · **Design source:** TURN 9 in
`docs/missions/ui-overhaul/design/design-document-text.txt` (and rendered HTML).
**Vocabulary:** app terms everywhere per V 2026-08-31 (mapping in DECISIONS).

## Intent

Anonymous visitors hitting `/` see the Editorial Luxury landing (Terracotta /
Chamber) with approved cards, numbered method ledger, and mode toggle — design
structure/tone/layout with **translated** binding copy (app vocabulary).
Signed-in users keep today's library at `/` (T3). Method / Transcripts / Pricing
are stub anchors only.

## Screen inventory

| ID | Screen / region | Who sees it |
|---|---|---|
| T9-S1 | Landing chrome: wordmark `DebateAI`, nav `Method` / `Transcripts` / `Pricing`, primary CTA `Start a debate`, mode toggle | Anonymous at `/` |
| T9-S2 | Hero: eyebrow `PRACTICE, NOT PERFORMANCE`, headline `Find the weakest claim in your own argument.`, body paragraph (binding below), CTAs `Start a debate` and `Read a scored transcript`, meta `Four turns per debate` / `[PLACEHOLDER] debates argued this week` / `No audience, no ranking board` | Anonymous |
| T9-S3 | Sample resolution card block: `ONE DEBATE, FOUR TURNS`, sample RESOLUTION claim, Pro/Con/Reasoning cards with stance, BASE/FINAL, model attribution, `REVIEW AGREED BY:` / `REVIEW DISPUTED BY:` lines, Turns 01–04 | Anonymous |
| T9-S4 | Method ledger: `METHOD` / `THE METHOD` steps 01–04 (`Models argue`, `They review each other`, `You challenge`, `Verdict with receipts`) plus closing lines and tertiary `Start a debate` | Anonymous |
| T9-S5 | Pricing strip: `First [PLACEHOLDER] debates free, then [PLACEHOLDER] per month. Cancel whenever.` | Anonymous |
| T9-S6 | Mode: Terracotta (light) ↔ Chamber (dark) via toggle; fonts Fraunces + Plus Jakarta Sans; palette terracotta `#C15F3C`, green `#3F7466`, cream `#E7E2D8`/`#f0eee6`, ink `#111111` | Anonymous |

## States

1. **Anonymous `/`:** landing (T9-S1…S6) is the document.
2. **Signed-in `/`:** library (T3), not landing — V ruling.
3. **Mode Terracotta / Chamber:** toggle flips the whole landing between the two
   approved modes (persistence policy recorded in DECISIONS — not a design
   requirement).
4. **Stub nav:** Method / Transcripts / Pricing do not navigate to designed
   product pages this mission (anchors or no-op stubs only).
5. **Anonymous primary CTA:** `Start a debate` routes to sign-in or sign-up with
   a return path that lands in New debate after auth succeeds (V 2026-08-31).

## Copy (binding strings — translated design copy)

- Wordmark: `DebateAI`
- Nav: `Method`, `Transcripts`, `Pricing`
- Primary CTA (chrome, hero, method close): `Start a debate`
- Hero eyebrow: `PRACTICE, NOT PERFORMANCE`
- Hero headline: `Find the weakest claim in your own argument.`
- Hero body: `You argue. An opponent trained to locate the softest point in your reasoning presses on it until the claim holds or gives. Every turn is scored on evidence and on whether you actually answered the question — never on how well it was phrased.`
- Secondary CTA: `Read a scored transcript`
- Meta lines: `Four turns per debate`; `[PLACEHOLDER] debates argued this week`;
  `No audience, no ranking board`
- Section: `ONE DEBATE, FOUR TURNS` · `The pressure lands on the claim, not the wording.`
- Sample card review lines: `REVIEW AGREED BY:` / `REVIEW DISPUTED BY:` (with model line)
- After-sample close: `The debate ends here. Nothing is declared won. You get the transcript, the two marks per turn, and the claim you conceded.`
- Method intro: `Four steps, then you do it again tomorrow.`
- Method arena line: `The arena is built for repetition, not for a performance you prepare for once.`
- Method steps 01–04 titles: `Models argue` · `They review each other` · `You challenge` · `Verdict with receipts`
- Method step-03 body uses app framing: focused rebuttal spawned where you pointed (no `bench`)
- Closing: `Your argument is only as strong as its weakest claim.`
- Pricing CTA line: `Take one debate. Four turns, about nine minutes, and a transcript that tells you exactly where you stopped answering.`
- Pricing strip: `First [PLACEHOLDER] debates free, then [PLACEHOLDER] per month. Cancel whenever.` (static glyphs this mission — V 2026-08-31)

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
this is new. Text/surface pairs in each mode meet the contrast threshold ARCH
pins (not a subjective “readable” judgement).

### R4 — Stub anchors only for undesigned pages

`Method`, `Transcripts`, `Pricing` are present as labeled controls. This
mission does **not** require designed destination pages for them. Clicking a
stub must not hard-crash the document (navigation may be `#`, no-op, or a
minimal stub route ARCH documents).

### R5 — Primary and secondary CTAs + anonymous Start path

`Start a debate` (hero + chrome + method close) and `Read a scored transcript`
are visible. Logged-out click on `Start a debate` navigates to sign-in or
sign-up with a return path that opens New debate after successful auth
(V 2026-08-31).

### R6 — Sample card anatomy

Sample Pro / Con / Reasoning cards show type chip or stance, BASE/FINAL
percents, author model line, and review agree/dispute line (`REVIEW AGREED BY:`
or `REVIEW DISPUTED BY:`) matching TURN 9 sample content structure.

### R7 — Method ledger numbered 01–04

All four method steps render with numbers and titles from the design.

### R8 — Placeholders static this mission

`[PLACEHOLDER] debates argued this week` and pricing `[PLACEHOLDER]` strings
remain visibly placeholder static copy this mission (V 2026-08-31). No live
counter and no real prices.

### R9 — Render pins move to NEW UI

Existing `tests/render/**` pins that assert OLD home/landing copy or chrome for
this surface must be updated to the NEW landing (or split so signed-in library
pins stay under T3). **Which exact pin files = ARCH.**

## NON-goals

- Designing or implementing Method / Transcripts / Pricing pages.
- Live debate counters or billing/price feeds (static placeholders only).
- Changing signed-in library list behavior (T3).
- Token-system architecture / CSS variable extraction strategy (ARCH).
- Anonymous create without auth (ruled out — CTA goes through auth).

## OPEN QUESTIONS

1. ~~Vocabulary~~ — **CLOSED** V 2026-08-31: app vocabulary everywhere; see
   DECISIONS mapping table.
2. ~~Anonymous Start CTA~~ — **CLOSED** V 2026-08-31: auth with return to New
   debate.
3. ~~Placeholders~~ — **CLOSED** V 2026-08-31: static placeholder copy this
   mission.

## Acceptance — V manual (browser)

1. Open `/` logged out. **Expect:** landing with `DebateAI`,
   Method/Transcripts/Pricing, `Start a debate`, hero headline
   `Find the weakest claim in your own argument.`, method steps 01–04, pricing
   strip containing literal `[PLACEHOLDER]`.
2. Click the mode toggle. **Expect:** document mode marker flips between
   Terracotta and Chamber; text/surface pairs meet the contrast threshold ARCH
   pins in both modes.
3. Click Method, Transcripts, Pricing. **Expect:** document does not hard-crash;
   no full designed product page is claimed shipped (stub/anchor only).
4. Click `Start a debate` while logged out. **Expect:** land on sign-in or
   sign-up; after successful auth, land on New debate (T4 route). Record actual
   URLs.
5. Sign in, then open `/`. **Expect:** library (T3) chrome (e.g. `Your debates`
   / `+ New debate`), not the anonymous landing hero.

## Acceptance — automated (requirements on checks)

- Render/unit tests cover anonymous `/` landing chrome strings (`Start a debate`,
  translated hero headline) and mode-toggle presence; signed-in `/` does not
  render landing-only hero headline.
- CTA href/router target for logged-out `Start a debate` asserts auth entry with
  return-to-new-debate parameter/path ARCH documents.
- `tests/render/**` pins for this surface assert NEW translated copy (ARCH names
  files).
- Three-run law on the cluster verification command ARCH assigns.
