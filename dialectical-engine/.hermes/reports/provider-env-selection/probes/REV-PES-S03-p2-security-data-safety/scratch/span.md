### What the hosted mode refuses, in code

| Code | Meaning |
|---|---|
| `DEPLOYMENT_MODE_UNRESOLVED` | `NODE_ENV=production` with no `DEBATEAI_DEPLOYMENT_MODE`. |
| `DEPLOYMENT_MODE_INVALID` | a value that is not exactly `hosted` or `local`, leading or trailing space included. |
| `PROVIDER_BASE_URL_TLS_REQUIRED:` and the provider ref | a target whose `base_url` is not `https:`. |
| `PROVIDER_TARGET_LOOPBACK_REFUSED:` and the provider ref | a base URL that names this machine or any address no public vendor API can live at. One code covers them all for now: the whole `127.0.0.0/8`, `0.0.0.0/8` and `169.254.0.0/16` ranges, `::`, `::1` and `fe80::/10`; the private ranges `10.0.0.0/8`, `172.16.0.0/12` and `192.168.0.0/16`, the CGNAT range `100.64.0.0/10` and the IPv6 unique-local range `fc00::/7`; the IPv4-mapped form of any of those; **this host's own interface addresses**, read at start-up; and the names `localhost`, `localhost.localdomain`, `ip6-localhost`, `ip6-loopback` or anything under `.localhost`. A hostname that RESOLVES to one of these is still admitted — no name resolution is done — so a vendor's hostname being a genuine public endpoint remains the operator's responsibility. |
| `PROVIDER_INLINE_CREDENTIAL_REFUSED:` and the provider ref | a credential written into `PROVIDER_DISCOVERY_TARGETS_JSON` instead of a file. |
| `PROVIDER_AUTHORIZATION_FILE_ABSENT:` and the provider ref | nothing is provisioned at that `authorization_file` path. Provision the file; do not go looking at the one that is there, because there is not one. The reader's own code for this, if you meet it in the source, is `PROVIDER_CREDENTIAL_FILE_ABSENT`. |
| `PROVIDER_AUTHORIZATION_FILE_UNUSABLE:` the provider ref, then the reason | the credential file is there but cannot be used: it failed custody (`SECRET_CUSTODY_INVALID`), the custody group could not be resolved (`CUSTODY_GROUP_UNRESOLVED`), or its contents are not one printable header line (`PROVIDER_CREDENTIAL_FILE_INVALID`). Neither the path nor a byte of the credential appears in the message. |
| `COST_ENVELOPES_NOT_SEALED` | a check on the integrity of the build: the envelope row this build ships was removed, emptied or made invalid. With the shipped source it is unreachable at runtime. The refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, the two rows below. |
| `RUNNER_PRIMARY_PROVIDER_REF_DRIFT` | `PROVIDER_REF` does not name the FIRST entry of `PROVIDER_DISCOVERY_TARGETS_JSON`. |
| `SUPPORT_MODEL_CREDENTIAL_ABSENT` | the support chat's target names a vendor API and declares no credential at all — no `authorization_file`. Every row above applies to `SUPPORT_MODEL_TARGET_JSON` as well; these last two are the support chat's own. |
| `SUPPORT_MODEL_PATH_NOT_RATIFIED` | `SUPPORT_MODEL_TARGET_JSON` is neither of the two lawful shapes: a vendor API (`https:`, path ending in `/v1`) or, in LOCAL mode only, the ratified loopback relay. A target that IS an API target but is malformed refuses with the matching `PROVIDER_DISCOVERY_*` code instead, so this one means "this is not a target". |
| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | one price member is declared without the other, or a declared amount is not an integer from 0 through `Number.MAX_SAFE_INTEGER`. |
| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | hosted mode, and a debate target declares no price pair. |
| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | hosted mode, and a declared input or output price is below 1 micro-unit per million tokens. |
| `COST_ENVELOPE_POLICY_UNRESOLVED` | no `costEnvelopePolicy` row exists at the resolved `REGISTER_VERSION`. |
| `COST_ENVELOPE_POLICY_INVALID` | the `costEnvelopePolicy` row exists but does not parse, or its `source_ref` is blank. |
| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | hosted mode, and the `admissionPolicy` row in force at the resolved `REGISTER_VERSION` lacks at least one of the three support budgets: `support_reads`, `support_sessions`, `support_model_calls`. |

`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be: a target whose price is malformed never reaches the other two.

### The credential-file contract
