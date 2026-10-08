---
id: account-settings
lang: ro
title: "Folosește setările contului"
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

După autentificare, Cont deschide `/settings` cu schimbarea emailului, Sesiuni active, o secțiune Confidențialitate care enumeră datele stocate în browser, controalele disponibile ale abonamentului și ștergerea contului. Securitate deschide `/settings/security` cu numărul de telefon mascat și neverificat, emailul opțional de recuperare, cheile de acces sau aplicația de autentificare, codurile de recuperare și furnizorii configurați conectați. Afișarea ori schimbarea numărului și celelalte acțiuni sensibile cer confirmarea acțiunii exacte. Eliminarea unei metode ori a unui furnizor nu poate elimina ultima cale completă de autentificare. Deconectare încheie sesiunea curentă și șterge conversația Ajutor din această filă și anunță celelalte file după succes. Asistența poate explica și naviga, dar nu execută operații asupra contului și nu primește parole, coduri, tokenuri sau fraze de confirmare.
