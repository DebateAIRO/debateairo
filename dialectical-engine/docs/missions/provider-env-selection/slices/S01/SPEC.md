# S01 — The hosted provider set is published by a command that declares itself hosted
ui: no

FROZEN at REQ-PES's READY marker on t_c677f87a (2026-09-24). A change after that marker is
`SPEC-v2.md` with a supersession header, never an in-place edit.

## 1. Why this slice exists (the measured gap)

Intake §10 item (a). Measured in `.worktrees/pes-base/dialectical-engine` @ 776359c3:

- The only provider-set publish command is `apps/runner/src/dev-provider-set-publish-cli.ts` (31
  lines), wired as `dev:auth:publish-provider-set` at `package.json:31`. It imports
  `developmentConfiguredProviderPanel` at `:12`, and the publisher it calls hard-codes
  `deployment: "local"` at `apps/runner/src/dev-deployment-register.ts:873`.
- `buildConfiguredProviderSetDeploymentRow` (`packages/register/src/configured-provider-set.ts:177`)
  has no shipped caller. The tree says so itself:
  `tests/unit/v9-configured-provider-set-deployment.test.ts:209-211`.
- The kit says so in its own words: `deploy/vps/README.md:862` — "There is no hosted publish
  command yet."
- No `production:` provider ref exists in the tree: `git grep -n '"production:' -- apps packages`
  returns nothing.
- The door that enforces V-9(4) is already built and is not this slice's work:
  `packages/register/src/configured-provider-set.ts:127-144` routes hosted publications through
  `RegisterPublicationPort.publishGeneral`, which refuses an unvetted vendor there rather than at
  boot.

So the register half of V's ask has a shipped LAW and no shipped DOOR a hosted operator can walk
through. This slice builds the door.

## 2. What is out of scope, stated so no coder invents it

- The sealed version-1 row shape is not altered (`configured-provider-set.ts:10`, `:21-23`,
  `:108-125`). Version 1 stays as history; the hosted row is version 2.
- `DEBATEAI_DEPLOYMENT_MODE` is the only environment switch. No second switch, no hostname check,
  no `NODE_ENV` inference (row V-1).
- The exact-set invariant `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH`
  (`apps/api/src/provider-discovery.ts:55-60`) stays exactly as it is.
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

**R1.2** That value is composed from two inputs and from nothing else:
(a) the provider targets the process environment declares, parsed by the SHIPPED parser
`parseProviderDiscoveryTargets` — the same parse `apps/api/src/main.ts:305` and
`apps/runner/src/main.ts:82` take, so the published set and the services' set cannot diverge; and
(b) a vetting record read from the JSON file named by the environment key
`PROVIDER_VENDOR_VETTING_PATH`, whose top level is an object keyed by `provider_ref`, each value
carrying `data_use_terms_reviewed_on`, `retention_terms_reviewed_on` and
`named_in_privacy_notice`.

**R1.3** The published row's `providers` sequence equals the declared targets' `provider_ref`
sequence, element for element and in the same order. A run in which the two differ exits non-zero
before publishing, printing `PES_PUBLISH_SET_ORDER_MISMATCH:` and the first ref that differs.

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
`packages/register/src/configured-provider-set.ts:87-99` already emits — with no other text on
that line.

**R1.8** On a run that publishes, the command's last stdout line begins with a named receipt prefix
and carries the new `registerVersion`, the `rowCount` and the `snapshotSha256`, in the shape
`apps/runner/src/dev-deployment-register.ts:878-882` already returns.

**R1.9** No byte of any credential, and no `authorization_file` path, appears in the published row,
on stdout, on stderr, in `argv` or in any refusal message this slice adds. The row's per-provider
members are exactly `providerRef`, `adapterKind`, `maker` and `vetting`.

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

## 4. Verification

The suites this slice runs are the ones that READ the surface it touches. Their pairs at base are
the intake's baseline table, cited and not restated: `docs/missions/provider-env-selection/00-intake.md:40`
(the table is §5b; the logs are
`.hermes/reports/provider-env-selection/logs/baseline-intake-suites.log` and
`baseline-intake-typecheck.log`).

The four suites that are RED at base stay EXACTLY at their pairs through this slice — no
requirement above changes one: `tests/integration/dev-api-environment.test.ts`,
`tests/integration/dev-api-process.test.ts`, `tests/integration/dev-provider-panel.test.ts`,
`tests/integration/t16-algorithm-register.test.ts`.

`pnpm typecheck` is judged by the per-file DELTA against
`baseline-intake-typecheck.log`, never by its exit code (base: rc=1, one diagnostic in
`apps/ui/lib/v3/answerExport.ts`, outside this surface).

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
   scratch database is for the publishing case); a line beginning `PES-S01 CASE unvetted ` whose
   remainder begins `PROVIDER_VENDOR_NOT_VETTED:` and then a provider ref; a line beginning
   `PES-S01 CASE order-mismatch ` whose remainder begins `PES_PUBLISH_SET_ORDER_MISMATCH:`; and a
   line beginning `PES-S01 CASE published ` carrying the receipt prefix, the new register version,
   the row count and the snapshot digest.
3. The run's LAST stdout line is exactly `PES-S01-ACCEPT: PASS`. Any other last line is a failure,
   and a failing run's last line begins `PES-S01-ACCEPT: FAIL ` and names the first case that did
   not hold.
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
6. Confirm no credential material is in the run's output:
   `grep -cEi 'bearer|authorization' /tmp/pes-s01-accept.log` prints `0`.
   (`grep -c` counts LINES, which is the count wanted here: zero lines is zero occurrences.)

## 6. Open question routed to V

None blocking this slice. The two rows this mission raises are in `DECISIONS.md` of this slice, in
the `V-ROW: NEW` shape COMMON §4 defines; neither stops a requirement above from being built.
