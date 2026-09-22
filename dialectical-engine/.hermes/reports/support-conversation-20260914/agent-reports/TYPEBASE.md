# TYPEBASE case file — inherited TypeScript diagnostics

## Question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — typecheck debt was not frozen with the original baseline

**Cause.** BASE froze the intended product/test bytes and ran the focused 432-test Support suite, but full `pnpm run typecheck` was outside that earlier node. When PREVIEW later failed typecheck outside its owned files, there was no executed baseline frame to attribute the failures safely. `packets/TYPEBASE.md:19` therefore required a second detached checkout of the same `b7ca2c41` baseline.

**Price.** One extra 5,104-file checkout, a local clone of the 923 MB root dependency tree plus 31 workspace trees, contract generation, one typecheck, and cleanup. Measured tool wall times were 4.8 s checkout, 6.5 s dependency copy, 5.7 s contract generation, 2.5 s typecheck, and 7.0 s cleanup. Actual model-token usage is **UNAVAILABLE**.

**Upgrade.** Every product baseline should capture full typecheck once alongside its focused tests. Store normalized diagnostic tuples as a first-class baseline artifact so later clusters compare against data rather than rerunning historical state.

## Finding 2 — all 76 PREVIEW-final diagnostics are inherited

**Cause.** The unchanged baseline itself exits `rc=1` with 76 TypeScript diagnostics across 23 files. After replacing only the two checkout prefixes inside diagnostic messages, 73 PREVIEW-final tuples match baseline file/line/column/code/message exactly. The remaining 3 have the same file/code/message and moved by exactly 20 lines in `tests/unit/dev-cli-provider-panel.test.ts`. There are zero introduced and zero baseline-only tuples.

**Price.** Without this measurement, PREVIEW could be charged with repairing unrelated observability, evaluator, register-publication and legacy UI debt. That would expand scope across 23 files and destroy ownership boundaries. The tuple comparison took one parser invocation plus one JSON validation pass. Actual token usage is **UNAVAILABLE**.

**Upgrade.** Gate clusters on diagnostic set difference. Match exact tuples first, then permit moved-line attribution only when file, TypeScript code and normalized message all match. Filename-only inheritance claims must remain invalid.

## Finding 3 — the baseline debt is concentrated and classifiable

The 76 errors break down as: TS2741 ×34, TS2339 ×23, TS2353 ×4, TS2307 ×4, TS2322 ×3, TS2694 ×3, TS18046 ×2, TS7006 ×2 and TS2345 ×1. The largest file concentrations are `register-support-publication.test.ts` ×15, `sup-04-mounts.test.ts` ×9, `obs-agent-01-discovery.test.ts` ×8 and `s14-ui.test.ts` ×8. These are evidence for separately owned cleanup, not authorization to repair them in Support PREVIEW.

## Near misses and dead ends

- Reading BASE initially used a misspelled working directory and failed before reading anything. The corrected bounded reads succeeded; no file changed.
- The prior PREVIEW log contains absolute CP1 dependency paths inside TypeScript namespace messages. A raw string comparison would falsely report differences. The parser normalized only the CP1 and TYPEBASE checkout prefixes to `<CHECKOUT>`.
- A second typecheck would have made the result look more reassuring but violated the one-run packet. Only one actual baseline typecheck was executed.
- The heavy lease was released immediately after capture, before tuple parsing and worktree cleanup, so NAV could continue without waiting on light work.

## One-prompt machine upgrade

Extend the BASE artifact schema with `{command, rc, diagnostics[]}` for typecheck. Each tuple should carry file, line, column, code, normalized message and source commit. A later cluster submits only its final log; a standard comparer returns exact inherited, moved-line inherited, introduced and baseline-only multisets. This turns attribution into one deterministic command and prevents agents from spending prompts debating whether a filename-level resemblance is enough.

## Measurements

- Baseline: detached `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`, clean tracked tree before and after.
- Setup: 1,108 dependency symlinks; 0 outside the diagnostic checkout; 0 broken; contract generation `rc=0`.
- Typecheck: exactly one `pnpm run typecheck`, `rc=1`, 76 diagnostics in 23 files.
- PREVIEW-final attribution: 73 exact inherited; 3 same-defect moved-line inherited; 0 introduced; 0 baseline-only.
- Diagnostic checkout and cloned dependencies removed; source and sibling product refs remained unchanged.
- Tests/build/install/network/services: none.
- Actual model-token usage: **UNAVAILABLE**.
