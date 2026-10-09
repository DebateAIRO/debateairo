# Account Onboarding and Passkey Sign In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved human registration/login flow with manual encrypted phone collection, passkeys, social sign in, free Turnstile protection, branded verification email and consistent account UI.

**Architecture:** Extend the existing identity encryption, legal evidence, secure sessions and audited database functions rather than adding a parallel identity store. Consumer passkeys remain separate from staff hardware credentials; Turnstile validation uses a confined Unix relay because the preview API cannot access the public internet. Public request contracts, account activation and UI state transitions change together through a reviewed V3 release.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, Next.js 15, React 19, pnpm 11.20.0, Node >=26.8.2 <27, Vitest and existing node/render suites. Pin libphonenumber-js 1.13.7, @simplewebauthn/server 14.0.3 and @simplewebauthn/browser 14.0.0; their published versions were verified on 4 October 2026.

**Spec:** `docs/superpowers/specs/2026-10-04-account-onboarding-passkeys-design.md` (approved 4 October 2026, with the user's Turnstile and manual-only phone amendments).

## Global Constraints

- Signup headline: “Good questions deserve more than one answer.” Appendix A defines every one of the 35 catalog translations; English US/UK share English text.
- Phone is required on the first signup/completion screen, encrypted, source `manual`, status `unverified`; no SMS, phone-provider retrieval, ownership inference or unique-phone registration denial.
- Use existing AES-256-GCM envelopes, account DEK and separately custodied KEK; no plaintext phone in database, logs, audit, public projections or source control. Authorized future decryption remains possible.
- One email and one password with Show/Hide; recovery email is optional in Security settings. Preserve server age/country decisions and ADULT/TERMS/PRIVACY_SHOWN acceptance evidence.
- Passkeys are preferred now; user verification is required and checked server-side. TOTP is an alternative, not an extra compulsory step for passkey accounts.
- Consumer sessions: idle 1209600000ms, absolute 2592000000ms; sensitive-action proof 300000ms. No seven-day remembered-browser exemption; stricter staff/Owner rules remain intact.
- Verification lifetime 86400000ms; resend spacing 60000ms with a separate atomic rolling maximum of three attempts in 3600000ms, counting the first send and failed transports.
- Turnstile free managed widgets, actions `signup` / `resend-verification`, exact Siteverify hostname/action checks, <=2048-character tokens and <=300-second validity. Secret stays server-side; preserve API network confinement.
- Product brand Dialectical Engine, sender dezbatere.ro; legally required corporate identity retains the actual registered entity name.
- Never activate paid provider services, broaden preview recipients, send real mail or deploy a release merely because code passes locally. Turnstile free widget provisioning has explicit separate user authorization and is already complete.

## Review Focus

1. A cancelled or unsupported passkey prompt leaves a working alternate flow without creating a session or presenting a credential-rejection error (Tasks 8 and 11).
2. Two concurrent security operations cannot consume the same challenge/code or remove the last working authentication method (Tasks 7 and 9).
3. A user pasting a formatted phone, or reusing another user's number, gets format handling without an ownership/uniqueness claim; ciphertext cannot be moved between accounts (Tasks 2 and 3).
4. An expired/replayed Turnstile token, blocked verification egress or third-party outage cannot silently create an account/send mail; it yields a recoverable inline failure (Tasks 4 and 11).
5. A regional English preference, DST change or background browser tab cannot corrupt legal acceptance locale, expiry display or the resend countdown (Tasks 1, 5 and 6).

## Execution and file ownership

Execute from the V3 `dialectical-engine` directory. Confirm Node/pnpm versions first. The existing worktree is clean except these planning artifacts; reuse it or follow using-git-worktrees at execution time if isolation becomes necessary. Do not reset the old V2 application or switch the main domain to V3.

Tasks 1–6 establish onboarding contracts and independent backend/UI units; Task 7 establishes consumer authentication persistence and verification; Tasks 8–10 consume it. Tasks 11–12 integrate product presentation. Task 13 verifies and prepares the release. Schema numbering is reserved centrally: 0095 phone/optional recovery, 0096 verification budget, 0097 verified recovery-email management, 0098 consumer passkeys, 0099 consumer security/recovery, 0100 social identities. If another branch advances migrations, renumber this set together before implementation. The active preview's foundation receipt mentions 102 applied migrations; Task 13 must reconcile that lineage rather than assuming this source numbering can be applied directly.

Contract files and `apps/api/src/index.ts` have one implementing owner at a time. Backend routes and frontend clients use the interfaces below. Each task ends with a focused passing check and a commit containing only that task's changes; independent reviewers do not edit the implementation.

### Task 1: Define revised contracts and regional locale preferences

**Files:** Modify `packages/contract/src/index.ts`, `client.ts`, `generate.ts`; create `packages/contract/src/consumer-auth.ts`; regenerate `packages/contract/generated/client.ts`, `openapi.json`, `field-inventory.json`. Modify `apps/ui/lib/i18n/locales.ts`, `server.ts`, `questionLocale.ts`, `apps/ui/lib/dob/dobLocale.ts`, `apps/ui/lib/legal/server.ts`, `apps/ui/components/consent/useLegalDocument.ts`, `LanguageSwitcher.tsx`. Test `tests/unit/auth-contract-client.test.ts`, new `tests/unit/english-regional-locale.test.ts` and existing legal/DOB render tests.

**Interfaces:** `CatalogLocaleCode` contains the existing 35 codes. `LocaleCode = CatalogLocaleCode | "en-US" | "en-GB"`; `catalogLocale(locale)` and `legalLocale(locale)` return CatalogLocaleCode, mapping both English variants to `en`. Keep old `en` cookies valid. `register(input: RegisterRequest)` and `resendVerification(input: ResendVerificationRequest)` return `VerificationAck` with the existing exact generic message and `retry_after_seconds:60`.

`RegisterRequest` is `{email,password,phone,date_of_birth,terms:{version,sha256},privacy:{version,sha256},locale,ui_locale,time_zone:string|null,turnstile_token}`. Resend is `{email,locale,ui_locale,time_zone,turnstile_token}`. Legal `locale` is the served catalog language; `ui_locale` controls formatting. Strict schemas reject uploaded authority fields. Authentication output is `{status:"authenticated",csrf_token,session,replacement_recovery_code?}`; raw session tokens never appear in JSON. Define bounded WebAuthn registration/authentication option and credential schemas compatible with the pinned library, exporting their types for Task 7.

- [ ] Step 1: Add contract rejection tests and locale assertions: `expect(legalLocale("en-US")).toBe("en")`, `expect(catalogLocale("en-GB")).toBe("en")`; verify 35 catalogs, 36 visible preferences, explicit US MDY/UK DMY and identical English legal hashes. Assert both revised request schemas reject `adultAffirmed`, `userId`, `verified` and extra credential authority.
- [ ] Step 2: Run `pnpm exec vitest run tests/unit/auth-contract-client.test.ts tests/unit/english-regional-locale.test.ts tests/render/legal-document-locale-render.test.tsx`; require failures in the new assertions before implementation.
- [ ] Step 3: Implement the interfaces, generated OpenAPI/inventory entries and catalog aliases. Remove continent grouping from the searchable preference list; normalize base-language comparisons for question-language offers.
- [ ] Step 4: Run `pnpm run generate:contract` and the Step 2 tests; require all pass and generated schemas accurately describe requests/responses.
- [ ] Step 5: Commit the listed contract/locale changes as `feat: define streamlined onboarding contracts and regional English`.

### Task 2: Store required manual phones with envelope encryption

**Files:** Create `apps/api/src/phone-profile.ts`, `migrations/0095_phone_profile_optional_recovery.sql`, `tests/unit/phone-profile.test.ts`, `tests/integration/phone-profile-database.test.ts`. Modify `apps/api/src/registration.ts`, `apps/api/src/index.ts`, `packages/db/src/identity.ts`, `schema.ts`, API package/lockfile and guarded pending-account/consent functions.

**Interfaces:** `normalizeManualPhone(value: unknown): string` uses libphonenumber-js/min, leading `+`, `extract:false`, no extension and `.isPossible()`, returning canonical E.164. Extend `PendingAccountInput` with `phoneCiphertext:CryptoEnvelope`, `phoneSource:"manual"`, `phoneVerificationStatus:"unverified"`, `phoneUpdatedAt:Date`; recovery ciphertext becomes `CryptoEnvelope|null`. AAD is `["identity","user.phone_ciphertext",userId,"run:none",userId,`user-dek:${userId}`,"1"]`.

- [ ] Step 1: Assert `normalizeManualPhone("+40 722 123 456")==="+40722123456"`; reject missing prefix, extensions and oversized input. Add real database assertions for two accounts sharing a number, null recovery and preserved legal gates. Assert stored/audit/log snapshots exclude plaintext; decrypt succeeds with correct DEK/AAD and fails with another account's binding or modified ciphertext.
- [ ] Step 2: Run `pnpm exec vitest run tests/unit/phone-profile.test.ts tests/integration/phone-profile-database.test.ts tests/unit/registration.test.ts tests/unit/legal-signup.test.ts`; confirm new failures.
- [ ] Step 3: Implement normalization/encryption before writes, clearing plaintext/DEK buffers in finally. Supersede only the old phone-null CHECK/trigger, retaining unsupported WhatsApp channel guards. Add phone metadata consistency checks, leave existing rows nullable, make recovery nullable and insert its channel only when an address exists. Preserve audit capability/locking and atomic consent records. Do not add a phone hash/index or uniqueness constraint now.
- [ ] Step 4: Run Step 2 and `pnpm exec vitest run tests/integration/registration-database.test.ts tests/unit/identity-crypto.test.ts`; require pass with restricted database roles, not owner-only connections.
- [ ] Step 5: Commit as `feat: encrypt manual phone profiles and make recovery email optional`.

### Task 3: Authorize phone access and optional verified recovery email

**Files:** Create `packages/db/src/account-profile.ts`, `apps/api/src/account-profile.ts`, `apps/api/src/recovery-email.ts`, `packages/db/src/recovery-email.ts`, `migrations/0097_recovery_email_verification.sql` and profile/recovery tests. Modify exports/composition, `apps/api/src/email-change.ts`, `packages/db/src/email-change.ts`, AccountEmail DTO and shared step-up action schemas.

**Interfaces:** `phoneProfile()` returns `{phone_present,phone_masked:string|null,phone_verified:false,updated_at:string|null}`. `revealPhoneProfile(grantToken)` returns the full value only after `READ_PHONE_PROFILE` fresh proof. `updatePhoneProfile({phone,grantToken})` uses `CHANGE_PHONE_PROFILE`. Both bind current session/account and emit purpose-labelled audit without values. `hasPhone(ownerRef):Promise<boolean>` supports `ACCOUNT_PHONE_REQUIRED` before a new free ask reserves budget. No admin bulk export.

`recoveryEmail()` returns absent/pending/verified state. `requestRecoveryEmail({email,grantToken})`, `confirmRecoveryEmail({token})`, `removeRecoveryEmail({grantToken})` use `CHANGE_RECOVERY_EMAIL` and hash-only single-use email confirmation. The old verified channel stays active until its replacement is confirmed. A confirmation token is not a factor-reset grant.

- [ ] Step 1: Add wrong-account/stale-grant/no-CSRF reveal/update tests; default profile must expose only masked phone. Assert missing-phone free asks consume no quota, while existing sign-in and paid flows work. Add recovery nullability, expiry/replay/wrong-purpose and pending-channel exclusion tests. Erasure must remove ciphertext and make the DEK unavailable.
- [ ] Step 2: Run `pnpm exec vitest run tests/unit/account-profile-http.test.ts tests/unit/recovery-email.test.ts tests/integration/recovery-email-database.test.ts tests/integration/phone-profile-database.test.ts`; confirm new failures.
- [ ] Step 3: Implement session-guarded repository functions and `/v1/account/profile`, `/v1/account/profile/reveal`, recovery management/confirmation routes. Extend existing TOTP step-up production/grant SQL with the three profile/recovery action names so these routes are usable before passkey step-up lands. Propagate nullable recovery through all email-change consumers. Gate only resolved free asks at the existing funding seam, before hold/run creation, preserving crisis-support precedence. Keep phone ineligible for recovery.
- [ ] Step 4: Run Step 2 plus `pnpm exec vitest run tests/unit/email-change-http.test.ts tests/integration/email-change-service.test.ts tests/integration/p2-recovery-start-database.test.ts tests/integration/s10-t9-account-erasure-races.test.ts`; require pass.
- [ ] Step 5: Commit as `feat: protect profile access and verify optional recovery addresses`.

### Task 4: Integrate managed Turnstile with confined server validation

**Files:** Create `apps/api/src/turnstile.ts`, `deploy/turnstile/siteverify-relay.mjs`, `deploy/turnstile/debateai-turnstile.service`, `apps/ui/components/auth/TurnstileChallenge.tsx`, `apps/ui/lib/turnstile.ts` and verifier/relay/widget tests. Modify runtime environment, API main/index wiring, `apps/ui/app/sign-up/page.tsx`, `content-security-policy.mjs` and CSP tests. Consume the already provisioned widgets documented in the operations receipt.

**Interfaces:** `TurnstileVerifier.verify({token,action:"signup"|"resend-verification"}):Promise<"passed"|"rejected"|"unavailable">`. Fixed HTTPS Siteverify URL, expected hostname derived from validated PUBLIC_APP_URL, 5000ms total deadline, <=8192-byte response and strict success/action/hostname/timestamp checks. No request URL/proxy/redirect override. UI `TurnstileChallenge({siteKey,action,locale,nonce,resetKey,onToken,onError})` returns token/null through callbacks; the secret is never a prop.

- [ ] Step 1: Add missing/spoofed/expired/replayed token, wrong hostname/action and timeout tests asserting registration/KDF/mail are never called. Widget tests cover one script/widget under React strict effects, expiry/reset/remove and absent secrets. Relay tests reject arbitrary URL/metadata, oversized input/response and API-user secret-file access.
- [ ] Step 2: Run `pnpm exec vitest run tests/unit/turnstile.test.ts tests/unit/turnstile-http.test.ts tests/render/turnstile-challenge.test.tsx` and `node --test tests/turnstile/siteverify-relay.test.mjs`; confirm new failures.
- [ ] Step 3: Implement mandatory verification at signup, social completion and resend before identity work, after cheap source admission checks. Use a dedicated Unix socket and isolated worker with only Turnstile secret custody and fixed Siteverify transport; do not relax API network confinement. Use Managed mode, `appearance:"interaction-only"`, `execution:"render"`, flexible width and explicit nonce-bearing script loading. Reset consumed tokens; preserve API CSP and nonce/CSRF protections. Missing enabled-deployment config makes signup unavailable, never bypassed; tests use official isolated test keys.
- [ ] Step 4: Run Step 2 plus the UI CSP/node suites; require pass. Verify logs omit tokens/secrets and relay environment contains no identity/DB/provider keys.
- [ ] Step 5: Commit as `feat: enforce Turnstile through an isolated verification relay`.

### Task 5: Implement 60-second resend with a rolling send budget

**Files:** Create `migrations/0096_verification_delivery_budget.sql`, `tests/integration/verification-send-budget.test.ts`, `apps/ui/components/auth/EmailPendingScreen.tsx`, `tests/render/email-pending-screen.test.tsx`. Modify registration/identity repository, `packages/register/src/auth-policy.ts` and ACK/client consumers.

**Interfaces:** Extend `prepareVerificationResend` with `cooldownMs:60000,windowMs:3600000,maximumSends:3`. Reservation rows bind primary channel and unique attempt, using database time and an account/channel lock. `EmailPendingScreen({email,retryAfterSeconds,client,catalog,locale,turnstile,onDifferentEmail})` consumes Task 1 acknowledgements and fresh Task 4 proof.

- [ ] Step 1: Assert initial/t+60s/t+120s send, fourth ignored, t+3600s boundary frees one slot, failed send consumes budget and 20 concurrent requests admit one eligible reservation. All missing/active/cooling/limited responses stay identical. UI: disabled at 59 seconds, enabled at 60, recalculates after backgrounding, repeated click gives one request and new proof is required.
- [ ] Step 2: Run `pnpm exec vitest run tests/integration/verification-send-budget.test.ts tests/render/email-pending-screen.test.tsx tests/unit/registration.test.ts`; confirm failures.
- [ ] Step 3: Implement atomic initial/resend reservation and compatible `atomic_rolling_reservation_ledger` policy; preserve source limits and existing token validity. Replace successful signup form with pending view, clear sensitive fields, offer address correction and concise retry/outage copy. Avoid live-announcing every countdown second. Generic ACK does not claim delivery success.
- [ ] Step 4: Run Step 2 plus registration database/auth-client tests; require pass and no reservation refund after transport failure.
- [ ] Step 5: Commit as `feat: add a clear email waiting screen and bounded resend`.

### Task 6: Render branded verification mail and preserve transport boundaries

**Files:** Create `apps/api/src/verification-email.ts`, `tests/unit/verification-email.test.ts`; modify `apps/api/src/mail-channel.ts`, VerificationMail/registration metadata and the exact preview wrapper/stub tests in `<private operations folder>/initial-testing-2026-10-03/staging-execution/public-preview/mail/` through a new reviewed revision.

**Interfaces:** `renderVerificationEmail({recipient,verificationUrl:URL,expiresAt:Date,display:{locale:string,timeZone:string|null}}):{subject,text,html}`. Subject `Verify your email for Dialectical Engine`; display From `dezbatere.ro <noreply@dezbatere.ro>`, bare envelope sender unchanged. Use served UI locale, validated IANA timezone, explicit UTC fallback and 24-hour lifetime.

- [ ] Step 1: Assert multipart alternatives, button/fallback share the exact HTTPS fragment URL, escaped recipient/URL values, no header injection/tracking and no ISO-Z expiry copy. Pin supplied expiry to 5 October 10:41 Bucharest, plus DST/date-boundary/invalid-zone cases. Wrapper rejects the owner's recovery inbox, CC/BCC and foreign links before spawn and still forwards only owned testers.
- [ ] Step 2: Run `pnpm exec vitest run tests/unit/verification-email.test.ts tests/unit/s10-mail-channel.test.ts`; run existing local mail wrapper tests with stub-only transport; confirm the new MIME contract fails before revision.
- [ ] Step 3: Implement plain-text/HTML renderer using cream/charcoal/gold styling and safe MIME construction. Update strict bounded wrapper parsing and tests coherently rather than permitting arbitrary MIME. Preserve fragment-token handling, deadlines, clean child environment and allowlist. Add separately verified recovery/security-notification templates to the same bounded transport contract when those flows are enabled.
- [ ] Step 4: Run Step 2 to pass, including `/opt/homebrew/bin/node --import ./node_modules/tsx/dist/loader.mjs --test <private operations folder>/initial-testing-2026-10-03/staging-execution/public-preview/mail/test-mail.mjs <private operations folder>/initial-testing-2026-10-03/staging-execution/public-preview/mail/test-source-producer.mjs`; use no real sendmail.
- [ ] Step 5: Commit source renderer/metadata; save the operational transport revision and its hash manifest as a separate reviewed artifact. Message: `feat: style account mail and show local expiry times`.

### Task 7: Build consumer passkey persistence and verified ceremonies

**Files:** Create `migrations/0098_consumer_passkeys.sql`, `packages/db/src/consumer-auth.ts`, `apps/api/src/consumer-webauthn.ts`, `consumer-webauthn-verifier.ts`, `tests/support/consumerWebAuthnFixtures.ts` and unit/integration tests. Modify API main/index, DB exports and dependency lockfile; consume Task 1 schemas.

**Interfaces:** `PostgresConsumerAuthRepository` stores consumer credential/challenge records separately from staff. `beginPasskeyEnrollment({enrollment_token}|{step_up_grant})` returns `{challenge_handle,expires_at,options}`; `completePasskeyEnrollment({challenge_handle,credential,label?})` returns initial AuthenticatedResponse or `{status:"enrolled"}`. `beginPasskeyLogin({continuation_token?}?)` and `completePasskeyLogin({challenge_handle,credential})` support discoverable credentials and owner user-handle validation.

- [ ] Step 1: Use independently encoded, genuinely signed fixtures for wrong origin/RP/challenge/user handle/owner, missing UV/UP, forged signatures, malformed bounds, expiry/replay and revocation. Assert `requireUserVerification:true`; two concurrent completion attempts issue at most one session. Include valid zero-counter and multi-device positive non-increasing assertions, illegal BE/BS combinations and unchanged staff flags/counters.
- [ ] Step 2: Run `pnpm exec vitest run tests/unit/consumer-webauthn.test.ts tests/unit/consumer-auth-http.test.ts tests/integration/consumer-auth-database.test.ts`; confirm new failures.
- [ ] Step 3: Implement pinned SimpleWebAuthn adapter with discoverable credentials, attestation none, required UV and fixed configured RP/origin. For stored multiDevice credentials use comparison counter zero, validate backup/device-type consistency, retain maximum observed counter and audit anomalies; single-device credentials keep monotonic checking. Lock and recheck challenge/account/factor/security state before atomic challenge consumption, mutation/session and audit. Use purpose-bound random handles and restricted-role SQL functions; uploaded account/role assertions are never trusted.
- [ ] Step 4: Run Step 2 plus `pnpm exec vitest run tests/unit/staff-webauthn.test.ts tests/integration/staff-webauthn-database.test.ts tests/unit/staff-authorization.test.ts`; require pass, including audit-failure rollback and ACL assertions.
- [ ] Step 5: Commit as `feat: add user-verified consumer passkey ceremonies`.

### Task 8: Activate accounts directly and unify secure session completion

**Files:** Modify `apps/api/src/mfa.ts`, `registration.ts`, `sessions.ts`, `packages/db/src/identity.ts`, `sessions.ts`, `packages/register/src/session-policy.ts`, runtime/publication wiring and Task 7 activation SQL. Create activation/session-policy tests.

**Interfaces:** `completeTotpEnrollment({enrollment_token,code})` on existing `/v1/auth/mfa/totp/verify` returns AuthenticatedResponse for initial setup, `{status:"enrolled"}` for an added factor. `beginLogin(email,password)` retains `mfa_required` with secure available-method continuation; `completeLogin(challengeToken,code)` handles TOTP/saved code, while passkey continuation uses Task 7. Shared internal session completion sets host-only session/CSRF cookies; no password-only session.

- [ ] Step 1: Assert verified passkey and TOTP activate without recovery type-back, but pending email, stale legal evidence, age refusal/security hold cannot activate. Resulting cookies open a usable session immediately. Pin idle 1209600000ms, absolute 2592000000ms and sensitive grant 300000ms; activity never extends absolute expiry. Test passkey-only cancellation does not fall through to password alone.
- [ ] Step 2: Run `pnpm exec vitest run tests/unit/mfa.test.ts tests/unit/s5-session-http.test.ts tests/integration/session-database.test.ts tests/integration/consumer-auth-database.test.ts`; confirm failures in revised assertions.
- [ ] Step 3: Generalize the active-TOTP-only login query to supported secure methods, keeping old TOTP accounts usable. Make factor activation/session/audit atomic and optionalize recovery generation. Publish a new policy revision through the existing register ceremony, not a silent edit of sealed history. Existing sessions remain valid up to the lesser of old expiry and created_at+30 days; older sessions naturally reauthenticate without database mass revocation. Preserve stronger staff rules and all logout/risk checks.
- [ ] Step 4: Run Step 2 plus `tests/architecture/s4-mfa-contract.test.ts` and current session revocation/render tests; require pass and unchanged protected staff behavior.
- [ ] Step 5: Commit as `feat: finish onboarding directly into secure sessions`.

### Task 9: Add purpose-bound security management and safe recovery

**Files:** Create `migrations/0099_consumer_security_recovery.sql`, `apps/api/src/consumer-security.ts`, `packages/db/src/consumer-security.ts`, security/recovery tests; modify shared action/target schemas, sessions/recovery services and durable security-mail intents.

**Interfaces:** `beginPasskeyStepUp(authorization)` / `completePasskeyStepUp({challenge_handle,credential})` return the existing purpose-bound StepUpResponse. Add actions `ADD_PASSKEY`, `REMOVE_AUTH_METHOD` with target factor, `REGENERATE_RECOVERY_CODES`, `LINK_PROVIDER`/`UNLINK_PROVIDER` with target provider; consume the Task 3 actions `CHANGE_RECOVERY_EMAIL`, `READ_PHONE_PROFILE` and `CHANGE_PHONE_PROFILE` unchanged. `authMethods()`, `removeAuthMethod(factorId,grant)`, `regenerateRecoveryCodes(grant)` expose safe metadata only.

Define passkey-only recovery concretely: generic `/v1/auth/recovery/start` sends a hash-only 15-minute verified-channel token under bounded send limits; `/v1/auth/recovery/prove` requires that token plus an unused saved recovery code. Atomically consume both, revoke sessions, record audit/notification and issue a five-minute `RECOVERY_ENROLL_ONLY` capability. It authorizes one new UV passkey/TOTP enrollment, not a normal session or provider/profile access. Successful restricted enrollment rechecks state, replaces compromised factors under the recovery policy and issues a normal session. A second working passkey uses normal login. Without a valid backup/code and eligible channel, return generic refusal; email or typed phone alone cannot recover the account.

- [ ] Step 1: Test expired/wrong-purpose/target/account/session grants, two concurrent last-factor removals, code/token replay and recovery enrollment swaps. Assert `recoveryProve(validEmailToken,unusedCode)` yields restricted capability only, and neither proof alone yields access. Security/phone-read audits contain purpose/account IDs but no secret/value.
- [ ] Step 2: Run `pnpm exec vitest run tests/unit/consumer-security.test.ts tests/integration/consumer-security-database.test.ts tests/unit/consumer-recovery.test.ts tests/integration/consumer-recovery-database.test.ts`; confirm failures.
- [ ] Step 3: Implement locked last-factor counting, five-minute one-use purpose grants and proof/session rotation. Preserve saved-code consume-and-replace semantics for existing password fallback. Recovery email must be verified before eligible. Notify through durable verified-email intents; existing staff/Owner recovery is a separate policy and consumer proof grants no privileged authority.
- [ ] Step 4: Run Step 2 and current P2/Owner recovery/session tests; require pass including tampered audit rollback, erasure and security-hold races.
- [ ] Step 5: Commit as `feat: protect account security changes and passkey recovery`.

### Task 10: Integrate configured social identity providers safely

**Files:** Create `migrations/0100_social_identities.sql`, `apps/api/src/social-auth.ts`, adapters in `social-providers/`, `packages/db/src/social-identity.ts`, social tests and callback/completion pages. Modify runtime config, contracts/API composition and UI provider controls.

**Interfaces:** `authProviders():{providers:Provider[]}`; `beginSocialLogin(provider,{next?}):{authorization_url}`; `completeSocialSignup({continuation_token,email,phone,date_of_birth,terms,privacy,locale,ui_locale,time_zone,turnstile_token})`. Persist `(provider,issuer/app_scope,subject)` identity, never email-only ownership. State/PKCE/nonce/browser binding are short-lived and single-use. Existing linked login yields a bound secure-method continuation until the application's proof requirement is met.

- [ ] Step 1: Add state/nonce/PKCE replay/mismatch, issuer/audience/signature/JWKS rotation, user-token substitution, existing-email collision, callback/open-redirect and unavailable-provider tests. Assert no Google People/phone scope and no provider phone request. Apple cross-site form_post callback must work without disabling global CSRF protection.
- [ ] Step 2: Run `pnpm exec vitest run tests/unit/social-auth.test.ts tests/integration/social-identity-database.test.ts tests/render/social-signup.test.tsx`; confirm failures.
- [ ] Step 3: Implement Google/Apple OIDC checks and explicit Facebook/X token-to-user adapters using actual supported semantics. Use exact callbacks/minimal scopes; retain Apple relay and independent public pseudonym. Skip local email confirmation only for reviewed verified assertions. Existing-email collision requires authenticated linking, never auto-merge. Allow nullable password only for provider accounts. Keep disabled/misconfigured providers absent; credentials and provider paid entitlements are external activation dependencies, not invented fixtures.
- [ ] Step 4: Run Step 2 plus contract/navigation/CSRF tests; require pass. Real-provider acceptance requires actual configured credentials; mock success does not make a provider available.
- [ ] Step 5: Commit as `feat: add configurable social sign-in and safe identity linking`.

### Task 11: Implement the simplified signup and passkey-first UI

**Files:** Create `apps/ui/components/auth/InlineFieldMessage.tsx`, `PhoneField.tsx`, `SecurityEnrollment.tsx`, `apps/ui/lib/authFormValidation.ts`, `consumerWebAuthn.ts`. Modify `SignUpFlow.tsx`, `LoginFlow.tsx`, enrollment/verification routes and enrollment helpers. Update all `apps/ui/messages/*/auth.json` using the approved translation appendix and revised strings. Create signup/passkey/TOTP render and browser-adapter tests.

**Interfaces:** `validateSignup(input):SignupFieldErrors`; PhoneField emits raw edited text for the shared normalizer. `createConsumerWebAuthnBrowser()` provides `register(options,signal?)`, `authenticate(options,{mediation,signal}?)`, `supportsConditional()` and `cancel()`. Consume Tasks 1–10 client methods; bound credentials with Task 1 schemas and abort a conditional ceremony before explicit requests/mode changes/unmount.

- [ ] Step 1: Assert actual `requestSubmit()` produces inline errors/focus and zero requests for invalid fields; removed confirm-email/password/recovery inputs are absent. Assert passkey cancellation/unsupported autofill leaves a usable fallback; successful enrollment/login needs no TOTP and safely returns to `/new`. Five TOTP digits send nothing, sixth/paste sends once, unchanged rejected code cannot loop and edited code can retry.
- [ ] Step 2: Run `pnpm exec vitest run tests/render/signup-simplification.test.tsx tests/render/security-enrollment.test.tsx tests/render/passkey-login.test.tsx tests/render/totp-auto-submit.test.tsx tests/unit/consumer-webauthn-browser.test.ts`; confirm failures.
- [ ] Step 3: Implement one-email/phone/one-password/DOB/legal form with noValidate, password-manager autofill and Show/Hide. Clear sensitive fields after acknowledgement; use pending view. Show passkey first, QR default with setup-key disclosure as alternative, optional compact backups after successful activation. Scrub fragment tokens before requests. Login has no valid-email/password-rule ticks; rejected credentials use the approved short generic sentence. Handle Turnstile failure inline without losing nonsensitive entries.
- [ ] Step 4: Run Step 2 plus current auth/age/legal render suites and UI node i18n suites. Update deliberate old-form/typeback assertions, preserving legal/token/secret/error defenses. Verify 35 exact headlines and no missing translated keys.
- [ ] Step 5: Commit as `feat: simplify onboarding and prefer passkey sign-in`.

### Task 12: Finish account menus, settings, Help and branding

**Files:** Create `apps/ui/components/AccountMenu.tsx`, `SecuritySettings.tsx`, `PhoneProfileCard.tsx`, `apps/ui/lib/endSession.ts`, `apps/ui/app/settings/security/page.tsx`. Modify TopBar, LandingChrome, support Assistant, the debate-specific header components, SessionControls, SettingsPageClient, globals/language-switcher CSS, report metadata and all affected catalogs. Update `packages/support-kb/src/catalog.ts`, labels/recovery projections and relevant content locales.

**Interfaces:** `endSession(client,{all?,redirectTo?}):Promise<void>` reuses logout/revoke-all, transcript clearing and session-ended event. AccountMenu exposes Account/Security/Log out across all header variants. Security/profile components consume safe metadata and fresh grants; full-phone reveal is explicit, temporary and cleared on navigation/logout. Missing-phone account completion preserves the draft question and retries only after successful encrypted update.

- [ ] Step 1: Test menu keyboard/Escape/outside dismissal, focus restoration, single logout and transcript clearing in normal/Help/debate headers. Assert synthetic identity/legacy claim UI and help actions absent; Active sessions remains. Add phone-completion/last-factor/fresh-reveal UI checks and browser hit-testing/bounds for Help dropdown/hover at narrow, wide and RTL viewports.
- [ ] Step 2: Run `pnpm exec vitest run tests/render/account-menu.test.tsx tests/render/security-settings.test.tsx tests/render/phone-completion.test.tsx` and UI node settings/chrome suites; confirm relevant new failures.
- [ ] Step 3: Implement shared menus/profile/security views, revised titles and legacy removal. Raise the Help header stacking context and constrain dropdown placement. Remove whole-button hover scaling/translation from new/library/landing CTAs. Update product branding in accessibility, issuer, help, reports and translations; preserve registered corporate identity and internal package/cookie compatibility unless a migration is necessary.
- [ ] Step 4: Run Step 2, inspect narrow/wide/RTL browser rendering and rendered report metadata; require menus accessible, dropdown clickable above content and button/text bounds stable on hover.
- [ ] Step 5: Commit as `feat: make account controls and navigation clear and consistent`.

### Task 13: Verify the complete release and prepare restricted deployment

**Files:** Create a release acceptance record and reviewed deployment artifacts under the operations directory. Update relevant deployment documentation and legal source/generated locale artifacts for phone/Turnstile purposes and recipients; preserve document version/hash ceremonies. Do not place private credentials in the worktree.

**Interfaces:** Turnstile widgets are already provisioned in account `897f1c45388e0fc8b08724152e80fbe4`; public receipt `<private operations folder>/turnstile-2026-10-04/provisioning.json` records metadata/status. Credentials reside separately under its `private/` directory (0700, files0600), outside Git. Provision the selected secret into the relay's restricted server custody only during the reviewed deployment. Preview and production keys/RP/origins never cross environments.

- [ ] Step 1: Add installed-profile acceptance probes for source/migration/register lineage, relay socket/file/role isolation and valid/invalid actual Turnstile token outcomes. Add a release checklist matching every spec section and every externally configured provider. Hardware approval and inbox confirmation are human observations, not simulated evidence.
- [ ] Step 2: Run focused probes against isolated test infrastructure; confirm the unmodified pre-release profile cannot satisfy the new assertions. Inspect the active preview's applied migration ledger nonsecret IDs/hashes before choosing the upgrade path.
- [ ] Step 3: Prepare versioned schema/register/transport/API/UI/relay artifacts, compatible rollback and legal disclosure revisions. Preserve database/key/audit history and old TOTP access. Confirm exact preview hostnames and origin-bound passkeys, staged secret custody, unchanged API outbound restrictions and mail allowlist. Broad recipient expansion, main-domain V3 cutover and paid provider activation require their own concrete reviewed scope.
- [ ] Step 4: Run `pnpm run generate:contract`, `pnpm run generate:legal:check`, `pnpm run typecheck`, `pnpm --filter dialectical-engine-v2ui typecheck`, `pnpm --filter dialectical-engine-v2ui test`, focused unit/integration/render/security regressions and `pnpm build`. Require zero new failures; identify any established unrelated baseline failures with fresh evidence. Run real-device passkey enrollment/login/step-up, synced-device and TOTP fallback, actual preview Turnstile validation and explicit inbox checks when authorized. Widget existence alone never passes integration acceptance.
- [ ] Step 5: Save the truthful acceptance/handoff record and commit the documentation as `docs: record account-flow release verification and deployment handoff`. Offer the concrete tested deployment for its required final review; do not claim publication or protection on undeployed forms.

## Plan self review and execution handoff

Before delivery, the parent author checks every approved requirement against Tasks 1–13, checks exact interface names and migration reservations, verifies the five Review Focus conditions have owning tests, and removes placeholders/ambiguous steps. Test filenames newly introduced above are future deliverables; existing baseline tests and paths are verified during planning.

The phone field alone cannot establish one human per account. Turnstile reduces automated abuse without proving identity. Encryption protects a stolen database when key custody survives; application/key compromise is a different threat. These facts belong in implementation/review decisions without alarming or technical product copy.

Proposed execution: Native implementation in the existing session, with independent whole-branch authentication/UI review after focused checks. Schema/contracts/activation/sessions have tight shared interfaces, so one implementing owner reduces drift. Subagent-driven execution is also available if the user prefers fresh implementation/review gates per task. Implementation starts after the user reviews this plan and selects the execution method, as required by the writing-plans workflow.
