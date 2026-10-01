---
id: debate-workspace-menus
lang: ro
title: "Folosește meniurile spațiului de dezbatere"
status: shipped
sources:
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1031
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1119
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1577
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1586
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1595
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1742
  - apps/ui/components/DebateWorkspaceDrawer.tsx:24
  - apps/ui/components/AnswerHonestyDrawer.tsx:64
verified_against: "714c7aa9"
ratified_by: ""
ratified_on: ""
---

După ce dezbaterea are un arbore, Fir arată argumentul ca o succesiune, Divizat compară ramurile, Arbore arată ierarhia, iar Hartă arată relațiile. Informațiile de evaluare apar împreună cu dezbaterea când sunt disponibile. Categoriile publice ale diagnosticului pot arăta disponibilitatea, starea încărcării și a reîmprospătării; furnizorul și modelul împreună cu momentele verificării sau generării; cache sau învechire; numărul afirmațiilor curente, evaluate, omise și trunchiate și filtrele bazate pe scor; golurile nerezolvate și marcajele fatale; și investigațiile recomandate. O categorie sau o valoare poate lipsi când datele de evaluare nu sunt disponibile. Asistența poate explica aceste categorii publice, dar nu poate citi dezbaterea sau valorile ei de evaluare. Bibliotecă revine la pagina Acasă.

Reluare pornește o altă generare din spațiul curent al proprietarului. Spațiu de lucru deschide artefactele locale ale dezbaterii, iar Onestitate deschide detaliile despre proveniență și limitări. „Export” este disponibil numai când există un răspuns exportabil. Cum funcționează deschide ghidul din pagină. Dezbaterile publicate pot afișa un set mai mic de vizualizări, numai pentru citire.

Aceste controale acționează asupra dezbaterii deja deschise în browserul vizitatorului. Asistența poate explica scopul, condițiile și limitele lor, dar nu poate citi o dezbatere privată, alege identificatorul ei, reporni generarea, inspecta artefactele sau opera controalele proprietarului. O legătură către dezbaterea proprietarului este disponibilă numai când aplicația furnizează o referință validată pentru proprietarul curent.
