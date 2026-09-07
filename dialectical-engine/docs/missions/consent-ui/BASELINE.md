# BASELINE — mission `consent-ui` (measured 2026-09-06 17:07 EEST by the orchestrator, in BOTH clean lanes, with the exact commands the lanes run)

Base commit `2b670d30` (`dev`). Lanes: `.worktrees/consent-s01/dialectical-engine` (branch `slice/consent-s01`) and `.worktrees/consent-s02/dialectical-engine` (branch `slice/consent-s02`); 30 `node_modules` trees APFS-cloned from the main checkout (never symlinked); `pnpm run generate:contract` exit 0 leaving `git status --porcelain` at 0 entries; `packages/contract/generated/client.ts` present. Logs: `.hermes/reports/consent-ui/logs/setup-consent-s0{1,2}.log`. Both lanes measured IDENTICAL figures.

## The pin — assert the DELTA, never the absolute

| Command (from the lane's `dialectical-engine/`) | Result at base | Whose |
|---|---|---|
| `pnpm typecheck` | exit 1, **8 diagnostics, all in `tests/unit/s14-ui.test.ts`** (2×TS2307, 2×TS18046, 2×TS2339, 2×TS7006) | ui-overhaul's (`docs/missions/observability-agents/TYPECHECK-BASELINE.md`) — never repair |
| `pnpm exec vitest run tests/render/auth-flow-integration.test.tsx` | exit 0, `Tests 17 passed (17)` | must stay 17+ passed; S02 updates the sign-up submit cases (it ticks `adult-affirmed` only) |
| `pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts` | exit 1, `Tests 2 failed | 6 passed (8)` — the two failures are PRE-EXISTING: (1) `renders one accessible toggle that reads the document mode, flips it, and persists it` — expects the label `☀ Terracotta`, `apps/ui/components/ModeToggle.tsx:41` renders `☀`/`☾` only; (2) `leaves no mode-inert colour literal in the four Wave-0 product files` — exactly ONE hit, `apps/ui/app/globals.css:6096` (lane numbering) `.drawerScrim[data-drawer-scrim] { background: color-mix(in srgb, #0a0806 32%, transparent); }` | ui-overhaul's — never repair; **your gate is: the hit list stays exactly that one line (line number may shift), and the other six tests stay green** |

## Rules this pin creates
1. Run `pnpm run generate:contract` before `pnpm typecheck`, and say you did.
2. A seat reports `pnpm typecheck` as "no diagnostic outside the pin" — never "green".
3. The colour-literal gate is reported as the received hit list; one new hit = your finding, the pinned one is not.
4. Positively assert zero module-resolution escape from the lane (a matching count is not containment).
5. The main tree carries unrelated uncommitted edits (`apps/ui/components/NodeDetailDrawer.tsx`, `apps/ui/lib/v3/adapter.ts`, `tests/unit/v2ui-data-layer.test.ts`) that the lanes do NOT have — expected; they are preserved at merge time by V, not by any seat.

## Addendum 2026-09-06 17:35 — found by REQ-01, re-measured by the orchestrator in lane consent-s01
| Command | Result at base | Whose |
|---|---|---|
| `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts` | exit 1, `Tests 2 failed (2)` — both `ENOENT` on `web/package.json` / `web/components/LoginFlow.tsx` (the `web/` app was deleted 2026-09-01; `git ls-files web/` = `web/next.config.mjs` only) | ui-overhaul's — never repair; the gate is "still exactly those two ENOENT failures" |
| `pnpm exec vitest run tests/unit/v2ui-node-runner.test.ts` | exit 0, `Tests 2 passed (2)` — runs `apps/ui/components/authRoutes.source-test.mjs`, whose line 48 forbids `/localStorage|sessionStorage|Bearer|Google|Model API|terms|privacy notice/i` in `SignUpFlow.tsx` and whose line 165 pins the sign-up form count at 3 | LIVE guard — S02 keeps it green: policy content, storage access and the words "privacy notice" live outside `SignUpFlow.tsx`; no second `<form>` |
| `tests/render/t3-library.test.tsx:236` | requires `<TopBar />` to be the first child of `div.appShell` | LIVE guard — the consent mount goes AFTER `{children}` in `layout.tsx` |
Product cookies actually set: `__Host-debateai-session` and `__Host-debateai-csrf` (`apps/api/src/index.ts:169-170`); the five names in the design's 10b detail lines (`de_session · de_mfa · de_device`, `de_quality`, `de_analytics`) exist nowhere in the product — contested row for V (REQ-01 finding 1).

## Addendum 2026-09-06 20:15 — found by ARCH-S01 (F1), re-measured by the orchestrator in lane consent-s02
| Command | Result at base | Whose |
|---|---|---|
| `pnpm exec vitest run tests/render/t3-library.test.tsx` | exit 1, `Tests 4 failed | 11 passed (15)` — all four in its `lists` describe; the two assertions S01 depends on (`appShell` direct-child shape, `:231-237`) are GREEN | ui-overhaul's — never repair; a gate on this file is NAME-based (the named passing tests stay passing), never the whole-file summary |
| `pnpm exec vitest run tests/render/t9-landing.test.tsx` | exit 0, `Tests 16 passed (16)` | green; whole-file summary is lawful |
**Class rule (ARCH-S01):** a baseline covers every file a plan CONSTRAINS ("must stay green"), not only every file it CHANGES. Any packet or SPEC sentence ordering a red-at-base file to "stay green" is a defect; the gate is the named-test delta.


## Addendum 2026-09-06 23:50 (orchestrator) — moving pins on the S01 lane
- `tests/unit/t9-mode-tokens.test.ts` on `slice/consent-s01` since C1 (91a090ea): **9 tests, 2 failed | 7 passed** — the same two pre-existing failures by name; the seventh green test is S01-S03's composite-contrast pin. The pinned colour-literal hit is the one `.drawerScrim` line, now at `globals.css:6112` (was `:6096`) because C1 added 16 token lines above it. The base pin (8 tests at 2b670d30) stands for the main tree and for `slice/consent-s02` until the S01 merge.
- `tests/render/auth-flow-integration.test.tsx` on `slice/consent-s02-form` since C4 (fb44696d): **18 passed (18)** — 17 base + the R18 pin.

- `slice/consent-s02` at the merged head 68f3ea33 (C1 fix + form chain): `tests/render/consent-modal-semantics.test.tsx` **17 passed (17)** (was 10 at 8fe1e0bc); `tests/render/auth-flow-integration.test.tsx` **18 passed (18)**; `consent-signup-group` 28/28; `consent-signup-gate` 32/32 (as measured by CODE-REV-S02-C3C4 at fb44696d). The main-tree base pins (2b670d30) are unchanged.

- (CODE-REV-S01-C3C4 r1 N9, orchestrator addendum 2026-09-07 00:20) Three suites that READ `globals.css` are RED at base 2b670d30 and are unaffected by the S01 block (measured with/without by the author and the reviewer): `tests/unit/pda-s03-keyboard-accessibility.test.ts` 2 failed | 3 passed (5); `tests/unit/v2ui-pages.test.ts` 5 failed | 36 passed (41); `tests/architecture/role-token-map.test.ts` 3 failed | 46 passed (49). Name-based gates; a NEW failure name in any of them is a finding against the change under review.

### Addendum 2026-09-07 00:55 — `apps/ui/app/settings/page.tsx` consumers (orchestrator, from CODE-S01-C5's before/after measurement on `slice/consent-s01` at `fd8250c0` → `d5e217f7`; CODE-S01-C5 handoff D4)
Four suites read the settings page and were absent from this baseline although S01-C5's allowed list edits that file. Measured identical before and after the edit: `tests/render/s5-session-controls.test.tsx` 2 passed (2) · `tests/render/s9-legacy-claim-controls.test.tsx` 3 passed (3) · `tests/unit/s10-erasure-ui.test.ts` 3 passed (3) · `tests/unit/evaluator-dev-menu-ui.test.ts` 2 passed (2). Rule extended (COMMON §10.14's class, one step out): a baseline covers every file a cluster may EDIT, not only the files a plan constrains.

## Addendum 2026-09-07 05:10 — suite SETS pinned by command (COMMON §10.49; CODE-REV-S02-C9 r1 P2 / CODE-S02-C9 F4)
- **The "sixteen consent files" set** = `npx vitest run tests/render/consent-*.test.tsx tests/unit/consent-*.test.ts tests/render/auth-flow-integration.test.tsx tests/unit/v2ui-node-runner.test.ts` (14 files match the globs; the two named files complete the set). Figures as REPORTED by seats (each re-measured by its blind reviewer): base 19cc8e77 `1 failed | 178 passed (179)` (the S01-C3 end-of-file case, relaxed by C9) · 2127c4ad `Test Files 16 passed (16) / Tests 181 passed (181)` (CODE-S02-C9, confirmed by CODE-REV-S02-C9 r1 ×3) · bd314084 `Test Files 16 passed (16) / Tests 185 passed (185)` (CODE-CROSS-01, confirmed by CODE-REV-CROSS-01 r1 ×3). · c334136d `Test Files 17 passed (17) / Tests 193 passed (193)` — the glob now matches SEVENTEEN files, the new `tests/render/consent-cross-slice.test.tsx` (CODE-CROSS-02, confirmed by CODE-REV-CROSS-02 r1 ×3; `run_c9` vitest half 110/110). · 4ef2f7d3 `Test Files 17 passed (17) / Tests 195 passed (195)` (CODE-CROSS-03, confirmed by CODE-REV-CROSS-03 r1 ×3; `run_c9` vitest half 112/112).
- **CLAIMED — UNVERIFIED figures** now live in `BASELINE-CLAIMED.md` (COMMON §10.69) — a file no review packet lists.
- **t9 at the merged lane:** `2 failed | 7 passed (9)` — the two pre-existing failures by name, hit list exactly ONE element at `globals.css:6116` (the pinned `.drawerScrim` line; was :5943 before the S02 block).
