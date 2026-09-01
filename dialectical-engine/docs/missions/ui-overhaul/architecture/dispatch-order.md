# DISPATCH ORDER — 32 clusters, dependency-ordered, one Codex seat each

## Reading this table

- **Wave** — clusters in the same wave have disjoint write surfaces AND
  disjoint regression sets; they may run concurrently subject to
  `max_concurrent_heavy` (laptop = 1, spine `## Parallelism and file ownership`).
- **Writes** — the cluster's `contract.allowed`. Anything not listed is
  `forbidden` for that cluster.
- **Verify** — a real shell command whose first token resolves. Each is run
  **three times** and the WORST run is the verdict (spine v3.3.0 item 12).
  Every command bundles the slice's regression set from `test-migration.md`,
  because surface-disjointness does not imply effect-disjointness.

`globals.css` has exactly **TWO** writers for the whole mission: **T9-C3** (the
token blocks, the fonts, and its ADR-001 literal sweep) and — added 2026-09-01,
AM6/charge 2 — **T3-C1**, for the single `/` chrome suppression rule in
`T3-C1-4` and nothing else. Every other cluster's `forbidden` set names the
`:root` and `html[data-mode="chamber"]` blocks explicitly, and so does T3-C1's.

The second writer is declared rather than quietly permitted because
single-writer-per-file is a mission law and this is an exception to it. It is
bounded three ways: one named rule, a cell that fails if a second rule appears
in the diff, and the token blocks still forbidden. The rule contains no colour
literal, so neither the wave-0 nor the mission-final ADR-001 oracle changes.

### Acceptance defaults — every cluster, in addition to the command in its row

**COMPILE GATE (added 2026-08-31, AM2/C).** Every cluster that writes any file
under `apps/ui/` also runs the workspace compile gate at **0-new**. That is every
cluster below except the pure test-migration ones that write only under `tests/`
(T9-C5, T1-C4, T3-C4, T4-C4, T5-C3, T6-C4, T7-C4, T8-C4):

```sh
# 1. Locate the pnpm WORKSPACE root. It is NOT the git repo root: this repository's
#    toplevel is DebateAIRO/, and its child dialectical-engine/ is what holds package.json.
start=$PWD; root=$PWD
while [ "$root" != "/" ] && [ ! -f "$root/apps/ui/tsconfig.json" ]; do root=$(dirname "$root"); done
[ -f "$root/apps/ui/tsconfig.json" ] || { echo "GATE FAIL: no pnpm workspace root at or above $start (looked for apps/ui/tsconfig.json)"; exit 2; }
cd "$root" || exit 2
[ -f apps/ui/tsconfig.json ] || { echo "GATE FAIL: apps/ui/tsconfig.json not found in $PWD"; exit 2; }

# 2. Prove a compiler actually RUNS here before trusting a count of zero.
pnpm exec tsc --version >/dev/null 2>&1 || { echo "GATE FAIL: 'pnpm exec tsc' does not run in $PWD"; exit 2; }

# 3. The gate.
pnpm exec tsc --noEmit -p apps/ui/tsconfig.json 2>&1 \
  | grep -E 'error TS' \
  | grep -v -e 'app/debate/\[id\]/DebatePageClient\.tsx(1488,11): error TS2322' \
          -e 'app/layout\.tsx(3,8): error TS2882' \
  | tee /dev/stderr \
  | wc -l          # required: 0
```

> **CORRECTED 2026-09-01 (AM6/N2).** Steps 1 and 2 are new. The previous block
> was the bare step-3 pipeline with no directory discipline at all, so run from
> anywhere without a `package.json` it prints the required `0` having compiled
> nothing — `pnpm`'s failure goes to stderr, `2>&1` merges it into the pipe, and
> `grep -E 'error TS'` does not match it. The ADR-006 copy was worse still: it
> opened by `cd`-ing to the git toplevel, which IS such a directory. Both are
> fixed; `ADR-006` §"The 0-new command" carries the four-directory run and the
> discrimination proof.

`pnpm run typecheck` is **NOT** this gate and must never be cited as one for
`apps/ui` work: root `tsconfig.json` excludes `apps/ui` and `web`, so it exits 0
without opening a single file this mission writes. That blindness is how a
non-compiling `ModeToggle.tsx` passed every named gate in Wave 0. Full law, the
two baselined errors and their evidence: `ADR-006` §"Compile-gate law".

### VERIFY-SURVIVABILITY LAW (added 2026-08-31, AM5)

**A cluster may not be dispatched into a verify command it cannot make green.**
Concretely, for every standing test `F` in cluster `C`'s verify command:

> if any cluster at position ≤ `C` writes a product file that `F` reads, then `F`
> must be inside the write surface of some cluster at position ≥ that last writer
> and ≤ `C`.

Note the `≤ C`, not `< C`: the T9-C1 block was caused by a cluster's **own**
charge, not a prior one. A rule that only looks backwards misses exactly the
defect it was written for.

The law is satisfied here by a single ownership rule, applied to every row:

> **Pin ownership follows subject ownership.** The cluster that rewrites a
> product file owns every standing pin that reads it — plus, as a second and
> narrower clause, each slice's designated migration cluster stays the
> **slice-close residual owner** of the RETARGET pins its slice touches, for
> re-anchoring after all of that slice's product work has landed.

Where several clusters own the same pin file they are already serialised by this
order and take disjoint `describe` blocks — the pattern `t9-landing.test.tsx`
(T9-C1/C2/C4) and `auth-flow-integration.test.tsx` (T7-C4/T8-C4) already use.

**Guard rails, because widening a write surface onto a test file is dangerous.**

1. **RETARGET-only.** Only the twelve files `test-migration.md` classifies
   RETARGET may enter a write surface. A **KEEP** file going red is a real
   regression: the cluster fixes the PRODUCT and never the pin. This asymmetry
   is what makes the added access safe.
2. **No case may be deleted.** A migrating cluster re-anchors and re-strings; it
   never drops a case. Evidence required in the cluster report:
   `node_modules/.bin/vitest list <file> | wc -l` before and after, and the
   after-count must be **≥** the before-count. Reaching green by deleting a case
   is falsification under R5.
3. **If you write a pin, you run it.** Every test file in a cluster's write
   surface appears in its verify command. Six rows (#7, #8, #9, #11, #12, #13)
   failed this and are corrected.
4. **Own only your subject's describes.** A cluster editing pins for a product
   file it does not write is out of contract — the slice-close clause is the one
   exception, and it is scoped to its own slice's pins.

**One row failed guard rail 1 and is corrected here.** T5-C3's write surface was
`tests/render/prov01-honesty-drawer.test.tsx`, which `test-migration.md`
classifies **KEEP** (*"Risk tier standard · MACHINE_DEFAULT — data provenance,
not chrome"*). A migration cluster holding a KEEP file is the guard rail
inverted: it makes the cheapest way out of a real regression an edit to the pin
that caught it. T5-C3 now owns `tests/unit/v2ui-pages.test.ts` instead — a
RETARGET pin that genuinely reads `NodeDetailDrawer.tsx`, the file T5 rewrites.
`prov01` stays in every T5 command as an unedited regression guard, which is
what a KEEP file is for.

### The five adjudicated exemptions — published, because an unpublished exemption is a hole

A cluster writing a file a pin reads is a **candidate** breaker, not a breaker.
Five (breaker, pin) pairs were adjudicated NOT-A-BREAK against what the pin
actually asserts; they account for every cell the raw checker reports (eight at
AM5, twelve once AM6 made T3-C1 the second `globals.css` writer).
Each one is a constraint on the cluster, and if the constraint is violated the
exemption is void and the pin is red with no owner — so they are listed, not
assumed.

| Cell | Pin's actual assertion | Why the charge cannot reach it | Constraint that keeps it true |
|---|---|---|---|
| #1 T9-C3 `globals.css` → `pda-s03` | computed `justify-content`, `gap`, `margin-left`, `font-weight`, `padding`, `border-radius`, `background`, `color`, `box-shadow` on `.sectionHead` / `.tab` / `.tabActive` / `.count` (lines 164–174) | jsdom does not resolve `var()`, so a token *value* cannot reach any of these reads; T9-C3's charge is the two token blocks and the font wiring | the `ADR-001` literal→var substitution is **declaration-preserving**: it changes values, never which selectors or declarations exist |
| #1 T9-C3 `globals.css` → `v2ui-pages` | `v2ui-pages.test.ts:579` pins the literal text `border: 1px solid var(--line-strong); … background: var(--surface-sunken); … color: var(--muted);`, plus `@media` and `[data-actions-collapsed]` rules (lines 349–352, 546) | all three custom-property NAMES survive — `ADR-001`: *"existing names are redefined; new names are added beside them"* (`token-inventory` rows for `--surface-sunken`, `--muted`, `--line-strong`) | T9-C3 may not RENAME an existing token, only redefine it |
| #2 T9-C1 `app/page.tsx` → `s8-publication-contract` | `readPublicDebates(50, 0)`, `Published debates…`, and the source slice `published.items.map` → `</article>` | an early return adds a branch above the library body; the pinned text stays in the file | the split moves no JSX out of `app/page.tsx` (stated in full above) |
| #3 T3-C1 `globals.css` → `v2ui-pages` (added AM6) | `v2ui-pages.test.ts` reads `globals.css` only for `@media` blocks, `[data-actions-collapsed]` and `[data-maker-absence]` (lines 349–352, 546, 579) | T3-C1 adds ONE rule, `.appShell:has([data-landing-section]) > .topBar`, and modifies none — it cannot intersect any pinned selector | `T3-C1-4` fails if the `globals.css` diff contains more than that one added rule; the token blocks stay forbidden |
| #3 T3-C1 `TopBar.tsx` → `auth-flow-integration` | `.authTopBar a[href="/"]` not null (lines 171, 200) and `.authTopBar [aria-disabled="true"]` **null** in the pre-auth state (line 201) | `ModeToggle` renders `aria-pressed`, not `aria-disabled`, and does not touch the brand link | the ☾ control must never carry `aria-disabled`; the `authTopBar` brand link keeps `href="/"` |

Re-running the invariant checker over this file reports exactly the cells these
five pairs generate and nothing else; with the exemption list applied it reports
**0**. Re-run after every AM6 edit, against the published markdown rather than
any working copy. A reviewer who
disagrees with an exemption has a one-line diff to make, which is the point of
writing them down.

### Verify commands now carry the full slice regression set

`test-migration.md` §"Per-slice REGRESSION set" says *"run these, every cluster,
every slice"*. **22 of the 32 rows did not.** All 32 commands below are now
`own tests ∪ slice regression set`. Measured in this edit:

```
$ node_modules/.bin/vitest list <the 30 standing paths used across all 32 rows>
paths given: 30   files collected: 30   test names: 172
NOT COLLECTED: none
```

The ten paths not in that resolution are the ten files this mission creates; they
resolve once their owning cluster has written them.

### Two negative-clause traps that no reordering can fix

Both are standing pins whose assertion is *absence*, so they are invisible to a
"which strings move" reading and are broken by adding code, not by changing copy.

| Pin | Clause | Trap | Standing constraint |
|---|---|---|---|
| `tests/unit/pol01-policy.test.ts:92` | `expect(debatePage).not.toMatch(/getStoredToken\|setStoredToken\|clearStoredToken\|localStorage/)` over `DebatePageClient.tsx` | `ADR-002`'s **second** mount point is `DebatePageClient.tsx`, and the mode mechanism persists to `localStorage` | T1-C1 mounts `<ModeToggle />`. All storage access stays inside `components/ModeToggle.tsx`, which pol01 does not read. Inlining `localStorage.setItem` at the mount site turns a green security pin red |
| `tests/architecture/auth-front-door-parity.test.ts:80` | `expect(login).not.toMatch(/localStorage\|sessionStorage\|Bearer\|OAuth\|forgot\|remember/i)` over `LoginFlow.tsx` **and** `SignUpFlow.tsx` | T9-C2 writes the return path into `LoginFlow`; T7/T8 restyle both; T8 R7 wants mode on the auth shell | The return path is the `?next=` query parameter (`ADR-004`), never web storage. The auth shells get their toggle from the `TopBar` mount (`ADR-002`), never an inline one. No new copy may contain the substrings `forgot` or `remember` |

Neither file gains a writer. If either goes red the answer is a product fix, not
a pin edit; owners of record for a legitimate change are T7-C4 (#28) and T8-C4
(#32). This is the guard-rail-1 asymmetry in its most load-bearing form.

### One more constraint the sweep forced out

`tests/architecture/s8-publication-contract.test.ts` reads `apps/ui/app/page.tsx`
as **source text** and slices it between `published.items.map` and `</article>`.
`ADR-003`'s route split is therefore constrained beyond its own acceptance:
**T9-C1 adds an early return and moves no JSX out of `app/page.tsx`.** Hoisting
the published-list markup into a component would empty that slice and take the
publication warning pins (`may be indexed by search engines`,
`Copies may persist after unpublishing`) with it — a privacy-warning regression
disguised as a refactor. T9-C1's row does not list s8 as a write for exactly
this reason: at #2 the pin must still pass unedited.

## Wave 0 — the foundation. One seat. Everything else is gated on it.

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 1 | **T9-C3** — tokens, fonts, mode mechanism | `apps/ui/app/globals.css` · `apps/ui/app/layout.tsx` · `apps/ui/components/ModeToggle.tsx` · `apps/ui/lib/debatePresentation.ts` · `tests/support/contrast.ts` · `tests/support/tokenContract.ts` · `tests/unit/t9-mode-tokens.test.ts` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/t9-mode-tokens.test.ts tests/unit/v2ui-pages.test.ts` |

T9-C3 also carries ADR-001's colour-literal sweep — **scoped to its own four
product files**, not repo-wide. Baseline **113** (`globals.css` 111 +
`debatePresentation.ts` 2; `layout.tsx` 0; `ModeToggle.tsx` new). Its acceptance
is that the **WAVE-0 ORACLE** in `ADR-001` §(a) reaches residual **0**, with the
command's output quoted verbatim — not a spot check, and not the repo-wide
sweep.

> **AMENDED 2026-08-31 (AF-1).** The original row demanded the REPO-WIDE sweep
> reach 0. That was unsatisfiable: 45 further literals live in files owned by
> later clusters, so T9-C3 could only have reached 0 by violating
> one-writer-per-file. Caught by the wave-0 coder at preflight, before any edit
> (`t_4ccac5c4`). The remaining 45 are enumerated and owned in `ADR-001` §(b);
> the repo-wide sweep survives as the **mission-final** oracle, owned by
> cluster #32 (`T8-C4`) and repeated as a QA line for V.

Nothing in waves 1–5 starts before T9-C3 is Hermes-approved. A slice that
re-skins against tokens that do not exist yet produces a diff no reviewer can
evaluate and a mode toggle that flips nothing.

## Wave 1 — chrome and route split (the two shared mount points)

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 2 | **T9-C1** — anonymous `/` vs signed-in `/` **+ mode control on the anonymous landing** | `apps/ui/app/page.tsx` · `apps/ui/components/landing/LandingPage.tsx` · `apps/ui/components/landing/LandingChrome.tsx` (the `ModeToggle` mount only) · `apps/ui/components/landing/LandingHero.tsx` · `LandingSample.tsx` · `LandingMethod.tsx` · `LandingPricing.tsx` (**empty stubs only — content is T9-C4's**; see the stub rule below) · `tests/render/t9-landing.test.tsx` · `tests/unit/pda-s03-keyboard-accessibility.test.ts` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/render/t9-landing.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/v2ui-pages.test.ts` |
| 3 | **T3-C1** — signed-in library chrome + ☾ mount in `TopBar` **+ the `/` chrome suppression rule** | `apps/ui/app/globals.css` (**the ONE rule in T3-C1-4 only** — `:root` and `html[data-mode="chamber"]` remain forbidden, as for every non-T9-C3 cluster) · `apps/ui/components/TopBar.tsx` · `apps/ui/app/page.tsx` (library half) · `apps/ui/components/LibraryComposer.tsx` · `tests/render/t3-library.test.tsx` · `tests/unit/pda-s03-keyboard-accessibility.test.ts` · `tests/architecture/s8-publication-contract.test.ts` | `pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/render/bug03-home-buffer.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/t3-library.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/s8-publication-ui.test.tsx tests/unit/t9-mode-tokens.test.ts tests/unit/v2ui-pages.test.ts` |

#### T9-C1 stub rule (added 2026-08-31, AM4)

`LandingPage.tsx` composes five children. T9's PLAN HOW rules: *"C1 ships it with
the five children as empty stubs; C2 and C4 fill them."* A contract-obedient C1
therefore **must create all five files**, or `LandingPage`'s imports do not
resolve, the ADR-006 compile gate goes red on module-not-found, and the seat
correctly refuses to proceed.

- `LandingChrome.tsx` — created by C1, which also mounts `<ModeToggle />` in it
  (AM2/D). Its chrome copy is **T9-C2's** (row 4).
- `LandingHero.tsx`, `LandingSample.tsx`, `LandingMethod.tsx`,
  `LandingPricing.tsx` — created by C1 as **empty stubs**. Their content is
  **T9-C4's** (row 5).

**One exception, forced by C1's own acceptance:** the hero stub is not empty. It
must render the exact string `Find the weakest claim in your own argument.`,
because `T9-C1-1` asserts that headline on the no-session `/` render. A literally
empty `LandingHero` makes T9-C1's own acceptance unsatisfiable — the AF-1 shape
again, one file down.

Everything else in the four stubs is T9-C4's to write. C1 adding copy beyond the
headline is a contract violation in the other direction, and row 5 owns it.

#### T9-C1 additional acceptance — CH1, the anonymous-landing mode control (added 2026-08-31, AM2/D)

SPEC T9 **R3** requires the mode control on the **anonymous landing**. Nothing in
the plan pinned it there: T9-C3 proves `ModeToggle` in isolation (both mounts are
outside its contract), T3-C1-3 pins it on the **signed-in library**, and T9-C1's
existing rows assert only the hero headline and the route split. The control
could therefore have been absent from the one surface R3 actually names, with
every cluster green. Same uncovered-acceptance class as AF-1; found by the Wave-0
blind review (`t_4ccac5c4`, "coverage hole, flagged not resolved").

SPEC and PLAN are frozen, so the pin lives here in the cluster contract, which is
the dispatch source of truth.

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **T9-C1-3** | R3 | The anonymous landing renders the mode control | In `tests/render/t9-landing.test.tsx` (owned by T9-C1): render the anonymous `/` document — the same no-session render as T9-C1-1 — and assert that `document.querySelector('[data-landing-section="chrome"] [data-mode-toggle]')` is non-null and its accessible name matches `/Switch to (Chamber\|Terracotta) mode/`. **The subtree scope is part of the acceptance, not a style preference** (see §"Landing query convention"): `layout.tsx:44` renders `TopBar` into the same document, and from dispatch row 3 `TopBar` mounts a `[data-mode-toggle]` of its own, so an unscoped query passes with the landing's control deleted. Asserting the `☾` glyph alone = RED (the glyph is decoration, the label is the contract). Asserting that `ModeToggle` is merely imported = RED — the assertion is on the RENDERED anonymous-landing output |

> **AMENDED 2026-09-01 (AM7, found by this amendment's own cell audit — not
> charged).** This cell read *"assert the markup contains an element carrying
> `data-mode-toggle`"*, unscoped. That is precisely the query the T9-C1 review
> filed as blocking B1 and proved green with the landing's control deleted. The
> **test file** was fixed in T9-C1's rework and AM6 published the general
> convention, but **the cell itself was never amended** — and the cell is what a
> rework packet quotes verbatim, so the defect was one packet away from being
> reissued. Fixed here to match the convention it should always have matched.
>
> The audit that found it exists because AM7's changelog was about to claim
> *"every remaining cell has been read against the real-artifact rule"*. Running
> the claim instead of writing it turned up the counter-example in the same
> file — which is the AM6/AM7 lesson applied to my own prose rather than to
> someone else's code.

**V QA line (human-runnable, for the manual acceptance):**

> Open `/` in a private window, logged out. **Expect:** the mode control is
> visible in the landing chrome. Click it. **Expect:** the landing switches
> between Terracotta and Chamber, and `<html>` carries `data-mode="chamber"`
> after the first click. Reload the page. **Expect:** the chosen mode persists
> and there is no flash of the other mode before paint.

`LandingChrome.tsx` is **created by T9-C1** with the `ModeToggle` mount in it
(AM4 stub rule); **T9-C2 fills its chrome copy** at row 4. The pin and the thing it
pins therefore land in the same cluster — a pin whose subject is created by a
later cluster is not a pin.

> **CORRECTED 2026-08-31 (AM5).** This paragraph previously read *"`LandingChrome.tsx`
> is created by T9-C2 for its chrome copy"*, which contradicted the AM4 stub rule
> eleven lines above it and row 2's own write surface. Same AF-1 class, prose
> instance.

### Landing query convention (AM6/charge 3) — T9-C1, T9-C2, T9-C4 all inherit this

`apps/ui/app/layout.tsx:44` renders `<TopBar />` on every route, above
`{children}`. Every landing acceptance therefore runs against a document that
contains **the landing plus the application bar**, and an unscoped
`document.querySelector` cannot tell which one it found. That is not a
hypothesis: the T9-C1 review proved it by simulating T3-C1's contracted `TopBar`
☾ mount and deleting T9-C1's own — `t9-landing.test.tsx` stayed `5 passed (5)`
with SPEC T9 R3's control absent from the landing.

**The convention, in three lines:**

1. **Every landing region carries `data-landing-section="<name>"`** on its root
   element. The five names are exactly the five children of `LandingPage`:
   `chrome` · `hero` · `sample` · `method` · `pricing`.
2. **Presence assertions scope to the owning subtree.**
   `document.querySelector('[data-landing-section="chrome"] [data-mode-toggle]')`,
   never `document.querySelector('[data-mode-toggle]')`. Same for the hero
   headline (`[data-landing-section="hero"]`), the CTAs, the method steps and
   the pricing strip.
3. **Absence assertions stay document-wide.** `.sectionHead` and `.tabEmptyHint`
   must be absent from the *whole* anonymous document, not from a subtree.
   Absence over a superset is a strictly stronger claim; scoping it would weaken
   it. This is the one case where the unscoped query is the correct one.

**Why an attribute and not a class.** Classes are style surface and get renamed
by re-skins — this whole mission is a re-skin. `data-landing-section` is
assertion surface with no style meaning, so nothing in T9-C2's or T9-C4's charge
has a reason to touch it. ADR-006 freezes class names for the same reason in
the opposite direction; this is the complementary tool.

**It is also product markup, not test scaffolding.** The `/` chrome suppression
rule (ADR-002 §"How the suppression is implemented") selects on
`.appShell:has([data-landing-section])`. A seat that drops the attribute does
not merely weaken a pin — it silently restores the duplicate header on the
anonymous landing. Stated here because "it's only for tests" is exactly the
reasoning that would remove it.

**Scope of the retrofit.** T9-C1 (row 2) introduces the attributes as part of
its B1 rework; T9-C2 (row 4) and T9-C4 (row 5) inherit them and add no new
unscoped landing query. The review's own class sweep lists the members: the
`[data-mode-toggle]` existence check (blocking, B1), the `+ New debate`
signed-in assertion (vacuous today — only `TopBar.tsx:85` emits that string, on
every route), and the hero headline read via `document.body.textContent`. All
three take the same one-line remedy.

#### T9-C1's `pda-s03` migration — what it may pin at position #2 (AM5)

`tests/unit/pda-s03-keyboard-accessibility.test.ts` enters T9-C1's write surface
because T9-C1's route split is what breaks it. Measured, not assumed:

```
$ pnpm exec vitest run tests/unit/pda-s03-keyboard-accessibility.test.ts
Test Files  1 passed (1)   Tests  5 passed (5)
```

**The packet's constraint 2 is factually wrong and the seat must not follow it.**
It says *"Session cases are unaffected."* There are **no session cases**. The file
has ONE module-level mock —

```ts
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), … }));
```

— so all **5 of 5** cases render the anonymous `/`, and all five assert on
`.sectionHead[aria-label="Debate library"]` / `.tabEmptyHint`
(lines 94, 124, 134, 146). The split takes the whole subject away from every one
of them. Recorded here because a seat reading the packet would otherwise migrate
half a file and leave the rest red.

**The migration is a MOCK change, not an assertion rewrite,** for four of the
five cases. After the split the library moves to the signed-in `/`, whose markup
T9-C1 does **not** touch — so the assertions still hold verbatim; only the
document they run against changes:

```ts
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "__Host-debateai-session" ? { value: "pda-s03-render-test" } : undefined
  }),
  headers: async () => new Headers({ "user-agent": "pda-s03-render-test" })
}));
// and, in the existing @/lib/serverApi mock, add:
listDebatesPageServer: async () => ({ summaries: [], total: 0 })
```

(`USER_TOKEN_COOKIE = "__Host-debateai-session"`, `apps/ui/lib/serverApi.ts:14`;
`HomePage` reads it at `apps/ui/app/page.tsx:19` and calls
`listDebatesPageServer` at line 40. With a token present `sessionConfirmed` is
true, `tab` still honours `searchParams`, and `.sectionHead` / both links /
`.count` render exactly as the four cases expect.)

The fifth case — the `.tabEmptyHint` *"Sign in or create an account above to see
your debates."* — is the one whose subject the SPEC genuinely deletes: it is
anonymous-only, and the anonymous surface no longer has a library. **It is
re-pointed, not dropped**, to the property the split now owns:

| At #2 T9-C1, the migrated case MAY pin | Because it exists at #2 |
|---|---|
| anonymous `/` renders **no** `.sectionHead[aria-label="Debate library"]` and **no** `.tabEmptyHint` | the route split itself |
| the exact hero headline `Find the weakest claim in your own argument.` | the hero-stub exception in the stub rule above |
| a mode control that is a native `<button>`, `tabIndex` 0, no `disabled`, no `aria-disabled="true"`, accessible name matching `/Switch to (Chamber\|Terracotta) mode/`, and `knownConcealmentBarrier(el) === null` (the file's own helper, line 51) | T9-C1 owns the `ModeToggle` mount in `LandingChrome` (AM2/D) |

It may **NOT** pin nav labels or CTA copy (T9-C2's, row 4), method/sample/pricing
content (T9-C4's, row 5), or token values (`t9-mode-tokens.test.ts`, row 1).
Case count in = 5, case count out ≥ 5, per guard rail 2.

**Then the pin changes hands twice more, both times to its breaker:**

| # | Cluster | Why it owns the pin | What it does to it |
|---|---|---|---|
| 3 | T3-C1 | restyles the signed-in library chrome — the `.sectionHead` group the four re-pointed cases now measure | re-anchor the computed-style cases to the new chrome |
| 14 | T3-C2 | SPEC T3 recases the selectors to `Your debates` / `Public debates` and adds `4 TOTAL` | update `expectedTabs` (line 31) and the `.count` expectation |
| 6 | T9-C5 | unchanged role: **T9 slice-close owner** | residual re-anchor once C2's chrome copy and C4's content have landed |

Without #14 in that list the pin would have gone red at T3-C2 with its migration
scheduled two rows *earlier* — a second instance of the same defect, found only
because the sweep was run over all 32 rows rather than around T9-C1.

#### T3-C1 additional acceptance — T3-C1-4, the `/` chrome suppression (AM6/charge 2)

**This cell is what gated T3-C1's dispatch.** The adjudication, its three
grounds and the two rejected alternatives are in `ADR-002` §"The `/` chrome
adjudication"; the decision is: **on anonymous `/`, `TopBar` does not render.**
T3-C1 is the cluster that makes the defect visible — it adds the second ☾ — and
it is the first cluster after HEAD that can legally take a `globals.css` write.

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **T3-C1-4** | T9 R3 + T9 States 1 (`"the landing IS the document"`), T3 R1 | The layout's global bar is suppressed when the landing is the document, and present when the library is — **proved on the real documents the product emits, not on a document the test writes** | In `tests/render/t3-library.test.tsx` (owned by T3-C1), all three parts REQUIRED. **P1 — real anonymous `/`** (the existing route helper with `sessionCookie = null`) rendered into JSDOM with `globals.css` injected: `[data-landing-section]` markers = **5**; `.topBar` present; `getComputedStyle(.topBar).display === "none"`. **P2 — real signed-in `/`** in the same harness: `getComputedStyle(.topBar).display === "flex"`; `.topBar [data-mode-toggle]` non-null with accessible name matching `/Switch to (Chamber\|Terracotta) mode/`; its computed `display !== "none"`. **P3 — shape**: `apps/ui/app/layout.tsx` matches `/<div className="appShell">\s*<TopBar \/>/`. The synthetic hand-built documents MAY remain as fast unit-level guards; they are not the acceptance

> **REWRITTEN 2026-09-01 (AM7, blocking finding B2 on `t_9d3f1f2d`).** The cell
> previously read: *"build a document containing `.appShell > header.topBar`
> plus a `[data-landing-section]` element"*. That prescribed a **synthetic**
> document, so the selector was only ever validated against shapes the test
> hand-writes — and `apps/ui/app/layout.tsx`, the file that actually emits
> `.appShell > <TopBar />`, was read by no test in the render suite. The worker
> obeyed the cell to the letter and added a real-render arm on top; the defect
> is mine. Measured by the reviewer:
>
> ```
> M6  TopBar nested one div deeper in layout.tsx
>     row-3 command (12 files)          -> 12 passed / 92 passed   NOT CAUGHT
>     widest usable net (22 files)      -> 22 passed / 102 passed  NOT CAUGHT
> ```
>
> Under M6 the `:has() > .topBar` child combinator stops matching and **the
> whole AM6 two-toggles adjudication silently reverts** — two headers, two
> wordmarks, two ☾ on anonymous `/` — with every acceptance in the mission
> green. The P1/P2/P3 form above is the reviewer's, adopted **verbatim**; they
> built it and it passed first try.

**Why the trio and not a fourth part.** Each part closes a mutant the others
miss, which is why none of them is redundant:

| Mutant | P1 | P2 | P3 |
|---|---|---|---|
| suppression rule deleted | RED | — | — |
| selector broadened to `.appShell > .topBar` (hides the bar everywhere) | — | RED | — |
| `display:none` → `visibility:hidden` (concealment, not suppression) | RED | — | — |
| `[data-landing-section]` dropped from the landing roots | RED (markers ≠ 5) | — | — |
| ☾ removed from `topBarActions` | — | RED | — |
| **M6 — `TopBar` nested deeper in `layout.tsx`** | — | — | **RED** |
| **M9 — `.appShell` renamed in `layout.tsx`** | — | — | **RED** |

**Re-derived independently in this edit** — the reviewer's regex against the real
file and against both structural mutants, before adopting it:

```
P3 regex vs SHIPPED layout.tsx     : MATCH
P3 regex vs M6 (TopBar nested)     : NO MATCH  <- RED, catches M6
P3 regex vs M9 (.appShell renamed) : NO MATCH  <- RED, catches M9
```

and P1's marker count is contractual, not incidental — the five names published
in §"Landing query convention" each occur exactly once in product source:

```
$ grep -rho 'data-landing-section="[a-z]*"' apps/ui/components/landing/ | sort | uniq -c
   1 data-landing-section="chrome"     1 data-landing-section="hero"
   1 data-landing-section="method"     1 data-landing-section="pricing"
   1 data-landing-section="sample"
```

P2's `display !== "none"` resolves against `.modeToggle { display: inline-flex }`
(`globals.css:377`), and the suppression rule is the single occurrence at
`globals.css:219` — exemption #3's one-rule bound still holds.

jsdom **30.0.1** supports `:has()` and propagates it through `getComputedStyle`,
which is what makes a computed-style assertion legal here at all; that probe was
run at AM6 and is unchanged. What it did **not** establish, and what B2 is, is
*which document you run it against*.

**One residual, named rather than left to be found.** P3 pins that `<TopBar />`
sits directly inside `<div className="appShell">`. It does **not** pin that
`{children}` also sits inside it. Measured here:

```
P3 regex vs M-children (children hoisted OUT of .appShell): MATCH  <- not caught
```

Hoisting `{children}` out of `.appShell` would stop `:has()` from matching and
restore the duplicate header with P1/P2/P3 unable to see it — P1 renders its own
composition, so it would still pass. It is far less plausible than M6 (it breaks
the flex-column shell that lays the whole app out) and **no cluster in the 32
rows writes `layout.tsx`**, so there is no owner to route it to. It is therefore
a **V closure line**, stated here and repeated in the handoff, not a silent
extension of the reviewer's verified form.

#### T3-C1 additional acceptance — T3-C1-5, the `authTopBar` ☾ mount (AM7/charge 2, from B1)

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **T3-C1-5** | T8 R7 (`"Mode toggle on auth shell"`), T7 R1 | The `authTopBar` branch's ☾ mount — the second of `TopBar.tsx`'s two code sites — is pinned by the only cluster that writes the file | In the `chrome` describe of `tests/render/t3-library.test.tsx`: `setPathname("/login")`, render `<TopBar />`, assert `.authTopBar [data-mode-toggle]` is non-null, that its accessible name matches `/Switch to (Chamber\|Terracotta) mode/`, and that it carries **no** `aria-disabled` (dispatch exemption #3's standing constraint). Prove it RED by deleting that mount alone, leaving `topBarActions` intact |

**Why this cannot be deferred, measured rather than argued.** The reviewer
deleted the `authTopBar` mount alone and ran the canonical 12-path row-3
command: `12 files passed / 92 tests passed`. Not caught. A mount required by
T9's PLAN HOW (*"in `topBarActions` AND in the `authTopBar` branch"*) and by
`ADR-002`'s table for `/login`, `/sign-up`, `/verify-email` and `/enroll-mfa`
could be absent with T3-C1 fully green, leaving SPEC T8 R7 unsatisfied and
invisible.

`awk` over the Writes column of all 32 rows: **T3-C1 is the only row that writes
`apps/ui/components/TopBar.tsx`.** `T7-C1-2` (row 25) and `T8-C4-1` (row 32) do
assert the control, but neither owns the file, and both are 22+ rows away — so
"later" here means "by a seat with no write access to the subject". That is the
AM5 verify-survivability law read from the other side: a pin whose subject no
later cluster may touch has exactly one legal owner, and it is this one.

#### One recorded fact about T3's eyebrow copy (AM7/charge 3, from N5)

`.eyebrow` already carries `text-transform: uppercase` (`globals.css:512`), so
T3-C1's change of `A reasoning instrument` → `A REASONING INSTRUMENT`
(`apps/ui/app/page.tsx:55`) has **zero rendered effect**. It is a source-text
change that satisfies SPEC T3's binding-copy list literally, and it is correct
as charged.

The consequence worth recording: the ALL-CAPS is now in the **DOM**, which is
what assistive technology receives, where before the capitalisation was purely
presentational. Screen readers may spell out or re-pitch literal caps. This is
noted so no later seat "fixes" the redundancy by reverting the source string
(which breaks the binding-copy pin) or by deleting the CSS rule (which changes
every other `.eyebrow` in the product). **Neither is a defect and neither
should be touched**; if the AT rendering is ever judged a problem, it is a
copy/vocabulary question for REQ, not a cluster edit.

**What T3-C1 must NOT do here.** Not touch the token blocks. Not add a second
rule. Not suppress `.authTopBar` (the auth routes keep their bar; `T7`/`T8` pins
in `auth-flow-integration.test.tsx` assert `.authTopBar a[href="/"]`). Not
change `TopBar.tsx`'s null-return list — the suppression is CSS precisely
because `TopBar` cannot know the session and `layout.tsx` cannot know the path.

T9-C1 and T3-C1 both write `apps/ui/app/page.tsx` — **they are serialised**,
T9-C1 first. T9-C1 adds the early return; T3-C1 edits the body below it. This is
the one unavoidable shared file in the mission and it is why they are numbered
rather than parallel. `auth-flow-integration.test.tsx` is in T3-C1's set because
it imports `TopBar`.

## Wave 2 — landing body (no shared surfaces; fully parallel)

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 4 | **T9-C2** — chrome labels, CTAs, stub nav, return path | `apps/ui/components/landing/LandingChrome.tsx` · `apps/ui/lib/returnPath.ts` · `apps/ui/components/LoginFlow.tsx` · `apps/ui/components/SignUpFlow.tsx` · `tests/unit/t9-return-path.test.ts` · `tests/render/t9-landing.test.tsx` · `tests/render/auth-flow-integration.test.tsx` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/render/t9-landing.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/t9-return-path.test.ts tests/unit/v2ui-pages.test.ts` |
| 5 | **T9-C4** — method ledger, sample cards, placeholders | `apps/ui/components/landing/LandingHero.tsx` · `LandingSample.tsx` · `LandingMethod.tsx` · `LandingPricing.tsx` · `tests/render/t9-landing.test.tsx` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/render/t9-landing.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/v2ui-pages.test.ts` |
| 6 | **T9-C5** — render-pin migration bind for T9 | `tests/unit/pda-s03-keyboard-accessibility.test.ts` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/v2ui-pages.test.ts` |

#### The R5 CTA sites — T9-C2-2 narrowed, T9-C4-5 and T9-C4-6 added (AM8)

**Why this exists.** SPEC T9 splits the CTAs by region and my cells did not
follow the split. `T9-S1` (chrome) names **one** CTA — *"primary CTA `Start a
debate`"*. `T9-S2` (hero) names **the pair** — *"CTAs `Start a debate` and `Read
a scored transcript`"*. `R5` names **three** sites for the primary:
*"`Start a debate` (hero + chrome + method close)"*. PLAN's `T9-C2-2` predates
the AM6 convention and reads *"Assert both strings on anonymous `/`"* — an
unscoped, whole-document assertion. Under the AM6 scoped-presence rule it cannot
be satisfied by T9-C2's charge: `Read a scored transcript` ships only in the
hero, and `LandingHero.tsx` is **T9-C4's** file (row 5). The fresh T9-C2 seat
preflight-blocked on exactly this in six minutes, correctly, with zero edits
(`t_3c187757`, 02:57).

**PLAN stays frozen; these cells are dispatch truth** and supersede PLAN's
`T9-C2-2` wording — the same practice AM7 used for `T9-C1-3`. A spec or plan
defect is a routed comment, not an edit.

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **T9-C2-2** (narrowed, supersedes PLAN:94) | R5 · T9-S1 | The **chrome** primary CTA is present | In `tests/render/t9-landing.test.tsx`, `chrome and CTAs` describe (T9-C2's block): on the **real anonymous `/` render**, assert `document.querySelector('[data-landing-section="chrome"]')` contains the exact string `Start a debate`. Scope is part of the acceptance (§"Landing query convention"). **`Read a scored transcript` is NOT asserted here** — it does not ship in the chrome, and asserting it would force T9-C2 to write a file it does not own. The CTA's auth-entry href stays `T9-C2-4`'s cell |
| **T9-C4-5** (new) | R5 · T9-S2 | The **hero** CTA pair is present, and the hero primary is not a dead link | In `tests/render/t9-landing.test.tsx`, `body content` describe (T9-C4's block): on the **real anonymous `/` render**, assert `document.querySelector('[data-landing-section="hero"]')` contains **both** exact strings `Start a debate` **and** `Read a scored transcript`. **And** assert the hero's `Start a debate` carries the same ADR-004 auth-entry contract as the chrome CTA — an `href` of `/login?next=%2Fnew` (ADR-004 §"Landing CTA"), not `#` and not a bare `/login`. A mutant that renders the label with `href="#"` must be RED |
| **T9-C4-6** (new, beyond charge — see below) | R5 · T9-S4 | The **method-close** tertiary CTA is present | In the same describe: on the real anonymous `/` render, assert `document.querySelector('[data-landing-section="method"]')` contains the exact string `Start a debate`, with the same `/login?next=%2Fnew` auth-entry contract |

**`T9-C4-6` is beyond the charge and is declared, not slipped in.** The charge
was two cells. Checking R5's site list rather than assuming it — *"`Start a
debate` (hero + chrome + **method close**)"*, and `T9-S4`'s *"plus closing lines
and tertiary `Start a debate`"* — showed the third site is pinned by **nothing**:

```
$ grep -n 'T9-C[0-9]-[0-9]' docs/missions/ui-overhaul/slices/T9/PLAN.md | grep -c 'Start a debate'
2          # T9-C2-2 (whole-document, now narrowed to chrome) and T9-C2-4 (the href) — neither reaches the method close
```

Narrowing `T9-C2-2` to the chrome subtree would have **created** that hole
rather than merely leaving it: the old unscoped assertion at least matched the
string wherever it lived. Publishing the narrowing without `T9-C4-6` would have
been this mission's fourth unpinned-site defect, authored by the amendment
fixing the third. `LandingMethod.tsx` is already in row 5's write surface, so
T9-C4 is the legal owner and no surface changes.

**No write surface moves in this amendment.** Row 4 keeps `LandingChrome.tsx`;
row 5 keeps `LandingHero.tsx`, `LandingSample.tsx`, `LandingMethod.tsx`,
`LandingPricing.tsx`. Both clusters already own `tests/render/t9-landing.test.tsx`
in their own `describe` block. The seat's option (a) — moving `LandingHero.tsx`
to T9-C2 — was not taken: it would split the hero across two clusters, since
T9-C4 must still write the hero body copy (`T9-C4-4`), and one file with two
writers in the same wave is the hazard the wave structure exists to avoid.

#### T9-C4-4 amended — method bodies pinned POSITIONALLY, not by containment (AM10)

T9-C4 PASSED and merged at `174735a`. Its review found the cell, not the code:
the shipped ledger is correct today, and the pin cannot detect it becoming
wrong.

**The asymmetry, inside one cluster.** `T9-C4-1` pins number↔title
**positionally** — `steps[index]` over an `expectedSteps` tuple list.
`T9-C4-4` pins the four step bodies as **method-subtree containment** —
`method.textContent.toContain(body)`, four times. Containment over a subtree is
permutation-invariant, so any reordering of bodies among the four `<li>`s keeps
every assertion true. The reviewer's M3 mutant swapped bodies 01↔02 *inside* the
method subtree and the suite stayed **GREEN**. Their earlier MOVE mutant crossed
subtrees, which the scoped pins do catch; a **same-subtree permutation is
strictly harder**, and it slipped.

**Re-derived here rather than taken on report** — the two assertion styles run
over the shipped list and over M3's permutation:

```
tree                               T9-C4-4 today (subtree contains)   T9-C4-4 amended (steps[index])
shipped (correct pairing)          GREEN                              GREEN
M3: bodies 01<->02 swapped         GREEN  <- ships the defect         RED  <- caught

ledger M3 actually renders:
   01 Models argue           Every claim is cross-reviewed by a rival model: agree or dispute, on the record.
   02 They review each other Five frontier models build the tree — pro, con, and the reasoning that binds them.
```

A reader gets a method ledger whose step 01 describes step 02, with every gate
in the mission green. The strings are all present; only the **pairing** is
wrong, and nothing pinned the pairing.

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **T9-C4-4** (amended, supersedes PLAN:234) | R7 · copy | The method ledger's four step **bodies sit beside their own titles**, not merely somewhere in the method subtree | In `tests/render/t9-landing.test.tsx` (T9-C4's block): extend the existing `expectedSteps` tuples from `[number, title]` to `[number, title, body]` and assert all three against `steps[index]?.textContent` **in the same loop** that already pins number and title. The four pairings are SPEC-fixed: `01`/`Models argue` → `Five frontier models build the tree — pro, con, and the reasoning that binds them.` · `02`/`They review each other` → `Every claim is cross-reviewed by a rival model: agree or dispute, on the record.` · `03`/`You challenge` → `Flag any sentence; the graph spawns a focused rebuttal where you pointed.` · `04`/`Verdict with receipts` → `Scores, condition marks, and replay handles — every number traces to its source.` **RED-proof required:** swap two bodies between `<li>`s, leaving both strings inside the method subtree, and show the cell fails. The remaining `T9-C4-4` assertions — hero body, after-sample close, method intro `Four steps, then you do it again tomorrow.`, the arena line, the closing line, the pricing lines — stay as subtree containment, correctly: **they are not per-step copy and have no index to pair with** |

**Owning round: the T9-C4 addendum, worker session `01a05a71`.** It is a
two-line change (widen the tuples, add one `toContain`) in
`tests/render/t9-landing.test.tsx`, which is already in row 5's write surface —
**no write surface changes**, and no product code moves, because the product is
already correct.

**Real-artifact check (AM7 rule).** The amended cell asserts against
`steps[index]` taken from the real anonymous render's method subtree, the same
nodes `T9-C4-1` already uses. Nothing is composed by the test.

**Why containment was the wrong tool, stated as a rule rather than an apology.**
`toContain` over a subtree answers *"does this string exist here"*. For copy that
belongs to a specific slot, the question is *"is this string in **its** slot"*,
and those two questions differ by exactly one permutation. **Where a SPEC fixes
an ordered correspondence, the pin must assert the correspondence, not the
membership.** `T9-C4-1` already did this; `T9-C4-4` should have been written the
same way in the same cluster.

#### Q-16 is OPEN — the sample block is not final-complete (AM10)

SPEC `T9-S3` lists `Turns 01–04` as part of the sample block. It is pinned by
**nothing** — not R6, not `T9-C4-2`, not row 5 — and PLAN HOW scopes
`LandingSample` to *"`ONE DEBATE, FOUR TURNS` + the Pro/Con/Reasoning cards"*.
It is **absent from the shipped sample subtree** (measured by the T9-C4
reviewer). That is not a defect against T9-C4, which built R6, `T9-C4-2` and HOW
exactly as written.

**Routed to V as Q-16, ticket `t_adb4bfaf`, and it is OPEN.** The ruling is
whether `Turns 01–04` binds the landing sample: amend `T9-S3` to drop it, or add
a cell and a fill. It is a design-fidelity question, not a test-strength one, so
it is V's and not mine.

**Standing instruction until V rules: no seat may treat the landing sample as
final-complete.** A later cluster or reviewer that finds `Turns 01–04` missing
has found this open question, not a regression, and must not "fix" it — the same
discipline the declared-kind law imposes (AM9/N6). Conversely nobody may close
T9's sample surface as done while `t_adb4bfaf` is unresolved.

#### T9-C2 addendum — N3 ratified, T9-C2-6 and T9-C2-7 (AM9)

T9-C2 PASSED and merged at `6aa9f35`. These three items come from its review
(`t_3c187757`, 03:41) and all touch files T9-C2 already owns, so they belong to
the **open T9-C2 addendum round** (the N1 pin session), not to a new cluster and
not to a later slice.

**N3 — RATIFIED, not dropped.** `LandingChrome` ships `Log in` → `/login` and
`Sign up` → `/sign-up`, and `t9-landing.test.tsx` now pins both hrefs. `T9-S1`
does not enumerate them, so the reviewer correctly routed *"un-ratified copy is
now contractual"* to ARCH. They stay, on one ground that is mine to own:

> **AM6 removed the only labelled sign-in affordance the anonymous landing had.**
> Before AM6, `TopBar` rendered `Account` → `/login` on `/`. AM6 suppressed
> `TopBar` on the anonymous landing. Dropping these two links would leave a
> returning reader with no labelled way to sign in — their only path would be
> the `Start a debate` CTA, which is the wrong label for someone who wants their
> library. That regression would be authored by my own amendment, and ratifying
> is how it is repaired without a new round.

The artboard does not show them (`9e` opens `DebateAI / Method / Transcripts /
Pricing / Start a round →`), and the artboard is a marketing comp, not an auth
inventory — but that is why this is a **ratification with a V-visible DECISIONS
row**, not a silent acceptance. Row 4's chrome inventory is therefore: wordmark ·
`Method` · `Transcripts` · `Pricing` · `Log in` · `Sign up` · `Start a debate` ·
☾ — the T9-S1 list **plus** the two ratified auth links.

**One residual this ratification exposes, routed not absorbed:** the product now
says `Sign up` (landing), `Create one` (`LoginFlow.tsx:115`) and `Create account`
(`SignUpFlow.tsx:105`, and T8-S1's binding copy) for the same action. Three
strings, one action. `Log in` is already app vocabulary (`SignUpFlow.tsx:68`,
T8's binding `Already have one? Log in`), so only the sign-up label diverges.
Copy is REQ/V's, not a cluster edit and not mine to unify — filed for V with the
Q-04 distinctness family.

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **T9-C2-6** (new) | R5 · ADR-004 §Decision | The login→sign-up leg forwards `next`, so R5's sign-up branch keeps its return path | In `tests/render/t9-landing.test.tsx` (T9-C2's block): render `LoginFlow` at `/login?next=%2Fnew` and assert the `Create one` link's `href` is `/sign-up?next=%2Fnew` — not the bare `/sign-up` shipped at `LoginFlow.tsx:115`. **And** pin the round trip end to end: from `/login?next=%2Fnew`, `Create one` → `Already have one? Log in` returns an href whose decoded `next` is still `/new`. A mutant that drops the parameter on either leg must be RED. Do **not** add a second validation site — the forwarding legs are transport, `safeReturnPath` is the gate (ADR-004 §Wiring, AM9 note) |
| **T9-C2-7** (new) | R5 · ADR-004 §"The validator" | The public-debate kind admits only real refs | In `tests/unit/t9-return-path.test.ts` (T9-C2's file), extend the hostile-input table: `safeReturnPath('/public/debate/..')` and `safeReturnPath('/public/debate/.')` each return exactly `/#start-a-debate`; and an accept-case — `safeReturnPath('/public/debate/3f2a1b4c-9d8e-4f70-b1c2-5a6d7e8f9012')` returns that path unchanged. The accept-case is required: it is what will go RED if `public_ref` ever stops being a UUID, which is the signal ADR-004's changelog names |

**Supersedes `slices/T9/PLAN.md:116`**, which quotes the old permissive regex
`[A-Za-z0-9._~-]{1,128}` verbatim. PLAN stays frozen; the dispatch cell is
dispatch truth (AM7/AM8 practice). Measured accept/reject table for old vs new
kind: `ADR-004` §Changelog, AM9/charge 3.

**Real-artifact check (AM7 rule) on the two new cells.** `T9-C2-6` renders the
real `LoginFlow` and reads the real link's `href`; `T9-C2-7` calls the real
`safeReturnPath`. Neither can be satisfied by a document the test authored.

T9-C2 and T9-C4 both touch `tests/render/t9-landing.test.tsx`. Split it by
`describe` block at creation — T9-C1 creates the file with three empty
`describe`s (`route split`, `chrome and CTAs`, `body content`) so the three
clusters own one block each and never edit the same hunk.

## Wave 3 — debate surfaces

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 7 | **T1-C1** — debate chrome, view toggles, ☾ mount | `apps/ui/app/debate/[id]/DebatePageClient.tsx` · `apps/ui/components/GuideModal.tsx` · `tests/render/t1-canvas.test.tsx` · `tests/unit/pda-s02-affordance-drift.test.ts` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/render/t1-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts` |
| 8 | **T1-C2** — card anatomy, stance tab, connectors | `apps/ui/components/DebateCanvas.tsx` · `DebateTree.tsx` · `DebateMap.tsx` · `DebateSplit.tsx` · `DebateThread.tsx` · `DebateOutline.tsx` · `ModelPresentation.tsx` · `apps/ui/lib/debatePresentation.ts` · `apps/ui/lib/scrutiny.ts` · `tests/render/t1-canvas.test.tsx` · `tests/render/ui02e-debate-canvas.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/render/t1-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts` |
| 9 | **T1-C3** — set-aside, synthesis, publicMode | `apps/ui/components/DebateCanvas.tsx` · `apps/ui/components/SynthesisPanel.tsx` · `tests/render/t1-canvas.test.tsx` · `tests/render/ui02e-debate-canvas.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/t1-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts` |
| 10 | **T1-C4** — render-pin migration for T1 | `tests/render/ui02e-debate-canvas.test.tsx` · `tests/unit/pda-s02-affordance-drift.test.ts` | `pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts` |
| 11 | **T5-C1** — drawer open + core sections | `apps/ui/components/NodeDetailDrawer.tsx` · `tests/render/t5-drawer.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/pda-s02-public-tree.test.tsx tests/render/prov01-honesty-drawer.test.tsx tests/render/t5-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts` |
| 12 | **T5-C2** — actions, history, mode | `apps/ui/components/NodeDetailDrawer.tsx` · `tests/render/t5-drawer.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/pda-s02-public-tree.test.tsx tests/render/prov01-honesty-drawer.test.tsx tests/render/t5-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/t9-mode-tokens.test.ts tests/unit/v2ui-pages.test.ts` |
| 13 | **T5-C3** — render-pin migration for T5 | `tests/unit/v2ui-pages.test.ts` (T5 slice-close residual only — see the note below) | `pnpm exec vitest run tests/render/pda-s02-public-tree.test.tsx tests/render/prov01-honesty-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts` |

T1-C2 and T1-C3 both write `DebateCanvas.tsx`; T5-C1 and T5-C2 both write
`NodeDetailDrawer.tsx`. **Serialised in the order shown** — same file, same
hunks, and the spine's single-writer rule is per file, not per cluster.

> **WRITE SURFACES WIDENED 2026-08-31 (AF-1).** T1-C1 gains `GuideModal.tsx`;
> T1-C2 gains `DebateMap.tsx`, `DebateSplit.tsx`, `DebateThread.tsx`,
> `DebateOutline.tsx`, `ModelPresentation.tsx` and `lib/scrutiny.ts`. These six
> files carry 28 of the 45 non-wave-0 colour literals and previously belonged to
> **no cluster at all** — the second half of the AF-1 defect. Ownership is
> evidence-based, not assigned by theme: each was traced to its importer
> (`rg -l '/(components|lib)/<name>"' apps/ui`). **All 45 non-wave-0 residuals
> fall inside T1**; no other slice inherits any. `ADR-001` §(b) has the full
> `10 of 10` table. `DebateOutline.tsx` has no app importer — test-referenced
> only; flagged for the orphan audit, not deleted here.

## Wave 4 — library lists and public 3b

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 14 | **T3-C2** — Your/Public selectors, `4 TOTAL`, bezel rows | `apps/ui/app/page.tsx` · `apps/ui/components/DebatesBuffer.tsx` · `tests/render/t3-library.test.tsx` · `tests/unit/pda-s03-keyboard-accessibility.test.ts` · `tests/architecture/s8-publication-contract.test.ts` · `tests/render/bug03-home-buffer.test.tsx` | `pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts tests/render/bug03-home-buffer.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/t3-library.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/s8-publication-ui.test.tsx` |
| 15 | **T3-C3** — public 3b verdict-first + locks | `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` · `apps/ui/components/public/PublicVerdictBlock.tsx` · `PublicStrongestCases.tsx` · `PublicLockBanner.tsx` · `tests/render/t3-public-3b.test.tsx` · `tests/architecture/s8-publication-contract.test.ts` · `tests/render/pda-s02-public-page.test.tsx` | `pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts tests/render/bug03-home-buffer.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/t3-public-3b.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/s8-publication-ui.test.tsx` |
| 16 | **T3-C4** — render-pin migration for T3 | `tests/render/pda-s02-public-page.test.tsx` · `tests/render/bug03-home-buffer.test.tsx` | `pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts tests/render/bug03-home-buffer.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/s8-publication-ui.test.tsx` |

T3-C3 depends on T1-C1 (both render inside `DebatePageClient`'s chrome) and on
T1-C3 (publicMode locks are shared with the canvas). Wave 4 runs after wave 3.

## Wave 5 — forms and auth (mutually independent; parallel)

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 17 | **T4-C1** — form regions + mode | `apps/ui/app/new/page.tsx` · `tests/render/t4-new-debate.test.tsx` · `tests/render/ux01-new-debate-form.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/t4-new-debate.test.tsx tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts` |
| 18 | **T4-C2** — steering + start/cancel + ⌃↵ | `apps/ui/app/new/page.tsx` · `tests/render/t4-new-debate.test.tsx` · `tests/render/ux01-new-debate-form.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/t4-new-debate.test.tsx tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts` |
| 19 | **T4-C3** — V2 options not sent | `apps/ui/app/new/page.tsx` · `apps/ui/app/new/defaults.tsx` · `tests/render/t4-new-debate.test.tsx` · `tests/render/ux01-new-debate-form.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/t4-new-debate.test.tsx tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts` |
| 20 | **T4-C4** — render-pin migration for T4 | `tests/render/ux01-new-debate-form.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx tests/unit/v2ui-pages.test.ts` |
| 21 | **T6-C1** — settings chrome + identity + mode | `apps/ui/app/settings/page.tsx` · `tests/render/t6-settings.test.tsx` · `tests/render/s5-session-controls.test.tsx` | `pnpm exec vitest run tests/architecture/s9-dev-token-retirement-contract.test.ts tests/render/s5-session-controls.test.tsx tests/render/s9-legacy-claim-controls.test.tsx tests/render/t6-settings.test.tsx tests/unit/s10-erasure-ui-render.test.tsx tests/unit/s10-erasure-ui.test.ts` |
| 22 | **T6-C2** — sessions + revoke | `apps/ui/components/SessionControls.tsx` · `tests/render/t6-settings.test.tsx` · `tests/render/s5-session-controls.test.tsx` | `pnpm exec vitest run tests/architecture/s9-dev-token-retirement-contract.test.ts tests/render/s5-session-controls.test.tsx tests/render/s9-legacy-claim-controls.test.tsx tests/render/t6-settings.test.tsx tests/unit/s10-erasure-ui-render.test.tsx tests/unit/s10-erasure-ui.test.ts` |
| 23 | **T6-C3** — step-up, legacy claim, deletion | `apps/ui/components/LegacyRunClaimControls.tsx` · `apps/ui/components/AccountErasureControls.tsx` · `tests/render/t6-settings.test.tsx` | `pnpm exec vitest run tests/architecture/s9-dev-token-retirement-contract.test.ts tests/render/s5-session-controls.test.tsx tests/render/s9-legacy-claim-controls.test.tsx tests/render/t6-settings.test.tsx tests/unit/s10-erasure-ui-render.test.tsx tests/unit/s10-erasure-ui.test.ts` |
| 24 | **T6-C4** — render-pin migration for T6 | `tests/render/s5-session-controls.test.tsx` | `pnpm exec vitest run tests/architecture/s9-dev-token-retirement-contract.test.ts tests/render/s5-session-controls.test.tsx tests/render/s9-legacy-claim-controls.test.tsx tests/unit/s10-erasure-ui-render.test.tsx tests/unit/s10-erasure-ui.test.ts` |
| 25 | **T7-C1** — sign-in shell | `apps/ui/components/LoginFlow.tsx` · `apps/ui/components/AuthShell.tsx` · `tests/render/t7-signin.test.tsx` · `tests/render/auth-flow-integration.test.tsx` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/render/auth-flow-integration.test.tsx tests/render/t7-signin.test.tsx tests/render/web-auth-login.test.tsx` |
| 26 | **T7-C2** — two-step + recovery alternative | `apps/ui/components/LoginFlow.tsx` · `tests/render/t7-signin.test.tsx` · `tests/render/auth-flow-integration.test.tsx` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/render/auth-flow-integration.test.tsx tests/render/t7-signin.test.tsx tests/render/web-auth-login.test.tsx` |
| 27 | **T7-C3** — fleet honesty | `apps/ui/app/admin/workers/page.tsx` · `tests/render/t7-signin.test.tsx` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/render/auth-flow-integration.test.tsx tests/render/t7-signin.test.tsx tests/render/web-auth-login.test.tsx` |
| 28 | **T7-C4** — render-pin migration for T7 | `tests/render/auth-flow-integration.test.tsx` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/render/auth-flow-integration.test.tsx tests/render/web-auth-login.test.tsx` |
| 29 | **T8-C1** — sign-up shell + validation | `apps/ui/components/SignUpFlow.tsx` · `tests/render/t8-signup.test.tsx` · `tests/render/auth-flow-integration.test.tsx` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s4-mfa-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/render/t8-signup.test.tsx tests/render/web-auth-enrollment.test.tsx tests/render/web-auth-sign-up.test.tsx tests/unit/mfa-ui.test.ts` |
| 30 | **T8-C2** — three-step MFA + activate gate | `apps/ui/app/enroll-mfa/page.tsx` · `tests/render/t8-signup.test.tsx` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s4-mfa-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/render/t8-signup.test.tsx tests/render/web-auth-enrollment.test.tsx tests/render/web-auth-sign-up.test.tsx tests/unit/mfa-ui.test.ts` |
| 31 | **T8-C3** — recovery replacement gate | `apps/ui/components/LoginFlow.tsx` · `apps/ui/lib/authNavigationGuard.ts` · `tests/render/t8-signup.test.tsx` · `tests/render/auth-flow-integration.test.tsx` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s4-mfa-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/render/t8-signup.test.tsx tests/render/web-auth-enrollment.test.tsx tests/render/web-auth-sign-up.test.tsx tests/unit/mfa-ui.test.ts` |
| 32 | **T8-C4** — mode on auth shell + render-pin migration for T8 + **MISSION-FINAL colour-literal sweep** | `tests/render/auth-flow-integration.test.tsx` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s4-mfa-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/render/web-auth-enrollment.test.tsx tests/render/web-auth-sign-up.test.tsx tests/unit/mfa-ui.test.ts` |

### The `LoginFlow.tsx` contention — read this before dispatching wave 5

Four clusters write `apps/ui/components/LoginFlow.tsx`: **T9-C2** (return path),
**T7-C1** (shell copy), **T7-C2** (two-step copy), **T8-C3** (recovery gate).
That is the mission's worst single-writer hazard.

They are ordered **T9-C2 → T7-C1 → T7-C2 → T8-C3** and run strictly serially.
T9-C2 goes first because it changes `navigateHome`'s *behaviour*; the other
three change copy inside JSX that the behaviour change does not touch. Reversing
the order means three copy diffs get rebased around a behaviour change, which is
where a `next` parameter quietly gets dropped.

`tests/render/auth-flow-integration.test.tsx` is written by both T7-C4 and
T8-C4. Split it the same way as `t9-landing`: T7-C4 owns the sign-in
`describe`s, T8-C4 owns the sign-up/enrolment `describe`s.

## Ordering rationale in one line each

1. **T9-C3 first** — nothing can be re-skinned against tokens that do not exist.
2. **Route split and `TopBar` next** — they are the two shared mount points; every later cluster assumes the ☾ control already exists and only mounts it.
3. **Landing body** — the only fully greenfield work; parallel because it shares no file with the product.
4. **Debate before public** — `PublicDebatePageClient` renders `DebatePageClient`; restyling the parent after the child means restyling twice.
5. **Forms and auth last** — they are the least coupled to the token/chrome work and the most coupled to security tests, so they get the most stable base to land on.

## Mission-final colour-literal sweep (AF-1, owner: cluster #32 `T8-C4`)

As the LAST cluster in this order, `T8-C4` additionally runs the **MISSION-FINAL
ORACLE** from `ADR-001` §(c) — the repo-wide sweep — and it must return `0`:

```sh
# The token region is TWO intervals. Both found BY SYNTAX at run time.
RANGES=$(awk '
  /^:root[[:space:]]*\{/                       {s1=NR; f=1; next}
  f==1 && /^\}/                                {e1=NR; f=0; next}
  /^html\[data-mode="chamber"\][[:space:]]*\{/ {s2=NR; g=1; next}
  g==1 && /^\}/                                {e2=NR; g=0; next}
  END { if (s1 && e1 && s2 && e2) printf "%d,%d,%d,%d", s1, e1, s2, e2 }
' apps/ui/app/globals.css)
[ -n "$RANGES" ] || { echo "FAIL: globals.css token blocks not found or unclosed"; exit 2; }
rg -n --no-heading -e 'oklch\(' -e '#[0-9a-fA-F]{6}\b' -e '\brgba?\(' \
  --glob '!*.disabled' --glob '!*.svg' \
  apps/ui/app apps/ui/lib apps/ui/components \
  | awk -v r="$RANGES" -F: 'BEGIN{split(r,a,",")} !($1 ~ /globals\.css$/ && (($2+0>=a[1] && $2+0<=a[2]) || ($2+0>=a[3] && $2+0<=a[4])))' \
  | wc -l
```

This is **verification-only**: T8-C4 writes no product code for it. A non-zero
result is routed to whichever cluster owns the file per `ADR-001` §(b) — never
absorbed by T8-C4, which owns none of those surfaces. The same command is a
**QA line for V** at the closure gate: per-cluster greens prove each seat cleaned
its own surface; only this one proves the union is clean.

## Three-run law

Every command above is run three times; **the worst run is the verdict**.
Green-green-red is RED, and re-running until green is falsification under R5.
`vitest.config.ts` sets `fileParallelism: false`, so runs are already
deterministic in ordering; a flake here is a real flake, not a scheduling
artefact.

---

## Changelog

### 2026-08-31 — AM4: T9-C1's write surface omitted the four landing stubs it is required to create (trigger: orchestrator pre-dispatch validation, ticket `t_40a227bb`)

**What was wrong.** Row 2 listed `page.tsx`, `LandingPage.tsx`,
`LandingChrome.tsx` and the test file — but not `LandingHero.tsx`,
`LandingSample.tsx`, `LandingMethod.tsx` or `LandingPricing.tsx`, which T9's PLAN
HOW requires C1 to create as stubs. A contract-obedient C1 could not create them,
`LandingPage`'s imports would not resolve, and the compile gate would go red on
module-not-found. AF-1 class: a write surface that contradicts the acceptance it
has to satisfy — **caught pre-dispatch this time, before the seat burned a
preflight block on it.**

**Cross-check, run in this edit:**

| Source | Says |
|---|---|
| `slices/T9/PLAN.md:64` (HOW) | *"C1 ships it with the five children as empty stubs; C2 and C4 fill them."* |
| `dispatch-order.md` row 4 (T9-C2) | writes `LandingChrome.tsx` — the chrome copy |
| `dispatch-order.md` row 5 (T9-C4) | writes `LandingHero/Sample/Method/Pricing` — the content |
| `dispatch-order.md` row 2 (T9-C1), **before** | listed neither the four stubs nor any creation duty |
| `dispatch-order.md` row 2, **after** | lists all four, annotated *empty stubs only — content is T9-C4's* |

No contradiction remains: C1 **creates** five files, C2 fills chrome, C4 fills
the other four. The hero-stub exception is stated in the stub rule above.

**Rest of row 2, re-checked against PLAN in the same edit as charged:**

- Verification command — matches T9-C1's PLAN HOW command exactly. ✓
- Serialisation note (`T9-C1` before `T3-C1` on `app/page.tsx`) — matches. ✓
- `tests/render/t9-landing.test.tsx` created by C1 with three empty `describe`
  blocks — present in row 2 and in rows 4 and 5. ✓
- The AM2/C compile gate applies to row 2 (it writes under `apps/ui/`) and is an
  acceptance default, not a per-row entry. ✓

**Class sweep — every `**Create**` target in every PLAN vs its OWN creating
cluster's dispatch row.** 32 rows parsed, 19 targets checked, **0 genuine
mismatches** (two apparent hits were a regex over-reach on
`slices/T9/PLAN.md:75`, which names `tests/render/stubs/next-headers.ts` and
`vitest.config.ts` as *existing* infrastructure — "already wired" — not as
creation targets).

**Why the sweep would not have found this one, which is the transferable
lesson.** The four stubs are invisible to a `**Create**`-marker sweep because
T9's PLAN expresses the obligation in **prose** — *"ships it with the five
children as empty stubs"* — not as a `**Create**` line with backticked paths. A
machine-checkable contract that depends on a human noticing a sentence is not
machine-checkable. Creation duties should be stated in the marked form the sweep
can see.

### 2026-08-31 — AM4 (beyond charge): the mission-final oracle still carried the AM2 prefix filter

Flagged as an open residual at the end of AM3 and left unfixed there because
`dispatch-order.md` was outside AM3's allowed writes. It is inside AM4's, and
leaving a known-blind gate in a file being edited is not defensible, so it is
closed here and declared rather than done quietly.

The mission-final oracle (cluster #32, `T8-C4`) now uses the **range-pair**
membership filter from `ADR-001` §(a) — the same one the per-cluster oracles
already use. Before this edit it used AM2's one-sided `$2+0 <= b`, which REV2
proved blind to mutants M4 (gap between the token blocks), M5 (above `:root`) and
M6 (chamber block legally relocated to EOF, which exempts the entire stylesheet).
`1 of 1` occurrence replaced; `grep -rn '\$2+0 <= b' docs/missions/ui-overhaul/`
now returns nothing.

### 2026-08-31 — AM5: a cluster's verify command required a standing test its own charge breaks (trigger: fresh T9-C1 codex seat, preflight block on `t_4487f9b1`, 23:07)

**What was wrong.** Row 2's verify command ran
`tests/unit/pda-s03-keyboard-accessibility.test.ts`, whose five cases all render
the anonymous `/` and assert the anonymous debate library. SPEC T9 R1 makes T9-C1
delete that surface. The pin was not in T9-C1's write surface, and the migration
owner (T9-C5) sat four rows later, so the seat was dispatched into an acceptance
no obedient execution of its charge could reach. It blocked correctly. Fourth
AF-1-class defect, in a dimension no earlier amendment covered: **verify
survivability**.

**The sweep, run over all 32 clusters.** Method, in this edit:

1. Parse all 32 rows into `(writes, verify)` — 32 rows, 40 distinct verify paths,
   30 of them standing files, 10 created by the mission.
2. For each standing test, compute which product files it reads. The first pass
   matched literal `apps/ui/…` strings and **under-reported**: `v2ui-pages.test.ts`
   reads through a `source(relativePath)` helper (line 25) and showed 0 of its 9
   real subjects. Re-done by joining on path suffix and `@/` alias against the
   43 product files the 32 rows write. `app/page.tsx` was then removed from
   `v2ui-pages` by hand — its only match is `duplicateWebSource("app/page.tsx")`
   at line 270, which reads `web/`, not `apps/ui/`. Same shape as the AM1
   loose-matcher error, caught the same way: by diffing the two match sets.
3. Classify each cell with `test-migration.md`'s KEEP / RETARGET column, then
   **adjudicate every RETARGET candidate against what the test actually asserts**.
   File overlap is a candidate generator, not a verdict.

**What the sweep found beyond T9-C1's cell.**

| Finding | Evidence |
|---|---|
| **Five RETARGET pins had no writer in any of the 32 rows** — `pol01-policy`, `pda-s02-affordance-drift`, `v2ui-pages`, `s8-publication-contract`, `auth-front-door-parity`. Any red in them was unfixable by any cluster | join of the 12 RETARGET files against the union of all 32 write surfaces |
| **T3-C2 (#14) breaks `pda-s03` a second time** by recasing the selectors to `Your debates` / `Public debates`, with its migration owner T9-C5 scheduled at #6 — *earlier* than the break | SPEC T3 vs `pda-s03` line 31 `expectedTabs` |
| **22 of 32 clusters under-ran their slice regression set**, which `test-migration.md` declares mandatory. An under-run verify is what let a break stay invisible for eleven rows | per-slice regression table vs each row's command |
| **Two absence-clause traps** that no reordering can fix — `pol01` forbids `localStorage` in `DebatePageClient.tsx`, which is `ADR-002`'s second mount point; `auth-front-door-parity` forbids it in `LoginFlow`/`SignUpFlow`, which T9-C2 rewrites | quoted in full in the section above |
| **`s8-publication-contract` slices `app/page.tsx` between `published.items.map` and `</article>`**, so `ADR-003`'s split must move no JSX out of that file or the two publication warnings leave with it | test line 156 ff. |
| A prose contradiction: *"`LandingChrome.tsx` is created by T9-C2"* directly contradicted the AM4 stub rule eleven lines above | corrected in place |

**The sweep table.** Read over the **post-AM5** verify commands (each row's own
tests ∪ its slice regression set). "Verdict (before AM5)" asks whether the
**pre-AM5 write surfaces** could have satisfied that command.

| # | Cluster | RETARGET pins in its verify command | Breaking charge (own or prior) | Migration at-or-before it? | Verdict (before AM5) | After AM5 |
|---|---|---|---|---|---|---|
| 1 | **T9-C3** | auth-front-door-parity.test.ts<br>s8-publication-contract.test.ts<br>pda-s03-keyboard-accessibility.test.ts<br>v2ui-pages.test.ts | none — absence-clause pin<br>—<br>—<br>— | n/a (constraint)<br>—<br>—<br>— | OK<br>OK<br>OK<br>OK | OK<br>OK<br>OK<br>OK |
| 2 | **T9-C1** | auth-front-door-parity.test.ts<br>s8-publication-contract.test.ts<br>pda-s03-keyboard-accessibility.test.ts<br>v2ui-pages.test.ts | none — absence-clause pin<br>—<br>#2 T9-C1<br>— | n/a (constraint)<br>—<br>#2 T9-C1<br>— | OK<br>OK<br>**DEFECT**<br>OK | OK<br>OK<br>OK<br>OK |
| 3 | **T3-C1** | s8-publication-contract.test.ts<br>auth-flow-integration.test.tsx<br>bug03-home-buffer.test.tsx<br>pda-s02-public-page.test.tsx<br>pda-s03-keyboard-accessibility.test.ts | #3 T3-C1<br>—<br>—<br>—<br>#3 T3-C1 | #3 T3-C1<br>—<br>—<br>—<br>#3 T3-C1 | **DEFECT**<br>OK<br>OK<br>OK<br>**DEFECT** | OK<br>OK<br>OK<br>OK<br>OK |
| 4 | **T9-C2** | auth-front-door-parity.test.ts<br>s8-publication-contract.test.ts<br>auth-flow-integration.test.tsx<br>pda-s03-keyboard-accessibility.test.ts<br>v2ui-pages.test.ts | none — absence-clause pin<br>#3 T3-C1<br>#4 T9-C2<br>#3 T3-C1<br>— | n/a (constraint)<br>#3 T3-C1<br>#4 T9-C2<br>#3 T3-C1<br>— | OK<br>**DEFECT**<br>**DEFECT**<br>**DEFECT**<br>OK | OK<br>OK<br>OK<br>OK<br>OK |
| 5 | **T9-C4** | auth-front-door-parity.test.ts<br>s8-publication-contract.test.ts<br>pda-s03-keyboard-accessibility.test.ts<br>v2ui-pages.test.ts | none — absence-clause pin<br>#3 T3-C1<br>#3 T3-C1<br>— | n/a (constraint)<br>#3 T3-C1<br>#3 T3-C1<br>— | OK<br>**DEFECT**<br>**DEFECT**<br>OK | OK<br>OK<br>OK<br>OK |
| 6 | **T9-C5** | auth-front-door-parity.test.ts<br>s8-publication-contract.test.ts<br>pda-s03-keyboard-accessibility.test.ts<br>v2ui-pages.test.ts | none — absence-clause pin<br>#3 T3-C1<br>#3 T3-C1<br>— | n/a (constraint)<br>#3 T3-C1<br>#3 T3-C1, #6 T9-C5<br>— | OK<br>**DEFECT**<br>OK<br>OK | OK<br>OK<br>OK<br>OK |
| 7 | **T1-C1** | ui02e-debate-canvas.test.tsx<br>pda-s02-affordance-drift.test.ts<br>pol01-policy.test.ts | —<br>#7 T1-C1<br>none — absence-clause pin | —<br>#7 T1-C1<br>n/a (constraint) | OK<br>**DEFECT**<br>OK | OK<br>OK<br>OK |
| 8 | **T1-C2** | ui02e-debate-canvas.test.tsx<br>pda-s02-affordance-drift.test.ts<br>pol01-policy.test.ts | #8 T1-C2<br>#7 T1-C1<br>none — absence-clause pin | #8 T1-C2<br>#7 T1-C1<br>n/a (constraint) | **DEFECT**<br>**DEFECT**<br>OK | OK<br>OK<br>OK |
| 9 | **T1-C3** | ui02e-debate-canvas.test.tsx<br>pda-s02-affordance-drift.test.ts<br>pol01-policy.test.ts | #9 T1-C3<br>#7 T1-C1<br>none — absence-clause pin | #9 T1-C3<br>#7 T1-C1<br>n/a (constraint) | **DEFECT**<br>**DEFECT**<br>OK | OK<br>OK<br>OK |
| 10 | **T1-C4** | ui02e-debate-canvas.test.tsx<br>pda-s02-affordance-drift.test.ts<br>pol01-policy.test.ts | #9 T1-C3<br>#7 T1-C1<br>none — absence-clause pin | #9 T1-C3, #10 T1-C4<br>#7 T1-C1<br>n/a (constraint) | OK<br>**DEFECT**<br>OK | OK<br>OK<br>OK |
| 11 | **T5-C1** | pda-s02-affordance-drift.test.ts<br>pol01-policy.test.ts | #7 T1-C1<br>none — absence-clause pin | #7 T1-C1<br>n/a (constraint) | **DEFECT**<br>OK | OK<br>OK |
| 12 | **T5-C2** | pda-s02-affordance-drift.test.ts<br>pol01-policy.test.ts | #7 T1-C1<br>none — absence-clause pin | #7 T1-C1<br>n/a (constraint) | **DEFECT**<br>OK | OK<br>OK |
| 13 | **T5-C3** | pda-s02-affordance-drift.test.ts<br>pol01-policy.test.ts | #7 T1-C1<br>none — absence-clause pin | #7 T1-C1<br>n/a (constraint) | **DEFECT**<br>OK | OK<br>OK |
| 14 | **T3-C2** | s8-publication-contract.test.ts<br>bug03-home-buffer.test.tsx<br>pda-s02-public-page.test.tsx<br>pda-s03-keyboard-accessibility.test.ts | #14 T3-C2<br>#14 T3-C2<br>—<br>#14 T3-C2 | #14 T3-C2<br>#14 T3-C2<br>—<br>#14 T3-C2 | **DEFECT**<br>**DEFECT**<br>OK<br>**DEFECT** | OK<br>OK<br>OK<br>OK |
| 15 | **T3-C3** | s8-publication-contract.test.ts<br>bug03-home-buffer.test.tsx<br>pda-s02-public-page.test.tsx<br>pda-s03-keyboard-accessibility.test.ts | #15 T3-C3<br>#14 T3-C2<br>#15 T3-C3<br>#14 T3-C2 | #15 T3-C3<br>#14 T3-C2<br>#15 T3-C3<br>#14 T3-C2 | **DEFECT**<br>**DEFECT**<br>**DEFECT**<br>**DEFECT** | OK<br>OK<br>OK<br>OK |
| 16 | **T3-C4** | s8-publication-contract.test.ts<br>bug03-home-buffer.test.tsx<br>pda-s02-public-page.test.tsx<br>pda-s03-keyboard-accessibility.test.ts | #15 T3-C3<br>#14 T3-C2<br>#15 T3-C3<br>#14 T3-C2 | #15 T3-C3<br>#14 T3-C2, #16 T3-C4<br>#15 T3-C3, #16 T3-C4<br>#14 T3-C2 | **DEFECT**<br>OK<br>OK<br>**DEFECT** | OK<br>OK<br>OK<br>OK |
| 17 | **T4-C1** | ux01-new-debate-form.test.tsx<br>v2ui-pages.test.ts | #17 T4-C1<br>#17 T4-C1 | #17 T4-C1<br>#17 T4-C1 | **DEFECT**<br>**DEFECT** | OK<br>OK |
| 18 | **T4-C2** | ux01-new-debate-form.test.tsx<br>v2ui-pages.test.ts | #18 T4-C2<br>#18 T4-C2 | #18 T4-C2<br>#18 T4-C2 | **DEFECT**<br>**DEFECT** | OK<br>OK |
| 19 | **T4-C3** | ux01-new-debate-form.test.tsx<br>v2ui-pages.test.ts | #19 T4-C3<br>#19 T4-C3 | #19 T4-C3<br>#19 T4-C3 | **DEFECT**<br>**DEFECT** | OK<br>OK |
| 20 | **T4-C4** | ux01-new-debate-form.test.tsx<br>v2ui-pages.test.ts | #19 T4-C3<br>#19 T4-C3 | #19 T4-C3, #20 T4-C4<br>#19 T4-C3 | OK<br>**DEFECT** | OK<br>OK |
| 21 | **T6-C1** | s5-session-controls.test.tsx | #21 T6-C1 | #21 T6-C1 | **DEFECT** | OK |
| 22 | **T6-C2** | s5-session-controls.test.tsx | #22 T6-C2 | #22 T6-C2 | **DEFECT** | OK |
| 23 | **T6-C3** | s5-session-controls.test.tsx | #22 T6-C2 | #22 T6-C2 | **DEFECT** | OK |
| 24 | **T6-C4** | s5-session-controls.test.tsx | #22 T6-C2 | #22 T6-C2, #24 T6-C4 | OK | OK |
| 25 | **T7-C1** | auth-front-door-parity.test.ts<br>auth-flow-integration.test.tsx | none — absence-clause pin<br>#25 T7-C1 | n/a (constraint)<br>#25 T7-C1 | OK<br>**DEFECT** | OK<br>OK |
| 26 | **T7-C2** | auth-front-door-parity.test.ts<br>auth-flow-integration.test.tsx | none — absence-clause pin<br>#26 T7-C2 | n/a (constraint)<br>#26 T7-C2 | OK<br>**DEFECT** | OK<br>OK |
| 27 | **T7-C3** | auth-front-door-parity.test.ts<br>auth-flow-integration.test.tsx | none — absence-clause pin<br>#26 T7-C2 | n/a (constraint)<br>#26 T7-C2 | OK<br>**DEFECT** | OK<br>OK |
| 28 | **T7-C4** | auth-front-door-parity.test.ts<br>auth-flow-integration.test.tsx | none — absence-clause pin<br>#26 T7-C2 | n/a (constraint)<br>#26 T7-C2, #28 T7-C4 | OK<br>OK | OK<br>OK |
| 29 | **T8-C1** | auth-front-door-parity.test.ts<br>auth-flow-integration.test.tsx | none — absence-clause pin<br>#29 T8-C1 | n/a (constraint)<br>#29 T8-C1 | OK<br>**DEFECT** | OK<br>OK |
| 30 | **T8-C2** | auth-front-door-parity.test.ts<br>auth-flow-integration.test.tsx | none — absence-clause pin<br>#29 T8-C1 | n/a (constraint)<br>#29 T8-C1 | OK<br>**DEFECT** | OK<br>OK |
| 31 | **T8-C3** | auth-front-door-parity.test.ts<br>auth-flow-integration.test.tsx | none — absence-clause pin<br>#31 T8-C3 | n/a (constraint)<br>#31 T8-C3 | OK<br>**DEFECT** | OK<br>OK |
| 32 | **T8-C4** | auth-front-door-parity.test.ts<br>auth-flow-integration.test.tsx | none — absence-clause pin<br>#31 T8-C3 | n/a (constraint)<br>#31 T8-C3, #32 T8-C4 | OK<br>OK | OK<br>OK |

Counts, each with its frame stated because they differ and a bare number would
mislead:

| Frame | Verify commands | Write surfaces | Breaker rule | DEFECT cells |
|---|---|---|---|---|
| A | pre-AM5 | pre-AM5 | mechanical file overlap | 29 |
| B | post-AM5 | pre-AM5 | adjudicated | **43** |
| C | post-AM5 | post-AM5 | adjudicated | **0** |

T9-C1's blocking cell is present in all three of A and B and absent in C.

**The resolution, in three lines.** *Pin ownership follows subject ownership* —
the cluster that rewrites a product file owns every standing pin that reads it,
which makes the law hold by construction at every position instead of by
ordering luck. *Nothing is reordered*: all 32 positions and every dependency
rationale published in this file survive, because the defect was ownership, not
sequence. *Two pins gain no writer at all* — `pol01-policy` and
`auth-front-door-parity` assert absence, so their red is a product bug and
editing them would delete the security property they exist to hold.

**Refutation — what this amendment would still miss.** The sweep is only as good
as the read-map, and the read-map is a static join. A pin that reaches a product
file through a runtime import chain (test → component A → component B) is
invisible to it; `ui02d-model-identity.test.tsx` asserts across seven components
and is KEEP only because `ADR-006` freezes their class names. If a cluster
renames a frozen class the sweep says OK and the suite goes red. That is
`ADR-006`'s job, not this law's, and the two must both hold.


### 2026-09-01 — AM6: the `/` chrome adjudication, the landing query convention, and a compile gate that passed by doing nothing (trigger: T9-C1 blind review, `t_4487f9b1` verdict 00:26 — B1 root cause, N1, N2)

**The premise underneath three documents was false.** `ADR-002` and
`slices/T9/DECISIONS.md:45` both said logged-out `/` *"does not render
`TopBar`"*. `apps/ui/app/layout.tsx:44` renders it on every route;
`TopBar.tsx:57` nulls only `/debate/*` and `/public/debate/*`. I wrote that
premise in AM5 to justify a conclusion that happened to be right, without
reading the file that decides it.

**Its two consequences, both found by the review and neither predicted by me:**

| | |
|---|---|
| **B1 (blocking)** | `T9-C1-3` — the pin AM2/D added *specifically* so the mode control could not go missing from the one surface T9 R3 names — queried the whole anonymous document. From row 3 onward `TopBar` supplies a second `[data-mode-toggle]`. The reviewer simulated T3-C1's mount, deleted T9-C1's, and got `5 passed (5)`. The pin had stopped discriminating |
| **N1 (product)** | Nothing in the plan noticed that anonymous `/` would ship **two headers with two different product names** — `DebateAI` (T9-S1) above/below `Dialectical Engine` (T3-S1) — plus `+ New debate` and `⚙ Settings`, which a logged-out visitor cannot use |

**Adjudicated (charge 2): `TopBar` does not render on anonymous `/`.** Grounds,
alternatives and the implementation cost are in `ADR-002` §"The `/` chrome
adjudication"; the cell is `T3-C1-4` above; `globals.css` gains its declared
second writer. The decision is grounded in the TURN 9 artboard (which shows no
application bar) and SPEC T9 States 1 (*"the landing IS the document"*), not in
taste.

**Published (charge 3): the landing query convention.** `[data-landing-section]`
scoping for presence assertions, document-wide for absence assertions. The
review's class sweep listed three members and one non-member; the remedy is a
convention rather than three patches, because T9-C2 and T9-C4 inherit the same
harness and would otherwise each rediscover it.

**Fixed (charge 4): the compile gate.** Both copies. `ADR-006` carries the
four-directory run and the discrimination proof; the copy in this file's
acceptance defaults had no directory discipline at all and printed the required
`0` from anywhere without a `package.json`. Thirty clusters still have to run it.

**What I got wrong, in one line each.** AM5: asserted a rendering fact from the
shape of a route split instead of reading `layout.tsx`. AM2: wrote the law *"name
the invocation directory"*, named one, and never ran the block from it. Both are
the same failure — **publishing a claim in the voice of a measurement without
taking the measurement** — and both were caught by seats downstream of me rather
than by any gate I wrote.

**Verification re-run after every edit in this amendment**, against the published
markdown rather than a working copy: 32 rows, 5 exemptions, **0 violations** of
the AM5 verify-survivability law. The fifth exemption is new here and is a
consequence of AM6 itself: T3-C1's `globals.css` write is read by
`v2ui-pages.test.ts`, and the single added rule cannot intersect any selector it
pins.

### 2026-09-01 — AM7: the third cell defect, and it is one act repeated (trigger: T3-C1 blind review, `t_9d3f1f2d` verdict 02:04 — B1, B2, N5, N6)

**B2 — `T3-C1-4` prescribed a synthetic artifact.** The cell said *"build a
document containing `.appShell > header.topBar` plus a `[data-landing-section]`
element"*. The worker obeyed it exactly. The result validated the selector only
against documents the test hand-writes, while `apps/ui/app/layout.tsx` — the
file that actually emits that shape — was read by no test in the render suite.
Measured: nesting `TopBar` one `<div>` deeper in `layout.tsx` left `12 files /
92 tests` and the widest usable net `22 files / 102 tests` fully green, with the
entire AM6 two-toggles adjudication silently reverted. Rewritten above to the
reviewer's verified P1/P2/P3 real-render trio, **adopted verbatim**; I re-derived
P3 against the shipped file and both structural mutants before adopting, and
found no defect in it. The one thing it does not cover — `{children}` hoisted out
of `.appShell` — is named in the cell and routed as a V closure line, not
smuggled in as an edit to their form.

**B1 — `T3-C1-5` added.** `ADR-002`'s mount table collapses two `TopBar` code
sites into one row, and my pin-coverage claim counted rows. The `authTopBar` ☾
mount was shipped and pinned by nothing, and T3-C1 is the only row of 32 that
writes the file.

**N5, N6 — recorded and re-measured.** `.eyebrow` already uppercases, so T3's
copy change is source-text-only but now puts literal caps in the DOM where AT
reads them; recorded so nobody "fixes" it in either direction. The suppressed
bar's cost is four dead links, a duplicate toggle and the chip — measured, not
estimated, and the earlier estimate had erred toward flattering the decision.

**The pattern, stated because it is now three.** AM2 published a type contract
that did not compile. AM3 published an exclusion of the wrong shape. AM6
published a gate that had never been run as published. AM7's two are the same
act again: prescribing a **synthetic artifact where only the real one proves the
property**, and claiming coverage from a count I never took. The corrective is
not "be more careful" — it is a rule with a test: **an acceptance must name the
real artifact the property lives in, and if a cell can be satisfied by a
document the test itself authored, it is not an acceptance.** So every cell in this file was
audited against that rule in this edit — all three of them, enumerated by
`grep`, not from memory:

| Cell | Real artifact? | Verdict |
|---|---|---|
| `T9-C1-3` | yes — the rendered anonymous `/` | but its **query was still unscoped**, i.e. the exact form its own review blocked. **Amended here** (see the note under the cell). Not charged; found by running the audit instead of asserting it |
| `T3-C1-4` | now yes — P1/P2/P3 | the subject of this amendment |
| `T3-C1-5` | yes — the real `authTopBar` branch of the real `TopBar` | clean; the property lives in the component being rendered |

One of three was still defective. That is the honest result, and it is why the
audit was run rather than claimed: the sentence I had drafted said all cells
were clean.

**Verification re-run in this edit**, against the published markdown: the AM5
verify-survivability invariant holds at 32 rows / 5 exemptions / 0 violations —
AM7 changed no Writes or Verify column, and the check is re-run rather than
assumed.

### 2026-09-01 — AM8: a cell that predated my own convention, and the third CTA site nobody pinned (trigger: fresh T9-C2 seat preflight block, `t_3c187757` 02:57)

**What was wrong.** PLAN's `T9-C2-2` reads *"Assert both strings on anonymous
`/`"* — written before AM6 published the scoped-presence convention. Under that
convention the cell is unsatisfiable by T9-C2's charge: SPEC puts
`Read a scored transcript` only in `T9-S2` (the hero), and `LandingHero.tsx`
belongs to T9-C4 at row 5. The seat blocked in six minutes with zero edits and
proposed both lawful repairs. It was right on every point, including which of
the two to prefer.

**Adopted: the seat's option (b).** `T9-C2-2` narrowed to the chrome primary
CTA; the S2 hero pair transferred to a new `T9-C4-5` carrying the ADR-004
auth-entry contract so T9-C4 cannot ship a live-looking dead CTA. Option (a) —
moving `LandingHero.tsx` into T9-C2 — was rejected because T9-C4 must still
write the hero body copy for `T9-C4-4`, so option (a) puts two writers on one
file inside one wave, which is the hazard the wave structure exists to remove.
**No write surface moves in this amendment.**

**Beyond charge, and declared: `T9-C4-6`.** R5 names three sites — *"`Start a
debate` (hero + chrome + method close)"* — and `T9-S4` names the third
explicitly. Grepping PLAN's cells rather than trusting the charge's framing
showed only two mention the string, and neither reaches the method close. So the
third site was pinned by nothing, and **narrowing `T9-C2-2` would have created
that hole rather than merely inheriting it** — the old unscoped assertion at
least matched the string wherever it lived. Publishing the narrowing alone would
have made this amendment the author of the mission's fourth unpinned-site
defect, in the file already open to fix the third. `LandingMethod.tsx` is
already row 5's, so the fix costs a cell and no surface.

**Real-artifact audit, re-run over all six published cells** (AM7's rule: a cell
satisfiable by a document the test itself authored is not an acceptance). Six of
six now name a real render — `T9-C1-3`, `T3-C1-4` (P1/P2/P3), `T3-C1-5`, and the
three above. The AM6 convention section is untouched; note that it already lists
*"the CTAs"* among the things to scope, so the narrowing is the convention being
applied, not extended.

**Verification, re-run on the published markdown after this edit:** the AM5
verify-survivability invariant holds at **32 rows, 5 exemptions, 0 violations**.
AM8 changed no Writes and no Verify column, and the check was re-run rather than
assumed.

### 2026-09-01 — AM10: a pin that answered "does this string exist here" where the SPEC fixes a pairing (trigger: T9-C4 blind review, `t_b7c114a3` verdict 04:21, N2 and N1)

**What was wrong.** `T9-C4-1` pins number↔title positionally through
`steps[index]`; `T9-C4-4` pins the four step bodies as method-subtree
containment. Containment over a subtree is permutation-invariant, so the
reviewer's M3 — bodies 01↔02 swapped **inside** the method subtree — shipped
**GREEN**. Their earlier MOVE mutant crossed subtrees, which the AM6 scoped pins
catch; a same-subtree permutation is strictly harder and slipped. The asymmetry
sat inside a single cluster, between two of my own cells.

Reproduced here before amending, rather than taken on report:

```
tree                               T9-C4-4 today (subtree contains)   T9-C4-4 amended (steps[index])
shipped (correct pairing)          GREEN                              GREEN
M3: bodies 01<->02 swapped         GREEN  <- ships the defect         RED  <- caught
```

and the four published pairings were checked back against SPEC by harvesting
`§Copy`'s `- 0N:` lines at run time rather than by transcription: **4 of 4
verbatim**, titles matched to `§Copy`'s titles line.

**The rule this produces.** `toContain` over a subtree answers *"does this string
exist here"*. Where a SPEC fixes an ordered correspondence, the question is
*"is this string in **its** slot"*, and the two differ by exactly one
permutation. **Pin the correspondence, not the membership.**

**Class sweep — every ordered correspondence on the landing, with how each is
pinned.** Run, not assumed:

| Site | Shape used | Verdict |
|---|---|---|
| Five section markers | `expect(order).toEqual([...])` — full ordered equality | strongest available; permutation-proof |
| Method steps 01–04 | positional for number+title, **containment for bodies** | **the defect; amended above** |
| Sample card anatomy | scoped to one card (`cardText` from a single `[data-bezel="shell"][data-stance]`) | correct — `T9-C4-2` requires the full anatomy on **≥1 card**, and the assertion is within-card, not across the sample subtree |
| Sample card order (PRO/CON/REASONING) | existence per stance, not positional | correct — no SPEC fixes their order, which is why the reviewer's neighbour-control reorder was GREEN and correctly **not** filed |

One of four was defective. The other three are recorded so the next lens does
not re-derive them.

**Q-16 folded in, and it is OPEN.** SPEC `T9-S3`'s `Turns 01–04` is pinned by
nothing and absent from the shipped sample — the recurring unpinned-site class,
now its fifth instance. It is a design-fidelity ruling, so it is V's
(`t_adb4bfaf`), and until it lands **no seat may treat the landing sample as
final-complete, and no seat may "fix" the absence unratified** — the same
discipline AM9 applied to the declared kind.

**Owning round:** the T9-C4 addendum, worker session `01a05a71`. Two lines in
`tests/render/t9-landing.test.tsx`, already in row 5's write surface — **no write
surface changes, no product change**, because the shipped ledger is correct
today; only the pin was weak.

**Verification re-run on the published markdown:** AM5 verify-survivability
invariant holds at **32 rows, 5 exemptions, 0 violations**. AM10 changed no
Writes and no Verify column; re-run rather than assumed.
