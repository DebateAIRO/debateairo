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
2. **Tab control markup (REV-05, B2, round 1, `t_57891ca5`/`t_a9d1deeb` —
   REVERSED, was `role="tablist"`/`role="tab"`/`aria-selected`):** plain
   `<Link>` navigation elements, no ARIA tab role at all.
   `aria-current={tab === "yours" ? "page" : undefined}` (and the mirror
   for `"public"`) exposes the selected state instead of `aria-selected`.
   **Why the reversal:** the original choice took the ARIA tab role's
   CONTRACT — which promises a screen-reader user arrow-key navigation
   between an in-page panel set, a single Tab-stop for the whole group,
   and `aria-controls` linking each tab to its panel — while deliberately
   declining the role's BEHAVIOR, on the argued grounds that anchors are
   natively keyboard-reachable "without custom key-handling code." That
   argument defends generic Tab-key reachability, not the tab widget's own
   behavioral promise, and is exactly the failure [Using ARIA Rule
   1](https://www.w3.org/TR/using-aria/#rule1) names — *"No ARIA is better
   than Bad ARIA"* — measured against the [WAI-ARIA APG Tabs
   pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), which requires
   tabpanels, `aria-controls`, and arrow-key roving tabindex, none of which
   this markup had or should have. No citation was found that defends
   `role="tab"` without the pattern's behavior — Option 3 (defend as-is) is
   ruled out for lack of one, not chosen and rebutted.
   **Why the real tab pattern (tabpanels/`aria-controls`/roving tabindex)
   is also rejected, not just the naked role:** decision 1's own rationale
   for putting tab state in `?tab=` is that these are genuine
   navigations — separate, shareable, deep-linkable URLs that cause a real
   page load, not a client-side panel switch. That is the opposite of the
   tab pattern's model (one view, in-page panels, one logical widget).
   Building tabpanels and roving-tabindex management over two full-page
   navigations would be a false pattern-match — correct-looking ARIA
   describing behavior the page does not and, per decision 1, should not
   have — and would additionally require converting a server component to
   a client component to own the roving-tabindex state, undoing decision
   1's "zero client component" rationale for no SPEC-mandated benefit.
   `aria-current="page"` is the W3C-standard mechanism for "this link
   represents the current item in a set of navigation links" — real
   navigation semantics, not borrowed widget semantics — and satisfies
   SPEC R2's explicit "`aria-pressed`, `aria-selected`, **or equivalent tab
   semantics**" latitude without a new SPEC version.
   Label text: "Your Debates" / "Public Debates" (Title Case, picking one
   spelling per SPEC R1's explicit latitude) — unchanged by this reversal.
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
5. **Your Debates tab, logged out (REV-05, N1, round 1, `t_57891ca5`/
   `t_a9d1deeb` — REVISED, was "shows no list at all, relies on the
   existing banner above"):** the original text is now the failure mode,
   not the answer. The existing sign-in banner (`page.tsx:53-63`) is
   unconditional on `token === null` and sits ABOVE the tab body,
   unchanged regardless of which tab is selected — decision 4 explicitly
   excludes it from being "a list surface" and "part of what switches."
   That exclusion is correct for decision 4's own purpose (deciding what
   does NOT re-render per tab), but this decision then reused that same
   excluded element as if it were the Your-Debates tab's own answer to
   SPEC R3 ("the Your Debates **surface** shows the existing sign-in /
   create-account path") — an element decision 4 declares is not part of
   any tab's surface cannot also be decision 5's proof that the
   Your-Debates surface satisfies R3. Measured against V's Done criterion 2
   in its own words, *"clicking either will show the user their debates/the
   public debates"*: an anonymous visitor who clicks "Your Debates" gets a
   click that visibly changes nothing — the banner was already on screen,
   unconditional, before the click. REV-05 finding N1 caught this directly.
   **This is a HOW defect, not a SCOPE question for V.** SPEC R3 already
   settles WHAT an anonymous visitor is entitled to see under Your
   Debates — explicitly "the existing sign-in / create-account path (or
   equivalent) rather than... a global anonymous private list" — so
   raising that as a V DECISIONS row would re-litigate an already-settled
   SPEC clause (`heartbeat-architecture` §1: "settled choices are
   settled"). What was not settled, and was simply under-executed, is
   whether the Your-Debates tab's OWN content area has to visibly say so.
   **Fix: S03-C2-3 below** adds one line of in-panel text inside that
   tab's own body when logged out, satisfying the SPEC acceptance sketch's
   explicit alternative "(or empty+CTA)" literally — empty of a list, with
   a CTA now living inside the panel that switched, not merely inherited
   from an element decision 4 already excluded from switching.

## Clusters

| Cluster | Steps | ONE verification command | File surface |
|---|---|---|---|
| S03-C1 | S03-C1-1..5 (**REWORK ROUND 1, N5, `t_6f28d98d`**: added C1-4/C1-5 for keyboard accessibility) | `node -e "const s=require('fs').readFileSync('apps/ui/app/page.tsx','utf8'); const need=['aria-current','Your Debates','Public Debates']; const forbidden=['role=\"tablist\"','role=\"tab\"','aria-selected']; const missing=need.filter(n=>!s.includes(n)); const present=forbidden.filter(n=>s.includes(n)); if(missing.length||present.length){console.error('MISSING',missing,'FORBIDDEN-PRESENT',present);process.exit(1)} console.log('OK')" && pnpm exec vitest run tests/unit/pda-s03-keyboard-accessibility.test.ts` (**RATIFIED, item 3, `t_7539734e`: S03-CODE's Row 7 in-place correction of the escaped `\|\|`, which this same seat's CLASS-FIX round had already identified as broken and deliberately left untouched pending exactly this — verified independently: extracted and run against both an empty string and the coding seat's finished worktree, no syntax error, correct OK/exit-0 result. REV-05, B2, round 1, `t_57891ca5`/`t_a9d1deeb` — command REVISED**: `need` swapped from the old ARIA-tab markers to `aria-current`; a new `forbidden` arm fails the check if `role="tablist"`/`role="tab"`/`aria-selected` are still present, so a fix that adds `aria-current` alongside the old markup instead of replacing it does not pass — see the note below the table) | `apps/ui/app/page.tsx`, `tests/unit/pda-s03-keyboard-accessibility.test.ts` |
| S03-C2 | S03-C2-1..3 (**REV-05, N1, round 1, `t_57891ca5`/`t_a9d1deeb`**: added C2-3, the in-panel logged-out CTA) | **run block `S03-C2-live` below** (own live probe pattern; worker re-runs against a running dev server, both logged-in and logged-out session states) — **CLASS-FIX ROUND 1 (`t_7539734e`): moved out of this table cell, see the note below the table** | `apps/ui/app/page.tsx` |
| S03-C3 | S03-C3-1..3 (**SCOPE-BOUNDARY thread, round 1, Finding 2, `t_5560836d`**: added C3-3, the negative/absence probe S03-CODE's review correctly said was missing) | **run block `S03-C3-live` below** (positive; see S03-C3-3 for the negative counterpart) — **CLASS-FIX ROUND 1 (`t_7539734e`): moved out of this table cell, see the note below the table** | `apps/ui/app/page.tsx` |
| S03-C4 | S03-C4-1..2 | `grep -c "logged-out.*Public Debates\|logged-in.*Your Debates" docs/missions/public-debate-access/slices/S03/DECISIONS.md` | `docs/missions/public-debate-access/slices/S03/DECISIONS.md` (documentation only) |

```sh
# S03-C2-live (own live probe pattern; worker re-runs against a running dev server,
# both logged-in and logged-out session states). The shell pipe between curl and
# grep is REAL (fenced blocks need no markdown escaping); the `\|` INSIDE the grep
# pattern stays escaped on purpose — that one is grep BRE alternation syntax, not a
# markdown artifact, and removing it changes the match from "any of three strings"
# to "this one literal string containing pipe characters" (own re-verification
# below caught exactly this when a first draft of this block wrongly unescaped it).
curl -sk 'https://localhost:3000/?tab=yours' | grep -c "Sign in to start\|Your debate workspace\|tabEmptyHint"

# S03-C3-live (positive; see S03-C3-3 for the negative counterpart) — single
# pattern, no internal alternation, nothing to escape either way.
curl -sk 'https://localhost:3000/?tab=public' | grep -c "/public/debate/"
```

**CLASS-FIX, ROUND 1 (`t_7539734e`): the fifth variant came back, in my own
REV-05/B2 fix, and the round-4 "class fix" (cap waived by V, Row 6) did
NOT close the class — it closed three instances.** What happened: REV-05's
B2 fix added the S03-C1 cluster command's first compound condition,
written `if(missing.length\|\|present.length)` — a **markdown-escaped
pipe inside a raw JavaScript operator**, sitting in a table cell. Run
literally (extracted, not read): `node` throws `Expression expected`
before evaluating anything. Both the broken and correct forms exit `1`
today (one from the syntax error, one because `aria-current` genuinely
isn't in the code yet) — indistinguishable now, but `S03-C1` is a
FEATURE-ASSERTION that must go GREEN once B2 lands, and the escaped form
never can, because a syntax error does not depend on the state of the
code. That specific instance was left for the coding seat to correct in
place (Row 7 authority, provisional on ratification) and was **not
touched by that round** — `.worktrees/s03-code` was not read or written
then. **RATIFIED this round (item 3, `t_7539734e`, FOUR-ITEMS bundle):**
the seat's in-place correction (`\|\|` → `||`, nothing else changed on
that line) is now applied to the cell above — verified independently by
extracting and running it against the coding seat's finished worktree
(no syntax error, `OK`, exit 0) before ratifying, not accepted on the
ticket's word.

**Why round 4's fix didn't hold, concretely.** Round 4 found three sites
with this shape (S01-C1/C2/C3's `vitest -t` presence arms) and extracted
all three into labeled fenced blocks, closing those instances. But the
FIX removed occurrences, not the **generating condition**: a markdown
table cell cannot carry a raw `|` at all, so ANY command written directly
into a table cell that needs a literal pipe character — for ANY reason,
in ANY language — must be escaped to survive the table, and that escape
is silently wrong or fatal depending on what actually reads the raw
source text. Round 4 checked the ONE known variant (`vitest -t`'s JS
regex, where `\|` parses fine but means "escaped literal pipe," a silent
wrong-match) and confirmed S02/S03/S04 had no occurrence of THAT variant.
It did not ask the more general question: does this file have ANY table
cell containing a raw pipe, regardless of what interprets it? It did not,
and this round's own sweep (below) found the general case still live —
in S03, in a table cell one row below the one just "closed," and in S01,
in a table cell in the exact same table three rows just fixed.
**A fix that only removes existing occurrences of a known shape is not a
class fix; a class fix removes the condition that generates the shape.**

**What actually closes the class: stop putting executable commands in
table cells, full stop — not "unless the pipe happens to be
alternation-safe."** The two `curl | grep` commands above (S03-C2,
S03-C3) are moved into the `S03-C2-live`/`S03-C3-live` fenced blocks
just added, with real unescaped pipes, exactly as S01 already did for
its three `vitest -t` presence arms. The table cells now hold a label,
never executable text. **`S03-C1` is deliberately left as the one
exception this round** (coding-seat-owned edit in progress) — flagged
here as a known follow-up: once that pipe correction is ratified, S03-C1
should ALSO move into a labeled fenced block, or the table will carry
exactly one bare command again and the class will have one surviving
foothold.

**Why this is a stronger rule than "escape correctly": the escape is
invisible in rendered markdown.** A stranger reading the rendered PLAN.md
sees a clean `||` or a clean `| grep` — GitHub, most editors, and any
markdown viewer render `\|` as a single `|` character, indistinguishable
from an unescaped one at a glance. The defect is only visible by reading
the RAW source bytes or by extracting and running the command — which is
exactly why this survived a full round of review, a peer-review diamond,
and this seat's own "run every command" sweep in round 4 (that sweep ran
the commands that existed then; it could not have run a command not yet
written). No amount of "read the PLAN more carefully" fixes this — the
document format itself hides the defect from a reader. Removing table
cells as a place executable text can live removes the hiding place, not
just this round's instances of it.

**Sweep, this round — confirmed by EXTRACTING and RUNNING every command
matching this shape in all four PLANs, not by reading:**

| Site | Shape | Extracted, run literally | Verdict |
|---|---|---|---|
| S03-C1 (line 173 pre-fix) | `\|\|` inside `node -e` | `node` throws `SyntaxError: Expression expected` | **BROKEN** — was the coding seat's fix in progress at the time; **RATIFIED this round (item 3, `t_7539734e`)** — see the corrected cell above and the ratification note below the class-fix section |
| S03-C2 (line 174 pre-fix) | `curl ... \| grep ...` | full HTML body dumped to stdout, grep never runs, `-c` count never produced | **BROKEN** — fixed this round (`S03-C2-live` block) |
| S03-C3 (line 175 pre-fix) | `curl ... \| grep ...` | same failure as S03-C2 | **BROKEN** — fixed this round (`S03-C3-live` block) |
| S03-C2/C3 category-note rows (below) | same `curl ... \| grep ...`, quoted a second time as illustrative evidence | same failure | **BROKEN** — fixed this round, repointed at the same blocks |
| S03-C4 | `grep -c "...\|..."` (grep-internal alternation only, no shell pipe) | ran clean, alternation matched both branches | safe — confirmed, not touched |
| S01-C4 (`S01/PLAN.md:437`) | `printf ... \| grep ... \| tail ...` (three escaped shell pipes) | extracted and run exactly as written: `printf`'s extra arguments get recycled into the format string, `grep`/`tail` never run as separate processes, `guard` comes back wrong (`guard=1`, a FALSE FAIL, on a case that is a genuine pass) | **BROKEN — proven, in scope (any PLAN the sweep proves broken); fixed this round in `S01/PLAN.md`** |
| S01-C1/C2/C3 presence-arm blocks | already extracted to fenced blocks in round 4 | ran clean with real `\|` | safe, unaffected |
| S01 lines 924/1099/1188/1193/1461/1479/1562/1674/1787/2248 | `grep`-internal `\|` (inline code spans, not table cells) or historical prose quoting the OLD escaped form for illustration | ran clean where live; historical text is not executed | safe — confirmed, not touched |
| S02 lines 126/147/664/778/828 | `grep`-internal `\|` (table cells and inline spans) | ran clean, alternation matched as intended | safe — confirmed, not touched |
| S04 lines 210/411 | `grep`-internal `\|` (inline spans, one with `\(...\)` groups) | ran clean, alternation and grouping both matched as intended | safe — confirmed, not touched |

**Conclusion: two PLANs needed a fix this round — S03 (this file, three
sites plus the coding seat's in-progress fourth) and S01 (one site,
`S01-C4`, fixed in `S01/PLAN.md` this round under this same ticket, since
the sweep proved it broken and this PLAN's own scope covers "any PLAN
whose command your sweep proves is broken").** S02 and S04 are clean —
every occurrence of `\|` in both files is grep-internal alternation,
confirmed safe by running it, not assumed from the pattern looking
familiar.

`t_b81ee2b2` (small, factual): the `S03-C1` pre-fix RED evidence row
below described the OLD command (5 ARIA markers required-and-missing)
after the command itself had already been revised to the new
`need`/`forbidden` shape — documenting a run that could no longer happen.
Corrected in place, re-run against base commit, result recorded below.

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
| S03-C1 | FEATURE-ASSERTION | **RED, genuinely — row REVISED (`t_b81ee2b2`): the row previously here described the pre-REV-05 command (5 required markers, all MISSING) which the B2 fix supersedes; that run can no longer happen.** Current `need`/`forbidden` check, run 2026-08-29 against base commit: `MISSING ['aria-current','Your Debates','Public Debates'] FORBIDDEN-PRESENT []`, exit 1 — short-circuits before the `&&`'d vitest call. |
| S03-C2 | REGRESSION-BASELINE | **GREEN today, for a baseline reason, not a built-feature reason (CLASS-FIX ROUND 1, `t_7539734e`: re-run via the `S03-C2-live` block, this cell no longer embeds the command):** `S03-C2-live` → `1` — today's page ignores the (not-yet-implemented) `?tab=` param entirely and unconditionally shows one of the two banner strings; the count must stay ≥1 once C2-1's gating exists. |
| S03-C3 | REGRESSION-BASELINE | **GREEN today, same reason as S03-C2 (CLASS-FIX ROUND 1, `t_7539734e`: re-run via the `S03-C3-live` block):** `S03-C3-live` → `1` — the published list is shown unconditionally today. |
| S03-C4 | VERIFICATION-ONLY | **GREEN, correctly:** `grep -c "logged-out.*Public Debates\|logged-in.*Your Debates" docs/missions/public-debate-access/slices/S03/DECISIONS.md` → `2` — the default-selection decision is already durably recorded (Architecture decision §3 above). |

**ACCEPTANCE-COMMAND THREAD, ROUND 2 (PLAN-04, blocking, `t_eade6007`):
checked, no fix needed here.** Same reasoning as S02's equivalent note:
S03 has zero `| grep -q` occurrences — its commands are a bare `node -e`
script (`&&`-chained to vitest, not piped through grep), plain `grep -c`/
`grep -n` calls, and live `curl` probes, none of which pipe one process's
output into a second process whose exit status silently replaces the
first's. Re-run 2026-08-29: the `node -e` structural check still reports
all 5 markers MISSING, exit 1 — unaffected by this round's fix.

**REV-05 FINDINGS, ROUND 1 (`t_57891ca5`/`t_a9d1deeb`): B2 and N1, both
Architecture's own design, not the coder's.** A blind Grok lens reviewed
S03's already-implemented code and returned REWORK. Two of its three
findings are recorded here (the third, B1, is the coding seat's, being
reworked live in `.worktrees/s03-code` — not this PLAN's concern).

- **B2 (blocking):** `role="tablist"`/`role="tab"`/`aria-selected` on
  `next/link` navigation elements, with no tabpanel, no `aria-controls`,
  no arrow-key behavior, is Bad ARIA per Using ARIA Rule 1 — see
  Architecture decision 2 above (revised in place) for the full argument
  and citations. **Pinned in two places, both now addressed:** the
  `S03-C1` cluster's `node -e` check (table above, revised) and
  `tests/unit/pda-s03-keyboard-accessibility.test.ts` (NOT revised here —
  out of this round's bounds, a coding-seat file; **coordination note**:
  that test currently asserts `role="tab"`, per the brief, and will need a
  follow-up edit, on its own ticket, once this markup change is coded —
  until then the `S03-C1` cluster's compound acceptance command stays
  correctly RED after B2's fix lands and before that follow-up lands, not
  falsely green; this is an intentional, disclosed sequencing dependency,
  not a defect).
- **N1:** an anonymous visitor clicking "Your Debates" saw neither list,
  with the click producing no visible change — see Architecture decision 5
  above (revised in place) and new step S03-C2-3 below for the ruling (a
  HOW defect, not a V scope question) and the fix.

Both fixes are markup/PLAN changes only, described here for the coding
seat to implement on separate future tickets — no product code or test
file was written or touched by Architecture this round, and
`.worktrees/s03-code` was not read or written.

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

### S03-C1-2 — Replace the two `<h2>` headings with a plain-link pair (REV-05, B2, round 1, `t_57891ca5`/`t_a9d1deeb` — REVISED, was a `role="tablist"` pair)

**Cluster:** S03-C1
**File surface:** `apps/ui/app/page.tsx:80-89` and `:97-104` (the two
`sectionHead` blocks)
**Change:** Replace both `<div className="sectionHead"><h2>...</h2>
<span className="count">...</span></div>` blocks with a single shared
block above the (now-conditional) list body:
```tsx
<div className="sectionHead" aria-label="Debate library">
  <Link
    aria-current={tab === "yours" ? "page" : undefined}
    href="/?tab=yours"
    className={tab === "yours" ? "tab tabActive" : "tab"}
  >
    Your Debates
  </Link>
  <Link
    aria-current={tab === "public" ? "page" : undefined}
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
merged behind the `tab` conditional rather than duplicated. No
`role="tablist"`, `role="tab"`, or `aria-selected` anywhere — removed
entirely, not merely supplemented, per Architecture decision 2's reversal.
**Acceptance test:** `grep -c '<h2>Your debates</h2>\|<h2>Published debates</h2>' apps/ui/app/page.tsx`
returns `0` (both old headings gone) AND `grep -c 'aria-current='
apps/ui/app/page.tsx` returns `2` AND `grep -c 'role="tab"'
apps/ui/app/page.tsx` returns `0` (proves the old Bad-ARIA markup was
actually removed, not left alongside the new attribute — the same
exclusive-provenance failure shape this mission has hit before: a PASS
that a `need`-only check without a `forbidden` arm cannot distinguish from
"added the new thing without removing the old one").
**Category (REV-05, B2, round 1, `t_57891ca5`/`t_a9d1deeb` — markers
revised; category unchanged): FEATURE-ASSERTION — observed pre-fix RED,
correctly.** Run 2026-08-29 against `apps/ui/app/page.tsx` at base commit:
first grep (old headings) → `2` (wants `0`); second grep (`aria-current=`)
→ `0` (wants `2`); third grep (`role="tab"`) → `0` (wants `0`, already
correct — the markup never existed at base commit, so this arm is
currently vacuously satisfied and only becomes a live check once the
now-superseded `role="tab"` markup that REV-05 flagged is removed again).
**Failure it CATCHES:** SPEC's Intent ("Replace passive... headings with
selectable... controls") not actually being followed — a plan that adds
new buttons ALONGSIDE the old headings (satisfying R1's letter while
contradicting its Intent) is caught by the first grep returning nonzero;
Bad-ARIA regression (adding `role="tab"` back, or adding `aria-current`
without removing it) is caught by the third grep returning nonzero.
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
**File surface:** `tests/unit/pda-s03-keyboard-accessibility.test.ts`
(**STALE-RECORD FIX, item 2, `t_63f6e7e6` — third instance of this
disease after the stale "Row 4, still OPEN" text and the stale S04
checklist items 3/3b: this description previously said "source-text
based, following the `v2ui-pages.test.ts` convention... no DOM-render
path," which stopped being true when B1's rework replaced it. Corrected
below from the file as it now stands, not from memory of what it was
authored to be.**) Actually renders: calls the real `HomePage` function
(mocking only `@/lib/serverApi`'s `createServerContractClient` and
`next/headers`), pipes the result through `react-dom/server`'s
`renderToStaticMarkup`, and parses that markup with `jsdom` into a real
`Document` — a genuine DOM, not a source-text pattern match.
**Change:** none this round (test file, not this PLAN's to edit — see
scope). For the record, what it now asserts, per the two tab links,
across both `tab=yours` and `tab=public` renders (`it.each`): tag name is
literally `A` (a real anchor, not a `<div onClick>`); `href` matches the
exact expected destination; `tabIndex === 0` (native tab order); no
`disabled` attribute and `aria-disabled` is not `"true"`; `role` is
**not** `"tab"` and `role` on the wrapping nav element is **not**
`"tablist"`, and `aria-selected` is **absent** (B2's reversal, asserted
as a negative — the exact markup this mission's REV-05 round removed
must stay removed); `aria-current` is `"page"` on the selected link and
`null`/absent on the other (B2's replacement, asserted as the positive);
an accessible name (via `aria-label`, `aria-labelledby` resolution, or
text content) equals the expected label; and a `knownConcealmentBarrier`
walk up the ancestor chain confirms no `hidden`/`aria-hidden="true"`/
`inert`/`display:none`/`visibility:hidden|collapse`/
`content-visibility:hidden` conceals the link (an enumerated, disclosed-
as-non-exhaustive check, not a full accessibility-tree computation — JSDOM
has none). A second `it()` covers N1's `tabEmptyHint` fix: rendering
`tab=yours` logged-out shows a `<p class="tabEmptyHint">` with the exact
sign-in copy immediately after the nav element, and rendering `tab=public`
shows no such element at all. This is STILL a stronger guarantee than a
simulated keypress for the native-anchor properties (tag/href/tabIndex/
disabled are HTML-platform guarantees once true, not app-JS behavior to
regress) but is now ALSO a real, if JSDOM-limited, DOM-render check for
the ARIA-role and concealment properties that a source-text match could
never have covered — the file surface changed shape after B1's rework;
this description now matches the file, not the file's first draft.
**Acceptance test:** `pnpm exec vitest run tests/unit/pda-s03-keyboard-accessibility.test.ts`
exits 0.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly.** Run 2026-08-29: exit 1, `No test files
found, exiting with code 1` — single-file target, the file does not exist
yet; no vacuous-pass risk (this is the same genuine-RED shape as S01's
single-missing-file steps, not S01's multi-file vacuous-pass defect).
**Failure it CATCHES (STALE-RECORD FIX, item 2, `t_63f6e7e6` — extended,
not just corrected, since the real test catches more than the old
description claimed):** the actual historical failure mode this class of
bug takes — a developer reaching for a `<div role="tab" onClick={...}>`
instead of a real `<Link>` (visually identical, silently NOT
keyboard-operable), or an `href` that's empty/missing because the `tab`
variable was interpolated wrong, or a stray `tabIndex={-1}` copied from
an unrelated pattern elsewhere in the codebase. Now ALSO catches: B2's
own regression class — `role="tab"`/`role="tablist"`/`aria-selected`
reappearing (asserted absent, not merely unmentioned) — and `aria-current`
being wrong or missing on the selected link; and N1's regression class —
the `tabEmptyHint` sign-in pointer disappearing from the logged-out
Your-Debates render, or leaking into the Public-Debates render where it
must be absent.
**Failure it MISSES (B3, coding rework round 2):** this test uses an
enumerated JSDOM blacklist, not a browser accessibility-tree oracle. It
catches self/ancestor `hidden`, `aria-hidden="true"`, `inert`, and computed
`display: none`, `visibility: hidden | collapse`, and
`content-visibility: hidden`. It does **not** catch concealment supplied
only by app/external stylesheet class rules (the static render does not
load app CSS); off-screen positioning, clipping, zero-size or occluded
layout; opacity/transparency; pointer blocking; closed-details/popover or
future/unmodelled exclusion mechanisms; or browser/AT-specific
accessibility-tree behaviour. Those gaps remain QA/browser evidence and
are not claimed as reachability proof here.

### S03-C1-5 — Route to QA: what this PLAN does not and cannot mechanically verify

**Cluster:** S03-C1 (verification-scope statement, not a code step)
**File surface:** none.
**Change:** none — **this step exists so the boundary is explicit rather
than silently assumed**, per the brief's own either/or instruction.
Three things S03-C1-4's structural test does NOT and cannot prove, named
so QA picks them up rather than nobody: (1) **(REV-05, B2, round 1,
`t_57891ca5`/`t_a9d1deeb` — revised: the markup this item describes
changed from a naked `role="tab"` to `aria-current="page"`, which lowers
but does not zero this risk)** that a real screen reader announces the
current-page state for `aria-current="page"` in a way that is actually
COMPREHENSIBLE in the specific AT/browser combination QA uses —
`aria-current` is a well-supported, standard attribute with a much more
predictable announcement than the previous round's naked `role="tab"`
outside a `role="tablist"` container, so residual risk here is lower, but
verifying an actual AT session's experience is still QA's job, not a
source-text test's; (2) that visible focus styling (an outline/ring on `:focus-visible`)
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

### S03-C2-3 — In-panel sign-in pointer for the Your-Debates tab, logged out (REV-05, N1, round 1, `t_57891ca5`/`t_a9d1deeb`)

**Cluster:** S03-C2
**File surface:** `apps/ui/app/page.tsx` (same block as S03-C2-1)
**Change:** extend S03-C2-1's conditional with an explicit `else if`
branch for the logged-out case, so the Your-Debates tab's own content area
is never blank when selected:
```tsx
{sessionConfirmed && tab === "yours" ? (
  <div className="recentList"><DebatesBuffer debates={debates} /></div>
) : tab === "yours" ? (
  <p className="tabEmptyHint">Sign in or create an account above to see your debates.</p>
) : null}
```
This does NOT invent a global anonymous private list (still forbidden by
SPEC R3) — it is one line of text pointing at the sign-in banner that
already exists above (`page.tsx:53-63`, decision 4, unchanged), rendered
INSIDE the tab body that actually switched, rather than relying on an
element decision 4 already declared is not part of any tab's surface.
Satisfies the SPEC acceptance sketch's explicit "(or empty+CTA)"
alternative literally.
**Acceptance test:** `grep -c 'tabEmptyHint' apps/ui/app/page.tsx` returns
`≥1`.
**Category (REV-05, N1, round 1, `t_57891ca5`/`t_a9d1deeb`):
FEATURE-ASSERTION — observed pre-fix RED, correctly.** Run 2026-08-29:
`grep -c 'tabEmptyHint' apps/ui/app/page.tsx` → `0` — the string does not
exist in today's page.
**Failure it CATCHES:** the exact defect REV-05's N1 found — an anonymous
visitor's click on "Your Debates" producing no visible change to the
panel that switched (the sign-in banner, unconditional and already
visible above, does not count as content of the tab that just activated).
**Failure it MISSES:** does not catch the hint text being present but
poorly worded or not actually near enough to the banner's own CTA link to
read as connected to it — a copy/UX-polish judgment, not a structural one;
left to QA the same way S03-C1-5 leaves comparable polish questions there.

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

**FOUR-ITEMS bundle, item 1 (`t_5d2a4e79`), cross-check confirmed, not
re-derived:** the same standing test's line 159 (`home` contains
"Published debates," the exact heading S03 replaces with tabs) was
already re-verified by the Router against S03's finished worktree — 5/5
passed, the string survives twice in S03's own `page.tsx` (per the "what
I nearly got wrong" note and the standing-test analysis above). Disjoint
write surfaces held for S03 on this axis; the round's actual finding
(disjoint writes don't imply independent effects) landed on S02's write
to a DIFFERENT block of the same file (lines 168-174), not on anything
S03 touches. No S03/PLAN.md change follows from item 1 beyond this note.
