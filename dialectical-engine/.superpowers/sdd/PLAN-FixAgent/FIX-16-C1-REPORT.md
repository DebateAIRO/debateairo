# FIX-16 C1 implementation report

Date: 2026-09-04

Branch: `codex/oa-fix-16`

Base: `dev` at `2b670d3059c60d7262cf655bd5d402c88100dff3`

## Scope

C1 only: TypeScript compiler-AST inventory classification in
`tools/obs-inventory/src/scan.ts`, importer-text-only zone classification in
`tools/obs-inventory/src/zone-check.ts`, and focused architecture fixtures and
tests. No baseline snapshot, CLI/index, package script, product source, frozen
slice artifact, or C2 file was created or changed.

## Design result

- The scanner emits `{path, line, class}` rows for unclassified throws, bare
  catches, discarded promise calls, cause-losing `TypedDomainError` wrappers,
  and governed zone imports.
- Throw, catch, void, wrapper, import, export, dynamic-import, and require
  syntax is traversed through the TypeScript 7 compiler AST. Source-pattern
  regular expressions are not used.
- Wrapper import aliases, constructor aliases, caught-error aliases, explicit
  cause objects, observed promise chains, nonliteral imports, and declared-code
  throws have focused positive and negative coverage.
- Zone matching resolves relative traversal, separator variants, workspace
  aliases, source/compiled extensions, query strings, and fragments without
  probing the resolved target. Findings carry only the importing path.
- The classification list is imported from the lawful manifest data. The real
  manifest's own literal entries produce no finding.
- File bytes, AST nodes, candidate sites, and file count have finite limits;
  invalid limits and syntax fail closed.

## TDD evidence

Initial focused command, before either implementation file existed:

```text
pnpm vitest run tests/architecture/fix16-gate.test.ts
exit 1 — ERR_MODULE_NOT_FOUND ../../tools/obs-inventory/src/scan.js
```

First semantic run exposed TypeScript 7's version-only root export. The scanner
was moved to `typescript/unstable/sync` plus `typescript/unstable/ast`, the
compiler API shipped by the pinned 7.0.2 package. A later semantic run isolated
one caught-alias scope propagation defect; the focused test stayed red until
that root cause was corrected.

Current focused result before the final verification block: 10/10 tests pass.

## Mutation evidence

Each mutant was applied alone, the focused command exited 1, and exact source
was restored before the next mutant.

| Mutant | Killed by |
|---|---|
| Treat every manifest string literal as an import | real manifest exemption test |
| Suppress `throw_without_code` | four-class fixture test |
| Suppress `bare_catch` | four-class fixture test |
| Suppress `void_promise` | four-class fixture test |
| Suppress `wrapper_without_cause` | four-class and alias tests |
| Suppress `zone_import` | module-form and traversal tests |
| Reject a preserved caught cause | clean fixture and alias safe neighbor |
| Reject an observed promise chain | clean fixture safe neighbor |
| Reject every declared-code throw | clean fixture safe neighbor |
| Apply the zone rule outside governed importers | out-of-scope safe neighbor |

## Tree and standing-gate evidence

- The final focused verification ran three times; every run reported 1/1 test
  file and 10/10 tests passing.
- A real production-root scan emitted 363 grandfatherable C1 rows in 8,759 ms:
  143 bare catches, 170 unclassified throws, 34 discarded promises, and 16
  cause-losing wrappers. It emitted zero zone imports.
- `pnpm generate:contract` exited 0 and left generated output unchanged.
- `pnpm typecheck` reported exactly the pinned eight diagnostics in
  `tests/unit/s14-ui.test.ts`; it reported zero C1 diagnostics.
- TypeScript resolution recorded 5,640 successful resolutions and zero escape
  from this worktree into the main checkout.
- `pnpm audit:source` reported exactly the pinned three observation installer
  environment-read blockers and no C1 blocker.
- `pnpm audit:text-bytes` exited 0 with `REPOSITORY_TEXT_CONTROL_BYTES=0`.

## Status boundary

This report records a C1 worker milestone. C2, the baseline snapshot, package
wiring, and V's five acceptance steps remain unperformed and unclaimed.
