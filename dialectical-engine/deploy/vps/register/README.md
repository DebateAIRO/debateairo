# The hosted register file

`hosted-register.example.json` is the input to `pnpm register:publish-hosted`, the command that
publishes the hosted deployment's settings register (the sealed, versioned settings every service
reads at start-up) as ONE new register version. The command, its checks and its refusal codes are
in `apps/runner/src/hosted-register-publish.ts`; the runbook step is in the kit's main README.

## Everything named "example" in the example file is fake

The two vendors in the example — `vendor:example-alpha` and `vendor:example-beta`, their makers,
models, prices, credential-file paths and vetting dates — are **examples, not vendors**. Their
addresses sit under the reserved `.example` name, which no real service can use, and the command
refuses to publish any vendor whose address is under `.example`, `.test`, `.invalid` or
`example.com`/`.net`/`.org` (`HOSTED_REGISTER_EXAMPLE_VENDOR_REFUSED`). A dry run of the example
succeeds and lists them on its `example_vendors=` line, so you can see the command work before
you write the real file.

Replace every vendor with a real one, and write the vetting dates only after you have actually
read that vendor's data-use and retention terms and named the vendor in the privacy notice (V-9(4)).

## What the file holds

| Member | What it is | Checked by |
|---|---|---|
| `format` | exactly `debateai.hosted-register.v1` | the command |
| `sourceRef` | a short, non-secret line saying why this version exists; it is sealed into the register | the command |
| `configuredProviderSet` | `requiredDistinctMakers` and the vendor list: `providerRef`, `adapterKind` (`openai-compatible-http`), `maker`, `vetting` | `buildConfiguredProviderSetDeploymentRow` — `PROVIDER_VENDOR_NOT_VETTED` |
| `costEnvelopePolicy` | the V-28 ceilings in USD micro-units, as the register row stores them | the register's own schema — `COST_ENVELOPE_POLICY_INVALID` |
| `providerTargets` | the SAME array you put in `PROVIDER_DISCOVERY_TARGETS_JSON` in `runner.env` | the checks both services run at boot — relays, loopback and private addresses, inline credentials, missing or zero prices |
| `synthesisRoles` | optional: `synthesizerRoleRef` and `evaluatorRoleRef`. Leave it out and the first two different makers are used; with a single maker you must name them | the command — `HOSTED_REGISTER_ROLE_REF_UNCONFIGURED` |

Any other member is refused (`HOSTED_REGISTER_FILE_KEY_UNKNOWN`). `providerTargets` is checked and
**never published**: prices, addresses and credential paths stay in the two `EnvironmentFile`s,
and the command never prints them.

The ceilings in the example are the PROVISIONAL first-run values the owner accepted: 0.25 USD per
run (`250000`) and 2.00 USD per day (`2000000`), with `provisional: true`. The real values come
after the first measured paid run, as a NEW version published from an edited copy of this file —
never as an edit of the sealed one.

The file is read under the same custody rule as the key files: mode `0600`, owned by the user who
runs the command, inside a `0700` directory owned by that same user, not a symlink
(`HOSTED_REGISTER_FILE_CUSTODY_INVALID`).
