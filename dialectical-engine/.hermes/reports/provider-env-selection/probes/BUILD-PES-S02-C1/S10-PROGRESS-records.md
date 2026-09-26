## PROGRESS records

R2.4 / S02-S10. Base re-measured 2026-09-25 at 776359c3; after = S09 run 3. Full logs: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/BUILD-PES-S02-C1/S00-start-suites-attempt1.log and /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/BUILD-PES-S02-C1/S09-run3-suites.log.

| Suite | Full it(...) text | Base state | After state | Step |
|---|---|---|---|---|
| tests/integration/dev-api-environment.test.ts | atomically assembles the exact environment without returning credential values | FAIL | FAIL | unchanged |
| tests/integration/dev-api-environment.test.ts | reuses only byte-exact output and refuses drift instead of overwriting it | PASS | PASS | unchanged |
| tests/integration/dev-api-environment.test.ts | refreshes only the handshake-derived relay identities and credentials | PASS | PASS | unchanged |
| tests/integration/dev-api-environment.test.ts | rejects the removed publication-disabled fallback without overwriting it | PASS | PASS | unchanged |
| tests/integration/dev-api-environment.test.ts | atomically upgrades the exact timeout that was shorter than a real CLI probe | PASS | PASS | unchanged |
| tests/integration/dev-api-environment.test.ts | atomically adds the dedicated Support model target to the exact legacy environment | PASS | PASS | unchanged |
| tests/integration/dev-api-environment.test.ts | atomically adds the declared local deployment mode to the exact environment assembled before it | ABSENT | PASS | S02-S03 → S02-S05/S06 |
| tests/integration/dev-api-environment.test.ts | refuses to add the declared deployment mode over an environment that drifts elsewhere or names another mode | ABSENT | PASS | S02-S03 (PASS at first RED) |
| tests/integration/dev-api-environment.test.ts | rejects an earlier environment that drops a required field | PASS | PASS | unchanged |
| tests/integration/dev-api-environment.test.ts | rejects v4 reconstruction and removed-provider fallback | PASS | PASS | unchanged |
| tests/integration/dev-api-environment.test.ts | rejects unsafe custody, malformed tokens, and aliased database principals | PASS | PASS | unchanged |
| tests/integration/dev-api-environment.test.ts | exposes one non-printing CLI and keeps Hatchet token minting out of scope | PASS | PASS | unchanged |
| tests/integration/dev-api-process.test.ts | starts with only explicit environment and reports ready on the exact anonymous session denial | FAIL | FAIL | unchanged |
| tests/integration/dev-api-process.test.ts | rejects occupied or wrong listeners without adopting or replacing them | FAIL | FAIL | unchanged |
| tests/integration/dev-api-process.test.ts | accepts and reports the exact support-preview runtime topology | PASS | PASS | unchanged |
| tests/integration/dev-api-process.test.ts | refuses an environment that names a deployment mode other than local before process start | ABSENT | PASS | S02-S04 → S02-S07 |
| tests/integration/dev-api-process.test.ts | rejects unsafe or aliased environment custody before process start | PASS | PASS | unchanged |
| tests/integration/dev-api-process.test.ts | rejects a missing support KEK path before process start with no ambient fallback | PASS | PASS | unchanged |
| tests/integration/dev-api-process.test.ts | rejects a dropped or mismatched deployment receipt before process start | PASS | PASS | unchanged |
| tests/integration/dev-api-process.test.ts | terminates only its child on wrong readiness or timeout | FAIL | FAIL | unchanged |
| tests/integration/dev-api-process.test.ts | reports a child exit before readiness and does not adopt a successor listener | FAIL | FAIL | unchanged |
| tests/integration/dev-api-process.test.ts | preserves an asynchronous spawn failure while still invoking bounded cleanup | FAIL | FAIL | unchanged |
| tests/integration/dev-api-process.test.ts | exposes one non-printing API entrypoint and delegates full-stack ownership to the supervisor | PASS | PASS | unchanged |

All 14 base PASS cases remain PASS. DEV-09 still fails at the missing EVALUATOR_DATABASE_URL assertion (base :177); all five default-profile DEV-10B cases still encounter DEV_API_PROCESS_ENVIRONMENT_INVALID. No baseline failure turned green. The added drift-refusal case passed before production edits as PLAN states.
