---
id: privacy-consent
lang: en
title: "Review browser privacy preferences"
status: shipped
sources:
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:35
  - apps/ui/lib/consent.ts:1
  - apps/ui/app/settings/page.tsx:53
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Signed-in users can open the browser privacy preferences at `/settings#consent-privacy-heading`. The preference is browser-local and does not by itself prove that every analytics or cookie system is active or disabled. Privacy policy text is presented through the product's existing modal where that opener is available; there is no verified standalone `/privacy` or `/terms` page in the current route set.
