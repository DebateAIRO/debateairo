# SPEC — SUP-04 The assistant on product routes (widget), never on zone routes

**Status:** FROZEN at creation (2026-09-01, REQ-SUP). No agent edits this file after
creation. Scope change = new SPEC version, ratified by V.

**Mission:** `observability-agents` · **Product:** SupportAgent (Bot A) · **Traces to:** V's
goal (`00-intake-H0.md:10`); packet charge Q3 ("a widget on which routes; anonymous vs
signed-in"). Requirements file: `requirements/supportagent.md` (Q3). **Depends on:**
SUP-01. **Tree state measured:** `dev` @ `4f764037`.

## Intent

The same assistant is reachable where users actually are — the library/landing, the new
debate form, the owner's debate page and the public debate page — and is structurally
absent from every sign-in, sign-up, verification, MFA and settings screen.

## Ground truth this SPEC rests on (measured 2026-09-01 on `4f764037`)

- `/` renders the landing page for anonymous visitors (`apps/ui/app/page.tsx:21`) and
  the library for signed-in users (`apps/ui/app/page.tsx:62` neighbourhood).
- `/verify-email` re-exports the MFA enrolment page (`apps/ui/app/verify-email/page.tsx:7`);
  `/enroll-mfa`, `/login`, `/sign-up`, `/settings` are zone flows (COMMON §3).
- The root layout is shared by every route (`apps/ui/app/layout.tsx:34`); a mount there
  would place the assistant inside the zone flows.
- `apps/ui/app/page.tsx` and the landing components were the ui-overhaul mission's working
  set and are now committed on `dev` (H0 addendum, 23:50); this slice edits `page.tsx`.

## Requirements

### SUP-04-R01 — Four mounts, per page
A `SupportWidget` component is imported and rendered by exactly these files:
`apps/ui/app/page.tsx`, `apps/ui/app/new/page.tsx`, `apps/ui/app/debate/[id]/page.tsx` (or
its client component), `apps/ui/app/public/debate/[id]/page.tsx` (or its client component).

### SUP-04-R02 — Structurally absent from the zone
`SupportWidget` is not imported by `apps/ui/app/layout.tsx` nor by any file under
`apps/ui/app/{login,sign-up,verify-email,enroll-mfa,settings}/`. An architecture test lists
the four permitted importers and fails on any other importer.

### SUP-04-R03 — One conversation per tab
The widget and `/help` share one support session per browser tab: opening "Open full page"
from the widget continues the same messages on `/help`; returning continues in the widget.

### SUP-04-R04 — Collapsed, reachable, non-covering
The widget renders collapsed as a button labelled WIDGET_BUTTON (§Copy) at the bottom-right,
with an `aria-label`, reachable by keyboard (Tab then Enter). Expanded, its bounding box
does not intersect the page's primary control — the composer on `/`, the submit control on
`/new`, the publication control on `/debate/[id]` — at 1280×800 and at 390×844.

### SUP-04-R05 — Same engine, same rules
Every behaviour of SUP-01 (disclosure, grounding, refusals, limits, rating, minimal case)
and, where landed, SUP-02/03/05/06 applies unchanged inside the widget. On
`/debate/[id]` with SUP-03 consent on, the widget pre-selects the current debate; on
`/public/debate/[id]` no debate context is ever passed.

### SUP-04-R06 — Disclosed overlap
This slice edits `apps/ui/app/page.tsx` (one import line, one JSX line), a file the
ui-overhaul mission also edits. The slice ticket names the overlap; the conflict is
resolved at merge time (V's vertical-slice law), never by serializing the slices.

## Copy — verbatim, both languages

- WIDGET_BUTTON · en: "Help" · ro: "Ajutor" (the language follows the `RO | EN` override,
  default English until the user writes).
- OPEN_FULL_PAGE · en: "Open full page" · ro: "Deschide pagina completă"

## Acceptance — V runs these in the real dev stack

1. `pnpm dev:auth:up`; private window; `https://localhost:3000/`. Expected: a "Help" button
   at the bottom-right of the landing page. Click. Expected: the DISCLOSURE text.
2. Type `How do I publish a debate?` Expected: a grounded answer with a `Source:` line.
   Click OPEN_FULL_PAGE. Expected: `/help` opens showing the same two messages.
3. Open `https://localhost:3000/login`, `/sign-up`, `/verify-email`, `/enroll-mfa`.
   Expected: no "Help" button on any of them.
4. Sign in with the QA identity; open `/settings`. Expected: no "Help" button. Open `/new`.
   Expected: the button; expanded, it does not cover the submit control (resize the window
   to 1280×800 and then to 390×844 and check both).
5. Open one of the QA identity's debates at `/debate/<id>`. Expected: the button; with the
   SUP-03 consent on, the widget shows the current debate as the selected context.
6. Open a published debate at `/public/debate/<public_ref>` in a private window. Expected:
   the button; no debate context is shown or selectable.
7. Keyboard only: on `/`, press Tab until the "Help" button is focused, press Enter.
   Expected: the widget expands and the input has focus.

## Out of scope (this slice)

- Any change to landing copy or design (ui-overhaul). Any mount on a zone route.
- New assistant capabilities; this slice only re-hosts SUP-01's engine.

## Parallel-safety (single-writer rule)

- Creates: `apps/ui/components/support/SupportWidget.tsx`, `tests/architecture/sup-04-*.test.ts`.
- Edits (one import + one JSX line each): `apps/ui/app/page.tsx` (OVERLAP with ui-overhaul —
  merge-time), `apps/ui/app/new/page.tsx`, `apps/ui/app/debate/[id]/page.tsx` or its client
  component, `apps/ui/app/public/debate/[id]/page.tsx` or its client component.
- Depends on SUP-01. Parallel-safe with SUP-02, SUP-03, SUP-05, SUP-06, SUP-07 (none of
  them touch these page files).
