# CODE-T9C2-N1 — two regression rows (ticket t_091db288, addendum to closed T9-C2)

Same codex seat, same session (01a05a3c). T9-C2 PASSED; this is the reviewer's named N1
remedy, fail-closed direction, two rows, no product change.

## Supersessions in force
T9-C2-2 narrowed (AM8); T9-C2-5 folded into the §2 mechanism of your original packet (N2).

## The charge
In `tests/unit/t9-return-path.test.ts` add exactly two accepted-case rows pinning the ?/#
path-part clause:
1. `safeReturnPath("/new?x=1")` returns `"/new?x=1"` UNCHANGED.
2. `safeReturnPath("/public/debate/abc-123?from=share")` returns it UNCHANGED.
Reproduce-first: apply reviewer mutant M8 (delete the ?/# path-part extraction, validate the
raw whole) — current suite stays green (the defect); with your rows, M8 RED. Then M9 (return
the validated `path` instead of `raw`) — RED under row 1. Revert both, SHA-proof.

## Acceptance
Row-4 command 1x green (96/96 expected); the two mutant RED runs pasted; file SHA before/
after recorded. Writes: that one test file + "N1" append to your self-report + board
comments on t_091db288. No git.

## Handoff
Final comment on t_091db288: `ADDENDUM COMPLETE` + RED evidence + `SKILLS LOADED:` +
`comments read through:`. Return control at that handoff; keep the session resumable.
