# ADR-002 — Mode switching: `html[data-mode]`, `localStorage`, blocking head script

**Status:** ACCEPTED (ARCH-01, 2026-08-31) · mission-local
**Slices affected:** all eight (T1 R7 · T3 R8 · T4 R6 · T5 R8 · T6 R6 · T7 R1 · T8 R7 · T9 R3)

## Decision

### The marker

`document.documentElement` carries `data-mode`, whose only two values are
`terracotta` and `chamber`. **Absence of the attribute means Terracotta**,
because `:root` declares the Terracotta values unconditionally and the Chamber
block is a strictly additive override. Server-rendered HTML therefore ships with
no attribute and is already correct for the default mode; there is no
"unstyled" state.

```css
:root { --bg:#F9F6F1; … }                     /* Terracotta */
html[data-mode="chamber"] { --bg:#14110E; … } /* Chamber     */
```

`html[data-mode="terracotta"]` is not a selector; it exists only as an explicit
attribute value so that a user who has chosen light is not re-flipped by any
future `prefers-color-scheme` rule.

### Persistence

`localStorage`, key `debateai.mode`, values `terracotta` | `chamber`.

T9's `DECISIONS.md` (2026-08-31, Requirements) recorded: *"Persist
Terracotta/Chamber for the browser session when cheap; not a design-mandated
floor. Beyond-session = ARCH."* ARCH rules **beyond-session**, for a mechanical
reason rather than a preference: the no-flash script below must read the stored
value **synchronously, before first paint**, and `localStorage` is the only
synchronous durable store available in that position. `sessionStorage` would
satisfy the recorded floor at identical cost and identical code, so choosing the
durable one costs nothing and is strictly better for a returning reader. No
cookie is introduced — a cookie would put mode into the request and into the
server render, which is a larger change than this mission's bounds.

### SSR-flash avoidance

One inline script in `<head>`, rendered by `apps/ui/app/layout.tsx` via
`<script dangerouslySetInnerHTML>` placed BEFORE `{children}`, so it executes
before the first paint:

```tsx
<head>
  <script
    dangerouslySetInnerHTML={{
      __html:
        "try{var m=localStorage.getItem('debateai.mode');" +
        "if(m==='chamber'||m==='terracotta')document.documentElement.dataset.mode=m;}catch(e){}"
    }}
  />
</head>
```

The `try/catch` is required, not defensive padding: `localStorage` throws on
access in Safari private mode and under a blocked-storage policy, and an
uncaught throw here runs before React and blanks the document.

`apps/ui/app/layout.tsx` **already** carries `suppressHydrationWarning` on both
`<html>` and `<body>`, which is exactly the attribute this pattern needs and is
already present — no change to those props.

### The control

`apps/ui/components/ModeToggle.tsx` — NEW, client component.

```tsx
"use client";
export type Mode = "terracotta" | "chamber";
export function ModeToggle(): JSX.Element;
```

- Renders a single `<button type="button" className="modeToggle"
  data-mode-toggle aria-pressed={mode === "chamber"}>` whose label is
  `☾ Chamber` when Terracotta is active and `☀ Terracotta` when Chamber is
  active, with `aria-label="Switch to Chamber mode"` / `"Switch to Terracotta
  mode"` so the accessible name never depends on a glyph.
- Reads its initial state from `document.documentElement.dataset.mode` in a
  `useEffect`, never from `localStorage` directly — the head script is the
  single reader of storage, so the two can never disagree.
- On click: flips `document.documentElement.dataset.mode`, writes
  `localStorage.setItem("debateai.mode", next)` inside `try/catch`, and sets
  local state.

### Where it mounts — the complete enumeration

Exactly **two** mount points cover all eight slices. This is the whole list; a
seat that adds a third has found a route the map missed and must say so.

| Mount | File | Covers |
|---|---|---|
| Global chrome | `apps/ui/components/TopBar.tsx` — in `topBarActions`, and in the `authTopBar` branch | `/` (T9 anonymous, T3 signed-in), `/new` (T4), `/settings` (T6), `/admin/workers` (T7 fleet), `/login` `/sign-up` `/verify-email` `/enroll-mfa` (T7, T8) |
| Debate chrome | `apps/ui/app/debate/[id]/DebatePageClient.tsx` — inside `<div className="debateTopControlRow">`, as a **sibling of** the `{hasTree ? …}` conditional, never inside it | `/debate/[id]` (T1, T5 drawer) and `/public/debate/[id]` (T3 3b, T5 public) |

The "sibling of, never inside" is load-bearing: the `segment` view group is
rendered only `{hasTree ? … : null}`, so a toggle placed inside it disappears on
a debate whose tree has not been built yet — and T1's own acceptance opens a
debate that may still be generating. Anchor on the class name
`debateTopControlRow`, not on a line number; the file is 1958 lines and every
cluster in T1/T3/T5 edits it.

`TopBar` returns `null` for `/debate/*` and `/public/debate/*`
(`TopBar.tsx:57`), which is precisely why the debate chrome needs its own
mount and why two is the exact number.

The drawer (T5) does not mount its own toggle: `NodeDetailDrawer` renders
inside the debate document, so the debate-chrome toggle already switches it.
T5 R8 is satisfied by the drawer's tokens responding, which is what its
acceptance measures.

## Why not `class="dark"` or `prefers-color-scheme`

- A class collides with the 4080-line stylesheet's existing class namespace and
  cannot be asserted with `getPropertyValue` on the root without also asserting
  class membership; `data-mode` is a single attribute with two legal values and
  reads back cleanly in jsdom (`ADR-006`).
- `prefers-color-scheme` alone cannot satisfy R3 on any slice: the SPECs require
  a *control that switches*, and V's acceptance step is "click the mode toggle".
  A media query is not a control. It is deliberately NOT added as a default
  either — doing so would make the SSR default depend on the reader's OS and
  break the "absence means Terracotta" invariant that removes the flash.

## Refutation

The acceptance that catches a broken mode switch: read
`getComputedStyle(document.documentElement).getPropertyValue('--bg')`, set
`data-mode="chamber"`, read again, assert the two differ AND that each equals
its inventory value. It **catches**: a Chamber block that was never written; a
Chamber block written under the wrong selector; a token declared in one block
and not the other. It does **not** catch: a component that hard-codes a colour
and therefore ignores both blocks — that is the separate concern of ADR-001's
120-literal sweep, and the two acceptances must both exist because neither
implies the other.
