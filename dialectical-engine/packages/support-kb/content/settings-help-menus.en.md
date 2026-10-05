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
verified_against: "Task 12 working tree based on 903407d27b1b66bdcd1b724bb87d0580ca94658f; exact source hashes in docs/missions/account-onboarding/task-12-kb-editorial.md"
ratified_by: ""
ratified_on: ""
---

The Account menu offers Account, Security, and Log out. Account contains email, Active sessions, consent preferences, and Delete account; Security contains the phone profile and sign-in or recovery methods. The phone remains unverified; revealing the full number is explicit and temporary. Sensitive operations require action-specific confirmation. Help can offer fixed links and explain prerequisites, but cannot inspect private account state, receive credentials or codes, or operate these controls. Report a bug prepares ordinary public-guide text; Escalate to a human creates a separate human handoff, and email support is a separate mail workflow.
