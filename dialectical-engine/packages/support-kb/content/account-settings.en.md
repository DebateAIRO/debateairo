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
verified_against: "Auth cba421c5fb and Dev 7b91df4f10 integration; docs/missions/account-onboarding/dev-integration-kb-editorial.md"
ratified_by: ""
ratified_on: ""
---

After signing in, Account opens `/settings` with email changes, Active sessions, a Privacy section listing this browser’s storage, available subscription controls, and account deletion. Security opens `/settings/security` with a masked, unverified phone profile, optional recovery email, passkeys or an authenticator app, recovery codes, and configured linked providers. Revealing or changing a phone and other sensitive actions require confirmation for that exact action. Removing a method or provider cannot remove the last complete sign-in path. Log out ends the current session and clears the Help conversation in this tab and notifies the other tabs after success. Support can explain and navigate, but cannot perform account operations or receive passwords, codes, tokens, or confirmation phrases.
