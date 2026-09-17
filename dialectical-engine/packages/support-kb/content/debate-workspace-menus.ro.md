---
id: debate-workspace-menus
lang: ro
title: "Folosește meniurile spațiului de dezbatere"
status: shipped
sources:
  - apps/ui/app/debate/[id]/DebatePageClient.tsx:1131
  - apps/ui/components/DebateWorkspaceDrawer.tsx:24
  - apps/ui/components/AnswerHonestyDrawer.tsx:64
verified_against: "714c7aa9"
ratified_by: ""
ratified_on: ""
---

După ce dezbaterea are un arbore, Thread arată argumentul ca o succesiune, Split compară ramurile, Tree arată ierarhia, iar Map arată relațiile. Informațiile de evaluare apar împreună cu dezbaterea când sunt disponibile. Library revine la pagina Acasă.

Replay pornește o altă generare din spațiul curent al proprietarului. Workspace deschide artefactele locale ale dezbaterii, iar Honesty deschide detaliile despre proveniență și limitări. Export este disponibil numai când există un răspuns exportabil. How it works deschide ghidul din pagină. Dezbaterile publicate pot afișa un set mai mic de vizualizări, numai pentru citire.

Aceste controale acționează asupra dezbaterii deja deschise în browserul vizitatorului. Asistența poate explica scopul, condițiile și limitele lor, dar nu poate citi o dezbatere privată, alege identificatorul ei, reporni generarea, inspecta artefactele sau opera controalele proprietarului. O legătură către dezbaterea proprietarului este disponibilă numai când aplicația furnizează o referință validată pentru proprietarul curent.
