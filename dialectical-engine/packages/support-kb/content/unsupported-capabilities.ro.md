---
id: unsupported-capabilities
lang: ro
title: "Acțiuni indisponibile sau doar locale"
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

Produsul V3 curent nu are resurse pentru regenerarea nodului, feedback de evaluare, scrierea setărilor sau aprobarea adâncimii adaptive. Controalele pentru modul adâncimii, profunzimea examinării, lățimea ramificării, concurență și numărul maxim de tokeni sunt afișate ca opțiuni vechi, dar nu sunt trimise în contractul rulării V3. Challenge schimbă acum starea locală a paginii, fără să pornească un răspuns durabil. Încărcarea istoricului generărilor poate eșua și poate afișa un panou gol. Asistența nu poate transforma aceste limitări în acțiuni funcționale.
