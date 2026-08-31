# SPEC — T3 Library & public debate view

**Version:** v2 (2026-08-31) · **Status:** FROZEN at v2. Supersedes v1.

**Mission:** `ui-overhaul` · **Design source:** TURN 3 (3a Library, 3b Public).

## Intent

Ship the approved bezel-card library (3a) for signed-in users, and the public
debate reading surface (3b) for signed-out (and non-owner) readers: verdict
first, strongest case each side, actions locked. Spec against the **shipped**
reality that `apps/ui/app/public/debate/[id]/` renders the **same workspace
component** as the owner route in read-only `publicMode` (commits 3705955,
362c469) — design 3b is requirements for what that public surface must show and
lock, not a mandate to invent a second unrelated page architecture.

## Screen inventory

### 3a Home — Library (signed-in `/`)

| ID | Region | Notes |
|---|---|---|
| T3-S1 | Chrome | `Dialectical Engine` / `dezbatere.ro` / `Library` / `+ New debate` / asker chip / mode / settings |
| T3-S2 | Composer hero | `A REASONING INSTRUMENT`; prompt `What should we debate?`; body; input `Type a debatable claim or question…`; `Models argue · you judge`; `Start debate →` |
| T3-S3 | Lists | Tabs/sections `Your debates` and `Public debates`; `4 TOTAL` count chip on the list chrome; rows with title, relative time, model count, status (`Complete` / `Generating`), open affordance |
| T3-S4 | Mode + tokens | Terracotta ↔ Chamber |

### 3b Public debate view

| ID | Region | Notes |
|---|---|---|
| T3-S5 | Public header | Title; `🔒 Public view · actions locked`; view toggles Thread/Split/Tree/Map; mode |
| T3-S6 | Verdict first | Status chip (e.g. `CONTESTED`); thresholds line; `Details ▾` disclosure on the verdict block; verdict paragraph; caveat when present; metric line (dialectical support / verification / judge coverage / convergence) |
| T3-S7 | Strongest cases | `THE CASE FOR` / `THE CASE AGAINST` with strongest surviving argument cards; scores; model lines; per-card `Read ▾` |
| T3-S8 | Locked actions | Challenge controls locked; banner `🔒 Viewing publicly — sign in to challenge, regenerate, or flag claims.`; `Unlock actions` |
| T3-S9 | Mode + tokens | Terracotta ↔ Chamber |

## States

1. Signed-in `/` → library (3a), not T9 landing.
2. Anonymous `/` → T9 landing (not library).
3. Library empty vs non-empty lists for Your / Public.
4. Row statuses at least Complete and Generating as in design sample.
5. Public view: mutations absent/locked; READ chrome present via `publicMode`
   workspace (views, cards, scoring chrome as already required by prior
   public-debate-access mission — this overhaul restyles and applies 3b
   verdict-first / strongest-case layout requirements on that path).

## Copy (binding excerpts)

- Library: `A REASONING INSTRUMENT`; `What should we debate?`; `Start debate →`;
  `Your debates`; `Public debates`; `4 TOTAL`
- Public: `Public view · actions locked`; verdict `Details ▾`; per-card `Read ▾`;
  locked Challenge; public viewing banner; `Unlock actions`

## Requirements

### R1 — Signed-in library at `/`

Authenticated `/` shows T3-S1…S4 library, not anonymous landing.

### R2 — Composer + Start debate

Composer input and `Start debate →` visible for signed-in users (creates via
existing auth rules).

### R3 — Your / Public lists

Both list selectors exist; each shows the corresponding debate rows with title,
time, model count, status. List chrome includes the `4 TOTAL` count chip from
design. Selecting `Your debates` vs `Public debates` must change which debate
set is shown (or distinct empty-state copy) — not the same hardcoded list under
both labels.

### R4 — Bezel card language

Library rows and public case cards use the approved double-bezel card language
shared with T1 (visual tokens named in mission design-system facts).

### R5 — Public route uses workspace `publicMode` reality

Public debate URL continues to render the shared workspace in `publicMode`
(or ARCH-documented successor that preserves same-workspace READ parity). Do
**not** regress to an answer-only page that drops tree/views.

### R6 — Verdict-first public reading (3b)

Public view presents verdict/status block before or above the strongest-case
pair as in TURN 3b (ordering measurable in DOM/reading order). Verdict block
exposes `Details ▾`. Strongest-case cards expose `Read ▾`.

### R7 — Actions locked for public readers

Challenge / regenerate / flag mutations are locked or absent for publicMode
readers; lock affordances and sign-in unlock path are visible per design.

### R8 — Mode toggle

Terracotta ↔ Chamber on library and public surfaces.

### R9 — Render pins move

`tests/render/**` library/home and public-debate pins move to NEW UI
(**ARCH names pins**, including `pda-s02-*` and home buffer pins as applicable).

## NON-goals

- Implementing Method/Transcripts/Pricing pages.
- Changing publication envelope schema (prior mission).
- Anonymous create-without-auth on this surface. (Aligned with closed T9 CTA
  ruling V 2026-08-31: anonymous `Start a debate` goes through sign-in/sign-up
  with return to New debate — not draft-create here.)

## OPEN QUESTIONS

1. **TURN 3b artboard vs shipped `publicMode` workspace (ARCH):** Design 3b
   emphasizes verdict-first + strongest-case + locked actions. Shipped code
   already mounts the owner workspace in `publicMode`. Spec requires 3b
   reading order and locks **on that shared workspace path**. If ARCH finds
   verdict-first layout conflicts with existing view toggles (Thread/Split/
   Tree/Map), ARCH proposes the layout composition — must not drop
   `publicMode` shared workspace without V scope change.
2. ~~Vocabulary~~ — **CLOSED** V 2026-08-31: app vocabulary everywhere (`debates`
   / `claims`); see T9/DECISIONS mapping table.
3. **`Unlock actions` destination (ARCH):** sign-in return URL to the same
   public debate vs owner route — document choice.

## Acceptance — V manual (browser)

1. Sign in → `/`. **Expect:** Library chrome, composer, `Your debates` /
   `Public debates`, `4 TOTAL` chip, mode toggle — not T9 hero
   `Find the weakest claim in your own argument.`
2. With a fixture where Your and Public membership differ (at least one debate
   in Your that is absent from Public, or distinct empty-state copy): open
   `Your debates` then `Public debates`. **Expect:** visible row set or
   empty-state string differs between selectors (identical hardcoded
   “No debates yet” under both = fail).
3. Open a published public debate URL logged out on a required fixture whose
   tree has strongest pro and con cases. **Expect:** public locked banner;
   verdict/status with `Details ▾`; strongest pro/con with `Read ▾`; view
   toggles work; Challenge locked; no owner settings/delete.
4. Click Unlock actions. **Expect:** sign-in (or documented auth) path; after
   auth, behavior matches ARCH-documented unlock rule.

## Acceptance — automated

- Library render tests assert NEW chrome strings and Your/Public selectors.
- Public render tests assert publicMode lock banner + verdict/strongest-case
  markers and absence of owner mutation controls.
- Pin migration named by ARCH; three-run law.
