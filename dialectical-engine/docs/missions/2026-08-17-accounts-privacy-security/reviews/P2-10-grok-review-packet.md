# P2-10 Grok 4.6 review packet

## Requested verdict

Return exactly one of:

- `GREENLIGHT` — no P0/P1 issue in this bounded passkey-storage surface.
- `BLOCK` — at least one concrete P0/P1 issue, with file/line, attack or
  failure path, and the smallest structural repair.

Read files and receipts only. Do not edit files, run broad suites, or expand
this storage ticket into a WebAuthn registration/login ceremony, operator-role
issuance, account recovery, or UI.

## Ticket

`P2-10 · Add WebAuthn passkey credential storage`

Add origin/RP-bound credential records, user-verification/backup flags, device
labels, mutable counters, and actual-role grants without collecting biometrics
or attestation-vendor identity. Fresh/replay PostgreSQL tests; Grok review.

## Authority and scope boundary

- `../wave-2-target-architecture.md` requires password plus TOTP or passkey and
  recommends phishing-resistant MFA for privileged accounts where feasible.
- `../00-mission-charter.md` requires a TOTP-vs-WebAuthn comparison but does not
  falsely claim that WebAuthn is already the launch authentication path.
- `../IMPLEMENTATION-STATUS.md` explicitly deferred passkeys to Phase 2.
- P2-10 defines storage only. No new route, browser ceremony, challenge,
  assertion verification, operator session, or recovery bypass exists.

## Frozen review paths

- `migrations/0047_passkey_credential_storage.sql`
- `packages/db/src/schema.ts`
- `tests/integration/p2-passkey-storage.test.ts`
- `tests/integration/identity-database.test.ts`
- `tests/architecture/s4-mfa-contract.test.ts`
- `../IMPLEMENTATION-STATUS.md`

The user-requested retrospective ledger is process evidence, not part of the
product verdict.

## Intended boundary

- The existing `identity.mfa_factor` table remains the sole MFA-factor carrier;
  this migration does not create a parallel identity model.
- A passkey row binds an opaque base64url credential ID, an exact two-field
  `{format:"COSE_KEY_BASE64URL_V1",value}` public-key object, a canonical
  lowercase RP ID, and an exact HTTPS origin for that RP (optional valid port,
  no path/query/fragment/userinfo).
- The row records user-verification-required, backup-eligible, and current
  backup-state flags. Backup state cannot be true when eligibility is false.
- The WebAuthn signature counter is bounded to the unsigned 32-bit domain and
  can only stay equal or increase. RP/origin/credential/public-key/UV/
  eligibility bindings are immutable after insertion.
- The device label is an exact five-field AEAD envelope whose key ID is bound
  to `passkey-label:<factorId>:v1`. No plaintext label field exists.
- The relation contains no AAGUID, attestation statement, authenticator/vendor
  identity, biometric, face, or fingerprint column.
- TOTP rows must keep every new passkey-only field NULL. Existing TOTP
  enrollment/login behavior remains unchanged.
- No direct application write grant is introduced. Runtime and the
  authorization principal that intentionally inherits runtime retain their
  pre-existing table read access; the isolated erasure principal cannot read.
  Runtime, authorization, and erasure actual LOGINs all fail direct
  UPDATE/DELETE/TRUNCATE with SQLSTATE `42501`.
- There is deliberately no write/update capability yet: a later WebAuthn
  ceremony ticket must add narrowly scoped challenge-bound capabilities rather
  than letting this storage migration invent caller-authoritative writes.

## Reproduce-first and restored evidence

- Initial focused PostgreSQL RED: `3/3` failed because all seven columns and
  migration `0047` were absent.
- First implementation GREEN attempt failed before tests because the migration
  used nonexistent PostgreSQL function `jsonb_object_length`. It was replaced
  with exact JSON-object equality, strengthening the no-extra-field rule.
- The next run exposed one test-model error: authorization inherits runtime and
  therefore intentionally retained the existing SELECT grant. The actual-role
  expectation was corrected without changing production ACLs.
- Restored fresh/replay/actual-LOGIN passkey gate: `3/3` GREEN.
- Adjacent passkey + identity + Phase-1 MFA compatibility gate: `11/11` GREEN.
- Root typecheck and `git diff --check`: GREEN.

## One-at-a-time mutation evidence

Each effective mutation was RED and exact-restored:

1. Permit an HTTP origin alongside HTTPS → the negative insert resolves and
   the exact assertion fails.
2. Disable signature-counter rollback rejection → `1 → 0` resolves and the
   SQLSTATE `55000` assertion fails.
3. Replace exact public-key equality with required-key subset matching → a
   caller-supplied `vendor` field persists and the poison assertion fails.

The first origin mutant permitted only `http://localhost` while the test used
`http://localhost:3000`, so it stayed GREEN. That attempt is explicitly
classified as vacuous. The test was strengthened with both no-port and port
HTTP cases before the same invariant produced the required RED.

Restored SHA-256 values:

- migration: `8cadeffc3a1a161ba1a4606bb368ea8952b726b1ae8381a864fb9da3d49b1210`
- DB schema: `27666b9e7fb49c60a61e6369bdedd9dfcf7daf17332693dec7556270077692fd`
- PostgreSQL test: `551cec65611582cf391ee3ffb9aca23cb5900fb48d9c8458ef0d0b50b81b95ef`

## Review questions

1. Can a stored credential escape its exact RP or HTTPS origin, carry extra
   identity/vendor metadata, use a plaintext label, or cross-bind a label?
2. Can a signature counter decrease, overflow the WebAuthn unsigned domain, or
   mutate a credential binding after enrollment?
3. Does the migration preserve existing TOTP rows and replay safely with valid
   passkey rows already present?
4. Does any application principal gain a new direct write path, or does the
   actual-role test misrepresent the intentional runtime/authorization read
   inheritance?
5. Does any code claim that WebAuthn ceremony or operator enforcement exists
   when this ticket only establishes storage?

## Honest residuals / later tickets

- No passkey can be enrolled or used yet. Challenge generation, WebAuthn
  verification, counter update capability, revocation UX, and operator
  enforcement are later tickets.
- Device labels are presently immutable. A later authenticated rename feature
  would need an exact user/session-derived re-encryption capability rather than
  direct table UPDATE.
- Existing runtime read access to `mfa_factor` predates P2-10 and is used by the
  current TOTP repositories. The new label is encrypted and the credential ID
  and public key are opaque/public credential material, but a future ceremony
  should prefer narrow security-definer reads instead of broadening access.
- This ticket does not collect or infer biometrics and does not persist
  authenticator attestation/vendor identity. It makes no biometric or device
  assurance claim.
- Phase 2 and operator passkey enforcement remain `✗` until a reviewed
  end-to-end ceremony and role/session policy exist.

## Review-attempt status

The single bounded Grok 4.6 invocation returned HTTP `402 Payment Required`
(`Grok Build usage balance exhausted`) immediately after local plugin
discovery. It read no repository file and emitted no verdict. P2-10 is
therefore capability-blocked pending reviewer availability; this packet must
not be interpreted as self-approval.
