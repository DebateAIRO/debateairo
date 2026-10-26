---
id: settings-help-menus
lang: en
title: "Use Settings and human Help"
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

The Account menu offers Account, Security, and Log out. Account contains email, Active sessions, and Delete account; Security contains the phone profile and sign-in or recovery methods. The phone remains unverified; revealing the full number is explicit and temporary. Sensitive operations require action-specific confirmation. Help can offer fixed links and explain prerequisites, but cannot inspect private account state, receive credentials or codes, or operate these controls. Report a bug prepares ordinary public-guide text; to reach a person, write to support@dezbatere.ro, the address Talk to a human shows.

Privacy lists the cookies and browser storage the product uses. Help cannot read the visitor’s sessions, deletion state or private account records. The support chat keeps nothing the visitor writes and cannot pass a conversation to a person.
