---
id: unsupported-capabilities
lang: en
title: "Unavailable or local-only actions"
status: shipped
sources:
  - apps/ui/lib/v3/missingCapabilities.ts:7
  - apps/ui/lib/v3/adapter.ts:686
  - apps/ui/app/new/page.tsx:335
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1444
  - apps/ui/components/NodeDetailDrawer.tsx:121
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

The current V3 product has no node-regeneration resource, scoring-feedback resource, settings-write resource, or adaptive-depth approval resource. Depth mode, scrutiny depth, branching width, concurrency, and max-token controls are displayed as legacy options but are not sent in the V3 run contract. Challenge currently changes local page state rather than starting a durable rebuttal. Generation history can fail to load and then appear empty. Support cannot turn these limitations into working actions.
