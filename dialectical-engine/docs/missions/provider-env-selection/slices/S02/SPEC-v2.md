# S02 — Both deployments declare themselves, and hosted mode is proved on this Mac against a fake vendor

ui: no
SUPERSEDES `SPEC.md` (v1, frozen and byte-identical) — written by REQ-FIX-PES at node REQ-FIX pass 2 of 3 on verdict `docs/missions/provider-env-selection/reviews/REQ-REV-p1.md`. Requirements CHANGED from v1: **the header** (the S01 dependency is GONE — this slice now needs no other slice; B2), **R2.2** (names the runner environment record; N5), **R2.5** (the accepted probe body quoted exactly, the TLS trust mechanism named, the fake credential literal named; N3, N4), **R2.8** (the resolver is composed in process from literal values, so no register and no database are touched; B2), **R2.9** (rewritten — it forbids the credential VALUE and the credential PATH, never a refusal CODE that contains the word; B3), **R2.11** (adds the no-database clause; B2). Requirements UNCHANGED in substance: R2.1, R2.2b, R2.3, R2.4, R2.6, R2.7, R2.10. Acceptance §5 changed at steps 2, 3 (a new record step), 5 and 7. This file is the SPEC of record; every later packet names it by this file name.

FROZEN at REQ-FIX-PES's READY marker on t_90d85031 (2026-09-24). A change after that marker is
`SPEC-v3.md` with a supersession header, never an in-place edit.

**This slice depends on no other slice.** R2.8 composes the shipped discovery resolver IN PROCESS
from literal values — `createProviderDiscoveryResolver` (`apps/api/src/provider-discovery.ts:40-48`)
takes `configuredProviders`, `targets`, a probe store, a `fetchImplementation` and a clock as plain
arguments, and reads no register and no database. Nothing here publishes a row, so nothing here
waits for S01. (v1's header, `INSTRUCTIONS.md` and `PLAN.md` said step 5 of §5 published with S01's
command while §5 step 5 was the admit line and no requirement named that command — the two readings
the verdict names at `reviews/REQ-REV-p1.md:23-30`. The publishing reading is withdrawn; the
in-process reading is the only one.)

## 1. Why this slice exists (the measured gap)

Intake §10 items (c) and (e). Measured in `.worktrees/pes-base/dialectical-engine` @ 776359c3, and
re-measured by the blind REQ-REV pass (`reviews/REQ-REV-p1.md:73`, `:75` — both GAPs hold):

- **(c)** `DEBATEAI_DEPLOYMENT_MODE` appears in `deploy/vps/env/api.env.example:14`,
  `deploy/vps/env/runner.env.example:11`, the register loader
  (`packages/register/src/runtime-environment.ts:305`, `:569`) and the test fixtures
  (`tests/support/apiEnvironmentFixture.ts:12`, `:46`) — and in NO file under `apps/`. It is absent
  from `DEVELOPMENT_API_ENVIRONMENT_KEYS` (`apps/runner/src/dev-api-environment.ts:36-78`). So the
  local stack is `local` by the absent-outside-production DEFAULT
  (`packages/register/src/runtime-environment.ts:85-96`, pinned by
  `tests/unit/v9-deployment-mode.test.ts:264`), never by a declaration. V's ask — "if on localhost,
  it should use local subs" — is true today by omission, which is the one thing the register law
  says configuration may not be (`packages/register/src/configured-provider-set.ts:10`; ADR-0011).
- **(e)** No hosted acceptance exists. `git grep -n hosted -- acceptance` returns nothing; no file
  under `acceptance/` names `authorization_file`; every `dev:auth:*` script (`package.json:28-41`)
  composes the LOCAL stack. There is a loopback OpenAI-compatible server precedent at
  `acceptance/relay-core.ts:542` (`POST /v1/chat/completions`).

## 2. What is out of scope, stated so no coder invents it

- No runtime hostname check, no `NODE_ENV` inference, no second environment switch (row V-1). This
  slice adds a DECLARATION of the value the loader already resolves; it changes no resolution rule.
- The refusal codes are not renamed, reworded or reordered; this slice only exercises them.
- No real API key, anywhere, at any step (row V-5).
- `/etc/hosts` is not edited and no step runs `sudo`.
- **No debate is booted, and the peer's stack is never started.** Intake §10 item (e)
  (`00-intake.md:114` in the restored intake — the verdict cited `:88`, the pre-restore line) ends
  "a debate ask answered"; the acceptance of (e) in
  this slice is the shipped discovery PROBE answering — one completion, `max_tokens: 8`
  (`packages/providers/src/provider-probe.ts:82`) — and the target joining the panel. Booting a
  debate would mean starting an API and a runner, which on this Mac means the NO-TOUCH stack on
  `:3000`/`:3001`/`:8790`. (`reviews/REQ-REV-p1.md:61`, N11.)
- **No database and no register.** R2.8's resolver is composed in process. Nothing in this slice
  connects to `:55432`.
- README §11's staleness is slice S03's work.

## 3. Requirements

**R2.1** The local API environment the dev stack assembles carries `DEBATEAI_DEPLOYMENT_MODE=local`
as a declared key: `DEBATEAI_DEPLOYMENT_MODE` is a member of `DEVELOPMENT_API_ENVIRONMENT_KEYS`
(`apps/runner/src/dev-api-environment.ts:36-78`) and the assembled environment sets it to exactly
`local`.

**R2.2** The runner environment the dev stack composes sets `DEBATEAI_DEPLOYMENT_MODE` to exactly
`local`. That environment is a SEPARATE object from the API's: the record at
`apps/runner/src/dev-runner-process.ts:85-128`, which today carries `REGISTER_VERSION`,
`PROVIDER_REF`, `PROVIDER_DISCOVERY_TARGETS_JSON` and the rest, and carries no deployment mode.
The key is added to THAT record. (v1 said "by the same means" as the API's key list, which names no
place — `reviews/REQ-REV-p1.md:49`, N5.)

**R2.2b** R2.1 and R2.2 each get a named test case whose `it(...)` text contains the literal
`declares DEBATEAI_DEPLOYMENT_MODE=local`, both in `tests/unit/v9-deployment-mode.test.ts` — the
suite that already holds the mode cases R2.3 pins. The case asserts the assembled value, not the
source text.

**R2.3** The resolution rule does not move. `parseApiEnvironment` and `parseRunnerEnvironment` still
resolve an ABSENT `DEBATEAI_DEPLOYMENT_MODE` outside production to `local`, and still refuse
`NODE_ENV=production` with the key absent (`DEPLOYMENT_MODE_UNRESOLVED`) and any value that is not
exactly `hosted` or `local` (`DEPLOYMENT_MODE_INVALID`). The cases
`tests/unit/v9-deployment-mode.test.ts:248`, `:255`, `:264` and `:273` keep their names and their
GREEN state.

**R2.4** R2.1 and R2.2 change what the dev-environment suites read, and both are RED at base
(intake §5b, `docs/missions/provider-env-selection/00-intake.md:40`; machine-readable copy
`.hermes/reports/provider-env-selection/logs/baselines.tsv`). The slice records
`tests/integration/dev-api-environment.test.ts` and `tests/integration/dev-api-process.test.ts`
case by case, before and after, in `PROGRESS.md`. No case that PASSES at base may fail after. A case
that changes state is named with its full `it(...)` text and its new state. The two failure
families named at intake `00-intake.md:41` — `DEV-09 'atomically assembles the exact environment'`
and the `DEV-10B` cases refusing with `DEV_API_PROCESS_ENVIRONMENT_INVALID` — either keep those
exact names as failures, or the slice names in `PROGRESS.md` which one turned GREEN and by which
step.

**R2.5 — the fake vendor fixture, specified to the byte the shipped probe accepts.** The slice
ships a fake OpenAI-compatible vendor endpoint as an acceptance fixture. It:

(a) listens on a TCP port the fixture itself measured free with
`lsof -nP -iTCP:<port> -sTCP:LISTEN` and that is above 4400 and not one of `:3000`, `:3001`,
`:8790`, `:4310`, `:8791`, `:8792`, `:8793`, `:8795`, `:8796`, `:55432`;

(b) serves TLS from a certificate the fixture generates for itself at run time, and **the trust
anchor is passed through the shipped seam, never through the environment**: the acceptance builds a
`fetch` that trusts the fixture's own CA and hands it to the resolver as
`fetchImplementation` (`apps/api/src/provider-discovery.ts:46`, reaching the probe at
`packages/providers/src/provider-probe.ts:74`). `NODE_TLS_REJECT_UNAUTHORIZED` is never set, and
nothing is added to V's trust store. A run that cannot build that `fetch` reports UNVERIFIED and
stops; it does not fall back to plain HTTP. (`reviews/REQ-REV-p1.md:47`, N4.)

(c) answers `POST /v1/chat/completions` with HTTP 200 and a body the shipped probe ACCEPTS, which
is not any OpenAI-shaped body: `packages/providers/src/provider-probe.ts:103` marks the target
invalid unless `decoded.model` equals the target's `model` AND
`choices[0].message.content` is exactly the two characters `OK`. The fixture's 200 body therefore
carries `model` equal to the target's `model` and
`{"choices":[{"message":{"content":"OK"}}]}`, and its total size stays under the 64 KiB the probe
admits (`provider-probe.ts:41`, `:91`). (`reviews/REQ-REV-p1.md:45`, N3.)

(d) answers HTTP 401 when the request's `Authorization` header is absent, and HTTP 401 with a body
naming no credential when it is present and not equal to the expected literal;

(e) holds no real key: the expected header value is the fixed literal
`Bearer pes-s02-fake-vendor-token`, written in the fixture's own source and in the credential file
R2.8 provisions, and in no other place.

**R2.6** The fake endpoint's base URL host is a name the hosted refusal at
`deploy/vps/README.md:775` does not cover — not `localhost`, not under `.localhost`, not a literal
address in any range that line lists — and it resolves to this Mac. The SPEC pins
`https://api.localtest.me:<port>/v1`, because `localtest.me` and every name under it resolve to
`127.0.0.1` in public DNS, which needs no `/etc/hosts` edit and no `sudo`. The hosted checker
`isRefusedHostedProviderHost` (`packages/providers/src/index.ts:584-592`) decides on the LITERAL
written and does no name resolution, so this target is ADMITTED while a literal `127.0.0.1` target
is REFUSED — exactly the pair the acceptance shows. A step that cannot resolve `api.localtest.me`
is reported UNVERIFIED with the resolver's own error, never worked around.

**R2.7** The hosted acceptance exercises, in hosted mode, against declared targets and with no
network call before the refusal: a loopback `base_url` refused with
`PROVIDER_TARGET_LOOPBACK_REFUSED:` and the ref; an inline `authorization_header` refused with
`PROVIDER_INLINE_CREDENTIAL_REFUSED:` and the ref; a target naming both `authorization_file` and
`authorization_header` refused with `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT`
(`packages/providers/src/index.ts:306-307`); an `authorization_file` path at which nothing is
provisioned refused with `PROVIDER_AUTHORIZATION_FILE_ABSENT:` and the ref; and a target with no
price members refused with `PROVIDER_TARGET_PRICE_REQUIRED:` and the ref. Each refusal is printed
verbatim, on its own line, with no credential value and no credential path beside it.

**R2.8 — the admission case, composed in process.** The acceptance provisions a credential file
under the shipped custody contract — `0600`, one hard link, no symlink, inside a `0700` directory
owned by the running user, holding one printable header line
(`deploy/vps/README.md:784-793`) whose content is the literal of R2.5e — and then composes
`createProviderDiscoveryResolver` (`apps/api/src/provider-discovery.ts:40-48`) directly, passing:
`configuredProviders` as a literal one-entry array, `targets` as the parse of a literal targets
JSON pointed at the fake endpoint of R2.5 with its price members set, an in-memory probe store,
the trusting `fetch` of R2.5b, and a clock. It then awaits the resolver once and shows the target
joining the discovered panel, and the fixture records that it received exactly one request whose
`Authorization` header equalled the expected literal. **No register row is read, no database is
opened, and no service process is started.**

**R2.9 — the stdout law, stated so it can be obeyed.** No line of the run's stdout or stderr
contains (i) the credential literal of R2.5e or any substring of it after the scheme word, (ii) the
scheme word `Bearer` followed by a token, or (iii) the absolute path of the credential file or of
its `0700` directory. A refusal CODE is NOT a credential, and a code that contains the word
`authorization` is lawful and expected: `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT`,
`PROVIDER_AUTHORIZATION_FILE_ABSENT:`, `PROVIDER_INLINE_CREDENTIAL_REFUSED:` and
`PROVIDER_AUTHORIZATION_FILE_UNUSABLE:` are printed in full by R2.7. (v1 forbade "the words
`Bearer` or `authorization`" on any line while step 4 required two codes containing `authorization`
— no output satisfied both; `reviews/REQ-REV-p1.md:31-37`.)

**R2.10** Every file the acceptance writes lands under a directory the run creates and removes
before exiting, and its absolute path is printed on a line beginning `PES-S02 SCRATCH-DIR `. No
step writes into `/etc`, into another mission's lane, or into the main tree's uncommitted work.

**R2.11** No step of this slice starts, stops, restarts or sends a request to a process the seat
did not start; no step connects to `:55432` or to any database; and no step writes a register row
anywhere. The only listener the slice opens is the fixture of R2.5a, on the port it measured free.

## 4. Verification

The base pairs are the intake's baseline table, cited and not restated:
`docs/missions/provider-env-selection/00-intake.md:40`; the machine-readable copy is
`.hermes/reports/provider-env-selection/logs/baselines.tsv`; the logs are
`baseline-intake-suites.log` and `baseline-intake-typecheck.log`.

Of the four suites RED at base, two are touched by R2.1/R2.2 and are governed by R2.4 —
`tests/integration/dev-api-environment.test.ts` and `tests/integration/dev-api-process.test.ts`.
The other two stay EXACTLY at their base pairs: `tests/integration/dev-provider-panel.test.ts`
(RED because this host answers four live relay slots, not two — intake `00-intake.md:41`) and
`tests/integration/t16-algorithm-register.test.ts`.

`pnpm typecheck` is judged by the per-file DELTA against `baseline-intake-typecheck.log`, never by
its exit code.

## 5. Acceptance — numbered steps V runs alone on this Mac

Every step starts with `export PATH="/opt/homebrew/bin:$PATH"`. No step uses a real API key, edits
`/etc/hosts`, runs `sudo`, or touches a NO-TOUCH port. No step needs any other slice.

1. `cd` into the slice lane the orchestrator names in the TEST(S) ticket.
2. Read the declared local mode from behaviour, not from source:
   `pnpm vitest run tests/unit/v9-deployment-mode.test.ts -t 'declares DEBATEAI_DEPLOYMENT_MODE=local'`
   reports two cases, both passing — one for the API environment, one for the runner's. (The path
   is exact, not a fuzzy filter.) This step starts no process and touches no port.
3. Record the NO-TOUCH stack as it stands, so step 10 has something to compare with:
   `lsof -nP -iTCP:3000 -sTCP:LISTEN; lsof -nP -iTCP:8790 -sTCP:LISTEN` — write the PIDs down, or
   `| tee /tmp/pes-s02-before.log`. (`reviews/REQ-REV-p1.md:55`, N8.)
4. Run the hosted acceptance:
   `pnpm pes:accept-hosted 2>&1 | tee /tmp/pes-s02-accept.log`.
5. The output carries, each on its own line and in this order: `PES-S02 SCRATCH-DIR ` and an
   absolute path; `PES-S02 FAKE-VENDOR ` and the `https://api.localtest.me:<port>/v1` base URL it
   bound; then one line per refusal of R2.7, each beginning `PES-S02 REFUSED ` and then the code
   verbatim — `PROVIDER_TARGET_LOOPBACK_REFUSED:`, `PROVIDER_INLINE_CREDENTIAL_REFUSED:`,
   `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT`, `PROVIDER_AUTHORIZATION_FILE_ABSENT:`,
   `PROVIDER_TARGET_PRICE_REQUIRED:` — each followed by the provider ref it refused.
6. The output then carries a line beginning `PES-S02 ADMITTED ` naming the provider ref that
   joined the panel, and a line beginning `PES-S02 VENDOR-REQUESTS ` reading `1 matched 0 rejected`.
7. Confirm the credential never appeared. Two greps, both printing `0`:
   `grep -c 'pes-s02-fake-vendor-token' /tmp/pes-s02-accept.log` and
   `grep -cF "$(sed -n 's/^PES-S02 SCRATCH-DIR //p' /tmp/pes-s02-accept.log)/credential" /tmp/pes-s02-accept.log`.
   The refusal codes of step 5 contain the word `authorization` and are LAWFUL (R2.9); they are not
   what these greps look for.
8. The run's LAST stdout line is exactly `PES-S02-ACCEPT: PASS`. A failing run's last line begins
   `PES-S02-ACCEPT: FAIL ` and names the first case that did not hold.
9. Confirm the scratch directory is gone: `test -e "<the path from step 5>" ; echo $?` prints `1`.
10. Confirm the local stack was not disturbed: `lsof -nP -iTCP:3000 -sTCP:LISTEN` and
    `lsof -nP -iTCP:8790 -sTCP:LISTEN` list the same PIDs step 3 recorded.

## 6. Open question routed to V

None blocking. The mission's `V-ROW: NEW` blocks are in `../S01/DECISIONS.md`.
