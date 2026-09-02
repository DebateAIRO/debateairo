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

## Known baseline failures on dev `b5a6b6eb` (not caused by this mission)
- `pnpm run typecheck`: 8 errors, all `tests/unit/s14-ui.test.ts` (imports of the removed `web/lib/*`). Ruled (live-loop orchestrator, 2026-09-02): retire only the web-only cases (B20).
- `pnpm --filter dialectical-engine-v2ui build`: `app/debate/[id]/DebatePageClient.tsx:1479` type error (last touched 3e7d83e9). Ruled: one-line fix (B20a, UI-edge lane commit ef1ce42c).
- `vitest run tests/architecture`: 8 files / 12 tests — auth-front-door-parity, evaluator-selector-unbound, scaffold (ENOENT on removed `web/` + 3 obs-capture env-read violations), s04, s7, s10, s13, s14 contract drift. Ruled: pure pins may be updated and documented (B20); the 3 obs-capture purity violations must stay RED.
- Also failing at baseline (found by the C1 lane running loader-referencing suites): `obs-l3-s06` ×4, `s6-content-encryption` ×1 (its runner stub omits `REGISTER_VERSION`).

## Dev baseline drift (B20)
(filled by the B20 lane: per file — original failure, action taken, what remains RED and why)

## Full-suite runs (quiet host only, coordinated with the live-loop orchestrator)
(appended when run: command, host state, tails)
