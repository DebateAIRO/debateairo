# FIX-09 C1 round-nine rework

Scope: C1 policy bundle canonical hashing, declared-schema validation, custodian
authentication, focused tests, and this report only. This is not V acceptance
and makes no claim about C2-C4, merge readiness, or full FIX-09 completion.

## Review reproduction

Before product edits, the focused suite had 3 new failing tests with 40 soft
assertion failures:

- The eight `Hash.prototype.update` / `digest` getter-function, data-function,
  throwing-getter, and non-callable variants were reached. Callable `update`
  variants produced the empty-input digest; callable `digest` variants
  produced an attacker-selected zero digest; throwing and non-callable
  variants escaped raw. The callable variants authenticated `wrong` against
  `correct` and returned a schema-valid `quick_arm: ON` bundle.
- Hostile `Array.prototype.push` getter/data no-ops ran 45 times across direct
  `safeParse`, file load, and authenticated repin. The preserving cross-call
  wrapper ran 200 times and changed the later Hash update path. Validation and
  load succeeded, and the wrong-token repin returned `quick_arm: ON`.
- A preserving hostile `push` present before a fresh loader initialization was
  accepted as the baseline and the clean bundle parsed successfully.

The prior 44 tests stayed green, isolating both failures to the round-nine
review roots.

## Correction

- Canonical bundle hashing and custodian token hashing now use Node's one-shot
  `crypto.hash("sha256", ...)` operation. No mutable `Hash` instance or
  inherited `update` / `digest` lookup participates in either authority
  decision. Canonical output remains lowercase hex; token digests remain exact
  32-byte buffers for the unchanged `timingSafeEqual` comparison.
- Loader initialization records the own `Array.prototype.push` descriptor only
  after proving its data-descriptor shape, rejecting proxies, and comparing
  its intrinsic source against a pristine Node realm's native push. The
  isolated checker receives no policy or caller input and never calls the
  candidate function.
- Every policy parse fails closed when that initial descriptor was unsafe or
  when the current descriptor differs by value identity or descriptor field.
  The same exact check runs before projection, immediately before the declared
  Zod schema, and immediately after the Zod parse. A hostile pre-initialization
  baseline therefore cannot become trusted, and a mid-parse identity change
  cannot be accepted.
- Product code neither mutates a global prototype nor bypasses the complete
  declared Zod schema.

## Regression and mutation evidence

- The Hash matrix covers both members crossed with all four review variants.
  Each variant makes zero getter/function calls, preserves the exact checked-in
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`
  bundle hash, and refuses every wrong-token repin. A restored lawful token
  remains accepted without arming the bundle.
- The push matrix covers getter/data no-ops, a throwing getter, a non-callable
  value, and a preserving cross-call poison across `safeParse`, `loadBundle`,
  and repin. All are refused with the bounded error types, execute zero hostile
  members, cannot authenticate, and leave the canonical hash exact.
- A fresh-process hostile-pre-initialization case is refused. A separate
  mid-Zod identity swap proves the post-parse check is effective while also
  proving the declared regex/schema path still runs for clean input. An
  unreachable `Object.prototype.push` getter is a clean zero-call neighbour.
- Reintroducing the canonical `createHash().update().digest()` chain failed the
  Hash test with 16 soft assertions. Reintroducing that chain only for token
  digests failed it with 20 soft assertions and restored wrong-token access.
- Omitting the live push identity comparison failed the push matrix with 11
  soft assertions. Trusting descriptor shape without the native proof made the
  hostile pre-initialization case succeed. Omitting the post-Zod comparison
  made the mid-parse identity-change case succeed. Every mutant was restored
  before final verification.

## Verification

- `pnpm vitest run tests/unit/fix09-bundle.test.ts --reporter=dot`: 49/49
  passed on each of three consecutive fresh runs.
- `node tests/unit/fixtures/fix09-independent-hash.mjs <
  tools/obs-listener/policy/bundle.json`: exact `aa76...497ecd` hash.
- `node node_modules/typescript/bin/tsc --project
  tests/unit/fixtures/fix09-interface-tsconfig.json`: exit 0; the frozen hook
  interface remains exact and `DispatchArm` remains 32 bytes/memberless.
- The `pnpm generate:contract` wrapper hit the known sandboxed `tsx` IPC
  restriction. `node --import tsx packages/contract/src/generate.ts` exited 0,
  and `git diff --exit-code -- packages/contract/generated` remained clean.
- `pnpm typecheck` reported only the same eight documented diagnostics in
  `tests/unit/s14-ui.test.ts`; there was no C1 diagnostic.
- The direct source-audit entry point reported only the same three documented
  environment reads in `packages/obs-capture/install/{api,runner,scheduler}.ts`.
  The direct text-byte audit exited 0 with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Static inspection finds no `createHash`, inherited Hash helper call, global
  prototype mutation, direct environment access, DB import, or occurrence
  detail in the changed policy files. `git diff --check` passes; contract
  output is unchanged; `node_modules` is a directory rather than a symlink;
  no changed source or test path is a symlink.
- Owned scope is `canonical.ts`, `custodian.ts`, `loader.ts`, the focused C1
  test, and this report. No bundle, package, product, C2-C4, frozen authority,
  generated, `.hermes`, or reviewer-report content changed. All Sol review
  artifacts remain untracked and excluded.

