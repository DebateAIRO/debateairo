---
id: export-json
lang: en
title: "Export a debate as JSON"
status: shipped
sources:
  - apps/ui/lib/v3/answerExport.ts:46
  - apps/ui/lib/v3/publicAnswerExport.ts:9
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1174
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

For an owner debate, **Export** appears only after a served answer and a readable execution-ledger digest are available. It downloads JSON containing the answer, ledger digest, and current honesty records. A public debate can export its published JSON snapshot. The product does not offer Markdown export here, export an unfinished owner answer, or include private owner data in a public download.
