# GROK-01 Codex handoff

Ticket: `t_43b4c17b`  
Session: `019fffa5-d51e-7170-bec7-23fb6ad708df`  
State requested: peer review  
Commit: none; commit/push are V-gated important operations.

## Outcome

- Added an acceptance Grok CLI relay at `~/.grok/bin/grok` with a mandatory startup handshake, xAI maker lineage, verbatim CLI model identity, OpenAI-compatible HTTP shape, closed tool/web/memory/subagent surface, and loud typed failures.
- Added Grok/xAI as the third configured provider with provenance `acceptance:DR-177:V-approved`; the ceremony boots Claude and Grok relays and requires the operator-supplied `ACCEPTANCE_GROK_RELAY_PORT`.
- Generalized configured maker traversal, root expansion, ordered cross-root exchange, and unserved-root disclosure to N makers while retaining the existing M=2 path and the unchanged pre-ratification M=3 guard.
- Rotates node reviewers using the latest persisted reviewer for the same author maker; M=2 still falls back to its sole eligible reviewer.
- Added a pure, tested M=3 envelope derivation. No proposed ceiling was seeded and `agent_count=3` still refuses before any model call.

## M=3 envelope proposal — not a seed

For depth `d` and `M=3`:

- tree authoring: `M * (2^(d+1) - 1)`
- ordered cross-root authoring: `M * (M - 1)`
- total authored `A`: tree + cross-root
- cross-review coverage: `A`
- fixed healthy calls: `4`
- healthy spend: `2A + 4`
- proposed Set-A ceiling: `3 * healthy spend`

| Depth | Tree authoring | Cross-root authoring | Authored A | Cross reviews | Fixed | Healthy | Proposed 3x |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 9 | 6 | 15 | 15 | 4 | 34 | 102 |
| 2 | 21 | 6 | 27 | 27 | 4 | 58 | 174 |
| 3 | 45 | 6 | 51 | 51 | 4 | 106 | 318 |
| 4 | 93 | 6 | 99 | 99 | 4 | 202 | 606 |
| 5 | 189 | 6 | 195 | 195 | 4 | 394 | 1182 |

## V DECISIONS PACKET

| Decision | Proposed row/value | Smallest ruling |
|---|---|---|
| M=3 run envelope | Ratify depths 1..5 at both reachable tiers with `max_model_attempts` `[102,174,318,606,1182]`, derived above; authorize a separate later seed plus maker-count guard bump. | Yes/no |
| Grok relay port policy | Ratify a register row shaped as `{kind:"CLI_RELAY_PORT_POLICY", provider_ref:"acceptance:grok-cli", source:"environment", environment_key:"ACCEPTANCE_GROK_RELAY_PORT"}`. This deliberately records operator-supplied allocation and invents no numeric port. | Yes/no |

## TDD and fixture evidence

RED:

- Acceptance collection initially failed on the missing `grok-relay` module and new provider/provenance expectations: 3 failed files; 2 failed and 3 passed tests in the enforced subset.
- Runner RED: 2 failed files, 3 failed and 12 passed tests. Failures proved absent reviewer rotation, the old two-root exchange shape, and the M=3 guard obstructing a pure planner test.
- Final acceptance expansion found one stale legacy fixture: `dual-maker-proof.ts` still addressed `policy.providers.openai/anthropic`, yielding `Cannot read properties of undefined (reading 'maker')`. It was repaired to consume the first two ordered roster members, retaining M=2 semantics.

GREEN:

```text
$ pnpm vitest run --config acceptance/vitest.config.ts
Test Files  11 passed (11)
Tests       41 passed (41)
```

This includes a real embedded-PostgreSQL dual-maker lineage proof and ceremony, plus the Grok process-double handshake/call/refusal tests.

```text
$ pnpm test
Test Files  79 passed (79)
Tests       590 passed | 1 skipped (591)
Duration    26.58s
```

The integration suite explicitly passed `refuses agent_count 3 with RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE before any model call` and the depth-2 M=2 runner lifecycle.

```text
$ pnpm lint
edgeRowsChecked: 27
violations: []
blocking: []

$ pnpm typecheck
$ pnpm run generate:contract
$ git diff --check
# all exit 0; generate:contract produced no drift

$ pnpm run audit:text-bytes
REPOSITORY_TEXT_CONTROL_BYTES=0
```

Both required `vitest list` commands exited 0 and enumerated the new relay handshake/refusal cases, M=3 derivation, provider/port policy, N-generic planner, persisted rotation, and unchanged M=3 refusal fixtures.

## Mutation ledger

| Mutation challenged | Proof |
|---|---|
| Remove the third configured maker | M=2 planner/dual-maker/ceremony tests remain green; the first non-primary relay retains the existing critique leg. |
| Hard-code a pair in tree traversal | M=3 pure planner asserts every root tree and round-robin author sequence. |
| Emit only two cross-root exchanges | M=3 asserts all `M*(M-1)=6` ordered exchanges. |
| Hide only one unserved root | M=3 disclosure test asserts every unserved maker root. |
| Repeat the same reviewer | M=3 selection test and persisted repository fixture require rotation away from the latest reviewer. |
| Permit M=3 before ratification | Unit and real PostgreSQL integration fixtures require the unchanged typed refusal before provider calls. |
| Seed proposed ceilings | Register seed remains the DR-159 M=2 table; derivation is isolated in acceptance code/tests only. |
| Invent a Grok port | Strict environment parsing refuses a missing `ACCEPTANCE_GROK_RELAY_PORT`; no numeric literal is supplied. |

## Environment tail and acknowledged deferrals

- `/Users/vladmihaimiron/.grok/bin/grok` is executable and reports `grok 1.0.0 (3cd0d0cbcebe) [stable]`.
- No paid/authenticated live Grok model call was made. Provider spend is V-gated; therefore the real installed CLI's current JSON envelope and authentication remain a V/orchestrator live-gate item. Startup/call/error behavior is proven with the test-only process seam, which is rejected outside `NODE_ENV=test`.
- Root `AGENTS.md` requests `bash tests/render-templates.sh` and `bash tests/lint-templates.sh`; both paths are absent, and `rg --files` found no relocated scripts. They could not be executed. No `skeleton/` file changed, so no `VERSION`, `CHANGELOG.md`, or upgrade-guide change is required.
- The goal packet was already an untracked user-owned file before implementation and is not claimed as this change's output. The progress log and this handoff are mission artifacts.

## Changed-file inventory

- Relay and derivation: `acceptance/grok-relay.ts`, `acceptance/grok-relay.test.ts`, `acceptance/test-fixtures/fake-grok-cli.mjs`, `acceptance/grok01-envelope-derivation.ts`, `acceptance/grok01-envelope-derivation.test.ts`.
- Acceptance roster/composition/docs: `acceptance/README.md`, `acceptance/ceremony.test.ts`, `acceptance/dual-maker-proof.ts`, `acceptance/main.ts`, `acceptance/run-acceptance.ts`, `acceptance/runtime-policy.ts`, `acceptance/runtime-policy.test.ts`, `acceptance/seed-register.ts`, `acceptance/seed-register.test.ts`.
- Runtime and review lineage: `apps/runner/src/index.ts`, `packages/judgement/src/index.ts`.
- Pins: `tests/unit/pro01-runner-tree.test.ts`, `tests/unit/xrev01-node-review.test.ts`, `tests/integration/database.test.ts`.

## Questions for V / reviewer

1. Ratify or reject the proposed M=3 ceiling vector and authorize the separate seed/guard-bump ticket.
2. Ratify or reject the operator-supplied Grok port-policy row; if a fixed numeric port is required, supply that number rather than deriving one here.
3. Authorize the live Grok handshake/one-call fixture when provider spend is desired.
