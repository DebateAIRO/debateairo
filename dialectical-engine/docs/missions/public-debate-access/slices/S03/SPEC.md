# SPEC — S03 Your Debates / Public Debates navigation

**Status:** FROZEN at creation (2026-08-29). No agent edits this file after
creation. Scope change = new SPEC version, ratified by V.

**Mission:** `public-debate-access` · **Traces to V Done #1 and #2.**

## Intent

Replace passive "Your debates" / "Published debates" headings with selectable
**Your Debates** and **Public Debates** controls. Selecting each shows the
corresponding list. This is the genuine navigation build; anonymous list/detail
API plumbing already ships (`INTAKE.md`).

## Ground truth this SPEC rests on

- Home (`apps/ui/app/page.tsx`) uses `<h2>Your debates</h2>` and
  `<h2>Published debates</h2>` — not selectable controls (`INTAKE.md`).
- No dedicated public **list** route exists; published items are a stacked
  section on `/` (`INTAKE.md`).
- Logged-out `/` already 200s and renders the published section plus sign-in
  prompt (`INTAKE.md`).
- Asker-scoped "Your debates" stays empty without a session (intentional;
  `page.tsx` comments).

## Requirements

### R1 — Both controls present

The library surface exposes two selectable controls whose accessible names
include **Your Debates** and **Public Debates** (exact label text may follow
existing capitalization once Architecture picks one spelling; V's brief used
both "Your Debates" and "Your debates"). Both are present for logged-in and
logged-out visitors.

### R2 — Controls are accessible

Each control is reachable by pointer and by keyboard, has an accessible name,
and exposes selected/unselected state to assistive tech (`aria-pressed`,
`aria-selected`, or equivalent tab semantics). They are not decorative
headings.

### R3 — Your Debates shows the visitor's own debates

Activating **Your Debates** shows the asker-scoped debate list for the
signed-in visitor (same data `DebatesBuffer` / list endpoint uses today).
When the visitor is logged out, the Your Debates surface shows the existing
sign-in / create-account path (or equivalent) rather than inventing a global
anonymous private list.

### R4 — Public Debates shows published debates

Activating **Public Debates** shows the published debates list (same data
`GET /v1/public/debates` / `readPublicDebates` returns today). Each item links
to the public debate page for that `public_ref`. Empty and error states remain
honest ("none published yet" / temporary unavailable).

### R5 — Selection is mutual for the two list modes

Selecting one mode shows that mode's list as the primary library list surface
for that choice. The user can switch back and forth without a full account
change. Architecture chooses tabs-on-`/` vs route split (`/`, `/public`, …);
Done is behavioral, not a specific URL.

### R6 — Default selection is defined and documented

Architecture records the default selected mode for logged-in and logged-out
visitors in DECISIONS.md (e.g. logged-out defaults to Public Debates;
logged-in defaults to Your Debates). The implemented default matches that
record.

### R7 — Public list remains visible without login

A logged-out visitor can reach the Public Debates list and open a public
debate from it without creating an account. Criterion 1–2 apply to
logged-out users for the Public side.

## Out of scope (this slice)

- Envelope widening (S01).
- Public page READ-parity internals (S02) beyond linking into the public URL.
- Exposure review (S04).
- Changing publish/unpublish owner controls.

## Acceptance sketch

1. Logged-out: Public Debates control present, selectable, shows published
   list; Your Debates present and routes to sign-in (or empty+CTA).
2. Logged-in: Your Debates shows own debates; Public Debates shows published.
3. Keyboard: both controls operable; selected state announced.
