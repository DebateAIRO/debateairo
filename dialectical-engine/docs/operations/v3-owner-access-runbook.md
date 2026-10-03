# Owner and team source activation

Task 9 used disposable PostgreSQL, synthetic native authenticators, test custody and captured mail. It did not install or rehearse a real Owner, device, module, destination, material, account, JIT login or deployment.

## Required independent operator inputs

Select the reviewed release, sealed register version, HTTPS public origin and exact RP hostname. Publish the strict v2 product/staff policies and disabled core-A internal allowance policy through the existing independent register ceremony. Tasks10–11 provide optional finite funding in source; only explicit reviewed funded-v2 composition and separate finite approval can activate it.

Explicit API inputs are `STAFF_ACCESS_POLICY_VERSION=2`, `STAFF_WEBAUTHN_ORIGIN` equal to the `PUBLIC_APP_URL` HTTPS origin, `STAFF_WEBAUTHN_RP_ID` equal to its hostname, `STAFF_INDEPENDENT_ALERT_CONFIG_PATH`, `STAFF_ALERT_OPERATOR_MODULE_PATH` and `STAFF_ALERT_OPERATOR_MODULE_SHA256`. The two paths are protected absolute paths; the hash is exactly 64 lowercase hex characters for reviewed module bytes. No defaults activate v2.

Module/configuration custody requires Root-owned regular files, no symlink and no group/other writable file or ancestor. The module is at most 65,536 bytes, opened with `O_NOFOLLOW`, checked against descriptor identity/size and exact byte hash. Already verified entry bytes execute through a data URL. Relative imports cannot resolve there; built-in or absolute transitive imports remain trusted deployment code and must be independently vetted and protected. Changing transitive code requires review even if the entry hash stays unchanged.

The module exports exactly `createStaffAlertOperatorAdapters()`, with no arguments. Its exact result is:

```
{
  schema: 'staff-alert-operator-v1',
  acknowledgements: Map<string, StaffAlertAcknowledgementAdapter>,
  invitationDelivery: StaffInvitationChannelDelivery,
  dispatch: { batchSize, intervalMs },
  close?: async function
}
```

The ACK map has 1–16 named adapters using the existing protected-config rehearsal evidence and message acknowledgment interfaces. Invitation delivery receives only an existing verified recipient, stable delivery ID, invitation URL and AbortSignal. It must honor cancellation and acknowledge actual delivery; successful submission alone is insufficient. Explicit `batchSize` is integer 1–100 and `intervalMs` integer 100–60,000. The optional close method releases resources within five seconds. This source/runbook chooses no production values, destination, credential or provider. No daemon is installed.

The factory receives no database pool, service/Root/JIT credential, recovery proof/verifier/material or user key. It is trusted code inside the API process, so the entry and transitive imports still need review; this is not a sandbox for arbitrary code.

The protected JSON retains the exact `staff-independent-alert-config-v1` fields: generation UUID, absolute protected executable, single bounded `from` and `recipient`, and known `ackAdapterId`. Rehearse real delivery/ACK evidence for those exact bytes independently. The web runtime cannot publish readiness. An independently operated existing recovery JIT principal publishes matching config/generation/rehearsal evidence for at most 30 seconds; enabling operations get at most ten-second leases. Task 5 provides no automatic JIT reopen/refresher. Production needs a separately reviewed routine publication lifecycle.

Create the offline recovery generation through existing Root-private custody/exclusive-lock/fsync procedures. Keep independent verifier custody and offline proof/copies separate from the browser account and its physical keys. Install through the existing five-minute JIT-only capability. Web startup sees only the stored completed installation receipt: operation ID, outcome and recorded time. It cannot read generation/verifier/material. Installation alone is not a designation.

Initial v2 startup requires sealed staff policy, protected config/ACK evidence, matching fresh independent publication, acknowledged target adapter and installed receipt. Missing evidence refuses boot. No Owner designation is required: candidate key enrollment and command possession remain possible before bootstrap. After listen, Main owns single-flight finite outbox draining and stop/cleanup. It never borrows Root credentials or publishes readiness.

## Separate rehearsal and first Owner

Use a staging RP/origin, separate test accounts and separate private data. Verify ordinary signup/email/MFA remains ordinary; two distinct UV-required physical keys; private CLI command/nonce preparation; fresh password/TOTP prerequisite; exact fixed-pair possession receipts; independent one-time bootstrap; separate elevation; invitation to an existing verified colleague; explicit grants and disable. Exercise stolen password/TOTP/cookies/keys, wrong subjects, replay, races, expiry, DB/alert outages, holds, ordinary recovery and erasure.

Record actual two-key hardware and independent offline-copy/verifier evidence. Synthetic acceptance is not that rehearsal. Do not promote preview Owner markers, keys or material. Re-enroll under the production RP and repeat its independent first-Owner ceremony with production-specific material and explicit operator approval.

Use existing CLI commands with reviewed Root-private files/inherited proof descriptor and explicitly operated JIT credential. No browser route prepares/commits an Owner. The CLI fsyncs its exact journal/prepared next generation before SQL and publishes files afterward. Files and SQL are not atomic together. Preserve exact retained files after interruption and use only same-operation idempotent resume. Never restore an old generation or start another ceremony over a mismatch.

## Containment, outage and replacement

After activation, transport/evidence/publication outage refuses enabling actions and leaves bounded metadata delivery pending. It does not crash the API or block the existing DISABLE readiness exception. DISABLE still needs current ordinary/staff authority, exact native proof, revision, encryption and atomic audit/outbox commit. Recheck receipt/current state. A database outage can still prevent its commit.

If the sole Owner is compromised before a replacement is ready, immediately use independently trusted operational control to stop/block affected services and access paths. This containment does not depend on the stolen account, mail readiness or a browser Root/shell shortcut. Keep it until independent recovery and verified safe restart. This task performs no actual containment.

Missing initial readiness denies restart during an outage. Do not weaken the gate to resume: use independent containment/operator recovery and restore reviewed evidence/publication. Rolling back to version 1 alone does not prove ordinary-account compromise is contained.

Replacement recovery uses a distinct active account, verified email/TOTP, two verified production-RP keys, exact current lineage, ordinary-scope candidate possession and independent current offline material/JIT. Commit holds the old account, revokes ordinary/staff sessions and factors, and changes Owner lineage. Old private ownership and encrypted content/keys stay with the held old account. No private content moves to the new Owner. Ordinary account recovery never automatically restores staff/Owner authority. Erasure severs identifying mappings while retaining minimal audit/lineage for explicit erased-predecessor recovery.

## Privacy and resource gates

Browser DTOs expose self enrollment, verified own capabilities, scoped opaque team/audit metadata and handles only. No customer identity/channel/private-content/key/verifier/material/database credential/transport destination is projected. Historical runtime whole-SELECT on identity user/channel and authorization inheritance remain legacy machine rights. Browser staff does not get their credentials. Do not claim physically disjoint grants or silently revoke legacy dependencies.

Private SSE keeps ordinary ownership and current-session checks. Peer/revocation cancellation reaches snapshots, deeper lifecycle reads and content lease acquisition/validation/preparation. It cancels only an internally retained acquired backend PID over a short-lived authenticated connection using the same runtime TLS/socket profile, then destroys the held connection. No backend secret uses plaintext CancelRequest, browser PID or new cancellation grant. At most four cancellation connections exist per owned pool; slot wait is bounded to 250ms, authenticated connect/query lifecycle to one second and close to 100ms before forced socket disposal. Held private queries use a local 700ms lock-wait fallback; content computation has no new 750ms deadline. Signal content leases restore their original session lock setting before pool reuse. Prerequisite SQL retains its existing local 700ms statement/750ms operation bounds. Verify server waiters/locks disappear and late keys close. Cancellation transport failure remains a cleanup limitation requiring operational observation and never authorizes emission.

No privileged stream exists. Dormant staff revocation subscription uses a dedicated LISTEN connection per subscription; future privileged-stream deployment must budget that capacity and review fanout first.

Task12 verifies a fresh frozen install separately and prepares current Dev intake. The 2026-10-03 read-only remote snapshot is `3a15119be03680bcf9ab9ab23c4385c30c86d8ff`: 301 commits/1,317 changed paths from approved9f, 99 overlapping paths with final Admin6635. Exact comparison and conflict artifacts are in the linked final handoff. Nothing merged, rebased or deployed.

## Explicit finite funding selection (Tasks 10–11)

Core A retains the exact six-capability sealed rows, v1 customer contract and disabled allowance publication. The optional funded-v2 bundle adds `funding_policy_version:1` to the staff and product-role rows, seven Owner capabilities, and an enabled internal-allowance row with explicit positive safe-integer USD total/day/week maxima, ordered day <= week <= total, an explicit lifetime of at most 2,678,400,000 milliseconds and finish allowance 10,000 basis points. There is no amount/default/selector/grant seeded by source. Deployment must provide every `INTERNAL_ALLOWANCE_*` input accepted by `parseStaffAccessEnvironment`, including provenance, and publish all three coherent rows in one new sealed register.

Only the already trusted independent migration/bootstrap operator may write the unseeded `staff.funding_policy_selection`, under existing NOLOGIN `debateai_staff_security_owner`. The website and recovery capability have no selection write, publication, role membership or new operator function. Review the intended register version, seal/count, three exact values and provenance, immutable snapshot and approved finite limits before using this separately operated SQL step. Bind the version as a reviewed parameter; never copy a website session or credential into it.

```sql
BEGIN;
SET LOCAL ROLE debateai_staff_security_owner;
INSERT INTO staff.funding_policy_selection(singleton,register_version)
VALUES(true, :reviewed_register_version)
ON CONFLICT(singleton) DO UPDATE
SET register_version=EXCLUDED.register_version,selected_at=clock_timestamp();
SELECT staff.read_internal_funding_policy();
COMMIT;
```

The independent receipt records operator identity, exact source/migration hashes, selected register version/seal/count/snapshot and the three row hashes/provenances, policy maxima, selection timestamp and successful commit/readback. This document performs none of those steps. A refusal rolls the transaction back. To withdraw the selection, the same independent operator deletes the singleton in a separate reviewed transaction and records its readback/receipt; restoring a prior reviewed version is a separate explicit selection. Grants/events/charges are retained. Withdrawal, an invalid bundle, a register mismatch, replacement, expiry or revocation never converts an already pinned INTERNAL run into SUBSCRIPTION/FREE. An invalid selected bundle also refuses current Owner context, including core mutations; the existing DISABLE exception for an independent transport outage still applies while the selected policy/context is valid.

Funded API startup requires explicit enabled policy inputs, a non-null selection matching the configured `REGISTER_VERSION` and exact enabled policy, hosted billing and both priced provider sides, installed recovery and fresh independent evidence. Each funding action rechecks policy/selection/current Owner/ordinary generation/security hold, resolves only that Owner's own `owner_ref` and lineage revision server-side and binds the exact selected register version into the canonical proof digest. Configure grant ID is its SecurityReceipt operation ID. Revoke accepts that known grant ID; there is no discovery, customer search or other-staff funding route. Database mutations consume native action proof, serialize the subject/owner lineage, reject overlap, and atomically persist finite grant/event/audit/encrypted outbox. Erasure severs the grant's owner mapping and preserves opaque immutable event/charge history.

Under a valid matching policy, `current` returns null for an expired/revoked grant when resolving a new run. `forRun` refuses an expired/revoked/mismatched pinned INTERNAL basis. Task11 propagates the exact `FundingBasis` and CONFIGURED event pin through admission, WAIT entry/wake, every RUN/SERVE/STORY provider call, spend and own usage. Enrollment emits literal `funding_policy_version:1` from mounted validated funding before the first grant; the Team panel selects that strict funded client before elevation. Generic clients require explicit `fundingPolicyVersion:1`. No configure/revoke product form exists: use only the separately approved generic same-origin operator ceremony below.


## Task12 private preview and first-grant ceremony

The concrete proposal is [private HTTPS rehearsal](/Users/stefannour/DebateAIRO/docs/operations/admin-implementation-2026-10-02/task12-private-preview-and-recovery-proposal.md). Proposed origin `https://v3-preview.dezbatere.ro`, exact RP `v3-preview.dezbatere.ro`, proposed IPv4 `51.195.221.90`; preview-only DNS and separate services/storage/cookies/material. These are review proposals, not installed configuration. Production uses exact origin `https://dezbatere.ro` and RP `dezbatere.ro` only after separate approval; host-only cookies and production re-enrollment prevent preview promotion.

The usable generic-client procedure is [same-origin funding ceremony](/Users/stefannour/DebateAIRO/docs/operations/admin-implementation-2026-10-02/task12-same-origin-funding-ceremony.md). It uses the existing owned browser client/native serializer, ordinary plus staff CSRF and current Owner elevation. All finite public limits/dates/approval references are supplied under separate approval. Retain configure's nonsecret `SecurityReceipt.operation_id`, which is the grant ID, for revoke. Safe audit exposes only `event_id`; own usage hides grant IDs. Lost IDs require the existing trusted operator's strictly self-scoped metadata query by independently verified own account UUID, never browser discovery or another person's records.

Grant total counts all actual settled cost, including late settlement after expiry/revoke/hold. Day/week attribution uses admission time. Pending unknown projections are retained conservatively across resets and must be reconciled; do not zero them to manufacture room. Unexpected actual cost above projection is recorded without truncation, and subsequent admissions refuse. `UNKNOWN_COMMIT` never permits retrying provider bytes: inspect/replay only the same admission token's idempotent ledger settlement through the reviewed backend seam.

New WAIT entry pins both funding kinds without switching grants or subscription source. Subscription wake retains current-plan window/downgrade behavior; it does not rewrite the pin or adopt later funding. Definitive INTERNAL ending gives governed FAILED/FUNDING_ENDED, preserving private question/history and pin. HELD waits retain pin/person retry while releasing the site line. Transient read/transport uncertainty stays retryable WAIT. Bulk availability is a passive no-lock nonauthorizing hint; every actual provider admission performs fresh locked checks.

Before any release export or VPS activation, root must accept the [current Dev integration proposal](/Users/stefannour/DebateAIRO/docs/operations/admin-implementation-2026-10-02/task12-current-dev-integration-proposal.md), preserve both migration histories, reconcile identity rotation/billing/schema/P3/dependencies/licensing and close the six original observation findings. Fresh isolated Admin verification is not current Dev acceptance. Explicit Owner UUID, two real keys/custody, real independent alert ACK/lifecycle, providers/prices/secrets/finite budgets, production customer email/recovery/suppression, populated off-host restore and final DNS remain operator-owned gates. The Mac Main/V2 site and original staged9f release remain untouched.
