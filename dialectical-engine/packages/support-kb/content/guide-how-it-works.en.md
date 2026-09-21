---
id: guide-how-it-works
lang: en
title: "How to read a debate"
status: shipped
sources:
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1164
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1169
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1174
  - apps/ui/components/NodeDetailDrawer.tsx:121
  - apps/ui/components/NodeDetailDrawer.tsx:281
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

The debate workspace can present the argument tree, threads, split inspection, a map, answer status, evidence, and honesty details when those artifacts exist. Claim cards identify their model and side. Challenge changes local scrutiny and investigation state in the current page; it does not prove a durable rebuttal run. Generation history may be unavailable, and an empty history panel does not prove there were never older versions. Export is conditional JSON, not Markdown.
