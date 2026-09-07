# FIX-09 C1 round-eight rework

Scope: C1 policy bundle, canonical hash, loader, custodian repin, and the frozen
hook interfaces only. This is not V acceptance and makes no claim about
C2-C4, merge readiness, or full FIX-09 completion.

## Review reproduction

Before product edits, the new inherited-helper matrix failed with 52 soft
assertions. Inherited `some` ran 50 times and cleared every one of the 31
checked floor paths. Inherited `sort` and `Symbol.iterator` changed the valid
bundle hash to `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`,
the digest of `{}`. Throwing accessors and non-callable replacements escaped
as raw failures.

The root cause was prototype dispatch in the authority path: projection used
array helpers and iteration, the floor used `.some`, and supporting validation
and parsing code still used related array, string, and set helpers.

## Correction

- Canonical projection now uses own descriptors, dense indexed loops, explicit
  data-property definition, and a deterministic descriptor-backed selection
  sort. Cycle tracking no longer uses mutable `Set` methods.
- Floor matching now reads only the frozen array's own length and own indexed
  data descriptors. Glob and path matching use explicit string-index loops.
- Loader preflight, cross-field checks, custodian prototype traversal, and the
  unique-key JSON scanner no longer dispatch through mutable array, string,
  set, regular-expression, or iterator helpers on the authority path.
- Schema entry remains fail-closed before and after projection/Zod validation
  if relevant ambient array authority descriptors change. It does not invoke
  or mutate hostile prototypes and does not introduce a manual acceptance
  path; ordinary unpolluted candidates still run the complete declared Zod
  schema.
- The regression matrix covers inherited getter-returned functions, data
  functions, throwing getters, and non-function neighbors on both
  `Object.prototype` and `Array.prototype` for `some`, `sort`, and
  `Symbol.iterator`. Direct hash and all floor/safe-neighbor decisions remain
  exact with zero hostile getter/function calls; load and repin refuse with
  their bounded policy error types while ambient authority is hostile.

## Mutation evidence

- Reintroducing `Object.keys(...).sort()` failed the matrix with 16 soft
  assertions: hooks ran, hash output became the digest of `{}`, and throwing
  or non-callable variants escaped.
- Reintroducing `for...of` failed the matrix with 16 soft assertions across
  the inherited iterator variants and corrupted the hash identically.
- Restoring `floor_deny_globs.some(...)` failed with 16 soft assertions,
  invoked the hostile hook 39 times per callable variant, and changed all 31
  required denials to clear.
- Restoring the descriptor/index implementation returned the targeted matrix
  and the complete focused suite to green. The non-function variants and eight
  safe floor neighbors stayed unchanged in the corrected implementation.

## Verification

- `pnpm vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`: 44/44
  passed on each of three consecutive fresh runs.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json`:
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- `node node_modules/typescript/bin/tsc --project
  tests/unit/fixtures/fix09-interface-tsconfig.json`: exit 0.
- `pnpm generate:contract`: exit 0 with no generated-file delta.
- `pnpm typecheck`: only the same eight pre-existing diagnostics in
  `tests/unit/s14-ui.test.ts`; no C1 diagnostic.
- `pnpm audit:source`: only the three pre-existing environment reads in
  `packages/obs-capture/install/{api,runner,scheduler}.ts`.
- `pnpm audit:text-bytes`: exit 0,
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static scan found no forbidden array/string/set helper dispatch, spread, or
  `for...of` in `tools/obs-listener/policy/*.ts`; `git diff --check` passed.
- Worktree branch is `codex/oa-fix-09`; its `node_modules` is a directory, not
  a symlink. No product or test symlinks were introduced.

All reviewer-authored Sol reports remain untracked and are excluded from this
rework.
