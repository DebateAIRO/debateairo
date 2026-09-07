# FIX-09 C1 round-seventeen rework

Scope: the round-seventeen C1 static-guard completeness finding, its two exact
AST omission mutants, the focused regression, and this report only. The
rework base is `bdb48965814f22a7468f24fcafaa55591b19bafa`. The four-line
round-sixteen product correction is unchanged. This is not V acceptance and
makes no claim about C2-C4, merge readiness, or full FIX-09 completion.

## Review reproduction and root cause

The round-seventeen Sol review passed the production correction but found that
the systemic guard iterated only `sourceFile.statements` and accepted only
top-level `ClassDeclaration` nodes. A derived declaration nested in a function
and a derived `ClassExpression` therefore escaped the guard even though the
recursive ambient-authority walk visited both nodes.

The existing top-level algorithm was first extracted without behavior change;
the committed static authority test remained green. A virtual-filesystem
TypeScript regression then parsed four literal source samples through the same
compiler AST used by the repository guard. Before correction it failed with:

```text
expression_unfrozen=[]
nested_unfrozen=[]
top_level_frozen=[]
top_level_unfrozen=[Top]
```

The independently derived expectation required `expression_unfrozen` to
contain `<anonymous>` and `nested_unfrozen` to contain `Nested`. This reproduced
both omissions without changing a repository source file.

## Correction

- The helper first records only top-level derived class declarations whose
  exact binding is passed to `FREEZE_OBJECT` in the immediately following
  statement.
- It then recursively visits every AST node and reports every derived class
  declaration or class expression not present in that safe set.
- Unsupported nested declarations and class expressions are rejected. The
  three current top-level derived-error constructors remain accepted because
  their exact constructor bindings are frozen immediately.
- The same helper drives both the virtual omission-mutant regression and the
  real static authority guard over `loader.ts`, `canonical.ts`, and
  `custodian.ts`, preventing the two checks from drifting.

No policy product code, bundle, interface, fixture, frozen authority, generated
output, or package state changed.

## RED, GREEN, and verification

- RED: the virtual regression failed 1/1 because both nested and expression
  derived constructors produced empty violation lists.
- GREEN: the virtual/static selection passed 2/2 after recursive traversal.
  Its exact result is `<anonymous>`, `Nested`, no violation for the frozen
  top-level sample, and `Top` for the unfrozen top-level sample.
- The complete focused suite passed 79/79 in each of three consecutive fresh
  processes.
- The three exact live constructor-super attacks passed 3/3 in each of three
  additional fresh processes.
- The authority selection passed 39/39 and the bounded safe-neighbor selection
  passed 11/11.
- `pnpm typecheck` returned only the same eight existing diagnostics in the
  unchanged `tests/unit/s14-ui.test.ts`; no C1 diagnostic appeared.
- The independent hash remains
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- Frozen-interface compilation, contract generation, generated-output diff,
  text-byte audit, forbidden-source scan, static guard, and diff checks retain
  the round-sixteen results.

## Scope

The round-seventeen implementation delta is only this report and
`tests/unit/fix09-bundle.test.ts`; both are regular files. The independent
round-seventeen Sol report remains untracked and unstaged. No `.hermes`, C2-C4,
V acceptance, merge, push, board, or external-state action was performed.

This report records C1 implementation evidence and does not constitute
acceptance of FIX-09.
