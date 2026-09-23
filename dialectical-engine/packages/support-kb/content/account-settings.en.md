---
id: account-settings
lang: en
title: "Use account settings"
status: shipped
sources:
  - apps/ui/app/settings/page.tsx:53
  - apps/ui/components/SessionControls.tsx:77
  - apps/ui/components/LegacyRunClaimControls.tsx:23
  - apps/ui/components/AccountErasureControls.tsx:49
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

After signing in, `/settings` contains session review and revocation, browser consent preferences, legacy debate claim, and account-erasure controls. Sensitive actions ask for fresh authentication in the page that owns them. The current ordinary settings page does not offer active controls to change email, replace a password, regenerate active MFA, or edit deployment routing. Support can explain these controls but cannot perform them or accept their passwords, codes, tokens, or confirmation phrases.
