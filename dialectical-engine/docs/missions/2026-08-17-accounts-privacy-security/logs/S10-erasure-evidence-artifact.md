# S10 account and private-debate erasure evidence artifact

Status: reproducible technical evidence for the Phase-1 implementation. This is not a certificate, a representation of universal data deletion, or a legal conclusion. It makes no finding that crypto-shredding satisfies a particular legal duty; counsel must evaluate the stated scope and residuals.

## Outcome vocabulary

`CLEANED` is permitted only for an encrypted-only account/run after the database and external-store evidence agree. It means the in-scope identity rows were deleted, the required private keys are durably absent, a fresh process cannot decrypt the retained private carrier rows, and the immutable audit chain still verifies. It is not a physical-media, third-party, anonymity, or legal-compliance result.

`CLEANED_WITH_LEGACY_RESIDUAL` is the only account completion result when claimed legacy plaintext exists. It must never be presented as fully cleaned private content. A private-debate request over claimed legacy plaintext returns the typed legacy-retained conflict and does not manufacture a key-destruction receipt.

`PENDING`/`CONTENDED` means no completion claim is allowed. Examples include an active content/notification lease, a live provision intent, an unacknowledged notification, an unresolved publication-key cleanup, an ambiguous external-store operation, or evidence counts that do not match the locked manifest.

Current published snapshots remain readable under the publication/corpus key domain. Account deletion removes the mutable identity binding but preserves the snapshot, visibility event, publication audit row, and retired pseudonym. A current public snapshot is therefore outside the private-content `CLEANED` claim. Every historical non-current snapshot must instead have a completed claim-bound cleanup and fresh durable publication-key absence.

The migration and forward guards reject an owner graph containing both publication history and claimed legacy plaintext. The forbidden mixed public and claimed legacy plaintext graph would join a public retired pseudonym through `owner_ref` to private legacy text. No completion artifact relies on that join being harmless.

## Evidence emitted and checked

| Evidence | Required interpretation | Reproducible witness |
| --- | --- | --- |
| Prepared account manifest | Complete locked inventory of owned encrypted runs, legacy residuals, current publication refs, every publication snapshot, cleanup state, and provision intents | `identity.prepare_account_erasure` and the forced transition/erasure races in `tests/integration/s10-t9-account-erasure-races.test.ts` |
| External key result | Literal `DESTROYED` or `ALREADY_ABSENT`, parent-directory fsync, independent absence readback, and fresh-store probe; ambiguity remains pending | File-store fault/crash cases in `tests/unit/s6-content-encryption.test.ts` and the nonzero/mixed-count account receipts in `tests/integration/s6-content-encryption-database.test.ts` |
| Honest counts | Destroyed and already-absent counts are separate; their partition equals the locked encrypted-run/user-DEK manifest | `identity.finalize_account_erasure` constraints and the account/private database receipts |
| Identity deletion | `identity.user` and its account-local children, ref bindings, sessions, notification outbox, and decrypting/user-linked secrets are absent | account completion and actual-role tests in `tests/integration/s6-content-encryption-database.test.ts` |
| Retained rows | Immutable private carrier rows remain, but all fourteen private envelope groups fail fresh-process decrypt after key removal | `round-trips every physical carrier and shreds all fourteen logical groups while rows persist` |
| Public control | Current public content still decrypts through `PublicationCipher`, without a private run key or identity binding | S8 public database tests and the public aggregate evaluator post-account-delete receipt |
| Audit integrity | Erasure/publication domain functions use the trusted single-head appender; the retained chain verifies; the erasure event uses constant event-local source context and contains no copied request/header identity | audit/erasure assertions in S6 and session database tests |
| Post-delete expansion | Event-local publication/private correlations cannot expand to user/session/email/audit token/private plaintext/key or another same-user event after mutable binding deletion | relational attack queries in S6 publication/private severance receipts |
| Notification mitigation | A non-revoked `email` or `recovery_email` is required; schedule/cancel/completion rows are encrypted-address references; every user-wide row is ACKed before shred while the cross-process plaintext lease is free | notification retry, prior-cancelled-request, ACK-response hold, and backend-crash receipts |
| Destructive request truth | Schedule returns its DB-clock status/execute time and opaque generation-bound cancellation reference atomically; cancel replay cannot select a later request; the exact suspended scheduling session can read only `PROCESSING` | S6 ambiguous-COMMIT/cross-generation/status-auth receipts and S10 HTTP tests |
| Private route/UI opacity | Locked foreign, unlocked foreign, and absent run IDs have the same pre-authorized opaque outcome; once private deletion is pending or cleaned, no already-decrypted page state remains mounted | S6 two-pool private classification receipt and duplicate rendered UI sentinel tests |

## Reproduction

Run from the repository root against disposable PostgreSQL. The commands are intentionally focused; they do not silently stand for a full-suite result.

```text
pnpm vitest run tests/unit/s10-erasure-http.test.ts tests/unit/s10-erasure-ui.test.ts tests/unit/s10-erasure-ui-render.test.tsx tests/unit/s10-mail-channel.test.ts
pnpm vitest run tests/architecture/s10-carrier-erasure-red.test.ts tests/architecture/s10-erasure-evidence.test.ts
pnpm vitest run tests/integration/s10-t9-account-erasure-races.test.ts
pnpm vitest run tests/integration/s6-content-encryption-database.test.ts
pnpm vitest run tests/integration/s8-publication-database.test.ts
pnpm vitest run tests/integration/session-database.test.ts
pnpm typecheck
git diff --check
```

For each destructive run, retain the test command, exit status, database version/time zone, hashes of `migrations/0040_account_erasure.sql`, `packages/db/src/account-erasure.ts`, `apps/api/src/account-erasure.ts`, and the relevant test files. Do not reuse a receipt after those bytes change.

## Explicit residuals and excluded claims

- **Legacy plaintext.** Claimed legacy plaintext is a named residual. `CLEANED_WITH_LEGACY_RESIDUAL` is not upgraded to `CLEANED`, and the no-mixed-public/legacy invariant prevents a retained public author grouping from reaching it.
- **T6 historical audit rows.** The [T6 legacy audit erasure residual disposition](../reviews/T6-legacy-audit-residual-disposition.md) rules the pre-0032 `NOT VALID` violations outside the forward S10 severance proof. Migration 0043 exposes only an owner-readable count summary; this artifact does not erase or reclassify those bytes.
- **Ordinary audit correlation.** Historical ordinary audit rows can retain a stable source-IP or user-agent digest and may be mutually correlatable. Forward publication/private/account-erasure audit source context is constant or event-local and does not copy those values. This is not a repo-wide unlinkability statement.
- **Event-local public/private correlation.** A database controller can correlate one visibility/snapshot with its publication audit, or one private tombstone with its deletion audit, using precise time, transaction `xmin`, and the non-identity ref registry. This accepted event-local C4 correlation remains. Deletion severs person and cross-event expansion; it does not make the event anonymous.
- **Public author grouping.** The retired pseudonym and public `owner_ref` grouping are intentionally retained public C4 metadata for encrypted-only authors after the identity/audit/key/private-content joins are severed. There is no anonymity claim.
- **Public and third-party copies.** Published snapshots remain readable. Downloaded, quoted, cached, indexed, or provider-retained public copies may persist. Private model-provider retention/deletion is not proved by this database/key-store artifact either.
- **Backups and database history.** PostgreSQL WAL, replicas, PITR archives, filesystem snapshots, backup media, and a backup copy of the non-decrypting envelope-attestation secret are not erased by this ceremony. Confidentiality of retained encrypted rows relies on deletion of the decrypting keys from the separately governed key stores; backup restoration procedures must preserve key tombstones.
- **Process and host memory.** The session advisory leases linearize cooperating readers and erasure, and application buffers are zeroized in `finally`, but this is no proof about RAM remnants, swap, hibernation, a core dump, hypervisor snapshots, or a hostile process/host administrator.
- **Notification delivery.** Sendmail ACK proves the configured transport accepted the stable opaque message ID. Ambiguous send completion can cause an idempotent resend. It does not prove human receipt or deletion by downstream mail systems.
- **Controller viewpoint.** The implementation makes no anonymous-data conclusion from pseudonymisation or key destruction. An operator may retain other lawful records outside this repository's declared scope.

This artifact supports engineering review and counsel evidence gathering. It makes no anonymity claim and no legal conclusion.

## Final restored verification disposition

The final engineering candidate passed the one terminal authorized full gate:
`/private/tmp/s10-third-full-final.json`, SHA-256
`a1546a4ec279185267a444cc62915fea1d0cf114fad5a9692d3a08156b476bef`.
The receipt records 139/139 files, 400/400 Vitest suites, and 1,345/1,345 tests
passing, with zero failures, pending tests, todo tests, or snapshot changes in
2,146.927 seconds. The process, its monitor, and every owned PTY were closed
after exit.

That GREEN does not conceal the preceding RED history. The first full gate
exposed genuine denial-path, timing, and evaluator-boundary defects together
with stale fixtures across eight files; each owning file was repaired and
rerun completely. The second full gate completed 137/139 files and
1,343/1,345 tests and failed only the stale S6 shared-lease architecture
sentinel and pre-S10 identity-table inventory. Its durable RED receipt is
`/private/tmp/s10-second-full-final.json`, SHA-256
`b7e3bfbea4abd8211b172d4e63268c12743b18dffeacf335a16fbc2e2426a9c5`.
Both tests were corrected without changing production and passed completely
before the terminal full run.

The terminal run emitted three pg@9 deprecation warnings for overlapping
`client.query()` use. They are a compatibility follow-up, not a failed S10
assertion and not a reason to broaden the deletion, confidentiality, or
anonymity claims in this artifact.
