# FIX-09 C1 Sol review — round 17

Review target: branch `codex/oa-fix-09`, commit
`bdb48965814f22a7468f24fcafaa55591b19bafa`, with the round-sixteen
correction reviewed separately as
`77978e4b5e8ac4ceb3f8e7bc298df3e9bd9d336d..bdb48965814f22a7468f24fcafaa55591b19bafa`
and the accumulated C1 range checked as
`b1d3d2f5d9faf34877fef1049123783036d98400..bdb48965814f22a7468f24fcafaa55591b19bafa`.
Runtime evidence below is from Node `v22.23.1` with `tsx`.

## Findings

### P0

None.

### P1

None.

### F1 — P2 — the claimed all-derived-class guard ignores nested declarations and class expressions

The production correction freezes all three currently reachable derived error
constructors and blocks the reported attacks. The new systemic regression does
not, however, enforce its claimed invariant for every derived class in the
three authority modules:

- `tests/unit/fix09-bundle.test.ts:2248-2278` iterates only
  `sourceFile.statements`, which contains top-level statements, and accepts
  only nodes for which `isClassDeclaration(statement)` is true at line 2250;
- the recursive walk begins at `tests/unit/fix09-bundle.test.ts:2279`, but it
  has no derived-class freeze check;
- `tools/obs-listener/policy/loader.ts:11` already provides the captured
  `MAIN_ERROR` alias, so a later nested declaration such as
  `class E extends MAIN_ERROR {}` avoids both the top-level derived-class loop
  and the ambient-root check. A top-level or nested class expression is also
  invisible to the derived-class loop.

An independent virtual-filesystem AST mutation check applied the committed
top-level algorithm to four source shapes and emitted:

```text
top_level_unfrozen=[Top]
top_level_frozen=[]
nested_unfrozen=[]
expression_unfrozen=[]
```

A separate recursive scan found the omitted nodes in the two missed mutants.
Thus the guard catches removal of a current top-level freeze, but it permits a
later mutable derived-super edge merely by placing the class inside a function
or using a class expression. This does not reopen a live edge in the reviewed
production source: a recursive scan of the current three modules found exactly
`PolicyBundleSchemaError` at `loader.ts:1159`, `PolicyBundleLoadError` at
`loader.ts:1317`, and `RepinRefusedError` at `custodian.ts:47`, all top-level
declarations with their immediate constructor freezes at `loader.ts:1171`,
`loader.ts:1329`, and `custodian.ts:59`.

Smallest acceptable correction: recursively inspect derived class declarations
and expressions. Require a declaration's exact constructor binding to be
frozen in its containing statement list, or reject unsupported nested forms;
likewise reject derived class expressions unless their exact binding and freeze
are statically proved. Add RED mutants for at least a nested declaration
extending `MAIN_ERROR` and a derived class expression.

### P3

None.

## Verdicts

### SPEC: PASS

The three current constructor-super attack surfaces are closed. The exported
`RepinRefusedError` wrong-token attack and the recoverable
`PolicyBundleSchemaError` wrong-token attack execute zero hostile callbacks and
return no armed bundle; the load-error attack remains a typed
`PolicyBundleLoadError`. The pinned phase-one bundle remains reproducible,
`quick_arm` remains `OFF`, custody remains exactly one, and the frozen authority
and interface surfaces are unchanged.

### CODE QUALITY: REWORK

The four-line production correction is narrow and preserves lawful error
behavior, but F1 makes the new systemic static guard materially incomplete.
Its implementation and round-sixteen claim say all current or later derived
classes across loader/canonical/custodian are covered, while two ordinary AST
forms pass unexamined.

This is a C1 correction review only. It is not V acceptance and makes no claim
about C2-C4, merge readiness, or full FIX-09 completion.

## Verification evidence

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`
  passed 78/78 in each of three fresh processes.
- The exact three round-sixteen attack tests passed 3/3 in each of three
  additional fresh processes. The static/lawful selection passed 2/2.
- An independent live probe used `Reflect.setPrototypeOf` against all three
  recovered constructors. Every replacement returned `false`; hostile callback
  counts remained zero; the environment remained `correct`; both wrong-token
  paths returned no bundle and ended as exact `REPIN_REFUSED`; the missing-file
  path returned a `PolicyBundleLoadError` with an `Error` cause rather than a
  raw `SyntaxError`.
- The same probe confirmed each constructor is frozen while its instance
  prototype remains extensible. Caller-defined subclasses and their instances
  remain extensible/constructible and retain subclass plus parent `instanceof`,
  exact `name`, `code`, and `message`, string stacks, preserved schema/load
  causes, and no refusal cause.
- The independent hash fixture emitted exact
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
  A fresh declared-schema parse emitted the same hash, `quick_arm: OFF`, an
  empty allowlist, exactly one custodian
  `{id: V, token_env: OBS_POLICY_CUSTODIAN_TOKEN}`, and the three deferred
  `null` slots with gates `RP-1`, `RP-2`, and `RP-3`.
- The frozen-interface TypeScript compilation exited 0. `DispatchArm` remains
  the exact 32-byte memberless interface and `TracerHook` retains its frozen
  shape.
- Frozen FIX-09 SPEC/PLAN/DECISIONS, the bundle, generated contract output,
  dispatch/tracer interfaces, interface fixtures, `package.json`, and
  `pnpm-lock.yaml` have empty diffs across both the correction delta and the
  accumulated C1 range. No generator was run against the read-only generated
  output.
- `pnpm typecheck` returned only the same eight diagnostics in unchanged
  `tests/unit/s14-ui.test.ts`: TS2307 twice, TS18046 twice, TS2339 twice, and
  TS7006 twice. No C1 diagnostic appeared.
- The package-script forms of the source and text-byte audits were blocked by
  sandboxed `tsx` IPC (`listen EPERM`). The equivalent supported
  `node --import tsx` entries returned only the same three source findings in
  `packages/obs-capture/install/api.ts`, `runner.ts`, and `scheduler.ts`; the
  text-byte audit exited 0 with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- A focused forbidden-source scan found no inherited Hash member call, Worker,
  Atomics, shared buffer, cwd lookup, CommonJS resolver hook, process launch,
  direct environment read, database/provider import, `occurrence_detail`, or
  product-side shared-prototype mutation in `loader.ts`, `canonical.ts`, or
  `custodian.ts`.
- Both review ranges pass `git diff --check`. The correction delta contains
  only its implementation report, the focused C1 test, `loader.ts`, and
  `custodian.ts`; all are regular files. No `.hermes`, C2-C4, package-state,
  generated, frozen-authority, interface, or policy-bundle path changed.

## Post-report state

This fresh independent Sol review changed only this round-seventeen report,
which remains untracked and unstaged. It did not modify product code, tests,
fixtures, package state, frozen authority, generated output, checkout/index/
HEAD, or the pre-existing untracked review reports, and performed no Hermes,
V acceptance, C2-C4, merge, push, board, or external-state operation.
