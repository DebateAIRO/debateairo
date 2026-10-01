---
id: app-navigation
lang: ro
title: "Navighează în Dialectical Engine"
status: shipped
sources:
  - apps/ui/components/landing/LandingChrome.tsx:35
  - apps/ui/components/TopBar.tsx:98
  - apps/ui/app/page.tsx:136
  - apps/ui/components/support/Assistant.tsx:106
  - apps/ui/components/SiteFooter.tsx:49
verified_against: "e089b63e9"
ratified_by: ""
ratified_on: ""
---

Pagina de prezentare oferă legături către „Metodă” și „Transcrieri” (exemplul de dezbatere și transcriere). „Tarife” este o secțiune informativă, nu o pagină de plată. „Începeți o rundă” și „Dezbatere nouă” deschid creatorul de dezbateri după autentificare; un vizitator neautentificat este trimis mai întâi la autentificare.

„Acasă” este biblioteca de dezbateri. „Dezbaterile dvs.” este lista privată a vizitatorului autentificat, iar „Dezbateri publice” este catalogul publicat. Asistența poate explica aceste file și poate oferi navigarea lor fixă, dar nu poate citi lista privată a vizitatorului și nu poate inventa o legătură către o dezbatere. „Cont” și „Setări” deschid setările contului pentru un vizitator autentificat. Controlul temei (☀/☾) schimbă numai aspectul din acest browser.

„Ajutor” deschide conversația liberă cu Asistența. Butoanele de subiect și întrebările sugerate sunt scurtături opționale care completează sau trimit text obișnuit; ele nu limitează întrebările acceptate. Panoul mic deschis de butonul „Ajutor”, „Modulele cookie pe care le stocăm” (deschide lista „Ce stocăm”) și tema rămân controale locale ale paginii sau browserului și sunt explicate în text, nu executate de la distanță. „Raportați o eroare” completează text obișnuit pentru ghidul public în caseta Asistenței și nu creează un caz uman. Emailul de asistență și „Escaladați către o persoană” sunt fluxuri separate de asistență umană.
