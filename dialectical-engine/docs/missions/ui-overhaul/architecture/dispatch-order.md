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

`globals.css` has exactly ONE writer for the whole mission: **T9-C3**. Every
other cluster's `forbidden` set names the `:root` and `html[data-mode="chamber"]`
blocks explicitly.

### Acceptance defaults — every cluster, in addition to the command in its row

**COMPILE GATE (added 2026-08-31, AM2/C).** Every cluster that writes any file
under `apps/ui/` also runs the workspace compile gate at **0-new**. That is every
cluster below except the pure test-migration ones that write only under `tests/`
(T9-C5, T1-C4, T3-C4, T4-C4, T5-C3, T6-C4, T7-C4, T8-C4):

```sh
pnpm exec tsc --noEmit -p apps/ui/tsconfig.json 2>&1 \
  | grep -E 'error TS' \
  | grep -v -e 'app/debate/\[id\]/DebatePageClient\.tsx(1488,11): error TS2322' \
          -e 'app/layout\.tsx(3,8): error TS2882' \
  | tee /dev/stderr \
  | wc -l          # required: 0
```

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

### The four adjudicated exemptions — published, because an unpublished exemption is a hole

A cluster writing a file a pin reads is a **candidate** breaker, not a breaker.
Four (breaker, pin) pairs were adjudicated NOT-A-BREAK against what the pin
actually asserts; they account for all eight cells the raw checker reports.
Each one is a constraint on the cluster, and if the constraint is violated the
exemption is void and the pin is red with no owner — so they are listed, not
assumed.

| Cell | Pin's actual assertion | Why the charge cannot reach it | Constraint that keeps it true |
|---|---|---|---|
| #1 T9-C3 `globals.css` → `pda-s03` | computed `justify-content`, `gap`, `margin-left`, `font-weight`, `padding`, `border-radius`, `background`, `color`, `box-shadow` on `.sectionHead` / `.tab` / `.tabActive` / `.count` (lines 164–174) | jsdom does not resolve `var()`, so a token *value* cannot reach any of these reads; T9-C3's charge is the two token blocks and the font wiring | the `ADR-001` literal→var substitution is **declaration-preserving**: it changes values, never which selectors or declarations exist |
| #1 T9-C3 `globals.css` → `v2ui-pages` | `v2ui-pages.test.ts:579` pins the literal text `border: 1px solid var(--line-strong); … background: var(--surface-sunken); … color: var(--muted);`, plus `@media` and `[data-actions-collapsed]` rules (lines 349–352, 546) | all three custom-property NAMES survive — `ADR-001`: *"existing names are redefined; new names are added beside them"* (`token-inventory` rows for `--surface-sunken`, `--muted`, `--line-strong`) | T9-C3 may not RENAME an existing token, only redefine it |
| #2 T9-C1 `app/page.tsx` → `s8-publication-contract` | `readPublicDebates(50, 0)`, `Published debates…`, and the source slice `published.items.map` → `</article>` | an early return adds a branch above the library body; the pinned text stays in the file | the split moves no JSX out of `app/page.tsx` (stated in full above) |
| #3 T3-C1 `TopBar.tsx` → `auth-flow-integration` | `.authTopBar a[href="/"]` not null (lines 171, 200) and `.authTopBar [aria-disabled="true"]` **null** in the pre-auth state (line 201) | `ModeToggle` renders `aria-pressed`, not `aria-disabled`, and does not touch the brand link | the ☾ control must never carry `aria-disabled`; the `authTopBar` brand link keeps `href="/"` |

Re-running the invariant checker over this file reports exactly the eight cells
these four pairs generate and nothing else; with the exemption list applied it
reports **0**. A reviewer who
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
| 3 | **T3-C1** — signed-in library chrome + ☾ mount in `TopBar` | `apps/ui/components/TopBar.tsx` · `apps/ui/app/page.tsx` (library half) · `apps/ui/components/LibraryComposer.tsx` · `tests/render/t3-library.test.tsx` · `tests/unit/pda-s03-keyboard-accessibility.test.ts` · `tests/architecture/s8-publication-contract.test.ts` | `pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/render/bug03-home-buffer.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/t3-library.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/s8-publication-ui.test.tsx` |

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
| **T9-C1-3** | R3 | The anonymous landing renders the mode control | In `tests/render/t9-landing.test.tsx` (owned by T9-C1): render the anonymous `/` document — the same no-session render as T9-C1-1 — and assert the markup contains an element carrying `data-mode-toggle` whose accessible name matches `/Switch to (Chamber\|Terracotta) mode/`. Asserting the `☾` glyph alone = RED (the glyph is decoration, the label is the contract). Asserting that `ModeToggle` is merely imported = RED — the assertion is on the RENDERED anonymous-landing output |

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

