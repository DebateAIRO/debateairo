# The hosted register file

`hosted-register.example.json` is the input to `pnpm register:publish-hosted`, the command that
publishes the hosted deployment's settings register (the sealed, versioned settings every service
reads at start-up) as ONE new register version. The command, its checks and its refusal codes are
in `apps/runner/src/hosted-register-publish.ts`; the runbook step is in the kit's main README.

## Everything named "example" in the example file is fake

The two vendors in the example — `vendor:example-alpha` and `vendor:example-beta`, their makers,
models, prices, credential-file paths and vetting dates — are **examples, not vendors**. Their
addresses sit under the reserved `.example` name, which no real service can use, and their vetting
dates are `2000-01-01`, a date no real review carries.

The command refuses to PUBLISH a file that still carries any one of the example's literals, even
if everything else was replaced:

| Left in the file | Refusal |
|---|---|
| a vendor address under `.example`, `.test`, `.invalid` or `example.com`/`.net`/`.org` | `HOSTED_REGISTER_EXAMPLE_VENDOR_REFUSED:` and the ref |
| a `providerRef` beginning `vendor:example-` | the same |
| a `maker` beginning `Example` | the same |
| a vetting date of `2000-01-01` | the same |
| the example's `sourceRef` sentence, unchanged | `HOSTED_REGISTER_EXAMPLE_SOURCE_REF_REFUSED` |

A dry run of the example succeeds and names them on its `example_vendors=` and
`example_source_ref=` lines, so you can see the command work before you write the real file.

Replace every vendor with a real one, and write the vetting dates only after you have actually
read that vendor's data-use and retention terms and named the vendor in the privacy notice (V-9(4)).

## What the file holds

| Member | What it is | Checked by |
|---|---|---|
| `format` | exactly `debateai.hosted-register.v1` | the command |
| `sourceRef` | a short, non-secret line saying why this version exists; it is sealed into the register (see "What `sourceRef` becomes" below) | the command |
| `configuredProviderSet` | `requiredDistinctMakers` and the vendor list: `providerRef`, `adapterKind` (`openai-compatible-http`), `maker`, `vetting` | `buildConfiguredProviderSetDeploymentRow` — `PROVIDER_VENDOR_NOT_VETTED` |
| `costEnvelopePolicy` | the V-28 ceilings in USD micro-units, as the register row stores them | the register's own schema — `COST_ENVELOPE_POLICY_INVALID` |
| `providerTargets` | the SAME array you put in `PROVIDER_DISCOVERY_TARGETS_JSON` in `runner.env` | the checks both services run at boot — relays, loopback and private addresses, inline credentials, missing or zero prices |
| `synthesisRoles` | optional: `synthesizerRoleRef` and `evaluatorRoleRef`. Leave it out and the first two different makers are used; with a single maker you must name them | the command — `HOSTED_REGISTER_ROLE_REF_UNCONFIGURED` |

Any other member is refused (`HOSTED_REGISTER_FILE_KEY_UNKNOWN`). `providerTargets` is checked and
**never published**: prices, addresses and credential paths stay in the two `EnvironmentFile`s,
and the command never prints them.

## What `sourceRef` becomes

Your `sourceRef` is sealed in three places, and only there:

- the publication's own source reference (why this version exists);
- the `costEnvelopePolicy` row's source reference, verbatim;
- the `configuredProviderSet` row's source reference: your `sourceRef` followed by the fixed V-9
  sentence `+ V-9 ruled 2026-09-22 (V, chat): versioned configuredProviderSet row carrying each
  vendor's V-9(4) vetting record, superseding the sealed row without altering it`. That sentence
  is appended by the register's own builder, so every hosted provider-set row names the ruling
  that governs it. Keep your `sourceRef` to 512 characters or fewer.

Every other row keeps the source reference its own code gives it.

## Every publication is based on the bootstrap version

Each publication names the sealed historical bootstrap (version 1) as its base, whatever hosted
versions already exist. That base is lineage only: nothing is inherited from it or from any
earlier hosted version. Each publication is a COMPLETE register built from this file and the
engine's code, so the version you pin is exactly what your file and this checkout describe.
Publishing the same file again returns the version that already holds it; a changed file gets a
new version, and every earlier version stays sealed exactly as it was.

## Known limitation: development provenance on the code-owned rows

The code-owned rows (runner policy, algorithm, contract hashes, and the other engine settings)
are sealed with the same source references the development seeder uses (`DEV-…`). This is
deliberate: the production runner's start-up reader (`readDevelopmentRunnerPolicy`) refuses
those rows under any other source reference, so a hosted register without them could not start.
The values are the engine's own; only the provenance labels say "development". The plan says so
on its `provenance=development-source-refs (known limitation)` line. Renaming that provenance is a
separate change to the runner's reader and needs its own ruling.

The ceilings in the example are the PROVISIONAL first-run values the owner accepted: 0.25 USD per
run (`250000`) and 2.00 USD per day (`2000000`), with `provisional: true`. The real values come
after the first measured paid run, as a NEW version published from an edited copy of this file —
never as an edit of the sealed one.

The file is read under the same custody rule as the key files: mode `0600`, owned by the user who
runs the command, inside a `0700` directory owned by that same user, not a symlink
(`HOSTED_REGISTER_FILE_CUSTODY_INVALID`).
