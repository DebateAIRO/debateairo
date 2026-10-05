---
id: settings-help-menus
lang: ro
title: "Folosește Setările și Ajutorul uman"
status: shipped
sources:
  - apps/ui/components/AccountMenu.tsx:10
  - apps/ui/components/SecuritySettings.tsx:17
  - apps/ui/components/PhoneProfileCard.tsx:13
  - apps/ui/components/SettingsPageClient.tsx:57
  - apps/ui/components/SessionControls.tsx:65
  - apps/ui/components/AccountErasureControls.tsx:66
verified_against: "Task 12 working tree based on 903407d27b1b66bdcd1b724bb87d0580ca94658f; exact source hashes in docs/missions/account-onboarding/task-12-kb-editorial.md"
ratified_by: ""
ratified_on: ""
---

Meniul Cont oferă Cont, Securitate și Deconectare. Cont include emailul, Sesiuni active, preferințele de consimțământ și Șterge contul; Securitate include profilul telefonului și metodele de autentificare sau recuperare. Telefonul rămâne neverificat; afișarea numărului complet este explicită și temporară. Operațiile sensibile cer confirmarea acțiunii exacte. Ajutor poate oferi legături fixe și explica cerințele, dar nu inspectează date private ale contului, nu primește credențiale sau coduri și nu execută aceste operații. Raportează o eroare pregătește text obișnuit pentru ghidul public; Escaladează către o persoană creează un transfer separat, iar emailul de asistență este un flux separat de mail.
