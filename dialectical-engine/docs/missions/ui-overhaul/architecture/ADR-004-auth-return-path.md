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
- **Both auth cross-links forward it**, because the round trip has two legs:
  `LoginFlow`'s `Create one` → `/sign-up?next=…`, and `SignUpFlow`'s
  `Already have one? Log in` → `/login?next=…`. See the AM9 note under §Wiring:
  each section of this ADR originally named one leg and omitted the other's.
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

/** Public debate reads are allowed by shape: /public/debate/<public_ref>.
 *  public_ref is a UUID (packages/contract: `public_ref: z.uuid()`). */
const PUBLIC_DEBATE =
  /^\/public\/debate\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
  link forwards the current `next` value. **Shipped** at `SignUpFlow.tsx:18-22,68`.
- **Modify** `apps/ui/components/LoginFlow.tsx`: its `No account yet? Create one`
  link forwards the current `next` value the same way. **NOT shipped** —
  `LoginFlow.tsx:115` still renders `<Link href="/sign-up">Create one</Link>`.
  Cell `T9-C2-6` below carries the fix.

> **RECONCILED 2026-09-01 (AM9/charge 2, from N4 on `t_3c187757`).** §Decision
> and §Wiring appeared to contradict each other; they did not — **they named two
> different links and each omitted the other's.** §Decision named the
> login→sign-up leg; §Wiring named the sign-up→login leg. Every downstream
> artifact copied §Wiring, so the leg §Decision named was never carried into a
> cell and never built. The packet's charge was to make *one half normative*;
> that framing does not fit the measurement, because dropping either half leaves
> the round trip lossy in one direction. **Both halves are normative.** Measured
> loss with only the shipped half:
>
> ```
> /login?next=%2Fnew  ->  "Create one"  ->  /sign-up        (next DROPPED, LoginFlow.tsx:115)
>                     ->  "Already have one? Log in"  ->  /login   (nothing left to forward)
>                     ->  after auth: safeReturnPath(null) = "/#start-a-debate", not "/new"
> ```
>
> So SPEC T9 R5's sign-up branch silently loses the return path. This is contract
> propagation, not a worker defect: no cell ever named the clause.
>
> **The MFA boundary is unchanged and still holds.** Forwarding `next` across the
> two auth cross-links is *not* threading it through enrolment. The bullet below
> stands verbatim: `next` does not cross MFA enrolment (T8 R3), because
> enrolment is a mandatory gate and a deep link must not survive an incomplete
> security ceremony. The two cross-links live strictly *before* that gate.
>
> **One property worth stating rather than assuming:** `SignUpFlow` forwards the
> raw `next` re-encoded, without validating it. That is correct and deliberate —
> the value is only ever placed into a link, never navigated to; `safeReturnPath`
> validates at navigation time inside `LoginFlow`. The forwarding legs are
> transport, the validator is the gate, and `T9-C2-6` must not add a second
> validation site.
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

---

## Changelog

### 2026-09-01 — AM9/charge 3: the declared kind admitted `.` and `..` (trigger: T9-C2 review, `t_3c187757` verdict 03:41, N6)

**RULING: TIGHTEN.** The kind was `[A-Za-z0-9._~-]{1,128}`, which accepts `.` and
`..` as public refs. The reviewer measured both accepted, and per the
declared-kind law a survivor matching the declared kind is not a worker finding —
it is mine to rule on, and a worker must not "fix" it unratified.

**Why tighten rather than ratify.** Not on security grounds — both survivors are
same-origin and the reviewer is right that this is not an escape. On grounds of
the clause's own stated purpose, four lines above it: *"returning the reader to
**the same public debate they were reading**"*. A ref of `.` or `..` lands the
reader on a route that is not a debate at all:

```
/public/debate/..   ->  /public/
/public/debate/.    ->  /public/debate/
```

A validator that accepts values which defeat the clause's purpose is not
implementing the clause. And `..` is the classic traversal shape: harmless in
*this* consumer, and exactly the thing that becomes a real finding the first time
someone composes the validator with a different one.

**Why the UUID shape specifically.** The old kind was not derived from anything —
I invented a permissive character class. The value space is measured:
`packages/contract/src/index.ts:249,253,466` declare `public_ref: z.uuid()`. The
new kind accepts the values that exist rather than a superset chosen for
convenience.

**Run before publishing** (`OLD` = the shipped kind, `NEW` = the one above):

```
case                           input                                                OLD      NEW
real public_ref (z.uuid())     /public/debate/3f2a1b4c-9d8e-4f70-b1c2-5a6d7e8f9012  ACCEPT   ACCEPT
same, uppercase                /public/debate/3F2A1B4C-…-5A6D7E8F9012               ACCEPT   ACCEPT
N6 case: dot-dot               /public/debate/..                                    ACCEPT   reject
N6 case: single dot            /public/debate/.                                     ACCEPT   reject
triple dot                     /public/debate/...                                   ACCEPT   reject
tilde ref                      /public/debate/~                                     ACCEPT   reject
slug-shaped ref                /public/debate/cobalt-falcon-0fa351                  ACCEPT   reject
empty segment                  /public/debate/                                      reject   reject
nested segment                 /public/debate/a/b                                   reject   reject
128 dots                       /public/debate/……(128)                               ACCEPT   reject
```

Narrowing an accept-list can only reduce what is accepted, so this cannot
introduce an escape; the reviewer's 29,992-input fuzz result survives the change
by construction.

**The cost, stated because it is a real coupling.** This ties ADR-004 to the
contract's current ref type. If `public_ref` ever becomes a slug — the
`cobalt-falcon-0fa351` row above is exactly that case — the return path breaks
**fail-closed and visibly**: readers land on `DEFAULT_RETURN_PATH` instead of
their debate, and `T9-C2-7`'s accept-case goes RED, which is the signal to
revisit this line. That trade is taken deliberately: a visible break beats a
silent superset.

### The kind is a strict SUPERSET of the schema — named, and why that is the safe direction (AM11/N10)

The kind above is a hex-and-hyphens grammar. `z.uuid()` additionally enforces
RFC-4122/9562 version and variant nibbles. So the two do not coincide, and the
relation was undocumented until now. Measured with the repo's own `zod` (4.4.3):

```
case                         value                                    AM9 kind regex   z.uuid()
published T9-C2-7 fixture    3f2a1b4c-9d8e-4f70-b1c2-5a6d7e8f9012     ACCEPT           ACCEPT
same, uppercase              3F2A1B4C-9D8E-4F70-B1C2-5A6D7E8F9012     ACCEPT           ACCEPT
nil UUID                     00000000-0000-0000-0000-000000000000     ACCEPT           ACCEPT
max UUID                     ffffffff-ffff-ffff-ffff-ffffffffffff     ACCEPT           ACCEPT
v7                           018f3a2b-1c4d-7e8f-9a0b-1c2d3e4f5a6b     ACCEPT           ACCEPT
bad version nibble (v0)      3f2a1b4c-9d8e-0f70-b1c2-5a6d7e8f9012     ACCEPT           reject
bad version nibble (vF)      3f2a1b4c-9d8e-ff70-b1c2-5a6d7e8f9012     ACCEPT           reject
bad variant nibble (c)       3f2a1b4c-9d8e-4f70-c1c2-5a6d7e8f9012     ACCEPT           reject

kind accepts something z.uuid() rejects (strict superset)?  true
z.uuid() accepts something the kind rejects?                false
```

**The second line is the one that matters.** The superset runs in the harmless
direction: **every schema-valid ref passes the kind**, so the validator can never
reject a real public debate. The reviewer's fuzz found the same thing from the
other side — 2,266 contract-valid refs, 0 rejected.

**Why this is fail-closed today.** Refs are not attacker-chosen; they are issued
by the product and are schema-valid at issue time. A string that satisfies the
kind but not `z.uuid()` therefore corresponds to no debate: the return path
sends the reader to `/public/debate/<that ref>`, which does not resolve, so the
outcome is a dead read on a same-origin route — not an escape, not a redirect
off-origin, and not a leak. The narrow grammar's job is to keep the return path
inside the public-debate route; the schema's job is to say which refs exist.

**Tightening the regex to full RFC-4122 is NOT charged, deliberately.** Three
reasons, in order:

1. **It would buy nothing that fails closed today.** The only inputs it newly
   rejects are refs that already resolve to nothing.
2. **It would re-couple the ADR to a moving target.** `z.uuid()`'s own accept
   set has changed across zod majors — 4.4.3 admits nil and max UUIDs, which
   earlier RFC-4122-strict readings did not. A hand-written RFC-4122 regex here
   would drift against the library silently, in the direction that **rejects
   real refs**, which is the one direction that breaks users.
3. **The divergence already has an alarm.** `T9-C2-7`'s schema-agreement row
   (AM11/N9) asserts the accepted fixture against the contract's **own** field
   schema, so a change to `public_ref` goes RED there rather than being absorbed
   silently here.

If the ref format ever stops being a UUID, the signal is `T9-C2-7` going RED —
both its accept-case and its schema-agreement row — and that is the moment to
revisit this grammar, not before.

> **DETECTION RULE CORRECTED 2026-09-01 (AM12b/item 8, from `t_db63b519`).** The
> sentence above, and AM9's changelog, described the alarm as catching
> *"public_ref ever stops being a UUID"*, and a later handoff narrowed that to
> *"narrowing drift only"*. **Both readings are wrong, in both directions.** The
> reviewer verified the true rule across seven simulated drifts:
>
> > **`T9-C2-7` goes RED if and only if the drifted schema REJECTS the fixture.**
>
> That is neither "narrowing" nor "widening". A fixture-preserving *narrowing*
> (a strict UUID subset that still admits the fixture) stays **GREEN** and is
> missed; a *format switch* — `uuid → ULID`, `uuid → number` — goes **RED** and
> is caught, and the format switch contains the likeliest real migration.
>
> **Why the missed class is acceptable rather than a hole (AM12b/item 6,
> `t_d20dcdb4`).** The alarm cannot see a *widening* — `z.uuid() → z.string()`,
> after which slugs become issuable and the kind starts rejecting real refs. The
> residual is named rather than papered over, and it is not charged a standing
> generative alarm, for a measured reason: every schema that still admits the
> fixture and is reachable by narrowing yields a **UUID subset**, and
> `safeReturnPath` accepts every UUID — so **the missed class provably cannot
> refuse a real ref**. The widening class *can*, but it requires an edit to the
> contract that a reviewer reads, in a package with its own review lane, and
> `REV2`'s 2,266-ref generative sweep is the check that belongs at that moment,
> not on every `t9-return-path` run. **Declared covered-by-review, with the
> trigger named:** any edit to `public_ref`'s schema re-runs the generative
> sweep. A standing generative row here would pay a per-run cost forever to
> watch a file this suite does not own.

**Supersedes** `slices/T9/PLAN.md:116`, which quotes the old regex verbatim. PLAN
stays frozen; the dispatch row carries the correction (AM7/AM8 practice).
