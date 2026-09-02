# Baseline receipt — 2026-09-01 security hardening (Task B0)

Captured 2026-09-02 23:40Z, **before any B1 change**, in a fresh worktree
`.worktrees/security-fix-b1-deps` (branch `security/fix-b1-deps`, cut from
`security/2026-09-01-hardening`) provisioned with
`pnpm install --frozen-lockfile --prefer-offline && pnpm run generate:contract`.
Seat check before the heavy step (`ps -Ao command | grep -E '[c]odex exec|[c]laude -p'`):
no seats alive.

## Commit

- `git rev-parse HEAD`: `9de4b07290231d44c077a1f127f96ed1b93b29e9`
  (tip of `security/2026-09-01-hardening`; docs-only commits on top of the audit baseline)
- merge-base with `dev`: `b5a6b6eb97b7b09ee88cd17c2164ff3fbd9b9077`
  (the `b5a6b6eb` code baseline that every Phase A lane audited — no source differs
  between the two commits, only `docs/missions/**`)

## Toolchain (F-09)

- `node --version`: **v25.7.0** — `engines.node` wants `22.23.1`; pnpm only warns
  (`[WARN] Unsupported engine`). Every receipt below was gathered on 25.x; CI pins 22.23.1 (B7).
- `pnpm --version`: **11.20.0**

## `pnpm run typecheck` — RED on the untouched baseline (pre-existing; not fixed by B0/B1)

Exit code 1. Last 15 lines (the whole output is 11 lines):

```text
[WARN] Unsupported engine: wanted: {"node":"22.23.1"} (current: {"node":"v25.7.0","pnpm":"11.20.0"})
$ tsc --noEmit
tests/unit/s14-ui.test.ts(19,8): error TS2307: Cannot find module '../../web/lib/v3Presentation.js' or its corresponding type declarations.
tests/unit/s14-ui.test.ts(122,38): error TS18046: 'label' is of type 'unknown'.
tests/unit/s14-ui.test.ts(128,71): error TS18046: 'label' is of type 'unknown'.
tests/unit/s14-ui.test.ts(199,18): error TS2339: Property 'nodes' does not exist on type '{ event_id: string; event_type: "graph.cycle_refused" | "graph.edge_added" | "honesty.abstention_typed" | "honesty.budget_skip_marked" | "honesty.fallback_labeled" | "honesty.investigation_gap_opened" | ... 22 more ... | "serve.recompose_or_defect"; run_ref: string; subject_ref?: string | ... 1 more ... | undefined;...'.
tests/unit/s14-ui.test.ts(200,18): error TS2339: Property 'placeholderEdges' does not exist on type '{ event_id: string; event_type: "graph.cycle_refused" | "graph.edge_added" | "honesty.abstention_typed" | "honesty.budget_skip_marked" | "honesty.fallback_labeled" | "honesty.investigation_gap_opened" | ... 22 more ... | "serve.recompose_or_defect"; run_ref: string; subject_ref?: string | ... 1 more ... | undefined;...'.
tests/unit/s14-ui.test.ts(230,58): error TS2307: Cannot find module '../../web/lib/api.js' or its corresponding type declarations.
tests/unit/s14-ui.test.ts(232,55): error TS7006: Parameter 'input' implicitly has an 'any' type.
tests/unit/s14-ui.test.ts(232,62): error TS7006: Parameter 'init' implicitly has an 'any' type.
[ELIFECYCLE] Command failed with exit code 1.
```

All 8 errors sit in `tests/unit/s14-ui.test.ts` and come from the removed `web/`
workspace member (`../../web/lib/v3Presentation.js`, `../../web/lib/api.js` no longer
exist). Recorded verbatim; left untouched.

## `pnpm exec vitest run tests/architecture` — RED on the untouched baseline (pre-existing; not fixed by B0/B1)

Exit code 1. Summary: **Test Files 8 failed | 41 passed (49); Tests 12 failed | 307 passed (319)**.
Last 15 lines:

```text
     27|   it("enforces purity, one provider gateway, source-constant, exhausti…
     28|     const report = await auditSourceRules();
     29|     expect(report.blocking).toEqual([]);
       |                             ^
     30|   });
     31|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/12]⎯


 Test Files  8 failed | 41 passed (49)
      Tests  12 failed | 307 passed (319)
   Start at  02:40:32
   Duration  29.76s (transform 459ms, setup 0ms, import 3.67s, tests 18.93s, environment 3ms)

```

Failing tests, verbatim (`FAIL` lines of the default reporter):

```text
FAIL  tests/architecture/auth-front-door-parity.test.ts > auth front-door parity > uses one exact four-route production-manifest gate from both Next builds
FAIL  tests/architecture/auth-front-door-parity.test.ts > auth front-door parity > pins the same supported auth state machines and excludes invented affordances
FAIL  tests/architecture/evaluator-selector-unbound.test.ts > evaluator selectors dark launch > has zero callers in every workspace source root while evaluator dispatch is UNBOUND
FAIL  tests/architecture/s04-contract.test.ts > S04 DDL and runtime attachment contract > DR-128 mints only the claim-type composition structure and wires a loud register read
FAIL  tests/architecture/s10-carrier-erasure-red.test.ts > S10 carrier erasure — RED acceptance contracts > filters completed private tombstones before any external key load
FAIL  tests/architecture/s13-contract.test.ts > S13 / cross-run memory architecture > lands append-only memory carriers without a closure job or embedding dependency
FAIL  tests/architecture/s14-contract.test.ts > S14 / AC-59..61 / W19 — native UI contract > uses the generated contract client for both browser and SSR with no V2 wire mirror
FAIL  tests/architecture/s14-contract.test.ts > S14 / AC-59..61 / W19 — native UI contract > FX-ORPH-04 walks web consumers in both directions and rejects the death-list inventory
FAIL  tests/architecture/s14-contract.test.ts > S14 / AC-59..61 / W19 — native UI contract > carries the S04 orphan-audit wording fix and deterministic locale tiebreak
FAIL  tests/architecture/s7-authorization-contract.test.ts > Accounts S7 ownership architecture > hardens every immutable memory scope carrier and derives it from run ownership
FAIL  tests/architecture/scaffold.test.ts > P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law > matches all 28 dependency-edge rows and structural rules 1–5
FAIL  tests/architecture/scaffold.test.ts > P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law > enforces purity, one provider gateway, source-constant, exhaustive-switch and labeled-number gates
```

## `pnpm audit` — summary

Exit code 1.

```text
8 vulnerabilities found
Severity: 1 low | 3 moderate | 4 high
```

Advisory rows (package / vulnerable / patched / path), in report order:

| # | Sev | Package | Vulnerable | Patched | Path |
|---|---|---|---|---|---|
| 1 | high | sharp | <0.35.0 | >=0.35.0 | `apps__ui>next>sharp` |
| 2 | high | postcss | <=8.5.11 | >=8.5.12 | `apps__ui>next>postcss` |
| 3 | low | nanoid | <3.3.18 | >=3.3.18 | `.>vitest>@vitest/mocker>vite>postcss>nanoid` |
| 4 | high | postcss | <=8.5.17 | >=8.5.18 | `apps__ui>next>postcss` |
| 5 | moderate | esbuild | <=0.24.2 | >=0.24.3 | `.>drizzle-kit>@esbuild-kit/esm-loader>@esbuild-kit/core-utils>esbuild` |
| 6 | moderate | postcss | <8.5.10 | >=8.5.10 | `apps__ui>next>postcss` |
| 7 | high | postcss | <=8.5.22 | >=8.5.23 | `apps__ui>next>postcss` |
| 8 | moderate | esbuild | >=0.27.3 <0.28.1 | >=0.28.1 | `.>drizzle-kit>tsx>esbuild` |

Lockfile state at baseline: `next@15.5.23`, `postcss@8.4.31` + `8.5.26`, `sharp@0.34.5`,
`nanoid@3.3.17`, `esbuild@0.18.20` / `0.25.12` / `0.27.7` / `0.28.1`; stale `web:` importer at
`pnpm-lock.yaml:708`; nested `apps/ui/pnpm-lock.yaml` tracked; `web/` directory absent from the
tree (the orphan `web/node_modules/` named in F-06 exists only as an untracked directory in the
main checkout).
