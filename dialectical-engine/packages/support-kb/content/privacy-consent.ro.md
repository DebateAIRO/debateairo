---
id: privacy-consent
lang: ro
title: "Revizuiește preferințele de confidențialitate din browser"
status: shipped
sources:
  - apps/ui/components/consent/ConsentSettingsPanel.tsx:35
  - apps/ui/lib/consent.ts:1
  - apps/ui/app/settings/page.tsx:53
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Utilizatorii autentificați pot deschide preferințele de confidențialitate din browser la `/settings#consent-privacy-heading`. Preferința este locală browserului și nu dovedește singură că fiecare sistem de analiză sau cookie este activ ori dezactivat. Textul politicii de confidențialitate este prezentat prin fereastra existentă a produsului acolo unde deschiderea ei este disponibilă; setul curent de rute nu conține o pagină independentă `/privacy` sau `/terms` verificată.
