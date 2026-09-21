---
id: account-settings
lang: ro
title: "Folosește setările contului"
status: shipped
sources:
  - apps/ui/app/settings/page.tsx:53
  - apps/ui/components/SessionControls.tsx:77
  - apps/ui/components/LegacyRunClaimControls.tsx:23
  - apps/ui/components/AccountErasureControls.tsx:49
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

După autentificare, `/settings` conține revizuirea și revocarea sesiunilor, preferințele de consimțământ din browser, revendicarea dezbaterilor vechi și controalele pentru ștergerea contului. Acțiunile sensibile cer o autentificare recentă în pagina care le gestionează. Pagina obișnuită de setări nu oferă acum controale active pentru schimbarea emailului, înlocuirea parolei, regenerarea MFA activă sau modificarea rutării implementării. Asistența poate explica aceste controale, dar nu le poate executa și nu poate primi parolele, codurile, tokenii sau frazele de confirmare.
