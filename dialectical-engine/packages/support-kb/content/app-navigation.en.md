---
id: app-navigation
lang: en
title: "Navigate Dialectical Engine"
status: shipped
sources:
  - apps/ui/components/landing/LandingChrome.tsx:35
  - apps/ui/components/TopBar.tsx:98
  - apps/ui/app/page.tsx:136
  - apps/ui/components/support/Assistant.tsx:106
  - apps/ui/components/SiteFooter.tsx:49
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

The landing page links to Method and Transcripts (the sample debate transcript). Pricing is an informational section, not a checkout. Start a round and New debate open the debate creator after sign-in; a signed-out visitor is taken to sign in first.

Home is the debate library. Your debates is the signed-in visitor's private list, while Public debates is the published catalog. Support can explain these tabs and offer their fixed navigation, but it cannot read either visitor-specific list or invent a debate link. Account and Settings open account settings for a signed-in visitor. The theme control (☀/☾) changes only this browser's display.

Help opens the free-text Support conversation. Topic buttons and suggested questions are optional shortcuts that fill or send ordinary Support text; they are not the only questions Support accepts. The small panel that the Help button opens, Cookies we store (it opens the What we store list), and the theme control stay in the page or browser and are described in prose rather than as remote operations. Report a bug primes ordinary public-guide text in the Support composer and does not create a human case. Email support and Escalate to a human are separate human-support workflows.
