# FIX-16 — The CI inventory gate: a new unclassified throw, bare catch, discarded promise or cause-losing wrapper fails the build, and the zone stays machine-checked

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G1 capture** (tail) · Depends-on for dispatch: none (own tool subtree) · Depends-on for acceptance: **FIX-02, FIX-03, FIX-04, FIX-05 merged** — the baseline snapshot must be taken AFTER the binding wave or their rewrites read as post-baseline violations (H5-05).
Absorbs predecessor tickets: **S12 `t_a0ce760a`** (CI inventory gate + checked-in baseline) · **S13** (D19 build repoint) is ALREADY TRUE on `dev` — root `package.json` `build` runs `pnpm --filter dialectical-engine-v2ui build` and `web/` was deleted 2026-09-01 — recorded as satisfied, no work. Stage-16 D6 finding (`logs/d12-demo-2026-09-01.log` stage 16): the gate MUST treat `packages/obs-capture/src/zone/manifest.ts` as lawful path-string data (predecessor GLOBAL-FORBID: "referenced only as path-string data in the D03 manifest, never as an import"); AUDIT-STATE charge D rules the demo's own line.
D-criteria evidenced: **D6** (machine-checked — no import of a zone path by any obs artifact), **D2** (cause-losing wrappers cannot return unnoticed).
Seam obligations: none. OBS-R021/R022/R023 bind.

## 1. Intent
556 `throw new`, 176 `catch`, 56 bare `catch {` were measured on the tree (VerticalSlices §1 S12). A "clean tree" gate is unachievable; a "no NEW violation" gate is. FIX-16 grandfathers the inventory and fails only post-baseline entries, and it is the machine check that keeps every future FixAgent-authored change inside D6.

## 2. Requirements
- **FIX-16-R01** `tools/obs-inventory/**` scans `apps/ packages/ tools/ acceptance/` for: `throw` sites without a registry code, bare `catch {`, `void <promise>` at production async boundaries, and wrappers constructing a `TypedDomainError` without passing `cause` when a caught error is in scope; it emits a machine-readable inventory.
- **FIX-16-R02** A checked-in baseline snapshot grandfathers every pre-existing entry; the gate FAILS with `path:line` on any entry not in the baseline and PASSES on the baseline itself.
- **FIX-16-R03** The baseline is snapshotted after FIX-02/03/04/05 merge and its commit is recorded in DECISIONS.md; re-baselining is a V-approved act.
- **FIX-16-R04** Zone check: the gate fails on any `import`/`require`/dynamic import of a zone manifest prefix from any file under `packages/obs-capture/**`, `tools/obs-listener/**`, `acceptance/obs/**`; string literals in `packages/obs-capture/src/zone/manifest.ts` are exempt by construction (they are the classification list); the gate never reads, stats or lists a zone file — it reads only the non-zone files it scans.
- **FIX-16-R05** The gate is wired into root `lint` by one edit on the `lint-wiring` line of `package.json` (TP-6); its own script `pnpm audit:obs-inventory` exits 0/1 independently of `audit:source` (V-6 keeps `audit:source` red for obs until ruled — the inventory gate's verdict must not be masked by it).
- **FIX-16-R06** The gate runs in under `obs.inventoryGateMs` (seed 30 000 ms) on this tree.
- **FIX-16-R07** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Entry: `BASELINE` | `NEW(violation)`; gate: `PASS` | `FAIL(path:line, class)`.

## 4. Copy and vocabulary
"baseline" (the grandfathered inventory) · "new violation" · "cause-losing wrapper". Never "clean tree".

## 5. Acceptance — V runs this personally (FIX-02..05 merged)
1. `pnpm audit:obs-inventory; echo "exit=$?"` → `PASS baseline=<n> new=0`, `exit=0`.
2. `printf 'export function f(){ try { return 1; } catch {} }\n' > apps/scheduler/src/zz-scratch.ts; pnpm audit:obs-inventory; echo "exit=$?"; rm apps/scheduler/src/zz-scratch.ts` → `FAIL apps/scheduler/src/zz-scratch.ts:1 bare_catch`, `exit=1`.
3. `printf 'import "../../../apps/api/src/registration.js";\n' > packages/obs-capture/src/zz-scratch.ts; pnpm audit:obs-inventory; echo "exit=$?"; rm packages/obs-capture/src/zz-scratch.ts` → `FAIL packages/obs-capture/src/zz-scratch.ts:1 zone_import`, `exit=1` (the gate names the importing file only; it never touched the imported path).
4. `pnpm audit:obs-inventory` again → `PASS`, `exit=0`; `git status --porcelain | grep -c zz-scratch` → `0`.
5. `grep -n 'audit:obs-inventory' package.json` → present on the `lint` line and as its own script.
V vetoes Done only after steps 1–5 match.

## 6. Out of scope
The `audit:source` remedy (V-6) · fixing any baseline entry · `web/` (deleted) · the D12 demo's stage-16 rule (owned by `t_40c2cc1b`; AUDIT-STATE charge D).

## 7. File surface (single-writer) and parallel safety
Allowed: `tools/obs-inventory/**` (new, incl. the baseline artifact) · root `package.json` line `lint-wiring` + one new `audit:obs-inventory` script line · tests `tests/architecture/fix16-*.test.ts`.
Read-only: the tree it scans (never a zone file).
Forbidden: root `package.json` `build` line · every non-root `package.json` · `tools/orphan-audit/**` (floor-deny; V-6) · any product source.
Parallel-safe with: every other slice (own subtree; the root `package.json` line is touched by no other FIX slice). Acceptance order: after FIX-02..05.
