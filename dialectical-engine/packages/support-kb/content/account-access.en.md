---
id: account-access
lang: en
title: "Sign in, register, and recover MFA access"
status: shipped
sources:
  - apps/ui/components/LoginFlow.tsx
  - apps/ui/components/auth/SocialCompleteFlow.tsx
  - apps/ui/components/auth/SecurityEnrollment.tsx
  - apps/ui/app/recover/page.tsx
verified_against: "59e436312 plus final authentication source fixes"
ratified_by: ""
ratified_on: ""
---

Use `/login` to sign in with a passkey. Your device uses its normal face, fingerprint or PIN check. Password sign-in also remains available for accounts with a password and an enrolled secure method; use only the methods offered for your account. Open the authenticator app used during signup for a six-digit code, or use a saved unused recovery code when offered. Configured providers can start sign-in, followed by an enrolled passkey, authenticator or offered recovery code; provider sign-in alone does not complete the required security check.

Use `/sign-up` to create an account with email, a manually entered unverified phone number, one password, age eligibility and legal acknowledgements. Provider signup collects the missing information and may verify the email through a trusted provider assertion; otherwise follow the email link. Then create a passkey or use an authenticator app instead. One supported secure method activates the account and returns directly to the product. A passkey does not also require an authenticator. Backup methods are optional in Account → Security; losing all sign-in and backup methods may prevent recovery.

Recovery access opens `/recover`, the first-party recovery page. Recovery requires the proofs and eligible methods offered by that flow; an email match, normal session or unverified phone alone cannot replace credentials. Support can explain the flow and navigate but cannot perform account operations or receive passwords, verification tokens, authenticator secrets, recovery codes or security proofs.
