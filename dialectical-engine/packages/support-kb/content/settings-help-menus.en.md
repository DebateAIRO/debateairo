---
id: settings-help-menus
lang: en
title: "Use Settings and human Help"
status: shipped
sources:
  - apps/ui/components/TopBar.tsx:82
  - apps/ui/components/SessionControls.tsx:165
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:35
  - apps/ui/components/LegacyRunClaimControls.tsx:43
  - apps/ui/components/AccountErasureControls.tsx:93
  - apps/ui/components/support/Assistant.tsx:796
verified_against: "714c7aa9"
ratified_by: ""
ratified_on: ""
---

Account or Settings opens the signed-in account settings page. Active sessions lets the visitor review devices, revoke one session, or sign out everywhere. Privacy opens the browser's cookie preferences. Claim legacy debates accepts an old debate access token to attach matching unclaimed debates. Delete account shows the deletion schedule and cancellation controls; deletion begins after seven full days and requires a verified email or recovery-email channel.

Support can navigate directly to these fixed Settings sections and explain their visible prerequisites. It cannot read the visitor's sessions, token, account, debate list, deletion state, or other private records. It never asks for, receives, repeats, validates, or submits a password, access token, authenticator code, or recovery code, and it cannot revoke sessions, claim debates, or schedule or cancel deletion for the visitor.

The Help conversation answers from public product guidance. Topic pills are optional shortcuts. Report a bug primes ordinary public-guide text in the composer and does not create a human case. Escalate to a human creates the separate human handoff, and email support is a separate mail workflow; a human case can include the conversation thread, while the public guide model does not receive private case records or case tokens.
