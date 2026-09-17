---
id: debate-workspace-menus
lang: en
title: "Use the debate workspace menus"
status: shipped
sources:
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1131
  - apps/ui/components/DebateWorkspaceDrawer.tsx:24
  - apps/ui/components/AnswerHonestyDrawer.tsx:64
verified_against: "714c7aa9"
ratified_by: ""
ratified_on: ""
---

After a debate has a tree, Thread shows the argument as a sequence, Split compares branches, Tree shows the hierarchy, and Map shows relationships. Scoring information appears with the debate when available. Library returns to Home.

Replay starts another generation from the current owner workspace. Workspace opens the debate's local artifacts, and Honesty opens provenance and limitation details. Export is offered only when an exportable answer exists. How it works opens the on-page guide. Published debates can expose a smaller read-only set of these views.

These controls act on the debate already open in the visitor's browser. Support can explain their purpose, prerequisites, and limits, but it cannot read a private debate, choose a private debate identifier, replay it, inspect its artifacts, or operate its owner-only controls. A link to an owner debate is available only when the application supplies a validated current-owner reference.
