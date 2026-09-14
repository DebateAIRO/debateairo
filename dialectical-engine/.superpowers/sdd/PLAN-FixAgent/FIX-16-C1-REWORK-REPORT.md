# FIX-16 C1 rework report

Date: 2026-09-04

Branch: `codex/oa-fix-16`

Base C1 commit: `da0a2ddd21db29e8b3e2abc3e4f62040e01a5940`

## Scope

This worker milestone reworks C1 only:

- `tools/obs-inventory/src/scan.ts`
- `tools/obs-inventory/src/zone-check.ts`
- `tests/architecture/fix16-gate.test.ts`
- two existing C1 zone fixtures whose Promise values are now explicitly observed

It does not create a baseline, CLI/index, README, or package wiring. It does
not modify product source, the frozen FIX-16 documents, or any C2 surface.

## Review findings reproduced as RED

The focused suite was extended before implementation. Against `da0a2ddd`, it
reported 7 failed and 10 passed tests. The seven failures covered:

1. a synchronous call falsely classified as `void_promise` while discarded
   `Promise` and `PromiseLike` identifiers were missed;
2. arbitrary identifier and property throws accepted as coded;
3. `Boolean(caught)` and a lexically shadowed cause alias accepted as cause;
4. a TypeScript `import("zone")` type node missed by the zone check;
5. manifest-shaped classification lists outside the exact manifest path
   receiving the manifest exemption;
6. a source symlink silently skipped;
7. local wrapper and `require` shadows classified by spelling.

## Rework design

The scanner retains the bounded TypeScript compiler AST pipeline. The same
pinned TypeScript 7 program now supplies its checker to the classifiers.

- `void_promise` requires a structurally callable `then` member. Known
  synchronous `void`, `unknown`, and non-callable `then` values stay out.
  Unresolved call expressions remain conservative candidates.
- initializer, catch-cause, wrapper-constructor, namespace, and `require`
  aliases are keyed by compiler symbol id. Nested same-spelled declarations
  therefore remain distinct.
- a caught error is preserved only through an identity alias after transparent
  TypeScript expression wrappers. Transformations such as `Boolean(caught)` do
  not qualify as `cause`.
- arbitrary identifier/property throws no longer pass. Caught rethrows,
  registry-code properties, and coded constructed-value aliases remain in the
  safe set.
- the zone walker includes `ImportTypeNode`. Classification-list literals are
  checked only in manifest-shaped properties and are exempt only when the
  normalized importer is the real manifest path. Ordinary prose, comments,
  regex literals, and lexically shadowed calls stay out.
- a classified target path is skipped before its entry kind is inspected.
  Every other source-tree symlink closes with `OBS_INVENTORY_SYMLINK`; no link
  is followed and no classified target is read.

The existing finite file-byte, file-count, AST-node, and candidate-count
ceilings remain unchanged.

## Test and mutation evidence

The final focused command passed 17/17 three consecutive times:

```text
pnpm vitest run tests/architecture/fix16-gate.test.ts --reporter=dot
run 1: exit 0, 17 passed
run 2: exit 0, 17 passed
run 3: exit 0, 17 passed
```

One-at-a-time mutants were applied, observed RED, and restored. The suite
killed the syntax-only Promise rule, blanket identifier/property throw rule,
recursive transformed-cause rule, missing import-type branch, global manifest
exemption, silent symlink skip, wrapper spelling table, and `require` spelling
table. It also killed broad every-void, every-throw, no-cause-alias, and
every-string-literal overreach mutants.

## Repository evidence

- Full production scan: exit 0, 375 rows in 10,423 ms; 143 `bare_catch`, 182
  `throw_without_code`, 34 `void_promise`, 16 `wrapper_without_cause`, and 0
  `zone_import`. This remains below the 30,000 ms seed.
- `pnpm typecheck`: the pinned 8 diagnostics in `tests/unit/s14-ui.test.ts` and
  no C1 diagnostic.
- `pnpm audit:source`: the pinned 3 obs installer environment-read blockers and
  no C1 blocker.
- `pnpm audit:text-bytes`: exit 0,
  `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- The focused filesystem probes record no read of a classified target. Static
  checks find no filesystem API in `zone-check.ts` and no source-pattern regex
  classifier in either C1 implementation file.

## Status boundary

This is a C1 worker milestone. C2 remains deferred until FIX-02 through FIX-05
are integrated. No baseline snapshot, root wiring, merge, or V acceptance was
performed or claimed.
