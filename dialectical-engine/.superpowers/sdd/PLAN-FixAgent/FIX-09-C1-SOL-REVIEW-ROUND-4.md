# FIX-09 C1 Sol review — round 4

Review target: branch `codex/oa-fix-09`, commit
`1659c41add4a8766fc5f1b629238458d54591081`, reviewed as
`0813fc71be6555452e6104c56b6767158fa326d1..1659c41add4a8766fc5f1b629238458d54591081`.
The original C1 base remains
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — array projection still uses inherited assignment and can erase a floor glob

Affected code:

- `tools/obs-listener/policy/canonical.ts:42-63`
- `tests/unit/fix09-bundle.test.ts:54-67`
- `tests/unit/fix09-bundle.test.ts:366-433`

The round-four object return is materially safer: record projections are
null-prototype, recursive containers are frozen, and the exact snapshot is
returned instead of Zod's ordinary-object clone. Array projection, however,
still creates `[]` and populates it with `projection.push(...)`. `push` uses
ordinary inherited `[[Set]]` semantics. An accessor setter at numeric key
`"0"` on `Object.prototype` can consume the first write instead of creating an
own array element. The later freeze preserves that hole rather than repairing
it.

A live probe installed a configurable `Object.prototype["0"]` accessor. Its
setter discarded only the first floor value,
`apps/api/src/registration.ts`, and defined normal own zero properties for all
other array writes. Its getter supplied the schema-valid replacement
`public/**` only for the affected floor array. The checked-in complete bundle
then produced all of these results:

```text
policyBundleSchema.safeParse(...).success = true
Object.hasOwn(result.data.floor_deny_globs, "0") = false
Object.isFrozen(result.data.floor_deny_globs) = true
isFloorDenied(result.data, "apps/api/src/registration.ts") = false
isFloorDenied(result.data, "public/secret.ts") = true
bundleHash(result.data) throws CANONICAL_JSON_NON_PLAIN_DATA
```

The inherited getter ran five times during validation/use. After removing the
pollution, the frozen output still had no own index zero and the registration
floor remained clear. This violates the required exact, own-indexed snapshot,
changes the immutable floor, and makes the successfully returned bundle no
longer canonically hashable. The recursive assertion helper would detect this
state, but the focused pollution test covers named record members
`quick_arm`/`floor_deny_globs`, not inherited numeric indices.

Populate each fresh array index with an own-property operation that cannot
dispatch to an inherited setter (for example, checked
`Object.defineProperty`/`Reflect.defineProperty` data descriptors), then
freeze. Add a regression that installs a hostile numeric prototype accessor
and asserts zero accessor calls, every index own, exact floor contents, the
registration path denied, and the canonical pin unchanged.

### F2 — P2 — malformed nested `value` fields can execute a prototype getter and escape `safeParse`

Affected code:

- `tools/obs-listener/policy/loader.ts:209-230`

The guarded canonical projection does not itself read inherited fields, and a
complete bundle remained exact under setterless/non-writable pollution of all
56 unique policy member names. On the validation-error path, however, the
inner `policyBundleContentsSchema.safeParse(snapshot)` constructs a ZodError.
Zod 4.4.3 uses an ordinary descriptor map containing a getter-only descriptor;
an inherited `Object.prototype.value` therefore participates in
`Object.defineProperties`.

For each of the 16 `register_seeds[*].value` members and all three
`slots.*.value` members, deleting the own value and installing a setterless
`Object.prototype.value` getter executed that getter once and leaked its
`OBJECT_PROTOTYPE_VALUE_GETTER_RAN` sentinel from the exported
`policyBundleSchema.safeParse`. The equivalent non-writable inherited data
property threw `TypeError: Invalid property descriptor`. None of the 19
malformed inputs was accepted, and `loadBundle`/authenticated `repin` map the
escape to their bounded refusal types, so this did not reproduce F1's floor
bypass. It nevertheless misses the requested no-getter boundary and makes the
exported schema's advertised safe-parse surface non-total for a required
nested-field class.

Keep validation-error construction outside prototype-bearing descriptor
maps, or place an own-data/preflight boundary in front of the Zod failure path
so malformed required members cannot reach this polluted-library path. The
regression should delete a nested `value`, install a throwing inherited getter,
assert zero reads, and require a bounded validation failure.

## Verdicts

- **SPEC: REWORK** — F1 admits a successful policy whose immutable floor is
  changed and whose returned snapshot is neither exact nor own-indexed,
  violating VAL-FIX-09-001 and FIX-09-R01/R02/R12. F2 also misses the explicit
  prototype/getter boundary required by this review round.
- **CODE QUALITY: REWORK** — F1 retains inherited-write semantics in the
  canonical trust boundary; F2 exposes a raw, side-effecting Zod failure path
  from the exported `safeParse` API.

This is a C1 round-four review only. It is not V acceptance and makes no claim
that C2-C4 are implemented.

## Round-three finding disposition

- Round-three F1 is fixed for record fields and ordinary clean-prototype
  arrays: the returned records are own-data null-prototype snapshots, all
  containers are frozen, exact `quick_arm: OFF` and the floor record member
  survive named setterless/non-writable pollution, and the successful snapshot
  is what escapes. F1 above is the remaining numeric array-index path through
  `push`.
- Round-three F2 is fixed for caller-level traversal: a volatile proxy is
  projected once per policy parse; its permitted first parse succeeds with one
  `getPrototypeOf`, and an authenticated later repin is bounded as
  `RepinRefusedError` when the proxy rejects its second caller traversal.

## Verification evidence

- Focused command: `pnpm vitest run tests/unit/fix09-bundle.test.ts
  --reporter=verbose` — **21/21 passed** on each of three consecutive fresh
  runs before this report. A fresh post-report run is recorded below.
- Isolated harmful mutants from a clean archive of HEAD: non-empty allowlist —
  **2 failed, 19 passed**; changed ratified registry hash — **1 failed, 20
  passed**; changed `obs.captureQueueMax` — **1 failed, 20 passed**; changed
  tracer `fingerprintVersion` — **1 failed, 20 passed**; added a valid
  `DispatchArm` member — **1 failed, 20 passed**; returned Zod's clone — **2
  failed, 19 passed**; added a second caller projection — **1 failed, 20
  passed**; restored ordinary `request.next_bundle` reads — **2 failed, 19
  passed**; removed array freezing — **1 failed, 20 passed**.
- Isolated safe neighbors: a JSON whitespace-only change kept **21/21
  passing**; valid own-data `next_bundle`, genuinely missing `next_bundle`,
  canonical key reordering, and repeated `./` safe/floor paths retained their
  intended results.
- Complete-output prototype matrix: all 56 unique policy member names (143
  recursively enumerated member paths) were tested independently under
  non-writable and setterless-accessor `Object.prototype` pollution. Every
  complete parse succeeded with zero inherited getter reads and returned the
  exact recursively frozen snapshot; every record had a null prototype and
  own data members. All 143 own-accessor substitutions were rejected with zero
  getter reads. All 143 deleted members were unaccepted; the 19 nested `value`
  error paths produced F2.
- Array-index prototype probe: the checked-in complete bundle reproduced F1
  with schema success, a frozen hole at floor index zero, a live registration
  floor bypass, and a non-canonical returned bundle.
- Custodian probes: valid own and missing `next_bundle` were safe neighbors.
  Own accessor, inherited data, descriptor trap, prototype trap, and prototype
  cycle cases refused. Missing, null, boolean, numeric, bigint, symbol, object,
  array, function, boxed-string, empty, inherited, accessor, and
  descriptor-trapping request/environment tokens all produced
  `RepinRefusedError` / `REPIN_REFUSED`; tested token accessors had zero reads.
- Duplicate JSON probes: top-level, nested, escaped-equivalent, and duplicate
  `__proto__` members all produced `PolicyBundleLoadError` caused by
  `DUPLICATE_JSON_MEMBER`.
- Floor/path probes denied the full focused live floor list, nested manifests
  and lockfiles, env/register/obs-owned files, repeated `./` spellings,
  traversal, absolute, drive, backslash, empty, and dot-only forms under a
  clean prototype. Adjacent product neighbors remained floor-clear. F1 is the
  polluted-array exception.
- Bundle/static checks: allowlist length 0; three null slots with gates
  RP-1/RP-2/RP-3; `quick_arm` OFF; exactly one literal V custodian; 47 floor
  globs; 12 taxonomy classes; 16 register seeds. The loader-free fixture imports
  only `node:crypto` and independently produced
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`,
  equal to the checked-in pin on the clean bundle.
- `pnpm generate:contract` — exit 0 and no tracked delta.
- `pnpm typecheck` — exit 1 with exactly the eight documented
  `tests/unit/s14-ui.test.ts` diagnostics and no FIX-09 diagnostic. The focused
  interface compiler exited 0, and a fresh resolution trace resolved both
  frozen interfaces inside this worktree with no successful resolution into
  the main checkout.
- `pnpm audit:source` — only the three documented unchanged direct environment
  reads under
  `packages/obs-capture/install/{api,runner,scheduler}.ts`.
- `pnpm audit:text-bytes` — exit 0,
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static/scope: the round-four commit diff is exactly its rework report,
  focused test, and three policy implementation files. The original commit's
  exact nine-file C1 scope remains identifiable; later review rounds add only
  C1 guard fixtures, parser/canonical/custodian hardening, focused tests, and
  their reports. `git diff --check` is clean. `TracerHook` and the 32-byte
  memberless `DispatchArm` are unchanged from round three and pass the
  independently pinned interface compilation. No C2-C4 daemon, watchdog,
  launchd, database, model, or dispatch behavior is present. Root
  `node_modules` is a directory, not a symlink. No Hermes file or tool was used.

## Post-report verification

`pnpm vitest run tests/unit/fix09-bundle.test.ts --reporter=verbose` passed
**21/21** once more after this report was written. Final status readback showed
HEAD still at the reviewed commit and only the four expected untracked Sol
review reports; no product, fixture, or focused-test edit was made by this
review.
