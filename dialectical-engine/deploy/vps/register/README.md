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
| `costEnvelopePolicy` | the V-28 ceilings in USD micro-units, as the register row stores them; optionally `serve_reserve_basis_points` (the share kept for writing the answer) and `serve_overrun_basis_points` (how far the answer may go over), both 0 when left out — see "The cost envelopes" in `deploy/vps/README.md`; optionally, all three or none, the budget rule's `admission_close_basis_points`, `finish_up_to_basis_points` and `waiting_line_per_person` (the example carries 9500, 11500 and 1; see "The band, holds and the waiting line" in `deploy/vps/README.md`). A file with the three band members must also carry `askRoomReads` (next row) | the register's own schema — `COST_ENVELOPE_POLICY_INVALID` |
| `askRoomReads` | optional, but required whenever `costEnvelopePolicy` carries the band: how many times one person may read the room (the "is there room for my question" check that the new-debate page and the home page's question box both make) in a window: a signed-in account is counted by its owner, a visitor who has not signed in by their browser session. Written as `{ "key": "owner", "limit": …, "window_ms": …, "capacity": … }`. The example carries an EXAMPLE budget, 60 reads a minute per person (`"limit": 60, "window_ms": 60000`) for up to 65,536 people at once (`"capacity": 65536`); set your own. It is added to the code-owned `admissionPolicy` row as its `ask_room_reads` member; every other member of that row stays as the engine has it. See "The room read's budget" below | the register's own parser — `ADMISSION_POLICY_INVALID` (a key other than `owner`, a limit of 0, an extra field or a `null` member); the band without it, `ASK_ROOM_ADMISSION_UNSEALED` (by the plan, by the publish's boot check and again when the API starts) |
| `countryPolicy` | optional, and NOT in the example: for every country, the two switches `signup` and `pay`, the reason, and `blocked`; `us_states` (optional) overrides the United States for a state a person declares at sign-up (never `blocked`; today Tennessee is closed); `regions` (optional) closes payment, never sign-up, in a part of an open country, found from the buyer's billing address: each entry is a region id (`US-MD`, `CA-SK`, `ES-CN`, ...; the code's closed list) with `pay`, the reason, and `"buyers": "business"` when only business buyers are refused (left out: every buyer), never `signup` or `blocked` (see "Closing payment in a region" below); unknown connections and Tor are refused. Left out, no `countryPolicy` row is published and that register version has no country gate (A14); the member turns the gate on, and is added only as "The country gate's switches" below says | the register's own parser — `COUNTRY_POLICY_INVALID` (a `pay: true` with `signup: false`, or a blocked country with a switch on, is refused; so are a `null` member and `"blocked": false` — `blocked` is `true` or left out; in `regions`, an id the code does not know, a rule with `signup` or `blocked`, and `buyers` other than `"business"`) |
| `providerTargets` | the SAME array you put in `PROVIDER_DISCOVERY_TARGETS_JSON` in `runner.env` | the checks both services run at boot — relays, loopback and private addresses, inline credentials, missing or zero prices |
| `synthesisRoles` | optional: `synthesizerRoleRef` and `evaluatorRoleRef`. Leave it out and the first two different makers are used; with a single maker you must name them | the command — `HOSTED_REGISTER_ROLE_REF_UNCONFIGURED` |
| `billingPlans` | optional: the paid plans: each plan's net price in USD, EUR and RON (whole cents or bani), the monthly credit (always USD), day and week shares, the finish edge, Free's fixed gauges, and `currency_by_country` (which currency each tax country pays in; any other country pays the `default`), as the register row stores them. Left out, the engine's own row is sealed, whose EUR and RON prices are placeholders | the register's own parser — `BILLING_PLANS_INVALID` |
| `billingPolicy` | optional: the billing switch (`enabled`) and its rules. Left out, the engine's own row is sealed: billing OFF | the register's own parser — `BILLING_POLICY_INVALID`; switched on without the budget members, `BILLING_REQUIRES_ENVELOPE_MEMBERS`; switched on in a version without `countryPolicy`, `BILLING_CONFIGURATION_INCOMPLETE` (the publish's boot check) |
| `taxAuthorities` | optional: where and when each tax is paid, in plain words, for the quarterly tax summary. Left out, the code-owned `taxAuthorities` row is published unchanged; include the member to correct the text. The example carries the member, equal to the code-owned text, so a file copied from it seals that copy under your own `sourceRef`: the code-owned "research of 29 September 2026, for the accountant to confirm" provenance is dropped, and a later correction of the code-owned row never reaches your versions while your file keeps the member. Delete the member from your copy unless you are correcting the text | the register's own parser — `TAX_AUTHORITIES_INVALID` (a `null` member is refused too) |
| `publicationCheckPolicy` | optional, and NOT in the example: the deadline of the safety check that runs before a debate is published, as `{"kind": "PUBLICATION_CHECK_POLICY", "deadline_ms": 60000}`, in whole milliseconds from 1000 to 60000 (60 seconds is the spec's cap, and the website waits 85 seconds for a publish). Left out, the code-owned `publicationCheckPolicy` row is published unchanged (60000); include the member only to change the deadline. A check that runs out of time refuses the publish, so a shorter deadline can only refuse more publishes, never skip the check | the register's own parser — `PUBLICATION_CHECK_POLICY_INVALID` (a `null` member is refused too) |
| `answerRoleRotation` | optional, and NOT in the example: `{ "enabled": true }` turns on per-debate role rotation (spec 2026-10-11). When a debate's panel has models from two or more companies, each of its four jobs (the answer writer, the answer checker, the storyteller and the story checker) goes to the model on that panel that has done that job least often so far, and the choice is kept for that debate. `{ "enabled": false }` seals the switch off. Left out, no row is published and the engine keeps its fixed roles. Turn it on only after migration 0114 is applied (`deploy/vps/README.md` §11, "Upgrading to role rotation") | the command's own check — `HOSTED_REGISTER_ROLE_ROTATION_INVALID` (the member must be exactly `enabled`, a boolean; a `null` member is refused too) |
| `callConcurrencyPolicy` | optional, and NOT in the example: how many AI calls may run at the same time. `perDebate` is the number inside one debate (1 to 64), `perModelPerDebate` the number to one AI inside one debate (1 to 16), and `perModelPerRunner` the number to one AI across all debates, one value per vendor name in lower case, each from 1 to 1000, with a required `default`. The member is one object with no `kind`, for example `{ "perDebate": 12, "perModelPerDebate": 3, "perModelPerRunner": { "default": 50, "deepinfra": 150, "anthropic": 50 } }` (the owner's start values). Left out, no row is sealed and the runner makes one call at a time per debate. See "The call-concurrency setting" below | the command's own check — `HOSTED_REGISTER_CALL_CONCURRENCY_INVALID` (a member that is not an object or carries `kind`, an extra top-level key, a number that is not a whole number in its range, a vendor name that is not lower case, a missing `default`, or a `null` member) |
| `debateShapePolicy` | optional, and NOT in the example: the debate shape's per-plan sizes and answer lengths (spec 2026-10-12 §3.1), the policy without its `kind`. Absent: today's debate shape. The runner argues the shape; a version that seals this member also seals `mapContractHash` (with `judgeContractHash` and `composerContractHash`, from the same code: the plan builds them from the code it runs), and the runner refuses a version whose `mapContractHash` is missing (`DEBATE_SHAPE_MAP_HASH_UNSEALED`) or is not its own (`MAP_CONTRACT_HASH_MISMATCH`). When the member is present the plan prints `debate_shape=present`, and the publish's own start-up check asks the runner's question (`HOSTED_REGISTER_NOT_BOOT_READY`, `HOSTED_REGISTER_BOOT_CHECK_FAILED:<code>`). To switch the shape off without dropping the row, add `"enabled": false` to the member: the API then asks today's shape, and a runner on that version still finishes the debates admitted with the shape | the command's own check — `HOSTED_REGISTER_DEBATE_SHAPE_INVALID` (a member that is not an object or carries `kind`, a `null` member, or a value the register's own parser refuses) |
| `lengthGuidancePolicy` | optional, and NOT in the example: the target lengths every AI is told, per plan and answer length (spec 2026-10-15 §3.1), the policy without its `kind`. Absent: every request is today's, byte for byte. The numbers are frozen on each debate when it is admitted, so a new version never reaches a running debate. When the member is present the plan prints `length_guidance=present`. Rollback: publish a version without the member | the command's own check — `HOSTED_REGISTER_LENGTH_GUIDANCE_INVALID` (a member that is not an object or carries `kind`, a `null` member, or a value the register's own parser refuses) |
| `engineVersionPolicy` | optional, and NOT in the example: the engine row (engine redesign spec 2026-10-15 §3): engine 2's scoring, link, investigation, judge, label and answer-check settings, the policy without its `kind`. Absent: engine 1, every debate as today, byte for byte. Each debate's engine is frozen on it when it is admitted, so a new version never reaches a running debate. A version that carries this member must also carry `lengthGuidancePolicy` (engine 2 reads its word targets from it). Engine 2's seal, `engineContractHash`, is code-owned: every plan seals it from the code it runs, and the runner refuses a version with this member whose seal is missing (`ENGINE_CONTRACT_HASH_UNSEALED`) or is not its own (`ENGINE_CONTRACT_HASH_MISMATCH`). When the member is present the plan prints `engine_version=present`. To switch engine 2 off without dropping the row, add `"enabled": false` to the member: the API then admits engine 1, and a runner on that version still finishes the debates admitted with engine 2. Rollback: publish a version without the member, once no engine-2 debate is running | the command's own checks — `HOSTED_REGISTER_ENGINE_VERSION_INVALID` (a member that is not an object or carries `kind`, a `null` member, or a value the register's own parser refuses) and `HOSTED_REGISTER_ENGINE_REQUIRES_LENGTH` (the member without `lengthGuidancePolicy`, enabled or not) |
| `questionLanguagePolicy` | optional, and NOT in the example: the question-language check's settings and the owners' instruction text (question-language spec 2026-10-13), the policy without its `kind`: `version` 1, `fastCheck` (`provider` `anthropic`, `model`, `effort` `low`/`medium`/`high`, `timeoutMs` 1000 to 15000, `maxOutputTokens` 128 to 4096, `priceMicrosUsdPerMillionTokens` `{input, output}`) or `null` to switch the fast check off, and `instruction` (at most 4000 UTF-16 code units, which is up to about 12 KB of UTF-8 for non-Latin text; no control characters; none of the prompt frame's reserved tokens). Absent: the code's start values. The API reads it only while the debate shape is in force; on hosted the fast check stays off until the run-less spend record exists, so until then the language is decided by the local detector and the site language. A new value is a new version | the command's own check — `HOSTED_REGISTER_QUESTION_LANGUAGE_INVALID` (a member that is not an object, carries `kind`, a `null` member, or a value the register's own parser refuses; an instruction holding a reserved prompt-frame token, or a fast-check model the provider price table does not list as an Anthropic model: the API would refuse both at boot. The readiness check reads the sealed row too, while the debate shape is in force) |

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

## Closing payment in a region

Some places inside an open country need their own tax registration before the site may sell there. The
`regions` member of `countryPolicy` closes payment in them. People there can still sign up and use the
Free plan; only paying is refused. The site finds the region from the billing address the buyer types (the
postal code, or the state or province), not from the internet address.

`country-policy.example.json` carries the owner's launch list of 20 October 2026 (the research is in the payment
region blocks spec, `docs/superpowers/specs/2026-10-20-payment-region-blocks-design.md`):

- Canada: Saskatchewan (`CA-SK`), Manitoba (`CA-MB`);
- United States: `US-DC`, `US-HI`, `US-MD`, `US-RI`, `US-VT`, `US-WV`, `US-NJ`, and Ohio (`US-OH`) for
  business buyers only;
- the EU places outside the EU VAT area: `ES-CN` (Canary Islands), `ES-CE` (Ceuta), `ES-ML` (Melilla),
  `FR-971` (Guadeloupe, with Saint-Martin and Saint-Barthélemy), `FR-972` (Martinique), `FR-973` (French
  Guiana), `FR-974` (Réunion), `FR-976` (Mayotte), `FI-01` (Åland), `GR-69` (Mount Athos), `IT-LIVIGNO`,
  `IT-CAMPIONE` (Campione d'Italia), `DE-HELGOLAND` (Heligoland), `DE-BUESINGEN` (Büsingen).

Each entry reads `{ "pay": false, "reason": "TAX_NOT_READY" }`; Ohio's adds `"buyers": "business"`. To open a
region once the company is registered there, delete its entry from the hosted file and publish: that new
version supersedes the old one, which is never edited (`deploy/vps/README.md` §14.6). A file whose
`countryPolicy` has no `regions` member closes no region.

## The room read's budget

Paid plans P4-G (go-live row 31). Once the band is sealed, the room read (`GET /v1/asks/room`) is
a real computation on every call: the cost estimate and the room's own reads. Two pages make it:
the new-debate page (`/new`) and the home page's question box. So it has its own admission budget,
which the register's `admissionPolicy` row holds as `ask_room_reads`. The budget is per person: a
signed-in account is charged by its owner, so all of that person's sessions and devices share one
budget, and a visitor who has not signed in is charged by their browser session. This is the same
key `POST /v1/asks` charges by. A person who goes over it gets `429 ADMISSION_RATE_LIMITED` for the
rest of the window; the page then simply shows no room word, and the question itself is still
decided when it is asked. A version without `ask_room_reads` does not limit the read at all.

- **Seal it in the same new version as the band.** Go-live line 13 publishes the band's three
  members (`admission_close_basis_points`, `finish_up_to_basis_points`, `waiting_line_per_person`).
  Put `askRoomReads` in that same file, so the one new version carries both. A version with the band
  and without the budget is refused: by the dry run and the publish (`ASK_ROOM_ADMISSION_UNSEALED`),
  by the publish's boot check (`HOSTED_REGISTER_BOOT_CHECK_FAILED:ASK_ROOM_ADMISSION_UNSEALED`), and
  by the API when it starts.
- **The value is yours.** The example's 60 reads a minute per person is an example. The
  new-debate page reads the room once when it opens and again each time the question's settings
  change, so a person changing settings quickly makes a few reads a minute. The home page's
  question box reads it once when it opens, and again when a question is refused because the
  person already has one waiting. Both pages spend the same person's one budget.
- The plan prints `ask_room_reads key=owner limit=… window_ms=… capacity=…`, or
  `ask_room_reads absent`.
- A changed budget is a new version published from an edited copy of your file, never an edit of
  a sealed one.

Separately, a debate page that polls a WAITING question no longer makes the server work out the
expected start on every poll: the API keeps each waiting question's expected start for thirty
seconds, or until the next minute, when the line is next looked at, whichever comes first. That
needs no setting.

## The call-concurrency setting (parallel calls, optional)

A debate asks its independent AI calls at the same time, within the limits this setting sets. It is optional.
Leave it out and the runner makes one call at a time per debate, as it does today.

The setting has three numbers:

- `perDebate`: calls at once inside one debate. A whole number from 1 to 64.
- `perModelPerDebate`: calls at once to one AI inside one debate. A whole number from 1 to 16.
- `perModelPerRunner`: calls at once to one AI across all debates on this server. One number for each vendor, named in lower case, such as `deepinfra` or `anthropic`. Each is from 1 to 1000. The key `default` is required: it covers every vendor not named.

**Which vendor names the runner knows.** The runner recognises exactly three keys in `perModelPerRunner`: `deepinfra`, `anthropic` and `default`. It reads each AI's vendor from the host of its address: an address on `deepinfra.com` (or a name under it) is `deepinfra`, one on `anthropic.com` (or a name under it) is `anthropic`, and every other address (a relay, a local model server, any other vendor) uses `default`. On the preview, each reviewed AI's own provider (`deepinfra` or `anthropic`) is its vendor. Any other key is accepted when the setting is published but never matches an AI, so those AIs fall back to `default`: for example a key `google` changes nothing today. (Code: `vendorOfBaseUrl` and `previewCallSubjects` in `apps/runner/src/call-lane-gateway.ts`.)

The owner's start values are 12 for `perDebate`, 3 for `perModelPerDebate`, and 50 for `default`, 150 for `deepinfra` and 50 for `anthropic` in `perModelPerRunner`. The member goes at the top level of the file, like this, on one line: `"callConcurrencyPolicy": { "perDebate": 12, "perModelPerDebate": 3, "perModelPerRunner": { "default": 50, "deepinfra": 150, "anthropic": 50 } }`

Rules, in plain words:

- **A sealed version is never edited.** A new number is a new version. Copy the file, change the numbers, and publish.
- **Do not roll back by pinning an older version number.** Every version is a complete set of settings, so an older version number also brings back the older vendors, ceilings, billing and country settings. To go back to older numbers for this setting, publish them as a new version.
- **The runner reads the setting when it starts.** A change takes effect after the restart in the steps below.

To turn it on or change the numbers on the hosted server, do these steps in order. Run every command from the engine's folder, `/opt/debateai/dialectical-engine`, as root.

1. Edit `/etc/debateai/register/hosted-register.json`. Add the member at the top level, or change its numbers. Leave the other members as they are.
2. Check the file. This writes nothing, and it needs no migrator window:

```sh
cd /opt/debateai/dialectical-engine && pnpm register:publish-hosted --dry-run --file /etc/debateai/register/hosted-register.json
```

The plan's `row_keys=` line must name `callConcurrencyPolicy`. If the command refuses with `HOSTED_REGISTER_CALL_CONCURRENCY_INVALID`, nothing was sealed. Fix the numbers and run this check again.

3. Check whether the owners' scorecard file exists:

```sh
test -e /etc/debateai/register/model-scorecard.json && echo "scorecard file present" || echo "no scorecard file"
```

If it says `scorecard file present`, use the form with the scorecard file in step 4. If it says `no scorecard file`, use the plain form. A publish without the scorecard file seals a version with no scorecard, and asks then use the plan's usual models (see "The model scorecard" below).

4. Open the migrator window (`deploy/vps/README.md`, section 4, step 2). In that same shell, publish. Use one of these two forms.

The plain form, when there is no scorecard file:

```sh
cd /opt/debateai/dialectical-engine && pnpm register:publish-hosted --file /etc/debateai/register/hosted-register.json
```

The form with the scorecard file:

```sh
cd /opt/debateai/dialectical-engine && pnpm register:publish-hosted --file /etc/debateai/register/hosted-register.json --scorecard /etc/debateai/register/model-scorecard.json
```

Then close the migrator window (section 4, step 5).

5. Read the lines the publish prints. `HOSTED_REGISTER_BOOT_READY register_version=N` followed by `REGISTER_VERSION=N` means the version is good. `outcome=REPLAYED` means this exact file was already published, so nothing new was sealed. If you see `HOSTED_REGISTER_NOT_BOOT_READY` instead, pin nothing. Read the refusal code, correct the file, and publish again.
6. Check that the newest version holds the row:

```sh
sudo -u postgres psql -d debateai -c "SELECT register_version, row_key, value_json FROM register.register_row WHERE register_version = (SELECT max(register_version) FROM register.register_row) AND row_key = 'callConcurrencyPolicy'"
```

One row comes back, and it shows `callConcurrencyPolicy`.

7. On this server a new register version is a new release (`deploy/vps/README.md` §5, "A new register version is a new release"): the API and the runner are instance units, one per release (`debateai-api@<label>`, `debateai-runner@<label>`), and each release's overlays carry its version and its key `r<N>-…`. So do a side-by-side upgrade whose key carries `N` (its steps 3 and 9 to 12): a restart of a running release changes nothing.
8. After that upgrade's switch, copy the printed `REGISTER_VERSION=N` line into both base files `/etc/debateai/api.env` and `/etc/debateai/runner.env` too (only the operator commands that load a base file alone read it there). Then check that the current release runs version `N`: its `releaseKey` starts with `rN-`.

```sh
/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/node /opt/debateai/dialectical-engine/deploy/vps/release.mjs status
```

To turn it off on the hosted server:

1. Remove the `callConcurrencyPolicy` member from the file. Leave the other members as they are.
2. Do steps 2 to 8 above again. In step 2 the plan's `row_keys=` line no longer names `callConcurrencyPolicy`. In step 6 the result has zero rows, which is right. Nothing is edited: the earlier version stays sealed, and the new version has no row. With no row, the runner makes one call at a time per debate.

On the preview, this setting is not in this file. The preview publishes its own register through its kit. See `deploy/preview-auth-dev/v1/README.md`, "Call-concurrency row". The preview's native plan carries it as `callConcurrency` (the release tool's `native-plan --operation plan --call-concurrency '<JSON>'`); the steps are in that section.

## What `sourceRef` becomes

Your `sourceRef` is sealed in these places, and only there:

- the publication's own source reference (why this version exists);
- the `costEnvelopePolicy` row's source reference, verbatim;
- the `billingPlans` and `billingPolicy` rows' source reference, verbatim, when the file supplies them;
- the `countryPolicy` row's source reference, verbatim, when the file carries the member;
- the `taxAuthorities` row's source reference, verbatim, when the file carries the member (left
  out, that row keeps the code-owned source reference);
- the `publicationCheckPolicy` row's source reference, verbatim, when the file carries the member
  (left out, that row keeps the code-owned source reference);
- the `answerRoleRotationPolicy` row's source reference, verbatim, when the file carries the member
  (left out, no such row is sealed);
- the `callConcurrencyPolicy` row's source reference, verbatim, when the file carries the member
  (left out, no such row is sealed);
- the `configuredProviderSet` row's source reference: your `sourceRef` followed by the fixed V-9
  sentence `+ V-9 ruled 2026-09-22 (V, chat): versioned configuredProviderSet row carrying each
  vendor's V-9(4) vetting record, superseding the sealed row without altering it`. That sentence
  is appended by the register's own builder, so every hosted provider-set row names the ruling
  that governs it. Keep your `sourceRef` to 512 characters or fewer.

Every other row keeps the source reference its own code gives it. With `askRoomReads`, the
`admissionPolicy` row keeps its code-owned source reference followed by the fixed sentence
` + paid plans P4-G ask_room_reads, the owner's value from the hosted register file` (your
`sourceRef` is not repeated there: it is the publication's own).

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

**Free's own cost caps on a site that sells plans (paid plans S4b; the owners' ruling of 3 October 2026).** Free gets almost the cheapest models, chosen for the most value. On the website, with billing on, each job of a Free debate gets the best-scoring model whose cost per call is at or under **Free's own cap** for that job, and only from the Free plan's models (`PLAN_TIER_ROSTERS.free`). When one of them is unavailable, its backup also comes from the Free plan's models only; when none of them can be reached, the debate takes the usual "no model is reachable" path. A Free debate's answer writer and answer checker, and their backups, are always Free-plan models that the scorecard scored. When no scored Free-plan model can take one of those two jobs, the Free question is refused (`ASK_MODEL_CANDIDATE_UNAVAILABLE`, "No model is reachable right now for one of this debate's jobs"). While a scorecard is in force with billing on, the register's own answer models (`synthesisRoles`) never write or check a Free answer. So the evaluator must score the Free plan's models (`PLAN_TIER_ROSTERS.free`) for every job, the answer writer and the answer checker included. With billing on, a scorecard under which none of the Free plan's models that the site's connections serve can take the answer writer's job, or none can take the answer checker's (to take a job a model must be scored for it and not `AVOID` or `UNTESTED`, be reachable through an API, be served through a connection whose maker is written exactly as the scorecard candidate's (character for character, so `openai` and `OpenAI` do not match), with the same model id, at the thinking level it was scored at, which that connection declares (a model scored at its default level only needs no declared level), and have a typical call that fits its context window), is refused `SCORECARD_FREE_ANSWER_UNSCORED`, by `register:publish-hosted --scorecard` before anything is sealed and again when the API starts. A paid person who chooses Economy keeps the scorecard's own Economy rule (the best model under the Economy cap), so it is Free's caps, not the Economy caps, that decide which models Free gets. Set them as `pickerSettings.freeCap`, beside `economyCap`, in the evaluator's configuration before `scorecard:approve`: one entry for each of the seven jobs, `{ "moneyMicrosPerCall": <micros per call> }`, each at or below that job's Economy `moneyMicrosPerCall`. For example (example figures, not a recommendation): `"freeCap": { "POSITION": { "moneyMicrosPerCall": 10000 }, "SUPPORT_ATTACK": { "moneyMicrosPerCall": 12000 }, … }`, with all seven jobs listed. With billing on, a scorecard with no `freeCap`, with a job whose Free cap is `null`, whose Free cap is above its Economy cap, or whose Economy money cap is `null` is refused `SCORECARD_FREE_CAPS_INVALID`, by `register:publish-hosted --scorecard` before anything is sealed and again when the API starts. With billing on, the check that one debate's arguing limit pays for its first call (`RUN_CEILING_BELOW_ONE_CALL`) also prices Free on the Free plan's models only. With billing off, and in local mode, `freeCap` is not read. The figures are yours; the engine ships none.
