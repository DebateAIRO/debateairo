---
id: support-status-limits
lang: en
title: "Understand Support status"
status: shipped
sources:
  - apps/ui/components/support/Assistant.tsx:706
  - apps/ui/components/support/Assistant.tsx:748
verified_against: "714c7aa9"
ratified_by: ""
ratified_on: ""
---

The Service status block on Help publishes three limited indicators: Debate engine, Scoring queue, and Model fleet. Debate engine reflects whether the public status request is available, Scoring queue points the visitor back to in-app status, and Model fleet shows the Support relay state or that it is still checking.

These labels can be unavailable, incomplete, or stale. They do not prove the health of every debate, scoring job, model, provider, or deployment. Support can explain the public indicators and navigate to them, but it cannot inspect a visitor's debate, queue item, account, provider record, or other private status.
