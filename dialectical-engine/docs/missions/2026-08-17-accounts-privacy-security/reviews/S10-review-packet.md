# S10 independent final security review packet

Review target: the uncommitted S10 account/private-erasure working-tree
candidate on branch `codex/accounts-s10`, base/HEAD
`ef12714cb5969da6fadb803ecacd53aed5e93bac`. Repository root for commands in
this packet is `dialectical-engine/`.

This is an independent, adversarial review. Refute the candidate rather than
rubber-stamp it. Review only; do not implement a fix, commit, push, merge,
deploy, change the board, or invoke another reviewer. Production and tests are
frozen at the hashes below. If a blocking defect exists, preserve it as a
finding with exact file:line and reproduction evidence.

Write exactly one verdict to:

`docs/missions/2026-08-17-accounts-privacy-security/reviews/S10-grok-verdict.md`

The first line must be exactly `GREENLIGHT` or `BLOCK`. Follow it with:

1. numbered findings ordered P0, P1, then lower severity;
2. exact file:line evidence and reachable source-to-sink reasoning;
3. commands run and measured outcomes;
4. entry and exit hashes for every file touched by a temporary probe;
5. an explicit statement whether the terminal full receipt and the two prior
   RED histories were reconciled; and
6. a concise self-report of scope inspected and scope not inspected.

`BLOCK` is required for any live P0/P1, a false evidence claim, a foreign byte
change, a GREEN mutant that invalidates a claimed invariant, or an inability
to reconcile the terminal full receipt. Do not block merely because an
explicit Router policy below differs from a preferred product design.

## Settled Router authority

The following Phase-1 choices are fixed review authority:

1. Account deletion requires exact `DELETE MY ACCOUNT`, an exact targetless
   `DELETE_ACCOUNT` step-up grant derived from the authenticated session, and
   a server-owned elapsed grace of exactly 604,800 seconds. Clients cannot
   supply or override a deadline. DB-clock scheduling is DST-safe.
2. Run-destructive grants are discriminated and run-targeted:
   `PUBLISH`, `UNPUBLISH`, and `DELETE_PRIVATE_DEBATE`. Account grants cannot
   carry a run target; run grants must carry the exact target.
3. Only bound, non-revoked `email` and `recovery_email` notification channels
   are supported. Historical WhatsApp bindings or `user.phone_ciphertext`
   make migration fail; forward WhatsApp creation is unreachable. Scheduling
   fails atomically when no supported channel exists.
4. Schedule, cancel, and completion notifications use a durable encrypted
   reference outbox. Completion requires every historical/current outbox row
   for the user to be ACKed and the user notification-plaintext session lease
   to be free. Final identity deletion cascades the outbox. An MTA ACK is not
   human receipt and an ambiguous send can idempotently resend the opaque
   message ID.
5. Self-service account erasure is the only Phase-1 account route. Operator or
   DSAR shredding is a separately authorized future workflow; there is no
   hidden admin bypass.
6. Current public snapshots survive account deletion under publication keys.
   Cross-run evaluator work may use only current public snapshot/presentation
   fields and persist content-free aggregate counts through the narrow public
   aggregate provider. It cannot use a private run lease/key or a normal raw
   provider gateway.
7. Private single-run plaintext work carries the real `runId`. Session
   advisory content leases cover key load, decrypt, plaintext/provider use,
   persistence, zeroization, and unlock. Nested scopes may borrow only a held
   subset; scope expansion fails typed. Top-level readers discover the complete
   related-run set, acquire it sorted once, then revalidate.
8. Private envelope carriers use run-key-derived, non-decrypting DB envelope
   attestation. Runtime cannot mint the attestation secret or caller-author a
   private deterministic locator. Encrypted QBI/content locators are NULL or
   DB-attested version 2 as documented; non-envelope content hashes are
   removed/null/opaque rather than copied into a global equality domain.
9. Canonical mutation order is run/account serializer, channels, user,
   credentials, remaining session/grant/factor/binding/intent children, then
   audit as specified by the T9 matrix. Textual joined-lock order is never the
   portable contract.
10. Erasure and content-provision use distinct actual LOGIN URLs and narrow
    NOLOGIN capability roles. Boot attestation rejects aliases, role crossover,
    superuser/admin attributes, elevated predefined roles, and capability
    drift. Generic runtime cannot provision a caller-chosen attestation secret.
11. Owner-private-history scans are exact and fail closed at row 129 under
    `MAX_OWNER_PRIVATE_HISTORY_SCAN = 128`. Owner ask admission holds a
    dedicated-session advisory lease from liveness through durable `startRun`
    commit, using the exact held admission client; it releases before memory,
    work enqueue, dispatch, or provider I/O.
12. Registration successor-timing opacity is bounded to healthy DB/key-store
    provisioning within 600 ms. Password hashing finishes before mail permit
    reservation; grant auto-activates; the 5,700 ms reservation is
    600 + 5,000 + 100 ms. Longer storage stalls/failures and external-DEK versus
    DB-COMMIT ambiguity remain disclosed residuals.

## Architecture to verify

The public boundary is cookie authentication plus CSRF/origin enforcement.
Account schedule returns its authoritative DB status, execute time, and opaque
generation-bound cancellation reference from the committed capability; a
later session revoke cannot turn a committed destructive action into a false
404. Cancellation is exact-generation idempotent, so a delayed cancel for A
cannot cancel later request B. A narrowly scoped scheduling-session status
authenticator exposes `PROCESSING` after suspension without reopening normal
application routes.

Private deletion performs a response-constant nonlocking session/grant/owner
preflight before either resume or prepare can classify/lock the run. It then
uses the canonical run-first mutation order and revalidates authorization under
locks. Foreign locked, foreign free, and absent IDs must remain opaque.

Account reconciliation discovers due work through a bounded, retry-fair
erasure-only capability. Notification reconciliation runs in the background,
single-flight and poison-isolated. Account cleanup holds the user notification
lease across prepare, external key destruction, and finalize. Run/publication
cleanup takes the same content/publication leases as readers so erasure and
plaintext/provider work serialize across processes and backend crash releases
the namespace.

The content-provision saga stages the run/execution binding under the isolated
principal, publishes the external key/derived attestation secret, then creates
the encrypted run on the exact held admission client. Binding precedes intent
where both exist. Cleanup revalidates claim ownership, deletes binding before
intent, and account PREPARE cannot race an unconsumed provision.

The duplicate `apps/ui` and `web` surfaces must show exact warnings, poll
account status, require fresh step-up, reject cross-origin/backslash/dot-segment
API bases, and purge every already-decrypted private-page sentinel on either
`PENDING` or `CLEANED`. Published snapshots and legacy residual vocabulary must
remain distinct from a private `CLEANED` claim.

## Eight attack surfaces

Review each surface independently and state the evidence inspected:

1. **Authentication/session/grants:** cookie/session derivation, exact action
   and target discriminants, grant single use, suspended-status-only access,
   no developer identities.
2. **Database roles/capabilities:** direct DML/TRUNCATE denial, exact EXECUTE
   allow/deny inventory, LOGIN/capability separation, predefined-role and URL/
   pool alias rejection.
3. **Lock order/concurrency:** T9 canonical row order, run/publication/user
   advisory leases, nested-scope expansion refusal, same-client admission,
   crash release, ambiguous commit, pool exhaustion, both schedules.
4. **Cryptography/carriers:** external DEK destruction, envelope AAD and MAC
   binding, attestation-secret custody/deletion, QBI/locator retirement, parse
   diagnostics, raw DB/CHECKPOINT/data-directory positive control.
5. **Audit/ref severance:** single-head canonical appender, attempt consumption,
   denial opacity, event-local C4 residual, post-delete expansion attacks,
   no copied stable source identity in erasure/publication events.
6. **State machines/notifications:** exact grace, schedule/cancel ambiguity,
   due-worker fairness, all-user outbox gate, ACK-response custody lease,
   unsupported/zero-channel failure, idempotent send/retry.
7. **HTTP/client/UI:** cookie/CSRF/origin, opaque private classification,
   same-origin URL normalization, PROCESSING polling, generation-bound cancel,
   whole-page private plaintext purge and warnings in both UIs.
8. **Resource/evidence honesty:** bounded owner history, evaluator public-only
   aggregate path, registration queue/timing/RSS controls, first/second full
   RED history, terminal full GREEN, and no legal/anonymity/universal-deletion
   overclaim.

## Explicit residuals and excluded claims

Do not upgrade these residuals into a blocking defect unless implementation or
evidence contradicts the stated boundary:

- claimed legacy plaintext produces `CLEANED_WITH_LEGACY_RESIDUAL`, never an
  encrypted-only `CLEANED`; mixed current-public plus claimed legacy ownership
  is refused;
- current public snapshots, downloaded/quoted/indexed copies, and provider-
  retained public copies may persist;
- T6 historical audit rows and ordinary historical source digests retain their
  separately documented historical classification;
- event-local publication/private correlation, retained public owner grouping,
  and a retired pseudonym are not anonymity;
- WAL, replicas, PITR, backups, filesystem snapshots, and a backed-up
  non-decrypting attestation secret are not physically erased by this ceremony;
- RAM, swap, hibernation, core dumps, hostile processes/hosts, and downstream
  MTA storage are outside the proof;
- registration healthy-storage opacity excludes >600 ms provisioning stalls,
  storage failure, and external-DEK/COMMIT ambiguity;
- the owner admission fence ends at durable run commit and does not roll back
  arbitrary later memory/enqueue/dispatch/provider failures; and
- three overlapping-`client.query()` pg@9 deprecation warnings occurred in the
  terminal GREEN suite and remain a compatibility follow-up.

No document in this packet claims universal deletion, anonymity, legal
compliance, human notification receipt, physical media erasure, or third-party
deletion.

## Changed and untracked scope

The authoritative pre-packet `git status --short --untracked-files=all`
contained 82 tracked modifications and 20 untracked paths. This packet is the
21st untracked path, for 103 total in-scope paths. The scan fix report is an
external temporary scan artifact and is listed separately below.

```text
 M dialectical-engine/acceptance/ceremony.test.ts
 M dialectical-engine/acceptance/main.ts
 M dialectical-engine/acceptance/mono-panel.test.ts
 M dialectical-engine/acceptance/run-acceptance.ts
 M dialectical-engine/apps/api/src/index.ts
 M dialectical-engine/apps/api/src/mail-channel.ts
 M dialectical-engine/apps/api/src/main.ts
 M dialectical-engine/apps/api/src/publications.ts
 M dialectical-engine/apps/api/src/registration.ts
 M dialectical-engine/apps/api/src/sessions.ts
 M dialectical-engine/apps/evaluator-worker/src/index.ts
 M dialectical-engine/apps/runner/src/index.ts
 M dialectical-engine/apps/runner/src/main.ts
 M dialectical-engine/apps/ui/app/debate/[id]/DebatePageClient.tsx
 M dialectical-engine/apps/ui/app/settings/page.tsx
 M dialectical-engine/apps/ui/components/PublicationControl.tsx
 M dialectical-engine/apps/ui/lib/api.ts
 M dialectical-engine/apps/ui/next-env.d.ts
 M dialectical-engine/packages/budget/src/index.ts
 M dialectical-engine/packages/contract/src/client.ts
 M dialectical-engine/packages/contract/src/index.ts
 M dialectical-engine/packages/critique/src/index.ts
 M dialectical-engine/packages/crypto/src/index.ts
 M dialectical-engine/packages/db/src/identity.ts
 M dialectical-engine/packages/db/src/index.ts
 M dialectical-engine/packages/db/src/publication.ts
 M dialectical-engine/packages/db/src/schema.ts
 M dialectical-engine/packages/db/src/sessions.ts
 M dialectical-engine/packages/evaluator/README.md
 M dialectical-engine/packages/evaluator/src/consumer-postgres.ts
 M dialectical-engine/packages/evaluator/src/consumer.ts
 M dialectical-engine/packages/evaluator/src/index.ts
 M dialectical-engine/packages/evidence/src/index.ts
 M dialectical-engine/packages/graph/src/index.ts
 M dialectical-engine/packages/judgement/src/index.ts
 M dialectical-engine/packages/ledger/src/index.ts
 M dialectical-engine/packages/liveness/src/index.ts
 M dialectical-engine/packages/memory/src/index.ts
 M dialectical-engine/packages/register/src/auth-policy.ts
 M dialectical-engine/packages/register/src/runtime-environment.ts
 M dialectical-engine/packages/serve/src/index.ts
 M dialectical-engine/packages/settlement/src/index.ts
 M dialectical-engine/tests/architecture/s13-contract.test.ts
 M dialectical-engine/tests/architecture/s6-content-encryption-contract.test.ts
 M dialectical-engine/tests/architecture/s7-authorization-contract.test.ts
 M dialectical-engine/tests/architecture/s8-publication-contract.test.ts
 M dialectical-engine/tests/architecture/t1-argon2-worker-contract.test.ts
 M dialectical-engine/tests/integration/database.test.ts
 M dialectical-engine/tests/integration/evaluator-addon-database.test.ts
 M dialectical-engine/tests/integration/evaluator-consumer-database.test.ts
 M dialectical-engine/tests/integration/evaluator-database.test.ts
 M dialectical-engine/tests/integration/evaluator-harvest-rework.test.ts
 M dialectical-engine/tests/integration/identity-database.test.ts
 M dialectical-engine/tests/integration/registration-database.test.ts
 M dialectical-engine/tests/integration/s6-content-encryption-database.test.ts
 M dialectical-engine/tests/integration/s7-authorization-database.test.ts
 M dialectical-engine/tests/integration/s8-publication-database.test.ts
 M dialectical-engine/tests/integration/session-database.test.ts
 M dialectical-engine/tests/support/testDatabase.ts
 M dialectical-engine/tests/unit/api.test.ts
 M dialectical-engine/tests/unit/dr184-catch-up.test.ts
 M dialectical-engine/tests/unit/evaluator-addon.test.ts
 M dialectical-engine/tests/unit/evaluator-consumer.test.ts
 M dialectical-engine/tests/unit/evaluator-dev-menu-api.test.ts
 M dialectical-engine/tests/unit/evaluator-harvest.test.ts
 M dialectical-engine/tests/unit/evaluator-tagger.test.ts
 M dialectical-engine/tests/unit/identity-crypto.test.ts
 M dialectical-engine/tests/unit/load01-live-proof.test.ts
 M dialectical-engine/tests/unit/load01-run-projection.test.ts
 M dialectical-engine/tests/unit/mfa.test.ts
 M dialectical-engine/tests/unit/pro01-runner-tree.test.ts
 M dialectical-engine/tests/unit/registration.test.ts
 M dialectical-engine/tests/unit/s5-session-http.test.ts
 M dialectical-engine/tests/unit/s6-content-encryption.test.ts
 M dialectical-engine/tests/unit/s7-authorization.test.ts
 M dialectical-engine/tests/unit/s8-publication-http.test.ts
 M dialectical-engine/tests/unit/s8-publication.test.ts
 M dialectical-engine/tests/unit/xrev01-node-review.test.ts
 M dialectical-engine/web/app/debate/[id]/DebatePageClient.tsx
 M dialectical-engine/web/app/settings/page.tsx
 M dialectical-engine/web/components/PublicationControl.tsx
 M dialectical-engine/web/lib/api.ts
?? dialectical-engine/apps/api/src/account-erasure.ts
?? dialectical-engine/apps/ui/components/AccountErasureControls.tsx
?? dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S10-carrier-derived-data-inventory.md
?? dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S10-erasure-evidence-artifact.md
?? dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S10-erasure-runbook.md
?? dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S10-t9-lock-privilege-callsite-matrix.md
?? dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S10-vr10-execution-record.md
?? dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S10-vr10-mutation-matrix.md
?? dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/reviews/S10-review-packet.md
?? dialectical-engine/migrations/0040_account_erasure.sql
?? dialectical-engine/packages/db/src/account-erasure.ts
?? dialectical-engine/packages/db/src/publication-lease.ts
?? dialectical-engine/packages/evaluator/src/public-aggregate-provider.ts
?? dialectical-engine/tests/architecture/s10-carrier-erasure-red.test.ts
?? dialectical-engine/tests/architecture/s10-erasure-evidence.test.ts
?? dialectical-engine/tests/integration/s10-t9-account-erasure-races.test.ts
?? dialectical-engine/tests/unit/s10-erasure-http.test.ts
?? dialectical-engine/tests/unit/s10-erasure-ui-render.test.tsx
?? dialectical-engine/tests/unit/s10-erasure-ui.test.ts
?? dialectical-engine/tests/unit/s10-mail-channel.test.ts
?? dialectical-engine/web/components/AccountErasureControls.tsx
```

Stop with `BLOCK — FOREIGN DIVERGENCE` if this set differs before review,
except for the reviewer-created `S10-grok-verdict.md`.

## Gold hashes and evidence

Core final-byte hashes:

| Path | SHA-256 |
| --- | --- |
| `migrations/0040_account_erasure.sql` | `6309d34d37f79b2ff616df5e054bc8634efa9c2ec3d9907e3bc94ef4a7012df6` |
| `packages/db/src/account-erasure.ts` | `4312de9ff7b7eaa6368a6ba722abd04db4c48f8de1fc83ba907c65fb48780689` |
| `packages/db/src/publication-lease.ts` | `30c803cfcae30dc107995fc8b0602cad304b5769ada87e4fb3a6b41ab50b2a13` |
| `apps/api/src/account-erasure.ts` | `17b0016ea355e468437bff1de8cfa983198c030a8ef3172040fd3b915d00119f` |
| `packages/evaluator/src/public-aggregate-provider.ts` | `180087f8dbd9e88b099e8fe0cc0f1f88de0716c06ecccd727f26884035db8fd3` |
| `packages/db/src/index.ts` | `8c1bf2dc3c86b3f22ac4e1898d7d6e0dc120e937ed0f245f2dbdf553faed1d1a` |
| `apps/api/src/registration.ts` | `b5792c394f211e94de16e8ef1ac95eadce6fd5243a2b6cd2e70db6d9fc05523e` |
| `tests/integration/s10-t9-account-erasure-races.test.ts` | `b00158b8bb19bda3f2544c0241c56ca69a524a5c8f3d27dbee06dd0cfb97bad3` |
| `tests/integration/s6-content-encryption-database.test.ts` | `42c998dfe76e4711aa37df90d266ceb7d4eaa0dcb603c26b8554b2b31f5fa7a9` |
| `tests/integration/s8-publication-database.test.ts` | `cebb144aee4d76e7993c97f1498d74a604a11e3d063e90a91e2924cf24af25d7` |
| `tests/integration/registration-database.test.ts` | `3347b54102b933624e72817ada41bdf2020f5667779347a0401a8eb146b40b2e` |
| `tests/architecture/s6-content-encryption-contract.test.ts` | `6ec02e44c130eaac25dfefc45b83aecd844ab41e9488dc235db2b707967a9944` |
| `tests/integration/identity-database.test.ts` | `aa7fef15010f6482635ca11492374ff7b1ba331e295a10a315a4030536db3bbb` |

Post-review custody recheck: a semantic-neutral staged correction removed
trailing whitespace at `packages/db/src/account-erasure.ts:67`, changing only
that file's SHA-256 from `138a48dbdfeb2c41e3ea5f38bdf93bf72abd149150aa2f5b578d474632d67b13`
to the gold hash above. The packet and complete manifest were regenerated
after the correction; the implementation, tests, evidence, and reviewer
verdict are otherwise unchanged.

Terminal and repair receipts:

| Evidence | Result | Path | SHA-256 |
| --- | --- | --- | --- |
| terminal full | 139/139 files, 400/400 suites, 1,345/1,345 tests | `/private/tmp/s10-third-full-final.json` | `a1546a4ec279185267a444cc62915fea1d0cf114fad5a9692d3a08156b476bef` |
| second full RED | 137/139 files, 1,343/1,345 tests | `/private/tmp/s10-second-full-final.json` | `b7e3bfbea4abd8211b172d4e63268c12743b18dffeacf335a16fbc2e2426a9c5` |
| second-full S6 repair | 5/5 | `/private/tmp/s10-second-full-repair-s6-arch.json` | `567f360a55389c7527f18c0628f08594b162463e31c37ff15d11d2e62dc0cee2` |
| second-full identity repair | 4/4 | `/private/tmp/s10-second-full-repair-identity-db.json` | `97a62ef04ec3b8e9b4b5a060328951be826301dad5282a4bc025c1668a5f78b6` |
| restored full architecture | 158/158 | `/private/tmp/s10-second-full-repair-architecture-full.json` | `2304a4ee6cad6df82f2e9a1da3c1884528346c13a9a060d2bcc8763a930b9243` |
| final handoff evidence architecture | 3/3 | `/private/tmp/s10-final-handoff-evidence-arch.json` | `04a43ea1b1f2a1b732ec2e3ef0a77951b2d321ecc028404dcb5368930251498c` |
| combined S6/S7/S8/T9 | 90/90 | `/private/tmp/s10-full-repair-s6-s7-s8-t9.json` | `d2dfe9b8ac18791a5ad01ba7224f21ba76cd3089d159f25135373ba6c4de6474` |
| complete registration | 66/66 | `/private/tmp/s3d-final-complete-registration-green.json` | `5ebab7d2da5fe9327185ccb923350b68ed3a1387cc6bd8fde1dfd43f62ee0795` |
| strict RSS evidence | 1/1 | `/private/tmp/s3d-rss-streaming-scalars.log` | `ec283dc86537cddedd5a71aa17eb9ca5aa023e2d73cfc50cd0950cb05e5772e4` |
| RSS coexistence | 6/6 | `/private/tmp/s3d-six-failures-streaming-scalars.json` | `043eda93403338f70f241413867832e1068d86757d098698cd00cbffc94d3966` |

The first-full eight-file completion receipts are:

- registration `5ebab7d2da5fe9327185ccb923350b68ed3a1387cc6bd8fde1dfd43f62ee0795`;
- session `/private/tmp/s10-full-repair-session-database.json`,
  `350c498c6f695fd34dcd5c7a0fa9d69df1cde476179633c3de5f3d11953051da`;
- database `/private/tmp/s10-full-repair-database.json`,
  `669c6a464f03f65cd44bb3f726b631457207c1e12bc96c171092fd75002046f6`;
- evaluator add-on `/private/tmp/s10-full-repair-evaluator-addon.json`,
  `c27ce1101fe9ac65c0c1186361d87bc60f133733bb50849d2abeda48c65b11ea`;
- evaluator consumer `/private/tmp/s10-full-repair-evaluator-consumer.json`,
  `4557ba637bddfaa9b0cd83f1ab269076e1675780a77d4b39d318384ad0c318b9`;
- evaluator database `/private/tmp/s10-full-repair-evaluator-database.json`,
  `4eba5f155a6f9a53cbbff6657e604b805f06c93d0e4a07a546413e327f296c73`;
- evaluator harvest `/private/tmp/s10-full-repair-evaluator-harvest.json`,
  `6b3cce8b78a75d7321d5da007e3f23c8219060f5f0410bce93f930126c54becb`; and
- acceptance ceremony `/private/tmp/s10-full-repair-acceptance-ceremony.json`,
  `200ada114699ba03d50e9d9632382fbb45957b4add87f925be5e0a26cf7447a2`.

Codex Security scan authority:

- scan ID `aaa31460-f883-4d6a-9cf3-67e9c629a8fd`;
- snapshot
  `codex-security-snapshot/v1:sha256:423a08ec843eb0aa6db67134842c8e9f5cdc572d732747e05ffd2d34aa02561e`;
- sealed report directory:
  `/private/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/codex-security-scans-533dYG/accounts-s10/ef12714cb5969da6fadb803ecacd53aed5e93bac_20260824T214905Z_e170pma9`;
- visible post-scan repair report:
  `artifacts/fix_report.md`, SHA-256
  `0198e67d6c41a4f2ffd5c2b61d6a8db9dc1419787c97341d299ea9ae3f59f44e`.

Read these mission artifacts in full:

- `logs/S10-erasure-evidence-artifact.md`;
- `logs/S10-erasure-runbook.md`;
- `logs/S10-carrier-derived-data-inventory.md`;
- `logs/S10-t9-lock-privilege-callsite-matrix.md`;
- `logs/S10-vr10-mutation-matrix.md`; and
- `logs/S10-vr10-execution-record.md`.

The current complete hash manifest is
`/private/tmp/s10-option-c-final-freeze.sha256`. It is mechanically regenerated
after this packet and excludes itself. Run `shasum -a 256 -c` from the
repository root; do not accept a partial match.

## Bounded reviewer commands

Run no heavy command concurrently. Start with read-only custody checks:

```sh
git status --short --untracked-files=all
shasum -a 256 -c /private/tmp/s10-option-c-final-freeze.sha256
git diff --check
```

Then use the smallest command that can confirm or refute a concrete concern:

```sh
pnpm vitest run tests/architecture/s10-erasure-evidence.test.ts tests/architecture/s10-carrier-erasure-red.test.ts tests/architecture/s6-content-encryption-contract.test.ts
pnpm vitest run tests/unit/s10-erasure-http.test.ts tests/unit/s10-erasure-ui.test.ts tests/unit/s10-erasure-ui-render.test.tsx tests/unit/s10-mail-channel.test.ts
pnpm vitest run tests/integration/s10-t9-account-erasure-races.test.ts
pnpm vitest run tests/integration/s6-content-encryption-database.test.ts
pnpm vitest run tests/integration/s8-publication-database.test.ts
pnpm vitest run tests/integration/session-database.test.ts
pnpm vitest run tests/integration/identity-database.test.ts
pnpm typecheck
pnpm lint
git diff --check
```

Real-PostgreSQL tests need host/loopback permission. The terminal full gate has
already passed; do not start another full suite merely to duplicate it. A
reviewer may run one only if a specific receipt-integrity concern cannot be
resolved from the JSON/hash and all lighter checks, and must record why.

Before verdict, rerun the custody checks, confirm no test/monitor process or
PTY remains, and ensure the only additional untracked file is the verdict.
