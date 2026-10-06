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
verified_against: "Auth cba421c5fb and Dev 7b91df4f10 integration; docs/missions/account-onboarding/dev-integration-kb-editorial.md"
ratified_by: ""
ratified_on: ""
---

Meniul Cont oferă Cont, Securitate și Deconectare. Cont include emailul, Sesiuni active și Șterge contul; Securitate include profilul telefonului și metodele de autentificare sau recuperare. Telefonul rămâne neverificat; afișarea numărului complet este explicită și temporară. Operațiile sensibile cer confirmarea acțiunii exacte. Ajutor poate oferi legături fixe și explica cerințele, dar nu inspectează date private ale contului, nu primește credențiale sau coduri și nu execută aceste operații. Raportează o eroare pregătește text obișnuit pentru ghidul public; Escaladează către o persoană creează un transfer separat, iar emailul de asistență este un flux separat de mail.

Confidențialitate enumeră cookie-urile și datele din browser folosite de produs. Ajutor nu poate citi sesiunile, starea ștergerii sau datele private ale contului. Un caz uman poate include conversația; modelul ghidului public nu primește date private din cazuri sau tokenurile lor.
