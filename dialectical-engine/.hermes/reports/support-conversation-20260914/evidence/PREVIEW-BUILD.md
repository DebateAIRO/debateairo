# PREVIEW-BUILD evidence — support-conversation-20260914

Measured 2026-09-14 by native agent `/root/preview` in the frozen CP1 lane at `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine`.

## Result

The supported local development lifecycle now has one closed selector, `DEBATEAI_DEV_AUTH_STACK_PROFILE=default|support-preview`. The new `support-preview` profile starts through the existing `pnpm dev:auth:up` command, binds every host listener to `127.0.0.1`, uses fixed non-conflicting ports and its own Compose project and PostgreSQL volume, and rejects every unknown selector before side effects. The absent selector and explicit `default` retain the existing topology and serialized API model target.

Two scoped commits carry this node's product work:

- `1d84592c0d639dfebaea4ac3aa9cb0711555e251` — `support preview model target ratifier`; 2 files, 35 insertions, 4 deletions.
- `fa362c5e87abe0e6068cb8f43822d718697258f5` — `support preview isolated local stack`; 37 files, 750 insertions, 211 deletions.

The API ratifier pair was committed and released before NAV began. The later infrastructure commit excluded concurrent NAV and Support content edits. `git diff --cached --check` passed immediately before the infrastructure commit.

## Exact runtime contract

| Surface | default | support-preview |
|---|---:|---:|
| Public HTTPS | `https://localhost:3000` | `https://localhost:3100` |
| UI | `127.0.0.1:3001` | `127.0.0.1:3101` |
| API | `127.0.0.1:8790` | `127.0.0.1:8890` |
| Codex free/premium | `127.0.0.1:8791`, `:8795` | `127.0.0.1:8891`, `:8895` |
| Claude free/premium | `127.0.0.1:8792`, `:8796` | `127.0.0.1:8892`, `:8896` |
| Grok | `127.0.0.1:8793` | `127.0.0.1:8893` |
| Hermes Support | `127.0.0.1:8794` | `127.0.0.1:8894` |
| PostgreSQL | `127.0.0.1:55432` | `127.0.0.1:55433` |
| Hatchet gRPC/API | `127.0.0.1:7077`, `:8888` | `127.0.0.1:7177`, `:8988` |
| Compose project | `debateai-v3` | `debateai-v3-support-preview` |
| PostgreSQL volume | `debateai-v3_postgres-data` | `debateai-v3-support-preview_postgres-data` |

The preview target JSON adds the server-owned exact marker `development_stack_profile: "support-preview"` only for the fixed `8894` relay. The old default four-key JSON remains unchanged. The API rejects marker/port mismatch, aliases, unknown markers, and provider/model/credential drift. The earlier plan statement that no relay edit was required was superseded by the adopted API model-target allowance: the marker had to be threaded at the relay serialization boundary. `acceptance/hermes-relay.ts` and its test are explicitly allow-listed and were authored by PREVIEW for that reason.

Fresh-database initialization received two bounded corrections. A true zero-row Support status is now the legitimate pre-publication state, while every malformed or nonunique nonempty result still fails closed. Initial Support publication uses a development-only pool with `max:1` and 5000 ms connection, statement, and query deadlines. The runtime reader remains at its existing 700/750 ms budgets; production credential handling, SQL privileges, authority separation, and cleanup are unchanged.

At runner readiness IPC, the already validated safe register version is serialized with `String(...)` to meet the supervisor's string-only receipt contract. Runner internals retain their numeric representation, and the supervisor still rejects numeric receipts.

## Exact changed paths

Commit `1d84592c`:

- `dialectical-engine/apps/api/src/support/model.ts`
- `dialectical-engine/tests/unit/support-model.test.ts`

Commit `fa362c5e`:

- `dialectical-engine/acceptance/hermes-relay.test.ts`
- `dialectical-engine/acceptance/hermes-relay.ts`
- `dialectical-engine/apps/runner/src/dev-api-environment.ts`
- `dialectical-engine/apps/runner/src/dev-api-process.ts`
- `dialectical-engine/apps/runner/src/dev-auth-data-plane.ts`
- `dialectical-engine/apps/runner/src/dev-auth-stack-cli.ts`
- `dialectical-engine/apps/runner/src/dev-auth-stack-profile.ts`
- `dialectical-engine/apps/runner/src/dev-auth-stack.ts`
- `dialectical-engine/apps/runner/src/dev-cli-provider-panel.ts`
- `dialectical-engine/apps/runner/src/dev-hatchet-token.ts`
- `dialectical-engine/apps/runner/src/dev-provider-panel.ts`
- `dialectical-engine/apps/runner/src/dev-runner-process.ts`
- `dialectical-engine/apps/runner/src/dev-support-model.ts`
- `dialectical-engine/apps/runner/src/dev-ui-process.ts`
- `dialectical-engine/apps/runner/src/main.ts`
- `dialectical-engine/apps/runner/src/support-config-cli-credentials.ts`
- `dialectical-engine/compose.dev.yaml`
- `dialectical-engine/deploy/dev-auth/README.md`
- `dialectical-engine/deploy/dev-auth/tls-front-door.d.mts`
- `dialectical-engine/deploy/dev-auth/tls-front-door.mjs`
- `dialectical-engine/deploy/dev-auth/validate-compose-postgres.mjs`
- `dialectical-engine/packages/register/src/register-publication.ts`
- `dialectical-engine/packages/register/src/runtime-environment.ts`
- `dialectical-engine/tests/architecture/dev-compose-postgres.test.ts`
- `dialectical-engine/tests/architecture/dev-local-auth-topology-spec.test.ts`
- `dialectical-engine/tests/integration/dev-api-process.test.ts`
- `dialectical-engine/tests/integration/dev-hatchet-token.test.ts`
- `dialectical-engine/tests/integration/dev-provider-panel.test.ts`
- `dialectical-engine/tests/integration/dev-tls-readiness.test.ts`
- `dialectical-engine/tests/integration/dev-ui-process.test.ts`
- `dialectical-engine/tests/integration/register-support-publication.test.ts`
- `dialectical-engine/tests/integration/support-config-principals.test.ts`
- `dialectical-engine/tests/unit/dev-auth-data-plane.test.ts`
- `dialectical-engine/tests/unit/dev-auth-stack-profile.test.ts`
- `dialectical-engine/tests/unit/dev-auth-stack.test.ts`
- `dialectical-engine/tests/unit/dev-cli-provider-panel.test.ts`
- `dialectical-engine/tests/unit/register-publication.test.ts`

## RED and GREEN evidence

Behavioral RED receipts:

- Profile selector: `PREVIEW-profile-red-r2.log`, 1 failed / 2 passed, SHA256 `c7404c3ef0799ffce7a0ea97497b3ab1029e869a640b22530ee076e1b20426a9`.
- Empty pre-publication state: `PREVIEW-init-red.log`, 1 failed / 93 skipped, SHA256 `696ce74ee310147ec7267001994b6d1870a4477e3fbfc2eb80dd1142b0c64e12`.
- Dedicated initialization writer: `PREVIEW-init-writer-red.log`, 1 failed, SHA256 `9c84cd4d705fb87ab5df7153669ef0064c1de08fb1e5237e46c2e4ef3ce0bd07`.
- Preview model target: `PREVIEW-model-ratifier-red.log`, 1 failed / 3 skipped, SHA256 `4c9e120fb2f1807abec5ca2585fda2b92fc022dda77503a7ba22f2d5c6de6e37`.

Final focused evidence:

- `PREVIEW-final-focused-green-r2.log`: 10/10 files and 150/150 tests passed in 1.98 s, SHA256 `59fda607e6a8cd74899b19e294fed0411dae7a4d40b280bda3bd69898e625931`.
- `PREVIEW-final-real-boundaries-green.log`: 3/3 files, 3 passed and 35 deliberately skipped in 13.53 s; it exercised the real empty-to-publication path, bounded initialization pool, and relay marker, SHA256 `dabf56df0a7e32a8e43f4e64d4989e918256715e7545df386df95d3ce8268dce`.
- `PREVIEW-model-ratifier-green-r2.log`: 3/3 files, 6 passed and 24 skipped, SHA256 `99b01e26a7d6d5bb87f090bf19c7a54f571e08774daff9f472c228f1bba2efe2`.
- `PREVIEW-runner-readiness-green.log`: 1/1 file and 8/8 tests passed, including numeric receipt rejection, SHA256 `86a7e9a9895641cbd4f307578f43e89319b33c66fba35fb75a8e55bedf7c014b`.
- Compose validator and both resolved configurations passed: `PREVIEW-compose-validator.log` SHA256 `0b92fb8f88a4454e03dbf65cd38fc32998bda9aec17ee01ce0e23fff66a904da`, default config SHA256 `28e33a284490afb85dd11a744f7b2a4ac51d7011ebffceef1efeefd929ae97ba`, preview config SHA256 `9f07a70e6d657b53fed9a021ef676a0371091db29a318901dae2793c107db4df`.

An earlier 160-test aggregate produced 159 passes and one `tests/integration/dev-api-environment.test.ts` failure because the inherited frozen-lane environment lacked `EVALUATOR_DATABASE_URL`. That exact failure was not reproduced at frozen base, so it remains unattributed and was excluded only from the later preview-focused frame; its nine sibling cases passed. No runtime expectation was rewritten to hide it.

## Typecheck boundary

`pnpm typecheck` was captured once after the final implementation and returned `rc=1`; log SHA256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`. It contains no diagnostic in a PREVIEW-owned production source file. Diagnostics remain in these groups:

- the missing evaluator rankings type-only import in `apps/api/src/index.ts`;
- observation-agent fixtures missing `repoRoot`;
- TypeScript compiler API imports in two architecture tests;
- missing evaluator process and evaluator profile fixture drift;
- missing `web/lib/v3Presentation.js` and `web/lib/api.js` plus dependent UI typing;
- three branded register-version fixture errors in an unchanged section of `tests/unit/dev-cli-provider-panel.test.ts`.

Only the evaluator rankings absence was separately proved at frozen `b7ca2c41`: `RUNTIME_BASE.md`, SHA256 `701ed1ba45b008ebe8fec26989ba6b71e2a247cdc0e2f35681a60af858d62b33`. It is a type-only import, and `apps/api/src/main.ts` does not wire `evaluatorRankings`, so it did not block the runtime stack. All other full-typecheck diagnostics remain unattributed because this node did not run a whole frozen-base typecheck. This node does not claim a full typecheck pass.

## Live supported-stack receipt

Docker Desktop 29.7.2 was started through the installed application without install, context switch, configuration change, container stop, or global CA trust change. Before every attempt the 12 selected ports were checked for listeners. The successful stack log `PREVIEW-stack-live-r6.log`, SHA256 `b81ca6090e33b5f346ddfa4131af1a0a774a286eddf59043a7377ea166617e84`, contains:

```text
DEV_AUTH_STACK_READY=https://localhost:3100:RUNNER_REGISTERED
```

All 12 expected listeners were measured on `127.0.0.1`; default ports had no listener created by this stack. Compose labels showed project `debateai-v3-support-preview` and volume `debateai-v3-support-preview_postgres-data`. At readiness, PostgreSQL used 284.1 MiB / 41 PIDs and Hatchet used 53.79 MiB / 16 PIDs. Known host processes totalled about 1.66 GiB, dominated by the development Next UI at about 1.04 GiB.

The worktree-local CA smoke used explicit `--cacert` and returned HTTP 200 for the login page and HTTP 401 with `SESSION_REQUIRED` for anonymous session access. Receipt: `PREVIEW-https-readiness.json`. This is distinct from ordinary workstation trust.

A final normal-execution lifecycle probe reached the same ready receipt in `PREVIEW-stack-live-r7-escalated.log`, SHA256 `fdc29292d0adc22f04117d7ef506f197d3f3c9d47c17f5b89934ec85d5826590`. Ordinary `curl https://localhost:3100/` with neither `-k` nor `--cacert` returned HTTP 200 (`PREVIEW-system-trust-escalated.log`, SHA256 `337d55ead282fa65d01beaa6c7363aa151c0688815524bfca6856797ac1937dd`). A browser check remains **UNVERIFIED** because CUA reported no available browser and a locked Mac; no TLS warning bypass was attempted. The repository has Vitest/jsdom for render tests, and the lockfile advertises optional Playwright peers, but the root package does not declare Playwright and no installed repository browser runner was found in this bounded check. A later UI node can use an already installed headless runner if it has one; no installation is required or authorized by this evidence.

The actual supervisor PID `93903` received `SIGTERM`, and the parent command exited `rc=0` after 2.53 s. `PREVIEW-supervisor-sigterm-escalated.log` SHA256 is `9f419b2b9bb96237f4fc87c9a1ac773222834218d3461b79556d92035862654e`. All 12 listeners then returned absent. Only the exact preview containers remained, both stopped: PostgreSQL `Exited (0)` and Hatchet `Exited (137)`. Cleanup receipt `PREVIEW-direct-cleanup-escalated.log` SHA256 is `df0023ba3be6420b8da6133c1c94094ce3ea0caae22d01ac3681530d756cd8ec`. This direct signal proves the supported supervisor cleanup path; the earlier PTY Ctrl-C residual-container observation was a wrapper ambiguity. No unrelated container or listener was touched.

## Live integration failures resolved during the node

The successive fresh-stack attempts exposed four integration contracts that focused mocks had not covered: zero rows before the first Support publication, misuse of the 700 ms reader pool for the initial write (`57014`), hard-coded API ratification of port 8794, and numeric/string disagreement at runner readiness IPC. A fifth retry failed because the mission-owned generated `api.env` predated the profile marker. It was renamed, regenerated by the supported assembler with mode `0600`, verified, and its obsolete backup removed. Default behavior and nonempty database integrity checks remained intact.

During an early metadata probe, a faulty partial-redaction expression printed a stale relay bearer value into tool output. The relay was already stopped and ephemeral, and the next start was verified to rotate custody. The value was not copied into any evidence or report. All later inspection used key-only or full-value redaction.

## Limits and exclusions

- Browser certificate trust is unverified while the Mac is locked; ordinary system curl trust passed.
- Full repository typecheck does not pass and lacks a whole-base comparison for all remaining diagnostics.
- `apps/api/src/main.ts` still does not wire evaluator rankings. No Support or evaluator claim may describe rankings as exposed runtime behavior.
- This evidence proves the isolated supported infrastructure lifecycle. CP1 navigation, Support server/UI behavior, integrated review, and owner acceptance are separate gates.
- Secrets, `.local/**`, generated credentials, global trust, production deployment, unrelated services, and existing data/custody are absent from both commits.
- Actual model-token usage: **UNAVAILABLE**.
