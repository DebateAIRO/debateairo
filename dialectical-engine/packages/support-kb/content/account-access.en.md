---
id: account-access
lang: en
title: "Sign in, register, and recover MFA access"
status: shipped
sources:
  - apps/ui/components/LoginFlow.tsx:62
  - apps/ui/components/LoginFlow.tsx:289
  - apps/ui/components/SignUpFlow.tsx:183
  - apps/ui/app/verify-email/page.tsx:1
  - apps/ui/app/enroll-mfa/page.tsx:75
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Use `/login` to sign in with your password and then complete the required second verification step with an authenticator code or a saved unused recovery code. The login page offers **Use a recovery code** after the password step. Use `/sign-up` to register; email verification and authenticator enrollment continue only from their valid account-flow state. The product owner confirms a separate Forgot password flow, but Support keeps that action unavailable until its exact existing destination is verified. Never put a password, verification token, authenticator secret, or recovery code in Support.
