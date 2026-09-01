# ADR-006 — Token, mode and contrast claims are checked in jsdom against the real stylesheet

**Status:** ACCEPTED (ARCH-01, 2026-08-31) · mission-local
**Slices affected:** all eight

## The capability, measured rather than assumed

Probed 2026-08-31 against this repo's installed jsdom:

| Probe | Result |
|---|---|
| `getComputedStyle(body).background` where `background: var(--pg)` | `"var(--pg)"` — **jsdom does NOT resolve `var()`** |
| `getComputedStyle(body).backgroundColor` (same) | `"rgba(0, 0, 0, 0)"` — resolves to transparent, i.e. useless |
| `getComputedStyle(documentElement).getPropertyValue("--pg")` | `"#F9F6F1"` — **the declared custom property IS readable** |
| Set `documentElement.setAttribute("data-mode","chamber")`, re-read `--pg` | `"#14110E"` — **attribute-selector cascade IS honoured, live** |
| `getComputedStyle(el).fontFamily` where the value is literal | `"Fraunces, serif"` — resolves |

The consequence decides the whole verification design:

- **Do not** write acceptances of the form "assert the computed background
  colour of the landing hero is `#F9F6F1`". In jsdom that assertion can only
  pass by accident, and it will be written, it will go green on a `var()`
  string, and it will discriminate nothing.
- **Do** write acceptances of the form "assert
  `getPropertyValue('--bg')` on the document element equals the inventory value,
  in each mode". That is a real read of the real stylesheet.

## The proven in-repo pattern

`tests/unit/pda-s03-keyboard-accessibility.test.ts` already does exactly this:
it `readFileSync`s `apps/ui/app/globals.css` (line 36), injects the text into a
jsdom `<style>` (line 80), and reads `getComputedStyle`. The pattern is not
speculative — it ships and it passes today. New token tests lift it verbatim.
This is also the reason ADR-001 keeps the tokens inside `globals.css`: jsdom
does not follow `@import`, so a second file would be invisible to this pattern.

## The shared helper every slice reuses

**Create:** `tests/support/tokenContract.ts`

```ts
/** Loads apps/ui/app/globals.css into a fresh jsdom document. */
export function styledDocument(): { window: Window; document: Document };

/** Reads a declared custom property off <html> for the given mode. */
export function tokenValue(
  win: Window,
  name: `--${string}`,
  mode?: "terracotta" | "chamber"
): string;

/** Every token name declared in the :root block, in source order. */
export function declaredTokenNames(): readonly string[];

/** Token names declared in the html[data-mode="chamber"] block. */
export function chamberTokenNames(): readonly string[];
```

Three assertions this makes cheap, reused by every slice's mode step:

1. **Parity** — `declaredTokenNames()` and `chamberTokenNames()` agree on the
   mode-bearing subset. Catches a token added to one block only, which is the
   defect that produces a single wrong colour in dark mode.
2. **Switch** — `tokenValue(win,'--bg')` !== `tokenValue(win,'--bg','chamber')`.
3. **Value** — each equals its `token-inventory.md` entry.

## Class names and data attributes are a frozen contract

The single largest cost avoider in this mission: **existing CSS class names and
`data-*` attributes in `apps/ui` are not renamed.** New ones may be added.

Because 521 `var()` sites already drive the existing classes, redefining the
token values re-skins the product without touching most markup — and because the
standing tests assert on those class names, not renaming them is what keeps 30
of the 44 test files in the KEEP column (`test-migration.md`). Concretely
protected today: `progressStrip` / `progressTrack` / `progressFillIndeterminate`
(`tests/render/load01-debate-page.test.tsx`), `modelDot`
(`tests/render/ui02d-model-identity.test.tsx`), `tabEmptyHint` and
`.sectionHead[aria-label="Debate library"]`
(`tests/unit/pda-s03-keyboard-accessibility.test.ts`), `optionsToggle`
(`tests/render/ux01-new-debate-form.test.tsx`), `publicationDetails`,
`debateTopControlRow`, `segment`, `drawer`.

A cluster that believes it must rename one has found a genuine conflict and
files it as a finding; it does not rename and repair the tests in the same
breath, because that is how an assertion gets rewritten to match the bug.

## Markers this mission ADDS

New `data-*` markers, so acceptances can name something stable rather than
matching prose. Each is written once, by the cluster named:

| Marker | On | Written by | Proves |
|---|---|---|---|
| `data-mode` | `<html>` | T9-C3 | active mode |
| `data-mode-toggle` | the toggle `<button>` | T9-C3 | the control exists |
| `data-bezel="shell"` / `="core"` | the two card wrappers | T1-C2 | double bezel |
| `data-stance="pro"\|"con"\|"reasoning"\|"root"` | the card root and its top tab | T1-C2 | stance tab |
| `data-connector-stance="pro"\|"con"` | each `<path>` in `canvasLinks` | T1-C2 | connectors carry stance |
| `data-node-review` | drawer review row | already present (`NodeDetailDrawer.tsx:408`) | review verdict / typed absence |
| `data-public-locked="true"` | public banner + each locked control | T3-C3 | actions locked |
| `data-verdict-block` / `data-strongest-case` | public 3b regions | T3-C3 | verdict-first DOM order |
| `data-v2-only="true"` | each V2 control in the options panel | T4-C3 | which fields must not be sent |

`data-stance` on the card root is what makes `T1-C2-1`'s "≥1 PRO and ≥1 CON"
assertion a query rather than a text search, and `data-connector-stance` is what
makes `T1-C2-4` ("PRO vs CON connector tokens differ") checkable in
`renderToStaticMarkup` output without a browser.

---

## Compile-gate law (added 2026-08-31, AM2/C — trigger: `t_4ccac5c4`, finding B1/N5)

### The hole

The mission's packets mandated `pnpm run typecheck` and described it as
"repo-wide". It is not. Root `tsconfig.json`:

```json
"exclude": ["node_modules", "web", "apps/ui", "packages/contract/generated"]
```

**`apps/ui` and `web` are excluded.** `pnpm run typecheck` exits 0 while every
TSX file this mission writes goes uncompiled. That is how `ADR-002`'s
`JSX.Element` contract reached a worker, was implemented faithfully, and shipped
a file that does not compile — with every named gate green.

A gate that cannot open the file it is supposed to guard is not a weak gate; it
is a **reassurance**, and it is worse than no gate because it stops anyone
looking.

### The law

1. **Every acceptance compile gate NAMES the tsconfig it compiles under.** The
   words "repo-wide", "the typecheck", or "tsc passes" are forbidden in an
   acceptance cell. `pnpm run typecheck` is a real gate for `packages/**`,
   `apps/api`, `apps/runner`, `tools/**` and `tests/**` — and for nothing under
   `apps/ui` or `web`.
1b. **Every acceptance compile gate ALSO NAMES THE INVOCATION DIRECTORY**
   (added AM3/B). On this repo the tsconfig does not determine the answer —
   see §"Two compilers" below. **The repo root is canonical** for the 0-new
   gate. A gate that names only its tsconfig is under-specified here.
2. **Every cluster that writes any file under `apps/ui/` additionally runs the
   workspace compile gate**, enforced at **0-new** against the named baseline
   below. This applies to all 32 clusters except the four pure test-migration
   clusters that write only under `tests/`.
3. **The baseline is a named, dated list of exact error lines** — never a count.
   A count silently absorbs a new error the moment an old one is fixed.

### The 0-new command (quote verbatim in packets) — **run from anywhere at or below the pnpm workspace root**

> **CORRECTED 2026-09-01 (AM6/N2).** The previous first line was
> `cd "$(git rev-parse --show-toplevel)"`, annotated *"CANONICAL"*. It was not
> canonical; it was broken, and broken in the worst available direction — see
> the changelog entry below for the measured false green. This block no longer
> depends on the git root at all.

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

**Why an upward walk and not a hard-coded path.** The walk preserves the only
thing the old line got right — the dual-compiler pin from AM3/N9. Run from
`apps/ui`, the walk climbs to the workspace root, so the gate always resolves
the ROOT compiler. Measured in this edit:

```
from workspace root:                       Version 7.0.2
from apps/ui, with NO walk (the old trap): Version 5.9.3
```

**Why step 2 exists.** Step 1 catches the wrong *directory*. Step 2 catches the
wrong *toolchain* — any state where `pnpm exec` cannot start a compiler. Without
it, every failure mode of the runner still reaches `grep -E 'error TS'`, matches
nothing, and prints the required `0`. **The filter that makes this gate readable
is the same filter that hides a harness failure**, so the harness has to be
proven separately. That is the general lesson, not a detail of this one command.

`tee /dev/stderr` is deliberate: when the gate fails, the failing lines must be
in the log, not just a number. A gate that prints only `1` sends the next seat
back to re-run it.

**Runs, this edit, four directories:**

```
=== cwd: /Users/vladmihaimiron/Documents/DebateAIRO            (git toplevel — the OLD block's target)
GATE FAIL: no pnpm workspace root at or above /Users/vladmihaimiron/Documents/DebateAIRO (looked for apps/ui/tsconfig.json)
    rc=2
=== cwd: /tmp                                                  (outside the repo entirely)
GATE FAIL: no pnpm workspace root at or above /tmp (looked for apps/ui/tsconfig.json)
    rc=2
=== cwd: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
       0
    rc=0
=== cwd: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/apps/ui
       0
    rc=0
```

**Discrimination proof — a gate that only ever prints 0 proves nothing.** The
same pipeline with the baseline filter removed, from the workspace root:

```
$ pnpm exec tsc --noEmit -p apps/ui/tsconfig.json 2>&1 | grep -E 'error TS' | wc -l
       2
```

Two lines in, two filtered, residual 0. The compiler ran and produced output;
the zero is a result, not an absence.

### The baseline — TWO pre-existing errors, not one

Measured 2026-08-31 by ARCH-01 on the tree at `55b18ee`:

| # | Error | Pre-existing? | Owner |
|---|---|---|---|
| 1 | `app/debate/[id]/DebatePageClient.tsx(<line>,11): error TS2322` — line-agnostic since AM12b; was `(1488,11)`, now `(1490,11)` — `AnswerExport` union mismatch | yes — file last touched at `3705955`, long before this mission | PDA lane, ticket `t_d9066400` |
| 2 | `app/layout.tsx(3,8): error TS2882` — *Cannot find module or type declarations for side-effect import of `./globals.css`* | **yes** — `import "./globals.css"` is byte-identical at `55b18ee^`, and `web/app/layout.tsx:3` carries the same line | unowned; see below |

> **DISCREPANCY WITH THE AM2 PACKET, reported rather than papered over.**
> The packet states *"The only baselined error is
> `app/debate/[id]/DebatePageClient.tsx(1488,11) TS2322`"*, and the Wave-0
> reviewer recorded *"layout.tsx CLEAN"*. **Both are wrong on this tree.** The
> workspace typecheck emits **three** `error TS` lines, and only one of the three
> is B1. Baselining just the packet's single error would leave the gate returning
> 1 forever — an unsatisfiable acceptance, i.e. the AF-1 defect a third time, and
> the very thing this amendment exists to stop. Evidence:
>
> ```
> $ pnpm exec tsc --noEmit -p apps/ui/tsconfig.json 2>&1 | grep -c 'error TS'
> 3
> ```
>
> **RE-MEASURED 2026-09-01 (AM6) on the tree at `3aefb2d`: the count is now 2,
> and the drop is explained, not shrugged at.** The third line at `55b18ee` was
> `components/ModeToggle.tsx(7,31): error TS2503` — the AM2/A defect this ADR's
> own changelog records. `git ls-tree 55b18ee apps/ui/components/` confirms
> `ModeToggle.tsx` existed on that tree, and `git log` shows it repaired at
> `94c3bcf` (*"T9-C3 rework round 1 — React19 JSX contract"*). Both dated
> measurements are correct for their date; the baseline filter's two patterns
> are unchanged and residual is 0 either way, so no gate moves.

**Why error 2 is structural, not environmental.** `next/types/global.d.ts` in
next 15.5.23 declares `*.module.css`, `*.module.sass` and `*.module.scss` — but
**not plain `*.css`**. A side-effect `import "./globals.css"` therefore has no
type declaration to find, in any environment, built or unbuilt.

**Its permanent fix is one file and it is NOT taken here.** A three-line
`apps/ui/types/css.d.ts` (`declare module "*.css";`) removes it for good. That is
new product code and new scope; this amendment is bounded to ARCH documents. It
is therefore **baselined and routed** — the orchestrator should ticket it, and
when it lands, the baseline drops to one line. Filing it as a baseline entry
rather than silently is the whole point: a baselined error is visible and dated;
an unbaselined one that everybody has learned to ignore is not.

### What this gate does and does not catch

**Catches:** any type error newly introduced into `apps/ui` by any cluster —
including exactly B1, which every other gate in this mission was blind to.

**Does not catch:** a runtime failure that type-checks; the `next build` step
itself (which also runs bundling and route collection); or a type error in
`web/`, which no gate in this mission opens at all. `web/` is out of contract
(`open-questions.md` Q-02) and its compile status is deliberately not this
mission's claim.

### Two compilers (added 2026-08-31, AM3/B — trigger: `t_4ccac5c4` REV2 finding N9)

**This repository contains two TypeScript compilers, and `pnpm exec` resolves
whichever is nearest the working directory.** Measured 2026-08-31:

```
$ pnpm exec tsc --version                       # from the repo root
Version 7.0.2
$ (cd apps/ui && pnpm exec tsc --version)       # from the workspace
Version 5.9.3
```

Declared: root `package.json` pins `typescript: 7.0.2`; `apps/ui/package.json`
pins `typescript: ^5.6.0`, resolved to 5.9.3.

**Same tsconfig, same tree, different compiler, different answer:**

```
$ pnpm exec tsc --noEmit -p apps/ui/tsconfig.json | grep -c 'error TS'          # root, TS 7.0.2
2      # apps/ui/app/debate/[id]/DebatePageClient.tsx(1488,11) TS2322
       # apps/ui/app/layout.tsx(3,8)                            TS2882

$ (cd apps/ui && pnpm exec tsc --noEmit -p tsconfig.json | grep -c 'error TS')  # workspace, TS 5.9.3
1      # app/debate/[id]/DebatePageClient.tsx(1488,11) TS2322
```

TypeScript 7 reports the unresolved side-effect import of `./globals.css` as
**TS2882** by default; 5.9.3 does not report it at all, and under
`--noUncheckedSideEffectImports` reports it as **TS2307** — a third code for the
same condition.

Note the **error paths differ too**: `apps/ui/app/…` from the root,
`app/…` from the workspace. The published filter clauses are substring matches
that survive both shapes, but any future clause anchored with `^` would not.

**Consequences that are now law:**

- The **TS2882 baseline clause is load-bearing under the canonical compiler.**
  Dropping it makes the 0-new gate return **1**, not 0 — verified. It is not a
  phantom.
- A seat that runs `pnpm --filter ui typecheck` — the workspace's own script, and
  the natural thing to reach for — gets a **different compiler and a different
  baseline** than this gate. That is not an alternative way to run the gate; it
  is a different gate.
- **This is why "name the tsconfig" was necessary but not sufficient.** AM2 fixed
  the gate that could not open the file. AM3 fixes the gate that opens the file
  with a compiler nobody named.

**Correcting the record, and crediting it.** AM2/C recorded that the Wave-0
reviewer's round-0 note "layout.tsx CLEAN" was wrong. It was not carelessness:
the reviewer ran from inside `apps/ui`, where TS 5.9.3 genuinely reports nothing
for that line. Under its compiler the observation was correct. The reviewer found
and published this itself, against its own earlier verdict. The dual-compiler
split is recorded in `.hermes/TOOLING-TRAPS.md` by the orchestrator; this ADR
references it and does not restate it.


---

## Changelog

### 2026-09-01 — AM6/N2: the published 0-new gate was broken run verbatim, and it failed by printing the required answer (trigger: T9-C1 blind review, `t_4487f9b1` verdict 00:26, finding N2)

**What was wrong.** The block opened with
`cd "$(git rev-parse --show-toplevel)"`, which I annotated **CANONICAL**. This
repository's git toplevel is `DebateAIRO/` — the **parent** of the pnpm
workspace. There is no `package.json` and no `apps/` there. Measured:

```
$ cd "$(git rev-parse --show-toplevel)" && pnpm exec tsc --noEmit -p apps/ui/tsconfig.json 2>&1
[ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE] No package found in this workspace
```

That message is on stderr, the block merges stderr into the pipe with `2>&1`,
and `grep -E 'error TS'` does not match it. So the full published block, run
verbatim from a seat's normal cwd, does this:

```
$ sh ./published-block.sh          # cwd = the workspace root
       0
  block rc=0
```

**`0` is the required value.** A seat quoting the gate verbatim, in good faith,
gets a pass having compiled nothing. Thirty clusters still have to run it.

**Why this is worse than an ordinary bug.** A gate that errors is a nuisance; a
gate that reports success while doing nothing is an *anti-gate* — it converts
every downstream cluster's compile evidence into a fabrication that nobody
committed. It is the exact class recorded in `.hermes/TOOLING-TRAPS.md`
(2026-08-29), which I wrote a compile-gate law for in AM2 and then instantiated
wrongly. AM2's law said *name the invocation directory*; I named one, and never
ran the command from it.

**Why no one caught it for four amendments.** Everyone — including me, including
the Wave-0 reviewer, including the T9-C1 worker — ran the *pipeline* from the
project root, where it works, rather than the *block*, whose first line moves
you somewhere else first. The reviewer's own prediction says so: *"I expect
ADR-006's broken `cd` went unnoticed, because everyone runs the gate from the
project root where it works, and nobody runs the published command verbatim."*
That prediction is the finding. **Publishing a command is claiming you ran it as
published**, and for this block I had not.

**Fixed** with an upward walk to the directory that actually holds
`apps/ui/tsconfig.json`, a fail-loud guard (`exit 2`), and a compiler-liveness
probe, all shown running from four directories above — two that must fail and
two that must pass — plus a discrimination proof that the zero is a result and
not an absence.

**Standing rule this produces, and it generalises past this gate.** *Any command
this or any other ARCH document publishes must be executed **as published, from
a directory a seat would plausibly be in**, before it is published.* Running the
idea of the command is not running the command. Where a gate's output is a
count, the run must also show the count moving — a gate only ever observed
printing its pass value has not been shown to be a gate.
### 2026-09-01 — AM12b/item 2: the gate was RED on a pre-existing error, and the fix is to stop pinning line numbers (trigger: `t_47057270`)

**Measured at the start of this amendment — the published gate was failing:**

```
$ <the published block, as printed above this amendment>
       1
```

T1-C1's rewrite moved the PDA-owned `AnswerExport` diagnostic from
`(1488,11)` to `(1490,11)`. Same file, same code, same message, count still 1 —
but the `grep -v` pinned the coordinates, so the baselined error stopped being
filtered and **every cluster running the gate would have failed on somebody
else's pre-existing defect.** That is the mirror of AM6's anti-gate: AM6's gate
passed while compiling nothing; this one failed while nothing was wrong.

**Decision: the filter is permanently LINE-AGNOSTIC, and the count is pinned.**
Three more T1 clusters write near that line and each may shift it again;
re-anchoring by hand every time is a standing tax that will be paid late, in a
red gate, by whichever seat happens to run next.

**Line-agnostic alone would be a loosening**, so it is not shipped alone. A bare
`grep -v '…DebatePageClient\.tsx\([0-9]+,[0-9]+\): error TS2322'` would silently
absorb a *second*, genuinely new TS2322 in that file. The count pin closes it —
verified in this edit:

```
today (1 baseline)             count = 1 -> pass
baseline + a NEW regression    count = 2 -> GATE FAIL: baseline TS2322 count is 2, expected exactly 1
```

So the gate now fails loudly in three separate ways — wrong directory, dead
toolchain, and baseline drift — and its `0` still means "compiled, and nothing
new". Both copies were corrected: this ADR and `dispatch-order.md`'s acceptance
defaults.

### 2026-09-01 — AM13/N10: nothing type-checks `tests/**/*.tsx`, and the obvious fix is the wrong one (trigger: CODE-T1C2-REV2, `t_bef5e6da`)

**RULING: WIRE IT — but into the `apps/ui` project, not the root one.** The
charge's default reading (add `tests/**/*.tsx` to the root `include`) is refused
on a measurement, and the reason is the whole finding.

**The hole, structurally.** Root `tsconfig.json` includes `tests/**/*.ts` and
**excludes** `apps/ui`. `apps/ui/tsconfig.json` includes `**/*.ts` and
`**/*.tsx` — but its globs are relative to `apps/ui/`, so repo-root `tests/`
is outside it entirely. **23 `.tsx` test files are compiled by no project**, and
a planted type error in one passes both published gates. AM12a's stated safety
net for the contract-bound fixture type — *"goes red at compile time"* — is
therefore not wired for `.tsx` call sites. The binding is still right
(`AnswerSchema.parse` catches drift at runtime); the **net was illusory**, and I
wrote that sentence.

**Why the root include is the wrong home — baseline sweep, run first as charged:**

| Project context | Diagnostics | Character |
|---|---|---|
| **root** `tsconfig.json` + `tests/**/*.tsx` | **325** | 172 are `TS2307 Cannot find module` for `react`, `react-dom/client`, `next/link`, `@/lib/*` — artefacts of a project that excludes `apps/ui` and has no `@/` mapping, no React types, no JSX setting |
| **`apps/ui`** `tsconfig.json` + `tests/**/*.tsx` | **12** | real diagnostics |

The render tests import `apps/ui` components; they belong to the project that
knows how to resolve them. Adding them to the root include would produce a
325-line wall of module-resolution noise, and the seat that had to baseline it
would baseline the noise — re-creating AM3/N9's dual-compiler defect from the
other end.

**The baseline to carry, measured (12 diagnostics), classified rather than
dumped:**

| Class | Count | Disposition |
|---|---|---|
| `DebatePageClient.tsx(<line>,11) TS2322` | 1 | already baselined above — the PDA-owned `AnswerExport` union |
| `TS2724 '"next/navigation.js"' has no exported member 'setPathname'` in `auth-flow-integration`, `t3-library`, `web-auth-login` | 3 | **not a defect — fix by config.** `vitest.config.ts` aliases `next/navigation` to `tests/render/stubs/next-navigation.ts`, where `setPathname` exists; `tsc` has no such alias. The gate's tsconfig must mirror vitest's aliases via `paths`, or these three are false reds |
| `TS7016` — no declaration file for `jsdom` (`s10-erasure-ui-render`) | 1 | dependency: add `@types/jsdom`, or baseline it |
| genuine strictness findings — `ux01-new-debate-form` (TS2322 ×2, TS18046 ×3), `s10-erasure-ui-render` TS2322, `s5-session-controls` TS2769 | 7 | **fix or baseline individually, each with a stated reason.** These are real |

**The gate this becomes — per this ADR's own gate law (name the config, the
gate, and the invocation directory):**

- **Config:** a new `tsconfig.tests.json` at the workspace root that `extends`
  `apps/ui/tsconfig.json`, sets `include: ["../../tests/**/*.tsx"]` (or an
  equivalent rooted glob), and mirrors `vitest.config.ts`'s aliases in `paths`
  so the harness stubs resolve the way they resolve at run time.
- **Which gate:** it joins the existing **0-new compile gate** as a second
  `-p` invocation, under the same fail-loud guards (workspace-root walk,
  `pnpm exec tsc --version` liveness) and the same line-agnostic, count-pinned
  baseline discipline. One gate, two projects — not a second gate a seat can
  forget.
- **Invocation directory:** the pnpm workspace root, resolved by the upward walk
  already published above. Unchanged.

**Owner: routed row R-4.** The tsconfig is a config file and this amendment
writes none — ARCH names the gate, a worker wires it. It is **systemic, not
T1-C2's**: every render-test pin in the mission has been unchecked, so it does
not belong to whichever cluster happened to surface it.
