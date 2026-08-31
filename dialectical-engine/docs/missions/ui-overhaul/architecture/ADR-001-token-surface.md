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

## The 120 hard-coded colour literals

`globals.css` contains 521 `var(--…)` references and **120 colour literals
outside `:root`** (`oklch()`, `#hex`, `rgb()`/`rgba()`). Measured 2026-08-31:

```
sed -n '101,4080p' apps/ui/app/globals.css | grep -oE 'oklch\([^)]*\)|#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)' | wc -l   # 120
sed -n '101,4080p' apps/ui/app/globals.css | grep -oE 'var\(--[a-z0-9-]+' | wc -l                                    # 521
```

Those 120 are the **class**, not a list of instances: every one of them is a
colour that will not respond to the mode switch and will therefore be wrong in
Chamber. They are swept as a single step in T9-C3 (`T9-C3-4`), each replaced by
a token or, where no token fits, promoted to a new token declared in both
blocks. The acceptance is the count going to zero, not a spot check — a residual
literal is a Chamber bug that only appears in dark mode, i.e. exactly the kind
that ships.

Two further members of the same class live outside `globals.css` and are swept
in the same cluster:

- `apps/ui/lib/debatePresentation.ts:268` — `"oklch(0.82 0.006 80)"`, the
  connector colour for `empty`/`abandoned` paths. Becomes `var(--line-strong)`.
- `apps/ui/components/DebateCanvas.tsx:320` — inline `color: "var(--text-2)"`
  is already a token; no change. Named here so the sweep is checkable as
  `N of N` rather than "spot-checked".

Sweep command, to be run and quoted verbatim by the T9-C3 worker:

```
rg -n --no-heading -e 'oklch\(' -e '#[0-9a-fA-F]{6}\b' -e 'rgba?\(' \
  apps/ui/app/globals.css apps/ui/lib apps/ui/components apps/ui/app \
  | grep -v -E 'globals\.css:[1-9][0-9]?:|globals\.css:1[0-9][0-9]:'
```
