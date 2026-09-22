# PREVIEW evidence — supported non-conflicting CP1 review stack

Measured 2026-09-14T08:31:38Z. Investigation lane: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine`, branch `codex/support-conversation-cp1`, HEAD `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`, dirty count `0` before this read-only investigation.

## Result

The minimum safe supported design is one **allow-listed immutable stack profile**, selected by `DEBATEAI_DEV_AUTH_STACK_PROFILE=support-preview` at the existing `pnpm dev:auth:up` entry point. The default/absent profile must remain byte-for-byte compatible with the current topology. The preview profile must reject unknown values before any provider, Docker, API, UI, runner, or TLS process starts. Arbitrary caller-supplied ports are outside the contract.

The CP1 preview needs an isolated database plane. Network-only separation is insufficient: the current Compose project is fixed as `debateai-v3` (`compose.dev.yaml:1`), PostgreSQL persistence is the project-scoped `postgres-data` volume (`compose.dev.yaml:10-17,53-54`), and the lifecycle migrates, provisions principals, seeds the deployment register, initializes Support configuration, generates secrets, and attests mail before API startup (`apps/runner/src/dev-auth-data-plane.ts:73-157,320-420`). A second profile must therefore use Compose project `debateai-v3-support-preview`, which yields a separate PostgreSQL volume and Hatchet service/tenant. Database/schema/role names may remain unchanged because they live in that separate instance.

## Exact endpoint and namespace contract

| Component | Existing/default | `support-preview` | Exposure |
|---|---:|---:|---|
| Public HTTPS | `https://localhost:3000` | `https://localhost:3100` | bind `127.0.0.1` only |
| Private UI | `127.0.0.1:3001` | `127.0.0.1:3101` | loopback only |
| Private API | `127.0.0.1:8790` | `127.0.0.1:8890` | loopback only |
| Codex Free relay | `127.0.0.1:8791` | `127.0.0.1:8891` | loopback only |
| Claude Free relay | `127.0.0.1:8792` | `127.0.0.1:8892` | loopback only |
| Grok relay | `127.0.0.1:8793` | `127.0.0.1:8893` | loopback only |
| Hermes Support relay | `127.0.0.1:8794` | `127.0.0.1:8894` | loopback only |
| Codex Premium relay | `127.0.0.1:8795` | `127.0.0.1:8895` | loopback only |
| Claude Premium relay | `127.0.0.1:8796` | `127.0.0.1:8896` | loopback only |
| PostgreSQL host publication | `127.0.0.1:55432` | `127.0.0.1:55433` | loopback only |
| Hatchet gRPC host publication | `127.0.0.1:7077` | `127.0.0.1:7177` | loopback only |
| Hatchet API host publication | `127.0.0.1:8888` | `127.0.0.1:8988` | loopback only |
| Compose project | `debateai-v3` | `debateai-v3-support-preview` | separate containers/volume |
| Local custody | source worktree `.local/dev-auth` | CP1 worktree `.local/dev-auth` | filesystem-isolated by repository root |

At measurement, existing listeners occupied `127.0.0.1:3001` and `127.0.0.1:8790-8796`. No listener was returned for any proposed preview port: `3100,3101,8890-8896,55433,7177,8988`. This is a moment-in-time preflight, not a reservation; the supported lifecycle must still refuse collisions as each owned component starts.

## Exact minimum implementation file contract

Only these runtime/configuration files are needed:

1. `apps/runner/src/dev-auth-stack-profile.ts` **(new)** — define the two frozen profiles, their exact endpoints and Compose project, resolve only absent/default or `support-preview`, prove loopback hosts and non-overlapping ports, and expose no free-form port parser.
2. `packages/register/src/runtime-environment.ts` — admit the single profile selector into the already-sanitized development command environment so child `pnpm`/Compose stages receive it.
3. `apps/runner/src/dev-auth-stack.ts` — resolve/thread the profile into provider, Support relay, data-plane, Hatchet, exact API environment, API, runner, UI, and TLS operations; make the receipt origin profile-derived while preserving startup/cleanup order at lines 136-210.
4. `apps/runner/src/dev-auth-stack-cli.ts` — select the profile before startup and emit the attested receipt origin instead of the fixed line at `:44`.
5. `apps/runner/src/dev-auth-data-plane.ts` — use the profile’s PostgreSQL URL and exact Compose environment/project; keep owned-service detection and reverse cleanup unchanged. Pass the profile selector to the register-seed child and validate Support-operator credentials against the selected PostgreSQL port.
6. `apps/runner/src/dev-hatchet-token.ts` — validate JWT `aud`/`iss`/`server_url`/`grpc_broadcast_address` and live attestation against the selected Hatchet endpoints instead of constants at `:15-18,119-153,395-400`; keep token custody unchanged.
7. `apps/runner/src/dev-api-environment.ts` — assemble and refresh-check selected public origin, API, PostgreSQL, provider, Support relay, and Hatchet endpoints; keep the exact key allow-list and secret-file rules unchanged (`:29-71,409-498`).
8. `apps/runner/src/dev-api-process.ts` — validate the selected exact environment and database/Hatchet authorities, probe the selected API port, and return that port in the receipt (`:24-28,145-237,253-311,313-390`).
9. `apps/runner/src/dev-ui-process.ts` — bind/probe the selected UI port, proxy only to the selected API, keep same-origin `/api`, exact login identity, and exact anonymous `401` (`:6-11,54-65,75-137,139-223`).
10. `apps/runner/src/dev-runner-process.ts` — parse the selected provider endpoint set before passing the already-validated API environment to the runner; keep runtime model/worker policy unchanged (`:55-123`).
11. `apps/runner/src/dev-provider-panel.ts` — separate immutable provider identity/order from profile-specific ports and validate targets against the selected profile (`:25-56,87-130,148-166`).
12. `apps/runner/src/dev-cli-provider-panel.ts` — start the same five real CLI adapters on the selected profile ports and preserve model pins, maker threshold, handshake, and cleanup (`:49-97,122-149`).
13. `apps/runner/src/dev-support-model.ts` — validate the selected loopback base URL while keeping the Support provider ref and model fixed (`:1-50`).
14. `apps/runner/src/support-config-cli-credentials.ts` — parameterize only the expected development PostgreSQL port for the selected profile; production credential validation remains untouched (`:124-141,204-219`).
15. `compose.dev.yaml` — interpolate only code-supplied exact project and host publication ports, bind PostgreSQL and both Hatchet publications to `127.0.0.1`, advertise preview Hatchet API/gRPC endpoints while keeping container ports `8888`/`7077` and the internal gRPC address on `7077` (`:1,16-17,30-43,53-54`).
16. `deploy/dev-auth/validate-compose-postgres.mjs` — recognize the exact loopback interpolation with default `55432`; continue rejecting absent, wildcard, host-network, and non-loopback publications (`:14-35`).
17. `deploy/dev-auth/tls-front-door.mjs` — configure public/private ports in readiness operations and derive the attested origin; preserve loopback binding, exact Host match, forwarding-header stripping, system-trust probe, and HTTPS-only behavior (`:12-17,164-257,267-340`).
18. `deploy/dev-auth/tls-front-door.d.mts` — widen the receipt/configuration types from fixed port `3000` to the typed selected endpoint (`:18-59`).
19. `deploy/dev-auth/README.md` — document the one supported preview invocation, exact endpoint table, separate Compose project/volume, required isolated worktree, and cleanup ownership.

No change is needed in `acceptance/hermes-relay.ts`: it already requires an explicit numeric port and builds the target from the bound server (`:118-167`). No change is needed in `apps/ui/server.mjs`, the browser API client, API main, runner main, authentication code, Support policy/model, or production deployment files.

## Focused test contract

Add or modify only these focused tests:

- `tests/unit/dev-auth-stack-profile.test.ts` **(new)** — exact default/preview values, invalid-profile refusal, loopback-only hosts, distinct ports, and zero overlap between the two profiles.
- `tests/unit/dev-auth-stack.test.ts` — profile-derived origin and unchanged startup/failure/reverse-cleanup sequence.
- `tests/unit/dev-auth-data-plane.test.ts` — selected Compose project/environment and unchanged ownership behavior.
- `tests/integration/dev-hatchet-token.test.ts` — preview JWT authority acceptance plus wrong/default/foreign authority rejection.
- `tests/integration/dev-api-environment.test.ts` — exact preview origin, API, database, provider, Support relay, Hatchet values; stale cross-profile environment refusal.
- `tests/integration/dev-api-process.test.ts` — preview exact-environment validation, configured-port probe/receipt, and cross-profile refusal.
- `tests/integration/dev-ui-process.test.ts` — preview bind/proxy/probes/receipt and occupied-port refusal.
- `tests/unit/dev-runner-process.test.ts` — selected provider target parsing with unchanged model/runner behavior.
- `tests/unit/dev-cli-provider-panel.test.ts` and `tests/integration/dev-provider-panel.test.ts` — exact preview relay starts/targets with unchanged provider identity/order.
- `tests/integration/support-config-principals.test.ts` — preview PostgreSQL port accepted only when selected; production path unaffected.
- `tests/integration/dev-tls-readiness.test.ts` and `tests/integration/dev-tls-front-door.test.ts` — preview origin/readiness routing plus existing Host, proxy-header, WebSocket, trust, and cleanup invariants.
- `tests/architecture/dev-compose-postgres.test.ts` — exact defaulted loopback interpolation and hostile publication mutants.
- `tests/architecture/dev-local-auth-topology-spec.test.ts` — default topology remains 3000/3001/8790/55432/7077/8888 while Compose permits only the frozen code-selected preview values.

`tests/architecture/dev-tls-front-door.test.ts`, `tests/architecture/dev-real-provider-only.test.ts`, `tests/architecture/dev-auth-data-plane.test.ts`, and `acceptance/hermes-relay.test.ts` remain unchanged regression coverage and should be included in the focused run.

## Provisioning and launch once the contract is frozen

The isolated CP1 lane currently has no `.local` custody directory. After implementation and with the heavy-command lease:

1. Run `pnpm dev:auth:generate-tls` in the CP1 worktree. This creates/validates a private localhost leaf in that worktree; it does not install a CA or weaken verification (`deploy/dev-auth/create-local-certificate.mjs:21-25,109-146`). If workstation trust is absent, the manual `mkcert -install` step remains an owner operation (`deploy/dev-auth/README.md:29-49`).
2. Run `DEBATEAI_DEV_AUTH_STACK_PROFILE=support-preview pnpm dev:auth:up` from the CP1 worktree.
3. The existing lifecycle must automatically create the separate Compose project/volume, migrate the isolated database, provision isolated principals, seed the register, initialize the unchanged Hermes Support configuration, generate private local keys/mail custody, issue and attest a token from the isolated Hatchet instance, then start API/runner/UI/TLS in the existing order.
4. Review only `https://localhost:3100`. Shutdown must stop only resources started by this invocation, in reverse order; it must not stop the existing source stack.

## Security invariants

- Loopback-only publication for every host port; no `0.0.0.0`, host networking, or public API exposure.
- HTTPS-only public origin, normal system trust, exact `Host: localhost:3100`, preserved Origin, Secure cookies, and no TLS bypass.
- UI remains a same-origin deny-default `/api` proxy; API and proxied anonymous session probes must return exact `401 {"error":"SESSION_REQUIRED"}`.
- Profile selection is an allow-list and is validated before the first side effect; no free-form ports or URL text.
- Provider refs, provider order, maker threshold, model pins, Support provider ref, and Support model remain unchanged.
- Separate Compose project, PostgreSQL volume, Hatchet authority/tenant, worktree custody, mail capture, register receipt, and secret files.
- Existing services are never adopted, stopped, reconfigured, migrated, or used as preview state.
- Existing credential custody, encryption, shredding, spend/admission, degraded-response, ownership, and human-handoff behavior remain unchanged; no auth bypass or credential submission.

## Read-only verification record

Commands executed included:

```text
git status --short && git rev-parse HEAD && git branch --show-current
lsof -nP -iTCP:<each proposed port> -sTCP:LISTEN
lsof -nP -iTCP -sTCP:LISTEN | rg ':(3001|8790|8791|8792|8793|8794|8795|8796|55432|7077|8888)\b'
rg -n '(3000|3001|8790|879[1-9]|55432|7077|8888|PUBLIC_APP_URL|API_PORT|API_HOST|HATCHET...)' <bounded stack files>
rg -n '(parseDevelopmentProviderPanelTargets|loadDevelopmentProviderPanelFromEnvironment|parseDevelopmentSupportModelTargetJson|loadDevelopmentApiProcessEnvironment)' apps tests acceptance
sed/nl reads of the packet-named lifecycle, auth, Compose, TLS, relay, directly used modules, and focused tests
```

Tests/builds/stacks: **not run**; this seat had no heavy-command lease. No product/service file, process, database, container, credential, or custody file was changed.

## UNVERIFIED

- Candidate ports are free only as of the recorded measurement; startup must re-probe.
- Docker Compose interpolation and the real isolated Hatchet advertised endpoints require the focused tests and one leased live stack run after implementation.
- The CP1 worktree’s TLS leaf and workstation system trust were not inspected or generated.
- The owner-confirmed Forgot password destination remains unresolved in FIND evidence; this preview topology does not alter that product limitation.
