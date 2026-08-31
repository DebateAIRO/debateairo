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
# Boundary found BY SYNTAX at run time. Never a literal line number.
BOUNDARY=$(awk '/^html\[data-mode="chamber"\][[:space:]]*\{/{f=1;next} f&&/^\}/{print NR;exit}' \
             apps/ui/app/globals.css)
[ -n "$BOUNDARY" ] || { echo "FAIL: chamber token block not found in globals.css"; exit 2; }
rg -n --no-heading -e 'oklch\(' -e '#[0-9a-fA-F]{6}\b' -e '\brgba?\(' \
  --glob '!*.disabled' --glob '!*.svg' \
  <SCOPE> \
  | awk -v b="$BOUNDARY" -F: '!($1 ~ /globals\.css$/ && $2+0 <= b)'
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
# Boundary found BY SYNTAX at run time. Never a literal line number.
BOUNDARY=$(awk '/^html\[data-mode="chamber"\][[:space:]]*\{/{f=1;next} f&&/^\}/{print NR;exit}' \
             apps/ui/app/globals.css)
[ -n "$BOUNDARY" ] || { echo "FAIL: chamber token block not found in globals.css"; exit 2; }
rg -n --no-heading -e 'oklch\(' -e '#[0-9a-fA-F]{6}\b' -e '\brgba?\(' \
    --glob '!*.disabled' --glob '!*.svg' apps/ui/app apps/ui/lib apps/ui/components \
  | awk -v b="$BOUNDARY" -F: '!($1 ~ /globals\.css$/ && $2+0 <= b)' \
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
# Boundary found BY SYNTAX at run time. Never a literal line number.
BOUNDARY=$(awk '/^html\[data-mode="chamber"\][[:space:]]*\{/{f=1;next} f&&/^\}/{print NR;exit}' \
             apps/ui/app/globals.css)
[ -n "$BOUNDARY" ] || { echo "FAIL: chamber token block not found in globals.css"; exit 2; }
rg -n --no-heading -e 'oklch\(' -e '#[0-9a-fA-F]{6}\b' -e '\brgba?\(' \
  --glob '!*.disabled' --glob '!*.svg' \
  apps/ui/app/globals.css apps/ui/app/layout.tsx \
  apps/ui/components/ModeToggle.tsx apps/ui/lib/debatePresentation.ts \
  | awk -v b="$BOUNDARY" -F: '!($1 ~ /globals\.css$/ && $2+0 <= b)' \
  | wc -l
```

**Baseline 113** (`globals.css` 111 + `debatePresentation.ts` 2;
`layout.tsx` 0, `ModeToggle.tsx` does not exist yet).
**Required after T9-C3: 0.** The `globals.css` exemption covers the token region
itself — where literals ARE the point — and nothing beyond it. Since AM2 that
region is located by SYNTAX at run time (the `BOUNDARY` preamble above), never
by a line number.

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
# Boundary found BY SYNTAX at run time. Never a literal line number.
BOUNDARY=$(awk '/^html\[data-mode="chamber"\][[:space:]]*\{/{f=1;next} f&&/^\}/{print NR;exit}' \
             apps/ui/app/globals.css)
[ -n "$BOUNDARY" ] || { echo "FAIL: chamber token block not found in globals.css"; exit 2; }
rg -n --no-heading -e 'oklch\(' -e '#[0-9a-fA-F]{6}\b' -e '\brgba?\(' \
  --glob '!*.disabled' --glob '!*.svg' \
  apps/ui/app apps/ui/lib apps/ui/components \
  | awk -v b="$BOUNDARY" -F: '!($1 ~ /globals\.css$/ && $2+0 <= b)' \
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
not only by a human running a command. **Its exclusion must be derived the same
way.** The contract the rework worker implements:

```ts
/** Last line of globals.css inside the token blocks (1-indexed, inclusive). */
function tokenBlockBoundary(css: string): number {
  const lines = css.split("\n");
  const start = lines.findIndex((l) => /^html\[data-mode="chamber"\]\s*\{/.test(l));
  if (start === -1) throw new Error("chamber token block not found in globals.css");
  const end = lines.findIndex((l, i) => i > start && /^\}/.test(l));
  if (end === -1) throw new Error("chamber token block is not closed");
  return end + 1;
}
```

The per-line skip becomes
`if (path === globalsPath && lineNumber <= tokenBlockBoundary(css)) continue;`
— replacing the current `index < 199`.

**No fixed line number may remain anywhere** — not in this ADR, not in the shell
oracle, not in the test. And the helper `throw`s rather than falling back: a
boundary the guard cannot find is a broken guard, and a broken guard must stop
the run rather than quietly pass everything or nothing.

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
