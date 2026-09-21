---
id: support-status-limits
lang: ro
title: "Înțelege starea Asistenței"
status: shipped
sources:
  - apps/ui/components/support/Assistant.tsx:706
  - apps/ui/components/support/Assistant.tsx:748
verified_against: "714c7aa9"
ratified_by: ""
ratified_on: ""
---

Blocul Service status din Ajutor publică trei indicatori limitați: Debate engine, Scoring queue și Model fleet. Debate engine reflectă disponibilitatea cererii publice de stare, Scoring queue îndrumă vizitatorul către starea din aplicație, iar Model fleet arată starea releului Asistenței sau faptul că verificarea este încă în curs.

Aceste etichete pot fi indisponibile, incomplete sau învechite. Ele nu dovedesc starea fiecărei dezbateri, sarcini de evaluare, model, furnizor sau implementare. Asistența poate explica indicatorii publici și poate naviga la ei, dar nu poate inspecta dezbaterea, sarcina din coadă, contul, înregistrarea furnizorului sau altă stare privată a vizitatorului.
