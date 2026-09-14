# FIX-16 C1 Sol review

Date: 2026-09-04

Commit: `da0a2ddd21db29e8b3e2abc3e4f62040e01a5940`

Base: `2b670d3059c60d7262cf655bd5d402c88100dff3`

## Findings

### [P1] `void_promise` does not determine whether the operand is a promise

`tools/obs-inventory/src/scan.ts:260-275,336-341`

`isPromiseCandidate` treats every call expression as a promise and no other
expression as one. The adversarial safe neighbor `function sync(): void {}
void sync();` therefore emits `void_promise`, while the harmful source
`declare const pending: Promise<void>; void pending;` emits no finding. The
implementation does not identify a Promise/PromiseLike value or a production
async boundary, so it cannot accurately implement FIX-16-R01's discarded
promise class.

### [P1] A bare identifier or property throw bypasses `throw_without_code`

`tools/obs-inventory/src/scan.ts:154-166`

`thrownExpressionCarriesCode` returns true for every identifier, property
access, and element access without checking whether the value carries a
registry code. `const message = "ordinary text"; throw message;` produced no
finding. This lets a new unclassified throw pass the eventual baseline gate.
A caught-error rethrow needs binding-aware treatment; arbitrary identifiers
cannot be accepted as coded throws.

### [P1] Any expression containing the caught value is accepted as `cause`

`tools/obs-inventory/src/scan.ts:217-225,232-257`

Cause lineage is a recursive textual reference test. In the harmful probe
`const booleanOnly = Boolean(caught); new TypedDomainError("WRAP_FAILED",
"fixed", { cause: booleanOnly })`, `booleanOnly` is marked as a caught-cause
alias and the wrapper emits no finding. A boolean derived from an error is not
the caught error and does not preserve the error as `cause`; this is the exact
cause-losing behavior FIX-16-R01 is meant to inventory.

### [P1] TypeScript import-type syntax bypasses the zone gate

`tools/obs-inventory/src/zone-check.ts:165-180`

The visitor handles declarations, re-exports, import-equals declarations, and
runtime calls, but not `ImportTypeNode`. The governed source `type Registration
= import("apps/api/src/registration.ts").Registration;` emitted no
`zone_import`. TypeScript resolves this module and can read the classified
target during compilation, so it violates the no-zone-touch property even
though it is erased at runtime.

### [P1] The manifest-literal exemption is global, not exact-source-only

`tools/obs-inventory/src/zone-check.ts:108-180`

There is no exact-path exemption for
`packages/obs-capture/src/zone/manifest.ts`. Instead, arbitrary string
literals are universally ignored unless they occur in recognized module
syntax. Copying `"apps/api/src/registration.ts"` into
`packages/obs-capture/src/not-manifest.ts` as a manifest-like classification
literal emitted no finding. The live C1 review contract exempts these literals
only in the exact manifest source; governed lookalikes must not receive the
same exemption.

### [P1] Symlinked source files are silently outside the inventory

`tools/obs-inventory/src/scan.ts:430-444`

The walker processes only `Dirent.isDirectory()` and `Dirent.isFile()`.
Symlinks satisfy neither branch and are skipped without a closed failure. An
ephemeral production-root fixture with `apps/linked.ts` symlinked to a source
containing `throw new Error("ordinary text")` returned an empty inventory.
A committed symlink can therefore bypass all four source classifications. The
scanner can reject symlinks without following them, preserving the rule that
zone targets are never touched.

### [P2] Wrapper aliases are collected by spelling rather than lexical binding

`tools/obs-inventory/src/scan.ts:108-118,169-214`

Initializer and constructor alias tables are file-global name maps. A local
class shadowing an imported `TypedDomainError as DomainError` was still
classified as the imported wrapper inside a catch. Conversely, same-spelled
initializers in nested scopes can replace the initializer used elsewhere.
The focused test says it uses AST bindings, but the implementation does not
resolve symbols or respect shadowing, producing unstable false positives and
false negatives in nested scopes.

### [P2] `require` aliases also ignore lexical shadowing

`tools/obs-inventory/src/zone-check.ts:112-145`

`require` is seeded as a global alias and every same-spelled identifier call is
treated as module loading. `function local(require) { return
require("apps/api/src/registration.ts"); }` emitted `zone_import` even though
the parameter shadows CommonJS `require`. This makes the zone verdict depend
on spelling rather than the call binding.

## Verdict

- **SPEC: REWORK** — central R01 and R04 cases have both false negatives and
  false positives, including direct gate bypasses.
- **CODE QUALITY: REWORK** — the AST traversal is bounded and deterministic,
  but its global name maps and syntax-only promise/cause inference do not meet
  the claimed binding accuracy.

## Verification evidence

- Focused command: `pnpm vitest run tests/architecture/fix16-gate.test.ts`
  passed **10/10 three consecutive times**; durations were 1.01 s, 0.957 s,
  and 0.962 s.
- Full production scan: **363** rows in **8,777 ms** — 143 `bare_catch`, 170
  `throw_without_code`, 34 `void_promise`, 16 `wrapper_without_cause`, and 0
  `zone_import`; below the 30,000 ms seed.
- Importer-only filesystem spy over the full tree recorded 364 injected-FS
  operations and **zero operations whose addressed path was a classified zone
  path**. Relative traversal, separator normalization, optional `require?.()`,
  static import, re-export, dynamic import, require alias, and import-equals
  positives worked. Comments, regex literals, template prose, and nonliteral
  dynamic imports stayed out.
- Bounds/path checks closed with `OBS_INVENTORY_FILE_LIMIT`,
  `OBS_INVENTORY_PATH_ESCAPE`, and `OBS_INVENTORY_LIMIT_INVALID`; malformed
  syntax is covered by the focused suite.
- Mutation checks in an isolated detached worktree killed a harmful
  `bare_catch` suppression mutant (9/10) and a safe-neighbor broad-`void`
  mutant (6/10); the restored detached copy returned to 10/10.
- `pnpm typecheck` reproduced the pinned eight unrelated diagnostics, all in
  `tests/unit/s14-ui.test.ts`, with no C1 diagnostic.
- `pnpm audit:source` reproduced the pinned three installer environment-read
  blockers; `pnpm audit:text-bytes` passed with
  `REPOSITORY_TEXT_CONTROL_BYTES=0`; `git diff --check` was clean.

## Scope check

The commit adds only `tools/obs-inventory/src/{scan,zone-check}.ts`, the focused
`tests/architecture/fix16-gate.test.ts`, FIX-16 fixtures, and the implementation
report. It does not add or modify a baseline, CLI/index, package manifest,
product source, frozen SPEC/DECISIONS/PLAN, `tools/orphan-audit/**`, or any C2
surface.
