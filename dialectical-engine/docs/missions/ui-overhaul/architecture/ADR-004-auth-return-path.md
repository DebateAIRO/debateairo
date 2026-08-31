# ADR-004 — `?next=` return path, with a closed allow-list

**Status:** ACCEPTED (ARCH-01, 2026-08-31) · mission-local, **security-touching**
**Slices affected:** T9 (R5), T3 (OQ-3 `Unlock actions`), T7, T8

## Problem

T9 R5 / V's 2026-08-31 ruling: a logged-out `Start a debate` must reach
sign-in or sign-up and, after successful auth, land on New debate. Today there
is **no return-path mechanism at all**: `apps/ui/components/LoginFlow.tsx`
hard-codes `const HOME_PATH = "/#start-a-debate"` and calls
`window.location.assign(HOME_PATH)`. This is net-new.

## Decision

### The parameter

One query parameter, `next`, carrying a **root-relative path only**.

- Landing CTA: `<Link href="/login?next=%2Fnew">Start a debate</Link>`
- Sign-up link from login carries it forward: `/sign-up?next=…`
- `Unlock actions` (T3): `/login?next=%2Fpublic%2Fdebate%2F<public_ref>` —
  returning the reader to **the same public debate they were reading**, not to
  the owner route. A non-owner who signs in has no owner route to reach, so
  sending them to `/debate/<id>` would produce a 404 or an authorization
  denial. This closes T3 OQ-3.

### The validator — the security half, and the reason this is `risk_tier: high`

`?next=` is an open-redirect primitive. A raw
`window.location.assign(params.get("next"))` accepts `//evil.example`,
`https://evil.example`, and `javascript:` and hands the product a phishing
gadget on the auth path. The validator is therefore not optional polish; it is
the feature.

New module — **Create:** `apps/ui/lib/returnPath.ts`

```ts
/** The only routes a post-auth redirect may land on. */
export const RETURN_PATH_ALLOW_LIST = ["/new", "/", "/settings"] as const;

/** Public debate reads are allowed by shape: /public/debate/<segment>. */
const PUBLIC_DEBATE = /^\/public\/debate\/[A-Za-z0-9._~-]{1,128}$/;

export const DEFAULT_RETURN_PATH = "/#start-a-debate";

/**
 * Returns a safe same-origin path, or DEFAULT_RETURN_PATH.
 * Rejects: absolute URLs, protocol-relative `//host`, `javascript:`,
 * backslash variants, anything not on the allow-list or the public-debate shape.
 */
export function safeReturnPath(raw: string | null | undefined): string;
```

Rules `safeReturnPath` enforces, in order:

1. `raw` is a non-empty string, or return the default.
2. First character is `/` and second character is neither `/` nor `\`, or
   return the default. (Rejects `//evil.example` and `/\evil.example`.)
3. Contains no `\` anywhere, or return the default.
4. Strip any `?`/`#` suffix, then the remaining path is either an exact member
   of `RETURN_PATH_ALLOW_LIST` or matches `PUBLIC_DEBATE`, or return the
   default.

Note the order: an allow-list alone would be enough, but steps 2–3 are kept so
the function fails closed even if a future edit widens the list.

### Wiring

- **Modify** `apps/ui/components/LoginFlow.tsx`: replace the module constant
  `HOME_PATH` with `safeReturnPath(new URLSearchParams(window.location.search).get("next"))`
  read at navigation time inside `navigateHome`. The `onAuthenticated` prop
  stays, so the existing tests that inject their own callback
  (`tests/render/web-auth-login.test.tsx`, `tests/render/auth-flow-integration.test.tsx`)
  keep working untouched.
- **Modify** `apps/ui/components/SignUpFlow.tsx`: its `Already have one? Log in`
  link forwards the current `next` value.
- **Do not** thread `next` through MFA enrolment. Enrolment is a mandatory gate
  (T8 R3): a user mid-enrolment must finish enrolment, and carrying a deep link
  across it would let a `next` value survive an incomplete security ceremony.
  After activation the user lands where enrolment already sends them.

## Refutation

The acceptance that catches a broken return path asserts, on the anonymous
landing, that the `Start a debate` href **contains `/login` or `/sign-up` AND a
`next` parameter whose decoded value is `/new`** — T9-C2-4 already states that a
bare `href="#"` is RED. It **catches**: a CTA wired to `#`, a CTA wired straight
to `/new` (which would bounce off `AuthGate`), a missing parameter. It does
**not** catch: `safeReturnPath` accepting `//evil.example` — that needs its own
unit test over the validator, which is why `T9-C2-5` exists as a separate step
with its own hostile-input table.
