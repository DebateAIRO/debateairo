# The hosted register file

`hosted-register.example.json` is the input to `pnpm register:publish-hosted`, the command that
publishes the hosted deployment's settings register (the sealed, versioned settings every service
reads at start-up) as ONE new register version. The command, its checks and its refusal codes are
in `apps/runner/src/hosted-register-publish.ts`; the runbook step is in the kit's main README.

`country-policy.example.json` holds the one member the example leaves out on purpose,
`countryPolicy`: the country gate's switches. See "The country gate's switches" below before you
add it to a hosted file.

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
| `costEnvelopePolicy` | the V-28 ceilings in USD micro-units, as the register row stores them; optionally `serve_reserve_basis_points` (the share kept for writing the answer) and `serve_overrun_basis_points` (how far the answer may go over), both 0 when left out — see "The cost envelopes" in `deploy/vps/README.md`; optionally, all three or none, the budget rule's `admission_close_basis_points`, `finish_up_to_basis_points` and `waiting_line_per_person` (the example carries 9500, 11500 and 1; see "The band, holds and the waiting line" in `deploy/vps/README.md`) | the register's own schema — `COST_ENVELOPE_POLICY_INVALID` |
| `countryPolicy` | optional, and NOT in the example: for every country, the two switches `signup` and `pay`, the reason, and `blocked`; unknown connections and Tor are refused. Left out, no `countryPolicy` row is published and that register version has no country gate (A14); the member turns the gate on, and is added only as "The country gate's switches" below says | the register's own parser — `COUNTRY_POLICY_INVALID` (a `pay: true` with `signup: false`, or a blocked country with a switch on, is refused; so are a `null` member and `"blocked": false` — `blocked` is `true` or left out) |
| `providerTargets` | the SAME array you put in `PROVIDER_DISCOVERY_TARGETS_JSON` in `runner.env` | the checks both services run at boot — relays, loopback and private addresses, inline credentials, missing or zero prices |
| `synthesisRoles` | optional: `synthesizerRoleRef` and `evaluatorRoleRef`. Leave it out and the first two different makers are used; with a single maker you must name them | the command — `HOSTED_REGISTER_ROLE_REF_UNCONFIGURED` |
| `billingPlans` | optional: the paid plans (prices, monthly credit, day and week shares, the finish edge, Free's fixed gauges) as the register row stores them. Left out, the engine's own row is sealed | the register's own parser — `BILLING_PLANS_INVALID` |
| `billingPolicy` | optional: the billing switch (`enabled`) and its rules. Left out, the engine's own row is sealed: billing OFF | the register's own parser — `BILLING_POLICY_INVALID`; switched on without the budget members, `BILLING_REQUIRES_ENVELOPE_MEMBERS`; switched on in a version without `countryPolicy`, `BILLING_CONFIGURATION_INCOMPLETE` (the publish's boot check) |
| `taxAuthorities` | optional: where and when each tax is paid, in plain words, for the quarterly tax summary. Left out, the code-owned `taxAuthorities` row is published unchanged; include the member to correct the text. The example carries the member, equal to the code-owned text, so a file copied from it seals that copy under your own `sourceRef`: the code-owned "research of 29 September 2026, for the accountant to confirm" provenance is dropped, and a later correction of the code-owned row never reaches your versions while your file keeps the member. Delete the member from your copy unless you are correcting the text | the register's own parser — `TAX_AUTHORITIES_INVALID` (a `null` member is refused too) |

Any other member is refused (`HOSTED_REGISTER_FILE_KEY_UNKNOWN`). `providerTargets` is checked and
**never published**: prices, addresses and credential paths stay in the two `EnvironmentFile`s,
and the command never prints them.

## The country gate's switches

`country-policy.example.json` holds exactly one member, `countryPolicy`, with the §1.5 switches of
the paid-plans spec — the same value the development seeder publishes. It is kept out of
`hosted-register.example.json` because bring-up copies that example into the live hosted file, and
the gate must not turn on by default.

Do not add the member to `/etc/debateai/register/hosted-register.json`, or publish any version that
carries it, until every condition in the kit's main README (§5 "Country data") holds: the site shows
the DB-IP credit (`IP Geolocation by DB-IP`, linking to `https://db-ip.com`; the full site footer
carries it since paid plans P21, so check it on the live landing page), the owner has ruled that
the Terms' list of served countries matches the switches, the Privacy Policy says that addresses
are looked up locally, and the two data files are installed and refreshed. The go-live checklist
carries the four as lines 27–30. Then copy the member into the hosted file's top-level object and publish; a changed
switch later is a new version, never an edit of a sealed one.

## What `sourceRef` becomes

Your `sourceRef` is sealed in these places, and only there:

- the publication's own source reference (why this version exists);
- the `costEnvelopePolicy` row's source reference, verbatim;
- the `billingPlans` and `billingPolicy` rows' source reference, verbatim, when the file supplies them;
- the `countryPolicy` row's source reference, verbatim, when the file carries the member;
- the `taxAuthorities` row's source reference, verbatim, when the file carries the member (left
  out, that row keeps the code-owned source reference);
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

## The model scorecard (optional): `--scorecard`

The owners' approved model scorecard is published **beside** the register file, never inside it. It is its own
document, with its own argument and its own size limit: **64 KiB** (65,536 bytes), for the file and for the scorecard
as it is stored. Local mode reads its scorecard file (`scorecards/current.json`) under the same limit, so on SIZE a
file gets the same answer in both. (On fields they differ: see the "only the fields the scorecard format defines"
point below.)

Why 64 KiB (the owners' ruling of 2026-09-27): the database re-checks a stored value one character at a time, and that
takes longer the bigger the value, faster than in step with its size. A scorecard close to 64 KiB takes about 40
seconds to publish; one of about 100 KB took almost a minute and a half. The seven-model example scorecard is about
18 KB.

```sh
pnpm register:publish-hosted --dry-run --file /etc/debateai/register/hosted-register.json --scorecard /etc/debateai/register/model-scorecard.json
```

```sh
pnpm register:publish-hosted --file /etc/debateai/register/hosted-register.json --scorecard /etc/debateai/register/model-scorecard.json
```

- The scorecard file is read under the same custody rule as the register file: mode 0600, in a 0700 directory you own.
  Its refusals are `HOSTED_REGISTER_SCORECARD_FILE_ABSENT`, `…_CUSTODY_INVALID` and `…_INVALID`. `…_INVALID` also
  covers a file over 64 KiB, and a file whose stored form would be over 64 KiB (for example, many `\n` escapes,
  which are stored as the longer `\u000a`).
- It is checked by the engine's own scorecard validation. A refusal is `HOSTED_REGISTER_SCORECARD_REFUSED:` followed by
  the reason (`SCHEMA_INVALID`, `ENGINE_INCOMPATIBLE`, `UNKNOWN_CANDIDATE` or `NUMBER_SHAPE`).
- It may carry only the fields the scorecard format defines. The format itself ignores a field it does not know, but a
  sealed version can never be edited, so publishing refuses such a field instead of sealing it forever:
  `HOSTED_REGISTER_SCORECARD_KEY_UNKNOWN:` followed by the place that holds it and a `*` (for example
  `candidates.1.*`: the second candidate has a field it should not; just `*` means the top level). The line never
  prints the field's name or its value, since either could be private. Local mode ignores such a field instead, so
  the same file can work locally and still be refused here. The evaluator writes only defined fields, so an approved
  scorecard is not refused.
- It becomes the `modelScorecard` row of the NEW register version. The row's source reference is your `sourceRef`,
  followed by ` | modelScorecard v<version> sha256:<hash of the sealed document>`.
- The plan prints `model_scorecard version=… candidates=… bytes=… sha256=…`, or
  `model_scorecard=none (asks keep the plan rosters)`.
- The hosted site reaches a model only through an API, so the plan also prints how many of the scorecard's models can
  be reached that way: `model_scorecard api_candidates=N (N of the M scored models can be reached through an API; the
  hosted site reaches models only that way)`. When that number is 0 it adds one more line, `model_scorecard note: …`,
  saying the hosted site will keep using the plan's usual models until a model it can reach through an API is scored.
  That is a warning, not a refusal: the scorecard is still valid and can still be published.
- **Every publication is a complete register version.**
  - Publishing again *without* `--scorecard` seals a version with **no** scorecard, and asks then use the plan rosters.
  - To keep the scorecard while you change something else, pass the same `--scorecard` again.
  - To go back to an earlier scorecard, publish again from your current file with the earlier scorecard file
    (`--scorecard` and the earlier file's path): that gives a version with the earlier scorecard and everything else
    as it is now. Pin the version it prints in both `EnvironmentFile`s and restart both units. Keep a copy of every
    scorecard file you publish, so the earlier one is there when you need it.
  - Do not pin an older version instead: every version is a complete register, so an older one also rolls back the
    vendors, ceilings, support rows, billing settings and country gate sealed since. A changed vendor list refuses
    the boot (`PROVIDER_DISCOVERY_TARGET_SET_MISMATCH`), and once billing is on, an older version sealed with billing
    off switches it off for every live subscription, without the checks the kit's main README asks for first
    (§14.8, "Stopping sales, and switching billing off"). No sealed version is ever edited.
  - Publishing a scorecard, like publishing any release that changes `packages/serve/src/index.ts`, seals a new
    version; the older versions stay sealed as they are.
- When the API starts, it prints one line saying which scorecard it runs: `MODEL_SCORECARD state=VALID|ABSENT|REFUSED …`.

**Plan caps on a site that sells plans (paid plans).** The scorecard's `pickerSettings.planStrengthCaps` is keyed by plan TIER: `free` caps the Free plan and `premium` every paid plan — with billing on, the engine sets each ask's tier from the person's plan in the `billingPlans` row. The owners' rule (29 September 2026) is Free → Economy and every paid plan → Best: set `"planStrengthCaps": { "free": "ECONOMY" }` in the evaluator's `config/evaluator.config.json` before `scorecard:approve` (the evaluator's own default, `{ "free": "BALANCED" }`, breaks the rule). With billing on, a scorecard whose `free` cap is not `ECONOMY`, or whose `premium` cap is not `BEST` (leaving it out is fine), is refused `SCORECARD_PLAN_CAPS_INVALID`, by `register:publish-hosted --scorecard` before anything is sealed and again when the API starts. On the website each debate is planned inside the asking person's remaining allowance, never past it: when no strength fits it, the debate still starts, on the cheapest choice that fits the site's own limit for one debate (Economy is the best model under a cost cap, so the cheapest choice is not always Economy), and it is refused only when no strength fits that limit; a question waits only when one of the person's limits is full, and if it is started after all when its turn is decided, it starts with the plan made for that moment. While a scorecard is in force, a paid ask is never moved to the Free models to fit (that interim rule applies only without a scorecard).
