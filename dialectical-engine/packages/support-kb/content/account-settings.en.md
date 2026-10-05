---
id: account-settings
lang: en
title: "Use account settings"
status: shipped
sources:
  - apps/ui/components/AccountMenu.tsx:10
  - apps/ui/components/SecuritySettings.tsx:17
  - apps/ui/components/PhoneProfileCard.tsx:13
  - apps/ui/components/SettingsPageClient.tsx:57
  - apps/ui/components/SessionControls.tsx:65
  - apps/ui/components/AccountErasureControls.tsx:66
verified_against: "Task 12 working tree based on 903407d27b1b66bdcd1b724bb87d0580ca94658f; exact source hashes in docs/missions/account-onboarding/task-12-kb-editorial.md"
ratified_by: ""
ratified_on: ""
---

After signing in, Account opens `/settings` with email changes, Active sessions, consent preferences, and account deletion. Security opens `/settings/security` with a masked, unverified phone profile, optional recovery email, passkeys or an authenticator app, recovery codes, and configured linked providers. Revealing or changing a phone and other sensitive actions require confirmation for that exact action. Removing a method or provider cannot remove the last complete sign-in path. Log out ends the current session and clears this tab’s Help conversation after success. Support can explain and navigate, but cannot perform account operations or receive passwords, codes, tokens, or confirmation phrases.
