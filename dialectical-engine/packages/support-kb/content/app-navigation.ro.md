---
id: app-navigation
lang: ro
title: "Navighează în Dialectical Engine"
status: shipped
sources:
  - apps/ui/components/landing/LandingChrome.tsx:33
  - apps/ui/components/TopBar.tsx:75
  - apps/ui/app/page.tsx:90
  - apps/ui/components/support/Assistant.tsx:728
verified_against: "714c7aa9"
ratified_by: ""
ratified_on: ""
---

Pagina de prezentare oferă legături către Method și Transcripts (exemplul de dezbatere și transcriere). Pricing este o secțiune informativă, nu o pagină de plată. Start a round și New debate deschid creatorul de dezbateri după autentificare; un vizitator neautentificat este trimis mai întâi la autentificare.

Acasă este biblioteca de dezbateri. Your debates este lista privată a vizitatorului autentificat, iar Public debates este catalogul publicat. Asistența poate explica aceste file și poate oferi navigarea lor fixă, dar nu poate citi lista privată a vizitatorului și nu poate inventa o legătură către o dezbatere. Account și Settings deschid setările contului pentru un vizitator autentificat. Controlul temei schimbă numai aspectul din acest browser.

Help deschide conversația liberă cu Asistența. Butoanele de subiect și întrebările sugerate sunt scurtături opționale care completează sau trimit text obișnuit; ele nu limitează întrebările acceptate. Compact Help, preferințele cookie și tema rămân controale locale ale paginii sau browserului și sunt explicate în text, nu executate de la distanță. Report a bug completează text obișnuit pentru ghidul public în caseta Asistenței și nu creează un caz uman. Emailul de asistență și Escalate to a human sunt fluxuri separate de asistență umană.
