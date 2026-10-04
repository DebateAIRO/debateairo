# Task 4 report — mandatory managed Turnstile with isolated verification

Status: DONE_WITH_CONCERNS. Task 4 implementation and focused validation are complete. The full UI node suite retains one independently reproduced baseline failure; consumers and live deployment remain deliberately pending as listed below.

Base: `6de9f328cdf46ad973e678a4cd3f696400521acf`.
Implementation: `d5c02f8bda4b3b1c527ac87e3522ced1628512ac` (`feat: enforce Turnstile through an isolated verification relay`).
This follow-up report/guard commit pins S04 to that implementation. The final reply identifies its exact SHA.
Worktree: `/Users/stefannour/DebateAIRO/worktrees/v3-owner-team-access/dialectical-engine` (the `/Users/stefannour/Documents/DebateAIRO` path resolves through the authorized workspace symlink).

## Result and ordering

Existing public registration and resend require the complete, strict `RegisterRequestSchema` / `ResendVerificationRequestSchema`. An old signup or email-only resend body is refused; no phone/token placeholder or compatibility bypass exists. The original registration body is copied before the server injects `adult_affirmed`, and canonical parsing uses that original snapshot. A submitted authority field therefore cannot become valid merely because the age hook rewrote it.

The ordering is: existing Origin/CSRF policy, country refusal, server age decision, legal-pair capture, canonical validation and byte/phone bounds, published source admission, Turnstile proof decision, then identity service work. Admitted signup carries normalized manual phone and SQL-null public recovery; the date does not enter account input, and server adulthood/legal/country evidence keeps its existing meaning. A well-formed stale legal pair is still decided by the service's manifest check; missing/malformed legal facts now fail the required public shape before proof or identity work.

The public actions are fixed by the server route: `signup` and `resend-verification`. Public URL/hostname/action/secret/proxy/authority metadata is rejected by strict request parsing. A rejected proof maps to constant `400 {error,message: TURNSTILE_REJECTED}`; missing worker/configuration, timeout, transport failure, malformed upstream response, or provider-secret/internal failure maps to constant `503 {error,message: TURNSTILE_UNAVAILABLE}`. Neither result carries account facts, provider error text, tokens or credentials.

Successful HTTP acknowledgements explicitly project only `message` and `retry_after_seconds: 60`, preventing extra internal service result fields from reaching the public contract. Service-level return constants remain unchanged for trusted internal callers and existing service tests.

## Exported server interfaces and consumer obligations

`apps/api/src/turnstile.ts` exports:

- `TurnstileAction = "signup" | "resend-verification"`.
- `TurnstileProof = Readonly<{token: string; action: TurnstileAction}>`.
- `TurnstileOutcome = "passed" | "rejected" | "unavailable"`.
- `TurnstileVerifier.verify(input): Promise<TurnstileOutcome>`.
- `requireTurnstileProof(verifier | undefined, proof): Promise<void>`; absence/exceptions fail closed, and only `passed` returns normally.
- `TurnstileGateError`, with constant `code` and `statusCode`.
- `UnixTurnstileVerifier({publicAppUrl, socketPath?, clock?})`. The clock is a controlled verification seam, not public input. No HTTP URL/proxy/redirect/secret setting exists.

`ApiOptions.turnstile?: TurnstileVerifier` is a mandatory proof dependency for the mounted public signup/resend flows. `main.ts` always creates the Unix verifier from validated deployment settings; absence of `TURNSTILE_SOCKET_PATH` produces unavailable rather than an enabled bypass. The optional port exists for other API compositions, and omission still refuses proof.

There is currently no social account-completion API path. Per controller ruling, Task 4 adds no speculative social route. **Task 10 must call `requireTurnstileProof` with action `signup` before any new social account lookup/provisioning/KDF/token/mail work**, reuse source admission, and retain the canonical manual-phone/age/legal decisions. Existing-account sign-in is a separate policy decision for that task.

## Existing source budget, private capability and audit distinction

The existing `InProcessAuthRateLimiter.consume` is source-only: its `addressKey` parameter is unused, while published `admissionPerSource` / `windowMs` govern admission. No second limiter or invented policy cap was added.

`apps/api/src/registration.ts` now exports nominal `AuthSourceAdmission` (with idempotent `release()`) and optional trusted `RegistrationApplication.admitSource(route: "register" | "resend", source: VerificationMailSource): Promise<AuthSourceAdmission>`. The concrete service mints an opaque object recorded in its own private `WeakMap`, bound to route, normalized IP and request ID. The HTTP hook forwards it as an optional **third service argument**, never in public JSON, account input or source metadata. A forged, wrong-route/source, released or reused capability is refused before account work. A genuine one is consumed once and skips only the later duplicate source charge. Direct internal service callers that omit it retain the existing limiter path and 103 concurrent-registration structural gate.

Proof rejection/unavailability revokes the capability immediately; response cleanup and service error/finally paths also remove it. The structural admission release/clamp lifecycle remains intact and its existing focused tests pass.

A source-refused request is a terminal proof decision: it does not spend Siteverify or perform request account lookup, password KDF, DEK/token minting or mail. Its source-only refusal is aggregated cheaply. The established route-window audit persistence starts after the opaque response clamp; that deferred batch audit may use the established audit-context KDF. This distinction was expressly approved by the controller. The deferred flush uses the current clock after the clamp to preserve the absolute aggregation-window deadline, and an older delayed starter cannot replace a newer active window. Existing aggregation, refusal envelope and structural-budget tests remain active.

## Mail display context for Tasks 5/6

`VerificationMailSource = AuthSourceContext & {mailDisplay?: {locale: string; timeZone: string | null}}`; `RegistrationSource` extends it with optional legal evidence. Resend consumes the same display-source type.

The API fills `mailDisplay.locale` from validated canonical **`ui_locale`**, and `mailDisplay.timeZone` from validated canonical `time_zone`. Legal `locale` remains separate. The exported `sourceContext` still bounds IP/UA/request ID, now validates and freezes an explicit copy of display context rather than dropping it. Locale is checked against `LocaleCodeSchema`; timezone remains the contract's nullable bounded string (1..128), with rendering/fallback to be handled by Task 6. Pending registration and in-memory verification delivery are typed with `VerificationMailSource` so the context survives their handoff. There is no new database preference persistence or audit identity authority. The identity repository's existing audit normalization projects IP and UA rather than display context; source-refusal aggregation explicitly receives only IP/UA/request ID.

Task 5 retains this interface while changing resend budgets. Task 6 carries display context into the delivery renderer and owns any durable delivery-intent addition, if later needed.

## Relay operation, bounds and network custody

New files:

- `deploy/turnstile/siteverify-relay.mjs`: standalone worker and fixed transport.
- `deploy/turnstile/siteverify-response.mjs` / `.d.mts`: pure shared validation/socket/hostname helpers; the API does not import worker startup/custody code.
- `deploy/turnstile/debateai-turnstile.service`: installable Linux unit template, not activated here.

The API uses only HTTP over the trusted Unix socket, `POST /siteverify`, JSON `{token,action}`. It never receives or loads a Turnstile credential and opens no Internet socket for verification. The existing API networking confinement/profile was not broadened or edited.

The worker accepts exactly those two request keys and fixed actions; arbitrary URL, hostname, secret, remote IP, metadata, proxy, redirect or idempotency override is refused before transport. It posts only URL-encoded `secret` and `response` to the literal **`https://challenges.cloudflare.com/turnstile/v0/siteverify`** through Node's verified HTTPS transport. It uses no proxy, redirect follow, custom CA or request URL override. Test dependency injection is at the transport/operation boundary and is never selected by CLI configuration or public input.

Bounds are enforced at both relevant trust boundaries: 2048 token characters, 8192-byte worker input and Siteverify/Unix response, 4096-byte response/request headers, and a 5000ms total operation deadline (including upload, DNS/TLS and response body on the worker; complete Unix operation on the API). Success requires boolean true, correct exact deployment hostname, exact action, a valid UTC timestamp no older than 300 seconds and not in the future, and no success-associated error codes. Successful but mismatched/expired results reject. Invalid/missing/duplicate response errors reject; secret/internal/unknown provider faults are unavailable. Provider metadata is never forwarded.

SHA-256 token-digest reservation occurs before awaiting transport on both API and worker. Concurrent/replayed tokens reject; reservations expire after 300 seconds, and each cache caps at 10,000 entries with fail-closed saturation. No raw token is retained in these maps. Worker in-flight requests are bounded at 64.

The CLI requires `NODE_ENV=production`, a validated exact HTTPS origin, an absolute bounded `.sock` path, and `CREDENTIALS_DIRECTORY`. Its environment allowlist admits only those public settings and ordinary systemd/user/locale metadata; inherited DB/KEK/DEK/provider/proxy/Node-override settings refuse startup with a constant code. After reading public configuration, the worker clears inherited environment values. Credential loading uses `O_NOFOLLOW`, checks regular-file/owner/private directory and file permissions plus size, and rejects official test secrets in production. CLI cannot select a test mode. The public UI config also refuses official test site keys in production.

The unit uses a dedicated `debateai-turnstile` user, a socket-only `debateai-turnstile-clients` group, `LoadCredential=turnstile-secret:/etc/debateai/turnstile/secret`, a 0750 runtime directory and 0660 socket. Identity/key/provider state trees and PostgreSQL Unix-socket directories are inaccessible; the worker does not load `api.env`, runner secrets or provider credentials. These are code/template guarantees; actual Linux user/mount/network custody still requires Task 13 deployment verification. On this macOS worktree, tests additionally run a filesystem-confined child that cannot read the controlled relay-only fixture credential, and reject group/world-readable or symlink credential files. No real API OS user or live credential custody was modified.

## Browser interface, config, nonce and CSP

`apps/ui/components/auth/TurnstileChallenge.tsx` exports the client component and props:

`{siteKey, action, locale, nonce, resetKey: string | number, onToken(token | null), onError()}`.

No secret is a prop. The widget uses the already provisioned **Managed** mode with `appearance: "interaction-only"`, `execution: "render"`, `size: "flexible"`, and no automatic hidden response field. One shared explicitly rendered SDK script loads per document and StrictMode effect replay creates one live widget. Expiry clears the token; timeout/provider failure clears it and calls a constant error callback without reflecting provider codes. Changed reset keys clear and reset consumed tokens without recreating the widget; cleanup removes it and stale callbacks/load completions cannot create account authority.

`apps/ui/lib/turnstile.ts` exports `TurnstilePublicConfig`, `publicTurnstileConfig(siteKey, nonce, production)`, `validTurnstilePublicConfig`, `turnstileLanguage`, `loadTurnstile` and browser SDK types. The fixed script is `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`; it carries an explicit nonce. Missing/invalid public config fails closed. `turnstileLanguage` normalizes to Cloudflare-supported language values rather than blindly forwarding catalog/regional codes: en-US/en-GB become en; unsupported et/ga/lv/mt become auto; supported regional inputs reduce to their supported base, with traditional Chinese explicitly mapping to zh-tw.

Client navigation may carry a newly generated RSC nonce while the existing document retains its original CSP. The root theme bootstrap now has stable id `dialectical-document-bootstrap`. The loader prefers that known non-Turnstile script's bounded, validated **`.nonce` property** (attributes may be hidden), then falls back to the passed server nonce for first-render/test contexts. It takes no nonce from URL or user metadata. StrictMode and RSC-prop mismatch behavior are tested.

`app/sign-up/page.tsx` reads only `TURNSTILE_SITE_KEY` plus the existing `x-nonce` request header and passes public config through the optional `SignUpFlow.turnstile` prop. **Task 11 owns mounting the widget and migrating the initial signup form** to canonical request submission. The current legacy initial form is intentionally not grandfathered through the server. **Task 5 owns the pending/resend view**, must obtain the same public config/nonce, use action resend-verification, require a current token, and increment resetKey after every submit attempt (tokens can be consumed on rejected/unavailable attempts). Task 11/social consumers must do the same for signup.

Document CSP retains nonce/strict-dynamic script policy and adds only exact `https://challenges.cloudflare.com` to connect-src and frame-src. There is no wildcard/unsafe script relaxation. The API CSP remains byte-identical deny-all, and existing nonce/CSRF assertions stay active.

Cloudflare primary documentation checked 2026-10-04:

- [Widget configuration](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)
- [Siteverify validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Supported languages](https://developers.cloudflare.com/turnstile/reference/supported-languages/)
- [CSP nonce guidance](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)

## Public deployment settings and receipt

Only the public receipt `/Users/stefannour/Documents/DebateAIRO/docs/operations/turnstile-2026-10-04/provisioning.json` was read. Its two free Managed widgets are:

| Deployment | Expected exact hostname | Public site key |
|---|---|---|
| Preview | v3-preview.dezbatere.ro | 0x4AAAAAAFNg9KPm2tECytqZ |
| Production | dezbatere.ro | 0x4AAAAAAFNhB_LU3zXCRshs |

API config adds optional `TURNSTILE_SOCKET_PATH` to the strict runtime shape and API env example. Missing config makes proof unavailable. UI examples add only public `TURNSTILE_SITE_KEY`. Worker public configuration is `/etc/debateai/turnstile-public.env` containing matching `PUBLIC_APP_URL`, with socket `/run/debateai-turnstile/siteverify.sock` and the separate systemd credential named `turnstile-secret`.

Task 13 must choose/install the corresponding isolated profile on the actual deployment host, grant API access only to the socket group, maintain API BPF localhost confinement, supply the worker-only private credential without reading it into API/UI environments, verify hostname/site-key pairing and real proof failure/replay/deadline behavior, and prove the API user cannot read the credential. Systemd deployment/custody behavior was not claimed tested on macOS. No preview/server/cloud config, live provider, private credential file, receipt integration status, real mail recipient or release was changed. No paid provider service was activated.

## TDD and verification evidence

The TDD skill and writing-good-tests reference were read before implementation. Initial HTTP tests failed with 15 functional failures / 9 passes: incomplete signup/resend requests and missing/rejected/unavailable proof reached the service, and acknowledgements lacked the canonical retry field. New verifier/widget/relay entrypoints were also initially absent, and CSP behavior failed against the narrow-origin expectation. This is not a claim that missing-module errors alone prove a functional regression: the existing HTTP and CSP behavior supplied the meaningful initial RED assertions.

Further observed RED→GREEN cycles included three source-admission failures (forged capability reached password work; invalid-proof requests were not precharged), the deferred audit's expired-window deadline, the RSC nonce mismatch, production test-site-key config, and internal acknowledgement-field leakage. After each corresponding implementation, focused behavior passed. Fixtures use controlled secrets/test keys and local fake provider/Unix boundaries; they send no live mail or Siteverify traffic.

Commands were run with escalated shell access solely because the authorized worktree resolves through the workspace symlink. All pnpm invocations include `--config.verify-deps-before-run=false`, preventing implicit dependency purge; Vitest workers are bounded to one. No dependency install was performed. Committed evidence logs normalize trailing/EOF whitespace only; result/failure text is unchanged.

| Command / check | Final observed output | Evidence |
|---|---|---|
| `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/turnstile.test.ts tests/unit/turnstile-http.test.ts tests/render/turnstile-challenge.test.tsx tests/unit/s7-authorization.test.ts --maxWorkers=1` | 4 files, 114 passed | task-4-focused-final.log |
| `node --test tests/turnstile/siteverify-relay.test.mjs` | 9 passed, 0 failed | task-4-relay-final.log |
| Affected auth/env Vitest command below | 9 files, 122 passed | task-4-affected-final.log |
| `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/registration.test.ts -t 'P2|T1 rework7 A1|refusal audit|aggregat' --maxWorkers=1` | 21 passed, 39 unrelated tests skipped | task-4-registration-affected.log |
| `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/obs-l2-s04-zone.test.ts --maxWorkers=1` | 17 passed, including all 15 falsification mutants | task-4-s04-final.log |
| UI cwd: `node --import tsx --test lib/i18n/auth.test.mjs lib/contentSecurityPolicy.test.mjs scripts/next-config-csp.test.mjs` | 19 passed, 0 failed | task-4-ui-affected-pass.log |
| `pnpm --config.verify-deps-before-run=false --dir apps/ui test` | 240 total, 239 passed, 1 known baseline failure | task-4-ui-node-final.log |
| `pnpm --config.verify-deps-before-run=false run typecheck` | exit 0 (`tsc --noEmit`) | task-4-typecheck-final2.log |
| `pnpm --config.verify-deps-before-run=false --dir apps/ui run typecheck` | exit 0 (`tsc --noEmit -p tsconfig.json`) | task-4-ui-typecheck-final.log |
| `git diff --check` / staged check | clean | command output |

Affected auth/env command:

```sh
pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/phone-profile-http.test.ts tests/unit/age-gate-api.test.ts tests/unit/legal-signup.test.ts tests/unit/country-gate.test.ts tests/unit/t2-real-client-ip.test.ts tests/unit/api-request-limits.test.ts tests/unit/auth-contract-client.test.ts tests/unit/production-environment-floors.test.ts tests/architecture/vps-env-examples-match-shapes.test.ts --maxWorkers=1
```

Direct API tests use the real Unix verifier and real RegistrationService boundary to reject spoofed, expired, replayed, wrong-host/action and timed-out proofs without lookup/password-KDF/DEK/token/mail work. Additional tests cover canonical missing/unknown authority fields, malformed/resend proof, missing verifier, normalized manual phone/null recovery/server age/legal evidence, duplicate source-charge prevention, source refusals before transport, capability forgery/reuse/mismatch/revocation, opaque audit timing, operational logs omitting token/address fields, and public acknowledgement projection.

Relay tests execute the HTTP/HTTPS request boundary, reject arbitrary target/metadata and oversized bodies, reject concurrent reuse, sanitize upstream metadata, reject oversized/malformed response and redirect, reject inherited identity/provider/proxy env, validate private custody, reject production test secrets, and execute a filesystem-confined child denied access to the fixture credential. Browser tests cover strict effects, one script/live widget, expiry/reset/remove, delayed load, no-secret configuration, unsupported locale fallback, production test-key refusal and RSC nonce mismatch.

Affected fixture migration retains age/country/legal/client-IP/request-size semantics. The deliberate Task 3 route inventory mismatch was corrected: the seven real profile/recovery routes were added to the S7 expected matrix with their existing auth/Origin classifications, and the published route count is 93. No authority/CSRF policy was modified. S04 now pins immutable implementation commit d5c02f8bda4b3b1c527ac87e3522ced1628512ac; all original semantic gates and all 15 mutants remain active and pass.

The complete database pressure suite was not repeated; its HTTP request/acknowledgement fixtures were migrated and both typechecks cover them. Per controller instruction, full integration/stress verification is reserved for Task 13. An initial targeted UI invocation used engine rather than UI cwd and failed file discovery; rerun from the UI directory passed 19/19. Typechecks caught missing UI prop/import and a duplicate controlled verifier property during implementation; those issues were corrected and the final checks pass. No new failing check remains concealed.

## Known debt and remaining scope

The full UI node failure is `lib/i18n/catalogNamespaces.test.mjs > every catalogue handed over carries the namespaces its reader reads`, reporting unchanged `app/new/NewDebatePageClient.tsx:504`, RoomNotice's catalog spread. It is independently reproduced on archived aeeb06260, with evidence in Task 1 report lines 99/150 and `task-1-ui-known-red-baseline.log`; the controller confirmed this baseline. The initial new SignUpPage source assertion failure was adapted to the required public config prop, and its nonce assertion remains active. The full UI suite is therefore explicitly not claimed wholly green.

Remaining consumers: Task 5 pending/resend component and source-budget changes; Task 6 display-aware mail rendering/durable intent if required; Task 10 mandatory social-completion proof; Task 11 initial signup widget/canonical form migration. Remaining deployment: Task 13 actual isolated worker/profile custody and network tests, real widget integration and final full pressure/regression run. Initial legacy signup is intentionally unavailable through its incomplete old public payload until its scheduled migration; no production test-key or old-payload bypass was added to mask that dependency.
