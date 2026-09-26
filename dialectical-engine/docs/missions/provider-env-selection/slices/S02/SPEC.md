# S02 — Both deployments declare themselves, and hosted mode is proved on this Mac against a fake vendor
ui: no

FROZEN at REQ-PES's READY marker on t_c677f87a (2026-09-24). A change after that marker is
`SPEC-v2.md` with a supersession header, never an in-place edit.

Depends on S01: step 5 of §5 publishes the hosted row with the command S01 ships. Until S01 is
merged into the lane, steps 1–4 and 6–9 run and step 5 is UNVERIFIED.

## 1. Why this slice exists (the measured gap)

Intake §10 items (c) and (e). Measured in `.worktrees/pes-base/dialectical-engine` @ 776359c3:

- **(c)** `DEBATEAI_DEPLOYMENT_MODE` appears in `deploy/vps/env/api.env.example:14`,
  `deploy/vps/env/runner.env.example:11`, the register loader
  (`packages/register/src/runtime-environment.ts:305`, `:569`) and the test fixtures
  (`tests/support/apiEnvironmentFixture.ts:12`, `:46`) — and in NO file under `apps/runner/src`.
  `git grep -n DEBATEAI_DEPLOYMENT_MODE -- apps` returns nothing. The key is absent from
  `DEVELOPMENT_API_ENVIRONMENT_KEYS` (`apps/runner/src/dev-api-environment.ts:36-65`). So the local
  stack is `local` by the absent-outside-production DEFAULT
  (`packages/register/src/runtime-environment.ts:85`, pinned by
  `tests/unit/v9-deployment-mode.test.ts:264`), never by a declaration. V's ask — "if on localhost,
  it should use local subs" — is true today by omission, which is the one thing the register law
  says configuration may not be (`packages/register/src/configured-provider-set.ts:10`; ADR-0011).
- **(e)** No hosted acceptance exists. `git grep -n hosted -- acceptance` returns nothing; no file
  under `acceptance/` names `authorization_file`; every `dev:auth:*` script
  (`package.json:28-41`) composes the LOCAL stack. There is a loopback OpenAI-compatible server
  precedent at `acceptance/relay-core.ts:542` (`POST /v1/chat/completions`).

## 2. What is out of scope, stated so no coder invents it

- No runtime hostname check, no `NODE_ENV` inference, no second environment switch (row V-1,
  charge 5 of the REQ packet). This slice adds a DECLARATION of the value the loader already
  resolves; it changes no resolution rule.
- The refusal codes are not renamed, reworded or reordered; this slice only exercises them.
- No real API key, anywhere, at any step (row V-5). The fake endpoint's expected header value is a
  fixed literal both the fixture and the credential file carry.
- `/etc/hosts` is not edited and no step runs `sudo`.
- README §11's staleness is slice S03's work.

## 3. Requirements

**R2.1** The local API environment the dev stack assembles carries `DEBATEAI_DEPLOYMENT_MODE=local`
as a declared key: `DEBATEAI_DEPLOYMENT_MODE` is a member of `DEVELOPMENT_API_ENVIRONMENT_KEYS`
(`apps/runner/src/dev-api-environment.ts:36-65`) and the assembled environment sets it to exactly
`local`.

**R2.2** The local runner environment the dev stack assembles sets `DEBATEAI_DEPLOYMENT_MODE` to
exactly `local` by the same means.

**R2.2b** R2.1 and R2.2 each get a named test case whose `it(...)` text contains the literal
`declares DEBATEAI_DEPLOYMENT_MODE=local`, in a suite V can run by path in one command. The case
asserts the assembled value, not the source text.

**R2.3** The resolution rule does not move. `parseApiEnvironment` and `parseRunnerEnvironment` still
resolve an ABSENT `DEBATEAI_DEPLOYMENT_MODE` outside production to `local`, and still refuse
`NODE_ENV=production` with the key absent (`DEPLOYMENT_MODE_UNRESOLVED`) and any value that is not
exactly `hosted` or `local` (`DEPLOYMENT_MODE_INVALID`). The cases
`tests/unit/v9-deployment-mode.test.ts:248`, `:255`, `:264` and `:273` keep their names and their
GREEN state.

**R2.4** R2.1 and R2.2 change what the dev-environment suites read, and both are RED at base
(intake §5b, `docs/missions/provider-env-selection/00-intake.md:40`). The slice records
`tests/integration/dev-api-environment.test.ts` and `tests/integration/dev-api-process.test.ts`
case by case, before and after, in `PROGRESS.md`. No case that PASSES at base may fail after. A case
that changes state is named with its full `it(...)` text and its new state. The two failure
families named at intake `00-intake.md:41` — `DEV-09 'atomically assembles the exact environment'`
and the `DEV-10B` cases refusing with `DEV_API_PROCESS_ENVIRONMENT_INVALID` — either keep those
exact names as failures, or the slice names in `PROGRESS.md` which one turned GREEN and by which
step.

**R2.5** The slice ships a fake OpenAI-compatible vendor endpoint as an acceptance fixture. It:
(a) listens on a TCP port the fixture itself measured free with `lsof -nP -iTCP:<port> -sTCP:LISTEN`
and that is above 4400 and not one of `:3000`, `:3001`, `:8790`, `:4310`, `:8791`, `:8792`,
`:8793`, `:8795`, `:8796`, `:55432`;
(b) serves TLS, so its base URL scheme is `https:` and
`PROVIDER_BASE_URL_TLS_REQUIRED:` is not what the boot answers;
(c) answers `POST /v1/chat/completions` with HTTP 200 and an OpenAI-shaped body ONLY when the
request's `Authorization` header equals the fixed literal the fixture and the credential file both
carry, and with HTTP 401 and a body naming no credential otherwise;
(d) answers HTTP 401 when the `Authorization` header is absent;
(e) holds no real key: its expected header value is a literal in the fixture's own source.

**R2.6** The fake endpoint's base URL host is a name the hosted refusal at
`deploy/vps/README.md:775` does not cover — not `localhost`, not under `.localhost`, not a literal
address in any range that line lists — and it resolves to this Mac. The SPEC pins
`https://api.localtest.me:<port>/v1`, because `localtest.me` and every name under it resolve to
`127.0.0.1` in public DNS, which needs no `/etc/hosts` edit and no `sudo`. The hosted checker reads
the literal address written and does no name resolution
(`deploy/vps/README.md:775`), so this target is ADMITTED while a literal `127.0.0.1` target is
REFUSED — which is exactly the pair the acceptance shows. A step that cannot resolve
`api.localtest.me` is reported UNVERIFIED with the resolver's own error, never worked around.

**R2.7** The hosted acceptance exercises, in hosted mode, against declared targets and with no
network call before the refusal: a loopback `base_url` refused with `PROVIDER_TARGET_LOOPBACK_REFUSED:`
and the ref; an inline `authorization_header` refused with `PROVIDER_INLINE_CREDENTIAL_REFUSED:`
and the ref; a target naming both `authorization_file` and `authorization_header` refused with
`PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT`; an `authorization_file` path at which nothing is
provisioned refused with `PROVIDER_AUTHORIZATION_FILE_ABSENT:` and the ref; and a target with no
price members refused with `PROVIDER_TARGET_PRICE_REQUIRED:` and the ref. Each refusal is printed
verbatim, on its own line, with no path and no credential byte beside it.

**R2.8** The hosted acceptance then provisions a credential file under the shipped custody contract
— `0600`, one hard link, no symlink, inside a `0700` directory owned by the running user, holding
one printable header line (`deploy/vps/README.md:784-793`) — points one target at the fake
endpoint of R2.5 with its price members set, and shows the probe answering: the target joins the
discovered panel, and the fixture records that it received exactly one request whose
`Authorization` header matched.

**R2.9** The acceptance proves the credential is honoured and never leaked: the fixture records a
request whose `Authorization` header equals the provisioned literal, and no line of the run's
stdout or stderr contains the literal, the words `Bearer` or `authorization`, or the credential
file's path.

**R2.10** Every file the acceptance writes lands under a directory the run creates and removes
before exiting, and its absolute path is printed on a line beginning `PES-S02 SCRATCH-DIR `. No
step writes into `/etc`, into another mission's lane, or into the main tree's uncommitted work.

**R2.11** No step of this slice starts, stops, restarts or sends a request to a process the seat
did not start, and no step writes a register row into the database the local dev stack reads.

## 4. Verification

The base pairs are the intake's baseline table, cited and not restated:
`docs/missions/provider-env-selection/00-intake.md:40`; the logs are
`.hermes/reports/provider-env-selection/logs/baseline-intake-suites.log` and
`baseline-intake-typecheck.log`.

Of the four suites RED at base, two are touched by R2.1/R2.2 and are governed by R2.4 —
`tests/integration/dev-api-environment.test.ts` and `tests/integration/dev-api-process.test.ts`.
The other two stay EXACTLY at their base pairs: `tests/integration/dev-provider-panel.test.ts`
(RED because this host answers four live relay slots, not two — intake `00-intake.md:41`) and
`tests/integration/t16-algorithm-register.test.ts`.

`pnpm typecheck` is judged by the per-file DELTA against `baseline-intake-typecheck.log`, never by
its exit code.

## 5. Acceptance — numbered steps V runs alone on this Mac

Every step starts with `export PATH="/opt/homebrew/bin:$PATH"`. No step uses a real API key, edits
`/etc/hosts`, runs `sudo`, or touches a NO-TOUCH port.

1. `cd` into the slice lane the orchestrator names in the TEST(S) ticket.
2. Read the declared local mode from behaviour, not from source. Run the suite `PLAN.md` names for
   R2.2b by its exact repository path, for example
   `pnpm vitest run tests/unit/v9-deployment-mode.test.ts -t 'declares DEBATEAI_DEPLOYMENT_MODE=local'`,
   and read the reported pair: two cases, both passing — one for the API environment, one for the
   runner's. (`run-suites.sh` takes exact repository paths, not fuzzy filters.) This step starts no
   process and touches no port.
3. Run the hosted acceptance:
   `pnpm pes:accept-hosted 2>&1 | tee /tmp/pes-s02-accept.log`.
4. The output carries, each on its own line and in this order: `PES-S02 SCRATCH-DIR ` and an
   absolute path; `PES-S02 FAKE-VENDOR ` and the `https://api.localtest.me:<port>/v1` base URL it
   bound; then one line per refusal of R2.7, each beginning `PES-S02 REFUSED ` and then the code
   verbatim — `PROVIDER_TARGET_LOOPBACK_REFUSED:`, `PROVIDER_INLINE_CREDENTIAL_REFUSED:`,
   `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT`, `PROVIDER_AUTHORIZATION_FILE_ABSENT:`,
   `PROVIDER_TARGET_PRICE_REQUIRED:` — each followed by the provider ref it refused.
5. The output then carries a line beginning `PES-S02 ADMITTED ` naming the provider ref that
   joined the panel, and a line beginning `PES-S02 VENDOR-REQUESTS ` reading `1 matched 0 rejected`.
6. The run's LAST stdout line is exactly `PES-S02-ACCEPT: PASS`. A failing run's last line begins
   `PES-S02-ACCEPT: FAIL ` and names the first case that did not hold.
7. Confirm the credential never appeared:
   `grep -cEi 'bearer|authorization' /tmp/pes-s02-accept.log` prints `0`, except for the refusal
   lines of step 4, whose codes contain the word — so the exact check is
   `grep -Ei 'bearer|authorization' /tmp/pes-s02-accept.log | grep -cv '^PES-S02 REFUSED '`, which
   prints `0`.
8. Confirm the scratch directory is gone: `test -e "<the path from step 4>" ; echo $?` prints `1`.
9. Confirm the local stack was not disturbed: `lsof -nP -iTCP:3000 -sTCP:LISTEN` and
   `lsof -nP -iTCP:8790 -sTCP:LISTEN` list the same PIDs they listed before step 3.

## 6. Open question routed to V

None blocking. The mission's two `V-ROW: NEW` blocks are in `S01/DECISIONS.md`.
