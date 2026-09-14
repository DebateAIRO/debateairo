---
id: account-access
lang: ro
title: "Autentificare, înregistrare și recuperarea accesului MFA"
status: shipped
sources:
  - apps/ui/components/LoginFlow.tsx:62
  - apps/ui/components/LoginFlow.tsx:289
  - apps/ui/components/SignUpFlow.tsx:183
  - apps/ui/app/verify-email/page.tsx:1
  - apps/ui/app/enroll-mfa/page.tsx:75
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Folosește `/login` pentru a te autentifica prin parolă, apoi finalizează pasul obligatoriu al autentificatorului. Dacă mai ai codul de recuperare salvat la înscriere, pagina de autentificare oferă **Use a recovery code** după pasul parolei. Folosește `/sign-up` pentru înregistrare; verificarea emailului și înscrierea autentificatorului continuă numai din starea validă a fluxului contului. Proprietarul produsului confirmă un flux separat pentru parola uitată, dar Asistența păstrează această acțiune indisponibilă până la verificarea destinației existente exacte. Nu introduce în Asistență parola, tokenul de verificare, secretul autentificatorului sau codul de recuperare.
