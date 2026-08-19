> ## ⚠ AMENDED 2026-08-19 — read this first
> This document was adversarially reviewed by a blind research seat and **took damage**. Corrections are in [`AMENDMENTS.md`](AMENDMENTS.md); the reasoning is in [`RESEARCH-CONCLUSIONS.md`](RESEARCH-CONCLUSIONS.md) and `research/RA|RB|RC`.
> **Where the original text below conflicts with an amendment, the amendment wins.** No V ruling changed.

# Wave 3 — Phase 1 Implementation Roadmap

**Mission:** Individual Accounts, Privacy-by-Design, and Secure Operations
**Basis:** `wave-1-current-state.md` (evidence) · `wave-2-target-architecture.md` (design) · `2026-08-17-mfa-recovery-requirements/RESEARCH-REPORT.md` (MFA/recovery requirements)
**Produced:** 2026-08-18 · **Risk tier:** high · **Planning tier:** 2

> Detailed vertical slices are written **only for Phase 1** (charter §5). Later phases get a short charter: goal, risk, dependencies, and why they wait. Every "likely file" below is evidenced in this tree; **no path is invented**.

---

## 0. ⚠ The sequencing problem this plan discovered

**The charter's phase order puts encryption in Phase 3. That is not survivable, and here is the proof.**

The crypto-shredding design (Wave 2 §9.2) requires user content to be **encrypted at the moment of first write**. Wave 1 established that 77 of 79 tables carry `core.reject_mutation()`, which raises on **UPDATE and DELETE** (`migrations/0000_s00.sql:31-39`).

Therefore: **any user content written in plaintext into an append-only table can never afterwards be encrypted.** There is no UPDATE to rewrite it with, and no DELETE to remove it. It is plaintext forever, in a system that has promised erasure.

Three ways out, in order of preference:

1. **Move encryption into Phase 1** (this plan's recommendation) — the key foundation ships before the first real account, so no plaintext user content is ever created under the new regime. Cost: Phase 1 grows by one slice.
2. **Accept that all Phase-1-era content is permanently unerasable** and tell those users so. Unacceptable for a launch that promises deletion.
3. **Grant a one-time migration exception** to the immutability triggers — re-encrypt in place, then re-arm. Technically possible (DR-187's re-baseline is precedent), but it means the first thing the new security regime does is disable the security regime.

**Recommendation: option 1.** It is also why MFA moves up (§0.1): both changes are "do it before there are users", and that window closes permanently the first time someone registers.

### 0.1 Recommended phase-order amendment

| Charter order | Recommended | Why |
|---|---|---|
| Phase 1: identities, sessions, ownership, visibility, token migration | **+ key foundation, + content encryption, + MFA enrolment** | Encryption cannot be retrofitted into append-only tables (§0). MFA is mandatory-before-usable by V's ruling, and the research's own finding is that **zero users today is the only free window** for mandatory MFA — it never reopens |
| Phase 2: MFA, recovery, admin identities, RBAC, object-level authz | **Recovery ladder, risk engine, operator passkey, role growth** | The recovery ladder is large and can follow a working front door; basic object-level authz moves into Phase 1 because ownership is meaningless without it |
| Phase 3: DB hardening, encryption/keys, audit, secrets, backups | **DB role activation, TRUNCATE guard, pgaudit, backup/restore drills** (encryption already landed) | Still Phase 3, minus the part that had to move |

Phases 4–7 are unchanged.

---

## 21. Phased roadmap

### Phase 1 — The front door *(this document; ten slices)*
Individual identities with mandatory MFA, real revocable sessions, content encryption at write, ownership and deny-by-default authorization, private/public visibility, migration off the dev token, and account deletion by key destruction.
**Exit condition:** a person can register, enrol a factor, sign in, own private debates, publish deliberately, delete their account and have the private content become cryptographically unreadable — with every step audited and the dev token gone.

### Phase 2 — Recovery and roles *(charter)*
**Goal:** the tiered recovery ladder (§10.3 of Wave 2), the in-house risk/signals engine, operator passkey enforcement, capability degradation after weak recovery, and the role growth path.
**Risk addressed:** recovery is the weakest authentication path in any system; building it hastily is how accounts get stolen.
**Depends on:** Phase 1 factors and audit trail. **Waits because:** a recovery ladder with nothing to recover is unbuildable, and the freeze/notify mechanics need real channel plumbing first.

### Phase 3 — Database hardening *(charter)*
**Goal:** activate the `NOLOGIN` least-privilege roles, per-service credentials in the secret store, `scram-sha-256`, `BEFORE TRUNCATE` guards, `log_connections` + pgaudit, encrypted backups with quarterly restore drills.
**Risk:** the app connects as bootstrap superuser today, which can disable every immutability trigger in two statements.
**Waits because:** it is deployment-shaped work that lands with the Hetzner move, and Phase 1 must not be blocked on hosting.

### Phase 4 — LLM containment extension *(charter)*
**Goal:** Wave 2 §14 — env allowlist, grok `--sandbox`, escape the `[role]` argv flattening, SIGKILL escalation, relay authentication, input caps, exact-argv pins for all three vendors, acceptance suite in the default test run.
**Risk:** a model subprocess currently sees `DATABASE_URL` and `SSH_AUTH_SOCK`.
**May start in parallel with Phase 2** — it touches `acceptance/` only and shares no files with the identity work.

### Phase 5 — Privacy centre and DSAR *(charter)*
**Goal:** user-facing data view, export, correction, restriction/objection, operator DSAR runbook with deadline tracking, shred evidence.
**Waits because:** the charter's design-order constraint — visibility and deletion semantics (Phase 1) must exist before erasure workflows are specified, or the privacy centre gets rewritten.

### Phase 6 — Public participation *(charter)*
**Goal:** moderation, reporting, blocking, abuse controls, appeals, public-content deletion semantics.
**Waits because:** V ruled private-hosted-first; this is the "public later" half.

### Phase 7 — Assurance *(charter)*
**Goal:** CI with secret scanning and dependency/SAST checks, own-product penetration testing (V's authorization, V's product only), incident exercises, counsel review, production-readiness review.
**Note:** CI + secret scanning is cheap and would have caught the Wave 1 datadir exposure — **recommend pulling secret scanning forward into Phase 1** as a two-hour task.

---

## Phase 1 slices

Ordered by dependency. Sizes are **relative** (S/M/L), never calendar promises.

---

### P1-S1 · Key foundation
**Goal:** a KEK in the secret store and a wrap/unwrap library, so nothing else can accidentally write plaintext.
**Risk addressed:** §0 — encryption cannot be retrofitted.

- **Components / likely files:** new `packages/crypto/` (following the existing package shape of `packages/kernel`, `packages/register`); `packages/register/src/runtime-environment.ts` (new `KEK_PATH` env var, strict schema); `acceptance/main.ts` and `apps/api/src/main.ts` (wire-up).
- **Schema/migration:** none.
- **API/UI:** none.
- **Dependencies:** none — this is the root.
- **Failure/rollback:** if the KEK cannot be loaded, the service **refuses to boot** with a typed error (matching the existing `*_UNRESOLVED` idiom). Rollback = revert the package; nothing persisted yet.
- **Tests:** unit — wrap/unwrap round-trip, tamper detection, wrong-KEK rejection; **negative** — refuses to boot without a KEK; **architecture** — `tests/architecture/scaffold.test.ts` already enforces "no `process.env` outside `runtime-environment.ts`", so the new var must go through it.
- **Acceptance:** a value encrypted with DEK-A cannot be read with DEK-B; destroying a wrapped DEK makes its ciphertext permanently unreadable (proven, not asserted).
- **Evidence produced:** key-generation audit event (§P1-S2).
- **Observability:** key ids and operations logged; **never key material**.
- **Open:** KEK escrow procedure is V's (Wave 2 R3). **Size: M**

---

### P1-S2 · Identity schema + tamper-evident audit trail
**Goal:** the `identity` schema and the hash-chained audit table everything else writes to.

- **Likely files:** new `migrations/0030_identity_foundation.sql`; `packages/db/src/schema.ts` (extend — note Wave 1 G0: **`schema.ts` mirrors only 63 of 79 tables; migrations are authoritative**); `packages/db/src/index.ts`.
- **Schema:** `identity.user` (id, email_blind_index, email_ciphertext, recovery_email_ciphertext, password_hash, pseudonym, state, created_at, adult_affirmed_at) · `identity.user_data_key` (**mutable — the shred point**) · `identity.session` · `identity.mfa_factor` · `identity.recovery_code` · `identity.audit_event` (append-only, hash-chained) · `identity.channel_binding`.
- **Immutability:** attach `core.reject_mutation()` to `audit_event`; **deliberately NOT** to `user_data_key` (it must be deletable) or `session` (revocable). Document why in the migration header — the next reader will otherwise "fix" the omission.
- **Dependencies:** S1.
- **Failure/rollback:** additive migration only (DR-188). Rollback = leave the tables unused; nothing else references them yet.
- **Tests:** integration against real Postgres — append-only rejection on `audit_event` (mirroring `tests/integration/database.test.ts:1275`), hash-chain continuity, chain-break detection, `user_data_key` **is** deletable.
- **Acceptance:** deleting an audit row raises SQLSTATE `55000`; a tampered row is detectable by chain verification.
- **Open:** audit retention period (Wave 2 §19 proposes 24 months). **Size: M**

---

### P1-S3 · Registration, verification, pseudonym
**Goal:** a person can create an account.

- **Likely files:** `apps/api/src/index.ts` (new routes); `packages/contract/src/index.ts` (new schemas — and **update `contractInventory`, which Wave 1 found declares 12 of 15 live routes**); new mail-channel module; `apps/ui/app/` (new register page); `apps/ui/lib/api.ts`.
- **Routes:** `POST /v1/auth/register`, `POST /v1/auth/verify-email`, `POST /v1/auth/resend-verification`.
- **Behaviour:** argon2id (memory-hard); **no composition rules, no forced rotation**; breached-password screening; email + recovery email both verified, 24-hour links; system-generated pseudonym; 18+ affirmation recorded; DEK created at registration (S1); **account unusable until MFA enrolled** (S4).
- **Enumeration resistance:** identical response and timing whether or not the address exists — the notification differs, not the response.
- **Dependencies:** S1, S2.
- **Failure/rollback:** registration is transactional (user + DEK + audit in one transaction); a failed mail send leaves the account in `pending_verification`, resendable.
- **Tests:** unit — password hashing params, breach screening, pseudonym uniqueness; integration — full registration flow, duplicate email, expired link; **security** — enumeration timing, rate limiting, verification-token entropy and single use.
- **Acceptance:** two registrations with the same email are indistinguishable to the caller; no plaintext email in logs; audit events for every step.
- **Open:** mail relay choice (Wave 2 §12.6 — Brevo/Resend/SES; self-hosted SMTP not recommended). **Size: L**

---

### P1-S4 · MFA enrolment (TOTP + recovery codes; passkey optional)
**Goal:** the second factor, mandatory before the account is usable.

- **Likely files:** `apps/api/src/index.ts`; new `packages/crypto/` TOTP helpers; `packages/register/src/index.ts` (new `mfaPolicy` row reader); `apps/ui/app/` enrolment screens.
- **Routes:** `POST /v1/auth/mfa/totp/begin` · `/verify` · `POST /v1/auth/mfa/recovery-codes/generate` · `POST /v1/auth/mfa/passkey/begin` · `/verify`.
- **Behaviour:** TOTP pinned to **SHA-1 / 6 digits / 30 s / 160-bit secret with no options** (this is what makes "any authenticator app" work); **seed encrypted under the user DEK**; enrolment confirmed by a successful code **before** activation; 10 single-use recovery codes shown once, **stored only as argon2id hashes**; passkey offered and **required for operator accounts**.
- **Dependencies:** S1, S2, S3.
- **Failure/rollback:** enrolment is atomic — an unconfirmed factor never activates. Rollback = feature flag the enrolment routes off; existing accounts keep working.
- **Tests:** unit — TOTP vector conformance (RFC 6238 test vectors), drift window, replay rejection; integration — enrolment, recovery-code single use, seed encrypted at rest; **security** — brute-force lockout on verification, seed never in a response body or log.
- **Acceptance:** a stock authenticator app (any) produces accepted codes; a used recovery code is refused; the DB contains **no plaintext seed**.
- **Open:** whether passkeys become mandatory for users too (Wave 2 §10.1 offers it). **Size: L**

---

### P1-S5 · Sessions, cookies, CSRF, security headers
**Goal:** replace `asker_id = sha256(any string)` with real, revocable sessions.

- **Likely files:** `apps/api/src/index.ts` (**replace `resolveSession` at `:113-123`** — the any-string function); `packages/contract/src/index.ts` (`SessionSchema` — **flip `provisional_identity_model` off**); `packages/contract/src/client.ts` (`:91`, `:136` — stop sending the dev-token header); `apps/ui/lib/api.ts` (**remove localStorage + JS cookie at `:105-111`**); `apps/ui/lib/serverApi.ts`; `apps/ui/components/AuthGate.tsx`; `apps/ui/next.config.mjs` (**add `headers()` — Wave 1 found none**); `apps/ui/app/api/[...path]/route.ts` (**stop forwarding `Cookie` upstream — Wave 1's undesigned second channel**).
- **Routes:** `POST /v1/auth/login` (password → MFA challenge → session), `POST /v1/auth/logout`, `GET /v1/auth/sessions`, `DELETE /v1/auth/sessions/:id`, `POST /v1/auth/step-up`.
- **Behaviour:** opaque 256-bit token **stored hashed**; `HttpOnly; Secure; SameSite=Lax` **server-set** cookie; 14-day idle / 90-day absolute; anti-CSRF token on state-changing routes + strict `Origin` check; step-up re-auth for sensitive actions regardless of session age; CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **⚠ Critical dependency note:** Wave 1 found CSRF is currently immune **by accident** — because auth is a custom header that cross-site requests cannot attach. **Moving to cookies destroys that immunity.** CSRF defence must land in the *same slice*, not a later one.
- **Dependencies:** S2, S3, S4.
- **Failure/rollback:** ships behind a dual-auth window (S9) so the dev token still works until migration completes. Rollback = disable cookie auth, keep header auth.
- **Tests:** unit — cookie flags, token entropy, hashing; integration — login/logout/revoke, idle and absolute expiry, step-up enforcement; **security** — CSRF rejected without token, cross-origin rejected, revoked session immediately dead, headers present on every response; **regression** — `tests/unit/api.test.ts:557-561` (which currently **asserts any string is valid**) must be inverted.
- **Acceptance:** a revoked session cannot make one further request; no token is readable by JavaScript; every response carries the headers.
- **Open:** none. **Size: L**

---

### P1-S6 · Content encryption at write
**Goal:** every new user-content write is ciphertext — the foundation of erasure.

- **Likely files:** `packages/db/src/index.ts` (run creation — `question_line`); `apps/runner/src/index.ts` (node claims, restatements, composed segments); `packages/ledger/src/index.ts` (`:211-221`, `raw_artifact.raw_text`); `packages/memory/src/index.ts` (`:282-286` canonical question, `:422` pull snapshot); `packages/serve/src/index.ts` (projections must decrypt); `packages/judgement/src/index.ts` (review reasons).
- **Coverage (from Wave 1's nine-location map):** `core.run.question_line` + `ask_contract` · `core.node.claim_text` · `core.stranger_restatement.restatement_text` · `ledger.raw_artifact.raw_text` · `serve.composed_text.segments` · `serve.fact_bundle` · `ledger.node_review.reasons` · `memory.question_key.canonical_question_text` · `memory.pull_record.payload_snapshot` · `core.investigation_request.user_input` · `evidence.*` query/excerpt columns.
- **Schema:** additive companion columns or an envelope wrapper; **no destructive change** (DR-188).
- **Dependencies:** S1, S3.
- **Failure/rollback:** **this is the least reversible slice** — content written encrypted stays encrypted. Rollback within a deployment window is possible only while the KEK exists. Ship it behind a flag, verify decrypt-on-read in staging first, then enable.
- **Tests:** unit — every carrier round-trips; integration — a full debate runs end-to-end with encryption on and reads back identically; **the shred test**: destroy a user's wrapped DEK and assert every one of the eleven carriers is unreadable while the rows still exist; **negative** — a plaintext write to any covered column fails a guard test.
- **Acceptance:** `strings` on the datadir yields **no debate content** (today it does — Wave 1 §7); a shredded user's content is irrecoverable while their rows persist; `pnpm test` + acceptance ceremony still green.
- **Evidence produced:** the shred test **is** the Art. 17 evidence artifact (§24 counsel item 1).
- **Open:** whether published-content re-keying happens here or in S8. Recommend **S8**, at the publish moment. **Size: L**

---

### P1-S7 · Ownership and deny-by-default authorization
**Goal:** every resource has an owner, and no route is reachable without a declared policy.

- **Likely files:** `apps/api/src/index.ts` (shared `preHandler` replacing 15 inline checks); `packages/db/src/schema.ts` + new migration (`core.run.owner_user_id`); `packages/serve/src/index.ts` (`:1340`, `:1584-1603`, `:1647`, `:1692`, `:1770`, `:1808-1819` — ownership filters); `packages/memory/src/index.ts:489`; `packages/contract/src/index.ts` (**`caller_scope` must come from the session, not `AskRequestSchema:117`** — Wave 1's privilege-confusion seam).
- **Behaviour:** deny-by-default (a route with no policy refuses); `operator` role gates `/v1/deployment` and both dev-evaluator routes (**Wave 1 found all three unscoped**); `decision_owner`/`action_owner` **removed from the ask** (V's ruling).
- **Dependencies:** S3, S5.
- **Failure/rollback:** existing runs get `owner_user_id = NULL` and remain reachable via the dev token until S9 completes.
- **Tests:** **one IDOR/BOLA test per owned route** — Wave 1 found coverage generalised by shared SQL rather than asserted per route; unit — the preHandler refuses undeclared routes; integration — foreign user gets 404 (extending `tests/integration/database.test.ts:617-651`); **security** — `caller_scope: "OPERATOR"` in a request body does **not** grant operator anything.
- **Acceptance:** every route appears in the policy table and in `contractInventory`; adding a route without a policy **fails a test**.
- **Open:** none. **Size: M**

---

### P1-S8 · Visibility: private by default, deliberate publishing
**Goal:** V's Q4 ruling in code.

- **Likely files:** new migration (`core.run.visibility`); `apps/api/src/index.ts`; `packages/serve/src/index.ts` (public read path); `apps/ui/app/debate/[id]/` (publish control + warning); `apps/ui/app/page.tsx` (list splits into "mine" and "published").
- **Behaviour:** new debates private; publishing needs affirmative action + step-up + a plain warning about public readability and indexing; **at publication, content is re-keyed to the corpus key** (Wave 2 §15) so it survives account deletion; unpublish returns it to private but **does not un-publish copies already taken**, and says so.
- **Dependencies:** S6, S7.
- **Failure/rollback:** existing runs default to **private** (safe direction). Rollback = hide the publish control; nothing becomes public by accident.
- **Tests:** integration — anonymous can read published, cannot read private; publish requires step-up; **the key test**: after publication, content survives the author's account deletion; unit — default visibility is private on every creation path.
- **Acceptance:** no debate becomes public without an explicit act; the anonymous read path leaks no `asker_id`, no internal ids, and no unpublished content.
- **Open:** unpublish-then-delete semantics (Wave 2 §15, counsel item 2). **Size: M**

---

### P1-S9 · Migration off the dev token
**Goal:** retire `x-user-dev-token` without stranding existing debates.

- **Likely files:** `apps/api/src/index.ts`; `packages/contract/src/client.ts`; `apps/ui/lib/api.ts`, `apps/ui/components/AuthGate.tsx`; `acceptance/run-acceptance.ts` (**`:27`, `:72` — the harness passes `--token` in argv**); `tests/unit/api.test.ts`; `acceptance/ceremony.test.ts:475-480`.
- **Behaviour:** three stages — (1) **dual-auth window**: both cookie sessions and the dev token work; (2) **claim path**: an authenticated user who proves knowledge of an old token binds those runs (`asker_id` → `owner_user_id`), audited; (3) **removal**: the header is refused, `resolveSession` is deleted.
- **⚠ Acceptance-harness note:** the ceremony authenticates by argv token. It needs a **service credential** — not a resurrection of any-string auth. Otherwise the boot ceremony breaks the moment the header dies.
- **Dependencies:** S5, S7.
- **Failure/rollback:** each stage is independently revertible; stage 3 is the point of no return and should follow a confirmed claim window.
- **Tests:** integration — dual-auth accepts both, claim binds exactly the right runs and nothing else, post-removal the header is refused; **regression** — the acceptance ceremony passes under the new credential.
- **Acceptance:** `grep -r "x-user-dev-token"` returns only historical documentation; every pre-existing debate is either claimed or explicitly orphaned; no run changes owner twice.
- **Open:** what happens to unclaimed legacy runs — orphan, or assign to the operator? **Recommend operator-owned and private.** **Size: M**

---

### P1-S10 · Account deletion and shredding
**Goal:** the promise made in Wave 2 becomes executable.

- **Likely files:** `apps/api/src/index.ts`; new `packages/crypto/` shred operation; `packages/serve/src/index.ts` (shredded content renders as a tombstone, not a crash); `apps/ui/app/settings/` (delete flow).
- **Routes:** `DELETE /v1/account` (step-up + confirmation + cooling-off), `DELETE /v1/debates/:id` (private only, owner, step-up).
- **Behaviour:** delete the wrapped DEK; retain rows; sever the pseudonym mapping; published debates persist under the corpus key with a retired pseudonym; **audit records what was shredded and when, without duplicating the personal data**.
- **Dependencies:** S6, S8.
- **Failure/rollback:** **irreversible by design** — that is the feature. Mitigations: cooling-off period, explicit typed confirmation, notification to every bound channel, and a documented (short) grace window before the key is actually destroyed.
- **Tests:** integration — after deletion every carrier is unreadable, rows still exist, published debates still render, the pseudonym no longer resolves; **negative** — a deleted account cannot log in and cannot be recovered; **audit** — a shred event exists with no personal data in it.
- **Acceptance:** **the Art. 17 evidence artifact**: a reproducible test showing personal content is irrecoverable while DR-188's rows remain intact.
- **Open:** grace-window duration; whether operator-initiated shredding (for DSARs) needs a separate path. **Size: M**

---

## 22. Test strategy and traceability

**Layers:** unit (`tests/unit/`) · integration against real Postgres (`tests/integration/`) · architecture invariants (`tests/architecture/`) · acceptance ceremony (`acceptance/`) · **new: security suite** (`tests/security/`) for enumeration, CSRF, IDOR/BOLA, rate limiting, header presence, and shred proofs.

**Two existing-suite obligations, both discovered in Wave 1:**
1. **`tests/unit/api.test.ts:557-561` currently asserts that an arbitrary string is a valid credential.** It is a correct test of today's deliberate design and becomes a **false-negative security test** the moment S5 lands. It must be inverted in the same commit — not later.
2. **`acceptance/vitest.config.ts` is not wired into `pnpm test`** (root `vitest.config.ts:14` covers `tests/**` only). The CONT-01 containment tests therefore only run by hand. Wire it in during Phase 1 — a green suite that silently skips the security tests is worse than no suite.

**Traceability — requirement → slice → test → evidence:**

| Requirement | Slice | Test | Evidence artifact |
|---|---|---|---|
| Individual accounts | S3 | registration integration | audit: `USER_REGISTERED` |
| Any authenticator app | S4 | RFC 6238 vectors | enrolment audit |
| Recovery codes hashed | S4 | no plaintext in DB | shred test |
| Real sessions + revocation | S5 | revoked session dies | session audit |
| Cookie not script-readable | S5 | cookie-flag unit test | header assertion |
| CSRF defence | S5 | cross-origin rejected | security suite |
| Security headers | S5 | present on all responses | security suite |
| Deny-by-default authz | S7 | undeclared route refuses | policy table |
| No IDOR/BOLA | S7 | one test per owned route | security suite |
| `caller_scope` not forgeable | S7 | body-injection test | security suite |
| Private by default | S8 | default-visibility unit | — |
| Publishing is deliberate | S8 | step-up required | publish audit |
| Content encrypted at rest | S6 | `strings` finds no content | datadir scan |
| **Erasure works (Art. 17)** | S6+S10 | **shred test** | **counsel evidence** |
| Public debates survive deletion | S8+S10 | post-deletion render | — |
| DR-188 preserved | S6+S10 | rows persist after shred | row-count proof |
| Dev token retired | S9 | header refused | grep proof |
| Audit trail tamper-evident | S2 | chain-break detection | chain verification |

**Hooks for later phases:** the security suite and the audit-assertion helpers are built in Phase 1 so Phases 2–7 extend rather than invent them.

---

## 23. Migration, rollback, and runbook requirements

**Migration principles.** Additive only (DR-188); every migration reversible in *schema* even where data is not; **encryption is the one-way door** (§0) — after S6, content cannot return to plaintext, which is why it ships behind a flag with staging verification first.

**Existing data.** All current runs predate accounts: `owner_user_id` starts NULL, visibility defaults to **private**, content stays plaintext (it cannot be retrofitted, §0) and is **explicitly marked legacy-plaintext** so no future erasure claim is made about it. Legacy runs are claimable (S9) or operator-owned. **The archived research corpus (`.pgdata-debate-091b7663`) is untouched — DR-188(4).**

**Rollback ladder.** S1–S5, S7–S9 are revertible by feature flag or revert. **S6 and S10 are not**: S6 because ciphertext cannot become plaintext, S10 because a destroyed key is destroyed. Both require a staging rehearsal and a signed-off go.

**Runbook additions (Phase 1):** KEK generation, escrow, and rotation · restore-from-backup drill (quarterly; **zero exist today**) · operator DSAR execution · account-shred execution and its evidence · break-glass DB access with alerting · incident triage per Wave 2 §20 · **secret-scanning in CI before any further push** (the Wave 1 exposure is the argument).

**Definition of done for Phase 1:** all ten slices dual-reviewed and merged · `pnpm test` **and** the acceptance suite green in one command · the security suite green · a manual walkthrough (register → enrol → login → private debate → publish → delete → verify unreadable) completed by V · the dev token gone · runbook written · residual risks re-checked.

---

## Wave 3 stop

Phase 1 is specified to the slice contract. Later phases carry charters only. **The coding + QA loop opens on V's acceptance of this plan**, which is also the decision point for the phase-order amendment in §0.1 — the one change that cannot be made later.
