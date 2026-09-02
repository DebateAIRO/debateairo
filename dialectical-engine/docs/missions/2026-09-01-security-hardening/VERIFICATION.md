# VERIFICATION — 2026-09-01 security hardening

Orchestrator ledger (append-only). Baseline receipt: `BASELINE.md` (dev `b5a6b6eb`, Node v25.7.0 host, engines 22.23.1).

## Landed on `security/2026-09-01-hardening` (merge order)
| Lane | Branch | Commits | Focused evidence (from the lane's report) |
|---|---|---|---|
| Hygiene/CI (B2, B3, B7, B8) | security/fix-hygiene-ci | 75ff8757, 5aabcf84, 3b4751ac, 6c6f3511 | repo-hygiene 3/3; dev-compose-loopback + 2 pins 7/7; ci-security-gates 4/4 |
| Baseline + deps (B0, B1) | security/fix-b1-deps | d6c38666, 35cb8bf1 | dependency-floors 6/6; `pnpm audit --audit-level=low` clean; typecheck: only the 8 pre-existing s14-ui errors; architecture 313 passed / 12 failed (identical failing set to baseline); UI node tests 46/46; UI build RED at baseline (DebatePageClient.tsx:1479) — fixed by B20a in the UI-edge lane |
| Production floors (C1) | security/fix-c1-prod-floors | 62f38d08, 6da9ca82 | production-environment-floors 17/17; 12 loader/provider suites 85 passed / 7 failed, all 7 reproduced identically on the untouched base (see below); typecheck: no new errors |
| Custody resolver (B4) | security/fix-b4-custody | 7b70eec5, 15fb413d, b1ec12e8 | dev-custody-root 10/10; six pin files 15/15; eight mutants each caught; typecheck: no new errors |
| API limits + admission (B5, B10) | security/fix-b5-b10-api-limits | c7c5d69d, 55060c8f | api-request-limits 6/6; api-admission-limits 7 + register 3; broad run 21 files 223 passed / 3 failed (all three pre-existing on the base: s7 memory-scope pin, obs-l2-s04-zone ×2); typecheck: no new errors |
| serve.answer encryption handoff (B21) — NOT merged here | security/handoff-b21-serve-answer @ 40d1e3a3 (base b5a6b6eb) | 40d1e3a3 | integration serve-answer-content-encryption 2/2 (RED on base at :244); s6 contract 7/7; s6 unit 15/16 (1 pre-existing REGISTER_VERSION NaN); typecheck: no new errors; patch applies with `git am --3way` on clean b5a6b6eb |
| Supply-chain config (B24a-f, B7b) | security/fix-supply-chain-config | ac8dbef5, a610982f, 643a9d28, baffe9db, 9975e85d, cfe685d9, 29152c08 | dependency-floors 9/9; ci-security-gates 8/8; dev-compose-postgres + loopback pass; `pnpm install --frozen-lockfile` → "Lockfile passes supply-chain policies" / "Already up to date"; gitleaks v8.30.1 sha256 551f6fc8…, postgres:18 digest sha256:4ef4dbc9…, 4 actions SHA-pinned |
| UI edge (B20a, B9, C2+C2b, B23a-d) | security/fix-ui-edge | ef1ce42c, 103ba4cc, 9752e6f2, 57d577fb, 2bb6407a, 2f51543d, 508a3813 | lane killed by the Fable limit before its final report; each commit was a green step per the lane's running notes (build GREEN with AUTH_PRODUCTION_ROUTES_VERIFIED after ef1ce42c); on the merged branch the UI node tests were RED on one stale source pin (authRoutes: USER_TOKEN_COOKIE → readSessionCookie), fixed by the orchestrator; UI node tests green again (exit 0); smoke to be re-run at final verification |
| Migration 0056 (B22) | security/fix-b22-migration-0056 | e18b89a3 | committed after its real-PostgreSQL test went green; the two pin files (p3 principals, s10 erasure evidence) not yet re-run — final verification |
| Dev baseline drift (B20, partial) | security/fix-b20-dev-health | 05c3630e, 2c4485a4, 3862706d, 379dca7a, d15297b8, 90348613 (+1) | pins for auth-front-door-parity, s04, s10-carrier-erasure-red, s14-contract, scaffold; web-only s14-ui cases retired; s13 and the VERIFICATION section still pending |
| Mail hardening (B27 + B25e) | security/fix-b27-mail | 8b8ea406, 30f78c28, 5c59e1ec | fragment tokens; sendmail -t with recipient from headers (RED 6 → 69/69, fan-out guard proven load-bearing by revert); spool pruning (RED 2 → 10/10); affected set 81/81; typecheck exit 0 (Opus lane). Pre-existing load flakes noted: SENDMAIL_TIMEOUT (1 s spawn budget) and the RSS-curve case |
| Provider caps (B26) | security/fix-b26-provider-caps | e957fae1, ac771e7b, 6ab67cff, 795f45b9, 865187a4, 7e3f9668 | packet cap 4/4, ask bound 3/3, backoff 7/7, replay floors 5/5, regression 16/16; typecheck exit 0 (Opus lane, host quiet) |
| VPS baseline (C3) | security/fix-c3-vps | bfe6af0d, 57144284, d38b7511, 4e9935dc | vps-deployment-baseline 22/22 (RED 22/22 ENOENT before); `bash -n` clean on backup.sh and restore-drill.sh; shellcheck not installed on this host (not run); Opus lane |
| API round two (B25a-d) | security/fix-b25-api-round2 | 1eb623e7, 65616740, 495c2ec6, 629effb3, 508d3aa4 | constant 400 envelope repo-wide 2/2; typed 404/414 + frameworkErrors hook 6/6; gapRef bound 7/7; recovery/start admission 14/14; sweep 21 files / 232 tests with only the 3 known pre-existing failures; typecheck 0 errors (Opus lane). Flake noted: registration.test.ts sendmail-options case is load-dependent |
| Crypto bundle (B12 only) | security/fix-crypto-bundle | 63e4d2cc | locale-independent canonical order (L2-F4) landed; B19 hashToken half-done uncommitted in the lane worktree; B13-B17 pending |

## Known baseline failures on dev `b5a6b6eb` (not caused by this mission)
- `pnpm run typecheck`: 8 errors, all `tests/unit/s14-ui.test.ts` (imports of the removed `web/lib/*`). Ruled (live-loop orchestrator, 2026-09-02): retire only the web-only cases (B20).
- `pnpm --filter dialectical-engine-v2ui build`: `app/debate/[id]/DebatePageClient.tsx:1479` type error (last touched 3e7d83e9). Ruled: one-line fix (B20a, UI-edge lane commit ef1ce42c).
- `vitest run tests/architecture`: 8 files / 12 tests — auth-front-door-parity, evaluator-selector-unbound, scaffold (ENOENT on removed `web/` + 3 obs-capture env-read violations), s04, s7, s10, s13, s14 contract drift. Ruled: pure pins may be updated and documented (B20); the 3 obs-capture purity violations must stay RED.
- Also failing at baseline (found by the C1 lane running loader-referencing suites): `obs-l3-s06` ×4, `s6-content-encryption` ×1 (its runner stub omits `REGISTER_VERSION`).

## Dev baseline drift (B20)

Branch `security/fix-b20-dev-health`, merged onto `security/2026-09-01-hardening`.
Every pin carries an inline `// pin updated 2026-09-02: …` comment pointing back here.
Each file below was re-run once, single-file, on the merged tree.

| File | Original failure (BASELINE.md) | Action | After |
|---|---|---|---|
| `tests/architecture/auth-front-door-parity.test.ts` | ENOENT on `web/package.json` and `web/components/LoginFlow.tsx` | Retired the `web/` halves of the parity reads; every `apps/ui` assertion unchanged (`05c3630e`) | 2/2 green |
| `tests/architecture/evaluator-selector-unbound.test.ts` | ENOENT scandir `web/` (root-level `web/` app removed on dev) | Dropped `web` from the workspace source roots; the zero-caller assertion itself unchanged (`c33c775d`) | 1/1 green |
| `tests/architecture/s04-contract.test.ts` | `apps/runner/src/main.ts` no longer names `readClaimTypeCompositionMap` | Pin updated — the loud register read moved into `readDevelopmentRunnerPolicy` (`apps/runner/src/dev-runner-policy.ts`), awaited by `main.ts` at startup; the pin follows that hop (`2c4485a4`) | 3/3 green |
| `tests/architecture/s10-carrier-erasure-red.test.ts` | `packages/liveness` no longer embeds `serve.private_run_erasure_tombstone` | Pin updated — the completed-tombstone filter lives in `core.run_private_content_is_live` (migration 0040), consulted by both carriers' candidate reads before any key load; the pin checks the carriers call it and that the function body consults the tombstone table (`3862706d`) | 13/13 green |
| `tests/architecture/s13-contract.test.ts` | `expected 402 to be less than -1` — the inline `FOR UPDATE` / `ORDER BY run_id FOR UPDATE` literals are gone from `packages/memory/src/index.ts`, so both `indexOf` pins returned -1 | Pin updated — both locks moved into `core.lock_owned_live_runs` (migration 0040), a SECURITY DEFINER function whose body does `ORDER BY run.run_id FOR UPDATE` plus the ownership and private-content-liveness checks. The deterministic sorted-run-id ordering is still asserted at the call site (`12175123`) | 3/3 green |
| `tests/architecture/s14-contract.test.ts` | (1) `apps/ui/lib/types.ts` never imported `@debateai/contract`; (2) FX-ORPH-04 walks the removed `web/` tree; (3) `localeCompare` in `apps/ui/lib/recommendation.ts` | (1) Pin updated — the assertion was mechanically re-pointed from `web/lib/types.ts` at `3e7d83e9`; `apps/ui` keeps V2 presentation types and feeds them through `lib/v3/adapter.ts` (UI-01 / DR-145). (2) Retired; the `apps/ui` port is a follow-up. (3) **Left RED** (`379dca7a`) | 3 passed / 1 RED |
| `tests/architecture/scaffold.test.ts` | ENOENT on `web/package.json` from the `web/` dependency-edge row | Retired that row (28 → 27). **Left RED** on both counts (`90348613`) | 6 passed / 2 RED |
| `tests/unit/s14-ui.test.ts` | 8 typecheck errors from imports of the removed `web/lib/*` | Retired the `projectAnswerSurface` case, its fixture, and the S14/W6/FX-LG-17 live-lifecycle describe (no 1:1 `apps/ui` equivalent). The label, freshness and browser-client cases run against `apps/ui/lib/v3/labels.js` and `apps/ui/lib/api.js`, which are 1:1 (`d15297b8`) | 10/10 green |

### Left RED on purpose

**`scaffold.test.ts` — the three obs-capture env-read purity violations** (ruled: must stay RED).
`expect(report.blocking).toEqual([])` at `tests/architecture/scaffold.test.ts:30`, received:

```text
packages/obs-capture/install/api.ts reads the process environment outside the register loader
packages/obs-capture/install/runner.ts reads the process environment outside the register loader
packages/obs-capture/install/scheduler.ts reads the process environment outside the register loader
```

**`scaffold.test.ts` — three undeclared dependency edges**, surfaced behind the retired `web/` ENOENT row.
`expect(report.violations).toEqual([])` at `tests/architecture/scaffold.test.ts:25`, received:

```text
apps/api -> obs-capture is not a declared edge
apps/runner -> obs-capture is not a declared edge
apps/scheduler -> obs-capture is not a declared edge
```

**`s14-contract.test.ts` — deterministic locale tiebreak.**
`AssertionError: expected 'import type { InvestigationAction, Ma…' not to contain 'localeCompare'` —
a real defect in `apps/ui/lib/recommendation.ts`, owned by the `apps/` lane and out of B20's bounds.

### Known, not touched (reproduced on the untouched base by another lane)

- `obs-l3-s06` ×4
- `s6-content-encryption` ×1 — its runner stub omits `REGISTER_VERSION`

Neither is dev drift in a B20 file; both are recorded above under the known baseline failures.

## Merged-branch checks (orchestrator, security worktree)
- 2026-09-02 12:37 @ 9f6e1dbc: light gates — repo-hygiene, ci-security-gates, dependency-floors, dev-compose-loopback, dev-custody-root, dev-compose-postgres → 6 files 35/35; api-request-limits, api-admission-limits, b10-admission-policy-register, production-environment-floors, provider-gateway-response-cap, crypto → 6 files 47/47; UI node tests exit 0 after the authRoutes pin fix (8e0b0ee0).
- 2026-09-02 12:40 @ 43e5ee06: `pnpm --filter dialectical-engine-v2ui build` GREEN (`AUTH_PRODUCTION_ROUTES_VERIFIED=apps-ui:/login,/sign-up,/verify-email,/enroll-mfa`, middleware 34.4 kB); `node tests/integration/s5-ui-security-smoke.mjs` PASS ("live 200 + 404 nonce CSP, fallback CSP, static API CSP, no image optimizer, trusted-proxy client ip, upgrade teardown"; orphan upgrade socket closed after 1 ms); `pnpm run typecheck` → `tsc --noEmit` with zero errors (host Node v25.7.0, engines warning only).

## Full-suite runs (quiet host only, coordinated with the live-loop orchestrator)
(appended when run: command, host state, tails)

## Interruptions
- 2026-09-02 ~04:00: account 5-hour limit killed 11 lanes (resumed 07:30 by message, worktree state intact).
- 2026-09-02 ~09:20: Fable model limit killed 8 lanes; all completed commits merged into the branch at aa8db8d8; continuation pending V's ruling on model/credits.
