---
id: account-access
lang: ro
title: "Autentificare, înregistrare și recuperarea accesului MFA"
status: shipped
sources:
  - apps/ui/components/LoginFlow.tsx
  - apps/ui/components/auth/SocialCompleteFlow.tsx
  - apps/ui/components/auth/SecurityEnrollment.tsx
  - apps/ui/app/recover/page.tsx
verified_against: "59e436312 plus final authentication source fixes"
ratified_by: ""
ratified_on: ""
---

Folosește `/login` pentru autentificare cu o cheie de acces. Dispozitivul folosește verificarea obișnuită prin recunoaștere facială, amprentă sau PIN. Autentificarea cu parolă rămâne disponibilă pentru conturile care au parolă și o metodă de securitate înrolată; folosește numai metodele oferite pentru contul tău. Deschide aplicația de autentificare folosită la înregistrare pentru codul de șase cifre sau folosește un cod de recuperare salvat și nefolosit, când este oferit. Furnizorii configurați pot începe autentificarea, urmată de o cheie de acces, aplicație de autentificare sau cod de recuperare oferit; furnizorul singur nu încheie verificarea de securitate necesară.

Folosește `/sign-up` pentru a crea un cont cu email, un număr de telefon introdus manual și neverificat, o singură parolă, eligibilitate de vârstă și acceptările legale. Înregistrarea prin furnizor cere informațiile lipsă și poate verifica emailul printr-o confirmare de încredere a furnizorului; altfel urmează linkul primit prin email. Apoi creează o cheie de acces sau folosește o aplicație de autentificare. O metodă de securitate acceptată activează contul și te întoarce direct în produs. Cheia de acces nu cere și o aplicație de autentificare. Metodele de rezervă sunt opționale în Cont → Securitate; pierderea tuturor metodelor de autentificare și rezervă poate împiedica recuperarea.

Acces de recuperare deschide `/recover`, pagina proprie de recuperare. Recuperarea cere dovezile și metodele eligibile oferite de acel flux; un email identic, o sesiune obișnuită sau telefonul neverificat nu pot înlocui singure credențialele. Asistența poate explica fluxul și naviga, dar nu poate executa operații asupra contului și nu primește parole, tokenuri de verificare, secrete de autentificator, coduri de recuperare sau dovezi de securitate.
