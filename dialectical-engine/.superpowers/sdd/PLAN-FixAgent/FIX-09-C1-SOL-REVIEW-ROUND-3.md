# FIX-09 C1 Sol review — round 3

Review target: branch `codex/oa-fix-09`, commit
`0813fc71be6555452e6104c56b6767158fa326d1`, reviewed as
`c11eb3e6179741cb3eefc1f0b7d59d3454a03313..0813fc71be6555452e6104c56b6767158fa326d1`.
The original C1 base remains
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — Zod re-materializes the safe snapshot into prototype-bearing output

Affected code:

- `tools/obs-listener/policy/loader.ts:191-210`
- `tools/obs-listener/policy/canonical.ts:65-82`
- `tests/unit/fix09-bundle.test.ts:294-374`

The new `canonicalProjection` does recursively build object snapshots with
null prototypes, and that snapshot is what the content schema receives. The
content schema then creates and returns new ordinary objects. A non-writable
data property or setterless accessor on `Object.prototype` can prevent those
ordinary result objects from receiving their own validated property. Zod still
reports success, and the returned bundle reads the inherited value instead.

This directly changes both authority and floor behavior. With the checked-in
bundle still containing its own `"quick_arm": "OFF"`, the following process
state produced an armed returned bundle:

```ts
Object.defineProperty(Object.prototype, "quick_arm", {
  configurable: true,
  value: "ON",
});
const bundle = loadBundle(BUNDLE_PATH);
Object.hasOwn(bundle, "quick_arm"); // false
bundle.quick_arm;                   // "ON"
```

The analogous floor probe installed a setterless inherited
`floor_deny_globs` returning `[]`. `loadBundle` returned an object without its
own floor, and
`isFloorDenied(bundle, "tools/obs-listener/policy/bundle.json")` returned
`false`. An accessor-backed value also ran its getter during the load/use path.

The added tests check only whether parsing a complete candidate succeeds and
whether a candidate with a deleted field fails. They do not inspect the
successful parse result's own descriptors or semantic values. In particular,
the test's `Object.defineProperty` call creates the same non-writable inherited
data property that causes this issue, so its `"ON"` complete-candidate case is
a false green: parsing succeeds while the result loses its own `quick_arm` and
reads inherited `"ON"`.

Do not return Zod's prototype-bearing clone as the policy. Preserve and return
an independently created descriptor-safe snapshot after schema validation,
and run the duplicate/cross-field refinements against that snapshot rather
than against Zod's reconstructed objects. Alternatively, recursively verify
the final result's own descriptors and values against the snapshot before it
can escape. Regression cases need to assert `Object.hasOwn`, exact returned
values, the empty allowlist, and a live floor decision under both non-writable
data and setterless-accessor pollution.

### F2 — P2 — The schema traverses hostile input twice and can leak a second-pass trap

Affected code:

- `tools/obs-listener/policy/loader.ts:206-210`

The refine calls `canonicalProjection` through `isOwnPlainJsonData`, then the
transform calls it again. A proxy that returns a plain prototype on the first
`getPrototypeOf` trap and throws on the second passes the refinement and makes
`policyBundleSchema.safeParse` throw the trap's raw sentinel instead of
returning a validation failure. The same path is reachable from an authenticated
repin whose own data `next_bundle` value is hostile.

Create the snapshot once in a guarded transform that converts projection
errors into a schema issue, then validate that single snapshot. This also
removes the time-of-check/time-of-use split.

## Verdicts

- **SPEC: REWORK** — F1 can turn the checked-in OFF policy into inherited ON
  and can erase the immutable floor after a successful `loadBundle`, violating
  R01/R02/R12 and VAL-FIX-09-001.
- **CODE QUALITY: REWORK** — F1 leaves the returned policy outside the stated
  own-data boundary; F2 leaves a redundant volatile-input traversal and an
  unbounded error path.

This is a C1 round-three review only. It is not V acceptance and makes no claim
that C2-C4 are implemented.

## Round-two finding disposition

- Round-two F1 is fixed for the exact missing-input case: under writable data
  pollution, every one of 143 recursively enumerated required object members
  remained rejected when deleted from the input. The recursive projection
  contained null-prototype objects, and all 143 own-accessor substitutions were
  rejected with zero getter reads. F1 above is the separate output-phase path
  exposed by non-writable data properties and accessors.
- Round-two F2 is closed: valid own-data `next_bundle` repins; a genuinely
  absent own member returns the current bundle; own accessors, inherited data,
  own-descriptor traps, prototype traps, prototype-descriptor traps, prototype
  cycles, and global inherited data/accessors all refuse without executing the
  tested getters. Request and environment tokens likewise require own string
  data; their accessor and descriptor-trap cases did not run getters and every
  malformed case produced `RepinRefusedError` / `REPIN_REFUSED`.

## Verification evidence

- Focused command: `pnpm vitest run tests/unit/fix09-bundle.test.ts
  --reporter=verbose` — **18/18 passed** on each of three consecutive fresh
  runs before this report, and **18/18 passed** again after writing it.
- Isolated harmful mutants from a clean archive of HEAD: non-empty allowlist —
  **2 failed, 16 passed**; changed ratified registry hash — **1 failed, 17
  passed**; changed `obs.captureQueueMax` — **1 failed, 17 passed**; changed
  tracer `fingerprintVersion` — **1 failed, 17 passed**; added a `DispatchArm`
  member — **1 failed, 17 passed**; removed the snapshot transform — **2
  failed, 16 passed**; restored the ordinary `request.next_bundle` read — **2
  failed, 16 passed**.
- Isolated safe neighbor: JSON whitespace-only change — **18/18 passed**.
- Prototype/schema probes: 143 recursively enumerated required fields were
  exercised under inherited data and inherited/own accessors. Deleted input
  members were not accepted and own accessors had zero reads. The successful
  output probes reproduced F1 for `quick_arm` and `floor_deny_globs`; a volatile
  proxy reproduced F2.
- Custodian probes: valid own `next_bundle` and missing `next_bundle` were safe
  neighbors. Own/inherited/accessor/descriptor-trapping/prototype-trapping and
  cyclic cases refused as described above. Missing, null, numeric, boolean,
  bigint, symbol, object, array, boxed-string, empty, inherited, accessor, and
  descriptor-trapping request/environment tokens all refused with the frozen
  error.
- Duplicate JSON probes: top-level, nested, escaped-equivalent, and duplicate
  `__proto__` members all produced `PolicyBundleLoadError` caused by
  `DUPLICATE_JSON_MEMBER`.
- Floor probes denied all prior live and redundant zone paths, nested lock and
  manifest paths, obs-owned code, env loaders, repeated `./` spellings,
  traversal, absolute, drive, UNC, backslash, NUL, empty, and dot-only forms
  when the prototype was clean. All prior adjacent product neighbors remained
  floor-clear.
- Independent loader-free hash:
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`,
  equal to the checked-in expected pin; the script imports only `node:crypto`.
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
- Static/scope: the round-three diff is exactly the C1 rework report, focused
  test, and three policy implementation files. `git diff --check` is clean. No
  C2-C4 daemon, watchdog, launchd, database, model, or dispatch behavior is
  present. `TracerHook` still matches the independently frozen contract;
  `DispatchArm` remains exactly one 32-byte memberless line. Root
  `node_modules` is a directory, not a symlink. No Hermes file or tool was used.
