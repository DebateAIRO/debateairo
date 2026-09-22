# CODE-REV-S02-C1C2 r2 — probe kit (re-run instructions)

Every file here is LANE-INDEPENDENT: it takes the lane as `$1` / `argv[1]` (the r1 kit
hard-coded `.worktrees/rev-s02-c1c2/…`, which forced the author to edit a promoted probe —
`CODE-S02-C1C2-REWORK-R1` F6, and my N7).  `LANE` = the directory holding `package.json`.

    LANE=/…/.worktrees/<yours>/dialectical-engine

1. `code-rev-s02-c1c2-r2-cluster.sh` — the PLAN §Clusters `run` idiom (S02/PLAN.md:1376-1388),
   both cluster commands ×3.  `/bin/bash code-rev-s02-c1c2-r2-cluster.sh "$LANE"`
   At `06ab1da4`: `S02-C1 … Tests 17 passed (17)` · `S02-C2 … Tests 6 passed (6)`, VERDICT=0.

2. `code-rev-s02-c1c2-r2-mutants.py` — 19 mutants against the CLUSTER'S OWN suite: the ten
   round-1 mutants (r1 verdict §5.7) plus four B1-class and five N1-class.  Each is applied to
   a pristine byte copy, run, restored with `git checkout HEAD --`, and the restore is asserted
   byte-identical.  `python3 code-rev-s02-c1c2-r2-mutants.py "$LANE"`
   At `06ab1da4`: **KILLED 16 / 19**.  The three survivors are expected and explained in the
   verdict (`MB1c` is logically equivalent; `MN1b`/`MN1c` overlap — see 4 below).
   Output as I measured it: `code-rev-s02-c1c2-r2-mutants.out`.

3. `code-rev-s02-c1c2-r2-focusability.probe.tsx` (W1) — enumerates every element the PINNED
   `FOCUSABLE_SELECTOR` admits, `isFocusCandidate` keeps, and jsdom 30.0.1's `focus()` then
   REFUSES.  Answer at `06ab1da4`: **exactly one — a control inside `<fieldset disabled>`**.
   This refutes "in jsdom no element exists that passes the filter and refuses focus()".

4. `code-rev-s02-c1c2-r2-advance-loop.probe.tsx` (W2) + `-advance-loop-discriminates.sh` —
   the pin W1 makes possible.  `/bin/bash code-rev-s02-c1c2-r2-advance-loop-discriminates.sh "$LANE"`
   A. shipped module -> `Tests 1 passed (1)`, `W2 Tab from close -> activeElement = next-real`
   B. advance loop removed (MN1c) -> `Tests 1 failed (1)`, `W2 … activeElement = close`
   i.e. Tab is a DEAD KEY.  This is my N5's BINDING measurement.

5. `code-rev-s02-c1c2-r2-surface.py` — my own byte-level exported-surface check across the fix
   commit and against the PLAN's fenced contract block, with three working discriminators.
   `python3 code-rev-s02-c1c2-r2-surface.py <worktree root, i.e. LANE/..>`

The r1 kit (`code-rev-s02-c1c2-r1-*`) is byte-untouched; copy its three `*.probe.tsx` files and
`-probe.vitest.config.ts` into `<LANE>/.review-scratch/` (renamed to `esc-stack.probe.tsx`,
`nesting.probe.tsx`, `remount.probe.tsx`, `probe.vitest.config.ts`) and run
`pnpm exec vitest run --config .review-scratch/probe.vitest.config.ts`.
At `06ab1da4`: `Tests 29 passed (29)` · `Test Files 3 passed (3)`.
With `const top = topmostSurface()` replaced by `surfaceStack[surfaceStack.length - 1]`
(the round-1 implementation): `Tests 2 failed | 27 passed (29)`.
NOTE: keep any probe of your own OUT of `.review-scratch/**/*.probe.tsx` while measuring
those two strings, or the config's glob folds your files into the count.

6. `code-rev-s02-c1c2-r2-detached.probe.tsx` (W3) — `topmostSurface()`'s one unpinned branch:
   a registered surface whose `containerRef.current` is non-null but DETACHED.
   Measured at `06ab1da4` (jsdom 30.0.1 / React 19):
   `W3a rel=37  DISCONNECTED=true FOLLOWING=true  -> topmostSurface()'s 'above' test = true`
   `W3b {"callback-no-return":"null (safe)","callback-with-cleanup":"NON-NULL, isConnected=false","object-ref":"null (safe)"}`
   i.e. a consumer using React 19's cleanup-returning callback ref keeps a stale detached node
   in the ref, and the module then treats that surface as topmost.  My N7.
