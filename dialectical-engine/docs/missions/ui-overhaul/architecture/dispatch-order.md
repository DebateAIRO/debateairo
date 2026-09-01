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
raw=$(pnpm exec tsc --noEmit -p apps/ui/tsconfig.json 2>&1 | grep -E 'error TS')

# Baseline 1 — PDA-owned AnswerExport union mismatch. LINE-AGNOSTIC, COUNT-PINNED.
b1=$(printf '%s\n' "$raw" | grep -cE 'app/debate/\[id\]/DebatePageClient\.tsx\([0-9]+,[0-9]+\): error TS2322')
[ "$b1" -eq 1 ] || { echo "GATE FAIL: baseline TS2322 count is $b1, expected exactly 1"; exit 2; }
# Baseline 2 — structural globals.css side-effect import.
b2=$(printf '%s\n' "$raw" | grep -cE 'app/layout\.tsx\(3,8\): error TS2882')
[ "$b2" -eq 1 ] || { echo "GATE FAIL: baseline TS2882 count is $b2, expected exactly 1"; exit 2; }

printf '%s\n' "$raw" \
  | grep -vE 'app/debate/\[id\]/DebatePageClient\.tsx\([0-9]+,[0-9]+\): error TS2322' \
  | grep -vE 'app/layout\.tsx\(3,8\): error TS2882' \
  | tee /dev/stderr | wc -l          # required: 0
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

### The PRESERVING-WRITE clause (added 2026-09-01, AM14)

The law above transfers pin ownership to whoever **rewrites** a product file,
because a rewrite can move the anchors a pin reads. AM14's fidelity rows write
`globals.css` (owned by row 1) and `LandingChrome.tsx` / `LandingSample.tsx`
(rows 2/4/5) without rewriting anything a pin can see, and the mechanical rule
would hand a *styling* worker edit rights over the token contract and over
`pda-s03-keyboard-accessibility.test.ts`. That is guard rail 1 inverted, and it
is worse than the hole it closes. So:

> **A PRESERVING write does not transfer pin ownership.** A cluster's write on
> file `P` is PRESERVING when its charge forbids removing anything a pin can
> see:
>
> - **stylesheet form** — the diff over `P` has **zero removed lines** and
>   **exactly one hunk**, appended at end of file under a named banner comment;
> - **component form** — the post-edit render's set of `data-*` attributes,
>   `href` values, `aria-*` values and text nodes is a **superset** of the
>   pre-edit set.
>
> Both shapes are checkable and the cell must publish the check. Pins reading
> `P` then enter the preserving cluster's verify command as **KEEP-class
> guards**: a RED is fixed in the product — by removing or correcting the
> appended rules — and **never** in the pin.

The clause is narrow on purpose. It does not apply to a cluster that renames,
re-nests, deletes or re-strings; those are rewrites and the original rule
stands. It applies to the one shape that provably cannot break a reader:
**addition**.

The checkable form of the stylesheet clause, runnable as written from the pnpm
workspace root:

```sh
# 1. purely additive: no removed lines
git diff --unified=0 -- apps/ui/app/globals.css | grep -cE '^-[^-]'   # required: 0
# 2. one contiguous block, not scattered edits
git diff --unified=0 -- apps/ui/app/globals.css | grep -cE '^@@'      # required: 1
# 3. the block is present, under its banner
grep -c 'FID-1 LANDING CHROME' apps/ui/app/globals.css                # required: 1
```

Zero deletions + one hunk + the banner present is *strictly appended*, which is
the whole content of the claim.

**Run, not asserted.** On the tree at `259de07d` all three print `0 / 0 / 0`
(nothing appended yet). Appending a banner and one rule and re-running prints
**`0 / 1 / 1`** — the gate discriminates. `grep -c` exits **1** when the count
is zero, so this block must not be run under `set -e`, and a wrapper must read
the printed count rather than the exit status. Probe reverted; `git status
--porcelain apps/ui/app/globals.css` empty afterwards.

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

## FIDELITY LAW (added 2026-09-01, AM14 — gates every remaining visual cell)

**Every VISUAL cell names two halves, explicitly. A cell that names neither is
not a visual cell and must not be dispatched.**

**(a) The machine-checkable half.** Assertions that go RED when the surface
stops looking like the design. A string-or-attribute assertion is *not* this
half — that is precisely what let the landing chrome ship as three stacked
lines with every gate green. jsdom cannot supply this half: it does not resolve
`var()`, does not lay out, and reports every geometry as `0`. So this half is
executed in a **real browser**, by the procedure named below, and its output is
quoted into the cluster report.

**(b) The V-QA half.** The judgement V makes by looking, written as a question
with a subject so it can be answered yes/no and recorded — not "looks right".

### Why (a) is a procedure and not a committed vitest case

Measured, not assumed:

```sh
$ grep -rn 'playwright' package.json apps/ui/package.json
                        # no matches — Playwright is in no manifest in this repo
```

and two further constraints already paid for in this mission: the Playwright
MCP **blocks `file://`**, so a fixture needs a loopback HTTP server; and a
worker sandbox has already been observed to fail `listen EPERM` on loopback,
which silently converts a real-HTTP contract test into a blocked gate
(`CODE-T1C2-REV-claude.md` §11.2, now in `TOOLING-TRAPS`). A committed browser
test would therefore be a gate that is green on one machine, blocked on
another, and absent from CI. **Half (a) is a seat procedure with a published
output; the residue that jsdom genuinely can see — class presence, attribute
cascade, `:has()`, structural order, text content — is committed as ordinary
pins in the same cell.**

### THE DOM-DUMP BROWSER KIT — named once, so no cell re-invents it

1. Render the real component tree in jsdom, **in the real test file**, via a
   throwaway `it("DUMP")` that writes `container.innerHTML` to `/tmp`.
2. Serve that file **plus the real `apps/ui/app/globals.css`** on loopback.
3. Open it in Chromium through the Playwright MCP; set
   `document.documentElement.dataset.mode` to `terracotta` and then `chamber`,
   reading **both**.
4. Read `getComputedStyle` and `getBoundingClientRect` for the values the cell
   names. Geometry claims come from rects; colour and elevation claims come
   from computed style.
5. **Tear down**: restore the test file by checksum, and delete any
   `.playwright-mcp/` output the MCP wrote into the CWD **before** the tree
   check. Note that a `.playwright-mcp/` directory may already be **tracked** at
   the git root from an earlier mission — `rm -rf` it and you have deleted
   committed files. Check `git status --porcelain .playwright-mcp` after
   cleanup; if it shows deletions, `git checkout -- .playwright-mcp`.

Step 5's warning is written from the inside: this amendment ran the kit, deleted
the tracked directory, and restored it.

### Inheritance — this is a pre-dispatch gate, not advice

**T5, the T3 list surfaces, T4, T6, T7 and T8 do not dispatch until every
visual cell in them carries both halves.** The router checks this at
pre-dispatch, the way it checks the write surface. A cell whose acceptance is
only `toContain("...")` over a subtree is, after AM14, an incomplete cell —
the same status a missing verify command has.

**What "visual" means here**, so nobody argues the boundary: a cell is visual if
its SPEC row describes appearance, layout, or composition — anything a reader
sees rather than reads. A cell about a route, a href, a schema, or a string's
presence is not visual and inherits nothing.

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
| 6 | **T9-C5** — render-pin migration bind for T9 (**the R9 MIGRATION bind only — it certifies the four INHERITED standing pins still hold after T9 rewrote their subject; it is NOT a slice-completeness gate and does NOT certify the mission's ten new T9 pins, which later slice regression sets run under the AM5 ownership law. A green row 6 does not mean "T9 is complete"** — AM12b/item 9) | `tests/unit/pda-s03-keyboard-accessibility.test.ts` | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/v2ui-pages.test.ts` |

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
| **T9-C2-6** (new) | R5 · ADR-004 §Decision | The login→sign-up leg forwards `next`, so R5's sign-up branch keeps its return path | In `tests/render/t9-landing.test.tsx` (T9-C2's block): render `LoginFlow` at `/login?next=%2Fnew` and assert the `Create one` link's `href` is `/sign-up?next=%2Fnew` — not the bare `/sign-up` shipped at `LoginFlow.tsx:115`. **And** pin the round trip end to end: from `/login?next=%2Fnew`, `Create one` → `Already have one? Log in` returns an href whose decoded `next` is still `/new`. A mutant that drops the parameter on either leg must be RED. Do **not** add a second validation site — the forwarding legs are transport, `safeReturnPath` is the gate (ADR-004 §Wiring, AM9 note) **AND the absent complement (AM11/N8):** rendered with NO `next` in the URL, the `Create one` href is exactly `/sign-up` — no query string, not `/sign-up?next=`. Both halves are required; the present case alone is satisfied by a component that appends unconditionally |
| **T9-C2-7** (new) | R5 · ADR-004 §"The validator" | The public-debate kind admits only real refs | In `tests/unit/t9-return-path.test.ts` (T9-C2's file), extend the hostile-input table: `safeReturnPath('/public/debate/..')` and `safeReturnPath('/public/debate/.')` each return exactly `/#start-a-debate`; and an accept-case — `safeReturnPath('/public/debate/3f2a1b4c-9d8e-4f70-b1c2-5a6d7e8f9012')` returns that path unchanged. The accept-case is required: it is what will go RED if `public_ref` ever stops being a UUID, which is the signal ADR-004's changelog names **AND a schema-agreement row (AM11/N9, DEPARTED from the reviewer's form — see below):** import the contract's own field schema and assert `PublicDebateSummarySchema.shape.public_ref.safeParse('<the same fixture>').success === true`. **Not** `z.uuid().safeParse(fixture)` — that form is constant under the drift it is meant to detect |

#### AM11 — the two complements these cells were missing

**N8 — the absent case had no pin, and a working model sat one file away.**
`LoginFlow.tsx:31-35` sets `signUpHref` to `/sign-up` and appends `?next=` only
when the parameter is present. AM9's `T9-C2-6` pinned the present case and the
round trip; it did not pin the absent case. Enumerated over the whole test
corpus rather than by mutating a shared tree with two lanes live:

```
$ grep -rn 'signUpHref|Create one|/sign-up' tests/
tests/render/t9-landing.test.tsx:229   expect(createOne?.getAttribute("href")).toBe("/sign-up?next=%2Fnew")   <- the ONLY Create-one pin
```

Modelled against the reviewer's M17 (mutate `LoginFlow` to append
unconditionally):

```
rendered at                shipped                    M17 (always append)
/login?next=%2Fnew         /sign-up?next=%2Fnew       /sign-up?next=%2Fnew
/login  (no next)          /sign-up                   /sign-up?next=

shipped        T9-C2-6 present-case: GREEN  | absent-case complement: GREEN
M17 mutant     T9-C2-6 present-case: GREEN  | absent-case complement: RED
```

**The sharper form of the finding, which the enumeration gives and the mutant
does not:** `SignUpFlow`'s absent case **is** pinned —
`auth-flow-integration.test.tsx:306` *"keeps the sign-up login link query-free
when next is absent"*, asserting `/login`. The two legs of one round trip have
different coverage, and the uncovered leg is the one **AM9 added**. There was a
correct model of the pin in the repo, one file away, when I wrote the cell.

**N9 — DEPARTED from the reviewer's remedy, on a measurement.** The remedy was
three lines asserting `z.uuid().safeParse(<fixture>).success === true`. That
assertion **cannot fail on the drift it exists to catch**: it exercises `zod`,
not the contract. Run against a simulated drift of `public_ref` to a slug
schema:

```
assertion form                                       contract = z.uuid() (today)  contract drifted to slug
REVIEWER: z.uuid().safeParse(fixture).success        true                         true
ADOPTED : <Schema>.shape.public_ref.safeParse(fx)    true                         false   <- RED, alarms
```

The **intent** is adopted in full — bind the alarm to the schema — and only the
binding target changes, from `zod`'s `uuid` to the contract's own field.
`PublicDebateSummarySchema` is exported (`packages/contract/src/index.ts:252`)
and zod v4 object schemas expose `.shape`, so the field is reachable from a test;
`tests/unit/pol01-policy.test.ts` already imports `@debateai/contract`, so the
resolution path is proven in this suite.

**N11 — retitle is the worker's; nothing in ARCH text names the row.** Grepped
`dispatch-order.md` and every ADR for the `t9-return-path.test.ts` row named
*"overlong public debate ref"* (`tests/unit/t9-return-path.test.ts:45`): **zero
ARCH occurrences**, so there is nothing here to retitle. Since AM9's narrowing,
that input is rejected on non-UUID **shape** before its length is ever reached,
so the name describes a property the row no longer tests. **The in-file rename
belongs to the addendum seat**, not to this amendment — recorded so the retitle
is not read as ARCH-owned, and so nobody assumes ARCH text was updated.

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
| 8 | **T1-C2** — card anatomy, stance tab, connectors | `apps/ui/components/DebateCanvas.tsx` · `DebateTree.tsx` · `DebateMap.tsx` · `DebateSplit.tsx` · `DebateThread.tsx` · `DebateOutline.tsx` · `ModelPresentation.tsx` · `apps/ui/lib/debatePresentation.ts` · `apps/ui/lib/scrutiny.ts` · `tests/render/t1-canvas.test.tsx` · `tests/render/ui02e-debate-canvas.test.tsx` · `tests/unit/v2ui-pages.test.ts` · `tests/support/v2uiFixtures.ts` (**the review-helper type only** — AM12a/T1-C2-5) | `pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/render/prov01-honesty-drawer.test.tsx tests/render/t1-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-data-layer.test.ts tests/unit/v2ui-export.test.ts tests/unit/v2ui-ownership.test.ts tests/unit/v2ui-pages.test.ts` |
| 9 | **T1-C3** — set-aside, synthesis, publicMode | `apps/ui/components/DebateCanvas.tsx` · `apps/ui/components/SynthesisPanel.tsx` · `tests/render/t1-canvas.test.tsx` · `tests/render/ui02e-debate-canvas.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/t1-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts` |
| 10 | **T1-C4** — render-pin migration for T1 | `tests/render/ui02e-debate-canvas.test.tsx` · `tests/unit/pda-s02-affordance-drift.test.ts` | `pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts` |
| 11 | **T5-C1** — drawer open + core sections | `apps/ui/components/NodeDetailDrawer.tsx` · `tests/render/t5-drawer.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/pda-s02-public-tree.test.tsx tests/render/prov01-honesty-drawer.test.tsx tests/render/t5-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts` |
| 12 | **T5-C2** — actions, history, mode | `apps/ui/components/NodeDetailDrawer.tsx` · `tests/render/t5-drawer.test.tsx` · `tests/unit/v2ui-pages.test.ts` | `pnpm exec vitest run tests/render/pda-s02-public-tree.test.tsx tests/render/prov01-honesty-drawer.test.tsx tests/render/t5-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/t9-mode-tokens.test.ts tests/unit/v2ui-pages.test.ts` |
| 13 | **T5-C3** — render-pin migration for T5 | `tests/unit/v2ui-pages.test.ts` (T5 slice-close residual only — see the note below) | `pnpm exec vitest run tests/render/pda-s02-public-tree.test.tsx tests/render/prov01-honesty-drawer.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts` |

#### T1-C2 rework cells — T1-C2-5 and T1-C2-6 (AM12a)

Both come from the T1-C2 RW1 review and both are **cell defects, not worker
defects**: the worker implemented what row 8 and PLAN HOW enumerate. PLAN stays
frozen; these dispatch cells are dispatch truth and supersede the enumerations
named below (AM7/AM8/AM10 practice).

**B2 — the review-mark enumeration is not a partition.** The contract union is
`agree | dispute | cannot-assess` (`packages/contract/src/index.ts:417`,
`NodeReviewSchema`); the enumeration says `agreed | disputed | absent`. The
shipped ternary (`DebateCanvas.tsx:251-255`) maps two and lets the third fall
into the `else`. Probe run in this amendment over the **full** union rather than
over the fixtures:

```
review state                       data-node-review (shipped)   data-review (shipped)  data-review (amended)
completed: agree                   agree                        agreed                 agreed
completed: dispute                 dispute                      disputed               disputed
completed: cannot-assess           cannot-assess                absent                 unassessed
no review at all                   absent                       absent                 absent

shipped data-review distinct values: agreed | disputed | absent  -> 4 states collapse to 3
```

**A completed `cannot-assess` review and no review at all render identically.**
Those are different facts: a `cannot-assess` review is a *recorded finding* with
`reasons`, `provenance_ref` and `reviewer_lineage` (all required by
`NodeReviewSchema`), while `absent` means the review never happened. Folding a
recorded honest "I could not assess this" into "nothing here" is the same class
this repo pins against elsewhere — `Not exposed by scoring API` rather than a
fabricated zero, and T7's `no worker state is fabricated`. **So the fold is
refused and the mapping goes total.**

The sibling attribute on the same element already carries the value —
`data-node-review={v3Review?.outcome ?? "absent"}` (`DebateCanvas.tsx:445`) is
total today — so this costs one ternary arm, not a new data path.

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **T1-C2-5** (new, supersedes the `agreed\|disputed\|absent` enumeration in row 8 and PLAN T1-C2 HOW) | R3 · contract `NodeReviewSchema` | `data-review` is a **total** function of the review state — four states, four values, no collision | In `tests/render/t1-canvas.test.tsx` (T1-C2's file): render a canvas whose fixtures carry, on four different nodes, each of `agree`, `dispute`, `cannot-assess`, and **no review**, and assert `data-review` is `agreed`, `disputed`, `unassessed`, `absent` respectively. **The `cannot-assess` row is the one that must go RED against the shipped ternary** — prove it. Also assert the four values are pairwise distinct, so a future fold cannot pass. The dot colour MAY remain `--muted` for both `unassessed` and `absent`: the dot is `aria-hidden="true"` decoration and the distinction lives in the attribute, so no new colour token is required and none is authorised here |

**Fixture-type widening — RULED, and it is why no RED existed.**
`tests/support/v2uiFixtures.ts:18` types the helper
`(outcome: "agree" \| "dispute", …)`, a hand-written copy of two thirds of the
contract union, so `cannot-assess` was **unconstructible** in any fixture. The
type is widened — and **not by hand-copying the third member**. It binds to the
contract:

```ts
import type { NodeReview } from "@debateai/contract";   // exported: index.ts:422
const review = (outcome: NodeReview["outcome"], reviewer: string) => ({ … });
```

This is AM11/N9's rule applied one layer down: **an alarm that restates the
contract cannot detect the contract moving.** A hand-widened
`"agree" | "dispute" | "cannot-assess"` would be correct today and silently stale
the next time the union changes; `NodeReview["outcome"]` goes red at compile time
instead. `tests/support/` is inside T1-C2's write surface for this mission's
support files, and the ADR-006 compile gate is the thing that will catch a
regression here.

**N4 — four stances, three line tokens: RULED, root gets its own binding.**
Measured: `Role = "root" | "pro" | "con" | "pov"` (`debatePresentation.ts:8`),
`stance = role === "pov" ? "reasoning" : role` (`DebateCanvas.tsx:232`), so
`data-stance ∈ {root, pro, con, reasoning}` — PLAN's four are right. But
`stanceLine` has three arms with a catch-all `else`, so **root paints
`--reasoning-line`**, and that line is the `background` of `nodeStanceTab`
(`DebateCanvas.tsx:347`), which every card renders — the root included.

**Ratifying `root = reasoning` is refused, on SPEC evidence:**

| Source | Says |
|---|---|
| `T1-S3` | *"Root claim card \| ROOT CLAIM + question text; claims/depth meta"* — no stance, no type chip, no model line |
| `T1-S4` | *"Argument cards \| Stance tab color; type (**REASONING / PRO / CON**)"* — the stance-tab colour belongs to argument cards, whose types are exactly three |
| design `:495-499` | the ROOT CLAIM card carries `32 claims / depth 4` and nothing else; the `◆ REASONING` at `:500` opens the next card |
| `DebateCanvas.tsx:231` | the code already special-cases root once — `pal = role === "root" ? null : …` |

Painting the root reasoning-blue asserts a card type the SPEC's own inventory
does not give it. The collapse is an accident of a catch-all `else`, not a
decision.

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **T1-C2-6** (new, supersedes PLAN T1-C2 HOW's three-token list at `PLAN.md:97`) | R2 · R4 · T1-S3/S4 | Every one of the four `data-stance` values has an **explicit** line binding; root reads as structural, not as an argument type | `stanceLine` becomes exhaustive over the four stances with **no catch-all**: `pro → var(--pro-line)`, `con → var(--con-line)`, `reasoning → var(--reasoning-line)`, `root → var(--line-strong)`. In `tests/render/t1-canvas.test.tsx`, assert the root card's `nodeStanceTab` background resolves to `var(--line-strong)` and **differs from** the reasoning card's. Prove RED against the shipped catch-all |

**Why `--line-strong`, and the costs measured.** It is an **existing wave-0
token**, declared in both blocks (`globals.css:13` Terracotta
`rgba(41,38,31,.20)`, `:81` Chamber `rgba(242,234,217,.18)`), so the **ADR-001
cost is zero** — no new colour literal enters any file and neither the wave-0 nor
the mission-final oracle moves. It is a neutral hairline, which is exactly the
reading T1-S3 wants: structural, not a stance.

**It is deliberately NOT added to `ADR-005`'s 3:1 non-text list.** That list
(`--pro-line`, `--con-line`, `--gold-line`, `--reasoning-line`, `--focus`) covers
marks that *carry* meaning. The root tab carries the **absence** of stance; the
meaning is carried by the `ROOT CLAIM` label as text, and nothing is lost if the
tab is barely visible. Stated so no later seat "fixes" its contrast and
re-introduces a stance colour on a card that has no stance.

**Rejected alternative, recorded:** suppressing the tab element entirely for the
root. Semantically cleanest, but it deletes the `nodeStanceTab[data-stance]`
carrier that `T1-C2-1` and `T1-C2-6` both query, and a missing element and a
neutral element are not equally easy to assert. Colour binding is the smaller,
lower-risk change and answers the charge as asked.

**Row 8's write surface DOES change, and this is the correction that matters.**
My first draft of this section asserted *"no write-surface change ... 
`tests/support/v2uiFixtures.ts` is support scaffolding for the same cluster"*.
**That was false and I checked it before publishing it.** Measured:

```
$ grep -n 'v2uiFixtures' dispatch-order.md          # rows listing it as a write: NONE
$ grep -rln 'v2uiFixtures' tests/
tests/unit/v2ui-data-layer.test.ts   tests/unit/v2ui-ownership.test.ts
tests/unit/v2ui-export.test.ts       tests/render/ui02e-debate-canvas.test.tsx
tests/render/load01-debate-page.test.tsx  tests/render/prov01-honesty-drawer.test.tsx
tests/render/t1-canvas.test.tsx      tests/render/bug02-debate-effects.test.tsx
```

The file was owned by **no row in 32** and is read by **eight tests**. Shipping
`T1-C2-5` on the earlier claim would have handed T1-C2 an acceptance requiring a
write outside its contract — the AF-1 class, authored by me, inside the
amendment fixing two other cell defects. So:

- `tests/support/v2uiFixtures.ts` is added to row 8's write surface, **scoped to
  the review-helper type** and nothing else.
- Row 8's verify gains the four importers it did not already run —
  `v2ui-data-layer`, `v2ui-ownership`, `v2ui-export`, `prov01-honesty-drawer` —
  per guard rail 3 (*if you write it, you run it*). The other four importers
  (`ui02e`, `load01`, `bug02`, `t1-canvas`) were already in row 8's command.
- The change is **type-widening on a parameter**, so it is additive: every
  existing call site passing `"agree"` or `"dispute"` still compiles, and no
  fixture VALUE changes. That is why eight readers can be touched safely, and it
  is the reason the ADR-006 compile gate is the right net for it.

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

## Wave 6 — fidelity (added 2026-09-01, AM14). Rows 33-35.

**Position is a dependency bound, not a schedule.** These rows carry positions
33-35 so the survivability law reads correctly over them: every cluster that
writes their files — #1 (`globals.css`), #2, #4, #5 (the landing components) —
sits before them. All four are **merged today**, so rows 33 and 34 are
**unblocked and dispatchable now**, ahead of waves 3-5. Nothing later in the
order writes `LandingChrome.tsx`, `LandingSample.tsx` or `globals.css`, so
nothing can overwrite them afterwards.

| # | Cluster | Writes | Verify |
|---|---|---|---|
| 33 | **FID-1** — the landing chrome bar, ported | `apps/ui/components/landing/LandingChrome.tsx` (PRESERVING — component form) · `apps/ui/app/globals.css` (**PRESERVING — stylesheet form; appended block only, banner `FID-1 LANDING CHROME`; see the enumeration below**) · `tests/render/t9-landing.test.tsx` (**new describe `FID-1 chrome fidelity` only**) | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/render/t9-landing.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/t9-mode-tokens.test.ts tests/unit/v2ui-pages.test.ts` |
| 34 | **FID-2** — the sample cards, full anatomy + the generic `ModelPill` | `apps/ui/components/landing/LandingSample.tsx` (PRESERVING — component form) · `apps/ui/components/ModelPill.tsx` (**new file**) · `tests/render/t9-landing.test.tsx` (**new describe `FID-2 sample fidelity` only**) | `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/render/t9-landing.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/v2ui-pages.test.ts` |
| 35 | **FID-3** — the fidelity sweep (review-class; **no product writes**) | `.hermes/reports/ui-overhaul/agent-reports/FID-03-<model>.md` only | not a vitest row — the sweep's output *is* its verify; see the FID-3 spec below |

**Row 33's three `globals.css` readers are KEEP-class guards**, under the
PRESERVING-WRITE clause. Which tests those are was **measured, not assumed** —
the AM5 lesson, and it cost a file:

```
$ for f in <row 33's verify set>; do grep -c 'globals.css' $f; done
t9-mode-tokens.test.ts   4        <- reads it
v2ui-pages.test.ts       2        <- reads it
pda-s03-....test.ts      1        <- reads it, and reads the chrome's attributes
auth-front-door-parity   0
s8-publication-contract  0
t9-landing.test.tsx      0        <- reads the components, via the page render
t1-canvas.test.tsx       0        <- reads NOTHING of FID-1's; REMOVED from the row
```

`t1-canvas.test.tsx` was in my first draft of row 33 on the assumption that the
canvas render pin loads the stylesheet. It does not — jsdom does not resolve
`var()`, which is why the T1-C2 reviewer needed a browser at all. A test that
cannot observe the change cannot guard it, so it is out; leaving it in would
have been theatre with a 4-second price. Row 34 carries
`ui02d-model-identity.test.tsx` on a real read (`ModelPresentation` = 1) — it is
the standing pin on model identity and `ModelPill` must not disturb it.

For all three guards: if one goes RED, the appended rules are wrong and FID-1
fixes **them**. FID-1 may not edit any of the three.

**`ModelPresentation.tsx` is NOT in row 34's write surface.** It belongs to row
8 (`T1-C2`), which is live (`CODE-T1C2-ADD2`). See the ModelPill decision below.

### Why FID-1 and FID-2 exist: the two halves, measured before the cells were written

Both halves below were taken with the DOM-DUMP BROWSER KIT against the
**shipped** markup and the **real** `globals.css`, Chromium via the Playwright
MCP on loopback, before a line of this section was drafted. They are the RED
baseline the cells must move.

**The chrome bar (shipped, `LandingChrome.tsx` at `259de07d`):**

```
header[data-landing-section=chrome]  display: block        <- not a flex row
  child 1  <a> wordmark              top 198  h 19         display: inline
  child 2  <nav>                     top 216  h 19  w 1200 display: block
  child 3  <div> actions             top 235  h 34  w 1200 display: block
  header backgroundColor  rgba(0, 0, 0, 0)   border-radius 0px   box-shadow none
```

Three children on three different lines. No background, no radius, no shadow.
The component carries **zero** `className` attributes and `globals.css` carries
**zero** rules that select it — `grep -nE 'landing|data-landing-section'
apps/ui/app/globals.css` returns exactly one line, the AM6 suppression rule at
`globals.css:219`, which only *hides* the app `.topBar`. Nothing styles the bar
because nothing was ever asked to.

**The same bar with the ported rules** (fixture built from the values quoted in
`FID-1-1` below, both modes):

```
                  terracotta                         chamber
bar height        62px                               62px
bar width         730px                              730px
children          3, vertical centres 65 / 65 / 65   identical
max centre delta  0.0px from the bar centre          0.0px
background        rgba(251, 249, 244, 0.8)           rgba(20, 17, 14, 0.7)
border-radius     16px                               16px
box-shadow        rgba(26,22,19,.26) 0 20px 46px -22px   rgba(0,0,0,.85) 0 24px 52px -24px
backdrop-filter   blur(18px) saturate(1.5)           blur(18px) saturate(1.5)
CTA background    rgb(41, 38, 31)                    rgb(242, 234, 217)
arrow radius      9px                                9px
```

`62px` and `0.0px` are the numbers `FID-1-2` pins. They are measured, not
chosen.

**What was checked and found FALSE, recorded because I would have published
it.** I had drafted a finding that `LandingSample.tsx`'s use of
`className="nodeWrap"` breaks the sample grid, because `globals.css:1944` sets
`.nodeWrap { position: absolute; }` with no offsets and the cards sit in a
`display:grid`. In the browser the grid lays out correctly — 2 columns, 552px
each, height 90px — because `LandingSample.tsx:114` passes an inline
`position: "relative"` that outranks the class. The finding was wrong and is not
in any cell. What survives is smaller and true: **the landing depends on an
inline override of a canvas-graph class**, and `data-bezel` — the shared bezel
vocabulary `component-map.md` §32 names — has **zero** rules in `globals.css`
(`grep -n 'data-bezel' apps/ui/app/globals.css` returns nothing), so
`data-bezel="shell" | "core"` on the sample cards is currently decoration bound
to nothing.

### PORTING SOURCE HIERARCHY — binding, derived, and the landing gap

V ruled the hierarchy directly on `t_5864f48f` at 09:28, mid-amendment. It is
stated here once and every FID cell inherits it. **On any discrepancy, the
authority column wins.**

| tier | file | covers | status |
|---|---|---|---|
| **BINDING ORIGINAL** | `/Users/vladmihaimiron/Documents/DebateAIRO/ui_designs/DebateAI Design Document.html` (1,285,323 B) | the **twelve app screens** — `1a Debate canvas`, `3a Library`, `3b Public debate view`, `4a New debate`, `5a Node detail drawer`, `6a Settings`, `7a`-`7c`, `8a`-`8c` | authority |
| **BINDING for the landing** | `docs/missions/ui-overhaul/design/design-document-rendered.html` (206,757 B, **tracked in this repo**) | the landing, **fully resolved** — no `{{ }}` left, every value computed | authority |
| derived convenience | `.hermes/planning/ui-overhaul/design-source.html` | the twelve app screens, template form | convenience |
| derived convenience | `.hermes/planning/ui-overhaul/design-artboard.html` | the landing, template form | convenience |

**The binding original does not contain the landing.** Measured, because V's
ruling makes it matter:

```
$ # in "DebateAI Design Document.html"
data-screen-label      12      <- the twelve app screens, and only those
"Practice, not performance"     0
"Start a round"                 0
"Read a scored transcript"      0
"backdrop-filter"               0
```

`docs/missions/ui-overhaul/design/design-document-original.html` is the same
file by size (1,285,323 B) and scores 0 on the same five markers. The landing
appears **only** in `design-document-rendered.html`, which is repo-tracked and
carries it *resolved* — which makes it a better porting source than any template
form, since the values are already computed. **OPEN FOR V (Q-17):** if a
separate binding original exists for the landing turn, it supersedes the
rendered document and every value below is re-checked against it. Until then the
rendered document is the landing's authority and this row is the record of the
gap.

**The derived copy was verified rather than trusted**, on exactly the values
this amendment quotes — counts in the original and in the derived copy, side by
side:

```
4 / 4    position:absolute; top:0; left:20px; width:52px; height:4px; border-radius:0 0 5px 5px;
7 / 7    position:absolute; top:0; left:15px; width:44px; height:4px; border-radius:0 0 5px 5px;
11 / 11  padding:3px 10px 3px 7px; border-radius:999px;
2 / 2    Anthropic · Claude · claude-opus-5
2 / 2    OpenAI · GPT · gpt-5.6-sol
1 / 1    Google · Gemini · gemini-3-ultra
1 / 1    gold is reserved for reasoning
```

Seven of seven identical. The convenience copy is safe to read; the original
still wins on any discrepancy.

**Every landing value in the FID-1 and FID-2 tables below was then re-verified
against the resolved document**, and it confirms the port exactly — including
`font-weight: 480` on the hero `h1` (the `terracotta` variant, resolved),
`border-radius: 16px` on the nav bar, `box-shadow: rgba(26,22,19,0.26) 0px 20px
46px -22px` (byte-identical to `--shadow-chrome`), CTA `rgb(41,38,31)` on
`rgb(249,246,241)` (exactly `--ink` on `--bg`), the maker dot `rgb(180,85,45)`
(exactly `--m-gpt`), and the stance triple `rgb(61,90,128)` / `.09` / `.26`
(exactly `--reasoning` and its tint pair). One value in my first draft was
**wrong and is corrected below**: the card core resolves to `rgb(249,246,241)`
= `var(--bg)`, not `var(--core)`.

**No design file in any tier contains a single CSS class.** The template forms
render through `{{ t.* }}` / `{{ tA.* }}` inline styles; the resolved form has
inline styles and `data-dc-tpl` indices. `design.css` (511KB) is Google Fonts
`@font-face` blocks and base64 payloads with not one component rule. **This is
load-bearing for FID-1's cell**: "port the CSS" cannot mean "copy the class
names", because there are none anywhere. The port *introduces* a class
vocabulary and binds it to the values below. A cell asserting "the classes
exist" without saying which would be unsatisfiable.

### The variant is `terracotta`, and it is already in the tokens

`design-artboard.html`'s renderer carries eleven variants. The mission ships
`terracotta`, which the shipped token surface confirms rather than merely
claims:

| artboard `terracotta` | value | shipped token | value | verdict |
|---|---|---|---|---|
| `dispWeight` | `480` | `--fw-display` | `480` | identical |
| `rBtn` | `12px` | `--r-btn` | `12px` | identical |
| `navR` | `16px` | `--r-panel` | `16px` | identical |
| `rChip` | `999px` | `--r-pill` | `999px` | identical |
| `navShadow` (light) | `0 20px 46px -22px rgba(26,22,19,.26)` | `--shadow-chrome` | `0 20px 46px -22px rgba(26,22,19,.26)` | byte-identical |
| `mDots.claude/gpt/gemini` | `#8A63C9` / `#B4552D` / `#3D6FB4` | `--m-claude/-gpt/-gemini` | `#8A63C9` / `#B4552D` / `#3D6FB4` | byte-identical |
| `tint(accent, .09)` / `.26` | the chip recipe | `--{pro,con,reasoning}-bg` / `-border` | the ported pairs | role-identical |

**Wave 0 ported the palette completely and the composition not at all.** That
one sentence is the whole defect, and it is why **FID-1 and FID-2 mint zero new
tokens**: everything they need already resolves in both modes. No mint means no
new ADR-001 contrast rows and no re-opening of the token surface.

**Geometry ports as literals, and that is legal.** ADR-001's sweep is a
**colour**-literal sweep — `oklch\(`, `#RRGGBB`, `rgba?\(`. `border-radius: 9px`
and `padding: 9px 9px 9px 26px` match none of those patterns. The belief that
every number must become a token is the "uncharged translation" failure named in
this amendment's changelog entry; it is not the law. **Colours tokenize;
geometry, spacing, radii and composition port as written.**

### FID-1 — the landing chrome bar

**SPEC.** `T9-S1`. `slices/T9/SPEC.md` is FROZEN; these cells are dispatch truth
and supersede its chrome wording, the practice AM7 and AM10 used.

**Ported values.** Authority is the resolved landing in
`design-document-rendered.html`; the template form in `design-artboard.html` is
quoted where it names the variable, and every value below was checked against
the resolved document.  With the token each colour becomes: The three-column form exists so a worker
never has to decide anything:

| element | design (verbatim inline style) | ships as |
|---|---|---|
| outer | `position:absolute; top:34px; left:0; right:0; display:flex; justify-content:center; z-index:60` | same, literal |
| bar | `display:flex; align-items:center; gap:34px; padding:9px 9px 9px 26px; border-radius:{{ t.navR }}; background:{{ t.glass }}; border:1px solid {{ t.hair }}; box-shadow:{{ t.navShadow }}; backdrop-filter:blur(18px) saturate(150%)` | geometry literal; `navR` -> `var(--r-panel)` (16px, identical); `glass` -> `var(--header-bg)`; `hair` -> `var(--line)`; `navShadow` -> `var(--shadow-chrome)` (byte-identical). Keep the `-webkit-backdrop-filter` twin |
| wordmark | `font-family:Fraunces,serif; font-weight:600; font-size:19px; letter-spacing:-.02em; font-variation-settings:'SOFT' 0,'WONK' 1` | `var(--font-display)`, `var(--fvs-display)`, rest literal, `color: var(--text)` |
| nav group | `display:flex; align-items:center; gap:28px; font-size:13.5px; font-weight:500; color:{{ t.mute }}` | `mute` -> `var(--muted)`, rest literal |
| CTA | `display:flex; align-items:center; gap:10px; padding:8px 8px 8px 20px; border-radius:{{ t.rBtn }}; background:{{ t.btnBg }}; color:{{ t.btnText }}; font-size:13.5px; font-weight:600; transition:transform .5s cubic-bezier(.34,1.56,.64,1)`, hover `transform:scale(1.04)` | `rBtn` -> `var(--r-btn)` (12px, identical); `btnBg` = the renderer's `ink` -> `var(--ink)`; `btnText` = the renderer's `canvas` -> `var(--bg)` |
| CTA arrow | `display:grid; place-items:center; width:26px; height:26px; border-radius:{{ t.rArrow }}; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.26); font-size:12px; line-height:1`, content `&#8594;` | `rArrow` -> literal `9px` (terracotta; no token exists and none is minted). The two whites are the renderer's *page colour at low alpha*, and the renderer flips them to `rgba(0,0,0,.14)` / `.22` in dark — so they ship as `color-mix(in srgb, var(--bg) 14%, transparent)` and `color-mix(in srgb, var(--bg) 26%, transparent)`, which reproduces the mode flip from one declaration. `color-mix` is already an established idiom here (5 uses in `globals.css`) |

**The design's bar holds four items; ours holds seven.** The nav pill in the
artboard is `[wordmark] [3 nav links] [1 CTA]`. The shipped chrome must also
carry `Log in`, `Sign up` (both ratified in AM9) and the `ModeToggle` (ADR-002).
**The composition rule, so this is not re-decided per worker:** the extra items
join the right-hand actions group as nav-weight items — same `13.5px / 500 /
var(--muted)` as the nav links, `gap:16px` — and the group ends with the **one**
`var(--ink)` CTA. There is exactly one filled button in the bar. The
`ModeToggle` keeps its existing `.modeToggle` class and its
`data-mode-toggle` attribute untouched; `pda-s03` reads that attribute.

**The `globals.css` write, enumerated.** Append-only, under the banner
`/* FID-1 LANDING CHROME */`, and these seven selectors and no others:

```
.landingChrome            .landingChromeBar      .landingWordmark
.landingNav               .landingChromeActions  .landingCta
.landingCtaArrow
```

Plus, inside the same block, `.landingNav a:hover, .landingChromeActions a:hover
{ opacity: .72; }` — the artboard's only hover rule for links, ported verbatim
from its `<style>` block. Nothing else. The PRESERVING-WRITE gate above is
FID-1's acceptance for this file, and the ADR-001 §(a) wave-0 oracle must still
print **`0`** afterwards (it prints `0` on `259de07d`; re-measured for this
amendment).

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **FID-1-1** | T9-S1 · fidelity | The chrome's class vocabulary exists and is bound | In `tests/render/t9-landing.test.tsx`, new describe `FID-1 chrome fidelity`: on the **real anonymous `/` render**, assert `[data-landing-section="chrome"]` carries class `landingChrome` and contains, in document order, `.landingChromeBar > .landingWordmark`, `.landingChromeBar > .landingNav`, `.landingChromeBar > .landingChromeActions`, and exactly **one** `.landingCta` containing one `.landingCtaArrow`. **And** assert against `apps/ui/app/globals.css` read as text that each of the seven selectors above appears at least once — jsdom cannot resolve the values, but it can prove the rules are not missing, which is the failure that actually happened. **RED-proof required:** delete any one of the seven rules and show this cell fails |
| **FID-1-2** (browser half) | T9-S1 · fidelity | The bar is **one horizontal row** with the ported skin, in **both** modes | **DOM-DUMP BROWSER KIT**, output quoted in the cluster report, for `terracotta` **and** `chamber`: (1) every direct child of `.landingChromeBar` has a vertical centre within **1.0px** of the bar's own vertical centre — measured **0.0px** on the ported fixture, so 1.0px is slack, not a target; (2) the bar's height is **≤ 72px** — measured **62px**; (3) `getComputedStyle(bar).backgroundColor` is **not** `rgba(0, 0, 0, 0)`; (4) `borderTopLeftRadius` is `16px`; (5) `boxShadow` is not `none`; (6) the CTA's `backgroundColor` **differs between the two modes** (measured `rgb(41,38,31)` -> `rgb(242,234,217)`), which is the one assertion that catches a bar styled for Terracotta only. The shipped RED baseline for all six is recorded above |
| **FID-1-3** (V-QA half) | T9-S1 · fidelity | V's judgement, named | Does the anonymous `/` open with a single floating bar — wordmark left, links beside it, one filled `Start a debate` at the right — that reads as designed in **both** modes? Answered by V on the running app, recorded on the ticket. Not a test |
| **FID-1-4** | T9-S1 · contract | The restyle removes nothing a pin can see | PRESERVING-WRITE, component form: assert the post-edit chrome still exposes `[data-landing-section="chrome"]`, `[data-mode-toggle]`, and the four hrefs `/`, `/login`, `/sign-up`, `/login?next=%2Fnew` — the ADR-004 auth-entry contract and `T9-C2-2` / `T9-C2-4` / `pda-s03` all read these. The three stylesheet-form gate lines are run and their `0 / 1 / 1` output pasted |

### FID-2 — the sample cards, full anatomy

**SPEC.** `T9-S3`. Same supersession note.

**The gap, stated once.** The shipped `LandingSample.tsx` renders **three**
cards, each carrying a role badge, a BASE and a FINAL badge, and two lines of
placeholder text (`Model 01 · PRO`, `REVIEW AGREED BY: Model 03`). The design
renders **four**, each carrying a glyphed stance chip, a gold BASE pill, a
stance-tinted FINAL pill, an author model pill, **the claim prose**, a rule, a
verdict-tinted review chip, a reviewer model pill, and a turn counter — as a
rotated, overlapping deck. The claim prose is the card's content and it is
entirely absent today.

**The four cards, verbatim from `design-artboard.html`'s `renderVals()`.** These
strings ship as written — see DECISIONS row (a). None of the four contains
`round` or `joint`, so the mission's ratified `round`->`debate` /
`joint`->`claim` substitutions do not apply to any of them; checked, not
assumed.

| # | stance | glyph | BASE | FINAL | turn | author | reviewer | review | claim (verbatim) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | REASONING | `◆` | 94 | 94 | `01` | `OpenAI · GPT · gpt-5.6-sol` | `Anthropic · Claude · claude-opus-5` | AGREED | Remote-first companies should generally use location-independent salary bands for engineers performing equivalent work, while allowing transparent adjustments for legally required costs, scarce skills, and role scope. |
| 2 | PRO | `↑` | 95 | 95 | `02` | `Anthropic · Claude · claude-opus-5` | `OpenAI · GPT · gpt-5.6-sol` | DISPUTED | Remote-first companies should pay a single global rate for a given role and level, because compensation is owed for the work delivered rather than for the worker's postal code: two engineers at the same level producing comparable value contribute equally to the firm's output. |
| 3 | CON | `↓` | 85 | 85 | `03` | `Anthropic · Claude · claude-opus-5` | `OpenAI · GPT · gpt-5.6-sol` | AGREED | Remote-first companies should generally set engineering pay against the local labor market an employee can actually access — geo-tiered bands with transparent, published multipliers — because wages are priced against a worker's realistic alternatives, not against a global abstraction. |
| 4 | CON | `↓` | 72 | 68 | `04` | `Google · Gemini · gemini-3-ultra` | `OpenAI · GPT · gpt-5.6-sol` | AGREED | A single global rate anchors to the lowest defensible number: when payroll cannot flex by market, firms quietly lower the level everywhere or slow hiring in expensive markets. |

The apostrophes in cards 2 and 3 are U+2019, as in the source. Card 4 is the
only one whose FINAL differs from its BASE (`72 -> 68`); that asymmetry is the
point of showing four cards and must survive.

**The resolution above the deck**, also verbatim: `Should remote-first companies
pay engineers the same salary regardless of where they live?` The shipped code
repeats the section headline there instead, which is why the sample reads as a
placeholder. The design's legend row beneath it — three `9px` swatches at
`border-radius:2px` in `--pro` / `--con` / `--reasoning`, labelled `Pro`, `Con`,
`Reasoning` — ports with it.

**Ported values.** Same authority: the resolved landing, with the template
form quoted where it names the variable. Every row below was checked against
`design-document-rendered.html`:

| element | design (verbatim) | ships as |
|---|---|---|
| deck | `max-width:880px; margin:0 auto; padding:40px 0` | literal |
| card i | `z-index:{1,2,3,4}; margin-top:{0,-54,-48,-50}px; transform:rotate({-1.7,1.3,-1.1,1.6}deg) translateX({-26,20,-14,24}px); transform-origin:{left,right,left,right} center; transition:transform .72s cubic-bezier(.34,1.56,.64,1), box-shadow .72s cubic-bezier(.34,1.56,.64,1); will-change:transform`, hover `rotate(0deg) translateX(0px) translateY(-14px) scale(1.022)` | literal, per card, in that order |
| shell | `background:{{ t.raised }}; border:1px solid {{ c.shell }}; border-radius:{{ t.rShell }}(=20px); padding:11px; box-shadow:{{ t.cardShadow }}(=`0 30px 62px -30px rgba(41,38,31,.24), 0 8px 20px -12px rgba(41,38,31,.12)`)` | `raised` -> `var(--shell)`; `c.shell` = `tint(accent,.30)` -> `var(--{stance}-border)`; radius literal `20px`; **shadow -> `var(--shadow-pop)`** (`0 30px 60px -26px rgba(41,38,31,.32)`) — see the note below |
| core | resolved: `background: rgb(249,246,241); border: 1px solid rgba(26,22,19,0.09); border-radius: 13px; padding: 34px 38px 30px; position:relative; overflow:hidden; box-shadow: rgba(255,255,255,0.85) 0 1px 0 inset, rgba(255,255,255,0.4) 0 0 0 1px inset` | **`var(--bg)`, not `var(--core)`** — the landing card's core is the page colour and the shell is the raised bezel (`rgb(239,233,224)` = `--shell`); `hair` -> `var(--line)`; **radius -> `var(--r-card)` (14px; 1px from the design's 13px)**; inset -> `inset 0 1px 0 color-mix(in srgb, var(--core) 85%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--core) 40%, transparent)`, which reproduces the renderer's light `.85`/`.4` and its dark counterpart from one declaration |
| stance tab | **see `FID-2-2`** — the artboard and the app screens disagree, and the app screens win | |
| stance chip | `padding:5px 12px; border-radius:{{ t.rChip }}(=999px); background:tint(accent,.09); border:1.5px solid tint(accent,.26); color:accent; font-family:'Plus Jakarta Sans'; font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase`, content `{{ c.arrow }} {{ c.role }}` | `var(--r-pill)`, `var(--{stance}-bg)`, `var(--{stance}-border)`, `var(--{stance}-text)`, `var(--font-sans)`; content `↑ PRO` / `↓ CON` / `◆ REASONING` |
| BASE pill | `padding:4px 11px; border-radius:999px; border:1px solid tint(gold,.45); background:tint(gold,.1); color:gold; font-size:10.5px; font-weight:700`, content `BASE {n}%` | `var(--gold-border)`, `var(--gold-bg)`, `var(--gold-text)`. Gold is in reservation here: BASE is a score band, and `--gold-*` is already the score-uncertainty family |
| FINAL pill | same box, `border:1px solid {{ c.chipBorder }}; background:{{ c.chipBg }}; color:{{ c.chipText }}`, content `FINAL {n}%` | the **stance** triple, not gold — this is why BASE and FINAL are visually distinct and the shipped pair is not |
| author pill | `display:inline-flex; align-items:center; gap:7px; padding:4px 12px 4px 9px; border-radius:999px; background:tint(aDot,.12); border:1px solid tint(aDot,.42); font-size:12px; font-weight:700; color:{{ t.ink }}` + dot `width:8px; height:8px; border-radius:50%; background:{{ c.aDot }}` | `<ModelPill size="md" tone="maker">` — `var(--m-{key}-bg)`, `var(--m-{key}-border)`, `var(--m-{key})`, `var(--r-dot)`, `var(--text)` |
| claim | `margin:0; font-family:Fraunces,serif; font-weight:400; font-size:19px; line-height:1.5; letter-spacing:-.012em; text-wrap:pretty; color:{{ t.ink }}` | `var(--font-display)`, `var(--text)`, rest literal |
| rule row | `display:flex; align-items:center; gap:9px; flex-wrap:wrap; margin-top:24px; padding-top:18px; border-top:1px solid {{ t.hair }}` | `var(--line)`, rest literal |
| review chip | `padding:5px 11px; border-radius:999px; border:1px solid tint(rc,.4); background:tint(rc,.08); color:rc; font-size:10px; font-weight:700; letter-spacing:.06em`, content `REVIEW {{ AGREED\|DISPUTED }} BY:` | `rc` = the renderer's `agreeC`/`disputeC` -> `var(--agree-*)` / `var(--dispute-*)`, whose shipped values are `#3E7A4E` / `#B0432F` — the renderer's exact light pair |
| reviewer pill | same box as the author pill but `background:{{ t.raised }}; border:1px solid {{ t.hairStrong }}; font-size:11.5px`, dot adds `box-shadow:0 0 0 2.5px tint(rDot,.22)` | `<ModelPill size="sm" tone="neutral" halo>` — `var(--shell)`, `var(--line-strong)`, halo `0 0 0 2.5px var(--m-{key}-border)` (the shipped border token is the `.42` tint against the design's `.22`; the delta is declared, and no token is minted for it) |
| turn | `font-family:Fraunces,serif; font-size:13px; color:{{ t.mute }}; letter-spacing:.04em`, content `Turn {{ c.turn }}` | `var(--font-display)`, `var(--muted)`; content `Turn 01` .. `Turn 04` |

**Two declared deltas, so neither looks like an oversight.** (1) The deck shadow
ships as `var(--shadow-pop)` rather than the artboard's literal, because the
literal would be a *second* card-elevation value with no token and no Chamber
counterpart; `--shadow-pop` is the ported deep-elevation role and is already
mode-aware. Numerically `0 30px 60px -26px .32` against `0 30px 62px -30px .24`
— 2px of blur, 4px of spread, and .08 of alpha. (2) The core radius ships as
`var(--r-card)` (14px) against the design's 13px, for the same reason: one
card-radius token, not two. Neither delta is visible at a glance; both are
recorded so V can overrule either in one line.

**Everything `T9-C4` already pins stays.** The section's eyebrow
(`ONE DEBATE, FOUR TURNS`), its `h2`, and the after-deck close line (`The debate
ends here. Nothing is declared won. You get the transcript, the two marks per
turn, and the claim you conceded.`) are SPEC-fixed copy carrying the ratified
`round`->`debate` and `joint`->`claim` substitutions, and `T9-C4-4` pins them.
FID-2 does not touch them. **The port is anatomy, not copy** — except the card
claims and the resolution, which have no SPEC copy because they were never
carried across at all.

| Row | SPEC | WHAT | Acceptance |
|---|---|---|---|
| **FID-2-1** | T9-S3 · fidelity | All four cards ship, with every anatomical part, paired to the right card | In `tests/render/t9-landing.test.tsx`, new describe `FID-2 sample fidelity`: on the **real anonymous `/` render**, select the sample subtree per the AM6 convention, take its cards **positionally** (`cards[i]`, the `T9-C4-4` lesson — never subtree containment), assert `cards.length === 4`, and for each `i` assert **all nine** of that row's values from the table above appear **within `cards[i]`**: stance chip text `↑ PRO`\|`↓ CON`\|`◆ REASONING`, `BASE {n}%`, `FINAL {n}%`, the author label, the review chip text, the reviewer label, `Turn {nn}`, and the **claim string in full**. **RED-proof required:** swap the claims of cards 2 and 3, leaving both inside the sample subtree, and show the cell fails |
| **FID-2-2** | T9-S3 · fidelity | The stance tab is the **app** tab, positioned, not the landing's flush rule — a DECLARED DEPARTURE from the landing authority | The two authorities disagree, and this is the amendment's only place where the landing document is knowingly not followed. Resolved landing (`design-document-rendered.html`): `position: absolute; top: 0px; left: 0px; width: 64px; height: 3px; background: rgb(61,90,128)` — **no radius**. Binding original (app screens): `top:0; left:20px; width:52px; height:4px; border-radius:0 0 5px 5px` (root card) and `left:15px; width:44px; height:4px` (argument card). **The app form wins** — the design document's own closing note ratifies *"the Field Notes stance tab (the small colored line at the top of each card)"* as the approved direction, wave 0 minted `--r-tab: 0 0 5px 5px` for exactly it, and the landing sample is a preview of the canvas card, so a landing-only tab shape would be a third vocabulary. **V can overrule this in one line** — it is the one place the landing document is not followed, and it is flagged rather than absorbed. Ships as `position:absolute; top:0; left:20px; width:52px; height:4px; border-radius: var(--r-tab); background: var(--{stance}-line)`, replacing the shipped `margin:-14px 0 14px` block form. Assert in jsdom that each card's tab carries `data-stance` matching its card and is a descendant of the card's core |
| **FID-2-3** (browser half) | T9-S3 · fidelity | The deck is a deck, the chips are tinted, and both hold in **both** modes | **DOM-DUMP BROWSER KIT**, both modes, output quoted: (1) the four card `transform` matrices are pairwise distinct and **none** is `none` — the rotation/offset deck is real; (2) consecutive cards **overlap vertically**: `cards[i+1].top < cards[i].bottom` for `i = 0,1,2`; (3) each stance chip's `backgroundColor` is **not** `rgba(0, 0, 0, 0)` and its `color` differs from the card core's `backgroundColor` — the tint shipped; (4) the BASE pill's `backgroundColor` **differs from** the FINAL pill's on the same card, all four cards; (5) the three distinct maker dots resolve to three **different** colours; (6) every one of (1)-(5) holds after flipping `data-mode` to `chamber` |
| **FID-2-4** (V-QA half) | T9-S3 · fidelity | V's judgement, named | Does the sample section read as four overlapping cards of a real debate — glyphed stance, two scores, who argued it, the argument itself, who reviewed it and how, and which turn — rather than a grid of empty chips? Answered by V on the running app, recorded on the ticket |
| **FID-2-5** | T9-S3 · contract | The rewrite removes nothing a pin can see | PRESERVING-WRITE, component form: `[data-landing-section="sample"]`, `id="transcripts"`, the section's `aria-labelledby` target, the eyebrow, the `h2` and the after-deck close line survive byte-identical — `T9-C4-4` and `T9-C1`'s section pins read them. Publish the pre/post attribute-and-text superset check |

### The generic `ModelPill` (V's ruling 1)

**One component, one model-identity vocabulary, both surfaces.** The design
already proves the generalization rather than merely suggesting it: the landing
author pill and the canvas author pill are the **same box** in both files —
`inline-flex`, an `8px` `50%` dot, `999px` radius, `tint(dot,.12)` fill,
`tint(dot,.42)` border, `font-weight:700` — differing in exactly three numbers
(`gap` 7 vs 6, `padding` `4px 12px 4px 9px` vs `3px 10px 3px 7px`, `font-size`
12 vs 10). That is a `size` prop, not two components.

**The label seam already ships and already produces V's exact strings.** Run,
not asserted — a throwaway probe against `apps/ui/lib/makerIdentity.ts`:

```
makerIdentityLabel({maker:"OpenAI",    modelId:"gpt-5.6-sol"})    -> {"text":"OpenAI · GPT · gpt-5.6-sol","absence":false}
makerIdentityLabel({maker:"Anthropic", modelId:"claude-opus-5"})  -> {"text":"Anthropic · Claude · claude-opus-5","absence":false}
makerIdentityLabel({maker:"Google",    modelId:"gemini-3-ultra"}) -> {"text":"Google · Gemini · gemini-3-ultra","absence":false}
```

Byte-identical to the three labels V named. So `ModelPill` **must not** build
its own label: it calls `makerIdentityLabel` for the text and `modelKey` for the
`--m-*` family, and inherits `ModelBadge`'s absence contract unchanged
(`House unavailable`, no dot, the same `title` and `aria-label`). That is what
"no third vocabulary" means concretely.

```
ModelPill(props: {
  modelId: string | null;
  maker?: string | null;
  size?: "sm" | "md";      // md = landing author (12px), sm = reviewer (11.5px)
  tone?: "maker" | "neutral";  // maker = --m-{key}-bg/-border; neutral = --shell/--line-strong
  halo?: boolean;          // dot box-shadow 0 0 0 2.5px var(--m-{key}-border)
  className?: string;
})
```

**It lives in a NEW file, `apps/ui/components/ModelPill.tsx`, and the canvas
adoption is deferred — declared, not forgotten.** `ModelPresentation.tsx` is in
row 8's write surface and row 8 is **live** (`CODE-T1C2-ADD2`). Editing it now
would drop a product change into a running rework, the exact hazard AM12b's hard
constraint exists to prevent. `ModelPill.tsx` *imports* `modelColor` from
`ModelPresentation.tsx` — a read, which costs the live lane nothing.

> **ROUTED ROW R-6 (new, AM14): re-express `ModelBadge` and `ModelMetaLine` over
> `ModelPill`.** Owner: row 8 (`T1-C2`), as a post-close addendum, after
> `CODE-T1C2-ADD2` lands. Acceptance: `ui02d-model-identity.test.tsx` stays
> green with **zero** edits — it is the standing pin on exactly this contract,
> and a drop-in replacement is defined by it not moving. Until R-6 lands, the
> single component exists and the canvas has not yet been switched to it; that
> is the honest state and it is written here so nobody reports V's ruling as
> fully delivered.

### FID-3 — the fidelity sweep (row 35, review-class)

**Purpose: V never finds gap #3.** FID-1 and FID-2 close the two V found. The
sweep is what finds the rest before V does.

**What it reads.** Every shipped surface, paired to its design source:

| shipped surface | authority | screen |
|---|---|---|
| `/` anonymous (chrome, hero, sample, method, pricing) | `docs/missions/ui-overhaul/design/design-document-rendered.html` | the whole landing, resolved |
| `/debate/[id]` canvas | `ui_designs/DebateAI Design Document.html` (binding) | `1a Debate canvas — Atelier` |
| `/` signed-in library, `/public/debate/[id]` | binding original | `3a Library`, `3b Public debate view` |
| `/new` | binding original | `4a New debate` |
| node detail drawer | binding original | `5a Node detail drawer` |
| `/settings` | binding original | `6a Settings` |
| `/login`, `/verify-email`, fleet | binding original | `7a`, `7b`, `7c` |
| `/sign-up`, `/enroll-mfa`, recovery code | binding original | `8a`, `8b`, `8c` |

**How it renders.** The DOM-DUMP BROWSER KIT, once per surface, **both modes**.
The design side needs no renderer: the authority files are read as text and
their inline styles are the specification — the sweep compares the shipped computed
style against the quoted inline value, element for element.

**The output form — a per-element gap table, one row per divergence:**

| surface | mode | element | design value (file + verbatim inline style) | shipped computed value | class |
|---|---|---|---|---|---|

`class` is one of **ABSENT** (the design element does not exist in the shipped
tree at all — the class that produced both of V's findings), **UNBOUND** (it
exists but nothing styles it: transparent background, `0px` radius, `none`
shadow, default `display`), **DRIFTED** (styled, but the value differs),
**DECLARED** (differs, and a dispatch cell already says why — the two FID-2
deltas above are the first two entries).

**Every ABSENT and every UNBOUND row is a finding.** DRIFTED rows are findings
unless a cell declares them. A sweep that reports zero rows without listing the
surfaces it rendered is not a sweep; the report must name all twelve.

**It runs after rows 33 and 34 land**, and its findings route as new FID rows,
not as edits by the sweeping seat. FID-3 writes no product file and no test —
its write surface is its report.

### FID-4 — one line in the FID worker's contract

Every FID-row packet carries this line: **turn Next's dev indicators off** —
`devIndicators: false` in `next.config.*` — before any browser measurement or V
review. The dev badge overlays the bottom-left corner of every screenshot and
sits in the way of exactly the chrome and card geometry these rows measure. It
is a **worker** edit inside its own packet's declared config write, not an ARCH
write, and not part of any acceptance.

### AM5 invariant, re-run for rows 33-35

Three write surfaces moved, so the survivability law is re-checked rather than
declared intact.

| row | file written | shape | last prior writer | pins that read it | resolution |
|---|---|---|---|---|---|
| 33 | `apps/ui/app/globals.css` | PRESERVING (stylesheet) | #1 `T9-C3` | `t9-mode-tokens` (4), `v2ui-pages` (2), `pda-s03` (1) | KEEP-class guards in row 33's verify; ownership stays with #1 |
| 33 | `LandingChrome.tsx` | PRESERVING (component) | #4 `T9-C2` | `t9-landing` (via page render), `pda-s03` (chrome attributes) | `t9-landing` in row 33's write surface, new describe; `pda-s03` a KEEP guard, protected by `FID-1-4` |
| 33 | `tests/render/t9-landing.test.tsx` | new describe only | #5 `T9-C4` | itself | the T9-C1/C2/C4 disjoint-describe pattern, extended |
| 34 | `LandingSample.tsx` | PRESERVING (component) | #5 `T9-C4` | `t9-landing` (via page render) | in row 34's write surface, new describe; `T9-C4-4`'s copy pins protected by `FID-2-5` |
| 34 | `ModelPill.tsx` | **new file** | none | none | nothing to survive |
| 34 | `tests/render/t9-landing.test.tsx` | new describe only | row 33 | itself | serialised after row 33, disjoint describe |
| 35 | report only | n/a | n/a | n/a | review-class; no product write |

**Both verify commands were run on the tree at `259de07d`, before any FID work
exists**, which is the preflight the AM5 law was written to force:

```
row 33  6 files   78 passed                 exit 0
row 34  6 files   77 passed                 exit 0
```

They are green today, so neither row is dispatched into a command it cannot make
green. (Run with `CODE-T1C2-ADD2`'s uncommitted edits present on
`scrutiny.ts` / `DebateMap.tsx` / `t1-canvas.test.tsx` — none of those files is
in either command after the correction above.)

**Guard rail 3 holds**: both rows write `t9-landing.test.tsx` and both run it.
**Guard rail 2 holds**: neither row deletes a case; both add a describe, and the
`vitest list | wc -l` before/after evidence is required in the cluster reports.
**Guard rail 1 is superseded for these rows by the PRESERVING-WRITE clause**,
which is narrower than the ownership transfer it replaces: FID-1 and FID-2 get
*no* edit rights over any pin they do not already own.

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

### 2026-09-01 — AM11: two complements, one departure, and a retitle that is not mine (trigger: CODE-T9C2-REV2 re-verify, `t_1784225a`, ADDENDA SOUND)

The re-verify confirmed AM9's narrowing by measurement — 17,553-input
side-by-side fuzz, 0 new accepts; 2,266 contract-valid refs, 0 rejected. Four
N-findings, all fail-closed or cosmetic.

| Charge | Outcome |
|---|---|
| **N8** absent-`next` complement | **ADOPTED** into `T9-C2-6` |
| **N9** schema-agreement alarm | **INTENT ADOPTED, FORM DEPARTED** — the proposed assertion is constant under the drift it targets |
| **N10** superset paragraph | **ADOPTED** into `ADR-004`, with the tightening question answered rather than left open |
| **N11** stale row name | **RECORDED, not retitled** — no ARCH text names the row; the rename is the worker's |

**N8 — I departed from the reproduction method, and the substitute is stronger.**
The charge said to reproduce M17 by mutating `LoginFlow.tsx`. I did not mutate
it: two parallel lanes were live in this tree
(`CODE-T9C4-N1` on `t9-landing.test.tsx`, `CODE-T9C5` on `pda-s03`), and putting
a deliberate defect into a shared product file while other seats run their gates
against it risks failing their rounds with my mutant. Instead I **enumerated the
whole test corpus** for pins on the `Create one` href and modelled M17's logic
against them. That is not a weaker substitute: enumeration proved a fact the
mutant cannot — `SignUpFlow`'s absent case **is** pinned
(`auth-flow-integration.test.tsx:306`), so the two legs of one round trip have
different coverage and **the uncovered leg is the one AM9 added**. A correct
model of the pin existed one file away when I wrote the cell.

**N9 — the departure, on a measurement.** `z.uuid().safeParse(fixture)` exercises
`zod`, not the contract; simulated against a drift of `public_ref` to a slug
schema it stays `true` while a contract-bound assertion goes `false`. The alarm
now binds to `PublicDebateSummarySchema.shape.public_ref`. Intent adopted whole,
target corrected.

**N11 — the boundary matters more than the rename.** Nothing in `dispatch-order`
or any ADR names the *"overlong public debate ref"* row, so there was no ARCH
text to change. Saying so is the point: a later reader must not assume ARCH
prose was updated, and the addendum seat must not assume ARCH already handled
the in-file rename.

**The pattern in AM9→AM11, which is worth naming once.** AM9 wrote both these
cells and both were half-pins: `T9-C2-6` pinned the present case and not its
complement; `T9-C2-7` pinned the regex and not the schema it stands for. Neither
is the AM10 permutation class and neither is the AM7 synthetic class — this one
is **pinning the branch you were thinking about and not the branch beside it**.
The check that would have caught both is the same: *for every conditional the
cell describes, is there a row for the other side?*

**Verification re-run on the published markdown:** AM5 verify-survivability
invariant holds at **32 rows, 5 exemptions, 0 violations**. AM11 changed no
Writes and no Verify column — both amended cells live inside row 4's existing
write surface — and the check was re-run rather than assumed.

### 2026-09-01 — AM12a: an enumeration that was not a partition, and a ternary with a catch-all (trigger: T1-C2 RW1 review, ticket `t_33f1eb6a` — B2 and N4)

Both blockers are **cell defects**. The worker implemented row 8 and PLAN HOW as
written; the enumerations were wrong.

**B2.** `agreed | disputed | absent` is not a partition of
`agree | dispute | cannot-assess`. Probed over the full union rather than over
the fixtures: a **completed** `cannot-assess` review and **no review at all**
both render `data-review="absent"`. Those are different facts — `cannot-assess`
carries required `reasons`, `provenance_ref` and `reviewer_lineage` — and folding
a recorded honest "could not assess" into "nothing here" is the failure this
repo pins against elsewhere (`Not exposed by scoring API`, `no worker state is
fabricated`). Mapping made total; the fold refused.

The fixture gap is the interesting half: the helper was typed
`"agree" | "dispute"` by hand, so the third member was **unconstructible** and no
RED could exist. Ruled — widen, but bind to the contract
(`NodeReview["outcome"]`), not by hand-copying the third member.
**AM11/N9's rule one layer down: a copy of the contract cannot detect the
contract moving.**

**N4.** `Role` has four members and `stanceLine` has three arms plus a catch-all,
so the root card paints `--reasoning-line` on a tab every card renders. Ratifying
`root = reasoning` was refused on SPEC evidence — `T1-S3` gives the root card no
stance, no type chip and no model line, while `T1-S4` scopes stance-tab colour to
argument cards typed `REASONING / PRO / CON`. Root binds to `--line-strong`, an
existing wave-0 token in both blocks, so the **ADR-001 cost is zero** and no new
colour literal enters any file. Deliberately **not** added to `ADR-005`'s 3:1
non-text list, with the reason stated in the cell so nobody "fixes" it later.

**What this amendment got wrong before publishing, and caught.** The section
first claimed *"no write-surface change"* for both cells. `grep` says
`tests/support/v2uiFixtures.ts` is owned by **no row in 32** and read by **eight
tests**. Publishing that claim would have handed T1-C2 an acceptance requiring a
write outside its contract — AF-1, authored by me, inside the amendment fixing
two other cell defects. Row 8 now carries the file scoped to the review-helper
type, and its verify gains the four importers it did not already run. **The
check that caught it is the one AM11 named:** the cell describes a file, so ask
who owns the file — not whether it feels like part of the cluster.

**Verification, re-run on the published markdown:** AM5 ownership invariant
**32 rows, 5 exemptions, 0 violations** — re-run after the row-8 surface change,
not assumed, because this amendment is the first in a while that actually moved
a Writes column.

### 2026-09-01 — AM12b: the accumulated ruling batch, 10 items (anchor `t_4e80c7bf`)

**Hard constraint honoured:** `CODE-T1C2-RW1` was live implementing `T1-C2-5/6`.
**Row 8 and every T1-C2 cell are untouched by this amendment** — verified by
diff intent, and every remedy that would have needed them is a routed row below
instead.

| # | Item | Ruling | Measurement |
|---|---|---|---|
| 1 | ADR-001 oracles are anti-gates | **ADOPTED** — both ADR-006 guards added to all three oracles | reproduced here: PATH-stripped `rg` → `0`; over-escaped pattern → `0` on a file that truly carries `1` |
| 2 | ADR-006 baseline re-anchor | **ADOPTED + line-agnostic-with-count=1** | the published gate returned **`1`** at the start of this session — RED on a pre-existing error; count pin proven to catch a second TS2322 (`count = 2 → GATE FAIL`) |
| 3 | Chamber `working ≡ contested`, gold out of reservation | **RETOKEN RULED → routed row R-1** | Chamber `working` and `contested` resolve byte-identical on all three properties; `--dispute-*` differs from `working` in **both** modes |
| 4 | Token-role oracle | **SHIP IT → routed row R-2** (owner T1-C4, row 10) | three review rounds, four green mutants (T1-C1 M10; T1-C2 ME/MF/MH); reviewer-sized ~40 lines |
| 4b | T1-C1 gold coupling | **RETOKEN RULED → routed row R-3** | `--gen-*`/`--score-uncertainty-*` byte-identical to `--gold*` in both modes → zero pixel change |
| 5 | DebateMap depth ramp | **RETIRE the ramp, RECORDED; arc distinction folds into R-2** | `fillFor(node)` — the `depth` parameter is gone; depth survives geometrically in ring radius |
| 6 | Widening-drift residual | **COVERED-BY-REVIEW, trigger named** | the missed class yields UUID subsets, all accepted by `safeReturnPath` — it provably cannot refuse a real ref |
| 7 | N4 per-`li` exclusivity | **RATIFIED as no-change-needed** | reviewer's own counter-argument accepted: severity tracks reachability |
| 8 | N12 wording | **ADOPTED** — ADR-004 now states the true rule | RED iff the drifted schema **rejects the fixture**; verified across 7 drifts |
| 9 | T9 slice-close bind scope | **EXCLUSION IS BY DESIGN — now SAID in row 6** | later slice regression sets already run the t9 files under the AM5 law, so the new pins are not orphaned |
| 10 | Mount rationale + source-tag sweep | **ADOPTED** (ADR-002 rewritten) + **SWEEP DESIGNED, not run** | only `tree: null` site is `PublicDebatePageClient.tsx:46` |

#### Item 3 — routed row R-1: retoken `contested` off gold

`lib/scrutiny.ts` binds `--gold-line/-bg/-text` exactly once, to the
`contested` tier — which is neither reasoning nor verdict, so it is gold's one
out-of-reservation binding. Measured on the shipped stylesheet:

```
family                        Terracotta                         Chamber
working (reasoning)           ['#3D5A80','#E6E8E8','#3D5A80']    ['#C8A055','#342A1B','#C8A055']
contested TODAY (gold)        ['#A5803D','#F3ECE0','#826530']    ['#C8A055','#342A1B','#C8A055']   <- identical
candidate: dispute            ['#B0432F','#F4E5DE','#B0432F']    ['#D67F65','#36251E','#D67F65']   <- distinct in BOTH
```

**The reservation violation and the collision are the same fact**: in Chamber
`--reasoning-*` *is* the gold family, exactly as *"gold reserved for reasoning &
verdict"* intends — so anything else bound to gold necessarily collides with
reasoning there. Two tiers that must be told apart render byte-identical.

**Ruled: `contested → --dispute-*`.** Not an arbitrary pick — the tier map
**already** binds `strengthened → --agree-*`, so `contested → --dispute-*`
restores the agree/dispute symmetry that gold broke, keeps the vocabulary
honest (a contested claim is one under dispute), and returns gold to its
reservation. `--score-uncertainty-*` was measured and **rejected**: its Chamber
`bg` and `text` still equal `working`'s, so it fixes the coupling without fixing
the distinctness.

**Owner: a post-RW1 T1-C2 addendum** — `scrutiny.ts` is row 8's and row 8 is
frozen this session. It is a product change and must not enter RW1 mid-flight.
**V-visible**, so it also carries a T1 DECISIONS row.

#### Item 4 — routed row R-2: the token-role oracle, owner T1-C4 (row 10)

Three rounds have now proven the same hole: **nothing mechanical guards which
token a surface binds to.** T1-C1's M10 and T1-C2's ME/MF/MH all repainted roles
— con arcs in `--pro-line`, the legend's Supports/Opposes collapsed to one
colour — and all shipped green. Reviewer eyes are the only gate, and this
mission has three reviewers' worth of evidence that they catch it *after* merge.

**Ruled: ship it, at T1-C4 (row 10) — a migration cluster that already owns T1's
pin surface and is NOT row 8**, so it is dispatchable without touching RW1. Sized
by the T1-C2 reviewer at ~40 lines: a `role → token-family` map asserted against
the rendered surface, so that repainting a role is RED regardless of which file
did it. The DebateMap arc distinction (item 5's second half) folds in here rather
than becoming its own pin — it is one row of the same map.

**Why it is worth the weight, since "record why not" was the alternative:** every
other oracle in this mission guards *whether* a literal exists (ADR-001) or
*whether* a value is legible (ADR-005). Neither can see a correctly-tokenised,
perfectly-contrasted surface wearing the **wrong role's** colour, and that is the
one defect class this mission has produced repeatedly and caught only by eye.

#### Item 4b — routed row R-3: T1-C1's gold coupling

The AF-1 re-skin bound `--gold` to four surfaces that are neither reasoning nor
verdict. **Harm today is zero and measured** — all four were amber literals
before the re-skin, and `--gen-*`/`--score-uncertainty-*` are byte-identical to
`--gold*` in both modes — so the defect is **coupling**, not appearance: a future
gold retune drags four unrelated surfaces with it. **Ruled: retoken to
`--gen-*`/`--score-uncertainty-*`, zero pixel change.** Owner: a T1-C1 addendum
(row 7, already merged; not row 8). Not ratified as-is, because ratifying
coupling means the next gold change is a silent four-surface regression.

#### Item 5 — the DebateMap depth ramp is RETIRED, and that is recorded

`fillFor(node, depth) → fillFor(node)` dropped the per-ring lightness ramp
together with the `oklch(${…})` literals it interpolated — the exact class
`ADR-001` names at `DebateMap.tsx:58-60`. **Ruled: retired, not restored.** Depth
is still legible geometrically (ring radius), no SPEC requirement names a
lightness ramp, and restoring it token-derived would re-introduce computed colour
in the one file that taught this mission why computed colour is expensive to
audit. Recorded here so the loss is a decision rather than an artefact of a
refactor. The unpinned con-arc distinction is **not** dropped — it becomes a row
of R-2's role map.

#### Item 7 — per-`li` exclusivity: RATIFIED as no-change-needed

Rendering all four method bodies into every `<li>` ships 16/16 green, so the
positional pin proves each body sits in its own `<li>`, not that it is the only
one there. **The reviewer argued against its own reflex and recommended closing
it; I agree, and the reason is worth keeping as a rule:**

> **Severity tracks reachability.** AM10's defect was reachable by a plausible
> edit — a reordering — and the ledger still looked normal. This one requires a
> deliberate render rewrite that visibly breaks the page first. If every
> `toContain` that admits a pathological superset became a finding, every
> containment assertion in the repo is a finding, and the class stops
> discriminating.

#### Item 9 — row 6's bind scope: the exclusion IS the design, now stated

`T9-C5`'s four-file bind covers the **old standing pins** named by R9's sentence
and excludes all ten mission-authored T9 pins. **Ruled: by design, and now said
in the row rather than inferred.** Row 6 is the **R9 migration bind** — it
certifies that the pins the mission *inherited* still hold after T9 rewrote their
subject. It is not a slice-completeness gate, and widening it into one would
duplicate coverage the AM5 ownership law already provides: later slice regression
sets run the `t9-*` files, so the new pins are not orphaned. **What row 6 does
NOT certify is now explicit**, so no seat reads a green row 6 as "T9 is complete".

#### Item 10b — the source-tag counting sweep: DESIGNED, not run

`pda-s02-affordance-drift.test.ts:65` counts `<(?:button|a|Link|summary)` in
**source text** and asserts `20`. `<ModeToggle />` is a component tag, so it
matches nothing: the count stayed 20 while the rendered top bar went to 21. The
pin is **literally true of the source and silently stale about the surface** —
and bumping it to 21 would fix the instance and keep the class.

**The sweep, ready to dispatch:**

| | |
|---|---|
| **Question** | which pins count or enumerate **source text** in order to describe a **rendered** surface? |
| **Method** | over `tests/**`, find assertions whose subject is a source string (`readFile`/`source()`/`between()`/`occurrences()`) **and** whose predicate is a count or a closed enumeration — `.toBe(<n>)`, `.toHaveLength(<n>)`, `match(…).length`. Regex-shaped surfaces that count JSX tags (`/<(?:button\|a\|Link\|summary)\b/`) are the high-signal subset: any component tag is invisible to them |
| **Per pin, decide one of three** | **(a) migrate to a render count** — assert against the rendered DOM, which is what the property is about; **(b) label it source-only** — rename so it claims what it tests (`sourceTagCount`, not `interactiveElementCount`); **(c) retire** if the rendered property is already pinned elsewhere |
| **Owner** | a dedicated audit seat. **Not** a slice cluster: the pins span T1/T3/T5 surfaces and no single row owns them |
| **When** | after the serial T1 wave (rows 7–13) closes. Running it during T1 would collide with three clusters editing the very files the sweep reads |
| **Not this** | do **not** bump `20 → 21`. That is the instance; the class is the sweep |

**Verification for this amendment:** AM5 ownership invariant re-run on the
published markdown — **32 rows, 5 exemptions, 0 violations**. No Writes or Verify
column moved; the two gate blocks changed only inside the acceptance-defaults
text, and row 8 was not touched.

### 2026-09-01 — AM13: two rulings, two routed rows (anchors `t_bef5e6da`, `t_109c2c42`)

| # | Item | Ruling | Measurement |
|---|---|---|---|
| N10 | nothing type-checks `tests/**/*.tsx` | **WIRE IT → routed row R-4**, into the **`apps/ui`** project, **not** the root include | 23 `.tsx` test files compiled by no project. Root context: **325** diagnostics, 172 of them module-resolution noise. `apps/ui` context: **12**, real |
| N11 | `--surface-sunken` ≡ `--shell` in both modes | **MINT a state-surface token → routed row R-5.** Re-value REFUSED; ratify-flat REFUSED | identical bytes both modes (`#EFE9E0` / `#221D17`); `--surface-sunken` is the worst-case surface in **all 34** published contrast rows |

#### R-4 — wire `tests/**/*.tsx` into the 0-new gate (owner: a worker; systemic, not T1-C2's)

Full ruling, baseline table and gate wiring: `ADR-006` §AM13/N10. The short form:

- The obvious fix — adding `tests/**/*.tsx` to the **root** `include` — is
  **refused on measurement**: the root project excludes `apps/ui`, so the render
  tests' own imports produce 172 `TS2307`s. A seat baselining that would baseline
  noise, re-creating AM3/N9's dual-compiler defect from the other end.
- New `tsconfig.tests.json` extends `apps/ui/tsconfig.json`, mirrors
  `vitest.config.ts`'s aliases in `paths` (three of the twelve diagnostics are
  `setPathname` false-reds that the alias cures), and joins the **existing**
  0-new gate as a second `-p` — one gate, two projects, same fail-loud guards and
  the same line-agnostic count-pinned baseline discipline.
- Baseline to carry: **1** known product error, **3** alias false-reds to cure by
  config, **1** missing `@types/jsdom`, **7** genuine strictness findings to fix
  or individually baseline with a reason.
- **This amendment writes no config.** ARCH names the gate; a worker wires it.

**Why it is not routed to a T1 cluster:** every render-test pin in the mission
has been unchecked since the mission began. It belongs to whoever owns the
harness, not to the cluster that happened to surface it.

#### R-5 — mint a state-surface token (owner: a token addendum)

Full ruling and the four constraints: `ADR-001` §AM13/N11. The short form:

- Re-valuing `--surface-sunken` would invalidate **all 34** published contrast
  rows, since it is the worst-case surface in every one of them. Minting costs
  **zero ADR-001 residual** — new declarations sit inside the token blocks the
  range-pair oracle exempts by construction — and leaves the table untouched.
- Reuse of an existing token was measured and rejected on **semantics, not
  scarcity**: 83 tokens are distinct from `--shell` in both modes, and the
  nearest surface-family candidate (`--surface-2`) reverses depth between modes.
- `globals.css`'s two writers are T9-C3 (wave 0, closed) and T3-C1 (one named
  rule), so neither can take a new token — hence a dedicated addendum.
- **Not folded into the live T1-C2 rework.** That seat writes `DebateCanvas` and
  `scrutiny`, not the token blocks; mid-rework token edits are how wave-0
  discipline dies.

**Verification for this amendment:** AM5 ownership invariant re-run on the
published markdown — **32 rows, 5 exemptions, 0 violations**. **No row moved:**
both rulings are routed rows, and neither writes a dispatch Writes or Verify
column. Row 8 and every T1-C2 cell untouched, as in AM12b.

### 2026-09-01 — AM14: the design was compressed away, twice, with every gate green (trigger: V's review of the live landing, ticket `t_5864f48f`)

V opened the running landing and found two things. The chrome bar had shipped
**unstyled** — `LandingChrome.tsx` carries zero `className` attributes and
`globals.css` carries zero rules that select it, so the browser renders an
`<a>`, a `<nav>` and a `<div>` as three stacked lines at tops 198 / 216 / 235,
transparent, square-cornered, shadowless. The sample cards had shipped as a
token checklist: three cards where the design has four, with no claim prose, no
glyphs, no tinted pills, no model pills, no turn counters and no deck. Every
cluster was green. Every review passed. Nothing was broken in the sense any gate
could see.

**Where it went wrong — the two-step compression.**

*Step one: design -> SPEC.* The design is a rendered artefact: 159KB of inline
styles carrying exact geometry, exact composition, and real content. The SPEC
row that survives it is `T9-S3`, a checklist of the parts a card has. A
checklist of parts is a **set**; the design is a **composition**. Everything
that lives in the relations between the parts — the rotation, the overlap, the
tint, the pairing of a claim to its author — falls out at this step, silently,
because a checklist has no place to put it.

*Step two: SPEC -> cell.* I then wrote acceptance cells against the SPEC, not
against the design, and the cells assert strings and attributes because jsdom
is what runs them. `toContain("BASE")` is satisfied by a badge with no
background on a card with no prose. The cell was faithful to the SPEC; the SPEC
had already lost the design; and the cell's greenness was then read — by me, by
the workers, by the reviewers — as evidence the surface was right.

The shape of it, counted rather than characterized — `tests/render/t9-landing.test.tsx`,
the landing's entire standing pin:

```
expect(...)              63
toContain(...)           23
getComputedStyle(...)     0
getBoundingClientRect()   0
```

**Sixty-three assertions about the landing, and not one of them looks at how it
renders.** That is the defect in one table, and the cells that produced it are
mine.

**Four contributing causes, each of which I own a part of.**

1. **The vocabulary law had a chilling effect on porting.** The mission
   correctly ratified `round` -> `debate` and `joint` -> `claim`. Workers
   generalized that into *"design copy is not ours to ship"* and dropped the
   card claim prose entirely rather than carry it across. Nobody ever ruled
   that. The rule is narrow — it substitutes two terms — and I never said so,
   so it read as a licence to paraphrase everything. AM14's DECISIONS row (a)
   states the boundary explicitly.
2. **The token law turned copying into uncharged translation.** ADR-001's sweep
   forbids **colour** literals. It says nothing about `padding: 9px 9px 9px
   26px`. But a worker reading "no literals" in a hurry sees every number as a
   thing needing a token that does not exist, and the cheapest exit is to
   approximate with something responsive-looking instead — which is how the
   design's `padding:130px 96px 190px` on the exchange section became
   `clamp(56px, 9vw, 112px) clamp(24px, 7vw, 96px)`
   (`LandingSample.tsx:41`), and the composition dissolves a value at a time. AM14's Wave 6 section states the boundary in one
   line: **colours tokenize; geometry, spacing, radii and composition port as
   written.** Measured cost of not having said it earlier: wave 0 ported the
   palette **byte-identically** — `--fw-display` 480, `--r-panel` 16px,
   `--shadow-chrome`, `--m-claude/-gpt/-gemini` all match the design renderer
   exactly — and the composition **not at all**. The tokens were never the
   problem. Nothing consumed them.
3. **jsdom blindness, which I knew about and did not act on.** jsdom does not
   resolve `var()`, does not lay out, and reports every geometry as `0`. I
   wrote that sentence in ADR-006 before wave 0 and then kept authoring visual
   acceptance in jsdom anyway, because it was the tool the suite already had.
   The T1-C2 reviewer had to build a loopback browser fixture by hand to see a
   `0 × 0` element, wrote *"promote this into the reviewer kit"* in their
   report, and I read that report and did not promote it. It is promoted now,
   as the DOM-DUMP BROWSER KIT, and it is the machine-checkable half of every
   visual cell from here on.
4. **F11 was raised at intake and never routed. That is an orchestrator
   defect and it is named here.** REQ-01 (`t_16d44323`) filed F11 —
   *"design elements in no SPEC"* — before any code existed. It predicted this
   exact outcome. It was not routed to ARCH, not turned into a row, and not
   carried into any packet. A finding that names the class of a future failure
   and then sits unrouted costs more than never finding it, because the mission
   spends its confidence on the fact that someone looked. The router owns that
   miss. I own the sixty-three assertions.

**What actually changes.** Not "be more careful". Two structural things: the
**FIDELITY LAW** — every visual cell names a real-browser half and a V-QA half,
enforced at pre-dispatch, inherited by T5, T3-lists, T4, T6, T7, T8 — and
**FID-3**, a sweep that diffs every shipped surface against its design source in
a browser and classifies each divergence ABSENT / UNBOUND / DRIFTED / DECLARED.
The first two gaps were found by V. The rest should not be.

**Beyond charge, declared.** Three things this amendment did that the packet did
not ask for. (a) V's 09:28 source-hierarchy correction arrived
mid-amendment and is applied: the binding original is
`ui_designs/DebateAI Design Document.html`, and the derived copy was **verified
against it** on all seven values quoted here rather than trusted. Doing that
surfaced a gap the correction does not cover — **the binding original contains
no landing at all** (12 screen labels, zero landing markers), so the landing's
authority is `docs/missions/ui-overhaul/design/design-document-rendered.html`,
repo-tracked and fully resolved. Filed as **Q-17** for V. Re-verifying every
landing value against the resolved document also caught one of my own: the card
core is `var(--bg)`, not `var(--core)`.
(b) The **PRESERVING-WRITE clause** was added to the verify-survivability law,
because the mechanical rule would have handed a styling worker edit rights over
the token contract and over `pda-s03-keyboard-accessibility.test.ts`; the clause
is checkable and its gate was run against a real probe (`0 / 1 / 1`) before
publication. (c) **Routed row R-6** — the canvas adoption of `ModelPill` — is
deferred rather than done, because `ModelPresentation.tsx` sits in the live
`CODE-T1C2-ADD2` lane; V's "one generic pill" is therefore **structurally**
delivered and **not yet** adopted on the canvas, which is written into the
section so nobody reports it as complete.

**One claim was checked and found false before it could be published.** I had
drafted a finding that `LandingSample.tsx`'s reuse of `.nodeWrap`
(`globals.css:1944`, `position: absolute`) collapses the sample grid. Rendered
in Chromium, the grid is fine — an inline `position: "relative"` at
`LandingSample.tsx:114` outranks the class. The finding is in no cell. What
survives is true and smaller: the landing depends on an inline override of a
canvas-graph class, and `data-bezel` — the shared bezel vocabulary
`component-map.md` names — has **zero** rules in `globals.css`.
