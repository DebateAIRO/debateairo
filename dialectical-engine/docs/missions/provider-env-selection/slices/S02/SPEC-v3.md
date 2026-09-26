# S02 — Both deployments declare themselves, and hosted mode is proved on this Mac against a fake vendor

ui: no
SUPERSEDES `SPEC-v2.md` (and through it `SPEC.md`; both frozen and byte-identical) — written by REQ-FIX-PES at node REQ-FIX pass 3 of 3 on verdict `docs/missions/provider-env-selection/reviews/REQ-REV-p2.md`. Requirements CHANGED from v2: **R2.7** (the five refusals run through the shipped chain in its order, each from a fixture written out exactly — the loopback fixture is `https:`, because an `http:` one stops at `PROVIDER_BASE_URL_TLS_REQUIRED:` first), **R2.8** (the credential sits at `<scratch>/custody.d/vendor.header`; the resolver receives the RESOLVED targets and both integers; B2, N1), **R2.9** (clause (i) is the exact token; clause (iii) names `<scratch>/custody.d`; B2, N2), **R2.10** (the scratch root is not the custody directory; B2). Requirements UNCHANGED: R2.1, R2.2b, R2.3, R2.4, R2.6, R2.11; R2.2 and R2.5 keep their rules word for word and lose only their pass-1 review citations, which live in `DECISIONS.md`. Acceptance §5 changed at step 5 (the scratch ROOT is printed; one refusal line per row of R2.7's table, in its order; a ref follows only a code that ends in `:`, because the shipped `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT` carries none), step 7 (the grep looks at `<scratch>/custody.d`) and step 9 ("scratch root"), and step 3 loses a pass-1 citation. The header's dependency paragraph and §2 are re-worded to v3's chain with no rule changed; §6 is re-worded. This file is the SPEC of record; every later packet names it by this file name.

FROZEN at REQ-FIX-PES's READY marker on t_690beb44 (2026-09-24). Pass 3 is the last rework pass; a
change after that marker is a V row, never an in-place edit.

**This slice depends on no other slice.** R2.7 and R2.8 run the shipped provider chain IN PROCESS
from literal values: nothing here reads a register, opens a database or publishes a row. V can run
this slice's acceptance with no other slice merged.

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
- The refusal codes are not renamed, reworded or reordered; this slice only exercises them, through
  the shipped functions that emit them.
- No real API key, anywhere, at any step (row V-5).
- `/etc/hosts` is not edited and no step runs `sudo`.
- **No debate is booted, and the peer's stack is never started.** Intake §10 item (e)
  (`00-intake.md:114`) ends "a debate ask answered"; the acceptance of (e) in this slice is the
  shipped discovery PROBE answering — one completion, `max_tokens: 8`
  (`packages/providers/src/provider-probe.ts:82`) — and the target joining the panel. Booting a
  debate would mean starting an API and a runner, which on this Mac means the NO-TOUCH stack on
  `:3000`/`:3001`/`:8790`. (`reviews/REQ-REV-p1.md:61`, N11.)
- **No database and no register.** Nothing in this slice connects to `:55432`.
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
The key is added to THAT record.

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
stops; it does not fall back to plain HTTP.

(c) answers `POST /v1/chat/completions` with HTTP 200 and a body the shipped probe ACCEPTS, which
is not any OpenAI-shaped body: `packages/providers/src/provider-probe.ts:103` marks the target
invalid unless `decoded.model` equals the target's `model` AND
`choices[0].message.content` is exactly the two characters `OK`. The fixture's 200 body therefore
carries `model` equal to the target's `model` and
`{"choices":[{"message":{"content":"OK"}}]}`, and its total size stays under the 64 KiB the probe
admits (`provider-probe.ts:41`, `:91`).

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

**R2.7 — the five refusals, through the shipped chain, from fixtures written out exactly.** Every
target of this slice goes through the chain the shipped API composition root takes, in its order,
and stops at the first function that refuses: `parseProviderDiscoveryTargets`
(`apps/api/src/main.ts:300-302`), `assertDeploymentProviderTargets` in hosted mode (`:305-307`),
`assertPricedProviderTargets` (`:312`), then `resolveProviderTargetCredentials` with the shipped
`readCustodyAuthorizationHeader` (`:317-318`). The configured set given to the parse is the one
entry `{"providerRef":"vendor:a","maker":"Acme"}`. The five refusal fixtures are these, exactly
as written; the only substitution is the literal `/SCRATCH`, which the acceptance replaces with its
scratch directory's absolute path (R2.10). None of them reaches the network — each is refused
before the resolver is composed (`main.ts:319`) — so the port `4455` inside them is never bound and
never connected to. Each line of the third column was produced by the shipped chain for that exact
fixture at this pass (`.hermes/reports/provider-env-selection/probes/REQ-FIX-PES/p3_checks.py`):

| case | target | the code step 5 prints |
|---|---|---|
| `refused-loopback` | `{"provider_ref":"vendor:a","base_url":"https://127.0.0.1:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/vendor.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}` | `PROVIDER_TARGET_LOOPBACK_REFUSED:` |
| `refused-inline` | `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_header":"Bearer inline-not-provisioned","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}` | `PROVIDER_INLINE_CREDENTIAL_REFUSED:` |
| `refused-conflict` | `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/vendor.header","authorization_header":"Bearer inline-not-provisioned","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}` | `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT` |
| `refused-absent` | `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/absent.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}` | `PROVIDER_AUTHORIZATION_FILE_ABSENT:` |
| `refused-price` | `{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:4455/v1","model":"fake-model","authorization_file":"/SCRATCH/custody.d/vendor.header"}` | `PROVIDER_TARGET_PRICE_REQUIRED:` |

Each refusal is printed verbatim, on its own line, with no credential value and no credential path
beside it (R2.9). The loopback fixture is `https:` on purpose: the same target with `http:` stops
one function earlier with `PROVIDER_BASE_URL_TLS_REQUIRED:` (executed at this pass), which is not
the refusal this case exists to show.

**R2.8 — the admission case, and the custody layout.** The acceptance provisions exactly one
credential file, at `<scratch>/custody.d/vendor.header`, under the shipped custody contract
(`deploy/vps/README.md:786-790`): the directory `<scratch>/custody.d` is created by the run at mode
`0700` and owned by the running user; the file inside it is `0600`, one hard link, no symlink, and
holds the literal of R2.5e and one trailing newline. That layout was read back through the shipped
`readCustodyAuthorizationHeader` at this pass and accepted. The admission target is
`{"provider_ref":"vendor:a","base_url":"https://api.localtest.me:<port>/v1","model":"fake-model","authorization_file":"<scratch>/custody.d/vendor.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}`,
with `<port>` the fake vendor's port (R2.5a). It goes through the chain of R2.7 and is not refused;
the output of `resolveProviderTargetCredentials` — the RESOLVED targets, which carry the
`authorizationHeader` the probe sends (`packages/providers/src/provider-probe.ts:71-72`), and not
the parsed ones, which carry only `authorizationFile` — is what the resolver receives, exactly as
`apps/api/src/main.ts:317-321` passes it. The acceptance then composes
`createProviderDiscoveryResolver` (`apps/api/src/provider-discovery.ts:40-48`) with:
`configuredProviders` the one entry of R2.7; `targets` those resolved targets; `probes` an
in-memory `ProviderDiscoveryProbeStore` (`apps/api/src/provider-discovery.ts:18`) that starts
empty; `probeFreshnessMs` `600000` — the `probe_freshness_ms` the development seed publishes
(`apps/runner/src/dev-deployment-register.ts:344`), so no new number is pinned, and, the store
being empty, the one resolve probes whatever positive integer is given; `probeTimeoutMs` `5000` —
the loader's default, `PROVIDER_PROBE_TIMEOUT_MS: positiveInteger.default(5_000)`
(`packages/register/src/runtime-environment.ts:331`), which the API boots with when the key is
absent; `fetchImplementation` the trusting `fetch` of R2.5b; and a clock. Both integers are
checked by the resolver itself (`provider-discovery.ts:49-54`), and a timeout far below the
fixture's own TLS handshake would make the probe ABSENT. The acceptance awaits the resolver once and
shows the target joining the discovered panel, and the fixture records that it received exactly one
request whose `Authorization` header equalled the expected literal. **No register row is read, no
database is opened, and no service process is started.**

**R2.9 — the stdout law, stated so it can be obeyed.** No line of the run's stdout or stderr
contains (i) the exact token `pes-s02-fake-vendor-token` — the credential literal of R2.5e without
its scheme word, and the token step 7 greps for; (ii) the scheme word `Bearer` followed by a space
and a token; or (iii) the absolute path `<scratch>/custody.d`, or any path beneath it — which covers
both the credential's `0700` directory and the credential file `<scratch>/custody.d/vendor.header`.
A refusal CODE is NOT a credential, and a code that contains the word `authorization` is lawful and
expected: `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT`, `PROVIDER_AUTHORIZATION_FILE_ABSENT:`,
`PROVIDER_INLINE_CREDENTIAL_REFUSED:` and `PROVIDER_AUTHORIZATION_FILE_UNUSABLE:` are printed in
full when R2.7 or R2.8 meets them.

**R2.10 — the scratch root, and why printing it is lawful.** Every file the acceptance writes lands
under one directory the run creates and removes before exiting — the scratch root, whose base name
begins `pes-s02-` and contains no `custody` — and the scratch root's absolute path is printed on a
line beginning `PES-S02 SCRATCH-DIR `. The scratch root is NOT the credential's custody directory:
the credential sits one level down, in `<scratch>/custody.d` (R2.8), so the `SCRATCH-DIR` line names
no path R2.9 (iii) forbids. No step writes into `/etc`, into another mission's lane, or into the
main tree's uncommitted work.

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
   `| tee /tmp/pes-s02-before.log`.
4. Run the hosted acceptance:
   `pnpm pes:accept-hosted 2>&1 | tee /tmp/pes-s02-accept.log`.
5. The output carries, each on its own line and in this order: `PES-S02 SCRATCH-DIR ` and the
   scratch root's absolute path (R2.10); `PES-S02 FAKE-VENDOR ` and the
   `https://api.localtest.me:<port>/v1` base URL it bound; then one line per row of R2.7's table, in
   the table's order, each beginning `PES-S02 REFUSED ` and then the code verbatim —
   `PROVIDER_TARGET_LOOPBACK_REFUSED:`, `PROVIDER_INLINE_CREDENTIAL_REFUSED:`,
   `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT`, `PROVIDER_AUTHORIZATION_FILE_ABSENT:`,
   `PROVIDER_TARGET_PRICE_REQUIRED:` — each code that ends in `:` followed by the provider ref it
   refused.
6. The output then carries a line beginning `PES-S02 ADMITTED ` naming the provider ref that
   joined the panel, and a line beginning `PES-S02 VENDOR-REQUESTS ` reading `1 matched 0 rejected`.
7. Confirm the credential never appeared. Two greps, both printing `0`:
   `grep -c 'pes-s02-fake-vendor-token' /tmp/pes-s02-accept.log` and
   `grep -cF "$(sed -n 's/^PES-S02 SCRATCH-DIR //p' /tmp/pes-s02-accept.log)/custody.d" /tmp/pes-s02-accept.log`.
   The second grep composes `<scratch>/custody.d` from the scratch root step 5 printed: that is the
   credential's own directory (R2.8) and a prefix of the credential file's path, so a line leaking
   either one makes it print `1` or more, while step 5's lawful `SCRATCH-DIR` line, which stops at
   `<scratch>`, never matches it. The refusal codes of step 5 contain the word `authorization` and
   are LAWFUL (R2.9); they are not what these greps look for.
8. The run's LAST stdout line is exactly `PES-S02-ACCEPT: PASS`. A failing run's last line begins
   `PES-S02-ACCEPT: FAIL ` and names the first case that did not hold.
9. Confirm the scratch root is gone: `test -e "<the path from step 5>" ; echo $?` prints `1`.
10. Confirm the local stack was not disturbed: `lsof -nP -iTCP:3000 -sTCP:LISTEN` and
    `lsof -nP -iTCP:8790 -sTCP:LISTEN` list the same PIDs step 3 recorded.

## 6. Open question routed to V

None raised by this slice at this pass. The mission's `V-ROW: NEW` blocks are in
`../S01/DECISIONS.md`.
