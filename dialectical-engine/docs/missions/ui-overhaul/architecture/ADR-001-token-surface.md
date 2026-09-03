# ADR-001 — The tokens live at the top of `globals.css`, not in a new `tokens.css`

**Status:** ACCEPTED (ARCH-01, 2026-08-31) · mission-local
**Slices affected:** all eight

## Decision

The Terracotta and Chamber token blocks are written **at the top of
`apps/ui/app/globals.css`**, as `:root { … }` (Terracotta) immediately followed
by `html[data-mode="chamber"] { … }` (Chamber). No new stylesheet file is
created. The existing 69 custom-property NAMES are kept and their VALUES are
redefined; new names are added beside them.

`apps/ui/app/globals.css` has exactly one writer for the whole mission:
cluster **T9-C3**. Every other cluster is forbidden from editing the two token
blocks (`forbidden` set in its packet). Other clusters may add component rules
lower in the same file only where `dispatch-order.md` grants them a named
section; where two clusters would both need a rule, the rule is hoisted into
T9-C3.

## Why not a separate `apps/ui/app/tokens.css` imported by `globals.css`

This was the obvious shape and it is **rejected on measured evidence**:

1. `tests/unit/pda-s03-keyboard-accessibility.test.ts:36` does
   `readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"))` and injects
   that text into a jsdom `<style>` element (line 80). **jsdom does not follow
   `@import`.** A separate token file would be invisible to that standing test
   and to every new token test built on the same proven pattern — the token
   values would silently read as empty and the assertions would degrade to
   vacuous truth. That is the "orphan `tokens.css`" failure the T9 SPEC names
   explicitly (`T9-C3-3`: *orphan `tokens.css` unused by landing = RED*), and it
   would arrive through the test harness rather than through the browser, where
   nobody would see it.
2. `@import` must precede all other rules in a CSS file; `globals.css` already
   opens with a comment banner and `:root`. Moving to `@import` reorders the
   file's first 100 lines for no functional gain.
3. Next.js inlines both shapes identically in the built stylesheet, so there is
   no runtime or bundle difference to trade against (1) and (2).

## Consequence a reviewer should check

`globals.css` is 4080 lines and now carries the token contract as well.
Single-writer discipline is therefore load-bearing, not stylistic: two Codex
seats editing the token blocks concurrently is the one collision this mission
cannot absorb. `dispatch-order.md` sequences T9-C3 alone, first, with every
other cluster gated behind it.

## The colour-literal sweep — THREE oracles, not one (AMENDED 2026-08-31, AF-1)

### The defect this replaces

The original version of this section specified ONE repo-wide sweep over
`apps/ui/{app,lib,components}` and required T9-C3 to drive it to residual 0. It
also asserted that only **two** class members lived outside `globals.css`.

**Both were wrong, and the wave-0 coder caught it at preflight before writing a
line** (`t_4ccac5c4`, CODEX BLOCKED 2026-08-31 19:25). The repo-wide oracle
matches 45 literals outside `globals.css`, spread across files owned by *later*
clusters. Requiring T9-C3 to reach 0 against it made the acceptance satisfiable
only by violating one-writer-per-file — an unsatisfiable acceptance, which is
strictly worse than no acceptance because it reports RED in every state of the
code including a correct one.

The cause was mine and it is the exact failure this repo already has a name for:
I identified the CLASS correctly ("every colour literal that cannot respond to
the mode switch") and then published an instance count I had not enumerated.
Naming a class and enumerating it are different acts, and only the second one
can be an oracle.

### The oracle pattern (corrected)

```sh
# The token region is TWO intervals. Both found BY SYNTAX at run time; fail loud if
# either is missing or unclosed. Never a literal line number, never a prefix.
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
  <SCOPE> \
  | awk -v r="$RANGES" -F: 'BEGIN{split(r,a,",")} !($1 ~ /globals\.css$/ && (($2+0>=a[1] && $2+0<=a[2]) || ($2+0>=a[3] && $2+0<=a[4])))'
```

Three corrections to the original pattern, each with its reason:

1. **`\brgba?\(` not `rgba?\(`.** Without the word boundary it matches `rgb(`
   inside the identifier `oklchToLinearSrgb(` — 2 false positives in
   `apps/ui/lib/scoreBandTokens.test.mjs.disabled`.
2. **`--glob '!*.disabled'`.** A `.mjs.disabled` file is neither executed nor
   bundled; a literal there cannot reach a user.
3. **`--glob '!*.svg'`.** `apps/ui/app/icon.svg` carries `#111111` and `#f8f6f1`
   as a favicon's fills. An SVG referenced as a file cannot read CSS custom
   properties from `globals.css`, and favicons do not follow mode. Requiring it
   to reach 0 would be a second unsatisfiable acceptance.
   *(Aside worth recording: this file is the ONLY occurrence of `#111111` in the
   repo, which is almost certainly where the mission compass's "ink `#111111`"
   came from — see `open-questions.md` Q-10. It is a favicon fill, not a text
   colour.)*

`oklch\(` is deliberately left BROAD. A first tightening attempt used
`oklch\(\s*[0-9.]` and silently dropped three REAL members —
`DebateMap.tsx:58-60`, which build colours as template literals
`` `oklch(${(0.6 + light).toFixed(3)} 0.12 162)` ``. Those are hard-coded
colours that will be wrong in Chamber. A matcher tightened until the count looks
clean is how the real defects leave the list.

### Measured baseline — 156 matches, `12 of 12` files, every member owned

Re-measured by ARCH-01 on 2026-08-31 with the corrected oracle at repo scope:

```sh
# The token region is TWO intervals. Both found BY SYNTAX at run time; fail loud if
# either is missing or unclosed. Never a literal line number, never a prefix.
RANGES=$(awk '
  /^:root[[:space:]]*\{/                       {s1=NR; f=1; next}
  f==1 && /^\}/                                {e1=NR; f=0; next}
  /^html\[data-mode="chamber"\][[:space:]]*\{/ {s2=NR; g=1; next}
  g==1 && /^\}/                                {e2=NR; g=0; next}
  END { if (s1 && e1 && s2 && e2) printf "%d,%d,%d,%d", s1, e1, s2, e2 }
' apps/ui/app/globals.css)
[ -n "$RANGES" ] || { echo "FAIL: globals.css token blocks not found or unclosed"; exit 2; }
rg -n --no-heading -e 'oklch\(' -e '#[0-9a-fA-F]{6}\b' -e '\brgba?\(' \
    --glob '!*.disabled' --glob '!*.svg' apps/ui/app apps/ui/lib apps/ui/components \
  | awk -v r="$RANGES" -F: 'BEGIN{split(r,a,",")} !($1 ~ /globals\.css$/ && (($2+0>=a[1] && $2+0<=a[2]) || ($2+0>=a[3] && $2+0<=a[4])))' \
  | cut -d: -f1 | sort | uniq -c | sort -rn
 111 apps/ui/app/globals.css
  12 apps/ui/lib/scrutiny.ts
  11 apps/ui/components/DebateMap.tsx
   6 apps/ui/components/GuideModal.tsx
   6 apps/ui/app/debate/[id]/DebatePageClient.tsx
   2 apps/ui/lib/debatePresentation.ts
   2 apps/ui/components/DebateSplit.tsx
   2 apps/ui/components/DebateCanvas.tsx
   1 apps/ui/components/SynthesisPanel.tsx
   1 apps/ui/components/ModelPresentation.tsx
   1 apps/ui/components/DebateThread.tsx
   1 apps/ui/components/DebateOutline.tsx
                                              TOTAL 156
```

The coder measured **47 across 12 files** under the ORIGINAL (loose) oracle. That
count was correct for that oracle. The corrected oracle gives **45 across 10
files** outside `globals.css`; the 2-file / 4-match difference is exactly the
`icon.svg` and `.disabled` exclusions above. Both numbers are right; they answer
different questions, and this paragraph exists so nobody has to reconcile them
twice.

### (a) WAVE-0 ORACLE — T9-C3's acceptance

Scope is **T9-C3's write surface only**, the four product files it owns:

```sh
# The token region is TWO intervals. Both found BY SYNTAX at run time; fail loud if
# either is missing or unclosed. Never a literal line number, never a prefix.
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
  apps/ui/app/globals.css apps/ui/app/layout.tsx \
  apps/ui/components/ModeToggle.tsx apps/ui/lib/debatePresentation.ts \
  | awk -v r="$RANGES" -F: 'BEGIN{split(r,a,",")} !($1 ~ /globals\.css$/ && (($2+0>=a[1] && $2+0<=a[2]) || ($2+0>=a[3] && $2+0<=a[4])))' \
  | wc -l
```

**Baseline 113** (`globals.css` 111 + `debatePresentation.ts` 2;
`layout.tsx` 0, `ModeToggle.tsx` does not exist yet).
**Required after T9-C3: 0.** The `globals.css` exemption covers the token region
itself — where literals ARE the point — and nothing beyond it. Since AM3 that
region is expressed as **membership in one of two syntax-derived intervals**,
never a line number and never a prefix.

This is satisfiable without touching one file T9-C3 does not own.

### (b) PER-CLUSTER ORACLE — every remaining member has exactly one owner

Each re-skin cluster inherits the same command **scoped to its own write
surface**, and must reach **0 after its work**. The 45 non-wave-0 residuals,
grouped by owning cluster — `10 of 10` files, `45 of 45` matches:

| Owner | File | Matches | Why this owner |
|---|---|---|---|
| **T1-C1** | `apps/ui/app/debate/[id]/DebatePageClient.tsx` | 6 | already T1-C1's write surface |
| **T1-C1** | `apps/ui/components/GuideModal.tsx` | 6 | imported by `DebatePageClient.tsx` only |
| **T1-C2** | `apps/ui/components/DebateMap.tsx` | 11 | a view mode; renders the cards T1-C2 owns |
| **T1-C2** | `apps/ui/lib/scrutiny.ts` | 12 | scrutiny-tier colour map consumed by `DebateCanvas`, `DebateSplit`, `DebateThread`, `DebatePageClient`, `ChallengePopover`, `InvestigationDrawer` — the same shape as `ROLE_PALETTES` |
| **T1-C2** | `apps/ui/components/DebateCanvas.tsx` | 2 | already T1-C2's write surface |
| **T1-C2** | `apps/ui/components/DebateSplit.tsx` | 2 | a view mode |
| **T1-C2** | `apps/ui/components/DebateThread.tsx` | 1 | a view mode |
| **T1-C2** | `apps/ui/components/DebateOutline.tsx` | 1 | a view mode. NOTE: no app importer found — test-referenced only (`ui02d-model-identity`). Flagged for the orphan audit; NOT deleted here |
| **T1-C2** | `apps/ui/components/ModelPresentation.tsx` | 1 | the model identity line inside every card |
| **T1-C3** | `apps/ui/components/SynthesisPanel.tsx` | 1 | already T1-C3's write surface |

Subtotals: **T1-C1 = 12 · T1-C2 = 30 · T1-C3 = 1 · total 43** in files already
or newly assigned, plus **T9-C3 = 113**. `113 + 43 = 156`. Every match has
exactly one owner and no file has two.

**Every non-wave-0 residual falls inside T1.** The literal debt is entirely in
the debate-canvas slice — no other slice inherits any of it. That is a real
finding for ticketing: T1-C2's write surface grows by six files
(`DebateMap`, `DebateSplit`, `DebateThread`, `DebateOutline`,
`ModelPresentation`, `scrutiny.ts`), which `dispatch-order.md` now reflects.

### (c) MISSION-FINAL ORACLE — the original global sweep, owned and dated

The repo-wide sweep survives, unchanged in scope, as the **mission-final** check:

```sh
# The token region is TWO intervals. Both found BY SYNTAX at run time; fail loud if
# either is missing or unclosed. Never a literal line number, never a prefix.
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
  | wc -l          # required: 0
```

**Owner: `T8-C4`**, cluster #32 and the last in `dispatch-order.md`. This is a
verification-only duty — T8-C4 writes no product code for it. If the number is
non-zero at that point, the residual belongs to whichever cluster owns the file
per table (b), and the finding is routed there rather than absorbed by T8-C4.

It is ALSO repeated as a **QA line for V** at the closure gate, because a
per-cluster green tells you each seat cleaned its own surface, and only the
global sweep tells you the union is actually clean.

### Why keep all three

The per-cluster oracle answers *"did this seat clean what it owns"* — the only
question a seat can act on. The mission-final oracle answers *"is the product
clean"* — the only question V cares about. Neither implies the other, and the
original single-oracle design collapsed them, which is precisely why it became
unsatisfiable for the one seat that had to run it first.

---

## The mirrored guard in `tests/unit/t9-mode-tokens.test.ts` (contract, not code)

The acceptance mirrors this oracle so the sweep is enforced by the test suite and
not only by a human running a command. **Its exemption must have the same SHAPE**
— two intervals, not a prefix. The contract the rework worker implements:

```ts
/** A 1-indexed, inclusive line interval. */
export type LineRange = readonly [start: number, end: number];

/**
 * The two token-block intervals in globals.css, located by syntax.
 * Throws if either block is absent or unclosed — a boundary the guard cannot
 * find is a broken guard, and a broken guard must stop the run.
 */
function tokenBlockRanges(css: string): readonly LineRange[] {
  const lines = css.split("\n");
  const find = (re: RegExp, label: string): LineRange => {
    const start = lines.findIndex((l) => re.test(l));
    if (start === -1) throw new Error(`${label} token block not found in globals.css`);
    const end = lines.findIndex((l, i) => i > start && /^\}/.test(l));
    if (end === -1) throw new Error(`${label} token block is not closed`);
    return [start + 1, end + 1];
  };
  return [
    find(/^:root\s*\{/, ":root"),
    find(/^html\[data-mode="chamber"\]\s*\{/, "chamber")
  ];
}

const isInsideTokenBlocks = (n: number, ranges: readonly LineRange[]): boolean =>
  ranges.some(([start, end]) => n >= start && n <= end);
```

The per-line skip becomes

```ts
if (path === globalsPath && isInsideTokenBlocks(lineNumber, ranges)) continue;
```

replacing AM2's `lineNumber <= tokenBlockBoundary(css)`.

**Neither a fixed line number NOR a prefix comparison may remain anywhere** — not
in this ADR, not in the shell oracle, not in the test. The two are different
defects: AM2 fixed where the number came from, AM3 fixes what the number means.

---

## Changelog

### 2026-08-31 — AM2/B: the exclusion window was 85 lines wider than the region it protected (trigger: `t_4ccac5c4`, Wave-0 blind review, mutant M2)

**What was wrong.** This ADR's oracle and its mirror in
`tests/unit/t9-mode-tokens.test.ts:460` both excluded `globals.css` **lines
1–199** — a round number chosen while the token blocks were still hypothetical.
Measured after Wave 0 landed:

```
$ grep -n '^:root\|^html\[data-mode="chamber"\]\|^}' apps/ui/app/globals.css | head -4
5::root {
72:}
74:html[data-mode="chamber"] {
114:}
```

The token blocks **end at line 114**. Lines 115–199 — which contain real product
CSS, e.g. `* { box-sizing: border-box; }` at 116 — were exempt from the
colour-literal law for no reason but the round number.

**The mutant, and my reproduction.** M2 inserted
`.appShell { background: #FF00FF; }` at line 150:

| Filter | Residual | M2 caught? |
|---|---|---|
| OLD (lines 1–199) | 0 | **no** — a magenta, mode-inert app-shell background ships fully green |
| NEW (syntax-bound, boundary 114) | 1 | **yes** |

*Method note, because it nearly fooled me:* my first reproduction ran `rg`
against a single file, and `rg` omits the path prefix in that mode — so the
`globals\.css:NNN:` filter matched nothing and BOTH oracles appeared to catch
M2. The finding looked wrong for one tool call. Re-run with the real repo path
shape, the reviewer is exactly right. **The test was the artifact, not the
finding** — and a filter that keys on a path must be exercised with a path.

**Cost of the fix: zero.** The WAVE-0 ORACLE against the real tree with the
tightened boundary still returns **0**: Wave 0 had already tokenised every line
in 115–199. The window was latent, not live — but it was open, on the one file
every cluster inherits.

**The class, not the instance.** The defect is not "199 was the wrong number" —
it is *a structural boundary encoded as a positional constant*. That exact shape
is already recorded in `.hermes/TOOLING-TRAPS.md` as *"an acceptance pinned to
ABSOLUTE LINE NUMBERS"*. So the remedy is not a better number; it is removing the
number. Every consumer now computes the boundary from syntax at run time and
fails loudly if it cannot find it.

### 2026-08-31 — AM3/A: the AM2 remedy fixed the boundary's SOURCE but kept a one-sided PREFIX (trigger: `t_4ccac5c4` REV2 verdict 21:55, finding B2; ticket `t_6cd3cba0`)

**What was still wrong.** AM2 replaced a literal `199` with a syntax-derived
boundary. That closed M2 and was a real improvement — but the SHAPE never
changed: `lineNumber <= boundary` exempts **everything from line 1 to the end of
the last token block**. The token region is not a prefix. It is **two
intervals** — `:root` at 5–72 and `html[data-mode="chamber"]` at 74–114 — with
the banner above, the gap between, and the whole stylesheet below all outside
it. This ADR had already stated the property correctly in its own words
("covers the token region itself … and nothing beyond it") and then implemented
something weaker.

**Three live members of the surviving class, all GREEN under the AM2 filter:**

| Mutant | Where the literal sits | AM2 (prefix) | AM3 (ranges) |
|---|---|---|---|
| M4 | line 73, the **gap between** the two blocks | 0 — missed | **1 — caught** |
| M5 | line 4, **above `:root`** in the comment banner | 0 — missed | **1 — caught** |
| M6 | line 150, with the **chamber block relocated to EOF** | 0 — missed | **1 — caught** |

**M6 is why this was blocking rather than an N.** Moving the Chamber block to the
bottom of `globals.css` is a semantically legal refactor — `ADR-002` itself
records that `html[data-mode="chamber"]` (0,1,1) beats `:root` (0,1,0)
*regardless of source order*, so nothing else in the suite objects. Under the
prefix filter that single move computes a boundary of 4121 and **exempts the
entire 4119-line stylesheet from the colour-literal law, silently** — on the one
file all 32 clusters consume, and the one file with a single authorised writer
for the whole mission, so no later seat could repair it.

**Verification of the published artifacts, run at real scope on scratch fixtures
(`/tmp`, zero repo writes, fixtures removed afterwards):**

```
FIXTURE  RANGES (published finder)   AM2-bound   AM3 hits   AM2 hits
clean    [(5,72),(74,114)]           114         0          0
m4       [(5,72),(75,115)]           115         1          0
m5       [(6,73),(75,115)]           115         1          0
m6       [(5,72),(4081,4121)]        4121        1          0
```

The same four fixtures through the **published TypeScript helper**, executed:

```
clean   ranges=[[5,72],[74,114]]    hits=0
m4      ranges=[[5,72],[75,115]]    hits=1
m5      ranges=[[6,73],[75,115]]    hits=1
m6      ranges=[[5,72],[4081,4121]] hits=1
```

Fail-loud paths exercised on known-BAD input, both consumers:

```
:root renamed        -> shell guard fires (exit 2) ; helper THROWS ":root token block not found in globals.css"
chamber left unclosed -> shell guard fires (exit 2) ; helper THROWS "chamber token block is not closed"
real globals.css      -> RANGES = 5,72,74,114 (guard correctly does NOT fire)
```

*(My M6 fixture yields `(4081,4121)` where the reviewer recorded `(4082,4122)`
— a one-line difference in how each of us rebuilt the fixture. Immaterial: both
exempt the entire stylesheet, which is the finding.)*

**The class, one level up.** AM2's changelog said the defect was "a structural
boundary encoded as a positional constant" and fixed the constant. That
diagnosis was incomplete: the deeper defect was **a two-interval region encoded
as a one-sided comparison**. Fixing where a number comes from is not the same as
fixing what the number means — and the spine's own corollary names this exactly:
*choose the remedy by the SHAPE, not by your confidence about the source.* I had
that corollary in front of me, quoted it in AM1, and still applied it to the
source rather than the shape.

---

## 2026-09-01 — AM12b/item 1: this ADR's oracles were anti-gates, and they inherit ADR-006's two guards (trigger: N7, `t_4e80c7bf`)

`ADR-006` §"Why step 2 exists" states the law: **the filter that makes a gate
readable is the same filter that hides a harness failure.** That law was written
for the compile gate. These colour-literal oracles never inherited it, and they
have exactly the same shape — `rg | awk | wc -l`, where every failure of `rg`
lands on `wc -l` as `0`, which is the required value.

**Both failure modes reproduced in this amendment, on this tree:**

```
A. rg unavailable (non-interactive shell, stripped PATH)
   $ env PATH=/usr/bin:/bin sh -c 'rg -n "oklch\(" apps/ui/components 2>/dev/null | wc -l'
          0            <- rc 0, indistinguishable from a clean tree

B. over-escaped pattern, on a file that TRULY carries one literal
   correct pattern:      1        (apps/ui/components/SynthesisPanel.tsx)
   over-escaped pattern: 0
```

Neither prints a warning a seat would notice: `2>/dev/null` is common in the
published forms, and `rg`'s own parse error goes to stderr while the count comes
from `wc -l` on an empty stdout.

### The two guards — required before any oracle result in this ADR is quotable

```sh
# GUARD 1 — tool liveness. An oracle that cannot run its matcher has no result.
command -v rg >/dev/null 2>&1 || { echo "ORACLE FAIL: rg not on PATH"; exit 2; }
rg --version >/dev/null 2>&1   || { echo "ORACLE FAIL: rg present but not runnable"; exit 2; }

# GUARD 2 — discrimination. Plant one literal, require the count to MOVE, remove it.
#   Run on a scratch copy, never on the tree under audit:
#     cp <file> /tmp/oracle-probe.bak
#     printf '\n/* probe */ .x { color: #C15F3C; }\n' >> <file>
#     <oracle>            # MUST print baseline+1
#     cp /tmp/oracle-probe.bak <file>   # restore, verify by checksum
#     <oracle>            # MUST print baseline again
```

**Guard 2 is the one that matters and it is not optional padding.** Guard 1
catches a missing tool; only Guard 2 catches a *wrong pattern*, which is
failure mode B and the one that produced `0` on a tree with 12. A run that has
only ever been observed printing its pass value has not been shown to
discriminate — the same sentence `ADR-006` already carries for the compile gate,
now binding here.

**Applies to all three oracles** — the wave-0 oracle §(a), the per-cluster
oracles §(b), and the mission-final oracle §(c). A cluster report quoting
`residual 0` without both guards is quoting an unverified number, and a reviewer
should treat it as absent rather than as evidence.

**Measured live residual at this amendment, with both guards satisfied:** `1`,
in `apps/ui/components/SynthesisPanel.tsx` — owned by **T1-C3 (row 9)**, which
writes that file, so it is on-track and not a residual without an owner.

## 2026-09-01 — AM13/N11: `--surface-sunken` is `--shell`, and the state bezel is invisible (trigger: CODE-T1C2-REV2, `t_109c2c42`)

**Measured on the shipped stylesheet:**

```
--shell           Terracotta #EFE9E0   Chamber #221D17
--surface-sunken  Terracotta #EFE9E0   Chamber #221D17
IDENTICAL in both modes: True
```

So a state card (empty / abandoned / failed) paints its core the same bytes as
the shell around it: the double bezel T1 R2 requires survives only on healthy
cards, and the cards a reader most needs to tell apart are the ones that lose
it. This is the sharpest instance of the names-vs-values through-line this
mission keeps hitting — swapping `sunken → shell` changes **zero pixels** and
still flips a pin, because the pin reads the name.

**This is LIVE, not hypothetical.** T1-C2's rework landed (`0cf36149`), and the
state fill is shipped: `DebateCanvas.tsx:311` and `:376` both set
`background: "var(--surface-sunken)"`. So on the current tree, empty / abandoned
/ failed cards already render a single flat surface in both modes. The routed row
below is a fix for a defect a reader can see today, not a precaution.

**RULING: MINT a state-surface token. Re-valuing `--surface-sunken` is REFUSED,
and the cost is the reason.**

| Option | Cost, measured | Verdict |
|---|---|---|
| **Re-value `--surface-sunken`** | it is the worst-case surface in **all 34 rows** of the published contrast table (`token-inventory` §"the worst surface is `--surface-sunken`"; 37 occurrences in that file). Changing its value **invalidates every row** and requires a full re-measurement plus a wave-0 reopen | **REFUSED** |
| **Mint `--surface-state` (+ `-2` if a second depth is needed)** | **zero ADR-001 residual** — new declarations live inside the `:root` / `html[data-mode="chamber"]` blocks, which the range-pair oracle exempts by construction. The 34-row table is untouched. Cost is two values and one new contrast obligation | **RULED** |
| **Ratify the flat look** | free | **REFUSED** — T1 R2 requires the double bezel on tree/canvas cards, and state cards are tree/canvas cards. Ratifying would make the affordance conditional on a card being healthy, which inverts who needs it |

**A correction to the finding as filed, made in the reviewer's favour.** The
ticket says *"the reviewer measured EVERY in-contract token — none distinct from
`--shell` in both modes."* Widening the search past the contract, **83 tokens
are distinct from `--shell` in both modes**, ~30 of them surface-family. The
reviewer's statement is true of the in-contract set they were bounded to; it is
not true of the palette, and a later reader must not conclude the palette is
exhausted. **Reuse was still rejected on semantics, not scarcity:**
`--surface-2` is the nearest candidate and it reads *raised* in Terracotta
(`#F4F0E8`, lighter than `--shell`) while reading *sunken* in Chamber
(`#171310`, darker). A token whose depth reverses between modes is worse than a
flat one.

**Constraints the minted token must satisfy — the implementing row measures
these; this ADR does not publish an unmeasured colour:**

1. Distinct from `--shell` **and** from `--core` in **both** modes.
2. Reads **recessed in both modes** — same direction relative to `--core` in
   Terracotta and Chamber. This is the constraint that rejected `--surface-2`.
3. Every text token that lands on a state card meets **ADR-005**'s floors
   against it (4.5:1 text, 3.0:1 meaning-bearing non-text), measured and
   published as new rows — the existing 34 are **not** re-derived, because
   `--surface-sunken` is untouched.
4. Declared in **both** token blocks, so the mode-parity pin in
   `t9-mode-tokens.test.ts` stays total.

**Owner: routed row R-5.** `globals.css` has exactly two writers — T9-C3
(wave 0, closed) and T3-C1 (row 3, one named rule only) — so neither can take a
new token. R-5 is a **token addendum**: it mints the token in both blocks,
publishes its contrast rows, and re-points the state-card rule. It is **not**
folded into the live T1-C2 rework: that seat writes `DebateCanvas`/`scrutiny`,
not the token blocks, and mid-rework token edits are how wave-0 discipline dies.
