---
id: export-json
lang: ro
title: "Exportă o dezbatere ca JSON"
status: shipped
sources:
  - apps/ui/lib/v3/answerExport.ts:46
  - apps/ui/lib/v3/publicAnswerExport.ts:9
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1174
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Pentru dezbaterea proprietarului, **Export** apare numai după ce există un răspuns servit și poate fi citit rezumatul registrului de execuție. Descărcarea JSON conține răspunsul, rezumatul registrului și înregistrările curente de onestitate. O dezbatere publică își poate exporta copia JSON publicată. Produsul nu oferă aici export Markdown, nu exportă un răspuns neterminat al proprietarului și nu include datele private ale proprietarului într-o descărcare publică.
