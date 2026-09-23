---
id: support-cases
lang: ro
title: "Cere ajutorul unei persoane"
status: shipped
sources:
  - apps/api/src/support/index.ts:165
  - apps/ui/components/support/Assistant.tsx:680
verified_against: "b7ca2c41"
ratified_by: ""
ratified_on: ""
---

Folosește **Talk to a human** sau **Escalate to a human** în Asistență pentru a crea un caz asincron. Cazul nu este un apel telefonic. Emailul de asistență este un flux separat de mail: emailul de asistență nu creează acest caz și nu primește confirmarea, termenul de răspuns sau legătura privată a cazului. Confirmarea serverului pentru caz indică un termen țintă de răspuns de 48 de ore, iar un alt panou din Asistență spune în prezent că răspunsurile sosesc într-o zi lucrătoare, în zilele lucrătoare. Bazează-te pe confirmarea cazului până când textele sunt aliniate. Păstrează confirmarea cazului privată deoarece ea controlează accesul la caz. Asistența nu verifică livrarea în inbox.
