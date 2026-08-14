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
- Rev2 corrected the relay to the observed Grok Build 1.0.0 `text`/`modelUsage` envelope, pinned recorded-state reviewer rotation on real PostgreSQL, restored M=2 disclosure byte order, and allocated collision-free M>2 cross-root child slots.

## M-maker envelope proposal — formula and clauses, not a seed

The proposed package generalizes the XREV-01 M=2 basis as follows:

- tree authoring: `T(d,M) = M(2^(d+1)-1)`
- proposed cross-root clause: one response per ordered distinct maker pair, `F(M)=M(M-1)`
- authored calls: **`A(d,M)=T+F=M(2^(d+1)+M-2)`**
- proposed coverage clause: one rotating different-maker review per authored node, `R=A`
- healthy spend: `A+R+4=2A+4`
- proposed Set-A formula: **`ceiling(d,M)=6M(2^(d+1)+M-2)+12`**

The formula is inseparable from two V-owned topology choices that coincide at M=2:

1. Cross-root fan-out: proposed `M(M-1)` (every ordered distinct pair) versus `M` (one response per maker). The shipped planner and its docstrings currently implement/propose `M(M-1)`.
2. Review coverage: proposed `A` (one rotating different-maker reviewer per node) versus `A(M-1)` (every other maker reviews every node).

With the proposed pairwise fan-out plus one rotating review, M=3 is:

| Depth | Tree authoring | Cross-root authoring | Authored A | Cross reviews | Fixed | Healthy | Proposed 3x |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 9 | 6 | 15 | 15 | 4 | 34 | 102 |
| 2 | 21 | 6 | 27 | 27 | 4 | 58 | 174 |
| 3 | 45 | 6 | 51 | 51 | 4 | 106 | 318 |
| 4 | 93 | 6 | 99 | 99 | 4 | 202 | 606 |
| 5 | 189 | 6 | 195 | 195 | 4 | 394 | 1182 |

Keeping pairwise fan-out but choosing every-other-maker review coverage produces the lens-required alternative:

| Depth | Authored A | Reviews `A(M-1)` | Fixed | Healthy | Alternative 3x |
|---:|---:|---:|---:|---:|---:|
| 1 | 15 | 30 | 4 | 49 | 147 |
| 2 | 27 | 54 | 4 | 85 | 255 |
| 3 | 51 | 102 | 4 | 157 | 471 |
| 4 | 99 | 198 | 4 | 301 | 903 |
| 5 | 195 | 390 | 4 | 589 | 1767 |

For completeness, choosing fan-out `M` changes the M=3 vectors to `84/156/300/588/1164` with one rotating reviewer, or `120/228/444/876/1740` with every-other-maker coverage. V must ratify the formula and both clauses together; none of these values is seeded here.

## V DECISIONS PACKET

| Decision | Proposed row/value | Smallest ruling |
|---|---|---|
| M-maker run envelope formula and topology | Proposed package: ordered-pair fan-out `M(M-1)` + one rotating different-maker review per node `R=A` + `A(d,M)=M(2^(d+1)+M-2)` + `ceiling(d,M)=6M(2^(d+1)+M-2)+12`. If approved, M=3 yields `[102,174,318,606,1182]` and authorizes a separate later seed/guard-bump ticket. Alternatives are stated above, including full-coverage `[147,255,471,903,1767]`. | Approve the proposed formula+two clauses? Yes/no |
| Grok relay port policy | Ratify a register row shaped as `{kind:"CLI_RELAY_PORT_POLICY", provider_ref:"acceptance:grok-cli", source:"environment", environment_key:"ACCEPTANCE_GROK_RELAY_PORT"}`. This deliberately records operator-supplied allocation and invents no numeric port. | Yes/no |

## TDD and fixture evidence

RED:

- Acceptance collection initially failed on the missing `grok-relay` module and new provider/provenance expectations: 3 failed files; 2 failed and 3 passed tests in the enforced subset.
- Runner RED: 2 failed files, 3 failed and 12 passed tests. Failures proved absent reviewer rotation, the old two-root exchange shape, and the M=3 guard obstructing a pure planner test.
- Final acceptance expansion found one stale legacy fixture: `dual-maker-proof.ts` still addressed `policy.providers.openai/anthropic`, yielding `Cannot read properties of undefined (reading 'maker')`. It was repaired to consume the first two ordered roster members, retaining M=2 semantics.
- Rev2 R1 replayed the redacted real Grok Build envelope and failed at `acceptance/grok-relay.ts:33` with `GROK_CLI_OUTPUT_INVALID` because `result` was required.
- Rev2 R2 first refused the real-PG M=3 fixture at the unchanged ratification guard, then exposed a duplicate `node_child_slot_unique` ordinal before reaching rotation; a test-only guard bypass and deterministic M>2 child slots made the wiring exercisable without changing production admission.
- Rev2 R3 failed exactly: received `["node:openai","node:anthropic"]`, expected historical `["node:anthropic","node:openai"]` when the second M=2 root is served.

GREEN:

```text
$ pnpm vitest run --config acceptance/vitest.config.ts
Test Files  11 passed (11)
Tests       42 passed (42)
Duration    6.44s
```

This includes a real embedded-PostgreSQL dual-maker lineage proof and ceremony, plus the Grok process-double handshake/call/refusal tests.

Rev2 focused GREEN before the full rerun:

```text
Grok captured-envelope relay: 1 file passed, 5 tests passed
M=2 second-root disclosure:    1 file passed, 1 passed / 8 skipped
Real-PG M=3 rotation wiring:   1 file passed, 1 passed / 56 skipped
Architecture policy audit:    1 file passed, 8 tests passed
```

```text
$ pnpm test
Test Files  79 passed (79)
Tests       591 passed | 1 skipped (592)
Duration    26.35s
```

The integration suite explicitly passed `refuses agent_count 3 with RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE before any model call` and the depth-2 M=2 runner lifecycle.

```text
$ pnpm lint
edgeRowsChecked: 27
violations: []
blocking: []

$ pnpm typecheck
$ tsc --noEmit

$ pnpm run generate:contract
$ tsx packages/contract/src/generate.ts

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
| Hardwire `latestReviewerMaker=null` at the runner call site | **RED on real embedded PG**: reviewer B repeats instead of `B,C,B,C,B`. |
| Flip persisted history from `ORDER BY at_seq DESC` to `ASC` | **RED on real embedded PG**: sequence becomes `B,C,C,C,C`. |
| Kill rotation selection with `reviewer=candidates[0]` | **RED on real embedded PG**: reviewer B repeats. This replaces the false rev1 claim that the old M=2 repository assertion proved wiring. |
| Reuse sibling ordinal 3 for every M=3 cross-root response | Real-PG fixture fails `node_child_slot_unique`; deterministic per-target slots pass while M=2 remains ordinal 3. |
| Reverse M=2 disclosure when the second root is served | Unit pin requires historical `[served,unserved]` affected-node ordering. |
| Parse invented Grok `{result,is_error,model}` envelope | Redacted captured-envelope replay fails before the fix and passes only with required `text`, `stopReason`, `total_cost_usd`, and exactly one `modelUsage` key. |
| Permit M=3 before ratification | Unit and real PostgreSQL integration fixtures require the unchanged typed refusal before provider calls. |
| Seed proposed ceilings | Register seed remains the DR-159 M=2 table; derivation is isolated in acceptance code/tests only. |
| Invent a Grok port | Strict environment parsing refuses a missing `ACCEPTANCE_GROK_RELAY_PORT`; no numeric literal is supplied. |

## Environment tail and acknowledged deferrals

- `/Users/vladmihaimiron/.grok/bin/grok` is executable and reports `grok 1.0.0 (3cd0d0cbcebe) [stable]`.
- Exactly one user-authorized tiny live Grok handshake was run after the parser fix; it booted the real relay with maker `xAI`, verbatim model `grok-4.6-build`, and `handshakeCostUsd: 0.030018`. No debate and no second live call ran. The raw provider payload was not logged or retained.
- Root `AGENTS.md` requests `bash tests/render-templates.sh` and `bash tests/lint-templates.sh`; both paths are absent, and `rg --files` found no relocated scripts. They could not be executed. No `skeleton/` file changed, so no `VERSION`, `CHANGELOG.md`, or upgrade-guide change is required.
- The goal packet was already an untracked user-owned file before implementation and is not claimed as this change's output. The progress log and this handoff are mission artifacts.

## Changed-file inventory

- Relay and derivation: `acceptance/grok-relay.ts`, `acceptance/grok-relay.test.ts`, `acceptance/test-fixtures/fake-grok-cli.mjs`, `acceptance/grok01-envelope-derivation.ts`, `acceptance/grok01-envelope-derivation.test.ts`.
- Acceptance roster/composition/docs: `acceptance/README.md`, `acceptance/ceremony.test.ts`, `acceptance/dual-maker-proof.ts`, `acceptance/main.ts`, `acceptance/run-acceptance.ts`, `acceptance/runtime-policy.ts`, `acceptance/runtime-policy.test.ts`, `acceptance/seed-register.ts`, `acceptance/seed-register.test.ts`.
- Runtime and review lineage: `apps/runner/src/index.ts`, `packages/judgement/src/index.ts`.
- Pins: `tests/unit/pro01-runner-tree.test.ts`, `tests/unit/xrev01-node-review.test.ts`, `tests/integration/database.test.ts`.

## Questions for V / reviewer

1. Ratify or reject the proposed formula together with ordered-pair fan-out and one-rotating-review coverage; never ratify the vector alone. A separate ticket must seed any approved result and bump the guard.
2. Ratify or reject the operator-supplied Grok port-policy row; if a fixed numeric port is required, supply that number rather than deriving one here.
3. No further live Grok spend is requested by this handoff.
