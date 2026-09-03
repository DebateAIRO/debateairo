# CODE-T3C2-REV — blind review + browser half (ticket t_93f9780a, epoch=35)

`SKILLS LOADED:` superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer,
superpowers:verification-before-completion

**Target:** `fd82d84e` · branch `slice/t3` · worktree
`/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/slice-t3/dialectical-engine`
**Seat:** fresh Opus 5, blind. No contact with any other lens.

## VERDICT — REWORK (2 blocking, 5 non-blocking). Round 1 of 3.

The cluster's own work is sound: the RED reproduces, all seven mutants die, every gate is
green, and five of the six browser items are CONFIRMED in both modes. Two defects block:
a privacy-disclosure **parity pin rewritten to require divergence** between the two UI
compositions (in-contract to fix), and a **settled `CONTESTED` verdict painted with the
in-progress `--gen-*` token** on the public page, measured identical to `Generating` in
both modes. The sixth browser item is REFUTED as written — but the code is right and the
CELL is wrong; that one is a finding against AM15, not against the worker.

---

## 1. Dump integrity — verified FIRST, never written (AM16 law)

```
673beed31d32e720d41d274093435e6418a79e92e619a9964fd748baa02322ff  t3-c2-yours.html
2f70b728edaf51ed9e4b0486c6402c951e4e7e98f0f9196c69039d910542e527  t3-c2-public.html
```
Both **match the packet's declared sha256 exactly**, at review start and again at verdict.
I never wrote, regenerated or edited either file; I served byte-identical `cp` copies from
`/tmp/t3rev/serve/` (sha256 re-verified on the copies).

**Embedded CSS is the real `globals.css`, byte-for-byte** — extracted the `<style>` body
from each dump and compared to `apps/ui/app/globals.css`: `True`, 83324 == 83324 bytes,
both dumps.

**Provenance — these are real renders, not hand-written fixtures.** Every React-serialised
inline-style signature appears at exactly the multiplicity the committed source implies:

| signature | yours | public |
|---|---|---|
| `background:var(--shell);border-color:var(--line);border-radius:13px` | 4 | 3 |
| `data-bezel="core" style="background:var(--core)"` | 4 | 3 |
| `border-color:var(--core);height:12px;margin-left:-4px;width:12px` | 8 | 0 |
| active pill `background:var(--ink);…;color:var(--bg)` | 1 | 1 |
| inactive pill `background:transparent;…;color:var(--muted)` | 1 | 1 |

All 4 fixture `topic:` strings present in the yours dump, all 3 `question:` strings in the
public dump, **0 leakage each way**. `borderRadius: 13` → `border-radius:13px` and
`data-library-row` → `data-library-row="true"` are React serializer artifacts a hand-writer
does not reproduce. Provenance CONFIRMED.

---

## 2. CELL T3-C2-5 — THE BROWSER HALF (my exclusive duty)

Chromium via Playwright MCP, viewport 1440×900, `http://127.0.0.1:8817/`, dump +
real `globals.css`. `document.documentElement.dataset.mode` set to `terracotta`, then
`chamber`, **both read**.

> **METHOD CORRECTION, stated because it changes how the numbers must be read.**
> `.debateCard` carries `transition: border-color 0.2s`. My first two passes read
> `border-color` mid-transition and returned garbage that looked like a dark-mode bug:
> chamber showed the *terracotta* `rgba(41,38,31,0.1)`, and two consecutive terracotta
> reads disagreed with each other (`rgba(234,226,209,0.09)` then `rgba(226,218,202,0.09)`).
> **There is no such bug.** Every number below was taken after a 700 ms settle and is
> stable across repeat passes. Had I filed the first reading I would have filed a phantom.

### (1) Row surface — **REFUTED as written; the intent holds. Finding N5 (AM15), not the code.**

| | terracotta | chamber |
|---|---|---|
| page `--bg` (body) | `rgb(249, 246, 241)` | `rgb(20, 17, 14)` |
| **row** `backgroundColor` (×4 yours, ×3 public) | `rgb(239, 233, 224)` = **`--shell`** | `rgb(34, 29, 23)` = **`--shell`** |
| `:scope > [data-bezel="core"]` | `rgb(253, 251, 246)` = **`--core`** | `rgb(24, 20, 16)` = **`--core`** |
| row `borderRadius` | `13px` (non-`0px`) | `13px` (non-`0px`) |
| row `border-color` (settled) | `rgba(41, 38, 31, 0.1)` = `--line` | `rgba(242, 234, 217, 0.09)` = `--line` |

- `--core` clause: **REFUTED.** The row is `--shell`; `--core` is one level in.
- `differs from --bg`: **CONFIRMED**, both layers, both modes.
- non-`0px` radius: **CONFIRMED**, `13px`, both modes.

The cell is unsatisfiable as written, and the worker is not the cause — see N5.

### (2) MODEL DOTS OVERLAP — **CONFIRMED, both modes.** (jsdom can never see this)

`marginLeft` computed `-4px` on every dot. For every adjacent pair, `dots[i+1].left <
dots[i].right`, delta exactly **−4.00 px**. Identical in `terracotta` and `chamber`:

| stack | n | pair | prev `.right` | next `.left` | overlaps | delta |
|---|---|---|---|---|---|---|
| 0 | 2 | 0→1 | 958.30 | 954.30 | **true** | −4.00 |
| 1 | 3 | 0→1 | 938.96 | 934.96 | **true** | −4.00 |
| 1 | 3 | 1→2 | 946.96 | 942.96 | **true** | −4.00 |
| 2 | 1 | — | — | — | n/a (single dot) | — |
| 3 | 2 | 0→1 | 958.30 | 954.30 | **true** | −4.00 |

4/4 multi-dot pairs overlap. Every dot `12.00 × 12.00 px`, `border-radius: 50%`.
It is a STACK, not a row.

### (3) Dot ring resolves to `--core` — **CONFIRMED, both modes.**

`borderColor` on all 8 dots: `rgb(253, 251, 246)` (= `--core`) in terracotta,
`rgb(24, 20, 16)` (= `--core`) in chamber. Ring width measured **`1.5px`** — see N4.

### (4) `Generating` chip colour ≠ `Complete` chip colour — **CONFIRMED, both modes.**

| mode | `Complete` (`pillOk`) `color` | `Generating` (`pillGen`) `color` | differ |
|---|---|---|---|
| terracotta | `rgb(60, 117, 75)` | `rgb(130, 101, 48)` | **yes** |
| chamber | `rgb(134, 181, 141)` | `rgb(200, 160, 85)` | **yes** |

### (5) Active selector `--ink`, inactive transparent — **CONFIRMED, both modes, both dumps.**

| mode | active `backgroundColor` | `--ink` | inactive `backgroundColor` |
|---|---|---|---|
| terracotta | `rgb(41, 38, 31)` | `#29261F` ✓ | `rgba(0, 0, 0, 0)` ✓ |
| chamber | `rgb(242, 234, 217)` | `#F2EAD9` ✓ | `rgba(0, 0, 0, 0)` ✓ |

Active/inactive invert correctly between dumps (`aria-current="page"` on *Your debates* in
the yours dump, on *Public debates* in the public dump). Both `999px`, `6px 15px`,
fontWeight `700`/`600`.

**Live-browser corroboration of the `pda-s03` invariants** (not asked for; free with the
same probe): both selectors `tagName` `A`, `tabIndex` `0`, `role` `null`,
`aria-selected` `null`, container `role` `null`, `href` `/?tab=yours` and `/?tab=public`,
`aria-current="page"` on the active one only. Both modes, both dumps.

### (6) All of (1)–(5) hold in `chamber` — **CONFIRMED**, with (1) failing its `--core`
clause identically in *both* modes, so chamber introduces no additional divergence.

### Public-surface extras measured

- disclosure: **exactly 1** occurrence, `recentList.nextElementSibling === disclosure`
  → `true`, `rectTop 900.41` vs `lastRowBottom 888.41` (it is genuinely *under* the list),
  `fontSize 10.5px`, `fontStyle italic`, `marginTop 12px`, `color` = `--muted`. Yours dump:
  **0** occurrences.
- count chip: `4 TOTAL` / `3 TOTAL`, `color` = `--muted`.
- **`.modelStack` count = 0 and `.modelDot` count = 0 on the public surface** — see N2.

---

## 3. Gates — all run by me, output verbatim

**Row-14 command, 3× (worst run is the verdict):**
```
RUN 1:  Test Files  9 passed (9)   Tests  37 passed (37)   Duration 5.75s
RUN 2:  Test Files  9 passed (9)   Tests  37 passed (37)   Duration 5.39s
RUN 3:  Test Files  9 passed (9)   Tests  37 passed (37)   Duration 5.39s
```
COLLECTED counts: **9 files / 37 tests**, three identical runs. Matches the packet.

**`pnpm exec vitest run tests/render`:** `Test Files 21 passed (21) · Tests 124 passed |
1 todo (125)`. The 1 todo is `tests/render/t1-canvas.test.tsx:514 it.todo("reserved for
T1-C3")` — **not** this cluster's; T3-C2 removed its own `describe.todo("lists")`.

**ADR-001 per-cluster oracle** (`rg` absent, `grep -E` fallback; token ranges found by
syntax = `5,72,74,114`), scoped to T3-C2's write surface — with the AM12b discrimination
proof:
```
(1) apps/ui/app/page.tsx apps/ui/components/DebatesBuffer.tsx  -> 0
(2) inject "#6E675C" into page.tsx                             -> 1
    apps/ui/app/page.tsx:198:  style={{ color: "#6E675C", fontSize: 10.5, ... }}
(3) restore                                                    -> 0
```
**0 → 1 → 0.** The matcher is live; the zero is a result, not an absence.

**ADR-006 compile gate, line-agnostic + count-pinned:**
```
tsc liveness:              Version 7.0.2      (root compiler, not apps/ui's 5.9.3)
baseline TS2322 (expect 1): 1
baseline TS2882 (expect 1): 1
residual                  : 0
```
Verbatim baselines: `DebatePageClient.tsx(1490,11): error TS2322` (PDA-owned, predates
this mission) and `layout.tsx(3,8): error TS2882` (structural css side-effect import).
**1 / 1 / 0.**

**Guard rail 2 — `vitest list` before/after:** `fd82d84e^` = **10** cases, `fd82d84e` =
**15**. All 10 `chrome` cases present verbatim after; 5 `lists` cases added; **none
deleted**. Matches the worker's "10 → 15".

---

## 4. RED reproduction from `fd82d84e^` (tests kept, product reverted)

```
FAIL t3-library > lists > renders recased native selectors and a live count for the four Your debates rows
  → expected [ 'Your Debates', 'Public Debates' ] to deeply equal [ 'Your debates', 'Public debates' ]
FAIL t3-library > lists > renders a live count for the three Public debates rows
  → expected '3 shown of 37 total' to be '3 TOTAL'
FAIL t3-library > lists > renders every library row as a shell/core bezel
  → expected +0 to be 4
FAIL t3-library > lists > renders the public search-indexing disclosure once under the list and never on Yours
  → expected 3 to be 1
FAIL pda-s03 > renders enabled native links and current-page state for tab=yours
  → rendered row count: expected '0 total' to be '0 TOTAL'
FAIL pda-s03 > renders enabled native links and current-page state for tab=public
  → rendered row count: expected '0 total' to be '0 TOTAL'
FAIL s8-publication-contract > ships the same deliberate controls and public-only reader in both UI compositions
  → expected 5937 to be greater than 6353

 Test Files  3 failed (3)      Tests  7 failed | 18 passed (25)
```
`expected 3 to be 1` is the shipped per-row disclosure, reproduced exactly as AM15
described it. The re-anchored s8 pin **also goes RED** — it is a real pin, not a
self-satisfying rewrite. Product restored byte-exactly (`shasum -c`: OK, OK).

---

## 5. Mutants — the worker's three rebuilt MY way, plus four of mine. 7/7 KILLED.

Each applied to a pristine tree, run against
`t3-library + pda-s03 + s8-publication-contract`, then reverted.

| # | mutant | killed by | evidence |
|---|---|---|---|
| **M1** | count hard-coded to `` `4 TOTAL` `` | 3 pins | `expected '4 TOTAL' to be '3 TOTAL'` (public) + `'4 TOTAL' to be '0 TOTAL'` (pda-s03 ×2) |
| **M2** | disclosure moved BACK inside every row | 2 pins | `expected 3 to be 1` + s8 `expected 7399 to be greater than 8037` |
| **M3** | one selector left in old casing | 2 pins | `[ 'Your Debates', 'Public debates' ]` + pda-s03 `expected [] to have a length of 1` |
| **M4** ★ | **DERIVATION probe** — `debates.slice(0,-1)`: hide one row, chip stays on fixture length | t3-library | **`expected 4 to be 3`** |
| **M5** ★ | **POSITIONAL** — disclosure rendered exactly ONCE but ABOVE the list | 2 pins | `expected false to be true` (`nextElementSibling`) + s8 `6432 > 8214` |
| **M6** ★ | **STRUCTURAL** — bezel flattened: `--core` on the row, inner `data-bezel="core"` dropped (both compositions) | t3-library | `expected 'var(--core)' to be 'var(--shell)'` |
| **M7** ★ | **POSITIONAL** — the two selectors swapped in source order | t3-library | `[ 'Public debates', 'Your debates' ]` |

★ = mine. M4 and M5 answer the packet's two named requirements.

**M4 is the decisive result.** It is precisely the mutant AM15 said `T3-C2-1` could not
catch — *"a `4 TOTAL` chip whose number does not match the rows shown"*. The chip still
reads a truthful-looking `4 TOTAL` and the literal-string assertion still passes; the cell
dies on `Number.parseInt(count) === rows.length`. **The count is genuinely DERIVED from
the DOM, not from fixture length.** T3-C2-4 closes the hole it was written to close.

**An honest qualification on M1.** Hard-coding `` `4 TOTAL` `` does **not** fail the
*Your debates* case — 4 rows, chip says 4, both assertions pass. It dies only on the
*public* tab (3 rows) and on `pda-s03`'s empty state (`0 TOTAL`). The discrimination is
real but it lives in the **cluster**, not in the yours-tab case. A future seat that trims
this cluster's verify command to `t3-library.test.tsx` alone keeps the kill; one that
keeps only the yours-tab case loses it.

---

## 6. Migration review — PRESERVED, not weakened

**`pda-s03` recase migration (AM5 row 14).** The complete set of removed lines in that
file is **two label strings and two comment lines** — nothing else. Every pin survives
verbatim and is confirmed live in the browser: native `A`, accessible name, `href`
`/?tab=yours` / `/?tab=public`, `tabIndex` `0`, no `disabled`, no `aria-disabled="true"`,
`role !== "tab"`, no `aria-selected`, container `role !== "tablist"`,
`knownConcealmentBarrier` null, and `aria-current` `"page"` on the active link only.
The migration **adds** a pin (`.count` === `0 TOTAL`). **Strengthened, not relaxed.**

**Routed comment fix `t_1867dac0` — COMMENT ONLY. Confirmed.** The two removed lines are
both `//` comments. Filtering the diff to non-comment lines leaves exactly the three
migration lines above. `grep "Failure it MISSES"` over the file returns nothing — the
reference was genuinely dangling.

**`app/page.tsx` shared with T9's route split and T3-C1's copy.** The T9-C1 prohibition
(*"adds an early return and moves no JSX out of `app/page.tsx`"*) is **intact** — no
markup left the file. The s8 slice between `published.items.map` and `</article>` is
**1494 chars** and still contains `public_ref`, `debateCardClaim`, `data-bezel`, `pill`
and `Open the full debate`. T3-C1's `tabEmptyHint` copy survives verbatim.

**However, JSX did move across the `</article>` boundary *within* the file** — the
disclosure `<p>`, which is exactly what `T3-C2-4` mandates. The pin was re-anchored to
match, and the new anchor is stronger than the one it replaced (exactly-once by regex
count + positional `indexOf(disclosure) > cardEnd`). M2 and M5 both prove it fires.
That part is correct. What is **not** correct is what the re-anchor did to the *other*
composition — see **B1**.

---

## 7. FINDINGS

### B1 — BLOCKING. The s8 parity pin was rewritten to *require* divergence between the two UI compositions, on a privacy disclosure, with no marker and no ticket.
`tests/architecture/s8-publication-contract.test.ts:158-176`

**Before**, one loop covered both compositions with the same assertion:
```js
for (const home of [applicationHome, webHome]) {
  const publicCard = home.slice(home.indexOf("published.items.map"), home.indexOf("</article>", …));
  expect(publicCard).toContain("may be indexed by search engines");
  expect(publicCard).toContain("Copies may persist after unpublishing");
}
```
**After**, the two are asserted to be *different shapes*: `applicationHome` must carry the
sentence **exactly once and AFTER** `</article>`; `webHome` must still carry it **INSIDE**
`</article>`.

**Failure scenario.** A seat opens the test named *"ships the same deliberate controls and
public-only reader in **both UI compositions**"*, sees it green, and concludes the two
public readers are pinned to parity. They are not — the test now enforces that they differ.
Measured: `web/app/page.tsx` still renders the sentence inside `published.items.map …
</article>` (1 occurrence, in-card). `web` is a live buildable surface
(`dialectical-engine-web`, its own `next build`).

**Class sweep (§2.2).** Class = *"T3's public-list re-layout applied to `apps/ui` only
while `web/` carries a second composition of the same list."* Members and status:

| member | `web/app/page.tsx` | affected? |
|---|---|---|
| selector recase (`Your debates` / `Public debates`) | no selectors at all | **no** — N/A |
| `N TOTAL` count chip | no `.count` element | **no** — N/A |
| `data-library-row` / `data-bezel` shell-core | absent | **no** — N/A |
| **disclosure position** | **in-card** | **YES — the only member** |

The class has exactly one affected member. That is the useful part of the sweep: this is
not broad drift, it is one divergence — which makes it cheap to record and inexcusable to
leave unrecorded.

**Smallest fix, inside this cluster's own write surface** (`s8-publication-contract.test.ts`
IS in row 14's Writes column): name the divergence at the assertion — that `apps/ui` has
moved to the one-disclosure-under-the-list form per `T3-C2-4` while `web/app/page.tsx` has
not yet, with the ticket id — so the pin records drift instead of silently ratifying it.
`web/app/page.tsx` is **outside** row 14's Writes column, so the product fix is the
orchestrator's to route. **The worker was right not to edit `web/`; it was wrong to let
the pin absorb the difference silently.** Ticket needed: *port `T3-C2-4`'s single-disclosure
form to `web/app/page.tsx`, then collapse the s8 assertion back to one loop.*

### B2 — BLOCKING. A settled `CONTESTED` verdict is painted with the in-progress `--gen-*` token, measured indistinguishable from `Generating`.
`apps/ui/app/page.tsx:182`
```js
<div className={`pill ${debate.verdict === "SUPPORTED" ? "pillOk" : "pillGen"}`}>
```
Every non-`SUPPORTED` verdict — including `CONTESTED`, and including a `null` verdict
rendered as the literal text `Published` — falls to `pillGen`.

**Measured in the browser, public dump, both modes:**

| chip | terracotta `color` | chamber `color` |
|---|---|---|
| `SUPPORTED` (`pillOk`) | `rgb(60, 117, 75)` | `rgb(134, 181, 141)` |
| `CONTESTED` (`pillGen`) | `rgb(130, 101, 48)` | `rgb(200, 160, 85)` |
| `Published` (null verdict, `pillGen`) | `rgb(130, 101, 48)` | `rgb(200, 160, 85)` |
| `Generating` (yours dump, `pillGen`) | `rgb(130, 101, 48)` | `rgb(200, 160, 85)` |

`CONTESTED` and `Generating` are the **same three bytes** in both modes.

**Failure scenario.** A reader opens the public library, sees a finished, published,
contested debate, and reads it as *still generating* — on a public, unauthenticated
surface. `pillGen` is unambiguously the *generating* token: it resolves `--gen-bg` /
`--gen-border` / `--gen-text`, and both `DebatesBuffer.tsx:56` and
`DebatePageClient.tsx:1085` use it for exactly that state.

**This is newly introduced by `fd82d84e`** — the parent renders no pill on public rows at
all. The correct token already exists and is already used by this cluster's sibling:
`pillBad` → `--dispute-*`, which `DebatesBuffer.tsx:56` uses for `failed`. `dev`'s
AM16 ROUTED ROW R-7 (*"`refuted` becomes the solid `--dispute` chip"*) points the same way.
Not covered by any T3-C2 cell — which is why it reached a browser probe and not a pin.

**Class sweep (§2.2).** Class = *"a verdict/status enum collapsed to a two-way ternary,
so every unmapped member inherits a token that means something else."*

| site | shape | affected? |
|---|---|---|
| `app/page.tsx:182` | 2-way: `SUPPORTED` → ok, **everything else → gen** | **YES** |
| `DebatesBuffer.tsx:56` | 3-way: complete → ok, `failed` → bad, else → gen | no — `failed` mapped |
| `DebatePageClient.tsx:1085` | 3-way: complete → ok, generating → gen, else → `""` | no — falls through to neutral |
| `settings/page.tsx:52,101` · `EvaluatorDevMenu.tsx:45` | literal, not enum-driven | no |

One affected site. The remedy is shape-driven, not confidence-driven: replace the ternary
with an explicit map over the verdict domain whose default is the neutral `.pill` (no
modifier), so an unrecognised verdict renders neutral rather than borrowing a state token.

### N1 — Public rows carry no model-dot stack and no timestamp; SPEC R3 asks for both.
`apps/ui/app/page.tsx:160-197`. Measured: `.modelStack` = **0**, `.modelDot` = **0** on the
public surface, both modes. SPEC R3: *"each shows the corresponding debate rows with title,
time, model count, status."* Public rows show title, pseudonym, verdict, band — no time, no
model count. `published_at` **is** present in the fixture (`2026-08-30T08:00:00.000Z`) and
unrendered. Consequence for the fidelity law: `T3-C2-5` items (2) and (3) are structurally
**unmeasurable** on the public surface, so half the cell's evidence can only ever come from
the yours dump. Needs a ticket: either render time + model count on public rows, or amend
R3 to scope those to the private list and say why.

### N2 — `T3-C2-5` gives no acceptance for a single-dot stack.
Stack 2 has one dot, so `pairs` is empty and the overlap predicate is vacuously satisfied.
A regression that dropped every dot but the first would leave item (2) green on that row.
The cell should require at least one stack with `n >= 2` before the overlap claim counts —
in this dump three stacks qualify, so the evidence stands, but not by construction.

### N3 — `borderRadius: 13` is a raw geometry literal where `--r-card` exists.
`page.tsx:166` and `DebatesBuffer.tsx:19`. Measured `13px` in the browser; `--r-card`
resolves to `14px`. The inline literal silently overrides the token on both compositions of
the row, so the library rows are now the only cards in the product that do not follow
`--r-card`. ADR-001's oracle is colour-only so it does not catch this. Either move the
token to `13px` (if 13 is the design's value, as AM15's port table states) or use
`var(--r-card)`.

### N4 — model-dot ring measured `1.5px`; AM15's ported-values table specifies `2px`.
`border:2px solid {{ tA.core }}` in the port table; computed `borderWidth` is `1.5px` on
all 8 dots, both modes. The inline style sets `height`/`width`/`marginLeft`/`borderColor`
but not `borderWidth`, so `.modelDot`'s existing `1.5px` wins. The ring is the separator
that makes the stack legible; at 12px diameter, 1.5 vs 2 is a 25% thinner separator.
Small, but it is a ported value that did not port.

### N5 — PACKET / AM15 DEFECT: cell `T3-C2-5` item (1) contradicts the ratified `T3-C2-3` decision, and cannot be satisfied with it.
Item (1) demands *"each row's `backgroundColor` is `--core`"*. But
`slices/T3/PLAN.md:94-95` directs `data-bezel="shell"` on the **row wrapper** and
`data-bezel="core"` on its **inner body**, and `slices/T3/DECISIONS.md:18` ratifies exactly
that (ARCH-01, 2026-08-31), sharing the T1 vocabulary (`T1/PLAN.md:89-91`:
*"`shell` (outer, `background: var(--shell)`) / `core` (inner, `background: var(--core)`)"*).
`--shell` ≠ `--core` in both modes (`#EFE9E0`/`#FDFBF6`; `#221D17`/`#181410`).

**The worker implemented the ratified decision.** AM15's ported-values table transcribes
the binding original's *single-surface* row (`background:{{ tA.core }}`) without reconciling
it against the double bezel T3 R4 requires — so item (1) asks for a flat row and
`T3-C2-3` asks for a bezel, and no implementation satisfies both.

**This is a finding against the AM15 cell, not against `fd82d84e`.** Required amendment —
item (1) should read: *the row's `backgroundColor` is `--shell`, its
`:scope > [data-bezel="core"]` child is `--core`, both differ from the page `--bg`, and the
row's `borderRadius` is non-`0px`.* Every clause of that restatement is **CONFIRMED** by my
measurements above. The packet §1 reproduces the same defect verbatim and inherits it.

### N6 — PACKET DEFECT: two read-order paths do not resolve from the seat's cwd, and one cites a document absent from this worktree.
The packet states *"paths relative to YOUR cwd"*.
- **Item 4, `§AM16`** — `grep -rn AM16` over this worktree returns **only the packet
  itself**. AM16 exists on branch `dev`
  (`docs/missions/ui-overhaul/architecture/dispatch-order.md:305`, `:343`), not on
  `slice/t3`. I read it via `git show dev:./…` (read-only git, in bounds). A packet that
  binds a seat to a law — *"AM16 LAW: you may NOT write, regenerate or edit a dump"* —
  which is not in that seat's tree is a defect; the seat can only obey it by guessing or by
  reaching outside its branch.
- **Item 5, `slices/T3/SPEC.md` / `PLAN.md`** — real paths are
  `docs/missions/ui-overhaul/slices/T3/…`.
- Item 4's *"dispatch-order.md row 14"* and the 9-file/37-test expectation are **correct**.

### N7 — BLOCKER against my own completion: this session has no board tool.
The packet §4 makes the verdict *"the final board comment on `t_93f9780a`"* and read-order
item 3 requires *"the worker handoff on `t_1d7f74a9` (10:53)"*. **No Kanban/board MCP is
available in this session** — `ListAgents` shows only peer Claude sessions, and a
`ToolSearch` for board/ticket/comment tools returns only `DesignSync` and `Monitor`.
Per §2.7 I state it rather than guess: **I could not read the worker's board handoff and I
cannot post the board comment.** This report is the verdict of record; its text must be
posted to `t_93f9780a` by a seat that has the board.

Consequence for `heartbeat-reviewer` §5: I could not check the worker's **`SKILLS LOADED:`**
line, because that line belongs to the board handoff. What I can check, I did — the worker's
file report `.hermes/reports/ui-overhaul/agent-reports/CODE-T3C2-codex.md` carries **no
`SKILLS LOADED:` line**. Whether that satisfies §3b depends on the board comment I cannot
read, so I file this as *unverified*, not as a violation. **Do not close this ticket without
someone confirming that line on `t_1d7f74a9`.**

---

## 8. What I did NOT verify — gaps for the next lens

- **The worker's board handoff on `t_1d7f74a9`, and its `SKILLS LOADED:` line** (N7).
- **The V-QA half `T3-C2-6`.** Mine to restate, V's to answer.
- **Hover state.** `.debateCard:hover` promises `border-color: var(--line-strong)` and a
  box-shadow; AM15's port table also specifies `transform: translateX(4px)` on hover, which
  **is not in the shipped CSS at all** — I measured the resting state only and did not
  chase this. Worth one probe by the next lens: the sprung `cubic-bezier(.34,1.56,.64,1)`
  slide is a named ported value and I saw no `transform` on `.debateCard:hover`.
- **Fonts.** The dump has no `next/font` faces, so `--font-sans` / `--font-mono` fell back
  (`.count` computed `fontFamily: "Times"`). Every colour and geometry number above is
  unaffected; any *type* claim from this dump would not be.
- **The real running app.** I measured a served DOM dump, which is what AM16 assigns to
  this seat. Layout inside a real Next.js document, with real fonts and real data, is the
  V-QA half's job.
- **`web/app/page.tsx` rendered.** I read it as source only (it is outside my probe scope);
  B1 rests on source inspection plus the s8 test's own new assertions.

## 9. Teardown

- `.playwright-mcp/` was written to `dialectical-engine/.playwright-mcp/` (untracked,
  `git ls-files` = 0). Deleted. **The tracked `.playwright-mcp/` at the git ROOT (4 files)
  was NOT touched** — this is AM16 step 5's exact trap, and `git status --porcelain
  .playwright-mcp` at the root is **empty** after cleanup.
- Product/test files restored byte-exactly after every RED and every mutant:
  `page.tsx` OK, `DebatesBuffer.tsx` OK, `t3-library.test.tsx` OK (`shasum -a 256 -c`).
- Both dumps re-hashed at verdict: **unchanged**, still matching the packet.
- `git status --porcelain` at the git root shows exactly one entry: my own untracked packet
  `CODE-T3C2-REV.md`. **Clean over `apps/` and `tests/`.** HEAD still `fd82d84e`.
- Loopback server on `127.0.0.1:8817` stopped. Scratch confined to `/tmp/t3rev/`.

## 10. CONFIDENCE

**High** on the six browser measurements, the seven mutant kills, the RED, and all four
gates — each was run by me, from this tree, with output quoted, and the two colour claims
that could have been transition artifacts were re-run to stability across three passes.
**High** on B2 (four measured colour triples plus three corroborating call sites).
**Medium-high** on B1: the source facts are certain, but whether it blocks *this commit* or
merely earns a same-day ticket is a routing judgement I am making without the board
history — if `t_1d7f74a9` already carries a ticket for the `web/` divergence, B1 collapses
to an N-finding about the test's name and comment, and my REWORK becomes a PASS with five
N-findings. **Whoever routes this should check that first.**

## 11. STRONGEST COUNTER to my own verdict

*"You are blocking on a comment and a colour class. The cluster met every cell it was
given, killed every mutant, and passed every gate; both blockers are outside the cells, and
one of them (`web/`) is outside the write contract entirely. That is a PASS with tickets."*

It is the strongest counter and it is partly right — nothing in the cluster's own
acceptance is unmet, and a reviewer who invents scope is a cost. I hold REWORK on two
grounds. B2 is a **user-visible falsehood on a public page, newly introduced by this
commit**, with the correct token (`pillBad` → `--dispute-*`) already present and already
used four lines away in this cluster's own sibling file; shipping it because no cell
happened to name it is precisely the failure the fidelity law was written to end — a green
board over a surface that reads wrong. B1 is one line of test comment inside this cluster's
own write surface, and the alternative is a parity pin whose name asserts the opposite of
what it enforces. Both fixes together are small, in-contract, and same-session. That is
what round 1 of 3 is for.

The counter I could **not** dismiss is on B1's tier, and I have said so in §10.

## 12. T3-C2-6 — the V-QA question, restated verbatim for V

> **Does the library read as two pill selectors with a live count, over a stack of bezel
> cards each showing the claim, who asked, the models that argued it, and its status — in
> both modes?**

Answered by V on the running app, recorded on `t_93f9780a`. Two things measured here that
V should be pointed at while looking:
1. **On the *Public debates* tab the rows show no model dots and no time** (N1) — so "the
   models that argued it" is, today, answerable **only** on *Your debates*. V should be
   asked the question separately per tab.
2. **A `CONTESTED` debate is the same gold as a `Generating` one** (B2) — if V is shown a
   contested public debate, "its status" will read wrong.

## 13. PREDICTIONS (falsifiable evidence that blindness held)

Written before any contact with another lens.

1. **The other lenses will report item (1) as a PASS**, by reading "the row" as the
   `data-bezel="core"` element and quoting `rgb(253,251,246)` / `rgb(24,20,16)`. That is
   the natural reading if you measure the element the cell *wants* to exist rather than the
   one carrying `data-library-row`. It hides N5 — the cell/DECISIONS contradiction survives
   into the next slice and T4/T6/T7/T8 inherit the same broken port table. **Check first:**
   `getComputedStyle(document.querySelector('[data-library-row]')).backgroundColor` — the
   attribute the cell's own sibling `T3-C2-3` defines as the row.
2. **A lens that measured `border-color` will report a chamber dark-mode bug** and quote
   `rgba(41,38,31,0.1)` under `data-mode="chamber"`. It is a `transition: border-color 0.2s`
   artifact and there is no bug. **Check first:** read the same property twice, 700 ms
   apart, in the same mode — mine disagreed with *itself* across two terracotta passes
   before I settled it. Anyone reporting a border defect without a settle step has a
   phantom.
3. **B2 will be missed by every lens.** No cell mentions the public status chip, the yours
   dump has no `CONTESTED` row to compare against, and the equality only appears when you
   put the two dumps' chip colours side by side. **Check first:** diff `pillGen` `color`
   across the two dumps.
4. **B1 will be missed or waved through.** The s8 test is green, the diff reads as a
   tightening (regex count + positional pin *are* stronger for `apps/ui`), and seeing the
   defect requires opening `web/app/page.tsx`, which is in nobody's write contract.
   **Check first:** `grep -c "may be indexed" web/app/page.tsx` and ask whether the test's
   own name is still true.
5. **A lens will over-read the M1 result** and claim the cluster catches a hard-coded count
   on the yours tab. It does not — that kill comes from the public tab and `pda-s03` (§5).
6. Where I expect to be **wrong**: B1's tier (§10), and I may be over-reading N4 — `1.5px`
   may have been ratified elsewhere in the token contract and I did not search the whole
   ADR set for it.

---

# SELF-REPORT — the murder case

> *treat it like a murder case. I want to get a nice report on what can be done better.
> What we must upgrade. what repeatedly costed us tokens. how we can make the coding more
> efficient. How can we turn this into a one prompt machine even better.*

### The killer: a fidelity cell transcribed from the design original without being diffed against the ratified DECISIONS entry.

`T3-C2-5` item (1) and `T3-C2-3` cannot both be satisfied (N5). They were written five days
apart by the same architecture lane: `DECISIONS.md:18` ratified the shell/core split on
2026-08-31; AM15 transcribed the original's flat `background:{{ tA.core }}` row on
2026-09-01 and never re-read it. **Cause: the ported-values table is built by reading the
design export, and nothing forces a second pass against the slice's own DECISIONS.**

**Price.** Small here — one worker did the right thing anyway, and one reviewer spent maybe
15 minutes proving the cell wrong rather than the code wrong. But AM16's inheritance clause
sends this same port-table method into **T4, T6, T7 and T8**, and the *next* seat may
"fix" working code to satisfy a broken cell. That is a full rework round plus a
product regression, and it is now scheduled four times over.

**Upgrade, one line, mechanical:** every ported-values table row that names a token must
cite the DECISIONS entry it agrees with, or say `no DECISIONS entry`. A row that names
`--core` for an element another row marks `data-bezel="shell"` fails to write. It is a
grep, not a judgement.

### What repeatedly costs tokens, in the order it cost them here

1. **Reading a law that is not in the tree (N6).** `grep -rn AM16` returned only the
   packet. I had to discover the law lived on `dev`, then re-derive the branch, then
   `git show dev:./…` with the right prefix (the first attempt failed on the
   `dialectical-engine/` path root). ~4 tool calls to read one section the packet declared
   binding. **Fix: a packet that cites a document not on the seat's branch must carry the
   `git show <branch>:<path>` line, or the section inline.** Two paths in the same packet
   (item 5) also did not resolve. This is a class, not three typos: **the packet's paths
   are written from the orchestrator's tree, not the seat's** — and the packet says the
   opposite in its own header.

2. **Not knowing the repo root ≠ the cwd.** `git show fd82d84e:apps/…` fails; it needs
   `./apps/…` because the worktree root is one level up. Cost me two failed calls, and it
   cost the same thing again on the `dev` read. **Fix: one line in the packet — `git root
   is <path>; your cwd is <path>/dialectical-engine; prefix read-only git paths with `./`.`**

3. **Port collisions on loopback.** `8791` was already held by something answering JSON.
   `python3 -m http.server` also silently ignored my `cd` (the harness resets cwd between
   calls) and served the wrong directory, giving a 404 that *looked* like a missing file.
   Three calls. **Fix: the DOM-DUMP BROWSER KIT should publish the exact serve line —
   `python3 -m http.server $PORT --bind 127.0.0.1 --directory <dir>` with a free-port
   scan.** The `--directory` flag is the whole fix; `cd &&` does not survive this harness.

4. **The transition trap — the one that nearly killed the review.** See below.

### THE NEAR-MISS — I almost filed a phantom dark-mode bug

My first pass set `dataset.mode = 'chamber'`, forced layout, and read `border-color`:
`rgba(41, 38, 31, 0.1)` — the **terracotta** value, under chamber. That is a textbook
"tokens frozen in dark mode" defect and I started writing it up. I only caught it because
the *second* isolated read returned the correct `rgba(242,234,217,0.09)`, and then two
consecutive **terracotta** reads disagreed with each other
(`rgba(234,226,209,.09)` → `rgba(226,218,202,.09)`). Values that disagree with themselves
are not defects; they are measurements. `.debateCard` has
`transition: border-color 0.2s` (`globals.css:1075`).

**What saved me was re-running the same read, not reasoning about it.** Had I taken one
pass — which is what the kit's step 4 literally describes — I would have filed a
confident, fully-quoted, completely false blocking finding against a correct token
contract, and cost a rework round on code that is right.

**Upgrade — add to the DOM-DUMP BROWSER KIT as step 4a, binding:**
> After setting `dataset.mode`, **wait past the longest CSS transition on the elements you
> are about to measure** (grep the stylesheet: this repo's cards are `0.2s`) and **read
> every value twice**. A value that differs between two reads in the same mode is a
> transition, not a finding. Mode-switch measurements taken in the same task as the switch
> are void.

This is the second time this mission has paid for a browser-half measurement artifact
(`CODE-T1C2-REV-claude.md` §11.2 was the `listen EPERM` one). Both were **harness physics
misread as product defects**. The kit currently documents *what* to read and says nothing
about *when* the value is trustworthy — and jsdom, which everyone's instincts are trained
on, has no transitions at all, so nobody expects this.

### DEAD ENDS — do not re-derive these

- **`.playwright-mcp` teardown.** The MCP writes to the **cwd** (`dialectical-engine/`),
  not the git root. The tracked one is at the **root**. So the correct teardown is
  `rm -rf ./.playwright-mcp` from the cwd and *nothing at the root* —
  `git ls-files .playwright-mcp` returns 0 from the cwd and 4 from the root, which is how
  you tell them apart. AM16's warning is right but describes the root case; the trap in
  practice is that they are two different directories with the same name.
- **Independently regenerating the dump.** I considered adding my own `it("DUMP")` under
  cp+sha256 isolation to prove provenance. **Do not** — AM16 forbids the review seat
  obtaining a dump by editing the worker's files, and it is unnecessary: the React
  serializer signature (`borderRadius: 13` → `13px`, `data-library-row` → `="true"`,
  object-literal key order preserved) plus fixture-string multiplicity is a complete
  provenance proof at ~1 tool call. §1 above is the template; reuse it.
- **`vitest list <file> | wc -l`** works for guard rail 2, but you must restore the parent
  test file to get the "before" number — the count is not derivable from the diff.

### Where the packet fought me

1. **It made my verdict a board comment and gave me no board (N7).** This is the single
   biggest structural defect in this dispatch: the packet's §4 names a deliverable the seat
   provably cannot produce, which is the **AF-1 acceptance shape** this mission has already
   paid for four times and which AM16 was written to end for the browser half. It ended it
   for *tooling* and reintroduced it for *the handoff channel*. **Fix: the `allowed` list
   must be checked against the seat's actual tool surface at dispatch — the same
   pre-dispatch gate that checks the write surface.**
2. **It asked me to "confirm the s8 pins still slice between `published.items.map` and
   `</article>` and NO JSX moved across"** — but `T3-C2-4`, in the same packet's own read
   order, *requires* JSX to move across exactly that boundary. I answered both readings
   (§6) because I could not tell which was meant. **Fix: that line should read "confirm no
   JSX left `page.tsx` (the T9-C1 hoist prohibition) and that the s8 re-anchor is at least
   as strong as what it replaced."** That is the question that has an answer.
3. **It reproduced N5 verbatim in §1**, so obeying the packet literally means filing a
   false finding against correct code. A packet that quotes a cell inherits the cell's
   defects — which is the argument for reviewing the packet first, and for the packet
   citing the DECISIONS entry beside the cell.

### Toward the one-prompt machine

- **Make the packet's path block executable, not prose.** A `preflight.sh` that `cd`s
  nowhere, resolves the git root, and `stat`s every path the read order names — failing
  loud on the first miss — turns N6's three-defect class into a zero-token gate. Every
  packet in this mission carries paths; roughly every packet has had at least one wrong.
- **Ship the browser half as a committed probe script, not a prose kit.** Serve-line,
  free-port scan, mode switch, settle, double-read, teardown, and the six-item JSON shape
  are identical for T5-C1-8, T1-C3, T4, T6, T7, T8. I hand-wrote ~120 lines of `evaluate`
  that the next five seats will hand-write again, differently, and at least one of them
  will skip the settle. **`.hermes/skills/dom-dump-probe.mjs <dump> <selector-map>` would
  pay for itself on the very next cluster** and would make the six measurements
  *comparable* across clusters instead of prose.
- **Two lines in every packet would have removed a third of my tool calls:** the git-root/
  cwd/`./` prefix line, and the `git show <branch>:<path>` line for any cited document not
  on the seat's branch.
- **The deepest fix is cheapest.** N5 exists because two documents disagreed and nothing
  compared them. The fidelity law already demands two halves per cell; it should also
  demand **one citation per ported token row**. A cell that cannot name the DECISIONS entry
  it agrees with is not ready to dispatch — the same status AM14 gave a cell with no
  browser half.

`comments read through:` **none — no board tool in this session (N7).** All ticket comments
on `t_93f9780a` and `t_1d7f74a9`, including the worker's 10:53 handoff, are UNREAD by this
seat. This is a stated gap, not an omission.
