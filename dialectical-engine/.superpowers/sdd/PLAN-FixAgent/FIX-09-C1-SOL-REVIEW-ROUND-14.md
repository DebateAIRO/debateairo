# FIX-09 C1 Sol review — round 14

Review target: branch `codex/oa-fix-09`, commit
`b1d3d2f5d9faf34877fef1049123783036d98400`, reviewed as
`b419451ddde5529c9f1378517df27194943a9527..b1d3d2f5d9faf34877fef1049123783036d98400`.

## Findings

### F1 — P1 — live pre-authentication callables still authorize a wrong-token repin

`repin()` validates the current bundle in
`tools/obs-listener/policy/custodian.ts:154` but does not read the expected
token until lines 163-166. During that interval, canonical projection calls
the uncaptured main-realm `Reflect.deleteProperty` in
`tools/obs-listener/policy/canonical.ts:112`.

A bounded self-restoring replacement installed after all C1 modules
initialized changed the injected token from `correct` to `wrong`, restored
the exact helper descriptor, and delegated to the original helper. Three
fresh processes produced identically:

```text
callbackCalls=1
environment=wrong
quickArm=ON
refused=false
descriptorRestored=true
escaped=null
hash=aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd
```

Thus caller-controlled code still runs before token capture, a bundle is
returned with `quick_arm: ON`, no `REPIN_REFUSED` occurs, no raw exception
escapes, the helper is exactly restored, and the clean bundle retains the
pinned hash. This violates FIX-09-R02 and consequently the phase-one OFF
posture in R01/R12.

The omission is not confined to `Reflect`. One fresh-process preserving
variant each also reproduced the identical harmful result through:

- `Number.isSafeInteger` — `canonical.ts:70`
- `Array.isArray` — `canonical.ts:152`
- `JSON.stringify` — `canonical.ts:260`

These are directly reached by the current-bundle validation path. The
authority boundary therefore remains based on a list of previously reported
function names rather than eliminating live main-realm callback opportunities
before authentication.

The committed matrix in `tests/unit/fix09-bundle.test.ts:1092-1207` correctly
covers the three named `Object` helpers, but no mutant or safe neighbour
exercises the still-live `Reflect.deleteProperty` boundary or the other
demonstrated pre-authentication callables. Consequently, the same-authority-
path audit described in the round-thirteen rework report is incomplete.

Smallest acceptable correction: ensure every main-realm callable actually
reached between `repin()` entry and expected-token capture is a trusted-
initialization capability, then extend the exact self-restoring matrix to
require zero calls, unchanged `correct`, `REPIN_REFUSED`, no returned bundle
or raw escape, exact restoration, and the pinned hash. No unrelated globals
need modification.

No additional P0, P2, or P3 findings.

## Verdicts

### SPEC: REWORK

F1 preserves a wrong-token authority bypass and violates FIX-09-R02 plus the
phase-one OFF requirements in FIX-09-R01/R12.

### CODE QUALITY: REWORK

The two round-thirteen named `Object` attacks are closed, but the authority
boundary still admits equivalent adjacent live main-realm callbacks.

This is a C1 review only. It is not V acceptance and makes no claim about
C2-C4, merge readiness, or full FIX-09 completion.

## Verification evidence

- The requested `Object.getOwnPropertyDescriptor`,
  `Object.getOwnPropertyNames`, and `Object.getOwnPropertyDescriptors` matrix
  passed 3/3 in each of three fresh runs.
- The full focused suite passed 63/63.
- The independent hash was exactly
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- Frozen-interface compilation exited 0.
- Typecheck showed only the reported eight pre-existing
  `tests/unit/s14-ui.test.ts` diagnostics; none were C1-related.
- Source audit returned only the reported three existing installer
  environment findings.
- Text-byte audit returned `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check` was clean. The committed delta is limited to the rework
  report, focused C1 test, and the three policy modules; frozen authority,
  bundle, generated contract output, interfaces, product source, C2-C4, and
  `.hermes` are unchanged.
- The full focused suite preserves the prior proxy,
  VM/resolver/push/hash/crypto/isProxy/fs and frozen-interface regressions.

## Post-report state

This fresh independent Sol review is read-only with respect to product code,
tests, fixtures, package state, frozen authority, generated output, and
`.hermes`. It performed no V acceptance, merge, push, or external-state
operation.
