# PLAN — S03 Your Debates / Public Debates navigation

> **For agentic workers:** Architecture seat fills steps. Requirements authored
> skeleton + quantifiability law only.

**Goal:** Selectable Your Debates / Public Debates controls show the correct
lists for logged-in and logged-out visitors.

**Spec:** `docs/missions/public-debate-access/slices/S03/SPEC.md`

**Status:** STEPS AUTHORED by ARCH-01 (Claude, 2026-08-29). No dependency on
S01/S02 — can run in parallel with either (see Single-writer check).

## Quantifiability law (binding on Architecture)

- Every step is markable done / not-done by a stranger with no judgement call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test · file surface.
- SPEC↔PLAN coverage complete; three-run law on cluster verification.
- UNVERIFIED is a valid, respected answer.

## MEASURED ground truth this PLAN rests on (Architecture's own reads)

- `apps/ui/app/page.tsx:80-104` (own read, full file quoted in ARCH-01's
  investigation): the two section headings are `<h2>Your debates</h2>`
  (line 81) and `<h2>Published debates</h2>` (line 98), each followed by a
  `<span className="count">`. Neither is a `<button>`/`<a>`/anything with
  `role`/`aria-*`. Confirms SPEC's ground truth exactly.
- `apps/ui/app/page.tsx` is `export default async function HomePage()`
  with no `searchParams` parameter today (own read, full file). `next/headers`
  `cookies()`/`headers()` are called directly inside it — this is a
  Next.js Server Component, not renderable via `react-dom/client`'s
  `createRoot` in a jsdom test (no DOM-testable render path exists for
  it) — confirmed by `tests/unit/v2ui-pages.test.ts` (own grep, lines
  53-91) using SOURCE-TEXT assertions (`newPage.split("\n").find(line =>
  line.includes(...))`) against `/new`'s page, not a rendered-DOM
  assertion, for exactly this reason — that is the established pattern
  for `apps/ui/app/*/page.tsx`.
- `web/app/page.tsx:8` already takes a `searchParams: Promise<{ limit?:
  string; offset?: string }>` parameter (own read) — the async-`searchParams`
  pattern this PLAN needs for `apps/ui/app/page.tsx` is an EXISTING,
  precedented Next.js pattern in this codebase, not a novel one.
- **Standing test tension resolved (own re-read, corrects an initial
  over-broad assumption — see "what I nearly got wrong" below):**
  `tests/architecture/s8-publication-contract.test.ts:157-167` requires
  `home` (`apps/ui/app/page.tsx`'s full source text) to contain the
  literal substring `"Published debates"` and requires the slice from
  `home.indexOf("published.items.map")` to the next `"</article>"` to
  contain `"may be indexed by search engines"` and `"Copies may persist
  after unpublishing."`. **This PLAN's design satisfies all of that
  WITHOUT editing the test**, because: (a) the retained per-card
  disclosure sentence "Published debates may be indexed by search
  engines. Copies may persist after unpublishing." (unchanged, still
  inside each `<article>`) itself CONTAINS the substring "Published
  debates" — so `toContain("Published debates")` passes even though the
  new tab control's own label is "Public Debates" (a different string);
  (b) the map variable stays named `published` with `.items.map(` written
  literally in `page.tsx`'s own source (not extracted into a separate
  component file); (c) the `<article>` wrapper is unchanged. **No test
  file in this PLAN's file surface needs editing.**

## What I nearly got wrong (kept here so no later session re-derives it)

Before re-reading the standing test's exact assertions, this PLAN's first
draft assumed replacing the `<h2>Published debates</h2>` heading with a
"Public Debates" tab control would break
`tests/architecture/s8-publication-contract.test.ts:159`'s
`toContain("Published debates")` check and require an Architecture-ADR'd
test amendment (the same kind of amendment SPEC S01's acceptance sketch
explicitly authorizes for the forbidden-carrier test). On closer reading,
the check passes for a DIFFERENT reason than the heading — the retained
disclosure sentence already contains that substring. **Lesson for future
sessions: a `.toContain()` assertion checks the WHOLE FILE, not the
specific element you assume it is pinned to — always check what ELSE in
the file could already satisfy it before proposing a test amendment.**

## Architecture decisions (see DECISIONS.md for the formal entries)

1. **Tabs on `/` via a `?tab=yours|public` search param, not a `/public`
   route split.** Zero new route file; both lists are already fetched in
   one page load; individual public debates already deep-link via
   `/public/debate/{id}` (untouched by this decision) which is the part
   of "shareability" that matters most (a specific debate, not merely
   "the list was in public mode"); the tab STATE is also independently
   shareable via the `?tab=` URL, satisfying the packet's "consider
   deep-linking and shareability" instruction without a second page file
   to keep in sync.
2. **Tab control markup:** `role="tablist"` wrapping two `<Link
   role="tab" aria-selected={...}>` elements — anchor tags are natively
   keyboard-operable (satisfies R2's "reachable by... keyboard" with zero
   custom key-handling code), and `aria-selected` exposes the selected
   state (R2's other clause) without a client component or JS state.
   Label text: "Your Debates" / "Public Debates" (Title Case, picking one
   spelling per SPEC R1's explicit latitude).
3. **Default selection (R6):** logged-out → `public`; logged-in →
   `yours`. Matches the SPEC's own suggested seed. An explicit `?tab=`
   value always wins over the default, for both login states.
4. **Composer / sign-in banner placement stays outside the tab body.**
   The existing sign-in-or-compose banner (`page.tsx:53-74`, unconditional
   on `token === null` / `sessionConfirmed`) is untouched and shown
   regardless of which tab is selected — it is not a "list surface" under
   R5's language, so it is not part of what switches. Only the list
   section below it (today's two stacked `<h2>` blocks) becomes the
   single tab-switched region.
5. **Your Debates tab, logged out:** shows no list at all (relies on the
   existing banner above, which already carries the sign-in/create-account
   CTA) rather than inventing new empty-state markup — satisfies R3
   ("shows the existing sign-in / create-account path... rather than
   inventing a global anonymous private list") with zero new markup.

## Clusters

| Cluster | Steps | ONE verification command | File surface |
|---|---|---|---|
| S03-C1 | S03-C1-1..5 (**REWORK ROUND 1, N5, `t_6f28d98d`**: added C1-4/C1-5 for keyboard accessibility) | `node -e "const s=require('fs').readFileSync('apps/ui/app/page.tsx','utf8'); const need=['role=\"tablist\"','role=\"tab\"','aria-selected','Your Debates','Public Debates']; const missing=need.filter(n=>!s.includes(n)); if(missing.length){console.error('MISSING',missing);process.exit(1)} console.log('OK')" && pnpm exec vitest run tests/unit/pda-s03-keyboard-accessibility.test.ts` | `apps/ui/app/page.tsx`, new `tests/unit/pda-s03-keyboard-accessibility.test.ts` |
| S03-C2 | S03-C2-1..2 | `curl -sk 'https://localhost:3000/?tab=yours' \| grep -c "Sign in to start\|Your debate workspace"` (own live probe pattern; worker re-runs against a running dev server, both logged-in and logged-out session states) | `apps/ui/app/page.tsx` |
| S03-C3 | S03-C3-1..3 (**SCOPE-BOUNDARY thread, round 1, Finding 2, `t_5560836d`**: added C3-3, the negative/absence probe S03-CODE's review correctly said was missing) | `curl -sk 'https://localhost:3000/?tab=public' \| grep -c "/public/debate/"` (positive; see S03-C3-3 for the negative counterpart) | `apps/ui/app/page.tsx` |
| S03-C4 | S03-C4-1..2 | `grep -c "logged-out.*Public Debates\|logged-in.*Your Debates" docs/missions/public-debate-access/slices/S03/DECISIONS.md` | `docs/missions/public-debate-access/slices/S03/DECISIONS.md` (documentation only) |

**REWORK ROUND 4 (PLAN-03, blocking, `t_71699495`): every command above RUN,
not just edited.** S03 used `--reporter=basic` twice (in S03-C1's compound
command and S03-C1-4's own acceptance line, both stripped) — own
reproduction of the underlying bug: `npx vitest run
tests/unit/s8-publication.test.ts --reporter=basic` → `Startup Error:
Failed to load custom Reporter from basic`, exit 1. **No S03 command needed
a further fix beyond the flag strip**: every command here is either a
single-file vitest target (no multi-file/`-t` vacuous-pass risk — same
"No test files found, exit 1" behavior confirmed as S01/S02's genuinely-RED
cases), a plain grep/node-script with its own honest exit code, or a live
`curl`. Run 2026-08-29:

| Cluster | Category | Observed pre-fix result |
|---|---|---|
| S03-C1 | FEATURE-ASSERTION | **RED, genuinely:** the `node -e` structural check reports all 5 required markers (`role="tablist"`, `role="tab"`, `aria-selected`, `Your Debates`, `Public Debates`) MISSING, exit 1 — short-circuits before the `&&`'d vitest call. |
| S03-C2 | REGRESSION-BASELINE | **GREEN today, for a baseline reason, not a built-feature reason:** `curl -sk 'https://localhost:3000/?tab=yours' \| grep -c "Sign in to start\|Your debate workspace"` → `1` — today's page ignores the (not-yet-implemented) `?tab=` param entirely and unconditionally shows one of the two banner strings; the count must stay ≥1 once C2-1's gating exists. |
| S03-C3 | REGRESSION-BASELINE | **GREEN today, same reason as S03-C2:** `curl -sk 'https://localhost:3000/?tab=public' \| grep -c "/public/debate/"` → `1` — the published list is shown unconditionally today. |
| S03-C4 | VERIFICATION-ONLY | **GREEN, correctly:** `grep -c "logged-out.*Public Debates\|logged-in.*Your Debates" docs/missions/public-debate-access/slices/S03/DECISIONS.md` → `2` — the default-selection decision is already durably recorded (Architecture decision §3 above). |

**ACCEPTANCE-COMMAND THREAD, ROUND 2 (PLAN-04, blocking, `t_eade6007`):
checked, no fix needed here.** Same reasoning as S02's equivalent note:
S03 has zero `| grep -q` occurrences — its commands are a bare `node -e`
script (`&&`-chained to vitest, not piped through grep), plain `grep -c`/
`grep -n` calls, and live `curl` probes, none of which pipe one process's
output into a second process whose exit status silently replaces the
first's. Re-run 2026-08-29: the `node -e` structural check still reports
all 5 markers MISSING, exit 1 — unaffected by this round's fix.

## SPEC trace — R1 Both controls present

**SPEC:** S03 R1 · **Cluster:** S03-C1

### S03-C1-1 — Add `searchParams` to `HomePage` and compute `tab`

**Cluster:** S03-C1
**File surface:** `apps/ui/app/page.tsx`
**Change:** Change the function signature from `export default async
function HomePage()` to `export default async function HomePage({
searchParams = Promise.resolve({}) }: { searchParams?: Promise<{ tab?:
string }> })`, following the existing async-searchParams pattern already
used in `web/app/page.tsx:8` (own read, cited above). Inside the
function, after computing `token`, add:
```ts
const requestedTab = (await searchParams).tab;
const tab: "yours" | "public" =
  requestedTab === "yours" || requestedTab === "public"
    ? requestedTab
    : token !== null ? "yours" : "public";
```
**Acceptance test:** `pnpm run typecheck` exits 0 (the function signature
change and `searchParams` destructuring are the only new syntax; a type
error here means the Next.js page-props convention was violated).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly.** Run 2026-08-29: `pnpm run typecheck`
exits 0 today (nothing to break yet); must stay 0 once the signature
change lands.
**Failure it CATCHES:** a `tab` value falling through to `undefined`
instead of a real default — the ternary's final `else` branch is exercised
whenever no `?tab=` is supplied, which is the common case, so any typo
here breaks the DEFAULT for every first-time visitor, not just an edge
case.
**Failure it MISSES:** does not catch `token` itself being wrong (that
logic predates this PLAN, at `page.tsx:15`, untouched here).

### S03-C1-2 — Replace the two `<h2>` headings with a `role="tablist"` pair

**Cluster:** S03-C1
**File surface:** `apps/ui/app/page.tsx:80-89` and `:97-104` (the two
`sectionHead` blocks)
**Change:** Replace both `<div className="sectionHead"><h2>...</h2>
<span className="count">...</span></div>` blocks with a single shared
block above the (now-conditional) list body:
```tsx
<div className="sectionHead" role="tablist" aria-label="Debate library">
  <Link
    role="tab"
    aria-selected={tab === "yours"}
    href="/?tab=yours"
    className={tab === "yours" ? "tab tabActive" : "tab"}
  >
    Your Debates
  </Link>
  <Link
    role="tab"
    aria-selected={tab === "public"}
    href="/?tab=public"
    className={tab === "public" ? "tab tabActive" : "tab"}
  >
    Public Debates
  </Link>
  <span className="count">
    {tab === "yours"
      ? (total === null ? `${debates.length} shown` : total > debates.length ? `${debates.length} shown of ${total} total` : `${total} total`)
      : (published.total > published.items.length ? `${published.items.length} shown of ${published.total} total` : `${published.total} total`)}
  </span>
</div>
```
The count `<span>` logic is a straight port of the two existing count
expressions (`page.tsx:82-87` and `:99-103`), unchanged in substance,
merged behind the `tab` conditional rather than duplicated.
**Acceptance test:** `grep -c '<h2>Your debates</h2>\|<h2>Published debates</h2>' apps/ui/app/page.tsx`
returns `0` (both old headings gone) AND `grep -c 'role="tab"'
apps/ui/app/page.tsx` returns `2`.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly.** Run 2026-08-29: first grep → `2`
(both old headings present, wants `0`); second grep (`role="tab"`) →
`0` (wants `2`). Both halves of this two-part check are genuinely RED.
**Failure it CATCHES:** SPEC's Intent ("Replace passive... headings with
selectable... controls") not actually being followed — a plan that adds
new buttons ALONGSIDE the old headings (satisfying R1's letter while
contradicting its Intent) is caught by the first grep returning nonzero.
**Failure it MISSES:** does not catch the controls being present but
UNREACHABLE (e.g. `visibility: hidden` in CSS) — a visual/CSS regression
outside a source-text grep's reach; S03-C1-3's live probe is the closer
check for actual reachability.

### S03-C1-3 — Live probe: both labels present in a real anonymous response

**Cluster:** S03-C1
**File surface:** none (verification-only; confirms C1-1/C1-2 together
produce real HTTP output, not just source text that happens to parse)
**Change:** none.
**Acceptance test:** `curl -sk 'https://localhost:3000/' | grep -c "Your Debates"`
returns `≥1` AND the same command with `"Public Debates"` returns `≥1`,
run against a logged-out session (no cookie jar) three times.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly.** Run 2026-08-29 against the live dev
server: `curl -sk 'https://localhost:3000/' | grep -c "Your Debates"` → `0`;
same command with `"Public Debates"` → `0` — neither label exists in
today's page yet.
**Failure it CATCHES:** a server-rendering error that only manifests at
request time (e.g. a `searchParams` await ordering bug) that source-text
grepping cannot see.
**Failure it MISSES:** does not catch keyboard reachability by SIMULATING
a keypress — see S03-C1-4/S03-C1-5 below (**REWORK ROUND 1, N5,
`t_6f28d98d`**) for what this PLAN now does and does not claim about that.

## SPEC trace — R2 Controls are accessible

**SPEC:** S03 R2 · **Cluster:** S03-C1

**REWORK ROUND 1 (N5, `t_6f28d98d`):** round 0 left keyboard accessibility
"UNVERIFIED-but-low-risk" by assertion, not by test, and V's Done
criterion 1 requires the controls to be "present, **and accessible**" —
not merely present with a plausible-sounding accessibility argument. Split
into what IS mechanically testable (element semantics, which fully
determine keyboard-focusability and Enter-key activation for a native
anchor, per the HTML spec — no JS behavior to test) and what genuinely is
NOT (routed to QA below, not silently dropped).

### S03-C1-4 — Mechanical test: the tab controls are natively focusable elements, not JS-only pseudo-controls

**Cluster:** S03-C1
**File surface:** new `tests/unit/pda-s03-keyboard-accessibility.test.ts`
(source-text based, following the `v2ui-pages.test.ts` convention already
established for this slice, since `page.tsx` is a server component with
no DOM-render path — see this PLAN's "MEASURED ground truth" section)
**Change:** Write a test that reads `apps/ui/app/page.tsx`'s source text
and asserts, for BOTH tab elements: (1) the element is a `<Link` (which
Next.js compiles to a real `<a href>`, per Next's own documented behavior
— not a `<div>`/`<span>` with an `onClick`, which would NOT be
keyboard-focusable without a manually-added `tabIndex={0}` and manual
`onKeyDown` Enter/Space handling); (2) it carries a real, non-empty
`href="/?tab=..."` (an anchor with no `href` is NOT in the native tab
order — this is the single most common way a "looks like a link" element
silently fails keyboard access); (3) neither `tabIndex={-1}` nor
`disabled` appears anywhere on the same element (either would remove it
from the tab order or block activation). This is a STRONGER guarantee
than a simulated keypress would be for this specific case: a native
`<a href>` with none of these three defects is GUARANTEED by the HTML
platform, not by this app's own JS, to be Tab-reachable and
Enter-activatable — there is no app-level keyboard-handling LOGIC here to
regression-test, because S03's design (decision 2, tabs-on-`/` via plain
navigation) deliberately introduces none.
**Acceptance test:** `pnpm exec vitest run tests/unit/pda-s03-keyboard-accessibility.test.ts`
exits 0.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly.** Run 2026-08-29: exit 1, `No test files
found, exiting with code 1` — single-file target, the file does not exist
yet; no vacuous-pass risk (this is the same genuine-RED shape as S01's
single-missing-file steps, not S01's multi-file vacuous-pass defect).
**Failure it CATCHES:** the actual historical failure mode this class of
bug takes — a developer reaching for a `<div role="tab" onClick={...}>`
instead of a real `<Link>` (visually identical, silently NOT
keyboard-operable), or an `href` that's empty/missing because the `tab`
variable was interpolated wrong, or a stray `tabIndex={-1}` copied from
an unrelated pattern elsewhere in the codebase.
**Failure it MISSES:** does not catch a CSS `pointer-events`/`visibility`
rule that hides a technically-focusable element from sighted keyboard
users (focus lands somewhere invisible) — a real gap, honestly left to
QA, not claimed as covered here.

### S03-C1-5 — Route to QA: what this PLAN does not and cannot mechanically verify

**Cluster:** S03-C1 (verification-scope statement, not a code step)
**File surface:** none.
**Change:** none — **this step exists so the boundary is explicit rather
than silently assumed**, per the brief's own either/or instruction.
Three things S03-C1-4's structural test does NOT and cannot prove, named
so QA picks them up rather than nobody: (1) that a real screen reader
announces "Your Debates, tab, 1 of 2, selected" (or equivalent) in a way
that is actually COMPREHENSIBLE, not just technically ARIA-compliant —
`role="tab"` outside a screen-reader-recognized `role="tablist"` container
can announce oddly in some assistive tech, and only a real AT (assistive
technology) session proves the experience is good, not merely present;
(2) that visible focus styling (an outline/ring on `:focus-visible`)
exists and is legible — this PLAN adds no CSS and inherits whatever
`.tab`/`.tabActive` classes resolve to, UNVERIFIED by this seat; (3) that
Tab ORDER relative to the rest of the page (composer, sign-in banner) is
sensible, not just that each element is individually reachable. **None of
these three are product code changes this PLAN is scoped to make — they
are QA verification/UX steps**, and S03-C1-4's structural guarantee is
real but strictly narrower than "accessible" in the full sense V's Done
criterion 1 means. Recorded in DECISIONS.md so a later session does not
read S03-C1-4's PASS as proof of all three.
**Acceptance test:** N/A — this is a scope boundary, not a test.
**Category (SCOPE-BOUNDARY thread, round 1, Finding 1, `t_5560836d`):
SCOPE-BOUNDARY.** Not FEATURE-ASSERTION/REGRESSION-BASELINE/
VERIFICATION-ONLY — those three describe an automated acceptance test
with a pass/fail signal, and this step deliberately has none; its own
`Change: none` and "Acceptance test: N/A" already said this before the
taxonomy existed to name it. New 4th category added to the taxonomy this
round (own reproduction confirmed the gap: `grep -c SCOPE-BOUNDARY`
across all four PLANs returned `0` before this edit) rather than moving
this step's content into DECISIONS.md and deleting the numbered step —
see this slice's DECISIONS.md for why.
**Failure it CATCHES:** a future close-out claiming R2 is "done" on the
strength of S03-C1-4 alone.
**Failure it MISSES:** nothing — it is a boundary statement.

## SPEC trace — R3 Your Debates shows the visitor's own debates

**SPEC:** S03 R3 · **Cluster:** S03-C2

### S03-C2-1 — Gate the "Your debates" list body on `tab === "yours"`

**Cluster:** S03-C2
**File surface:** `apps/ui/app/page.tsx:65-95` (the `sessionConfirmed`
block containing the composer and `DebatesBuffer`)
**Change:** The composer/session-handoff banner (lines 67-78) stays
exactly as-is (decision 4 — unconditional on `sessionConfirmed`, not on
`tab`). The `<div className="recentList"><DebatesBuffer debates={debates}
/></div>` block (lines 91-93) moves under an additional `tab === "yours"`
condition: `{sessionConfirmed && tab === "yours" ? <div
className="recentList"><DebatesBuffer debates={debates} /></div> : null}`.
When `tab === "yours"` and NOT `sessionConfirmed` (logged out), render
nothing new — the existing sign-in banner (lines 53-63, unconditional on
`token === null`) is the "existing sign-in / create-account path" R3
requires, already visible above regardless of tab (decision 5).
**Acceptance test:** `grep -n 'tab === "yours"' apps/ui/app/page.tsx`
returns at least one match wrapping the `DebatesBuffer` mount.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly.** Run 2026-08-29: no match, exit 1 — the
`tab === "yours"` gate does not exist in today's page yet.
**Failure it CATCHES:** the "Your debates" list rendering even when
`tab === "public"` is selected — a violation of R5 ("that mode's list as
the primary library list surface for THAT choice," implying the other
mode's list is not simultaneously shown).
**Failure it MISSES:** does not catch a signed-in user's debate list
containing debates that AREN'T theirs (an authorization bug in
`listDebatesPageServer`, pre-existing and out of this PLAN's scope — S03
only gates visibility by tab, not by data source).

### S03-C2-2 — Live probe: signed-in `tab=yours` shows the workspace banner and list container

**Cluster:** S03-C2
**File surface:** none (verification-only)
**Change:** none.
**Acceptance test:** with a valid session cookie (worker obtains one via
the existing dev-auth seed flow, referenced in
`.hermes/reports/public-debate-access/agent-reports/` prior missions'
patterns if one exists, or by registering a fresh account against the dev
server), `curl -sk --cookie "<cookie>" 'https://localhost:3000/?tab=yours'`
response body contains `"Your debate workspace is ready."` (the existing
banner copy, `page.tsx:70`, unchanged).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
pre-fix result UNVERIFIED by this seat, honestly, not fabricated.** This
command needs a real session cookie, which is a worker-time action out of
Architecture's bounds (this PLAN's own "Failure it MISSES" line below
already says so) — recording a result here would mean either running
product verification (out of contract) or guessing, both forbidden.
UNVERIFIED is the correct, respected answer per `heartbeat-protocol` §2.7,
not a gap to paper over.
**Failure it CATCHES:** the `sessionConfirmed` gate breaking as a side
effect of the `searchParams` signature change (e.g. an await-ordering
bug that makes `token` evaluate before `searchParams` in a way that
throws).
**Failure it MISSES:** UNVERIFIED — obtaining a real session cookie
programmatically for this probe was not itself executed by Architecture
(out of bounds: "you write no product code and run no product tests" —
this is a worker-time verification step, described precisely enough to
run, not run here).

## SPEC trace — R4 Public Debates shows published debates

**SPEC:** S03 R4 · **Cluster:** S03-C3

### S03-C3-1 — Gate the published list body on `tab === "public"`

**Cluster:** S03-C3
**File surface:** `apps/ui/app/page.tsx:97-118` (today's unconditional
published section)
**Change:** Wrap the `<div className="recentList">{published.items...}
</div>` block (lines 106-118) in `{tab === "public" ? (...) : null}`. The
`publishedError` handling (line 105) moves inside the same conditional.
The `published.items.map(...)` call itself, and the `<article
className="debateCard">` wrapper, and the disclosure sentence inside it,
stay byte-identical to today (per the standing-test analysis above — this
is load-bearing, not incidental).
**Acceptance test:** `grep -n 'tab === "public"' apps/ui/app/page.tsx`
returns at least one match wrapping the `published.items.map` block, AND
`grep -c "published.items.map" apps/ui/app/page.tsx` still returns `1`
(unchanged from today — proves the map wasn't extracted to a new file,
preserving the standing test's `home.indexOf("published.items.map")`
slice check).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): mixed — the two halves
of this line have different pre-fix categories, declared separately.**
First grep (`tab === "public"`): **FEATURE-ASSERTION, observed pre-fix
RED** — run 2026-08-29, no match, exit 1 (the gate doesn't exist yet).
Second grep (`published.items.map` count): **REGRESSION-BASELINE, observed
pre-fix GREEN** — run 2026-08-29, returns `1` today already, and must stay
`1` (this half is guarding against a FUTURE extraction, not testing a
not-yet-built feature).
**Failure it CATCHES:** an implementation that "cleans up" by extracting
the published-list JSX into a separate component file — which would be a
reasonable-looking refactor that SILENTLY breaks
`tests/architecture/s8-publication-contract.test.ts:161-166`'s source-text
slice (since that text would no longer exist in `page.tsx` itself). This
step's second grep is specifically pinned against that regression.
**Failure it MISSES:** does not catch the published list rendering
correctly but the LINKS inside pointing to the wrong path — covered
separately by S03-C3-2 below.

### S03-C3-2 — Live probe: logged-out `tab=public` (and default) shows published items with working links

**Cluster:** S03-C3
**File surface:** none (verification-only)
**Change:** none.
**Acceptance test:** `curl -sk 'https://localhost:3000/?tab=public' |
grep -c '/public/debate/'` returns `≥1` (using the one live publication);
`curl -sk 'https://localhost:3000/'` (no `?tab=`, logged-out, exercising
the DEFAULT per decision 3) also returns `≥1` for the same grep — proving
the default-to-public behavior for a logged-out visitor without an
explicit query param.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN, correctly, for both halves.** Run 2026-08-29:
`curl -sk 'https://localhost:3000/?tab=public' | grep -c '/public/debate/'`
→ `1`; `curl -sk 'https://localhost:3000/'` (no `?tab=`) with the same
grep → `1`. Both GREEN today because the list is shown unconditionally
before the gating/default logic exists — must stay ≥1 once S03-C1-1's
default and S03-C3-1's gate are both implemented.
**Failure it CATCHES:** the default-selection logic (S03-C1-1) computing
the wrong default for a logged-out visitor — this is the single most
visible regression a first-time anonymous visitor could hit (an empty
page with no visible list), and it is caught by the SAME probe used for
R7 below.
**Failure it MISSES:** does not catch the underlying `/v1/public/debates`
API itself failing (a different layer — S01/existing coverage, not S03's).

### S03-C3-3 — SCOPE-BOUNDARY thread, round 1 (Finding 2, `t_5560836d`): live NEGATIVE probe — the other tab's list content is ABSENT, not merely that the requested one is present

**The S03-CODE seat's own words, quoted so the gap is named precisely:**
*"a positive probe that public debates are visible cannot prove tab
mutual exclusion — it already passes when both lists are always
stacked."* Correct, and this PLAN had exactly that gap: S03-C1-3,
S03-C2-1/2, and S03-C3-1/2 all assert PRESENCE of the requested tab's
content; none asserts ABSENCE of the other tab's content. A page that
renders both lists unconditionally, with no tab logic at all, would pass
every one of those steps. The R5 section below (previous text) argued
this was already covered "by construction" — that argument is about the
SOURCE CODE's logic (two different string-literal comparisons on one
variable cannot both be true), which is real but is not something a
black-box acceptance test can observe; a worker could implement the gates
wrong in a way that still satisfies every existing grep (e.g. drop the
`: null` on one branch, or render one list outside either conditional)
and no step in this PLAN would catch it. This step closes that gap with
an actual live probe, not a restated argument.

**Cluster:** S03-C3
**File surface:** none (verification-only)
**Change:** none.
**Two directions, only one testable without a session — both stated,
neither silently dropped, per this round's brief ("Either is acceptable;
silence is not"):**

1. **Logged-out, `?tab=yours` → "Published debates" content must be
   ABSENT.** Testable now, no session needed, since the default/gate logic
   under test doesn't depend on `sessionConfirmed`. **Own reproduction,
   run 2026-08-29, before any fix:** `curl -sk
   'https://localhost:3000/?tab=yours' | grep -c '/public/debate/'` → `1`
   — the published list is still shown unconditionally today, so this is
   a genuine pre-fix RED for the negative assertion (it should be `0`
   once S03-C3-1's gate exists). Confirmed the marker itself is clean —
   `href="/public/debate/` is the only place `/public/debate/` appears in
   the response, own read of `apps/ui/app/page.tsx`'s current published-list
   JSX.
2. **Logged-in, `?tab=public` → "Your debates" content must be ABSENT.**
   NOT testable by Architecture for the same reason S03-C2-2's positive
   probe isn't: it requires a real signed-in session cookie, a worker-time
   action out of Architecture's bounds ("you write no product code and run
   no product tests"). UNVERIFIED here, honestly, not silently dropped —
   the exact command a worker/QA runs: `curl -sk --cookie "<cookie>"
   'https://localhost:3000/?tab=public' | grep -c 'href="/debate/'`
   must return `0` (own confirmed marker: `DebatesBuffer.tsx`'s `Link`
   elements render `href="/debate/{id}"` — literally `href="/debate/`,
   never matching `href="/public/debate/` since that path has `/public`
   immediately after the opening quote; own live check, logged-out
   baseline, confirms this exact substring appears 0 times outside a
   signed-in "Your debates" render).
**Acceptance test:** direction 1 — `curl -sk
'https://localhost:3000/?tab=yours' | grep -c '/public/debate/'` returns
`0`. Direction 2 — UNVERIFIED by Architecture; worker/QA runs the command
above and records the result.
**Category (SCOPE-BOUNDARY thread, round 1, `t_5560836d`): direction 1 is
FEATURE-ASSERTION, observed pre-fix RED (`1`, must become `0`); direction
2 is UNVERIFIED by Architecture's own bounds, same class as S03-C2-2.**
**Failure it CATCHES:** direction 1 — a "tabs" implementation that is
cosmetic only (labels change, both lists still always render) — exactly
the gap the S03-CODE seat named, now mechanically checkable for the
logged-out case. Direction 2, once a worker runs it — the same defect for
the signed-in case, which direction 1 structurally cannot reach (a
logged-out probe can never observe "Your debates" content at all, gated
or not, since `sessionConfirmed` alone already hides it).
**Failure it MISSES:** direction 2's actual pre-fix/post-fix result,
until a worker with a real session runs it — flagged, not hidden.

## SPEC trace — R5 Selection is mutual for the two list modes

**SPEC:** S03 R5 · **Cluster:** S03-C1 / S03-C3 · **Steps:** S03-C1-2's
single shared `role="tablist"` block (both controls always visible, only
the BODY switches) plus S03-C2-1/S03-C3-1's mutually-exclusive body gates
(`tab === "yours"` vs `tab === "public"`, never both true) argue R5 by
construction at the SOURCE level; **S03-C3-3 above is the step that
actually pins it at the OBSERVABLE level (SCOPE-BOUNDARY thread, round 1,
Finding 2, `t_5560836d`) — this section previously claimed the source-level
argument alone was "no additional step needed," which was true of the
CODE'S LOGIC but not of what this PLAN could mechanically verify; corrected
here, not left standing next to a step that contradicts it.**

## SPEC trace — R6 Default selection is defined and documented

**SPEC:** S03 R6 · **Cluster:** S03-C4
**Decision prerequisite:** recorded in DECISIONS.md (Architecture decision
§3 above) before S03-C1-1 is implemented.

### S03-C4-1 — DECISIONS.md entry exists and matches the implemented ternary

**Cluster:** S03-C4
**File surface:** `docs/missions/public-debate-access/slices/S03/DECISIONS.md`
**Change:** none beyond this PLAN's own DECISIONS APPENDED entries (see
ARCH-01's ticket comment).
**Acceptance test:** `grep -c "logged-out.*Public Debates\|logged-in.*Your Debates"
docs/missions/public-debate-access/slices/S03/DECISIONS.md` returns `≥1`.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): VERIFICATION-ONLY —
observed pre-fix GREEN, correctly (same result as the cluster command;
see Clusters section, S03-C4).** Run 2026-08-29: returns `2`.
**Failure it CATCHES:** a worker implementing a DIFFERENT default (e.g.
always defaulting to "yours") without updating DECISIONS.md — this grep
would still pass (the OLD entry stays, undetected drift) unless the
worker also runs S03-C4-2 below.
**Failure it MISSES:** does not catch the DOCUMENTED default and the
IMPLEMENTED default silently diverging — see S03-C4-2 for that check.

### S03-C4-2 — Cross-check: documented default matches the ternary's literal branches

**Cluster:** S03-C4
**File surface:** `apps/ui/app/page.tsx` (S03-C1-1's ternary) cross-checked
against `docs/missions/public-debate-access/slices/S03/DECISIONS.md`
**Change:** none (verification-only).
**Acceptance test:** worker manually confirms (stranger-checkable, no
tooling needed — read both files side by side) that the ternary's
`token !== null ? "yours" : "public"` branch order matches the
DECISIONS.md sentence "logged-out → Public Debates; logged-in → Your
Debates" — same mapping, either direction of statement.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): VERIFICATION-ONLY, not
mechanically runnable (no shell command exists for a cross-document
consistency read) — performed the manual check myself rather than leave
it undone.** DECISIONS.md line 9 (`t_9322ae7b`'s neighbor, own re-read
2026-08-29): "Logged-out → Public Debates; logged-in → Your Debates."
S03-C1-1's own ternary text above: `token !== null ? "yours" : "public"`
— `token !== null` means logged-in, mapping to `"yours"`; the `else`
branch (logged-out) maps to `"public"`. Same direction, consistent —
**GREEN today**, checking this PLAN document's own internal consistency
(the ternary is not yet real code, so this is not yet a claim about the
implementation, only about this document not contradicting itself before
a worker codes it).
**Failure it CATCHES:** the single highest-cost defect class for this
slice — a default that's documented one way and coded the opposite way,
which would pass every other test in this PLAN (none of them assert the
DEFAULT case's DIRECTION independent of an explicit `?tab=` override)
while shipping backwards behavior to every real first-time visitor.
**Failure it MISSES:** nothing beyond its own scope — this is a
belt-and-suspenders step precisely because S03-C3-2's live probe already
covers the logged-out default; there is currently no equivalent
logged-in-default live probe in this PLAN (would need a live session
cookie, same UNVERIFIED gap as S03-C2-2) — flagged, not silently assumed.

## SPEC trace — R7 Public list remains visible without login

**SPEC:** S03 R7 · **Cluster:** S03-C3 · **Steps:** S03-C3-2's live probe
(no explicit `?tab=`, no cookie) is the direct proof — a logged-out
visitor reaching the published list with zero query-string knowledge,
matching R7's exact wording ("without creating an account"). No
additional step.

## Boundaries / ADRs

- **No ADR filed for S03.** The `?tab=` search-param pattern is
  mission-local UI structure, not a new dependency/protocol.
- Tabs-on-`/` vs `/public` route: decision 1 above.
- Label capitalization: decision 2 above ("Your Debates" / "Public
  Debates", Title Case).
- **`web/` twin: S03 does not touch `web/` at all.** `web/`'s SPEC ground
  truth never mentions it; the standing test's loop over
  `[applicationHome, webHome]` checks substrings unaffected by this
  PLAN's `apps/ui`-only edits (see "MEASURED ground truth" above) — `web/`
  keeps its plain `<h2>Published debates</h2>` heading, untouched,
  continuing to pass the same test it passes today.

## Single-writer check

S03 touches exactly one file with logic changes:
`apps/ui/app/page.tsx`. **Verified (own read of both other PLANs, written
by this same seat) that S01 never touches this path (S01 is
`packages/contract/**` + `apps/api/**`) and S02 never touches this path
(S02 touches `apps/ui/app/public/debate/[id]/**`, `apps/ui/components/**`,
`apps/ui/lib/v3/adapter.ts` — all disjoint from `apps/ui/app/page.tsx`).**
S04 touches only `tests/architecture/s8-publication-contract.test.ts`
(lines 120-138, disjoint from this test file's 140-175 block, which S03's
design explicitly avoids needing to touch — see standing-test analysis
above) plus a new QA verdict file. **S03 has no file-surface collision
with any other slice and no hard dependency on S01 or S02 — it can be
implemented and merged independently, in parallel.**
