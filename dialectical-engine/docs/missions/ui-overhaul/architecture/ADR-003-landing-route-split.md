# ADR-003 — Anonymous `/` serves T9; signed-in `/` serves T3. The branch is a cookie read in the existing server component.

**Status:** ACCEPTED (ARCH-01, 2026-08-31) · mission-local
**Slices affected:** T9 (R1, R2), T3 (R1)

## Decision

`apps/ui/app/page.tsx` is **already** an `async` server component with
`export const dynamic = "force-dynamic"` that reads the session cookie on its
first line:

```ts
const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value ?? null;
```

The split is one early return in that existing component. No middleware, no new
route group, no client-side redirect:

```tsx
export default async function HomePage({ searchParams = Promise.resolve({}) }) {
  const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value ?? null;
  if (token === null) return <LandingPage />;          // T9
  /* … existing library body, unchanged below this line … */
}
```

**File surfaces**

- Modify: `apps/ui/app/page.tsx` — the early return only.
- Create: `apps/ui/components/landing/LandingPage.tsx` (server component, no
  `"use client"`), plus one file per T9 section under the same directory:
  `LandingChrome.tsx`, `LandingHero.tsx`, `LandingSample.tsx`,
  `LandingMethod.tsx`, `LandingPricing.tsx`. `ModeToggle` is the only client
  island the landing mounts.

`LandingPage` is a server component so the landing is fully present in the
initial HTML — which is both what R1 measures ("logged-out GET `/` renders
T9-S1…S6") and what the render tests can assert with
`renderToStaticMarkup`.

## The branch predicate: cookie PRESENCE, not session validity

The predicate is `token === null`, i.e. is the cookie there — **not** whether
the API confirms the session. Chosen deliberately:

- Validity requires a network call to the API on every anonymous hit of the
  home page. The anonymous landing is the most-hit route in the product; paying
  an API round-trip to decide that a visitor with no cookie is anonymous is a
  cost with no return.
- The stale-cookie case already has a defined, shipped recovery: the existing
  body sets `error = "Your signed-in session could not be confirmed…"` with a
  sign-in link. A reader with a dead cookie sees the library shell and a clear
  path out — the same behaviour as today. Nothing regresses.
- T9 R2 says *"A session with a valid asker session at `/` renders the library
  surface"*. A dead cookie is not a valid session, and it renders the library
  shell rather than the landing. That is a **known, bounded divergence** from
  the literal reading of R2, taken because the alternative costs an API call
  per anonymous page view. It is routed as `open-questions.md` Q-01 rather
  than decided silently.

## `AuthGate` must not be introduced onto `/`

T9 R1 says: *"No AuthGate redirect that replaces the landing with login as the
only view."* `apps/ui/components/AuthGate.tsx` is a client component that calls
`window.location.replace("/login")` when unauthenticated. It is currently used
by `/new` and `/settings` and is **not** on `/`. The requirement is therefore
"keep it that way", and the mechanical guard is a source assertion that
`apps/ui/app/page.tsx` does not import `AuthGate` — cheap, and it catches the
one edit that would silently destroy the landing.

## The `?tab=` contract survives

The library's `Your debates` / `Public debates` selectors are `<Link>`s to
`/?tab=yours` and `/?tab=public` — real hrefs, server round-trip, `aria-current="page"`.
`tests/unit/pda-s03-keyboard-accessibility.test.ts` asserts exactly that shape:
native `<a>`, real destination, `tabIndex` 0, no `role="tab"`, no
`aria-selected`. **That contract is preserved unchanged.** T3-C2 changes only
the visible label case (`Your Debates` → `Your debates`) and the count chip
copy; it does not convert the links into buttons or into client state. A seat
that "improves" these into a tablist breaks an accessibility invariant that a
prior mission established on purpose.
