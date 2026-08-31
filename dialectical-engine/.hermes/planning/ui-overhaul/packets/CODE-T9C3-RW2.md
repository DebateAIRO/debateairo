# CODE-T9C3-RW2 — rework round 2 of 3 (tickets t_4ccac5c4 + t_cd43b1f2)

Same codex seat, same session. REV2 CONFIRMED all four of your round-1 fixes ("the
best-disciplined rework I have reviewed in this mission") and then escalated past them: the
exclusion you implemented from ADR-001's AM2 contract is syntax-BOUND but still a one-sided
PREFIX, and the token region is TWO intervals. Once again the ADR was the source and you were
not at fault; ADR-001 is now amended (AM3). One finding this round, one file to change.

## 0. Read order
1. This packet.
2. The REV2 verdict on t_4ccac5c4 (comment 21:55) — the B2 section with mutants M4/M5/M6.
3. Amended `docs/missions/ui-overhaul/architecture/ADR-001-token-surface.md` (AM3 changelog)
   — the range-pair contract you implement.
Skills floor: unchanged from RW1. Open your handoff with `SKILLS LOADED: <list>`.

## 1. F-B2 — exclusion becomes RANGE-PAIR MEMBERSHIP
Why your RW1 fix was not enough (not your defect): `lineNumber <= tokenBlockBoundary(css)`
exempts everything from line 1 to the end of the LAST token block. The token region is
`:root` (5–72) PLUS chamber (74–114); the banner above, the gap between, and — after a legal
relocation of the chamber block to EOF — the entire file, all fall inside the prefix.
Reviewer mutants, each GREEN on the current tree:
- **M4**: `.appShell { background: #FF00FF; }` at the gap line between the two blocks.
- **M5**: same literal above `:root`, inside the comment banner.
- **M6**: the chamber block moved to EOF (semantically legal — specificity beats source
  order), then the literal at its old position → computed boundary swallows the whole file.
Implement the amended ADR-001 helper contract in `tests/unit/t9-mode-tokens.test.ts`,
verbatim (ADR-001 §"The contract the rework worker implements", post-AM3):
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
`if (path === globalsPath && isInsideTokenBlocks(lineNumber, ranges)) continue;`
replacing RW1's `lineNumber <= tokenBlockBoundary(css)`. A line is exempt iff it lies INSIDE
one of the returned ranges. No prefix comparison, no fixed numbers.
(Orchestrator verified pre-dispatch: real-tree RANGES=5,72,74,114; wave-0 oracle residual 0.)

## 2. Reproduce-first (per mutant, the RW1 discipline exactly)
For EACH of M4, M5, M6: apply it, show the CURRENT acceptance stays green (the defect), then
with your new range logic show RED naming the planted line, revert, show GREEN. Keep M2 RED
(re-run it once under the new logic) and re-run your two boundary-adjacent neighbor controls
(non-colour declaration below the region; benign edit) to prove no over-fire. Transient
mutant surface: `apps/ui/app/globals.css` only, zero net change at handoff.

## 3. File contract (writes)
- `tests/unit/t9-mode-tokens.test.ts` — the only product-adjacent write.
- `.hermes/reports/ui-overhaul/agent-reports/CODE-T9C3-codex.md` — append "RW2" section.
- Board comments on t_4ccac5c4. Nothing else. No git commands.

## 4. Acceptance at handoff
1. Focused acceptance (same two test files) 3x, worst run counts — all green (13 tests, or
   more if the range logic adds assertions).
2. M2, M4, M5, M6 each demonstrably RED under the new logic (paste the four red runs);
   neighbor controls GREEN; all reverted, `git diff HEAD -- apps/ui/app/globals.css` empty.
3. ADR-006 0-new compile gate FROM THE REPO ROOT (N9 law: the invocation directory is part
   of the gate; root tsc 7.0.2 is canonical): 0.
4. `pnpm exec vitest run tests/render` — 18 files / 78 tests green.
5. Syntax-derived range check on the REAL file: hits=0 (no false positive on clean tree).

## 5. Handoff
Final board comment on t_4ccac5c4 (LAST write, freeze law): `REWORK READY FOR HERMES REVIEW`
+ F-B2 evidence rows (M4/M5/M6 green-then-RED, M2 still RED, neighbors GREEN), §4 gate
outputs, `SKILLS LOADED: <list>`, `comments read through: <timestamp>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
