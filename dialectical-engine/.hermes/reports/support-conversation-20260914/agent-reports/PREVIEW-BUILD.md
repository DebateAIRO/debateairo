# PREVIEW-BUILD case file — supported local preview

## Question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — focused tests did not cover the first real database state

**Cause.** The PostgreSQL status reader assumed exactly one row, although a fresh database legitimately has no Support publication. After that was corrected, initialization reused the runtime reader pool's 700 ms statement budget for a write and PostgreSQL cancelled it with `57014`.

**Price.** Two live stack attempts plus narrow database diagnostics. Each attempt rebuilt enough of the chain to spend tens of seconds before exposing the next boundary. Actual token usage is **UNAVAILABLE**.

**Upgrade.** Give the supported stack a preflight integration test that starts a clean isolated database and exercises `empty status -> bounded initial publication -> valid single snapshot`. Keep malformed and multirow mutants in the same frame. Encode separate read and initialization-write budgets in the packet before implementation.

## Finding 2 — one logical profile was represented at several independent boundaries

**Cause.** Ports and identity assumptions existed in the runner, TLS front door, Compose environment, API target ratifier, generated API environment, provider relays, Hatchet tooling, and UI launcher. The first profile implementation reached the real API before revealing that its model ratifier still admitted only default port 8794. Adding the preview marker then made the previously generated `api.env` stale.

**Price.** Two additional live retries: `SUPPORT_MODEL_PATH_NOT_RATIFIED`, then `DEV_API_ENVIRONMENT_DRIFT`. The earlier plan's “no relay implementation edit” statement also had to be superseded once the server-owned marker needed a serialization source.

**Upgrade.** Generate a checked profile contract from one immutable object and derive runner arguments, Compose environment, TLS ports, target JSON, and generated-environment schema from it. Put a schema/version fingerprint into mission-owned generated artifacts so the launcher can explain and safely regenerate stale local output before starting services.

## Finding 3 — runtime conversion crossed an IPC boundary without a contract test at the emitter

**Cause.** `loadRunnerEnvironment` safely converts the register version to a legacy number for runner internals, while the supervisor expects the canonical string receipt. The child sent its internal value directly. Unit tests protected the supervisor's refusal but did not run the actual child emitter.

**Price.** One nearly complete live startup ended at `DEV_RUNNER_PROCESS_READINESS_INVALID`, followed by source tracing and one more launch.

**Upgrade.** Add a lightweight child-process contract test for every readiness emitter. Validate and serialize at the IPC boundary, then feed the real message to the existing supervisor parser. Keep internal representations private to the child.

## Finding 4 — sandbox failures looked like product failures until retried normally

**Cause.** `tsx` could not open its IPC socket under the sandbox (`listen EPERM`), localhost curl could not reach a verified host listener, and the sandbox could not signal the supervisor or read Docker's socket. The same operations succeeded under normal scoped execution.

**Price.** Four low-value failed probes and four identical normal-execution retries. The failures were quick, but their stack traces and policy diagnosis consumed transcript space.

**Upgrade.** Mark the supported preview command, local curl readiness, Docker inventory, and supervisor signal probe as normal-local operations in the mission runner. A wrapper should preserve both sandbox and normal receipts only when the first failure is a recognized policy signature.

## Finding 5 — live error receipts were too coarse for fast diagnosis

**Cause.** The stack correctly emits bounded public failure codes, but nested causes are intentionally suppressed. Diagnosing the 57014 cancellation and the readiness representation mismatch required temporary focused reproduction because the live logs named only the outer stage.

**Price.** Several source traces and targeted diagnostic tests. The fail-closed behavior was correct; the developer receipt was insufficiently specific.

**Upgrade.** Add a secret-safe structured diagnostic receipt with stage, stable inner code, elapsed time, and owned-resource state. Never include URLs with credentials, authorization headers, query text, or child environment values.

## Finding 6 — partial redaction was unsafe

**Cause.** A metadata probe used a regular expression intended to mask a bearer field but printed a stale stopped relay token value into tool output. The relay was ephemeral and already stopped, and the next start rotated custody, but partial pattern redaction failed its purpose.

**Price.** Incident assessment, rotation verification, and stricter inspection for the remainder of the node. The secret value is absent from all persisted evidence and this report.

**Upgrade.** Never inspect credential-bearing generated files with ad hoc regex replacement. Use a repository helper that parses the exact schema and emits keys, file mode, owner, inode/link count, value lengths, and keyed hashes only. Default to dropping complete values before output formatting.

## Finding 7 — process control through a PTY obscured lifecycle truth

**Cause.** Ctrl-C sent through the command PTY ended the host process tree but left uncertainty about whether the actual supervisor's signal handler had completed. The final probe targeted the real listener-owning supervisor PID with `SIGTERM`.

**Price.** One extra live launch and a manual stop of the two exact preview containers after the ambiguous attempt.

**Upgrade.** Have the supported launcher write a private supervisor PID/ownership receipt and provide a supported `dev:auth:down` command that signals that PID, waits for `rc=0`, verifies all selected listeners absent, and reports only its Compose project. This removes PTY semantics from lifecycle verification.

## Finding 8 — baseline attribution was incomplete

**Cause.** The frozen diagnostic worktree reproduced a selected failing-test set, but the mission did not capture a whole `pnpm typecheck` at `b7ca2c41`. The final typecheck has no PREVIEW-owned source diagnostics, yet most remaining errors cannot truthfully be called pre-existing.

**Price.** The handoff must carry an unattributed diagnostic list, and another node may need a bounded base comparison.

**Upgrade.** Capture the exact whole typecheck once when freezing the lane, alongside the focused baseline. Future nodes can compare diagnostic tuples `(path,line,code)` without rerunning or guessing attribution.

## What worked

- The measured profile plan fixed every port and namespace before implementation and prevented arbitrary URL/port configuration.
- One heavy-command lease prevented overlapping databases, builds, and live stacks.
- Committing and releasing the API ratifier pair early let NAV proceed on a stable boundary while infrastructure work continued on disjoint files.
- The isolated Compose project, volume, worktree-local TLS, and preflight listener probes preserved existing services.
- Direct normal curl proved ordinary system trust without `-k` or a custom CA override. The unavailable locked browser was reported rather than bypassed.

## One-prompt machine upgrade

Create one `dev:auth:verify --profile support-preview` workflow driven by a checked profile manifest. It should: validate Docker availability and current context without changing it; verify all fixed ports are free; validate or regenerate only mission-owned versioned artifacts; generate worktree-local TLS; resolve both default and preview Compose configurations; start a clean isolated database; prove empty-to-publication initialization with the dedicated write budget; start API, runner, UI, provider, and TLS boundaries; test custom-CA and ordinary system trust separately; emit safe readiness and footprint receipts; signal the real supervisor; and verify all selected listeners are gone. The command should trap cleanup, expose stable nested error codes, and never print credential values. The dispatch packet then needs only the profile name, source base, allowed paths, and expected receipt schema.

## Actual measurements

- Product commits: `1d84592c0d639dfebaea4ac3aa9cb0711555e251` and `fa362c5e87abe0e6068cb8f43822d718697258f5`.
- Focused test frame: 10/10 files, 150/150 tests, 1.98 s.
- Real boundary frame: 3/3 files, 3 passed, 35 skipped, 13.53 s.
- Live ready origin: `https://localhost:3100`.
- Ordinary system curl: HTTP 200, no `-k`, no `--cacert`.
- Direct supervisor stop: `SIGTERM`, parent `rc=0`, 2.53 s, 12/12 selected listeners absent afterward.
- Browser trust: **UNVERIFIED**, Mac locked and no browser surface available; Vitest/jsdom exists, optional Playwright peers appear in the lockfile, but no installed repository browser runner was proved by this bounded check.
- Full typecheck: `rc=1`; no PREVIEW-owned production-source diagnostic, remaining groups partly unattributed.
- Actual token usage: **UNAVAILABLE**.
