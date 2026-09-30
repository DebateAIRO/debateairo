---
id: account-settings
lang: en
title: "Use account settings"
status: shipped
sources:
  - apps/ui/components/SettingsPageClient.tsx:78
  - apps/ui/components/SettingsPageClient.tsx:79
  - apps/ui/components/SessionControls.tsx:181
  - apps/ui/components/LegacyRunClaimControls.tsx:53
  - apps/ui/components/AccountErasureControls.tsx:137
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

After signing in, `/settings` contains session review and revocation, a Privacy section that lists what this browser stores, legacy debate claim, and account-erasure controls. Sensitive actions ask for fresh authentication in the page that owns them. The current ordinary settings page does not offer active controls to change email, replace a password, regenerate active MFA, or edit deployment routing. Support can explain these controls but cannot perform them or accept their passwords, codes, tokens, or confirmation phrases.
