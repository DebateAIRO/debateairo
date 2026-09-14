# FIX-09 C1 Sol review — round 2

Review target: branch `codex/oa-fix-09`, rework commit
`c11eb3e6179741cb3eefc1f0b7d59d3454a03313`, reviewed as
`1435a18c921a29150e46583b8687c5aa128bb486..c11eb3e6179741cb3eefc1f0b7d59d3454a03313`.
The original C1 base is
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — A polluted global prototype can still provide a required policy member

Affected code:

- `tools/obs-listener/policy/loader.ts:203-206`
- `tools/obs-listener/policy/canonical.ts:65-80`
- `tests/unit/fix09-bundle.test.ts:279-292`

The rework correctly rejects a bundle with a custom prototype and an inherited
`quick_arm`, but the exported schema still accepts the same missing own member
when it comes from the ordinary global `Object.prototype`. The own/plain-data
refinement walks only present own descriptors, returns `true`, and pipes the
original object into Zod. Zod then reads the absent required field through the
prototype chain.

The direct probe was:

```ts
Object.defineProperty(Object.prototype, "quick_arm", {
  configurable: true,
  value: "OFF",
});
const candidate = JSON.parse(rawBundle);
delete candidate.quick_arm;
policyBundleSchema.safeParse(candidate).success; // true
delete Object.prototype.quick_arm;
```

The same works with inherited `"ON"`, so the schema can synthesize an armed
value that is absent from the policy document. This violates the strict
own-member boundary that the rework report says it establishes and leaves the
prior prototype-backed-input finding open. It also affects the normal
`loadBundle` path if the process prototype has already been polluted, because
`JSON.parse` creates objects whose prototype is the shared `Object.prototype`.

Validate required members from own descriptors, or pass a safe projection into
the content schema rather than the original prototype-bearing input. Add a
regression that temporarily installs a non-enumerable value on the real
`Object.prototype`, removes the candidate's own required member, asserts
rejection, and restores the prototype in `finally`.

### F2 — P2 — An authenticated `next_bundle` accessor is invoked before validation

Affected code:

- `tools/obs-listener/policy/custodian.ts:64`

Token and environment-token access are now descriptor-based, total over the
malformed cases probed, and do not invoke accessors. After authentication,
however, `request.next_bundle ?? current` performs an ordinary property read.
An own getter was invoked once and its sentinel exception escaped instead of
the candidate being rejected by the policy boundary. This is a nearby residue
of the accessor-volatility issue: canonical hashing and bundle validation avoid
getter execution, while the repin entry point can execute one before either is
reached.

Read optional `next_bundle` through an own data descriptor as well. A missing
own member may select `current`; an accessor, inherited member, or trapping
descriptor lookup should be rejected without executing user code.

## Verdicts

- **SPEC: REWORK** — F1 means the bundle schema does not yet enforce that its
  required policy members are own data.
- **CODE QUALITY: REWORK** — F1 leaves the strict boundary inconsistent and F2
  leaves one accessor-executing path in the custodian entry point.

This is a C1 round-two review only. It is not V acceptance and makes no claim
that C2-C4 are implemented.

## Prior-finding disposition

- Round-one F1 is closed: the committed floor includes the live and redundant
  zone paths, nested dependency manifests, `obs-schema`, both register/env
  loaders, and the other frozen categories. Canonical and repeated `./`
  spellings deny; parent traversal, absolute forms, backslashes, UNC, drive
  absolute paths, NUL, empty input, and `.` fail closed. All probed adjacent
  product paths remain floor-clear.
- Round-one F2 is closed: the independent fixture pins the bundle hash,
  taxonomy, full code-registry seed, and all register seeds. A separate strict
  TypeScript project compares the implementation with independently declared
  exact tracer types and proves `keyof DispatchArm` is `never`.
- Round-one F3 is partially closed: duplicate JSON members, including nested,
  escaped-equivalent, and `__proto__` keys, reject before `JSON.parse` result
  use; object and array accessors reject without reads during hashing; all
  probed absent/non-string/empty/inherited/accessor token forms map to
  `RepinRefusedError` / `REPIN_REFUSED`. F1 and F2 above are the remaining
  prototype/accessor cases.

## Verification evidence

- Focused command: `pnpm vitest run tests/unit/fix09-bundle.test.ts
  --reporter=verbose` — **14/14 passed** on each of three consecutive fresh
  runs before this report, and **14/14 passed** again after writing it.
- Isolated harmful mutants, each from a clean `git archive` of HEAD: non-empty
  allowlist — **2 failed, 12 passed**; changed ratified registry hash — **1
  failed, 13 passed**; changed `obs.captureQueueMax` seed — **1 failed, 13
  passed**; changed tracer `fingerprintVersion` to `string` — **1 failed, 13
  passed**; added a `DispatchArm` member — **1 failed, 13 passed**.
- Isolated safe neighbor: JSON whitespace-only change — **14/14 passed**.
- Independent loader-free hash:
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`,
  equal to the checked-in expected pin; the independent script imports only
  `node:crypto`.
- Adversarial path probes denied every named live-floor path, nested manifest,
  env loader, obs-owned path, canonical/redundant spelling, traversal, and
  absolute/malformed form. Neighbor probes for public health, `mfa-helper`,
  `.yml`, `obs-schema-helper`, `compose-environment`, and
  `runtime-configuration` remained clear.
- Adversarial JSON/data probes rejected top-level, nested,
  escaped-equivalent, and `__proto__` duplicate keys. Nested-object and array
  accessors were not invoked by hashing. Missing, null, numeric, boolean,
  bigint, symbol, object, array, boxed-string, empty, inherited, and accessor
  token forms all refused with the frozen error; token accessors were not
  invoked. The global-prototype and authenticated-`next_bundle` probes produced
  F1/F2.
- `pnpm generate:contract` — exit 0 and no tracked worktree change.
- `pnpm typecheck` — exit 1 with exactly the eight pinned
  `tests/unit/s14-ui.test.ts` diagnostics and no FIX-09 diagnostic. A fresh
  resolution trace found no successful resolution into the non-worktree
  project checkout.
- `pnpm audit:source` — only the three documented unchanged direct environment
  reads under
  `packages/obs-capture/install/{api,runner,scheduler}.ts`.
- `pnpm audit:text-bytes` — exit 0,
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static/scope: the rework diff is exactly ten C1 report/test/fixture/policy
  files; the full implementation remains the original nine-file C1 surface
  plus those rework files. `git diff --check` is clean. No C2-C4 daemon,
  watchdog, launchd, model, database, or dispatch behavior is present.
  `TracerHook` matches the frozen interface; `DispatchArm` is exactly one
  32-byte memberless line. Root `node_modules` is a directory, not a symlink.
- The checked-in bundle has an empty allowlist, all three null RP-1/RP-2/RP-3
  slots, `quick_arm: OFF`, exactly one V custodian, and the complete independently
  pinned registry/register content.
