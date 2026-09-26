# S01 — The hosted provider set is published by a command that declares itself hosted

ui: no
SUPERSEDES `SPEC-v4.md` (and through it `SPEC-v3.md`, `SPEC-v2.md` and `SPEC.md`; all four frozen and byte-identical) — written by REQ-FIX-PES-p6 at node REQ-FIX pass 6 on V's ruling V-15 ("Yes, seed all 17", `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table, row V-15 — cite it by row id, as that file's `## Pointer note` says), not on a review verdict; no REQ-REV follows. Requirements CHANGED from v4: **R1.12** only (the role seed's publication also carries the register's 15 other required algorithm rows, built by the shipped `buildAlgorithmRegisterRows`, in the throwaway scratch database only; the two role rows, their source ref, the `PES-S01 ROLE-SEED version=<v>` line and the `role-provider-dropped` case are unchanged). Requirements UNCHANGED, byte for byte: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R1.8, R1.9, R1.10, R1.11, R1.13, R1.14; §1, §2, §4, §5 and §6 are unchanged, and §3 changes only inside R1.12. S01-C1 is ALREADY BUILT on `slice/provider-env-selection-s01` (`5b12b2e15`). This file is the SPEC of record; every later packet names it by this file name.

FROZEN at REQ-FIX-PES-p6's READY marker on t_78d5d748 (2026-09-25). This pass applies V's ruling V-15;
a change after that marker is a V row or `SPEC-v6.md` with a supersession header, never an in-place edit.

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
  row already published. The parser is therefore downstream of the row and cannot be a source for
  it. A coder who edits its allow-list, its second argument or its ordering violates this section.
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
- No step of this slice connects to the development PostgreSQL on `:55432` or to any other port in
  COMMON §6's NO-TOUCH list (R1.12).
- README §11's own staleness is slice S03's work, not this slice's.

## 3. Requirements

Each is numbered, and each is checkable by reading a named file or running a named command.

**R1.1** A module under `apps/runner/src/` exports the hosted configured-provider set as a value of
type `VettedConfiguredProvider[]` (`packages/register/src/configured-provider-set.ts:47`): every
entry carries `providerRef`, `adapterKind`, `maker` and a `vetting` record with
`dataUseTermsReviewedOn`, `retentionTermsReviewedOn` (both ISO calendar days) and
`namedInPrivacyNotice`.

**R1.2 — every input the command reads, and the ONE source of each.** The command reads four
inputs, each from exactly one place, and nothing else:

| input | its ONE source |
|---|---|
| the deployment mode | `DEBATEAI_DEPLOYMENT_MODE` and `NODE_ENV`, resolved by the shipped `resolveDeploymentMode` (`packages/register/src/runtime-environment.ts:90-101`, exported at `packages/register/src/index.ts:792`) — the function both service loaders call (`runtime-environment.ts:481-483`) |
| the database | `MIGRATION_DATABASE_URL`, read by the shipped `loadMigrationEnvironment` (`packages/register/src/runtime-environment.ts:205-211`), as the development publish command reads it (`apps/runner/src/dev-provider-set-publish-cli.ts:14-15`) |
| the roster | the JSON file at the absolute path named by `PROVIDER_HOSTED_ROSTER_PATH`, in the shape below |
| the base register version | `REGISTER_VERSION`, the key both services already boot on (`packages/register/src/runtime-environment.ts:327`, `:561`) and the one `deploy/vps/README.md:866-867` has the operator set |

**The roster gate.** The roster's top level is an object with one member, `providers`, a non-empty
array. Each element carries exactly these ten keys and no others: `provider_ref`, `adapter_kind`,
`maker`, `vetting`, `base_url`, `model`, `runner_authorization_file`, `api_authorization_file`,
`input_price_micros_per_million`, `output_price_micros_per_million`. Each `provider_ref` is unique
across the array: a roster in which a `provider_ref` appears in two elements is refused here,
before the row builder or the parser runs, so neither the builder's `CONFIGURED_PROVIDER_SET_INVALID`
(`packages/register/src/configured-provider-set.ts:82`, reached through `:184`) nor the parser's
`CONFIGURED_PROVIDER_DUPLICATE` (`packages/providers/src/index.ts:255`) can be reached from a
roster that passes this gate. Each `adapter_kind` equals one of the `adapterKind` values in the
shipped constant `BUILT_IN_PROVIDER_ADAPTERS` (`packages/providers/src/index.ts:807-809`), read
from that constant and never retyped. Each `vetting` is a JSON object whose keys are among
`data_use_terms_reviewed_on`, `retention_terms_reviewed_on` and `named_in_privacy_notice`; an
unknown key is refused here, while a MISSING vetting member is not a shape error and is judged by
R1.7. A roster that fails any rule of this paragraph is refused with `PES_PUBLISH_ROSTER_INVALID:`
followed by the offending element's `provider_ref` — the repeated ref, for a repeat — or by its
array index when its `provider_ref` is not a string.

**The base row.** The command reads the `configuredProviderSet` row at the register version named
by `REGISTER_VERSION`. When that version holds no such row, the command exits non-zero before the
builder runs and prints `PES_PUBLISH_BASE_ROW_ABSENT:` followed by the `REGISTER_VERSION` value.

Every member of the built row and every argument of the publication comes from a source named here,
and from nowhere else:

| row member | its ONE source |
|---|---|
| `providers[].providerRef` | the roster element's `provider_ref` |
| `providers[].adapterKind` | the roster element's `adapter_kind` |
| `providers[].maker` | the roster element's `maker` |
| `providers[].vetting` | the roster element's `vetting`, renamed member by member to the names `assertVendorVetted` reads (`packages/register/src/configured-provider-set.ts:93-97`): `data_use_terms_reviewed_on` → `dataUseTermsReviewedOn`, `retention_terms_reviewed_on` → `retentionTermsReviewedOn`, `named_in_privacy_notice` → `namedInPrivacyNotice`; a member absent from the roster stays absent, so R1.7 refuses it |
| the `providers` ORDER | the roster array's order, element for element |
| `requiredDistinctMakers` (the builder's first argument, `configured-provider-set.ts:177-181`) | the value in the base row — never the roster file, so the file cannot lower a maker-diversity floor; the command does not compare it with the roster's maker count, which `deployment_maker_capability` evaluates at startup (`docs/architecture/01-decisions/ADR-0015-deployment-maker-inventory.md:86`) |
| `sealedSourceRef` (the builder's second argument, `configured-provider-set.ts:182`) | the base row's `sourceRef`, with a trailing `CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF` (`configured-provider-set.ts:26-28`) removed when present, so a republication appends exactly one (`:172-175`, `:194`) |
| `publishGeneral`'s `baseRegisterVersion` (`packages/register/src/register-publication.ts:429`, required at `:871`) | `REGISTER_VERSION` |
| `publishGeneral`'s `rows` | every row of the base register version carried forward byte for byte (`rowKey`, `valueJsonText`, `sourceRef`), with the `configuredProviderSet` row replaced by the built row, and no row added or removed — the complete-snapshot shape `publishReplacementRegisterFixture` sends (`tests/support/registerFixtures.ts:70-86`) and the development publisher sends (`apps/runner/src/dev-deployment-register.ts:863-865`); read by the command's own query, because the command imports nothing under `tests/` |
| `publishGeneral`'s `publicationId` | a UUID made from `sha256("debateai:hosted-provider-set:" + baseRegisterVersion + ":" + snapshotSha256)` in exactly the construction `developmentProviderSetPublicationId` uses (`apps/runner/src/dev-deployment-register.ts:784-799`: the first 16 bytes, the version nibble set to 4, the variant bits to `10`), written as the command's own function rather than imported (R1.6), so an identical re-run presents the same request identity (`register-publication.ts:426-432`) |
| `publishGeneral`'s `sourceRef` | the literal `provider-env-selection/S01#hosted-provider-set:published` |
| `publishGeneral`'s `deployment` | the literal `"hosted"` (R1.4) |

The command also DERIVES, and does not read, the two `PROVIDER_DISCOVERY_TARGETS_JSON` values the
two services need: one array per service, in the roster's order, each element carrying only the
keys the shipped parser's allow-list admits (`packages/providers/src/index.ts:264-268`) —
`provider_ref`, `base_url`, `model`, `authorization_file`, `input_price_micros_per_million`,
`output_price_micros_per_million` — with `authorization_file` taken from
`runner_authorization_file` for the runner's value and from `api_authorization_file` for the
API's, exactly as `deploy/vps/README.md:846-849` requires. Neither derived value is written to a
file by this command; both are printed (R1.8) for the operator to place in `runner.env` and
`api.env`.

**R1.3 — the order of checks, and the self-check.** The command takes its checks in this order and
stops at the first that refuses: (1) the mode, R1.5; (2) the roster gate, R1.2; (3) the base row,
R1.2; (4) the build through the shipped `buildConfiguredProviderSetDeploymentRow`, which refuses an
unvetted vendor, R1.7; (5) the self-check of this requirement; (6) the role rows, R1.14; (7) the publication, R1.4. The
self-check parses BOTH derived targets values with the SHIPPED `parseProviderDiscoveryTargets`
(`packages/providers/src/index.ts:232`), passing as the second argument the `providers` of the row
built at step (4). A parse that throws stops the run before any write: the command exits non-zero
and prints `PES_PUBLISH_SET_TARGETS_REJECTED:` followed by the parser's own thrown code verbatim.
For a roster that passes the gate of R1.2, that code is, for example,
`PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID` for a `base_url` whose path does not end in `/v1`
(`packages/providers/src/index.ts:226-227`) — executed against the shipped parser at this pass.
`PROVIDER_DISCOVERY_TARGET_DUPLICATE` (`:292-293`) cannot be printed by this command: a derived
targets value repeats a ref only when the roster does, and R1.2 refuses that roster at step (2).
This self-check is what proves, at publish time, that the boot-time exact-set check cannot fail
against a set this command published.

**R1.4** The command publishes through `RegisterPublicationPort.publishGeneral` with
`deployment: "hosted"` as a literal in the call. It does not call
`publishDevelopmentDeploymentRegisterProviderSet`.

**R1.5** The command resolves the mode with the shipped `resolveDeploymentMode` (R1.2) and refuses
to run unless it resolves to `hosted`. A run whose mode resolves to anything else exits non-zero
before touching the database, printing `PES_PUBLISH_SET_NOT_HOSTED:` and the mode it resolved —
`PES_PUBLISH_SET_NOT_HOSTED:local` for `DEBATEAI_DEPLOYMENT_MODE=local`. A mode that does not
resolve exits non-zero with the shipped code verbatim: `DEPLOYMENT_MODE_INVALID` or
`DEPLOYMENT_MODE_UNRESOLVED` (`packages/register/src/runtime-environment.ts:94-99`).

**R1.6** The command's module graph contains no module whose path segment begins `dev-` and no
import of `apps/runner/src/dev-provider-panel.ts`. The check is over the import graph, read from
the source, in the shape `tests/architecture/dev-real-provider-only.test.ts:4-31` already uses.

**R1.7** A vendor whose `vetting` object lacks any of its three members, whose
`named_in_privacy_notice` is not `true`, or whose two dates are not ISO calendar days, is refused by
the shipped builder at step (4) of R1.3. The command exits non-zero and prints
`PROVIDER_VENDOR_NOT_VETTED:` followed by that vendor's `provider_ref` — the code
`packages/register/src/configured-provider-set.ts:87-99` emits and
`assertHostedConfiguredProviderSetVetted` (`:146-170`) re-asks at the publication door — with no
other text on that line. An element with no `vetting` key at all, or whose `vetting` carries an
unknown key, is a SHAPE error refused by the roster gate of R1.2, not a vetting error.

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
the two derived values on the `PES_HOSTED_TARGETS_RUNNER_V1=` and `PES_HOSTED_TARGETS_API_V1=`
lines of R1.8, where the shipped parser requires it (`packages/providers/src/index.ts:309-319`) and
where the operator must see it to place it; it appears in no refusal message and in no published
row.

**R1.10** `CONFIGURED_PROVIDER_SET_SEALED_VERSION` stays `1`,
`CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION` stays `2`, and
`buildConfiguredProviderSetSealedRow` is not edited
(`packages/register/src/configured-provider-set.ts:21-23`, `:108-125`).

**R1.11** `apps/runner/src/dev-provider-set-publish-cli.ts`, the `dev:auth:publish-provider-set`
script line and `apps/runner/src/dev-deployment-register.ts:873`'s `deployment: "local"` are
unchanged. `git diff --stat` over those three shows no change.

**R1.12 — the acceptance database holds the base row R1.2 reads.** The slice ships one operator
ACCEPTANCE command, `pnpm pes:accept-publish-set`, distinct from the publish command, which runs
the publish command once per case of §5's table and proves R1.2's gate and base-row refusals,
R1.3, R1.5, R1.7, R1.8, R1.9 and R1.14 on this Mac without a real key. Its database is the throwaway
PostgreSQL the repository's integration suites already use, in the three calls
`tests/integration/support-config-convergence.test.ts:911-916` already makes:
`startTestDatabase()` (`tests/support/testDatabase.ts:134-137`) starts an embedded server
(`embedded-postgres`, `:84-126`) in a fresh temporary directory on a port the operating system
assigns to a `listen(0)` probe (`:41-55`) — a port no running listener holds, so it can never be
`:55432` or any other NO-TOUCH port; `databaseApi.migrate(database.pool)`
(`packages/db/src/index.ts:793`) creates the schema; and
`importHistoricalRegisterFixture(database.pool, 4, await readLegacyDevelopmentV4Rows())`
(`tests/support/registerFixtures.ts:88-97`, `:115-118`) seeds register version 4 from
`tests/support/fixtures/register-development-v4.json`. That seed holds 32 rows, among them a sealed
version-1 `configuredProviderSet` row with `requiredDistinctMakers` `1` and `sourceRef`
`DEV-01-local-auth-topology.md#ordered-bootstrap:DEV-05` — the two values R1.2 reads from the base
row (measured in the lane at this pass). Every case runs with `REGISTER_VERSION=4`,
`MIGRATION_DATABASE_URL` set to that database's `connectionString`, `DEBATEAI_DEPLOYMENT_MODE=hosted`
and `NODE_ENV` unset, except where §5's table gives the case another value. On every exit path,
success or failure, the acceptance command calls `database.stop()`, which ends the pool, stops the
server and removes its directory (`tests/support/testDatabase.ts:121-125`). No step connects to
`:55432` or to any other port in COMMON §6's NO-TOUCH list. After the `published` case and before
the `role-provider-dropped` case, the acceptance adds two role rows to the register version the
`published` receipt names, with `publishReplacementRegisterFixture(database.pool, <that version>,
[the seventeen rows below], "provider-env-selection/S01#acceptance-role-rows")`
(`tests/support/registerFixtures.ts:70-86`): `synthesizerRoleRef` with the value
`{"kind":"SYNTHESIZER_ROLE_REF","providerRef":"vendor:a","provisional":true}` and `evaluatorRoleRef`
with the value `{"kind":"EVALUATOR_ROLE_REF","providerRef":"vendor:z","provisional":true}` — the
exact shapes the register's row schema admits (`packages/register/src/algorithm-policy.ts:404-413`),
each with the source ref `provider-env-selection/S01#acceptance-role-rows`. The same call also
carries the register's 15 other required algorithm rows, in this throwaway scratch database only
(V's ruling V-15, `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table, row
V-15): every row the shipped `export function buildAlgorithmRegisterRows(input:
AlgorithmRegisterRowsInput): readonly AlgorithmRegisterRow[]`
(`packages/register/src/algorithm-policy.ts:233-235`) returns for exactly the input
`{ deploymentSourceRef: "provider-env-selection/S01#acceptance-role-rows", synthesizerRoleRef:
"vendor:a", evaluatorRoleRef: "vendor:z", providerFamilies: [{ familyRef: "acme", providerRefs:
["vendor:a"] }] }`, except that function's own `synthesizerRoleRef` and `evaluatorRoleRef` rows,
each with the value and the source ref the function gives it. That makes seventeen rows, one per
key of `ALGORITHM_REGISTER_ROW_KEYS` (17 keys, the set `register.required_row` holds): a
publication that holds any required row must hold all of them
(`migrations/0061_algorithm_publication_profiles.sql:17-28`), and the two role rows alone are
refused with `REGISTER_REQUIRED_ROW_MISSING:envelope:envelopeFormulaInputs` (probe
`.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2/` d2; with the seventeen rows,
d4 and d1). It then prints
`PES-S01 ROLE-SEED version=<v>`, where `<v>` is the version that call's receipt names, and runs the
`role-provider-dropped` case with `REGISTER_VERSION=<v>`. `vendor:a` is the ref of ROSTER ELEMENT E
(§5) and `vendor:z` is the ref of no element, so the synthesizer row passes R1.14 and the evaluator
row does not.

**R1.13** No booting service reads `PROVIDER_HOSTED_ROSTER_PATH`. `git grep -n
PROVIDER_HOSTED_ROSTER_PATH -- apps packages` returns hits only in this slice's publish command,
its own test, and this SPEC's slice directory — never in `apps/api/src/main.ts`,
`apps/runner/src/main.ts`, `packages/register/src/runtime-environment.ts` or any `*.env.example`.

**R1.14 — the role rows of the base register (V-10).** Step (6) of R1.3 reads, from the rows of
the base register version (R1.2, `rows`), the row `synthesizerRoleRef` and then the row
`evaluatorRoleRef`. A row that is absent is not checked, so a base that holds neither row passes
this step: the seed of R1.12 holds neither (`grep -c RoleRef
tests/support/fixtures/register-development-v4.json` prints `0`), and §5's `published` case is that
path. A row that is present passes only when its value is a JSON object whose `providerRef` member
is a string equal to the `provider_ref` of one element of the roster. The first present row that
does not pass stops the run before any write: the command exits non-zero and prints
`PES_PUBLISH_ROLE_PROVIDER_DROPPED:` followed by that row's key (`synthesizerRoleRef` or
`evaluatorRoleRef`), with no other text on that line. This step only refuses; a row that passes is
carried forward byte for byte, as R1.2 carries every row. It is the development publisher's check
(`apps/runner/src/dev-deployment-register.ts:848-858`, `DEV_ALGORITHM_REGISTER_ROLE_REFS_UNRESOLVED`)
on the hosted path, and it moves to publish time the failure every run would otherwise meet at claim
(`apps/runner/src/index.ts:2906-2938`, `SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:<role>`). V ruled it
(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:22`, V-10).

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
`:8795`, `:8796`, and no step touches `:3000`, `:3001`, `:8790`, `:4310` or `:55432`.

**The fixtures.** Every case starts from ROSTER ELEMENT E, exactly as written here:

```json
{"provider_ref":"vendor:a","adapter_kind":"openai-compatible-http","maker":"Acme","vetting":{"data_use_terms_reviewed_on":"2026-09-01","retention_terms_reviewed_on":"2026-09-01","named_in_privacy_notice":true},"base_url":"https://api.acme.example/v1","model":"acme-large","runner_authorization_file":"/etc/debateai/runner/providers/acme.header","api_authorization_file":"/etc/debateai/api/providers/acme.header","input_price_micros_per_million":1000,"output_price_micros_per_million":2000}
```

Each case's roster is `{"providers":[…]}` holding the elements its row names, with the one change
its row names applied to E, run with R1.12's environment plus the one its row names. Every line
of the first six cases was executed for that exact fixture at pass 3, in the order R1.3 fixes
(`.hermes/reports/provider-env-selection/probes/REQ-FIX-PES/p3_checks.py`): the shipped
`resolveDeploymentMode`, builder and parser produced `local`, `PROVIDER_VENDOR_NOT_VETTED:vendor:a`
and `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID`, and built and parsed the `published` roster
without a throw; the two codes only this slice prints, `PES_PUBLISH_ROSTER_INVALID:` and
`PES_PUBLISH_BASE_ROW_ABSENT:`, come from R1.2's own rules, applied in that order before any
shipped function sees the roster. The `role-provider-dropped` line comes from R1.14's own rule; it
needs R1.12's role seed and a database, and it was not executed at pass 4:

| case | elements | change to E | env | the line the case prints |
|---|---|---|---|---|
| `not-hosted` | `E` | — | `DEBATEAI_DEPLOYMENT_MODE=local` | `PES_PUBLISH_SET_NOT_HOSTED:local` |
| `roster-invalid` | `E, E` | — | — | `PES_PUBLISH_ROSTER_INVALID:vendor:a` |
| `base-row-absent` | `E` | — | `REGISTER_VERSION=999` | `PES_PUBLISH_BASE_ROW_ABSENT:999` |
| `unvetted` | `E` | `vetting.named_in_privacy_notice = false` | — | `PROVIDER_VENDOR_NOT_VETTED:vendor:a` |
| `targets-rejected` | `E` | `base_url = "https://api.acme.example/v2"` | — | `PES_PUBLISH_SET_TARGETS_REJECTED:PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID` |
| `published` | `E` | — | — | the three lines of R1.8 |
| `role-provider-dropped` | `E` | — | `REGISTER_VERSION=<v>` of R1.12's role seed | `PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef` |

(`REGISTER_VERSION=999` names a version no step of this acceptance creates. `roster-invalid` is the
fixture v2 used for `targets-rejected`; it now fails where R1.2 says it fails. `role-provider-dropped`
prints `evaluatorRoleRef`, not `synthesizerRoleRef`: its synthesizer row names `vendor:a`, which the
roster keeps, so a command that refuses whenever a role row exists prints the wrong key.)

1. Record the development PostgreSQL as it stands:
   `lsof -nP -iTCP:55432 -sTCP:LISTEN | tee /tmp/pes-s01-before.log`.
2. `cd` into the slice lane the orchestrator names in the TEST(S) ticket and run
   `pnpm pes:accept-publish-set > /tmp/pes-s01-accept.log 2>&1; echo "exit=$?"`, which prints the
   acceptance's exit code; then read the whole log with `cat /tmp/pes-s01-accept.log`. The log may
   begin with pnpm's own echo line, `$ tsx …`, and, after a non-zero exit, end with pnpm's own
   notice, a line beginning `[ELIFECYCLE]`; neither line is the acceptance's output.
3. The acceptance's first line — the log's first line, or its second when the first is pnpm's
   `$ tsx …` echo — reads `PES-S01 SCRATCH-DB port=<p> seeded-version=4 rows=32`, where `<p>` is the
   port the operating system assigned (R1.12).
4. Then one line per case, in the table's order, each beginning `PES-S01 CASE <case> ` and ending
   with the line the table gives. The `published` case's line reads `PES-S01 CASE published` and is
   followed by the three lines of R1.8: `PES_HOSTED_TARGETS_RUNNER_V1=…`,
   `PES_HOSTED_TARGETS_API_V1=…` (which differs from the runner's only in each
   `authorization_file`), and `PES_HOSTED_PROVIDER_SET_RECEIPT_V1=…`, whose `rowCount` is `32` —
   the seed's 32 rows with the `configuredProviderSet` row replaced and none added — and whose
   `registerVersion` is greater than 4. Next comes `PES-S01 ROLE-SEED version=<v>` (R1.12), and then
   the `role-provider-dropped` case's line.
5. Then `PES-S01 SCRATCH-DB STOPPED`, after which `lsof -nP -iTCP:<p> -sTCP:LISTEN` prints nothing
   for the `<p>` of step 3.
6. The verdict is the LAST line of the acceptance's OWN output: the log's last line, or the line
   before it when the log's last line begins `[ELIFECYCLE]`. A passing run's verdict is exactly
   `PES-S01-ACCEPT: PASS` and step 2 printed `exit=0`. A failing run's verdict begins
   `PES-S01-ACCEPT: FAIL ` and names the first case that did not hold, and step 2 printed `exit=1`.
   A run whose scratch database of R1.12 could not start — the one outcome this acceptance reports
   UNVERIFIED — has the verdict `PES-S01-ACCEPT: UNVERIFIED ` followed by the database's own error,
   and step 2 printed `exit=1`. Every case that runs is decided PASS or FAIL.
7. `lsof -nP -iTCP:55432 -sTCP:LISTEN` lists the same PID step 1 recorded.
8. Confirm no credential material is in the run's output: the roster fixtures name credential FILE
   paths only and hold no header value, so `grep -c 'Bearer' /tmp/pes-s01-accept.log` prints `0`.
   (`grep -c` counts LINES, which is the count wanted here: zero lines is zero occurrences.) The
   `authorization_file` paths inside the two `PES_HOSTED_TARGETS_*_V1=` lines are lawful — R1.9
   admits them there and nowhere else.

## 6. Open questions routed to V

None open. Pass 3's `V-ROW: NEW` — whether the hosted publication refuses when a role row carried
forward by R1.2 (`synthesizerRoleRef`, `evaluatorRoleRef`) names a provider the new set drops — was
transcribed as V-10, and V ruled "Yes, refuse at publish"
(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:22`). R1.14 is that ruling, and §5's
`role-provider-dropped` case proves it. V's ruling on V-12/V-13
(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:24`) is §5 steps 2, 3 and 6.

`reviews/REQ-REV-p1.md:63` (N12) asked the S01 security lens whether the scratch database's drop runs
on every exit and whether its name can collide with `debateai`. R1.12 removes the premise — the
acceptance no longer creates a database on `:55432` — and puts `database.stop()` on every exit
path. The lens verifies that at REV(S); it is not answered by this SPEC's say-so.
