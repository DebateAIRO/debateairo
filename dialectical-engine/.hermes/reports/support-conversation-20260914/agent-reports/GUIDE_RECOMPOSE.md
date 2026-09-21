# GUIDE_RECOMPOSE self-report

## SKILLS LOADED

Retained actual BODY reads from the original Sol author session: `superpowers:using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`, `superpowers:receiving-code-review`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion`. This read-only node bound immutable inputs, ran each required command exactly once, and preserved the typecheck delta instead of fixing or repeating it.

## Result

- Node/ticket/session: `GUIDE_RECOMPOSE` / `t_81f12de2` / `/root/requirements`
- Revision: `8fb8e407b350f9950cdb27a0f4caaf8e178d7cb6`
- Union: 33/33 files; 1,496 passed; 1 todo
- Typecheck: rc1; 95 diagnostics versus 76 baseline; exact +19/−0 across six paths
- Evaluation: three runs at 60/60; rubric and verdict remain `PENDING`; rc1 by design
- Snapshot: 44 records, KB `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Product: clean and unchanged; heavy lease released

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The behavioral composition is now coherent: the exact 33-file union passes after two small corrections. The remaining blocker is mechanical type debt introduced across several prior guide increments. Focused runtime tests did not expose it because Vitest transpiles without requiring whole-program TypeScript compatibility.

The upgrade is to make an attributed typecheck part of every author boundary that changes TypeScript, not only final composition. Compare diagnostics against the frozen intake baseline immediately after each commit and route only the new lines. That would have localized the six files when each change landed.

Repeated token cost came from rediscovering command membership, hashes, snapshot shape, and baseline attribution. A typed mission runner should generate the suite receipt, snapshot receipt, diagnostic delta, per-case evaluation table, and artifact receipt from one manifest. It should also reject prose counts that conflict with machine evidence, as happened with the requested seven paths versus the measured six.

A stronger one-prompt workflow would maintain a command frontier: execute each stable check once, save its revision binding, route the smallest correction, and resume only invalidated checks. It should separate behavioral evidence from type-only follow-up so a later commit never relabels earlier green results. Independent review and owner acceptance remain explicit gates.

Limit: typecheck remains blocked by 19 new diagnostics. This node makes no readiness or checkpoint claim.
