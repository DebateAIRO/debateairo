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

Folosește **Talk to a human** în Asistență pentru a crea un caz asincron. Cazul nu este un apel telefonic. Confirmarea curentă a serverului indică un termen țintă de răspuns de 48 de ore. Păstrează confirmarea cazului privată deoarece ea controlează accesul la caz. Asistența nu verifică livrarea în inbox și nu promite un răspuns mai rapid.
