# FIX-09 C1 Sol review — round 18

Review target: branch `codex/oa-fix-09`, commit
`daa8908d918da1ab137014f68c89e752bd406428`. The round-seventeen guard
correction was reviewed separately as
`bdb48965814f22a7468f24fcafaa55591b19bafa..daa8908d918da1ab137014f68c89e752bd406428`;
the accumulated round-sixteen production correction and round-seventeen guard
were reviewed as
`77978e4b5e8ac4ceb3f8e7bc298df3e9bd9d336d..daa8908d918da1ab137014f68c89e752bd406428`.
Runtime evidence below is from Node `v22.23.1`, pnpm `11.20.0`, and the pinned
`tsx`/Vitest toolchain.

## Findings

### P0

None.

### P1

None.

### P2

None.

### P3

None.

## Verdicts

### SPEC: PASS

The accumulated correction closes the three live derived-error superclass
dispatch paths. `PolicyBundleSchemaError`, `PolicyBundleLoadError`, and
`RepinRefusedError` are frozen immediately after their declarations at
`tools/obs-listener/policy/loader.ts:1171`,
`tools/obs-listener/policy/loader.ts:1329`, and
`tools/obs-listener/policy/custodian.ts:59`. Independent fresh-process attacks
could not replace any constructor's superclass, executed zero hostile
callbacks, left the token environment `correct`, returned no armed bundle, and
preserved typed refusal/load errors.

The policy remains the exact independently reproducible
`aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`
bundle with `quick_arm: OFF`, an empty allowlist, exactly the one V custodian,
and null RP-1/RP-2/RP-3 deferred slots. The reviewed correction therefore
preserves the C1 obligations in FIX-09-R01/R02/R12.

### CODE QUALITY: PASS

The round-seventeen correction makes the derived-constructor check genuinely
recursive without weakening its accepted form. The helper at
`tests/unit/fix09-bundle.test.ts:88-129` records only top-level declarations
whose exact binding is passed to the immediately following one-argument
`FREEZE_OBJECT` call, then recursively reports every other derived declaration
or expression. The real authority gate consumes that helper at
`tests/unit/fix09-bundle.test.ts:2353-2360`.

An independent in-memory TypeScript-AST matrix confirmed that the guard:

- accepts all three current modules with no violation and accepts each exact
  immediate top-level freeze;
- reports each current constructor when only its freeze is omitted;
- reports a top-level omission, a function-nested declaration extending the
  `MAIN_ERROR` alias, and both named and anonymous derived class expressions;
- reports a wrong-binding freeze, a delayed freeze, and the deliberately
  unsupported nested/expression freeze forms; and
- does not report non-derived top-level, nested, or expression classes.

The committed virtual regression at
`tests/unit/fix09-bundle.test.ts:2177-2234` shares the production-source helper,
so its mutants cannot drift from the gate. Freezing remains confined to the
three constructor objects: `Error`, `Error.prototype`, and the three instance
prototypes remain extensible. Caller-defined subclasses and instances remain
constructible and extensible with parent/child `instanceof`, exact
`name`/`code`/`message`, string stacks, preserved schema/load causes, and no
refusal cause.

This is a C1 correction review only. It is not V acceptance and makes no claim
about C2-C4, merge readiness, or full FIX-09 completion.

## Verification evidence

- `pnpm exec vitest run tests/unit/fix09-bundle.test.ts --reporter=dot` passed
  79/79 in each of three consecutive fresh processes.
- The three exact live superclass attacks plus the static omission and lawful
  neighbor tests passed 5/5 in each of three additional fresh processes.
- A separate live probe recovered the private schema-error constructor through
  `policyBundleSchema.safeParse({}).error.constructor` and attacked it together
  with the two exported constructors. `Reflect.setPrototypeOf` returned
  `false` for all three, callback count stayed zero, and both wrong-token paths
  ended as exact `RepinRefusedError`s. The missing-file path ended as an exact
  `PolicyBundleLoadError` with an `Error` cause, not a raw `SyntaxError`.
- The same probe confirmed every constructor is frozen with superclass
  identity `Error` while every instance prototype, caller subclass, and caller
  instance remains extensible. All lawful error shape, stack, cause, and
  `instanceof` assertions passed.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json` emitted the exact pinned hash. A fresh
  declared-schema parse emitted the same hash and frozen policy values above.
- `node node_modules/typescript/bin/tsc --project
  tests/unit/fixtures/fix09-interface-tsconfig.json --pretty false` exited 0.
  `DispatchArm` remains memberless and `TracerHook` retains its frozen shape.
- Contract generation ran against an isolated archive of HEAD. Its
  `field-inventory.json`, `openapi.json`, and `client.ts` were byte-identical to
  the read-only checkout copies (SHA-256 respectively `842c6c4e...e2af`,
  `c44039ef...e14`, and `3070f4a8...046d`).
- `pnpm typecheck` returned only the same eight diagnostics in unchanged
  `tests/unit/s14-ui.test.ts`: TS2307 twice, TS18046 twice, TS2339 twice, and
  TS7006 twice. No C1 diagnostic appeared.
- The package-script source audit was blocked by sandboxed `tsx` IPC with
  `listen EPERM`. The equivalent supported `node --import tsx` entry returned
  only the same three findings in unchanged
  `packages/obs-capture/install/{api,runner,scheduler}.ts`. The direct text-byte
  audit exited 0 with `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- A focused forbidden-source scan found no inherited Hash member call, Worker,
  Atomics, shared buffer, cwd lookup, CommonJS resolver hook, process launch,
  direct environment read, database/provider import, `occurrence_detail`, or
  product-side shared-prototype mutation in `loader.ts`, `canonical.ts`, or
  `custodian.ts`.
- Both review ranges pass `git diff --check`. The immediate delta contains only
  the round-seventeen rework report and focused C1 test. The accumulated delta
  additionally contains the round-sixteen rework report and the two corrected
  policy modules. Every changed path is a regular file.
- Frozen FIX-09 SPEC/PLAN/DECISIONS, policy bundle, generated contract output,
  dispatch/tracer interfaces and fixtures, package state, `.hermes`, C2-C4
  source, and the unchanged baseline type-error file have empty diffs across
  both ranges. Root `node_modules` is a directory and not a symlink.

## Post-report state

This fresh independent Sol review changed only this round-eighteen report,
which remains untracked and unstaged. It did not modify product code, tests,
fixtures, package state, frozen authority, generated output, checkout/index/
HEAD, or the pre-existing untracked review reports, and performed no Hermes,
V acceptance, C2-C4, merge, push, board, or external-state operation.
