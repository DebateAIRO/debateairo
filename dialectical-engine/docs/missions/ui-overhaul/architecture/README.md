# ARCHITECTURE — ui-overhaul (ARCH-01, Claude Opus 5)

The HOW for the eight designed TURN sections. The WHAT is each slice's frozen
`SPEC.md`; this directory never restates it and never overrides it.

| File | What it settles |
|---|---|
| `token-inventory.md` | Every CSS custom property, both modes, with the exact value and its provenance in the design bundle |
| `ADR-001-token-surface.md` | Where the tokens live and why not a separate `tokens.css` |
| `ADR-002-mode-mechanism.md` | `html[data-mode]`, persistence, SSR-flash avoidance, where the ☾ control mounts |
| `ADR-003-landing-route-split.md` | Anonymous `/` vs signed-in `/`, and the branch predicate |
| `ADR-004-auth-return-path.md` | `?next=` contract and its open-redirect allow-list |
| `ADR-005-contrast-pins.md` | The measured contrast floors that replace the word "readable" |
| `ADR-006-ui-test-contract.md` | How token/mode/contrast claims are made mechanically checkable without a browser |
| `component-map.md` | Design element → existing component, per slice: re-skin / structural / net-new |
| `test-migration.md` | All 44 standing test files that read `apps/ui`, classified KEEP / RETARGET / REPLACE |
| `dispatch-order.md` | The 32 clusters in dependency order, one Codex seat each, with the runnable verification command |
| `open-questions.md` | Questions ARCH proposes and V ratifies — one owner each |

## The three facts that shaped every decision

1. **`apps/ui` already has a semantic token layer.** `apps/ui/app/globals.css`
   declares 69 custom properties in `:root` and the stylesheet consumes them
   521 times against 120 hard-coded colour literals. The overhaul is a
   *redefinition* of that layer plus a second mode — not a new design system.
   Measured 2026-08-31:
   `grep -oE 'var\(--[a-z0-9-]+' apps/ui/app/globals.css | wc -l` → 521;
   hard-coded literals outside `:root` → 120.
2. **jsdom in this repo resolves custom properties and attribute selectors.**
   `getComputedStyle(root).getPropertyValue('--page')` returns the declared
   hex, and setting `data-mode="chamber"` on `<html>` re-cascades it. It does
   NOT resolve `var()` in ordinary properties. `tests/unit/pda-s03-keyboard-accessibility.test.ts`
   already injects the real `globals.css` into jsdom and reads computed style,
   so the pattern is proven in-repo. See `ADR-006`.
3. **44 standing test files reference `apps/ui`, not 18 — and 17 of them read it
   as raw source text.** The SPECs' `tests/render/**` framing names 18 files /
   78 tests; only 15 of those 18 touch `apps/ui` at all. Twenty-six further
   files under `tests/unit/` and `tests/architecture/` read the same surfaces,
   **17 of the 44 via `readFile`/`readFileSync`** — so a JSX restructure can
   break them regardless of behaviour. Worse, the three remaining render files
   (`web-auth-*`, 12 tests) import `web/`, the application this mission does not
   ship. See `test-migration.md`: that asymmetry is the mission's sharpest trap
   and none of it is visible from the SPECs alone.
