# FIX-09 C1 Sol review

Review target: branch `codex/oa-fix-09`, commit
`1435a18c921a29150e46583b8687c5aa128bb486`, base
`2b670d3059c60d7262cf655bd5d402c88100dff3`.

## Findings

### F1 — P1 — The frozen floor is incomplete and has a lexical bypass

Affected code:

- `tools/obs-listener/policy/bundle.json:30-65`
- `tools/obs-listener/policy/loader.ts:246-258`

FIX-09 R01 and VAL-FIX-09-001 require the path/glob floor to cover the live
security-zone manifest paths, dependency manifests, compose/environment files,
and obs' own code. Direct calls against the committed bundle returned
`false` for each of these floor members:

- `apps/api/src/mfa.ts` — a literal member of the live
  `packages/obs-capture/src/zone/manifest.ts` prefix set;
- `apps/ui/pnpm-lock.yaml` — a checked-in nested dependency lock;
- `packages/db/src/obs-schema.ts` — obs-owned schema code;
- `packages/register/src/compose-env.ts` and
  `packages/register/src/runtime-environment.ts` — environment loaders named by
  the inherited frozen floor.

There is also an input-normalization escape: the semantically equivalent
repo-relative path `././tools/obs-listener/policy/bundle.json` returns `false`.
`isFloorDenied` strips only one leading `./`, then neither rejects remaining
`.` segments nor fully normalizes the path. This lets a caller's path spelling
bypass the unconditional `tools/**` floor.

`quick_arm` is currently OFF, so this is not authority to mutate today. It is
still a C1 contract failure: later tier-gate consumers would receive
floor-clear answers for frozen ESCALATE paths. Add the omitted live globs, then
reject or canonicalize every `.` segment before matching. The focused tests
need all omitted paths plus canonical and redundant-spelling cases and nearby
floor-clear controls.

### F2 — P1 — The tests do not pin all human-owned content or independently freeze the tracer seam

Affected code:

- `tests/unit/fix09-bundle.test.ts:121-145`
- `tests/unit/fix09-bundle.test.ts:256-264`
- `tools/obs-listener/policy/bundle.json:101-149`

The loader-free script independently reproduces the canonicalization
algorithm, but neither it nor the test carries an independently expected
content pin. In an isolated copy, changing the ratified `code_seed.sha256` from
`65ba...` to another valid 64-hex value still returned 9/9. The same exposure
exists for several structurally valid registry and register-seed mutations.
The current checked-in values match the ratified source; the regression proof
does not protect that fact.

The tracer type assertion compares `TracerHook` with `IncidentForTrace` and
`TraceVerdict` imported from the same implementation. Changing
`fingerprintVersion: number` to `string` therefore also returned 9/9, and the
repository typechecker would compare the same coordinated aliases. Changing
the empty `DispatchArm` to contain a member likewise returned 9/9 from the
named focused Vitest command because `expectTypeOf` is erased by Vitest's
transpile path; the separate repository typecheck is what detects that mutant.

Encode the ratified registry/register pins in an independent expected fixture,
and compare the exported tracer surface with an independently declared frozen
shape and literal verdict union. Either make the focused command perform type
checking or add a runtime/source assertion for the one-line memberless dispatch
export so the cluster's stated command detects the change.

### F3 — P2 — The strict boundary accepts ambiguous or prototype-backed inputs

Affected code:

- `tools/obs-listener/policy/loader.ts:108-217`
- `tools/obs-listener/policy/canonical.ts:11-40`
- `tools/obs-listener/policy/custodian.ts:28-47`

Adversarial probes found:

- duplicate JSON member names are accepted with JavaScript's last-member-wins
  behavior before Zod sees the value;
- a schema input missing its own `quick_arm` passes when that required member
  is inherited from its prototype;
- `bundleHash` invokes enumerable accessors, so two calls over the same
  accessor-backed object produced different hashes;
- a missing runtime `request.token` throws Node's raw
  `ERR_INVALID_ARG_TYPE`, not `RepinRefusedError` / `REPIN_REFUSED`.

The checked-in bundle travels through `JSON.parse` and Zod returns a cloned
plain value, so accessor-backed hashing is not reachable on the normal
`bundleHash(loadBundle(...))` path. Wrong tokens, absent expected tokens, and a
wrong-token request with a throwing `next_bundle` getter all refused before
the proposed bundle was read. These results keep this finding below F1/F2, but
the public boundaries should reject duplicate syntax, require own plain-data
members, and map every absent/malformed token to the frozen refusal error.

## Verdicts

- **SPEC: REWORK** — F1 violates R01 / VAL-FIX-09-001.
- **CODE QUALITY: REWORK** — F2 leaves ratified content and a frozen interface
  unguarded; F3 leaves avoidable ambiguity at policy boundaries.

This is a C1 review verdict only. It is not V acceptance and makes no claim
about C2-C4.

## Verification evidence

- Focused command: `pnpm vitest run tests/unit/fix09-bundle.test.ts` — **9/9**
  on each of three consecutive fresh runs.
- Required harmful mutant in an isolated archive: non-empty allowlist — **1
  failed, 8 passed**. Original commit bytes were never edited.
- Safe neighbor in an isolated archive: JSON whitespace only — **9/9 passed**.
- Additional isolated mutants: changed ratified registry hash — **9/9**;
  changed tracer `fingerprintVersion` type — **9/9**; added a dispatch member —
  **9/9** from the focused command.
- Independent loader-free hash:
  `53c0e932f6a2c045041d3fe7948d16cbd302590bbf276c133702da7c6f8301d5`;
  the fixture imports only `node:crypto`.
- `pnpm generate:contract` — exit 0 and no worktree change.
- `pnpm typecheck` — exit 1 with exactly the eight documented
  `tests/unit/s14-ui.test.ts` diagnostics and no FIX-09 diagnostic. A fresh
  resolution trace found no successful absolute resolution outside this
  worktree.
- `pnpm audit:source` — only the three documented pre-existing direct
  environment reads under `packages/obs-capture/install/{api,runner,scheduler}.ts`.
- `pnpm audit:text-bytes` — exit 0,
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static/scope: exactly nine added files; `git diff --check` clean; no C2-C4
  daemon/watchdog/launchd files; no forbidden runtime imports or access in the
  new TypeScript; `DispatchArm` is currently exactly one 32-byte line and
  memberless; worktree root `node_modules` is a directory, not a symlink.
- Malformed cases: missing/extra top-level sections, duplicate register seeds,
  and duplicate floor globs were rejected. Non-finite and unsupported hash
  values were rejected. The checked-in bundle has an empty allowlist, all three
  null RP-1/RP-2/RP-3 slots, `quick_arm: OFF`, and exactly one literal V
  custodian.

