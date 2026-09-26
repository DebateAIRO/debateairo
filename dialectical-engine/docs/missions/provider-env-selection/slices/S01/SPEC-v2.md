# S01 — The hosted provider set is published by a command that declares itself hosted

ui: no
SUPERSEDES `SPEC.md` (v1, frozen and byte-identical) — written by REQ-FIX-PES at node REQ-FIX pass 2 of 3 on verdict `docs/missions/provider-env-selection/reviews/REQ-REV-p1.md`. Requirements CHANGED from v1: **R1.2** (rewritten — one named source; B1), **R1.3** (replaced — the vacuous order code is gone, a shipped-parser self-check takes its place; B1 second member), **R1.8** (the receipt prefix is now a literal; N9), **R1.2's** parse citations corrected (N10). Requirements UNCHANGED in substance: R1.1, R1.4, R1.5, R1.6, R1.7, R1.9, R1.10, R1.11, R1.12. Acceptance §5 changed at steps 2 and 3 only, to follow R1.3. This file is the SPEC of record; every later packet names it by this file name.

FROZEN at REQ-FIX-PES's READY marker on t_90d85031 (2026-09-24). A change after that marker is
`SPEC-v3.md` with a supersession header, never an in-place edit.

## 1. Why this slice exists (the measured gap)

Intake §10 item (a). Measured in `.worktrees/pes-base/dialectical-engine` @ 776359c3, and
re-measured by the blind REQ-REV pass (`reviews/REQ-REV-p1.md:71`, "GAP holds"):

- The only provider-set publish command is `apps/runner/src/dev-provider-set-publish-cli.ts` (31
  lines), wired as `dev:auth:publish-provider-set` at `package.json:31`. It imports
  `developmentConfiguredProviderPanel` at `:12`, and the publisher it calls hard-codes
  `deployment: "local"` at `apps/runner/src/dev-deployment-register.ts:873`.
- `buildConfiguredProviderSetDeploymentRow` (`packages/register/src/configured-provider-set.ts:177`)
  has no shipped caller under `apps/`. The tree says so itself:
  `tests/unit/v9-configured-provider-set-deployment.test.ts:209-211`.
- The kit says so in its own words: `deploy/vps/README.md:862` — "There is no hosted publish
  command yet."
- No `production:` provider ref exists in the tree.
- The door that enforces V-9(4) is already built and is not this slice's work:
  `packages/register/src/configured-provider-set.ts:127-170` routes hosted publications through
  `RegisterPublicationPort.publishGeneral`, which calls
  `assertHostedConfiguredProviderSetVetted` (`:146-170`) and refuses an unvetted vendor there
  rather than at boot.

So the register half of V's ask has a shipped LAW and no shipped DOOR a hosted operator can walk
through. This slice builds the door.

## 2. What is out of scope, stated so no coder invents it

- **The shipped parser is CALLED, never edited.** `parseProviderDiscoveryTargets`
  (`packages/providers/src/index.ts:232-338`) takes the ALREADY-PUBLISHED configured set as its
  second argument (`:232-235`), refuses any ref that set does not contain (`:295-296`), carries an
  allow-list with no `maker` and no `adapter_kind` (`:264-268`), and returns the CONFIGURED SET's
  order, not the JSON's (`:333-337`). Its two shipped call sites are `apps/api/src/main.ts:300-302`
  and `apps/runner/src/main.ts:74-77`, each passing `deploymentMakers.configuredProviders` — the
  row already published. (v1 cited `main.ts:305` and `runner/src/main.ts:82`; both are
  `assertDeploymentProviderTargets`, not the parse — corrected per `reviews/REQ-REV-p1.md:59`.)
  The parser is therefore downstream of the row and cannot be a source for it. A coder who edits
  its allow-list, its second argument or its ordering violates this section.
- The exact-set invariant `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH` stays exactly as it is.
- The sealed version-1 row shape is not altered (`configured-provider-set.ts:21-23`, `:108-125`).
  Version 1 stays as history; the hosted row is version 2.
- `DEBATEAI_DEPLOYMENT_MODE` is the only environment switch for a BOOTING SERVICE. No second
  switch, no hostname check, no `NODE_ENV` inference (row V-1). The roster file R1.2 introduces is
  an input to a command an operator runs by hand; **no booting service reads it**, and R1.13
  measures that.
- The credential-file contract stays as `deploy/vps/README.md:784-800` states it. No credential
  value and no credential PATH enters the published row.
- The dev command and its `deployment: "local"` publication are untouched.
- README §11's own staleness is slice S03's work, not this slice's.

## 3. Requirements

Each is numbered, and each is checkable by reading a named file or running a named command.

**R1.1** A module under `apps/runner/src/` exports the hosted configured-provider set as a value of
type `VettedConfiguredProvider[]` (`packages/register/src/configured-provider-set.ts:47`): every
entry carries `providerRef`, `adapterKind`, `maker` and a `vetting` record with
`dataUseTermsReviewedOn`, `retentionTermsReviewedOn` (both ISO calendar days) and
`namedInPrivacyNotice`.

**R1.2 — ONE declared source, and it determines every member.** The command reads exactly one
operator-authored input: a JSON file at the absolute path named by the environment key
`PROVIDER_HOSTED_ROSTER_PATH`. Its top level is an object with one member, `providers`, an array;
each element carries exactly these keys and no others:
`provider_ref`, `adapter_kind`, `maker`, `vetting` (an object with exactly
`data_use_terms_reviewed_on`, `retention_terms_reviewed_on`, `named_in_privacy_notice`),
`base_url`, `model`, `runner_authorization_file`, `api_authorization_file`,
`input_price_micros_per_million`, `output_price_micros_per_million`.
A file with any other key, or a missing key, is refused with `PES_PUBLISH_ROSTER_INVALID:` and the
offending `provider_ref` (or the array index when the ref itself is absent).
Every member of the published row comes from a source named here, and from nowhere else:

| row member | its ONE source |
|---|---|
| `providers[].providerRef` | the roster element's `provider_ref` |
| `providers[].adapterKind` | the roster element's `adapter_kind`, refused unless it equals one of the `adapterKind` values in the shipped constant `BUILT_IN_PROVIDER_ADAPTERS` (`packages/providers/src/index.ts:807-809`) — read from that constant, never retyped in this slice's source |
| `providers[].maker` | the roster element's `maker` |
| `providers[].vetting` | the roster element's `vetting`, member for member |
| the `providers` ORDER | the roster array's order, element for element |
| `requiredDistinctMakers` | the value already in the `configuredProviderSet` row at the BASE register version, read from the database — never from the roster file, so the file cannot lower a maker-diversity floor |
| `sealedSourceRef` (the builder's second argument, `configured-provider-set.ts:177-183`) | the `sourceRef` of that same base-version row, with a trailing `CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF` (`configured-provider-set.ts:26-28`) removed when present, so a republication appends exactly one and the row's history reads forward as `:172-175` requires |

The command also DERIVES, and does not read, the two `PROVIDER_DISCOVERY_TARGETS_JSON` values the
two services need: one array per service, in the roster's order, each element carrying only the
keys the shipped parser's allow-list admits (`packages/providers/src/index.ts:264-268`) —
`provider_ref`, `base_url`, `model`, `authorization_file`, `input_price_micros_per_million`,
`output_price_micros_per_million` — with `authorization_file` taken from
`runner_authorization_file` for the runner's value and from `api_authorization_file` for the
API's, exactly as `deploy/vps/README.md:846-849` requires. Neither derived value is written to a
file by this command; both are printed (R1.8) for the operator to place in
`runner.env` and `api.env`.

**R1.3 — the self-check that replaces v1's order code.** Before publishing, the command parses
BOTH derived targets values with the SHIPPED `parseProviderDiscoveryTargets`
(`packages/providers/src/index.ts:232`), passing as the second argument the `providers` of the row
it has just built. A parse that throws stops the run before any write: the command exits non-zero
and prints `PES_PUBLISH_SET_TARGETS_REJECTED:` followed by the shipped parser's own thrown code
verbatim (for example `PROVIDER_DISCOVERY_TARGET_DUPLICATE`,
`PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID`, `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`).
This is what proves, at publish time, that the boot-time exact-set check cannot fail against a set
this command published. v1's `PES_PUBLISH_SET_ORDER_MISMATCH:` is REMOVED: with one source there
is no second sequence to disagree with it, and a refusal that cannot fire is not a refusal.

**R1.4** The command publishes through `RegisterPublicationPort.publishGeneral` with
`deployment: "hosted"` as a literal in the call. It does not call
`publishDevelopmentDeploymentRegisterProviderSet`.

**R1.5** The command refuses to run unless `DEBATEAI_DEPLOYMENT_MODE` resolves to `hosted` through
the shipped loader. A run in any other mode exits non-zero before touching the database, printing
`PES_PUBLISH_SET_NOT_HOSTED:` and the mode it resolved.

**R1.6** The command's module graph contains no module whose path segment begins `dev-` and no
import of `apps/runner/src/dev-provider-panel.ts`. The check is over the import graph, read from
the source, in the shape `tests/architecture/dev-real-provider-only.test.ts:4-31` already uses.

**R1.7** A vendor whose vetting record is absent, whose `named_in_privacy_notice` is not `true`, or
whose two dates are not ISO calendar days, is refused. The command exits non-zero and prints
`PROVIDER_VENDOR_NOT_VETTED:` followed by that vendor's `provider_ref` — the code
`packages/register/src/configured-provider-set.ts:87-99` already emits and
`assertHostedConfiguredProviderSetVetted` (`:146-170`) re-asks at the publication door — with no
other text on that line.

**R1.8 — the receipt, with its prefix as a literal.** On a run that publishes, the command's
stdout carries, each on its own line: the two derived targets values, prefixed
`PES_HOSTED_TARGETS_RUNNER_V1=` and `PES_HOSTED_TARGETS_API_V1=`; and, LAST, the machine receipt
prefixed by the exact literal `PES_HOSTED_PROVIDER_SET_RECEIPT_V1=`, carrying the new
`registerVersion`, the `rowCount` and the `snapshotSha256` in the shape
`apps/runner/src/dev-deployment-register.ts:878-882` returns. The prefix is this slice's own and is
NOT `DEV_DEPLOYMENT_REGISTER_RECEIPT_V1=`
(`apps/runner/src/dev-deployment-register.ts:104-105`), so a hosted receipt can never be read by
the development receipt reader at `:324-329`.

**R1.9** No byte of any credential appears in the published row, on stdout, on stderr, in `argv` or
in any refusal message this slice adds. The row's per-provider members are exactly `providerRef`,
`adapterKind`, `maker` and `vetting`. A credential FILE PATH appears in exactly one place — inside
the two derived `PROVIDER_DISCOVERY_TARGETS_JSON` values of R1.8, where the shipped parser requires
it (`packages/providers/src/index.ts:309-319`) and where the operator must see it to place it; it
appears in no refusal message and in no published row.

**R1.10** `CONFIGURED_PROVIDER_SET_SEALED_VERSION` stays `1`,
`CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION` stays `2`, and
`buildConfiguredProviderSetSealedRow` is not edited
(`packages/register/src/configured-provider-set.ts:21-23`, `:108-125`).

**R1.11** `apps/runner/src/dev-provider-set-publish-cli.ts`, the `dev:auth:publish-provider-set`
script line and `apps/runner/src/dev-deployment-register.ts:873`'s `deployment: "local"` are
unchanged. `git diff --stat` over those three shows no change.

**R1.12** The slice ships one operator command that proves R1.3, R1.5, R1.7, R1.8 and R1.9 on this
Mac without a real key and without writing to the database the local dev stack reads. It creates a
database whose name it prints, publishes into that database, and drops it before exiting. No step
of it connects to any port in COMMON §6's NO-TOUCH list except the dev Postgres on `:55432` as the
SERVER that hosts the scratch database it creates and drops; it opens no listener there and it
writes no row into the `debateai` database.

**R1.13** No booting service reads `PROVIDER_HOSTED_ROSTER_PATH`. `git grep -n
PROVIDER_HOSTED_ROSTER_PATH -- apps packages` returns hits only in this slice's publish command,
its own test, and this SPEC's slice directory — never in `apps/api/src/main.ts`,
`apps/runner/src/main.ts`, `packages/register/src/runtime-environment.ts` or any `*.env.example`.

## 4. Verification

The suites this slice runs are the ones that READ the surface it touches. Their pairs at base are
the intake's baseline table, cited and not restated:
`docs/missions/provider-env-selection/00-intake.md:40` (the table is §5b; the machine-readable
copy is `.hermes/reports/provider-env-selection/logs/baselines.tsv`; the logs are
`baseline-intake-suites.log` and `baseline-intake-typecheck.log`).

The four suites that are RED at base stay EXACTLY at their pairs through this slice — no
requirement above changes one: `tests/integration/dev-api-environment.test.ts`,
`tests/integration/dev-api-process.test.ts`, `tests/integration/dev-provider-panel.test.ts`,
`tests/integration/t16-algorithm-register.test.ts`.

`pnpm typecheck` is judged by the per-file DELTA against `baseline-intake-typecheck.log`, never by
its exit code (base: rc=1, one diagnostic in `apps/ui/lib/v3/answerExport.ts`, outside this
surface).

## 5. Acceptance — numbered steps V runs alone on this Mac

Every step starts with `export PATH="/opt/homebrew/bin:$PATH"` in the shell that runs it. No step
uses a real API key. No step starts, stops or connects to a relay on `:8791`, `:8792`, `:8793`,
`:8795`, `:8796`, and no step touches `:3000`, `:3001`, `:8790` or `:4310`.

1. `cd` into the slice lane the orchestrator names in the TEST(S) ticket and run
   `pnpm pes:accept-publish-set 2>&1 | tee /tmp/pes-s01-accept.log`. Read its output to the end.
2. The run prints, in order and each on its own line, a line beginning `PES-S01 SCRATCH-DB ` and
   the database name the HARNESS created for the publishing case; a line beginning
   `PES-S01 CASE not-hosted ` whose remainder begins `PES_PUBLISH_SET_NOT_HOSTED:` (this case
   opens no connection of its own — R1.5 refuses before the database is touched, and the harness's
   scratch database is for the publishing case); a line beginning `PES-S01 CASE roster-invalid `
   whose remainder begins `PES_PUBLISH_ROSTER_INVALID:`; a line beginning `PES-S01 CASE unvetted `
   whose remainder begins `PROVIDER_VENDOR_NOT_VETTED:` and then a provider ref; a line beginning
   `PES-S01 CASE targets-rejected ` whose remainder begins `PES_PUBLISH_SET_TARGETS_REJECTED:` and
   then the shipped parser's own code (the fixture that triggers it declares the same
   `provider_ref` twice, so the code is `PROVIDER_DISCOVERY_TARGET_DUPLICATE`).
3. The run then prints the publishing case: a line beginning `PES-S01 CASE published ` carrying, in
   order, a `PES_HOSTED_TARGETS_RUNNER_V1=` line, a `PES_HOSTED_TARGETS_API_V1=` line whose only
   difference from the runner's is each `authorization_file` value, and a
   `PES_HOSTED_PROVIDER_SET_RECEIPT_V1=` line carrying the new register version, the row count and
   the snapshot digest.
4. Confirm the scratch database is gone. The run itself re-queries the server after dropping and
   prints a line reading exactly `PES-S01 SCRATCH-DB DROPPED`. Independently, if `psql` is on this
   Mac's PATH, `psql -h 127.0.0.1 -p 55432 -l` does not list the name step 2 printed; if `psql` is
   absent, this independent half is UNVERIFIED and the run's own line stands.
5. Confirm nothing was published into the dev database. The run itself reads the dev stack's own
   machine receipt — `deployment-register-receipt.v1.json` under the custody root
   `developmentDeploymentRegisterReceiptPath` resolves
   (`apps/runner/src/dev-deployment-register.ts:102-103`, `:214-217`) — before its first case and
   again after its last, and prints a line beginning `PES-S01 DEV-REGISTER-VERSION ` carrying the
   absolute receipt path, the version it read first and the version it read last. The two versions
   on that line are equal.
6. Confirm no credential material is in the run's output: the acceptance's roster fixture declares
   credential FILE paths only and holds no header value at all, so
   `grep -c 'Bearer' /tmp/pes-s01-accept.log` prints `0`. (`grep -c` counts LINES, which is the
   count wanted here: zero lines is zero occurrences.) The `authorization_file` PATHS inside the
   two `PES_HOSTED_TARGETS_*_V1=` lines are lawful and expected — R1.9 admits them there and
   nowhere else.

## 6. Open question routed to V

None blocking this slice. The mission's V rows are in `DECISIONS.md` of this slice, in the
`V-ROW: NEW` shape COMMON §4 defines; neither stops a requirement above from being built.
`reviews/REQ-REV-p1.md:63` (N12) assigns the scratch-database custody question — that the drop runs
on every exit and that the name cannot collide with `debateai` — to the S01 security lens at
REV(S). It is named here and not answered here.
