# DISC-01 Codex handoff — discovery panel / DR-181 and DR-182

## Spine

- Board/ticket: `debateai-v3` / `t_1589a6cc`
- Worker session: `01a00087-e61c-7012-9e1c-5b3d18a4ecb6`
- Assignment: first pass; peer review required (dual diamond)
- Basis read in full: goal packet, coding-loop protocol, heartbeat protocol and adapter, authorized DR-181 architecture plan, Grok authorization verdict, and ledger DR-181/DR-182.
- Workspace note: Hermes supplied an empty, non-git scratch workspace. Work was therefore performed in the user-supplied clean repository root. No branch, commit, push, standing-stack control, evaluator, or API key operation was performed.

## Outcome

DISC-01 is implemented. Askers no longer submit a maker count. Admission discovers an N-generic panel from fresh probe evidence, re-probes only stale providers, persists the frozen panel, derives its count, and computes a structural attempt ceiling from engine-owned facts. Claim-time identity gaps get one immediate probe, append `ABSENT` evidence, shrink the effective panel, disclose the loss, and continue when at least one lineage survives. An empty claim panel stops with `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM` before provider work.

Mono-lineage runs serve with `SINGLE-LINEAGE` and `CRITIQUE-UNAVAILABLE`, disclose `MONO_LINEAGE_DEPTH_NOT_EXPANDED:requested_depth=N`, and use the already-ruled immediately-lower band through `applyCriticUnavailableCap` (`FULL` to `CAPPED` in the standing order). No new unruled cap literal was introduced.

The retired M/envelope apparatus and `/new` controls are gone from shipped source. The acceptance Codex shim now performs `codex exec --json` startup discovery, reads the emitted `thread.started` identity, and resolves exactly one model ID from that thread's persisted `turn_context`; it never invents a model field in CLI stdout or hardcodes the discovered lineage.

## Change inventory

- Discovery/runtime: added `acceptance/discovery.ts`; rewired acceptance startup, relay composition, register seeding, claim duration, model shim, fixtures, and documentation.
- Persistence: added `migrations/0022_dr181_discovery.sql`, append-only `core.provider_probe`, frozen `core.run.discovered_panel`, and `run_panel_count_identity`; repository writes derive `agent_count` from the panel.
- Product path: rewired API admission, runner claim probes/disclosures, budget/register ceiling reads, critique cap, contract, v2 UI, and legacy web `/new` flow.
- Retirement: deleted `acceptance/grok01-envelope-derivation.ts`, its test, and `apps/v2-ui/lib/runCostEnvelopeSelection.ts`; removed retired maker-count/envelope symbols and ask wire.
- Tests: added `tests/support/discoveredPanel.ts`, `tests/unit/dr181-discovery.test.ts`, `tests/unit/dr181-ceiling.test.ts`, and real embedded-PostgreSQL identity/claim-gap coverage.
- Build correction: the generated contract correctly made `final_strength` nullable; `web/components/NodeDetailDrawer.tsx` now renders that state honestly.
- Skeleton impact: no `skeleton/` path exists or changed, so no `VERSION`, `CHANGELOG.md`, or upgrade-guide bump applies.

## P1 mutation ledger

| Pin | Evidence and killed mutation |
|---|---|
| T1 | `dr181-discovery.test.ts` discovers fixtures of size 1, 2, 3, and 4. Kills any new fixed ceiling or `>= 2` admission assumption. |
| T2 | Unit discovery proves one of three dead CLIs becomes loud `ABSENT` while two survive; real PG claim-gap coverage proves shrink, disclosure, admission, and serve. Acceptance uses `Promise.allSettled`. Kills whole-debate loss, refuse-on-missing, and silent absence. |
| T3 | Codex parser replays the real model-less four-event stdout stream, resolves its `thread.started` ID through exactly one matching persisted rollout `turn_context.payload.model`, and rejects zero/multiple candidates with `CODEX_CLI_MODEL_UNRESOLVED`. Kills fabricated stdout lineage, hardcoded lineage, and first-ID guessing. |
| T4 | Real PG test proves repository count derivation, rejects a raw mismatched `agent_count`/panel insert through `run_panel_count_identity`, and proves provider probes are append-only. Kills two independently writable identities. |
| T5 | Freshness test proves a record inside 600,000 ms causes no spawn while only the stale provider gets one probe; failed reprobe removes that provider without refusing the ask. Claim-gap tests independently pin the one-attempt rule. Kills stale refusal, silent stale serve, and probe-everything behavior. |
| T6 | Runner/API/critique tests prove M=1 serves with both condition marks, `RUN_DIFFERENT_MAKER_CRITIQUE`, mono-depth disclosure, and lower band cap. Kills mono refusal, claimed expansion, and missing disclosure. |
| T7 | `dr181-ceiling.test.ts` enumerates M=1..8 and d=1..5 from `buildMultiMakerExpansionPlan` and `buildCrossRootExchangePlan`, then proves the computed ceiling dominates the independent worst case and `2 * authored`. Kills lowered, final-retry-free, and recompose-free formulas. |
| T8 | The same test pins branching factor, composition segment cap, fixed-organ count, and max recompose to runner exports consumed by the register formula. Kills a drifting second copy of engine shape. |
| T9 | Source-level test scans shipped `apps`, `packages`, and `acceptance`; final `rg` also found no retired symbols, `RUN_MAKER_CONFIGURATION_MISMATCH`, or `runCostEnvelope` outside docs/tests. Kills resurrection anywhere in shipped TypeScript/TSX. |

## Verification evidence

Initial RED was recorded in `DISC-01-progress.log`: focused tests failed because discovery, CLI parsing, structural ceiling, and runner fact exports did not exist, while retirement pins still found the live apparatus.

Final root suite (real embedded PostgreSQL included):

```text
$ pnpm test
Test Files  81 passed (81)
Tests       584 passed (584)
Duration    29.84s
```

Final acceptance suite:

```text
$ pnpm vitest run --config acceptance/vitest.config.ts
Test Files  11 passed (11)
Tests       43 passed (43)
Duration    8.61s
```

Collection proof:

```text
$ pnpm vitest list
584 collected test lines
$ pnpm vitest list --config acceptance/vitest.config.ts
43 collected test lines
```

Static and production gates:

```text
$ pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }

$ pnpm typecheck
$ tsc --noEmit

$ pnpm build
Compiled successfully
Generating static pages (8/8)

$ git diff --check
(no output)
```

The repository-level AGENTS instructions name `tests/render-templates.sh` and `tests/lint-templates.sh`, but neither file nor a `skeleton/` tree exists in this checkout (`bash` returned 127 / no such file). The applicable UI render tests are included in the 584-test root suite and pass.

## Rev2 blocking-review rework

Both rev1 blocking reviews were read in full and reproduced before correction in the original worker session.

### R1 — real Codex identity reporting

- RED: the real captured four-event `codex exec --json` stream has `thread.started`, model-less `turn.started`, `item.completed`, and `turn.completed`. Replacing the fabricated fixture with that shape made all four focused shim tests fail with `CODEX_CLI_MODEL_UNRESOLVED`.
- Verification: one user-authorized real handshake was executed. Its stdout matched the lens capture; its matching persisted rollout carried `turn_context.payload.model = "gpt-5.6-sol"`.
- GREEN: `parseCodexCompletion` now obtains the thread ID from stdout and resolves the model through exactly one matching persisted session rollout. The real-shape fixture and zero/multiple-rollout rejection proof pass.
- Spend disclosure: that single handshake reported 16,009 input tokens, of which 11,008 were cached, 5 output tokens, and 0 reasoning tokens. No second real handshake was run.

### R2 — lawful mono-panel boot

- RED: a real embedded-PostgreSQL ceremony with only one healthy relay reproduced the raw `TypeError: Cannot read properties of undefined (reading 'gateway')` at the live composition root.
- GREEN: critique composition is conditional. A high-stakes depth-4 mono run boots, reaches the API, serves `CAPPED`, emits exactly one each of `SINGLE-LINEAGE` and `CRITIQUE-UNAVAILABLE`, records `MONO_LINEAGE_DEPTH_NOT_EXPANDED:requested_depth=4`, and preserves the lift path.

### R3 — restored rendered behavior

The `/new` rendered suite now carries six behavioral proofs through the shipped page:

- PROV-01: untouched risk submits `MACHINE_DEFAULT`; an edited risk submits `ASKER`. An always-machine mutation failed.
- DR-166-A: two authenticated tokens derive distinct decision/action owners through the real page. A hardcoded `asker:anonymous` mutation failed.
- B6: untouched `as_of` refreshes at submit while an explicit edit survives. An always-submit-time mutation failed.
- R3: `aria-controls` exists exactly while the Options panel exists. An always-present mutation failed.
- The complete discovery-owned ask and depth 1..5/retired-apparatus absence remain rendered proofs.

### R4 — live composition-root pins

- A live-source test pins complete `resolved.panel` admission and the register/runner-owned structural-ceiling call.
- Mutating the root to `resolved.panel.slice(0, 2)` failed the panel pin.
- Mutating judge and organ attempt bounds from 3 to 1 failed the functional ceiling proof (`26` instead of `74`) and the bound assertions.

### R5 — cleanup and accounting

- `acceptance/discovery.ts` is now the live source of `probeRelay`, fresh discovery resolution, and panel conversion; the composition root no longer hand-rolls that path.
- `panel01-depth1-proof.ts` and `xrev01-depth1-proof.ts` now use discovered N, computed structural ceilings, and printed probe evidence instead of historical M=2 or `/42` assumptions.
- Runner condition marks are set-deduplicated; a real database claim-loss test requires exactly one `CRITIQUE-UNAVAILABLE`.
- Provider probe completions are persisted append-only in `core.provider_probe` and printed by the ceremony. They are not misclassified as model-call ledger actions: boot probes have no run/work-item identity, and the closed ledger action-kind has no probe member. Adding one honestly requires a separately ruled schema/API migration and is outside this rework.

## Rev2 mutation ledger

| Rework pin | Observed killing RED | Final GREEN |
|---|---|---|
| R1 real stream | Real four-event fixture made shim tests fail 4/4 with `CODEX_CLI_MODEL_UNRESOLVED`. | Shim 4/4 plus discovery 7/7. |
| R2 mono boot | Real ceremony threw the raw undefined-`gateway` TypeError. | Mono ceremony 1/1, including ruled marks/cap/disclosure. |
| R3 PROV-01 | Always-`MACHINE_DEFAULT` mutation failed edited-risk ownership. | Render suite 6/6. |
| R3 DR-166-A | Hardcoded `asker:anonymous` mutation failed dual-token owners. | Render suite 6/6. |
| R3 B6 | Always-current-submit-time mutation failed explicit `as_of`. | Render suite 6/6. |
| R3 aria | Always-present `aria-controls` mutation failed collapsed-panel state. | Render suite 6/6. |
| R4 panel | `.slice(0, 2)` at live composition failed source pin. | Runtime-policy suite passes. |
| R4 ceiling | Attempt bounds `1/1` failed expected `74` with actual `26`. | Runtime-policy suite passes with `3/3`. |
| R5 mark | Undeduplicated condition marks produced two critique-unavailable marks. | Real PostgreSQL assertion requires exactly one. |

## Rev2 final verification

```text
$ pnpm test
Test Files  81 passed (81)
Tests       584 passed (584)
Duration    29.84s

$ pnpm vitest run --config acceptance/vitest.config.ts
Test Files  11 passed (11)
Tests       43 passed (43)
Duration    8.61s

$ pnpm vitest list | wc -l
584

$ pnpm vitest list --config acceptance/vitest.config.ts | wc -l
43

$ pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }

$ pnpm typecheck
$ tsc --noEmit

$ pnpm build
Compiled successfully
Generating static pages (8/8)

$ git diff --check
(no output)

$ rg -n --glob '*.{ts,tsx}' '<retired DISC-01 symbols>' apps packages acceptance
(no output)
```

## Review focus

Please independently scrutinize the claim-time probe transaction boundary, the `NOT VALID` migration choice (new rows are enforced while legacy rows do not make deployment dishonest), the structural ceiling dominance proof, and the mono band-cap/disclosure path. There are no known functional blockers.
