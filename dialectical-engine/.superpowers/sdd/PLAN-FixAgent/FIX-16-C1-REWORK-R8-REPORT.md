# FIX-16 C1 rework round 8 report

Date: 2026-09-04

## Scope

This correction addresses only the two state-cap findings from the round-8
Sol review. It changes the C1 scanner, the focused architecture test, and this
report. It does not change frozen authority, product source, baseline data,
package wiring, C2, merge state, or V acceptance. Hermes was not used.

## RED and correction

The focused RED reproduced both review failures:

1. nested-call entry states were compared before call arguments were bound,
   so four local calls caused a later `inner(require)` call to be treated as
   already covered; and
2. generic saturation widened a definitely local require binding into a
   possible global require, producing a false `zone_import` after harmless
   caller-state changes.

The scanner now constructs the parameter-bound callable state before entry
subsumption. At the distinct-state cap it widens the joined state while
preserving require bindings whose previous and current values agree. This
keeps the harmful global-require call visible without inventing a global
callee for the all-local inverse.

## Verification

- `pnpm exec vitest run tests/architecture/fix16-gate.test.ts --reporter=dot`
  passed 53/53 in three fresh processes.
- Three full repository scans returned exactly 379 findings each:
  143 `bare_catch`, 173 `throw_without_code`, 41 `void_promise`,
  16 `wrapper_without_cause`, and 6 `zone_import`.
- Full-scan times were 22.132 s, 20.189 s, and 20.048 s, all below the frozen
  30-second limit.
- `pnpm typecheck` reproduced only the pinned eight `s14-ui` diagnostics.
- The source audit reproduced only the pinned three obs-capture installer
  environment-read findings.
- The text-control-byte audit passed with zero bytes.
- `git diff --check` passed.

This is still a C1 implementation milestone. Fresh independent Sol review is
required. C2 and V acceptance remain deferred.
